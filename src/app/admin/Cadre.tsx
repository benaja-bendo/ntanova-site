/**
 * Le cadre de l'administration v2 (lot 2 du cahier, planches « Aujourd'hui · téléphone », « Aujourd'hui · ordinateur »,
 * « "Plus" et le compte ») : un seul composant, deux mises en page par le CSS au seuil de 64 rem.
 * - Téléphone : barre du haut (marque, titre de l'écran, initiale du compte), barre du bas à cinq cases (Aujourd'hui,
 *   À valider, Écoles, Relais, Plus) ; « Plus » ouvre une feuille avec Zones, Paie, Santé des envois et les règles.
 * - Ordinateur : barre de côté ; « Plus rarement » (Zones, Paie, Santé des envois) y est déplié ; le compte en bas.
 * Chaque écran pose son titre et ses règles par `TitreEcran` : les paragraphes d'aide ne sont plus sous les titres, ils
 * sont dans le tiroir « Règles » (loi 1 du texte).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Dialogue } from '../../ui/Dialogue';
import { aller } from '../commun/adresse';

export type CheminAdmin = 'accueil' | 'valider' | 'ecoles' | 'relais' | 'zones' | 'paie' | 'sante';

export interface Onglet {
  chemin: CheminAdmin;
  libelle: string;
  compte: number | null;
  legende?: [singulier: string, pluriel: string];
}

// Les icônes du cadre : contour, grille de 24, trait de 2 (les mêmes que le canevas).
const traces: Record<string, ReactNode> = {
  accueil: (
    <>
      <path d="M4 11l8-7 8 7v9H4z" />
      <path d="M10 20v-6h4v6" />
    </>
  ),
  valider: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  ecoles: (
    <>
      <path d="M2 9l10-5 10 5-10 5z" />
      <path d="M6 11v5c3 2.5 9 2.5 12 0v-5" />
    </>
  ),
  relais: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.1-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 5.6M18.5 14.8c1.7.8 2.7 2.5 3 5.2" />
    </>
  ),
  plus: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  zones: (
    <>
      <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </>
  ),
  paie: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  sante: <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />,
  regles: (
    <>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M9 9h6M9 13h6" />
    </>
  ),
  sortir: <path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" />,
  retour: <path d="M15 6l-6 6 6 6" />,
  suivant: <path d="M9 6l6 6-6 6" />,
};

export function IconeAdmin({ nom, taille = 22 }: { nom: keyof typeof traces; taille?: number }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {traces[nom]}
    </svg>
  );
}

function Logo({ couleur = 'var(--texte-sur-marque)' }: { couleur?: string }) {
  return (
    <svg width="30" height="23" viewBox="-2.5 -2.5 163 125" aria-hidden="true">
      <path
        fill={couleur}
        d="M0 7Q0 2 5 2L24.8 2Q29.8 2 29.8 7L29.8 112.8Q29.8 117.8 24.8 117.8L5 117.8Q0 117.8 0 112.8Z"
      />
      <path
        fill="var(--jaune)"
        d="M82.13 2.8Q83.2 0 86.2 0L118.2 0Q121.2 0 120.13 2.8L76.37 117Q75.3 119.8 72.3 119.8L40.3 119.8Q37.3 119.8 38.37 117Z"
      />
      <path
        fill="var(--rouge)"
        d="M128 7Q128 2 133 2L152.8 2Q157.8 2 157.8 7L157.8 112.8Q157.8 117.8 152.8 117.8L133 117.8Q128 117.8 128 112.8Z"
      />
    </svg>
  );
}

// Le titre et les règles de l'écran ouvert : la barre du haut (téléphone) et la feuille « Plus » les lisent.
interface EtatEcran {
  titre: string;
  regles: ReactNode | null;
  retour: { libelle: string; chemin: string } | null;
}
const ContexteEcran = createContext<{
  poser: (e: EtatEcran) => void;
  ouvrirRegles: () => void;
} | null>(null);

/**
 * Le titre d'un écran, son bouton « Règles » et ses actions. Le titre est le seul `h1` de la page ; sur téléphone, il passe
 * dans la barre du haut (il reste lu par les lecteurs d'écran à sa place).
 */
