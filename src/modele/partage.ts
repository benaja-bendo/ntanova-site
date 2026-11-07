/**
 * Le partage d'une fiche (ticket 101) : l'image que WhatsApp montre sous un lien (1 200 × 630, construite avec le
 * site, jamais chargée par la page elle-même) et les données structurées de la fiche (`schema.org/School`).
 * Des fonctions pures : le rendu en PNG est dans `src/pages/partage/[...chemin].png.ts`.
 *
 * Les couleurs viennent des jetons (`src/ui/jetons.css`), lus à la construction : aucune couleur n'est écrite ici.
 * Rien de privé : ni contact de la direction, ni photo non vérifiée. La photo de l'enseigne viendra avec les photos
 * publiques (ticket #19).
 */
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

/** L'adresse de l'image d'une fiche : celle de la fiche, en `.png`, sous `/partage/`. */
export function cheminImagePartage(e: Pick<Fiche, 'adresse' | 'slug'>): string {
  const adresse = e.adresse.filter((x, i) => i === 0 || x !== e.adresse[i - 1]);
  return `/partage/ecoles/${adresse.join('/')}/${e.slug}.png`;
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

/**
 * L'image de partage : la marque, le nom de l'école (trois lignes au plus), son lieu, sa preuve, l'adresse du site.
 * Les polices sont celles du site (Poppins 700 pour les titres, Nunito Sans pour le texte), données au rendu.
 */
export function svgDePartage({
  titre,
  lieu,
  preuve,
  couleurs: c,
  photo,
}: {
  titre: string;
  lieu: string;
  preuve: PreuveDePartage | null;
  couleurs: CouleursDePartage;
  photo?: string | undefined;
}): string {
  const lignes = coupeEnLignes(titre, photo ? 17 : 26, 3);
  const taille = photo ? 48 : lignes.length > 2 ? 60 : 68;
  const haut = 250 - (lignes.length - 1) * (taille / 2);
  const titreSvg = lignes
    .map(
      (l, i) =>
        `<text x="80" y="${haut + i * taille * 1.12}" font-family="Poppins" font-weight="700" font-size="${taille}" fill="${c.texte}">${echapper(l)}</text>`,
    )
    .join('');
  const basTitre = haut + (lignes.length - 1) * taille * 1.12;
  const lieuSvg = lieu
    ? `<text x="80" y="${photo ? 450 : basTitre + 64}" font-family="Nunito Sans" font-size="${photo ? 26 : 34}" fill="${c.texteDoux}">${echapper(photo ? (coupeEnLignes(lieu, 64, 1)[0] ?? lieu) : lieu)}</text>`
    : '';
  const preuveSvg = preuve
    ? (() => {
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
        return `<rect x="80" y="476" width="${largeur}" height="72" rx="36" ${cadre}/><text x="112" y="523" font-family="Poppins" font-weight="700" font-size="28" fill="${encre}">${echapper(preuve.texte)}</text>`;
      })()
    : '';
  const barres = BARRES.map(
    (d, i) =>
      `<path d="${d}" fill="${[c.barreCreme, c.barreJaune, c.barreRouge][i]}" stroke="${c.trait}" stroke-width="3.2" stroke-linejoin="round"/>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGEUR_PARTAGE}" height="${HAUTEUR_PARTAGE}" viewBox="0 0 ${LARGEUR_PARTAGE} ${HAUTEUR_PARTAGE}"><rect width="${LARGEUR_PARTAGE}" height="${HAUTEUR_PARTAGE}" fill="${c.fond}"/><rect y="0" width="${LARGEUR_PARTAGE}" height="12" fill="${c.marque}"/><g transform="translate(80 64) scale(0.42)">${barres}</g><text x="166" y="104" font-family="Poppins" font-weight="700" font-size="40" fill="${c.texte}">NTanova</text>${photo ? `<image x="700" y="150" width="420" height="280" preserveAspectRatio="xMidYMid meet" href="${echapper(photo)}"/>` : ''}${titreSvg}${lieuSvg}${preuveSvg}<text x="1120" y="590" text-anchor="end" font-family="Nunito Sans" font-size="28" fill="${c.texteDoux}">ntanova.com</text></svg>`;
}

/** Les mots de l'image d'une fiche. */
export function contenuDePartage(e: Fiche): {
  titre: string;
  lieu: string;
  preuve: PreuveDePartage;
} {
  return {
    titre: e.etiquette ? `${e.nom} (${e.etiquette})` : e.nom,
    lieu: ligneDeLieu(e.quartier, e.divisionNoms),
    preuve: preuveDePartage(e),
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
