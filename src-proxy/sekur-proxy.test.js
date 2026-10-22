import http from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'vite'
import {
  applyUpstreamHeaders,
  createProxyConfig,
  evaluateWriteGuard,
  parseApiUrl,
  pickApiKey,
  readEnv,
  sanitizeResponseHeaders,
} from './sekur-proxy.js'

// Clés factices, uniquement pour les tests.
const KEYS = { read: 'fake-read-key', write: 'fake-write-key', delete: 'fake-delete-key' }

describe("URL de l'API", () => {
  it.each([
    'https://api.example.com',
    'https://api.example.com/',
    'http://localhost:8080',
    'http://127.0.0.1:9000/x',
  ])('accepte %s', (url) => {
    expect(parseApiUrl(url)).toBe(url.replace(/\/+$/, ''))
  })

  it.each(['http://api.example.com', 'ftp://example.com', 'pas une url'])('refuse %s', (url) => {
    expect(() => parseApiUrl(url)).toThrow(/SEKUR_API_URL/)
  })

  it('est obligatoire : aucune valeur par défaut', () => {
    expect(() => readEnv({})).toThrow(/obligatoire/)
  })

  it("lit l'URL de l'application Sekur (prod par défaut) et refuse un schéma autre que http(s)", () => {
    const env = { SEKUR_API_URL: 'https://api.example.com' }
    expect(readEnv(env).appUrl).toBe('https://platform.sekur.fr')
    expect(readEnv({ ...env, SEKUR_APP_URL: 'https://app.example.com/' }).appUrl).toBe(
      'https://app.example.com',
    )
    expect(() => readEnv({ ...env, SEKUR_APP_URL: 'javascript:alert(1)' })).toThrow(/SEKUR_APP_URL/)
  })

  it('lit les drapeaux de sécurité : désactivés par défaut', () => {
    const env = { SEKUR_API_URL: 'https://api.example.com' }
    expect(readEnv(env)).toMatchObject({ allowWrites: false, allowStress: false })
    expect(readEnv({ ...env, DEMO_ALLOW_WRITES: 'true', DEMO_ALLOW_STRESS: 'TRUE' })).toMatchObject(
      {
        allowWrites: true,
        allowStress: true,
      },
    )
    expect(readEnv({ ...env, DEMO_ALLOW_WRITES: 'oui' }).allowWrites).toBe(false)
  })
})

describe('lecture seule', () => {
  const off = { allowWrites: false, allowStress: false }

  it('laisse passer les lectures et les écritures avec la clé lecture (refusées par l’API)', () => {
    expect(evaluateWriteGuard({ method: 'GET', level: 'write', ...off })).toBeNull()
    expect(evaluateWriteGuard({ method: 'POST', level: 'read', ...off })).toBeNull()
  })

  it('refuse toute autre écriture sans DEMO_ALLOW_WRITES', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const refusal = evaluateWriteGuard({ method, level: 'write', ...off })
      expect(refusal).toMatchObject({ status: 403, body: { reason: 'demo_writes_disabled' } })
    }
    expect(evaluateWriteGuard({ method: 'POST', level: 'none', ...off })).not.toBeNull()
  })

  it('autorise les écritures avec DEMO_ALLOW_WRITES', () => {
    expect(
      evaluateWriteGuard({
        method: 'DELETE',
        level: 'delete',
        allowWrites: true,
        allowStress: false,
      }),
    ).toBeNull()
  })

  it('autorise un corps de plus de 4 Mio avec DEMO_ALLOW_STRESS, seulement sur POST /services en écriture', () => {
    const big = {
      method: 'POST',
      path: '/external/v1/services',
      level: 'write',
      contentLength: String(5 * 1024 * 1024),
    }
    const stress = { allowWrites: false, allowStress: true }
    expect(evaluateWriteGuard({ ...big, ...stress })).toBeNull()
    expect(evaluateWriteGuard({ ...big, allowWrites: false, allowStress: false })).not.toBeNull()
    expect(evaluateWriteGuard({ ...big, ...stress, contentLength: '1000' })).not.toBeNull()
    // Bornes : 4 194 304 octets exactement est refusé ; sans Content-Length (chunked) aussi.
    expect(evaluateWriteGuard({ ...big, ...stress, contentLength: '4194304' })).not.toBeNull()
    expect(evaluateWriteGuard({ ...big, ...stress, contentLength: '4194305' })).toBeNull()
    expect(evaluateWriteGuard({ ...big, ...stress, contentLength: undefined })).not.toBeNull()
    // Hors de la route documentée, autre verbe ou clé suppression : pas d'exception.
    expect(evaluateWriteGuard({ ...big, ...stress, path: '/external/v1/customers' })).not.toBeNull()
    expect(evaluateWriteGuard({ ...big, ...stress, method: 'DELETE' })).not.toBeNull()
    expect(evaluateWriteGuard({ ...big, ...stress, level: 'delete' })).not.toBeNull()
  })

  it('refuse une écriture « clé lecture » quand cette clé a en réalité des droits d’écriture', () => {
    const write = { method: 'post', level: 'read', ...off }
    expect(evaluateWriteGuard({ ...write, readKeyLevel: 'read' })).toBeNull()
    expect(evaluateWriteGuard({ ...write, readKeyLevel: 'read_write' })?.body.reason).toBe(
      'demo_read_key_not_read_only',
    )
    expect(evaluateWriteGuard({ ...write, readKeyLevel: 'unknown' })?.body.message).toMatch(
      /impossible de vérifier/,
    )
    // Sélecteur vide ou verbe en minuscules : la garde reste fermée pour les écritures.
    expect(evaluateWriteGuard({ method: 'post', level: '', ...off })?.body.reason).toBe(
      'demo_writes_disabled',
    )
    expect(evaluateWriteGuard({ method: 'get', level: '', ...off })).toBeNull()
  })
})

