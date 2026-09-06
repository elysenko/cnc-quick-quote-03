import { Injectable, computed, signal } from '@angular/core';
import { BendLine, Breakdown, Drawing, NestingResult } from '../core/models';
import { PART_CUT_LENGTH_IN, PART_HEIGHT_IN, PART_POLYLINES, PART_WIDTH_IN } from '../core/mock-geometry';

/**
 * Wizard continuity across the four step routes.
 *
 * Seeded with a representative draft so any step is deep-linkable on a cold load —
 * a reviewer can open /quote/new/review directly and see a populated screen.
 */
@Injectable({ providedIn: 'root' })
export class QuoteDraftService {
  readonly drawing = signal<Drawing | null>({
    id: 'dwg_8f31c4',
    filename: 'mount-bracket-rev-c.dxf',
    sizeBytes: 184_320,
    detectedUnits: 'mm ($INSUNITS = 4)',
    bboxWIn: PART_WIDTH_IN,
    bboxHIn: PART_HEIGHT_IN,
    cutLengthIn: PART_CUT_LENGTH_IN,
    polylines: PART_POLYLINES,
    entityCount: 34,
  });

  readonly materialId = signal('mat_ss304_16');
  readonly materialName = signal('Stainless 304 — 16 ga (0.060")');
  readonly perSheetCostCents = signal(8_450);
  readonly sheetWidthIn = signal(48);
  readonly sheetHeightIn = signal(24);
  readonly quantity = signal(24);

  readonly bends = signal<BendLine[]>([
    { id: 'bnd_1', x1: 0, y1: 1.75, x2: PART_WIDTH_IN, y2: 1.75, angleDeg: 90, direction: 'up' },
    { id: 'bnd_2', x1: 0, y1: 3.75, x2: PART_WIDTH_IN, y2: 3.75, angleDeg: 45, direction: 'down' },
  ]);

  /** Machine settings — mirrors the admin `machine` settings document. */
  readonly marginIn = signal(0.5);
  readonly spacingIn = signal(0.25);
  readonly bedWidthIn = signal(60);
  readonly bedHeightIn = signal(36);

  /** Grid nesting: usable area minus 2x margin, top-left anchored placements. */
  readonly nesting = computed<NestingResult>(() => {
    const sheetW = this.sheetWidthIn();
    const sheetH = this.sheetHeightIn();
    const margin = this.marginIn();
    const spacing = this.spacingIn();
    const partW = this.drawing()?.bboxWIn ?? PART_WIDTH_IN;
    const partH = this.drawing()?.bboxHIn ?? PART_HEIGHT_IN;

    const usableW = sheetW - margin * 2;
    const usableH = sheetH - margin * 2;
    const cols = Math.max(1, Math.floor((usableW + spacing) / (partW + spacing)));
    const rows = Math.max(1, Math.floor((usableH + spacing) / (partH + spacing)));
    const perSheet = cols * rows;
    const quantity = Math.max(1, this.quantity());
    const sheetCount = Math.ceil(quantity / perSheet);

    const placements = [];
    let placed = 0;
    for (let sheet = 0; sheet < sheetCount; sheet++) {
      for (let row = 0; row < rows && placed < quantity; row++) {
        for (let col = 0; col < cols && placed < quantity; col++) {
          placements.push({
            sheet,
            x: margin + col * (partW + spacing),
            y: margin + row * (partH + spacing),
          });
          placed++;
        }
      }
    }

    const firstSheetCount = Math.min(quantity, perSheet);
    return {
      sheetWidthIn: sheetW,
      sheetHeightIn: sheetH,
      marginIn: margin,
      spacingIn: spacing,
      cols,
      rows,
      perSheet,
      sheetCount,
      utilization: (firstSheetCount * partW * partH) / (sheetW * sheetH),
      placements,
    };
  });

  /** Pricing config snapshot — mirrors the admin `pricing` settings document. */
  readonly setupFeeCents = signal(3_500);
  readonly costPerLinearFootCents = signal(185);
  readonly costPerBendCents = signal(125);
  readonly handlingFeeCents = signal(1_200);
  readonly minimumOrderCents = signal(7_500);
  readonly costMultiplier = signal(1.15);

  readonly breakdown = computed<Breakdown>(() => {
    const quantity = Math.max(1, this.quantity());
    const nesting = this.nesting();
    const perPartIn = this.drawing()?.cutLengthIn ?? PART_CUT_LENGTH_IN;
    const totalFeet = (perPartIn * quantity) / 12;
    const totalBends = this.bends().length * quantity;

    const setup = this.setupFeeCents();
    const cutting = Math.round(totalFeet * this.costPerLinearFootCents());
    const sheets = Math.round(nesting.sheetCount * this.perSheetCostCents() * this.costMultiplier());
    const handling = this.handlingFeeCents();
    const bending = totalBends * this.costPerBendCents();
    const subtotal = setup + cutting + sheets + handling + bending;
    const minimum = this.minimumOrderCents();

    return {
      lines: [
        { key: 'setup', label: 'Setup fee', detail: 'one-time machine setup', amountCents: setup },
        {
          key: 'cutting',
          label: 'Cutting',
          detail: `${totalFeet.toFixed(2)} ft × $${(this.costPerLinearFootCents() / 100).toFixed(2)}/ft`,
          amountCents: cutting,
        },
        {
          key: 'material',
          label: 'Material',
          detail: `${nesting.sheetCount} sheet(s) × $${(this.perSheetCostCents() / 100).toFixed(2)} × ${this.costMultiplier()} multiplier`,
          amountCents: sheets,
        },
        { key: 'handling', label: 'Handling', detail: 'pack and stage', amountCents: handling },
        {
          key: 'bending',
          label: 'Bending',
          detail: `${totalBends} bends × $${(this.costPerBendCents() / 100).toFixed(2)}`,
          amountCents: bending,
        },
      ],
      subtotalCents: subtotal,
      minimumOrderCents: minimum,
      minimumOrderApplied: subtotal < minimum,
      totalCents: Math.max(minimum, subtotal),
    };
  });
}
