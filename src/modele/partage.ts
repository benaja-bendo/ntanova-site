/**
 * Le partage d'une fiche (ticket 101) : l'image que WhatsApp montre sous un lien (1 200 × 630, construite avec le
 * site, jamais chargée par la page elle-même) et les données structurées de la fiche (`schema.org/School`).
 * Des fonctions pures : le rendu en PNG est dans `src/pages/partage/[...chemin].png.ts`.
 *
 * Les couleurs viennent des jetons (`src/ui/jetons.css`), lus à la construction : aucune couleur n'est écrite ici.
 * Rien de privé : ni contact de la direction, ni photo non vérifiée. L'image d'une fiche est sa couverture dessinée (ticket 148) :
 * la photo d'enseigne prise dans la rue n'est jamais une couverture.
 */
import { cycleLePlusEleve } from './carte/cycles';
import type { EcolePubliee } from './ports';
import { ligneDeLieu } from './geo-divisions';
import { libelleProvenance, provenanceDe } from './libelles';
import { dateLongue, dateCourte } from './pointe-noire';

export const LARGEUR_PARTAGE = 1200;
export const HAUTEUR_PARTAGE = 630;

/** L'image de partage d'une page qui n'est pas une fiche. */
export const IMAGE_PARTAGE_SITE = '/partage/ntanova.png';

type Fiche = Pick<
  EcolePubliee,
  | 'nom'
  | 'etiquette'
  | 'adresse'
  | 'slug'
  | 'divisionNoms'
  | 'quartier'
  | 'repere'
  | 'numeroEnseigne'
  | 'latitude'
  | 'longitude'
  | 'etat'
  | 'verifieeLe'
  | 'releveeLe'
  | 'situeeLe'
  | 'origine'
  | 'declareeLe'
>;

/** L'adresse de l'image d'une fiche : celle de la fiche, en `.png`, sous `/partage/` (`/partage/ecoles/<nom>-<id>.png`). */
export function cheminImagePartage(e: Pick<EcolePubliee, 'slug' | 'numero'>): string {
  return `/partage/ecoles/${e.slug}-${e.numero}.png`;
}

export interface PreuveDePartage {
  genre: 'direction' | 'terrain' | 'ajoutee';
  texte: string;
}

/** La preuve la plus forte, avec sa date : les mots de la fiche (ticket #99). */
export function preuveDePartage(
  e: Pick<Fiche, 'etat' | 'verifieeLe' | 'releveeLe' | 'situeeLe' | 'origine' | 'declareeLe'>,
): PreuveDePartage {
  const provenance = provenanceDe(e);
  if (provenance === 'verifiee') {
    return {
      genre: 'direction',
      texte: `${libelleProvenance.verifiee}${e.verifieeLe ? ` · ${dateCourte(e.verifieeLe)}` : ''}`,
    };
  }
  if (provenance === 'relevee' && e.releveeLe) {
    return {
      genre: 'terrain',
      texte: `${libelleProvenance.relevee} · ${dateCourte(e.releveeLe)}`,
    };
  }
  if (provenance === 'declaree')
    return {
      genre: 'ajoutee',
      texte: `${libelleProvenance.declaree}${e.declareeLe ? ` le ${dateLongue(e.declareeLe)}` : ''}`,
    };
  return { genre: 'ajoutee', texte: libelleProvenance.ajoutee };
}

export interface CouleursDePartage {
  fond: string;
  carte: string;
  texte: string;
  texteDoux: string;
  marque: string;
  preuveDirection: string;
  preuveDirectionTexte: string;
  preuveTerrain: string;
  preuveVide: string;
  preuveVideTrait: string;
  barreCreme: string;
  barreJaune: string;
  barreRouge: string;
  trait: string;
  blanc: string;
  cycleM: string;
  cycleP: string;
  cycleC: string;
  cycleL: string;
  cycleT: string;
  cycleS: string;
  cycleNeutre: string;
  /** L'opacité des rayures et de la grande lettre de la couverture, entre 0 et 1. */
  opaciteRayure: number;
  opaciteLettre: number;
}

