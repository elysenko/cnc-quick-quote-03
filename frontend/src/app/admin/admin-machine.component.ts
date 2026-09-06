import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QuoteDraftService } from '../quote-wizard/quote-draft.service';
import { ApiService, MachineDoc, UploadDoc, apiErrorMessage } from '../core/api.service';

const SAVED_NOTE_MS = 2500;
const BYTES_PER_MB = 1024 * 1024;

@Component({
  selector: 'app-admin-machine',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-machine.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMachineComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly draft = inject(QuoteDraftService);

  readonly bedWidth = signal(0);
  readonly bedHeight = signal(0);
  readonly margin = signal(0);
  readonly spacing = signal(0);
  readonly quantityMin = signal(1);
  readonly quantityMax = signal(1);
  readonly maxUploadMb = signal(0);
  readonly extensions = signal('');

  readonly saved = signal(false);
  readonly error = signal<string | null>(null);

  private savedTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.load();
  }

  ngOnDestroy(): void {
    if (this.savedTimer) clearTimeout(this.savedTimer);
  }

  private async load(): Promise<void> {
    try {
      const [machine, upload] = await Promise.all([
        this.api.settingsDoc<MachineDoc>('machine'),
        this.api.settingsDoc<UploadDoc>('upload'),
      ]);
      this.bedWidth.set(machine.bedWidthIn);
      this.bedHeight.set(machine.bedHeightIn);
      this.margin.set(machine.marginIn);
      this.spacing.set(machine.spacingIn);
      this.quantityMin.set(machine.quantityMin);
      this.quantityMax.set(machine.quantityMax);
      this.maxUploadMb.set(upload.maxUploadBytes / BYTES_PER_MB);
      this.extensions.set(upload.allowedExtensions.join(', '));
      this.error.set(null);
    } catch (error) {
      this.error.set(
        apiErrorMessage(error, 'Could not load the machine and upload settings. Reload to try again.'),
      );
    }
  }

  async save(): Promise<void> {
    if (this.quantityMin() < 1 || this.quantityMax() <= this.quantityMin()) {
      this.error.set('Maximum quantity must be greater than the minimum, and the minimum at least 1.');
      this.saved.set(false);
      return;
    }
    if (this.bedWidth() <= 0 || this.bedHeight() <= 0 || this.margin() < 0 || this.spacing() < 0) {
      this.error.set('Bed dimensions must be positive; margin and spacing cannot be negative.');
      this.saved.set(false);
      return;
    }
    const allowedExtensions = this.parsedExtensions();
    if (this.maxUploadMb() <= 0 || allowedExtensions.length === 0) {
      this.error.set('Set an upload size above zero and at least one allowed extension.');
      this.saved.set(false);
      return;
    }

    const machine: MachineDoc = {
      bedWidthIn: this.bedWidth(),
      bedHeightIn: this.bedHeight(),
      marginIn: this.margin(),
      spacingIn: this.spacing(),
      quantityMin: this.quantityMin(),
      quantityMax: this.quantityMax(),
    };
    const upload: UploadDoc = {
      maxUploadBytes: Math.round(this.maxUploadMb() * BYTES_PER_MB),
      allowedExtensions,
    };

    try {
      await this.api.saveSettingsDoc<MachineDoc>('machine', machine);
      await this.api.saveSettingsDoc<UploadDoc>('upload', upload);
    } catch (error) {
      this.saved.set(false);
      this.error.set(apiErrorMessage(error, 'Those settings could not be saved. Try again.'));
      return;
    }

    this.error.set(null);
    // The wizard mirrors these documents, so pull the new bed and limits straight away.
    await this.draft.loadConfig();
    this.saved.set(true);
    if (this.savedTimer) clearTimeout(this.savedTimer);
    this.savedTimer = setTimeout(() => this.saved.set(false), SAVED_NOTE_MS);
  }

  /** "dxf, .DWG " → [".dxf", ".DWG"] — comma separated, trimmed, dot-prefixed. */
  private parsedExtensions(): string[] {
    return this.extensions()
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => (entry.startsWith('.') ? entry : `.${entry}`));
  }
}
