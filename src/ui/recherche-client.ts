/**
 * Le seul JavaScript des pages publiques : « Rechercher » et « Autour de moi ». Il lit `/recherche.json`
 * (construit avec le site) et filtre dans le navigateur, avec les mêmes règles que la base
 * (`src/modele/recherche.ts`). Aucune requête ne part avec la recherche, et la position de la personne n'est
 * jamais envoyée nulle part : elle ne sert qu'à classer des écoles déjà dans la page.
 */
import type { Point } from '../modele/geo';
import { libelleNiveau } from '../modele/libelles';
import { listes, type Valeur } from '../modele/listes';
import {
  chercher,
  ecrireDistance,
  type Criteres,
  type LigneRecherche,
  type Resultat,
} from '../modele/recherche';

let lignes: Promise<LigneRecherche[]> | null = null;

/** Le fichier de recherche, lu une seule fois. */
function charger(): Promise<LigneRecherche[]> {
  lignes ??= fetch('/recherche.json').then((reponse) => {
    if (!reponse.ok) throw new Error(`recherche.json ${reponse.status}`);
    return reponse.json() as Promise<LigneRecherche[]>;
  });
  return lignes;
}

const MAX_AFFICHEES = 60;

function carte(r: Resultat): HTMLLIElement {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.className = 'ecole';
  a.href = r.ligne.u;
  const nom = document.createElement('span');
  nom.className = 'ecole-nom';
  nom.textContent = r.ligne.n;
  a.append(nom);
  if (r.ligne.e) {
    const e = document.createElement('span');
    e.className = 'ecole-etiquette';
    e.textContent = r.ligne.e;
    a.append(e);
  }
  const detail = document.createElement('span');
  detail.className = 'ecole-detail';
  detail.textContent = [
    r.ligne.d.split(' › ').slice(1).join(' · '),
    r.ligne.c.map((c) => libelleNiveau[c]).join(' · '),
    r.ligne.f.length > 0 ? `${r.ligne.f.length} formation${r.ligne.f.length > 1 ? 's' : ''}` : '',
    r.ligne.r ?? '',
  ]
    .filter(Boolean)
    .join(' · ');
  a.append(detail);
  if (r.distance !== null) {
    const d = document.createElement('span');
    d.className = 'ecole-etat';
    d.textContent = `À ${ecrireDistance(r.distance)}`;
    a.append(d);
  }
  li.append(a);
  return li;
}

function afficher(zone: HTMLElement, resultats: Resultat[], vide: string): void {
  const liste = zone.querySelector('ul');
  const compte = zone.querySelector('[data-compte]');
  if (!liste || !compte) return;
  liste.replaceChildren(...resultats.slice(0, MAX_AFFICHEES).map(carte));
  const n = resultats.length;
  compte.textContent =
    n === 0
      ? vide
      : `${n} école${n > 1 ? 's' : ''}${n > MAX_AFFICHEES ? ` (les ${MAX_AFFICHEES} premières sont affichées)` : ''}`;
}

const lire = <T extends string>(valeur: string, permis: readonly T[]): T | undefined =>
  (permis as readonly string[]).includes(valeur) ? (valeur as T) : undefined;

