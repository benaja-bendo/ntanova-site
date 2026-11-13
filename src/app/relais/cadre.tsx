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
  IconePaie,
} from '@/ui/shadcn/icones';
import { useAdresse, useEnLigne } from './contexte';

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
