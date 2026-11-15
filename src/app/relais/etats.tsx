/**
 * Les états que les planches ne dessinent pas (chargement, vide), avec les mêmes formes qu'elles : un cadre d'écran, des
 * cartes qui respirent, jamais un message brut. Tailwind et shadcn seulement.
 */
import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
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

export { Bande } from '@/ui/v2/bande';

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
  const fait = useRef(false);
  const agir = async () => {
    setOccupe(true);
    setErreur(null);
    try {
      const raison = await surConfirmer();
      if (raison) setErreur(raison);
      else {
        fait.current = true;
        setOuverte(false);
      }
    } catch {
      setErreur('L’action n’a pas abouti. Réessayez.');
    } finally {
      setOccupe(false);
    }
  };
  return (
    <AlertDialog open={ouverte} onOpenChange={(o) => !occupe && setOuverte(o)}>
      <AlertDialogTrigger asChild>
        <Button
          variant={declencheur === 'contour' ? 'destructive' : 'ghost'}
          size="lg"
          className={declencheur === 'contour' ? 'w-full' : 'self-center text-destructive'}
          onClick={() => setErreur(null)}
        >
          {libelle}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        onCloseAutoFocus={(e) => {
          // Le geste a abouti (la fiche n'existe plus) : le focus va au titre de l'écran, pas au bouton disparu.
          if (!fait.current) return;
          e.preventDefault();
          document.querySelector<HTMLElement>('[data-retour-liste]')?.focus();
        }}
      >
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
