/**
 * L'espace relais : une seule page (/relais/), installable, qui marche hors ligne.
 * Le relais saisit même sans réseau et même avec une session expirée ; la file
 * d'envoi part dès que c'est possible.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Utilisateur } from '../../modele/ports';
import { obtenirAdaptateurs, type Adaptateurs } from '../../infra/index';
import { base, lireMemoire, oublierLeCompteDAvant, useRequete } from './base-locale';
import { aller, ContexteRelais, useAdresse, type Contexte } from './contexte';
import { Ajouter } from './ecrans/Ajouter';
import { Compte } from './ecrans/Compte';
import { ContactSeul } from './ecrans/ContactSeul';
import { BandeauVersion } from './composants';
import {
  CompteEnAttente,
  Connexion,
  LectureImpossible,
  Ouverture,
  PremiereConnexionHorsLigne,
} from './ecrans/Connexion';
import { MaPaie } from './ecrans/MaPaie';
import { MesFiches } from './ecrans/MesFiches';
import { MonLot } from './ecrans/MonLot';
import { PremiersPas } from './ecrans/PremiersPas';
import type { BilanEnvoi } from '../../modele/envoi';
import { bilanDuDernierEnvoi } from './file-envoi';
import { journaliser } from './journal';
import { synchroniser as synchroniserTout } from './synchro';
import { useNouvelleVersion } from './version';
import './relais.css';

const INTERVALLE_MS = 3 * 60_000;

function Ecrans() {
  const [ecran = 'lot', etape] = useAdresse();
  if (ecran === 'ajouter') {
    const n = etape === '2' ? 2 : etape === '3' ? 3 : 1;
    return <Ajouter key={n} etape={n} />;
  }
  if (ecran === 'fiches') return <MesFiches />;
  if (ecran === 'paie') return <MaPaie />;
  if (ecran === 'compte') return <Compte />;
  if (ecran === 'premiers-pas') return <PremiersPas />;
  if (ecran === 'contact' && etape) return <ContactSeul key={etape} releveId={etape} />;
  return <MonLot />;
}

export default function App({ lienNTanova }: { lienNTanova: string | null }) {
  const [adaptateurs, setAdaptateurs] = useState<Adaptateurs | null>(null);
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null | undefined>(undefined);
  const [envoi, setEnvoi] = useState<Contexte['envoi']>(null);
  const [bilan, setBilan] = useState<BilanEnvoi | null>(null);
  const [premiereLecture, setPremiereLecture] = useState(false);
  const profil = useRequete(() => lireMemoire('profil'));
  const memoireLue = useRequete(async () => (await base.memoire.count()) >= 0);
  const nouvelleVersion = useNouvelleVersion();

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
      .then((resultat) => {
        setEnvoi(resultat);
        setBilan(bilanDuDernierEnvoi());
      })
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
      // Un autre compte sur le même téléphone : ce que le téléphone gardait de l'ancien (son secteur, ses fiches reçues,
      // sa paie) ne sert pas au nouveau. Les fiches NON envoyées de l'ancien restent, et ne partent que sous son nom.
      if (ancien && nouveau && ancien.id !== nouveau.id) await oublierLeCompteDAvant();
      setUtilisateur(nouveau);
      synchroniser();
    })();
  }, [adaptateurs, synchroniser]);

  // Après « Se déconnecter » (la session est déjà fermée) : l'écran de connexion, sur l'écran d'accueil, sans état
  // du compte d'avant. Aucune fiche n'est touchée.
  const surDeconnexion = useCallback(() => {
    aller('lot');
    setEnvoi(null);
    setBilan(null);
    setPremiereLecture(false);
    setUtilisateur(null);
  }, []);

  const contexte = useMemo<Contexte | null>(
    () =>
      adaptateurs
        ? { adaptateurs, envoi, bilan, synchroniser, surConnexion, surDeconnexion, lienNTanova }
        : null,
    [adaptateurs, envoi, bilan, synchroniser, surConnexion, surDeconnexion, lienNTanova],
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
      ) : premiereLecture && envoi === 'erreur' ? (
        <LectureImpossible />
      ) : (
        <Ouverture />
      );
  } else if (profil.statut !== 'actif') {
    contenu = <CompteEnAttente email={utilisateur.email} suspendu={profil.statut === 'suspendu'} />;
  } else contenu = <Ecrans />;

  return (
    <ContexteRelais.Provider value={contexte}>
      {nouvelleVersion && <BandeauVersion />}
      {contenu}
    </ContexteRelais.Provider>
  );
}
