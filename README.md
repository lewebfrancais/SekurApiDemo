<p align="center">
  <img src="assets/lwf-logo.png" alt="Logo LWF" width="96">
</p>

# Démo de l'API externe Sekur

Interface locale pour découvrir l'API externe de Sekur : consulter les données de son agence, les modifier et comprendre les refus de l'API, sans jamais exposer sa clé dans le navigateur.

Documentation de l'API : <https://api.sekur.fr/doc/external> (spécification OpenAPI : <https://api.sekur.fr/doc/external.json>).

## Prérequis

- Node.js 22.12 ou plus (24 recommandé).
- Une agence Sekur dont l'accès à l'API est activé, et au moins une clé API.

## Installation

```bash
cp .env.example .env.local
npm install
```

## Configuration

Les clés se génèrent dans **Réglages agence > API**. Commencez par une clé de niveau **lecture** : elle suffit pour découvrir la démo sans rien modifier.

Renseignez `.env.local` (ignoré par git) :

| Variable               | Rôle                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `SEKUR_API_URL`        | URL de l'API, obligatoire (`https://api.sekur.fr`).                                                                        |
| `SEKUR_API_KEY_READ`   | Clé de niveau lecture, recommandée. Le proxy vérifie son niveau (`GET /me`) avant de relayer une écriture faite avec elle. |
| `SEKUR_API_KEY_WRITE`  | Clé de niveau lecture + écriture, pour les écritures.                                                                      |
| `SEKUR_API_KEY_DELETE` | Clé de niveau lecture + écriture + suppression, pour les `DELETE`.                                                         |
| `SEKUR_APP_URL`        | Application Sekur, pour le lien vers l'Historique (`https://platform.sekur.fr`).                                           |
| `DEMO_ALLOW_WRITES`    | `true` pour autoriser les écritures. Désactivé par défaut.                                                                 |
| `DEMO_ALLOW_STRESS`    | `true` pour autoriser les scénarios de rafale (429) et de corps trop gros (413).                                           |

L'URL de l'API doit être en `https` (`http` n'est accepté que pour `localhost` et `127.0.0.1`). Chaque clé est facultative : sans clé pour un niveau, ce niveau est indisponible.

## Lancer la démo

```bash
npm run dev
```

Ouvrez <http://localhost:9000>. Redémarrez la commande après chaque modification de `.env.local`.

## Sécurité

- **La clé n'atteint jamais le navigateur.** Le serveur de dev Vite fait proxy de `/external` vers l'API, ajoute l'en-tête `X-API-Key` lu dans `.env.local` et règle le CORS. Le front indique seulement un niveau de clé (lecture, écriture, suppression), que le proxy retire avant d'appeler l'API.
- **Aucune trace de la clé.** Le proxy ne journalise aucun en-tête et retire des réponses tout en-tête qui pourrait la porter.
- **Lecture seule par défaut.** Sans `DEMO_ALLOW_WRITES=true`, le proxy refuse (403) toute écriture faite avec une clé écriture ou suppression, même si l'interface est contournée. Une écriture faite avec la clé lecture est transmise pour montrer le 403 de l'API, après vérification (`GET /me`) que `SEKUR_API_KEY_READ` est bien une clé de niveau lecture. Les écrans d'écriture restent visibles, grisés, avec l'explication.
- **Scénarios de charge désactivés par défaut.** Le quota de requêtes est partagé par toute l'agence : une rafale (429) bloque aussi vos intégrations réelles (ERP, synchronisations) pendant la durée indiquée par `Retry-After`. Ce verrou est celui de l'interface : le proxy ne limite pas lui-même le débit des lectures.
- **Application locale.** Le serveur de dev n'écoute que sur `localhost` ; le proxy n'existe qu'avec `npm run dev` et n'est pas authentifié. Ne changez pas l'hôte (`--hostname`) : la clé serait utilisable par tout le réseau.

## Avant d'activer les écritures

Les écritures portent sur les **données réelles de votre agence**. Utilisez de préférence une agence ou des éléments de test.

- Tout ce que la démo crée est préfixé « Démo - » : supprimez-le ensuite depuis Sekur, ou depuis la démo avec une clé de niveau suppression.
- Avant une écriture ou une suppression, la démo avertit quand l'élément visé ne commence pas par « Démo » (élément réel de l'agence).
- Un lot de vacations crée 10 vacations par défaut, 800 au plus : une seconde confirmation est demandée au-delà de 50.
- La démo n'acquitte aucun avertissement de l'API (`acknowledgedWarnings`) à votre place : vous les cochez vous-même.

