const BAKONG_API = 'https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5'
const BAKONG_RENEW = 'https://api-bakong.nbc.gov.kh/v1/renew_token'

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, X-MD5, X-Payment-MD5',
  )
}

export function sendJson(res, status, data) {
  cors(res)
  res.status(status).json(data)
}

export function normalizeJwt(token) {
  return String(token || '')
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/\s+/g, '')
}

/** Headers NBC/WAF often expects (avoids HTTP 403 HTML from cloud IPs). */
export function bakongHeaders(bearer) {
  const jwt = normalizeJwt(bearer)
  const h = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9,km;q=0.8',
    'User-Agent': 'Mozilla/5.0 (compatible; DynaStore/1.0; +https://bakong.nbc.gov.kh)',
    Connection: 'keep-alive',
  }
  if (jwt.startsWith('eyJ')) h.Authorization = `Bearer ${jwt}`
  return h
}

export function pickServerJwt(clientToken) {
  const client = normalizeJwt(clientToken)
  const env = normalizeJwt(process.env.BAKONG_TOKEN)
  if (client.startsWith('eyJ')) return client
  if (env.startsWith('eyJ')) return env
  return ''
}

export async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) {
      try {
        return JSON.parse(req.body.toString('utf8'))
      } catch {
        return {}
      }
    }
    if (typeof req.body === 'object') {
      return req.body
    }
    if (typeof req.body === 'string' && req.body.trim()) {
      try {
        return JSON.parse(req.body)
      } catch {
        return {}
      }
    }
  }

  if (typeof req.json === 'function') {
    try {
      return await req.json()
    } catch {
      /* fall through */
    }
  }

  if (typeof req.on !== 'function') {
    return {}
  }

  const raw = await new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function jwtStillValid(token, bufferMs = 15 * 60 * 1000) {
  const jwt = normalizeJwt(token)
  if (!jwt.startsWith('eyJ')) return false
  try {
    const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json =
      typeof atob === 'function'
        ? atob(b64)
        : Buffer.from(b64, 'base64').toString('utf8')
    const payload = JSON.parse(json)
    if (!payload.exp) return true
    return Date.now() < payload.exp * 1000 - bufferMs
  } catch {
    return false
  }
}

export function getServerJwt() {
  return normalizeJwt(process.env.BAKONG_TOKEN)
}

/** Resolve a usable JWT for this request (env token or renew via email + rbk). */
export async function ensureServerJwtAvailable(clientToken) {
  let token = pickServerJwt(clientToken)
  if (jwtStillValid(token)) return token

  const email = String(process.env.BAKONG_EMAIL || process.env.DYNA_BAKONG_EMAIL || '').trim()
  if (!email) return token

  const renewed = await renewJwt(
    email,
    process.env.BAKONG_ORG || process.env.DYNA_BAKONG_ORG,
    process.env.BAKONG_PROJECT || process.env.DYNA_BAKONG_PROJECT,
  )
  if (renewed.responseCode === 0 && renewed.data?.token) {
    return normalizeJwt(renewed.data.token)
  }
  return token
}

export function transactionPaid(data) {
  if (data?._dyna?.paid === true) return true
  let tx = data?.data
  if (tx?.transaction && typeof tx.transaction === 'object') tx = tx.transaction
  if (!tx || typeof tx !== 'object') return false
  const st = String(tx.status || tx.transactionStatus || '').toUpperCase()
  return (
    st === 'SUCCESS' ||
    st === 'PAID' ||
    st === 'COMPLETED' ||
    st === 'SUCCEEDED' ||
    st === 'ACCEPTED' ||
    st === 'SETTLED' ||
    Boolean(tx.hash) ||
    Boolean(tx.fromAccountId) ||
    Boolean(tx.toAccountId) ||
    Number(tx.acknowledgedDateMs) > 0 ||
    Number(tx.createdDateMs) > 0 ||
    (tx.amount != null && Number(tx.amount) > 0)
  )
}

