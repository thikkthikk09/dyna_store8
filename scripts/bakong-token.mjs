/**
 * Renew Bakong API JWT.
 * Usage: node scripts/bakong-token.mjs your@email.com
 * Uses registerToken from standalone/bakong.config.js or bakong.config.local.js if present.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

function readConfigText() {
  for (const name of ['bakong.config.local.js', 'bakong.config.js']) {
    const p = path.join(ROOT, 'standalone', name)
    try {
      return fs.readFileSync(p, 'utf8')
    } catch {
      /* try next */
    }
  }
  return ''
}

function pick(key) {
  const m = readConfigText().match(new RegExp(`${key}:\\s*['"]([^'"]*)['"]`))
  return m?.[1]?.trim() || ''
}

const email = (process.argv[2] || pick('email')).trim()
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/bakong-token.mjs your@registered-email.com')
  process.exit(1)
}

const registerToken = pick('registerToken')
const body = {
  email,
  organization: pick('organization') || 'Dyna Store',
  project: pick('project') || 'dyna_store',
}
if (registerToken.startsWith('rbk')) body.token = registerToken

const res = await fetch('https://api-bakong.nbc.gov.kh/v1/renew_token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const json = await res.json()

if (json.responseCode !== 0 || !json.data?.token) {
  console.error('Failed:', json.responseMessage || json)
  if (json.errorCode === 10) {
    console.error('Register first: https://api-bakong.nbc.gov.kh/register')
  }
  process.exit(1)
}

const token = json.data.token
console.log('New JWT:')
console.log(token)

for (const name of ['bakong.config.local.js', 'bakong.config.js']) {
  const CONFIG = path.join(ROOT, 'standalone', name)
  if (!fs.existsSync(CONFIG)) continue
  let text = fs.readFileSync(CONFIG, 'utf8')
  if (/^\s*token:\s*['"]/m.test(text)) {
    text = text.replace(/^\s*token:\s*['"][^'"]*['"]/m, `  token: '${token}'`)
  } else {
    text = text.replace(
      /window\.DYNA_BAKONG_CONFIG\s*=\s*\{/,
      `window.DYNA_BAKONG_CONFIG = {\n  token: '${token}',`,
    )
  }
  fs.writeFileSync(CONFIG, text)
  console.log('Updated', CONFIG)
}

const runtimePath = path.join(ROOT, 'standalone', '.bakong-runtime.json')
fs.writeFileSync(
  runtimePath,
  JSON.stringify({ email, jwt: token, updatedAt: Date.now() }, null, 2),
)
console.log('Updated', runtimePath)
