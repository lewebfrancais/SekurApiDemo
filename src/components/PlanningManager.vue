<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import ExchangePanel from './ExchangePanel.vue'
import {
  MAX_RANGE_DAYS,
  MAX_RANGE_DAYS_SYNC,
  daysBetween,
  formatDateTime,
  weekRange,
} from '../api/dates.js'
import { diffService, filterRows, serviceBody, serviceFormValues } from '../api/planning.js'
import { realItemWarning } from '../api/risks.js'
import { methodColor } from '../api/verbs.js'
import { askConfirm } from '../composables/useConfirm.js'
import { MAX_UNPUBLISHED, loadUnpublishedServices } from '../composables/useUnpublished.js'
import {
  api,
  keyLevel,
  lookups,
  personName,
  quietApi,
  rememberService,
  serviceReadCache as readCache,
  sessionServiceIds,
} from '../composables/useDemo.js'

const $q = useQuasar()
const week = weekRange()
const from = ref(week.from)
const to = ref(week.to)
const siteFilter = ref(null)
const agentFilter = ref(null)
const statusFilter = ref('default')
const includeUnpublished = ref(false)
const truncated = ref(0)
const unpublishedStats = reactive({ read: 0, kept: 0, rateLimited: false })
const PAGE_LIMIT = 100
const listedTotal = ref(0)
const rows = ref([])
const loading = ref(false)
const exchange = ref(null)
const lastAction = ref(null)
const activityTypes = ref([])
const specialties = ref([])
const dialog = reactive({ open: false, mode: 'create', row: null, values: {}, error: '' })

// Même garde que l'écran Lecture : pas de requête tant que la plage est invalide ou trop large (les
// valeurs intermédiaires d'un champ date compteraient sur le quota partagé).
const rangeError = computed(() => {
  const days = daysBetween(from.value, to.value)
  if (!Number.isFinite(days) || days < 0) return 'Plage de dates invalide.'
  return days > MAX_RANGE_DAYS ? `Plage de ${MAX_RANGE_DAYS} jours au plus.` : null
})

const siteName = (id) => lookups.value.sites.find((s) => s.id === id)?.name ?? (id ? `#${id}` : '')
const column = (name, label, field) => ({ name, label, field, align: 'left' })
const columns = [
  column('id', 'ID', 'id'),
  column('title', 'Intitulé', 'title'),
  column('activityType', 'Activité', 'activityType'),
  column('startAt', 'Début', (r) => formatDateTime(r.startAt)),
  column('endAt', 'Fin', (r) => formatDateTime(r.endAt)),
  column('site', 'Site', (r) => siteName(r.siteId)),
  column('agent', 'Collaborateur', (r) => personName(r.agent)),
  column('status', 'Statut', 'status'),
  column('published', 'Publiée', (r) => (r.published ? 'oui' : 'non')),
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' },
]

const siteOptions = computed(() => lookups.value.sites.map((s) => ({ label: s.name, value: s.id })))
const agentOptions = computed(() =>
  lookups.value.collaborators
    .filter((c) => c.isPlannable)
    .map((c) => ({ label: personName(c) || `#${c.id}`, value: c.id })),
)
const typeOptions = computed(() =>
  activityTypes.value.map((t) => ({ label: t.label, value: t.code })),
)
const needsSpecialty = computed(
  () =>
    activityTypes.value.find((t) => t.code === dialog.values.activityType)?.specialty ===
    'required',
)
const statusOptions = ['default', 'all', 'pending', 'unprogrammed', 'archived', 'finished']

const pendingCodes = computed(() => {
  const body = exchange.value?.response?.body
  return lastAction.value && body?.reason === 'confirmation_required'
    ? body.warnings.map((w) => w.code)
    : []
})

async function loadUnpublished() {
  const result = await loadUnpublishedServices({
    from: from.value,
    to: to.value,
    site: siteFilter.value,
    agent: agentFilter.value,
  })
  truncated.value = result.truncated
  unpublishedStats.rateLimited = result.rateLimited
  unpublishedStats.read = result.read
  unpublishedStats.kept = result.rows.length
  return result.rows
}

