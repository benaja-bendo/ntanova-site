import { useState } from 'react';
import { Bouton } from './actions';
import { Dialogue } from './Dialogue';

/** L'action reste chez l'appelant ; la fenêtre montre son attente et permet de réessayer. */
export function ConfirmationAction({
  libelle,
  titre,
  description,
  confirmer,
  surConfirmer,
  classe = 'bouton bouton-secondaire',
}: {
  libelle: string;
  titre: string;
  description: string;
  confirmer: string;
  surConfirmer: () => Promise<string | void>;
  classe?: string;
}) {
  const [ouverte, setOuverte] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const agir = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      const raison = await surConfirmer();
      if (raison) setErreur(raison);
      else setOuverte(false);
    } catch {
      setErreur('L’action n’a pas abouti. Réessayez.');
    } finally {
      setEnCours(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className={classe}
        aria-haspopup="dialog"
        onClick={() => {
          setErreur(null);
          setOuverte(true);
        }}
      >
        {libelle}
      </button>
      {ouverte && (
        <Dialogue
          titre={titre}
          variante="confirmation"
          description={description}
          occupe={enCours}
          libelleFermeture="Annuler"
          fermer={() => setOuverte(false)}
          entete={<h2>{titre}</h2>}
        >
          <div className="pile-serree">
            {erreur && (
              <p className="message-erreur" role="alert">
                {erreur}
              </p>
            )}
            <div className="choix-ligne">
              <Bouton
                variante="danger"
                enCours={enCours}
                texteEnCours="Suppression…"
                onClick={() => void agir()}
              >
                {confirmer}
              </Bouton>
            </div>
          </div>
        </Dialogue>
      )}
    </>
  );
}
