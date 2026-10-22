import {
  KEY_LEVEL_HEADER,
  evaluateWriteGuard,
  isSafeMethod,
  keyStatus,
  readEnv,
} from './sekur-proxy.js'

const SPEC_PATH = '/doc/external.json'
const ME_PATH = '/external/v1/me'
const SPEC_TTL_MS = 5 * 60 * 1000
// Un échec reste 30 s en cache : un raté transitoire ne doit pas priver l'Explorateur 5 min.
const SPEC_FAIL_TTL_MS = 30 * 1000
const UPSTREAM_TIMEOUT_MS = 5000

export function isPayloadTooLargeDocumented(spec) {
  return Boolean(spec?.paths?.['/external/v1/services']?.post?.responses?.['413'])
}

// Sert /demo/config et /demo/spec au front, et applique la lecture seule avant le proxy.
export function demoConfigPlugin(env, { fetchImpl = (...args) => fetch(...args) } = {}) {
  const { apiUrl, appUrl, keys, allowWrites, allowStress } = readEnv(env)
  let cache = { at: 0, spec: null }
  let inflight = null
  let readKeyLevel = null

  // Un seul téléchargement à la fois : /demo/config et /demo/spec arrivent ensemble au chargement.
  function loadSpec() {
    const ttl = cache.spec ? SPEC_TTL_MS : SPEC_FAIL_TTL_MS
    if (cache.at && Date.now() - cache.at < ttl) return Promise.resolve(cache.spec)
    inflight ??= fetchImpl(new URL(SPEC_PATH, apiUrl), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((spec) => {
        inflight = null
        cache = { at: Date.now(), spec }
        return spec
      })
    return inflight
  }

  // Niveau réel de SEKUR_API_KEY_READ, lu une fois par GET /me : une écriture « clé lecture » ne
  // doit pas devenir une écriture réelle parce que l'opérateur y a mis une clé plus puissante.
  async function readKeyAccessLevel() {
    if (readKeyLevel) return readKeyLevel
    if (!keys.read) return 'read' // sans clé, l'API répond 401 : rien à protéger
    try {
      const res = await fetchImpl(`${apiUrl}${ME_PATH}`, {
        headers: { 'X-API-Key': keys.read, Accept: 'application/json' },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      })
      const level = res.ok ? (await res.json())?.apiKey?.accessLevel : null
      if (level) readKeyLevel = level
      return level ?? 'unknown'
    } catch {
      return 'unknown'
    }
  }

  const sendJson = (res, status, body) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(body))
  }

  return {
    name: 'sekur-demo-config',
    configureServer(server) {
      // Même prédicat que le proxy de Vite (startsWith) : un chemin encodé ne contourne pas la garde.
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/external')) return next()
        const level = String(req.headers[KEY_LEVEL_HEADER] || '')
        const checkReadKey = !allowWrites && level === 'read' && !isSafeMethod(req.method)
        const refusal = evaluateWriteGuard({
          method: req.method,
          path: req.url.split('?')[0],
          level,
          contentLength: req.headers['content-length'],
          allowWrites,
          allowStress,
          readKeyLevel: checkReadKey ? await readKeyAccessLevel() : 'read',
        })
        return refusal ? sendJson(res, refusal.status, refusal.body) : next()
      })
      server.middlewares.use('/demo/config', async (req, res) => {
        sendJson(res, 200, {
          apiHost: new URL(apiUrl).host,
          appUrl,
          keys: keyStatus(keys),
          writes: allowWrites,
          stress: allowStress,
          payloadTooLargeDocumented: isPayloadTooLargeDocumented(await loadSpec()),
        })
      })
      // Relayée par le serveur de dev : le navigateur n'appelle jamais l'API directement (CORS).
      server.middlewares.use('/demo/spec', async (req, res) => {
        const spec = await loadSpec()
        sendJson(res, spec ? 200 : 502, spec ?? { message: 'Spec OpenAPI injoignable.' })
      })
    },
  }
}
