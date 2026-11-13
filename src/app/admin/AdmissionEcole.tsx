import { useEffect, useState } from 'react';
import { jourDuCongo } from '../../modele/date-declaration';
import { erreurDuCalendrier, type AdmissionASaisir } from '../../modele/fiche-admin';
import { libelleEtapeAdmission } from '../../modele/libelles';
import { listes } from '../../modele/listes';
import type { PortAdministration } from '../../modele/ports';
import { Bouton } from '../../ui/actions';
import { Champ } from '../../ui/composants';
import { messageErreur } from './ChampPosition';

/**
 * L'admission d'un site du supérieur (lot E du ticket 165) : l'année, le calendrier (dossiers, concours ou entretien,
 * résultats, rentrée), les pièces, où déposer, « sur place uniquement ». Tout est dit par l'école, avec sa date. Une étape
 * qui finit avant de commencer est dite avant l'envoi.
 */
export function AdmissionEcole({
  ecoleId,
  admin,
  surChangement,
}: {
  ecoleId: string;
  admin: PortAdministration;
  surChangement: (texte: string) => void;
}) {
  const [a, setA] = useState<AdmissionASaisir | null>(null);
  const [pieces, setPieces] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    let vivant = true;
    void admin
      .admissionDeLEcole(ecoleId)
      .then((x) => {
        if (!vivant) return;
        const base = x ?? {
          anneeScolaire: '',
          pieces: [],
          ouDeposer: null,
          surPlaceSeulement: false,
          declareeLe: jourDuCongo(),
          etapes: [],
        };
        setA(base);
        setPieces(base.pieces.join('\n'));
      })
      .catch((e: unknown) => vivant && setErreur(messageErreur(e)));
    return () => {
      vivant = false;
    };
  }, [admin, ecoleId]);
  if (!a)
    return erreur ? (
      <p className="message-erreur">{erreur}</p>
    ) : (
      <p aria-busy="true">Chargement…</p>
    );

  const etape = (cle: (typeof listes.admission_step)[number]) =>
    a.etapes.find((x) => x.etape === cle);
  const poser = (
    cle: (typeof listes.admission_step)[number],
    champ: 'debut' | 'fin',
    valeur: string,
  ) => {
    const autres = a.etapes.filter((x) => x.etape !== cle);
    const actuelle = etape(cle) ?? { etape: cle, debut: '', fin: null };
    const nouvelle = { ...actuelle, [champ]: valeur || (champ === 'fin' ? null : '') };
    setA({ ...a, etapes: nouvelle.debut ? [...autres, nouvelle] : autres });
  };
  const saisie: AdmissionASaisir = {
    ...a,
    pieces: pieces
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean),
  };
  const sauver = async () => {
    const e = erreurDuCalendrier(saisie);
    if (e) return setErreur(e);
    setEnCours(true);
    setErreur(null);
    try {
      await admin.enregistrerAdmission(ecoleId, saisie);
      surChangement('Admission enregistrée. Visible à la prochaine mise à jour du site.');
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form
      className="admin-motif pile-serree"
      aria-label="Admission"
      onSubmit={(ev) => {
        ev.preventDefault();
        void sauver();
      }}
    >
      <h3>Admission</h3>
      <Champ libelle="Année scolaire">
        {(x) => (
          <input
            {...x}
            className="champ"
            placeholder="2026-2027"
            value={a.anneeScolaire}
            onChange={(e) => setA({ ...a, anneeScolaire: e.target.value })}
          />
        )}
      </Champ>
      <fieldset className="pile-serree">
        <legend>Le calendrier</legend>
        {listes.admission_step.map((cle) => (
          <div
            key={cle}
            className="deux-colonnes"
            role="group"
            aria-label={libelleEtapeAdmission[cle]}
          >
            <Champ libelle={`${libelleEtapeAdmission[cle]} : du`} facultatif>
              {(x) => (
                <input
                  {...x}
                  className="champ"
                  type="date"
                  value={etape(cle)?.debut ?? ''}
                  onChange={(e) => poser(cle, 'debut', e.target.value)}
                />
              )}
            </Champ>
            <Champ libelle="au" facultatif>
              {(x) => (
                <input
                  {...x}
                  className="champ"
                  type="date"
                  value={etape(cle)?.fin ?? ''}
                  onChange={(e) => poser(cle, 'fin', e.target.value)}
                />
              )}
            </Champ>
          </div>
        ))}
      </fieldset>
      <Champ libelle="Pièces à fournir" facultatif aide="Une par ligne, dix au plus.">
        {(x) => (
          <textarea
            {...x}
            className="champ"
            rows={4}
            value={pieces}
            onChange={(e) => setPieces(e.target.value)}
          />
        )}
      </Champ>
      <Champ libelle="Où déposer le dossier" facultatif>
        {(x) => (
          <input
            {...x}
            className="champ"
            maxLength={300}
            value={a.ouDeposer ?? ''}
            onChange={(e) => setA({ ...a, ouDeposer: e.target.value || null })}
          />
        )}
      </Champ>
      <label className="case">
        <input
          type="checkbox"
          checked={a.surPlaceSeulement}
          onChange={(e) => setA({ ...a, surPlaceSeulement: e.target.checked })}
        />
        Dossiers reçus sur place uniquement
      </label>
      <Champ libelle="Dit par l’école le">
        {(x) => (
          <input
            {...x}
            className="champ"
            type="date"
            value={a.declareeLe}
            onChange={(e) => setA({ ...a, declareeLe: e.target.value })}
          />
        )}
      </Champ>
      <Bouton type="submit" enCours={enCours}>
        Enregistrer l’admission
      </Bouton>
      {erreur && (
        <p className="message-erreur" role="alert">
          {erreur}
        </p>
      )}
    </form>
  );
}
