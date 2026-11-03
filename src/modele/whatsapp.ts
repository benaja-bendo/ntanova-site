/**
 * Construit le lien qui ouvre une conversation WhatsApp avec NTanova.
 * Le numéro vient de la configuration (PUBLIC_WHATSAPP), jamais du code.
 * Renvoie null si le numéro est absent ou mal formé : la page n'affiche
 * alors pas de bouton, plutôt qu'un lien qui mène nulle part.
 */
export function lienWhatsApp(numero: string | undefined, message?: string): string | null {
  if (!numero) return null;
  const chiffres = numero.replace(/[\s.+()-]/g, '');
  // Format international sans « + » ni zéro d'accès : 8 à 15 chiffres (norme E.164).
  if (!/^[1-9]\d{7,14}$/.test(chiffres)) return null;
  const lien = `https://wa.me/${chiffres}`;
  return message ? `${lien}?text=${encodeURIComponent(message)}` : lien;
}

/**
 * Le même lien avec un autre message prérempli : le numéro reste celui de la configuration. Rien si ce n'est pas un
 * lien `wa.me` (jamais un lien fabriqué à partir de rien).
 */
export function avecMessage(lien: string | null, message: string): string | null {
  const nu = lien ? /^(https:\/\/wa\.me\/\d{8,15})(?:\?.*)?$/.exec(lien) : null;
  return nu ? `${nu[1]}?text=${encodeURIComponent(message)}` : null;
}
