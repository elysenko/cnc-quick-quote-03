import { NestingService, PartTooLargeError } from './nesting.service';
import { DEFAULTS } from '../settings/settings.defaults';

const machine = { ...DEFAULTS.machine, marginIn: 0.5, spacingIn: 0.25 };
const sheet = { name: 'Test stock', sheetWidthIn: 48, sheetHeightIn: 24 };

describe('NestingService', () => {
  const service = new NestingService();

  it('fits a whole batch on one sheet', () => {
    // usable 47 x 23; 8.75+0.25 = 9 → 5 cols; 5.5+0.25 = 5.75 → 4 rows → 20 per sheet
    const result = service.nest(8.75, 5.5, sheet, 20, machine);
    expect(result.cols).toBe(5);
    expect(result.rows).toBe(4);
    expect(result.perSheet).toBe(20);
    expect(result.sheetCount).toBe(1);
    expect(result.placements).toHaveLength(20);
  });

  it('rolls over onto additional sheets', () => {
    const result = service.nest(8.75, 5.5, sheet, 41, machine);
    expect(result.sheetCount).toBe(3);
    expect(result.placements.filter((p) => p.sheet === 2)).toHaveLength(1);
  });

  it('anchors the first placement at the top-left margin', () => {
    const result = service.nest(8.75, 5.5, sheet, 1, machine);
    expect(result.placements[0]).toEqual({ sheet: 0, x: 0.5, y: 0.5 });
  });

  it('rejects a part larger than the usable area', () => {
    expect(() => service.nest(47.5, 5, sheet, 1, machine)).toThrow(PartTooLargeError);
    expect(() => service.nest(10, 23.5, sheet, 1, machine)).toThrow(PartTooLargeError);
  });

  it('accepts a part that exactly fills the usable area', () => {
    const result = service.nest(47, 23, sheet, 1, machine);
    expect(result.cols).toBe(1);
    expect(result.rows).toBe(1);
    expect(result.sheetCount).toBe(1);
  });

  it('treats an exact boundary fit as fitting, not one column short', () => {
    // usable width 47, part 15.5 + 0.25 spacing → exactly 3 columns
    const result = service.nest(15.5, 5, sheet, 3, machine);
    expect(result.cols).toBe(3);
  });

  it('reports utilization as placed area over sheet area', () => {
    const result = service.nest(24, 12, sheet, 1, machine);
    expect(result.utilization).toBeCloseTo((24 * 12) / (48 * 24), 6);
  });

  it('never divides by zero on a zero-area part', () => {
    const result = service.nest(0, 0, sheet, 5, machine);
    expect(Number.isFinite(result.utilization)).toBe(true);
    expect(result.sheetCount).toBeGreaterThanOrEqual(1);
  });
});
