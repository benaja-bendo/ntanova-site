/**
 * Les pièces de « Messages reçus » (refonte publique, lot 3B2 ; planches du canevas admin, page Admin) : sans réseau ni règle
 * métier, elles ne font que montrer. Cibles de 44 px au moins, au doigt comme à la souris ; la couleur ne vient jamais sans un mot.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icone } from '@/ui/icones/Icone';
import { Bouton } from './admin';
import { v2 } from './classes';

export type Ton = 'succes' | 'attention' | 'danger' | 'neutre';

const pastille: Record<Ton, string> = {
  succes: v2.pastilleSucces,
  attention: v2.pastilleAttention,
  danger: v2.pastilleDanger,
  neutre: cn(v2.pastilleNeutre, 'text-foreground'),
};

/** Une pastille d'état : un mot, jamais une action. */
export function PastilleMessage({ ton, children }: { ton: Ton; children: ReactNode }) {
  return <span className={cn(pastille[ton], 'whitespace-normal')}>{children}</span>;
}

export function Pastilles({ liste }: { liste: readonly { ton: Ton; texte: string }[] }) {
  if (liste.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {liste.map((p) => (
        <PastilleMessage key={p.texte} ton={p.ton}>
          {p.texte}
        </PastilleMessage>
      ))}
    </span>
  );
}

/** Une référence : des chiffres alignés, jamais coupée. */
export function Reference({ children, className }: { children: string; className?: string }) {
  return (
    <span className={cn('tracking-[0.02em] whitespace-nowrap tabular-nums', className)}>
      {children}
    </span>
  );
}

/** Une ligne d'une file : un lien vers le message. L'ouvrir fige son texte ; rien ne s'ouvre avant l'appui. */
export function CarteMessage({
  href,
  courante,
  surAppui,
  nature,
  reference,
  titre,
  precision,
  pastilles,
}: {
  href: string;
  courante: boolean;
  surAppui: () => void;
  nature: string;
  reference: string;
  titre: string;
  precision: string;
  pastilles: readonly { ton: Ton; texte: string }[];
}) {
  return (
    <a
      href={href}
      aria-current={courante ? 'true' : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        surAppui();
      }}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 text-foreground no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring aria-[current=true]:border-2 aria-[current=true]:border-primary aria-[current=true]:px-[13px] aria-[current=true]:py-[11px] [@media(hover:hover)]:hover:border-primary"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <PastilleMessage ton="neutre">{nature}</PastilleMessage>
          <Reference>{reference}</Reference>
        </span>
        <b className="font-serif text-[17px] leading-snug [overflow-wrap:anywhere]">{titre}</b>
        <span className="text-sm text-muted-foreground">{precision}</span>
        <Pastilles liste={pastilles} />
      </span>
      <Icone nom="suite" className="size-5 shrink-0 lg:hidden" aria-hidden />
    </a>
  );
}

/** Un bloc titré d'un message : des libellés et des valeurs, tels qu'ils sont écrits. */
export function BlocMessage({ titre, children }: { titre: string; children: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col rounded-xl border border-border bg-card px-4 pt-1 pb-2"
    >
      <h3
        id={id}
        className="m-0 pt-2.5 pb-1.5 font-sans text-sm font-bold tracking-[0.04em] text-muted-foreground uppercase"
      >
        {titre}
      </h3>
      {children}
    </section>
  );
}

export function LigneMessageEcrite({
  libelle,
  children,
}: {
  libelle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col border-t border-border py-2.5">
      {libelle && <span className="text-sm font-bold text-muted-foreground">{libelle}</span>}
      <div className="[overflow-wrap:anywhere] whitespace-pre-wrap">{children}</div>
    </div>
  );
}

