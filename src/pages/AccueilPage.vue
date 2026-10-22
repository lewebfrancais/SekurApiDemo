<script setup>
import { computed } from 'vue'
import ExchangePanel from '../components/ExchangePanel.vue'
import { ACCESS_LEVELS, loadMe, me, meExchange } from '../composables/useDemo.js'

const accessLevel = computed(() => me.value?.apiKey?.accessLevel ?? null)
// Niveaux cumulatifs : une clé « écriture » couvre aussi la lecture.
const rank = computed(() => ACCESS_LEVELS.findIndex((level) => level.value === accessLevel.value))
</script>

<template>
  <div class="q-gutter-y-md">
    <q-card flat bordered>
      <q-card-section>
        <div class="demo-section-title">Bienvenue</div>
        <p class="q-mb-none q-mt-sm">
          Cette démo appelle l'API externe Sekur avec vos clés : consulter les données de votre
          agence, les modifier et comprendre les refus. La clé API reste côté serveur de dev, elle
          n'apparaît jamais dans le navigateur. Choisissez la clé (lecture, écriture, suppression)
          avec le sélecteur en haut à droite : il reste accessible depuis chaque écran.
        </p>
      </q-card-section>
    </q-card>

    <q-card flat bordered>
      <q-card-section>
        <div class="row items-center q-gutter-md">
          <div class="text-subtitle1">Agence et niveau de la clé</div>
          <q-btn flat dense icon="refresh" label="Relire /me" @click="loadMe"
            ><q-tooltip>Rappelle GET /me : agence et niveau de la clé.</q-tooltip></q-btn
          >
        </div>

        <div v-if="me" class="q-mt-sm">
          <div class="text-h6">{{ me.agency.name }}</div>
          <div class="text-caption">Identifiant d'agence : {{ me.agency.id }}</div>
          <div class="q-mt-md row q-gutter-sm">
            <q-chip
              v-for="(level, index) in ACCESS_LEVELS"
              :key="level.value"
              :color="index <= rank ? (index === 2 ? 'negative' : 'primary') : 'grey-3'"
              :text-color="index <= rank ? 'white' : 'grey-7'"
              :icon="index <= rank ? 'check_circle' : 'radio_button_unchecked'"
              :label="level.label"
            />
          </div>
          <div class="text-caption">
            Niveau renvoyé par l'API : <code>{{ accessLevel }}</code>
          </div>
        </div>
        <q-banner v-else class="demo-warn q-mt-sm" dense>
          Aucune agence lue : voir la requête ci-dessous.
        </q-banner>
      </q-card-section>
    </q-card>

    <div class="text-subtitle1">GET /external/v1/me</div>
    <ExchangePanel :exchange="meExchange" />
  </div>
</template>
