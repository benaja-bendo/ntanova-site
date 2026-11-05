import { useEffect, useState } from 'react';
import type { PortAdministration, PhotoVue } from '../../modele/ports';
import { Dialogue } from '../../ui/Dialogue';
import { dateLongue } from '../../modele/pointe-noire';
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
    [erreur, setErreur] = useState<string | null>(null),
    [choix, setChoix] = useState(''),
    [confirme, setConfirme] = useState(false),
    [enCours, setEnCours] = useState(false);
  useEffect(() => {
    surOccupation?.(enCours);
    return () => surOccupation?.(false);
  }, [enCours, surOccupation]);
  useEffect(() => {
    let vivant = true;
    void admin
      .photosEcole(ecoleId)
      .then((p) => {
        if (vivant) setPhotos(p);
      })
      .catch(() => {
        if (vivant) setErreur('Les photos ne se chargent pas.');
      });
    return () => {
      vivant = false;
    };
  }, [admin, ecoleId]);
  const agir = async (id: string | null) => {
    if (id && !confirme) {
      setErreur('Confirme le contrôle et la publication de cette photo.');
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await admin.choisirPhotoPublique(ecoleId, id, id !== null && confirme);
      setPhotos(await admin.photosEcole(ecoleId));
      setChoix('');
      setConfirme(false);
      surChangement(
        'Sélection de photo mise à jour. Reconstruis le site pour l’afficher ou la retirer.',
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La sélection a échoué.');
    } finally {
      setEnCours(false);
    }
  };
  const enseignes = photos?.filter((p) => p.role === 'signboard') ?? [];
  return (
    <Dialogue titre={`Photo publique de ${nom}`} fermer={fermer} integre={integre}>
      <h2>Photo d’enseigne publique</h2>
      <p>
        Une seule enseigne, choisie parmi les relevés acceptés de cette école. « Publiable » ne veut
        pas dire « publiée ».
      </p>
      <p className="mention">
        La photo paraît seulement si la fiche est publiée, après reconstruction du site. Un retrait
        exige aussi cette mise à jour ; les copies déjà partagées peuvent subsister.
      </p>
      {photos === null && !erreur && <p role="status">Chargement des photos…</p>}
      {photos !== null && !enseignes.length && (
        <p>Aucune photo d’enseigne issue d’un relevé accepté.</p>
      )}
      <div className="pile">
        {enseignes.map((p) => (
          <figure className="admin-figure" key={p.id}>
            {p.adresse ? (
              <a href={p.adresse} target="_blank" rel="noopener noreferrer">
                <img src={p.adresse} alt={`Enseigne de ${nom}`} />
              </a>
            ) : (
              <p>Photo illisible : elle ne peut pas être sélectionnée.</p>
            )}
            <figcaption>
              {p.prisLe
                ? `Photo prise sur place le ${dateLongue(p.prisLe)}`
                : 'Date de prise de vue non renseignée.'}{' '}
              {p.publique
                ? 'Sélectionnée pour la publication.'
                : p.publiable
                  ? 'Contrôlée publiable, non sélectionnée.'
                  : 'Privée, non contrôlée.'}
            </figcaption>
            {p.publique ? (
              <button
                className="bouton bouton-secondaire"
                disabled={enCours}
                onClick={() => void agir(null)}
              >
                Retirer la photo publique
              </button>
            ) : (
              p.adresse && (
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
                  Choisir cette enseigne
                </button>
              )
            )}
          </figure>
        ))}
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
