/**
 * L'accueil de l'espace relais (lot H, 13/11/2026 ; planche « Relais · Missions ») : ce qui attend le relais, dans l'ordre
 * où il doit le faire, puis sa semaine. Remplace « Mon secteur » (décision du fondateur du 13/11 : on relève partout).
 * Calculé sur ce que le téléphone garde : il marche hors ligne.
 */
import type { EcoleACompleter, ReleveRecu } from './ports';
import { libelleMotif } from './libelles';
import type { Valeur } from './listes';

export type GenreDeMission = 'a_corriger' | 'mission';

export interface MissionDeLAccueil {
  genre: GenreDeMission;
  /** Le relevé à corriger, ou le site confié. */
  id: string;
  nom: string;
  /** L'étiquette : « À corriger », « Mission · avant le 20 novembre », « À situer »… */
  etiquette: string;
  /** Ce qu'il faut faire, en une phrase. */
  texte: string;
  enRetard: boolean;
  /** Pour une mission : son identifiant, s'il y en a un (une mission d'avant n'en a pas). */
  missionId: string | null;
}

const consigneParGenre: Record<Valeur<'mission_kind'>, { etiquette: string; texte: string }> = {
  verify: { etiquette: 'À vérifier', texte: 'Le nom écrit, le repère, la photo de l’enseigne.' },
  locate: { etiquette: 'À situer', texte: 'Il manque sa position : y retourner.' },
  complete: { etiquette: 'À compléter', texte: 'Ce qui manque à sa fiche, et une photo.' },
};

const jourLong = (j: string): string =>
  new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

/**
 * Les fiches renvoyées d'abord (« À corriger », sauf celles dont la correction est déjà sur le téléphone), puis les
 * missions de NTanova, la plus pressée d'abord. `aujourdHui` : le jour à Pointe-Noire (`AAAA-MM-JJ`).
 */
export function missionsDeLAccueil(
  releves: readonly ReleveRecu[],
  aCompleter: readonly EcoleACompleter[],
  dejaCorrigees: ReadonlySet<string>,
  aujourdHui: string,
): MissionDeLAccueil[] {
  const corriger: MissionDeLAccueil[] = releves
    .filter((r) => r.statut === 'a_corriger' && !dejaCorrigees.has(r.id))
    .map((r) => ({
      genre: 'a_corriger',
      id: r.id,
      nom: r.nomEnseigne,
      etiquette: 'À corriger',
      texte: r.messageAuRelais
        ? `NTanova : « ${r.messageAuRelais} »`
        : r.motif
          ? `NTanova : « ${libelleMotif[r.motif]} »`
          : 'NTanova demande une correction.',
      enRetard: false,
      missionId: null,
    }));
  const missions: MissionDeLAccueil[] = [...aCompleter]
    .sort((a, b) => (a.avantLe ?? '9999').localeCompare(b.avantLe ?? '9999'))
    .map((e) => {
      const parGenre = consigneParGenre[e.genre];
      const enRetard = !!e.avantLe && aujourdHui > e.avantLe;
      return {
        genre: 'mission',
        id: e.id,
        nom: e.etiquette ? `${e.nom} — ${e.etiquette}` : e.nom,
        etiquette: e.avantLe
          ? `${enRetard ? 'En retard' : 'Mission'} · avant le ${jourLong(e.avantLe)}`
          : e.tache
            ? 'Mission'
            : parGenre.etiquette,
        texte: e.tache ?? parGenre.texte,
        enRetard,
        missionId: e.missionId ?? null,
      };
    });
  return [...corriger, ...missions];
}

export interface SemaineDuRelais {
  envoyees: number;
  acceptees: number;
  enAttente: number;
}

/** Les fiches reçues par NTanova depuis 7 jours : combien, combien acceptées, combien en attente de décision. */
export function semaineDuRelais(
  releves: readonly Pick<ReleveRecu, 'prisLe' | 'statut' | 'type'>[],
  maintenant: number,
): SemaineDuRelais {
  const semaine = releves.filter(
    (r) => maintenant - Date.parse(r.prisLe) < 7 * 86_400_000 && maintenant >= Date.parse(r.prisLe),
  );
  return {
    envoyees: semaine.length,
    acceptees: semaine.filter((r) => r.statut === 'accepte').length,
    enAttente: semaine.filter((r) => r.statut === 'a_valider').length,
  };
}
