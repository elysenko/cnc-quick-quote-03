import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../shared/modal/modal.component';
import { QueryParamStateService } from '../core/query-param-state.service';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { Material, centsToUsd } from '../core/models';

const FILTERS = ['all', 'active', 'inactive'] as const;
type Filter = (typeof FILTERS)[number];

/** Neutral starting point for the Add-material form — no sample values. */
const BLANK_DRAFT = {
  name: '',
  thicknessIn: 0.075,
  costUsd: 0,
  widthIn: 48,
  heightIn: 24,
  multiplier: 1,
} as const;

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
  private readonly api = inject(ApiService);

  readonly materials = signal<Material[]>([]);

  readonly filter = this.params.read<Filter>('filter', 'all', FILTERS);
  readonly modal = this.params.read<string>('modal', '');
  readonly editingId = this.params.read<string>('id', '');
  readonly validationError = signal<string | null>(null);
  readonly money = centsToUsd;

  readonly draftName = signal<string>(BLANK_DRAFT.name);
  readonly draftThickness = signal<number>(BLANK_DRAFT.thicknessIn);
  readonly draftCost = signal<number>(BLANK_DRAFT.costUsd);
  readonly draftWidth = signal<number>(BLANK_DRAFT.widthIn);
  readonly draftHeight = signal<number>(BLANK_DRAFT.heightIn);
  readonly draftMultiplier = signal<number>(BLANK_DRAFT.multiplier);

  readonly filtered = computed(() => {
    const filter = this.filter();
    if (filter === 'active') return this.materials().filter((m) => m.active);
    if (filter === 'inactive') return this.materials().filter((m) => !m.active);
    return this.materials();
  });

  readonly editing = computed(() =>
    this.materials().find((m) => m.id === this.editingId()) ?? null,
  );

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.materials.set(await this.api.adminMaterials());
    } catch {
      this.materials.set([]);
      return;
    }
    // Deep link straight into ?modal=edit-material&id=... — the row only exists once
    // the list has arrived, so the draft is filled in here rather than in openEditor.
    if (this.modal() === 'edit-material') {
      const material = this.materials().find((m) => m.id === this.editingId());
      if (material) this.fillDraft(material);
    }
  }

  private fillDraft(material: Material | null): void {
    this.draftName.set(material?.name ?? BLANK_DRAFT.name);
    this.draftThickness.set(material?.thicknessIn ?? BLANK_DRAFT.thicknessIn);
    this.draftCost.set(
      material ? material.perSheetCostCents / 100 : BLANK_DRAFT.costUsd,
    );
    this.draftWidth.set(material?.sheetWidthIn ?? BLANK_DRAFT.widthIn);
    this.draftHeight.set(material?.sheetHeightIn ?? BLANK_DRAFT.heightIn);
    this.draftMultiplier.set(material?.costMultiplier ?? BLANK_DRAFT.multiplier);
  }

  setFilter(event: Event): void {
    this.params.patch({ filter: (event.target as HTMLSelectElement).value });
  }

  /** `openEditor('new')` is the Add path: no match, so the draft starts blank. */
  openEditor(id: string): void {
    this.fillDraft(this.materials().find((m) => m.id === id) ?? null);
    this.validationError.set(null);
    this.params.patch({ modal: 'edit-material', id });
  }

  closeEditor(): void {
    this.params.patch({ modal: null, id: null });
  }

  /** Client-side mirror of the server's material constraints. */
  async saveMaterial(): Promise<void> {
    if (!this.draftName().trim()) {
      this.validationError.set('Give the material a name customers will recognise.');
      return;
    }
    if (this.draftThickness() <= 0 || this.draftCost() < 0 || this.draftMultiplier() <= 0) {
      this.validationError.set('Thickness and multiplier must be greater than zero, and cost cannot be negative.');
      return;
    }

    const body: Omit<Material, 'id'> = {
      name: this.draftName().trim(),
      thicknessIn: this.draftThickness(),
      sheetWidthIn: this.draftWidth(),
      sheetHeightIn: this.draftHeight(),
      perSheetCostCents: Math.round(this.draftCost() * 100),
      costMultiplier: this.draftMultiplier(),
      active: this.editing()?.active ?? true,
    };

    try {
      const existing = this.editing();
      if (existing) await this.api.updateMaterial(existing.id, body);
      else await this.api.createMaterial(body);
      await this.load();
      this.validationError.set(null);
      this.closeEditor();
    } catch (error) {
      this.validationError.set(apiErrorMessage(error, 'That material could not be saved. Try again.'));
    }
  }

  async toggle(id: string): Promise<void> {
    const material = this.materials().find((m) => m.id === id);
    if (!material) return;
    try {
      await this.api.updateMaterial(id, { active: !material.active });
    } catch {
      /* the re-fetch below restores whatever the server actually holds */
    }
    await this.load();
  }
}
