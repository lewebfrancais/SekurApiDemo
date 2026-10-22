import http from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'vite'
import { demoConfigPlugin, isPayloadTooLargeDocumented } from './demo-config-plugin.js'
import { createProxyConfig } from './sekur-proxy.js'

const spec = (responses) => ({ paths: { '/external/v1/services': { post: { responses } } } })
const BASE_ENV = { SEKUR_API_URL: 'https://api.example.com', SEKUR_API_KEY_READ: 'fake-read-key' }

// Serveur Vite minimal avec le plugin (et le proxy si `proxy` est donné), fermé après `fn`.
async function withServer({ env = BASE_ENV, fetchImpl, proxy = false }, fn) {
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { port: 0, host: '127.0.0.1', ...(proxy ? { proxy: createProxyConfig(env) } : {}) },
    plugins: [demoConfigPlugin(env, { fetchImpl })],
  })
  await server.listen()
  try {
    return await fn(`http://127.0.0.1:${server.httpServer.address().port}`)
  } finally {
    await server.close()
  }
}

describe('isPayloadTooLargeDocumented', () => {
  it('détecte le 413 documenté sur POST /external/v1/services', () => {
    expect(isPayloadTooLargeDocumented(spec({ 201: {}, 413: {} }))).toBe(true)
    expect(isPayloadTooLargeDocumented(spec({ 201: {} }))).toBe(false)
    expect(isPayloadTooLargeDocumented({})).toBe(false)
    expect(isPayloadTooLargeDocumented(null)).toBe(false)
  })
})

describe('GET /demo/config', () => {
  const getConfig = (fetchImpl, extraEnv = {}) =>
    withServer(
      { env: { ...BASE_ENV, SEKUR_API_KEY_WRITE: '', ...extraEnv }, fetchImpl },
      async (base) => (await fetch(`${base}/demo/config`)).text(),
    )

  it("indique l'état des clés sans jamais les renvoyer", async () => {
    const text = await getConfig(async () => Response.json(spec({ 413: {} })))
    const config = JSON.parse(text)
    expect(config.keys).toEqual({ read: true, write: false, delete: false })
    expect(config.apiHost).toBe('api.example.com')
    expect(config.appUrl).toBe('https://platform.sekur.fr')
    expect(config.payloadTooLargeDocumented).toBe(true)
    expect(config).toMatchObject({ writes: false, stress: false })
    expect(text).not.toContain('fake-read-key')
  })

  it('expose les drapeaux de sécurité activés et le lien vers Sekur', async () => {
    const text = await getConfig(async () => Response.json(spec({})), {
      DEMO_ALLOW_WRITES: 'true',
      DEMO_ALLOW_STRESS: 'true',
      SEKUR_APP_URL: 'https://app.example.com',
    })
    expect(JSON.parse(text)).toMatchObject({
      writes: true,
      stress: true,
      appUrl: 'https://app.example.com',
    })
  })

  it('masque le scénario 413 si la spec ne le documente pas ou est injoignable', async () => {
    const text = await getConfig(async () => {
      throw new Error('réseau')
    })
    expect(JSON.parse(text).payloadTooLargeDocumented).toBe(false)
  })
})

describe('GET /demo/spec', () => {
  it('relaie la spec et ne la retélécharge pas tant que le cache est valide', async () => {
    const fetchImpl = vi.fn(async () => Response.json(spec({ 413: {} })))
    await withServer({ fetchImpl }, async (base) => {
      const [first, second] = await Promise.all([
        fetch(`${base}/demo/spec`),
        fetch(`${base}/demo/spec`),
      ])
      expect(first.status).toBe(200)
      expect(await second.json()).toEqual(spec({ 413: {} }))
      expect((await fetch(`${base}/demo/config`)).status).toBe(200)
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('répond 502 quand la spec est injoignable, sans renvoyer de clé', async () => {
    await withServer(
      { fetchImpl: async () => new Response('nope', { status: 404 }) },
      async (base) => {
        const res = await fetch(`${base}/demo/spec`)
        expect(res.status).toBe(502)
        expect(await res.text()).not.toContain('fake-read-key')
      },
    )
  })
})

describe('lecture seule sur /external (garde + proxy réel)', () => {
  const hits = []
  let upstream
  let target

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      hits.push({ method: req.method, url: req.url, key: req.headers['x-api-key'] ?? null })
      res.setHeader('Content-Type', 'application/json')
      res.end('{"ok":true}')
    })
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    target = `http://127.0.0.1:${upstream.address().port}`
  })
  afterAll(() => new Promise((resolve) => upstream.close(resolve)))
  beforeEach(() => hits.splice(0))

  // L'API factice répond à la vérification GET /me (niveau réel de la clé lecture) et à la spec.
  const api = (accessLevel) => async (url) =>
    String(url).endsWith('/me') ? Response.json({ apiKey: { accessLevel } }) : Response.json({})

  function post(extraEnv, level, { path = '/external/v1/customers', accessLevel = 'read' } = {}) {
    const env = {
      SEKUR_API_URL: target,
      SEKUR_API_KEY_READ: 'fake-read-key',
      SEKUR_API_KEY_WRITE: 'fake-write-key',
      ...extraEnv,
    }
    return withServer({ env, fetchImpl: api(accessLevel), proxy: true }, async (base) => {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'X-Demo-Key-Level': level, 'Content-Type': 'application/json' },
        body: '{}',
      })
      return { status: res.status, body: await res.json().catch(() => null) }
    })
  }

  it("refuse une écriture avec la clé écriture tant que DEMO_ALLOW_WRITES n'est pas activé : l'upstream ne voit rien", async () => {
    const out = await post({}, 'write')
    expect(out.status).toBe(403)
    expect(out.body.reason).toBe('demo_writes_disabled')
    expect(hits).toEqual([])
  })

  it('ne laisse pas un chemin encodé contourner la garde', async () => {
    const out = await post({}, 'write', { path: '/external%2Fv1/customers' })
    expect(out.status).toBe(403)
    expect(hits).toEqual([])
  })

  it("transmet une écriture autorisée à l'upstream, avec la clé écriture", async () => {
    const out = await post({ DEMO_ALLOW_WRITES: 'true' }, 'write')
    expect(out.status).toBe(200)
    expect(hits).toEqual([{ method: 'POST', url: '/external/v1/customers', key: 'fake-write-key' }])
  })

  it('transmet une écriture « clé lecture » seulement si cette clé est vraiment en lecture', async () => {
    expect((await post({}, 'read')).status).toBe(200)
    expect(hits.map((h) => h.key)).toEqual(['fake-read-key'])
    hits.splice(0)
    const out = await post({}, 'read', { accessLevel: 'read_write' })
    expect(out.status).toBe(403)
    expect(out.body.reason).toBe('demo_read_key_not_read_only')
    expect(hits).toEqual([])
  })
})
