import { defineConfig } from '#q-app'
import { loadEnv } from 'vite'
import { createProxyConfig } from './src-proxy/sekur-proxy.js'
import { demoConfigPlugin } from './src-proxy/demo-config-plugin.js'

// Sans préfixe VITE_, ces variables restent côté serveur : rien n'entre dans le bundle.
const env = loadEnv('development', process.cwd(), '')

export default defineConfig((ctx) => ({
  boot: [],
  css: ['app.css'],
  extras: ['roboto-font', 'material-icons'],

  build: {
    vueRouterMode: 'hash',
    vitePlugins: [
      [
        'vite-plugin-checker',
        {
          eslint: {
            lintCommand: 'eslint -c ./eslint.config.js "./src*/**/*.{js,mjs,cjs,vue}"',
            useFlatConfig: true,
          },
        },
        { server: false },
      ],
      // Proxy et /demo/* n'existent qu'en dev : `quasar prepare` et `quasar build` ne lisent pas .env.local.
      ...(ctx.dev ? [demoConfigPlugin(env)] : []),
    ],
  },

  devServer: {
    // Quasar écoute sur 0.0.0.0 par défaut : tout le réseau local pourrait alors utiliser la clé.
    host: 'localhost',
    open: false,
    // Le front n'appelle que /external/... en relatif : le proxy ajoute la clé et règle le CORS.
    ...(ctx.dev ? { proxy: createProxyConfig(env) } : {}),
  },

  framework: {
    config: {
      // Couleurs de Sekur ; le violet d'accent n'est pas une couleur de marque.
      brand: {
        primary: '#627078',
        secondary: '#bbbbbb',
        accent: '#627078',
        dark: '#1d1d1d',
        positive: '#21ba45',
        negative: '#c10015',
        info: '#31ccec',
        warning: '#f2c037',
      },
    },
    lang: 'fr',
    plugins: ['Notify', 'Dialog'],
  },

  animations: [],
}))
