/**
 * Le cadre de l'administration v2, d'après les planches (« Aujourd'hui · téléphone », « Aujourd'hui · ordinateur »,
 * « "Plus" et le compte ») : Tailwind et shadcn seulement (refonte v2, lot 2 ; DESIGN_SYSTEM.md, § 6).
 * - Téléphone : barre du haut verte (marque ou retour, titre de l'écran, initiale du compte), barre du bas à cinq cases
 *   (Aujourd'hui, À valider, Écoles, Relais, Plus) ; « Plus » ouvre une feuille avec Zones, Paie, Santé des envois et les
 *   règles de l'écran.
 * - Ordinateur (64 rem et plus) : barre de côté verte, pleine hauteur ; « Plus rarement » y est déplié ; le compte en bas.
 * Chaque écran pose son titre et ses règles par `TitreEcran` : l'aide n'est plus sous les titres, elle est dans le tiroir
 * « Règles » (loi 1 du texte).
 *
 * Les classes `admin-cote`, `admin-haut` et `admin-bas` ne portent aucun style : les parcours de mise en page les visent.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/shadcn/button';
import { Sheet, SheetContent, SheetTitle } from '@/ui/shadcn/sheet';
import { Icone } from '@/ui/icones/Icone';
import type { NomIcone } from '@/ui/icones/registre';
import { aller } from '../commun/adresse';

export type CheminAdmin = 'accueil' | 'valider' | 'ecoles' | 'relais' | 'zones' | 'paie' | 'sante';

export interface Onglet {
  chemin: CheminAdmin;
  libelle: string;
  compte: number | null;
  legende?: [singulier: string, pluriel: string];
  /** Ce que la feuille « Plus » dit à droite (« 14 zones », « vendredi »). */
  detail?: string | null;
}

// Les icônes du cadre, tirées du registre unique (planches : contour, grille de 24, trait de 2).
const ICONES_ADMIN = {
  accueil: 'maison',
  valider: 'caseCochee',
  ecoles: 'toque',
  relais: 'personnes',
  plus: 'points',
  zones: 'lieu',
  paie: 'paie',
  sante: 'pouls',
  regles: 'fiche',
  sortir: 'deconnexion',
  retour: 'retour',
  suivant: 'suite',
} as const satisfies Record<string, NomIcone>;

export function IconeAdmin({
  nom,
  taille = 22,
  className,
}: {
  nom: keyof typeof ICONES_ADMIN;
  taille?: number;
  className?: string;
}) {
  return (
    <Icone
      nom={ICONES_ADMIN[nom]}
      className={className}
      style={{ width: taille, height: taille }}
      aria-hidden
    />
  );
}

