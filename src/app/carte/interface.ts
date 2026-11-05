import { creerApercu, disque, element, icone } from './apercu';
import { montrerLEcoleChoisie } from './choisie';
import type { MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import type { FeatureEcole, FeatureZone } from '../../modele/carte/donnees';
import { adresseVue, lireVue, filtrerEcoles } from '../../modele/carte/navigation';
import { zoomMaxEn, type Fenetre } from '../../modele/carte/fond';
import { SOURCE_ECOLES, ZOOM_TRAME_EFFACEE } from '../../modele/carte/couches';
import {
  MESSAGES_DE_POSITION,
  dansLePays,
  messageDErreurDePosition,
  zoneVisibleAvecClavier,
} from '../../modele/carte/mobile';
import { chercher, type LigneRecherche } from '../../modele/recherche';

async function lire<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Lecture impossible : ${r.status}`);
  return r.json() as Promise<T>;
}
const cycleNiveau: Record<string, string> = {
  creche: 'M',
  maternelle: 'M',
  primaire: 'P',
  college: 'C',
  lycee: 'L',
  technique: 'T',
  superieur: 'S',
  autre_formation: 'S',
};
/** Un nombre et son nom, au pluriel quand il le faut : « 1 école », « 5 écoles ». */
const nombre = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
/** Les trois hauteurs du tiroir, de la plus basse à la plus haute. */
const HAUTEURS = ['petit', 'moyen', 'grand'] as const;

interface LigneDeListe {
  nom: string;
  lieu: string;
  url: string;
  /** L'école sur la carte, quand elle y est : la ligne la montre au lieu d'ouvrir sa fiche. */
  ecole?: FeatureEcole | undefined;
}

export async function installerInterface(
  racine: HTMLElement,
  carte: MapLibreMap,
): Promise<(p: FeatureEcole['properties']) => void> {
  const [data, zones] = await Promise.all([
    lire<{ features: FeatureEcole[] }>('/carte/ecoles.geojson'),
    lire<{ features: FeatureZone[] }>('/carte/zones.geojson'),
  ]);
  const panneau = racine.querySelector<HTMLElement>('.panneau-carte')!;
  const selection = racine.querySelector<HTMLElement>('[data-selection]')!;
  const resultats = racine.querySelector<HTMLElement>('[data-resultats]')!;
  const compte = racine.querySelector<HTMLElement>('[data-compte]')!;
  const note = racine.querySelector<HTMLElement>('#carte-note')!;
  const champ = racine.querySelector<HTMLInputElement>('[name=q]')!;
  const puces = racine.querySelectorAll<HTMLButtonElement>('[data-cycle]');
  const zone = racine.querySelector<HTMLElement>('[data-zone]')!;
  const poignee = racine.querySelector<HTMLButtonElement>('[data-poignee]')!;
  // La légende des zones existe deux fois : sur la carte (ordinateur) et dans le tiroir (téléphone, une ligne). Une seule
  // est affichée selon la largeur ; les deux disent la même chose.
  const legendes = racine.querySelectorAll<HTMLElement>('.legende-carte, .legende-tiroir');
  let choisie: FeatureEcole | undefined;
  let retourFocus: HTMLElement | null = null;
  let catalogue: LigneRecherche[] | null = null;
  let cycle = '';
  let recherche = '';
  let generation = 0;
  let privee = false;
  let restaure = false;
  let initialisation = true;
  const adresseInitiale = new URL(location.href);
  const reduit = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const surTelephone = () => !window.matchMedia('(min-width: 64rem)').matches;
  const hauteur = (h: string) => {
    panneau.dataset.hauteur = h;
    racine.dataset.hauteur = h;
    panneau.scrollTop = 0;
    poignee.setAttribute('aria-expanded', String(h !== 'petit'));
  };
  /**
   * La marge de la carte : ce que le panneau ou le tiroir couvre. Sur téléphone, le tiroir bas et une école choisie
   * prennent la hauteur de leur contenu : la carte centre ce qu'elle montre dans ce qui reste visible, jamais derrière.
   */
  function marges() {
    return surTelephone()
      ? {
          top: 64,
          bottom:
            choisie || panneau.dataset.hauteur === 'petit'
              ? Math.round(panneau.offsetHeight) + 12
              : 176,
          left: 12,
          right: 12,
        }
      : { left: 420, top: 76, bottom: 24, right: 24 };
  }
  // Le fond de carte ne répond pas (le serveur de tuiles, le réseau) : la carte est presque vide, la liste est ce qui reste.
  // Le tiroir s'ouvre à moitié pour la montrer, comme le message le promet (« les écoles restent dans la liste »).
  const conteneur = racine.querySelector<HTMLElement>('#carte')!;
  function listeSansFond() {
    if (conteneur.dataset.fond !== 'absent' || choisie || panneau.dataset.hauteur !== 'petit')
      return;
    hauteur('moyen');
    geometrie(true);
  }
  new MutationObserver(listeSansFond).observe(conteneur, {
    attributes: true,
    attributeFilter: ['data-fond'],
  });
  // La hauteur du tiroir, lue par la feuille de style : le bouton « Ma position » et l'attribution se posent juste au-dessus
  // de lui, quelle que soit sa hauteur (contenu, moitié ou presque tout l'écran), au lieu d'une hauteur supposée.
  new ResizeObserver(() => {
    racine.style.setProperty('--tiroir-h', `${Math.round(panneau.offsetHeight)}px`);
    if (surTelephone() && !choisie && panneau.dataset.hauteur === 'petit')
      carte.setPadding(marges());
  }).observe(panneau);
  // Un message discret sur la carte : il s'efface seul quand la situation n'est pas durable (une position refusée).
  let minuterie = 0;
  function annoncer(texte: string, effacerApres = 0) {
    clearTimeout(minuterie);
    note.textContent = texte;
    if (effacerApres)
      minuterie = window.setTimeout(() => {
        if (note.textContent === texte) note.textContent = '';
      }, effacerApres);
  }
  function geometrie(animer = false) {
    if (animer) carte.easeTo({ padding: marges(), duration: reduit() ? 0 : 200 });
    else carte.setPadding(marges());
    carte.resize();
  }
  function vue() {
    const c = carte.getCenter();
    return { zoom: carte.getZoom(), latitude: c.lat, longitude: c.lng };
  }
  function url(ecole?: FeatureEcole | undefined) {
    const u = new URL(location.href);
    if (ecole) u.searchParams.set('ecole', ecole.properties.lien);
    else u.searchParams.delete('ecole');
    if (!privee) u.hash = adresseVue(vue());
    else u.hash = '';
    return u;
  }
  function recadrer(e: FeatureEcole) {
    privee = false;
    const [x, y] = e.geometry.coordinates;
    carte.setMaxZoom(zoomMaxEn(x, y));
    carte.easeTo({
      center: [x, y],
      zoom: Math.min(15, zoomMaxEn(x, y)),
      padding: marges(),
      duration: reduit() ? 0 : 300,
    });
  }
  function fermer(historique = true) {
    selection.replaceChildren();
    choisie = undefined;
    montrerLEcoleChoisie(carte, undefined);
    if (historique && history.state?.ntanovaApercu) history.back();
    else if (historique) history.replaceState(null, '', url());
    // À l'ouverture d'une adresse partagée, personne n'a rien demandé : le tiroir reste bas et le focus ne bouge pas.
    if (initialisation) return;
    hauteur('moyen');
    geometrie(true);
    // Sur téléphone, rendre le focus au champ de recherche ferait surgir le clavier : on le rend à la poignée.
    (retourFocus?.isConnected ? retourFocus : surTelephone() ? poignee : champ).focus({
      preventScroll: true,
    });
  }
  function choisir(e: FeatureEcole, historique = true, centrer = true) {
    retourFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    choisie = e;
    selection.replaceChildren();
    const bloc = creerApercu(e.properties, e.geometry.coordinates, () => fermer());
    selection.append(bloc);
    hauteur('moyen');
    // L'historique d'abord : un déplacement de caméra qui n'a rien à bouger se termine aussitôt, et son « moveend »
    // réécrirait l'entrée courante avant que la nouvelle soit ajoutée (le retour rouvrirait alors la même école).
    if (historique) {
      if (history.state?.ntanovaApercu) history.replaceState({ ntanovaApercu: true }, '', url(e));
      else history.pushState({ ntanovaApercu: true }, '', url(e));
    }
    montrerLEcoleChoisie(carte, e);
    if (centrer) recadrer(e);
    else geometrie(true);
    bloc.focus({ preventScroll: true });
  }
  /** Une ligne de la liste : une école de la carte se montre sur la carte ; une école seulement dans le catalogue ouvre sa fiche. */
  function ligne(r: LigneDeListe): HTMLLIElement {
    const li = document.createElement('li');
    const corps = element('span', 'ligne-corps');
    if (r.ecole) {
      const p = r.ecole.properties;
      corps.append(
        element('span', 'ligne-nom', p.nom),
        element('span', 'ligne-sous', [...p.niveaux, p.type].filter(Boolean).join(' · ')),
        element('span', 'ligne-sous', p.lieu),
      );
      const bouton = element('button', 'ligne-ecole');
      bouton.type = 'button';
      bouton.append(disque(p.lettre, 'disque-l'), corps, icone('suite', false));
      bouton.onclick = () => choisir(r.ecole!);
      li.append(bouton);
      return li;
    }
    corps.append(
      element('span', 'ligne-nom', r.nom),
      element('span', 'ligne-sous', r.lieu),
      element('span', 'etiquette-vide', 'Pas encore sur la carte'),
    );
    const lien = element('a', 'ligne-ecole');
    lien.href = r.url;
    const vide = disque(null, 'disque-l disque-vide');
    vide.textContent = '–';
    lien.append(vide, corps, icone('suite', false));
    li.append(lien);
    return li;
  }
  function montrerLignes(lignes: LigneDeListe[], titre: string, aucune: string) {
    resultats.replaceChildren();
    compte.textContent = lignes.length ? titre : aucune;
    for (const r of lignes.slice(0, 100)) resultats.append(ligne(r));
    if (!lignes.length)
      resultats.append(
        element(
          'li',
          'ligne-vide',
          recherche
            ? 'Essayez un autre nom, ou la recherche complète.'
            : 'Déplacez ou agrandissez la carte pour voir d’autres écoles.',
        ),
      );
    if (lignes.length > 100)
      resultats.append(
        element(
          'li',
          'ligne-vide',
          'Les 100 premiers résultats sont affichés. Précisez votre recherche.',
        ),
      );
  }
  /** La zone sous le centre de la carte : son état se lit ici et dans la légende, jamais écrit sur chaque quartier. */
  function dire(z: FeatureZone | undefined) {
    zone.replaceChildren();
    if (!z) {
      zone.textContent =
        'Explorez les écoles du Congo-Brazzaville. Une zone vide ne signifie pas qu’il n’y a pas d’école.';
      return;
    }
    const etat = element(
      'span',
      `etiquette-zone etiquette-zone-${z.properties.etat}`,
      `${z.properties.nom} · ${z.properties.libelle}`,
    );
    zone.append('Vous regardez ', etat);
  }
  /** De loin, les deux états ; de près, seulement celui de la zone qu'on regarde (la trame s'est effacée). */
  function legender(z: FeatureZone | undefined) {
    const dePres = carte.getZoom() >= ZOOM_TRAME_EFFACEE - 0.5;
    legendes.forEach((legende) => {
      legende.hidden = dePres && !z;
      legende
        .querySelectorAll<HTMLElement>('[data-legende]')
        .forEach((l) => (l.hidden = dePres && l.dataset.legende !== z?.properties.etat));
    });
  }
  async function actualiser() {
    const tour = ++generation;
    const b = carte.getBounds();
    const boite = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] as Fenetre;
    // Le premier « moveend » peut arriver avant que le style ait posé ses couches : on n'interroge que celles qui existent.
    const couchesDeZone = ['zones-fond-actif', 'zones-fond-programme'].filter((id) =>
      carte.getLayer(id),
    );
    const sousLeCentre = couchesDeZone.length
      ? carte.queryRenderedFeatures(carte.project(carte.getCenter()), { layers: couchesDeZone })
      : [];
    const z = zones.features.find(
      (f) =>
        f.properties.genre === 'zone' &&
        sousLeCentre.some((v) => v.properties.slug === f.properties.slug),
    );
    dire(z);
    legender(z);
    if (recherche) {
      try {
        catalogue ??= await lire<LigneRecherche[]>('/recherche.json');
        if (tour !== generation) return;
        const trouves = chercher(catalogue, { texte: recherche })
          .map((r) => r.ligne)
          .filter((l) => !cycle || l.c.some((n) => cycleNiveau[n] === cycle));
        montrerLignes(
          trouves.map((l) => ({
            nom: [l.n, l.e].filter(Boolean).join(' · '),
            lieu: l.d,
            url: l.u,
            ecole: data.features.find((e) => e.properties.lien === l.u),
          })),
          `${nombre(trouves.length, 'résultat', 'résultats')} pour « ${recherche} »`,
          'Aucun résultat',
        );
      } catch {
        if (tour === generation) {
          compte.textContent =
            'La recherche ne se charge pas. Réessayez ou ouvrez la recherche complète.';
          catalogue = null;
        }
      }
      return;
    }
    const dedans = filtrerEcoles(data.features, cycle, boite);
    montrerLignes(
      dedans.map((e) => ({
        nom: e.properties.nom,
        lieu: e.properties.lieu,
        url: e.properties.lien,
        ecole: e,
      })),
      `${nombre(dedans.length, 'école', 'écoles')} dans cette vue`,
      'Aucune école dans cette vue',
    );
  }
  function activer() {
    racine.dataset.active = 'oui';
    conteneur.dataset.etat = 'prete';
    racine
      .querySelectorAll<HTMLElement>(
        '.rangee-puces,.recherche-carte,[data-poignee],[data-position],.ecole-manque',
      )
      .forEach((e) => (e.hidden = false));
    hauteur('petit');
    geometrie();
    listeSansFond();
    if (adresseInitiale.hash || adresseInitiale.searchParams.has('ecole'))
      restaurer(adresseInitiale);
    initialisation = false;
    void actualiser();
  }
  if (carte.loaded()) activer();
  else carte.once('idle', activer);

  // La poignée : un appui ouvre ou referme la liste ; un geste vers le haut ou vers le bas change de hauteur d'un cran.
  let departY: number | null = null;
  let glisse = false;
  poignee.addEventListener('pointerdown', (e) => {
    departY = e.clientY;
    glisse = false;
  });
  poignee.addEventListener('pointerup', (e) => {
    if (departY === null) return;
    const ecart = e.clientY - departY;
    departY = null;
    if (Math.abs(ecart) < 24) return;
    glisse = true;
    const i = HAUTEURS.indexOf((panneau.dataset.hauteur ?? 'petit') as (typeof HAUTEURS)[number]);
    hauteur(HAUTEURS[Math.max(0, Math.min(HAUTEURS.length - 1, i + (ecart < 0 ? 1 : -1)))]!);
    if (panneau.dataset.hauteur !== 'grand') champ.blur();
    geometrie(true);
  });
  poignee.addEventListener('pointercancel', () => (departY = null));
  poignee.addEventListener('click', () => {
    if (glisse) {
      glisse = false;
      return;
    }
    hauteur(panneau.dataset.hauteur === 'petit' ? 'moyen' : 'petit');
    // Replier le tiroir referme aussi le clavier : Safari ne retire pas le focus d'un champ quand on touche un bouton.
    if (panneau.dataset.hauteur === 'petit') champ.blur();
    geometrie(true);
  });
  // Toucher la recherche sur téléphone ouvre le tiroir en grand : le champ est en haut du tiroir, donc il reste au-dessus
  // du clavier, et les résultats ont la place d'apparaître pendant qu'on tape.
  champ.addEventListener('focus', () => {
    if (!surTelephone() || panneau.dataset.hauteur === 'grand') return;
    hauteur('grand');
    geometrie(true);
  });
  racine.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    recherche = champ.value.trim();
    hauteur('grand');
    // Le clavier se referme : les résultats prennent tout le tiroir.
    if (surTelephone()) champ.blur();
    void actualiser();
  });
  champ.addEventListener('input', () => {
    if (!champ.value) {
      recherche = '';
      void actualiser();
    }
  });
  puces.forEach((puce) => {
    puce.onclick = () => {
      // Toucher la puce déjà choisie revient à « Tous ».
      cycle = puce.getAttribute('aria-pressed') === 'true' ? '' : (puce.dataset.cycle ?? '');
      puces.forEach((p) =>
        p.setAttribute('aria-pressed', String((p.dataset.cycle ?? '') === cycle)),
      );
      const src = carte.getSource(SOURCE_ECOLES) as GeoJSONSource;
      src.setData({ type: 'FeatureCollection', features: filtrerEcoles(data.features, cycle) });
      if (choisie && !filtrerEcoles([choisie], cycle).length) fermer();
      void actualiser();
    };
  });
  carte.on('moveend', () => {
    void actualiser();
    if (!restaure && !initialisation) history.replaceState(history.state, '', url(choisie));
  });
  window.addEventListener('resize', () => geometrie());
  // Le clavier d'un téléphone ne change pas la hauteur de la page : il recouvre le bas de l'écran, et le navigateur fait
  // glisser la page pour montrer le champ, ce qui fait sauter la mise en page. Quand il est ouvert, la carte et le tiroir
  // prennent exactement la partie de l'écran qui reste visible (`data-clavier`, voir la feuille de style).
  const ecran = window.visualViewport;
  if (ecran) {
    let image = 0;
    let derniere = '';
    const suivre = () => {
      image = 0;
      const vue = surTelephone() ? zoneVisibleAvecClavier(window.innerHeight, ecran) : null;
      const cle = vue ? `${vue.haut}/${vue.hauteur}` : '';
      if (cle === derniere) return;
      derniere = cle;
      if (vue) {
        racine.style.setProperty('--vv-haut', `${vue.haut}px`);
        racine.style.setProperty('--vv-hauteur', `${vue.hauteur}px`);
        racine.dataset.clavier = 'oui';
      } else {
        racine.style.removeProperty('--vv-haut');
        racine.style.removeProperty('--vv-hauteur');
        delete racine.dataset.clavier;
      }
      geometrie();
    };
    const planifier = () => (image ||= requestAnimationFrame(suivre));
    ecran.addEventListener('resize', planifier);
    ecran.addEventListener('scroll', planifier);
  }
  panneau.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (choisie) fermer();
      else {
        hauteur('petit');
        champ.blur();
        geometrie(true);
      }
    }
  });
  function restaurer(adresse = new URL(location.href)) {
    restaure = true;
    const v = lireVue(adresse.hash);
    const e = data.features.find((e) => e.properties.lien === adresse.searchParams.get('ecole'));
    if (v) {
      privee = false;
      carte.setMaxZoom(zoomMaxEn(v.longitude, v.latitude));
      carte.jumpTo({ center: [v.longitude, v.latitude], zoom: v.zoom });
    }
    if (e) choisir(e, false, !v);
    else {
      fermer(false);
      if (adresse.searchParams.has('ecole'))
        note.textContent =
          'Cette école n’est plus disponible sur la carte. Consultez la liste ou recherchez son nom.';
    }
    restaure = false;
  }
  window.addEventListener('popstate', () => restaurer());
  window.addEventListener('hashchange', () => restaurer());
  const position = racine.querySelector<HTMLButtonElement>('[data-position]')!;
  position.onclick = () => {
    if (!navigator.geolocation) {
      annoncer(MESSAGES_DE_POSITION.absente, 9000);
      return;
    }
    // Sans https, le navigateur refuse la position avant même de la demander (iPhone en http sur le réseau local, par
    // exemple) : on le dit, au lieu de laisser le bouton muet.
    if (!window.isSecureContext) {
      annoncer(MESSAGES_DE_POSITION.nonSecurisee, 9000);
      return;
    }
    racine.querySelector<HTMLElement>('.confidentialite-position')!.hidden = false;
    position.disabled = true;
    annoncer(MESSAGES_DE_POSITION.enCours);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        position.disabled = false;
        const { longitude: x, latitude: y } = p.coords;
        // Hors du pays (le fondateur testant depuis la France, la diaspora) : la carte ne bouge pas, elle ne se vide pas.
        if (!dansLePays(x, y)) {
          annoncer(MESSAGES_DE_POSITION.horsDuPays, 9000);
          return;
        }
        privee = true;
        history.replaceState(null, '', location.pathname);
        selection.replaceChildren();
        choisie = undefined;
        montrerLEcoleChoisie(carte, undefined);
        carte.setMaxZoom(zoomMaxEn(x, y));
        carte.easeTo({
          center: [x, y],
          zoom: Math.min(13, zoomMaxEn(x, y)),
          padding: marges(),
          duration: reduit() ? 0 : 300,
        });
        annoncer(MESSAGES_DE_POSITION.situee, 9000);
      },
      (erreur) => {
        position.disabled = false;
        annoncer(messageDErreurDePosition(erreur.code), 9000);
      },
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false },
    );
  };
  return (p) => {
    const e = data.features.find((e) => e.properties.id === p.id);
    if (e) choisir(e);
  };
}
