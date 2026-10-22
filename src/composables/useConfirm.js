// Dialogue de confirmation Quasar promisifié, partagé par les écrans d'écriture.

export const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

/**
 * Chaque ligne est échappée puis séparée des autres par un saut : le navigateur n'interprète jamais
 * en HTML les données de l'API (noms, intitulés). Avec `extra.options`, résout `{ value }`.
 */
export function askConfirm($q, title, lines, extra = {}) {
  return new Promise((resolve) =>
    $q
      .dialog({
        title,
        message: lines.map(escapeHtml).join('<br><br>'),
        html: true,
        cancel: true,
        persistent: true,
        ...extra,
      })
      .onOk((value) => resolve(extra.options ? { value } : true))
      .onCancel(() => resolve(false))
      .onDismiss(() => resolve(false)),
  )
}