function Logo({ className }: { className?: string }) {
  return (
    <svg
      width="30"
      height="23"
      viewBox="-2.5 -2.5 163 125"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <path
        fill="var(--texte-sur-marque)"
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
  /** Sur téléphone, la barre verte peut dire autre chose que le titre (le nom de l'école ouverte, « 2 sur 15 »). */
  titreHaut?: string | null;
  droiteHaut?: string | null;
  regles: ReactNode | null;
  retour: { libelle: string; chemin: string } | null;
}
const ContexteEcran = createContext<{
  poser: (e: EtatEcran) => void;
  ouvrirRegles: () => void;
} | null>(null);

/** Le bouton discret « Règles » d'un écran (planche : l'icône de fiche et le mot, en vert). */
function BoutonRegles({ titre, ouvrir }: { titre: string; ouvrir: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={ouvrir}
      aria-label={`Règles : ${titre}`}
      className="text-primary-strong max-lg:hidden"
    >
      <IconeAdmin nom="regles" taille={18} />
      Règles
    </Button>
  );
}

/**
 * Le titre d'un écran, son bouton « Règles » et ses actions. Le titre est le seul `h1` visible ; sur téléphone, il passe
 * dans la barre du haut (celui de la page reste lu par les lecteurs d'écran à sa place).
 */
export function TitreEcran({
  titre,
  regles,
  actions,
  retour = null,
  focusRetour = false,
  titreHaut = null,
  droiteHaut = null,
  cacherTitre = false,
}: {
  titre: string;
  /** Le titre n'est lu que par les lecteurs d'écran (la fiche d'une école a son nom dans sa carte). */
  cacherTitre?: boolean;
  titreHaut?: string | null;
  droiteHaut?: string | null;
  regles?: ReactNode;
  actions?: ReactNode;
  retour?: { libelle: string; chemin: string } | null;
  focusRetour?: boolean;
}) {
  const ecran = useContext(ContexteEcran);
  useEffect(() => {
    ecran?.poser({ titre, regles: regles ?? null, retour, titreHaut, droiteHaut });
    // Les règles sont du texte fixe : on ne repose l'écran que si le titre ou le retour changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titre, retour?.chemin, titreHaut, droiteHaut]);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1
        tabIndex={focusRetour ? -1 : undefined}
        data-retour-liste={focusRetour || undefined}
        className={cn(
          'm-0 mr-auto font-serif text-[32px] leading-tight font-bold text-primary-strong outline-none max-lg:sr-only',
          cacherTitre && 'sr-only',
        )}
      >
        {titre}
      </h1>
      {(regles || actions) && (
        <div className="flex flex-wrap items-center gap-3">
          {regles && <BoutonRegles titre={titre} ouvrir={() => ecran?.ouvrirRegles()} />}
          {actions}
        </div>
      )}
    </div>
  );
}

function Badge({ o, surFonce }: { o: Onglet; surFonce?: boolean }) {
  if (o.compte === null || o.compte <= 0) return null;
  const legende = o.legende?.[o.compte > 1 ? 1 : 0] ?? '';
  return (
    <span
      title={`${o.compte} ${legende}`.trim()}
      className={cn(
        'inline-flex min-w-6 items-center justify-center rounded-full bg-jaune px-1.5 text-xs leading-5 font-bold text-foreground',
        !surFonce && 'absolute top-1 left-[calc(50%+4px)]',
      )}
    >
      {o.compte}
      <span className="sr-only">{` ${legende}`}</span>
    </span>
  );
}

/** Un lien de la barre de côté (ordinateur) : texte crème, l'écran ouvert sur un fond vert plus clair. */
function LienCote({ o, courant, rare }: { o: Onglet; courant: boolean; rare?: boolean }) {
  return (
    <a
      href={`#${o.chemin}`}
      aria-current={courant ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        aller(o.chemin);
      }}
      className={cn(
        'flex min-h-11 items-center gap-2 rounded-lg px-3 text-[15px] text-creme no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-sur-marque)]',
        rare ? 'font-normal' : 'font-bold',
        courant ? 'bg-primary font-bold' : '[@media(hover:hover)]:hover:bg-primary/60',
      )}
    >
      <span className="flex-1">{o.libelle}</span>
      <Badge o={o} surFonce />
    </a>
  );
}

/** Une case de la barre du bas (téléphone) : l'icône, le mot, le compteur en pastille. */
function CaseBas({ o, courant }: { o: Onglet; courant: boolean }) {
  return (
    <a
      href={`#${o.chemin}`}
      aria-current={courant ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        aller(o.chemin);
      }}
      className={cn(
        'relative flex min-h-16 flex-col items-center justify-center gap-0.5 pt-2 pb-2.5 text-xs font-bold no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset',
        courant
          ? 'text-primary-strong shadow-[inset_0_3px_0_var(--marque)]'
          : 'text-muted-foreground',
      )}
    >
      <IconeAdmin nom={o.chemin} />
      {o.libelle}
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
      <div className="min-h-dvh bg-background font-sans text-foreground lg:grid lg:grid-cols-[211px_minmax(0,1fr)]">
        <aside className="admin-cote sticky top-0 hidden h-dvh flex-col gap-1 overflow-y-auto bg-primary-strong px-3.5 pt-5 pb-4 text-creme lg:flex">
          <div className="mb-4 flex items-center gap-2.5 px-2 font-serif text-xl font-bold">
            <Logo />
            NTanova
          </div>
          <nav aria-label="Administration" className="flex flex-col gap-0.5">
            {principaux.map((o) => (
              <LienCote key={o.chemin} o={o} courant={ecran === o.chemin} />
            ))}
          </nav>
          <span className="mt-5 mb-1 px-3 text-xs font-bold tracking-[0.08em] text-[var(--vert-pale)] uppercase">
            Plus rarement
          </span>
          <nav aria-label="Plus rarement" className="flex flex-col gap-0.5">
            {rares.map((o) => (
              <LienCote key={o.chemin} o={o} courant={ecran === o.chemin} rare />
            ))}
          </nav>
          <div className="mt-auto flex items-center gap-2.5 border-t border-creme/20 px-2 pt-3.5">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-creme bg-jaune font-bold text-foreground"
              aria-hidden="true"
            >
              {initiale}
            </span>
            <span className="flex min-w-0 flex-col text-sm">
              <b className="truncate">{email ?? 'Compte connecté'}</b>
              <button
                type="button"
                onClick={seDeconnecter}
                className="cursor-pointer self-start border-0 bg-transparent p-0 font-sans text-sm text-creme underline underline-offset-2"
              >
                Se déconnecter
              </button>
            </span>
          </div>
        </aside>

        <div className="flex min-h-dvh min-w-0 flex-col">
          <header className="admin-haut sticky top-0 z-20 flex min-h-[60px] items-center gap-3 bg-primary-strong px-4 text-creme lg:hidden">
            {etat.retour ? (
              <a
                href={`#${etat.retour.chemin}`}
                aria-label={`Retour : ${etat.retour.libelle}`}
                className="-ml-2 flex size-11 items-center justify-center rounded-md text-creme outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-sur-marque)]"
              >
                <IconeAdmin nom="retour" />
              </a>
            ) : (
              <Logo />
            )}
            {/* Sur téléphone, le titre de l'écran est ici (le `h1` de la page est caché, mais lu). */}
            <span className="flex-1 truncate font-serif text-xl font-bold" aria-hidden="true">
              {etat.titreHaut ?? etat.titre}
            </span>
            {etat.droiteHaut && (
              <span className="shrink-0 text-sm whitespace-nowrap">{etat.droiteHaut}</span>
            )}
            <div className={cn('relative', etat.droiteHaut && 'hidden')}>
              <button
                type="button"
                aria-label="Mon compte"
                aria-expanded={compte}
                onClick={() => setCompteSur(compte ? null : ecran)}
                className="flex size-10 cursor-pointer items-center justify-center rounded-full border-2 border-creme bg-jaune font-sans font-bold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-sur-marque)]"
              >
                {initiale}
              </button>
              {compte && (
                <div
                  role="menu"
                  aria-label="Mon compte"
                  className="absolute top-12 right-0 z-30 w-[min(84vw,320px)] overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-lg"
                >
                  <span className="flex flex-col gap-0.5 border-b border-border px-4 py-3">
                    <b className="text-[17px]">Administration</b>
                    <span className="truncate text-sm text-muted-foreground">{email}</span>
                  </span>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={seDeconnecter}
                    className="flex min-h-12 w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-4 font-sans text-[17px] font-bold text-destructive"
                  >
                    <IconeAdmin nom="sortir" taille={20} />
                    Se déconnecter
                  </button>
                </div>
              )}
            </div>
          </header>

          <main className="admin-contenu flex flex-1 flex-col gap-5 px-4 pt-5 pb-28 lg:px-7 lg:pt-6 lg:pb-10">
            {children}
          </main>

          <nav
            aria-label="Navigation"
            className="admin-bas fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-card lg:hidden"
          >
            {principaux.map((o) => (
              <CaseBas key={o.chemin} o={o} courant={ecran === o.chemin} />
            ))}
            <button
              type="button"
              aria-current={dansPlus ? 'page' : undefined}
              aria-expanded={plus}
              onClick={() => setPlus(true)}
              className={cn(
                'flex min-h-16 cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent pt-2 pb-2.5 font-sans text-xs font-bold outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset',
                dansPlus
                  ? 'text-primary-strong shadow-[inset_0_3px_0_var(--marque)]'
                  : 'text-muted-foreground',
              )}
            >
              <IconeAdmin nom="plus" />
              Plus
            </button>
          </nav>
        </div>

        <Sheet open={plus} onOpenChange={setPlus}>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            aria-describedby={undefined}
            className="gap-0 rounded-t-2xl px-4 pt-2.5 pb-6"
          >
            <span className="mx-auto mb-3 h-1 w-9 rounded-full bg-input/40" aria-hidden="true" />
            <SheetTitle className="border-b border-border pb-3 text-2xl">Plus</SheetTitle>
            <nav aria-label="Plus" className="flex flex-col">
              {rares.map((o) => (
                <a
                  key={o.chemin}
                  href={`#${o.chemin}`}
                  aria-current={ecran === o.chemin ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    setPlus(false);
                    aller(o.chemin);
                  }}
                  className="flex min-h-14 items-center gap-4 border-b border-border text-lg font-bold text-foreground no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <IconeAdmin nom={o.chemin} />
                  <span className="flex-1">{o.libelle}</span>
                  {o.compte ? (
                    <span className="rounded-full bg-attention px-2.5 py-0.5 text-sm font-bold text-attention-foreground">
                      {o.compte} {o.legende?.[o.compte > 1 ? 1 : 0]}
                    </span>
                  ) : (
                    o.detail && (
                      <span className="text-[15px] font-normal text-muted-foreground">
                        {o.detail}
                      </span>
                    )
                  )}
                </a>
              ))}
              {etat.regles && (
                <button
                  type="button"
                  onClick={() => {
                    setPlus(false);
                    setRegles(true);
                  }}
                  className="flex min-h-14 cursor-pointer items-center gap-4 border-0 bg-transparent p-0 text-left font-sans text-lg font-bold text-foreground"
                >
                  <IconeAdmin nom="regles" />
                  Règles de cet écran
                </button>
              )}
            </nav>
            <Button variant="outline" size="xl" className="mt-3" onClick={() => setPlus(false)}>
              Fermer
            </Button>
          </SheetContent>
        </Sheet>

        <Sheet open={regles && Boolean(etat.regles)} onOpenChange={setRegles}>
          <SheetContent
            side="right"
            aria-describedby={undefined}
            className="w-full gap-3 overflow-y-auto p-5 sm:max-w-md"
          >
            <SheetTitle className="pr-10">Règles : {etat.titre}</SheetTitle>
            <div className="flex flex-col gap-3 text-[15px] leading-relaxed [&_p]:m-0 [&_ul]:m-0 [&_ul]:pl-5">
              {etat.regles}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </ContexteEcran.Provider>
  );
}
