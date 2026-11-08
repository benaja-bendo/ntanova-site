/**
 * La géographie publique : pays › département › ville › arrondissement › quartier, lue dans `geo_divisions`.
 *
 * Pointe-Noire est à la fois un département (niveau 1) et une ville (niveau 2), deux lignes de même
 * nom l'une sous l'autre : elles n'ont qu'une page, portée par la plus fine, et le fil d'Ariane ne répète pas le nom
 * (« Congo › Pointe-Noire › Tié-Tié »). Tout ce fichier est pur : il ne connaît ni la base ni Astro.
 *
 * Les adresses publiques (ticket 147, décision du fondateur du 08/11/2026) n'ont ni le pays ni le département : une
 * ville et ce qu'elle contient (`/ecoles/pointe-noire/tie-tie/`), et chaque fiche par son nom et son identifiant
 * (`/ecoles/complexe-exemple-482913/`). Le découpage en départements change (15 depuis octobre 2024) : un lien partagé
 * ne doit pas en dépendre. Les adresses d'avant (`/ecoles/congo/…`) renvoient vers les nouvelles.
 */
import type { DivisionPublique, EcolePubliee } from './ports';

/** Les valeurs d'une liste, sans les répétitions qui se suivent (« pointe-noire, pointe-noire » → « pointe-noire »). */
export function sansRepetition<T>(valeurs: readonly T[]): T[] {
  return valeurs.filter((v, i) => i === 0 || v !== valeurs[i - 1]);
}

/**
 * Le chemin public d'une zone, de sa chaîne d'ancêtres (du pays à elle) : la ville et ce qu'elle contient, sans le pays
 * ni le département. Un département qui n'est pas aussi une ville garde son nom seul ; le pays n'a pas de chemin (sa
 * page est `/ecoles/`).
 */
export function cheminPublic(
  chaine: readonly Pick<DivisionPublique, 'niveau' | 'slug'>[],
): string[] {
  const elle = chaine[chaine.length - 1];
  if (!elle || elle.niveau === 0) return [];
  if (elle.niveau === 1) return [elle.slug];
  return sansRepetition(chaine.filter((d) => d.niveau >= 2).map((d) => d.slug));
}

/** Le chemin public d'une division, en remontant ses parents. */
export function cheminDeDivision(
  d: DivisionPublique,
  parId: ReadonlyMap<string, DivisionPublique>,
): string[] {
  const chaine: DivisionPublique[] = [];
  for (
    let x: DivisionPublique | undefined = d;
    x;
    x = x.parentId ? parId.get(x.parentId) : undefined
  )
    chaine.unshift(x);
  return cheminPublic(chaine);
}

/** L'adresse publique d'une zone, de son chemin public : `/ecoles/pointe-noire/tie-tie/` (le pays : `/ecoles/`). */
export function lienDivision(chemin: readonly string[]): string {
  return chemin.length === 0 ? '/ecoles/' : `/ecoles/${chemin.join('/')}/`;
}

/** L'adresse canonique de la fiche d'un campus : le nom d'abord, lisible sur WhatsApp, `/ecoles/complexe-exemple-482913/`. */
export function lienEcole(ecole: Pick<EcolePubliee, 'slug' | 'numero'>): string {
  return `/ecoles/${ecole.slug}-${ecole.numero}/`;
}

/** Le lien court d'une fiche, la seule forme courte : `/ecoles/482913/`. Il renvoie vers l'adresse canonique. */
export function lienCourt(ecole: Pick<EcolePubliee, 'numero'>): string {
  return `/ecoles/${ecole.numero}/`;
}

/** Une page de zone du site : une division (ou deux, quand la ville porte le nom de son département). */
export interface PageDivision {
  /** La division qui porte la page : la plus fine. */
  division: DivisionPublique;
  /** Les divisions confondues avec elle (le département de même nom), vides sinon. */
  fusionnees: DivisionPublique[];
  /** Les adresses du pays à cette zone, sans répétition : `['congo', 'pointe-noire', 'tie-tie']`. La clé de `parAdresse`. */
  adresse: string[];
  /** Le chemin public de sa page (ticket 147) : `['pointe-noire', 'tie-tie']` ; vide pour le pays. */
  chemin: string[];
  /** Le fil d'Ariane (noms), sans répétition. */
  noms: string[];
  parent: PageDivision | null;
  enfants: PageDivision[];
  /** Les campus publiés placés exactement dans cette zone. */
  ecoles: EcolePubliee[];
  /** Le relevé a commencé ici : la zone, ou une zone au-dessus d'elle, est ouverte aux relais. */
  releve: boolean;
}

