import { describe, expect, it } from 'vitest'
import { diffService, filterRows, serviceBody, serviceFormValues } from './planning.js'

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

  it('filtre localement les non publiées par plage, site et collaborateur', () => {
    const rows = [
      row,
      { ...row, id: 10, startAt: '2030-02-05T08:00:00+01:00' },
      { ...row, id: 11, siteId: 7 },
      { ...row, id: 12, agent: null },
    ]
    const range = { from: '2030-01-30', to: '2030-02-01' }
    expect(filterRows(rows, range).map((r) => r.id)).toEqual([9, 11, 12])
    expect(filterRows(rows, { ...range, site: 35 }).map((r) => r.id)).toEqual([9, 12])
    expect(filterRows(rows, { ...range, agent: 117 }).map((r) => r.id)).toEqual([9, 11])
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

  it('exclut la borne de fin et les vacations sans date', () => {
    const rows = [
      { ...row, startAt: '2030-02-01T00:00:00+01:00' },
      { ...row, startAt: null },
    ]
    expect(filterRows(rows, { from: '2030-01-30', to: '2030-02-01' })).toEqual([])
    expect(filterRows([row], { from: '2030-01-31', to: '2030-02-01', site: 35 })).toHaveLength(1)
  })
})
