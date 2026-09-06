'use strict';
/**
 * Essential seed — platform-owned logins (Colossus accounts-v1 contract) PLUS the
 * operational configuration this app cannot function without.
 *
 * Runs with plain `node` from the production image (no ts-node/tsx): the deploy
 * pipeline's migrate Job executes `npx prisma migrate deploy && node prisma/seed/seed.js`.
 *
 * Part 1 — platform accounts (unchanged contract):
 * Input:  COLOSSUS_ACCOUNTS_JSON — injected into the pod env by Colossus at provision:
 *         [{"role":"ADMIN","email":"admin@demo.local","password":"…","login_path":"/login"}, …]
 * Effect: upserts one `colossus_accounts` row AND one `User` per account, hashing the
 *         password with bcryptjs exactly as the auth service verifies it. Idempotent —
 *         re-running re-asserts the hash so the platform-held password always logs in.
 * Output: one summary line, roles only. Never prints emails, passwords or hashes.
 * Failure: exits 1 when the env is missing/malformed or a contract role has no `Role`
 *          enum value — a silent no-op would leave the app with no working login.
 *
 * Part 2 — operational defaults (per .pipeline/tasks.md db_agent checklist):
 * The `pricing`/`machine`/`upload`/`business`/`payment` `SystemSetting` documents plus a
 * handful of active `Material` and `ShippingMethod` rows. This is NOT demo/business
 * fixture data (no customers, quotes, or orders are created) — it is the catalog and
 * configuration an admin would otherwise have to type in by hand before the app is
 * usable at all (no material to quote against, no shipping method to check out with).
 * Each insert is existence-checked first (settings: create-if-absent so an admin's
 * saved edits are never overwritten on redeploy; materials/shipping: create only when
 * the table is empty), so re-running this script is a no-op after the first seed.
 */
const { PrismaClient, Role } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const ACCOUNTS_ENV = 'COLOSSUS_ACCOUNTS_JSON';
const BCRYPT_ROUNDS = 10;
const DEFAULT_LOGIN_PATH = '/login';
const REQUIRED_FIELDS = ['role', 'email', 'password'];
const SETTINGS_DOC_PREFIX = 'doc.';

