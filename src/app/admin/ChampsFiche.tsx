import type { FormulaireEcole } from '../../modele/correction-ecole';
import type { Erreurs } from '../../modele/fiche';
import { listes, type Valeur } from '../../modele/listes';
import { libelleNiveau, libelleTypeEcole } from '../../modele/libelles';
import { Champ, Choix } from '../../ui/composants';

/** Les champs d'une fiche : ceux qu'on corrige, et ceux d'une école qu'on ajoute. */
export function ChampsFiche({
  champs,
  erreurs,
  changer,
}: {
  champs: FormulaireEcole;
  erreurs: Erreurs;
  changer: (nouveaux: Partial<FormulaireEcole>) => void;
}) {
  const basculerNiveau = (n: Valeur<'niveau'>) =>
    changer({
      niveaux: champs.niveaux.includes(n)
        ? champs.niveaux.filter((x) => x !== n)
        : listes.niveau.filter((x) => x === n || champs.niveaux.includes(x)),
    });
  return (
    <>
      <Champ libelle="Nom" erreur={erreurs.nom}>
        {(a) => (
          <input
            {...a}
            className="champ"
            type="text"
            autoComplete="off"
            value={champs.nom}
            onChange={(ev) => changer({ nom: ev.target.value })}
          />
        )}
      </Champ>
      <Champ libelle="Type d'école" erreur={erreurs.typeEcole}>
        {(a) => (
          <select
            {...a}
            className="champ"
            value={champs.typeEcole}
            onChange={(ev) => changer({ typeEcole: ev.target.value as Valeur<'type_ecole'> })}
          >
            {(Object.keys(libelleTypeEcole) as Valeur<'type_ecole'>[]).map((t) => (
              <option key={t} value={t}>
                {libelleTypeEcole[t]}
              </option>
            ))}
          </select>
        )}
      </Champ>
      <div className="admin-pleine-largeur">
        <Choix
          legende="Niveaux"
          options={listes.niveau.map((n) => ({ valeur: n, libelle: libelleNiveau[n] }))}
          valeurs={champs.niveaux}
          surChoix={basculerNiveau}
          erreur={erreurs.niveaux}
        />
      </div>
      <Champ libelle="Programme et langues" facultatif erreur={erreurs.programme}>
        {(a) => (
          <input
            {...a}
            className="champ"
            type="text"
            autoComplete="off"
            value={champs.programme}
            onChange={(ev) => changer({ programme: ev.target.value })}
          />
        )}
      </Champ>
      <Champ libelle="Repère" facultatif erreur={erreurs.repere}>
        {(a) => (
          <input
            {...a}
            className="champ"
            type="text"
            autoComplete="off"
            value={champs.repere}
            onChange={(ev) => changer({ repere: ev.target.value })}
          />
        )}
      </Champ>
      <Champ libelle="Numéro sur l'enseigne" facultatif erreur={erreurs.numeroEnseigne}>
        {(a) => (
          <input
            {...a}
            className="champ"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+242 …"
            value={champs.numeroEnseigne}
            onChange={(ev) => changer({ numeroEnseigne: ev.target.value })}
          />
        )}
      </Champ>
    </>
  );
}