/** « Rechercher » : un formulaire, des résultats qui suivent chaque frappe, l'adresse qui garde la recherche. */
export function demarrerRecherche(racine: HTMLElement): void {
  const formulaire = racine.querySelector('form');
  const zone = racine.querySelector<HTMLElement>('[data-resultats]');
  if (!formulaire || !zone) return;
  const champ = (nom: string) =>
    formulaire.elements.namedItem(nom) as HTMLInputElement | HTMLSelectElement | null;

  // Les critères viennent de l'adresse (?q=…&niveau=lycee&serie=c) : une recherche se partage.
  const params = new URLSearchParams(location.search);
  for (const nom of ['q', 'zone', 'niveau', 'serie', 'diplome', 'domaine', 'rythme']) {
    const c = champ(nom);
    const v = params.get(nom);
    if (c && v) c.value = v;
  }

  const criteres = (): Criteres => ({
    texte: champ('q')?.value ?? '',
    zone: champ('zone')?.value || undefined,
    niveau: lire<Valeur<'niveau'>>(champ('niveau')?.value ?? '', listes.niveau),
    serie: lire<Valeur<'bac_track'>>(champ('serie')?.value ?? '', listes.bac_track),
    diplome: lire<Valeur<'diploma_kind'>>(champ('diplome')?.value ?? '', listes.diploma_kind),
    domaine: champ('domaine')?.value || undefined,
    rythme: lire<Valeur<'study_rhythm'>>(champ('rythme')?.value ?? '', listes.study_rhythm),
  });

  const lancer = async () => {
    try {
      const tout = await charger();
      const c = criteres();
      afficher(
        zone,
        chercher(tout, c),
        'Aucune école ne correspond. Essayez avec moins de critères.',
      );
      const url = new URLSearchParams();
      for (const nom of ['q', 'zone', 'niveau', 'serie', 'diplome', 'domaine', 'rythme']) {
        const v = champ(nom)?.value;
        if (v) url.set(nom, v);
      }
      history.replaceState(null, '', url.size > 0 ? `?${url}` : location.pathname);
    } catch {
      const compte = zone.querySelector('[data-compte]');
      if (compte)
        compte.textContent =
          'La recherche n’a pas pu se charger. Vérifiez votre connexion et réessayez.';
    }
  };

  formulaire.addEventListener('input', () => void lancer());
  formulaire.addEventListener('submit', (e) => {
    e.preventDefault();
    void lancer();
  });
  racine.dataset['pret'] = 'oui';
  void lancer();
}

/** « Autour de moi » : la position est demandée à l'appui, sert à classer, et n'est envoyée à personne. */
export function demarrerAutourDeMoi(racine: HTMLElement): void {
  const bouton = racine.querySelector<HTMLButtonElement>('[data-position]');
  const rayon = racine.querySelector<HTMLSelectElement>('[data-rayon]');
  const zone = racine.querySelector<HTMLElement>('[data-resultats]');
  const message = racine.querySelector<HTMLElement>('[data-message]');
  if (!bouton || !rayon || !zone || !message) return;
  let ici: Point | null = null;

  const montrer = async () => {
    if (!ici) return;
    try {
      const tout = await charger();
      const r = Number(rayon.value);
      const resultats = chercher(tout, { pres: ici, rayonM: r }).filter((x) => x.distance !== null);
      const surCarte = tout.filter((l) => l.la !== undefined).length;
      afficher(
        zone,
        resultats,
        surCarte === 0
          ? 'Aucune école n’est encore située sur la carte. Parcourez les villes à la place.'
          : `Aucune école relevée à moins de ${ecrireDistance(r)} d’ici pour l’instant.`,
      );
      zone.hidden = false;
    } catch {
      message.textContent =
        'La liste n’a pas pu se charger. Vérifiez votre connexion et réessayez.';
    }
  };

  bouton.addEventListener('click', () => {
    message.textContent = 'Recherche de votre position…';
    if (!('geolocation' in navigator)) {
      message.textContent =
        'Votre téléphone ne donne pas sa position. Parcourez les villes à la place.';
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        ici = { latitude: p.coords.latitude, longitude: p.coords.longitude };
        message.textContent =
          'Voici les écoles les plus proches. Votre position reste sur votre téléphone.';
        void montrer();
      },
      (erreur) => {
        message.textContent =
          erreur.code === erreur.PERMISSION_DENIED
            ? 'Vous avez refusé la position. Vous pouvez choisir une ville à la place.'
            : 'Votre position n’a pas pu être lue. Réessayez dehors, ou choisissez une ville.';
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
  rayon.addEventListener('change', () => void montrer());
  racine.dataset['pret'] = 'oui';
}
