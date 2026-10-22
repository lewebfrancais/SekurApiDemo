import { describe, expect, it } from 'vitest'
import { methodColor, statusColor } from './verbs.js'

describe('couleurs des verbes (règle de l’Historique de Sekur)', () => {
  it('vert création, primaire modification, rouge suppression, gris lecture', () => {
    expect(methodColor('POST')).toBe('positive')
    expect(methodColor('patch')).toBe('primary')
    expect(methodColor('PUT')).toBe('primary')
    expect(methodColor('DELETE')).toBe('negative')
    expect(methodColor('GET')).toBe('grey-6')
    expect(methodColor('???')).toBe('grey-6')
  })

  it('colore le statut : succès, refus client, erreur serveur, absence de réponse', () => {
    expect(statusColor(201)).toBe('positive')
    expect(statusColor(403)).toBe('warning')
    expect(statusColor(503)).toBe('negative')
    expect(statusColor(null)).toBe('grey-6')
  })
})
