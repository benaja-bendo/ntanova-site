/**
 * Le JavaScript de la page « Écoles » (ticket 146 : la recherche et « Autour de moi » y sont réunies). Il lit `/recherche.json`
 * (construit avec le site) et filtre dans le navigateur, avec les mêmes règles que la base
 * (`src/modele/recherche.ts`). Aucune requête ne part avec la recherche, et la position de la personne n'est
 * jamais envoyée nulle part : elle ne sert qu'à classer des écoles déjà dans la page.
 *
 * Les résultats s'écrivent comme toutes les listes d'écoles du site (`creerLigneEcole`) et, quand il n'y en a pas, avec le même
 * état vide (`creerEtatVide`) : de quoi continuer, et la porte « Une école manque ? » vers WhatsApp.
 */
import type { Point } from '../modele/geo';
import { CYCLES, ORDRE_LETTRES } from '../modele/carte/cycles';
import { ligneDeRecherche } from '../modele/ligne-ecole';
import { listes, type Valeur } from '../modele/listes';
import {
  chercher,
  ecrireDistance,
  type Criteres,
  type LigneRecherche,
  type Resultat,
} from '../modele/recherche';
import { creerEtatVide, creerLigneEcole, type EtatVideDonnees } from './dom-pieces';

let lignes: Promise<LigneRecherche[]> | null = null;

/**
 * Le fichier de recherche, lu une seule fois. Un échec (une coupure de réseau) n'est PAS gardé : la promesse rejetée serait
 * rendue à chaque nouvel essai, et la personne ne pourrait plus jamais recharger les données sans recharger la page.
 */
export function charger(): Promise<LigneRecherche[]> {
  if (lignes) return lignes;
  const lecture = fetch('/recherche.json').then((reponse) => {
    if (!reponse.ok) throw new Error(`recherche.json ${reponse.status}`);
    return reponse.json() as Promise<LigneRecherche[]>;
  });
  lecture.catch(() => {
    if (lignes === lecture) lignes = null;
  });
  lignes = lecture;
  return lecture;
}

const MAX_AFFICHEES = 60;

/** Les résultats d'une liste : le compte, les lignes d'école, ou l'état vide ; rien d'autre ne s'écrit dans la zone. */
function afficher(zone: HTMLElement, resultats: Resultat[], vide: () => EtatVideDonnees): void {
  const liste = zone.querySelector('ul');
  const compte = zone.querySelector('[data-compte]');
  const etatVide = zone.querySelector('[data-vide]');
  if (!liste || !compte || !etatVide) return;
  const n = resultats.length;
  if (n === 0) {
    liste.replaceChildren();
    compte.textContent = '';
    etatVide.replaceChildren(creerEtatVide(vide()));
    return;
  }
  etatVide.replaceChildren();
  liste.replaceChildren(
    ...resultats
      .slice(0, MAX_AFFICHEES)
      .map((r) => creerLigneEcole(ligneDeRecherche(r.ligne, r.distance))),
  );
  compte.textContent = `${n} école${n > 1 ? 's' : ''}${n > MAX_AFFICHEES ? ` (les ${MAX_AFFICHEES} premières sont affichées)` : ''}`;
}

/** Ce qui s'écrit quand la liste n'a pas pu se charger : la cause en deux mots, et un bouton pour réessayer. */
function afficherEchec(zone: HTMLElement, titre: string, reessayer: () => void): void {
  zone.querySelector('ul')?.replaceChildren();
  const compte = zone.querySelector('[data-compte]');
  if (compte) compte.textContent = '';
  zone.querySelector('[data-vide]')?.replaceChildren(
    creerEtatVide({
      titre,
      detail: 'Vérifiez votre connexion, puis réessayez.',
      actions: [{ texte: 'Réessayer', surClic: reessayer }],
    }),
  );
}

const lire = <T extends string>(valeur: string, permis: readonly T[]): T | undefined =>
  (permis as readonly string[]).includes(valeur) ? (valeur as T) : undefined;

/** La lettre d'un cycle, lue dans une adresse : « L », « l » ou l'ancien mot (« lycee »). */
export function lettreDeCycle(valeur: string): string {
  const lettre = valeur.toUpperCase();
  if ((ORDRE_LETTRES as readonly string[]).includes(lettre)) return lettre;
  return CYCLES.find((c) => c.cycle === valeur)?.lettre ?? '';
}