// Mirrors backend/src/settings/settings.defaults.ts DEFAULTS. Kept in sync manually —
// this plain-JS seed cannot import the TS module at runtime (no ts-node in the prod image).
const DEFAULT_SETTINGS_DOCS = {
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

const SAMPLE_MATERIALS = [
  { name: 'Mild Steel', thicknessIn: 0.0625, sheetWidthIn: 48, sheetHeightIn: 96, perSheetCostCents: 8500, costMultiplier: 1 },
  { name: 'Stainless Steel 304', thicknessIn: 0.0625, sheetWidthIn: 48, sheetHeightIn: 96, perSheetCostCents: 15500, costMultiplier: 1.4 },
  { name: 'Aluminum 5052', thicknessIn: 0.125, sheetWidthIn: 48, sheetHeightIn: 96, perSheetCostCents: 11000, costMultiplier: 1.15 },
  { name: 'Galvanized Steel', thicknessIn: 0.075, sheetWidthIn: 48, sheetHeightIn: 96, perSheetCostCents: 9200, costMultiplier: 1.05 },
];

const SAMPLE_SHIPPING_METHODS = [
  { name: 'Standard Ground', description: 'Delivered in 5-7 business days', baseRateCents: 1500, perSheetRateCents: 200, sortOrder: 0 },
  { name: 'Expedited', description: 'Delivered in 2-3 business days', baseRateCents: 3500, perSheetRateCents: 400, sortOrder: 1 },
  { name: 'Freight (LTL)', description: 'For large multi-sheet orders, 7-10 business days', baseRateCents: 6000, perSheetRateCents: 150, sortOrder: 2 },
];

const prisma = new PrismaClient();

/** Parse and validate the platform accounts from the environment; throws a value-free error. */
function readPlatformAccounts(env) {
  const raw = env[ACCOUNTS_ENV];
  if (!raw || !raw.trim()) {
    throw new Error(`${ACCOUNTS_ENV} is not set — Colossus injects it at provision; nothing to seed`);
  }
  let accounts;
  try {
    accounts = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${ACCOUNTS_ENV} is not valid JSON (${error.message})`);
  }
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error(`${ACCOUNTS_ENV} must be a non-empty JSON array of accounts`);
  }
  accounts.forEach((account, index) => {
    for (const field of REQUIRED_FIELDS) {
      if (typeof account[field] !== 'string' || account[field] === '') {
        throw new Error(`${ACCOUNTS_ENV}[${index}] is missing field "${field}"`);
      }
    }
  });
  return accounts;
}

/** Map a contract role (any case) onto the app's Prisma `Role` enum, or throw listing the known ones. */
function resolveAppRole(contractRole) {
  const known = Object.values(Role);
  const match = known.find((value) => value.toUpperCase() === contractRole.toUpperCase());
  if (!match) {
    throw new Error(`contract role "${contractRole}" has no Role enum value (known: ${known.join(', ')})`);
  }
  return match;
}

/** Upsert the colossus_accounts row and the matching User for one platform account. */
async function upsertAccount(account) {
  const role = resolveAppRole(account.role);
  const passwordHash = await bcrypt.hash(account.password, BCRYPT_ROUNDS);
  const loginPath = account.login_path || DEFAULT_LOGIN_PATH;
  await prisma.colossusAccount.upsert({
    where: { email: account.email },
    update: { role: account.role, passwordHash, loginPath },
    create: { role: account.role, email: account.email, passwordHash, loginPath },
  });
  await prisma.user.upsert({
    where: { email: account.email },
    update: { role, passwordHash },
    create: { email: account.email, name: `${role} (Colossus)`, role, passwordHash },
  });
  return role;
}

/** Create-if-absent each settings document so first boot is usable but admin edits are never clobbered. */
async function seedDefaultSettings() {
  let created = 0;
  for (const [name, doc] of Object.entries(DEFAULT_SETTINGS_DOCS)) {
    const key = `${SETTINGS_DOC_PREFIX}${name}`;
    const existing = await prisma.systemSetting.findUnique({ where: { key } });
    if (existing) continue;
    await prisma.systemSetting.create({
      data: { key, value: JSON.stringify(doc), secret: name === 'payment' },
    });
    created += 1;
  }
  return created;
}

/** Only seeds sample materials when the table is completely empty (first boot). */
async function seedSampleMaterials() {
  const count = await prisma.material.count();
  if (count > 0) return 0;
  await prisma.material.createMany({ data: SAMPLE_MATERIALS });
  return SAMPLE_MATERIALS.length;
}

/** Only seeds sample shipping methods when the table is completely empty (first boot). */
async function seedSampleShippingMethods() {
  const count = await prisma.shippingMethod.count();
  if (count > 0) return 0;
  await prisma.shippingMethod.createMany({ data: SAMPLE_SHIPPING_METHODS });
  return SAMPLE_SHIPPING_METHODS.length;
}

async function main() {
  const accounts = readPlatformAccounts(process.env);
  const roles = [];
  for (const account of accounts) {
    roles.push(await upsertAccount(account));
  }
  console.log(`[seed] colossus_accounts upserted ${roles.length} (roles: ${roles.join(', ')})`);

  const settingsCreated = await seedDefaultSettings();
  console.log(`[seed] settings documents created ${settingsCreated}/${Object.keys(DEFAULT_SETTINGS_DOCS).length} (existing ones left untouched)`);

  const materialsCreated = await seedSampleMaterials();
  console.log(`[seed] materials created ${materialsCreated}`);

  const shippingCreated = await seedSampleShippingMethods();
  console.log(`[seed] shipping methods created ${shippingCreated}`);
}

main()
  .catch((error) => {
    console.error(`[seed] failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
