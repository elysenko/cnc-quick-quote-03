import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { IntegrationStatus } from '../core/models';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  templateUrl: './admin-settings.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettingsComponent {
  readonly services = signal<IntegrationStatus[]>([
    { id: 'postgresql-svc', name: 'PostgreSQL', kind: 'backing service', envKeys: ['DATABASE_URL', 'POSTGRESQL_API_KEY'], maskedValue: 'postgres://app:••••@app-db:5432/cnc', configured: true, description: 'Primary datastore for users, drawings, quotes and orders.' },
    { id: 'minio-svc', name: 'MinIO', kind: 'backing service', envKeys: ['MINIO_ENDPOINT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY'], maskedValue: null, configured: false, description: 'Object storage bucket "drawings" holding every uploaded DXF.' },
  ]);

  readonly integrations = signal<IntegrationStatus[]>([
    { id: 'minio-boto3', name: 'MinIO via boto3 (S3 API)', kind: 'integration', envKeys: ['MINIO_VIA_BOTO3_S3_API_API_KEY'], maskedValue: null, configured: false, description: 'S3-compatible client used to store and retrieve CAD drawings.' },
    { id: 'postgresql', name: 'PostgreSQL', kind: 'integration', envKeys: ['POSTGRESQL_API_KEY'], maskedValue: 'postgres://app:••••4f2a', configured: true, description: 'Connection health probe backing /api/health/deep.' },
    { id: 'redis', name: 'Redis', kind: 'integration', envKeys: ['REDIS_URL', 'REDIS_API_KEY'], maskedValue: null, configured: false, description: 'Rate-limit counters and the refresh-token revocation denylist.' },
    { id: 'resend', name: 'Resend Python SDK', kind: 'integration', envKeys: ['RESEND_PYTHON_SDK_API_KEY'], maskedValue: null, configured: false, description: 'Transactional order-confirmation email with receipt.' },
    { id: 'stripe', name: 'Stripe SDK (Python) + Stripe Checkout', kind: 'integration', envKeys: ['STRIPE_SDK_PYTHON_STRIPE_CHECKOUT_API_KEY'], maskedValue: null, configured: false, description: 'Hosted card payment and signature-verified webhooks.' },
    { id: 'ezdxf', name: 'ezdxf', kind: 'integration', envKeys: ['EZDXF_API_KEY'], maskedValue: null, configured: false, description: 'DXF geometry parsing — an in-process library, listed here for configuration parity.' },
  ]);

  readonly savedId = signal<string | null>(null);

  readonly unconfigured = computed(() =>
    [...this.services(), ...this.integrations()].filter((item) => !item.configured),
  );

  readonly unconfiguredNames = computed(() =>
    this.unconfigured()
      .map((item) => item.name)
      .join(', '),
  );

  save(id: string): void {
    this.savedId.set(id);
    setTimeout(() => this.savedId.set(null), 2500);
  }
}
