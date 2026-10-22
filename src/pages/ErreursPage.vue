<script setup>
import { computed, ref } from 'vue'
import { useQuasar } from 'quasar'
import ExchangePanel from '../components/ExchangePanel.vue'
import {
  businessRule,
  forbidden,
  notFound,
  overlap,
  payloadTooLarge,
  rateLimit,
  unauthorized,
  MAX_BURST,
} from '../api/scenarios.js'
import {
  api,
  config,
  exchanges,
  lookups,
  stressEnabled,
  writesEnabled,
} from '../composables/useDemo.js'

const $q = useQuasar()

const current = ref(null)
const note = ref('')
const retryBody = ref(null)
const running = ref(null)

const siteId = computed(() => lookups.value.sites[0]?.id ?? null)
const agentId = computed(() => lookups.value.collaborators.find((c) => c.isPlannable)?.id ?? null)
const historyUrl = computed(() => (config.value ? `${config.value.appUrl}/#/params/agency` : null))

const STRESS_WARNING =
  'Le quota est partagé par toute l’agence : la rafale bloque vos intégrations réelles (ERP, synchronisations) pendant la durée indiquée par Retry-After.'
const payloadAvailable = computed(() => config.value?.payloadTooLargeDocumented !== false)

const pendingWarnings = computed(() => {
  const body = current.value?.response?.body
  return retryBody.value && body?.reason === 'confirmation_required'
    ? body.warnings.map((w) => w.code)
    : []
})

const scenarios = computed(() => [
  {
    key: '401',
    title: '401 - Clé absente ou invalide',
    text: 'Appel sans aucune clé.',
    run: () => unauthorized(api),
  },
  {
    key: '403',
    title: '403 - Niveau insuffisant',
    text: 'Création d’un client avec la clé lecture.',
    run: () => forbidden(api),
  },
  {
    key: '404',
    title: '404 - Élément introuvable',
    text: 'Lecture d’une vacation avec un identifiant inexistant (ou d’une autre agence).',
    run: () => notFound(api),
  },
  {
    key: '422a',
    title: '422 - Règle métier (dates)',
    text: 'Vacation dont la fin précède le début : refus garanti.',
    requires: 'writes',
    needs: 'site',
    run: () => businessRule(api, { siteId: siteId.value }),
  },
  {
    key: '422b',
    title: '422 - Chevauchement de vacations',
    text: 'Crée la même vacation deux fois pour le même collaborateur. Attention : la première est créée dans votre agence.',
    requires: 'writes',
    needs: 'siteAgent',
    confirm:
      'Cela crée une vacation « Démo - » dans votre agence (demain 8 h-16 h) puis tente de la recréer. Continuer ?',
    run: () => overlap(api, { siteId: siteId.value, agentId: agentId.value }),
  },
  {
    key: '429',
    title: '429 - Limite de débit',
    text: `Lit X-RateLimit-Remaining, puis envoie Remaining + 1 requêtes GET /me avec la clé lecture (${MAX_BURST} au plus), arrêtées au premier 429.`,
    requires: 'stress',
    confirm: `${STRESS_WARNING} Sekur journalise les refus de débit. Continuer ?`,
    run: () => rateLimit(api),
  },
  {
    key: '413',
    title: '413 - Corps trop gros',
    text: 'Envoie environ 4,5 Mio de JSON avec la clé écriture ; l’API le refuse avant de le lire.',
    requires: 'stress',
    confirm: `${STRESS_WARNING} Continuer ?`,
    unavailable: !payloadAvailable.value,
    run: () => payloadTooLarge(api),
  },
])

const DISABLED_REASONS = {
  writes: 'Écritures désactivées : ajoutez DEMO_ALLOW_WRITES=true dans .env.local.',
  stress: 'Scénario désactivé : ajoutez DEMO_ALLOW_STRESS=true dans .env.local.',
}

function disabledReason(scenario) {
  const enabled = { writes: writesEnabled.value, stress: stressEnabled.value }
  return scenario.requires && !enabled[scenario.requires]
    ? DISABLED_REASONS[scenario.requires]
    : null
}

function missing(scenario) {
  if (scenario.needs === 'site' && !siteId.value) return 'Aucun site actif dans votre agence.'
  if (scenario.needs === 'siteAgent' && (!siteId.value || !agentId.value)) {
    return 'Il faut un site actif et un collaborateur planifiable.'
  }
  return null
}

