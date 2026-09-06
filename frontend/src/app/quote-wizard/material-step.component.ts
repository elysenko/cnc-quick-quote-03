import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Material, centsToUsd } from '../core/models';
import { QuoteDraftService } from './quote-draft.service';

@Component({
  selector: 'app-material-step',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './material-step.component.html',
  styleUrl: './wizard-step.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialStepComponent {
  private readonly draft = inject(QuoteDraftService);

  readonly materials = signal<Material[]>([
    { id: 'mat_ms_14', name: 'Mild steel — 14 ga (0.075")', thicknessIn: 0.075, sheetWidthIn: 48, sheetHeightIn: 24, perSheetCostCents: 4_200, costMultiplier: 1, active: true },
    { id: 'mat_ss304_16', name: 'Stainless 304 — 16 ga (0.060")', thicknessIn: 0.06, sheetWidthIn: 48, sheetHeightIn: 24, perSheetCostCents: 8_450, costMultiplier: 1.15, active: true },
    { id: 'mat_al5052_125', name: 'Aluminium 5052 — 0.125"', thicknessIn: 0.125, sheetWidthIn: 48, sheetHeightIn: 24, perSheetCostCents: 6_100, costMultiplier: 1.05, active: true },
    { id: 'mat_al6061_090', name: 'Aluminium 6061 — 0.090"', thicknessIn: 0.09, sheetWidthIn: 60, sheetHeightIn: 30, perSheetCostCents: 7_300, costMultiplier: 1.08, active: true },
  ]);

  /** Mirrors the admin `machine` settings document. */
  readonly quantityMin = signal(1);
  readonly quantityMax = signal(500);
  readonly quantityError = signal<string | null>(null);

  readonly selectedId = this.draft.materialId;
  readonly quantity = this.draft.quantity;
  readonly nesting = this.draft.nesting;
  readonly money = centsToUsd;

  select(material: Material): void {
    this.draft.materialId.set(material.id);
    this.draft.materialName.set(material.name);
    this.draft.perSheetCostCents.set(material.perSheetCostCents);
    this.draft.sheetWidthIn.set(material.sheetWidthIn);
    this.draft.sheetHeightIn.set(material.sheetHeightIn);
    this.draft.costMultiplier.set(material.costMultiplier);
  }

  /** Client-side mirror of the server's quantity bounds check. */
  setQuantity(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value) || value < this.quantityMin() || value > this.quantityMax()) {
      this.quantityError.set(
        `Quantity must be a whole number between ${this.quantityMin()} and ${this.quantityMax()}.`,
      );
      return;
    }
    this.quantityError.set(null);
    this.draft.quantity.set(Math.floor(value));
  }
}