/** L'historique : un jour, un fait. */
export function Journal({ faits }: { faits: readonly { quand: string; quoi: string }[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0 pt-1 pb-2.5">
      {faits.map((f, i) => (
        <li key={i} className="flex gap-3 text-[15px]">
          <span className="w-[7.5rem] shrink-0 text-muted-foreground tabular-nums">{f.quand}</span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{f.quoi}</span>
        </li>
      ))}
    </ol>
  );
}

/** Un encart dans un message (version, suite, limite, clôture) : blanc, ou vert quand c'est fait. */
export function Encart({
  titre,
  children,
  ton = 'neutre',
  action,
  role,
}: {
  titre: ReactNode;
  children?: ReactNode;
  ton?: 'neutre' | 'succes' | 'attention';
  action?: ReactNode;
  role?: 'status';
}) {
  return (
    <div
      role={role}
      className={cn(
        'flex flex-col items-start gap-1 rounded-xl border px-4 py-3 text-[15px] [&_p]:m-0',
        ton === 'neutre' && 'border-border bg-card',
        ton === 'succes' && 'border-primary bg-succes',
        ton === 'attention' && 'border-ambre bg-attention',
      )}
    >
      <b>{titre}</b>
      {children}
      {action}
    </div>
  );
}

/** Un geste qui n'a pas abouti, ou une lecture en panne : ce qu'on sait, et ce qu'on peut faire. Jamais la saisie effacée. */
export function BandeauEchec({
  titre,
  children,
  action,
  libelleAction,
  enCours = false,
  autre,
}: {
  titre: string;
  children: ReactNode;
  action?: (() => void) | undefined;
  libelleAction?: string;
  enCours?: boolean;
  autre?: ReactNode;
}) {
  // Le geste est parfois plus bas que le bandeau : l'échec se montre, sous la barre du haut, sans voler le focus.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  return (
    <div
      ref={ref}
      role="alert"
      className="flex scroll-mt-20 scroll-mb-40 flex-col items-start gap-2.5 rounded-xl border-2 border-destructive bg-card px-4 py-3 text-[15px] [&_p]:m-0"
    >
      <span className="flex flex-col gap-1">
        <b>{titre}</b>
        <span>{children}</span>
      </span>
      {(action || autre) && (
        <span className="flex flex-wrap gap-2">
          {action && (
            <Bouton
              variante="secondaire"
              onClick={action}
              enCours={enCours}
              texteEnCours="Lecture…"
            >
              {libelleAction}
            </Bouton>
          )}
          {autre}
        </span>
      )}
    </div>
  );
}

