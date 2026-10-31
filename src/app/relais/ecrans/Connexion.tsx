import { useEffect, useRef, useState } from 'react';
import { PUBLIC_GOOGLE_CLIENT_ID } from 'astro:env/client';
import { useRelais, useEnLigne } from '../contexte';
import { Icone } from '../composants';
import { afficherBoutonGoogle, lienChrome, navigateurIntegre } from '../google';
import { journaliser } from '../journal';

/** Le bouton de connexion : celui de Google, ou « Ouvrir dans Chrome » dans un navigateur intégré. */
export function BoutonGoogle() {
  const { adaptateurs, surConnexion } = useRelais();
  const enLigne = useEnLigne();
  const zone = useRef<HTMLDivElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [attente, setAttente] = useState(false);
  const integre = navigateurIntegre();
  const erreurConfiguration =
    adaptateurs.nom === 'supabase' && !PUBLIC_GOOGLE_CLIENT_ID
      ? 'PUBLIC_GOOGLE_CLIENT_ID manque.'
      : null;

  const connecter = async (jeton: string, nonce: string) => {
    setAttente(true);
    setErreur(null);
    try {
      await adaptateurs.session.connecterAvecGoogle(jeton, nonce);
      surConnexion();
    } catch (e) {
      await journaliser('connexion', 'connexion_refusee', e);
      setErreur('La connexion a échoué. Vérifiez le réseau, puis réessayez.');
    } finally {
      setAttente(false);
    }
  };

  useEffect(() => {
    if (integre || !enLigne || adaptateurs.nom === 'faux' || !zone.current) return;
    if (!PUBLIC_GOOGLE_CLIENT_ID) return;
    afficherBoutonGoogle(
      zone.current,
      PUBLIC_GOOGLE_CLIENT_ID,
      (j, n) => void connecter(j, n),
    ).catch((e: unknown) => {
      void journaliser('connexion', 'google_indisponible', e);
      setErreur('Google ne répond pas. Vérifiez le réseau, puis rechargez la page.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integre, enLigne, adaptateurs]);

  if (integre) {
    return (
      <div className="pile">
        <a className="bouton" href={lienChrome()}>
          Ouvrir dans Chrome
        </a>
        <p className="mention centre">
          Google refuse la connexion dans WhatsApp. Ouvrez la page dans Chrome, puis connectez-vous.
        </p>
      </div>
    );
  }
  if (!enLigne) {
    return (
      <p className="bandeau bandeau-attente">
        <Icone nom="horsLigne" />
        La connexion demande du réseau. Elle se fait une fois ; ensuite, le relevé marche hors
        ligne.
      </p>
    );
  }
  return (
    <div className="pile">
      {adaptateurs.nom === 'faux' ? (
        <button type="button" className="bouton" onClick={() => void connecter('faux', 'faux')}>
          Continuer avec mon compte Google
        </button>
      ) : (
        <div ref={zone} className="zone-google" aria-busy={attente} />
      )}
      {(erreur ?? erreurConfiguration) && (
        <p className="message-erreur centre" role="alert">
          {erreur ?? erreurConfiguration}
        </p>
      )}
    </div>
  );
}

export function Connexion() {
  return (
    <div className="ecran ecran-accueil">
      <main className="accueil">
        <div className="accueil-marque">
          <img src="/favicon.svg" alt="" width={48} height={37} />
          <span>NTanova</span>
        </div>
        <div className="pile-serree">
          <p className="surtitre">Espace relais</p>
          <h1>Relever les écoles de son quartier.</h1>
          <p className="texte-doux">
            Pour les jeunes qui travaillent avec NTanova, à Tié-Tié et à Ngoyo.
          </p>
        </div>
        <BoutonGoogle />
        <p className="mention centre">
          La première connexion demande du réseau. Ensuite, le relevé marche hors ligne.
        </p>
        <div className="carte-blanche rang">
          <Icone nom="cadenas" />
          <p>
            Votre compte est activé par NTanova après la formation.{' '}
            <b>Un compte par personne&nbsp;: ne le prêtez pas.</b>
          </p>
        </div>
      </main>
      <footer className="pied-relais">
        <a href="/">Vous n'êtes pas relais&nbsp;? Aller sur le site</a>
      </footer>
    </div>
  );
}

export function CompteEnAttente({ email, suspendu }: { email: string | null; suspendu: boolean }) {
  const { adaptateurs, synchroniser } = useRelais();
  const changer = async () => {
    await adaptateurs.session.deconnecter();
    location.reload();
  };
  return (
    <div className="ecran ecran-accueil">
      <main className="accueil">
        <div className="accueil-marque">
          <img src="/favicon.svg" alt="" width={48} height={37} />
          <span>NTanova</span>
        </div>
        <div className="pile-serree">
          <p className="surtitre">Espace relais</p>
          <h1>Relever les écoles de son quartier.</h1>
        </div>
        <div className="bandeau bandeau-attente">
          <Icone nom="horloge" taille={22} />
          <div>
            <p className="bandeau-titre">{suspendu ? 'Compte suspendu' : 'Compte en attente'}</p>
            <p>
              {suspendu
                ? 'Écrivez à NTanova sur WhatsApp pour en savoir plus.'
                : "NTanova l'active après votre formation. Nous vous prévenons sur WhatsApp."}
            </p>
          </div>
        </div>
        <button type="button" className="bouton bouton-secondaire" onClick={synchroniser}>
          Vérifier à nouveau
        </button>
        <p className="mention">
          Connecté avec {email ?? 'votre compte Google'}. Ce n'est pas vous&nbsp;?{' '}
          <button type="button" className="lien" onClick={() => void changer()}>
            Changer de compte
          </button>
        </p>
      </main>
    </div>
  );
}

export function PremiereConnexionHorsLigne() {
  return (
    <div className="ecran ecran-accueil">
      <main className="accueil">
        <h1>Pas de réseau</h1>
        <p>
          La première ouverture demande du réseau, pour charger votre lot. Ensuite, le relevé marche
          hors ligne.
        </p>
        <button type="button" className="bouton" onClick={() => location.reload()}>
          Réessayer
        </button>
      </main>
    </div>
  );
}
