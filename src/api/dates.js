// Dates de la démo : formats attendus par l'API (ISO 8601 à la seconde, sans fraction).

const pad = (n) => String(n).padStart(2, '0')

export function toDateInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function toDatetimeInput(date) {
  return `${toDateInput(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromDatetimeInput(value) {
  return `${value}:00`
}

export function weekRange(now = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const next = new Date(monday)
  next.setDate(next.getDate() + 7)
  return { from: toDateInput(monday), to: toDateInput(next) }
}

export function tomorrowWindow(now = new Date(), startHour = 8, endHour = 16) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const at = (hour) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0)
  return {
    startAt: fromDatetimeInput(toDatetimeInput(at(startHour))),
    endAt: fromDatetimeInput(toDatetimeInput(at(endHour))),
  }
}

// Limites de l'API sur GET /services : 31 jours, 90 avec updatedSince.
export const MAX_RANGE_DAYS = 31
export const MAX_RANGE_DAYS_SYNC = 90

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}

/** Décale un instant ISO de `minutes` ; renvoie de l'UTC à la seconde (`...Z`), sans fraction. */
export function shiftIso(iso, minutes) {
  return new Date(Date.parse(iso) + minutes * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function formatDateTime(iso) {
  return iso ? new Date(iso).toLocaleString('fr-FR') : ''
}
