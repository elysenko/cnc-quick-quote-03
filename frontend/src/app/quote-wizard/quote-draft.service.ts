import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { BendLine, Breakdown, Drawing, Material, NestingResult } from '../core/models';
import { ApiService } from '../core/api.service';
import { readRaw, removeKeys, writeRaw } from '../core/storage';

const DRAWING_KEY = 'draft_drawing_id';
const MATERIAL_KEY = 'draft_material_id';
const QUANTITY_KEY = 'draft_quantity';
const SYNC_DEBOUNCE_MS = 500;

/** Bends created in the editor carry a temporary id until the server assigns one. */
const isTemporary = (id: string): boolean => id.startsWith('bend_new_');

/**
 * Wizard continuity across the four step routes.
 *
 * The identifiers that matter (drawing, material, quantity) are mirrored into
 * namespaced storage and re-hydrated from the server on a cold load, so any step URL
 * survives a reload. Bend edits are pushed to the server on a short debounce, so the
 * canvas stays instant while the rows behind it stay authoritative.
 */
@Injectable({ providedIn: 'root' })
export class QuoteDraftService {
  private readonly api = inject(ApiService);

  readonly drawing = signal<Drawing | null>(null);
  readonly loadingDrawing = signal(false);

  readonly materialId = signal('');
  readonly materialName = signal('');
  readonly perSheetCostCents = signal(0);
  readonly sheetWidthIn = signal(48);
  readonly sheetHeightIn = signal(24);
  readonly costMultiplier = signal(1);
  readonly quantity = signal(1);

  readonly bends = signal<BendLine[]>([]);

  /** Machine settings, mirrored from the admin `machine` document. */
  readonly marginIn = signal(0.5);
  readonly spacingIn = signal(0.25);
  readonly bedWidthIn = signal(60);
  readonly bedHeightIn = signal(36);
  readonly quantityMin = signal(1);
  readonly quantityMax = signal(500);

  /** Upload settings, mirrored from the admin `upload` document. */
  readonly maxUploadBytes = signal(12 * 1024 * 1024);
  readonly allowedExtensions = signal<string[]>(['.dxf']);

  /** Pricing settings, mirrored from the admin `pricing` document. */
  readonly setupFeeCents = signal(0);
  readonly costPerLinearFootCents = signal(0);
  readonly costPerBendCents = signal(0);
  readonly handlingFeeCents = signal(0);
  readonly minimumOrderCents = signal(0);

  readonly configLoaded = signal(false);

  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private syncedBends: BendLine[] = [];
  private suppressSync = false;

  constructor() {
    void this.loadConfig();
    void this.restore();

    effect(() => {
      const bends = this.bends();
      if (this.suppressSync || !this.drawing()) return;
      this.scheduleBendSync(bends);
    });
  }

  /** Pulls the same machine/upload/pricing documents the server prices with. */
  async loadConfig(): Promise<void> {
    try {
      const config = await this.api.wizardConfig();
      this.marginIn.set(config.machine.marginIn);
      this.spacingIn.set(config.machine.spacingIn);
      this.bedWidthIn.set(config.machine.bedWidthIn);
      this.bedHeightIn.set(config.machine.bedHeightIn);
      this.quantityMin.set(config.machine.quantityMin);
      this.quantityMax.set(config.machine.quantityMax);
      if (this.quantity() < config.machine.quantityMin) {
        this.quantity.set(config.machine.quantityMin);
      }
      this.maxUploadBytes.set(config.upload.maxUploadBytes);
      this.allowedExtensions.set(config.upload.allowedExtensions);
      this.setupFeeCents.set(config.pricing.setupFeeCents);
      this.costPerLinearFootCents.set(config.pricing.costPerLinearFootCents);
      this.costPerBendCents.set(config.pricing.costPerBendCents);
      this.handlingFeeCents.set(config.pricing.handlingFeeCents);
      this.minimumOrderCents.set(config.pricing.minimumOrderCents);
      this.configLoaded.set(true);
    } catch {
      /* Defaults stay in place; the server still validates the real quote. */
    }
  }

  /** Cold-load rehydration so /quote/new/review is a valid deep link. */
  private async restore(): Promise<void> {
    const quantity = Number(readRaw(QUANTITY_KEY));
    if (Number.isFinite(quantity) && quantity > 0) this.quantity.set(Math.floor(quantity));

    const drawingId = readRaw(DRAWING_KEY);
    if (!drawingId) return;
    this.loadingDrawing.set(true);
    try {
      const drawing = await this.api.drawing(drawingId);
      this.setDrawing(drawing, false);
      const bends = await this.api.bends(drawingId);
      this.suppressSync = true;
      this.bends.set(bends);
      this.syncedBends = bends.map((bend) => ({ ...bend }));
      this.suppressSync = false;
    } catch {
      removeKeys(DRAWING_KEY);
    } finally {
      this.loadingDrawing.set(false);
    }

    const materialId = readRaw(MATERIAL_KEY);
    if (materialId) {
      try {
        const material = (await this.api.materials()).find((item) => item.id === materialId);
        if (material) this.selectMaterial(material);
      } catch {
        /* material list unavailable — the step will reload it */
      }
    }
  }

  setDrawing(drawing: Drawing, resetBends = true): void {
    this.drawing.set(drawing);
    writeRaw(DRAWING_KEY, drawing.id);
    if (resetBends) {
      this.suppressSync = true;
      this.bends.set([]);
      this.syncedBends = [];
      this.suppressSync = false;
    }
  }

