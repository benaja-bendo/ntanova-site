import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

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
      className={`bouton action-${variante} ${className}`}
      disabled={disabled || enCours}
      aria-busy={enCours || undefined}
    >
      {enCours ? (
        <>
          <span className="roue" aria-hidden="true" />
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
const publications: Record<EtatPublication, string> = {
  a_situer: 'À situer',
  prete: 'Prête',
  publiee: 'Publiée',
  retiree: 'Retirée',
  corbeille: 'À la corbeille',
  brouillon: 'Brouillon',
};
export function Badge({
  role,
  children,
}: {
  role: 'terrain' | 'photo' | 'direction';
  children: ReactNode;
}) {
  return <span className={`etiquette badge-${role}`}>{children}</span>;
}
export function BadgePublication({ etat }: { etat: EtatPublication }) {
  return <span className={`etiquette publication-${etat}`}>{publications[etat]}</span>;
}

/** Une liste de boutons native : Tab parcourt les actions, Échap rend le focus. */
export function ActionsSecondaires({ nom, children }: { nom: string; children: ReactNode }) {
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
      className="actions-secondaires"
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
      <summary aria-label={`Autres actions pour ${nom}`} className="bouton action-secondaire">
        ⋯
      </summary>
      <div className="actions-secondaires-liste">{children}</div>
    </details>
  );
}
