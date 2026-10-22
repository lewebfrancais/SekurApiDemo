<script setup>
import { computed, ref, watch } from 'vue'
import CatalogResource from '../components/CatalogResource.vue'
import { LEVELS, RESOURCES, resourcesOf } from '../api/catalog.js'
import { lookups, writesEnabled } from '../composables/useDemo.js'

const level = ref('agency')
const resourceKey = ref(resourcesOf('agency')[0].key)
const parentId = ref(null)

const levelDef = computed(() => LEVELS.find((l) => l.key === level.value))
const resources = computed(() => resourcesOf(level.value))
const resource = computed(() => RESOURCES.find((r) => r.key === resourceKey.value))
const parentOptions = computed(() =>
  levelDef.value.parent
    ? lookups.value[levelDef.value.parent].map((item) => ({
        label: `${item.name} (#${item.id})`,
        value: item.id,
      }))
    : [],
)

watch(level, () => {
  resourceKey.value = resources.value[0].key
  parentId.value = null
})
</script>

<template>
  <div class="q-gutter-y-md">
    <div class="text-body1">
      Gérez le catalogue à trois niveaux : l'agence, un client ou un site. Chaque action est un
      appel réel sur votre agence, visible dans le panneau requête/réponse. Les créations sont
      préfixées « Démo - ».
    </div>

    <q-banner v-if="!writesEnabled" class="demo-note" rounded dense>
      <template #avatar><q-icon name="lock" /></template>
      Lecture seule : vous pouvez parcourir le catalogue. Pour créer, modifier ou supprimer, ajoutez
      <code>DEMO_ALLOW_WRITES=true</code> dans <code>.env.local</code> puis redémarrez
      <code>npm run dev</code>.
    </q-banner>

    <q-tabs v-model="level" align="left" dense active-color="primary" indicator-color="primary">
      <q-tab v-for="item in LEVELS" :key="item.key" :name="item.key" :label="item.label" />
    </q-tabs>

    <q-select
      v-if="levelDef.parent"
      v-model="parentId"
      :options="parentOptions"
      :label="level === 'customer' ? 'Client' : 'Site'"
      dense
      outlined
      emit-value
      map-options
      style="max-width: 420px"
    />

    <q-tabs
      v-model="resourceKey"
      align="left"
      dense
      active-color="primary"
      indicator-color="primary"
    >
      <q-tab v-for="item in resources" :key="item.key" :name="item.key" :label="item.label" />
    </q-tabs>
    <q-separator />

    <CatalogResource
      :key="`${resource.key}-${parentId}`"
      :resource="resource"
      :parent-id="parentId"
    />
  </div>
</template>
