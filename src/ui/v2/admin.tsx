/**
 * Les pièces v1 de l'administration, redessinées en v2 (refonte, lot 2) avec les mêmes propriétés : `Bouton`, `Dialogue`,
 * `SectionRepliable`, `ActionsSecondaires`, `Badge`, `BadgePublication`. Les écrans changent d'import, pas de code ; le
 * dessin vient de shadcn (Radix) et de Tailwind, sur les jetons.
 */
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/ui/shadcn/button';
import { IconeBas, IconeChargement, IconePoints } from '@/ui/shadcn/icones';

const variantes = {
  principal: 'default',
  secondaire: 'outline',
  discret: 'link',
  danger: 'destructive',
} as const;

/** Le bouton d'avant : `principal` plein, `secondaire` contour, `discret` en lien, `danger` en rouge. */
export function Bouton({
  variante = 'principal',
  enCours = false,
  texteEnCours = 'Enregistrement…',
  children,
  className = '',
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'principal' | 'secondaire' | 'discret' | 'danger';
  enCours?: boolean;
  texteEnCours?: string;
}) {
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      className={cn(
        buttonVariants({ variant: variantes[variante], size: 'default' }),
        variante === 'discret' && 'min-h-11',
        className,
      )}
      disabled={disabled || enCours}
      aria-busy={enCours || undefined}
    >
      {enCours ? (
        <>
          <IconeChargement className="size-4 animate-spin" aria-hidden />
          {texteEnCours}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export type EtatPublication =
  'a_situer' | 'prete' | 'publiee' | 'retiree' | 'corbeille' | 'brouillon';

const publications: Record<EtatPublication, [string, string]> = {
  a_situer: ['Sans position', 'bg-muted text-muted-foreground'],
  prete: ['Prête', 'bg-attention text-attention-foreground'],
  publiee: ['Publiée', 'bg-succes text-succes-foreground'],
  retiree: ['Retirée', 'bg-danger text-danger-foreground'],
  corbeille: ['À la corbeille', 'bg-danger text-danger-foreground'],
  brouillon: ['Brouillon', 'bg-muted text-muted-foreground'],
};

const pastille =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs leading-5 font-bold whitespace-nowrap';

export function Badge({
  role,
  children,
}: {
  role: 'terrain' | 'photo' | 'direction';
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        pastille,
        role === 'direction' ? 'bg-succes text-succes-foreground' : 'bg-muted text-foreground',
      )}
    >
      {children}
    </span>
  );
}

/** L'état d'une école (planche « Écoles ») ; « À situer » se dit « Sans position ». */
export function BadgePublication({ etat }: { etat: EtatPublication }) {
  const [texte, ton] = publications[etat];
  return <span className={cn(pastille, ton)}>{texte}</span>;
}

/** Le menu « ⋯ » d'une ligne : une liste de boutons native ; Tab parcourt les actions, Échap rend le focus. */
export function ActionsSecondaires({
  nom,
  children,
  versLeHaut = false,
}: {
  nom: string;
  children: ReactNode;
  /** Dans une barre du bas, le menu s'ouvre au-dessus. */
  versLeHaut?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dehors = (e: PointerEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target) && ref.current)
        ref.current.open = false;
    };
    document.addEventListener('pointerdown', dehors);
    return () => document.removeEventListener('pointerdown', dehors);
  }, []);
  return (
    <details
      ref={ref}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && ref.current?.open) {
          e.preventDefault();
          e.stopPropagation();
          ref.current.open = false;
          ref.current.querySelector('summary')?.focus();
        }
      }}
      onBlur={(e) => {
        if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget))
          e.currentTarget.open = false;
      }}
    >
      <summary
        aria-label={`Autres actions pour ${nom}`}
        className={cn(
          buttonVariants({ variant: 'quiet', size: 'icon' }),
          'list-none [&::-webkit-details-marker]:hidden',
        )}
      >
        <IconePoints className="size-5" aria-hidden />
      </summary>
      <div
        className={cn(
          'absolute right-0 z-30 flex min-w-60',
          versLeHaut ? 'bottom-full mb-1' : 'mt-1',
          ' flex-col overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg [&_a]:flex [&_a]:min-h-11 [&_a]:items-center [&_a]:px-4 [&_a]:text-[15px] [&_a]:font-bold [&_a]:text-foreground [&_a]:no-underline [&_button]:flex [&_button]:min-h-11 [&_button]:w-full [&_button]:cursor-pointer [&_button]:items-center [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-4 [&_button]:text-left [&_button]:font-sans [&_button]:text-[15px] [&_button]:font-bold [&_button]:text-foreground [&_button:hover]:bg-muted',
        )}
      >
        {children}
      </div>
    </details>
  );
}

