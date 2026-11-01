import { acknowledgedQuery } from './catalog.js'
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

export const PUBLISHED_OPTIONS = [
  { label: 'Toutes', value: null },
  { label: 'Planifiées', value: 'true' },
  { label: 'Brouillons', value: 'false' },
]

// Paramètres documentés de chaque liste : l'API refuse (400) tout autre paramètre.
export const PLANNING_LISTS = {
  services: {
    label: 'Vacations',
    path: '/services',
    params: ['from', 'to', 'site', 'customer', 'agent', 'status', 'updatedSince', 'published'],
  },
  circuits: {
    label: 'Tournées',
    path: '/circuits',
    params: ['from', 'to', 'site', 'agent', 'status', 'published'],
  },
  breaks: {
    label: 'Pauses',
    path: '/service-breaks',
    params: ['from', 'to', 'site', 'agent', 'published'],
  },
}

export function planningListQuery(list, filters) {
  return Object.fromEntries(PLANNING_LISTS[list].params.map((key) => [key, filters[key]]))
}

export function patchPublished(api, id, published, codes = []) {
  const body = codes.length ? { published, acknowledgedWarnings: codes } : { published }
  return api.patch(`/services/${id}`, body)
}

// Un DELETE n'a pas de corps : l'acquittement passe en paramètre d'URL.
export function deleteService(api, id, codes = []) {
  const query = codes.length ? { acknowledgedWarnings: acknowledgedQuery(codes) } : undefined
  return api.delete(`/services/${id}`, query)
}

export function deleteSuccessMessage(row) {
  return row.status === 'unprogrammed'
    ? "Vacation déjà déprogrammée : l'API répond 204 sans effet."
    : 'Vacation supprimée (déprogrammée).'
}
