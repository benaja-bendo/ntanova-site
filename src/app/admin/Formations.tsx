/**
 * Saisir les formations d'une école : celles que l'administration lit sur le panneau, l'affiche ou le prospectus
 * photographié (séries du bac, diplômes, domaines, rythmes). C'est ce qui rend les lycées, les écoles techniques
 * et le supérieur cherchables sur le site.
 */
import { useState } from 'react';
import {
  avecFormation,
  cycleAvecFormations,
  duCycle,
  erreurFormation,
  formationSerie,
  formationVide,
  resume,
  sansFormation,
  SERIES_RAPIDES,
} from '../../modele/formations';
import { libelleDiplome, libelleNiveau, libelleRythme, libelleSerie } from '../../modele/libelles';
import { listes, type Valeur } from '../../modele/listes';
import type { DomainePublic, FormationSaisie } from '../../modele/ports';
import { Champ, Choix } from '../../ui/composants';

function AjoutLibre({
  cycle,
  domaines,
  surAjout,
}: {
  cycle: Valeur<'niveau'>;
  domaines: readonly DomainePublic[];
  surAjout: (f: FormationSaisie) => void;
}) {
  const [f, setF] = useState<FormationSaisie>(() => formationVide(cycle));
  const [erreur, setErreur] = useState<string | undefined>();
  const ajouter = () => {
    const probleme = erreurFormation(f);
    setErreur(probleme ?? undefined);
    if (probleme) return;
    surAjout({ ...f, titre: f.titre.trim() });
    setF(formationVide(cycle));
  };
  return (
    <div
      className="admin-motif"
      role="group"
      aria-label={`Ajouter une formation (${libelleNiveau[cycle]})`}
    >
      <Champ
        libelle="Ce qui est affiché"
        erreur={erreur}
        aide="Par exemple « BTS Informatique de gestion », « Licence en droit », « Couture »."
      >
        {(a) => (
          <input
            {...a}
            className="champ"
            type="text"
            autoComplete="off"
            maxLength={160}
            value={f.titre}
            onChange={(ev) => setF({ ...f, titre: ev.target.value })}
          />
        )}
      </Champ>
      <Champ libelle="Domaine" facultatif>
        {(a) => (
          <select
            {...a}
            className="champ"
            value={f.domaine ?? ''}
            onChange={(ev) => setF({ ...f, domaine: ev.target.value || null })}
          >
            <option value="">Aucun</option>
            {domaines.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.nom}
              </option>
            ))}
          </select>
        )}
      </Champ>
      <Champ libelle="Diplôme" facultatif>
        {(a) => (
          <select
            {...a}
            className="champ"
            value={f.diplome ?? ''}
            onChange={(ev) =>
              setF({ ...f, diplome: (ev.target.value || null) as Valeur<'diploma_kind'> | null })
            }
          >
            <option value="">Aucun</option>
            {listes.diploma_kind.map((d) => (
              <option key={d} value={d}>
                {libelleDiplome[d]}
              </option>
            ))}
          </select>
        )}
      </Champ>
      <Champ libelle="Série du bac" facultatif>
        {(a) => (
          <select
            {...a}
            className="champ"
            value={f.serie ?? ''}
            onChange={(ev) =>
              setF({ ...f, serie: (ev.target.value || null) as Valeur<'bac_track'> | null })
            }
          >
            <option value="">Aucune</option>
            {listes.bac_track.map((s) => (
              <option key={s} value={s}>
                {libelleSerie[s]}
              </option>
            ))}
          </select>
        )}
      </Champ>
      <div className="admin-pleine-largeur">
        <Choix
          legende="Rythme"
          options={listes.study_rhythm.map((r) => ({ valeur: r, libelle: libelleRythme[r] }))}
          valeurs={f.rythmes}
          surChoix={(r) =>
            setF({
              ...f,
              rythmes: f.rythmes.includes(r)
                ? f.rythmes.filter((x) => x !== r)
                : listes.study_rhythm.filter((x) => x === r || f.rythmes.includes(x)),
            })
          }
        />
      </div>
      <div className="admin-actions admin-pleine-largeur">
        <button type="button" className="bouton bouton-secondaire bouton-petit" onClick={ajouter}>
          Ajouter cette formation
        </button>
      </div>
    </div>
  );
}

/** Les formations des cycles cochés qui en ont (lycée, technique, supérieur, autre formation). */
export function Formations({
  cycles,
  formations,
  domaines,
  surChangement,
  erreur,
}: {
  cycles: readonly Valeur<'niveau'>[];
  formations: readonly FormationSaisie[];
  domaines: readonly DomainePublic[];
  surChangement: (formations: FormationSaisie[]) => void;
  erreur?: string | undefined;
}) {
  const concernes = listes.niveau.filter((c) => cycles.includes(c) && cycleAvecFormations(c));
  if (concernes.length === 0) return null;
  return (
    <div className="admin-pleine-largeur pile-serree" aria-label="Formations">
      {concernes.map((cycle) => {
        const siennes = duCycle(formations, cycle);
        return (
          <section
            key={cycle}
            className="pile-serree"
            aria-label={`Formations : ${libelleNiveau[cycle]}`}
          >
            <h3>Formations : {libelleNiveau[cycle]}</h3>
            {(cycle === 'lycee' || cycle === 'technique') && (
              <Choix
                legende="Séries vues (un appui les ajoute ou les retire)"
                options={SERIES_RAPIDES.map((s) => ({ valeur: s, libelle: libelleSerie[s] }))}
                valeurs={siennes
                  .map((f) => f.serie)
                  .filter((s): s is Valeur<'bac_track'> => s !== null)}
                surChoix={(serie) => {
                  const f = formationSerie(cycle, serie);
                  surChangement(
                    siennes.some((x) => x.serie === serie)
                      ? sansFormation(formations, f)
                      : avecFormation(formations, f),
                  );
                }}
              />
            )}
            {siennes.length > 0 && (
              <ul
                className="admin-liste"
                aria-label={`Formations notées : ${libelleNiveau[cycle]}`}
              >
                {siennes.map((f) => (
                  <li key={f.titre} className="admin-actions">
                    <span>{resume(f)}</span>
                    <button
                      type="button"
                      className="lien"
                      aria-label={`Retirer ${f.titre}`}
                      onClick={() => surChangement(sansFormation(formations, f))}
                    >
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <AjoutLibre
              cycle={cycle}
              domaines={domaines}
              surAjout={(f) => surChangement(avecFormation(formations, f))}
            />
          </section>
        );
      })}
      {erreur && <p className="message-erreur">{erreur}</p>}
    </div>
  );
}
