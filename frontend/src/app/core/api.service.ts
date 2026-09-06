import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  AuthUser,
  BendLine,
  Drawing,
  IntegrationStatus,
  Material,
  Order,
  Quote,
  QuoteDetail,
  ShippingOption,
} from './models';

const BASE = '/api';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

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

export interface PaymentDocMasked {
  sandbox: boolean;
  publishableKey: string;
  stripeSecretKeyMasked: string | null;
  stripeWebhookSecretMasked: string | null;
}

export interface AccountProfile {
  id: string;
  email: string;
  name: string;
  company: string;
  role: string;
  createdAt: string;
}

export interface AccountStats {
  quoteCount: number;
  orderCount: number;
  lifetimeSpendCents: number;
}

/** Pulls the human-readable message the API sent, falling back to a plain sentence. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { message?: string | string[] } | string | null;
    if (typeof body === 'string' && body) return body;
    if (body && typeof body === 'object' && body.message) {
      return Array.isArray(body.message) ? body.message.join(' ') : body.message;
    }
    if (error.status === 0) return 'Could not reach the server. Check your connection and try again.';
  }
  return fallback;
}

export function apiErrorStatus(error: unknown): number {
  return error instanceof HttpErrorResponse ? error.status : 0;
}

/**
 * Every backend call the app makes, in one typed place.
 *
 * The access token and the 401 → refresh → retry dance live in authInterceptor, so
 * nothing here has to think about sessions.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  private get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(`${BASE}${path}`));
  }

  private post<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(`${BASE}${path}`, body));
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(`${BASE}${path}`, body));
  }

  private put<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(`${BASE}${path}`, body));
  }

  private delete<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>(`${BASE}${path}`));
  }

  // ---- auth --------------------------------------------------------------

  login(email: string, password: string): Promise<AuthResponse> {
    return this.post<AuthResponse>('/auth/login', { email, password });
  }

  register(name: string, email: string, password: string): Promise<AuthResponse> {
    return this.post<AuthResponse>('/auth/register', { name, email, password });
  }

  logout(refreshToken: string | null): Promise<{ ok: true }> {
    return this.post<{ ok: true }>('/auth/logout', { refreshToken });
  }

  me(): Promise<AuthUser> {
    return this.get<AuthUser>('/auth/me');
  }

  // ---- branding ----------------------------------------------------------

  publicBusiness(): Promise<Partial<BusinessDoc>> {
    return this.get<Partial<BusinessDoc>>('/settings/public-business');
  }

  /** Machine, upload and pricing config — the same documents the server prices with. */
  wizardConfig(): Promise<{ machine: MachineDoc; upload: UploadDoc; pricing: PricingDoc }> {
    return this.get('/settings/config');
  }

  // ---- drawings and bends ------------------------------------------------

  uploadDrawing(file: File): Promise<Drawing> {
    const form = new FormData();
    form.append('file', file, file.name);
    return firstValueFrom(this.http.post<Drawing>(`${BASE}/drawings`, form));
  }

  drawing(id: string): Promise<Drawing> {
    return this.get<Drawing>(`/drawings/${id}`);
  }

  bends(drawingId: string): Promise<BendLine[]> {
    return this.get<BendLine[]>(`/drawings/${drawingId}/bends`);
  }

  createBend(drawingId: string, bend: Omit<BendLine, 'id'>): Promise<BendLine> {
    return this.post<BendLine>(`/drawings/${drawingId}/bends`, bend);
  }

  updateBend(id: string, bend: Partial<Omit<BendLine, 'id'>>): Promise<BendLine> {
    return this.patch<BendLine>(`/bends/${id}`, bend);
  }

  deleteBend(id: string): Promise<{ ok: true }> {
    return this.delete<{ ok: true }>(`/bends/${id}`);
  }

  // ---- materials and quotes ----------------------------------------------

  materials(): Promise<Material[]> {
    return this.get<Material[]>('/materials');
  }

  createQuote(drawingId: string, materialId: string, quantity: number): Promise<QuoteDetail> {
    return this.post<QuoteDetail>('/quotes', { drawingId, materialId, quantity });
  }

  quotes(): Promise<Quote[]> {
    return this.get<Quote[]>('/quotes');
  }

  quote(id: string): Promise<QuoteDetail> {
    return this.get<QuoteDetail>(`/quotes/${id}`);
  }

  // ---- checkout and orders -----------------------------------------------

  checkoutReview(quoteId: string): Promise<{
    quoteId: string;
    reference: string;
    filename: string;
    materialName: string;
    quantity: number;
    bendCount: number;
    sheetCount: number;
    totalCents: number;
  }> {
    return this.get(`/checkout/${quoteId}/review`);
  }

  shippingOptions(quoteId: string): Promise<ShippingOption[]> {
    return this.get<ShippingOption[]>(`/checkout/${quoteId}/shipping-methods`);
  }

  createCheckoutSession(
    quoteId: string,
    body: {
      shippingMethodId: string;
      recipient: string;
      line1: string;
      city: string;
      state: string;
      zip: string;
    },
  ): Promise<{ url: string; sessionId: string }> {
    return this.post(`/checkout/${quoteId}/session`, body);
  }

  reconcile(sessionId: string): Promise<Order> {
    return this.post<Order>(`/checkout/reconcile/${sessionId}`);
  }

  orders(): Promise<Order[]> {
    return this.get<Order[]>('/orders');
  }

  order(id: string): Promise<Order> {
    return this.get<Order>(`/orders/${id}`);
  }

  receiptUrl(id: string): string {
    return `${BASE}/orders/${id}/receipt`;
  }

  receiptHtml(id: string): Promise<string> {
    return firstValueFrom(
      this.http.get(`${BASE}/orders/${id}/receipt`, { responseType: 'text' }),
    );
  }

  // ---- account -----------------------------------------------------------

  accountProfile(): Promise<AccountProfile> {
    return this.get<AccountProfile>('/account');
  }

  updateAccount(patch: { name?: string; company?: string }): Promise<AccountProfile> {
    return this.patch<AccountProfile>('/account', patch);
  }

  accountStats(): Promise<AccountStats> {
    return this.get<AccountStats>('/account/stats');
  }

  // ---- admin -------------------------------------------------------------

  settingsDoc<T>(doc: string): Promise<T> {
    return this.get<T>(`/admin/settings/${doc}`);
  }

  saveSettingsDoc<T>(doc: string, body: unknown): Promise<T> {
    return this.put<T>(`/admin/settings/${doc}`, body);
  }

  adminMaterials(): Promise<Material[]> {
    return this.get<Material[]>('/admin/materials');
  }

  createMaterial(body: Omit<Material, 'id'>): Promise<Material> {
    return this.post<Material>('/admin/materials', body);
  }

  updateMaterial(id: string, body: Partial<Omit<Material, 'id'>>): Promise<Material> {
    return this.patch<Material>(`/admin/materials/${id}`, body);
  }

  adminShipping(): Promise<ShippingOption[]> {
    return this.get<ShippingOption[]>('/admin/shipping-methods');
  }

  createShipping(body: Partial<ShippingOption>): Promise<ShippingOption> {
    return this.post<ShippingOption>('/admin/shipping-methods', body);
  }

  updateShipping(id: string, body: Partial<ShippingOption>): Promise<ShippingOption> {
    return this.patch<ShippingOption>(`/admin/shipping-methods/${id}`, body);
  }

  adminOrders(): Promise<Order[]> {
    return this.get<Order[]>('/admin/orders');
  }

  adminServices(): Promise<{ services: IntegrationStatus[]; integrations: IntegrationStatus[] }> {
    return this.get('/admin/services');
  }

  saveCredentials(body: Record<string, string>): Promise<{ ok: true }> {
    return this.patch<{ ok: true }>('/admin/services', body);
  }
}
