/**
 * L'aperçu, dans l'administration, du rond que la page montre à une école sans logo (« option C », 27/11/2026) : la même
 * règle et le même dessin que la fiche publique (`modele/rond-ecole.ts`). Décoratif : la phrase à côté le dit. Tailwind seul.
 */
import { cn } from '@/lib/utils';
import { ICONES } from '../../modele/carte/icones';
import { longueurDuSigle, type RondSansLogo } from '../../modele/rond-ecole';
import { couleurDuCycle } from './choix';

const tailleDuSigle = {
  court: 'text-[13px]',
  moyen: 'text-[11px]',
  long: 'text-[9px]',
  'tres-long': 'text-[7px] max-w-[82%] break-all whitespace-normal',
} as const;

export function ApercuRond({ rond }: { rond: RondSansLogo }) {
  const sigle = rond.genre === 'sigle' ? rond.texte : null;
  return (
    <span
      aria-hidden="true"
      data-rond={rond.genre === 'cycle' ? `cycle-${rond.lettre}` : rond.genre}
      className={cn(
        'inline-flex size-14 shrink-0 flex-col items-center justify-center overflow-hidden rounded-full',
        rond.genre === 'sigle' && 'bg-primary-strong text-primary-foreground',
        rond.genre === 'cycle' && cn(couleurDuCycle[rond.lettre], 'text-blanc'),
        rond.genre === 'vide' && 'bg-[var(--carte-epingle-neutre)] text-blanc',
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={sigle ? 'size-[22px]' : 'size-8'}
      >
        {ICONES.ecoleToque.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      {sigle && (
        <span
          className={cn(
            'max-w-[90%] text-center font-serif leading-none font-bold whitespace-nowrap',
            tailleDuSigle[longueurDuSigle(sigle)],
          )}
        >
          {sigle}
        </span>
      )}
    </span>
  );
}
