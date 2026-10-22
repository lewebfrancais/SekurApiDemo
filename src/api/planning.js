import { fromDatetimeInput, tomorrowWindow } from './dates.js'

export function serviceFormValues(row) {
  if (row) {
    return {
      siteId: row.siteId ?? null,
      agentId: row.agent?.id ?? null,
      activityType: row.activityType ?? 'intervention',
      specialtyId: row.specialty?.id ?? null,
      // L'API renvoie l'heure de l'agence avec son décalage : on garde l'heure locale.
      startAt: String(row.startAt ?? '').slice(0, 16),
      endAt: String(row.endAt ?? '').slice(0, 16),
      title: row.title ?? '',
      published: Boolean(row.published),
    }
  }
  const window = tomorrowWindow()
  return {
    siteId: null,
    agentId: null,
    activityType: 'intervention',
    specialtyId: null,
    startAt: window.startAt.slice(0, 16),
    endAt: window.endAt.slice(0, 16),
    title: 'Démo - vacation',
    published: false,
  }
}

export function serviceBody(values) {
  const body = {
    siteId: values.siteId,
    activityType: values.activityType,
    startAt: fromDatetimeInput(values.startAt),
    endAt: fromDatetimeInput(values.endAt),
    published: Boolean(values.published),
  }
  if (values.agentId) body.agentId = values.agentId
  if (values.specialtyId) body.specialtyId = values.specialtyId
  if (values.title) body.title = values.title
  return body
}

/**
 * Corps de PATCH : seuls les champs modifiés. Effacer le collaborateur envoie null, effacer
 * l'intitulé une chaîne vide (enregistrée telle quelle par l'API).
 */
export function diffService(before, after) {
  const body = {}
  for (const key of ['siteId', 'activityType', 'specialtyId', 'published', 'agentId']) {
    if (before[key] !== after[key]) body[key] = after[key] ?? null
  }
  if (before.title !== after.title) body.title = after.title ?? ''
  for (const key of ['startAt', 'endAt']) {
    if (before[key] !== after[key]) body[key] = fromDatetimeInput(after[key])
  }
  return body
}

/**
 * Filtre local des vacations non publiées relues une à une : l'API les renvoie réduites à leur
 * identifiant, sans appliquer la plage ni les filtres site et collaborateur.
 */
export function filterRows(rows, { from, to, site, agent }) {
  return rows.filter((row) => {
    const day = String(row.startAt ?? '').slice(0, 10)
    if (!day || day < from || day >= to) return false
    if (site && row.siteId !== site) return false
    if (agent && row.agent?.id !== agent) return false
    return true
  })
}