export function TitreEcran({
  titre,
  regles,
  actions,
  retour = null,
  focusRetour = false,
}: {
  titre: string;
  regles?: ReactNode;
  actions?: ReactNode;
  retour?: { libelle: string; chemin: string } | null;
  focusRetour?: boolean;
}) {
  const ecran = useContext(ContexteEcran);
  useEffect(() => {
    ecran?.poser({ titre, regles: regles ?? null, retour });
    // Les règles sont du texte fixe : on ne repose l'écran que si le titre ou le retour changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titre, retour?.chemin]);
  return (
    <div className="admin-titre">
      <h1 tabIndex={focusRetour ? -1 : undefined} data-retour-liste={focusRetour || undefined}>
        {titre}
      </h1>
      <div className="admin-titre-actions">
        {actions}
        {regles && (
          <button
            type="button"
            className="bouton-regles"
            onClick={() => ecran?.ouvrirRegles()}
            aria-label={`Règles : ${titre}`}
          >
            <IconeAdmin nom="regles" taille={18} />
            Règles
          </button>
        )}
      </div>
    </div>
  );
}

function Badge({ o }: { o: Onglet }) {
  if (o.compte === null || o.compte <= 0) return null;
  const legende = o.legende?.[o.compte > 1 ? 1 : 0] ?? '';
  return (
    <span className="admin-badge" title={`${o.compte} ${legende}`.trim()}>
      {o.compte}
      <span className="visuellement-cache">{` ${legende}`}</span>
    </span>
  );
}

function Lien({
  o,
  courant,
  icone,
  surSuivi,
}: {
  o: Onglet;
  courant: boolean;
  icone?: boolean;
  surSuivi?: () => void;
}) {
  return (
    <a
      href={`#${o.chemin}`}
      aria-current={courant ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        surSuivi?.();
        aller(o.chemin);
      }}
    >
      {icone && <IconeAdmin nom={o.chemin === 'accueil' ? 'accueil' : o.chemin} />}
      <span className="admin-lien-texte">{o.libelle}</span>
      <Badge o={o} />
    </a>
  );
}

export function Cadre({
  ecran,
  principaux,
  rares,
  email,
  seDeconnecter,
  children,
}: {
  ecran: string;
  principaux: Onglet[];
  rares: Onglet[];
  email: string | null;
  seDeconnecter: () => void;
  children: ReactNode;
}) {
  const [etat, setEtat] = useState<EtatEcran>({ titre: '', regles: null, retour: null });
  // La feuille « Plus » et le menu du compte se rappellent sur quel écran ils ont été ouverts : changer d'écran les ferme.
  const [plusSur, setPlusSur] = useState<string | null>(null);
  const [regles, setRegles] = useState(false);
  const [compteSur, setCompteSur] = useState<string | null>(null);
  const plus = plusSur === ecran;
  const compte = compteSur === ecran;
  const setPlus = (o: boolean) => setPlusSur(o ? ecran : null);
  const initiale = (email ?? '?').charAt(0).toUpperCase();
  const dansPlus = rares.some((o) => o.chemin === ecran);

  return (
    <ContexteEcran.Provider value={{ poser: setEtat, ouvrirRegles: () => setRegles(true) }}>
      <div className="admin">
        <aside className="admin-cote">
          <div className="admin-marque">
            <Logo />
            <span>NTanova</span>
          </div>
          <nav aria-label="Administration" className="admin-nav">
            {principaux.map((o) => (
              <Lien key={o.chemin} o={o} courant={ecran === o.chemin} />
            ))}
          </nav>
          <span className="admin-cote-rubrique">Plus rarement</span>
          <nav aria-label="Plus rarement" className="admin-nav admin-nav-rare">
            {rares.map((o) => (
              <Lien key={o.chemin} o={o} courant={ecran === o.chemin} />
            ))}
          </nav>
          <div className="admin-compte">
            <span className="admin-initiale" aria-hidden="true">
              {initiale}
            </span>
            <span className="admin-compte-texte">
              <b>{email ?? 'Compte connecté'}</b>
              <button type="button" className="lien" onClick={seDeconnecter}>
                Se déconnecter
              </button>
            </span>
          </div>
        </aside>

        <header className="admin-haut">
          {etat.retour ? (
            <a
              className="admin-haut-retour"
              href={`#${etat.retour.chemin}`}
              aria-label={`Retour : ${etat.retour.libelle}`}
            >
              <IconeAdmin nom="retour" />
            </a>
          ) : (
            <Logo />
          )}
          {/* Sur téléphone, le titre de l'écran est ici : c'est le `h1` (celui de la page n'est pas rendu). */}
          <h1 className="admin-haut-titre">{etat.titre}</h1>
          <button
            type="button"
            className="admin-initiale"
            aria-label="Mon compte"
            aria-expanded={compte}
            onClick={() => setCompteSur(compte ? null : ecran)}
          >
            {initiale}
          </button>
          {compte && (
            <div className="admin-menu-compte" role="menu" aria-label="Mon compte">
              <span className="admin-menu-compte-qui">
                <b>Administration</b>
                <span>{email}</span>
              </span>
              <button type="button" role="menuitem" onClick={seDeconnecter}>
                <IconeAdmin nom="sortir" taille={20} />
                Se déconnecter
              </button>
            </div>
          )}
        </header>

        <main className="admin-contenu">{children}</main>

        <nav aria-label="Navigation" className="admin-bas">
          {principaux.map((o) => (
            <Lien key={o.chemin} o={o} courant={ecran === o.chemin} icone />
          ))}
          <button
            type="button"
            aria-current={dansPlus ? 'page' : undefined}
            aria-expanded={plus}
            onClick={() => setPlus(true)}
          >
            <IconeAdmin nom="plus" />
            <span className="admin-lien-texte">Plus</span>
          </button>
        </nav>

        {plus && (
          <Dialogue
            titre="Plus"
            variante="feuille"
            entete={<b className="admin-feuille-titre">Plus</b>}
            fermer={() => setPlus(false)}
          >
            <nav aria-label="Plus" className="admin-feuille-liens">
              {rares.map((o) => (
                <Lien
                  key={o.chemin}
                  o={o}
                  courant={ecran === o.chemin}
                  icone
                  surSuivi={() => setPlus(false)}
                />
              ))}
              {etat.regles && (
                <button
                  type="button"
                  onClick={() => {
                    setPlus(false);
                    setRegles(true);
                  }}
                >
                  <IconeAdmin nom="regles" />
                  <span className="admin-lien-texte">Règles de cet écran</span>
                </button>
              )}
            </nav>
          </Dialogue>
        )}
        {regles && etat.regles && (
          <Dialogue
            titre={`Règles : ${etat.titre}`}
            variante="tiroir"
            entete={<b className="admin-feuille-titre">Règles : {etat.titre}</b>}
            fermer={() => setRegles(false)}
          >
            <div className="admin-regles">{etat.regles}</div>
          </Dialogue>
        )}
      </div>
    </ContexteEcran.Provider>
  );
}
