import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Material, centsToUsd } from '../core/models';
import { QuoteDraftService } from './quote-draft.service';
import { ApiService } from '../core/api.service';

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
  private readonly api = inject(ApiService);

  readonly materials = signal<Material[]>([]);

  /** Mirrors the admin `machine` settings document. */
  readonly quantityMin = this.draft.quantityMin;
  readonly quantityMax = this.draft.quantityMax;
  readonly quantityError = signal<string | null>(null);

  readonly selectedId = this.draft.materialId;
  readonly quantity = this.draft.quantity;
  readonly nesting = this.draft.nesting;
  readonly money = centsToUsd;

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.materials.set(await this.api.materials());
    } catch {
      // The template's empty state already tells the customer an admin must add stock.
      this.materials.set([]);
    }
  }

  select(material: Material): void {
    this.draft.selectMaterial(material);
  }

  /** Client-side mirror of the server's quantity bounds check. */
  setQuantity(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value < this.quantityMin() ||
      value > this.quantityMax()
    ) {
      this.quantityError.set(
        `Quantity must be a whole number between ${this.quantityMin()} and ${this.quantityMax()}.`,
      );
      return;
    }
    this.quantityError.set(null);
    this.draft.setQuantity(value);
  }
}
