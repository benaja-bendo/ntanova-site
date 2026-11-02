import { arrondissementDeLaPosition } from '../../modele/carte/plan';
import { ecrirePosition, lienGoogleMaps } from '../../modele/coordonnees';
import { lireChampPosition } from '../../modele/correction-ecole';
import { ErreurDecision } from '../../modele/ports';
import { Champ } from '../../ui/composants';

/** Le message d'une erreur de l'administration : celui de la base quand elle l'a écrit, sinon le réseau. */
export const messageErreur = (e: unknown): string =>
  e instanceof ErreurDecision ? e.message : 'La base ne répond pas. Vérifie le réseau et réessaie.';

/**
 * Le champ « Position » : ce que Google Maps donne (un appui long sur l'entrée de l'école, puis
 * copier les chiffres), son adresse de partage, ou des degrés. On voit tout de suite où la
 * position tombe, et on peut la vérifier sur Google Maps avant d'enregistrer.
 *
 * Seuls les contours de Pointe-Noire sont connus du navigateur ; ailleurs, c'est la base qui cherche la
 * division (ou l'administration qui la choisit dans la liste).
 */
export function ChampPosition({
  valeur,
  surChange,
  erreur,
  facultatif = false,
}: {
  valeur: string;
  surChange: (texte: string) => void;
  erreur?: string | undefined;
  facultatif?: boolean;
}) {
  const { position } = lireChampPosition(valeur);
  const dessine = position ? arrondissementDeLaPosition(position) : null;
  const ou = !position
    ? null
    : dessine
      ? `Dans le dessin de ${dessine.nom}.`
      : 'Aucun contour connu ici : la base cherchera la division, ou choisis-la dans la liste.';
  return (
    <div className="admin-pleine-largeur champ-position">
      <Champ
        libelle="Position"
        facultatif={facultatif}
        erreur={erreur}
        aide="Sur Google Maps : un appui long (ou un clic droit) sur l’entrée de l’école, puis copie les chiffres qui s’affichent, par exemple -4.79105, 11.92500. Un lien de partage marche aussi."
      >
        {(a) => (
          <input
            {...a}
            className="champ"
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder="-4.79105, 11.92500"
            value={valeur}
            onChange={(ev) => surChange(ev.target.value)}
          />
        )}
      </Champ>
      {position && (
        <p className="mention" aria-live="polite">
          Lu : {ecrirePosition(position)}. {ou}{' '}
          <a href={lienGoogleMaps(position)} target="_blank" rel="noopener noreferrer">
            Vérifier sur Google Maps
          </a>
        </p>
      )}
    </div>
  );
}
