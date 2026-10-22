import { describe, expect, it } from 'vitest'
import { explainError, formatError, retryAfterSeconds } from './errors.js'

const res = (status, body, headers = {}) => ({ status, body, headers })

describe('formatError', () => {
  it('résume un 422 avec reason, violations et avertissements', () => {
    const out = formatError(
      res(422, {
        code: 422,
        message: 'Corps invalide',
        reason: 'validation_failed',
        violations: [{ field: 'siteId', message: 'Champ obligatoire.' }],
        warnings: [],
      }),
    )
    expect(out).toMatchObject({
      status: 422,
      reason: 'validation_failed',
      message: 'Corps invalide',
    })
    expect(out.violations).toEqual([{ field: 'siteId', message: 'Champ obligatoire.' }])
  })

  it('lit Retry-After en secondes, null si absent ou invalide', () => {
    expect(retryAfterSeconds({ 'retry-after': '30' })).toBe(30)
    expect(retryAfterSeconds({})).toBeNull()
    expect(retryAfterSeconds({ 'retry-after': 'soon' })).toBeNull()
  })

  it('tolère un corps non JSON', () => {
    expect(formatError(res(502, '<html>'))).toMatchObject({ status: 502, message: null })
  })
})

describe('explainError', () => {
  it('ne dit rien pour un succès', () => {
    expect(explainError(res(200, {}))).toBeNull()
  })

  it.each([
    [401, /Clé absente ou invalide/],
    [403, /Niveau de clé insuffisant/],
    [404, /autre agence/],
    [413, /4 Mio/],
    [422, /Écriture refusée/],
    [429, /Limite de débit/],
  ])('explique le %i en français', (status, pattern) => {
    const out = explainError(res(status, { reason: 'business_rule' }))
    expect(`${out.title} ${out.text}`).toMatch(pattern)
    expect(out.text.length).toBeGreaterThan(20)
  })

  it('cite le délai Retry-After pour un 429', () => {
    const out = explainError(res(429, {}, { 'retry-after': '17' }))
    expect(out.text).toContain('17 s')
  })

  it('détaille la règle pour un 422 business_rule et confirmation_required', () => {
    expect(explainError(res(422, { reason: 'business_rule' })).text).toMatch(/règle métier/)
    expect(explainError(res(422, { reason: 'confirmation_required' })).text).toContain(
      'acknowledgedWarnings',
    )
  })
  it.each([400, 405, 415, 503, 502])(
    'explique aussi le %i, ou donne un titre générique',
    (status) => {
      const out = explainError(res(status, {}))
      expect(out.title).toMatch(new RegExp(`^${status} - `))
      expect(out.text.length).toBeGreaterThan(20)
    },
  )

  it('distingue le 403 local de la démo (écritures désactivées) du 403 de l’API', () => {
    expect(explainError(res(403, { reason: 'demo_writes_disabled' })).title).toMatch(
      /désactivées par la démo/,
    )
    expect(explainError(res(403, {})).title).toMatch(/Niveau de clé insuffisant/)
  })

  it('ne dit rien sans réponse ; texte générique pour un 422 inconnu ; code = statut sans body.code', () => {
    expect(explainError(null)).toBeNull()
    expect(explainError(res(422, { reason: 'mystere' })).text).toMatch(
      /règle de validation ou une règle métier/,
    )
    expect(formatError(res(502, {})).code).toBe(502)
  })
})
