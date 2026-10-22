// Avertissements affichés avant une écriture ou une suppression dans l'Explorateur.
import { tomorrowWindow } from './dates.js'

export const BATCH_PATH = '/external/v1/services/batch'
export const BATCH_DEFAULT = 10
export const BATCH_CONFIRM_ABOVE = 50
export const BATCH_MAX = 800

// Les éléments créés par la démo commencent par « Démo ».
const DEMO_NAME = /^Démo\b/
export const isDemoName = (name) => DEMO_NAME.test(String(name ?? '').trim())

export const stripHtml = (html) =>
  String(html ?? '')
    .replace(/<[^>]*>/g, '')
    .trim()

export function targetOf(operation) {
  const match = operation.path.replace('/external/v1', '').match(/^\/([a-z-]+)\/\{(\w+)\}/)
  return match ? { segment: match[1], param: match[2] } : null
}

export function entityLabel(body) {
  if (!body || typeof body !== 'object') return ''
  const person = [body.firstName, body.lastName].filter(Boolean).join(' ')
  return stripHtml(body.name ?? body.title ?? body.designation ?? person)
}

/** Avertissement avant d'écrire sur un élément qui n'est pas « Démo - » ; null si c'en est un. */
export function realItemWarning(label, noun = 'un élément', empty = 'sans nom') {
  return isDemoName(label ?? '')
    ? null
    : `Élément réel de l’agence : « ${label || empty} » n’est pas ${noun} « Démo - ».`
}

export function buildBatchBody(count, siteId, now = new Date()) {
  const { startAt, endAt } = tomorrowWindow(now)
  const wanted = count === '' || count == null ? BATCH_DEFAULT : Number(count)
  const n = Math.max(1, Math.min(BATCH_MAX, Number.isFinite(wanted) ? wanted : BATCH_DEFAULT))
  return {
    services: Array.from({ length: n }, (_, i) => ({
      siteId,
      activityType: 'intervention',
      title: `Démo - lot ${i + 1}/${n}`,
      startAt,
      endAt,
      published: false,
    })),
  }
}

export function batchCount(bodyText) {
  try {
    const services = JSON.parse(bodyText)?.services
    return Array.isArray(services) ? services.length : 0
  } catch {
    return 0
  }
}

export function removedStepIds(currentSteps, bodyText) {
  let steps
  try {
    steps = JSON.parse(bodyText)?.steps
  } catch {
    return []
  }
  if (!Array.isArray(steps)) return []
  const kept = new Set(steps.map((step) => step?.id).filter((id) => id != null))
  return (currentSteps ?? []).map((step) => step.id).filter((id) => !kept.has(id))
}

export const PRICING_WARNING =
  'Cette action modifie la tarification par défaut de tous les sites sans réglages propres de l’agence. À n’utiliser que sur l’agence de démo.'

/**
 * @param {{operation: object, bodyText: string, values: object, targetLabel?: string|null, removedSteps?: number}} input
 */
export function buildWarnings({
  operation,
  bodyText,
  values,
  targetLabel = null,
  removedSteps = 0,
}) {
  const warnings = []
  if (operation.method === 'GET') return warnings
  const { id } = operation
  if (id === `POST ${BATCH_PATH}`) {
    warnings.push(`Cette requête crée ${batchCount(bodyText)} vacations dans votre agence.`)
  }
  if (
    id === 'DELETE /external/v1/services/{id}' &&
    values.acknowledgedWarnings === 'invoice_correction'
  ) {
    warnings.push('Cette suppression corrige une facture déjà émise.')
  }
  if (id === 'PATCH /external/v1/circuits/{id}' && removedSteps > 0) {
    warnings.push(
      `Ce PATCH retire ${removedSteps} étape(s) : cela déprogramme des vacations et exige une clé de niveau suppression.`,
    )
  }
  if (id === 'PATCH /external/v1/pricing-settings') warnings.push(PRICING_WARNING)
  if (targetLabel != null && !isDemoName(targetLabel)) {
    warnings.push(
      `Élément réel de l’agence : « ${targetLabel || 'sans nom'} » n’est pas un élément « Démo - ».`,
    )
  }
  return warnings
}
