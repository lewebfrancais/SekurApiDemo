<script setup>
import CustomerSiteForm from '../components/CustomerSiteForm.vue'
import ServiceForm from '../components/ServiceForm.vue'
import ShiftServiceForm from '../components/ShiftServiceForm.vue'
import PlanningManager from '../components/PlanningManager.vue'
import { ref } from 'vue'
import { keyLevel, writesEnabled } from '../composables/useDemo.js'

const tab = ref('creation')
</script>

<template>
  <div class="q-gutter-y-md">
    <q-banner v-if="!writesEnabled" class="demo-note" rounded>
      <template #avatar><q-icon name="lock" /></template>
      Écritures désactivées : ajoutez <code>DEMO_ALLOW_WRITES=true</code> dans
      <code>.env.local</code> puis redémarrez <code>npm run dev</code>. Cet écran modifie les
      données réelles de votre agence.
    </q-banner>
    <q-banner v-else-if="keyLevel === 'read'" class="demo-warn" rounded>
      La clé lecture est sélectionnée : l'API refusera les écritures (403), ce qui montre le refus.
      Pour écrire, passez à la clé écriture.
      <template #action>
        <q-btn flat color="positive" label="Passer à la clé écriture" @click="keyLevel = 'write'"
          ><q-tooltip>Utiliser la clé écriture pour les appels suivants.</q-tooltip></q-btn
        >
      </template>
    </q-banner>
    <div :class="{ 'demo-disabled': !writesEnabled }" :inert="!writesEnabled">
      <q-tabs v-model="tab" align="left" dense active-color="primary" indicator-color="primary">
        <q-tab name="creation" label="Création" />
        <q-tab name="planning" label="Planning" />
      </q-tabs>
      <q-tab-panels v-model="tab" animated keep-alive>
        <q-tab-panel name="creation" class="q-gutter-y-md">
          <CustomerSiteForm />
          <ServiceForm />
          <ShiftServiceForm />
        </q-tab-panel>
        <q-tab-panel name="planning">
          <PlanningManager />
        </q-tab-panel>
      </q-tab-panels>
    </div>
  </div>
</template>
