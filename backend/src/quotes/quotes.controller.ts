import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { QuoteDetail, QuoteView, QuotesService } from './quotes.service';
import { CurrentUser, type AuthedUser } from '../auth/current-user.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { PrismaService } from '../prisma/prisma.service';

export class CreateQuoteDto {
  drawingId!: string;
  materialId!: string;
  quantity!: number;
}

export interface MaterialView {
  id: string;
  name: string;
  thicknessIn: number;
  sheetWidthIn: number;
  sheetHeightIn: number;
  perSheetCostCents: number;
  costMultiplier: number;
  active: boolean;
}

@ApiTags('quotes')
@Controller('api')
@UseGuards(RateLimitGuard)
export class QuotesController {
  constructor(
    private readonly quotes: QuotesService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('quotes')
  @ApiOperation({ summary: 'Nest, price and persist an immutable quote.' })
  create(@CurrentUser() user: AuthedUser, @Body() body: CreateQuoteDto): Promise<QuoteDetail> {
    return this.quotes.create(user.id, body ?? {});
  }

  @Get('quotes')
  list(@CurrentUser() user: AuthedUser): Promise<QuoteView[]> {
    return this.quotes.list(user.id);
  }

  @Get('quotes/:id')
  byId(@CurrentUser() user: AuthedUser, @Param('id') id: string): Promise<QuoteDetail> {
    return this.quotes.detail(user.id, id);
  }

  @Get('materials')
  @ApiOperation({ summary: 'Materials a customer may quote against (active only).' })
  async materials(): Promise<MaterialView[]> {
    return this.prisma.material.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        thicknessIn: true,
        sheetWidthIn: true,
        sheetHeightIn: true,
        perSheetCostCents: true,
        costMultiplier: true,
        active: true,
      },
    });
  }
}
