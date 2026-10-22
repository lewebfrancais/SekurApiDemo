import { describe, expect, it } from 'vitest'
import {
  LEVELS,
  RESOURCES,
  acknowledgedQuery,
  buildBody,
  initialValues,
  itemPath,
  listPath,
  pricingBody,
  resourcesOf,
} from './catalog.js'

const byKey = (key) => RESOURCES.find((r) => r.key === key)

describe('catalogue : ressources par niveau', () => {
  it('couvre agence, client et site', () => {
    expect(LEVELS.map((l) => l.key)).toEqual(['agency', 'customer', 'site'])
    expect(resourcesOf('agency').map((r) => r.key)).toEqual([
      'articles',
      'specialties',
      'discounts',
      'pricing',
    ])
    expect(resourcesOf('customer')).toHaveLength(3)
    expect(resourcesOf('site')).toHaveLength(2)
  })

  it('construit les chemins de liste et de ligne', () => {
    expect(listPath(byKey('articles'), null)).toBe('/articles')
    expect(itemPath(byKey('articles'), null, { id: 7 })).toBe('/articles/7')
    expect(listPath(byKey('customer-specialties'), 42)).toBe('/customers/42/specialties')
    expect(itemPath(byKey('customer-specialties'), 42, { specialtyId: 9 })).toBe(
      '/customers/42/specialties/9',
    )
    expect(itemPath(byKey('site-specialties'), 5, { specialtyId: 3 })).toBe(
      '/sites/5/specialties/3',
    )
    expect(listPath(byKey('site-pricing'), 5)).toBe('/sites/5/pricing-settings')
  })

  it("ne propose pas de suppression d'une spécialité d'agence (405 côté API)", () => {
    expect(byKey('specialties').canDelete).toBe(false)
    expect(byKey('articles').canDelete).toBe(true)
  })
})

describe('buildBody', () => {
  it("convertit nombres et liste d'IDs, et omet les champs vides", () => {
    const body = buildBody(
      byKey('articles'),
      {
        name: 'Démo - A',
        description: '<p>x</p>',
        unitPriceExclTax: '12.5',
        specialtyIds: [1, '2', 3],
      },
      'create',
    )
    expect(body).toEqual({
      name: 'Démo - A',
      description: '<p>x</p>',
      unitPriceExclTax: 12.5,
      specialtyIds: [1, 2, 3],
    })
    expect(
      buildBody(byKey('articles'), { name: 'x', description: '', unitPriceExclTax: '' }, 'create'),
    ).toEqual({
      name: 'x',
    })
  })

  it('ajoute customerId à la création d’une remise de client, jamais en modification', () => {
    const values = { designation: '<p>d</p>', type: 'fixed', value: '20' }
    expect(buildBody(byKey('customer-discounts'), values, 'create', 42)).toMatchObject({
      customerId: 42,
      value: 20,
    })
    expect(buildBody(byKey('customer-discounts'), values, 'update', 42)).not.toHaveProperty(
      'customerId',
    )
  })

  it('ne renvoie pas les champs non modifiables en modification (specialtyId, referenceId)', () => {
    const values = { specialtyId: '9', description: '<p>c</p>' }
    expect(buildBody(byKey('site-specialties'), values, 'create')).toHaveProperty('specialtyId', 9)
    expect(buildBody(byKey('site-specialties'), values, 'update')).toEqual({
      description: '<p>c</p>',
    })
    expect(buildBody(byKey('specialties'), { referenceId: '4', name: 'n' }, 'update')).toEqual({
      name: 'n',
    })
  })

  it('parse la grille de tarifs JSON et lève sur un JSON invalide', () => {
    const body = buildBody(
      byKey('customer-specialties'),
      { specialtyId: 1, hourlyRatesExclTax: '{"day": 20}' },
      'create',
    )
    expect(body.hourlyRatesExclTax).toEqual({ day: 20 })
    expect(() =>
      buildBody(byKey('customer-specialties'), { hourlyRatesExclTax: '{nope' }, 'create'),
    ).toThrow(SyntaxError)
  })
})

describe('valeurs initiales et réglages', () => {
  it("préremplit la création avec l'exemple « Démo - » et la modification avec la ligne", () => {
    expect(initialValues(byKey('articles')).name).toMatch(/^Démo - /)
    const edit = initialValues(byKey('articles'), {
      name: 'N',
      specialtyIds: [1, 2],
      unitPriceExclTax: 3,
    })
    expect(edit).toMatchObject({ name: 'N', specialtyIds: [1, 2], unitPriceExclTax: 3 })
    const override = initialValues(byKey('site-specialties'), { ownHourlyRatesExclTax: { day: 1 } })
    expect(JSON.parse(override.hourlyRatesExclTax)).toEqual({ day: 1 })
  })

  it('extrait des réglages lus seulement les champs modifiables', () => {
    const body = pricingBody({
      currency: 'EUR',
      saturdayCounted: true,
      rateSource: 'agency_settings',
      dayHourlyRateExclTax: 25,
      multipliers: { night: 1.2 },
    })
    expect(body).toEqual({ dayHourlyRateExclTax: 25, multipliers: { night: 1.2 } })
  })

  it('réécrit la fiche de dépassement lue en overrunSpecialtyId', () => {
    const body = pricingBody({
      dayHourlyRateExclTax: 25,
      circuit: { unitPriceExclTax: 30, overrunSpecialty: { id: 12, name: 'Rondier' } },
      intervention: { unitPriceExclTax: 60, overrunSpecialty: null },
      mobileRound: { unitPriceExclTax: 30 },
    })
    expect(body.circuit).toEqual({ unitPriceExclTax: 30, overrunSpecialtyId: 12 })
    expect(body.intervention).toEqual({ unitPriceExclTax: 60, overrunSpecialtyId: null })
    expect(body.mobileRound).toEqual({ unitPriceExclTax: 30 })
  })

  it("formate l'acquittement d'une suppression", () => {
    expect(acknowledgedQuery(['planned_services'])).toBe('planned_services')
  })
  it('envoie une liste vide en modification (elle vide la liste), jamais à la création', () => {
    expect(buildBody(byKey('articles'), { specialtyIds: [] }, 'update')).toEqual({
      specialtyIds: [],
    })
    expect(buildBody(byKey('articles'), { specialtyIds: [] }, 'create')).toEqual({})
  })
})
