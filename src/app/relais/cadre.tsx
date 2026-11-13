/**
 * Le cadre des écrans de l'espace relais, d'après les planches v2 (canevas du fondateur, 13/11) : l'en-tête blanc avec le
 * titre en Source Serif 4, et la barre du bas à quatre onglets. Tailwind et shadcn seulement (DESIGN_SYSTEM.md, § 6).
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  IconeCompte,
  IconeFiche,
  IconeHorsLigne,
  IconeMissions,
  IconeOuvrir,
  IconePaie,
  IconeRetour,
} from '@/ui/shadcn/icones';
import { aller, useAdresse, useEnLigne } from './contexte';

/** Hors ligne, l'en-tête le dit ; en ligne, il ne dit rien (planche : seul l'accueil montre « En ligne »). */
export function HorsLigne({ className }: { className?: string }) {
  const enLigne = useEnLigne();
  if (enLigne) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-neutre px-2.5 py-0.5 text-[13px] font-bold text-neutre-foreground',
        className,
      )}
    >
      <IconeHorsLigne className="size-3.5" aria-hidden />
      Hors ligne
    </span>
  );
}

/** L'en-tête d'un écran principal : le titre (h1), à droite ce qu'on veut (un lien, un état). */
export function EnTete({ titre, droite }: { titre: string; droite?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex min-h-[60px] items-center gap-3 border-b border-border bg-card px-4">
      <h1
        className="m-0 flex-1 font-serif text-[19px] leading-tight font-bold text-foreground"
        tabIndex={-1}
        data-retour-liste
      >
        {titre}
      </h1>
      <HorsLigne />
      {droite}
    </header>
  );
}

/** L'état du réseau sur l'accueil (planche : la pastille « En ligne », verte, ou « Hors ligne »). */
export function PastilleEnLigne() {
  const enLigne = useEnLigne();
  return enLigne ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-succes px-2.5 py-[3px] text-[13px] font-bold text-succes-foreground">
      <span className="size-2 rounded-full bg-primary" aria-hidden />
      En ligne
    </span>
  ) : (
    <HorsLigne />
  );
}

/**
 * L'en-tête d'un écran ouvert depuis un autre (une mission, une fiche) : la flèche de retour, le titre en serif et une ligne
 * de contexte (« Confiée par NTanova le … »).
 */
export function EnTeteRetour({
  titre,
  sousTitre,
  retour,
  libelleRetour = 'Revenir',
  droite,
}: {
  titre: string;
  sousTitre?: ReactNode;
  /** Un écran (`missions`), ou un geste (revenir d'où l'on vient). */
  retour: string | (() => void);
  libelleRetour?: string;
  droite?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex min-h-[60px] items-center gap-1.5 border-b border-border bg-card py-1.5 pr-3 pl-1">
      <button
        type="button"
        aria-label={libelleRetour}
        onClick={() => (typeof retour === 'string' ? aller(retour) : retour())}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <IconeRetour className="size-[22px]" />
      </button>
      <span className="flex min-w-0 flex-1 flex-col">
        <h1
          className="m-0 font-serif text-[19px] leading-tight font-bold"
          tabIndex={-1}
          data-retour-liste
        >
          {titre}
        </h1>
        {sousTitre && <span className="text-[13px] text-muted-foreground">{sousTitre}</span>}
      </span>
      <HorsLigne />
      {droite}
    </header>
  );
}

/** Le pied fixe d'un écran (« Prendre la photo », « Suivant ») : blanc, filet en haut, au-dessus du clavier. */
export function PiedFixe({ children }: { children: ReactNode }) {
  return (
    <footer className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-border bg-card px-4 pt-2.5 pb-4">
      {children}
    </footer>
  );
}

/** Une ligne qui ouvre un autre écran : titre en gras, une ligne douce, le chevron à droite. */
export function LigneLien({
  href,
  titre,
  detail,
  className,
}: {
  href: string;
  titre: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        'flex min-h-[72px] items-center gap-3 px-4 py-3 text-foreground no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset',
        className,
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="text-[17px]">{titre}</b>
        {detail && <span className="text-sm text-muted-foreground">{detail}</span>}
      </span>
      <IconeOuvrir className="size-5 text-foreground" />
    </a>
  );
}

const onglets = [
  { chemin: 'missions', libelle: 'Missions', Icone: IconeMissions },
  { chemin: 'fiches', libelle: 'Mes fiches', Icone: IconeFiche },
  { chemin: 'paie', libelle: 'Ma paie', Icone: IconePaie },
  { chemin: 'compte', libelle: 'Compte', Icone: IconeCompte },
] as const;

/** La barre du bas : quatre onglets, l'onglet ouvert souligné en haut. `#lot` et `#mission/…` sont « Missions ». */
export function BarreDuBas() {
  const [ecranLu = 'missions'] = useAdresse();
  const ecran = ['lot', 'mission', 'aide'].includes(ecranLu) ? 'missions' : ecranLu;
  return (
    <nav
      className="sticky bottom-0 z-10 grid grid-cols-4 border-t border-border bg-card"
      aria-label="Espace relais"
    >
      {onglets.map(({ chemin, libelle, Icone }) => {
        const ouvert = ecran === chemin;
        return (
          <a
            key={chemin}
            href={`#${chemin}`}
            aria-current={ouvert ? 'page' : undefined}
            className={cn(
              'flex min-h-16 flex-col items-center justify-center gap-0.5 pt-[9px] pb-3 text-xs font-bold no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset',
              ouvert
                ? 'text-primary-strong shadow-[inset_0_3px_0_var(--marque)]'
                : 'text-muted-foreground',
            )}
          >
            <Icone className="size-[22px]" aria-hidden />
            {libelle}
          </a>
        );
      })}
    </nav>
  );
}

/** Le surtitre d'une section (« DÉJÀ PAYÉ ») : 12 px, capitales espacées, texte doux. */
export function Surtitre({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        'm-0 font-sans text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase',
        className,
      )}
    >
      {children}
    </h2>
  );
}
