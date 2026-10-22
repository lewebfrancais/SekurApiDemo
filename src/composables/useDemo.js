// État partagé : clé choisie, configuration du serveur, agence, historique des échanges et listes.
import { computed, reactive, ref, watch } from 'vue'
import { createClient } from '../api/client.js'

const STORAGE_KEY = 'sekur-demo-key-level'

export const ACCESS_LEVELS = [
  { value: 'read', label: 'Lecture' },
  { value: 'read_write', label: 'Écriture' },
  { value: 'read_write_delete', label: 'Suppression' },
]

export const KEY_LEVELS = {
  read: { label: 'lecture', variable: 'SEKUR_API_KEY_READ' },
  write: { label: 'écriture', variable: 'SEKUR_API_KEY_WRITE' },
  delete: { label: 'suppression', variable: 'SEKUR_API_KEY_DELETE' },
}

const storedLevel = sessionStorage.getItem(STORAGE_KEY)
export const keyLevel = ref(Object.hasOwn(KEY_LEVELS, storedLevel) ? storedLevel : 'read')
watch(keyLevel, (value) => sessionStorage.setItem(STORAGE_KEY, value))

export const exchanges = ref([])

export const api = createClient({
  getKeyLevel: () => keyLevel.value,
  onExchange(exchange) {
    exchanges.value = [exchange, ...exchanges.value].slice(0, 30)
  },
})

/** Client « silencieux » pour les listes de référence : ne pollue pas l'historique. */
export const quietApi = createClient({ getKeyLevel: () => keyLevel.value })

export const config = ref(null)
export async function loadConfig() {
  try {
    config.value = await (await fetch('/demo/config')).json()
  } catch {
    config.value = null
  }
}

// Lecture seule tant que le serveur de dev ne dit pas le contraire.
export const writesEnabled = computed(() => config.value?.writes === true)
export const stressEnabled = computed(() => config.value?.stress === true)

export const keyConfigured = computed(() => config.value?.keys?.[keyLevel.value] ?? true)

export const me = ref(null)
export const meExchange = ref(null)
let meSeq = 0
export async function loadMe() {
  const seq = ++meSeq
  const exchange = await api.get('/me')
  // Un changement de clé rapide ne doit pas laisser la réponse de l'ancienne clé l'emporter.
  if (seq !== meSeq) return exchange
  meExchange.value = exchange
  me.value = exchange.response?.ok ? exchange.response.body : null
  return exchange
}

export const lookups = ref({ customers: [], sites: [], collaborators: [], specialties: [] })
export async function loadLookups() {
  const [customers, sites, collaborators, specialties] = await Promise.all([
    quietApi.get('/customers', { limit: 100, status: 'active' }),
    quietApi.get('/sites', { limit: 100, status: 'active' }),
    quietApi.get('/collaborators', { limit: 100, status: 'active' }),
    // Limite : 100 premières spécialités actives.
    quietApi.get('/specialties', { limit: 100, status: 'active' }),
  ])
  const data = (exchange) => (exchange.response?.ok ? exchange.response.body.data : [])
  lookups.value = {
    customers: data(customers),
    sites: data(sites),
    collaborators: data(collaborators),
    specialties: data(specialties),
  }
}

// Vacations relues une à une par le Planning (non publiées, créées en session) : partagé entre
// navigations pour ne pas refaire jusqu'à 40 requêtes sur le quota de l'agence.
export const serviceReadCache = new Map()

export const lastServiceId = ref(null)
// Vacations créées pendant la session : une vacation non publiée n'est pas listée par l'API.
export const sessionServiceIds = ref([])
export function rememberService(id) {
  lastServiceId.value = id
  if (!sessionServiceIds.value.includes(id))
    sessionServiceIds.value = [id, ...sessionServiceIds.value]
}
export const createdIds = reactive({})

export function personName(person) {
  return [person?.firstName, person?.lastName].filter(Boolean).join(' ')
}
