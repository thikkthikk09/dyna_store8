/**
 * Static defaults only — no secrets here (use .env locally or Vercel env in production).
 *
 * Load order:
 *   1. GET /api/env-config  → window.DYNA_RUNTIME_CONFIG (from .env or Vercel)
 *   2. This file            → window.DYNA_BAKONG_CONFIG (safe defaults)
 *   3. bakong.config.local.js (gitignored, optional local overrides)
 *
 * On Vercel, payment uses same-origin URLs on the current hostname:
 *   /api/check-md5, /api/webhook, /api/health
 */
window.DYNA_BAKONG_CONFIG = {
  /** Filled by DYNA_SITE_URL — leave empty on Vercel (uses location.origin). */
  apiBase: '',
  proxy: '',
  /** Merchant Bakong ID shown in QR (not a secret). Override with BAKONG_ACCOUNT in .env. */
  account: 'ben_sothida@bkrt',
  organization: 'Dyna Store',
  project: 'dyna_store',
  email: 'thikkthikk09@gmail.com',
  registerToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiMWJkOTRjMDY2ODViNGIwMiJ9LCJpYXQiOjE3Nzk0NDg5MDgsImV4cCI6MTc4NzIyNDkwOH0.YE6b6OeaKlqiTVWR2-5fM2_NouOzGVHNoESKmNDXuJg',
  token: 'rbk82qAU7sFjn7CG2mAP-CA0_mKVz_RNVRcNlA60b3oNkY',
}
