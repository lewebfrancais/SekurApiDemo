export function formatError(response) {
  const body = response?.body && typeof response.body === 'object' ? response.body : {}
  return {
    status: response?.status ?? null,
    code: body.code ?? response?.status ?? null,
    message: body.message ?? null,
    reason: body.reason ?? null,
    violations: Array.isArray(body.violations) ? body.violations : [],
    warnings: Array.isArray(body.warnings) ? body.warnings : [],
    retryAfter: retryAfterSeconds(response?.headers),
  }
}

export function retryAfterSeconds(headers = {}) {
  const raw = headers['retry-after']
  const seconds = Number.parseInt(raw, 10)
  return Number.isFinite(seconds) ? seconds : null
}

const REASONS_422 = {
  validation_failed:
    'Le corps est invalide : champ inconnu, obligatoire absent ou mal formé. Les champs en cause sont listés dans `violations`.',
  reference_not_found:
    "Un identifiant référencé (site, collaborateur, spécialité) est introuvable dans l'agence, ou le planning ne le propose pas.",
  business_rule:
    "Une règle métier est violée (dates, durée, spécialité, client archivé...). Rien n'a été écrit.",
  period_closed: 'Le mois de la vacation est clôturé : aucune clé API ne contourne cette règle.',
  planning_conflict:
    "Le réglage de l'agence interdit ce conflit de planning (par exemple deux vacations qui se chevauchent). Il ne s'acquitte pas.",
  confirmation_required:
    "Le planning signale des avertissements à confirmer. Recopiez leurs codes dans `acknowledgedWarnings` pour forcer l'écriture.",
  unsupported_service_type:
    'Ce type de service ne passe pas par cette route (tournée, archivée...).',
  idempotency_key_reused: "Cette Idempotency-Key a déjà servi pour un autre corps d'écriture.",
}

// Trois plafonds par agence et toutes clés confondues ; le message du 429 dit lequel est atteint.
function rateLimitCause(message) {
  if (/quota de lecture/i.test(message ?? '')) {
    return "Le quota de lecture de l'agence est atteint (120 lectures GET par minute). Les écritures restent possibles."
  }
  if (/quota d.écriture/i.test(message ?? '')) {
    return "Le quota d'écriture de l'agence est atteint (30 écritures POST, PATCH ou DELETE par minute, y compris celles refusées en 403 ou 422). Les lectures restent possibles."
  }
  if (/simultan/i.test(message ?? '')) {
    return "Le plafond de 4 requêtes simultanées de l'agence est atteint, lectures et écritures confondues."
  }
  return "Un plafond de l'agence est atteint : quota de lecture (120 GET par minute), quota d'écriture (30 POST, PATCH ou DELETE par minute) ou 4 requêtes simultanées."
}

/**
 * @returns {{ title: string, text: string } | null} null pour une réponse réussie.
 */
export function explainError(response) {
  if (!response || response.status < 400) return null
  const { status, reason, retryAfter, message } = formatError(response)
  switch (status) {
    case 401:
      return {
        title: '401 - Clé absente ou invalide',
        text: "L'API n'a pas reconnu la clé : absente, inconnue, révoquée, ou accès API désactivé pour l'agence. Le message reste identique quelle que soit la cause, pour ne rien révéler.",
      }
    case 403:
      if (reason === 'demo_writes_disabled') {
        return {
          title: '403 - Écritures désactivées par la démo',
          text: "Refus local du proxy de dev, l'API n'a pas été appelée : la démo est en lecture seule tant que DEMO_ALLOW_WRITES=true n'est pas dans .env.local (puis redémarrez npm run dev).",
        }
      }
      return {
        title: '403 - Niveau de clé insuffisant',
        text: "La clé est valide mais son niveau ne permet pas l'opération (ici une écriture avec une clé lecture). Le refus intervient avant toute lecture du corps : rien n'est écrit. Le corps indique `accessLevel` (niveau de la clé) et `requiredAccessLevel` (niveau exigé).",
      }
    case 404:
      return {
        title: '404 - Élément introuvable',
        text: "Inexistant ou appartenant à une autre agence : l'API ne distingue pas les deux cas, pour ne pas révéler l'existence de données d'autres agences.",
      }
    case 413:
      return {
        title: '413 - Corps trop volumineux',
        text: "Une écriture ne dépasse pas 4 Mio (4 194 304 octets). Le refus intervient avant la lecture du JSON : rien n'a été écrit. Le corps ajoute `reason: payload_too_large`.",
      }
    case 422:
      return {
        title: `422 - Écriture refusée${reason ? ` (${reason})` : ''}`,
        text: `${REASONS_422[reason] ?? 'Une règle de validation ou une règle métier a refusé le corps.'} Rien n'a été écrit.`,
      }
    case 429:
      return {
        title: '429 - Limite de débit atteinte',
        text: `${rateLimitCause(message)} ${
          retryAfter != null
            ? `Réessayez après ${retryAfter} s, délai donné par l'en-tête Retry-After.`
            : "Réessayez après le délai de l'en-tête Retry-After."
        } Les en-têtes X-RateLimit-* font foi.`,
      }
    case 400:
      return {
        title: '400 - Requête invalide',
        text: "Paramètre inconnu, pagination ou plage de dates invalide, ou JSON illisible. L'API refuse un paramètre non documenté au lieu de l'ignorer.",
      }
    case 405:
      return {
        title: '405 - Méthode non autorisée',
        text: "Cette route n'accepte pas ce verbe HTTP : l'en-tête Allow liste ceux acceptés.",
      }
    case 415:
      return {
        title: '415 - Type de contenu non pris en charge',
        text: "Une écriture envoie un objet JSON avec l'en-tête Content-Type: application/json.",
      }
    case 503:
      return {
        title: '503 - Plateforme saturée ou en maintenance',
        text: "Réessayez après le délai de l'en-tête Retry-After.",
      }
    default:
      return {
        title: `${status} - Erreur`,
        text: "L'API a renvoyé une erreur : voir le corps de la réponse ci-dessous.",
      }
  }
}
