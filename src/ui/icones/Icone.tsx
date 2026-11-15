/**
 * Une icône du registre (`registre.ts`), dessinée en React : grille de 24, trait de 2, extrémités et angles arrondis,
 * couleur du texte. Décorative par défaut (le mot à côté dit la même chose) ; avec `titre`, elle porte son nom
 * accessible (fermer, chercher, revenir, agrandir).
 */
import type { SVGProps } from 'react';
import { ICONES, type NomIcone } from './registre';

export type ProprietesIcone = Omit<
  SVGProps<SVGSVGElement>,
  'children' | 'dangerouslySetInnerHTML'
> & {
  titre?: string;
};

export function Icone({ nom, titre, className, ...reste }: ProprietesIcone & { nom: NomIcone }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `shrink-0 ${className}` : 'shrink-0'}
      {...(titre
        ? { role: 'img', 'aria-label': titre }
        : { 'aria-hidden': true, focusable: false })}
      {...reste}
      dangerouslySetInnerHTML={{ __html: ICONES[nom] }}
    />
  );
}

/** Une icône nommée, prête à l'emploi (`<IconeRetour className="size-5" />`). */
export const icone = (nom: NomIcone) => {
  const Composant = (p: ProprietesIcone) => <Icone nom={nom} {...p} />;
  Composant.displayName = `Icone(${nom})`;
  return Composant;
};
