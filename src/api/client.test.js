import { describe, expect, it, vi } from 'vitest'
import { createClient } from './client.js'

function fakeFetch(status = 200, body = { ok: true }, headers = {}) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers }))
}

function makeClient(fetchImpl, level = 'read') {
  let n = 0
  return createClient({
    getKeyLevel: () => level,
    fetchImpl,
    uuid: () => `uuid-${++n}`,
  })
}

describe('client HTTP', () => {
  it('appelle /external/v1 en relatif avec Accept: application/json', async () => {
    const fetchImpl = fakeFetch()
    await makeClient(fetchImpl).get('/me')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/external/v1/me')
    expect(init.headers.Accept).toBe('application/json')
  })

  it("n'envoie jamais de clé API : seulement le sélecteur de niveau", async () => {
    const fetchImpl = fakeFetch()
    await makeClient(fetchImpl, 'write').get('/me')
    const headers = fetchImpl.mock.calls[0][1].headers
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('x-api-key')
    expect(headers['X-Demo-Key-Level']).toBe('write')
  })

  it('permet de forcer un niveau (scénario 401 sans clé)', async () => {
    const fetchImpl = fakeFetch(401, { code: 401 })
    await makeClient(fetchImpl, 'read').get('/me', undefined, { keyLevel: 'none' })
    expect(fetchImpl.mock.calls[0][1].headers['X-Demo-Key-Level']).toBe('none')
  })

  it('ajoute une Idempotency-Key unique sur chaque POST, jamais sur un GET', async () => {
    const fetchImpl = fakeFetch(201)
    const client = makeClient(fetchImpl, 'write')
    await client.post('/customers', { name: 'A' })
    await client.post('/customers', { name: 'A' })
    await client.get('/customers')
    const [first, second, get] = fetchImpl.mock.calls.map((c) => c[1].headers)
    expect(first['Idempotency-Key']).toBeTruthy()
    expect(second['Idempotency-Key']).toBeTruthy()
    expect(first['Idempotency-Key']).not.toBe(second['Idempotency-Key'])
    expect(get['Idempotency-Key']).toBeUndefined()
  })

  it('DELETE : sans corps ni Idempotency-Key, avec ?acknowledgedWarnings', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const exchange = await makeClient(fetchImpl, 'delete').delete('/articles/7', {
      acknowledgedWarnings: 'planned_services',
    })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/external/v1/articles/7?acknowledgedWarnings=planned_services')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
    expect(init.headers['Idempotency-Key']).toBeUndefined()
    expect(init.headers['Content-Type']).toBeUndefined()
    expect(exchange.response.status).toBe(204)
  })

  it('envoie Content-Type: application/json et le corps JSON sur une écriture', async () => {
    const fetchImpl = fakeFetch(200)
    await makeClient(fetchImpl, 'write').patch('/services/1', { title: 'x' })
    const init = fetchImpl.mock.calls[0][1]
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"title":"x"}')
  })

  it("ignore les paramètres de requête vides et construit l'URL", async () => {
    const fetchImpl = fakeFetch()
    await makeClient(fetchImpl).get('/sites', {
      page: 2,
      limit: 10,
      customer: '',
      status: undefined,
    })
    expect(fetchImpl.mock.calls[0][0]).toBe('/external/v1/sites?page=2&limit=10')
  })

  it('renvoie la réponse brute (statut, en-têtes en minuscules, corps JSON) sans lever sur une erreur HTTP', async () => {
    const body = { code: 429, message: 'Trop de requêtes' }
    const fetchImpl = fakeFetch(429, body, { 'Retry-After': '12' })
    const onExchange = vi.fn()
    const client = createClient({ getKeyLevel: () => 'read', fetchImpl, onExchange })
    const exchange = await client.get('/me')
    expect(exchange.response.status).toBe(429)
    expect(exchange.response.ok).toBe(false)
    expect(exchange.response.headers['retry-after']).toBe('12')
    expect(exchange.response.body).toEqual(body)
    expect(onExchange).toHaveBeenCalledWith(exchange)
  })

  it('consigne une erreur réseau au lieu de lever', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const exchange = await makeClient(fetchImpl).get('/me')
    expect(exchange.response).toBeNull()
    expect(exchange.networkError).toBe('fetch failed')
  })

  it("tronque l'aperçu d'un gros corps mais garde sa taille réelle", async () => {
    const fetchImpl = fakeFetch(413, { code: 413 })
    const big = JSON.stringify({ title: 'a'.repeat(5000) })
    const exchange = await makeClient(fetchImpl, 'write').post('/services', big)
    expect(exchange.request.bodyPreview.length).toBeLessThan(big.length)
    expect(exchange.request.bodyBytes).toBe(big.length)
  })
})
