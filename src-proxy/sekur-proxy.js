// Le serveur de dev ajoute la clé API : elle n'atteint jamais le navigateur, qui n'envoie
// qu'un sélecteur de niveau (lecture, écriture, suppression).

export const KEY_LEVEL_HEADER = 'x-demo-key-level'
export const MAX_WRITE_BODY_BYTES = 4 * 1024 * 1024
export const DEFAULT_APP_URL = 'https://platform.sekur.fr'

// En-têtes qui pourraient porter la clé : retirés des requêtes entrantes et des réponses.
const SECRET_HEADERS = ['x-api-key', 'authorization', 'proxy-authorization']
const LOCAL_HOSTS = ['localhost', '127.0.0.1']
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS']
// Seule route où la spec documente le 413 : l'exception DEMO_ALLOW_STRESS ne vaut que là.
const STRESS_PATH = '/external/v1/services'

export const isSafeMethod = (method) => SAFE_METHODS.includes(String(method).toUpperCase())

const parseUrl = (name, raw) => {
  try {
    return new URL(raw)
  } catch {
    throw new Error(`${name} invalide : "${raw}".`)
  }
}

export function parseApiUrl(raw) {
  if (!raw) {
    throw new Error(
      'SEKUR_API_URL est obligatoire : renseignez-la dans .env.local (voir .env.example).',
    )
  }
  const url = parseUrl('SEKUR_API_URL', raw)
  const secure = url.protocol === 'https:'
  const local = url.protocol === 'http:' && LOCAL_HOSTS.includes(url.hostname)
  if (!secure && !local) {
    throw new Error(
      'SEKUR_API_URL doit être en https (http n’est accepté que pour localhost et 127.0.0.1).',
    )
  }
  return raw.replace(/\/+$/, '')
}

function parseAppUrl(raw = DEFAULT_APP_URL) {
  const { protocol } = parseUrl('SEKUR_APP_URL', raw)
  if (protocol !== 'https:' && protocol !== 'http:')
    throw new Error('SEKUR_APP_URL doit être une URL http(s).')
  return raw.replace(/\/+$/, '')
}

const isTrue = (value) => String(value).trim().toLowerCase() === 'true'

export function readEnv(env = {}) {
  return {
    apiUrl: parseApiUrl(env.SEKUR_API_URL),
    appUrl: parseAppUrl(env.SEKUR_APP_URL || undefined),
    keys: {
      read: env.SEKUR_API_KEY_READ || '',
      write: env.SEKUR_API_KEY_WRITE || '',
      // Facultative : clé read_write_delete, nécessaire aux DELETE et aux désactivations.
      delete: env.SEKUR_API_KEY_DELETE || '',
    },
    allowWrites: isTrue(env.DEMO_ALLOW_WRITES),
    allowStress: isTrue(env.DEMO_ALLOW_STRESS),
  }
}

export function pickApiKey(level, keys) {
  return level === 'read' || level === 'write' || level === 'delete' ? keys[level] || '' : ''
}

// Le proxy écarte toute clé envoyée par le navigateur : seule celle du fichier d'environnement part.
export function applyUpstreamHeaders(proxyReq, level, keys) {
  for (const name of SECRET_HEADERS) proxyReq.removeHeader(name)
  proxyReq.removeHeader(KEY_LEVEL_HEADER)
  const key = pickApiKey(level, keys)
  if (key) proxyReq.setHeader('X-API-Key', key)
  proxyReq.setHeader('Accept', 'application/json')
}

export function sanitizeResponseHeaders(headers) {
  for (const name of SECRET_HEADERS) delete headers[name]
  return headers
}

export function keyStatus(keys) {
  return { read: Boolean(keys.read), write: Boolean(keys.write), delete: Boolean(keys.delete) }
}

const refusal = (message, reason) => ({ status: 403, body: { code: 403, message, reason } })

/**
 * Lecture seule par défaut. Sans DEMO_ALLOW_WRITES :
 * - une écriture étiquetée « lecture » n'est transmise que si SEKUR_API_KEY_READ est une
 *   clé lecture (`readKeyLevel`, lu par GET /me) : l'API la refuse alors en 403, c'est le scénario ;
 * - un corps de plus de 4 Mio sur POST /services part avec DEMO_ALLOW_STRESS (l'API répond 413).
 * Renvoie la réponse de refus, ou null.
 */
export function evaluateWriteGuard({
  method,
  path = '',
  level,
  contentLength,
  allowWrites,
  allowStress,
  readKeyLevel = 'read',
}) {
  if (allowWrites || isSafeMethod(method)) return null
  if (level === 'read') {
    if (readKeyLevel === 'read') return null
    return refusal(
      readKeyLevel === 'unknown'
        ? 'Écriture refusée par la démo : impossible de vérifier (GET /me) que SEKUR_API_KEY_READ est une clé de niveau lecture.'
        : `Écriture refusée par la démo : SEKUR_API_KEY_READ est une clé de niveau ${readKeyLevel}, pas lecture. Mettez-y une clé lecture, ou ajoutez DEMO_ALLOW_WRITES=true dans .env.local.`,
      'demo_read_key_not_read_only',
    )
  }
  const stress =
    allowStress &&
    String(method).toUpperCase() === 'POST' &&
    level === 'write' &&
    path === STRESS_PATH &&
    Number(contentLength) > MAX_WRITE_BODY_BYTES
  if (stress) return null
  return refusal(
    'Écritures désactivées par la démo : ajoutez DEMO_ALLOW_WRITES=true dans .env.local pour les autoriser.',
    'demo_writes_disabled',
  )
}

export function createProxyConfig(env) {
  const { apiUrl, keys } = readEnv(env)
  return {
    '/external': {
      target: apiUrl,
      changeOrigin: true,
      secure: true,
      configure(proxy) {
        // Aucun journal d'en-têtes : le proxy n'écrit ni la clé ni le sélecteur.
        proxy.on('proxyReq', (proxyReq, req) => {
          const level = String(req.headers[KEY_LEVEL_HEADER] || '')
          applyUpstreamHeaders(proxyReq, level, keys)
        })
        proxy.on('proxyRes', (proxyRes) => sanitizeResponseHeaders(proxyRes.headers))
      },
    },
  }
}
