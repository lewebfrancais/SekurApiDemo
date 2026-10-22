<script setup>
import { onMounted, ref, watch } from 'vue'
import { api } from '../composables/useDemo.js'
import ExchangePanel from './ExchangePanel.vue'

const props = defineProps({
  path: { type: String, required: true },
  columns: { type: Array, required: true },
  query: { type: Object, default: () => ({}) },
  // Faux tant que les paramètres obligatoires (ex. plage de dates) ne sont pas valides.
  ready: { type: Boolean, default: true },
})

const rows = ref([])
const loading = ref(false)
const exchange = ref(null)
const pagination = ref({ page: 1, rowsPerPage: 10, rowsNumber: 0 })

let fetchSeq = 0
async function fetchPage(page = pagination.value.page, limit = pagination.value.rowsPerPage) {
  const seq = ++fetchSeq
  if (!props.ready) {
    rows.value = []
    loading.value = false
    return
  }
  loading.value = true
  const result = await api.get(props.path, { ...props.query, page, limit })
  // Une réponse plus lente d'un filtre précédent ne doit pas écraser l'affichage courant.
  if (seq !== fetchSeq) return
  exchange.value = result
  const res = result.response
  if (res?.ok) {
    rows.value = res.body.data
    pagination.value = {
      page: res.body.meta.page,
      rowsPerPage: res.body.meta.limit,
      rowsNumber: res.body.meta.total,
    }
  } else {
    rows.value = []
  }
  loading.value = false
}

function onRequest({ pagination: next }) {
  fetchPage(next.page, next.rowsPerPage)
}

onMounted(() => fetchPage(1))
watch(
  () => [props.path, props.query, props.ready],
  () => fetchPage(1),
  { deep: true },
)
defineExpose({ refresh: () => fetchPage(1) })
</script>

<template>
  <div class="q-gutter-y-md">
    <q-table
      dense
      flat
      bordered
      row-key="id"
      :rows="rows"
      :columns="columns"
      :loading="loading"
      v-model:pagination="pagination"
      :rows-per-page-options="[10, 25, 50, 100]"
      rows-per-page-label="Lignes par page"
      no-data-label="Aucune donnée"
      @request="onRequest"
    />
    <q-expansion-item dense icon="swap_horiz" label="Voir la requête et la réponse brute">
      <ExchangePanel :exchange="exchange" />
    </q-expansion-item>
  </div>
</template>
