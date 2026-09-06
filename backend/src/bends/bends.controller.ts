import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { BendLine } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthedUser } from '../auth/current-user.decorator';

const DIRECTIONS = ['up', 'down'];

export interface BendDto {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  angleDeg: number;
  direction: string;
}

interface BendView {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  angleDeg: number;
  direction: 'up' | 'down';
}

const toView = (bend: BendLine): BendView => ({
  id: bend.id,
  x1: bend.x1,
  y1: bend.y1,
  x2: bend.x2,
  y2: bend.y2,
  angleDeg: bend.angleDeg,
  direction: bend.direction === 'down' ? 'down' : 'up',
});

/**
 * Bend lines are rows against a drawing — the stored DXF object is never rewritten,
 * so the customer's original file stays byte-identical to what they uploaded.
 */
@ApiTags('bends')
@Controller('api')
export class BendsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('drawings/:drawingId/bends')
  async list(
    @CurrentUser() user: AuthedUser,
    @Param('drawingId') drawingId: string,
  ): Promise<BendView[]> {
    await this.ownedDrawing(user.id, drawingId);
    const bends = await this.prisma.bendLine.findMany({
      where: { drawingId },
      orderBy: { createdAt: 'asc' },
    });
    return bends.map(toView);
  }

  @Post('drawings/:drawingId/bends')
  async create(
    @CurrentUser() user: AuthedUser,
    @Param('drawingId') drawingId: string,
    @Body() body: BendDto,
  ): Promise<BendView> {
    await this.ownedDrawing(user.id, drawingId);
    const data = this.validate(body);
    const bend = await this.prisma.bendLine.create({ data: { ...data, drawingId } });
    return toView(bend);
  }

  @Patch('bends/:id')
  async update(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body() body: Partial<BendDto>,
  ): Promise<BendView> {
    const existing = await this.ownedBend(user.id, id);
    const merged = this.validate({ ...toView(existing), ...body });
    const bend = await this.prisma.bendLine.update({ where: { id }, data: merged });
    return toView(bend);
  }

  @Delete('bends/:id')
  async remove(@CurrentUser() user: AuthedUser, @Param('id') id: string): Promise<{ ok: true }> {
    await this.ownedBend(user.id, id);
    await this.prisma.bendLine.delete({ where: { id } });
    return { ok: true };
  }

  /** Mirrors the client-side rule exactly, so the UI can never save what we reject. */
  private validate(body: Partial<BendDto>): BendDto {
    const numbers: Array<keyof BendDto> = ['x1', 'y1', 'x2', 'y2', 'angleDeg'];
    for (const field of numbers) {
      if (typeof body[field] !== 'number' || !Number.isFinite(body[field] as number)) {
        throw new UnprocessableEntityException(`"${field}" must be a number.`);
      }
    }
    const angleDeg = body.angleDeg as number;
    if (angleDeg < 0 || angleDeg > 180) {
      throw new UnprocessableEntityException('Angle must be between 0 and 180 degrees.');
    }
    const direction = String(body.direction ?? '');
    if (!DIRECTIONS.includes(direction)) {
      throw new UnprocessableEntityException('Bend direction must be either "up" or "down".');
    }
    return {
      x1: body.x1 as number,
      y1: body.y1 as number,
      x2: body.x2 as number,
      y2: body.y2 as number,
      angleDeg,
      direction,
    };
  }

  private async ownedDrawing(userId: string, drawingId: string): Promise<void> {
    const drawing = await this.prisma.drawing.findFirst({
      where: { id: drawingId, userId },
      select: { id: true },
    });
    if (!drawing) throw new NotFoundException('That drawing could not be found.');
  }

  private async ownedBend(userId: string, bendId: string): Promise<BendLine> {
    const bend = await this.prisma.bendLine.findFirst({
      where: { id: bendId, drawing: { userId } },
    });
    if (!bend) throw new NotFoundException('That bend line could not be found.');
    return bend;
  }
}