/** Les couleurs de l'image, lues dans le texte de `jetons.css` (en suivant les `var(--…)`). */
export function couleursDePartage(css: string): CouleursDePartage {
  const jeton = (nom: string): string => {
    const trouve = new RegExp(`--${nom}:\\s*([^;]+);`).exec(css);
    if (!trouve?.[1]) throw new Error(`Jeton absent de jetons.css : --${nom}`);
    const valeur = trouve[1].trim();
    const renvoi = /^var\(--([\w-]+)\)$/.exec(valeur);
    return renvoi?.[1] ? jeton(renvoi[1]) : valeur.toLowerCase();
  };
  // Le jeton est un blanc translucide : seule son opacité sert, la couleur est le blanc des jetons.
  const opacite = (nom: string): number => {
    const trouve = /\/\s*([\d.]+)%/.exec(jeton(nom));
    if (!trouve?.[1]) throw new Error(`Opacité absente du jeton --${nom}`);
    return Number(trouve[1]) / 100;
  };
  return {
    fond: jeton('fond'),
    carte: jeton('fond-releve'),
    texte: jeton('texte'),
    texteDoux: jeton('texte-doux'),
    marque: jeton('marque'),
    preuveDirection: jeton('preuve-direction'),
    preuveDirectionTexte: jeton('preuve-direction-texte'),
    preuveTerrain: jeton('preuve-terrain'),
    preuveVide: jeton('preuve-vide'),
    preuveVideTrait: jeton('preuve-vide-trait'),
    barreCreme: jeton('creme'),
    barreJaune: jeton('jaune'),
    barreRouge: jeton('rouge'),
    trait: jeton('encre'),
    blanc: jeton('blanc'),
    cycleM: jeton('cycle-maternelle'),
    cycleP: jeton('cycle-primaire'),
    cycleC: jeton('cycle-college'),
    cycleL: jeton('cycle-lycee'),
    cycleT: jeton('cycle-technique'),
    cycleS: jeton('cycle-superieur'),
    cycleNeutre: jeton('carte-epingle-neutre'),
    opaciteRayure: opacite('couverture-rayure'),
    opaciteLettre: opacite('couverture-lettre'),
  };
}

/** Un texte coupé en lignes d'au plus `largeur` caractères ; au-delà de `maximum` lignes, des points de suspension. */
export function coupeEnLignes(texte: string, largeur: number, maximum: number): string[] {
  const lignes: string[] = [];
  let ligne = '';
  for (const mot of texte.split(/\s+/).filter(Boolean)) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (essai.length <= largeur) ligne = essai;
    else {
      if (ligne) lignes.push(ligne);
      ligne = mot.length > largeur ? `${mot.slice(0, largeur - 1)}…` : mot;
    }
  }
  if (ligne) lignes.push(ligne);
  if (lignes.length <= maximum) return lignes;
  const gardees = lignes.slice(0, maximum);
  const derniere = gardees[maximum - 1] ?? '';
  gardees[maximum - 1] = `${derniere.slice(0, largeur - 1).trimEnd()}…`;
  return gardees;
}

const echapper = (texte: string) =>
  texte
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Les trois barres de la marque (les tracés de `src/ui/Marque.astro`). */
const BARRES = [
  'M0.00,7.00Q0.00,2.00 5.00,2.00L24.80,2.00Q29.80,2.00 29.80,7.00L29.80,112.80Q29.80,117.80 24.80,117.80L5.00,117.80Q0.00,117.80 0.00,112.80Z',
  'M82.13,2.80Q83.20,0.00 86.20,0.00L118.20,0.00Q121.20,0.00 120.13,2.80L76.37,117.00Q75.30,119.80 72.30,119.80L40.30,119.80Q37.30,119.80 38.37,117.00Z',
  'M128.00,7.00Q128.00,2.00 133.00,2.00L152.80,2.00Q157.80,2.00 157.80,7.00L157.80,112.80Q157.80,117.80 152.80,117.80L133.00,117.80Q128.00,117.80 128.00,112.80Z',
];

const barresDeLaMarque = (c: CouleursDePartage) =>
  BARRES.map(
    (d, i) =>
      `<path d="${d}" fill="${[c.barreCreme, c.barreJaune, c.barreRouge][i]}" stroke="${c.trait}" stroke-width="3.2" stroke-linejoin="round"/>`,
  ).join('');