  selectMaterial(material: Material): void {
    this.materialId.set(material.id);
    this.materialName.set(material.name);
    this.perSheetCostCents.set(material.perSheetCostCents);
    this.sheetWidthIn.set(material.sheetWidthIn);
    this.sheetHeightIn.set(material.sheetHeightIn);
    this.costMultiplier.set(material.costMultiplier);
    writeRaw(MATERIAL_KEY, material.id);
  }

  setQuantity(value: number): void {
    this.quantity.set(value);
    writeRaw(QUANTITY_KEY, String(value));
  }

  /** Clears the draft once it has become a real quote. */
  reset(): void {
    removeKeys(DRAWING_KEY, MATERIAL_KEY, QUANTITY_KEY);
    this.suppressSync = true;
    this.drawing.set(null);
    this.bends.set([]);
    this.syncedBends = [];
    this.materialId.set('');
    this.materialName.set('');
    this.suppressSync = false;
  }

  // ---- bend persistence --------------------------------------------------

  private scheduleBendSync(bends: BendLine[]): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => void this.syncBends(bends), SYNC_DEBOUNCE_MS);
  }

  /** Diffs the editor's list against what the server last acknowledged. */
  private async syncBends(bends: BendLine[]): Promise<void> {
    const drawing = this.drawing();
    if (!drawing) return;
    const previous = this.syncedBends;
    const currentIds = new Set(bends.map((bend) => bend.id));

    try {
      for (const gone of previous.filter((bend) => !currentIds.has(bend.id))) {
        if (!isTemporary(gone.id)) await this.api.deleteBend(gone.id);
      }

      const saved: BendLine[] = [];
      for (const bend of bends) {
        const body = {
          x1: bend.x1,
          y1: bend.y1,
          x2: bend.x2,
          y2: bend.y2,
          angleDeg: bend.angleDeg,
          direction: bend.direction,
        };
        if (isTemporary(bend.id)) {
          saved.push(await this.api.createBend(drawing.id, body));
          continue;
        }
        const before = previous.find((item) => item.id === bend.id);
        const changed =
          !before ||
          before.x1 !== bend.x1 ||
          before.y1 !== bend.y1 ||
          before.x2 !== bend.x2 ||
          before.y2 !== bend.y2 ||
          before.angleDeg !== bend.angleDeg ||
          before.direction !== bend.direction;
        saved.push(changed ? await this.api.updateBend(bend.id, body) : bend);
      }

      this.syncedBends = saved.map((bend) => ({ ...bend }));
      // Swap temporary ids for server ids without disturbing an in-flight edit.
      if (saved.some((bend, index) => bend.id !== bends[index]?.id)) {
        this.suppressSync = true;
        this.bends.set(saved);
        this.suppressSync = false;
      }
    } catch {
      // A rejected edit (e.g. an out-of-range angle) leaves the server unchanged;
      // reload the authoritative list so the editor cannot drift out of sync.
      try {
        const authoritative = await this.api.bends(drawing.id);
        this.suppressSync = true;
        this.bends.set(authoritative);
        this.syncedBends = authoritative.map((bend) => ({ ...bend }));
        this.suppressSync = false;
      } catch {
        /* leave local state alone */
      }
    }
  }

  // ---- live preview ------------------------------------------------------

  /** Grid nesting: usable area minus 2x margin, top-left anchored placements. */
  readonly nesting = computed<NestingResult>(() => {
    const sheetW = this.sheetWidthIn();
    const sheetH = this.sheetHeightIn();
    const margin = this.marginIn();
    const spacing = this.spacingIn();
    const drawing = this.drawing();
    const partW = Math.max(drawing?.bboxWIn ?? 0, 0.0001);
    const partH = Math.max(drawing?.bboxHIn ?? 0, 0.0001);

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
      utilization: sheetW * sheetH > 0 ? (firstSheetCount * partW * partH) / (sheetW * sheetH) : 0,
      placements,
    };
  });

  /** Mirrors the server formula exactly, using the rate card fetched from it. */
  readonly breakdown = computed<Breakdown>(() => {
    const quantity = Math.max(1, this.quantity());
    const nesting = this.nesting();
    const perPartIn = this.drawing()?.cutLengthIn ?? 0;
    const totalFeet = (perPartIn * quantity) / 12;
    const totalBends = this.bends().length * quantity;

    const setup = Math.round(this.setupFeeCents());
    const cutting = Math.round(totalFeet * this.costPerLinearFootCents());
    const sheets = Math.round(nesting.sheetCount * this.perSheetCostCents() * this.costMultiplier());
    const handling = Math.round(this.handlingFeeCents());
    const bending = Math.round(totalBends * this.costPerBendCents());
    const subtotal = setup + cutting + sheets + handling + bending;
    const minimum = Math.round(this.minimumOrderCents());
    const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

    return {
      lines: [
        { key: 'setup', label: 'Setup fee', detail: 'one-time machine setup', amountCents: setup },
        {
          key: 'cutting',
          label: 'Cutting',
          detail: `${totalFeet.toFixed(2)} ft × ${usd(this.costPerLinearFootCents())}/ft`,
          amountCents: cutting,
        },
        {
          key: 'material',
          label: 'Material',
          detail: `${nesting.sheetCount} sheet(s) × ${usd(this.perSheetCostCents())} × ${this.costMultiplier()} multiplier`,
          amountCents: sheets,
        },
        { key: 'handling', label: 'Handling', detail: 'pack and stage', amountCents: handling },
        {
          key: 'bending',
          label: 'Bending',
          detail: `${totalBends} bends × ${usd(this.costPerBendCents())}`,
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
