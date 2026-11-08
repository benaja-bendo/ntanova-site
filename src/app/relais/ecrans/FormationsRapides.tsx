/**
 * Les séries du lycée et les filières du technique, du supérieur et des autres formations, cochées sur place, sans
 * clavier (audit de la fiche relais, 08/11/2026). Debout, au soleil, devant une pancarte qui liste quinze BTS et
 * licences : on touche le diplôme, puis les domaines ; chaque toucher sur un domaine ajoute une filière
 * (« BTS Gestion »), qu'un toucher retire. Le texte court n'est que le dernier recours, une ligne dans la page.
 *
 * Ce que le relais coche préremplit « À valider » : l'administration le corrige avant d'accepter, rien ne se publie seul.
 * Les règles (intitulés, plafond, doublons) sont dans `src/modele/formations-rapides.ts`.
 */
import { useState } from 'react';
import { SERIES_RAPIDES } from '../../../modele/formations';
import {
  DOMAINES_RAPIDES,
  DOMAINES_VISIBLES,
  basculerFormation,
  basculerSerie,
  diplomesDuCycle,
  estCochee,
  formationLibre,
  formationRapide,
  formationsDuCycle,
  seriesCochees,
} from '../../../modele/formations-rapides';
import { libelleDiplome, libelleNiveau, libelleSerie } from '../../../modele/libelles';
import type { Valeur } from '../../../modele/listes';
import type { FormationSaisie } from '../../../modele/ports';
import { Champ, Choix } from '../composants';

const CYCLES_A_FILIERES = ['technique', 'superieur', 'autre_formation'] as const;

export function FormationsRapides({
  niveaux,
  formations,
  surChangement,
}: {
  niveaux: readonly Valeur<'niveau'>[];
  formations: readonly FormationSaisie[];
  surChangement: (liste: FormationSaisie[]) => void;
}) {
  return (
    <div className="pile-serree" data-testid="formations-rapides">
      {niveaux.includes('lycee') && (
        <Choix
          legende="Séries du lycée : touchez celles qui sont écrites"
          options={SERIES_RAPIDES.map((s) => ({ valeur: s, libelle: libelleSerie[s] }))}
          valeurs={seriesCochees(formations)}
          surChoix={(s) => surChangement(basculerSerie(formations, s))}
          colonnes={3}
        />
      )}
      {CYCLES_A_FILIERES.filter((c) => niveaux.includes(c)).map((cycle) => (
        <FilieresDuCycle
          key={cycle}
          cycle={cycle}
          formations={formations}
          surChangement={surChangement}
        />
      ))}
    </div>
  );
}

function FilieresDuCycle({
  cycle,
  formations,
  surChangement,
}: {
  cycle: (typeof CYCLES_A_FILIERES)[number];
  formations: readonly FormationSaisie[];
  surChangement: (liste: FormationSaisie[]) => void;
}) {
  const diplomes = diplomesDuCycle(cycle);
  // Le diplôme « en cours » est posé d'avance (le premier de la liste) : un toucher sur un domaine suffit.
  const [diplome, setDiplome] = useState<Valeur<'diploma_kind'>>(diplomes[0] ?? 'autre');
  const [toutVoir, setToutVoir] = useState(false);
  // `null` : la ligne « Autre filière » est fermée ; sinon, ce qui s'y écrit.
  const [autre, setAutre] = useState<string | null>(null);

  const notees = formationsDuCycle(formations, cycle);
  const domaines = toutVoir ? DOMAINES_RAPIDES : DOMAINES_RAPIDES.slice(0, DOMAINES_VISIBLES);
  const cochesPourCeDiplome = DOMAINES_RAPIDES.filter((d) => {
    const f = formationRapide(cycle, diplome, d.slug);
    return f !== null && estCochee(formations, f);
  }).map((d) => d.slug);

  const toucherDomaine = (slug: string) => {
    const f = formationRapide(cycle, diplome, slug);
    if (f) surChangement(basculerFormation(formations, f));
  };
  const ajouterLibre = () => {
    const f = formationLibre(cycle, diplome, autre ?? '');
    if (!f) return;
    surChangement(basculerFormation(formations, f));
    setAutre('');
  };

  return (
    <section
      className="carte-blanche pile-serree"
      aria-label={`Filières : ${libelleNiveau[cycle]}`}
      data-cycle={cycle}
    >
      <p className="surtitre">Filières · {libelleNiveau[cycle]}</p>
      <Choix
        legende="1. Le diplôme écrit sur le panneau"
        options={diplomes.map((d) => ({ valeur: d, libelle: libelleDiplome[d] }))}
        valeurs={[diplome]}
        surChoix={setDiplome}
      />
      <Choix
        legende={`2. Les domaines (${libelleDiplome[diplome]}) : touchez chacun`}
        options={domaines.map((d) => ({ valeur: d.slug, libelle: d.libelle }))}
        valeurs={cochesPourCeDiplome}
        surChoix={toucherDomaine}
      />
      {!toutVoir && (
        <button type="button" className="lien" onClick={() => setToutVoir(true)}>
          Plus de domaines
        </button>
      )}

      {autre === null ? (
        <button type="button" className="lien" onClick={() => setAutre('')}>
          + Autre filière…
        </button>
      ) : (
        <div className="pile-serree">
          <Champ
            libelle="Autre filière"
            aide={`Un mot ou deux, avec le diplôme en cours (${libelleDiplome[diplome]}). Ex. : Pâtisserie.`}
          >
            {(a) => (
              <input
                {...a}
                className="champ"
                type="text"
                autoComplete="off"
                maxLength={100}
                value={autre}
                onChange={(e) => setAutre(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    ajouterLibre();
                  }
                }}
              />
            )}
          </Champ>
          <button
            type="button"
            className="bouton bouton-secondaire bouton-petit"
            disabled={autre.trim() === ''}
            onClick={ajouterLibre}
          >
            Ajouter cette filière
          </button>
        </div>
      )}

      {notees.length > 0 && (
        <div className="pile-serree">
          <p className="mention">
            <b>
              {notees.length} filière{notees.length > 1 ? 's' : ''} notée
              {notees.length > 1 ? 's' : ''}
            </b>{' '}
            · touchez-en une pour la retirer
          </p>
          <div
            className="choix-ligne"
            role="group"
            aria-label={`Filières notées : ${libelleNiveau[cycle]}`}
          >
            {notees.map((f) => (
              <button
                key={f.titre}
                type="button"
                className="pastille-choix"
                aria-pressed="true"
                aria-label={`Retirer : ${f.titre}`}
                onClick={() => surChangement(basculerFormation(formations, f))}
              >
                {f.titre} ×
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
