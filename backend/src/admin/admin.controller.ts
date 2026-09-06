import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { AdminGuard } from '../auth/admin.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { OrderView, OrdersService } from '../checkout/orders.service';

interface MaterialInput {
  name?: string;
  thicknessIn?: number;
  sheetWidthIn?: number;
  sheetHeightIn?: number;
  perSheetCostCents?: number;
  costMultiplier?: number;
  active?: boolean;
}

interface ShippingInput {
  name?: string;
  description?: string;
  baseRateCents?: number;
  perSheetRateCents?: number;
  active?: boolean;
  sortOrder?: number;
}

/** Every route here sits behind JwtAuthGuard (401) then AdminGuard (403). */
@ApiTags('admin')
@Controller('api/admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly orders: OrdersService,
  ) {}

  // ---- settings documents ------------------------------------------------

  @Get('settings/:doc')
  async getDoc(@Param('doc') doc: string): Promise<Record<string, unknown>> {
    if (!this.settings.isDocName(doc)) throw new NotFoundException(`Unknown settings document "${doc}".`);
    if (doc === 'payment') return this.settings.getPaymentMasked();
    return this.settings.get(doc) as unknown as Record<string, unknown>;
  }

  @Put('settings/:doc')
  async putDoc(
    @Param('doc') doc: string,
    @Body() body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.settings.isDocName(doc)) throw new NotFoundException(`Unknown settings document "${doc}".`);
    await this.settings.update(doc, body ?? {});
    if (doc === 'payment') return this.settings.getPaymentMasked();
    return this.settings.get(doc) as unknown as Record<string, unknown>;
  }

  // ---- materials ---------------------------------------------------------

  @Get('materials')
  materials(): Promise<unknown[]> {
    return this.prisma.material.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  }

  @Post('materials')
  createMaterial(@Body() body: MaterialInput): Promise<unknown> {
    const data = this.validateMaterial(body, true) as Prisma.MaterialCreateInput;
    return this.prisma.material.create({ data });
  }

  @Patch('materials/:id')
  async updateMaterial(@Param('id') id: string, @Body() body: MaterialInput): Promise<unknown> {
    const existing = await this.prisma.material.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('That material could not be found.');
    const data = this.validateMaterial(body, false) as Prisma.MaterialUpdateInput;
    return this.prisma.material.update({ where: { id }, data });
  }

  // ---- shipping methods --------------------------------------------------

  @Get('shipping-methods')
  shippingMethods(): Promise<unknown[]> {
    return this.prisma.shippingMethod.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  @Post('shipping-methods')
  createShipping(@Body() body: ShippingInput): Promise<unknown> {
    const data = this.validateShipping(body, true) as Prisma.ShippingMethodCreateInput;
    return this.prisma.shippingMethod.create({ data });
  }

  @Patch('shipping-methods/:id')
  async updateShipping(@Param('id') id: string, @Body() body: ShippingInput): Promise<unknown> {
    const existing = await this.prisma.shippingMethod.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('That shipping method could not be found.');
    const data = this.validateShipping(body, false) as Prisma.ShippingMethodUpdateInput;
    return this.prisma.shippingMethod.update({ where: { id }, data });
  }

  // ---- orders ------------------------------------------------------------

  @Get('orders')
  adminOrders(): Promise<OrderView[]> {
    return this.orders.listAll();
  }

  // ---- validation --------------------------------------------------------

  private validateMaterial(body: MaterialInput, requireAll: boolean): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    if (body.name !== undefined || requireAll) {
      const name = (body.name ?? '').trim();
      if (!name) throw new BadRequestException('Give the material a name customers will recognise.');
      data.name = name;
    }
    const positives: Array<[keyof MaterialInput, string]> = [
      ['thicknessIn', 'Thickness'],
      ['sheetWidthIn', 'Sheet width'],
      ['sheetHeightIn', 'Sheet height'],
      ['costMultiplier', 'Cost multiplier'],
    ];
    for (const [field, label] of positives) {
      const value = body[field];
      if (value === undefined && !requireAll) continue;
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new BadRequestException(`${label} must be greater than zero.`);
      }
      data[field] = value;
    }
    if (body.perSheetCostCents !== undefined || requireAll) {
      const cost = body.perSheetCostCents;
      if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
        throw new BadRequestException('Cost per sheet cannot be negative.');
      }
      data.perSheetCostCents = Math.round(cost);
    }
    if (body.active !== undefined) data.active = Boolean(body.active);
    return data;
  }

  private validateShipping(body: ShippingInput, requireAll: boolean): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    if (body.name !== undefined || requireAll) {
      const name = (body.name ?? '').trim();
      if (!name) throw new BadRequestException('Give the shipping method a name.');
      data.name = name;
    }
    if (body.description !== undefined) data.description = String(body.description);
    for (const field of ['baseRateCents', 'perSheetRateCents'] as const) {
      const value = body[field];
      if (value === undefined && !requireAll) continue;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new BadRequestException('Shipping rates cannot be negative.');
      }
      data[field] = Math.round(value);
    }
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (body.sortOrder !== undefined) data.sortOrder = Math.round(Number(body.sortOrder) || 0);
    return data;
  }
}
