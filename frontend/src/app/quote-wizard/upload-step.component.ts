import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QuoteDraftService } from './quote-draft.service';
import { ApiService, apiErrorMessage } from '../core/api.service';

@Component({
  selector: 'app-upload-step',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './upload-step.component.html',
  styleUrl: './wizard-step.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadStepComponent {
  private readonly draft = inject(QuoteDraftService);
  private readonly api = inject(ApiService);

  readonly drawing = this.draft.drawing;

  /** Mirrors the admin `upload` settings document, fetched with the wizard config. */
  readonly maxUploadMb = computed(() =>
    Math.round((this.draft.maxUploadBytes() / 1024 / 1024) * 10) / 10,
  );
  readonly allowedExtensions = this.draft.allowedExtensions;

  readonly dragOver = signal(false);
  readonly uploading = signal(false);
  readonly progress = signal(0);
  readonly parseError = signal<string | null>(null);

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.upload(file);
  }

  /**
   * The dropzone is a `role="button"` div, not a file input, so the picker is opened
   * programmatically. Named for the handler the approved template binds to.
   */
  simulateUpload(): void {
    if (this.uploading()) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = this.allowedExtensions().join(',');
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void this.upload(file);
    });
    input.click();
  }

  private async upload(file: File): Promise<void> {
    if (this.uploading()) return;
    this.parseError.set(null);

    // Cheap client-side checks first, so an obviously wrong file never leaves the browser.
    const extension = file.name.includes('.')
      ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
      : '';
    if (!this.allowedExtensions().map((value) => value.toLowerCase()).includes(extension)) {
      this.parseError.set(`Only ${this.allowedExtensions().join(', ')} files can be quoted.`);
      return;
    }
    if (file.size > this.draft.maxUploadBytes()) {
      this.parseError.set(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${this.maxUploadMb()} MB.`,
      );
      return;
    }

    this.uploading.set(true);
    // Indeterminate progress: the parse dominates the round trip, so this reads as
    // activity rather than pretending to know the byte count.
    this.progress.set(10);
    const ticker = setInterval(
      () => this.progress.update((value) => Math.min(90, value + 10)),
      150,
    );
    try {
      const drawing = await this.api.uploadDrawing(file);
      this.progress.set(100);
      this.draft.setDrawing(drawing);
    } catch (error) {
      this.parseError.set(apiErrorMessage(error, 'That drawing could not be read.'));
    } finally {
      clearInterval(ticker);
      this.uploading.set(false);
    }
  }
}