/** La pastille de la preuve, à la hauteur `y` : les trois dessins des preuves de la fiche. */
function pastilleDePreuve(preuve: PreuveDePartage, c: CouleursDePartage, y: number): string {
  const largeur = Math.round(preuve.texte.length * 15.5 + 64);
  const cadre =
    preuve.genre === 'direction'
      ? `fill="${c.preuveDirection}"`
      : preuve.genre === 'terrain'
        ? `fill="${c.carte}" stroke="${c.preuveTerrain}" stroke-width="4"`
        : `fill="${c.fond}" stroke="${c.preuveVideTrait}" stroke-width="4" stroke-dasharray="14 10"`;
  const encre =
    preuve.genre === 'direction'
      ? c.preuveDirectionTexte
      : preuve.genre === 'terrain'
        ? c.preuveTerrain
        : c.preuveVide;
  return `<rect x="80" y="${y}" width="${largeur}" height="72" rx="36" ${cadre}/><text x="112" y="${y + 47}" font-family="Poppins" font-weight="700" font-size="28" fill="${encre}">${echapper(preuve.texte)}</text>`;
}

/**
 * L'image de partage d'une page qui n'est pas une fiche : la marque, le titre (trois lignes au plus), le lieu, l'adresse du site.
 * Les polices sont celles du site (Poppins 700 pour les titres, Nunito Sans pour le texte), données au rendu.
 */
export function svgDePartage({
  titre,
  lieu,
  preuve,
  couleurs: c,
}: {
  titre: string;
  lieu: string;
  preuve: PreuveDePartage | null;
  couleurs: CouleursDePartage;
}): string {
  const lignes = coupeEnLignes(titre, 26, 3);
  const taille = lignes.length > 2 ? 60 : 68;
  const haut = 250 - (lignes.length - 1) * (taille / 2);
  const titreSvg = lignes
    .map(
      (l, i) =>
        `<text x="80" y="${haut + i * taille * 1.12}" font-family="Poppins" font-weight="700" font-size="${taille}" fill="${c.texte}">${echapper(l)}</text>`,
    )
    .join('');
  const basTitre = haut + (lignes.length - 1) * taille * 1.12;
  const lieuSvg = lieu
    ? `<text x="80" y="${basTitre + 64}" font-family="Nunito Sans" font-size="34" fill="${c.texteDoux}">${echapper(lieu)}</text>`
    : '';
  const preuveSvg = preuve ? pastilleDePreuve(preuve, c, 476) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGEUR_PARTAGE}" height="${HAUTEUR_PARTAGE}" viewBox="0 0 ${LARGEUR_PARTAGE} ${HAUTEUR_PARTAGE}"><rect width="${LARGEUR_PARTAGE}" height="${HAUTEUR_PARTAGE}" fill="${c.fond}"/><rect y="0" width="${LARGEUR_PARTAGE}" height="12" fill="${c.marque}"/><g transform="translate(80 64) scale(0.42)">${barresDeLaMarque(c)}</g><text x="166" y="104" font-family="Poppins" font-weight="700" font-size="40" fill="${c.texte}">NTanova</text>${titreSvg}${lieuSvg}${preuveSvg}<text x="1120" y="590" text-anchor="end" font-family="Nunito Sans" font-size="28" fill="${c.texteDoux}">ntanova.com</text></svg>`;
}

/** La hauteur du bandeau coloré de la couverture ; le texte occupe le reste de l'image. */
const HAUTEUR_COUVERTURE = 230;

/**
 * L'image de partage d'une fiche : sa couverture dessinée (la couleur et la lettre du cycle le plus élevé, les trois barres),
 * puis le nom, le lieu et la preuve, pour qu'une image transférée sans son lien se comprenne encore. Aucune photo.
 */