async function play(scenario) {
  const problem = missing(scenario)
  if (problem) return $q.notify({ type: 'negative', message: problem })
  if (scenario.confirm) {
    const ok = await new Promise((resolve) =>
      $q
        .dialog({ title: 'Confirmer', message: scenario.confirm, cancel: true, persistent: true })
        .onOk(() => resolve(true))
        .onCancel(() => resolve(false))
        .onDismiss(() => resolve(false)),
    )
    if (!ok) return
  }
  running.value = scenario.key
  note.value = ''
  retryBody.value = null
  try {
    const result = await scenario.run()
    current.value = result.exchange
    note.value = result.note ?? ''
    retryBody.value = result.retryBody ?? null
    if (scenario.key === '422b' && result.exchange.response?.status === 201) {
      note.value =
        'Aucun conflit détecté : votre agence autorise ce chevauchement (les deux vacations existent).'
    }
  } finally {
    running.value = null
  }
}

async function confirmWarnings() {
  running.value = 'ack'
  current.value = await api.post(
    '/services',
    { ...retryBody.value, acknowledgedWarnings: pendingWarnings.value },
    { keyLevel: 'write' },
  )
  if (current.value.response?.ok) {
    note.value = 'Avertissements acquittés : l’écriture est passée.'
    retryBody.value = null
  } else {
    note.value =
      'Acquittement refusé : voir la réponse ci-dessous. Le corps de reprise est conservé.'
  }
  running.value = null
}
</script>

<template>
  <div class="q-gutter-y-md">
    <div class="text-body1">
      Chaque bouton rejoue un appel réel sur votre agence. Le panneau montre la requête (sans clé)
      et la réponse brute, avec une explication.
    </div>

    <div class="row q-col-gutter-md">
      <div v-for="scenario in scenarios" :key="scenario.key" class="col-12 col-sm-6 col-md-4">
        <q-card flat bordered class="full-height column">
          <q-card-section class="col">
            <div class="text-subtitle1">{{ scenario.title }}</div>
            <div class="text-caption">{{ scenario.text }}</div>
            <div v-if="disabledReason(scenario)" class="text-caption demo-warn-text q-mt-sm">
              {{ disabledReason(scenario) }}
            </div>
            <div v-else-if="scenario.unavailable" class="text-caption demo-warn-text q-mt-sm">
              Pas encore disponible sur cet environnement : la réponse 413 n'est pas documentée sur
              POST /external/v1/services.
            </div>
          </q-card-section>
          <q-card-actions>
            <q-btn
              color="positive"
              label="Jouer"
              :loading="running === scenario.key"
              :disable="
                scenario.unavailable ||
                Boolean(disabledReason(scenario)) ||
                (running !== null && running !== scenario.key)
              "
              @click="play(scenario)"
              ><q-tooltip>Rejoue ce scénario et affiche la réponse brute.</q-tooltip></q-btn
            >
          </q-card-actions>
        </q-card>
      </div>
    </div>

    <q-banner v-if="note" class="demo-note" rounded dense>{{ note }}</q-banner>
    <q-btn
      v-if="pendingWarnings.length"
      color="warning"
      text-color="dark"
      icon="warning"
      label="Confirmer malgré l'avertissement"
      :loading="running === 'ack'"
      @click="confirmWarnings"
      ><q-tooltip
        >Renvoie la requête en acquittant les avertissements de l'API
        (acknowledgedWarnings).</q-tooltip
      ></q-btn
    >
    <ExchangePanel :exchange="current" />

    <q-card v-if="historyUrl" flat bordered>
      <q-card-section>
        <div class="text-subtitle1">Voir l'origine « API » dans Sekur</div>
        <div class="text-caption">
          Les écritures faites avec la démo apparaissent dans l'Historique des actions de l'agence,
          avec l'origine « API ».
        </div>
      </q-card-section>
      <q-card-actions>
        <q-btn
          flat
          color="positive"
          icon="open_in_new"
          label="Ouvrir l'Historique des actions"
          :href="historyUrl"
          target="_blank"
          rel="noopener"
        />
      </q-card-actions>
    </q-card>

    <q-expansion-item icon="history" :label="`Historique des échanges (${exchanges.length})`">
      <q-list bordered separator>
        <q-item
          v-for="exchange in exchanges"
          :key="exchange.id"
          clickable
          @click="current = exchange"
        >
          <q-item-section avatar>
            <q-badge :label="exchange.response?.status ?? 'réseau'" />
          </q-item-section>
          <q-item-section>
            {{ exchange.request.method }} {{ exchange.request.url }}
          </q-item-section>
          <q-item-section side>{{ exchange.durationMs }} ms</q-item-section>
        </q-item>
      </q-list>
    </q-expansion-item>
  </div>
</template>
