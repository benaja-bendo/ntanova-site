/**
 * L'espace relais : une seule page (/relais/), installable, qui marche hors ligne.
 * Le relais saisit même sans réseau et même avec une session expirée ; la file
 * d'envoi part dès que c'est possible.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Utilisateur } from '../../modele/ports';
import { obtenirAdaptateurs, type Adaptateurs } from '../../infra/index';
import { base, lireMemoire, toutEffacer, useRequete } from './base-locale';
import { ContexteRelais, useAdresse, type Contexte } from './contexte';
import { Ajouter } from './ecrans/Ajouter';
import { CompteEnAttente, Connexion, PremiereConnexionHorsLigne } from './ecrans/Connexion';
import { MesFiches } from './ecrans/MesFiches';
import { MonLot } from './ecrans/MonLot';
import { journaliser } from './journal';
import { synchroniser as synchroniserTout } from './synchro';
import './relais.css';

const INTERVALLE_MS = 3 * 60_000;

function Ecrans() {
  const [ecran = 'lot', etape] = useAdresse();
  if (ecran === 'ajouter') {
    const n = etape === '2' ? 2 : etape === '3' ? 3 : 1;
    return <Ajouter key={n} etape={n} />;
  }
  if (ecran === 'fiches') return <MesFiches />;
  return <MonLot />;
}

export default function App() {
  const [adaptateurs, setAdaptateurs] = useState<Adaptateurs | null>(null);
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null | undefined>(undefined);
  const [envoi, setEnvoi] = useState<Contexte['envoi']>(null);
  const [premiereLecture, setPremiereLecture] = useState(false);
  const profil = useRequete(() => lireMemoire('profil'));
  const memoireLue = useRequete(async () => (await base.memoire.count()) >= 0);

  useEffect(() => {
    obtenirAdaptateurs()
      .then(async (a) => {
        setAdaptateurs(a);
        setUtilisateur(await a.session.utilisateur());
      })
      .catch((e: unknown) => void journaliser('demarrage', 'adaptateurs', e));
  }, []);

  // L'état ne change que dans les rappels : `lancer` peut partir d'un effet.
  const lancer = useCallback(() => {
    if (!adaptateurs) return;
    synchroniserTout(adaptateurs)
      .then(setEnvoi)
      .catch((e: unknown) => {
        setEnvoi('erreur');
        void journaliser('synchro', 'inattendue', e);
      })
      .finally(() => setPremiereLecture(true));
  }, [adaptateurs]);

  const synchroniser = useCallback(() => {
    setEnvoi('en_cours');
    lancer();
  }, [lancer]);

  // À l'ouverture, au retour du réseau, et toutes les trois minutes.
  useEffect(() => {
    if (!adaptateurs || !utilisateur) return;
    lancer();
    addEventListener('online', lancer);
    const minuterie = setInterval(lancer, INTERVALLE_MS);
    return () => {
      removeEventListener('online', lancer);
      clearInterval(minuterie);
    };
  }, [adaptateurs, utilisateur, lancer]);

  const surConnexion = useCallback(() => {
    if (!adaptateurs) return;
    void (async () => {
      const nouveau = await adaptateurs.session.utilisateur();
      const ancien = await lireMemoire('profil');
      // Un autre compte sur le même téléphone : on repart de zéro, sauf s'il reste des fiches à envoyer.
      if (ancien && nouveau && ancien.id !== nouveau.id) {
        const enAttente = await base.fiches.where('etat').equals('a_envoyer').count();
        if (enAttente === 0) await toutEffacer();
      }
      setUtilisateur(nouveau);
      synchroniser();
    })();
  }, [adaptateurs, synchroniser]);

  const contexte = useMemo<Contexte | null>(
    () => (adaptateurs ? { adaptateurs, envoi, synchroniser, surConnexion } : null),
    [adaptateurs, envoi, synchroniser, surConnexion],
  );

  if (!contexte || utilisateur === undefined || memoireLue === undefined) {
    return <div className="ecran" aria-busy="true" />;
  }

  let contenu;
  if (utilisateur === null) contenu = <Connexion />;
  else if (!profil) {
    contenu =
      premiereLecture && envoi === 'hors_ligne' ? (
        <PremiereConnexionHorsLigne />
      ) : premiereLecture && envoi === 'reconnecter' ? (
        <Connexion />
      ) : (
        <div className="ecran" aria-busy="true" />
      );
  } else if (profil.statut !== 'actif') {
    contenu = <CompteEnAttente email={utilisateur.email} suspendu={profil.statut === 'suspendu'} />;
  } else contenu = <Ecrans />;

  return <ContexteRelais.Provider value={contexte}>{contenu}</ContexteRelais.Provider>;
}
