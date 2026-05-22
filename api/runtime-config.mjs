/**
 * Build public browser config from environment variables (.env locally, Vercel dashboard in production).
 */
export function buildRuntimeConfig(env = process.env) {
  const vercelHost = String(env.VERCEL_URL || '').trim()
  const site =
    String(env.DYNA_SITE_URL || env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '') ||
    (vercelHost ? `https://${vercelHost}` : '')

  const token = String(env.BAKONG_TOKEN || env.DYNA_BAKONG_TOKEN || '').trim()
  const email = String(env.BAKONG_EMAIL || env.DYNA_BAKONG_EMAIL || '').trim()
  const registerToken = String(
    env.BAKONG_REGISTER_TOKEN || env.DYNA_BAKONG_REGISTER_TOKEN || '',
  ).trim()
  const account = String(env.BAKONG_ACCOUNT || env.DYNA_BAKONG_ACCOUNT || '').trim()

  const payload = {
    siteUrl: site || undefined,
    apiBase: site || undefined,
    paymentCheckUrl: site ? `${site}/api/check-md5` : undefined,
    webhookUrl: site ? `${site}/api/webhook` : undefined,
    healthUrl: site ? `${site}/api/health` : undefined,
    email: email || undefined,
    registerToken: registerToken.startsWith('rbk') ? registerToken : undefined,
    token: token.startsWith('eyJ') ? token : undefined,
    account: account || undefined,
    organization: env.BAKONG_ORG || env.DYNA_BAKONG_ORG || 'Dyna Store',
    project: env.BAKONG_PROJECT || env.DYNA_BAKONG_PROJECT || 'dyna_store',
    proxy: '',
    hosted: Boolean(site || vercelHost),
  }

  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined) delete payload[k]
  })

  return payload
}

export function runtimeConfigJs(env = process.env) {
  return `window.DYNA_RUNTIME_CONFIG = ${JSON.stringify(buildRuntimeConfig(env))};\n`
}
