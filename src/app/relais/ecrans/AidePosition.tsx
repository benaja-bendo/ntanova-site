/**
 * La position est bloquée : ce qui se passe, pourquoi, et quoi faire sur CE téléphone (ticket #72). Le texte est écrit
 * pour le téléphone et le navigateur que le relais utilise (`src/modele/aide-position.ts`) : un iPhone avec Chrome se
 * règle dans les Réglages de l'iPhone, pas par un cadenas à gauche de l'adresse. Un bouton relance la mesure ; elle se
 * relance aussi toute seule quand le relais revient des réglages (`reprise-position.ts`).
 */
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
    <section className="bandeau bandeau-erreur" role="alert" aria-label="La position est bloquée">
      <div>
        <p className="bandeau-titre">{aide.titre}</p>
        <p>{aide.cause}</p>
        <ol className="aide-position-etapes">
          {aide.etapes.map((etape) => (
            <li key={etape}>{etape}</li>
          ))}
        </ol>
        {aide.conseil && <p>{aide.conseil}</p>}
        <button type="button" className="bouton" onClick={surReessayer}>
          Reprendre la position
        </button>
        {lien && (
          <a
            className="bouton bouton-secondaire bouton-petit"
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
