/**
 * L'administration : valider les fiches des relais, gérer les écoles, les zones et les lots, activer les relais, payer.
 * Le rôle vient de la base (`est_admin`), pas de Google : un compte connecté qui
 * n'est pas inscrit dans `prive.admins` ne voit rien.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Utilisateur } from '../../modele/ports';
import { obtenirAdaptateurs, type Adaptateurs } from '../../infra/index';
import { aller, useAdresse } from '../commun/adresse';
import { BoutonGoogle } from '../commun/BoutonGoogle';
import { AValider } from './AValider';
import { Ecoles } from './Ecoles';
import { ListeRelais } from './ListeRelais';
import { Paie } from './Paie';
import { Sante } from './Sante';
import { VueEnsemble } from './VueEnsemble';
import { Zones } from './Zones';
import './admin.css';

type Acces = 'verification' | 'admin' | 'refuse' | 'erreur';

function Accueil({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-accueil">
      <main className="pile">
        <div className="admin-marque">
          <img src="/favicon.svg" alt="" width={40} height={31} />
          <span>NTanova</span>
          <span className="admin-badge">admin</span>
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
  const [ecran = 'accueil'] = useAdresse();

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

  // Les compteurs des onglets se lisent dès l'arrivée, quel que soit l'onglet ouvert (audit du 06/11/2026 : il fallait
  // ouvrir « À valider » pour voir son nombre), puis chaque minute et au retour sur la page. Un compteur qui ne se lit
  // pas garde sa dernière valeur : ce n'est jamais une erreur à montrer.
  const lireLesCompteurs = useCallback(() => {
    if (!adaptateurs) return;
    void Promise.allSettled([
      adaptateurs.admin.vueEnsemble(1),
      adaptateurs.admin.ecolesPretes(),
    ]).then(([vue, pretes]) => {
      if (vue.status === 'fulfilled') {
        setAValider(vue.value.aValider.nombre);
        setRelaisAActiver(vue.value.relais.enAttente);
      }
      if (pretes.status === 'fulfilled') setEcolesPretes(pretes.value);
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
    return <div className="admin-accueil" aria-busy="true" />;

  if (utilisateur === null) {
    return (
      <Accueil>
        <h1>Administration</h1>
        <p className="texte-doux">
          Connecte-toi avec le compte Google inscrit comme administrateur.
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
        <button type="button" className="lien" onClick={() => void changerDeCompte()}>
          Changer de compte
        </button>
      </Accueil>
    );
  }

  // Chaque compteur dit ce qu'il compte, pour le lecteur d'écran et l'info-bulle.
  const onglets: {
    chemin: string;
    libelle: string;
    compte: number | null;
    legende?: [singulier: string, pluriel: string];
  }[] = [
    { chemin: 'accueil', libelle: 'Accueil', compte: null },
    {
      chemin: 'valider',
      libelle: 'À valider',
      compte: aValider,
      legende: ['envoi à valider', 'envois à valider'],
    },
    {
      chemin: 'ecoles',
      libelle: 'Écoles',
      compte: ecolesPretes,
      legende: ['école prête à publier', 'écoles prêtes à publier'],
    },
    { chemin: 'zones', libelle: 'Zones', compte: null },
    {
      chemin: 'relais',
      libelle: 'Relais',
      compte: relaisAActiver,
      legende: ['relais à activer', 'relais à activer'],
    },
    { chemin: 'sante', libelle: 'Santé', compte: null },
    { chemin: 'paie', libelle: 'Paie', compte: null },
  ];

  return (
    <div className="admin">
      <aside className="admin-cote">
        <div className="admin-marque">
          <img src="/favicon.svg" alt="" width={30} height={23} />
          <span>NTanova</span>
          <span className="admin-badge">admin</span>
        </div>
        <nav aria-label="Administration" className="admin-nav">
          {onglets.map((o) => (
            <a
              key={o.chemin}
              href={`#${o.chemin}`}
              aria-current={ecran === o.chemin ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                aller(o.chemin);
              }}
            >
              {o.libelle}
              {o.compte !== null && o.compte > 0 && (
                <span
                  className="admin-badge"
                  title={`${o.compte} ${o.legende?.[o.compte > 1 ? 1 : 0] ?? ''}`.trim()}
                >
                  {o.compte}
                  <span className="visuellement-cache">
                    {` ${o.legende?.[o.compte > 1 ? 1 : 0] ?? ''}`}
                  </span>
                </span>
              )}
            </a>
          ))}
        </nav>
        <div className="admin-compte">
          <span>Connecté : {utilisateur.email}</span>
          <button type="button" className="lien" onClick={() => void changerDeCompte()}>
            Se déconnecter
          </button>
        </div>
      </aside>
      <main className="admin-contenu">
        {ecran === 'relais' ? (
          <ListeRelais admin={adaptateurs.admin} surCompte={compterLesRelais} />
        ) : ecran === 'ecoles' ? (
          <Ecoles admin={adaptateurs.admin} />
        ) : ecran === 'zones' ? (
          <Zones admin={adaptateurs.admin} />
        ) : ecran === 'sante' ? (
          <Sante admin={adaptateurs.admin} />
        ) : ecran === 'paie' ? (
          <Paie admin={adaptateurs.admin} />
        ) : ecran === 'valider' ? (
          <AValider admin={adaptateurs.admin} surCompte={compter} />
        ) : (
          <VueEnsemble admin={adaptateurs.admin} surCompte={compter} surRelais={compterLesRelais} />
        )}
      </main>
    </div>
  );
}