/** Une section repliable : le navigateur gère Entrée, Espace et le focus ; replier conserve les champs saisis. */
export function SectionRepliable({
  titre,
  synthese,
  children,
  ouverte = false,
}: {
  titre: string;
  synthese: string;
  children: ReactNode;
  ouverte?: boolean;
}) {
  return (
    <details className="group rounded-xl border border-border bg-card" open={ouverte || undefined}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[17px] font-bold">{titre}</span>
          <span className="text-sm text-muted-foreground">{synthese}</span>
        </span>
        <IconeBas
          className="size-5 text-primary-strong transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="flex flex-col gap-4 border-t border-border p-4">{children}</div>
    </details>
  );
}

const dessins = {
  dialogue:
    'top-1/2 left-1/2 max-h-[90dvh] w-[min(94vw,40rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl',
  confirmation:
    'top-1/2 left-1/2 max-h-[90dvh] w-[min(94vw,30rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl',
  tiroir: 'inset-y-0 right-0 h-dvh w-full sm:max-w-xl',
  feuille: 'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl',
} as const;

/**
 * Une seule fenêtre modale (Radix) : le titre la nomme, « Fermer » en haut, Échap la ferme sauf pendant un envoi. Le
 * focus revient d'où l'on vient, ou au titre de l'écran (`data-retour-liste`) si cet endroit a disparu.
 */
export function Dialogue({
  titre,
  fermer,
  children,
  integre = false,
  variante = 'dialogue',
  entete,
  retourFocus,
  occupe = false,
  description,
  libelleFermeture = 'Fermer',
}: {
  titre: string;
  fermer: () => void;
  children: ReactNode;
  integre?: boolean;
  variante?: 'dialogue' | 'tiroir' | 'confirmation' | 'feuille';
  entete?: ReactNode;
  retourFocus?: HTMLElement | null;
  occupe?: boolean;
  description?: string | undefined;
  libelleFermeture?: string;
}) {
  const idDescription = useId();
  const origine = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (integre) return;
    origine.current =
      retourFocus ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    return () => {
      const o = origine.current;
      // Après le démontage de Radix, qui rend lui aussi le focus : on passe en dernier.
      setTimeout(() => {
        if (o?.isConnected) o.focus();
        else document.querySelector<HTMLElement>('[data-retour-liste]')?.focus();
      }, 0);
    };
  }, [integre, retourFocus]);
  if (integre) return <div className="flex flex-col gap-4">{children}</div>;
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && !occupe && fermer()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/55" />
        <DialogPrimitive.Content
          role={variante === 'confirmation' ? 'alertdialog' : 'dialog'}
          aria-label={titre}
          aria-describedby={description ? idDescription : undefined}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            if (occupe) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (occupe || variante === 'dialogue' || variante === 'confirmation')
              e.preventDefault();
          }}
          className={cn(
            'fixed z-50 flex flex-col overflow-y-auto bg-card font-sans text-foreground shadow-lg outline-none',
            dessins[variante],
          )}
        >
          <DialogPrimitive.Title className="sr-only">{titre}</DialogPrimitive.Title>
          <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-border bg-card px-5 py-3.5">
            <div className="flex min-w-0 flex-1 flex-col gap-1 [&_b]:font-serif [&_b]:text-xl [&_h2]:m-0 [&_h2]:font-serif [&_h2]:text-xl">
              {entete}
            </div>
            <button
              type="button"
              disabled={occupe}
              onClick={fermer}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {libelleFermeture}
            </button>
          </header>
          <div className="flex flex-col gap-4 px-5 py-4">
            {description && (
              <p className="m-0 text-sm text-muted-foreground" id={idDescription}>
                {description}
              </p>
            )}
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
