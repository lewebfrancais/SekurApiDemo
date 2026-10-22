<script setup>
// Tous les endpoints de l'API externe, générés depuis sa spec OpenAPI.
import { computed, onMounted, reactive, ref } from 'vue'
import { useQuasar } from 'quasar'
import ExchangePanel from '../components/ExchangePanel.vue'
import { buildRequest, isMutation, listOperations } from '../api/openapi.js'
import { methodColor } from '../api/verbs.js'
import { askConfirm } from '../composables/useConfirm.js'
import {
  BATCH_CONFIRM_ABOVE,
  BATCH_DEFAULT,
  BATCH_MAX,
  BATCH_PATH,
  batchCount,
  buildBatchBody,
  buildWarnings,
  entityLabel,
  isDemoName,
  removedStepIds,
  targetOf,
} from '../api/risks.js'
import {
  api,
  createdIds,
  keyLevel,
  lastServiceId,
  lookups,
  quietApi,
  writesEnabled,
} from '../composables/useDemo.js'

const $q = useQuasar()
const operations = ref([])
const loadError = ref('')
const filter = ref('')
const selectedId = ref(null)
const values = reactive({})
const bodyText = ref('')
const exchange = ref(null)
const loading = ref(false)

const selected = computed(() => operations.value.find((op) => op.id === selectedId.value) ?? null)
const filtered = computed(() => {
  const needle = filter.value?.trim().toLowerCase()
  return needle
    ? operations.value.filter((op) => `${op.id} ${op.summary}`.toLowerCase().includes(needle))
    : operations.value
})

onMounted(async () => {
  try {
    const res = await fetch('/demo/spec')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    operations.value = listOperations(await res.json())
  } catch (error) {
    loadError.value = `Spec OpenAPI indisponible : ${error.message}`
  }
})

const batchSize = ref(BATCH_DEFAULT)
const isBatch = computed(() => selected.value?.path === BATCH_PATH)
const lastDemo = (list) => [...list].reverse().find((item) => isDemoName(item.name))?.id
// Limite : seuls les 100 premiers clients et sites sont connus.
const demoSiteId = () => lastDemo(lookups.value.sites) ?? lookups.value.sites[0]?.id ?? null

function defaultTarget(operation) {
  const target = targetOf(operation)
  if (!target) return null
  const { segment } = target
  if (segment === 'customers') return lastDemo(lookups.value.customers)
  if (segment === 'sites') return lastDemo(lookups.value.sites)
  if (segment === 'services') return createdIds.services ?? lastServiceId.value
  return createdIds[segment]
}

function select(operation) {
  selectedId.value = operation.id
  for (const key of Object.keys(values)) delete values[key]
  const target = targetOf(operation)
  const id = defaultTarget(operation)
  if (target && id) values[target.param] = id
  batchSize.value = BATCH_DEFAULT
  bodyText.value =
    operation.path === BATCH_PATH
      ? JSON.stringify(buildBatchBody(BATCH_DEFAULT, demoSiteId()), null, 2)
      : operation.hasBody
        ? JSON.stringify(operation.bodyExample, null, 2)
        : ''
  exchange.value = null
}

function resizeBatch(count) {
  batchSize.value = count
  bodyText.value = JSON.stringify(buildBatchBody(count, demoSiteId()), null, 2)
}

// La requête est figée avant la confirmation : changer d'opération ou d'identifiant pendant le
// dialogue ne doit pas envoyer autre chose que ce qui a été confirmé.
function snapshotRequest() {
  const operation = selected.value
  const { path, query } = buildRequest(operation, values)
  // Le corps est envoyé tel quel : un JSON invalide doit produire le vrai refus de l'API.
  const body = operation.hasBody && bodyText.value.trim() ? bodyText.value : undefined
  return { operation, path, query, body, values: { ...values } }
}

async function send(request = snapshotRequest()) {
  const { operation, path, query, body } = request
  loading.value = true
  exchange.value = await api.request({ method: operation.method, path, query, body })
  const created = exchange.value.response
  if (operation.method === 'POST' && created?.status === 201 && created.body?.id) {
    const segment = operation.path.replace('/external/v1', '').split('/')[1]
    createdIds[segment] = created.body.id
  }
  loading.value = false
}

const ask = (title, lines, extra) => askConfirm($q, title, lines, extra)

// Lit l'élément visé (sans polluer l'historique) : son nom dit s'il est « Démo - » ou réel, et une
// tournée dit quelles étapes un PATCH retirerait.
async function inspectTarget({ operation, values, body }) {
  const target = targetOf(operation)
  const id = target && values[target.param]
  if (!id) return { targetLabel: null, removedSteps: 0 }
  const res = (await quietApi.get(`/${target.segment}/${id}`)).response
  if (!res?.ok) return { targetLabel: null, removedSteps: 0 }
  const removed =
    operation.id === 'PATCH /external/v1/circuits/{id}'
      ? removedStepIds(res.body.steps, body ?? '').length
      : 0
  return { targetLabel: entityLabel(res.body), removedSteps: removed }
}

