// Appels relatifs à /external/v1 : le proxy de dev ajoute la clé, jamais ce fichier.

export const BASE_URL = '/external/v1'
export const KEY_LEVEL_HEADER = 'X-Demo-Key-Level'
const PREVIEW_CHARS = 600

function defaultUuid() {
  return globalThis.crypto.randomUUID()
}

function buildUrl(path, query) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return `${BASE_URL}${path}${qs ? `?${qs}` : ''}`
}

function headersToObject(headers) {
  return Object.fromEntries([...headers.entries()].map(([k, v]) => [k.toLowerCase(), v]))
}

function parseBody(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * @param {object} options
 * @param {() => 'read'|'write'|'delete'} options.getKeyLevel niveau de clé à demander au proxy ('none' = aucune clé, via keyLevel)
 * @param {typeof fetch} [options.fetchImpl]
 * @param {() => string} [options.uuid]
 * @param {(exchange: object) => void} [options.onExchange] appelé pour chaque échange (historique)
 */
export function createClient({ getKeyLevel, fetchImpl, uuid = defaultUuid, onExchange } = {}) {
  const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args))

  async function request({ method = 'GET', path, query, body, keyLevel }) {
    const level = keyLevel ?? getKeyLevel?.() ?? 'read'
    const headers = { Accept: 'application/json', [KEY_LEVEL_HEADER]: level }
    let payload
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      payload = typeof body === 'string' ? body : JSON.stringify(body)
    }
    if (method === 'POST') headers['Idempotency-Key'] = uuid()

    const url = buildUrl(path, query)
    const exchange = {
      id: uuid(),
      at: new Date().toISOString(),
      request: {
        method,
        url,
        headers,
        bodyPreview: payload === undefined ? null : payload.slice(0, PREVIEW_CHARS),
        bodyBytes: payload === undefined ? 0 : new TextEncoder().encode(payload).length,
      },
      response: null,
      networkError: null,
      durationMs: 0,
    }

    const started = performance.now()
    try {
      const res = await doFetch(url, { method, headers, body: payload })
      const text = await res.text()
      exchange.response = {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        headers: headersToObject(res.headers),
        body: parseBody(text),
        bodyText: text,
      }
    } catch (error) {
      exchange.networkError = error instanceof Error ? error.message : String(error)
    }
    exchange.durationMs = Math.round(performance.now() - started)
    onExchange?.(exchange)
    return exchange
  }

  return {
    request,
    get: (path, query, options) => request({ ...options, method: 'GET', path, query }),
    post: (path, body, options) => request({ ...options, method: 'POST', path, body }),
    patch: (path, body, options) => request({ ...options, method: 'PATCH', path, body }),
    delete: (path, query, options) => request({ ...options, method: 'DELETE', path, query }),
  }
}
