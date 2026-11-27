/** Le texte posé dans du HTML écrit à la main (cartes d'écoles, rond d'une école) : toujours échappé. Pur. */
const ECHAPPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export const echapper = (texte: string): string => texte.replace(/[&<>"']/g, (c) => ECHAPPES[c]!);
