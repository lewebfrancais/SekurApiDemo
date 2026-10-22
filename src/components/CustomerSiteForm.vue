<script setup>
// Crée un client puis son site : deux écritures chaînées, chacune avec sa propre Idempotency-Key.
import { reactive, ref } from 'vue'
import { useQuasar } from 'quasar'
import ExchangePanel from './ExchangePanel.vue'
import { api, loadLookups } from '../composables/useDemo.js'

const $q = useQuasar()
const stamp = new Date().toTimeString().slice(0, 5).replace(':', 'h')

// Données fictives.
const form = reactive({
  customerName: `Démo - Client ${stamp}`,
  type: 'company',
  email: 'contact@demo-entrepots.example',
  street: '12 rue de la Démo',
  zipcode: '59000',
  city: 'Lille',
  country: 'France',
  siteName: 'Démo - Site',
  latitude: 50.6292,
  longitude: 3.0573,
})

const types = ['company', 'individual', 'association', 'public']
const loading = ref(false)
const customerExchange = ref(null)
const siteExchange = ref(null)

async function submit() {
  loading.value = true
  siteExchange.value = null
  const address = {
    street: form.street,
    zipcode: form.zipcode,
    city: form.city,
    country: form.country,
  }
  customerExchange.value = await api.post('/customers', {
    name: form.customerName,
    type: form.type,
    email: form.email,
    address,
  })
  const created = customerExchange.value.response
  if (created?.status === 201) {
    siteExchange.value = await api.post('/sites', {
      name: form.siteName,
      customerId: created.body.id,
      address,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
    })
    if (siteExchange.value.response?.status === 201) {
      $q.notify({ type: 'positive', message: 'Client et site créés.' })
      loadLookups()
    }
  }
  loading.value = false
}
</script>

<template>
  <q-card flat bordered>
    <q-card-section>
      <div class="text-h6">Créer un client et son site</div>
      <div class="text-caption">
        Deux appels : <code>POST /customers</code> puis <code>POST /sites</code>. Un site exige une
        adresse complète et sa position (latitude, longitude) : l'API ne géocode pas.
      </div>
    </q-card-section>
    <q-card-section class="row q-col-gutter-md">
      <q-input
        v-model="form.customerName"
        label="Nom du client"
        dense
        outlined
        class="col-12 col-md-6"
      />
      <q-select
        v-model="form.type"
        :options="types"
        label="Type"
        dense
        outlined
        class="col-12 col-md-3"
      />
      <q-input v-model="form.email" label="E-mail" dense outlined class="col-12 col-md-3" />
      <q-input v-model="form.street" label="Rue" dense outlined class="col-12 col-md-6" />
      <q-input v-model="form.zipcode" label="Code postal" dense outlined class="col-6 col-md-2" />
      <q-input v-model="form.city" label="Ville" dense outlined class="col-6 col-md-2" />
      <q-input v-model="form.country" label="Pays" dense outlined class="col-12 col-md-2" />
      <q-input v-model="form.siteName" label="Nom du site" dense outlined class="col-12 col-md-6" />
      <q-input
        v-model="form.latitude"
        label="Latitude"
        type="number"
        step="any"
        dense
        outlined
        class="col-6 col-md-3"
      />
      <q-input
        v-model="form.longitude"
        label="Longitude"
        type="number"
        step="any"
        dense
        outlined
        class="col-6 col-md-3"
      />
    </q-card-section>
    <q-card-actions>
      <q-btn color="positive" label="Créer le client et son site" :loading="loading" @click="submit"
        ><q-tooltip>Deux appels enchaînés : POST /customers puis POST /sites.</q-tooltip></q-btn
      >
    </q-card-actions>
    <q-card-section v-if="customerExchange" class="q-gutter-y-md">
      <ExchangePanel :exchange="customerExchange" />
      <ExchangePanel :exchange="siteExchange" />
    </q-card-section>
  </q-card>
</template>
