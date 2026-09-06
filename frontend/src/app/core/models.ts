/** Shared view models. Mirrors the backend contract described in the plan. */

export type Role = 'USER' | 'MANAGER' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

export interface Material {
  id: string;
  name: string;
  thicknessIn: number;
  sheetWidthIn: number;
  sheetHeightIn: number;
  perSheetCostCents: number;
  costMultiplier: number;
  active: boolean;
}

export interface ShippingMethod {
  id: string;
  name: string;
  description: string;
  baseRateCents: number;
  perSheetRateCents: number;
  active: boolean;
  sortOrder: number;
}

export interface BendLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  angleDeg: number;
  direction: 'up' | 'down';
}

export interface Drawing {
  id: string;
  filename: string;
  sizeBytes: number;
  detectedUnits: string;
  bboxWIn: number;
  bboxHIn: number;
  cutLengthIn: number;
  /** Flattened polylines in inches, part-local coordinates. */
  polylines: number[][];
  entityCount: number;
}

export interface Placement {
  sheet: number;
  x: number;
  y: number;
}

export interface NestingResult {
  sheetWidthIn: number;
  sheetHeightIn: number;
  marginIn: number;
  spacingIn: number;
  cols: number;
  rows: number;
  perSheet: number;
  sheetCount: number;
  utilization: number;
  placements: Placement[];
}

export interface BreakdownLine {
  key: string;
  label: string;
  detail: string;
  amountCents: number;
}

export interface Breakdown {
  lines: BreakdownLine[];
  subtotalCents: number;
  minimumOrderCents: number;
  minimumOrderApplied: boolean;
  totalCents: number;
}

export type QuoteStatus = 'draft' | 'ready' | 'ordered' | 'expired';

export interface Quote {
  id: string;
  reference: string;
  materialName: string;
  materialId: string;
  filename: string;
  quantity: number;
  cutLengthIn: number;
  bendCount: number;
  sheetCount: number;
  utilization: number;
  totalCents: number;
  status: QuoteStatus;
  createdAt: string;
}

export type OrderStatus = 'paid' | 'in_production' | 'shipped' | 'cancelled';

export interface Order {
  id: string;
  orderNumber: string;
  confirmationNumber: string;
  customerName: string;
  quoteReference: string;
  materialName: string;
  quantity: number;
  shippingMethod: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  status: OrderStatus;
  placedAt: string;
}

export interface IntegrationStatus {
  id: string;
  name: string;
  kind: 'backing service' | 'integration';
  envKeys: string[];
  maskedValue: string | null;
  configured: boolean;
  description: string;
}

export const centsToUsd = (cents: number): string =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
