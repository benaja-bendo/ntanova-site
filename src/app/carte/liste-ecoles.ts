/**
 * « Les écoles » dans le navigateur (lot 4 bis, version 46, 16/11/2026) : la recherche, les filtres pilotés par les
 * données et leurs compteurs, le tri, l'adresse partageable, « Afficher plus », le résultat vide et ses sorties ; la vue
 * Carte se charge à part (`liste-carte.ts`), au premier toucher de « Carte ».
 *
 * La page construite montre déjà les 20 premières écoles : ce script ne sert qu'à filtrer. Il lit `/recherche.json` (construit
 * avec le site) et ne parle à aucun autre serveur. La position n'est demandée qu'à l'appui d'« Autour de moi » ou de « Près de
 * moi » ; elle sert à compter et à classer, dans le téléphone, et n'est envoyée à personne.
 */
import { htmlCarteEcole } from '../../modele/carte-ecole';
import { htmlFiltres } from '../../modele/filtres-html';
import type { Point } from '../../modele/geo';
import {
  compterLesEcoles,
  ecrireEtat,
  filtrer,
  groupesAffiches,
  lireEtat,
  nombreDeFiltres,
  rayonsComptes,
  sortiesDuVide,
  titreDeLaListe,
  LIBELLES_DES_CYCLES,
  type EtatListe,
  type Groupe,
  type Trouvee,
} from '../../modele/liste-ecoles';
import type { LigneRecherche } from '../../modele/recherche';

/** 20 cartes, puis « Afficher plus » (décision du fondateur du 16/11). */
export const PAR_PAGE = 20;

type Carte = Awaited<ReturnType<typeof import('./liste-carte').ouvrirLaCarte>>;

