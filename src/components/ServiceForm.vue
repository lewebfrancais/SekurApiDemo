<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import ExchangePanel from './ExchangePanel.vue'
import { fromDatetimeInput, tomorrowWindow } from '../api/dates.js'
import { api, lookups, personName, quietApi, rememberService } from '../composables/useDemo.js'

const $q = useQuasar()
const tomorrow = tomorrowWindow()

const form = reactive({
  siteId: null,
  agentId: null,
  activityType: 'intervention',
  specialtyId: null,
  title: 'Démo - vacation',
  startAt: tomorrow.startAt.slice(0, 16),
  endAt: tomorrow.endAt.slice(0, 16),
  published: false,
})

const activityTypes = ref([])
const specialties = ref([])
const exchange = ref(null)
const loading = ref(false)

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
  () => activityTypes.value.find((t) => t.code === form.activityType)?.specialty === 'required',
)

const pendingWarnings = computed(() => {
  const body = exchange.value?.response?.body
  return body?.reason === 'confirmation_required' ? body.warnings.map((w) => w.code) : []
})

onMounted(async () => {
  const res = (await quietApi.get('/activity-types')).response
  if (res?.ok) activityTypes.value = res.body.data
})

// La spécialité est obligatoire pour certains types : on propose celles du site choisi.
watch(
  () => [form.siteId, needsSpecialty.value],
  async ([siteId, needed], _old, onCleanup) => {
    let stale = false
    onCleanup(() => (stale = true))
    form.specialtyId = null
    specialties.value = []
    if (!siteId || !needed) return
    const res = (await quietApi.get(`/sites/${siteId}/specialties`)).response
    if (res?.ok && !stale) {
      specialties.value = res.body.data.map((s) => ({ label: s.name, value: s.specialtyId }))
    }
  },
)

async function submit(acknowledged = []) {
  loading.value = true
  const body = {
    siteId: form.siteId,
    activityType: form.activityType,
    startAt: fromDatetimeInput(form.startAt),
    endAt: fromDatetimeInput(form.endAt),
    published: form.published,
  }
  if (form.agentId) body.agentId = form.agentId
  if (form.title) body.title = form.title
  if (needsSpecialty.value && form.specialtyId) body.specialtyId = form.specialtyId
  if (acknowledged.length) body.acknowledgedWarnings = acknowledged
  exchange.value = await api.post('/services', body)
  const created = exchange.value.response
  if (created?.status === 201) {
    rememberService(created.body.id)
    $q.notify({ type: 'positive', message: `Vacation #${created.body.id} créée.` })
  }
  loading.value = false
}
</script>

<template>
  <q-card flat bordered>
    <q-card-section>
      <div class="text-h6">Créer une vacation</div>
      <div class="text-caption">
        <code>POST /services</code> : site et type d'activité obligatoires. Créneau proposé : demain
        de 8 h à 16 h.
      </div>
    </q-card-section>
    <q-card-section class="row q-col-gutter-md">
      <q-select
        v-model="form.siteId"
        :options="siteOptions"
        label="Site *"
        dense
        outlined
        emit-value
        map-options
        class="col-12 col-md-4"
      />
      <q-select
        v-model="form.agentId"
        :options="agentOptions"
        label="Collaborateur"
        dense
        outlined
        clearable
        emit-value
        map-options
        class="col-12 col-md-4"
      />
      <q-select
        v-model="form.activityType"
        :options="typeOptions"
        label="Type d'activité *"
        dense
        outlined
        emit-value
        map-options
        class="col-12 col-md-4"
      />
      <q-select
        v-if="needsSpecialty"
        v-model="form.specialtyId"
        :options="specialties"
        label="Spécialité (obligatoire pour ce type)"
        dense
        outlined
        emit-value
        map-options
        class="col-12 col-md-4"
      />
      <q-input
        v-model="form.startAt"
        type="datetime-local"
        label="Début *"
        dense
        outlined
        class="col-12 col-md-4"
      />
      <q-input
        v-model="form.endAt"
        type="datetime-local"
        label="Fin *"
        dense
        outlined
        class="col-12 col-md-4"
      />
      <q-input v-model="form.title" label="Intitulé" dense outlined class="col-12 col-md-8" />
      <div class="col-12 col-md-4">
        <q-toggle v-model="form.published" label="Publier la vacation" />
        <div class="text-caption">
          Non publiée, la vacation n'est pas renvoyée par <code>GET /services</code>.
        </div>
      </div>
    </q-card-section>
    <q-card-actions>
      <q-btn
        color="positive"
        label="Créer la vacation"
        :loading="loading"
        :disable="!form.siteId"
        @click="submit()"
        ><q-tooltip>Envoie POST /services avec le créneau saisi.</q-tooltip></q-btn
      >
      <q-btn
        v-if="pendingWarnings.length"
        color="warning"
        text-color="dark"
        icon="warning"
        label="Confirmer malgré l'avertissement"
        :loading="loading"
        @click="submit(pendingWarnings)"
        ><q-tooltip
          >Renvoie la requête en acquittant les avertissements de l'API
          (acknowledgedWarnings).</q-tooltip
        ></q-btn
      >
    </q-card-actions>
    <q-card-section v-if="exchange">
      <ExchangePanel :exchange="exchange" />
    </q-card-section>
  </q-card>
</template>
