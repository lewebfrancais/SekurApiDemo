<script setup>
// CRUD générique d'une ressource du catalogue, piloté par sa définition (src/api/catalog.js).
import { computed, reactive, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import ExchangePanel from './ExchangePanel.vue'
import { api, keyLevel, lookups, writesEnabled } from '../composables/useDemo.js'
import {
  acknowledgedQuery,
  buildBody,
  initialValues,
  itemPath,
  listPath,
  pricingBody,
} from '../api/catalog.js'
import { PRICING_WARNING, entityLabel, realItemWarning } from '../api/risks.js'
import { askConfirm } from '../composables/useConfirm.js'
import { methodColor } from '../api/verbs.js'

const props = defineProps({
  resource: { type: Object, required: true },
  parentId: { type: Number, default: null },
})

const $q = useQuasar()
const rows = ref([])
const loading = ref(false)
const pagination = ref({ page: 1, rowsPerPage: 10, rowsNumber: 0 })
const exchange = ref(null)
const lastAction = ref(null)
const settingsText = ref('')
const settingsSource = ref('')
const dialog = reactive({ open: false, mode: 'create', row: null, values: {}, error: '' })

const specialtyOptions = computed(() =>
  lookups.value.specialties.map((s) => ({ label: s.name || `#${s.id}`, value: s.id })),
)
const ready = computed(() => props.resource.level === 'agency' || props.parentId !== null)
const columns = computed(() => [
  ...(props.resource.columns ?? []),
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' },
])
const needsDeleteKey = computed(() => props.resource.canDelete && keyLevel.value !== 'delete')

const pendingCodes = computed(() => {
  const body = exchange.value?.response?.body
  return body?.reason === 'confirmation_required' ? body.warnings.map((w) => w.code) : []
})

async function load(page = pagination.value.page, limit = pagination.value.rowsPerPage) {
  if (!ready.value) return
  loading.value = true
  const path = listPath(props.resource, props.parentId)
  if (props.resource.kind === 'singleton') {
    const res = await api.get(path)
    exchange.value = res
    if (res.response?.ok) {
      settingsText.value = JSON.stringify(pricingBody(res.response.body), null, 2)
      settingsSource.value = res.response.body.rateSource ?? 'agency_settings'
    }
  } else {
    const query = { ...props.resource.listQuery?.(props.parentId), page, limit }
    const res = await api.get(path, query)
    exchange.value = res
    if (res.response?.ok) {
      rows.value = res.response.body.data
      const meta = res.response.body.meta
      pagination.value = { page: meta.page, rowsPerPage: meta.limit, rowsNumber: meta.total }
    } else {
      rows.value = []
    }
  }
  lastAction.value = null
  loading.value = false
}

async function perform(action, successMessage, codes = []) {
  const done = await action(codes)
  lastAction.value = action
  const ok = done.response?.ok
  if (ok) {
    $q.notify({ type: 'positive', message: successMessage })
    await load()
  }
  exchange.value = done
  return ok
}

const withAck = (body, codes) => (codes.length ? { ...body, acknowledgedWarnings: codes } : body)

function openCreate() {
  Object.assign(dialog, {
    open: true,
    mode: 'create',
    row: null,
    values: initialValues(props.resource),
    error: '',
  })
}

function openEdit(row) {
  Object.assign(dialog, {
    open: true,
    mode: 'update',
    row,
    values: initialValues(props.resource, row),
    error: '',
  })
}

async function submitDialog() {
  let body
  try {
    body = buildBody(props.resource, dialog.values, dialog.mode, props.parentId)
  } catch (error) {
    dialog.error = `JSON invalide : ${error.message}`
    return
  }
  const { resource, parentId } = props
  if (dialog.mode === 'update') {
    const lines = [
      ...realWarning(dialog.row),
      `PATCH ${itemPath(resource, parentId, dialog.row)} : ${Object.keys(body).join(', ')}.`,
    ]
    if (!(await askConfirm($q, 'Confirmer', lines))) return
  }
  dialog.open = false
  if (dialog.mode === 'create') {
    await perform(
      (codes) => api.post(listPath(resource, parentId), withAck(body, codes)),
      'Élément créé.',
    )
  } else {
    const row = dialog.row
    await perform(
      (codes) => api.patch(itemPath(resource, parentId, row), withAck(body, codes)),
      'Élément modifié.',
    )
  }
}

// Le README promet un avertissement avant toute écriture sur un élément qui n'est pas « Démo - ».
const realWarning = (row) => [realItemWarning(entityLabel(row))].filter(Boolean)

async function askDelete(row) {
  const { resource, parentId } = props
  const lines = [
    ...realWarning(row),
    `DELETE ${itemPath(resource, parentId, row)} : cela exige la clé suppression.`,
  ]
  if (!(await askConfirm($q, 'Supprimer', lines))) return
  return perform(
    (codes) =>
      api.delete(
        itemPath(resource, parentId, row),
        codes.length ? { acknowledgedWarnings: acknowledgedQuery(codes) } : undefined,
      ),
    'Élément supprimé.',
  )
}

async function saveSettings() {
  let body
  try {
    body = JSON.parse(settingsText.value)
  } catch (error) {
    $q.notify({ type: 'negative', message: `JSON invalide : ${error.message}` })
    return
  }
  const { resource, parentId } = props
  const send = () =>
    perform(
      (codes) => api.patch(listPath(resource, parentId), withAck(body, codes)),
      'Réglages enregistrés.',
    )
  if (resource.key !== 'pricing') return send()
  $q.dialog({
    title: 'Confirmer la modification',
    message: PRICING_WARNING + ' Continuer ?',
    cancel: true,
    persistent: true,
  }).onOk(send)
}

function removeSettings() {
  const { resource, parentId } = props
  $q.dialog({
    title: 'Retirer les réglages propres',
    message: 'Cela exige la clé suppression. Continuer ?',
    cancel: true,
    persistent: true,
  }).onOk(() =>
    perform(
      (codes) =>
        api.delete(
          listPath(resource, parentId),
          codes.length ? { acknowledgedWarnings: acknowledgedQuery(codes) } : undefined,
        ),
      'Réglages propres retirés.',
    ),
  )
}

async function confirmWarnings() {
  const action = lastAction.value
  if (!action) return
  const done = await action(pendingCodes.value)
  exchange.value = done
  if (done.response?.ok) {
    $q.notify({ type: 'positive', message: 'Avertissements acquittés : écriture effectuée.' })
    await load()
    exchange.value = done
  }
}

watch(
  () => [props.resource.key, props.parentId],
  () => {
    exchange.value = null
    rows.value = []
    pagination.value = { page: 1, rowsPerPage: 10, rowsNumber: 0 }
    load(1)
  },
  { immediate: true },
)
</script>

<template>
  <div class="q-gutter-y-md">
    <q-banner v-if="resource.note" dense class="demo-note">{{ resource.note }}</q-banner>
    <q-banner v-if="needsDeleteKey" dense class="demo-warn">
      La suppression exige une clé « suppression » (read_write_delete) : choisissez-la dans
      l'en-tête (en haut à droite), sinon l'API répondra 403.
    </q-banner>
    <q-banner v-if="!ready" dense class="demo-warn">
      Choisissez d'abord un {{ resource.level === 'customer' ? 'client' : 'site' }}.
    </q-banner>

    <template v-else-if="resource.kind === 'collection'">
      <div class="row items-center q-gutter-sm">
        <q-btn
          color="positive"
          icon="add"
          label="Créer"
          :disable="!writesEnabled"
          @click="openCreate"
          ><q-tooltip>Ouvre le formulaire de création (POST).</q-tooltip></q-btn
        >
        <q-btn flat icon="refresh" label="Actualiser" @click="load()"
          ><q-tooltip>Relit la liste depuis l'API (GET).</q-tooltip></q-btn
        >
      </div>
      <q-table
        dense
        flat
        bordered
        :row-key="resource.idKey"
        :rows="rows"
        :columns="columns"
        :loading="loading"
        v-model:pagination="pagination"
        :rows-per-page-options="[10, 25, 50, 100]"
        rows-per-page-label="Lignes par page"
        no-data-label="Aucune donnée"
        @request="({ pagination: next }) => load(next.page, next.rowsPerPage)"
      >
        <template #body-cell-actions="cell">
          <q-td class="text-right">
            <q-btn
              flat
              dense
              icon="edit"
              aria-label="Modifier"
              :disable="!writesEnabled"
              @click="openEdit(cell.row)"
              ><q-tooltip>Modifier cet élément (PATCH).</q-tooltip></q-btn
            >
            <q-btn
              v-if="resource.canDelete"
              flat
              dense
              color="negative"
              icon="delete"
              aria-label="Supprimer"
              :disable="!writesEnabled"
              @click="askDelete(cell.row)"
              ><q-tooltip
                >Supprimer cet élément (DELETE, exige une clé de niveau suppression).</q-tooltip
              ></q-btn
            >
          </q-td>
        </template>
      </q-table>
    </template>

    <template v-else>
      <div class="text-caption">
        Origine des réglages lus : <code>{{ settingsSource }}</code
        >. Seuls les champs modifiables sont proposés ; <code>PATCH</code> ne change que les champs
        présents.
      </div>
      <q-input v-model="settingsText" type="textarea" outlined autogrow input-class="text-mono" />
      <div class="row q-gutter-sm">
        <q-btn
          :color="methodColor('PATCH')"
          label="Enregistrer (PATCH)"
          :disable="!writesEnabled"
          @click="saveSettings"
          ><q-tooltip>Envoie les réglages modifiés à l'API (PATCH).</q-tooltip></q-btn
        >
        <q-btn flat icon="refresh" label="Relire" @click="load()"
          ><q-tooltip>Relit les réglages depuis l'API (GET).</q-tooltip></q-btn
        >
        <q-btn
          v-if="resource.canDelete"
          flat
          color="negative"
          icon="delete"
          label="Retirer les réglages propres"
          :disable="!writesEnabled"
          @click="removeSettings"
          ><q-tooltip
            >Supprime les réglages propres (DELETE) : retour aux réglages hérités. Exige la clé
            suppression.</q-tooltip
          ></q-btn
        >
      </div>
    </template>

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
          <div class="text-h6">{{ dialog.mode === 'create' ? 'Créer' : 'Modifier' }}</div>
        </q-card-section>
        <q-card-section class="q-gutter-y-sm">
          <template v-for="field in resource.fields" :key="field.name">
            <template v-if="dialog.mode === 'create' || field.update !== false">
              <q-select
                v-if="field.type === 'specialty' || field.type === 'specialties'"
                v-model="dialog.values[field.name]"
                :options="specialtyOptions"
                :label="field.label + (field.required ? ' *' : '')"
                :multiple="field.type === 'specialties'"
                :use-chips="field.type === 'specialties'"
                emit-value
                map-options
                dense
                outlined
                clearable
              />
              <q-select
                v-else-if="field.type === 'select'"
                v-model="dialog.values[field.name]"
                :options="field.options"
                :label="field.label"
                dense
                outlined
                clearable
              />
              <q-input
                v-else
                v-model="dialog.values[field.name]"
                :label="field.label + (field.required ? ' *' : '')"
                :type="
                  field.type === 'number'
                    ? 'number'
                    : field.type === 'html' || field.type === 'json'
                      ? 'textarea'
                      : 'text'
                "
                :step="field.type === 'number' ? 'any' : undefined"
                :hint="field.help"
                :autogrow="field.type === 'html' || field.type === 'json'"
                dense
                outlined
              />
            </template>
          </template>
          <div v-if="dialog.error" class="text-negative">{{ dialog.error }}</div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Annuler" v-close-popup
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
