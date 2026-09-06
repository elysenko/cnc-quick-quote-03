import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/guards';
import { quoteDetailResolver } from './quote-detail/quote-detail.resolver';

/**
 * Every screen has its own deep-linkable route. Panels, modals, paging and sorting
 * are query params (see QueryParamStateService) so a reload restores them exactly.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'quotes' },

  // --- public ---
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    loadComponent: () => import('./signup/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'forbidden',
    loadComponent: () =>
      import('./forbidden/forbidden.component').then((m) => m.ForbiddenComponent),
  },

  // --- quote wizard ---
  {
    path: 'quote/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./quote-wizard/quote-wizard.component').then((m) => m.QuoteWizardComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'upload' },
      {
        path: 'upload',
        loadComponent: () =>
          import('./quote-wizard/upload-step.component').then((m) => m.UploadStepComponent),
      },
      {
        path: 'material',
        loadComponent: () =>
          import('./quote-wizard/material-step.component').then((m) => m.MaterialStepComponent),
      },
      {
        path: 'bends',
        loadComponent: () =>
          import('./quote-wizard/bend-step.component').then((m) => m.BendStepComponent),
      },
      {
        path: 'review',
        loadComponent: () =>
          import('./quote-wizard/review-step.component').then((m) => m.ReviewStepComponent),
      },
    ],
  },

  // --- quotes ---
  {
    path: 'quotes',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./quotes-list/quotes-list.component').then((m) => m.QuotesListComponent),
  },
  {
    // The detail template has no loading branch, so the quote is resolved before the
    // route activates and bound straight to the component's `detail` input.
    path: 'quotes/:id',
    canActivate: [authGuard],
    resolve: { detail: quoteDetailResolver },
    loadComponent: () =>
      import('./quote-detail/quote-detail.component').then((m) => m.QuoteDetailComponent),
  },

  // --- checkout ---
  {
    path: 'checkout/:quoteId/review',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./checkout/checkout-review.component').then((m) => m.CheckoutReviewComponent),
  },
  {
    path: 'checkout/:quoteId/shipping',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./checkout/checkout-shipping.component').then((m) => m.CheckoutShippingComponent),
  },
  {
    path: 'order/confirmation/:orderId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./checkout/order-confirmation.component').then((m) => m.OrderConfirmationComponent),
  },

  // --- account ---
  {
    path: 'orders',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./orders-list/orders-list.component').then((m) => m.OrdersListComponent),
  },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () => import('./account/account.component').then((m) => m.AccountComponent),
  },

  // --- admin ---
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./admin/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'settings' },
      {
        path: 'settings',
        loadComponent: () =>
          import('./admin/admin-settings.component').then((m) => m.AdminSettingsComponent),
      },
      {
        path: 'materials',
        loadComponent: () =>
          import('./admin/admin-materials.component').then((m) => m.AdminMaterialsComponent),
      },
      {
        path: 'pricing',
        loadComponent: () =>
          import('./admin/admin-pricing.component').then((m) => m.AdminPricingComponent),
      },
      {
        path: 'machine',
        loadComponent: () =>
          import('./admin/admin-machine.component').then((m) => m.AdminMachineComponent),
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./admin/admin-orders.component').then((m) => m.AdminOrdersComponent),
      },
      {
        path: 'business',
        loadComponent: () =>
          import('./admin/admin-business.component').then((m) => m.AdminBusinessComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'branding' },
          {
            path: 'branding',
            loadComponent: () =>
              import('./admin/business-branding.component').then((m) => m.BusinessBrandingComponent),
          },
          {
            path: 'contact',
            loadComponent: () =>
              import('./admin/business-contact.component').then((m) => m.BusinessContactComponent),
          },
          {
            path: 'payment',
            loadComponent: () =>
              import('./admin/business-payment.component').then((m) => m.BusinessPaymentComponent),
          },
          {
            path: 'shipping',
            loadComponent: () =>
              import('./admin/business-shipping.component').then((m) => m.BusinessShippingComponent),
          },
        ],
      },
    ],
  },

  { path: '**', redirectTo: 'quotes' },
];
