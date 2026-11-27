/**
 * Avant d'accepter (ticket 236, 27/11) : ce qu'on relit selon la cible choisie, ce qu'une fiche complétée changerait, et la
 * décision qui part vers la base. En complétant une fiche, rien d'existant n'est remplacé sans un choix
 * (`comparaison-fiche.ts`) ; un nouveau site garde le nom et le type de l'école. Pur : ni DOM, ni réseau.
 */
import type { ChoixNumero, Cible } from './acceptation';
import {
  CLES_A_GARDER,
  differencesAvecLaFiche,
  niveauxApres,
  seraPris,
  type ChampAGarder,
  type ChampCompare,
  type ChoixDeFiche,
  type Difference,
} from './comparaison-fiche';
import { correctionsDuMode } from './correction-ecole';
import type { Point } from './geo';
import type { Valeur } from './listes';
import type {
  CorrectionEcole,
  DecisionAcceptation,
  DetailReleve,
  EcoleVue,
  FaitGarde,
  FormationSaisie,
} from './ports';

export type Relecture =
  | { mode: 'nouvelle' }
  | { mode: 'nouveau_site'; institutionId: string }
  | { mode: 'completer'; campusId: string };

type FicheRelue = Pick<
  DetailReleve,
  'essai' | 'type' | 'corrigeUneFicheEnAttente' | 'campusCorrige'
>;

/** Vrai : la correction d'une école déjà créée ; elle la met à jour, quelle que soit la réponse à « école connue ? ». */
const corrigeUneEcole = (fiche: Pick<DetailReleve, 'type' | 'corrigeUneFicheEnAttente'>) =>
  fiche.type === 'correction' && !fiche.corrigeUneFicheEnAttente;

/** Ce qu'on peut corriger avant d'accepter ; nul : rien (lot d'essai, niveaux ajoutés, école pas encore choisie). */
export function relectureDe(fiche: FicheRelue, cible: Cible): Relecture | null {
  if (fiche.essai) return null;
  if (corrigeUneEcole(fiche))
    return fiche.campusCorrige ? { mode: 'completer', campusId: fiche.campusCorrige } : null;
  switch (cible.mode) {
    case 'nouvelle':
      return { mode: 'nouvelle' };
    case 'new_campus':
      return cible.institutionId
        ? { mode: 'nouveau_site', institutionId: cible.institutionId }
        : null;
    case 'update_campus':
      return cible.campusId ? { mode: 'completer', campusId: cible.campusId } : null;
    case 'add_cycle':
      return null;
  }
}

type FicheComparee = Pick<
  DetailReleve,
  | 'type'
  | 'nomEnseigne'
  | 'sigle'
  | 'typeEcole'
  | 'niveaux'
  | 'programme'
  | 'repere'
  | 'numeroEnseigne'
  | 'position'
>;

/** La valeur corrigée par l'administration, même vidée ; sinon celle du relevé. */
const retenue = <T>(corrigee: T | undefined, relevee: T): T =>
  corrigee !== undefined ? corrigee : relevee;

/** En complétant une fiche : ce que le relevé, corrigé au besoin, changerait à l'école visée. */
export function comparerAvecLEcole(
  fiche: FicheComparee,
  corrections: CorrectionEcole,
  /** La position lue par l'administration, quand le relevé n'en a pas. */
  positionSaisie: Point | null,
  ecole: EcoleVue,
  ecoles: readonly Pick<EcoleVue, 'institutionId'>[],
): Difference[] {
  const c = correctionsDuMode(corrections, 'completer', ecole);
  return differencesAvecLaFiche(
    ecole,
    {
      nom: c.nom ?? fiche.nomEnseigne,
      sigle: retenue(c.sigle, fiche.sigle ?? null),
      typeEcole: c.typeEcole ?? fiche.typeEcole,
      niveaux: c.niveaux ?? fiche.niveaux,
      programme: retenue(c.programme, fiche.programme),
      repere: retenue(c.repere, fiche.repere),
      numeroEnseigne: retenue(c.numeroEnseigne, fiche.numeroEnseigne),
      position: fiche.position ?? positionSaisie,
      etiquette: corrections.etiquette?.trim() || null,
      anneeCreation: c.anneeCreation ?? null,
    },
    {
      sitesDeLEcole: ecoles.filter((e) => e.institutionId === ecole.institutionId).length,
      correction: fiche.type === 'correction',
    },
  );
}

/** Ce que l'administration a saisi sur la fiche, au moment d'accepter. */
export interface SaisieDeLaDecision {
  formations: FormationSaisie[];
  faits: FaitGarde[];
  divisionId: string | null;
  /** La position lue par l'administration, quand le relevé n'en a pas. */
  position: Point | null;
  corrections: CorrectionEcole;
  choixNumero: ChoixNumero | null;
}

