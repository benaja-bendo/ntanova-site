import { useEffect, useRef, type ReactNode } from 'react';
/** Fenêtre native : focus contenu, Échap et retour au déclencheur gérés par le navigateur. */
export function Dialogue({
  titre,
  fermer,
  children,
}: {
  titre: string;
  fermer: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog ref={ref} className="dialogue-admin" aria-label={titre} onClose={fermer}>
      <button
        type="button"
        className="bouton bouton-secondaire"
        onClick={() => ref.current?.close()}
      >
        Fermer
      </button>
      {children}
    </dialog>
  );
}
