/**
 * Ce que le relais lit d'une consigne de mission (« À vérifier : … »). Audit de la fiche relais, 08/11/2026 : une
 * consigne importée disait « Entretien ENT-004 du 20/10, enquêtrice hors application » à un relais. Une référence interne
 * (entretien, établissement, personne, problème : ENT-, ETB-, PER-, PRB-) est écrite pour l'administration ; une phrase
 * qui en contient une **n'est jamais montrée au relais**, le reste de la consigne l'est.
 *
 * Pur : ni base, ni écran.
 */

/** Un identifiant interne : `ENT-004`, `ETB-0012`… */
const REFERENCE_INTERNE = /\b(?:ENT|ETB|PER|PRB)-\d+\b/i;

/** La consigne, sans les phrases qui citent une référence interne ; `null` quand il n'en reste rien. */
export function texteDestineAuRelais(note: string | null | undefined): string | null {
  if (!note) return null;
  const phrases = note
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((phrase) => !REFERENCE_INTERNE.test(phrase));
  const texte = phrases.join(' ').trim();
  return texte === '' ? null : texte;
}
