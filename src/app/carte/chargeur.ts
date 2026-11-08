import { adresseVue } from '../../modele/carte/navigation';
import {
  ATTENTE_DE_LA_CARTE,
  modeDeChargement,
  resteDuSigne,
  type Connexion,
} from '../../modele/carte/chargement';
import { ADRESSE_DES_TUILES, type Fenetre } from '../../modele/carte/fond';

/** Les états où la carte est attendue : le signe (les trois barres) peut paraître. */
const EN_ATTENTE = ['repli', 'chargement'];

/**
 * Le signe d'attente paraît de lui-même, par le CSS d'`ExplorateurCarte`, 0,4 s après le début de l'attente (`debut`, en
 * millisecondes depuis l'ouverture de la page). Si la carte arrive juste après, il reste au moins 0,5 s
 * (`data-signe="garde"`) : il ne clignote pas.
 */
function garderLeSigne(conteneur: HTMLElement, debut: number): void {
  const observateur = new MutationObserver(() => {
    if (EN_ATTENTE.includes(conteneur.dataset.etat ?? '')) return;
    observateur.disconnect();
    const maintenant = performance.now();
    const paruA = debut + ATTENTE_DE_LA_CARTE.avantLeSigne;
    const reste = maintenant >= paruA ? resteDuSigne(paruA, maintenant) : 0;
    if (reste <= 0) return;
    conteneur.dataset.signe = 'garde';
    window.setTimeout(() => delete conteneur.dataset.signe, reste);
  });
  observateur.observe(conteneur, { attributes: true, attributeFilter: ['data-etat'] });
}

/** Le premier affichage de la page, quand le navigateur le dit : c'est là que l'attente commence pour le CSS. */
const premierAffichage = (): number =>
  performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint')
    ?.startTime ?? 0;

export function initialiserCartes(): void {
  const racine = document.querySelector<HTMLElement>('[data-carte-page]');
  if (!racine) return;
  const conteneur = racine.querySelector<HTMLElement>('#carte');
  const toile = racine.querySelector<HTMLElement>('#carte-toile');
  const note = racine.querySelector<HTMLElement>('#carte-note');
  const bouton = racine.querySelector<HTMLButtonElement>('.activer-carte');
  if (!conteneur || !toile) return;
  const application = racine.dataset.cartePage === 'carte';
  let lance = false;
  const dire = (texte: string) => {
    if (note) note.textContent = texte;
  };
  async function lancer() {
    if (lance) return;
    lance = true;
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = document.createElement('canvas').getContext('webgl2');
    } catch {
      /* Le repli reste lisible. */
    }
    if (!gl) {
      conteneur!.dataset.etat = 'repli-sans-webgl2';
      dire(
        application
          ? 'La carte interactive n’est pas disponible sur cet appareil. La liste ci-dessous donne les mêmes écoles.'
          : 'La carte interactive n’est pas disponible sur cet appareil. Le dessin et les listes d’écoles restent accessibles.',
      );
      return;
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (bouton) bouton.hidden = true;
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = new URL(ADRESSE_DES_TUILES).origin;
    preconnect.crossOrigin = '';
    document.head.append(preconnect);
    conteneur!.dataset.etat = 'chargement';
    try {
      const { demarrerLaCarte } = await import('./ilot');
      let choisir:
        ((p: import('../../modele/carte/donnees').FeatureEcole['properties']) => void) | undefined;
      const carte = await demarrerLaCarte({
        toile: toile!,
        boite: JSON.parse(conteneur!.dataset.boite ?? '[]') as Fenetre,
        integree: !application,
        ...(application
          ? {
              surSelection: (p: import('../../modele/carte/donnees').FeatureEcole['properties']) =>
                choisir?.(p),
            }
          : {}),
        surPrete: () => {
          if (!application) conteneur!.dataset.etat = 'prete';
        },
        surFondAbsent: () => {
          conteneur!.dataset.fond = 'absent';
          dire(
            'Le fond de carte ne se charge pas pour le moment. Les écoles restent dans la liste ci-dessous.',
          );
        },
      });
      if (!application) {
        // Le bouton principal de l'accueil (« Explorer la carte ») ouvre la carte sur la vue choisie dans l'aperçu.
        const versLaCarte = document.querySelector<HTMLAnchorElement>('[data-vers-carte]');
        const partagerVue = () => {
          const c = carte.getCenter();
          if (versLaCarte)
            versLaCarte.href =
              '/carte/' + adresseVue({ zoom: carte.getZoom(), latitude: c.lat, longitude: c.lng });
        };
        carte.on('moveend', partagerVue);
        carte.once('idle', partagerVue);
      }
      if (application) {
        const { installerInterface } = await import('./interface');
        choisir = await installerInterface(racine!, carte);
      }
    } catch (erreur) {
      console.error('carte :', erreur);
      conteneur!.dataset.etat = 'echec';
      dire('La carte ne s’est pas chargée. La liste ci-dessous donne les mêmes écoles.');
    }
  }
  // Économiseur de données ou connexion très lente sur l'accueil : la carte attend l'appui, dit tout de suite (sans attendre
  // la fin du chargement de la page), et le cadre n'a pas à réserver la hauteur d'une carte qui ne viendra peut-être pas.
  const connexion = (navigator as Navigator & { connection?: Connexion }).connection;
  const surAppui = modeDeChargement(application ? 'carte' : 'accueil', connexion) === 'sur-appui';
  // Sur l'accueil, une carte sous le pli ne se charge qu'à son arrivée à l'écran : le compte du signe (0,4 s, puis 10 s
  // pour « La connexion est lente. ») attend ce moment, sinon il dirait lente une carte qui n'a pas encore commencé.
  const boite = racine.getBoundingClientRect();
  const sousLePli = !application && (boite.top >= window.innerHeight || boite.bottom <= 0);
  if (surAppui) {
    conteneur.dataset.attente = 'appui';
    if (bouton) bouton.hidden = false;
  } else if (sousLePli) conteneur.dataset.attente = 'vue';
  else garderLeSigne(conteneur, premierAffichage());
  bouton?.addEventListener('click', () => {
    // L'appui commence l'attente : le signe paraîtra 0,4 s plus tard si la carte n'est pas encore là.
    if (conteneur.dataset.attente === 'appui') {
      delete conteneur.dataset.attente;
      garderLeSigne(conteneur, performance.now());
    }
    void lancer();
  });
  const apresLaPage = () => {
    if (surAppui) return;
    if (application) {
      void lancer();
      return;
    }
    const observer = new IntersectionObserver(
      (entrees) => {
        if (entrees.some((e) => e.isIntersecting)) {
          observer.disconnect();
          if (conteneur.dataset.attente === 'vue') {
            delete conteneur.dataset.attente;
            garderLeSigne(conteneur, performance.now());
          }
          void lancer();
        }
      },
      { rootMargin: '0px' },
    );
    observer.observe(racine!);
  };
  if (document.readyState === 'complete') apresLaPage();
  else window.addEventListener('load', apresLaPage, { once: true });
}
