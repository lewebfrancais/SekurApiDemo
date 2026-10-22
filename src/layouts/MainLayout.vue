<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useRoute } from 'vue-router'
import {
  KEY_LEVELS,
  config,
  keyConfigured,
  keyLevel,
  loadConfig,
  loadLookups,
  lookups,
  loadMe,
  me,
  writesEnabled,
} from '../composables/useDemo.js'

const $q = useQuasar()
const route = useRoute()
const drawer = ref(true)

// Liste plate dans l'ordre du scénario, avec deux titres de groupe : la démo guidée, puis
// l'Explorateur qui couvre « tout le reste de l'API ».
const NAV_GROUPS = [
  {
    title: 'Démo guidée',
    items: [
      { to: '/', icon: 'home', label: 'Accueil', exact: true },
      { to: '/lecture', icon: 'visibility', label: 'Lecture' },
      { to: '/ecriture', icon: 'edit', label: 'Écriture' },
      { to: '/catalogue', icon: 'inventory_2', label: 'Catalogue' },
      { to: '/erreurs', icon: 'school', label: 'Erreurs pédagogiques' },
    ],
  },
  {
    title: 'Référence',
    items: [{ to: '/explorateur', icon: 'travel_explore', label: 'Explorateur' }],
  },
]

// Sans clé renseignée pour un niveau, ce niveau est indisponible.
const keyOptions = computed(() =>
  Object.keys(KEY_LEVELS).map((value) => ({
    value,
    slot: value,
    disable: config.value?.keys?.[value] === false,
    attrs: { 'aria-label': `Clé ${KEY_LEVELS[value].label}` },
  })),
)

const ICONS = { read: 'visibility', write: 'edit', delete: 'delete' }
const title = computed(() => route.meta.title ?? '')
const subtitle = computed(() => route.meta.subtitle ?? '')

const DARK_KEY = 'sekur-demo-dark'
$q.dark.set(localStorage.getItem(DARK_KEY) === '1')
watch(
  () => $q.dark.isActive,
  (active) => localStorage.setItem(DARK_KEY, active ? '1' : '0'),
)

onMounted(async () => {
  await loadConfig()
  await loadMe()
  loadLookups()
})

watch(keyLevel, async () => {
  await loadMe()
  // Les listes de référence ne dépendent pas du niveau de clé : rechargées si vides.
  if (!lookups.value.customers.length) loadLookups()
})
</script>

<template>
  <q-layout view="hHh LpR lFf">
    <q-header class="demo-header text-white">
      <q-toolbar>
        <q-btn
          flat
          dense
          round
          icon="menu"
          aria-label="Menu"
          class="lt-md"
          @click="drawer = !drawer"
        >
          <q-tooltip>Ouvrir ou fermer le menu de navigation.</q-tooltip>
        </q-btn>
        <q-toolbar-title class="row items-center no-wrap">
          <span class="text-grey-5 gt-xs">Démo API Sekur</span>
          <q-icon name="chevron_right" class="text-grey-6 gt-xs" />
          <span>{{ title }}</span>
          <q-badge
            :color="writesEnabled ? 'warning' : 'grey-8'"
            :text-color="writesEnabled ? 'dark' : 'white'"
            :label="writesEnabled ? 'ÉCRITURES' : 'LECTURE SEULE'"
            class="q-ml-sm"
          />
        </q-toolbar-title>

        <q-badge
          v-if="me"
          outline
          color="white"
          class="gt-xs q-mr-md"
          :label="`Agence : ${me.agency.name}`"
        />
        <span v-if="config" class="gt-sm text-caption text-grey-5 q-mr-md">{{
          config.apiHost
        }}</span>

        <q-btn-toggle
          v-model="keyLevel"
          dense
          no-caps
          unelevated
          toggle-color="positive"
          color="grey-9"
          text-color="grey-4"
          :options="keyOptions"
          class="q-mr-sm"
        >
          <template v-for="opt in keyOptions" :key="opt.value" #[opt.slot]>
            <q-icon :name="ICONS[opt.value]" />
            <q-tooltip>Clé {{ KEY_LEVELS[opt.value].label }}</q-tooltip>
          </template>
        </q-btn-toggle>
        <q-btn
          flat
          dense
          round
          :icon="$q.dark.isActive ? 'light_mode' : 'dark_mode'"
          aria-label="Mode sombre"
          @click="$q.dark.toggle()"
        >
          <q-tooltip>{{ $q.dark.isActive ? 'Mode clair' : 'Mode sombre' }}</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="drawer" show-if-above :width="220" class="demo-drawer">
      <q-list padding>
        <template v-for="group in NAV_GROUPS" :key="group.title">
          <q-item-label header class="demo-nav-title">{{ group.title }}</q-item-label>
          <q-item
            v-for="item in group.items"
            :key="item.to"
            v-ripple
            clickable
            :to="item.to"
            :exact="item.exact"
            active-class="demo-nav-active"
          >
            <q-item-section avatar>
              <q-icon :name="item.icon" />
            </q-item-section>
            <q-item-section>{{ item.label }}</q-item-section>
          </q-item>
        </template>
      </q-list>
    </q-drawer>

    <q-page-container>
      <q-banner v-if="writesEnabled" class="demo-warn" dense>
        <template #avatar><q-icon name="warning" /></template>
        Écritures activées : les modifications portent sur les données réelles de votre agence.
      </q-banner>
      <q-banner v-if="!keyConfigured" class="bg-negative text-white" dense>
        <template #avatar><q-icon name="vpn_key_off" /></template>
        La clé « {{ KEY_LEVELS[keyLevel].label }} » n'est pas renseignée. Ajoutez
        <code>{{ KEY_LEVELS[keyLevel].variable }}</code> dans <code>.env.local</code> puis
        redémarrez <code>npm run dev</code>.
      </q-banner>
      <q-page padding>
        <div class="demo-content">
          <p v-if="subtitle" class="demo-page-subtitle q-mb-md">{{ subtitle }}</p>
          <router-view />
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<style scoped>
.demo-header {
  background: var(--demo-header);
}
.demo-drawer :deep(.q-drawer__content) {
  background: var(--demo-drawer);
  border-right: 1px solid var(--demo-border);
}
.demo-drawer :deep(.q-item) {
  border-radius: 4px;
  margin: 2px 8px;
  color: var(--demo-text);
}
.demo-nav-title {
  padding: 12px 16px 4px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--demo-text);
}
.demo-drawer :deep(.demo-nav-active) {
  background: rgba(98, 112, 120, 0.16);
  color: var(--demo-text-strong);
  font-weight: 500;
}
</style>
