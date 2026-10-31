// Prépare l'import des écoles connues par les entretiens (onglet « Établissements »
// du Sheet, exporté en CSV) : un SQL à lancer dans l'éditeur SQL de Supabase.
//
//   node outils/importer-ecoles.ts <export.csv> > import.sql
//
// Les écoles entrent en brouillon, sans position : jamais publiées ainsi, elles
// attendent qu'un relais les situe (contre-visite). Seul ce qui se voit de la rue
// est repris ; les personnes interrogées, les frais et les notes restent dans le Sheet.
// Le CSV et le SQL contiennent des données réelles : ni l'un ni l'autre dans git.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { normaliserTelephone } from '../src/modele/telephone.ts';

type Niveau = 'maternelle' | 'primaire' | 'college' | 'lycee' | 'technique' | 'superieur';
type TypeEcole = 'publique' | 'privee' | 'confessionnelle' | 'non_indique';

export interface EcoleImportee {
  reference: string;
  nom: string;
  quartier: string | null;
  arrondissement: 'tie-tie' | 'ngoyo' | null;
  typeEcole: TypeEcole;
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

export function niveauxDe(texte: string): Niveau[] {
  const t = texte.toLowerCase();
  const niveaux: Niveau[] = [];
  if (/matern|préscolaire|prescolaire|crèche|creche|garderie/.test(t)) niveaux.push('maternelle');
  if (/primaire/.test(t)) niveaux.push('primaire');
  if (/collège|college|secondaire/.test(t)) niveaux.push('college');
  if (/lycée|lycee/.test(t)) niveaux.push('lycee');
  if (/technique/.test(t)) niveaux.push('technique');
  if (/supérieur|superieur|université|universite/.test(t)) niveaux.push('superieur');
  return niveaux;
}

export function typeDe(texte: string): TypeEcole {
  const t = texte.toLowerCase();
  if (/confession/.test(t)) return 'confessionnelle';
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

/** Garde les écoles de Pointe-Noire, nommées, du primaire au lycée. */
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
    } else if (
      /hors cible/i.test(statut) ||
      (niveaux.length > 0 && niveaux.every((n) => n === 'superieur'))
    ) {
      ecartees.push({ reference, raison: 'hors cible (enseignement supérieur)' });
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
        niveaux,
        repere,
        numeroEnseigne: normaliserTelephone(premierNumero),
      });
    }
  }
  return { ecoles, ecartees };
}

const sql = (valeur: string | null) =>
  valeur === null ? 'null' : `'${valeur.replaceAll("'", "''")}'`;

/** Le SQL : se relance sans créer de doublon (une école par référence). */
export function versSql(ecoles: EcoleImportee[], ecartees: Ecartee[], source: string): string {
  const blocs = ecoles.map(
    (e) => `-- ${e.reference}
with nouvelle as (
  insert into public.ecoles (arrondissement_id, slug, nom, quartier, type_ecole, niveaux, repere, numero_enseigne, publication)
  select ${e.arrondissement ? `(select id from public.arrondissements where slug = ${sql(e.arrondissement)})` : 'null'},
         public.slugifier(${sql(e.nom)}), ${sql(e.nom)}, ${sql(e.quartier)}, ${sql(e.typeEcole)},
         '{${e.niveaux.join(',')}}', ${sql(e.repere)}, ${sql(e.numeroEnseigne)}, 'brouillon'
  where not exists (select 1 from prive.ecoles_sources where reference = ${sql(e.reference)})
  returning id
)
insert into prive.ecoles_sources (ecole_id, reference) select id, ${sql(e.reference)} from nouvelle;`,
  );
  const ecarteesTexte = ecartees.map((e) => `--   ${e.reference} : ${e.raison}`).join('\n');
  return `-- Écoles à situer, importées de ${source}.
-- Généré par outils/importer-ecoles.ts. À lancer dans l'éditeur SQL de Supabase.
-- En brouillon, sans position : rien n'est publié. Se relance sans doublon.
-- Écartées :
${ecarteesTexte || '--   aucune'}

begin;

${blocs.join('\n\n')}

commit;

-- Vérifier :
-- select e.nom, e.quartier, s.reference from public.ecoles e join prive.ecoles_sources s on s.ecole_id = e.id;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = process.argv[2];
  if (!chemin) {
    console.error('Usage : node outils/importer-ecoles.ts <export.csv> > import.sql');
    process.exit(1);
  }
  const { ecoles, ecartees } = versEcoles(lireCsv(readFileSync(chemin, 'utf8')));
  process.stdout.write(
    versSql(ecoles, ecartees, "l'onglet Établissements du Sheet des entretiens"),
  );
  console.error(`${ecoles.length} écoles à importer, ${ecartees.length} écartées.`);
}
