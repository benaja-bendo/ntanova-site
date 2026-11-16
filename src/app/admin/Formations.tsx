/**
 * Saisir les formations d'une école : celles que l'administration lit sur le panneau, l'affiche ou le prospectus
 * photographié (séries du bac, diplômes, domaines, rythmes). C'est ce qui rend les lycées, les écoles techniques
 * et le supérieur cherchables sur le site.
 */
import { v2 } from '@/ui/v2/classes';
import { useState } from 'react';
import {
  avecFormation,
  avecRythmeDesSeries,
  cycleAvecFormations,
  duCycle,
  erreurFormation,
  formationSerie,
  formationVide,
  memeFormation,
  resume,
  rythmeDesSeries,
  sansFormation,
  SERIES_RAPIDES,
} from '../../modele/formations';
import { libelleDiplome, libelleNiveau, libelleRythme, libelleSerie } from '../../modele/libelles';
import { listes, type Valeur } from '../../modele/listes';
import type { DomainePublic, FormationSaisie } from '../../modele/ports';
import { Champ, Choix } from '@/ui/v2/formulaire';

/**
 * Une formation qui n'est pas une série du bac (BTS, licence, couture…) : facultative, donc repliée derrière un lien
 * (fondateur, 16/11) ; les pastilles de séries suffisent le plus souvent.
 */
function AjoutLibre({
  cycle,
  domaines,
  deja,
  surAjout,
}: {
  cycle: Valeur<'niveau'>;
  domaines: readonly DomainePublic[];
  /** Les formations déjà notées pour ce cycle : une même formation (titre, à la casse près) est dite, pas ajoutée. */
  deja: readonly FormationSaisie[];
  surAjout: (f: FormationSaisie) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [f, setF] = useState<FormationSaisie>(() => formationVide(cycle));
  const [erreur, setErreur] = useState<string | undefined>();
  const ajouter = () => {
    const notee = deja.find((x) => memeFormation(x, f));
    const probleme = erreurFormation(f) ?? (notee ? `Déjà notée : ${notee.titre}.` : null);
    setErreur(probleme ?? undefined);
    if (probleme) return;
    surAjout({ ...f, titre: f.titre.trim() });
    setF(formationVide(cycle));
  };
  if (!ouvert)
    return (
      <button type="button" className={`${v2.lien} self-start`} onClick={() => setOuvert(true)}>
        + Autre formation (BTS, licence, couture…)
      </button>
    );
  return (
    <div
      className={v2.motif}
      role="group"
      aria-label={`Ajouter une formation (${libelleNiveau[cycle]})`}
    >
      <Champ
        libelle="Nom de la formation (tel qu’écrit sur le panneau)"
        erreur={erreur}
        aide="Par exemple « BTS Informatique de gestion », « Licence en droit », « Couture »."
      >
        {(a) => (
          <input
            {...a}
            className={v2.champ}
            type="text"
            autoComplete="off"
            maxLength={160}
            value={f.titre}
            onChange={(ev) => {
              setF({ ...f, titre: ev.target.value });
              // L'erreur s'efface dès qu'on écrit : elle revient seulement au prochain « Ajouter ».
              setErreur(undefined);
            }}
          />
        )}
      </Champ>
      <Champ libelle="Domaine" facultatif>
        {(a) => (
          <select
            {...a}
            className={v2.champ}
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
            className={v2.champ}
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
            className={v2.champ}
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
      <div className={v2.large}>
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
      <div className={v2.actionsLarge}>
        <button type="button" className={v2.boutonSecondairePetit} onClick={ajouter}>
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
    <div className="col-span-full flex flex-col gap-2" aria-label="Formations">
      {concernes.map((cycle) => {
        const siennes = duCycle(formations, cycle);
        return (
          <section
            key={cycle}
            className={v2.pileSerree}
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
                  // Une série ajoutée prend le rythme commun des séries du cycle (C4).
                  const f = {
                    ...formationSerie(cycle, serie),
                    rythmes: rythmeDesSeries(formations, cycle),
                  };
                  surChangement(
                    siennes.some((x) => x.serie === serie)
                      ? sansFormation(formations, f)
                      : avecFormation(formations, f),
                  );
                }}
              />
            )}
            {(cycle === 'lycee' || cycle === 'technique') &&
              siennes.some((f) => f.serie !== null) && (
                <Choix
                  legende={`Rythme des séries (${libelleNiveau[cycle]}, toutes à la fois)`}
                  options={listes.study_rhythm.map((r) => ({
                    valeur: r,
                    libelle: libelleRythme[r],
                  }))}
                  valeurs={rythmeDesSeries(formations, cycle)}
                  surChoix={(r) => {
                    const actuel = rythmeDesSeries(formations, cycle);
                    surChangement(
                      avecRythmeDesSeries(
                        formations,
                        cycle,
                        actuel.includes(r) ? actuel.filter((x) => x !== r) : [...actuel, r],
                      ),
                    );
                  }}
                />
              )}
            {siennes.length > 0 && (
              <ul
                className="m-0 flex list-none flex-col gap-2 p-0"
                aria-label={`Formations notées : ${libelleNiveau[cycle]}`}
              >
                {siennes.map((f) => (
                  <li key={f.titre} className={v2.actions}>
                    <span>{resume(f)}</span>
                    <button
                      type="button"
                      className={v2.lien}
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
              deja={siennes}
              surAjout={(f) => surChangement(avecFormation(formations, f))}
            />
          </section>
        );
      })}
      {erreur && <p className={v2.erreur}>{erreur}</p>}
    </div>
  );
}
