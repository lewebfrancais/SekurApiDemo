// Scénarios d'erreur : chacun rejoue un appel réel et renvoie l'échange (requête et réponse brute).
import { tomorrowWindow } from './dates.js'

export const MAX_BURST = 150
export const BURST_CONCURRENCY = 4
// Au-dessus de la limite de 4 Mio (4 194 304 octets).
export const OVERSIZED_BODY_CHARS = 4_700_000
const UNKNOWN_ID = 2147483647

export async function unauthorized(api) {
  return { exchange: await api.get('/me', undefined, { keyLevel: 'none' }) }
}

// Écriture avec la clé lecture. Si cette clé a des droits d’écriture, on s’arrête
// avant d'écrire quoi que ce soit.
export async function forbidden(api) {
  const me = await api.get('/me', undefined, { keyLevel: 'read' })
  if (me.response?.body?.apiKey?.accessLevel !== 'read') {
    return {
      exchange: me,
      note: 'La clé lecture configurée a des droits d’écriture : scénario annulé, rien n’a été écrit.',
    }
  }
  const exchange = await api.post(
    '/customers',
    { name: 'Démo - refus attendu' },
    { keyLevel: 'read' },
  )
  return { exchange }
}

export async function notFound(api) {
  return { exchange: await api.get(`/services/${UNKNOWN_ID}`, undefined, { keyLevel: 'read' }) }
}

export async function businessRule(api, { siteId }) {
  const exchange = await api.post(
    '/services',
    {
      siteId,
      activityType: 'intervention',
      title: 'Démo - dates incohérentes',
      startAt: '2030-01-02T10:00:00',
      endAt: '2030-01-02T08:00:00',
    },
    { keyLevel: 'write' },
  )
  return { exchange }
}

/**
 * 422 : chevauchement. Crée une vacation puis la même une seconde fois. Selon le réglage de
 * l'agence de démo : `planning_conflict`, `confirmation_required` ou aucun conflit (201).
 */
export async function overlap(api, { siteId, agentId, now = new Date() }) {
  const { startAt, endAt } = tomorrowWindow(now)
  const body = {
    siteId,
    agentId,
    activityType: 'intervention',
    title: 'Démo - chevauchement',
    published: false,
    startAt,
    endAt,
  }
  const first = await api.post('/services', body, { keyLevel: 'write' })
  const second = await api.post('/services', body, { keyLevel: 'write' })
  return { exchange: second, previous: first, retryBody: body }
}

/**
 * 429 déterministe, avec la clé lecture (le quota est partagé par toutes les clés de l'agence : la
 * rafale bloque aussi ses autres intégrations). Une première requête lit X-RateLimit-Remaining,
 * puis on envoie Remaining + 1 requêtes (plafond MAX_BURST) par paquets parallèles, en s'arrêtant
 * au premier 429. Sans 429 au plafond, la démo l'indique au lieu de boucler.
 */
export async function rateLimit(api, { max = MAX_BURST, concurrency = BURST_CONCURRENCY } = {}) {
  const probe = await api.get('/me', undefined, { keyLevel: 'read' })
  if (probe.response?.status === 429) return { exchange: probe, note: 'Limite déjà atteinte.' }
  const remaining = Number.parseInt(probe.response?.headers?.['x-ratelimit-remaining'], 10)
  const target = Math.min(Number.isFinite(remaining) ? remaining + 1 : max, max)
  let sent = 1
  let last = probe
  while (sent <= target) {
    const size = Math.min(concurrency, target - sent + 1)
    const batch = await Promise.all(
      Array.from({ length: size }, () => api.get('/me', undefined, { keyLevel: 'read' })),
    )
    sent += size
    last = batch.at(-1)
    const limited = batch.find((e) => e.response?.status === 429)
    if (limited) return { exchange: limited, note: `Limite atteinte après ${sent} requêtes.` }
  }
  return { exchange: last, note: `Limite non atteinte après ${sent} requêtes.` }
}

export async function payloadTooLarge(api) {
  const body = JSON.stringify({ title: 'a'.repeat(OVERSIZED_BODY_CHARS) })
  return { exchange: await api.post('/services', body, { keyLevel: 'write' }) }
}
