// Ressources du catalogue par niveau (agence, client, site) : chemins, colonnes et champs.

export const LEVELS = [
  { key: 'agency', label: 'Agence', parent: null },
  { key: 'customer', label: 'Client', parent: 'customers' },
  { key: 'site', label: 'Site', parent: 'sites' },
]

const col = (name, label, field = name) => ({ name, label, field, align: 'left' })
const rates = {
  name: 'hourlyRatesExclTax',
  label: 'Tarifs horaires HT (JSON)',
  type: 'json',
  help: 'Grille complète, mêmes clés que la lecture. Laisser vide pour ne pas la fournir.',
}
const description = { name: 'description', label: 'Description / consignes (HTML)', type: 'html' }
const discountFields = [
  { name: 'designation', label: 'Désignation (HTML)', type: 'html', required: true },
  { name: 'type', label: 'Type', type: 'select', options: ['percent', 'fixed'], required: true },
  { name: 'value', label: 'Valeur (non nulle)', type: 'number', required: true },
]
const discountColumns = [
  col('id', 'ID'),
  col('designation', 'Désignation'),
  col('type', 'Type'),
  col('value', 'Valeur'),
  col('customerId', 'Client (ID)'),
]
const overrideFields = [
  {
    name: 'specialtyId',
    label: 'Spécialité de l’agence',
    type: 'specialty',
    required: true,
    update: false,
  },
  description,
  rates,
]
const overrideColumns = [
  col('specialtyId', 'Spécialité (ID)'),
  col('name', 'Nom'),
  col('status', 'Statut'),
  col('rateSource', 'Origine du tarif'),
]

// Champs de PATCH des réglages de tarification (le reste de la lecture ne s'écrit pas).
export const PRICING_KEYS = [
  'dayHourlyRateExclTax',
  'multipliers',
  'circuit',
  'intervention',
  'mobileRound',
  'siteSurvey',
  'audit',
]

// kind : « collection » (liste paginée, création, modification, suppression d'une ligne) ou
// « singleton » (objet unique lu puis modifié en PATCH). Les chemins reçoivent l'identifiant du
// client ou du site parent, null au niveau agence.
export const RESOURCES = [
  {
    key: 'articles',
    level: 'agency',
    label: 'Articles',
    kind: 'collection',
    path: () => '/articles',
    idKey: 'id',
    canDelete: true,
    columns: [
      col('id', 'ID'),
      col('name', 'Nom'),
      col('unitPriceExclTax', 'Prix unitaire HT'),
      col('specialtyIds', 'Spécialités (IDs)', (row) => (row.specialtyIds ?? []).join(', ')),
    ],
    fields: [
      { name: 'name', label: 'Nom', type: 'text', required: true },
      { name: 'description', label: 'Description (HTML)', type: 'html', required: true },
      { name: 'unitPriceExclTax', label: 'Prix unitaire HT', type: 'number', required: true },
      { name: 'specialtyIds', label: 'Spécialités', type: 'specialties' },
    ],
    sample: {
      name: 'Démo - Article',
      description: '<p>Article de démonstration</p>',
      unitPriceExclTax: 10,
    },
  },
  {
    key: 'specialties',
    level: 'agency',
    label: 'Spécialités',
    kind: 'collection',
    path: () => '/specialties',
    listQuery: () => ({ status: 'all' }),
    idKey: 'id',
    canDelete: false,
    note: 'Une spécialité ne se supprime pas : la désactiver (statut disabled, clé suppression requise).',
    columns: [col('id', 'ID'), col('name', 'Nom'), col('status', 'Statut')],
    fields: [
      {
        name: 'referenceId',
        label: 'ID d’une spécialité commune (activer)',
        type: 'number',
        update: false,
      },
      {
        name: 'categoryId',
        label: 'ID d’une catégorie (créer une spécialité propre)',
        type: 'number',
        update: false,
      },
      { name: 'name', label: 'Nom', type: 'text' },
      description,
      { name: 'status', label: 'Statut', type: 'select', options: ['active', 'disabled'] },
      rates,
    ],
    sample: { name: 'Démo - Spécialité' },
  },
  {
    key: 'discounts',
    level: 'agency',
    label: 'Remises',
    kind: 'collection',
    path: () => '/discounts',
    idKey: 'id',
    canDelete: true,
    note: 'La liste montre aussi les remises réservées aux clients (colonne Client).',
    columns: discountColumns,
    fields: discountFields,
    sample: { designation: '<p>Démo - Remise</p>', type: 'percent', value: 5 },
  },
  {
    key: 'pricing',
    level: 'agency',
    label: 'Tarification',
    kind: 'singleton',
    path: () => '/pricing-settings',
    canDelete: false,
    note: 'Modifier ces réglages change les prochaines factures de tous les sites sans réglages propres.',
  },
  {
    key: 'customer-specialties',
    level: 'customer',
    label: 'Spécialités du client',
    kind: 'collection',
    path: (id) => `/customers/${id}/specialties`,
    itemPath: (id, row) => `/customers/${id}/specialties/${row.specialtyId}`,
    listQuery: () => ({ status: 'all' }),
    idKey: 'specialtyId',
    canDelete: true,
    columns: overrideColumns,
    fields: overrideFields,
    sample: {},
  },
  {
    key: 'customer-discounts',
    level: 'customer',
    label: 'Remises du client',
    kind: 'collection',
    path: () => '/discounts',
    listQuery: (id) => ({ customer: id }),
    createExtra: (id) => ({ customerId: id }),
    idKey: 'id',
    canDelete: true,
    columns: discountColumns,
    fields: discountFields,
    sample: { designation: '<p>Démo - Remise client</p>', type: 'fixed', value: 20 },
  },
  {
    key: 'customer-pricing',
    level: 'customer',
    label: 'Tarification du client',
    kind: 'singleton',
    path: (id) => `/customers/${id}/pricing-settings`,
    canDelete: true,
    note: 'Supprimer retire les réglages propres du client : il retombe sur ceux de l’agence.',
  },
  {
    key: 'site-specialties',
    level: 'site',
    label: 'Spécialités du site',
    kind: 'collection',
    path: (id) => `/sites/${id}/specialties`,
    itemPath: (id, row) => `/sites/${id}/specialties/${row.specialtyId}`,
    listQuery: () => ({ status: 'all' }),
    idKey: 'specialtyId',
    canDelete: true,
    note: 'Un site garde au moins une spécialité rattachée.',
    columns: [...overrideColumns, col('offeredBy', 'Proposée par')],
    fields: overrideFields,
    sample: {},
  },
  {
    key: 'site-pricing',
    level: 'site',
    label: 'Tarification du site',
    kind: 'singleton',
    path: (id) => `/sites/${id}/pricing-settings`,
    canDelete: true,
    note: 'Supprimer retire les réglages propres du site.',
  },
]

