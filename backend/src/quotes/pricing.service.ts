import { Injectable } from '@nestjs/common';
import type { PricingDoc } from '../settings/settings.defaults';

export interface BreakdownLine {
  key: string;
  label: string;
  detail: string;
  amountCents: number;
}

export interface Breakdown {
  lines: BreakdownLine[];
  subtotalCents: number;
  minimumOrderCents: number;
  minimumOrderApplied: boolean;
  totalCents: number;
}

export interface PricingInput {
  cutLengthInPerPart: number;
  quantity: number;
  bendsPerPart: number;
  sheetCount: number;
  perSheetCostCents: number;
  costMultiplier: number;
}

const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/**
 * total = max(minimumOrder, setup + cutting + material + handling + bending)
 *
 * Every term is rounded to whole cents before summing, so the itemized lines always
 * add up to the subtotal exactly — no float drift between what is shown and charged.
 */
@Injectable()
export class PricingService {
  price(input: PricingInput, config: PricingDoc): Breakdown {
    const quantity = Math.max(1, Math.floor(input.quantity));
    const totalCutFeet = (input.cutLengthInPerPart * quantity) / 12;
    const totalBends = Math.max(0, Math.floor(input.bendsPerPart)) * quantity;

    const setup = Math.round(config.setupFeeCents);
    const cutting = Math.round(totalCutFeet * config.costPerLinearFootCents);
    const material = Math.round(input.sheetCount * input.perSheetCostCents * input.costMultiplier);
    const handling = Math.round(config.handlingFeeCents);
    const bending = Math.round(totalBends * config.costPerBendCents);

    const subtotalCents = setup + cutting + material + handling + bending;
    const minimumOrderCents = Math.round(config.minimumOrderCents);
    const minimumOrderApplied = subtotalCents < minimumOrderCents;

    return {
      lines: [
        { key: 'setup', label: 'Setup fee', detail: 'one-time machine setup', amountCents: setup },
        {
          key: 'cutting',
          label: 'Cutting',
          detail: `${totalCutFeet.toFixed(2)} ft × ${usd(config.costPerLinearFootCents)}/ft`,
          amountCents: cutting,
        },
        {
          key: 'material',
          label: 'Material',
          detail: `${input.sheetCount} sheet(s) × ${usd(input.perSheetCostCents)} × ${input.costMultiplier} multiplier`,
          amountCents: material,
        },
        { key: 'handling', label: 'Handling', detail: 'pack and stage', amountCents: handling },
        {
          key: 'bending',
          label: 'Bending',
          detail: `${totalBends} bends × ${usd(config.costPerBendCents)}`,
          amountCents: bending,
        },
      ],
      subtotalCents,
      minimumOrderCents,
      minimumOrderApplied,
      totalCents: Math.max(minimumOrderCents, subtotalCents),
    };
  }
}
