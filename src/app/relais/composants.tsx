/**
 * Les composants propres à l'espace relais (v2, planches du 13/11) ; le cadre des écrans principaux est dans `cadre.tsx`.
 */
import { titreDeLEcran, type FicheLocale } from '../../modele/fiche';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/shadcn/button';
import { IconeNuage, IconeRetour } from '@/ui/shadcn/icones';
import { BarreDuBas, EnTete, HorsLigne } from './cadre';
import { aller } from './contexte';
import { Bande } from './etats';

/**
 * Une nouvelle version de l'application est prête. Le relais recharge quand il le décide : la page ne se recharge
 * jamais seule, et ses fiches (gardées dans le téléphone) y survivent.
 */
export function BandeauVersion() {
  return (
    <div className="fixed inset-x-0 bottom-[76px] z-30 mx-auto max-w-[40rem] px-4" role="status">
      <Bande
        ton="attention"
        icone={<IconeNuage />}
        className="shadow-lg"
        action={
          <Button variant="outline" size="sm" onClick={() => location.reload()}>
            Recharger
          </Button>
        }
      >
        <p>
          <b>Nouvelle version prête.</b> Rechargez quand vous le pouvez. Vos fiches restent sur le
          téléphone.
        </p>
      </Bande>
    </div>
  );
}

/** L'en-tête d'un écran principal (le titre est le h1 de l'écran). */
export function Entete({ titre }: { titre: string; principal?: boolean }) {
  return <EnTete titre={titre} />;
}

/** La barre du bas. */
export function Navigation() {
  return <BarreDuBas />;
}

/** Les quatre étapes d'une fiche, nommées sous la barre (planche « Relais · étape 1 »). */
const ETAPES = ['Photo et lieu', 'L’établissement', 'La rencontre', 'Bonus'] as const;

/**
 * L'en-tête des étapes d'une fiche : « AJOUTER UNE ÉCOLE » (ou « Corriger une fiche », « Compléter une école ») au-dessus
 * du titre de l'étape, « 2 sur 3 » à droite, puis quatre barres et leurs noms ; la quatrième, le bonus, est jaune pâle.
 */
export function EnteteEtape({
  etape,
  titre,
  retour,
  type,
}: {
  etape: 1 | 2 | 3 | 4;
  titre: string;
  retour: string;
  type: FicheLocale['type'];
}) {
  return (
    <header className="sticky top-0 z-10 flex flex-col gap-1.5 border-b border-border bg-card px-3 pt-2 pb-2.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={etape === 1 ? 'Retour aux missions' : `Retour à l'étape ${etape - 1}`}
          onClick={() => aller(retour)}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          <IconeRetour className="size-[22px]" />
        </button>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            {titreDeLEcran(type)}
          </span>
          <h1 className="m-0 font-serif text-xl leading-tight font-bold" tabIndex={-1}>
            {titre}
          </h1>
        </span>
        <HorsLigne />
        {etape === 4 ? (
          <span className="rounded-full bg-attention px-2.5 py-0.5 text-sm font-bold">Bonus</span>
        ) : (
          <span className="text-sm font-bold text-muted-foreground">{etape} sur 3</span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1.5 px-1" aria-hidden>
        {ETAPES.map((nom, i) => (
          <span
            key={nom}
            className={cn(
              'h-[5px] rounded-full',
              i + 1 <= etape
                ? i === 3
                  ? 'bg-jaune'
                  : 'bg-primary'
                : i === 3
                  ? 'bg-attention'
                  : 'bg-border',
            )}
          />
        ))}
      </div>
      <ol className="m-0 grid list-none grid-cols-4 gap-1.5 p-0 px-1" aria-label="Les étapes">
        {ETAPES.map((nom, i) => (
          <li
            key={nom}
            aria-current={i + 1 === etape ? 'step' : undefined}
            className={cn(
              'truncate text-[11px] font-bold',
              i === 3
                ? 'text-bonus'
                : i + 1 <= etape
                  ? 'text-primary-strong'
                  : 'text-muted-foreground',
            )}
          >
            {nom}
          </li>
        ))}
      </ol>
    </header>
  );
}

export { heure, jour } from '../../ui/composants';
