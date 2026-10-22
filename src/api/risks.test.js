import { describe, expect, it } from 'vitest'
import {
  BATCH_MAX,
  PRICING_WARNING,
  batchCount,
  buildBatchBody,
  buildWarnings,
  entityLabel,
  isDemoName,
  realItemWarning,
  removedStepIds,
  targetOf,
} from './risks.js'

const op = (method, path) => ({ id: `${method} ${path}`, method, path, parameters: [] })

describe('éléments de démonstration', () => {
  it('reconnaît le préfixe « Démo »', () => {
    expect(isDemoName('Démo - Article')).toBe(true)
    expect(isDemoName('Démo Client 12h30')).toBe(true)
    expect(isDemoName('Intermarché')).toBe(false)
    expect(isDemoName('Mon Démo')).toBe(false)
  })

  it("trouve l'élément visé et son libellé", () => {
    expect(targetOf(op('PATCH', '/external/v1/sites/{id}/specialties/{specialtyId}'))).toEqual({
      segment: 'sites',
      param: 'id',
    })
    expect(targetOf(op('GET', '/external/v1/me'))).toBeNull()
    expect(entityLabel({ designation: '<p>Démo - Remise</p>' })).toBe('Démo - Remise')
    expect(entityLabel({ firstName: 'Paul', lastName: 'Durand' })).toBe('Paul Durand')
    expect(entityLabel({ title: 'Tournée' })).toBe('Tournée')
  })
})

describe('lot de vacations', () => {
  it('génère 10 vacations de démo par défaut, plafonnées à 800', () => {
    const body = buildBatchBody(undefined, 7, new Date(2030, 0, 9))
    expect(body.services).toHaveLength(10)
    expect(body.services[0]).toMatchObject({
      siteId: 7,
      published: false,
      title: 'Démo - lot 1/10',
    })
    expect(buildBatchBody(5000, 7).services).toHaveLength(BATCH_MAX)
  })

  it('compte les vacations du corps, 0 si illisible', () => {
    expect(batchCount('{"services":[{},{}]}')).toBe(2)
    expect(batchCount('{nope')).toBe(0)
  })
})

describe('avertissements', () => {
  const batch = op('POST', '/external/v1/services/batch')

  it('annonce le nombre de vacations créées', () => {
    const w = buildWarnings({ operation: batch, bodyText: '{"services":[{},{},{}]}', values: {} })
    expect(w).toEqual(['Cette requête crée 3 vacations dans votre agence.'])
  })

  it('prévient seulement quand invoice_correction est acquitté', () => {
    const del = op('DELETE', '/external/v1/services/{id}')
    expect(buildWarnings({ operation: del, bodyText: '', values: {} })).toEqual([])
    expect(
      buildWarnings({
        operation: del,
        bodyText: '',
        values: { acknowledgedWarnings: 'invoice_correction' },
      }),
    ).toEqual(['Cette suppression corrige une facture déjà émise.'])
  })

  it('prévient quand un PATCH de tournée retire des étapes, pas sinon', () => {
    const patch = op('PATCH', '/external/v1/circuits/{id}')
    expect(
      buildWarnings({ operation: patch, bodyText: '{}', values: {}, removedSteps: 0 }),
    ).toEqual([])
    expect(
      buildWarnings({ operation: patch, bodyText: '{}', values: {}, removedSteps: 2 })[0],
    ).toMatch(/retire 2 étape.*clé de niveau suppression/)
  })

  it('calcule les étapes retirées par une liste steps', () => {
    const current = [{ id: 1 }, { id: 2 }, { id: 3 }]
    expect(removedStepIds(current, '{"steps":[{"id":1},{"siteId":9}]}')).toEqual([2, 3])
    expect(removedStepIds(current, '{"steps":[]}')).toEqual([1, 2, 3])
    expect(removedStepIds(current, '{"title":"x"}')).toEqual([])
  })

  it("réutilise l'avertissement de tarification de l'écran Catalogue", () => {
    const w = buildWarnings({
      operation: op('PATCH', '/external/v1/pricing-settings'),
      bodyText: '{}',
      values: {},
    })
    expect(w).toEqual([PRICING_WARNING])
    expect(PRICING_WARNING).toContain(
      'tarification par défaut de tous les sites sans réglages propres',
    )
  })

  it('signale un élément réel pour une écriture, jamais pour une lecture ou un élément Démo', () => {
    const patch = op('PATCH', '/external/v1/customers/{id}')
    const base = { bodyText: '{}', values: {} }
    expect(buildWarnings({ ...base, operation: patch, targetLabel: 'Intermarché' })[0]).toMatch(
      /Élément réel de l’agence/,
    )
    expect(buildWarnings({ ...base, operation: patch, targetLabel: 'Démo - Client' })).toEqual([])
    expect(
      buildWarnings({
        ...base,
        operation: op('GET', '/external/v1/customers/{id}'),
        targetLabel: 'Intermarché',
      }),
    ).toEqual([])
  })
  it('signale un élément réel même sans nom, jamais une cible inconnue', () => {
    const patch = op('PATCH', '/external/v1/customers/{id}')
    const base = { bodyText: '{}', values: {}, operation: patch }
    expect(buildWarnings({ ...base, targetLabel: '' })[0]).toMatch(/sans nom/)
    expect(buildWarnings({ ...base, targetLabel: null })).toEqual([])
    expect(realItemWarning('Démo - Site')).toBeNull()
    expect(realItemWarning(undefined, 'une vacation', 'sans intitulé')).toMatch(/sans intitulé/)
  })

  it.each([
    [0, 1],
    [-5, 1],
    ['', 10],
    ['abc', 10],
    [null, 10],
    [3, 3],
  ])('buildBatchBody(%s) crée %i vacation(s)', (count, n) => {
    expect(buildBatchBody(count, 7).services).toHaveLength(n)
  })

  it('removedStepIds ignore un JSON illisible', () => {
    expect(removedStepIds([{ id: 1 }], '{nope')).toEqual([])
  })
})
