/**
 * Les champs et les choix des formulaires de l'espace relais, en v2 (planches du 13/11) : même usage que `Champ` et `Choix`
 * de `ui/composants` (l'étiquette, l'aide, l'erreur reliées au champ), dessinés en Tailwind. Un choix en colonnes est un
 * rectangle (on agit dans un formulaire) ; sans colonnes, une pastille (ça qualifie : « On y voit », les repères).
 */
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/ui/shadcn/button';
import { Icone as IconeV2 } from '@/ui/icones/Icone';
import type { NomIcone } from '@/ui/icones/registre';
import { ChoixRectangle, Pastille } from './choix';
import { Bande } from './etats';

/** Le dessin d'un champ texte (shadcn `Input`), pour les `<input>` et `<select>` écrits à la main. */
export const classeChamp =
  'h-[52px] w-full min-w-0 rounded-md border-2 border-input bg-card px-3.5 font-sans text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-invalid:border-destructive disabled:opacity-50';

/** Une zone de texte sur plusieurs lignes. */
export const classeZone = cn(classeChamp, 'h-auto min-h-24 py-3 leading-snug');

/** Un bouton dessiné comme ceux de shadcn, pour un `<label>` qui ouvre l'appareil photo ou un `<a>`. */
export const classeBouton = (...arguments_: Parameters<typeof buttonVariants>) =>
  cn(buttonVariants(...arguments_));

export function Erreur({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="m-0 text-sm font-bold text-destructive">
      {children}
    </p>
  );
}

export function Champ({
  libelle,
  facultatif,
  aide,
  erreur,
  children,
}: {
  libelle: string;
  facultatif?: boolean;
  aide?: string | undefined;
  erreur?: string | undefined;
  children: (attributs: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}) {
  const id = useId();
  const decrit = [aide ? `${id}-aide` : null, erreur ? `${id}-erreur` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {libelle}{' '}
        {facultatif && <span className="font-normal text-muted-foreground">(facultatif)</span>}
      </label>
      {children({ id, 'aria-invalid': !!erreur, 'aria-describedby': decrit || undefined })}
      {aide && (
        <span id={`${id}-aide`} className="text-[13px] text-muted-foreground">
          {aide}
        </span>
      )}
      {erreur && <Erreur id={`${id}-erreur`}>{erreur}</Erreur>}
    </div>
  );
}

export function Choix<T extends string>({
  legende,
  options,
  valeurs,
  surChoix,
  colonnes,
  erreur,
  avant,
  cacherLegende = false,
  petites = false,
}: {
  legende: string;
  options: readonly { valeur: T; libelle: string }[];
  valeurs: readonly T[];
  surChoix: (valeur: T) => void;
  colonnes?: number;
  erreur?: string | undefined;
  /** Ce qui précède le mot d'une option (le disque d'un cycle). */
  avant?: (valeur: T) => ReactNode;
  cacherLegende?: boolean;
  /** Des pastilles de 40 px (« Qui ? »), pour une liste longue. */
  petites?: boolean;
}) {
  const idErreur = useId();
  return (
    <fieldset
      className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
      aria-describedby={erreur ? idErreur : undefined}
    >
      <legend className={cn('mb-2 p-0 text-sm font-bold', cacherLegende && 'sr-only')}>
        {legende}
      </legend>
      {colonnes ? (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))` }}
        >
          {options.map((o) => (
            <ChoixRectangle
              key={o.valeur}
              choisi={valeurs.includes(o.valeur)}
              onClick={() => surChoix(o.valeur)}
              avant={avant?.(o.valeur)}
            >
              {o.libelle}
            </ChoixRectangle>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <Pastille
              key={o.valeur}
              grande={!petites}
              choisie={valeurs.includes(o.valeur)}
              onClick={() => surChoix(o.valeur)}
            >
              {o.libelle}
            </Pastille>
          ))}
        </div>
      )}
      {erreur && <Erreur id={idErreur}>{erreur}</Erreur>}
    </fieldset>
  );
}

/** Une case à cocher (accord, « Je les ai prises en photo ») : 22 px, le texte cliquable. */
export function Case({
  checked,
  onChange,
  children,
  id,
}: {
  checked: boolean;
  onChange: (coche: boolean) => void;
  children: ReactNode;
  id?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-[15px]">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-[22px] shrink-0 accent-[var(--marque)]"
      />
      <span>{children}</span>
    </label>
  );
}

const icones1 = {
  coche: 'coche',
  retour: 'retour',
  suivant: 'suite',
  plus: 'plus',
  carte: 'carte',
  fiche: 'fiche',
  nuage: 'nuage',
  cadenas: 'cadenas',
  oeil: 'oeil',
  horloge: 'attente',
  photo: 'camera',
  galerie: 'galerie',
  alerte: 'alerte',
  horsLigne: 'horsLigne',
  piece: 'paie',
  mission: 'missions',
  aide: 'aide',
  personne: 'compte',
} as const satisfies Record<string, NomIcone>;

/** Les noms d'icônes des écrans d'avant, dessinés par le registre v2. */
export function Icone({ nom, taille = 20 }: { nom: keyof typeof icones1; taille?: number }) {
  return <IconeV2 nom={icones1[nom]} style={{ width: taille, height: taille }} />;
}

const tons = {
  public: 'succes',
  prive: 'neutre',
  attente: 'attention',
  erreur: 'danger',
  envoye: 'succes',
} as const;

/** Un bandeau des écrans d'avant (ton, icône), dessiné en bande v2. */
export function Bandeau({
  ton,
  icone,
  children,
}: {
  ton: keyof typeof tons;
  icone?: keyof typeof icones1;
  children: ReactNode;
}) {
  return (
    <Bande ton={tons[ton]} icone={icone ? <Icone nom={icone} /> : undefined}>
      {children}
    </Bande>
  );
}
