<script setup>
import { computed, ref, watch } from 'vue'
import PagedTable from '../components/PagedTable.vue'
import {
  MAX_RANGE_DAYS,
  MAX_RANGE_DAYS_SYNC,
  daysBetween,
  formatDateTime,
  weekRange,
} from '../api/dates.js'
import { PLANNING_LISTS, PUBLISHED_OPTIONS, planningListQuery } from '../api/planning.js'
import { lookups, personName } from '../composables/useDemo.js'

const tab = ref('customers')

const address = (a) =>
  [a?.street, [a?.zipcode, a?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
const column = (name, label, field) => ({ name, label, field, align: 'left' })

const customerColumns = [
  column('id', 'ID', 'id'),
  column('name', 'Nom', 'name'),
  column('type', 'Type', 'type'),
  column('email', 'E-mail', 'email'),
  column('address', 'Adresse', (row) => address(row.address)),
  column('status', 'Statut', 'status'),
]
const siteColumns = [
  column('id', 'ID', 'id'),
  column('name', 'Nom', 'name'),
  column('customerId', 'Client (ID)', 'customerId'),
  column('address', 'Adresse', (row) => address(row.address)),
  column('status', 'Statut', 'status'),
]
const collaboratorColumns = [
  column('id', 'ID', 'id'),
  column('name', 'Nom', (row) => personName(row)),
  column('position', 'Poste', 'position'),
  column('email', 'E-mail', 'email'),
  column('isPlannable', 'Planifiable', (row) => (row.isPlannable ? 'oui' : 'non')),
  column('status', 'Statut', 'status'),
]
const serviceColumns = [
  column('id', 'ID', 'id'),
  column('title', 'Intitulé', 'title'),
  column('activityType', 'Activité', 'activityType'),
  column('startAt', 'Début', (row) => formatDateTime(row.startAt)),
  column('endAt', 'Fin', (row) => formatDateTime(row.endAt)),
  column('siteId', 'Site (ID)', 'siteId'),
  column('agent', 'Collaborateur', (row) => personName(row.agent)),
  column('status', 'Statut', 'status'),
  column('published', 'Planifiée', (row) => (row.published ? 'oui' : 'non')),
]
const breakColumns = [
  column('id', 'ID', 'id'),
  column('serviceId', 'Service (ID)', 'serviceId'),
  column('type', 'Type', 'type'),
  column('startAt', 'Début', (row) => formatDateTime(row.startAt)),
  column('endAt', 'Fin', (row) => formatDateTime(row.endAt)),
  column('durationMinutes', 'Durée (min)', 'durationMinutes'),
  column('status', 'Statut', 'status'),
]
const planningColumns = {
  services: serviceColumns,
  circuits: [...serviceColumns, column('steps', 'Étapes', (row) => row.steps?.length ?? 0)],
  breaks: breakColumns,
}
const listOptions = Object.entries(PLANNING_LISTS).map(([value, l]) => ({ label: l.label, value }))

const customerStatuses = ['active', 'disabled', 'archived', 'all']
const collaboratorStatuses = ['active', 'no_access', 'archived', 'all']
const serviceStatuses = [
  'pending',
  'late',
  'not_realized',
  'in_progress',
  'in_extension',
  'finished',
  'interrupted',
  'paused',
  'archived',
  'unprogrammed',
  'not_finished',
  'unpublished',
]

const customerStatus = ref('active')
const siteStatus = ref('active')
const siteCustomer = ref(null)
const collaboratorStatus = ref('active')

const list = ref('services')
const week = weekRange()
const from = ref(week.from)
const to = ref(week.to)
const site = ref(null)
const customer = ref(null)
const agent = ref(null)
const statuses = ref([])
const updatedSince = ref('')
const published = ref(null)
// /circuits refuse (400) le statut unpublished, propre aux vacations.
const statusOptions = computed(() =>
  list.value === 'services' ? serviceStatuses : serviceStatuses.filter((s) => s !== 'unpublished'),
)
watch(statusOptions, (opts) => {
  statuses.value = statuses.value.filter((s) => opts.includes(s))
})

const customerQuery = computed(() => ({ status: customerStatus.value }))
const siteQuery = computed(() => ({ status: siteStatus.value, customer: siteCustomer.value }))
const collaboratorQuery = computed(() => ({ status: collaboratorStatus.value }))
// Chaque liste ne reçoit que ses paramètres documentés : les filtres masqués ne partent pas.
const planningQuery = computed(() =>
  planningListQuery(list.value, {
    from: from.value,
    to: to.value,
    site: site.value,
    customer: customer.value,
    agent: agent.value,
    updatedSince: updatedSince.value || undefined,
    status: statuses.value.length ? statuses.value.join(',') : undefined,
    published: published.value,
  }),
)

// L'API exige une plage from (inclus) / to (exclu) de 31 jours au plus : on évite un 400 évitable.
const rangeError = computed(() => {
  if (!from.value || !to.value) return 'Renseignez une date de début et une date de fin.'
  const days = daysBetween(from.value, to.value)
  if (!(days > 0)) return 'La fin (exclue) doit être postérieure au début.'
  const max = planningQuery.value.updatedSince ? MAX_RANGE_DAYS_SYNC : MAX_RANGE_DAYS
  if (days > max) return `La plage ne peut pas dépasser ${max} jours.`
  return null
})

// Le signal de retrait réduit à l'identifiant n'existe qu'avec updatedSince et published=true.
const unpublishedNote = computed(() => {
  const q = planningQuery.value
  return Boolean(
    list.value === 'services' &&
    q.status?.includes('unpublished') &&
    !(q.updatedSince && q.published === 'true'),
  )
})

const siteOptions = computed(() => lookups.value.sites.map((s) => ({ label: s.name, value: s.id })))
const customerOptions = computed(() =>
  lookups.value.customers.map((c) => ({ label: c.name, value: c.id })),
)
const agentOptions = computed(() =>
  lookups.value.collaborators.map((c) => ({ label: personName(c) || `#${c.id}`, value: c.id })),
)
</script>

<template>
  <div>
    <q-tabs v-model="tab" align="left" dense active-color="primary" indicator-color="primary">
      <q-tab name="customers" label="Clients" />
      <q-tab name="sites" label="Sites" />
      <q-tab name="collaborators" label="Collaborateurs" />
      <q-tab name="planning" label="Planning" />
    </q-tabs>
    <q-separator class="q-mb-md" />

    <q-tab-panels v-model="tab" animated keep-alive>
      <q-tab-panel name="customers">
        <div class="row q-gutter-md q-mb-md">
          <q-select
            v-model="customerStatus"
            :options="customerStatuses"
            label="Statut"
            dense
            outlined
            style="min-width: 160px"
          />
        </div>
        <PagedTable path="/customers" :columns="customerColumns" :query="customerQuery" />
      </q-tab-panel>

      <q-tab-panel name="sites">
        <div class="row q-gutter-md q-mb-md">
          <q-select
            v-model="siteStatus"
            :options="customerStatuses"
            label="Statut"
            dense
            outlined
            style="min-width: 160px"
          />
          <q-select
            v-model="siteCustomer"
            :options="customerOptions"
            label="Client"
            dense
            outlined
            clearable
            emit-value
            map-options
            style="min-width: 240px"
          />
        </div>
        <PagedTable path="/sites" :columns="siteColumns" :query="siteQuery" />
      </q-tab-panel>

      <q-tab-panel name="collaborators">
        <div class="row q-gutter-md q-mb-md">
          <q-select
            v-model="collaboratorStatus"
            :options="collaboratorStatuses"
            label="Statut"
            dense
            outlined
            style="min-width: 160px"
          />
        </div>
        <PagedTable
          path="/collaborators"
          :columns="collaboratorColumns"
          :query="collaboratorQuery"
        />
      </q-tab-panel>

      <q-tab-panel name="planning">
        <div class="row q-gutter-md q-mb-md items-center">
          <span id="planning-list-label" class="text-subtitle2">Liste</span>
          <q-btn-toggle
            v-model="list"
            :options="listOptions"
            role="group"
            aria-labelledby="planning-list-label"
            no-caps
            unelevated
            toggle-color="primary"
          />
        </div>
        <div class="row q-gutter-md q-mb-md items-start">
          <q-input v-model="from" type="date" label="Du (inclus)" dense outlined />
          <q-input v-model="to" type="date" label="Au (exclu)" dense outlined />
          <q-select
            v-model="site"
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
            v-if="list === 'services'"
            v-model="customer"
            :options="customerOptions"
            label="Client"
            dense
            outlined
            clearable
            emit-value
            map-options
            style="min-width: 200px"
          />
          <q-select
            v-model="agent"
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
            v-if="list !== 'breaks'"
            v-model="statuses"
            :options="statusOptions"
            label="Statuts"
            dense
            outlined
            multiple
            use-chips
            clearable
            style="min-width: 240px"
          />
          <q-select
            v-model="published"
            :options="PUBLISHED_OPTIONS"
            label="Publication"
            dense
            outlined
            emit-value
            map-options
            style="min-width: 160px"
          />
          <q-input
            v-if="list === 'services'"
            v-model="updatedSince"
            type="date"
            label="Modifiées depuis (synchronisation)"
            dense
            outlined
            clearable
          />
        </div>
        <q-banner v-if="unpublishedNote" class="demo-note q-mb-md" dense>
          Le statut « unpublished » est un signal de retrait réduit à l'identifiant : l'API ne le
          renvoie qu'en synchronisation (« Modifiées depuis ») avec « Planifiées ». Sans filtre de
          publication, une vacation déplanifiée arrive en entier, avec published à false.
        </q-banner>
        <q-banner v-if="rangeError" class="demo-warn q-mb-md" dense>{{ rangeError }}</q-banner>
        <PagedTable
          :path="PLANNING_LISTS[list].path"
          :columns="planningColumns[list]"
          :query="planningQuery"
          :ready="!rangeError"
        />
      </q-tab-panel>
    </q-tab-panels>
  </div>
</template>
