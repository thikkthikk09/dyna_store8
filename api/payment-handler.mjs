import {
  callCheckMd5,
  cors,
  ensureServerJwtAvailable,
  readJsonBody,
  sendJson,
  transactionPaid,
} from './bakong-lib.mjs'

export const paymentFunctionConfig = {
  maxDuration: 15,
  regions: ['sin1', 'hkg1', 'hnd1', 'bom1'],
}

function extractMd5(source) {
  const raw = String(
    source?.md5 || source?.MD5 || source?.transactionMd5 || source?.payment_md5 || '',
  )
    .trim()
    .toLowerCase()
  if (/^[a-f0-9]{32}$/.test(raw)) return raw
  return ''
}

function extractAmount(source) {
  const n = Number(source?.amount ?? source?.usd ?? source?.transactionAmount)
  return Number.isFinite(n) && n > 0 ? n : null
}

async function ensureToken(clientToken) {
  return ensureServerJwtAvailable(clientToken)
}

/**
 * Shared Bakong payment verification (browser poll + server webhook/callback).
 * POST/GET body or query: { md5, token?, amount? }
 */
export async function handlePaymentVerify(req, res, { allowGet = false } = {}) {
  cors(res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  let payload = {}
  if (req.method === 'POST') {
    payload = await readJsonBody(req)
  } else if (allowGet && req.method === 'GET') {
    payload = { ...(req.query || {}) }
  } else {
    return sendJson(res, 405, {
      error: 'Method not allowed',
      allowed: allowGet ? ['GET', 'POST', 'OPTIONS'] : ['POST', 'OPTIONS'],
    })
  }

  const md5 = extractMd5(payload)
  if (!md5) {
    return sendJson(res, 400, {
      error: 'md5 required (32 hex characters)',
      example: { md5: 'abc123...', token: 'optional eyJ...' },
    })
  }

  const token = await ensureToken(payload?.token || payload?.bearer)
  if (!token.startsWith('eyJ')) {
    return sendJson(res, 200, {
      responseCode: 1,
      responseMessage:
        'Server JWT missing — set BAKONG_TOKEN on Vercel (Environment Variables)',
      errorCode: 99,
      data: null,
      _dyna: { paid: false, md5, hasJwt: false, hosted: true },
    })
  }

  try {
    let data = await callCheckMd5(md5, token)

    if (data.errorCode === 6 && !data._bakongHttp) {
      const fresh = await ensureServerJwtAvailable(payload?.token)
      if (fresh.startsWith('eyJ') && fresh !== token) {
        data = await callCheckMd5(md5, fresh)
      }
    }

    const paid = transactionPaid(data)
    const amount = extractAmount(payload) ?? extractAmount(data?.data)

    return sendJson(res, 200, {
      ...data,
      _dyna: {
        paid,
        md5,
        hasJwt: true,
        hosted: true,
        amount,
        gateway: 'bakong-khqr',
        verifiedAt: Date.now(),
      },
    })
  } catch (err) {
    return sendJson(res, 502, {
      responseCode: 1,
      errorCode: 1,
      responseMessage: String(err.message),
      data: null,
      _dyna: { paid: false, md5, hasJwt: true, hosted: true },
    })
  }
}
