import { v2 } from '@/ui/v2/classes';
import { useEffect, useState } from 'react';
import { RENTREES_MAX, erreurDuCalendrier, type AdmissionASaisir } from '../../modele/fiche-admin';
import { libelleEtapeAdmission } from '../../modele/libelles';
import { listes } from '../../modele/listes';
import type { PortAdministration } from '../../modele/ports';
import { Bouton } from '@/ui/v2/admin';
import { Champ } from '@/ui/v2/formulaire';
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
          // Ticket 199 (A2) : le jour où l'école l'a dit se tape.
          declareeLe: '',
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
    return erreur ? <p className={v2.erreur}>{erreur}</p> : <p aria-busy="true">Chargement…</p>;

  // Ticket 205 (A25) : une rentrée de plus porte un libellé ; l'étape principale n'en a pas.
  const principale = (x: AdmissionASaisir['etapes'][number]) =>
    x.libelle === undefined || x.libelle === null;
  const etape = (cle: (typeof listes.admission_step)[number]) =>
    a.etapes.find((x) => x.etape === cle && principale(x));
  const rentreesEnPlus = a.etapes.filter((x) => x.etape === 'rentree' && !principale(x));
  const changerRentree = (i: number, champ: 'libelle' | 'debut' | 'fin', valeur: string) =>
    setA({
      ...a,
      etapes: [
        ...a.etapes.filter((x) => !rentreesEnPlus.includes(x)),
        ...rentreesEnPlus.map((x, j) =>
          j === i ? { ...x, [champ]: champ === 'fin' ? valeur || null : valeur } : x,
        ),
      ],
    });
  const poser = (
    cle: (typeof listes.admission_step)[number],
    champ: 'debut' | 'fin',
    valeur: string,
  ) => {
    const autres = a.etapes.filter((x) => x.etape !== cle || !principale(x));
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
      className={v2.motifPile}
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
            className={v2.champ}
            placeholder="ex. 2026-2027"
            value={a.anneeScolaire}
            onChange={(e) => setA({ ...a, anneeScolaire: e.target.value })}
          />
        )}
      </Champ>
      <fieldset className={v2.pileSerree}>
        <legend>Le calendrier</legend>
        {listes.admission_step.map((cle) => (
          <div
            key={cle}
            className={v2.deuxColonnes}
            role="group"
            aria-label={libelleEtapeAdmission[cle]}
          >
            <Champ libelle={`${libelleEtapeAdmission[cle]} : du`} facultatif>
              {(x) => (
                <input
                  {...x}
                  className={v2.champ}
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
                  className={v2.champ}
                  type="date"
                  value={etape(cle)?.fin ?? ''}
                  onChange={(e) => poser(cle, 'fin', e.target.value)}
                />
              )}
            </Champ>
          </div>
        ))}
        {rentreesEnPlus.map((x, i) => (
          <div
            key={i}
            className={v2.pileSerree}
            role="group"
            aria-label={`Rentrée de plus ${i + 1}`}
          >
            <Champ libelle="Libellé de la rentrée">
              {(y) => (
                <input
                  {...y}
                  className={v2.champ}
                  maxLength={40}
                  placeholder="2e rentrée, Master…"
                  value={x.libelle ?? ''}
                  onChange={(e) => changerRentree(i, 'libelle', e.target.value)}
                />
              )}
            </Champ>
            <div className={v2.deuxColonnes}>
              <Champ libelle="du">
                {(y) => (
                  <input
                    {...y}
                    className={v2.champ}
                    type="date"
                    value={x.debut}
                    onChange={(e) => changerRentree(i, 'debut', e.target.value)}
                  />
                )}
              </Champ>
              <Champ libelle="au" facultatif>
                {(y) => (
                  <input
                    {...y}
                    className={v2.champ}
                    type="date"
                    value={x.fin ?? ''}
                    onChange={(e) => changerRentree(i, 'fin', e.target.value)}
                  />
                )}
              </Champ>
            </div>
            <button
              type="button"
              className={v2.lienDanger}
              onClick={() => setA({ ...a, etapes: a.etapes.filter((y) => y !== x) })}
            >
              Retirer cette rentrée
            </button>
          </div>
        ))}
        {rentreesEnPlus.length < RENTREES_MAX - 1 && (
          <button
            type="button"
            className={v2.boutonSecondairePetit}
            onClick={() =>
              setA({
                ...a,
                etapes: [...a.etapes, { etape: 'rentree', debut: '', fin: null, libelle: '' }],
              })
            }
          >
            Ajouter une rentrée
          </button>
        )}
      </fieldset>
      <Champ libelle="Pièces à fournir" facultatif aide="Une par ligne, dix au plus.">
        {(x) => (
          <textarea
            {...x}
            className={v2.zone}
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
            className={v2.champ}
            maxLength={300}
            value={a.ouDeposer ?? ''}
            onChange={(e) => setA({ ...a, ouDeposer: e.target.value || null })}
          />
        )}
      </Champ>
      <label className={v2.case}>
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
            className={v2.champ}
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
        <p className={v2.erreur} role="alert">
          {erreur}
        </p>
      )}
    </form>
  );
}