export function demarrerListe(racine: HTMLElement): void {
  const $ = <T extends Element>(s: string) => racine.querySelector<T>(s);
  const titre = $<HTMLElement>('[data-titre]')!;
  const sousTitre = $<HTMLElement>('[data-sous-titre]')!;
  const champ = $<HTMLInputElement>('[data-recherche] input[name="q"]')!;
  const cartes = $<HTMLUListElement>('[data-cartes]')!;
  const plus = $<HTMLButtonElement>('[data-plus]')!;
  const affiche = $<HTMLElement>('[data-affiche]')!;
  const vide = $<HTMLElement>('[data-vide]')!;
  const panneau = $<HTMLElement>('[data-filtres]')!;
  const corps = $<HTMLElement>('[data-filtres-corps]')!;
  const voir = $<HTMLButtonElement>('[data-voir]')!;
  const puces = $<HTMLElement>('[data-puces]')!;
  const nombreFiltres = racine.querySelectorAll<HTMLElement>('[data-nombre-filtres]');
  const tri = $<HTMLSelectElement>('[data-tri]')!;
  const message = $<HTMLElement>('[data-message]')!;
  const zoneCarte = $<HTMLElement>('[data-zone-carte]')!;
  const domaines = new Map<string, string>(JSON.parse(racine.dataset.domaines ?? '[]'));

  let etat: EtatListe = lireEtat(new URLSearchParams(location.search));
  let lignes: LigneRecherche[] | null = null;
  let pres: Point | null = null;
  let montrees = PAR_PAGE;
  let trouvees: Trouvee[] = [];
  let carte: Carte | null = null;
  let chargementCarte: Promise<Carte> | null = null;

  const lire = async (): Promise<LigneRecherche[]> => {
    if (lignes) return lignes;
    const r = await fetch('/recherche.json');
    if (!r.ok) throw new Error(`recherche.json : HTTP ${r.status}`);
    lignes = (await r.json()) as LigneRecherche[];
    return lignes;
  };

  const ecrireAdresse = () =>
    history.replaceState(null, '', `${location.pathname}${ecrireEtat(etat)}${location.hash}`);

  function dessinerListe() {
    const tout = lignes!;
    const visibles = trouvees.slice(0, montrees);
    cartes.innerHTML = visibles
      .map(
        (t, i) =>
          `<li>${htmlCarteEcole(t.ligne, { forme: 'ligne', distanceM: t.distance, prioritaire: i < 2 })}</li>`,
      )
      .join('');
    const reste = trouvees.length - visibles.length;
    plus.hidden = reste <= 0;
    plus.textContent = `Afficher ${Math.min(reste, PAR_PAGE)} de plus`;
    affiche.hidden = trouvees.length === 0;
    affiche.textContent = `${visibles.length} sur ${compterLesEcoles(trouvees.length).replace(' écoles', '')} écoles affichées`;
    titre.textContent = titreDeLaListe(etat, tout);
    const confirmees = trouvees.filter((t) => t.ligne.v).length;
    sousTitre.textContent = [
      compterLesEcoles(trouvees.length),
      confirmees > 0 ? `${confirmees} confirmée${confirmees > 1 ? 's' : ''} par leur direction` : '',
      etat.tri === 'proches' && pres ? 'de la plus proche à la plus loin' : '',
    ]
      .filter(Boolean)
      .join(' · ');
    // Le résultat vide : chaque sortie dit combien d'écoles elle débloque, la plus utile d'abord.
    if (trouvees.length === 0) {
      const sorties = sortiesDuVide(tout, etat, pres, domaines);
      vide.hidden = false;
      vide.querySelector('[data-sorties]')!.innerHTML = sorties
        .map(
          (s, i) =>
            `<li><button type="button" class="bouton${i === 0 ? '' : ' bouton-secondaire'}" data-sortie="${i}">${s.libelle.replace(/[<>&]/g, '')} · ${compterLesEcoles(s.nombre)}</button></li>`,
        )
        .join('');
      (vide as HTMLElement & { sorties?: typeof sorties }).sorties = sorties;
    } else vide.hidden = true;
  }

  function dessinerFiltres() {
    const tout = lignes!;
    const groupes = groupesAffiches(tout, etat, pres, domaines);
    corps.innerHTML = htmlFiltres(groupes, etat, pres ? rayonsComptes(tout, etat, pres) : null);
    const n = nombreDeFiltres(etat);
    nombreFiltres.forEach((x) => {
      x.textContent = String(n);
      x.hidden = n === 0;
    });
    voir.textContent = trouvees.length === 0 ? 'Aucune école' : `Voir ${compterLesEcoles(trouvees.length)}`;
    // Les puces de la barre : les choix faits, qu'une touche retire ; sans ville choisie, les villes pour aller vite.
    const choisies: string[] = [];
    for (const g of groupes)
      for (const o of g.options.filter((x) => x.choisie))
        choisies.push(
          `<button type="button" class="pastille-choix puce-choisie" data-groupe="${g.groupe}" data-valeur="${o.valeur}" aria-pressed="true">${o.libelle} <span class="filtre-croix" aria-hidden="true">×</span><span class="visuellement-cache"> (retirer)</span></button>`,
        );
    if (etat.rayonM)
      choisies.push(
        `<button type="button" class="pastille-choix puce-choisie" data-rayon="${etat.rayonM}" aria-pressed="true">À ${etat.rayonM / 1000} km <span class="filtre-croix" aria-hidden="true">×</span></button>`,
      );
    if (etat.cadre)
      choisies.push(
        '<button type="button" class="pastille-choix puce-choisie" data-retirer-cadre aria-pressed="true">Zone de la carte <span class="filtre-croix" aria-hidden="true">×</span></button>',
      );
    const villes = groupes.find((g) => g.groupe === 'ville');
    const rapides =
      etat.choix.ville.length === 0 && villes
        ? villes.options.map(
            (o) =>
              `<button type="button" class="pastille-choix" data-groupe="ville" data-valeur="${o.valeur}" aria-pressed="false">${o.libelle} <span class="filtre-nombre">(${o.nombre})</span></button>`,
          )
        : [];
    const niveaux = groupes.find((g) => g.groupe === 'niveau');
    const rapidesNiveaux =
      etat.choix.niveau.length === 0 && niveaux
        ? niveaux.options.map(
            (o) =>
              `<button type="button" class="pastille-choix avec-disque" data-groupe="niveau" data-valeur="${o.valeur}" aria-pressed="false"><span class="disque disque-s c-${o.valeur}" aria-hidden="true">${o.valeur}</span>${LIBELLES_DES_CYCLES[o.valeur] ?? o.valeur}</button>`,
          )
        : [];
    puces.innerHTML = [...choisies, ...rapides, ...rapidesNiveaux].join('');
  }

  function calculer() {
    trouvees = filtrer(lignes!, etat, pres);
    if (etat.tri === 'proches' && !pres) tri.value = 'recentes';
    else tri.value = etat.tri;
  }

  async function appliquer(changement?: (e: EtatListe) => EtatListe, garderLaPage = false) {
    await lire();
    if (changement) etat = changement(etat);
    if (!garderLaPage) montrees = PAR_PAGE;
    calculer();
    dessinerListe();
    dessinerFiltres();
    ecrireAdresse();
    carte?.montrer(trouvees);
  }

  const basculer = (g: Groupe, v: string) =>
    appliquer((e) => {
      const deja = e.choix[g].includes(v);
      const suivant = { ...e, choix: { ...e.choix, [g]: deja ? e.choix[g].filter((x) => x !== v) : [...e.choix[g], v] } };
      // Changer de ville efface les arrondissements de l'autre.
      if (g === 'ville') suivant.choix.arrondissement = [];
      return suivant;
    });

  /** La position, demandée seulement sur ce geste ; un refus le dit et ne bloque rien (planche « position refusée »). */
  function demanderLaPosition(): Promise<Point | null> {
    if (pres) return Promise.resolve(pres);
    if (!('geolocation' in navigator)) {
      message.textContent = 'Ce navigateur ne donne pas la position. Choisissez une ville ou un arrondissement.';
      return Promise.resolve(null);
    }
    message.textContent = 'Recherche de votre position…';
    return new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (p) => {
          pres = { latitude: p.coords.latitude, longitude: p.coords.longitude };
          message.textContent = '';
          carte?.poserMaPosition(pres);
          resolve(pres);
        },
        () => {
          message.textContent =
            'Position refusée : la liste reste triée par écoles récemment vues. Choisissez une ville ou un arrondissement.';
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
      ),
    );
  }

  // La feuille « Filtres » : un panneau à part sur téléphone, une colonne fixe sur ordinateur.
  const ouvrir = () => {
    panneau.dataset.ouvert = '';
    document.body.classList.add('filtres-ouverts');
    panneau.querySelector<HTMLElement>('[data-fermer-filtres]')?.focus();
  };
  const fermer = () => {
    delete panneau.dataset.ouvert;
    document.body.classList.remove('filtres-ouverts');
  };

  racine.addEventListener('click', async (ev) => {
    const cible = (ev.target as HTMLElement).closest<HTMLElement>(
      '[data-groupe][data-valeur], [data-rayon], [data-sortie], [data-plus], [data-ouvrir-filtres], [data-fermer-filtres], [data-voir], [data-effacer], [data-vue], [data-retirer-cadre], [data-chercher-zone], [data-fond-filtres]',
    );
    if (!cible) return;
    if (cible.dataset.groupe && cible.dataset.valeur !== undefined)
      return void basculer(cible.dataset.groupe as Groupe, cible.dataset.valeur);
    if (cible.dataset.rayon) {
      const r = Number(cible.dataset.rayon);
      if (etat.rayonM === r) return void appliquer((e) => ({ ...e, rayonM: null }));
      const p = await demanderLaPosition();
      if (!p) return void appliquer();
      return void appliquer((e) => ({ ...e, rayonM: r, tri: 'proches' }));
    }
    if (cible.dataset.sortie !== undefined) {
      const s = (vide as HTMLElement & { sorties?: { etat: EtatListe }[] }).sorties?.[
        Number(cible.dataset.sortie)
      ];
      if (s) return void appliquer(() => ({ ...s.etat }));
      return;
    }
    if ('plus' in cible.dataset) {
      montrees += PAR_PAGE;
      return void appliquer(undefined, true);
    }
    if ('ouvrirFiltres' in cible.dataset) {
      await appliquer();
      return ouvrir();
    }
    if ('fermerFiltres' in cible.dataset || 'voir' in cible.dataset || 'fondFiltres' in cible.dataset)
      return fermer();
    if ('effacer' in cible.dataset)
      return void appliquer((e) => ({ ...lireEtat(new URLSearchParams()), tri: e.tri, vue: e.vue }));
    if ('retirerCadre' in cible.dataset) return void appliquer((e) => ({ ...e, cadre: null }));
    if ('chercherZone' in cible.dataset && carte) {
      const cadre = carte.cadre();
      carte.cacherChercher();
      return void appliquer((e) => ({ ...e, cadre }));
    }
    if (cible.dataset.vue) {
      ev.preventDefault();
      return void changerDeVue(cible.dataset.vue === 'carte' ? 'carte' : 'liste');
    }
  });

  panneau.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') fermer();
  });

  let minuteur = 0;
  champ.addEventListener('input', () => {
    window.clearTimeout(minuteur);
    minuteur = window.setTimeout(() => void appliquer((e) => ({ ...e, q: champ.value.trim() })), 150);
  });
  champ.form?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    champ.blur();
    void appliquer((e) => ({ ...e, q: champ.value.trim() }));
  });

  tri.addEventListener('change', async () => {
    const valeur = tri.value as EtatListe['tri'];
    if (valeur === 'proches' && !(await demanderLaPosition())) return void appliquer((e) => ({ ...e, tri: 'recentes' }));
    void appliquer((e) => ({ ...e, tri: valeur }));
  });

  // La vue Carte : le moteur ne se charge qu'au premier toucher de « Carte ».
  async function changerDeVue(vue: EtatListe['vue']) {
    etat = { ...etat, vue };
    racine.dataset.vueActuelle = vue;
    document.body.dataset.vue = vue;
    racine.querySelectorAll<HTMLElement>('.liste-vue[data-vue]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.vue === vue));
    });
    ecrireAdresse();
    if (vue !== 'carte') return;
    await lire();
    if (!trouvees.length && !nombreDeFiltres(etat) && !etat.q) calculer();
    chargementCarte ??= import('./liste-carte').then((m) =>
      m.ouvrirLaCarte({
        zone: zoneCarte,
        surChoix: (id) => montrerDansLaListe(id),
        position: () => pres,
      }),
    );
    try {
      carte = await chargementCarte;
      carte.montrer(trouvees);
    } catch (e) {
      console.error('carte :', e);
      zoneCarte.dataset.etat = 'echec';
    }
  }

  /** Une école touchée sur la carte : la liste défile jusqu'à elle (ordinateur) ; l'aperçu s'ouvre (téléphone, `liste-carte`). */
  function montrerDansLaListe(id: string) {
    const i = trouvees.findIndex((t) => t.ligne.i === id);
    if (i < 0) return;
    if (i >= montrees) {
      montrees = Math.ceil((i + 1) / PAR_PAGE) * PAR_PAGE;
      dessinerListe();
    }
    const lien = cartes.querySelector<HTMLElement>(`[data-ecole="${CSS.escape(id)}"]`);
    cartes.querySelectorAll('.carte-ecole-active').forEach((x) => x.classList.remove('carte-ecole-active'));
    lien?.classList.add('carte-ecole-active');
    lien?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Survoler une école de la liste allume son marqueur (ordinateur).
  cartes.addEventListener('pointerover', (ev) => {
    if (!carte || ev.pointerType !== 'mouse') return;
    const id = (ev.target as HTMLElement).closest<HTMLElement>('[data-ecole]')?.dataset.ecole ?? null;
    carte.allumer(id);
  });
  cartes.addEventListener('pointerleave', () => carte?.allumer(null));

  // Au départ : l'état de l'adresse s'applique s'il y en a un ; sinon la liste construite reste telle quelle, et le fichier ne
  // se lit qu'au premier geste.
  racine.dataset.pret = '';
  champ.value = etat.q;
  const avecEtat = location.search.length > 1;
  // `?ecole=<identifiant>` (l'ancien `/carte/?ecole=…`, le lien « Voir sur la carte » d'une fiche) : la vue Carte, l'école choisie.
  const ecoleDemandee = new URLSearchParams(location.search).get('ecole');
  if (avecEtat) {
    void appliquer().then(async () => {
      const demandee = ecoleDemandee
        ? lignes!.find((l) => l.i === ecoleDemandee || l.u.endsWith(`-${ecoleDemandee}/`))
        : undefined;
      if (etat.vue === 'carte' || demandee) {
        await changerDeVue('carte');
        if (demandee) carte?.choisir(demandee.i);
      }
    });
  } else {
    const premierGeste = () => void lire().then(() => {
      calculer();
      dessinerFiltres();
    });
    racine.addEventListener('pointerdown', premierGeste, { once: true });
    racine.addEventListener('focusin', premierGeste, { once: true });
  }
}