/** Sur un petit écran la bande de puces défile : un choix hors de vue (venu de l'adresse, par exemple) ne se verrait pas. */
function montrerLaPuce(groupe: HTMLElement, puce: HTMLElement): void {
  const bande = groupe.getBoundingClientRect();
  const boite = puce.getBoundingClientRect();
  if (boite.right > bande.right) groupe.scrollLeft += boite.right - bande.right + 8;
  else if (boite.left < bande.left) groupe.scrollLeft -= bande.left - boite.left + 8;
}

/** Choisit une puce du groupe : elle seule est appuyée, et elle se montre dans sa bande. */
function choisirPuce(groupe: HTMLElement, puce: HTMLElement | undefined): void {
  groupe
    .querySelectorAll<HTMLElement>('[aria-pressed]')
    .forEach((p) => p.setAttribute('aria-pressed', String(p === puce)));
  if (puce) montrerLaPuce(groupe, puce);
}

/** La puce appuyée d'un groupe. */
const puceChoisie = (groupe: HTMLElement | null): HTMLElement | undefined =>
  groupe?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? undefined;

const NOMS_CRITERES = [
  'q',
  'zone',
  'type',
  'niveau',
  'serie',
  'diplome',
  'domaine',
  'rythme',
] as const;
const FILTRES_AVANCES = ['serie', 'diplome', 'domaine', 'rythme'] as const;
const RAYON_PAR_DEFAUT = 3000;

/**
 * La page « Écoles » (ticket 146) : un formulaire, des résultats qui suivent chaque frappe, l'adresse qui garde la recherche.
 * « Autour de moi » en est un filtre : la position n'est demandée qu'à l'appui du bouton, sert à classer les écoles déjà
 * chargées, et n'est envoyée à personne (ni dans une requête, ni dans l'adresse, qui ne garde que le rayon).
 */
