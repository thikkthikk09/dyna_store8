/**
 * Load Dyna Store assets with correct paths (Cursor preview, file://, http://8787).
 */
;(function () {
  const script = document.currentScript
  if (!script?.src) return

  let root = ''
  if (script.src.includes('/standalone/')) {
    root = script.src.replace(/standalone\/[^/]*$/, '')
  } else {
    root = script.src.replace(/\/[^/]*$/, '/')
  }
  if (!root || root === location.origin + '/') {
    const href = location.href.split(/[?#]/)[0]
    const slash = href.lastIndexOf('/')
    root = slash >= 0 ? href.slice(0, slash + 1) : location.origin + '/'
  }

  function asset(path) {
    return root + path.replace(/^\//, '')
  }

  const critical = document.createElement('style')
  critical.textContent = `
    html, body { margin: 0; min-height: 100%; background: #0a0b0f; color: #f4f4f6; }
    .app { min-height: 100vh; display: flex; flex-direction: column; visibility: visible !important; opacity: 1 !important; }
    .boot-msg { padding: 1.5rem; text-align: center; color: #8b8f9e; }
  `
  document.head.appendChild(critical)

  const css = document.createElement('link')
  css.rel = 'stylesheet'
  css.href = asset('standalone/styles.css')
  document.head.appendChild(css)

  const scripts = [
    'api/env-config',
    'standalone/md5.min.js',
    'standalone/qrcode.min.js',
    'standalone/bakong-khqr-lite.js',
    'standalone/bakong.config.js',
    'standalone/bakong.config.local.js',
    'standalone/khqr.js',
    'standalone/game-upload.js',
    'standalone/app.js',
  ]

  function loadScript(i) {
    if (i >= scripts.length) return
    const s = document.createElement('script')
    s.src = scripts[i].startsWith('api/') ? `/${scripts[i]}` : asset(scripts[i])
    s.async = false
    s.onload = function () {
      loadScript(i + 1)
    }
    s.onerror = function () {
      if (scripts[i].includes('bakong.config') || scripts[i].includes('env-config')) {
        window.DYNA_BAKONG_CONFIG = window.DYNA_BAKONG_CONFIG || {}
        window.DYNA_RUNTIME_CONFIG = window.DYNA_RUNTIME_CONFIG || {}
        loadScript(i + 1)
        return
      }
      console.error('Failed to load', scripts[i])
      loadScript(i + 1)
    }
    document.body.appendChild(s)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      loadScript(0)
    })
  } else {
    loadScript(0)
  }

  window.DYNA_ASSET_ROOT = root
})()