let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  if (rangeError.value) {
    rows.value = []
    loading.value = false
    return
  }
  loading.value = true
  const res = await api.get('/services', {
    from: from.value,
    to: to.value,
    site: siteFilter.value,
    agent: agentFilter.value,
    status: statusFilter.value === 'default' ? undefined : statusFilter.value,
    limit: PAGE_LIMIT,
  })
  const listed = res.response?.ok ? res.response.body.data : []
  listedTotal.value = res.response?.ok ? (res.response.body.meta?.total ?? listed.length) : 0
  // Vacations non publiées : l'API ne les renvoie qu'avec updatedSince, réduites à leur identifiant.
  const unpublished = includeUnpublished.value ? await loadUnpublished() : []
  // Vacations créées pendant la session, même non publiées (donc absentes de la liste de l'API).
  const known = new Set([...listed, ...unpublished].map((r) => r.id))
  const extra = []
  for (const id of sessionServiceIds.value) {
    if (known.has(id)) continue
    const one = readCache.get(id) ?? (await quietApi.get(`/services/${id}`)).response?.body
    if (one?.startAt) {
      readCache.set(id, one)
      extra.push({ ...one, session: true })
    }
  }
  // Une réponse plus lente d'un filtre précédent ne doit pas écraser l'affichage courant.
  if (seq !== loadSeq) return
  const filters = {
    from: from.value,
    to: to.value,
    site: siteFilter.value,
    agent: agentFilter.value,
  }
  rows.value = [...filterRows(extra, filters), ...unpublished, ...listed]
  exchange.value = res
  lastAction.value = null
  loading.value = false
}

function refresh() {
  readCache.clear()
  return load()
}

onMounted(async () => {
  const res = (await quietApi.get('/activity-types')).response
  if (res?.ok) activityTypes.value = res.body.data
  load()
})
watch([from, to, siteFilter, agentFilter, statusFilter, includeUnpublished], load)

watch(
  () => [dialog.values.siteId, needsSpecialty.value],
  async ([siteId, needed], _old, onCleanup) => {
    let stale = false
    onCleanup(() => (stale = true))
    specialties.value = []
    if (!siteId || !needed) return
    const res = (await quietApi.get(`/sites/${siteId}/specialties`)).response
    if (res?.ok && !stale) {
      specialties.value = res.body.data.map((s) => ({ label: s.name, value: s.specialtyId }))
    }
  },
)

function openCreate() {
  Object.assign(dialog, {
    open: true,
    mode: 'create',
    row: null,
    values: serviceFormValues(null),
    error: '',
  })
}

function openEdit(row) {
  Object.assign(dialog, {
    open: true,
    mode: 'update',
    row,
    values: serviceFormValues(row),
    error: '',
  })
}

const ask = (title, lines, extra) => askConfirm($q, title, lines, extra)

// On mémorise une création (201) : non publiée, elle n'apparaît pas dans la liste de l'API.
const rememberCreated = (done) =>
  done.response.status === 201 && done.response.body?.id && rememberService(done.response.body.id)

async function perform(action, success, codes = []) {
  const done = await action(codes)
  if (done.response?.ok) {
    rememberCreated(done)
    $q.notify({ type: 'positive', message: success })
    readCache.clear()
    await load()
  }
  exchange.value = done
  lastAction.value = action
  return done
}

const realWarning = (row) =>
  row ? [realItemWarning(row.title, 'une vacation', 'sans intitulé')].filter(Boolean) : []

async function submitDialog() {
  const { mode, row, values } = dialog
  const body = mode === 'create' ? serviceBody(values) : diffService(serviceFormValues(row), values)
  if (mode === 'update' && !Object.keys(body).length) {
    dialog.error = 'Aucune modification.'
    return
  }
  if (mode === 'update') {
    const lines = [
      ...realWarning(row),
      `PATCH /services/${row.id} : ${Object.keys(body).join(', ')}.`,
    ]
    if (!(await ask('Confirmer', lines))) return
  }
  dialog.open = false
  await perform(
    (codes) => {
      const payload = codes.length ? { ...body, acknowledgedWarnings: codes } : body
      return mode === 'create'
        ? api.post('/services', payload)
        : api.patch(`/services/${row.id}`, payload)
    },
    mode === 'create' ? 'Vacation créée.' : 'Vacation modifiée.',
  )
}

async function togglePublished(row) {
  const next = !row.published
  const lines = [...realWarning(row), `${next ? 'Publier' : 'Dépublier'} la vacation ${row.id}.`]
  if (!(await ask('Confirmer', lines))) return
  await perform(
    (codes) =>
      api.patch(`/services/${row.id}`, {
        published: next,
        ...(codes.length ? { acknowledgedWarnings: codes } : {}),
      }),
    next ? 'Vacation publiée.' : 'Vacation dépubliée.',
  )
}

