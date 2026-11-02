/**
 * Ajouter une école depuis l'administration, sans relais : le formulaire, ses contrôles, et ce qui part vers la
 * base (une institution, un campus, ses cycles et ses formations). Pur : ni base ni écran.
 * L'administration tutoie le fondateur.
 */
import { z } from 'zod';
import { lirePosition } from './coordonnees';
import { erreursDe, type Erreurs } from './fiche';
import { erreurFormation } from './formations';
import { listes, type Valeur } from './listes';
import type { EntreeCatalogue, FormationSaisie } from './ports';
import { normaliserTelephone } from './telephone';

export interface FormulaireCreation {
  nom: string;
  genre: Valeur<'type_ecole'>;
  /** « Campus de Loandjili » : facultatif, utile quand l'institution a plusieurs implantations. */
  etiquette: string;
  /** L'identifiant ou le chemin d'une division ; vide : la base la cherche d'après la position. */
  division: string;
  quartier: string;
  repere: string;
  numeroEnseigne: string;
  /** Ce que Google Maps donne, tel que collé. Jamais inventé : vide, l'école reste « à situer ». */
  position: string;
  programme: string;
  cycles: Valeur<'niveau'>[];
  formations: FormationSaisie[];
}

/** Rien n'est coché d'avance. */
export function formulaireCreationVide(): FormulaireCreation {
  return {
    nom: '',
    genre: 'non_indique',
    etiquette: '',
    division: '',
    quartier: '',
    repere: '',
    numeroEnseigne: '',
    position: '',
    programme: '',
    cycles: [],
    formations: [],
  };
}

const schema = z.object({
  nom: z.string().trim().min(1, 'Écris le nom de l’école.').max(200, 'Ce nom est trop long.'),
  genre: z.enum(listes.type_ecole, { message: 'Choisis un type d’école dans la liste.' }),
  etiquette: z.string().max(120, 'Ce nom de campus est trop long.'),
  quartier: z.string().max(100, 'Ce quartier est trop long.'),
  repere: z.string().max(300, 'Ce repère est trop long.'),
  numeroEnseigne: z.string().refine((v) => v.trim() === '' || normaliserTelephone(v) !== null, {
    message: 'Ce numéro ne semble pas complet.',
  }),
  programme: z.string().max(200, 'Cette ligne est trop longue.'),
  cycles: z.array(z.enum(listes.niveau, { message: 'Choisis les niveaux dans la liste.' })),
});

/** Les messages d'erreur, champ par champ. Vide : le formulaire peut partir. */
export function erreursCreation(champs: FormulaireCreation): Erreurs {
  const erreurs: Erreurs = { ...erreursDe(schema.safeParse(champs)) };
  if (champs.position.trim() !== '' && lirePosition(champs.position) === null) {
    erreurs['position'] =
      'Position illisible : colle la latitude puis la longitude, par exemple -4.79105, 11.92500.';
  }
  const horsCycle = champs.formations.find((f) => !champs.cycles.includes(f.cycle));
  if (horsCycle) erreurs['formations'] = 'Une formation est dans un niveau qui n’est pas coché.';
  const mauvaise = champs.formations.map(erreurFormation).find((e) => e !== null);
  if (mauvaise) erreurs['formations'] = mauvaise;
  return erreurs;
}

const vide = (texte: string): string | null => (texte.trim() === '' ? null : texte.trim());

/** Ce qui part vers la base : les champs vides deviennent « rien ». Suppose `erreursCreation` vide. */
export function versEntree(champs: FormulaireCreation): EntreeCatalogue {
  return {
    reference: null,
    nom: champs.nom.trim(),
    genre: champs.genre,
    campus: [
      {
        etiquette: vide(champs.etiquette),
        division: vide(champs.division),
        quartier: vide(champs.quartier),
        repere: vide(champs.repere),
        numeroEnseigne: normaliserTelephone(champs.numeroEnseigne),
        position: lirePosition(champs.position),
        programme: vide(champs.programme),
        cycles: listes.niveau
          .filter((c) => champs.cycles.includes(c))
          .map((cycle) => ({
            cycle,
            formations: champs.formations
              .filter((f) => f.cycle === cycle)
              .map((f) => ({
                titre: f.titre.trim(),
                domaine: f.domaine,
                serie: f.serie,
                diplome: f.diplome,
                rythmes: f.rythmes,
              })),
          })),
      },
    ],
  };
}
