/** Vue DOM partagée par le tiroir et la popup : les données sont toujours du texte, jamais du HTML. */
import type { FeatureEcole } from '../../modele/carte/donnees';
import { adresseVue } from '../../modele/carte/navigation';
import { zoomMaxEn } from '../../modele/carte/fond';
export const dateCarte = (s: string) =>
  new Intl.DateTimeFormat('fr', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Brazzaville',
  }).format(new Date(s));
export function creerApercu(
  f: FeatureEcole['properties'],
  coordonnees: [number, number],
  fermer?: () => void,
): HTMLElement {
  const bloc = document.createElement('div');
  bloc.className = 'carte-apercu';
  bloc.tabIndex = -1;
  const ligne = (contenu: string, classe?: string) => {
    const p = document.createElement('p');
    p.textContent = contenu;
    if (classe) p.className = classe;
    bloc.append(p);
  };
  ligne(f.nom, 'carte-apercu-nom');
  if (f.passage) ligne(`Vue sur place le ${dateCarte(f.passage)}`);
  if (f.confirmation) ligne(`Confirmée par la direction le ${dateCarte(f.confirmation)}`);
  if (!f.passage && !f.confirmation) ligne(f.preuveTexte);
  ligne(f.niveaux.join(' · '));
  ligne([f.type, f.lieu, f.repere].filter(Boolean).join(' · '));
  const actions = document.createElement('div');
  actions.className = 'carte-apercu-actions';
  const lien = (texte: string, url: string) => {
    const a = document.createElement('a');
    a.textContent = texte;
    a.href = url;
    actions.append(a);
  };
  lien('Voir la fiche', f.lien);
  const [x, y] = coordonnees;
  lien('Y aller', `https://www.google.com/maps/dir/?api=1&destination=${y},${x}`);
  const partage = new URL('/carte/', location.origin);
  partage.searchParams.set('ecole', f.lien);
  partage.hash = adresseVue({ zoom: Math.min(15, zoomMaxEn(x, y)), latitude: y, longitude: x });
  lien(
    'Partager sur WhatsApp',
    `https://wa.me/?text=${encodeURIComponent(f.nom + ' · ' + partage.href)}`,
  );
  bloc.append(actions);
  if (fermer) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'maplibregl-popup-close-button';
    bouton.setAttribute('aria-label', 'Fermer l’aperçu');
    bouton.textContent = '×';
    bouton.onclick = fermer;
    bloc.append(bouton);
  }
  return bloc;
}
