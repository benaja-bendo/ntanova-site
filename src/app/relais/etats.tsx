/**
 * Les états que les planches ne dessinent pas (chargement, vide), avec les mêmes formes qu'elles : un cadre d'écran, des
 * cartes qui respirent, jamais un message brut. Tailwind et shadcn seulement.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BarreDuBas, EnTete } from './cadre';

/** Une carte grise qui pulse à la place d'un contenu (respecte « réduire les animations »). */
export function Ebauche({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-lg bg-muted motion-reduce:animate-none', className)}
    />
  );
}

/** Un écran principal pendant sa première lecture : l'en-tête, des ébauches, la barre du bas. */
export function ChargementEcran({ titre }: { titre: string }) {
  return (
    <div className="ecran" aria-busy="true">
      <EnTete titre={titre} />
      <main className="flex flex-1 flex-col gap-4 p-4" aria-label="Lecture en cours">
        <Ebauche className="h-44" />
        <Ebauche className="h-12" />
        <Ebauche className="h-28" />
      </main>
      <BarreDuBas />
    </div>
  );
}

/** Rien à montrer : une phrase en gras, une ligne d'explication, et au besoin un geste. */
export function EtatVide({
  titre,
  children,
  action,
}: {
  titre: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card px-4 py-5">
      <p className="m-0 text-[17px] font-bold">{titre}</p>
      {children && <p className="m-0 text-[15px] text-muted-foreground">{children}</p>}
      {action}
    </div>
  );
}
