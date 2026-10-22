<script setup>
import { computed } from 'vue'
import { explainError, formatError } from '../api/errors.js'
import { methodColor, statusColor as colorOf } from '../api/verbs.js'

const props = defineProps({
  exchange: { type: Object, default: null },
})

const SHOWN_HEADERS = [
  'content-type',
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'idempotent-replayed',
  'www-authenticate',
  'allow',
]
const MAX_BODY_CHARS = 4000

const response = computed(() => props.exchange?.response ?? null)
const explanation = computed(() => explainError(response.value))
const apiError = computed(() =>
  response.value && response.value.status >= 400 ? formatError(response.value) : null,
)
const statusColor = computed(() => colorOf(response.value?.status))

const requestText = computed(() => {
  const { request } = props.exchange
  const lines = [`${request.method} ${request.url}`]
  for (const [name, value] of Object.entries(request.headers)) {
    lines.push(
      name === 'X-Demo-Key-Level'
        ? `${name}: ${value}   # sélecteur local, retiré par le proxy`
        : `${name}: ${value}`,
    )
  }
  lines.push(
    request.headers['X-Demo-Key-Level'] === 'none'
      ? 'X-API-Key: (aucune clé envoyée)'
      : 'X-API-Key: ●●●●●●   # ajoutée par le proxy, jamais visible dans le navigateur',
  )
  if (request.bodyPreview !== null) {
    const truncated = request.bodyBytes > request.bodyPreview.length
    lines.push('', request.bodyPreview + (truncated ? ' ...' : ''))
    if (truncated) lines.push(`(corps de ${request.bodyBytes} octets, aperçu tronqué)`)
  }
  return lines.join('\n')
})

const responseText = computed(() => {
  const res = response.value
  if (!res) return ''
  const lines = [`HTTP ${res.status} ${res.statusText}`.trim()]
  for (const name of SHOWN_HEADERS) {
    if (res.headers[name] !== undefined) lines.push(`${name}: ${res.headers[name]}`)
  }
  const body = typeof res.body === 'string' ? res.body : JSON.stringify(res.body, null, 2)
  if (body) {
    lines.push('', body.length > MAX_BODY_CHARS ? `${body.slice(0, MAX_BODY_CHARS)} ...` : body)
  }
  return lines.join('\n')
})
</script>

<template>
  <q-card v-if="exchange" flat bordered>
    <q-card-section class="row items-center q-gutter-sm">
      <q-badge :color="statusColor" :label="response ? response.status : 'réseau'" />
      <q-badge :color="methodColor(exchange.request.method)" :label="exchange.request.method" />
      <span class="text-weight-medium text-mono">{{ exchange.request.url }}</span>
      <q-space />
      <span class="text-caption">{{ exchange.durationMs }} ms</span>
    </q-card-section>

    <q-banner v-if="exchange.networkError" class="bg-negative text-white" dense>
      Pas de réponse HTTP : {{ exchange.networkError }}. Un corps trop gros peut être coupé par le
      serveur avant la fin de l'envoi.
    </q-banner>

    <q-banner v-if="explanation" class="bg-info text-dark" dense>
      <div class="text-weight-bold">{{ explanation.title }}</div>
      <div>{{ explanation.text }}</div>
    </q-banner>

    <q-banner v-if="apiError?.message" class="bg-warning text-dark" dense>
      <div class="text-caption">Message de l'API, tel quel</div>
      <div class="text-body1">{{ apiError.message }}</div>
      <ul v-if="apiError.violations.length" class="q-my-xs">
        <li v-for="(violation, i) in apiError.violations" :key="i">
          <code>{{ violation.field }}</code> : {{ violation.message }}
        </li>
      </ul>
      <ul v-if="apiError.warnings.length" class="q-my-xs">
        <li v-for="(warning, i) in apiError.warnings" :key="i">
          <code>{{ warning.code }}</code> : {{ warning.message }}
        </li>
      </ul>
    </q-banner>

    <q-card-section class="row q-col-gutter-md">
      <div class="col-12 col-md-6">
        <div class="text-subtitle2">Requête</div>
        <pre class="demo-pre">{{ requestText }}</pre>
      </div>
      <div class="col-12 col-md-6">
        <div class="text-subtitle2">Réponse brute</div>
        <pre class="demo-pre">{{ responseText || '(aucune réponse)' }}</pre>
      </div>
    </q-card-section>
  </q-card>
</template>