export interface EcoleVisee {
  /** En complétant une fiche : l'école, ce qui changerait, et les choix. Nul tant qu'elle n'est pas lue. */
  completer: { ecole: EcoleVue; differences: Difference[]; choix: ChoixDeFiche } | null;
  /** Pour un nouveau site : un site de l'école, qui porte son sigle et son année. */
  accueil: Pick<EcoleVue, 'sigle' | 'anneeCreation'> | null;
}

const desNiveaux = (formations: FormationSaisie[], niveaux: readonly Valeur<'niveau'>[]) =>
  formations.filter((f) => niveaux.includes(f.cycle));

/** La décision qui part avec « Accepter ». */
export function decisionDAcceptation(
  fiche: FicheRelue & FicheComparee,
  cible: Cible,
  saisie: SaisieDeLaDecision,
  visee: EcoleVisee,
): DecisionAcceptation {
  const { formations, faits, divisionId, position, corrections, choixNumero } = saisie;
  const relecture = relectureDe(fiche, cible);
  // Une correction d'une école que l'écran ne retrouve pas : la base la reconnaît seule.
  if (!relecture && corrigeUneEcole(fiche)) return {};
  const commun: DecisionAcceptation = {
    formations,
    ...(faits.length > 0 ? { faits } : {}),
    ...(divisionId ? { divisionId } : {}),
  };
  const saisieLue = position ? { position } : {};
  const etiquette = corrections.etiquette?.trim() || null;
  // Le relevé seul, pour un lot d'essai (jamais accepté) ; des niveaux ajoutés ne corrigent rien.
  if (!relecture)
    return cible.mode === 'add_cycle'
      ? { ...commun, mode: 'add_cycle', campusId: cible.campusId }
      : { ...commun, ...saisieLue };

  switch (relecture.mode) {
    case 'nouvelle': {
      const c = correctionsDuMode(corrections, 'nouvelle', null);
      return {
        ...commun,
        ...saisieLue,
        formations: c.niveaux ? desNiveaux(formations, c.niveaux) : formations,
        corrections: {
          // Le sigle lu par le relais remplit celui de la nouvelle école, sauf si l'administration l'a corrigé.
          ...(fiche.sigle && corrections.sigle === undefined ? { sigle: fiche.sigle } : {}),
          ...c,
          ...(choixNumero === 'retire' ? { numeroEnseigne: null } : {}),
        },
        mode: 'new_institution',
        etiquette,
        ...(cible.mode === 'nouvelle' && cible.memeLieuQue
          ? { memeLieuQue: cible.memeLieuQue }
          : {}),
      };
    }
    case 'nouveau_site': {
      const c = correctionsDuMode(corrections, 'nouveau_site', visee.accueil);
      if (choixNumero === 'retire') c.numeroEnseigne = null;
      return {
        ...commun,
        ...saisieLue,
        formations: c.niveaux ? desNiveaux(formations, c.niveaux) : formations,
        ...(Object.keys(c).length > 0 ? { corrections: c } : {}),
        mode: 'new_campus',
        institutionId: relecture.institutionId,
        etiquette,
      };
    }
    case 'completer': {
      const { ecole = null, differences = [], choix = {} } = visee.completer ?? {};
      const pris = (champ: ChampCompare) =>
        !(champ === 'numeroEnseigne' && choixNumero === 'retire') &&
        differences.some((d) => d.champ === champ && seraPris(d, choix));
      // Tout ce qui n'est pas pris reste comme la fiche le dit aujourd'hui.
      const garder = (Object.keys(CLES_A_GARDER) as ChampAGarder[]).filter((x) => !pris(x));
      const c = correctionsDuMode(corrections, 'completer', ecole);
      for (const champ of garder) if (champ !== 'position') delete c[champ];
      if (!pris('anneeCreation')) delete c.anneeCreation;
      // Une formation d'un niveau que la fiche n'aura pas ne l'ajoute pas en cachette.
      const niveaux = !ecole
        ? null
        : ecole.verifieeLe || garder.includes('niveaux')
          ? ecole.niveaux
          : niveauxApres(ecole.niveaux, c.niveaux ?? fiche.niveaux, fiche.type === 'correction');
      return {
        ...commun,
        ...(pris('position') ? saisieLue : {}),
        formations: niveaux ? desNiveaux(formations, niveaux) : formations,
        corrections: c,
        garder,
        mode: 'update_campus',
        campusId: relecture.campusId,
        etiquette: pris('etiquette') ? etiquette : null,
      };
    }
  }
}
