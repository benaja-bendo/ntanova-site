/**
 * L'administration : valider les fiches des relais, gérer les écoles, les zones et les lots, activer les relais, payer.
 * Le rôle vient de la base (`est_admin`), pas de Google : un compte connecté qui
 * n'est pas inscrit dans `prive.admins` ne voit rien.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Utilisateur } from '../../modele/ports';
import { obtenirAdaptateurs, type Adaptateurs } from '../../infra/index';
import { useAdresse } from '../commun/adresse';
import { CHEMIN as MESSAGES, lireReference } from '../../modele/messages-recus';
import { Cadre, type Onglet } from './Cadre';
import { Button } from '@/ui/shadcn/button';
import { BoutonGoogle } from '../commun/BoutonGoogle';
import { AValider } from './AValider';
import { Ecoles } from './Ecoles';
import { ListeRelais } from './ListeRelais';
import { Paie } from './Paie';
import { MessagesRecus } from './MessagesRecus';
import { Sante } from './Sante';
import { Aujourdhui } from './Aujourdhui';
import { Zones } from './Zones';
import '@/ui/shadcn/theme.css';

type Acces = 'verification' | 'admin' | 'refuse' | 'erreur';

function Accueil({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background px-4 py-10 font-sans text-foreground">
      <main className="mx-auto flex max-w-[36rem] flex-col gap-4 [&_h1]:m-0 [&_h1]:font-serif [&_h1]:text-[32px] [&_h1]:text-primary-strong [&_p]:m-0">
        <div className="flex items-center gap-2 font-serif text-xl font-bold">
          <img src="/favicon.svg" alt="" width={40} height={31} />
          <span>NTanova</span>
          <span className="rounded-full bg-jaune px-2 py-0.5 font-sans text-xs font-bold">
            admin
          </span>
        </div>
        {children}
      </main>
    </div>
  );
}

export default function App() {
  const [adaptateurs, setAdaptateurs] = useState<Adaptateurs | null>(null);
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null | undefined>(undefined);
  const [acces, setAcces] = useState<Acces>('verification');
  const [aValider, setAValider] = useState<number | null>(null);
  const [relaisAActiver, setRelaisAActiver] = useState<number | null>(null);
  const [ecolesPretes, setEcolesPretes] = useState<number | null>(null);
  // Les messages reçus à traiter, retraits compris (refonte, lot 3B2).
  const [messages, setMessages] = useState<number | null>(null);
  const [ecran = 'accueil', segment] = useAdresse();
  // Le lien d'une alerte e-mail : la connexion dit ce qu'elle va ouvrir, et rien ne se lit avant elle.
  const messageVise = ecran === MESSAGES ? lireReference(segment) : null;

  useEffect(() => {
    void obtenirAdaptateurs().then(async (a) => {
      setAdaptateurs(a);
      setUtilisateur(await a.session.utilisateur());
    });
  }, []);

  useEffect(() => {
    if (!adaptateurs || !utilisateur) return;
    adaptateurs.admin
      .suisAdmin()
      .then((oui) => setAcces(oui ? 'admin' : 'refuse'))
      .catch(() => setAcces('erreur'));
  }, [adaptateurs, utilisateur]);

  const compter = useCallback((n: number) => setAValider(n), []);
  const compterLesRelais = useCallback((n: number) => setRelaisAActiver(n), []);
  const compterLesMessages = useCallback((n: number) => setMessages(n), []);

  // Les compteurs des onglets se lisent dès l'arrivée, quel que soit l'onglet ouvert (audit du 06/11/2026 : il fallait
  // ouvrir « À valider » pour voir son nombre), puis chaque minute et au retour sur la page. Un compteur qui ne se lit
  // pas garde sa dernière valeur : ce n'est jamais une erreur à montrer.
  const lireLesCompteurs = useCallback(() => {
    if (!adaptateurs) return;
    void Promise.allSettled([
      adaptateurs.admin.vueEnsemble(1),
      adaptateurs.admin.ecolesPretes(),
      adaptateurs.admin.resumeMessages(),
    ]).then(([vue, pretes, recus]) => {
      if (vue.status === 'fulfilled') {
        setAValider(vue.value.aValider.nombre);
        setRelaisAActiver(vue.value.relais.enAttente);
      }
      if (pretes.status === 'fulfilled') setEcolesPretes(pretes.value);
      if (recus.status === 'fulfilled') setMessages(recus.value.aTraiter + recus.value.retraits);
    });
  }, [adaptateurs]);

  useEffect(() => {
    if (acces !== 'admin') return;
    lireLesCompteurs();
    const actualiser = () => {
      if (document.visibilityState === 'visible') lireLesCompteurs();
    };
    const minuteur = setInterval(actualiser, 60_000);
    document.addEventListener('visibilitychange', actualiser);
    return () => {
      clearInterval(minuteur);
      document.removeEventListener('visibilitychange', actualiser);
    };
  }, [acces, lireLesCompteurs]);

  const changerDeCompte = async () => {
    await adaptateurs?.session.deconnecter();
    location.reload();
  };

  if (!adaptateurs || utilisateur === undefined)
    return <div className="min-h-dvh bg-background" aria-busy="true" />;

  if (utilisateur === null) {
    return (
      <Accueil>
        <h1>Administration</h1>
        <p className="text-muted-foreground">
          {messageVise ? (
            <>
              Connecte-toi pour ouvrir <b className="whitespace-nowrap">{messageVise}</b>, avec le
              compte Google inscrit comme administrateur.
            </>
          ) : (
            'Connecte-toi avec le compte Google inscrit comme administrateur.'
          )}
        </p>
        <BoutonGoogle
          session={adaptateurs.session}
          faux={adaptateurs.nom === 'faux'}
          surConnexion={() => void adaptateurs.session.utilisateur().then(setUtilisateur)}
        />
      </Accueil>
    );
  }

  if (acces !== 'admin') {
    return (
      <Accueil>
        {acces === 'verification' && <p aria-busy="true">Vérification de ton accès…</p>}
        {acces === 'refuse' && (
          <>
            <h1>Accès refusé</h1>
            {ecran === MESSAGES && (
              <p>Cette page est réservée à l’administration. Aucun message n’est chargé.</p>
            )}
            <p>
              Le compte {utilisateur.email ?? 'connecté'} n'est pas inscrit comme administrateur.
              L'inscription se fait dans l'éditeur SQL de Supabase (voir{' '}
              <code>supabase/schema.md</code>).
            </p>
          </>
        )}
        {acces === 'erreur' && (
          <>
            <h1>La base ne répond pas</h1>
            <p>Vérifie le réseau, puis recharge la page.</p>
          </>
        )}
        <Button variant="link" className="self-start" onClick={() => void changerDeCompte()}>
          Changer de compte
        </Button>
      </Accueil>
    );
  }

  // Chaque compteur dit ce qu'il compte, pour le lecteur d'écran et l'info-bulle.
  const principaux: Onglet[] = [
    { chemin: 'accueil', libelle: 'Aujourd’hui', compte: null },
    {
      chemin: 'valider',
      libelle: 'À valider',
      compte: aValider,
      legende: ['envoi à valider', 'envois à valider'],
    },
    {
      chemin: 'demandes',
      libelle: 'Messages reçus',
      compte: messages,
      legende: ['message à traiter', 'messages à traiter'],
      plusSurTelephone: true,
    },
    {
      chemin: 'ecoles',
      libelle: 'Écoles',
      compte: ecolesPretes,
      legende: ['école prête à publier', 'écoles prêtes à publier'],
    },
    {
      chemin: 'relais',
      libelle: 'Relais',
      compte: relaisAActiver,
      legende: ['relais à activer', 'relais à activer'],
    },
  ];
  const rares: Onglet[] = [
    { chemin: 'zones', libelle: 'Zones', compte: null },
    { chemin: 'paie', libelle: 'Paie', compte: null, detail: 'versements' },
    { chemin: 'sante', libelle: 'Santé des envois', compte: null },
  ];

  return (
    <Cadre
      ecran={ecran}
      principaux={principaux}
      rares={rares}
      email={utilisateur.email}
      seDeconnecter={() => void changerDeCompte()}
    >
      {ecran === 'relais' ? (
        <ListeRelais admin={adaptateurs.admin} surCompte={compterLesRelais} />
      ) : ecran === 'ecoles' ? (
        <Ecoles admin={adaptateurs.admin} />
      ) : ecran === 'zones' ? (
        <Zones admin={adaptateurs.admin} />
      ) : ecran === MESSAGES ? (
        <MessagesRecus admin={adaptateurs.admin} surCompte={compterLesMessages} />
      ) : ecran === 'sante' ? (
        <Sante admin={adaptateurs.admin} />
      ) : ecran === 'paie' ? (
        <Paie admin={adaptateurs.admin} />
      ) : ecran === 'valider' ? (
        <AValider admin={adaptateurs.admin} surCompte={compter} />
      ) : (
        <Aujourdhui admin={adaptateurs.admin} surCompte={compter} surRelais={compterLesRelais} />
      )}
    </Cadre>
  );
}
