/**
 * La base du téléphone (IndexedDB, par Dexie). Chaque étape d'une fiche y est
 * écrite aussitôt : si Chrome ferme l'onglet pendant la photo, la fiche est là au retour.
 */
import Dexie, { liveQuery, type EntityTable } from 'dexie';
import { useEffect, useState } from 'react';
import type { FicheLocale } from '../../modele/fiche';
import type { Valeur } from '../../modele/listes';
import type {
  EcoleACompleter,
  EcoleDuPays,
  EcoleProche,
  ErreurAEnvoyer,
  Lot,
  MaPaie,
  Profil,
  ReleveRecu,
} from '../../modele/ports';

/** Un « Je n'ai pas pu » à envoyer : la mission, le motif, la précision, et quand le relais l'a dit. */
export interface MissionPasPu {
  missionId: string;
  motif: Valeur<'mission_blocker'>;
  note: string | null;
  le: string;
}

/** Ce que le téléphone garde du serveur, pour marcher hors ligne. */
export interface Memoire {
  profil: Profil;
  lot: Lot | null;
  /** Les zones ouvertes aux relais : ce que l'écran dit à un relais qui n'a pas de secteur. */
  zones: string[];
  ecoles: EcoleProche[];
  /** v2 (13/11) : toutes les écoles du pays, en léger, pour « Même nom, ailleurs » et « Un autre site de… ». */
  ecolesDuPays: EcoleDuPays[];
  /**
   * v2 (13/11) : les « Je n'ai pas pu » dits sur le téléphone, qui attendent le réseau. Une clé de la mémoire, pas une
   * table : la base du téléphone ne change pas de version.
   */
  missionsPasPu: MissionPasPu[];
  releves: ReleveRecu[];
  /** Les écoles confiées au relais, à situer et compléter sur place. */
  aCompleter: EcoleACompleter[];
  /** Sa paie, telle que NTanova l'a lue la dernière fois : elle se lit aussi sans réseau. */
  paie: MaPaie;
  dernierEnvoi: string;
  /** Le jour où le relais a fini (ou passé) ses premiers pas (ticket #79) : la carte « Premiers pas » ne revient plus. */
  premiersPas: string;
  /** Une photo de test, le temps de vérifier qu'elle se relit : effacée aussitôt, jamais envoyée. */
  testPhoto: Blob;
}

interface LigneMemoire {
  cle: keyof Memoire;
  valeur: unknown;
}

export const base = new Dexie('ntanova-relais') as Dexie & {
  fiches: EntityTable<FicheLocale, 'id'>;
  memoire: EntityTable<LigneMemoire, 'cle'>;
  erreurs: EntityTable<ErreurAEnvoyer, 'id'>;
};

base.version(1).stores({
  fiches: 'id, etat, creeeLe',
  memoire: 'cle',
  erreurs: 'id',
});
// Version 2 : les fiches se cherchent aussi par type (les contre-visites en cours).
base.version(2).stores({
  fiches: 'id, etat, creeeLe, type',
});
// Version 3 : jusqu'à quatre photos par fiche (l'enseigne et trois autres) et les formations lues sur l'enseigne.
// Une fiche d'avant, encore en attente, garde sa photo : elle devient la photo d'enseigne.
base
  .version(3)
  .stores({ fiches: 'id, etat, creeeLe, type' })
  .upgrade((tx) =>
    tx
      .table('fiches')
      .toCollection()
      .modify((fiche: Record<string, unknown>) => {
        if (!Array.isArray(fiche.photos)) {
          const ancienne = fiche.photo as Blob | null | undefined;
          fiche.photos = ancienne
            ? [
                {
                  id: crypto.randomUUID(),
                  role: 'signboard',
                  blob: ancienne,
                  mime: ancienne.type === 'image/webp' ? 'image/webp' : 'image/jpeg',
                  octets: ancienne.size,
                  largeur: 0,
                  hauteur: 0,
                  prisLe: (fiche.prisLe as string | null) ?? (fiche.creeeLe as string),
                  envoyee: false,
                },
              ]
            : [];
        }
        delete fiche.photo;
        fiche.programmesVus ??= '';
        fiche.programmesEnPhoto ??= false;
      }),
  );

// Version 4 : chaque fiche est liée au compte qui l'a commencée (un téléphone peut servir à deux relais). Les fiches
// d'avant prennent le compte gardé dans le téléphone, s'il y en a un ; sinon elles sont à celui qui se connecte. Le
// brouillon se retrouve d'après la fiche (« brouillon » et son compte) : l'ancien repère n'a plus d'objet.
base
  .version(4)
  .stores({ fiches: 'id, etat, creeeLe, type' })
  .upgrade(async (tx) => {
    const profil = (await tx.table('memoire').get('profil')) as
      { valeur?: { id?: string } } | undefined;
    const compte = profil?.valeur?.id ?? null;
    await tx
      .table('fiches')
      .toCollection()
      .modify((fiche: Record<string, unknown>) => {
        fiche.compteId ??= compte;
      });
    await tx.table('memoire').delete('brouillon');
  });

export async function lireMemoire<K extends keyof Memoire>(
  cle: K,
): Promise<Memoire[K] | undefined> {
  const ligne = await base.memoire.get(cle);
  return ligne?.valeur as Memoire[K] | undefined;
}

export async function garder<K extends keyof Memoire>(cle: K, valeur: Memoire[K]): Promise<void> {
  await base.memoire.put({ cle, valeur });
}

export async function oublier(cle: keyof Memoire): Promise<void> {
  await base.memoire.delete(cle);
}

/**
 * Le compte connecté, tel que le téléphone l'a gardé (il sert aussi hors ligne), ou null avant la première lecture.
 */
export async function compteConnecte(): Promise<string | null> {
  return (await lireMemoire('profil'))?.id ?? null;
}

/**
 * Au changement de compte : ce que le téléphone gardait du serveur pour l'ancien (son lot, ses fiches reçues, sa paie)
 * ne sert pas au nouveau. Les fiches NON envoyées de l'ancien restent : elles sont à lui, et ne partent jamais sous le
 * nom du nouveau (voir `appartientAuCompte`).
 */
export async function oublierLeCompteDAvant(): Promise<void> {
  await base.memoire.clear();
}

/** Une requête sur la base du téléphone, relancée à chaque changement. */
export function useRequete<T>(
  requete: () => Promise<T>,
  dependances: unknown[] = [],
): T | undefined {
  const [valeur, setValeur] = useState<T>();
  useEffect(() => {
    const abonnement = liveQuery(requete).subscribe({ next: setValeur });
    return () => abonnement.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependances);
  return valeur;
}
