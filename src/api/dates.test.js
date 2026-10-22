import { describe, expect, it } from 'vitest'
import {
  daysBetween,
  fromDatetimeInput,
  shiftIso,
  toDateInput,
  tomorrowWindow,
  weekRange,
} from './dates.js'

describe('dates', () => {
  it("formate une date locale pour un champ date et pour l'API", () => {
    expect(toDateInput(new Date(2030, 0, 5))).toBe('2030-01-05')
    expect(fromDatetimeInput('2030-01-31T08:00')).toBe('2030-01-31T08:00:00')
  })

  it('calcule la semaine courante, lundi inclus et lundi suivant exclu', () => {
    // mercredi 2030-01-09
    expect(weekRange(new Date(2030, 0, 9))).toEqual({ from: '2030-01-07', to: '2030-01-14' })
    // dimanche 2030-01-13 appartient encore à la semaine du 7
    expect(weekRange(new Date(2030, 0, 13))).toEqual({ from: '2030-01-07', to: '2030-01-14' })
  })

  it('propose demain de 8 h à 16 h, à la seconde et sans fraction', () => {
    expect(tomorrowWindow(new Date(2030, 0, 9, 14, 30))).toEqual({
      startAt: '2030-01-10T08:00:00',
      endAt: '2030-01-10T16:00:00',
    })
  })

  it('compte les jours entre deux dates', () => {
    expect(daysBetween('2030-01-01', '2030-02-01')).toBe(31)
    expect(daysBetween('2030-01-01', '2030-01-01')).toBe(0)
  })

  it("décale un instant sans fraction de seconde (l'API refuse .000Z)", () => {
    expect(shiftIso('2030-01-31T08:00:00+01:00', 60)).toBe('2030-01-31T08:00:00Z')
    expect(shiftIso('2030-01-31T07:00:00Z', -30)).toBe('2030-01-31T06:30:00Z')
  })
  it('un lundi commence sa propre semaine', () => {
    expect(weekRange(new Date(2030, 0, 7))).toEqual({ from: '2030-01-07', to: '2030-01-14' })
  })

  it('shiftIso lève sur un instant illisible plutôt que de renvoyer une date fausse', () => {
    expect(() => shiftIso('', 60)).toThrow(RangeError)
  })
})
