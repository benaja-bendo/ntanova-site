/**
 * Le bouton de connexion : celui de Google, ou « Ouvrir dans Chrome » dans un
 * navigateur intégré (WhatsApp…), où Google refuse la connexion. Partagé par
 * l'espace relais et l'administration.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PUBLIC_GOOGLE_CLIENT_ID } from 'astro:env/client';
import type { PortSession } from '../../modele/ports';
import { Icone } from '../../ui/composants';
import { afficherBoutonGoogle, lienChrome, navigateurIntegre } from './google';

function abonnerReseau(rappel: () => void) {
  addEventListener('online', rappel);
  addEventListener('offline', rappel);
  return () => {
    removeEventListener('online', rappel);
    removeEventListener('offline', rappel);
  };
}

export function useEnLigne(): boolean {
  return useSyncExternalStore(abonnerReseau, () => navigator.onLine);
}

export function BoutonGoogle({
  session,
  faux,
  surConnexion,
  surErreur = () => {},
  horsLigne = 'La connexion demande du réseau.',
}: {
  session: PortSession;
  /** Le faux serveur des parcours : un simple bouton, sans Google. */
  faux: boolean;
  surConnexion: () => void;
  surErreur?: (code: string, erreur: unknown) => void;
  horsLigne?: string;
}) {
  const enLigne = useEnLigne();
  const zone = useRef<HTMLDivElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [attente, setAttente] = useState(false);
  const integre = navigateurIntegre();
  const erreurConfiguration =
    !faux && !PUBLIC_GOOGLE_CLIENT_ID ? 'PUBLIC_GOOGLE_CLIENT_ID manque.' : null;

  const connecter = async (jeton: string, nonce: string) => {
    setAttente(true);
    setErreur(null);
    try {
      await session.connecterAvecGoogle(jeton, nonce);
      surConnexion();
    } catch (e) {
      surErreur('connexion_refusee', e);
      setErreur('La connexion a échoué. Vérifiez le réseau, puis réessayez.');
    } finally {
      setAttente(false);
    }
  };

  useEffect(() => {
    if (integre || !enLigne || faux || !zone.current || !PUBLIC_GOOGLE_CLIENT_ID) return;
    afficherBoutonGoogle(
      zone.current,
      PUBLIC_GOOGLE_CLIENT_ID,
      (j, n) => void connecter(j, n),
    ).catch((e: unknown) => {
      surErreur('google_indisponible', e);
      setErreur('Google ne répond pas. Vérifiez le réseau, puis rechargez la page.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integre, enLigne, faux, session]);

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
        {horsLigne}
      </p>
    );
  }
  return (
    <div className="pile">
      {faux ? (
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
