import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ShippingMethod, centsToUsd } from '../core/models';

const RENAME_DEBOUNCE_MS = 500;

@Component({
  selector: 'app-business-shipping',
  standalone: true,
  templateUrl: './business-shipping.component.html',
  styleUrls: ['./admin.css', './business.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessShippingComponent implements OnDestroy {
  private readonly api = inject(ApiService);

  readonly methods = signal<ShippingMethod[]>([]);
  readonly money = centsToUsd;

  /** One pending rename per row, so typing does not fire a request per keystroke. */
  private readonly renameTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    void this.load();
  }

  ngOnDestroy(): void {
    for (const timer of this.renameTimers.values()) clearTimeout(timer);
    this.renameTimers.clear();
  }

  private async load(): Promise<void> {
    try {
      this.methods.set(await this.api.adminShipping());
    } catch {
      // Nothing configured that we can see; the template renders its own empty state.
      this.methods.set([]);
    }
  }

  async toggle(id: string): Promise<void> {
    const method = this.methods().find((m) => m.id === id);
    if (!method) return;
    try {
      await this.api.updateShipping(id, { active: !method.active });
    } catch {
      /* the re-fetch below restores whatever the server actually holds */
    }
    await this.load();
  }

  /** Optimistic locally so the caret never jumps; persisted on a short debounce. */
  rename(id: string, event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.methods.update((list) => list.map((m) => (m.id === id ? { ...m, name } : m)));

    const pending = this.renameTimers.get(id);
    if (pending) clearTimeout(pending);
    this.renameTimers.set(
      id,
      setTimeout(() => {
        this.renameTimers.delete(id);
        void this.persistName(id, name);
      }, RENAME_DEBOUNCE_MS),
    );
  }

  private async persistName(id: string, name: string): Promise<void> {
    try {
      await this.api.updateShipping(id, { name });
    } catch {
      // A rejected name (e.g. blank) leaves the server unchanged; resync the table.
      await this.load();
    }
  }

  async add(): Promise<void> {
    try {
      await this.api.createShipping({
        name: 'New shipping method',
        description: '',
        baseRateCents: 0,
        perSheetRateCents: 0,
        active: false,
        sortOrder: this.methods().length + 1,
      });
    } catch {
      /* nothing was created; the re-fetch below shows the unchanged list */
    }
    await this.load();
  }
}