export function svgDeCouverture({
  titre,
  lieu,
  preuve,
  lettre,
  couleurs: c,
}: {
  titre: string;
  lieu: string;
  preuve: PreuveDePartage;
  /** La lettre du cycle le plus élevé ; vide quand aucun niveau n'est noté (couverture neutre). */
  lettre: string;
  couleurs: CouleursDePartage;
}): string {
  const fondParLettre: Record<string, string> = {
    M: c.cycleM,
    P: c.cycleP,
    C: c.cycleC,
    L: c.cycleL,
    T: c.cycleT,
    S: c.cycleS,
  };
  const fond = fondParLettre[lettre] ?? c.cycleNeutre;
  // Deux lignes en grand si le nom y tient, sinon trois plus petites.
  const enGrand = coupeEnLignes(titre, 28, 3);
  const lignes = enGrand.length <= 2 ? enGrand : coupeEnLignes(titre, 35, 3);
  const taille = enGrand.length <= 2 ? 60 : 48;
  const pas = taille * 1.14;
  const haut = HAUTEUR_COUVERTURE + (enGrand.length <= 2 ? 86 : 70);
  const titreSvg = lignes
    .map(
      (l, i) =>
        `<text x="80" y="${Math.round(haut + i * pas)}" font-family="Poppins" font-weight="700" font-size="${taille}" fill="${c.texte}">${echapper(l)}</text>`,
    )
    .join('');
  const basTitre = Math.round(haut + (lignes.length - 1) * pas);
  const lieuSvg = lieu
    ? `<text x="80" y="${basTitre + (lignes.length > 2 ? 44 : 54)}" font-family="Nunito Sans" font-size="32" fill="${c.texteDoux}">${echapper(coupeEnLignes(lieu, 62, 1)[0] ?? lieu)}</text>`
    : '';
  const lettreSvg = lettre
    ? `<text x="1130" y="${HAUTEUR_COUVERTURE + 120}" text-anchor="end" font-family="Poppins" font-weight="700" font-size="520" fill="${c.blanc}" fill-opacity="${c.opaciteLettre}">${echapper(lettre)}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGEUR_PARTAGE}" height="${HAUTEUR_PARTAGE}" viewBox="0 0 ${LARGEUR_PARTAGE} ${HAUTEUR_PARTAGE}"><defs><clipPath id="bandeau"><rect width="${LARGEUR_PARTAGE}" height="${HAUTEUR_COUVERTURE}"/></clipPath><pattern id="rayures" width="42" height="42" patternUnits="userSpaceOnUse" patternTransform="rotate(25)"><rect width="6" height="42" fill="${c.blanc}" fill-opacity="${c.opaciteRayure}"/></pattern></defs><rect width="${LARGEUR_PARTAGE}" height="${HAUTEUR_PARTAGE}" fill="${c.fond}"/><g clip-path="url(#bandeau)"><rect width="${LARGEUR_PARTAGE}" height="${HAUTEUR_COUVERTURE}" fill="${fond}"/><rect width="${LARGEUR_PARTAGE}" height="${HAUTEUR_COUVERTURE}" fill="url(#rayures)"/>${lettreSvg}</g><g transform="translate(80 56) scale(0.5)">${barresDeLaMarque(c)}</g>${titreSvg}${lieuSvg}${pastilleDePreuve(preuve, c, 490)}<text x="1120" y="540" text-anchor="end" font-family="Nunito Sans" font-size="28" fill="${c.texteDoux}">ntanova.com</text></svg>`;
}

/** Les mots et la lettre de l'image d'une fiche. */
export function contenuDePartage(e: Fiche & Pick<EcolePubliee, 'niveaux'>): {
  titre: string;
  lieu: string;
  preuve: PreuveDePartage;
  lettre: string;
} {
  return {
    titre: e.etiquette ? `${e.nom} (${e.etiquette})` : e.nom,
    lieu: ligneDeLieu(e.quartier, e.divisionNoms),
    preuve: preuveDePartage(e),
    lettre: cycleLePlusEleve(e.niveaux)?.lettre ?? '',
  };
}

/** Les données structurées d'une fiche (`schema.org/School`) : ce que la fiche montre déjà, rien de plus. */
export function donneesEcole(e: Fiche, adresse: string): Record<string, unknown> {
  const lieu = ligneDeLieu(e.quartier, e.divisionNoms).split(' · ').join(', ');
  return {
    '@context': 'https://schema.org',
    '@type': 'School',
    name: e.etiquette ? `${e.nom} (${e.etiquette})` : e.nom,
    url: adresse,
    address: {
      '@type': 'PostalAddress',
      ...(e.repere ? { streetAddress: e.repere } : {}),
      addressLocality: lieu,
      addressCountry: 'CG',
    },
    ...(e.latitude !== null && e.longitude !== null
      ? { geo: { '@type': 'GeoCoordinates', latitude: e.latitude, longitude: e.longitude } }
      : {}),
    ...(e.numeroEnseigne ? { telephone: `+${e.numeroEnseigne}` } : {}),
  };
}