describe('choix de la clé', () => {
  it('choisit la clé selon le niveau, rien pour none ou inconnu', () => {
    expect(pickApiKey('read', KEYS)).toBe('fake-read-key')
    expect(pickApiKey('write', KEYS)).toBe('fake-write-key')
    expect(pickApiKey('delete', KEYS)).toBe('fake-delete-key')
    expect(pickApiKey('delete', { read: 'r', write: 'w' })).toBe('')
    expect(pickApiKey('none', KEYS)).toBe('')
    expect(pickApiKey('admin', KEYS)).toBe('')
  })

  it('applyUpstreamHeaders écrase une clé du navigateur et retire le sélecteur', () => {
    const headers = {
      'x-api-key': 'from-browser',
      authorization: 'Bearer browser',
      'proxy-authorization': 'x',
      'x-demo-key-level': 'write',
    }
    const proxyReq = {
      removeHeader: (n) => delete headers[n.toLowerCase()],
      setHeader: (n, v) => (headers[n.toLowerCase()] = v),
    }
    applyUpstreamHeaders(proxyReq, 'write', KEYS)
    expect(headers['x-api-key']).toBe('fake-write-key')
    expect(headers['x-demo-key-level']).toBeUndefined()
    expect(headers.authorization).toBeUndefined()
    expect(headers['proxy-authorization']).toBeUndefined()
    expect(headers.accept).toBe('application/json')
  })

  it('sanitizeResponseHeaders retire tout en-tête de clé', () => {
    const out = sanitizeResponseHeaders({
      'x-api-key': 'k',
      authorization: 'k',
      'proxy-authorization': 'k',
      'content-type': 'x',
    })
    expect(out).toEqual({ 'content-type': 'x' })
  })
})

describe('proxy réel (Vite + upstream factice)', () => {
  let upstream
  let server
  let base

  beforeAll(async () => {
    // L'upstream joue le pire cas : il renvoie la clé reçue dans ses en-têtes de réponse.
    upstream = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('X-Api-Key', String(req.headers['x-api-key'] ?? ''))
      res.setHeader('Authorization', 'Bearer leak')
      res.setHeader('Retry-After', '9')
      res.end(
        JSON.stringify({
          receivedKey: req.headers['x-api-key'] ?? null,
          receivedSelector: req.headers['x-demo-key-level'] ?? null,
          accept: req.headers.accept ?? null,
        }),
      )
    })
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    const target = `http://127.0.0.1:${upstream.address().port}`
    server = await createServer({
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      optimizeDeps: { noDiscovery: true, include: [] },
      server: {
        port: 0,
        host: '127.0.0.1',
        proxy: createProxyConfig({
          SEKUR_API_URL: target,
          SEKUR_API_KEY_READ: KEYS.read,
          SEKUR_API_KEY_WRITE: KEYS.write,
          SEKUR_API_KEY_DELETE: KEYS.delete,
        }),
      },
    })
    await server.listen()
    base = `http://127.0.0.1:${server.httpServer.address().port}`
  })

  afterAll(async () => {
    await server?.close()
    await new Promise((resolve) => upstream?.close(resolve))
  })

  const call = (level, extra = {}) =>
    fetch(`${base}/external/v1/me`, {
      headers: { Accept: 'application/json', 'X-Demo-Key-Level': level, ...extra },
    })

  it('ajoute la clé du niveau côté upstream et retire le sélecteur', async () => {
    const body = await (await call('write')).json()
    expect(body.receivedKey).toBe(KEYS.write)
    expect(body.receivedSelector).toBeNull()
    expect(body.accept).toBe('application/json')
    expect((await (await call('read')).json()).receivedKey).toBe(KEYS.read)
    expect((await (await call('delete')).json()).receivedKey).toBe(KEYS.delete)
  })

  it("n'ajoute aucune clé pour le niveau none, même si le navigateur en envoie une", async () => {
    const body = await (await call('none', { 'X-API-Key': 'from-browser' })).json()
    expect(body.receivedKey).toBeNull()
  })

  it('ne laisse aucune clé dans les en-têtes de réponse vers le navigateur', async () => {
    const res = await call('write')
    expect(res.headers.get('x-api-key')).toBeNull()
    expect(res.headers.get('authorization')).toBeNull()
    expect(res.headers.get('retry-after')).toBe('9')
    const visible = JSON.stringify([...res.headers.entries()])
    expect(visible).not.toContain(KEYS.write)
  })
})
