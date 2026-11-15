/**
 * Les pièces communes des écrans de l'administration v2 (refonte, lot 2), d'après les planches : surtitre, tableau,
 * onglets d'état avec compteur, pastille d'état d'une école, carte blanche. Tailwind et shadcn seulement ; les couleurs
 * viennent du thème (jetons). Les champs, choix et bandes sont communs à l'espace relais (`@/ui/v2`).
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Le surtitre d'une section (« CE QUI T'ATTEND ») : 12 px, capitales espacées, texte doux. */
export const surtitre =
  'm-0 font-sans text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase';

/** Le cadre d'un tableau (planche « Écoles · ordinateur ») : carte blanche, bord fin, coins de 12 px. */
export const cadreTableau = 'overflow-x-auto rounded-xl border border-border bg-card';

/** Un tableau : en-tête sur la bande, capitales espacées ; lignes séparées d'un filet. */
export const tableau = cn(
  'w-full border-collapse text-left text-[15px]',
  '[&_thead_th]:bg-muted [&_thead_th]:px-4 [&_thead_th]:py-3 [&_thead_th]:text-xs [&_thead_th]:font-bold [&_thead_th]:tracking-[0.08em] [&_thead_th]:text-muted-foreground [&_thead_th]:uppercase',
  '[&_tbody_td]:border-t [&_tbody_td]:border-border [&_tbody_td]:px-4 [&_tbody_td]:py-3 [&_tbody_th]:border-t [&_tbody_th]:border-border [&_tbody_th]:px-4 [&_tbody_th]:py-3 [&_tbody_th]:text-left',
);

/** Une carte blanche (planches : bord fin, coins de 12 px). */
export function Carte({
  children,
  className,
  ...reste
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl border border-border bg-card', className)} {...reste}>
      {children}
    </div>
  );
}

const tons = {
  succes: 'bg-succes text-succes-foreground',
  attention: 'bg-attention text-attention-foreground',
  danger: 'bg-danger text-danger-foreground',
  neutre: 'bg-muted text-muted-foreground',
} as const;

/** Une pastille d'état (« Publiée », « Prête », « Sans position ») : petite, en gras, sur le fond de son ton. */
export function Etat({
  ton,
  children,
  className,
}: {
  ton: keyof typeof tons;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs leading-5 font-bold whitespace-nowrap',
        tons[ton],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Le compteur d'un onglet (« À traiter 15 ») : petit rond sur la bande. */
export function Compteur({ n }: { n: number | null | undefined }) {
  if (!n) return null;
  return (
    <span className="ml-1.5 inline-flex min-w-6 items-center justify-center rounded-full bg-muted px-1.5 text-xs leading-5 font-bold text-muted-foreground">
      {n}
    </span>
  );
}

/**
 * Une rangée d'onglets d'état (« À traiter 15 · Renvoyées 2 · Décidées ») : des boutons, l'ouvert souligné en vert. Le
 * rôle `tab` et `aria-selected` gardent la lecture des parcours d'avant.
 */
export function Onglets<T extends string>({
  libelle,
  onglets,
  valeur,
  changer,
  className,
}: {
  libelle: string;
  onglets: { valeur: T; libelle: string; compte?: number | null }[];
  valeur: T;
  changer: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={libelle}
      className={cn('flex gap-5 overflow-x-auto border-b border-border', className)}
    >
      {onglets.map((o) => {
        const ouvert = o.valeur === valeur;
        return (
          <button
            key={o.valeur}
            type="button"
            role="tab"
            aria-selected={ouvert}
            onClick={() => changer(o.valeur)}
            className={cn(
              '-mb-px flex min-h-11 shrink-0 cursor-pointer items-center border-0 border-b-[3px] bg-transparent px-0 font-sans text-[15px] font-bold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
              ouvert
                ? 'border-primary text-primary-strong'
                : 'border-transparent text-muted-foreground',
            )}
          >
            {o.libelle}
            <Compteur n={o.compte} />
          </button>
        );
      })}
    </div>
  );
}

/** Une puce de filtre (« Tous les relais », « Nom connu · 3 ») : contour, pleine quand elle est choisie. */
export function Puce({
  choisie,
  children,
  className,
  ...reste
}: { choisie?: boolean; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={choisie}
      className={cn(
        'inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 font-sans text-sm font-bold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
        choisie
          ? 'border-primary bg-succes text-primary-strong'
          : 'border-input bg-card text-foreground',
        className,
      )}
      {...reste}
    >
      {children}
    </button>
  );
}
