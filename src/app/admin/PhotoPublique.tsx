import { useCallback, useEffect, useState } from 'react';
import type { PortAdministration, PhotoVue } from '../../modele/ports';
import { Dialogue } from '../../ui/Dialogue';
import { dateLongue } from '../../modele/pointe-noire';
import { libelleRolePhotoCourt } from '../../modele/libelles';
import { decrirePhotosPubliques, type EtatPhotoPublique } from '../../modele/photos-publiques';

/**
 * La photo publique d'une école : une enseigne ou une vue du bâtiment, d'un relevé accepté. Sans choix, la base retient
 * la première photo contrôlée (repli automatique) ; un choix prioritaire passe avant ; un retrait explicite bloque tout
 * repli. L'écran dit l'état que la base répond, jamais une règle recopiée.
 */
export function PhotoPublique({
  ecoleId,
  nom,
  admin,
  fermer,
  integre = false,
  surOccupation,
  surChangement,
}: {
  ecoleId: string;
  nom: string;
  admin: PortAdministration;
  fermer: () => void;
  integre?: boolean;
  surOccupation?: (occupe: boolean) => void;
  surChangement: (texte: string) => void;
}) {
  const [photos, setPhotos] = useState<PhotoVue[] | null>(null),
    [etat, setEtat] = useState<EtatPhotoPublique | null>(null),
    [erreur, setErreur] = useState<string | null>(null),
    [choix, setChoix] = useState(''),
    [confirme, setConfirme] = useState(false),
    [enCours, setEnCours] = useState(false);
  useEffect(() => {
    surOccupation?.(enCours);
    return () => surOccupation?.(false);
  }, [enCours, surOccupation]);
  const lire = useCallback(
    () => Promise.all([admin.photosEcole(ecoleId), admin.etatPhotoPublique(ecoleId)]),
    [admin, ecoleId],
  );
  useEffect(() => {
    let vivant = true;
    void lire()
      .then(([p, e]) => {
        if (!vivant) return;
        setPhotos(p);
        setEtat(e);
      })
      .catch(() => {
        if (vivant) setErreur('Les photos ne se chargent pas.');
      });
    return () => {
      vivant = false;
    };
  }, [lire]);
  // `id` nul = retrait explicite : la base écrit un choix nul qui bloque aussi le repli automatique. Jamais un simple
  // retrait du contrôle d'une photo, qui ferait paraître une autre photo contrôlée.
  const agir = async (id: string | null) => {
    if (id && !confirme) {
      setErreur('Confirme le contrôle et la publication de cette photo.');
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await admin.choisirPhotoPublique(ecoleId, id, id !== null && confirme);
      const [p, e] = await lire();
      setPhotos(p);
      setEtat(e);
      setChoix('');
      setConfirme(false);
      surChangement(
        id === null
          ? 'Retrait enregistré : aucune autre photo ne prend sa place. Reconstruis le site pour la retirer de la fiche.'
          : 'Choix prioritaire enregistré. Reconstruis le site pour l’afficher.',
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La sélection a échoué.');
    } finally {
      setEnCours(false);
    }
  };
  const description = photos && etat ? decrirePhotosPubliques(photos, etat) : null;
  const parPhoto = new Map(description?.photos.map((d) => [d.id, d]) ?? []);
  return (
    <Dialogue titre={`Photo publique de ${nom}`} fermer={fermer} integre={integre}>
      <h2>Photo publique de la fiche</h2>
      <p>
        Une enseigne ou une vue du bâtiment, d’un relevé accepté de cette école. « Contrôlée » ne
        veut pas dire « publique » : seule la photo retenue paraît.
      </p>
      <p className="mention">
        Elle paraît seulement si la fiche est publiée, après reconstruction du site. Un retrait
        exige aussi cette mise à jour ; les copies déjà partagées peuvent subsister.
      </p>
      {description === null && !erreur && <p role="status">Chargement des photos…</p>}
      {description && (
        <p>
          <strong>État :</strong> {description.resume}
        </p>
      )}
      {description?.retirable && (
        <div className="pile-serree">
          <button
            type="button"
            className="bouton bouton-secondaire"
            disabled={enCours}
            onClick={() => void agir(null)}
          >
            Retirer la photo publique
          </button>
          <p className="mention">
            Le retrait bloque aussi le choix automatique : aucune autre photo, même contrôlée, ne
            prend sa place. Tu pourras choisir une photo ensuite.
          </p>
        </div>
      )}
      {photos !== null && !photos.length && (
        <p>Aucune enseigne ni vue du bâtiment issue d’un relevé accepté.</p>
      )}
      <div className="pile">
        {(photos ?? []).map((p) => {
          const d = parPhoto.get(p.id);
          const dejaChoisie = d?.prioritaire === true && d.situation !== 'prioritaire_invalide';
          return (
            <figure className="admin-figure" key={p.id}>
              {p.adresse ? (
                <a href={p.adresse} target="_blank" rel="noopener noreferrer">
                  <img src={p.adresse} alt={`${libelleRolePhotoCourt[p.role]} — ${nom}`} />
                </a>
              ) : (
                <p>Photo illisible : elle ne peut pas être sélectionnée.</p>
              )}
              <figcaption>
                <b>{libelleRolePhotoCourt[p.role]}</b>
                <br />
                {p.prisLe
                  ? `Photo prise sur place le ${dateLongue(p.prisLe)}`
                  : 'Date de prise de vue non renseignée.'}
                <br />
                {d?.phrase}
              </figcaption>
              {p.adresse && !dejaChoisie && (
                <button
                  className="bouton bouton-secondaire"
                  aria-pressed={choix === p.id}
                  disabled={enCours}
                  onClick={() => {
                    setChoix(p.id);
                    setConfirme(false);
                    setErreur(null);
                  }}
                >
                  {p.role === 'building'
                    ? 'Choisir cette vue du bâtiment'
                    : 'Choisir cette enseigne'}
                </button>
              )}
            </figure>
          );
        })}
      </div>
      {choix && (
        <div className="pile">
          <label>
            <input
              type="checkbox"
              checked={confirme}
              onChange={(e) => setConfirme(e.target.checked)}
            />{' '}
            J’ai vérifié : photo nette, sans enfant ni donnée personnelle ; j’autorise sa
            publication.
          </label>
          <button className="bouton" disabled={enCours} onClick={() => void agir(choix)}>
            Confirmer la photo publique
          </button>
        </div>
      )}
      {erreur && (
        <p className="message-erreur" role="alert">
          {erreur}
        </p>
      )}
      <p className="mention">Aucun badge ou changement d’origine de la fiche n’est créé.</p>
      <a
        className="lien"
        href="https://github.com/benaja-bendo/ntanova-site/actions/workflows/mise-en-ligne.yml"
        target="_blank"
        rel="noopener noreferrer"
      >
        Ouvrir la mise à jour du site
      </a>
    </Dialogue>
  );
}
