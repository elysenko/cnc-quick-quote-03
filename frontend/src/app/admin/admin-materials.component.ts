import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../shared/modal/modal.component';
import { QueryParamStateService } from '../core/query-param-state.service';
import { Material, centsToUsd } from '../core/models';

const FILTERS = ['all', 'active', 'inactive'] as const;
type Filter = (typeof FILTERS)[number];

@Component({
  selector: 'app-admin-materials',
  standalone: true,
  imports: [FormsModule, ModalComponent],
  templateUrl: './admin-materials.component.html',
  styleUrls: ['./admin.css', '../quotes-list/quotes-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMaterialsComponent {
  private readonly params = inject(QueryParamStateService);

  readonly materials = signal<Material[]>([
    { id: 'mat_ms_14', name: 'Mild steel — 14 ga (0.075")', thicknessIn: 0.075, sheetWidthIn: 48, sheetHeightIn: 24, perSheetCostCents: 4_200, costMultiplier: 1, active: true },
    { id: 'mat_ss304_16', name: 'Stainless 304 — 16 ga (0.060")', thicknessIn: 0.06, sheetWidthIn: 48, sheetHeightIn: 24, perSheetCostCents: 8_450, costMultiplier: 1.15, active: true },
    { id: 'mat_al5052_125', name: 'Aluminium 5052 — 0.125"', thicknessIn: 0.125, sheetWidthIn: 48, sheetHeightIn: 24, perSheetCostCents: 6_100, costMultiplier: 1.05, active: true },
    { id: 'mat_al6061_090', name: 'Aluminium 6061 — 0.090"', thicknessIn: 0.09, sheetWidthIn: 60, sheetHeightIn: 30, perSheetCostCents: 7_300, costMultiplier: 1.08, active: true },
    { id: 'mat_brass_050', name: 'Brass C260 — 0.050"', thicknessIn: 0.05, sheetWidthIn: 36, sheetHeightIn: 24, perSheetCostCents: 12_900, costMultiplier: 1.3, active: false },
  ]);

  readonly filter = this.params.read<Filter>('filter', 'all', FILTERS);
  readonly modal = this.params.read<string>('modal', '');
  readonly editingId = this.params.read<string>('id', '');
  readonly validationError = signal<string | null>(null);
  readonly money = centsToUsd;

  readonly draftName = signal('');
  readonly draftThickness = signal(0.075);
  readonly draftCost = signal(42);
  readonly draftWidth = signal(48);
  readonly draftHeight = signal(24);
  readonly draftMultiplier = signal(1);

  readonly filtered = computed(() => {
    const filter = this.filter();
    if (filter === 'active') return this.materials().filter((m) => m.active);
    if (filter === 'inactive') return this.materials().filter((m) => !m.active);
    return this.materials();
  });

  readonly editing = computed(() =>
    this.materials().find((m) => m.id === this.editingId()) ?? null,
  );

  setFilter(event: Event): void {
    this.params.patch({ filter: (event.target as HTMLSelectElement).value });
  }

  openEditor(id: string): void {
    const material = this.materials().find((m) => m.id === id);
    this.draftName.set(material?.name ?? '');
    this.draftThickness.set(material?.thicknessIn ?? 0.075);
    this.draftCost.set((material?.perSheetCostCents ?? 4_200) / 100);
    this.draftWidth.set(material?.sheetWidthIn ?? 48);
    this.draftHeight.set(material?.sheetHeightIn ?? 24);
    this.draftMultiplier.set(material?.costMultiplier ?? 1);
    this.validationError.set(null);
    this.params.patch({ modal: 'edit-material', id });
  }

  closeEditor(): void {
    this.params.patch({ modal: null, id: null });
  }

  /** Client-side mirror of the server's material constraints. */
  saveMaterial(): void {
    if (!this.draftName().trim()) {
      this.validationError.set('Give the material a name customers will recognise.');
      return;
    }
    if (this.draftThickness() <= 0 || this.draftCost() < 0 || this.draftMultiplier() <= 0) {
      this.validationError.set('Thickness and multiplier must be greater than zero, and cost cannot be negative.');
      return;
    }
    this.closeEditor();
  }

  toggle(id: string): void {
    this.materials.update((list) =>
      list.map((m) => (m.id === id ? { ...m, active: !m.active } : m)),
    );
  }
}
