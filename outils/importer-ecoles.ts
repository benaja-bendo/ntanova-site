// Prépare l'import des écoles connues par les entretiens (onglet « Établissements »
// du Sheet, exporté en CSV) : un fichier JSON à coller dans l'administration, onglet « Écoles »,
// « Ajouter ou importer des écoles » › « Une liste (CSV ou JSON) ». L'écran le vérifie en
// simulation (rien n'est écrit), dit ce qui ne va pas ligne par ligne, puis importe.
//
//   node outils/importer-ecoles.ts <export.csv> > import.json
//
// Les écoles entrent à situer (sans position) : jamais publiées ainsi, elles attendent qu'un
// relais les situe (contre-visite) ou que l'administration le fasse. Seul ce qui se voit de la
// rue est repris ; les personnes interrogées, les frais et les notes restent dans le Sheet.
// L'annuaire couvre toutes les écoles, de la crèche au supérieur : rien n'est écarté pour
// son niveau ou son statut. Un type seulement « probable » (déduit d'un indice, jamais vu)
// n'est pas repris comme un fait : « Pas indiqué », jusqu'à la contre-visite.
// Le référence (ETB-012) rend l'import rejouable : une école déjà importée est « déjà connue »,
// jamais dédoublée.
// Le CSV et le JSON contiennent des données réelles : ni l'un ni l'autre dans git.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Valeur } from '../src/modele/listes.ts';
import type { EntreeCatalogue } from '../src/modele/ports.ts';
import { normaliserTelephone } from '../src/modele/telephone.ts';

type Niveau = Valeur<'niveau'>;
type TypeEcole = Valeur<'type_ecole'>;

export interface EcoleImportee {
  reference: string;
  nom: string;
  quartier: string | null;
  arrondissement: 'tie-tie' | 'ngoyo' | null;
  typeEcole: TypeEcole;
  /** Le statut disait « probable » : le type est « Pas indiqué », et une école déjà importée y revient. */
  typeProbable: boolean;
  niveaux: Niveau[];
  repere: string | null;
  numeroEnseigne: string | null;
}

export interface Ecartee {
  reference: string;
  raison: string;
}

/** Un CSV simple (guillemets, virgules et retours à la ligne dans les champs). */
export function lireCsv(texte: string): Record<string, string>[] {
  const lignes: string[][] = [];
  let champ = '';
  let ligne: string[] = [];
  let entreGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') entreGuillemets = false;
      else champ += c;
    } else if (c === '"') entreGuillemets = true;
    else if (c === ',') {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else champ += c;
  }
  if (champ !== '' || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  const [entetes = [], ...donnees] = lignes;
  return donnees
    .filter((l) => l.some((v) => v.trim() !== ''))
    .map((l) => Object.fromEntries(entetes.map((e, i) => [e.trim(), (l[i] ?? '').trim()])));
}

const sansParentheses = (texte: string) => texte.replace(/\s*\([^)]*\)/g, '').trim();
const vide = (texte: string | undefined) => (!texte || texte.trim() === '' ? null : texte.trim());

/** Dans l'ordre de la liste, de la crèche au supérieur. */
export function niveauxDe(texte: string): Niveau[] {
  const t = texte.toLowerCase();
  const niveaux: Niveau[] = [];
  if (/crèche|creche|garderie/.test(t)) niveaux.push('creche');
  if (/matern|préscolaire|prescolaire/.test(t)) niveaux.push('maternelle');
  if (/primaire/.test(t)) niveaux.push('primaire');
  if (/collège|college|secondaire/.test(t)) niveaux.push('college');
  if (/lycée|lycee/.test(t)) niveaux.push('lycee');
  if (/technique|professionnel/.test(t)) niveaux.push('technique');
  if (/supérieur|superieur|université|universite/.test(t)) niveaux.push('superieur');
  return niveaux;
}

/** « Privé (probable) » : déduit de la présence d'un PDG, jamais vu. */
export const estProbable = (statut: string) => /probable/i.test(statut);

