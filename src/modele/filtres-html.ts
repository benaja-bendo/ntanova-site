/**
 * Les filtres de « Les écoles » en HTML, écrits une seule fois (lot 4 bis, 16/11/2026) : la page construite les pose pour
 * l'état sans choix, le navigateur les réécrit à chaque choix, avec les mêmes balises. Planches « Feuille Filtres » et
 * « Les filtres : aujourd'hui et demain » de la version 46. Pur : ni DOM, ni Astro.
 */
import { echapper } from './carte-ecole';
import type { EtatListe, GroupeAffiche, Groupe } from './liste-ecoles';
import { RAYONS_M } from './liste-ecoles';

const CROIX = '<span class="filtre-croix" aria-hidden="true">×</span>';

/** Les groupes de formation ne s'ouvrent que si le niveau qui les porte est choisi (ou s'ils ont déjà un choix). */
const PORTE: Partial<Record<Groupe, readonly string[]>> = {
  serie: ['L'],
  diplome: ['T', 'S'],
  domaine: ['T', 'S'],
  rythme: ['T', 'S'],
};

export function groupeOuvert(g: GroupeAffiche, etat: EtatListe): boolean {
  const porte = PORTE[g.groupe];
  if (!porte) return true;
  return g.options.some((o) => o.choisie) || etat.choix.niveau.some((n) => porte.includes(n));
}

function bouton(g: Groupe, valeur: string, libelle: string, nombre: number, choisie: boolean): string {
  const disque =
    g === 'niveau' ? `<span class="disque disque-s c-${echapper(valeur)}" aria-hidden="true">${echapper(valeur)}</span>` : '';
  return (
    `<button type="button" class="pastille-choix filtre-option${nombre === 0 ? ' filtre-vide' : ''}" ` +
    `data-groupe="${g}" data-valeur="${echapper(valeur)}" aria-pressed="${choisie}">` +
    `${disque}${echapper(libelle)} <span class="filtre-nombre">(${nombre})</span>${choisie ? CROIX : ''}</button>`
  );
}

/**
 * Les groupes, dans l'ordre de la feuille. Les groupes de formation fermés deviennent une seule ligne qui dit quand ils
 * s'ouvrent. « Autour de moi » vient après l'arrondissement : ses rayons ne se comptent qu'avec la position.
 */
export function htmlFiltres(
  groupes: readonly GroupeAffiche[],
  etat: EtatListe,
  rayons: readonly { rayonM: number; nombre: number; choisi: boolean }[] | null,
): string {
  const parties: string[] = [];
  let formationFermee = false;
  const poserRayons = () => {
    const boutons = (rayons ?? RAYONS_M.map((r) => ({ rayonM: r, nombre: -1, choisi: etat.rayonM === r })))
      .map(
        (r) =>
          `<button type="button" class="pastille-choix filtre-option" data-rayon="${r.rayonM}" aria-pressed="${r.choisi}">` +
          `${r.rayonM / 1000}&nbsp;km${r.nombre >= 0 ? ` <span class="filtre-nombre">(${r.nombre})</span>` : ''}${r.choisi ? CROIX : ''}</button>`,
      )
      .join('');
    parties.push(
      `<fieldset class="filtre-groupe" data-groupe-rayon><legend>Autour de moi</legend><div class="filtre-options">${boutons}</div>` +
        `<p class="filtre-note">Votre position reste dans votre téléphone.</p></fieldset>`,
    );
  };
  let rayonsPoses = false;
  for (const g of groupes) {
    if (!rayonsPoses && g.groupe !== 'ville' && g.groupe !== 'arrondissement') {
      poserRayons();
      rayonsPoses = true;
    }
    if (!groupeOuvert(g, etat)) {
      formationFermee = true;
      continue;
    }
    const plusieurs = g.groupe === 'niveau' ? '<span class="filtre-plusieurs">plusieurs choix</span>' : '';
    parties.push(
      `<fieldset class="filtre-groupe" data-groupe="${g.groupe}"><legend>${echapper(g.titre)}${plusieurs}</legend>` +
        `<div class="filtre-options">${g.options.map((o) => bouton(g.groupe, o.valeur, o.libelle, o.nombre, o.choisie)).join('')}</div></fieldset>`,
    );
  }
  if (!rayonsPoses) poserRayons();
  if (formationFermee)
    parties.push(
      '<p class="filtre-info">Séries du bac, diplômes et domaines s’ouvrent quand vous choisissez Lycée, Technique ou Supérieur.</p>',
    );
  return parties.join('');
}
