// Vacations non publiées : l'API ne les liste pas. Avec `updatedSince`, elles ressortent réduites à leur
// identifiant, relues une à une (quota de lecture de 120 requêtes par minute, partagé par toute l'agence).
import { MAX_RANGE_DAYS_SYNC, toDateInput } from '../api/dates.js'
import { filterRows } from '../api/planning.js'
import { lookups, quietApi, serviceReadCache } from './useDemo.js'

export const MAX_UNPUBLISHED = 40
const PAGE_LIMIT = 100

/**
 * L'API ignore les filtres site, collaborateur et client pour ces vacations : on les applique après
 * la lecture. Renvoie `{ rows, read, truncated, rateLimited }`.
 */
export async function loadUnpublishedServices({ from, to, site, agent, customer }) {
  const since = new Date(Date.now() - MAX_RANGE_DAYS_SYNC * 86400000)
  const res = await quietApi.get('/services', {
    from,
    to,
    updatedSince: toDateInput(since),
    status: 'unpublished',
    limit: PAGE_LIMIT,
  })
  const ids = res.response?.ok ? res.response.body.data.map((s) => s.id) : []
  const found = []
  let rateLimited = false
  for (const id of ids.slice(-MAX_UNPUBLISHED).reverse()) {
    if (serviceReadCache.has(id)) {
      found.push(serviceReadCache.get(id))
      continue
    }
    const one = (await quietApi.get(`/services/${id}`)).response
    if (one?.status === 429) {
      rateLimited = true
      break
    }
    if (one?.ok && one.body.startAt) {
      serviceReadCache.set(id, one.body)
      found.push(one.body)
    }
  }
  let rows = filterRows(found, { from, to, site, agent })
  if (customer) {
    const siteIds = new Set(
      lookups.value.sites.filter((s) => s.customerId === customer).map((s) => s.id),
    )
    rows = rows.filter((row) => siteIds.has(row.siteId))
  }
  return {
    rows,
    read: found.length,
    truncated: Math.max(0, ids.length - MAX_UNPUBLISHED),
    rateLimited,
  }
}
