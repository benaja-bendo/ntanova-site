import type { ReactNode } from 'react';

/** Le navigateur gère Entrée, Espace et le focus ; replier conserve les champs saisis. */
export function SectionRepliable({
  titre,
  synthese,
  children,
  ouverte = false,
}: {
  titre: string;
  synthese: string;
  children: ReactNode;
  ouverte?: boolean;
}) {
  return (
    <details className="section-repliable" open={ouverte || undefined}>
      <summary>
        <span className="section-repliable-indice" aria-hidden="true" />
        <span className="section-repliable-titre">{titre}</span>
        <span className="section-repliable-synthese">{synthese}</span>
      </summary>
      <div className="section-repliable-contenu pile">{children}</div>
    </details>
  );
}
