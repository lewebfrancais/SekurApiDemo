// Couleurs des verbes HTTP : vert création, ardoise modification, rouge suppression, gris lecture.
const COLORS = {
  GET: 'grey-6',
  POST: 'positive',
  PATCH: 'primary',
  PUT: 'primary',
  DELETE: 'negative',
}

export const methodColor = (method) => COLORS[String(method).toUpperCase()] ?? 'grey-6'

export function statusColor(status) {
  if (!status) return 'grey-6'
  if (status < 300) return 'positive'
  return status < 500 ? 'warning' : 'negative'
}