## Scénario de démo (5 minutes)

Le scénario fonctionne en lecture seule. Les étapes d'écriture sont optionnelles.

1. **Accueil (30 s).** `GET /me` : l'agence et le niveau de la clé. Le sélecteur de clé, en haut à droite, reste accessible partout.
2. **Lecture (1 min 30).** Clients, sites, collaborateurs, puis le planning : période (31 jours au plus), filtres et pagination. Dépliez « Voir la requête et la réponse brute » pour montrer l'appel réel, sans clé.
3. **Erreurs (1 min 30).** Jouez 401 (sans clé), 403 (écriture avec la clé lecture) et 404 (élément inexistant ou d'une autre agence). Chaque refus s'affiche avec la requête, la réponse brute et une explication.
4. **Explorateur (1 min).** Parcourez toutes les opérations de l'API, générées depuis la spécification : c'est « tout le reste de l'API ». Lancez une lecture sans écran dédié.
5. **Historique (30 s).** Le lien de l'écran Erreurs ouvre l'Historique des actions de Sekur, où les actions faites par l'API portent l'origine « API ».

Étapes optionnelles, avec `DEMO_ALLOW_WRITES=true` :

- **Écriture** : créer un client et son site, créer une vacation, la décaler, puis gérer le planning.
- **Catalogue** : créer, modifier et supprimer articles, spécialités, remises et réglages de tarification, à trois niveaux (agence, client, site).
- **Erreurs** : 422 (règle métier, chevauchement) et acquittement d'un avertissement.
- **Avec `DEMO_ALLOW_STRESS=true`** : 429 (rafale) et 413 (corps de plus de 4 Mio).

## Écrans

| Écran                | Contenu                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Accueil              | Agence, niveau de la clé, `GET /me`.                                                          |
| Lecture              | Clients, sites, collaborateurs et planning, avec filtres et pagination.                       |
| Écriture             | Création de client, site et vacation, décalage, gestion du planning.                          |
| Catalogue            | CRUD du catalogue aux niveaux agence, client et site.                                         |
| Erreurs pédagogiques | Rejouer 401, 403, 404, 422, 429 et 413, avec la requête, la réponse brute et une explication. |
| Explorateur          | Toutes les opérations de l'API, générées depuis la spécification OpenAPI.                     |

Les verbes HTTP suivent le même code couleur partout : vert pour `POST`, ardoise pour `PATCH` et `PUT`, rouge pour `DELETE`, gris pour `GET`.

## Particularités de l'API

- **Planning** : `GET /services` ne renvoie que les vacations publiées aux collaborateurs. Une vacation non publiée n'est lisible que par son identifiant, ou avec `updatedSince`, réduite à son identifiant. Le statut `unpublished` est un signal de retrait pour la synchronisation, pas un filtre.
- **Réglages de tarification** : la lecture renvoie `overrunSpecialty` (`{id, name}`), l'écriture attend `overrunSpecialtyId`. La démo fait la conversion.
- **Quota partagé** : les 120 requêtes par minute valent pour toutes les clés de l'agence.
- **404** : un identifiant inexistant et celui d'une autre agence répondent de la même façon.
- **Spécialités** : pas de `DELETE` (405) ; on les désactive par `PATCH` avec une clé de niveau suppression.
- **Retrait d'étapes d'une tournée** : il déprogramme des vacations et exige une clé de niveau suppression.

## Développement

```bash
npm test             # tests Vitest
npm run lint:check   # Prettier et ESLint, sans modifier les fichiers
npm run lint         # corrige le format
npm run build        # vérifie que tout compile ; la démo ne fonctionne qu'avec `npm run dev`
```

Organisation :

- `src-proxy/` : proxy de dev (choix de la clé, lecture seule) et endpoints locaux `/demo/config` et `/demo/spec`.
- `src/api/` : client HTTP, erreurs, scénarios, dates, catalogue, planning, spécification OpenAPI.
- `src/composables/useDemo.js` : état partagé (clé choisie, agence, historique des échanges).
- `src/pages/` et `src/components/` : les écrans et le panneau requête/réponse.

## Licence

[BSD Zero Clause (0BSD)](LICENSE) : usage, copie, modification et redistribution libres, sans obligation de mention.