/**
 * L'arbre des zones qui ont au moins un campus publié, dessus ou dessous, ou où le relevé est ouvert ; les autres n'ont
 * pas de page.
 */
export interface ArbrePublic {
  racines: PageDivision[];
  /** La page d'une adresse (`congo/pointe-noire/tie-tie`). */
  parAdresse: ReadonlyMap<string, PageDivision>;
  /** La page qui porte une division, par son identifiant (une division fusionnée renvoie à la page de la ville). */
  parId: ReadonlyMap<string, PageDivision>;
  /** Toutes les pages, du pays au quartier, puis par ordre et par nom. */
  tous: PageDivision[];
}

/** Tous les campus qui sont dans cette zone, ou dessous. */
export function ecolesSous(page: PageDivision): EcolePubliee[] {
  return [...page.ecoles, ...page.enfants.flatMap(ecolesSous)];
}

const collateur = new Intl.Collator('fr', { sensitivity: 'base' });

/**
 * Construit l'arbre. Une zone sans campus publié, ni elle ni dessous, n'a pas de page : la liste d'un pays
 * n'affiche pas quarante arrondissements vides. L'administration voit tout (voir `PortAdministration.divisions`).
 */
export function construireArbre(
  divisions: readonly DivisionPublique[],
  ecoles: readonly EcolePubliee[],
): ArbrePublic {
  const parId = new Map(divisions.map((d) => [d.id, d]));
  const enfantsDe = new Map<string, DivisionPublique[]>();
  for (const d of divisions) {
    if (d.parentId) enfantsDe.set(d.parentId, [...(enfantsDe.get(d.parentId) ?? []), d]);
  }

  // Une ville qui porte le nom de son département (et en est la seule enfant) confond leurs pages : la plus fine la porte.
  const porteur = (d: DivisionPublique): DivisionPublique => {
    const enfants = enfantsDe.get(d.id) ?? [];
    const seule = enfants.length === 1 ? enfants[0] : undefined;
    return seule && seule.slug === d.slug ? porteur(seule) : d;
  };

  const pages = new Map<string, PageDivision>();
  for (const d of divisions) {
    if (porteur(d).id !== d.id) continue;
    pages.set(d.id, {
      division: d,
      fusionnees: [],
      adresse: [],
      chemin: [],
      noms: [],
      parent: null,
      enfants: [],
      ecoles: [],
      releve: false,
    });
  }
  const pageDe = (d: DivisionPublique): PageDivision | undefined => pages.get(porteur(d).id);

  for (const d of divisions) {
    const page = pageDe(d);
    if (page && page.division.id !== d.id) page.fusionnees.push(d);
  }
  const ancetres = (d: DivisionPublique): DivisionPublique[] => {
    const haut = d.parentId ? parId.get(d.parentId) : undefined;
    return [...(haut ? ancetres(haut) : []), d];
  };
  for (const page of pages.values()) {
    const chaine = ancetres(page.division);
    page.adresse = sansRepetition(chaine.map((x) => x.slug));
    page.chemin = cheminPublic(chaine);
    page.noms = sansRepetition(chaine.map((x) => x.nom));
    page.releve = chaine.some((x) => x.ouverte);
    // Le parent : la page du premier ancêtre qui n'est pas confondu avec celle-ci.
    const haut = chaine
      .slice(0, -1)
      .reverse()
      .find((x) => pageDe(x) !== page);
    const parent = haut ? pageDe(haut) : undefined;
    if (parent) {
      page.parent = parent;
      parent.enfants.push(page);
    }
  }
  for (const e of ecoles) {
    const d = parId.get(e.divisionId);
    const page = d ? pageDe(d) : undefined;
    page?.ecoles.push(e);
  }

  // Les zones sans campus publié, ni dessus ni dessous, sortent de l'arbre, sauf celles où le relevé a été ouvert et celles
  // qui ont leur propre état public (« relevé en cours », « déploiement programmé » : Brazzaville n'a pas encore d'école,
  // mais la carte la montre et son lien doit mener quelque part). Leur page dit l'état de la carte (`etat-zone.ts`).
  // Ouvrir un pays ne crée pas la page de chacune de ses villes : seule la zone réglée elle-même en a une.
  const ouverteDirectement = (p: PageDivision): boolean =>
    p.division.ouverte ||
    p.division.deploiement !== null ||
    p.fusionnees.some((f) => f.ouverte || f.deploiement !== null);
  const aUnePage = (p: PageDivision): boolean =>
    p.ecoles.length > 0 || ouverteDirectement(p) || p.enfants.some(aUnePage);
  for (const p of pages.values()) p.enfants = p.enfants.filter(aUnePage);
  const gardees = [...pages.values()].filter(aUnePage);
  const tri = (a: PageDivision, b: PageDivision) =>
    (a.division.ordinal ?? 999) - (b.division.ordinal ?? 999) ||
    collateur.compare(a.division.nom, b.division.nom);
  for (const p of gardees) {
    p.enfants.sort(tri);
    p.ecoles.sort(
      (a, b) =>
        collateur.compare(a.nom, b.nom) || collateur.compare(a.etiquette ?? '', b.etiquette ?? ''),
    );
  }
  gardees.sort((a, b) => a.division.niveau - b.division.niveau || tri(a, b));

  const parAdresse = new Map<string, PageDivision>();
  for (const p of gardees) parAdresse.set(p.adresse.join('/'), p);
  const parIdPublic = new Map<string, PageDivision>();
  for (const p of gardees) {
    parIdPublic.set(p.division.id, p);
    for (const f of p.fusionnees) parIdPublic.set(f.id, p);
  }
  return {
    racines: gardees.filter((p) => p.parent === null).sort(tri),
    parAdresse,
    parId: parIdPublic,
    tous: gardees,
  };
}

