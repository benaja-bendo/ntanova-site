/**
 * Les états que les planches ne dessinent pas (chargement, vide), avec les mêmes formes qu'elles : un cadre d'écran, des
 * cartes qui respirent, jamais un message brut. Tailwind et shadcn seulement.
 */
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/shadcn/alert-dialog';
import { Button } from '@/ui/shadcn/button';
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

const tons = {
  succes: 'bg-succes text-succes-foreground',
  attention: 'bg-attention text-attention-foreground',
  danger: 'bg-danger text-danger-foreground',
  neutre: 'bg-muted text-foreground',
} as const;

/**
 * Une bande d'information (planche : « Tout est envoyé · dernier envoi à 16 h 36 ») : un fond d'état, une icône, une
 * phrase courte, au besoin un geste dessous. Jamais un mur de texte : la règle va dans l'aide.
 */
export function Bande({
  ton,
  icone,
  children,
  action,
  role,
  className,
}: {
  ton: keyof typeof tons;
  icone?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  role?: 'status' | 'alert' | undefined;
  className?: string;
}) {
  return (
    <div
      role={role}
      className={cn(
        'flex flex-col gap-2.5 rounded-md px-3 py-2.5 text-sm [&_p]:m-0',
        tons[ton],
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        {icone && <span className="mt-px flex [&>svg]:size-5">{icone}</span>}
        <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
      </div>
      {action && <div className="flex flex-wrap gap-2 pl-[30px]">{action}</div>}
    </div>
  );
}

/**
 * Une confirmation avant un geste qui ne se défait pas (retirer une fiche du téléphone) : la fenêtre shadcn, le titre en
 * question, ce qui va se passer, « Annuler » d'abord, le geste en rouge. L'attente se voit (« … »), un échec se dit et on
 * peut réessayer.
 */
export function Confirmer({
  libelle,
  titre,
  description,
  confirmer,
  enCours = 'En cours…',
  surConfirmer,
  declencheur,
}: {
  libelle: string;
  titre: string;
  description: string;
  confirmer: string;
  enCours?: string;
  /** Rend une raison si le geste n'a pas abouti. */
  surConfirmer: () => Promise<string | void>;
  /** Le bouton qui ouvre la fenêtre ; par défaut, un bouton discret rouge. */
  declencheur?: 'discret' | 'contour';
}) {
  const [ouverte, setOuverte] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const agir = async () => {
    setOccupe(true);
    setErreur(null);
    try {
      const raison = await surConfirmer();
      if (raison) setErreur(raison);
      else setOuverte(false);
    } catch {
      setErreur('Le geste n’a pas abouti. Réessayez.');
    } finally {
      setOccupe(false);
    }
  };
  return (
    <AlertDialog open={ouverte} onOpenChange={(o) => !occupe && setOuverte(o)}>
      <Button
        variant={declencheur === 'contour' ? 'destructive' : 'ghost'}
        size="lg"
        className={declencheur === 'contour' ? 'w-full' : 'self-center text-destructive'}
        onClick={() => {
          setErreur(null);
          setOuverte(true);
        }}
      >
        {libelle}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titre}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {erreur && (
          <p
            role="alert"
            className="m-0 rounded-md bg-danger px-3 py-2 text-sm text-danger-foreground"
          >
            {erreur}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" size="lg" disabled={occupe}>
              Annuler
            </Button>
          </AlertDialogCancel>
          <Button
            variant="destructive"
            size="lg"
            aria-busy={occupe || undefined}
            disabled={occupe}
            onClick={(ev) => {
              ev.preventDefault();
              void agir();
            }}
          >
            {occupe ? enCours : confirmer}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
