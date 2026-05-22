/**
 * Bakong KHQR — EMV payload, MD5 payment check (Bakong Open API).
 * Register token: https://api-bakong.nbc.gov.kh/register
 */
;(function (global) {
  const KHR_PER_USD = 4100
  /** localStorage keys — do not put your JWT or account here */
  const TOKEN_KEY = 'dyna_bakong_token'
  const PROXY_KEY = 'dyna_bakong_proxy'
  const ACCOUNT_KEY = 'dyna_bakong_account'
  const EMAIL_KEY = 'dyna_bakong_email'
  const PENDING_KEY = 'dyna_pending_topup'
  const CREDITED_KEY = 'dyna_credited_md5'
  const HISTORY_KEY = 'dyna_payment_history'
  const LAST_CHECK_KEY = 'dyna_last_md5_check'
  const API_BASE_KEY = 'dyna_api_base'
  const QR_EXPIRE_MS = 10 * 60 * 1000
  const DEMO_ACCOUNT = 'dynastore@bkrt'
  const LOCAL_PROXY_ORIGIN = 'http://127.0.0.1:8787'
  /** Same-origin paths on Vercel / local server (never localhost when deployed). */
  const API_CHECK_MD5 = '/api/check-md5'
  const API_HEALTH = '/api/health'
  let activeProxyOrigin = null
  let useRelativeApi = false

  function isLocalDev() {
    if (typeof location === 'undefined') return false
    const h = location.hostname
    return h === '127.0.0.1' || h === 'localhost'
  }

  function isGitHubPages() {
    if (typeof location === 'undefined') return false
    return location.hostname.endsWith('.github.io')
  }

  function isVercelHost() {
    if (typeof location === 'undefined') return false
    const h = location.hostname
    return h.endsWith('.vercel.app') || h.endsWith('.vercel.sh')
  }

  /** Use same-origin /api/check-md5 (works on Vercel, local :8787, any host with /api). */
  function useRelativePaymentApi() {
    if (typeof location === 'undefined') return false
    if (!location.protocol.startsWith('http')) return false
    if (isGitHubPages()) return false
    return true
  }

  function configuredSiteUrl() {
    const cfg = configDefaults()
    return String(cfg.siteUrl || cfg.apiBase || localStorage.getItem(API_BASE_KEY) || '')
      .trim()
      .replace(/\/$/, '')
  }

  function paymentApiOrigin() {
    if (typeof location === 'undefined') return configuredSiteUrl()
    if (isLocalDev() && location.port === '8787') return location.origin
    if (isVercelHost() || useRelativePaymentApi()) return location.origin
    if (isGitHubPages()) {
      return configuredSiteUrl() || location.origin
    }
    return location.origin
  }

  function isSameOriginApiHost() {
    return useRelativePaymentApi()
  }

  function migratePaymentStorage() {
    if (typeof localStorage === 'undefined') return
    const proxy = String(localStorage.getItem(PROXY_KEY) || '')
    const onLocalServer = isLocalDev() && location?.port === '8787'
    if (!onLocalServer && (proxy.includes('127.0.0.1') || proxy.includes('localhost'))) {
      localStorage.removeItem(PROXY_KEY)
    }
    const apiBase = String(localStorage.getItem(API_BASE_KEY) || '')
    if (!onLocalServer && (apiBase.includes('127.0.0.1') || apiBase.includes('localhost'))) {
      localStorage.removeItem(API_BASE_KEY)
    }
  }

  function isStaticHosting() {
    return isGitHubPages() || (typeof location !== 'undefined' && !isLocalDev())
  }

  function configApiBase() {
    return paymentApiOrigin()
  }

  /** Bakong API rejects Authorization header from browser origins (CORS). Use /api/check-md5 proxy. */
  function isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined'
  }

  function hasJwtForPayment() {
    return getApiCredential().startsWith('eyJ')
  }

  function canUseDirectBakong() {
    return !isBrowser() && hasJwtForPayment()
  }

  function applyConfigCredentials() {
    migratePaymentStorage()
    const cfg = configDefaults()
    if (cfg.token?.startsWith('eyJ')) {
      localStorage.setItem(TOKEN_KEY, cfg.token)
      const tokenEl = document.getElementById('bakongToken')
      if (tokenEl) tokenEl.value = cfg.token
    }
    if (cfg.email) {
      localStorage.setItem(EMAIL_KEY, cfg.email)
      document.querySelectorAll('#bakongEmail, .bakong-email-sync').forEach((el) => {
        el.value = cfg.email
      })
    }
    if (cfg.account) {
      localStorage.setItem(ACCOUNT_KEY, cfg.account)
      const acc = document.getElementById('bakongAccount')
      if (acc) acc.value = cfg.account
    }
  }

  /** Renew JWT via same-origin /api/renew-token (Vercel + local server). */
  async function renewJwtDirect() {
    const email = getBakongEmail()
    if (!email) return ''
    const cfg = configDefaults()
    const rbk = getRegisterCode()
    const body = {
      email,
      organization: cfg.organization || 'Dyna Store',
      project: cfg.project || 'dyna_store',
    }
    if (rbk) body.token = rbk

    const renewUrl = isBrowser()
      ? resolveProxyRenew()
      : `${PAYMENT_CHECK.apiBase}/v1/renew_token`

    const res = await fetch(renewUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (json.responseCode === 0 && json.data?.token?.startsWith('eyJ')) {
      const jwt = json.data.token
      localStorage.setItem(TOKEN_KEY, jwt)
      const tokenEl = document.getElementById('bakongToken')
      if (tokenEl) tokenEl.value = jwt
      return jwt
    }
    return ''
  }

  async function probeDirectBakong() {
    if (!hasJwtForPayment()) return false
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(`${PAYMENT_CHECK.apiBase}/v1/check_transaction_by_md5`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getApiCredential()}`,
        },
        body: JSON.stringify({ md5: '00000000000000000000000000000000' }),
        signal: ctrl.signal,
      })
      const json = await res.json()
      return json.responseCode !== undefined || json.errorCode !== undefined
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  const MERCHANT = {
    name: 'DYNA STORE',
    city: 'PHNOM PENH',
    /** Your real Bakong ID, e.g. myshop@aba — must exist in Bakong */
    account: 'ben_sothida@bkrt',
    mcc: '5999',
    /** 840 = USD (matches $ prices in UI); use '116' for KHR-only */
    currency: '840',
    merchantDisplayName: 'Dyna Store',
    merchantCity: 'Phnom Penh',
  }

  const PAYMENT_CHECK = {
    apiBase: 'https://api-bakong.nbc.gov.kh',
    pollIntervalMs: 1500,
    maxPollMs: 10 * 60 * 1000,
    pendingMaxMs: 7 * 24 * 60 * 60 * 1000,
    demoWhenNoToken: false,
  }

  /** No JWT — Bakong MD5 API cannot verify payment */
  function useSimplePaymentFlow() {
    return !getToken()
  }

  function addPaymentHistory(md5, usd, qr) {
    const hash = String(md5 || '').toLowerCase()
    if (!/^[a-f0-9]{32}$/.test(hash)) return
    let list = []
    try {
      list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
      if (!Array.isArray(list)) list = []
    } catch {
      list = []
    }
    const payload = String(qr || '').trim()
    list = list.filter((x) => x.md5 !== hash)
    list.push({
      md5: hash,
      usd: Number(usd) || 0.01,
      qr: payload,
      at: Date.now(),
    })
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-30)))
  }

  function md5Variants(md5, qr) {
    const out = []
    const add = (h) => {
      const x = String(h || '').toLowerCase()
      if (/^[a-f0-9]{32}$/.test(x) && !out.includes(x)) out.push(x)
    }
    add(md5)
    if (qr && typeof global.md5 === 'function') {
      add(global.md5(qr))
    }
    return out
  }

  function usdForMd5(md5) {
    const hash = String(md5 || '').toLowerCase()
    try {
      const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null')
      if (pending?.md5 === hash && pending.usd) return Number(pending.usd)
    } catch {
      /* ignore */
    }
    const hit = getPaymentHistory().find((x) => x.md5 === hash)
    if (hit?.usd) return Number(hit.usd)
    return Number(currentUsd) || 0.01
  }

  function getPaymentHistory() {
    try {
      const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
      return Array.isArray(list) ? list : []
    } catch {
      return []
    }
  }

  function savePendingTopup() {
    if (!currentMd5 || !currentUsd) return
    const record = {
      md5: currentMd5,
      usd: currentUsd,
      qr: currentPayload || '',
      at: Date.now(),
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(record))
    addPaymentHistory(currentMd5, currentUsd, currentPayload)
  }

  function saveLastCheck(md5, status, detail) {
    localStorage.setItem(
      LAST_CHECK_KEY,
      JSON.stringify({ md5, status, detail, at: Date.now() }),
    )
  }

  function clearPendingTopup() {
    localStorage.removeItem(PENDING_KEY)
  }

  function loadCreditedMd5Set() {
    try {
      const arr = JSON.parse(localStorage.getItem(CREDITED_KEY) || '[]')
      if (Array.isArray(arr)) arr.forEach((m) => creditedMd5.add(String(m).toLowerCase()))
    } catch {
      /* ignore */
    }
  }

  function markMd5Credited(md5) {
    const key = String(md5 || '').toLowerCase()
    if (!key) return
    creditedMd5.add(key)
    const list = [...creditedMd5]
    localStorage.setItem(CREDITED_KEY, JSON.stringify(list.slice(-50)))
  }

  function creditBalanceDirect(amount) {
    const amt = Number(amount) || 0
    let total
    if (global.DynaWallet?.addBalance) {
      total = global.DynaWallet.addBalance(amt)
    } else {
      const key = 'dyna_wallet_usd'
      const bal = Number(localStorage.getItem(key))
      total = (Number.isFinite(bal) && bal >= 0 ? bal : 0) + amt
      localStorage.setItem(key, String(total))
      if (typeof global.renderWallet === 'function') global.renderWallet(true)
    }
    if (typeof global.onDynaTopupSuccess === 'function') {
      global.onDynaTopupSuccess(amt, { balance: total })
    }
    global.showKhqrToast?.(`+${formatUsd(amt)} added · Balance $${Number(total).toFixed(2)}`)
  }

  function applyTopupCredit(usd, md5, data) {
    const key = String(md5 || '').toLowerCase() || `manual-${usd}-${Date.now()}`
    if (creditedMd5.has(key)) return false
    markMd5Credited(key)
    clearPendingTopup()
    paymentCredited = true
    const amount = Number(usd) || Number(currentUsd) || 0.01
    creditBalanceDirect(amount)
    updatePendingBanner(false)
    return true
  }

  async function checkMd5AndCredit(md5, usd) {
    const hash = String(md5 || '').toLowerCase()
    if (!/^[a-f0-9]{32}$/.test(hash)) return false
    if (creditedMd5.has(hash)) return false

    const hist = getPaymentHistory().find((x) => x.md5 === hash)
    const qr = hist?.qr || currentPayload || ''
    const creditUsd = Number(usd) || usdForMd5(hash)

    currentMd5 = hash
    currentUsd = creditUsd

    applyConfigCredentials()
    await discoverProxy()
    if (!hasJwtForPayment()) await renewJwtDirect()

    try {
      let json = null
      let st = 'pending'
      let matchedMd5 = hash

      for (const candidate of md5Variants(hash, qr)) {
        json = await checkTransactionByMd5(candidate)
        st = parsePaymentStatus(json)
        matchedMd5 = candidate
        if (st === 'paid') break
        if (st === 'no_token' || st === 'unauthorized') break
      }
      saveLastCheck(matchedMd5, st, json?.responseMessage || '')

      if (st === 'no_token' || st === 'unauthorized') {
        await renewJwtDirect()
        for (const candidate of md5Variants(hash, qr)) {
          json = await checkTransactionByMd5(candidate)
          st = parsePaymentStatus(json)
          matchedMd5 = candidate
          if (st === 'paid') break
        }
        saveLastCheck(matchedMd5, st, json?.responseMessage || '')
      }

      if (st === 'paid') {
        return applyTopupCredit(creditUsd, matchedMd5, json?.data)
      }
    } catch (err) {
      saveLastCheck(hash, 'error', String(err.message || err))
      console.warn('checkMd5AndCredit', err)
    }
    return false
  }

  async function checkAllPaymentHistory() {
    applyConfigCredentials()
    await discoverProxy()
    await discoverProxy()
    if (!hasJwtForPayment()) await renewJwtDirect()

    const list = getPaymentHistory().slice().reverse()
    for (const item of list) {
      const ok = await checkMd5AndCredit(item.md5, item.usd)
      if (ok) return true
    }
    return false
  }

  async function resumePendingTopup() {
    const history = getPaymentHistory()
    const raw = localStorage.getItem(PENDING_KEY)
    updatePendingBanner(Boolean(raw || history.length))

    if (raw) {
      try {
        const pending = JSON.parse(raw)
        if (pending.qr) currentPayload = pending.qr
        if (pending.md5) currentMd5 = pending.md5
        if (pending.usd) currentUsd = pending.usd
        if (Date.now() - pending.at <= PAYMENT_CHECK.pendingMaxMs) {
          const ok = await checkMd5AndCredit(pending.md5, pending.usd)
          if (ok) return true
        }
      } catch {
        clearPendingTopup()
      }
    }

    const ok = await checkAllPaymentHistory()
    if (ok) return true

    if (raw && !paymentCredited && !pollTimer) {
      try {
        const pending = JSON.parse(raw)
        currentMd5 = pending.md5
        currentUsd = pending.usd
        void startPolling()
      } catch {
        /* ignore */
      }
    }
    return false
  }

  function updatePendingBanner(show) {
    const el = document.getElementById('pendingTopupBanner')
    if (!el) return
    const history = getPaymentHistory()
    const shouldShow = show || history.length > 0
    el.classList.toggle('hidden', !shouldShow)

    const raw = localStorage.getItem(PENDING_KEY)
    let usd = currentUsd || 0.01
    let md5 = currentMd5
    try {
      if (raw) {
        const p = JSON.parse(raw)
        usd = p.usd ?? usd
        md5 = p.md5 || md5
      } else if (history.length) {
        usd = history[history.length - 1].usd
        md5 = history[history.length - 1].md5
      }
    } catch {
      /* ignore */
    }

    const amtEl = el.querySelector('.pending-topup-amount')
    if (amtEl) amtEl.textContent = formatUsd(usd)

    const md5El = document.getElementById('pendingMd5Display')
    if (md5El) {
      md5El.textContent = md5 ? `${md5.slice(0, 8)}…${md5.slice(-4)}` : '—'
      md5El.title = md5 || ''
    }

    const statusEl = document.getElementById('pendingCheckStatus')
    if (statusEl) {
      try {
        const last = JSON.parse(localStorage.getItem(LAST_CHECK_KEY) || '{}')
        if (last.status === 'paid') statusEl.textContent = 'Bakong: paid — balance updated'
        else if (last.status === 'error') statusEl.textContent = 'Check failed — retry or paste MD5 from QR'
        else if (last.detail) statusEl.textContent = `Bakong: ${last.detail}`
        else statusEl.textContent = 'Checking with Bakong every 1.5s…'
      } catch {
        statusEl.textContent = 'Tap button below after you paid'
      }
    }

    const input = document.getElementById('manualMd5Input')
    if (input && md5 && !input.value) input.value = md5
  }

  function verifyKhqr(payload) {
    if (global.BakongKhqrLite?.verify) return global.BakongKhqrLite.verify(payload)
    return false
  }

  function configDefaults() {
    const file = global.DYNA_BAKONG_CONFIG || {}
    const runtime = global.DYNA_RUNTIME_CONFIG || {}
    const site = String(runtime.siteUrl || runtime.apiBase || file.apiBase || '')
      .trim()
      .replace(/\/$/, '')
    const pageOrigin =
      typeof location !== 'undefined' && location.protocol.startsWith('http')
        ? location.origin.replace(/\/$/, '')
        : site
    const origin = isVercelHost() || (isLocalDev() && location?.port === '8787') ? pageOrigin : site || pageOrigin

    return {
      ...file,
      ...runtime,
      siteUrl: site || pageOrigin,
      apiBase: isGitHubPages() ? site : '',
      paymentCheckUrl:
        runtime.paymentCheckUrl || (origin ? `${origin}/api/check-md5` : '/api/check-md5'),
      webhookUrl: runtime.webhookUrl || (origin ? `${origin}/api/webhook` : '/api/webhook'),
      healthUrl: runtime.healthUrl || (origin ? `${origin}/api/health` : '/api/health'),
      proxy: String(runtime.proxy ?? file.proxy ?? '').trim(),
      token: runtime.token || file.token || '',
      email: runtime.email || file.email || '',
      registerToken: runtime.registerToken || file.registerToken || '',
      account: runtime.account || file.account || '',
      organization: runtime.organization || file.organization || 'Dyna Store',
      project: runtime.project || file.project || 'dyna_store',
    }
  }

  function paymentHelpMessage() {
    if (isVercelHost()) {
      return 'Set BAKONG_TOKEN and DYNA_SITE_URL on Vercel → redeploy, then try top-up again'
    }
    if (isLocalDev()) {
      return 'Run start.bat → http://127.0.0.1:8787 — or copy .env.example to .env'
    }
    return 'Open your Vercel URL (not localhost) for live top-up'
  }

  function getBakongAccount() {
    const input = document.getElementById('bakongAccount')
    const fromConfig = configDefaults().account
    return (
      input?.value ||
      localStorage.getItem(ACCOUNT_KEY) ||
      fromConfig ||
      MERCHANT.account
    ).trim()
  }

  function isInvalidAccount(account) {
    return !account || account === DEMO_ACCOUNT || !/^[^\s@]+@[^\s@]+$/.test(account)
  }

  function buildKhqr(usdAmount) {
    const account = getBakongAccount()
    if (isInvalidAccount(account)) {
      throw new Error('INVALID_ACCOUNT')
    }

    if (!global.BakongKhqrLite) {
      throw new Error('KHQR generator missing')
    }

    const currency = MERCHANT.currency
    const amount =
      currency === '116'
        ? Math.round(Number(usdAmount) * KHR_PER_USD)
        : Number(usdAmount)

    const result = global.BakongKhqrLite.generateIndividual({
      bakongAccountID: account,
      merchantName: MERCHANT.merchantDisplayName || MERCHANT.name,
      merchantCity: MERCHANT.merchantCity || 'Phnom Penh',
      amount,
      currency,
    })

    const qr = result.qr
    const md5 = String(result.md5 || hashMd5(qr) || '').toLowerCase()
    return { qr, md5 }
  }

  function hashMd5(qrString) {
    if (typeof global.md5 !== 'function') return ''
    return String(global.md5(qrString)).toLowerCase()
  }

  function formatKhr(usd) {
    const khr = Math.round(Number(usd) * KHR_PER_USD)
    return '៛' + khr.toLocaleString('en-US')
  }

  function formatUsd(usd) {
    return '$' + Number(usd).toFixed(2)
  }

  function isRegisterCode(token) {
    const t = String(token || '').trim()
    return t.startsWith('rbk') && !t.startsWith('eyJ')
  }

  function getRegisterCode() {
    const cfg = configDefaults()
    if (isRegisterCode(cfg.registerToken)) return cfg.registerToken
    if (isRegisterCode(cfg.token)) return cfg.token
    return isRegisterCode(getTokenRaw()) ? getTokenRaw() : ''
  }

  function needsJwtActivation() {
    const jwt = getToken()
    return Boolean(getRegisterCode()) && !jwt.startsWith('eyJ')
  }

  function getTokenRaw() {
    const fromConfig = configDefaults().token
    const input = document.getElementById('bakongToken')
    return (fromConfig || input?.value || localStorage.getItem(TOKEN_KEY) || '').trim()
  }

  /** JWT only (eyJ…) — empty when only rbk register code is set */
  function getToken() {
    const raw = getTokenRaw()
    return isRegisterCode(raw) ? '' : raw
  }

  /** JWT only — rbk codes do not work for check_transaction_by_md5 */
  function getApiCredential() {
    return getToken()
  }

  function hasApiCredential() {
    return Boolean(getToken())
  }

  function getBakongEmail() {
    const fromConfig = configDefaults().email
    const input =
      document.getElementById('bakongEmail') ||
      document.querySelector('.bakong-email-sync')
    return (fromConfig || input?.value || localStorage.getItem(EMAIL_KEY) || '').trim()
  }

  function getProxyUrl() {
    return resolveProxyUrl()
  }

  function proxyOriginsToTry() {
    const list = []
    const origin = paymentApiOrigin()
    if (origin) list.push(origin)
    if (useRelativePaymentApi() && location?.origin && !list.includes(location.origin)) {
      list.push(location.origin)
    }
    return [...new Set(list.filter(Boolean))]
  }

  function proxyBase() {
    return activeProxyOrigin || paymentApiOrigin() || (typeof location !== 'undefined' ? location.origin : '')
  }

  /**
   * Payment check — always same host as the page (never hardcoded 127.0.0.1).
   * Local: http://127.0.0.1:8787/api/check-md5
   * Vercel: https://dyna-store36.vercel.app/api/check-md5
   * GitHub Pages: https://dyna-store36.vercel.app/api/check-md5 (from apiBase)
   */
  function resolveProxyUrl() {
    if (activeProxyOrigin === 'direct') return ''
    const cfg = configDefaults()
    if (isGitHubPages()) {
      useRelativeApi = false
      const url = cfg.paymentCheckUrl || `${paymentApiOrigin()}${API_CHECK_MD5}`
      return url.startsWith('http') ? url : `${paymentApiOrigin()}${API_CHECK_MD5}`
    }
    useRelativeApi = true
    return API_CHECK_MD5
  }

  function resolveProxyHealth() {
    const cfg = configDefaults()
    if (isGitHubPages()) {
      const url = cfg.healthUrl || `${paymentApiOrigin()}${API_HEALTH}`
      return url.startsWith('http') ? url : `${paymentApiOrigin()}${API_HEALTH}`
    }
    return API_HEALTH
  }

  function resolveProxyRenew() {
    return `${proxyBase()}/api/renew-token`
  }

  function resolveProxySetEmail() {
    return `${proxyBase()}/api/set-email`
  }

  async function probeApiOrigin(origin) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    try {
      const res = await fetch(`${origin.replace(/\/$/, '')}/api/health`, {
        method: 'GET',
        mode: 'cors',
        signal: ctrl.signal,
      })
      if (!res.ok) return { ok: false, hasJwt: hasJwtForPayment() }
      const health = await res.json()
      return {
        ok: true,
        hasJwt: Boolean(health.hasJwt) || hasJwtForPayment(),
      }
    } catch {
      return { ok: false, hasJwt: hasJwtForPayment() }
    } finally {
      clearTimeout(timer)
    }
  }

  function markProxyOnline(origin, hasJwt) {
    activeProxyOrigin = origin.replace(/\/$/, '')
    useRelativeApi =
      useRelativePaymentApi() &&
      typeof location !== 'undefined' &&
      activeProxyOrigin === location.origin
    serverHasJwt = Boolean(hasJwt)
    global.DynaServer?.setOnline?.(true, serverHasJwt)
    if (global.DynaServer) global.DynaServer.hasJwt = serverHasJwt
  }

  async function discoverProxy() {
    applyConfigCredentials()

    if (!hasJwtForPayment() && getBakongEmail() && getRegisterCode()) {
      try {
        await renewJwtDirect()
      } catch (e) {
        console.warn('renewJwtDirect', e)
      }
    }

    const healthPath = resolveProxyHealth()
    try {
      const res = await fetch(healthPath, { method: 'GET', mode: 'cors' })
      if (res.ok) {
        let hasJwt = hasJwtForPayment()
        try {
          const h = await res.json()
          hasJwt = Boolean(h.hasJwt) || hasJwt
        } catch {
          /* ignore */
        }
        markProxyOnline(paymentApiOrigin() || location.origin, hasJwt)
        if (!hasJwt) await warmServerJwt()
        return true
      }
    } catch {
      /* fall through */
    }

    if (hasJwtForPayment()) {
      markProxyOnline(paymentApiOrigin() || location.origin, true)
      return true
    }

    global.DynaServer?.setOnline?.(false, false)
    if (global.DynaServer) global.DynaServer.hasJwt = false
    return false
  }

  async function isProxyOnline() {
    return discoverProxy()
  }

  async function redirectToPaymentServerIfNeeded() {
    if (typeof location === 'undefined') return false
    if (location.protocol === 'file:') {
      global.showKhqrToast?.(paymentHelpMessage())
      return false
    }
    return true
  }

  async function renewBakongToken() {
    const email = getBakongEmail()
    if (!email) throw new Error('EMAIL_REQUIRED')

    const online = await isProxyOnline()
    if (!online) throw new Error('PROXY_OFFLINE')

    const cfg = configDefaults()
    const body = {
      email,
      organization: cfg.organization || 'Dyna Store',
      project: cfg.project || 'dyna_store',
    }
    const code = document.getElementById('bakongVerifyCode')?.value?.trim()
    if (code) body.code = code
    const rbk = getRegisterCode()
    if (rbk) body.token = rbk

    const res = await fetch(resolveProxyRenew(), {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (json.responseCode === 0 && json.data?.token) {
      const tokenEl = document.getElementById('bakongToken')
      if (tokenEl) tokenEl.value = json.data.token
      saveSettings()
      return json.data.token
    }
    if (json.errorCode === 10) {
      throw new Error('NOT_REGISTERED')
    }
    throw new Error(json.responseMessage || 'RENEW_FAILED')
  }

  /** Ask Vercel/local server to obtain JWT (env token or renew). */
  async function warmServerJwt() {
    if (serverHasJwt && hasJwtForPayment()) return true
    const email = getBakongEmail()
    if (!email && !configDefaults().email) return false

    const ok = await syncEmailToServer(true)
    if (ok) return true

    try {
      const cfg = configDefaults()
      const body = {
        email: email || cfg.email,
        organization: cfg.organization || 'Dyna Store',
        project: cfg.project || 'dyna_store',
        forceRenew: true,
      }
      const rbk = getRegisterCode()
      if (rbk) body.token = rbk
      const res = await fetch(resolveProxyRenew(), {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      const jwt = json.data?.token || json.token
      if (jwt?.startsWith('eyJ')) {
        localStorage.setItem(TOKEN_KEY, jwt)
        const tokenEl = document.getElementById('bakongToken')
        if (tokenEl) tokenEl.value = jwt
        serverHasJwt = true
        markProxyOnline(paymentApiOrigin() || location.origin, true)
        return true
      }
    } catch (e) {
      console.warn('warmServerJwt', e)
    }

    await discoverProxy()
    return serverHasJwt || hasJwtForPayment()
  }

  async function syncEmailToServer(force = false) {
    const email = getBakongEmail()
    if (!email) return false

    await isProxyOnline()
    if (!force && serverHasJwt) return true
    if (!force && Date.now() - lastEmailSyncAt < EMAIL_SYNC_COOLDOWN_MS) {
      return serverHasJwt
    }

    const cfg = configDefaults()
    try {
      const res = await fetch(resolveProxySetEmail(), {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          organization: cfg.organization || 'Dyna Store',
          project: cfg.project || 'dyna_store',
          forceRenew: Boolean(force),
        }),
      })
      const json = await res.json()
      serverHasJwt = Boolean(json.hasJwt || json.hasToken)
      if (json.token?.startsWith('eyJ')) {
        localStorage.setItem(TOKEN_KEY, json.token)
        const tokenEl = document.getElementById('bakongToken')
        if (tokenEl) tokenEl.value = json.token
        serverHasJwt = true
      }
      lastEmailSyncAt = Date.now()
      if (serverHasJwt) {
        markProxyOnline(paymentApiOrigin() || location.origin, true)
      }
      return serverHasJwt
    } catch {
      return false
    }
  }

  function saveSettings() {
    const token = document.getElementById('bakongToken')?.value?.trim()
    const proxy = document.getElementById('bakongProxy')?.value?.trim()
    const account = document.getElementById('bakongAccount')?.value?.trim()
    const email =
      document.getElementById('bakongEmail')?.value?.trim() ||
      document.querySelector('.bakong-email-sync')?.value?.trim()
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
    if (proxy) localStorage.setItem(PROXY_KEY, proxy)
    else localStorage.removeItem(PROXY_KEY)
    if (account) localStorage.setItem(ACCOUNT_KEY, account)
    else localStorage.removeItem(ACCOUNT_KEY)
    if (email) {
      localStorage.setItem(EMAIL_KEY, email)
      document.querySelectorAll('#bakongEmail, .bakong-email-sync').forEach((el) => {
        el.value = email
      })
    } else localStorage.removeItem(EMAIL_KEY)
  }

  function loadSettings() {
    applyConfigCredentials()
    const cfg = configDefaults()
    const tokenEl = document.getElementById('bakongToken')
    const proxyEl = document.getElementById('bakongProxy')
    const accountEl = document.getElementById('bakongAccount')
    const emailEl = document.getElementById('bakongEmail')
    if (tokenEl) {
      const jwt = cfg.token?.startsWith('eyJ') ? cfg.token : ''
      const rbk = getRegisterCode()
      const stored = localStorage.getItem(TOKEN_KEY) || ''
      tokenEl.value = (stored.startsWith('eyJ') ? stored : '') || jwt || rbk || ''
      if (jwt) localStorage.setItem(TOKEN_KEY, jwt)
    }
    if (proxyEl) {
      proxyEl.value = resolveProxyUrl() || API_CHECK_MD5
    }
    if (accountEl) {
      accountEl.value =
        localStorage.getItem(ACCOUNT_KEY) || cfg.account || MERCHANT.account
      if (cfg.account && !localStorage.getItem(ACCOUNT_KEY)) {
        localStorage.setItem(ACCOUNT_KEY, cfg.account)
      }
    }
    const storedEmail = localStorage.getItem(EMAIL_KEY) || cfg.email || ''
    document.querySelectorAll('#bakongEmail, .bakong-email-sync').forEach((el) => {
      el.value = storedEmail
    })
    if (storedEmail) localStorage.setItem(EMAIL_KEY, storedEmail)
  }

  function transactionLooksPaid(tx) {
    if (!tx || typeof tx !== 'object') return false
    if (tx.status === 'FAILED' || tx.status === 'FAIL') return false
    const st = String(tx.status || tx.transactionStatus || '').toUpperCase()
    if (st === 'NOT_FOUND' || st === 'PENDING') return false
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
      Boolean(tx.receiverAccountId) ||
      Number(tx.acknowledgedDateMs) > 0 ||
      Number(tx.createdDateMs) > 0 ||
      Number(tx.transactionDate) > 0 ||
      (tx.amount != null && Number(tx.amount) > 0 && st !== 'PENDING')
    )
  }

  /** Map Bakong check_transaction_by_md5 response to status */
  function parsePaymentStatus(json) {
    if (!json || typeof json !== 'object') return 'error'

    if (json._dyna?.paid === true) return 'paid'

    const msg = String(json.responseMessage || '')
    if (/invalid bakong response/i.test(msg)) {
      return json.errorCode === 6 ? 'unauthorized' : 'error'
    }
    if (/HTTP 403|blocked cloud|BAKONG_RELAY/i.test(msg)) {
      return 'unauthorized'
    }

    if (json.errorCode === 6) return 'unauthorized'
    if (json.errorCode === 99) return 'no_token'
    if (json.errorCode === 2 || json.errorCode === 3) return 'failed'
    if (json.errorCode === 1 && json.responseCode !== 0) return 'pending'

    const d = json.data
    if (Array.isArray(d)) {
      if (d.some(transactionLooksPaid)) return 'paid'
    }

    const tx =
      d && typeof d === 'object' && d.transaction && typeof d.transaction === 'object'
        ? d.transaction
        : d

    if (json.responseCode === 0) {
      if (Array.isArray(tx) && tx.some(transactionLooksPaid)) return 'paid'
      if (transactionLooksPaid(tx)) return 'paid'
      if (!tx || typeof tx !== 'object') {
        if (/success|completed|paid/i.test(String(json.responseMessage || ''))) return 'paid'
        return 'pending'
      }
      if (json.responseMessage && /success|completed|paid/i.test(String(json.responseMessage))) {
        return 'paid'
      }
    }

    if (json.responseCode === 1) return 'pending'
    return 'pending'
  }

  let currentPayload = ''
  let currentMd5 = ''
  let currentUsd = 0
  let pollTimer = null
  let pollStartedAt = 0
  let checking = false
  let paymentCredited = false
  let serverHasJwt = false
  let lastEmailSyncAt = 0
  const EMAIL_SYNC_COOLDOWN_MS = 30 * 60 * 1000
  const creditedMd5 = new Set()
  loadCreditedMd5Set()

  function userFacingMessage(msg) {
    if (!msg) return msg
    const s = String(msg).toLowerCase()
    if (
      s.includes('email') ||
      s.includes('register') ||
      s.includes('renew_token') ||
      s.includes('proxy') ||
      s.includes('start.bat') ||
      s.includes('server.mjs') ||
      s.includes('start server') ||
      s.includes('offline') ||
      s.includes('double-click')
    ) {
      return null
    }
    return msg
  }

  function setPaymentStatus(status, detail) {
    const wrap = document.getElementById('khqrStatus')
    const text = document.getElementById('khqrStatusText')
    if (!wrap || !text) return

    wrap.className = 'khqr-status khqr-status--' + status
    const labels = {
      pending: 'Waiting for payment…',
      checking: 'Checking payment (MD5)…',
      paid: 'Payment received',
      failed: 'Payment failed',
      expired: 'QR expired — generate a new one',
      error: 'Could not reach Bakong API',
      demo: 'Demo mode — simulating payment check',
    }
    text.textContent = userFacingMessage(detail) || labels[status] || status
  }

  function updateMd5Display() {
    const el = document.getElementById('khqrMd5')
    if (el) el.textContent = currentMd5 || '—'
  }

  async function checkTransactionByMd5(md5Hash) {
    applyConfigCredentials()
    let token = getApiCredential()
    const md5 = String(md5Hash || '').toLowerCase()

    if (!token.startsWith('eyJ') && getRegisterCode()) {
      token = await renewJwtDirect()
    }

    const proxy = resolveProxyUrl()
    if (proxy) {
      const bearer = token.startsWith('eyJ') ? token : getApiCredential()
      const res = await fetch(proxy, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ md5, token: bearer.startsWith('eyJ') ? bearer : undefined }),
      })
      let json
      try {
        json = await res.json()
      } catch {
        if (!res.ok) throw new Error('PROXY_HTTP_' + res.status)
        throw new Error('PROXY_BAD_RESPONSE')
      }
      if (!res.ok) {
        return {
          responseCode: 1,
          errorCode: res.status === 400 ? 1 : 99,
          responseMessage: String(json?.error || json?.responseMessage || `HTTP ${res.status}`),
          data: null,
        }
      }
      if (json.error && json.responseCode === undefined) {
        if (res.status === 401) throw new Error('NO_TOKEN')
        return {
          responseCode: 1,
          errorCode: 99,
          responseMessage: String(json.error),
          data: null,
        }
      }
      if (json.errorCode === 6 || json.errorCode === 99) {
        await warmServerJwt()
        const retryRes = await fetch(proxy, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            md5,
            token: getApiCredential().startsWith('eyJ') ? getApiCredential() : undefined,
          }),
        })
        try {
          json = await retryRes.json()
        } catch {
          /* keep first json */
        }
      }
      if (json._dyna?.hasJwt) {
        serverHasJwt = true
        markProxyOnline(paymentApiOrigin() || location.origin, true)
      }
      const paid = json._dyna?.paid === true || parsePaymentStatus(json) === 'paid'
      return {
        ...json,
        _dyna: {
          ...(json._dyna || {}),
          paid,
          md5,
          hasJwt: Boolean(json._dyna?.hasJwt) || serverHasJwt || hasJwtForPayment(),
          proxy: true,
        },
      }
    }

    if (isBrowser()) {
      throw new Error('PROXY_OFFLINE')
    }

    if (!token.startsWith('eyJ')) throw new Error('NO_TOKEN')

    const res = await fetch(`${PAYMENT_CHECK.apiBase}/v1/check_transaction_by_md5`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ md5 }),
    })

    const json = await res.json()
    if (json.errorCode === 6) throw new Error('UNAUTHORIZED')
    if (res.status === 401) throw new Error('UNAUTHORIZED')
    return json
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    checking = false
  }

  function creditWalletAfterPaid() {
    if (paymentCredited) return
    onPaymentPaid({ manualConfirm: true })
  }

  function onPaymentPaid(data) {
    if (paymentCredited) return
    paymentCredited = true
    stopPolling()
    setPaymentStatus('paid', 'Payment received — updating balance…')
    applyTopupCredit(currentUsd, currentMd5, data)
    document.getElementById('khqrCheckNow')?.setAttribute('disabled', 'true')
    setTimeout(() => closeKhqrModal(), 1500)
  }

  async function ensurePaymentWatcher() {
    applyConfigCredentials()
    await discoverProxy()
    if (resolveProxyUrl()) return true
    if (isStaticHosting()) {
      if (getRegisterCode()) await renewJwtDirect()
      return hasJwtForPayment()
    }
    if (!serverHasJwt && !hasJwtForPayment()) {
      await syncEmailToServer(true)
      await discoverProxy()
    }
    return Boolean(resolveProxyUrl()) || serverHasJwt || hasJwtForPayment()
  }

  async function runPaymentCheck() {
    if (!currentMd5 || checking) return
    checking = true
    setPaymentStatus('checking', 'Checking payment — balance updates automatically…')

    try {
      await discoverProxy()
      await warmServerJwt()
      if (!resolveProxyUrl()) {
        await ensurePaymentWatcher()
      }
      if (!resolveProxyUrl() && isBrowser()) {
        setPaymentStatus(
          'pending',
          isGitHubPages()
            ? 'Paste your Vercel URL in the banner above → Save → pay again'
            : isVercelHost()
              ? 'Add BAKONG_TOKEN in Vercel → Settings → Environment Variables → redeploy'
              : 'Run start.bat → open http://127.0.0.1:8787/index.html',
        )
        return
      }

      const hist = getPaymentHistory().find((x) => x.md5 === currentMd5)
      const qr = hist?.qr || currentPayload || ''
      let json = null
      let status = 'pending'
      let matchedMd5 = currentMd5

      for (const candidate of md5Variants(currentMd5, qr)) {
        json = await checkTransactionByMd5(candidate)
        status = parsePaymentStatus(json)
        matchedMd5 = candidate
        if (status === 'paid') break
        if (status === 'no_token' || status === 'unauthorized') break
      }

      if (status === 'no_token' || status === 'unauthorized') {
        await warmServerJwt()
        await renewJwtDirect()
        for (const candidate of md5Variants(currentMd5, qr)) {
          json = await checkTransactionByMd5(candidate)
          status = parsePaymentStatus(json)
          if (json._dyna?.paid) status = 'paid'
          matchedMd5 = candidate
          if (status === 'paid') break
        }
      }

      if (status === 'paid' || json?._dyna?.paid) {
        applyTopupCredit(currentUsd, matchedMd5, json?.data)
        setPaymentStatus('paid', 'Payment received — balance updated')
        stopPolling()
        setTimeout(() => closeKhqrModal(), 1500)
        return
      }
      if (status === 'no_token' || status === 'unauthorized') {
        const hint = String(json?.responseMessage || '')
        setPaymentStatus(
          'pending',
          /403|RELAY|cloud/i.test(hint)
            ? hint
            : isVercelHost()
              ? 'Paid? Tap Check payment now — add BAKONG_TOKEN on Vercel if this repeats'
              : 'Paid? Tap Check payment now — keep start.bat running',
        )
        document.getElementById('khqrAdvanced')?.classList.remove('hidden')
        return
      }
      if (status === 'failed') {
        setPaymentStatus('failed')
        stopPolling()
        return
      }
      const bakongMsg = String(json?.responseMessage || '').trim()
      if (bakongMsg && /not found/i.test(bakongMsg)) {
        setPaymentStatus(
          'pending',
          'Bakong: payment not found yet — wait ~30s, tap Check payment now again',
        )
      } else if (bakongMsg) {
        setPaymentStatus('checking', bakongMsg)
      } else {
        setPaymentStatus('pending', 'Waiting for payment… (checking MD5 every 1.5s)')
      }
      saveLastCheck(matchedMd5, status, bakongMsg)
    } catch (err) {
      if (err.message === 'NO_TOKEN') {
        setPaymentStatus('pending', 'Waiting for payment…')
        return
      }
      if (err.message === 'UNAUTHORIZED') {
        setPaymentStatus('pending', 'Checking payment…')
        return
      }
      if (err.message === 'PROXY_OFFLINE') {
        setPaymentStatus(
          'pending',
          isGitHubPages()
            ? 'Link Vercel API URL in banner above, or run start.bat + http://127.0.0.1:8787'
            : isVercelHost()
              ? 'Vercel API missing — check /api/health and BAKONG_TOKEN env'
              : 'Run start.bat (keep window open) then refresh',
        )
        return
      }
      if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        setPaymentStatus(
          'pending',
          isGitHubPages()
            ? configApiBase()
              ? 'Cannot reach Vercel API — check URL and BAKONG_TOKEN on Vercel'
              : 'GitHub Pages: paste Vercel URL in banner → Save → Retry'
            : isVercelHost()
              ? 'Vercel API unreachable — redeploy with api/ folder + env vars'
              : 'Waiting for payment… (run start.bat if testing locally)',
        )
        return
      }
      setPaymentStatus('error', userFacingMessage(err.message) || 'Payment check failed')
    } finally {
      checking = false
    }
  }

  async function startPolling() {
    stopPolling()
    pollStartedAt = Date.now()
    saveSettings()

    const proxy = resolveProxyUrl()
    paymentCredited = false

    document.getElementById('khqrCheckNow')?.removeAttribute('disabled')

    await discoverProxy()
    await ensurePaymentWatcher()
    setPaymentStatus('pending', 'Scan & pay — balance updates automatically')
    runPaymentCheck()
    pollTimer = setInterval(() => {
      if (Date.now() - pollStartedAt > PAYMENT_CHECK.maxPollMs) {
        setPaymentStatus('expired')
        stopPolling()
        return
      }
      runPaymentCheck()
    }, PAYMENT_CHECK.pollIntervalMs)
  }

  function renderQr(container, payload) {
    if (!container) return
    container.innerHTML = ''
    if (!payload) {
      container.textContent = 'QR code could not be generated'
      return
    }
    if (typeof global.QRCode === 'undefined') {
      container.textContent = 'QR library missing — refresh the page'
      return
    }
    if (!verifyKhqr(payload)) {
      console.warn('KHQR verify failed, rendering anyway')
    }
    try {
      container.innerHTML = ''
      new global.QRCode(container, {
        text: payload,
        width: 240,
        height: 240,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: global.QRCode.CorrectLevel.H,
      })
    } catch (err) {
      console.error(err)
      container.textContent = 'Could not draw QR — try again'
    }
  }

  function openKhqrModal(usdAmount) {
    const overlay = document.getElementById('khqrOverlay')
    if (!overlay) return

    saveSettings()
    loadSettings()

    const account = getBakongAccount()
    if (isInvalidAccount(account)) {
      global.showKhqrToast?.('Enter your real Bakong ID above (e.g. you@aba)')
      document.getElementById('bakongAccount')?.focus()
      return
    }

    try {
      currentUsd = Number(usdAmount)
      const built = buildKhqr(usdAmount)
      currentPayload = built.qr
      currentMd5 = String(built.md5 || '').toLowerCase()
      if (!/^[a-f0-9]{32}$/.test(currentMd5)) {
        global.showKhqrToast?.('MD5 missing — reload page (check md5.min.js loads)')
        return
      }
    } catch (err) {
      global.showKhqrToast?.('Cannot build KHQR — check Bakong account')
      return
    }

    document.getElementById('khqrAmountUsd').textContent = formatUsd(usdAmount)
    document.getElementById('khqrAmountKhr').textContent = formatKhr(usdAmount)
    document.getElementById('khqrMerchant').textContent = MERCHANT.name
    document.getElementById('khqrAccount').textContent = account

    const warn = document.getElementById('khqrAccountWarn')
    if (warn) warn.classList.add('hidden')

    const expireEl = document.getElementById('khqrExpire')
    if (expireEl) {
      const cur = MERCHANT.currency === '116' ? '៛' + Math.round(currentUsd * KHR_PER_USD).toLocaleString('en-US') : formatUsd(currentUsd)
      expireEl.textContent = `QR valid 10 min · ${cur} · account must match your Bakong registration`
    }

    updateMd5Display()
    savePendingTopup()

    overlay.classList.add('open')
    overlay.setAttribute('aria-hidden', 'false')
    document.body.style.overflow = 'hidden'
    document.body.classList.add('khqr-open')

    renderQr(document.getElementById('khqrQr'), currentPayload)

    paymentCredited = false
    document.getElementById('khqrAdvanced')?.classList.toggle('hidden', serverHasJwt || Boolean(getToken()))
    setPaymentStatus('pending', 'Scan & pay — balance updates automatically')
    ensurePaymentReady().finally(() => startPolling())
  }

  async function ensurePaymentReady() {
    const cfg = configDefaults()
    if (cfg.token?.startsWith('eyJ')) {
      localStorage.setItem(TOKEN_KEY, cfg.token)
      const tokenEl = document.getElementById('bakongToken')
      if (tokenEl) tokenEl.value = cfg.token
      serverHasJwt = true
    }
    if (cfg.email) localStorage.setItem(EMAIL_KEY, cfg.email)

    await redirectToPaymentServerIfNeeded()

    const online = await discoverProxy()
    if (online && !serverHasJwt) {
      await warmServerJwt()
    }
    return online && (serverHasJwt || getToken().startsWith('eyJ'))
  }

  async function tryAutoRenewToken() {
    await ensurePaymentReady()
  }

  async function confirmPayment() {
    if (!currentUsd || !currentMd5) return
    await runPaymentCheck()
    if (paymentCredited) return
    global.showKhqrToast?.(
      'Payment not confirmed yet. Keep start.bat running, wait ~30s, then tap Check payment now again.',
    )
    setPaymentStatus('pending', 'Still waiting for Bakong to confirm your payment…')
  }

  async function fixBakongToken() {
    if (!getBakongEmail()) throw new Error('CONFIG_REQUIRED')
    return renewBakongToken()
  }

  function closeKhqrModal() {
    if (paymentCredited || !localStorage.getItem(PENDING_KEY)) {
      stopPolling()
    }
    const overlay = document.getElementById('khqrOverlay')
    if (!overlay) return
    overlay.classList.remove('open')
    overlay.setAttribute('aria-hidden', 'true')
    document.body.style.overflow = ''
    document.body.classList.remove('khqr-open')
  }

  function initKhqrModal() {
    const overlay = document.getElementById('khqrOverlay')
    if (!overlay) return

    loadSettings()
    loadCreditedMd5Set()
    redirectToPaymentServerIfNeeded().then(() => ensurePaymentReady())
    void bootstrapPaymentWatcher()

    document.getElementById('khqrClose')?.addEventListener('click', closeKhqrModal)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeKhqrModal()
    })

    document.getElementById('khqrCopy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(currentPayload)
        global.showKhqrToast?.('KHQR copied')
      } catch {
        global.showKhqrToast?.('Copy failed')
      }
    })

    document.getElementById('khqrCopyMd5')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(currentMd5)
        global.showKhqrToast?.('MD5 copied')
      } catch {
        global.showKhqrToast?.('Copy failed')
      }
    })

    document.getElementById('khqrCheckNow')?.addEventListener('click', () => {
      saveSettings()
      runPaymentCheck()
    })

    document.getElementById('bakongToken')?.addEventListener('change', saveSettings)
    document.getElementById('bakongProxy')?.addEventListener('change', saveSettings)
    document.getElementById('bakongAccount')?.addEventListener('change', saveSettings)
    document.getElementById('bakongEmail')?.addEventListener('change', saveSettings)

    document.getElementById('bakongToken')?.addEventListener('input', () => {
      if (currentMd5 && !paymentCredited) runPaymentCheck()
    })

    document.getElementById('khqrCreditPaid')?.addEventListener('click', () => {
      confirmPayment()
    })

    document.getElementById('bakongFixToken')?.addEventListener('click', async () => {
      const btn = document.getElementById('bakongFixToken')
      const statusEl = document.getElementById('bakongRenewStatus')
      if (btn) btn.disabled = true
      if (statusEl) statusEl.textContent = 'Getting JWT…'
      try {
        saveSettings()
        await fixBakongToken()
        serverHasJwt = true
        if (statusEl) statusEl.textContent = 'JWT saved — MD5 check enabled'
        document.getElementById('khqrAdvanced')?.classList.add('hidden')
        if (pollTimer) stopPolling()
        startPolling()
        global.showKhqrToast?.('API token fixed')
        if (currentMd5) runPaymentCheck()
      } catch (err) {
        const msg =
          err.message === 'CONFIG_REQUIRED' || err.message === 'NOT_REGISTERED'
            ? 'Could not connect payment check — try again'
            : userFacingMessage(err.message) || 'Could not get token'
        if (statusEl) statusEl.textContent = msg
        if (msg) global.showKhqrToast?.(msg)
      } finally {
        if (btn) btn.disabled = false
      }
    })

    document.getElementById('bakongRenewToken')?.addEventListener('click', async () => {
      const btn = document.getElementById('bakongRenewToken')
      const statusEl = document.getElementById('bakongRenewStatus')
      if (btn) btn.disabled = true
      if (statusEl) statusEl.textContent = 'Requesting token…'
      try {
        saveSettings()
        await renewBakongToken()
        serverHasJwt = true
        if (statusEl) statusEl.textContent = 'New token saved — payment check enabled'
        document.getElementById('khqrAdvanced')?.classList.add('hidden')
        global.showKhqrToast?.('Bakong API token renewed')
        if (currentMd5) {
          setPaymentStatus('pending', 'Checking payment…')
          runPaymentCheck()
          if (!pollTimer) startPolling()
        }
      } catch (err) {
        const msg =
          err.message === 'EMAIL_REQUIRED' || err.message === 'NOT_REGISTERED'
            ? 'Could not connect payment check — try again'
            : err.message === 'PROXY_OFFLINE'
              ? 'Could not connect payment check — try again'
              : userFacingMessage(err.message) || 'Could not renew token'
        if (statusEl) statusEl.textContent = msg
        if (msg) global.showKhqrToast?.(msg)
      } finally {
        if (btn) btn.disabled = false
      }
    })

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeKhqrModal()
    })
  }

  global.DynaServer = {
    online: false,
    hasJwt: false,
    setOnline(ok, hasJwt) {
      this.online = Boolean(ok)
      if (hasJwt !== undefined) this.hasJwt = Boolean(hasJwt)
      const el = document.getElementById('serverStatus')
      if (!el) return
      const apiBase = configApiBase()
      const hosted = isStaticHosting()

      const hideBanner = this.online && this.hasJwt && (resolveProxyUrl() || !isGitHubPages())
      el.classList.toggle('hidden', hideBanner)
      el.classList.toggle('server-status--offline', !this.online || !this.hasJwt)
      el.classList.toggle('server-status--ok', this.online && this.hasJwt)

      if (this.online && this.hasJwt) {
        const where = isGitHubPages()
          ? configApiBase()
          : typeof location !== 'undefined'
            ? location.origin + '/api/check-md5'
            : '/api/check-md5'
        el.innerHTML =
          `<strong>Payment check ready.</strong> API: <code>${where}</code> — balance updates after you pay.`
        return
      }

      if (hosted) {
        if (this.online && this.hasJwt) {
          el.innerHTML =
            '<strong>Payment check ready.</strong> Scan QR — balance updates after you pay.'
        } else if (!apiBase) {
          el.innerHTML =
            '<div class="server-setup"><strong>GitHub Pages cannot check Bakong alone</strong><p>Option A: run <code>start.bat</code> → open <code>http://127.0.0.1:8787</code></p><p>Option B: deploy to <a href="https://vercel.com" target="_blank" rel="noopener">Vercel</a> and paste URL:</p><input type="url" id="apiBaseInput" class="server-setup-input" placeholder="https://your-app.vercel.app" /><button type="button" class="server-retry-btn" id="serverSaveApi">Save</button> <button type="button" class="server-retry-btn" id="serverRetry">Retry</button></div>'
        } else if (!this.online) {
          el.innerHTML =
            '<strong>Payment server not reachable.</strong> Check URL or run <code>start.bat</code>. <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>'
        } else {
          el.innerHTML =
            isVercelHost()
              ? '<strong>API online but no JWT.</strong> Vercel → Settings → Environment Variables → set <code>BAKONG_TOKEN</code> (or <code>BAKONG_EMAIL</code> + <code>BAKONG_REGISTER_TOKEN</code>) → redeploy. <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>'
              : '<strong>API online but no JWT.</strong> Add <code>BAKONG_TOKEN</code> to <code>.env</code> or run <code>node scripts/bakong-token.mjs your@email.com</code> <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>'
        }
        return
      }

      if (this.online) {
        el.innerHTML =
          '<strong>Server on, API token missing.</strong> Run <code>node scripts/bakong-token.mjs your@email.com</code> then restart <code>start.bat</code>.'
      }
    },
    async ping() {
      try {
        const ok = await discoverProxy()
        this.setOnline(ok, serverHasJwt)
        return ok && serverHasJwt
      } catch {
        this.setOnline(false, false)
        return false
      }
    },
  }

  async function bootstrapPaymentWatcher() {
    applyConfigCredentials()
    await discoverProxy()
    updatePendingBanner(Boolean(localStorage.getItem(PENDING_KEY)))
    await resumePendingTopup()
    if (!global.__dynaPaymentInterval) {
      global.__dynaPaymentInterval = setInterval(() => resumePendingTopup(), 1500)
    }
  }

  global.Khqr = {
    buildKhqr,
    verifyKhqr,
    isInvalidAccount,
    isProxyOnline,
    discoverProxy,
    warmServerJwt,
    redirectToPaymentServerIfNeeded,
    checkServerOnline: isProxyOnline,
    hashMd5,
    checkTransactionByMd5,
    renewBakongToken,
    fixBakongToken,
    tryAutoRenewToken,
    ensurePaymentReady,
    syncEmailToServer,
    confirmPayment,
    applyTopupCredit,
    resumePendingTopup,
    checkMd5AndCredit,
    checkAllPaymentHistory,
    addPaymentHistory,
    getPaymentHistory,
    usdForMd5,
    bootstrapPaymentWatcher,
    checkPaymentNow: () => runPaymentCheck(),
    creditWalletAfterPaid,
    parsePaymentStatus,
    openKhqrModal,
    closeKhqrModal,
    initKhqrModal,
    loadSettings,
    applyConfigCredentials,
    configDefaults,
    paymentHelpMessage,
    configuredSiteUrl,
    hasJwtForPayment,
    saveSettings,
    formatKhr,
    formatUsd,
    KHR_PER_USD,
    MERCHANT,
    PAYMENT_CHECK,
    onPaymentSuccess: null,
  }
})(typeof window !== 'undefined' ? window : global)