export function demarrerRecherche(racine: HTMLElement): void {
  const formulaire = racine.querySelector('form');
  const zone = racine.querySelector<HTMLElement>('[data-resultats]');
  const niveaux = racine.querySelector<HTMLElement>('[data-niveaux]');
  if (!formulaire || !zone || !niveaux) return;
  const manque = racine.dataset['manque'];
  const boutonPosition = racine.querySelector<HTMLButtonElement>('[data-position]');
  const bandeRayons = racine.querySelector<HTMLElement>('[data-rayons-bande]');
  const rayons = racine.querySelector<HTMLElement>('[data-rayons]');
  const message = racine.querySelector<HTMLElement>('[data-message]');
  const champ = (nom: string) =>
    formulaire.elements.namedItem(nom) as HTMLInputElement | HTMLSelectElement | null;
  let ici: Point | null = null;

  // Les critères viennent de l'adresse (?q=…&niveau=L&serie=c) : une recherche se partage.
  const params = new URLSearchParams(location.search);
  for (const nom of NOMS_CRITERES) {
    const v = params.get(nom);
    if (!v) continue;
    if (nom === 'niveau') {
      const lettre = lettreDeCycle(v);
      choisirPuce(
        niveaux,
        niveaux.querySelector<HTMLElement>(`[data-cycle="${lettre}"]`) ?? undefined,
      );
    } else {
      const c = champ(nom);
      if (c) c.value = v;
    }
  }
  // Un filtre avancé demandé par l'adresse : le volet est ouvert, pour qu'on voie ce qui réduit la liste.
  const plus = racine.querySelector<HTMLDetailsElement>('details.plus-de-filtres');
  if (plus && FILTRES_AVANCES.some((nom) => params.get(nom))) plus.open = true;
  // ?autour=3 (l'ancienne page « Autour de moi » y renvoie) : le rayon est choisi et sa bande se montre ; la position attend
  // toujours l'appui sur le bouton.
  const autour = Number(params.get('autour'));
  if (rayons && bandeRayons && autour > 0) {
    choisirPuce(
      rayons,
      rayons.querySelector<HTMLElement>(`[data-rayon="${autour * 1000}"]`) ?? undefined,
    );
    bandeRayons.hidden = false;
  }

  const cycle = () => puceChoisie(niveaux)?.dataset['cycle'] ?? '';
  const rayon = () => Number(puceChoisie(rayons)?.dataset['rayon'] ?? RAYON_PAR_DEFAUT);
  const criteres = (): Criteres => ({
    texte: champ('q')?.value ?? '',
    zone: champ('zone')?.value || undefined,
    type: lire<Valeur<'type_ecole'>>(champ('type')?.value ?? '', listes.type_ecole),
    cycle: cycle() || undefined,
    serie: lire<Valeur<'bac_track'>>(champ('serie')?.value ?? '', listes.bac_track),
    diplome: lire<Valeur<'diploma_kind'>>(champ('diplome')?.value ?? '', listes.diploma_kind),
    domaine: champ('domaine')?.value || undefined,
    rythme: lire<Valeur<'study_rhythm'>>(champ('rythme')?.value ?? '', listes.study_rhythm),
    pres: ici ?? undefined,
    rayonM: ici ? rayon() : undefined,
  });

  const lancer = async (): Promise<void> => {
    try {
      const tout = await charger();
      const resultats = chercher(tout, criteres());
      const surCarte = tout.filter((l) => l.la !== undefined).length;
      afficher(zone, ici ? resultats.filter((x) => x.distance !== null) : resultats, () =>
        ici
          ? {
              titre:
                surCarte === 0
                  ? 'Aucune école n’est encore située sur la carte.'
                  : `Aucune école relevée à moins de ${ecrireDistance(rayon())} d’ici pour l’instant.`,
              detail: 'Le relevé continue : essayez un rayon plus large, ou cherchez par nom.',
              actions: [{ texte: 'Effacer les critères', surClic: reinitialiser }],
              manque: manque
                ? { texte: 'Une école manque ? Dites-le-nous sur WhatsApp', url: manque }
                : null,
            }
          : {
              titre: 'Aucune école ne correspond.',
              detail: 'Essayez avec moins de critères.',
              actions: [{ texte: 'Effacer les critères', surClic: reinitialiser }],
              manque: manque
                ? { texte: 'Une école manque ? Dites-le-nous sur WhatsApp', url: manque }
                : null,
            },
      );
      const url = new URLSearchParams();
      for (const nom of NOMS_CRITERES) {
        const v = nom === 'niveau' ? cycle() : champ(nom)?.value;
        if (v) url.set(nom, v);
      }
      // Le rayon d'« Autour de moi » reste dans l'adresse tant que sa bande est montrée : le lien se partage, la position non.
      if (ici || (bandeRayons && !bandeRayons.hidden)) url.set('autour', String(rayon() / 1000));
      history.replaceState(null, '', url.size > 0 ? `?${url}` : location.pathname);
    } catch {
      afficherEchec(zone, 'La recherche n’a pas pu se charger.', () => void lancer());
    }
  };

  function reinitialiser(): void {
    formulaire!.reset();
    for (const nom of NOMS_CRITERES) {
      const c = champ(nom);
      if (c) c.value = '';
    }
    choisirPuce(niveaux!, niveaux!.querySelector<HTMLElement>('[data-cycle=""]') ?? undefined);
    ici = null;
    boutonPosition?.setAttribute('aria-pressed', 'false');
    if (bandeRayons) bandeRayons.hidden = true;
    if (message) message.textContent = '';
    void lancer();
    champ('q')?.focus();
  }

  formulaire.addEventListener('input', () => void lancer());
  formulaire.addEventListener('submit', (e) => {
    e.preventDefault();
    void lancer();
  });
  niveaux.addEventListener('click', (e) => {
    const puce = (e.target as Element).closest<HTMLElement>('[aria-pressed]');
    if (!puce) return;
    choisirPuce(niveaux, puce);
    void lancer();
  });
  rayons?.addEventListener('click', (e) => {
    const puce = (e.target as Element).closest<HTMLElement>('[aria-pressed]');
    if (!puce) return;
    choisirPuce(rayons, puce);
    void lancer();
  });
  boutonPosition?.setAttribute('aria-pressed', 'false');
  boutonPosition?.addEventListener('click', () => {
    if (bandeRayons) bandeRayons.hidden = false;
    const dire = (texte: string) => {
      if (message) message.textContent = texte;
    };
    if (!('geolocation' in navigator)) {
      dire('Votre téléphone ne donne pas sa position. Choisissez une ville à la place.');
      return;
    }
    dire('Recherche de votre position…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        ici = { latitude: p.coords.latitude, longitude: p.coords.longitude };
        boutonPosition.setAttribute('aria-pressed', 'true');
        dire('Les écoles les plus proches d’abord. Votre position reste sur votre téléphone.');
        void lancer();
      },
      (erreur) => {
        dire(
          erreur.code === erreur.PERMISSION_DENIED
            ? 'Vous avez refusé la position. Vous pouvez choisir une ville à la place.'
            : 'Votre position n’a pas pu être lue. Réessayez dehors, ou choisissez une ville.',
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
  racine.dataset['pret'] = 'oui';
  void lancer();
}
