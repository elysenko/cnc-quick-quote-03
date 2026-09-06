import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { IntegrationStatus } from '../core/models';
import { ApiService } from '../core/api.service';

const SAVED_NOTE_MS = 2500;

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  templateUrl: './admin-settings.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettingsComponent implements OnDestroy {
  private readonly api = inject(ApiService);

  /** Both lists come from GET /api/admin/services — the catalogue lives on the server. */
  readonly services = signal<IntegrationStatus[]>([]);
  readonly integrations = signal<IntegrationStatus[]>([]);
  readonly savedId = signal<string | null>(null);

  private savedTimer: ReturnType<typeof setTimeout> | null = null;

  readonly unconfigured = computed(() =>
    [...this.services(), ...this.integrations()].filter((item) => !item.configured),
  );

  readonly unconfiguredNames = computed(() =>
    this.unconfigured()
      .map((item) => item.name)
      .join(', '),
  );

  constructor() {
    void this.load();
  }

  ngOnDestroy(): void {
    if (this.savedTimer) clearTimeout(this.savedTimer);
  }

  private async load(): Promise<void> {
    try {
      const catalogue = await this.api.adminServices();
      this.services.set(catalogue.services);
      this.integrations.set(catalogue.integrations);
    } catch {
      // An unreachable catalogue leaves both lists empty rather than inventing rows.
      this.services.set([]);
      this.integrations.set([]);
    }
  }

  /**
   * The credential inputs are uncontrolled by design (the template binds no ngModel, so
   * a stored secret is never echoed into a value attribute), so the typed value is read
   * straight off the DOM node the row rendered.
   */
  async save(id: string): Promise<void> {
    const row = [...this.services(), ...this.integrations()].find((item) => item.id === id);
    const envKey = row?.envKeys[0];
    if (!envKey) return;

    const input = document.getElementById(`input-${id}`) as HTMLInputElement | null;
    const value = (input?.value ?? '').trim();
    if (!value) return;

    try {
      await this.api.saveCredentials({ [envKey]: value });
    } catch {
      return; // Leave the badge alone; the value was not stored.
    }

    if (input) input.value = '';
    await this.load();

    this.savedId.set(id);
    if (this.savedTimer) clearTimeout(this.savedTimer);
    this.savedTimer = setTimeout(() => this.savedId.set(null), SAVED_NOTE_MS);
  }
}
