/**
 * Les classes Tailwind des pièces simples des écrans v2 (refonte, lot 2), nommées une fois : ce qui s'écrivait avant
 * `className="bouton bouton-secondaire"` ou `className="mention"` (composants.css, l'ancien admin.css) s'écrit
 * `className={v2.boutonSecondaire}` ou `className={v2.mention}`. Couleurs du thème seulement (les jetons).
 */
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/ui/shadcn/button';
import { classeChamp, classeZone } from './formulaire';

const pastille =
  'inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs leading-5 font-bold whitespace-nowrap';
const bande = 'm-0 flex items-start gap-2.5 rounded-md px-3 py-2.5 text-sm [&_p]:m-0';
const actions = 'flex flex-wrap items-center gap-2.5';
const motif =
  'grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] items-start gap-3 rounded-lg p-4';

export const v2 = {
  champ: classeChamp,
  zone: classeZone,
  /** Un libellé et son champ écrits à la main. */
  groupe:
    'flex min-w-0 flex-col gap-1.5 [&>label]:text-sm [&>label]:font-bold [&>span:first-child]:text-sm [&>span:first-child]:font-bold',
  mention: 'text-sm text-muted-foreground',
  mentionBloc: 'block text-sm text-muted-foreground',
  mentionLarge: 'col-span-full m-0 text-sm text-muted-foreground',
  mentionEmail: 'block text-sm text-muted-foreground [overflow-wrap:anywhere]',
  erreurLarge: 'col-span-full m-0 text-sm font-bold text-destructive',
  attention: 'm-0 text-sm font-bold text-bonus',
  titreLarge: 'col-span-full m-0 font-serif text-xl font-bold',
  deuxColonnes: 'grid grid-cols-2 gap-3',
  ligneChoix: 'flex flex-wrap gap-2',
  /** Une pastille à presser (filtre, choix court) : contour, vert pâle quand elle est choisie. */
  puce: 'inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-input bg-card px-3.5 font-sans text-sm font-bold whitespace-nowrap text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-succes aria-pressed:text-primary-strong',
  /** Un choix court dans une fiche (« Comme sur l'enseigne », « Sur la photo ») : rectangle, on agit. */
  puceCarree:
    'inline-flex min-h-10 shrink-0 cursor-pointer items-center rounded-md border border-input bg-card px-3 font-sans text-sm font-bold whitespace-nowrap text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-succes aria-pressed:text-primary-strong',
  /** Un formulaire qui attend la réponse de la base (fieldset désactivé). */
  occupe: 'm-0 flex min-w-0 flex-col gap-2 border-0 p-0',
  /** Un détail replié dans une fiche (« Implantation connue », « Plus d'options »). */
  plie: 'border-t border-border pt-1 [&>summary]:flex [&>summary]:min-h-11 [&>summary]:cursor-pointer [&>summary]:items-center [&>summary]:font-bold [&>summary]:text-primary-strong [&[open]>summary]:mb-2',
  doux: 'text-muted-foreground',
  erreur: 'm-0 text-sm font-bold text-destructive',
  pile: 'flex flex-col gap-4',
  pileSerree: 'flex flex-col gap-2',
  rang: 'flex flex-wrap items-start gap-3',
  rangLarge: 'col-span-full flex flex-wrap items-start gap-3',
  large: 'col-span-full',
  actions,
  actionsLarge: cn('col-span-full', actions),
  /** Un petit formulaire posé dans la page (motif, note, montant) : la bande du fond, champs en colonnes. */
  motif: cn(motif, 'bg-background'),
  motifPile: 'flex flex-col gap-2 rounded-lg bg-background p-4',
  motifBlanc: cn(motif, 'border border-border bg-card'),
  bouton: buttonVariants({ variant: 'default' }),
  boutonPetit: buttonVariants({ variant: 'default', size: 'sm' }),
  boutonSecondaire: buttonVariants({ variant: 'outline' }),
  boutonSecondairePetit: buttonVariants({ variant: 'outline', size: 'sm' }),
  boutonRefus: buttonVariants({ variant: 'destructive' }),
  boutonRefusPetit: buttonVariants({ variant: 'destructive', size: 'sm' }),
  /** Ajouté à un `Bouton` : la taille réduite. */
  petit: 'h-10 px-3 text-sm',
  lienDanger:
    'inline-flex min-h-11 w-fit cursor-pointer items-center border-0 bg-transparent p-0 font-sans text-[15px] font-bold text-destructive underline underline-offset-4',
  lien: 'inline-flex min-h-11 w-fit cursor-pointer items-center border-0 bg-transparent p-0 font-sans text-[15px] font-bold text-primary underline underline-offset-4',
  case: 'flex min-h-11 items-start gap-3 text-sm font-bold [&_input]:mt-0.5 [&_input]:size-[22px] [&_input]:shrink-0 [&_input]:accent-[var(--marque)]',
  bandeSucces: cn(bande, 'bg-succes text-succes-foreground'),
  bandeAttention: cn(bande, 'bg-attention text-attention-foreground'),
  /** Les pastilles d'état d'une fiche ou d'une école. */
  pastilleSucces: cn(pastille, 'bg-succes text-succes-foreground'),
  pastilleAttention: cn(pastille, 'bg-attention text-attention-foreground'),
  pastilleDanger: cn(pastille, 'bg-danger text-danger-foreground'),
  pastilleNeutre: cn(pastille, 'bg-muted text-muted-foreground'),
  /** Un tableau dans sa carte : en-tête sur la bande, capitales espacées, lignes séparées d'un filet. */
  tableau: cn(
    'overflow-x-auto rounded-xl border border-border bg-card',
    '[&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-[15px]',
    '[&_thead_th]:bg-muted [&_thead_th]:px-4 [&_thead_th]:py-3 [&_thead_th]:text-xs [&_thead_th]:font-bold [&_thead_th]:tracking-[0.08em] [&_thead_th]:text-muted-foreground [&_thead_th]:uppercase',
    '[&_tbody_td]:border-t [&_tbody_td]:border-border [&_tbody_td]:px-4 [&_tbody_td]:py-3 [&_tbody_td]:align-middle',
    '[&_tbody_th]:border-t [&_tbody_th]:border-border [&_tbody_th]:px-4 [&_tbody_th]:py-3 [&_tbody_th]:text-left [&_tbody_th]:align-middle',
  ),
  /** Une liste de définitions : le libellé doux à gauche, la valeur en gras. */
  champs:
    'm-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-2 text-[15px] [&_dd]:m-0 [&_dd]:font-bold [&_dt]:text-sm [&_dt]:text-muted-foreground [&>div]:contents',
  /** Un titre de section dans un écran (h2, h3). */
  titreSection: 'm-0 font-serif text-xl font-bold',
  surtitre: 'm-0 font-sans text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase',
  carte: 'flex flex-col gap-3 rounded-xl border border-border bg-card p-4',
} as const;