/** Le niveau d'un genre de division, tel que le dit la base (voir `geo_divisions_genre_du_niveau`). */
export const NOM_NIVEAU: Readonly<Record<number, string>> = {
  0: 'pays',
  1: 'département',
  2: 'ville',
  3: 'arrondissement',
  4: 'quartier',
};

/** « 3 écoles » / « 1 école » */
export function compterEcoles(n: number): string {
  return n === 1 ? '1 école' : `${n} écoles`;
}

/**
 * Le compteur d'une page de zone, dit comme celui de l'accueil : « 2 écoles, dont 2 vues sur place et 1 confirmée par la
 * direction ». Un nombre seul, sans « dont », quand rien n'est vu ni confirmé.
 */
export function phraseDeCompte(total: number, vues: number, confirmees: number): string {
  const morceaux = [
    vues > 0 ? `${vues} vue${vues > 1 ? 's' : ''} sur place` : null,
    confirmees > 0 ? `${confirmees} confirmée${confirmees > 1 ? 's' : ''} par la direction` : null,
  ].filter((x): x is string => x !== null);
  return morceaux.length > 0
    ? `${compterEcoles(total)}, dont ${morceaux.join(' et ')}`
    : compterEcoles(total);
}

/** Le nom d'une zone tel qu'on l'écrit dans une phrase : le pays s'appelle « Congo-Brazzaville », jamais « Congo » seul. */
export function nomAffiche(nom: string, niveau: number): string {
  return niveau === 0 ? 'Congo-Brazzaville' : nom;
}

/** « à Pointe-Noire », « à Ngoyo », « au Congo-Brazzaville » : la préposition d'une zone. */
export function lieuAvecPreposition(nom: string, niveau: number): string {
  return niveau === 0 ? `au ${nomAffiche(nom, niveau)}` : `à ${nom}`;
}

/**
 * « du Congo-Brazzaville », « de Pointe-Noire », « d’Owando » : le complément d'une zone, comme dans « Les écoles du
 * Congo-Brazzaville » (ticket 146 : le titre disait « Les écoles de Congo »).
 */
export function deLieu(nom: string, niveau: number): string {
  if (niveau === 0) return `du ${nomAffiche(nom, niveau)}`;
  return /^[aeiouyàâäéèêëîïôöûü]/i.test(nom) ? `d’${nom}` : `de ${nom}`;
}

/**
 * La ligne de lieu d'une fiche, du plus fin au plus large, sans le pays et sans jamais répéter un nom :
 * « [Quartier] · Tié-Tié · Pointe-Noire ». Le département et la ville de Pointe-Noire portent le même
 * nom ; le quartier noté par le relais peut être celui de l'arrondissement.
 */
export function ligneDeLieu(quartier: string | null, noms: readonly string[]): string {
  const morceaux = [quartier, ...noms.slice(1).reverse()].filter((x): x is string => !!x);
  return morceaux.filter((x, i) => morceaux.indexOf(x) === i).join(' · ');
}

/** Le fil d'Ariane d'une division, sans la répétition ville/département de même nom : « Congo › Pointe-Noire › Tié-Tié ». */
export function cheminLisible(
  id: string,
  divisions: readonly { id: string; parentId: string | null; nom: string }[],
): string {
  const parId = new Map(divisions.map((d) => [d.id, d]));
  const noms: string[] = [];
  for (let d = parId.get(id); d; d = d.parentId ? parId.get(d.parentId) : undefined) {
    if (noms[0] !== d.nom) noms.unshift(d.nom);
  }
  return noms.join(' › ');
}