async function reprogram(row) {
  const lines = [...realWarning(row), `Reprogrammer la vacation ${row.id} (status: pending).`]
  if (!(await ask('Confirmer', lines))) return
  await perform(
    (codes) =>
      api.patch(`/services/${row.id}`, {
        status: 'pending',
        ...(codes.length ? { acknowledgedWarnings: codes } : {}),
      }),
    'Vacation reprogrammée.',
  )
}

// invoice_correction se coche à la main, jamais d'office.
async function remove(row) {
  const answer = await ask(
    'Supprimer',
    [
      ...realWarning(row),
      `Supprimer (déprogrammer) la vacation ${row.id} : exige la clé suppression.`,
    ],
    {
      options: {
        type: 'checkbox',
        model: [],
        items: [
          {
            label:
              'Acquitter invoice_correction (cette suppression corrige une facture déjà émise)',
            value: 'invoice_correction',
          },
        ],
      },
    },
  )
  if (!answer) return
  const invoice = answer.value.includes('invoice_correction')
  await perform((codes) => {
    const all = [...(invoice ? ['invoice_correction'] : []), ...codes]
    return api.delete(
      `/services/${row.id}`,
      all.length ? { acknowledgedWarnings: all.join(',') } : undefined,
    )
  }, 'Vacation supprimée (déprogrammée).')
}

function confirmWarnings() {
  return perform(
    lastAction.value,
    'Avertissements acquittés : écriture effectuée.',
    pendingCodes.value,
  )
}
</script>

