const routes = [
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        component: () => import('@/pages/AccueilPage.vue'),
        meta: {
          title: 'Accueil',
          subtitle: 'Agence, niveau de la clé et premier appel : GET /me.',
        },
      },
      {
        path: 'lecture',
        component: () => import('@/pages/LecturePage.vue'),
        meta: {
          title: 'Lecture',
          subtitle: 'Clients, sites, collaborateurs et planning, avec pagination et filtres.',
        },
      },
      {
        path: 'ecriture',
        component: () => import('@/pages/EcriturePage.vue'),
        meta: {
          title: 'Écriture',
          subtitle: 'Créer et modifier : clients, sites, vacations et planning.',
        },
      },
      {
        path: 'catalogue',
        component: () => import('@/pages/CataloguePage.vue'),
        meta: {
          title: 'Catalogue',
          subtitle: 'Articles, spécialités, remises et tarification, à trois niveaux.',
        },
      },
      {
        path: 'explorateur',
        component: () => import('@/pages/ExplorerPage.vue'),
        meta: {
          title: 'Explorateur',
          subtitle: "Toutes les opérations de l'API externe, générées depuis la spec OpenAPI.",
        },
      },
      {
        path: 'erreurs',
        component: () => import('@/pages/ErreursPage.vue'),
        meta: {
          title: 'Erreurs pédagogiques',
          subtitle: "Rejouer un refus réel de l'API et le comprendre.",
        },
      },
    ],
  },

  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/ErrorNotFound.vue'),
  },
]

export default routes
