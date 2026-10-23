import { describe, expect, it, vi } from 'vitest'
import {
  BURST_CONCURRENCY,
  MAX_BURST,
  OVERSIZED_BODY_CHARS,
  businessRule,
  forbidden,
  notFound,
  overlap,
  payloadTooLarge,
  rateLimit,
  unauthorized,
} from './scenarios.js'

const ex = (status) => ({ response: { status }, request: {} })

describe('scénarios pédagogiques', () => {
  it('401 : appel sans clé (niveau none)', async () => {
    const api = { get: vi.fn(async () => ex(401)) }
    await unauthorized(api)
    expect(api.get).toHaveBeenCalledWith('/me', undefined, { keyLevel: 'none' })
  })

  const meWith = (accessLevel) => ({
    response: { status: 200, body: { apiKey: { accessLevel } } },
    request: {},
  })

  it('403 : écriture avec la clé lecture, après avoir vérifié qu’elle est bien en lecture seule', async () => {
    const api = { get: vi.fn(async () => meWith('read')), post: vi.fn(async () => ex(403)) }
    await forbidden(api)
    expect(api.post.mock.calls[0][2]).toEqual({ keyLevel: 'read' })
  })

  it('403 : n’écrit rien si la clé lecture a en réalité des droits d’écriture', async () => {
    const api = { get: vi.fn(async () => meWith('read_write')), post: vi.fn() }
    const out = await forbidden(api)
    expect(api.post).not.toHaveBeenCalled()
    expect(out.note).toMatch(/scénario annulé/)
  })

  // Simule une fenêtre glissante : X-RateLimit-Remaining décroît, 429 au-delà de `limit` requêtes.
  const limitedApi = (limit) => {
    let used = 0
    return {
      get: vi.fn(async () => {
        used += 1
        const headers = { 'x-ratelimit-remaining': String(Math.max(limit - used, 0)) }
        return { response: { status: used > limit ? 429 : 200, headers }, request: {} }
      }),
    }
  }

  it('429 : lit Remaining puis envoie Remaining + 1 requêtes, et s’arrête au premier 429', async () => {
    const api = limitedApi(120)
    const out = await rateLimit(api)
    expect(out.exchange.response.status).toBe(429)
    expect(out.note).toMatch(/Limite atteinte après 121/)
    expect(api.get).toHaveBeenCalledTimes(121)
  })

  it('429 : utilise toujours la clé lecture, jamais la clé écriture', async () => {
    const api = limitedApi(20)
    await rateLimit(api)
    for (const call of api.get.mock.calls) expect(call[2]).toEqual({ keyLevel: 'read' })
  })

  it('429 : ne teste que le quota de lecture, sans aucune écriture', async () => {
    const api = { ...limitedApi(20), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
    await rateLimit(api)
    for (const method of ['post', 'patch', 'delete']) expect(api[method]).not.toHaveBeenCalled()
  })

  it('429 : plafonne à 150 requêtes et signale « limite non atteinte »', async () => {
    const api = limitedApi(1000)
    const out = await rateLimit(api)
    expect(api.get).toHaveBeenCalledTimes(MAX_BURST + 1)
    expect(out.note).toMatch(/Limite non atteinte après 151/)
  })

  it('429 : rend la main tout de suite si la première requête est déjà limitée', async () => {
    const api = limitedApi(0)
    const out = await rateLimit(api)
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(out.note).toMatch(/déjà atteinte/)
  })

  it('413 : le corps dépasse 4 Mio et part avec la clé écriture', async () => {
    const api = { post: vi.fn(async () => ex(413)) }
    await payloadTooLarge(api)
    const [path, body, options] = api.post.mock.calls[0]
    expect(path).toBe('/services')
    expect(body.length).toBeGreaterThan(4 * 1024 * 1024)
    expect(body.length).toBeGreaterThan(OVERSIZED_BODY_CHARS)
    expect(options).toEqual({ keyLevel: 'write' })
  })
  it('404 : lit un identifiant inexistant avec la clé lecture', async () => {
    const api = { get: vi.fn(async () => ex(404)) }
    await notFound(api)
    expect(api.get).toHaveBeenCalledWith('/services/2147483647', undefined, { keyLevel: 'read' })
  })

  it('422 règle métier : fin avant début, avec la clé écriture', async () => {
    const api = { post: vi.fn(async () => ex(422)) }
    await businessRule(api, { siteId: 7 })
    const [path, body, options] = api.post.mock.calls[0]
    expect(path).toBe('/services')
    expect(body.endAt < body.startAt).toBe(true)
    expect(options).toEqual({ keyLevel: 'write' })
  })

  it('422 chevauchement : deux POST identiques et non publiés avec la clé écriture, renvoie le second', async () => {
    const api = { post: vi.fn(async () => ex(201)) }
    const out = await overlap(api, { siteId: 7, agentId: 117, now: new Date(2030, 0, 9) })
    expect(api.post).toHaveBeenCalledTimes(2)
    expect(api.post.mock.calls[0][1]).toEqual(api.post.mock.calls[1][1])
    expect(api.post.mock.calls[0][2]).toEqual({ keyLevel: 'write' })
    expect(out.retryBody).toMatchObject({
      siteId: 7,
      agentId: 117,
      published: false,
      startAt: '2030-01-10T08:00:00',
    })
    expect(out.previous).not.toBe(out.exchange)
  })

  it('429 : sans X-RateLimit-Remaining, envoie jusqu’au plafond et s’arrête au premier 429', async () => {
    let used = 0
    const api = {
      get: vi.fn(async () => ({
        response: { status: ++used > 30 ? 429 : 200, headers: {} },
        request: {},
      })),
    }
    const out = await rateLimit(api)
    expect(out.exchange.response.status).toBe(429)
    expect(api.get.mock.calls.length).toBeGreaterThan(30)
    expect(api.get.mock.calls.length).toBeLessThanOrEqual(31 + BURST_CONCURRENCY)
  })
})