async function confirmAndSend() {
  const request = snapshotRequest()
  const { operation, body = '' } = request
  if (!isMutation(operation)) return send(request)
  const inspected = await inspectTarget(request)
  const warnings = buildWarnings({
    operation,
    bodyText: body,
    values: request.values,
    ...inspected,
  })
  const generic = `${operation.method} ${operation.path} écrit dans votre agence (clé ${keyLevel.value}). Continuer ?`
  if (!(await ask('Confirmer', [...warnings, generic]))) return
  if (operation.path === BATCH_PATH && batchCount(body) > BATCH_CONFIRM_ABOVE) {
    const again = `Jusqu'à ${BATCH_MAX} vacations créées d'un coup dans votre agence. Vous en créez ${batchCount(body)}. Confirmer une seconde fois ?`
    if (!(await ask('Lot important', [again]))) return
  }
  return send(request)
}

const blockedByReadOnly = computed(
  () => Boolean(selected.value) && isMutation(selected.value) && !writesEnabled.value,
)
const missingPath = computed(() =>
  selected.value?.parameters.some((p) => p.in === 'path' && !values[p.name]),
)
</script>

<template>
  <div>
    <div class="text-body1 q-mb-md">
      Tous les endpoints de l'API externe, générés depuis la spec OpenAPI de l'API (<strong>{{
        operations.length
      }}</strong>
      opérations). Les appels utilisent la clé choisie dans l'en-tête (<code>{{ keyLevel }}</code
      >).
    </div>
    <q-banner v-if="loadError" class="bg-negative text-white q-mb-md">{{ loadError }}</q-banner>

    <div class="row q-col-gutter-md">
      <div class="col-12 col-md-5">
        <q-input
          v-model="filter"
          dense
          outlined
          clearable
          label="Filtrer (chemin, méthode, texte)"
        />
        <q-list bordered separator class="q-mt-sm explorer-list">
          <q-item
            v-for="op in filtered"
            :key="op.id"
            clickable
            :active="op.id === selectedId"
            active-class="demo-note"
            @click="select(op)"
          >
            <q-item-section side style="min-width: 76px">
              <q-badge :color="methodColor(op.method)" :label="op.method" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-mono">{{
                op.path.replace('/external/v1', '')
              }}</q-item-label>
              <q-item-label caption>{{ op.summary }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </div>

      <div class="col-12 col-md-7 q-gutter-y-md">
        <q-banner v-if="!selected" class="demo-note">Choisissez une opération à gauche.</q-banner>
        <template v-else>
          <div class="text-h6">{{ selected.method }} {{ selected.path }}</div>
          <div class="text-caption">{{ selected.summary }}</div>
          <div class="text-caption">Réponses documentées : {{ selected.statuses.join(', ') }}</div>

          <div v-if="selected.parameters.length" class="row q-col-gutter-sm">
            <div v-for="param in selected.parameters" :key="param.name" class="col-12 col-sm-6">
              <q-checkbox
                v-if="param.name === 'acknowledgedWarnings' && param.in === 'query'"
                :model-value="
                  values.acknowledgedWarnings === (param.example || 'invoice_correction')
                "
                :label="`Acquitter « ${param.example || 'invoice_correction'} » (à cocher vous-même)`"
                @update:model-value="
                  (checked) =>
                    (values.acknowledgedWarnings = checked
                      ? param.example || 'invoice_correction'
                      : '')
                "
              />
              <q-select
                v-else-if="param.enum"
                v-model="values[param.name]"
                :options="param.enum"
                :label="`${param.name}${param.required ? ' *' : ''} (${param.in})`"
                dense
                outlined
                clearable
              />
              <q-input
                v-else
                v-model="values[param.name]"
                :label="`${param.name}${param.required ? ' *' : ''} (${param.in})`"
                :hint="param.description.slice(0, 120)"
                dense
                outlined
              />
            </div>
          </div>

          <q-input
            v-if="isBatch"
            :model-value="batchSize"
            type="number"
            :min="1"
            :max="BATCH_MAX"
            :label="`Nombre de vacations à créer (${BATCH_DEFAULT} par défaut, ${BATCH_MAX} au plus)`"
            dense
            outlined
            @update:model-value="(count) => resizeBatch(count)"
          />
          <q-input
            v-if="selected.hasBody"
            v-model="bodyText"
            type="textarea"
            outlined
            autogrow
            label="Corps JSON"
            input-class="text-mono"
          />
          <div v-if="selected.method === 'POST'" class="text-caption">
            Une <code>Idempotency-Key</code> (UUID) est ajoutée automatiquement.
          </div>

          <q-btn
            :color="selected.method === 'GET' ? 'positive' : methodColor(selected.method)"
            :label="`Envoyer ${selected.method}`"
            :loading="loading"
            :disable="missingPath || blockedByReadOnly"
            @click="confirmAndSend"
          >
            <q-tooltip>{{ `Envoie ${selected.method} ${selected.path} à l'API.` }}</q-tooltip>
          </q-btn>
          <div v-if="blockedByReadOnly" class="text-caption demo-warn-text">
            Écritures désactivées : ajoutez <code>DEMO_ALLOW_WRITES=true</code> dans
            <code>.env.local</code> pour envoyer cette requête.
          </div>
          <ExchangePanel :exchange="exchange" />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.explorer-list {
  max-height: 70vh;
  overflow: auto;
}
</style>
