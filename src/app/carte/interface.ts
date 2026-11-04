import type { MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import type { FeatureEcole, FeatureZone } from '../../modele/carte/donnees';
import { adresseVue, lireVue, filtrerEcoles } from '../../modele/carte/navigation';
import { zoomMaxEn, BOITE_DU_PAYS, type Fenetre } from '../../modele/carte/fond';
import { SOURCE_ECOLES } from '../../modele/carte/couches';
import { chercher, type LigneRecherche } from '../../modele/recherche';

async function lire<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Lecture impossible : ${r.status}`);
  return r.json() as Promise<T>;
}
const date = (s: string) =>
  new Intl.DateTimeFormat('fr', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Brazzaville',
  }).format(new Date(s));
const texte = (tag: string, contenu: string) => {
  const e = document.createElement(tag);
  e.textContent = contenu;
  return e;
};
const lien = (titre: string, url: string) => {
  const a = document.createElement('a');
  a.textContent = titre;
  a.href = url;
  return a;
};
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
  const cycle = racine.querySelector<HTMLSelectElement>('[data-cycle]')!;
  const zone = racine.querySelector<HTMLElement>('[data-zone]')!;
  const tiroir = racine.querySelector<HTMLButtonElement>('[data-tiroir=moyen]')!;
  let choisie: FeatureEcole | undefined;
  let retourFocus: HTMLElement | null = null;
  let catalogue: LigneRecherche[] | null = null;
  let recherche = '';
  let generation = 0;
  let privee = false;
  let restaure = false;
  let initialisation = true;
  const adresseInitiale = new URL(location.href);
  const reduit = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hauteur = (h: string) => {
    panneau.dataset.hauteur = h;
    panneau.scrollTop = 0;
    tiroir.setAttribute('aria-expanded', String(h !== 'petit'));
  };
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
      duration: reduit() ? 0 : 300,
    });
  }
  function fermer(historique = true) {
    selection.replaceChildren();
    choisie = undefined;
    if (historique && history.state?.ntanovaApercu) history.back();
    else if (historique) history.replaceState(null, '', url());
    hauteur('moyen');
    (retourFocus?.isConnected ? retourFocus : champ).focus({ preventScroll: true });
  }
  function choisir(e: FeatureEcole, historique = true, centrer = true) {
    retourFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    choisie = e;
    if (centrer) recadrer(e);
    hauteur('moyen');
    selection.replaceChildren();
    const bloc = document.createElement('div');
    bloc.className = 'carte-apercu';
    bloc.tabIndex = -1;
    const nom = texte('p', e.properties.nom);
    nom.className = 'carte-apercu-nom';
    bloc.append(nom);
    if (e.properties.passage)
      bloc.append(texte('p', `Vue sur place le ${date(e.properties.passage)}`));
    if (e.properties.confirmation)
      bloc.append(texte('p', `Confirmée par la direction le ${date(e.properties.confirmation)}`));
    if (!e.properties.passage && !e.properties.confirmation)
      bloc.append(texte('p', e.properties.preuveTexte));
    bloc.append(
      texte('p', e.properties.niveaux.join(' · ')),
      texte(
        'p',
        [e.properties.type, e.properties.lieu, e.properties.repere].filter(Boolean).join(' · '),
      ),
    );
    const actions = document.createElement('div');
    actions.className = 'carte-apercu-actions';
    actions.append(lien('Voir la fiche', e.properties.lien));
    const [x, y] = e.geometry.coordinates;
    actions.append(lien('Y aller', `https://www.google.com/maps/dir/?api=1&destination=${y},${x}`));
    const partage = new URL('/carte/', location.origin);
    partage.searchParams.set('ecole', e.properties.lien);
    partage.hash = adresseVue({ zoom: Math.min(15, zoomMaxEn(x, y)), latitude: y, longitude: x });
    actions.append(
      lien(
        'Partager sur WhatsApp',
        `https://wa.me/?text=${encodeURIComponent(e.properties.nom + ' · ' + partage.href)}`,
      ),
    );
    bloc.append(actions);
    const fermerBouton = document.createElement('button');
    fermerBouton.type = 'button';
    fermerBouton.className = 'maplibregl-popup-close-button';
    fermerBouton.setAttribute('aria-label', 'Fermer l’aperçu');
    fermerBouton.textContent = '×';
    fermerBouton.onclick = () => fermer();
    bloc.append(fermerBouton);
    selection.append(bloc);
    bloc.focus({ preventScroll: true });
    if (historique) {
      if (history.state?.ntanovaApercu) history.replaceState({ ntanovaApercu: true }, '', url(e));
      else history.pushState({ ntanovaApercu: true }, '', url(e));
    }
  }
  function montrerLignes(
    lignes: { nom: string; lieu: string; url: string; ecole?: FeatureEcole | undefined }[],
    titre: string,
  ) {
    resultats.replaceChildren();
    compte.textContent = `${lignes.length} ${titre}`;
    for (const r of lignes.slice(0, 100)) {
      const li = document.createElement('li');
      li.append(lien(r.nom, r.url), texte('p', r.lieu));
      if (r.ecole) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = 'Voir sur la carte';
        b.onclick = () => choisir(r.ecole!);
        li.append(b);
      } else
        li.append(
          texte('p', 'Cette école est dans la liste ; elle n’est pas encore visible sur la carte.'),
        );
      resultats.append(li);
    }
    if (!lignes.length)
      resultats.append(
        texte(
          'li',
          recherche
            ? 'Aucun résultat. Essayez un autre nom ou la recherche complète.'
            : 'Aucune école vue ici pour le moment.',
        ),
      );
    if (lignes.length > 100)
      resultats.append(
        texte('li', 'Les 100 premiers résultats sont affichés. Précisez votre recherche.'),
      );
  }
  async function actualiser() {
    const tour = ++generation;
    const b = carte.getBounds();
    const boite = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] as Fenetre;
    if (recherche) {
      try {
        catalogue ??= await lire<LigneRecherche[]>('/recherche.json');
        if (tour !== generation) return;
        const trouves = chercher(catalogue, { texte: recherche })
          .map((r) => r.ligne)
          .filter((l) => !cycle.value || l.c.some((n) => cycleNiveau[n] === cycle.value));
        montrerLignes(
          trouves.map((l) => ({
            nom: [l.n, l.e].filter(Boolean).join(' · '),
            lieu: l.d,
            url: l.u,
            ecole: data.features.find((e) => e.properties.lien === l.u),
          })),
          'résultat(s) dans le catalogue',
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
    const dedans = filtrerEcoles(data.features, cycle.value, boite);
    montrerLignes(
      dedans.map((e) => ({
        nom: e.properties.nom,
        lieu: e.properties.lieu,
        url: e.properties.lien,
        ecole: e,
      })),
      'école(s) dans cette vue',
    );
    const sousLeCentre = carte.queryRenderedFeatures(carte.project(carte.getCenter()), {
      layers: ['zones-fond-actif', 'zones-fond-programme'],
    });
    const z = zones.features.find(
      (f) =>
        f.properties.genre === 'zone' &&
        sousLeCentre.some((v) => v.properties.slug === f.properties.slug),
    );
    zone.textContent = z
      ? `${z.properties.nom} · ${z.properties.libelle} · ${z.properties.vues} école(s) vue(s) sur place · ${z.properties.confirmees} confirmée(s)${z.properties.dernierPassage ? ' · Dernier passage le ' + date(z.properties.dernierPassage) : ''}`
      : 'Explorez les écoles du Congo-Brazzaville. Une zone vide ne signifie pas qu’il n’y a pas d’école.';
  }
  const geometrie = () => {
    const mobile = !window.matchMedia('(min-width: 64rem)').matches;
    carte.setPadding(
      mobile
        ? { top: 76, bottom: 176, left: 12, right: 12 }
        : { left: 400, top: 76, bottom: 24, right: 24 },
    );
    carte.resize();
  };
  function activer() {
    racine.dataset.active = 'oui';
    racine.querySelector<HTMLElement>('#carte')!.dataset.etat = 'prete';
    racine
      .querySelectorAll<HTMLElement>('.outils-carte,.recherche-carte,.commandes-tiroir')
      .forEach((e) => (e.hidden = false));
    geometrie();
    if (adresseInitiale.hash || adresseInitiale.searchParams.has('ecole'))
      restaurer(adresseInitiale);
    initialisation = false;
    void actualiser();
  }
  if (carte.loaded()) activer();
  else carte.once('idle', activer);
  racine
    .querySelectorAll<HTMLButtonElement>('[data-tiroir]')
    .forEach((b) => (b.onclick = () => hauteur(b.dataset.tiroir!)));
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
  cycle.onchange = () => {
    const src = carte.getSource(SOURCE_ECOLES) as GeoJSONSource;
    src.setData({ type: 'FeatureCollection', features: filtrerEcoles(data.features, cycle.value) });
    if (choisie && !filtrerEcoles([choisie], cycle.value).length) fermer();
    void actualiser();
  };
  carte.on('moveend', () => {
    void actualiser();
    if (!restaure && !initialisation) history.replaceState(history.state, '', url(choisie));
  });
  window.addEventListener('resize', geometrie);
  panneau.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (choisie) fermer();
      else hauteur('petit');
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
        carte.setMaxZoom(zoomMaxEn(x, y));
        carte.easeTo({
          center: [x, y],
          zoom: Math.min(13, zoomMaxEn(x, y)),
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
