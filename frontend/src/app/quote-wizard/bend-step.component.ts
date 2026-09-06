import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BendEditorComponent } from '../shared/bend-editor/bend-editor.component';
import { centsToUsd } from '../core/models';
import { QuoteDraftService } from './quote-draft.service';

@Component({
  selector: 'app-bend-step',
  standalone: true,
  imports: [RouterLink, BendEditorComponent],
  templateUrl: './bend-step.component.html',
  styleUrl: './wizard-step.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BendStepComponent {
  private readonly draft = inject(QuoteDraftService);

  /** Two-way with the editor; the draft service persists each change to the server. */
  readonly bends = this.draft.bends;
  readonly quantity = this.draft.quantity;
  readonly costPerBendCents = this.draft.costPerBendCents;
  readonly money = centsToUsd;

  readonly polylines = computed(() => this.draft.drawing()?.polylines ?? []);
  readonly partWidthIn = computed(() => this.draft.drawing()?.bboxWIn ?? 1);
  readonly partHeightIn = computed(() => this.draft.drawing()?.bboxHIn ?? 1);
}
