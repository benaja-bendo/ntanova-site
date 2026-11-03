/**
 * La vue d'ensemble de l'administration (ticket #76) : où en est le relevé, en nombres.
 *
 * La base rend du JSON (`admin_overview`) ; ici on le lit sans jamais casser : un champ absent vaut zéro, un nombre venu
 * en texte (le `numeric` de PostgreSQL) se lit. **Aucun seuil ni objectif** : les hypothèses de mesure ne vivent ni dans
 * le code ni dans la base, le fondateur compare les nombres à ce qu'il sait.
 */
import type { VueEnsemble } from './ports';

type Objet = Record<string, unknown>;

const objet = (v: unknown): Objet =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Objet) : {};

const nombre = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

const nombreOuNul = (v: unknown): number | null =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ? null : nombre(v);

const texteOuNul = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function lireVueEnsemble(brut: unknown): VueEnsemble {
  const r = objet(brut);
  const file = objet(r['to_review']);
  const decisions = objet(r['decisions']);
  const enseigne = objet(r['signboard']);
  const contacts = objet(r['contacts']);
  const relais = objet(r['relays']);
  const jours = Array.isArray(r['received_per_day']) ? (r['received_per_day'] as unknown[]) : [];
  return {
    generee: texteOuNul(r['generated_at']) ?? '',
    aValider: {
      nombre: nombre(file['count']),
      plusAncienneLe: texteOuNul(file['oldest_received_at']),
      depuisPlusDe24h: nombre(file['over_24h']),
    },
    recusParJour: jours.map((j) => {
      const o = objet(j);
      return {
        jour: texteOuNul(o['day']) ?? '',
        total: nombre(o['total']),
        essai: nombre(o['trial']),
      };
    }),
    decisions: {
      nombre: nombre(decisions['count']),
      delaiMoyenHeures: nombreOuNul(decisions['average_hours']),
    },
    enseigne: { avecPhoto: nombre(enseigne['with_photo']), total: nombre(enseigne['total']) },
    contacts: {
      confirmesTotal: nombre(contacts['confirmed_total']),
      confirmes7j: nombre(contacts['confirmed_7d']),
    },
    relais: {
      actifs: nombre(relais['active']),
      enAttente: nombre(relais['pending']),
      suspendus: nombre(relais['suspended']),
      ontEnvoye7j: nombre(relais['sent_this_week']),
    },
  };
}

/**
 * Les zones ouvertes aux relais, sans compter deux fois ce qu'une zone ouverte contient : une zone ouverte sous une autre
 * zone ouverte (Bacongo sous Brazzaville) est déjà dans les cumuls de sa parente.
 */
export function zonesOuvertesRacines<T extends { chemin: string; ouverte: boolean }>(
  zones: readonly T[],
): T[] {
  const ouvertes = zones.filter((z) => z.ouverte);
  return ouvertes.filter(
    (z) => !ouvertes.some((autre) => autre !== z && z.chemin.startsWith(`${autre.chemin}.`)),
  );
}