function parseBakongText(text, httpStatus) {
  if (!text || !text.trim()) {
    return {
      responseCode: 1,
      errorCode: httpStatus === 401 || httpStatus === 403 ? 6 : 1,
      responseMessage: `Bakong empty response (HTTP ${httpStatus})`,
      data: null,
    }
  }
  try {
    return JSON.parse(text)
  } catch {
    const preview = text.replace(/\s+/g, ' ').slice(0, 100)
    if (httpStatus === 403) {
      return {
        responseCode: 1,
        errorCode: 6,
        responseMessage:
          'Bakong blocked cloud server (HTTP 403). Set BAKONG_RELAY_URL to your PC/ngrok, or use start.bat locally.',
        data: null,
        _bakongHttp: 403,
      }
    }
    return {
      responseCode: 1,
      errorCode: httpStatus === 401 ? 6 : 1,
      responseMessage:
        httpStatus === 401
          ? 'Bakong unauthorized — renew token (scripts/bakong-token.mjs) and update Vercel BAKONG_TOKEN'
          : `Bakong non-JSON (HTTP ${httpStatus}): ${preview}`,
      data: null,
      _bakongHttp: httpStatus,
    }
  }
}

export async function bakongFetchJson(url, { method = 'POST', body, bearer } = {}) {
  let res
  try {
    res = await fetch(url, {
      method,
      headers: bakongHeaders(bearer),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'follow',
    })
  } catch (err) {
    return {
      responseCode: 1,
      errorCode: 1,
      responseMessage: `Cannot reach Bakong: ${err.message}`,
      data: null,
    }
  }
  const text = await res.text()
  const json = parseBakongText(text, res.status)
  if (!json.responseMessage && !res.ok) {
    json.responseMessage = `Bakong HTTP ${res.status}`
  }
  return json
}

export async function renewJwt(email, organization, project, registerToken) {
  const body = {
    email,
    organization: organization || process.env.BAKONG_ORG || 'Dyna Store',
    project: project || process.env.BAKONG_PROJECT || 'dyna_store',
  }
  const rbk = String(registerToken || process.env.BAKONG_REGISTER_TOKEN || '').trim()
  if (rbk.startsWith('rbk')) body.token = rbk

  return bakongFetchJson(BAKONG_RENEW, { method: 'POST', body, bearer: '' })
}

async function callCheckMd5Direct(md5, bearer) {
  return bakongFetchJson(BAKONG_API, { method: 'POST', body: { md5 }, bearer })
}

async function callCheckMd5Relay(md5, bearer, relayBase) {
  const base = String(relayBase || '').trim().replace(/\/$/, '')
  if (!base) return null
  let res
  try {
    res = await fetch(`${base}/api/check-md5`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ md5, token: normalizeJwt(bearer) }),
      redirect: 'follow',
    })
  } catch (err) {
    return {
      responseCode: 1,
      errorCode: 1,
      responseMessage: `Relay unreachable (${base}): ${err.message}`,
      data: null,
    }
  }
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return {
      responseCode: 1,
      errorCode: 1,
      responseMessage: `Relay bad response (HTTP ${res.status})`,
      data: null,
    }
  }
}

export async function callCheckMd5(md5, bearer) {
  const relay = process.env.BAKONG_RELAY_URL?.trim()
  if (relay) {
    const viaRelay = await callCheckMd5Relay(md5, bearer, relay)
    if (viaRelay && viaRelay.responseCode !== undefined) return viaRelay
  }

  let data = await callCheckMd5Direct(md5, bearer)

  const blocked =
    data._bakongHttp === 403 ||
    (data.errorCode === 6 && /403|blocked|cloud/i.test(String(data.responseMessage)))

  if (blocked && relay) {
    return callCheckMd5Relay(md5, bearer, relay)
  }

  if (blocked && !relay) {
    data.responseMessage =
      'Bakong HTTP 403 from Vercel. Run start.bat on your PC, expose with ngrok, set BAKONG_RELAY_URL on Vercel, redeploy.'
  }

  return data
}
