/**
 * Les choix des planches v2 : la pastille (« On y voit », « Je n'ai pas pu », les repères : ça qualifie), le rectangle en
 * deux colonnes (Type, Niveaux : on choisit dans un formulaire), le disque de cycle (un cercle, parce qu'il nomme) et le
 * (i) d'aide qui s'ouvre en bulle sombre. Tailwind et Radix seulement.
 */
import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icone } from '@/ui/icones/Icone';
import { IconeFermer, IconeInfo } from '@/ui/shadcn/icones';

/** Une pastille à presser : bord doux au repos, vert pâle bordé de vert quand elle est choisie. */
export function Pastille({
  choisie,
  onClick,
  children,
  grande = false,
  icone,
}: {
  choisie: boolean;
  onClick: () => void;
  children: ReactNode;
  /** 48 px (étape 1) au lieu de 40 px. */
  grande?: boolean;
  icone?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={choisie}
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-full border font-sans font-bold outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2',
        grande ? 'min-h-11 px-3.5 text-[15px]' : 'min-h-10 px-3 text-sm',
        choisie
          ? 'border-2 border-primary bg-succes text-primary-strong'
          : 'border-input bg-card text-foreground',
      )}
    >
      {icone}
      {children}
    </button>
  );
}

const couleurDuCycle: Record<string, string> = {
  M: 'bg-cycle-m',
  P: 'bg-cycle-p',
  C: 'bg-cycle-c',
  L: 'bg-cycle-l',
  T: 'bg-cycle-t',
  S: 'bg-cycle-s',
};

/** Le disque d'un cycle (M, P, C, L, T, S) : un cercle de couleur, la lettre en blanc. */
export function DisqueCycle({ lettre, taille = 20 }: { lettre: string; taille?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: taille, height: taille, fontSize: Math.round(taille * 0.55) }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold text-blanc',
        couleurDuCycle[lettre] ?? 'bg-cycle-s',
      )}
    >
      {lettre}
    </span>
  );
}

/** Un choix de formulaire en rectangle (Type, Niveaux) : coché, il prend le vert pâle, le bord vert et la coche. */
export function ChoixRectangle({
  choisi,
  onClick,
  children,
  avant,
  role,
}: {
  choisi: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Ce qui précède le mot (un disque de cycle). */
  avant?: ReactNode;
  /** `radio` pour un choix unique (le type) ; sinon une bascule. */
  role?: 'radio';
}) {
  return (
    <button
      type="button"
      role={role}
      aria-pressed={role ? undefined : choisi}
      aria-checked={role ? choisi : undefined}
      onClick={onClick}
      className={cn(
        'flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-md border-2 px-2.5 font-sans text-[15px] font-bold outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2',
        choisi
          ? 'border-primary bg-succes text-primary-strong'
          : 'border-input bg-card text-foreground',
      )}
    >
      {choisi && <Icone nom="coche" className="size-4 [stroke-width:2.6]" />}
      {avant}
      {children}
    </button>
  );
}

/** Un groupe de rectangles en deux colonnes, avec son intitulé. */
export function GroupeDeChoix({
  legende,
  children,
  unique = false,
}: {
  legende: string;
  children: ReactNode;
  unique?: boolean;
}) {
  const id = useId();
  return (
    <section className="flex flex-col gap-2" aria-labelledby={id}>
      <span id={id} className="text-sm font-bold">
        {legende}
      </span>
      <div
        role={unique ? 'radiogroup' : 'group'}
        aria-labelledby={id}
        className="grid grid-cols-2 gap-2"
      >
        {children}
      </div>
    </section>
  );
}

/**
 * Le titre d'une partie d'étape (« La photo de l'école ») avec son (i) : l'aide s'ouvre en bulle sombre sous le bouton,
 * se ferme par la croix ou en touchant le (i) de nouveau. La règle reste dans l'aide, pas sous le champ.
 */
export function TitreAvecAide({
  titre,
  aide,
  libelleAide,
  niveau = 'h2',
}: {
  titre: ReactNode;
  aide: ReactNode;
  libelleAide: string;
  niveau?: 'h2' | 'b';
}) {
  const [ouverte, setOuverte] = useState(false);
  const id = useId();
  const Titre = niveau;
  return (
    <div className="relative flex items-center justify-between gap-2">
      <Titre
        className={cn(
          'm-0',
          niveau === 'h2' ? 'font-serif text-[19px] leading-tight font-bold' : 'text-[15px]',
        )}
      >
        {titre}
      </Titre>
      <button
        type="button"
        aria-label={libelleAide}
        aria-expanded={ouverte}
        aria-controls={id}
        onClick={() => setOuverte((o) => !o)}
        className={cn(
          '-my-1.5 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 p-0 text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
          ouverte ? 'bg-muted' : 'bg-transparent',
        )}
      >
        <IconeInfo className="size-[22px]" />
      </button>
      {ouverte && (
        <div
          id={id}
          role="note"
          className="absolute top-full right-0 z-20 mt-2 flex w-[min(300px,calc(100vw-48px))] items-start gap-2 rounded-lg bg-foreground py-3 pr-2 pl-3.5 text-base text-background shadow-lg"
        >
          <span aria-hidden className="absolute -top-1.5 right-4 size-3 rotate-45 bg-foreground" />
          <div className="flex-1 [&_p]:m-0">{aide}</div>
          <button
            type="button"
            aria-label="Fermer l’aide"
            onClick={() => setOuverte(false)}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-background outline-none focus-visible:ring-[3px] focus-visible:ring-jaune"
          >
            <IconeFermer className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Un choix unique en segments (planche « La rencontre » : Oui · Personne · Refus) : le segment choisi se détache en blanc. */
export function Segments<T extends string>({
  legende,
  options,
  valeur,
  surChoix,
}: {
  legende: string;
  options: readonly { valeur: T; libelle: string }[];
  valeur: T | null | undefined;
  surChoix: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={legende} className="flex rounded-[10px] bg-muted p-[3px]">
      {options.map((o) => {
        const choisi = valeur === o.valeur;
        return (
          <button
            key={o.valeur}
            type="button"
            aria-pressed={choisi}
            onClick={() => surChoix(o.valeur)}
            className={cn(
              'min-h-10 flex-1 cursor-pointer rounded-md border-0 font-sans text-sm font-bold outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
              choisi
                ? 'bg-card text-primary-strong shadow-[0_1px_2px_color-mix(in_srgb,var(--encre)_15%,transparent)]'
                : 'bg-transparent text-muted-foreground',
            )}
          >
            {o.libelle}
          </button>
        );
      })}
    </div>
  );
}
