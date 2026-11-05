/**
 * La fiche d'aperçu d'une école, partagée par le tiroir de /carte/ et la bulle de l'accueil. Les données sont toujours du
 * texte, jamais du HTML (`textContent`) ; les icônes sont des tracés écrits ici, sans fichier ni service.
 *
 * Elle dit la même chose que l'épingle : le disque porte la lettre et la couleur du cycle ; les deux preuves (vue sur place,
 * confirmée par la direction) restent deux blocs, jamais fusionnés.
 */
import type { FeatureEcole } from '../../modele/carte/donnees';
import { adresseVue } from '../../modele/carte/navigation';
import { zoomMaxEn } from '../../modele/carte/fond';
import { ICONES, type NomIcone } from '../../modele/carte/icones';
import { estUneLettreDeCycle } from '../../modele/carte/marqueurs';

export const dateCarte = (s: string) =>
  new Intl.DateTimeFormat('fr', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Brazzaville',
  }).format(new Date(s));

const SVG = 'http://www.w3.org/2000/svg';
export function icone(nom: NomIcone, petite = true): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', petite ? 'ico ico-s' : 'ico');
  for (const d of ICONES[nom]) {
    const trace = document.createElementNS(SVG, 'path');
    trace.setAttribute('d', d);
    svg.append(trace);
  }
  return svg;
}

export function element<K extends keyof HTMLElementTagNameMap>(
  balise: K,
  classe?: string,
  texte?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

/** Le disque d'un cycle : sa lettre et sa couleur ; gris et sans lettre quand le niveau n'est pas noté. */
export function disque(lettre: string | null | undefined, taille = ''): HTMLElement {
  const classes = ['disque'];
  if (taille) classes.push(taille);
  if (estUneLettreDeCycle(lettre)) classes.push(`c-${lettre}`);
  const d = element('span', classes.join(' '));
  d.setAttribute('aria-hidden', 'true');
  if (estUneLettreDeCycle(lettre)) d.textContent = lettre;
  return d;
}

/** Un bloc de preuve : un titre en gras avec sa date, et ce que cette preuve veut dire. */
function preuve(classe: string, icon: NomIcone, titre: string, suite?: string) {
  const bloc = element('div', `preuve ${classe}`.trim());
  const texte = element('div');
  texte.append(element('strong', undefined, titre));
  if (suite) texte.append(suite);
  bloc.append(icone(icon, false), texte);
  return bloc;
}

export function creerApercu(
  f: FeatureEcole['properties'],
  coordonnees: [number, number],
  fermer?: () => void,
): HTMLElement {
  const bloc = element('div', 'carte-apercu');
  bloc.tabIndex = -1;

  if (fermer) {
    const retour = element('button', 'apercu-retour');
    retour.type = 'button';
    retour.append(icone('retour', false), 'Retour à la liste');
    retour.onclick = fermer;
    bloc.append(retour);
  }

  const tete = element('header', 'apercu-tete');
  tete.append(disque(f.lettre, 'disque-xl'));
  const titres = element('div', 'apercu-titres');
  titres.append(element('h2', 'carte-apercu-nom', f.nom));
  if (f.lieu) {
    const lieu = element('p', 'apercu-lieu');
    lieu.append(icone('lieu'), f.lieu);
    titres.append(lieu);
  }
  tete.append(titres);
  if (fermer) {
    const croix = element('button', 'maplibregl-popup-close-button apercu-fermer');
    croix.type = 'button';
    croix.setAttribute('aria-label', 'Fermer l’aperçu');
    croix.append(icone('croix', false));
    croix.onclick = fermer;
    tete.append(croix);
  }
  bloc.append(tete);

  const meta = element('div', 'apercu-meta');
  f.niveaux.forEach((niveau, i) => {
    const puce = element('span', 'etiquette-niveau');
    puce.append(disque(f.niveauxLettres?.[i]), niveau);
    meta.append(puce);
  });
  if (f.type) meta.append(element('span', 'etiquette-type', f.type));
  if (meta.childNodes.length) bloc.append(meta);

  if (f.repere) {
    const repere = element('p', 'apercu-repere');
    repere.append(icone('repere', false), element('span', undefined, f.repere));
    bloc.append(repere);
  }

  if (f.passage)
    bloc.append(
      preuve(
        '',
        'oeil',
        `Vue sur place le ${dateCarte(f.passage)}`,
        'Par un jeune du quartier : seulement ce qui se voit de la rue.',
      ),
    );
  if (f.confirmation)
    bloc.append(
      preuve(
        'preuve-direction',
        'bouclier',
        `Confirmée par la direction le ${dateCarte(f.confirmation)}`,
      ),
    );
  if (!f.passage && !f.confirmation) bloc.append(preuve('preuve-vide', 'oeil', f.preuveTexte));

  const actions = element('div', 'apercu-actions');
  const lien = (
    classe: string,
    url: string,
    texte: string,
    icon: NomIcone,
    avant: boolean,
    libelle?: string,
  ) => {
    const a = element('a', `bouton ${classe}`);
    a.href = url;
    if (libelle) a.setAttribute('aria-label', libelle);
    if (avant) a.append(icone(icon), texte);
    else a.append(texte, icone(icon));
    actions.append(a);
  };
  lien('bouton-large', f.lien, 'Voir la fiche', 'fleche', false);
  const [x, y] = coordonnees;
  lien(
    'bouton-secondaire',
    `https://www.google.com/maps/dir/?api=1&destination=${y},${x}`,
    'Y aller',
    'aller',
    true,
  );
  const partage = new URL('/carte/', location.origin);
  partage.searchParams.set('ecole', f.lien);
  partage.hash = adresseVue({ zoom: Math.min(15, zoomMaxEn(x, y)), latitude: y, longitude: x });
  lien(
    'bouton-secondaire',
    `https://wa.me/?text=${encodeURIComponent(f.nom + ' · ' + partage.href)}`,
    'Partager',
    'partage',
    true,
    'Partager sur WhatsApp',
  );
  bloc.append(actions);
  return bloc;
}
