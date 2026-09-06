import { Injectable } from '@nestjs/common';
import type { MachineDoc } from '../settings/settings.defaults';

export class PartTooLargeError extends Error {}

export interface Placement {
  sheet: number;
  x: number;
  y: number;
}

export interface NestingResult {
  sheetWidthIn: number;
  sheetHeightIn: number;
  marginIn: number;
  spacingIn: number;
  cols: number;
  rows: number;
  perSheet: number;
  sheetCount: number;
  utilization: number;
  placements: Placement[];
}

export interface NestableMaterial {
  name: string;
  sheetWidthIn: number;
  sheetHeightIn: number;
}

/** Placements are capped so a 10,000-part quote cannot balloon the JSON payload. */
const MAX_PLACEMENTS = 2000;
/** Floating-point slack so a part that exactly fills the usable width still fits. */
const EPSILON = 1e-9;

/**
 * Bounding-box row/column grid packing.
 *
 * Deliberately not a polygon nester: parts are packed on their bounding box, top-left
 * anchored, which is what the work-bed preview draws and what the shop actually runs.
 */
@Injectable()
export class NestingService {
  nest(
    partWIn: number,
    partHIn: number,
    material: NestableMaterial,
    quantity: number,
    machine: MachineDoc,
  ): NestingResult {
    const sheetW = material.sheetWidthIn;
    const sheetH = material.sheetHeightIn;
    const margin = Math.max(0, machine.marginIn);
    const spacing = Math.max(0, machine.spacingIn);

    const usableW = sheetW - margin * 2;
    const usableH = sheetH - margin * 2;
    const partW = Math.max(partWIn, EPSILON);
    const partH = Math.max(partHIn, EPSILON);

    if (partW > usableW + EPSILON || partH > usableH + EPSILON) {
      throw new PartTooLargeError(
        `This part measures ${partW.toFixed(2)}″ × ${partH.toFixed(2)}″, which does not fit the ` +
          `${sheetW}″ × ${sheetH}″ ${material.name} sheet once the ${margin}″ edge margin is applied. ` +
          'Choose a larger sheet or scale the drawing down.',
      );
    }

    const cols = Math.max(1, Math.floor((usableW + spacing + EPSILON) / (partW + spacing)));
    const rows = Math.max(1, Math.floor((usableH + spacing + EPSILON) / (partH + spacing)));
    const perSheet = cols * rows;
    const sheetCount = Math.ceil(quantity / perSheet);

    const placements: Placement[] = [];
    let placed = 0;
    for (let sheet = 0; sheet < sheetCount && placed < quantity; sheet++) {
      for (let row = 0; row < rows && placed < quantity; row++) {
        for (let col = 0; col < cols && placed < quantity; col++) {
          if (placements.length < MAX_PLACEMENTS) {
            placements.push({
              sheet,
              x: margin + col * (partW + spacing),
              y: margin + row * (partH + spacing),
            });
          }
          placed++;
        }
      }
    }

    const onFirstSheet = Math.min(quantity, perSheet);
    const sheetArea = sheetW * sheetH;
    const utilization = sheetArea > 0 ? (onFirstSheet * partW * partH) / sheetArea : 0;

    return {
      sheetWidthIn: sheetW,
      sheetHeightIn: sheetH,
      marginIn: margin,
      spacingIn: spacing,
      cols,
      rows,
      perSheet,
      sheetCount,
      utilization,
      placements,
    };
  }
}
