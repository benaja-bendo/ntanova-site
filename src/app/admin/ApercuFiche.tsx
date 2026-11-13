/**
 * L'en-tête de la fiche d'une école en plein écran (lot G, planche « Fiche d'école, admin ») : la couverture et le logo tels
 * que la page publique les montrera, et « X rubriques remplies sur Y · Z à demander ». Une image qui n'est pas publique ne
 * s'affiche pas ici : l'aperçu dit ce que voient les familles.
 */
import { useEffect, useState } from 'react';
import {
  completudeDeLaFiche,
  completudeEnMots,
  type Manque,
  type MediaAdmin,
} from '../../modele/fiche-admin';
import type { EcoleVue, PortAdministration } from '../../modele/ports';

export function ApercuFiche({
  ecole,
  admin,
  surCouverture,
  surManques,
}: {
  ecole: EcoleVue;
  admin: PortAdministration;
  /** « Changer la couverture » : ouvre la rubrique « Images ». */
  surCouverture: (bouton: HTMLElement) => void;
  /** Le compteur ouvre « À compléter ». */
  surManques: () => void;
}) {
  const [medias, setMedias] = useState<MediaAdmin[] | null>(null);
  const [manques, setManques] = useState<Manque[] | null>(null);
  useEffect(() => {
    let vivant = true;
    admin
      .mediasDeLEcole(ecole.id)
      .then((m) => vivant && setMedias(m))
      .catch(() => vivant && setMedias([]));
    admin
      .manquesDeLEcole(ecole.id)
      .then((m) => vivant && setManques(m))
      .catch(() => vivant && setManques([]));
    return () => {
      vivant = false;
    };
  }, [admin, ecole]);

  const couverture = medias?.find((m) => m.genre === 'cover' && m.publique && m.adresse);
  const logo = medias?.find((m) => m.genre === 'logo' && m.publique && m.adresse);
  const initiale = (ecole.nom.replace(/^[^\p{L}]+/u, '').charAt(0) || '?').toUpperCase();
  const completude = medias && manques ? completudeDeLaFiche(ecole, medias, manques) : null;

  return (
    <section className="fiche-admin-apercu" aria-label="Aperçu">
      <div className="fiche-admin-couverture">
        {couverture ? (
          <img src={couverture.adresse ?? undefined} alt={`Photo de couverture de ${ecole.nom}`} />
        ) : (
          <span className="mention">Pas encore de photo de couverture</span>
        )}
        <button
          type="button"
          className="bouton bouton-secondaire bouton-petit fiche-admin-changer"
          onClick={(ev) => surCouverture(ev.currentTarget)}
        >
          {couverture ? 'Changer la couverture' : 'Ajouter une couverture'}
        </button>
      </div>
      <div className="fiche-admin-apercu-pied">
        <span className="fiche-admin-rond fiche-admin-logo">
          {logo ? (
            <img src={logo.adresse ?? undefined} alt={`Logo de ${ecole.nom}`} />
          ) : (
            <span aria-hidden="true">{initiale}</span>
          )}
        </span>
        {completude && (
          <button
            type="button"
            className="fiche-admin-completude"
            aria-label={`${completudeEnMots(completude)} : voir ce qui manque`}
            onClick={surManques}
          >
            <b>
              {completude.remplies}/{completude.total}
            </b>
            <span>{completudeEnMots(completude)}</span>
          </button>
        )}
      </div>
    </section>
  );
}
