import { useEffect, useState } from 'react';
import {
  intituleAgrement,
  lireAgrement,
  referenceEnMots,
  type AgrementEnregistre,
} from '../../modele/agrement';
import { jourDuCongo } from '../../modele/date-declaration';
import { libelleGenreAgrement } from '../../modele/libelles';
import { listes } from '../../modele/listes';
import type { PortAdministration } from '../../modele/ports';
import { Dialogue } from '../../ui/Dialogue';
import { dateLongue } from '../../modele/pointe-noire';
import { Bandeau } from '../../ui/composants';
import { messageErreur } from './ChampPosition';

const VIDE = {
  formationId: '',
  genre: '',
  precision: '',
  reference: '',
  delivreLe: '',
  sourceTexte: '',
  sourceLien: '',
  controleLe: '',
  documentVu: false,
};

/**
 * L'agrément d'une école ou d'une filière (ticket 148) : la référence d'un document que l'administration a vu. Une ligne par
 * école et par filière. Elle cite le document : ni badge, ni garantie.
 */
export function AgrementEcole({
  ecoleId,
  nom,
  agrements,
  filieres,
  admin,
  surChangement,
  fermer,
  integre = false,
  surOccupation,
}: {
  ecoleId: string;
  nom: string;
  agrements: AgrementEnregistre[];
  filieres: { id: string; titre: string }[];
  admin: PortAdministration;
  surChangement: (texte: string) => void;
  fermer: () => void;
  integre?: boolean;
  surOccupation?: (occupe: boolean) => void;
}) {
  const [saisie, setSaisie] = useState(VIDE);
  const [enModification, setEnModification] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    surOccupation?.(enCours);
    return () => surOccupation?.(false);
  }, [enCours, surOccupation]);
  const changer = (champ: Partial<typeof VIDE>) => setSaisie((s) => ({ ...s, ...champ }));
  const cible = (a: Pick<AgrementEnregistre, 'formationId'>) =>
    a.formationId === null
      ? 'L’établissement'
      : (filieres.find((f) => f.id === a.formationId)?.titre ?? 'Une filière');

  const agir = async (action: () => Promise<unknown>, succes: string) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      setSaisie(VIDE);
      setEnModification(false);
      surChangement(`${succes} Visible après la prochaine mise à jour du site.`);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };
  const enregistrer = () => {
    const { agrement, erreur: refus } = lireAgrement(saisie);
    if (!agrement) {
      setErreur(refus);
      return;
    }
    void agir(() => admin.enregistrerAgrement(ecoleId, agrement), `Agrément de ${nom} enregistré.`);
  };

  return (
    <Dialogue titre={`Agrément de ${nom}`} fermer={fermer} integre={integre}>
      <form
        className="admin-motif"
        aria-label={`Agrément de ${nom}`}
        onSubmit={(ev) => {
          ev.preventDefault();
          enregistrer();
        }}
      >
        <h3>Référence officielle</h3>
        <p>
          Seulement le document que tu as vu, avec ses mots à lui. Sans ligne ici, la fiche n’écrit
          rien. Cette ligne cite un document : ni badge, ni garantie de NTanova.
        </p>
        {agrements.length > 0 && (
          <ul className="admin-frais-liste">
            {agrements.map((a) => (
              <li key={a.id}>
                <b>
                  {cible(a)} · {intituleAgrement(a)}
                </b>
                <p>
                  {referenceEnMots(a)} · {a.sourceTexte} · vu le {dateLongue(a.controleLe)}
                </p>
                <button
                  type="button"
                  className="bouton bouton-secondaire"
                  disabled={enCours}
                  onClick={() => {
                    setEnModification(true);
                    setSaisie({
                      formationId: a.formationId ?? '',
                      genre: a.genre,
                      precision: a.precision ?? '',
                      reference: a.reference,
                      delivreLe: a.delivreLe,
                      sourceTexte: a.sourceTexte,
                      sourceLien: a.sourceLien ?? '',
                      controleLe: a.controleLe,
                      documentVu: false,
                    });
                    setErreur(null);
                  }}
                >
                  Modifier : {cible(a)}
                </button>
                <button
                  type="button"
                  className="bouton bouton-secondaire admin-bouton-refus"
                  disabled={enCours}
                  onClick={() =>
                    void agir(() => admin.retirerAgrement(a.id), `Agrément de ${nom} retiré.`)
                  }
                >
                  Retirer : {cible(a)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {filieres.length > 0 && (
          <label className="champ-groupe">
            Concerne
            <select
              className="champ"
              value={saisie.formationId}
              disabled={enModification}
              onChange={(e) => changer({ formationId: e.target.value })}
            >
              <option value="">L’établissement</option>
              {filieres.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.titre}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="champ-groupe">
          Intitulé du document
          <select
            className="champ"
            value={saisie.genre}
            onChange={(e) => changer({ genre: e.target.value })}
          >
            <option value="">Choisir</option>
            {listes.accreditation_kind.map((g) => (
              <option key={g} value={g}>
                {libelleGenreAgrement[g]}
              </option>
            ))}
          </select>
        </label>
        {saisie.genre === 'autre' && (
          <label className="champ-groupe">
            Intitulé écrit sur le document
            <input
              className="champ"
              maxLength={80}
              value={saisie.precision}
              onChange={(e) => changer({ precision: e.target.value })}
            />
          </label>
        )}
        <label className="champ-groupe">
          Référence, telle qu’elle est écrite (« arrêté n° … »)
          <input
            className="champ"
            maxLength={160}
            value={saisie.reference}
            onChange={(e) => changer({ reference: e.target.value })}
          />
        </label>
        <label className="champ-groupe">
          Date du document
          <input
            className="champ"
            type="date"
            max={jourDuCongo()}
            value={saisie.delivreLe}
            onChange={(e) => changer({ delivreLe: e.target.value })}
          />
        </label>
        <label className="champ-groupe">
          Source, en mots (où se trouve le document)
          <input
            className="champ"
            maxLength={200}
            value={saisie.sourceTexte}
            onChange={(e) => changer({ sourceTexte: e.target.value })}
          />
        </label>
        <label className="champ-groupe">
          Lien vers le document (facultatif)
          <input
            className="champ"
            type="url"
            maxLength={500}
            placeholder="https://"
            value={saisie.sourceLien}
            onChange={(e) => changer({ sourceLien: e.target.value })}
          />
        </label>
        <label className="champ-groupe">
          Jour où tu as vu le document (jamais publié)
          <input
            className="champ"
            type="date"
            max={jourDuCongo()}
            value={saisie.controleLe}
            onChange={(e) => changer({ controleLe: e.target.value })}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={saisie.documentVu}
            onChange={(e) => changer({ documentVu: e.target.checked })}
          />{' '}
          J’ai vu ce document.
        </label>
        {erreur && (
          <Bandeau ton="erreur" icone="alerte">
            {erreur}
          </Bandeau>
        )}
        <button className="bouton" type="submit" disabled={enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer l’agrément'}
        </button>
        {enModification && (
          <button
            type="button"
            className="bouton bouton-secondaire"
            disabled={enCours}
            onClick={() => {
              setEnModification(false);
              setSaisie(VIDE);
              setErreur(null);
            }}
          >
            Annuler la modification
          </button>
        )}
        <p className="mention">Visible après la prochaine mise à jour du site.</p>
      </form>
    </Dialogue>
  );
}