/** Un choix unique en lignes entières (52 px), rien de coché d'avance. Des boutons radio natifs : les flèches marchent. */
export function ChoixUnique<T extends string>({
  legende,
  options,
  valeur,
  surChoix,
  cacherLegende = false,
  desactive = false,
}: {
  legende: string;
  options: readonly { valeur: T; libelle: string; aide?: string }[];
  valeur: T | null;
  surChoix: (v: T) => void;
  cacherLegende?: boolean;
  desactive?: boolean;
}) {
  const nom = useId();
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" disabled={desactive}>
      <legend className={cn('mb-2 p-0 text-sm font-bold', cacherLegende && 'sr-only')}>
        {legende}
      </legend>
      {options.map((o) => (
        <label key={o.valeur} className={classeChoix(valeur === o.valeur)}>
          <input
            type="radio"
            name={nom}
            value={o.valeur}
            checked={valeur === o.valeur}
            onChange={() => surChoix(o.valeur)}
            className="size-[22px] shrink-0 accent-[var(--marque)]"
          />
          <span className="flex min-w-0 flex-col">
            <span>{o.libelle}</span>
            {o.aide && <span className="text-sm text-muted-foreground">{o.aide}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

const classeChoix = (choisi: boolean) =>
  cn(
    'flex min-h-[52px] cursor-pointer items-center gap-3 rounded-md border bg-card px-3 py-2 text-base focus-within:ring-[3px] focus-within:ring-ring',
    choisi ? 'border-2 border-primary bg-succes px-[11px] py-[7px]' : 'border-input',
  );

/** Plusieurs choix, mêmes lignes : « ce que tu retires ». */
export function ChoixMultiple<T extends string>({
  legende,
  options,
  valeurs,
  surChoix,
}: {
  legende: string;
  options: readonly { valeur: T; libelle: string }[];
  valeurs: readonly T[];
  surChoix: (v: T) => void;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-sm font-bold">{legende}</legend>
      {options.map((o) => (
        <label key={o.valeur} className={classeChoix(valeurs.includes(o.valeur))}>
          <input
            type="checkbox"
            checked={valeurs.includes(o.valeur)}
            onChange={() => surChoix(o.valeur)}
            className="size-[22px] shrink-0 accent-[var(--marque)]"
          />
          <span>{o.libelle}</span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Le jour réel d'un fait : « Aujourd'hui » ou un autre jour, sur un appui. Rien n'est coché d'avance, jamais de jour futur
 * (règle du 20/11). `valeur` : le jour choisi, vide tant qu'il ne l'est pas ; `mode` : ce qui est coché.
 */
export interface JourChoisi {
  mode: 'aujourdhui' | 'autre' | null;
  jour: string;
}
export const JOUR_NON_CHOISI: JourChoisi = { mode: null, jour: '' };

export function ChoixDuJour({
  legende,
  aujourdHui,
  depuis,
  valeur,
  surChoix,
}: {
  legende: string;
  aujourdHui: string;
  depuis?: string | undefined;
  valeur: JourChoisi;
  surChoix: (j: JourChoisi) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <ChoixUnique
        legende={legende}
        options={[
          { valeur: 'aujourdhui', libelle: 'Aujourd’hui' },
          { valeur: 'autre', libelle: 'Un autre jour' },
        ]}
        valeur={valeur.mode}
        surChoix={(mode) => surChoix({ mode, jour: mode === 'aujourdhui' ? aujourdHui : '' })}
      />
      {valeur.mode === 'autre' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="text-sm font-bold">
            Le jour
          </label>
          <input
            id={id}
            type="date"
            max={aujourdHui}
            min={depuis}
            value={valeur.jour}
            onChange={(e) => surChoix({ mode: 'autre', jour: e.target.value })}
            className={cn(v2.champ, 'max-w-[220px]')}
          />
        </div>
      )}
    </div>
  );
}

/** Les étapes d'un retrait : ce qui est fait, ce qui vient, ce qui est sans objet. Le mot dit l'état, pas la couleur. */
export function ListeEtapes({
  etapes,
}: {
  etapes: readonly {
    titre: string;
    etat: 'faite' | 'courante' | 'a_venir' | 'sans_objet';
    mot: string;
  }[];
}) {
  return (
    <ol className="m-0 flex list-none flex-col p-0 pt-1 pb-2">
      {etapes.map((e, i) => (
        <li
          key={e.titre}
          className="flex items-start gap-3 py-1.5"
          aria-current={e.etat === 'courante' ? 'step' : undefined}
        >
          <span
            aria-hidden
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold',
              e.etat === 'faite' && 'border-primary bg-primary text-primary-foreground',
              e.etat === 'courante' && 'border-primary bg-succes text-primary-strong',
              (e.etat === 'a_venir' || e.etat === 'sans_objet') && 'border-input bg-card',
            )}
          >
            {i + 1}
          </span>
          <span className="flex min-w-0 flex-col">
            <b
              className={cn(e.etat !== 'faite' && e.etat !== 'courante' && 'text-muted-foreground')}
            >
              {e.titre}
            </b>
            <span className="text-sm text-muted-foreground">{e.mot}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Rien dans la file : ce que cela veut dire, en une ligne. */
export function FileVide({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-dashed border-input bg-card px-4 py-6 text-center">
      <b>{titre}</b>
      <span className="text-sm text-muted-foreground">{children}</span>
    </div>
  );
}

/** Une lecture en cours : trois blocs gris, dits à voix haute une fois. */
export function Squelette({ libelle }: { libelle: string }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-2.5">
      <span role="status" className="text-sm text-muted-foreground">
        {libelle}
      </span>
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden className="h-[86px] rounded-lg bg-muted" />
      ))}
    </div>
  );
}