export function typeDe(texte: string): TypeEcole {
  const t = texte.toLowerCase();
  if (estProbable(t)) return 'non_indique';
  if (/confession/.test(t)) return 'confessionnelle';
  if (/communaut/.test(t)) return 'communautaire';
  if (/priv/.test(t)) return 'privee';
  if (/public/.test(t)) return 'publique';
  return 'non_indique';
}

export function arrondissementDe(texte: string): EcoleImportee['arrondissement'] {
  const t = texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  if (/ngoyo/.test(t)) return 'ngoyo';
  if (/tie[\s-]?tie/.test(t)) return 'tie-tie';
  return null;
}

/** Garde les écoles de Pointe-Noire qui ont un nom, de la crèche au supérieur. */
export function versEcoles(lignes: Record<string, string>[]): {
  ecoles: EcoleImportee[];
  ecartees: Ecartee[];
} {
  const ecoles: EcoleImportee[] = [];
  const ecartees: Ecartee[] = [];
  for (const l of lignes) {
    const reference = l['ID établissement'] ?? '';
    if (!/^ETB-\d+$/.test(reference)) continue;
    const nom = sansParentheses(l['Nom'] ?? '');
    const statut = l['Statut'] ?? '';
    // Les parenthèses sont des remarques : « (pas de lycée) » ne veut pas dire lycée.
    const niveaux = niveauxDe(sansParentheses(l['Niveaux'] ?? ''));
    if (!nom || /à confirmer/i.test(nom)) {
      ecartees.push({ reference, raison: 'nom inconnu' });
    } else if (!/pointe-noire/i.test(l['Ville'] ?? '')) {
      ecartees.push({ reference, raison: 'ville inconnue ou hors de Pointe-Noire' });
    } else {
      const quartier = vide(sansParentheses(l['Quartier'] ?? ''));
      const repere = vide(l['Adresse ou repère']);
      const premierNumero = (l["Téléphone de l'enseigne"] ?? '').split(';')[0] ?? '';
      ecoles.push({
        reference,
        nom,
        quartier,
        arrondissement: arrondissementDe(`${quartier ?? ''} ${repere ?? ''}`),
        typeEcole: typeDe(statut),
        typeProbable: estProbable(statut),
        niveaux,
        repere,
        numeroEnseigne: normaliserTelephone(premierNumero),
      });
    }
  }
  return { ecoles, ecartees };
}

/** Les divisions où l'import sait ranger une école (l'adresse ltree de `geo_divisions`). */
const DIVISIONS: Record<NonNullable<EcoleImportee['arrondissement']>, string> = {
  'tie-tie': 'congo.pointe_noire.pointe_noire.tie_tie',
  ngoyo: 'congo.pointe_noire.pointe_noire.ngoyo',
};

/**
 * Les écoles au format de l'import de l'administration (`EntreeCatalogue`) : une institution, un campus,
 * ses cycles. Sans position, l'école est « à situer » ; sans arrondissement connu, la division est à choisir.
 */
export function versEntrees(ecoles: EcoleImportee[]): EntreeCatalogue[] {
  return ecoles.map((e) => ({
    reference: e.reference,
    nom: e.nom,
    genre: e.typeEcole,
    campus: [
      {
        etiquette: null,
        division: e.arrondissement ? DIVISIONS[e.arrondissement] : null,
        quartier: e.quartier,
        repere: e.repere,
        numeroEnseigne: e.numeroEnseigne,
        position: null,
        programme: null,
        cycles: e.niveaux.map((cycle) => ({ cycle, formations: [] })),
      },
    ],
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = process.argv[2];
  if (!chemin) {
    console.error('Usage : node outils/importer-ecoles.ts <export.csv> > import.json');
    process.exit(1);
  }
  const { ecoles, ecartees } = versEcoles(lireCsv(readFileSync(chemin, 'utf8')));
  process.stdout.write(`${JSON.stringify(versEntrees(ecoles), null, 2)}\n`);
  console.error(`${ecoles.length} écoles à importer, ${ecartees.length} écartées.`);
  for (const e of ecartees) console.error(`  écartée : ${e.reference} (${e.raison})`);
}
