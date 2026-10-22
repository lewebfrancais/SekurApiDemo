<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import ExchangePanel from './ExchangePanel.vue'
import { formatDateTime, shiftIso, toDateInput } from '../api/dates.js'
import { api, lastServiceId } from '../composables/useDemo.js'
import { methodColor } from '../api/verbs.js'
import { realItemWarning } from '../api/risks.js'
import { askConfirm } from '../composables/useConfirm.js'

const $q = useQuasar()

const options = ref([])
const serviceId = ref(null)
const minutes = ref(60)
const loading = ref(false)
const readExchange = ref(null)
const patchExchange = ref(null)

const pendingWarnings = computed(() => {
  const body = patchExchange.value?.response?.body
  return body?.reason === 'confirmation_required' ? body.warnings.map((w) => w.code) : []
})

async function loadServices() {
  const today = new Date()
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 31)
  const res = (
    await api.get('/services', {
      from: toDateInput(today),
      to: toDateInput(end),
      limit: 100,
    })
  ).response
  const loaded = res?.ok
    ? res.body.data.map((s) => ({
        label: `#${s.id} ${s.title || s.activityType} - ${formatDateTime(s.startAt)}`,
        value: s.id,
      }))
    : []
  // La vacation qu'on vient de créer peut sortir de la fenêtre : on la garde sélectionnable.
  const created = lastServiceId.value
  if (created && !loaded.some((o) => o.value === created)) {
    loaded.unshift({ label: `#${created} (créée à l'instant)`, value: created })
  }
  options.value = loaded
  if (created) serviceId.value = created
}

onMounted(loadServices)
watch(lastServiceId, loadServices)

async function shift(acknowledged = []) {
  const id = serviceId.value
  loading.value = true
  patchExchange.value = null
  readExchange.value = await api.get(`/services/${id}`)
  const service = readExchange.value.response
  if (service?.ok && !acknowledged.length) {
    const lines = [
      ...[realItemWarning(service.body.title, 'une vacation', 'sans intitulé')].filter(Boolean),
      `PATCH /services/${id} : décalage de ${minutes.value} min.`,
    ]
    if (!(await askConfirm($q, 'Confirmer', lines))) {
      loading.value = false
      return
    }
  }
  if (service?.ok) {
    const body = {
      startAt: shiftIso(service.body.startAt, minutes.value),
      endAt: shiftIso(service.body.endAt, minutes.value),
    }
    if (acknowledged.length) body.acknowledgedWarnings = acknowledged
    patchExchange.value = await api.patch(`/services/${id}`, body)
    if (patchExchange.value.response?.ok) {
      $q.notify({ type: 'positive', message: `Vacation #${id} décalée.` })
    }
  }
  loading.value = false
}
</script>

<template>
  <q-card flat bordered>
    <q-card-section>
      <div class="text-h6">Décaler une vacation</div>
      <div class="text-caption">
        <code>GET /services/{id}</code> puis <code>PATCH /services/{id}</code> avec les nouveaux
        <code>startAt</code> et <code>endAt</code> (envoyés en UTC, à la seconde).
      </div>
    </q-card-section>
    <q-card-section class="row q-col-gutter-md">
      <q-select
        v-model="serviceId"
        :options="options"
        label="Vacation *"
        dense
        outlined
        emit-value
        map-options
        class="col-12 col-md-8"
      />
      <q-input
        v-model.number="minutes"
        type="number"
        label="Décalage (minutes, négatif pour avancer)"
        dense
        outlined
        class="col-12 col-md-4"
      />
    </q-card-section>
    <q-card-actions>
      <q-btn
        :color="methodColor('PATCH')"
        label="Décaler"
        :loading="loading"
        :disable="!serviceId || !minutes"
        @click="shift()"
        ><q-tooltip>Lit la vacation puis décale ses horaires (GET puis PATCH).</q-tooltip></q-btn
      >
      <q-btn
        v-if="pendingWarnings.length"
        color="warning"
        text-color="dark"
        icon="warning"
        label="Confirmer malgré l'avertissement"
        :loading="loading"
        @click="shift(pendingWarnings)"
        ><q-tooltip
          >Renvoie la requête en acquittant les avertissements de l'API
          (acknowledgedWarnings).</q-tooltip
        ></q-btn
      >
    </q-card-actions>
    <q-card-section v-if="readExchange" class="q-gutter-y-md">
      <ExchangePanel :exchange="patchExchange ?? readExchange" />
    </q-card-section>
  </q-card>
</template>
