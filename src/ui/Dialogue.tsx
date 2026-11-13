import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Bouton } from './actions';

/** Une seule fenêtre modale ; les formulaires intégrés partagent son focus. */
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
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (integre) return;
    const d = ref.current!;
    const origine =
      retourFocus ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const defilement = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    d.showModal();
    return () => {
      d.close();
      document.body.style.overflow = defilement;
      if (origine?.isConnected) origine.focus();
      else document.querySelector<HTMLElement>('[data-retour-liste]')?.focus();
    };
  }, [integre, retourFocus]);
  if (integre) return <div className="dialogue-integre">{children}</div>;
  return (
    <dialog
      ref={ref}
      className={`dialogue-admin dialogue-${variante}`}
      role={variante === 'confirmation' ? 'alertdialog' : undefined}
      aria-label={titre}
      aria-describedby={description ? idDescription : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (!occupe) fermer();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return;
        const cibles = [
          ...e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((el) => el.getClientRects().length > 0 && !el.closest('[hidden], [inert]'));
        const premiere = cibles[0];
        const derniere = cibles.at(-1);
        if (e.shiftKey && document.activeElement === premiere) {
          e.preventDefault();
          derniere?.focus();
        } else if (!e.shiftKey && document.activeElement === derniere) {
          e.preventDefault();
          premiere?.focus();
        }
      }}
      onClose={() => fermer()}
    >
      <header className="dialogue-entete">
        {entete && <div className="pile-serree">{entete}</div>}
        <Bouton variante="secondaire" disabled={occupe} onClick={fermer}>
          {libelleFermeture}
        </Bouton>
      </header>
      <div className="dialogue-corps">
        {description && (
          <p className="mention" id={idDescription}>
            {description}
          </p>
        )}
        {children}
      </div>
    </dialog>
  );
}
