/**
 * Built-in defaults for the five configuration documents.
 *
 * These are configuration, not seeded data: a document row only exists once an
 * administrator saves one, and every read merges the stored document over these
 * values. That keeps the app usable on a cold database with no fixture rows.
 */
export interface PricingDoc {
  setupFeeCents: number;
  costPerLinearFootCents: number;
  costPerBendCents: number;
  handlingFeeCents: number;
  minimumOrderCents: number;
}

export interface MachineDoc {
  bedWidthIn: number;
  bedHeightIn: number;
  marginIn: number;
  spacingIn: number;
  quantityMin: number;
  quantityMax: number;
}

export interface UploadDoc {
  maxUploadBytes: number;
  allowedExtensions: string[];
}

export interface BusinessDoc {
  companyName: string;
  tagline: string;
  logoInitials: string;
  primaryColor: string;
  accentColor: string;
  contactEmail: string;
  contactPhone: string;
  contactHours: string;
  contactAddress: string;
}

export interface PaymentDoc {
  sandbox: boolean;
  publishableKey: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
}

export interface SettingsDocs {
  pricing: PricingDoc;
  machine: MachineDoc;
  upload: UploadDoc;
  business: BusinessDoc;
  payment: PaymentDoc;
}

export type DocName = keyof SettingsDocs;

export const DOC_NAMES: DocName[] = ['pricing', 'machine', 'upload', 'business', 'payment'];

/** Keys inside the payment document that are encrypted at rest and masked on read. */
export const PAYMENT_SECRET_FIELDS = ['stripeSecretKey', 'stripeWebhookSecret'] as const;

export const DEFAULTS: SettingsDocs = {
  pricing: {
    setupFeeCents: 3500,
    costPerLinearFootCents: 185,
    costPerBendCents: 125,
    handlingFeeCents: 1200,
    minimumOrderCents: 7500,
  },
  machine: {
    bedWidthIn: 60,
    bedHeightIn: 36,
    marginIn: 0.5,
    spacingIn: 0.25,
    quantityMin: 1,
    quantityMax: 500,
  },
  upload: {
    maxUploadBytes: 12 * 1024 * 1024,
    allowedExtensions: ['.dxf'],
  },
  business: {
    companyName: 'Fieldworks Fabrication',
    tagline: 'CNC laser cutting, quoted instantly',
    logoInitials: 'FF',
    primaryColor: '#1d4ed8',
    accentColor: '#ea580c',
    contactEmail: '',
    contactPhone: '',
    contactHours: '',
    contactAddress: '',
  },
  payment: {
    sandbox: true,
    publishableKey: '',
    stripeSecretKey: '',
    stripeWebhookSecret: '',
  },
};
