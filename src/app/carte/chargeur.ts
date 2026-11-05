import { adresseVue } from '../../modele/carte/navigation';
import { modeDeChargement, type Connexion } from '../../modele/carte/chargement';
import { ADRESSE_DES_TUILES, type Fenetre } from '../../modele/carte/fond';
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
  bouton?.addEventListener('click', () => void lancer());
  const apresLaPage = () => {
    const connexion = (navigator as Navigator & { connection?: Connexion }).connection;
    if (modeDeChargement(application ? 'carte' : 'accueil', connexion) === 'sur-appui') {
      if (bouton) bouton.hidden = false;
      return;
    }
    if (application) {
      void lancer();
      return;
    }
    const observer = new IntersectionObserver(
      (entrees) => {
        if (entrees.some((e) => e.isIntersecting)) {
          observer.disconnect();
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
