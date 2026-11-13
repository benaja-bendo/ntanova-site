import { useEffect, useState } from 'react';
import { jourDuCongo } from '../../modele/date-declaration';
import {
  detailsVides,
  erreurDesDetails,
  sansDetail,
  type DetailsFormation,
  type FormationDuSuperieur,
} from '../../modele/fiche-admin';
import { libelleNiveau, libelleSelection } from '../../modele/libelles';
import { listes, type Valeur } from '../../modele/listes';
import { francs } from '../../modele/paie';
import { dateLongue } from '../../modele/pointe-noire';
import type { PortAdministration } from '../../modele/ports';
import { Bouton } from '../../ui/actions';
import { Champ } from '../../ui/composants';
import { messageErreur } from './ChampPosition';

/** « 2 ans · Bac · Sur dossier · dossier 15 000 FCFA » : le résumé d'une formation dans la liste. */
function resumeDesDetails(d: DetailsFormation): string {
  if (sansDetail(d)) return 'Aucun détail';
  return [
    d.dureeAnnees !== null
      ? `${d.dureeAnnees.toLocaleString('fr-FR')} an${d.dureeAnnees >= 2 ? 's' : ''}`
      : null,
    d.niveauDemande,
    d.selection ? libelleSelection[d.selection] : null,
    d.fraisDossier !== null ? `dossier ${francs(d.fraisDossier)}` : null,
    d.delivrePar ? `diplôme délivré par ${d.delivrePar}` : null,
    d.ditLe ? `dit le ${dateLongue(d.ditLe)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const nombreOuNul = (v: string): number | null => {
  const t = v.trim().replace(/\s/g, '').replace(',', '.');
  return t === '' ? null : Number(t);
};

/**
 * Le détail des formations du supérieur (lot F du ticket 165, planche « Sup · formation ») : pour chaque filière, la durée,
 * le niveau demandé, la sélection, les frais de dossier et « Diplôme délivré par », dits par l'école avec leur date. Rien
 * n'est obligatoire ; une formation sans détail n'écrit rien sur la page.
 */
export function FormationsSuperieur({
  ecoleId,
  admin,
  surChangement,
}: {
  ecoleId: string;
  admin: PortAdministration;
  surChangement: (texte: string) => void;
}) {
  const [formations, setFormations] = useState<FormationDuSuperieur[] | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [saisie, setSaisie] = useState<DetailsFormation>(detailsVides());
  const [duree, setDuree] = useState('');
  const [frais, setFrais] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vivant = true;
    void admin
      .formationsDeLEcole(ecoleId)
      .then((f) => vivant && setFormations(f))
      .catch((e: unknown) => vivant && setErreur(messageErreur(e)));
    return () => {
      vivant = false;
    };
  }, [admin, ecoleId, version]);

  if (!formations)
    return erreur ? (
      <p className="message-erreur">{erreur}</p>
    ) : (
      <p aria-busy="true">Chargement…</p>
    );

  const ouvrir = (f: FormationDuSuperieur) => {
    setOuverte(f.id);
    setSaisie({ ...f.details, ditLe: f.details.ditLe ?? jourDuCongo() });
    setDuree(f.details.dureeAnnees?.toLocaleString('fr-FR') ?? '');
    setFrais(f.details.fraisDossier?.toString() ?? '');
    setErreur(null);
  };

  const sauver = async (f: FormationDuSuperieur) => {
    const d: DetailsFormation = {
      ...saisie,
      dureeAnnees: nombreOuNul(duree),
      fraisDossier: nombreOuNul(frais),
      niveauDemande: saisie.niveauDemande?.trim() || null,
      delivrePar: saisie.delivrePar?.trim() || null,
    };
    if (Number.isNaN(d.dureeAnnees) || Number.isNaN(d.fraisDossier))
      return setErreur('La durée et les frais s’écrivent en chiffres.');
    const probleme = erreurDesDetails(d, jourDuCongo());
    if (probleme) return setErreur(probleme);
    setEnCours(true);
    setErreur(null);
    try {
      await admin.enregistrerDetailsFormation(f.id, sansDetail(d) ? { ...d, ditLe: null } : d);
      setOuverte(null);
      setVersion((v) => v + 1);
      surChangement(
        `Détail de « ${f.titre} » enregistré. Visible à la prochaine mise à jour du site.`,
      );
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section className="admin-motif pile-serree" aria-label="Formations du supérieur">
      <h3>Formations du supérieur</h3>
      {formations.length === 0 ? (
        <p className="texte-doux">
          Aucune formation notée pour ce site. Elles s’ajoutent depuis le relevé (« À valider ») ou
          les informations de l’école.
        </p>
      ) : (
        <ul className="admin-frais-liste">
          {formations.map((f) => (
            <li key={f.id} className="pile-serree">
              <b>
                {f.titre}
                <span className="mention"> · {libelleNiveau[f.cycle]}</span>
              </b>
              <p className="mention">{resumeDesDetails(f.details)}</p>
              {ouverte !== f.id ? (
                <button
                  type="button"
                  className="bouton bouton-secondaire"
                  disabled={enCours}
                  onClick={() => ouvrir(f)}
                >
                  Détail : {f.titre}
                </button>
              ) : (
                <form
                  className="pile-serree"
                  aria-label={`Détail de ${f.titre}`}
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    void sauver(f);
                  }}
                >
                  <div className="deux-colonnes">
                    <Champ libelle="Durée (années)" facultatif>
                      {(x) => (
                        <input
                          {...x}
                          className="champ"
                          inputMode="decimal"
                          placeholder="2"
                          value={duree}
                          onChange={(e) => setDuree(e.target.value)}
                        />
                      )}
                    </Champ>
                    <Champ libelle="Frais de dossier (FCFA)" facultatif>
                      {(x) => (
                        <input
                          {...x}
                          className="champ"
                          inputMode="numeric"
                          placeholder="15000"
                          value={frais}
                          onChange={(e) => setFrais(e.target.value)}
                        />
                      )}
                    </Champ>
                  </div>
                  <Champ libelle="Niveau demandé" facultatif>
                    {(x) => (
                      <input
                        {...x}
                        className="champ"
                        maxLength={80}
                        placeholder="Bac, toutes séries"
                        value={saisie.niveauDemande ?? ''}
                        onChange={(e) =>
                          setSaisie({ ...saisie, niveauDemande: e.target.value || null })
                        }
                      />
                    )}
                  </Champ>
                  <Champ libelle="Sélection" facultatif>
                    {(x) => (
                      <select
                        {...x}
                        className="champ"
                        value={saisie.selection ?? ''}
                        onChange={(e) =>
                          setSaisie({
                            ...saisie,
                            selection: (e.target.value || null) as Valeur<'selection_kind'> | null,
                          })
                        }
                      >
                        <option value="">Pas dite</option>
                        {listes.selection_kind.map((v) => (
                          <option key={v} value={v}>
                            {libelleSelection[v]}
                          </option>
                        ))}
                      </select>
                    )}
                  </Champ>
                  <Champ
                    libelle="Diplôme délivré par"
                    facultatif
                    aide="Les mots de l’école, tels quels (l’établissement, une université partenaire, l’État…)."
                  >
                    {(x) => (
                      <input
                        {...x}
                        className="champ"
                        maxLength={120}
                        value={saisie.delivrePar ?? ''}
                        onChange={(e) =>
                          setSaisie({ ...saisie, delivrePar: e.target.value || null })
                        }
                      />
                    )}
                  </Champ>
                  <Champ libelle="Dit par l’école le">
                    {(x) => (
                      <input
                        {...x}
                        className="champ"
                        type="date"
                        max={jourDuCongo()}
                        value={saisie.ditLe ?? ''}
                        onChange={(e) => setSaisie({ ...saisie, ditLe: e.target.value || null })}
                      />
                    )}
                  </Champ>
                  <div className="admin-actions">
                    <Bouton type="submit" enCours={enCours}>
                      Enregistrer le détail
                    </Bouton>
                    <button
                      type="button"
                      className="bouton bouton-secondaire"
                      disabled={enCours}
                      onClick={() => {
                        setOuverte(null);
                        setErreur(null);
                      }}
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {erreur && (
        <p className="message-erreur" role="alert">
          {erreur}
        </p>
      )}
      <p className="mention">
        Tout est dit par l’école : la page écrit « d’après l’école, le [date] ».
      </p>
    </section>
  );
}
