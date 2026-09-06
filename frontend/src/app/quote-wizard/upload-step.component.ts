import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QuoteDraftService } from './quote-draft.service';

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

  readonly drawing = this.draft.drawing;

  /** Mirrors the admin `upload` settings document. */
  readonly maxUploadMb = signal(12);
  readonly allowedExtensions = signal<string[]>(['.dxf']);

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
    this.simulateUpload();
  }

  /** Preview stand-in for the multipart POST /api/drawings round trip. */
  simulateUpload(): void {
    if (this.uploading()) return;
    this.parseError.set(null);
    this.uploading.set(true);
    this.progress.set(0);
    const timer = setInterval(() => {
      this.progress.update((value) => Math.min(100, value + 20));
      if (this.progress() >= 100) {
        clearInterval(timer);
        this.uploading.set(false);
      }
    }, 120);
  }
}
