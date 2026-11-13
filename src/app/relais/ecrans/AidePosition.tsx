/**
 * La position est bloquée : ce qui se passe, pourquoi, et quoi faire sur CE téléphone (ticket #72). Le texte est écrit
 * pour le téléphone et le navigateur que le relais utilise (`src/modele/aide-position.ts`) : un iPhone avec Chrome se
 * règle dans les Réglages de l'iPhone, pas par un cadenas à gauche de l'adresse. Un bouton relance la mesure ; elle se
 * relance aussi toute seule quand le relais revient des réglages (`reprise-position.ts`).
 */
import { classeBouton } from '../formulaire';
import { useMemo } from 'react';
import type { ErreurPosition } from '../../../modele/geo';
import { aideDePosition, messageDeSupport } from '../../../modele/aide-position';
import { avecMessage } from '../../../modele/whatsapp';
import { useRelais } from '../contexte';
import { environnementActuel } from '../environnement';

export function AidePosition({
  erreur,
  surReessayer,
}: {
  erreur: ErreurPosition;
  surReessayer: () => void;
}) {
  const { lienNTanova } = useRelais();
  const env = useMemo(() => environnementActuel(), []);
  const aide = aideDePosition(erreur, env);
  const lien = avecMessage(lienNTanova, messageDeSupport(erreur, env));
  return (
    <section
      className="flex flex-col gap-2.5 rounded-md bg-danger px-3 py-2.5 text-sm text-danger-foreground [&_p]:m-0"
      role="alert"
      aria-label="La position est bloquée"
    >
      <div>
        <p className="m-0 font-bold">{aide.titre}</p>
        <p>{aide.cause}</p>
        <ol className="m-0 flex flex-col gap-1 pl-5">
          {aide.etapes.map((etape) => (
            <li key={etape}>{etape}</li>
          ))}
        </ol>
        {aide.conseil && <p>{aide.conseil}</p>}
        <button
          type="button"
          className={classeBouton({ size: 'lg', className: 'w-full' })}
          onClick={surReessayer}
        >
          Reprendre la position
        </button>
        {lien && (
          <a
            className={classeBouton({ variant: 'outline', size: 'sm' })}
            href={lien}
            target="_blank"
            rel="noopener noreferrer"
          >
            Écrire à NTanova sur WhatsApp
          </a>
        )}
      </div>
    </section>
  );
}
