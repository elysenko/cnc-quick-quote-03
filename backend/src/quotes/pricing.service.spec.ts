import { PricingService } from './pricing.service';
import { DEFAULTS } from '../settings/settings.defaults';

describe('PricingService', () => {
  const service = new PricingService();
  const config = { ...DEFAULTS.pricing };

  it('computes the itemized breakdown by hand-checked arithmetic', () => {
    const breakdown = service.price(
      {
        cutLengthInPerPart: 42.6,
        quantity: 24,
        bendsPerPart: 2,
        sheetCount: 2,
        perSheetCostCents: 8450,
        costMultiplier: 1.15,
      },
      config,
    );

    // 42.6 * 24 / 12 = 85.2 ft * 185 = 15762
    expect(breakdown.lines.find((l) => l.key === 'cutting')?.amountCents).toBe(15762);
    // 2 * 8450 * 1.15 = 19435
    expect(breakdown.lines.find((l) => l.key === 'material')?.amountCents).toBe(19435);
    // 2 * 24 = 48 bends * 125 = 6000
    expect(breakdown.lines.find((l) => l.key === 'bending')?.amountCents).toBe(6000);
    expect(breakdown.subtotalCents).toBe(3500 + 15762 + 19435 + 1200 + 6000);
    expect(breakdown.minimumOrderApplied).toBe(false);
    expect(breakdown.totalCents).toBe(breakdown.subtotalCents);
  });

  it('lines always sum exactly to the subtotal (integer cents, no drift)', () => {
    const breakdown = service.price(
      {
        cutLengthInPerPart: 7.333333,
        quantity: 7,
        bendsPerPart: 1,
        sheetCount: 1,
        perSheetCostCents: 4200,
        costMultiplier: 1.07,
      },
      config,
    );
    const summed = breakdown.lines.reduce((total, line) => total + line.amountCents, 0);
    expect(summed).toBe(breakdown.subtotalCents);
    expect(Number.isInteger(breakdown.totalCents)).toBe(true);
  });

  it('clamps to the minimum order and flags it', () => {
    const breakdown = service.price(
      {
        cutLengthInPerPart: 1,
        quantity: 1,
        bendsPerPart: 0,
        sheetCount: 1,
        perSheetCostCents: 0,
        costMultiplier: 1,
      },
      { ...config, setupFeeCents: 100, handlingFeeCents: 100, minimumOrderCents: 7500 },
    );
    expect(breakdown.subtotalCents).toBeLessThan(7500);
    expect(breakdown.minimumOrderApplied).toBe(true);
    expect(breakdown.totalCents).toBe(7500);
  });

  it('scales bend cost by quantity, not per part', () => {
    const one = service.price(
      { cutLengthInPerPart: 10, quantity: 1, bendsPerPart: 3, sheetCount: 1, perSheetCostCents: 0, costMultiplier: 1 },
      config,
    );
    const ten = service.price(
      { cutLengthInPerPart: 10, quantity: 10, bendsPerPart: 3, sheetCount: 1, perSheetCostCents: 0, costMultiplier: 1 },
      config,
    );
    const bendOf = (b: typeof one): number => b.lines.find((l) => l.key === 'bending')!.amountCents;
    expect(bendOf(ten)).toBe(bendOf(one) * 10);
  });
});
