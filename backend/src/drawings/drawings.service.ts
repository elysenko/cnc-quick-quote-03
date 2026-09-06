import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Drawing } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../integrations/storage.service';
import { DxfParserService } from './dxf-parser.service';
import { DxfParseError } from './dxf-types';

export interface DrawingResponse {
  id: string;
  filename: string;
  sizeBytes: number;
  detectedUnits: string;
  bboxWIn: number;
  bboxHIn: number;
  cutLengthIn: number;
  polylines: number[][];
  entityCount: number;
}

/**
 * Upload pipeline. Validation is strictly ordered — extension, then declared size,
 * then the real byte count, then the parse — and the object is written to storage
 * only after the parse succeeds, so a rejected upload leaves nothing behind.
 */
@Injectable()
export class DrawingsService {
  private readonly logger = new Logger(DrawingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly parser: DxfParserService,
  ) {}

  async upload(userId: string, filename: string, data: Buffer): Promise<DrawingResponse> {
    const upload = await this.settings.get('upload');

    const extension = filename.includes('.')
      ? filename.slice(filename.lastIndexOf('.')).toLowerCase()
      : '';
    if (!upload.allowedExtensions.map((e) => e.toLowerCase()).includes(extension)) {
      throw new UnprocessableEntityException(
        `Only ${upload.allowedExtensions.join(', ')} files can be quoted — "${filename}" was not accepted.`,
      );
    }
    if (data.length === 0) {
      throw new UnprocessableEntityException('That file is empty.');
    }
    if (data.length > upload.maxUploadBytes) {
      throw new UnprocessableEntityException(
        `That file is ${(data.length / 1024 / 1024).toFixed(1)} MB — the limit is ${(upload.maxUploadBytes / 1024 / 1024).toFixed(0)} MB.`,
      );
    }

    let geometry;
    try {
      geometry = this.parser.parse(data);
    } catch (error) {
      if (error instanceof DxfParseError) {
        throw new UnprocessableEntityException(error.message);
      }
      this.logger.error(`Unexpected DXF failure: ${(error as Error).message}`);
      throw new UnprocessableEntityException('That drawing could not be read.');
    }

    // Parse succeeded — only now does anything reach object storage.
    const storageKey = `drawings/${userId}/${randomUUID()}${extension}`;
    await this.storage.putDrawing(storageKey, data);

    const drawing = await this.prisma.drawing.create({
      data: {
        userId,
        filename,
        storageKey,
        sizeBytes: data.length,
        detectedUnits: geometry.detectedUnits,
        bboxWIn: geometry.bboxWIn,
        bboxHIn: geometry.bboxHIn,
        cutLengthIn: geometry.cutLengthIn,
        entityCount: geometry.entityCount,
        parsedJson: { polylines: geometry.polylines },
      },
    });
    return this.toResponse(drawing);
  }

  async byId(userId: string, id: string): Promise<DrawingResponse> {
    const drawing = await this.prisma.drawing.findFirst({ where: { id, userId } });
    if (!drawing) throw new NotFoundException('That drawing could not be found.');
    return this.toResponse(drawing);
  }

  toResponse(drawing: Drawing): DrawingResponse {
    const parsed = drawing.parsedJson as { polylines?: number[][] } | null;
    return {
      id: drawing.id,
      filename: drawing.filename,
      sizeBytes: drawing.sizeBytes,
      detectedUnits: drawing.detectedUnits,
      bboxWIn: drawing.bboxWIn,
      bboxHIn: drawing.bboxHIn,
      cutLengthIn: drawing.cutLengthIn,
      polylines: parsed?.polylines ?? [],
      entityCount: drawing.entityCount,
    };
  }
}
