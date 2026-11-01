import { describe, expect, it, vi } from 'vitest'
import { createClient } from './client.js'
import {
  PUBLISHED_OPTIONS,
  deleteService,
  deleteSuccessMessage,
  diffService,
  patchPublished,
  planningListQuery,
  serviceBody,
  serviceFormValues,
} from './planning.js'

const row = {
  id: 9,
  siteId: 35,
  title: 'Démo - A',
  activityType: 'intervention',
  startAt: '2030-01-31T08:00:00+01:00',
  endAt: '2030-01-31T16:00:00+01:00',
  published: false,
  agent: { id: 117, firstName: 'SEKUR', lastName: 'DÉMO' },
  specialty: null,
}

function fakeFetch() {
  return vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
}

const makeClient = (fetchImpl, level = 'read') =>
  createClient({ getKeyLevel: () => level, fetchImpl, uuid: () => 'uuid' })

describe('planning', () => {
  it("lit une vacation en valeurs de formulaire (heure locale de l'agence)", () => {
    expect(serviceFormValues(row)).toMatchObject({
      siteId: 35,
      agentId: 117,
      startAt: '2030-01-31T08:00',
      endAt: '2030-01-31T16:00',
      published: false,
    })
  })

  it('propose demain 8 h-16 h et le préfixe « Démo - » à la création', () => {
    const values = serviceFormValues(null)
    expect(values.title).toMatch(/^Démo - /)
    expect(values.startAt).toMatch(/T08:00$/)
    expect(values.endAt).toMatch(/T16:00$/)
  })

  it('construit le corps de création à la seconde, sans champs vides', () => {
    const body = serviceBody({ ...serviceFormValues(row), agentId: null, title: '' })
    expect(body).toEqual({
      siteId: 35,
      activityType: 'intervention',
      startAt: '2030-01-31T08:00:00',
      endAt: '2030-01-31T16:00:00',
      published: false,
    })
  })

  it('ne renvoie que les champs modifiés pour un PATCH', () => {
    const before = serviceFormValues(row)
    expect(diffService(before, { ...before })).toEqual({})
    expect(diffService(before, { ...before, published: true })).toEqual({ published: true })
    expect(
      diffService(before, { ...before, startAt: '2030-01-31T09:00', endAt: '2030-01-31T17:00' }),
    ).toEqual({ startAt: '2030-01-31T09:00:00', endAt: '2030-01-31T17:00:00' })
    expect(diffService(before, { ...before, agentId: null })).toEqual({ agentId: null })
  })

  it('garde collaborateur, spécialité et intitulé renseignés ; vide l’intitulé en PATCH', () => {
    const before = serviceFormValues(row)
    expect(serviceBody({ ...before, specialtyId: 3 })).toMatchObject({
      agentId: 117,
      specialtyId: 3,
      title: 'Démo - A',
    })
    expect(diffService(before, { ...before, title: '' })).toEqual({ title: '' })
  })

  it('filtre published : trois états', async () => {
    const urls = []
    for (const { value } of PUBLISHED_OPTIONS) {
      const fetchImpl = fakeFetch()
      const query = planningListQuery('services', {
        from: '2030-01-07',
        to: '2030-01-14',
        published: value,
      })
      await makeClient(fetchImpl).get('/services', query)
      urls.push(fetchImpl.mock.calls[0][0])
    }
    expect(urls).toEqual([
      '/external/v1/services?from=2030-01-07&to=2030-01-14',
      '/external/v1/services?from=2030-01-07&to=2030-01-14&published=true',
      '/external/v1/services?from=2030-01-07&to=2030-01-14&published=false',
    ])
  })

  it("planningListQuery n'envoie que les paramètres documentés", () => {
    const filters = {
      status: 'pending',
      customer: 4,
      updatedSince: '2030-01-01T00:00:00Z',
      site: 35,
      agent: 117,
      published: 'false',
      from: '2030-01-07',
      to: '2030-01-14',
    }
    expect(Object.keys(planningListQuery('breaks', filters)).sort()).toEqual([
      'agent',
      'from',
      'published',
      'site',
      'to',
    ])
    expect(Object.keys(planningListQuery('circuits', filters)).sort()).toEqual([
      'agent',
      'from',
      'published',
      'site',
      'status',
      'to',
    ])
  })

  it('planifier un brouillon', async () => {
    const fetchImpl = fakeFetch()
    await patchPublished(makeClient(fetchImpl, 'write'), 9, true)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/external/v1/services/9')
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe('{"published":true}')

    const withCodes = fakeFetch()
    await patchPublished(makeClient(withCodes, 'write'), 9, true, ['planning_overlap'])
    expect(JSON.parse(withCodes.mock.calls[0][1].body)).toEqual({
      published: true,
      acknowledgedWarnings: ['planning_overlap'],
    })
  })

  it("DELETE : acquittement dans l'URL", async () => {
    const fetchImpl = fakeFetch()
    await deleteService(makeClient(fetchImpl, 'delete'), 9, ['invoice_correction', 'x'])
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/external/v1/services/9?acknowledgedWarnings=invoice_correction%2Cx')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
    expect(Object.keys(init.headers)).not.toContain('Content-Type')

    const bare = fakeFetch()
    await deleteService(makeClient(bare, 'delete'), 9)
    expect(bare.mock.calls[0][0]).toBe('/external/v1/services/9')
  })

  it('DELETE rejoué : 204 sans effet sur une vacation déjà déprogrammée', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const exchange = await deleteService(makeClient(fetchImpl, 'delete'), 9)
    expect(exchange.response.ok).toBe(true)
    expect(deleteSuccessMessage({ id: 9, status: 'unprogrammed' })).toContain('204 sans effet')
    expect(deleteSuccessMessage({ id: 9, status: 'pending' })).toBe(
      'Vacation supprimée (déprogrammée).',
    )
  })
})