export const resourcesOf = (level) => RESOURCES.filter((r) => r.level === level)

export const listPath = (resource, parentId) => resource.path(parentId)
export const itemPath = (resource, parentId, row) =>
  resource.itemPath
    ? resource.itemPath(parentId, row)
    : `${resource.path(parentId)}/${row[resource.idKey]}`

function parseField(field, raw) {
  switch (field.type) {
    case 'number':
      return Number(raw)
    case 'specialty':
      return Number(raw)
    case 'specialties':
      return raw.map(Number)
    case 'json':
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    default:
      return raw
  }
}

// Les champs vides sont omis : l'API refuse alors un champ obligatoire absent, ce qu'on veut montrer.
// Les champs non modifiables ne partent qu'à la création. Lève une SyntaxError sur un JSON invalide.
export function buildBody(resource, values, mode, parentId = null) {
  const body = {}
  for (const field of resource.fields) {
    if (mode === 'update' && field.update === false) continue
    const raw = values[field.name]
    if (raw === undefined || raw === null || raw === '') continue
    // Liste vide : omise à la création, envoyée en modification (elle vide la liste).
    if (Array.isArray(raw) && !raw.length && mode === 'create') continue
    body[field.name] = parseField(field, raw)
  }
  if (mode === 'create' && resource.createExtra) Object.assign(body, resource.createExtra(parentId))
  return body
}

export function fieldValue(field, row) {
  const value =
    field.name === 'hourlyRatesExclTax'
      ? (row.hourlyRatesExclTax ?? row.ownHourlyRatesExclTax)
      : row[field.name]
  if (value === undefined || value === null) return ''
  if (field.type === 'specialties') return [...value]
  if (field.type === 'json') return JSON.stringify(value, null, 2)
  return value
}

export function initialValues(resource, row = null) {
  const values = {}
  for (const field of resource.fields) {
    values[field.name] = row ? fieldValue(field, row) : (resource.sample?.[field.name] ?? '')
  }
  return values
}

// La lecture renvoie la fiche de dépassement en `overrunSpecialty {id, name}`, l'écriture attend
// `overrunSpecialtyId`.
export function pricingBody(settings) {
  const body = Object.fromEntries(
    PRICING_KEYS.filter((key) => key in settings).map((key) => [key, settings[key]]),
  )
  for (const key of ['circuit', 'intervention']) {
    if (body[key] && 'overrunSpecialty' in body[key]) {
      const { overrunSpecialty, ...rest } = body[key]
      body[key] = { ...rest, overrunSpecialtyId: overrunSpecialty?.id ?? null }
    }
  }
  return body
}

export const acknowledgedQuery = (codes) => codes.join(',')
