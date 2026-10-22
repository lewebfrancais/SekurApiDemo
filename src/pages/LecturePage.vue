<script setup>
import { computed, reactive, ref, watch } from 'vue'
import PagedTable from '../components/PagedTable.vue'
import {
  MAX_RANGE_DAYS,
  MAX_RANGE_DAYS_SYNC,
  daysBetween,
  formatDateTime,
  weekRange,
} from '../api/dates.js'
import { lookups, personName } from '../composables/useDemo.js'
import { MAX_UNPUBLISHED, loadUnpublishedServices } from '../composables/useUnpublished.js'

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
]

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

const week = weekRange()
const from = ref(week.from)
const to = ref(week.to)
const site = ref(null)
const customer = ref(null)
const agent = ref(null)
const statuses = ref([])
const updatedSince = ref('')
const includeUnpublished = ref(false)
const unpublished = reactive({
  rows: [],
  read: 0,
  truncated: 0,
  rateLimited: false,
  loading: false,
})

const customerQuery = computed(() => ({ status: customerStatus.value }))
const siteQuery = computed(() => ({ status: siteStatus.value, customer: siteCustomer.value }))
const collaboratorQuery = computed(() => ({ status: collaboratorStatus.value }))
const planningQuery = computed(() => ({
  from: from.value,
  to: to.value,
  site: site.value,
  customer: customer.value,
  agent: agent.value,
  updatedSince: updatedSince.value || undefined,
  status: statuses.value.length ? statuses.value.join(',') : undefined,
}))

// L'API exige une plage from (inclus) / to (exclu) de 31 jours au plus : on évite un 400 évitable.
const rangeError = computed(() => {
  if (!from.value || !to.value) return 'Renseignez une date de début et une date de fin.'
  const days = daysBetween(from.value, to.value)
  if (!(days > 0)) return 'La fin (exclue) doit être postérieure au début.'
  const max = updatedSince.value ? MAX_RANGE_DAYS_SYNC : MAX_RANGE_DAYS
  if (days > max) return `La plage ne peut pas dépasser ${max} jours.`
  return null
})

// Les vacations non publiées ne sont pas listées par l'API : relues une à une, puis filtrées ici.
let unpublishedSeq = 0
async function loadUnpublished() {
  const seq = ++unpublishedSeq
  if (!includeUnpublished.value || rangeError.value) {
    Object.assign(unpublished, {
      rows: [],
      read: 0,
      truncated: 0,
      rateLimited: false,
      loading: false,
    })
    return
  }
  unpublished.loading = true
  const result = await loadUnpublishedServices({
    from: from.value,
    to: to.value,
    site: site.value,
    agent: agent.value,
    customer: customer.value,
  })
  if (seq !== unpublishedSeq) return
  Object.assign(unpublished, result, { loading: false })
}
watch([includeUnpublished, from, to, site, customer, agent], loadUnpublished)

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
      <q-tab name="planning" label="Planning des vacations" />
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
            v-model="statuses"
            :options="serviceStatuses"
            label="Statuts"
            dense
            outlined
            multiple
            use-chips
            clearable
            style="min-width: 240px"
          />
          <q-input
            v-model="updatedSince"
            type="date"
            label="Modifiées depuis (synchronisation)"
            dense
            outlined
            clearable
          />
          <q-toggle v-model="includeUnpublished" label="Afficher aussi les non publiées">
            <q-tooltip
              >Les vacations non publiées ne sont pas listées par l'API : elles sont retrouvées avec
              updatedSince (90 jours) puis relues une à une.</q-tooltip
            >
          </q-toggle>
        </div>
        <q-banner
          v-if="statuses.includes('unpublished') && !updatedSince"
          class="demo-note q-mb-md"
          dense
        >
          Le statut « unpublished » est un signal de retrait : sans « Modifiées depuis », l'API ne
          renvoie rien. Une vacation non publiée n'est pas listée ; avec « Modifiées depuis », elle
          ressort réduite à son identifiant.
        </q-banner>
        <q-banner v-if="rangeError" class="demo-warn q-mb-md" dense>{{ rangeError }}</q-banner>
        <PagedTable
          path="/services"
          :columns="serviceColumns"
          :query="planningQuery"
          :ready="!rangeError"
        />
        <template v-if="includeUnpublished && !rangeError">
          <div class="text-subtitle2 q-mt-md q-mb-sm">Vacations non publiées</div>
          <q-banner dense class="demo-note q-mb-sm">
            <strong>{{ unpublished.read }}</strong> relues,
            <strong>{{ unpublished.rows.length }}</strong>
            correspondent à la période et aux filtres (site, client, collaborateur, appliqués après
            la lecture : l'API les ignore pour ces vacations). Retrouvées avec
            <code>updatedSince</code> puis relues une à une ; seules les {{ MAX_UNPUBLISHED }} plus
            récentes le sont<span v-if="unpublished.truncated">
              ({{ unpublished.truncated }} non lue(s))</span
            >.
          </q-banner>
          <q-banner v-if="unpublished.rateLimited" dense class="demo-warn q-mb-sm">
            Limite de débit atteinte (429) pendant la lecture : résultats partiels. Attendez
            <code>Retry-After</code> (environ 1 minute) puis rebasculez le filtre.
          </q-banner>
          <q-table
            dense
            flat
            bordered
            row-key="id"
            :rows="unpublished.rows"
            :columns="serviceColumns"
            :loading="unpublished.loading"
            :rows-per-page-options="[10, 25, 50]"
            rows-per-page-label="Lignes par page"
            no-data-label="Aucune vacation non publiée sur cette période"
          />
        </template>
      </q-tab-panel>
    </q-tab-panels>
  </div>
</template>
