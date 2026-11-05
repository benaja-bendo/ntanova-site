import { creerApercu, disque, element, icone } from './apercu';
import { montrerLEcoleChoisie } from './choisie';
import type { MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import type { FeatureEcole, FeatureZone } from '../../modele/carte/donnees';
import { adresseVue, lireVue, filtrerEcoles } from '../../modele/carte/navigation';
import { zoomMaxEn, BOITE_DU_PAYS, type Fenetre } from '../../modele/carte/fond';
import { SOURCE_ECOLES, ZOOM_TRAME_EFFACEE } from '../../modele/carte/couches';
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
  const legende = racine.querySelector<HTMLElement>('.legende-carte')!;
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
  const hauteur = (h: string) => {
    panneau.dataset.hauteur = h;
    racine.dataset.hauteur = h;
    panneau.scrollTop = 0;
    poignee.setAttribute('aria-expanded', String(h !== 'petit'));
  };
  /**
   * La marge de la carte : ce que le panneau ou le tiroir couvre. Sur téléphone, une école choisie prend la hauteur de sa
   * fiche : la carte la centre dans ce qui reste visible, jamais derrière la fiche.
   */
  function marges() {
    const mobile = !window.matchMedia('(min-width: 64rem)').matches;
    return mobile
      ? {
          top: 64,
          bottom: choisie ? Math.round(panneau.offsetHeight) + 12 : 176,
          left: 12,
          right: 12,
        }
      : { left: 420, top: 76, bottom: 24, right: 24 };
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
    (retourFocus?.isConnected ? retourFocus : champ).focus({ preventScroll: true });
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
    legende.hidden = dePres && !z;
    legende
      .querySelectorAll<HTMLElement>('[data-legende]')
      .forEach((l) => (l.hidden = dePres && l.dataset.legende !== z?.properties.etat));
  }
  async function actualiser() {
    const tour = ++generation;
    const b = carte.getBounds();
    const boite = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] as Fenetre;
    const sousLeCentre = carte.queryRenderedFeatures(carte.project(carte.getCenter()), {
      layers: ['zones-fond-actif', 'zones-fond-programme'],
    });
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
    racine.querySelector<HTMLElement>('#carte')!.dataset.etat = 'prete';
    racine
      .querySelectorAll<HTMLElement>(
        '.rangee-puces,.recherche-carte,[data-poignee],[data-position],.ecole-manque',
      )
      .forEach((e) => (e.hidden = false));
    hauteur('petit');
    geometrie();
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
    geometrie(true);
  });
  poignee.addEventListener('pointercancel', () => (departY = null));
  poignee.addEventListener('click', () => {
    if (glisse) {
      glisse = false;
      return;
    }
    hauteur(panneau.dataset.hauteur === 'petit' ? 'moyen' : 'petit');
    geometrie(true);
  });
  racine.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    recherche = champ.value.trim();
    hauteur('grand');
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
  panneau.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (choisie) fermer();
      else {
        hauteur('petit');
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
    racine.querySelector<HTMLElement>('.confidentialite-position')!.hidden = false;
    if (!navigator.geolocation) {
      note.textContent =
        'La position n’est pas disponible. Cherchez une école ou déplacez la carte.';
      return;
    }
    position.disabled = true;
    note.textContent = 'Recherche de votre position…';
    navigator.geolocation.getCurrentPosition(
      (p) => {
        position.disabled = false;
        const { longitude: x, latitude: y } = p.coords;
        if (
          x < BOITE_DU_PAYS[0] ||
          x > BOITE_DU_PAYS[2] ||
          y < BOITE_DU_PAYS[1] ||
          y > BOITE_DU_PAYS[3]
        ) {
          note.textContent =
            'Votre position est hors de la zone de la carte. Explorez le Congo ou cherchez une école.';
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
        note.textContent = 'Vous êtes situé sur la carte. NTanova ne conserve pas votre position.';
      },
      () => {
        position.disabled = false;
        note.textContent =
          'La position n’a pas pu être obtenue. La recherche et la carte restent disponibles.';
      },
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false },
    );
  };
  return (p) => {
    const e = data.features.find((e) => e.properties.id === p.id);
    if (e) choisir(e);
  };
}
