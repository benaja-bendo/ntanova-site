import { useEffect, useState } from 'react';
import { jourDuCongo } from '../../modele/date-declaration';
import { libelleFonction } from '../../modele/libelles';
import { listes } from '../../modele/listes';
import { LONGUEUR_MAX_MOT, lireMotDirection, type MotDirection } from '../../modele/mot-direction';
import type { PortAdministration } from '../../modele/ports';
import { Dialogue } from '../../ui/Dialogue';
import { dateLongue } from '../../modele/pointe-noire';
import { Bandeau } from '../../ui/composants';
import { messageErreur } from './ChampPosition';

/** Le mot de la direction (ticket 148) : une parole de l'école, telle qu'elle l'a remise, avec un accord daté, gardé en privé. */
export function MotDirectionEcole({
  ecoleId,
  nom,
  mot,
  confirmee,
  admin,
  surChangement,
  fermer,
  integre = false,
  surOccupation,
}: {
  ecoleId: string;
  nom: string;
  mot: MotDirection | null;
  confirmee: boolean;
  admin: PortAdministration;
  surChangement: (texte: string) => void;
  fermer: () => void;
  integre?: boolean;
  surOccupation?: (occupe: boolean) => void;
}) {
  const [texte, setTexte] = useState(mot?.texte ?? '');
  const [ditLe, setDitLe] = useState('');
  const [fonction, setFonction] = useState('');
  const [canal, setCanal] = useState('');
  const [accord, setAccord] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    surOccupation?.(enCours);
    return () => surOccupation?.(false);
  }, [enCours, surOccupation]);

  const agir = async (retirer: boolean) => {
    const resultat = retirer
      ? { mot: null, erreur: null }
      : lireMotDirection({ texte, ditLe, fonction, canal, accord });
    if (resultat.erreur) {
      setErreur(resultat.erreur);
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await admin.enregistrerMotDirection(ecoleId, resultat.mot);
      setDitLe('');
      setFonction('');
      setCanal('');
      setAccord(false);
      if (retirer) setTexte('');
      surChangement(
        `${retirer ? 'Mot de la direction retiré' : 'Mot de la direction enregistré'} pour ${nom}. Visible après la prochaine mise à jour du site.`,
      );
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Dialogue titre={`Mot de la direction de ${nom}`} fermer={fermer} integre={integre}>
      <form
        className="admin-motif"
        aria-label={`Mot de la direction de ${nom}`}
        onSubmit={(ev) => {
          ev.preventDefault();
          void agir(false);
        }}
      >
        <h3>Mot de la direction</h3>
        <p>
          Le texte tel que la direction l’a remis, sans nom de personne. L’accord reste en privé.
        </p>
        {!confirmee && (
          <Bandeau ton="attente" icone="alerte">
            Cette fiche n’est pas confirmée par la direction : le mot ne paraîtra qu’une fois la
            fiche confirmée.
          </Bandeau>
        )}
        {mot && <p>Enregistré : mot du {dateLongue(mot.ditLe)}</p>}
        <label className="champ-groupe">
          Le mot ({texte.trim().length} / {LONGUEUR_MAX_MOT})
          <textarea
            className="champ"
            rows={4}
            maxLength={LONGUEUR_MAX_MOT}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
          />
        </label>
        <label className="champ-groupe">
          Date du mot
          <input
            className="champ"
            type="date"
            max={jourDuCongo()}
            value={ditLe}
            onChange={(e) => setDitLe(e.target.value)}
          />
        </label>
        <label className="champ-groupe">
          Fonction de la personne qui a donné son accord
          <select className="champ" value={fonction} onChange={(e) => setFonction(e.target.value)}>
            <option value="">Choisir</option>
            {listes.fonction_direction.map((f) => (
              <option key={f} value={f}>
                {libelleFonction[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="champ-groupe">
          Canal de l’accord
          <select className="champ" value={canal} onChange={(e) => setCanal(e.target.value)}>
            <option value="">Choisir</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="appel">Appel</option>
            <option value="sur_place">Sur place</option>
            <option value="autre">Autre</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={accord} onChange={(e) => setAccord(e.target.checked)} />{' '}
          La direction accepte la publication de ce mot.
        </label>
        {erreur && (
          <Bandeau ton="erreur" icone="alerte">
            {erreur}
          </Bandeau>
        )}
        <button className="bouton" type="submit" disabled={enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer le mot'}
        </button>
        {mot && (
          <button
            className="bouton bouton-secondaire admin-bouton-refus"
            type="button"
            disabled={enCours}
            onClick={() => void agir(true)}
          >
            Retirer le mot
          </button>
        )}
        <p className="mention">Visible après la prochaine mise à jour du site.</p>
      </form>
    </Dialogue>
  );
}
