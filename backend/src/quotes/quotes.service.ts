import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma, Quote } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { NestingResult, NestingService, PartTooLargeError } from './nesting.service';
import { Breakdown, PricingService } from './pricing.service';

export interface QuoteView {
  id: string;
  reference: string;
  materialId: string;
  materialName: string;
  filename: string;
  quantity: number;
  cutLengthIn: number;
  bendCount: number;
  sheetCount: number;
  utilization: number;
  totalCents: number;
  status: 'draft' | 'ready' | 'ordered' | 'expired';
  createdAt: string;
}

export interface QuoteDetail extends QuoteView {
  drawingId: string;
  nesting: NestingResult;
  breakdown: Breakdown;
  polylines: number[][];
  bends: Array<{ id: string; x1: number; y1: number; x2: number; y2: number; angleDeg: number; direction: 'up' | 'down' }>;
  bedWidthIn: number;
  bedHeightIn: number;
}

const toView = (quote: Quote): QuoteView => ({
  id: quote.id,
  reference: quote.reference,
  materialId: quote.materialId,
  materialName: quote.materialName,
  filename: quote.filename,
  quantity: quote.quantity,
  cutLengthIn: quote.cutLengthIn,
  bendCount: quote.bendCount,
  sheetCount: quote.sheetCount,
  utilization: quote.utilization,
  totalCents: quote.totalCents,
  status: quote.status as QuoteView['status'],
  createdAt: quote.createdAt.toISOString(),
});

/**
 * Quote generation. The pricing document in force at generation time is frozen onto
 * the row, so a later rate change never re-prices a quote the customer already saw.
 */
@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly nesting: NestingService,
    private readonly pricing: PricingService,
  ) {}

  async create(
    userId: string,
    input: { drawingId?: string; materialId?: string; quantity?: number },
  ): Promise<QuoteDetail> {
    const machine = await this.settings.get('machine');

    const quantity = input.quantity;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || !Number.isInteger(quantity)) {
      throw new UnprocessableEntityException('Enter a whole-number quantity.');
    }
    if (quantity < machine.quantityMin || quantity > machine.quantityMax) {
      throw new UnprocessableEntityException(
        `Quantity must be between ${machine.quantityMin} and ${machine.quantityMax}.`,
      );
    }

    const drawing = await this.prisma.drawing.findFirst({
      where: { id: input.drawingId ?? '', userId },
      include: { bends: true },
    });
    if (!drawing) throw new NotFoundException('Upload a drawing before generating a quote.');

    const material = await this.prisma.material.findUnique({
      where: { id: input.materialId ?? '' },
    });
    if (!material) throw new UnprocessableEntityException('Choose a material for this quote.');
    if (!material.active) {
      throw new UnprocessableEntityException(
        `${material.name} is no longer available. Please choose another material.`,
      );
    }

    let nesting: NestingResult;
    try {
      nesting = this.nesting.nest(drawing.bboxWIn, drawing.bboxHIn, material, quantity, machine);
    } catch (error) {
      if (error instanceof PartTooLargeError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }

    const pricingConfig = await this.settings.get('pricing');
    const breakdown = this.pricing.price(
      {
        cutLengthInPerPart: drawing.cutLengthIn,
        quantity,
        bendsPerPart: drawing.bends.length,
        sheetCount: nesting.sheetCount,
        perSheetCostCents: material.perSheetCostCents,
        costMultiplier: material.costMultiplier,
      },
      pricingConfig,
    );

    const quote = await this.prisma.quote.create({
      data: {
        reference: await this.nextReference(),
        userId,
        drawingId: drawing.id,
        materialId: material.id,
        materialName: material.name,
        filename: drawing.filename,
        quantity,
        cutLengthIn: drawing.cutLengthIn,
        bendCount: drawing.bends.length,
        sheetCount: nesting.sheetCount,
        utilization: nesting.utilization,
        nestingJson: nesting as unknown as Prisma.InputJsonValue,
        pricingSnapshotJson: {
          ...pricingConfig,
          perSheetCostCents: material.perSheetCostCents,
          costMultiplier: material.costMultiplier,
        } as unknown as Prisma.InputJsonValue,
        breakdownJson: breakdown as unknown as Prisma.InputJsonValue,
        totalCents: breakdown.totalCents,
        status: 'ready',
      },
    });

    return this.detail(userId, quote.id);
  }

  async list(userId: string): Promise<QuoteView[]> {
    const quotes = await this.prisma.quote.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return quotes.map(toView);
  }

  async detail(userId: string, id: string): Promise<QuoteDetail> {
    const quote = await this.prisma.quote.findFirst({
      where: { id, userId },
      include: { drawing: { include: { bends: true } } },
    });
    if (!quote) throw new NotFoundException('That quote could not be found.');

    const machine = await this.settings.get('machine');
    const parsed = quote.drawing.parsedJson as { polylines?: number[][] } | null;

    return {
      ...toView(quote),
      drawingId: quote.drawingId,
      nesting: quote.nestingJson as unknown as NestingResult,
      breakdown: quote.breakdownJson as unknown as Breakdown,
      polylines: parsed?.polylines ?? [],
      bends: quote.drawing.bends.map((bend) => ({
        id: bend.id,
        x1: bend.x1,
        y1: bend.y1,
        x2: bend.x2,
        y2: bend.y2,
        angleDeg: bend.angleDeg,
        direction: bend.direction === 'down' ? 'down' : 'up',
      })),
      bedWidthIn: machine.bedWidthIn,
      bedHeightIn: machine.bedHeightIn,
    };
  }

  /** Q-<year>-<sequence>. Retries on the unique index rather than locking a counter. */
  private async nextReference(): Promise<string> {
    const year = new Date().getUTCFullYear();
    const count = await this.prisma.quote.count();
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = `Q-${year}-${String(count + 1 + attempt).padStart(4, '0')}`;
      const clash = await this.prisma.quote.findUnique({ where: { reference: candidate } });
      if (!clash) return candidate;
    }
    return `Q-${year}-${Date.now().toString(36).toUpperCase()}`;
  }
}
