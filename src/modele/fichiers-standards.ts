/**
 * Deux fichiers standards que les robots demandent à chaque site (23/11/2026) :
 *
 * - `/llms.txt` (llmstxt.org) : un résumé en Markdown pour les assistants d'IA, avec les pages fixes, les lieux et les fiches.
 *   Il dit d'abord que le pays est le Congo-Brazzaville, pas la RDC, et ce que vaut une fiche : une IA qui le lit ne doit pas
 *   prêter à une fiche relevée dans la rue ce que seule la direction peut dire. Mêmes adresses que `sitemap.xml` : une page de
 *   lieu sans fiche n'y est jamais.
 * - `/.well-known/security.txt` (RFC 9116) : à qui signaler une faille. L'adresse vient de `PUBLIC_CONTACT_EMAIL`, jamais du code.
 *
 * Purs : ni base, ni Astro. Les pages `src/pages/llms.txt.ts` et `src/pages/.well-known/security.txt.ts` les construisent.
 */
import { ecolesSous, lienDivision, lienEcole, type PageDivision } from './geo-divisions';
import { PAGES_DE_TRANSPARENCE } from './pages-de-confiance';
import type { EcolePubliee } from './ports';

const PAGES_PRINCIPALES = [
  {
    href: '/ecoles/',
    texte: 'Les écoles',
    note: 'toutes les fiches publiées, en liste ou sur la carte',
  },
  {
    href: '/pour-les-ecoles/',
    texte: 'Espace écoles',
    note: 'ce qu’une direction peut faire de sa fiche',
  },
  { href: '/a-propos/', texte: 'À propos', note: 'qui est NTanova et ce que nous publions' },
] as const;

const NOTES_TRANSPARENCE: Record<string, string> = {
  '/methode/': 'comment une fiche est relevée, datée et corrigée',
  '/donnees/': 'les fiches publiées en chiffres et les conditions d’utilisation',
  '/confidentialite/': 'ce que NTanova garde pour elle et les droits de chacun',
  '/mentions-legales/': 'l’éditeur et les hébergeurs',
};

/** Un texte sans crochets : ils casseraient un lien Markdown. */
const sansCrochets = (texte: string) => texte.replace(/[[\]]/g, '');
const lien = (texte: string, adresse: string) => `[${sansCrochets(texte)}](${adresse})`;

/** Le nom d'un lieu, de la ville au quartier : « Pointe-Noire › Ngoyo ». */
const nomDuLieu = (lieu: PageDivision) => lieu.noms.slice(-lieu.chemin.length).join(' › ');

/** Le nom d'une école, son implantation, et où elle est (sans le pays) : « Complexe X, Campus 2 (Pointe-Noire, Ngoyo) ». */
const nomDeLEcole = (e: EcolePubliee) => {
  const nom = sansCrochets(e.etiquette ? `${e.nom}, ${e.etiquette}` : e.nom);
  const ou = e.divisionNoms.slice(1).join(', ');
  return { nom, ou };
};

/** Le fichier `llms.txt`, aux adresses absolues de `base` (`https://ntanova.com`). */
export function llmsTxt(
  base: string,
  lieux: readonly PageDivision[],
  ecoles: readonly EcolePubliee[],
): string {
  const url = (chemin: string) => new URL(chemin, base).href;
  const lignes: string[] = [
    '# NTanova',
    '',
    '> Annuaire des écoles de la République du Congo (Congo-Brazzaville, pas la République démocratique du Congo), de la maternelle au supérieur, publiques et privées, quartier par quartier.',
    '',
    'Des relais passent devant les écoles, photographient leur enseigne et relèvent leur position ; l’administration de NTanova vérifie chaque fiche avant de la publier. Une fiche décrit ce qui se voit de la rue à la date du relevé (nom, enseigne, position, niveaux). Les frais, le contact et le mot de la direction n’y paraissent qu’avec l’accord daté de la direction, et la fiche le dit alors (« vérifiée par la direction le … »). L’annuaire ne prétend pas recenser toutes les écoles du pays : ce qui est publié est décrit sur la page Données.',
    '',
    '## Pages principales',
    '',
    `- ${lien('Accueil', url('/'))}`,
    ...PAGES_PRINCIPALES.map((p) => `- ${lien(p.texte, url(p.href))} : ${p.note}`),
    ...PAGES_DE_TRANSPARENCE.map(
      (p) =>
        `- ${lien(p.texte, url(p.href))}${NOTES_TRANSPARENCE[p.href] ? ` : ${NOTES_TRANSPARENCE[p.href]}` : ''}`,
    ),
  ];

  const avecFiches = lieux.filter((l) => l.chemin.length > 0 && ecolesSous(l).length > 0);
  const vusLieux = new Set<string>();
  const lignesLieux = avecFiches
    .map((l) => ({ nom: nomDuLieu(l), adresse: lienDivision(l.chemin) }))
    .filter((l) => (vusLieux.has(l.adresse) ? false : (vusLieux.add(l.adresse), true)))
    .sort((a, b) => a.adresse.localeCompare(b.adresse, 'fr'))
    .map((l) => `- ${lien(l.nom, url(l.adresse))}`);
  if (lignesLieux.length > 0) lignes.push('', '## Villes et quartiers', '', ...lignesLieux);

  const vusEcoles = new Set<string>();
  const lignesEcoles = ecoles
    .map((e) => ({ ...nomDeLEcole(e), adresse: lienEcole(e) }))
    .filter((e) => (vusEcoles.has(e.adresse) ? false : (vusEcoles.add(e.adresse), true)))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    .map((e) => `- ${lien(e.nom, url(e.adresse))}${e.ou ? ` : ${e.ou}` : ''}`);
  if (lignesEcoles.length > 0) lignes.push('', '## Fiches des écoles', '', ...lignesEcoles);

  lignes.push('', '## Optional', '', `- ${lien('Plan du site', url('/sitemap.xml'))}`, '');
  return lignes.join('\n');
}

const JOUR_MS = 24 * 60 * 60 * 1000;

/**
 * Le fichier `security.txt` (RFC 9116). `Expires` est obligatoire et doit rester à moins d'un an : il est recalculé à chaque
 * construction (364 jours plus tard). Sans adresse de contact, il renvoie aux mentions légales.
 */
export function securityTxt(base: string, email: string | undefined, maintenant: Date): string {
  const contact = email ? `mailto:${email}` : new URL('/mentions-legales/', base).href;
  const expire = new Date(maintenant.getTime() + 364 * JOUR_MS);
  expire.setUTCHours(0, 0, 0, 0);
  return [
    `Contact: ${contact}`,
    `Expires: ${expire.toISOString()}`,
    'Preferred-Languages: fr, en',
    `Canonical: ${new URL('/.well-known/security.txt', base).href}`,
    '',
  ].join('\n');
}