<template>
  <div class="q-gutter-y-md">
    <q-banner dense class="demo-note">
      Gérez le planning depuis l'interface. Seules les vacations <strong>publiées</strong> sont
      listées par l'API ; celles créées pendant cette session apparaissent aussi (mention « session
      »). Créneau par défaut : demain, 8 h-16 h.
    </q-banner>
    <q-banner v-if="keyLevel !== 'delete'" dense class="demo-warn">
      La suppression exige la clé « suppression » (à choisir dans l'en-tête), sinon l'API répond
      403.
    </q-banner>

    <div class="row q-gutter-md items-start">
      <q-input v-model="from" type="date" label="Du (inclus)" dense outlined />
      <q-input v-model="to" type="date" label="Au (exclu)" dense outlined />
      <q-select
        v-model="siteFilter"
        :options="siteOptions"
        label="Site"
        dense
        outlined
        clearable
        emit-value
        map-options
        style="min-width: 200px"
      />
      <q-select
        v-model="agentFilter"
        :options="agentOptions"
        label="Collaborateur"
        dense
        outlined
        clearable
        emit-value
        map-options
        style="min-width: 200px"
      />
      <q-select
        v-model="statusFilter"
        :options="statusOptions"
        label="Statut"
        dense
        outlined
        style="min-width: 160px"
      />
      <q-toggle v-model="includeUnpublished" label="Afficher aussi les non publiées" />
      <q-btn color="positive" icon="add" label="Créer une vacation" @click="openCreate"
        ><q-tooltip
          >Ouvre le formulaire de création d'une vacation (POST /services).</q-tooltip
        ></q-btn
      >
      <q-btn flat icon="refresh" label="Actualiser" @click="refresh"
        ><q-tooltip>Relit la liste depuis l'API (GET).</q-tooltip></q-btn
      >
    </div>

    <q-banner v-if="rangeError" dense class="demo-warn">{{ rangeError }}</q-banner>
    <q-banner v-if="listedTotal > PAGE_LIMIT" dense class="demo-warn">
      Le tableau charge les {{ PAGE_LIMIT }} premières vacations publiées de la période, sur
      {{ listedTotal }} : réduisez la période.
    </q-banner>
    <q-banner v-if="includeUnpublished" dense class="demo-note">
      Non publiées : <strong>{{ unpublishedStats.read }}</strong> relues,
      <strong>{{ unpublishedStats.kept }}</strong> correspondent à la période et aux filtres (site,
      collaborateur, appliqués après la lecture : l'API les ignore pour ces vacations). Elles sont
      retrouvées avec <code>updatedSince</code> ({{ MAX_RANGE_DAYS_SYNC }} jours) puis relues une à
      une ; seules les {{ MAX_UNPUBLISHED }} plus récentes le sont<span v-if="truncated">
        ({{ truncated }} non lue(s))</span
      >.
    </q-banner>
    <q-banner v-if="includeUnpublished && unpublishedStats.rateLimited" dense class="demo-warn">
      Limite de débit atteinte (429) pendant la lecture : résultats partiels. Attendez
      <code>Retry-After</code> (environ 1 minute) puis actualisez.
    </q-banner>
    <q-table
      dense
      flat
      bordered
      row-key="id"
      :rows="rows"
      :columns="columns"
      :loading="loading"
      :rows-per-page-options="[10, 25, 50, 100]"
      rows-per-page-label="Lignes par page"
      no-data-label="Aucune vacation publiée sur cette période"
    >
      <template #body-cell-title="cell">
        <q-td>
          {{ cell.row.title }}
          <q-badge v-if="cell.row.session" color="grey-6" label="session" class="q-ml-xs" />
        </q-td>
      </template>
      <template #body-cell-actions="cell">
        <q-td class="text-right">
          <q-btn flat dense icon="edit" aria-label="Modifier" @click="openEdit(cell.row)"
            ><q-tooltip>Modifier cette vacation (PATCH).</q-tooltip></q-btn
          >
          <q-btn
            v-if="cell.row.status !== 'unprogrammed'"
            flat
            dense
            :icon="cell.row.published ? 'visibility_off' : 'visibility'"
            :aria-label="cell.row.published ? 'Dépublier' : 'Publier'"
            @click="togglePublished(cell.row)"
          >
            <q-tooltip>{{
              cell.row.published
                ? 'Dépublier : retire la vacation du planning des collaborateurs (PATCH published).'
                : 'Publier : affiche la vacation aux collaborateurs (PATCH published).'
            }}</q-tooltip>
          </q-btn>
          <q-btn
            v-else
            flat
            dense
            icon="restore"
            aria-label="Reprogrammer"
            @click="reprogram(cell.row)"
            ><q-tooltip
              >Reprogrammer : remet la vacation en attente de planification (PATCH
              status).</q-tooltip
            ></q-btn
          >
          <q-btn
            flat
            dense
            color="negative"
            icon="delete"
            aria-label="Supprimer"
            @click="remove(cell.row)"
            ><q-tooltip
              >Supprimer : déprogramme la vacation (DELETE, exige la clé suppression).</q-tooltip
            ></q-btn
          >
        </q-td>
      </template>
    </q-table>

    <q-btn
      v-if="pendingCodes.length"
      color="warning"
      text-color="dark"
      icon="warning"
      label="Confirmer malgré l'avertissement"
      @click="confirmWarnings"
      ><q-tooltip
        >Renvoie la requête en acquittant les avertissements de l'API
        (acknowledgedWarnings).</q-tooltip
      ></q-btn
    >
    <ExchangePanel :exchange="exchange" />

    <q-dialog v-model="dialog.open">
      <q-card style="width: 560px; max-width: 90vw">
        <q-card-section>
          <div class="text-h6">
            {{
              dialog.mode === 'create'
                ? 'Créer une vacation'
                : `Modifier la vacation ${dialog.row.id}`
            }}
          </div>
        </q-card-section>
        <q-card-section class="q-gutter-y-sm">
          <q-select
            v-model="dialog.values.siteId"
            :options="siteOptions"
            label="Site *"
            dense
            outlined
            emit-value
            map-options
          />
          <q-select
            v-model="dialog.values.agentId"
            :options="agentOptions"
            label="Collaborateur"
            dense
            outlined
            clearable
            emit-value
            map-options
          />
          <q-select
            v-model="dialog.values.activityType"
            :options="typeOptions"
            label="Type d'activité *"
            dense
            outlined
            emit-value
            map-options
          />
          <q-select
            v-if="needsSpecialty"
            v-model="dialog.values.specialtyId"
            :options="specialties"
            label="Spécialité (obligatoire pour ce type)"
            dense
            outlined
            emit-value
            map-options
          />
          <q-input
            v-model="dialog.values.startAt"
            type="datetime-local"
            label="Début *"
            dense
            outlined
          />
          <q-input
            v-model="dialog.values.endAt"
            type="datetime-local"
            label="Fin *"
            dense
            outlined
          />
          <q-input v-model="dialog.values.title" label="Intitulé" dense outlined />
          <q-toggle v-model="dialog.values.published" label="Publier la vacation" />
          <div v-if="dialog.error" class="text-negative">{{ dialog.error }}</div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-close-popup flat label="Annuler"
            ><q-tooltip>Ferme sans rien envoyer.</q-tooltip></q-btn
          >
          <q-btn
            :color="methodColor(dialog.mode === 'create' ? 'POST' : 'PATCH')"
            label="Envoyer"
            @click="submitDialog"
            ><q-tooltip>Envoie la requête à l'API.</q-tooltip></q-btn
          >
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>
