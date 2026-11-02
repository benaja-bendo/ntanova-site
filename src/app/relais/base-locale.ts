/**
 * La base du téléphone (IndexedDB, par Dexie). Chaque étape d'une fiche y est
 * écrite aussitôt : si Chrome ferme l'onglet pendant la photo, la fiche est là au retour.
 */
import Dexie, { liveQuery, type EntityTable } from 'dexie';
import { useEffect, useState } from 'react';
import type { FicheLocale } from '../../modele/fiche';
import type {
  EcoleACompleter,
  EcoleProche,
  ErreurAEnvoyer,
  Lot,
  Profil,
  ReleveRecu,
} from '../../modele/ports';

/** Ce que le téléphone garde du serveur, pour marcher hors ligne. */
export interface Memoire {
  profil: Profil;
  lot: Lot | null;
  ecoles: EcoleProche[];
  releves: ReleveRecu[];
  /** Les écoles confiées au relais, à situer et compléter sur place. */
  aCompleter: EcoleACompleter[];
  dernierEnvoi: string;
  brouillon: string;
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

/** Tout effacer : au changement de compte. */
export async function toutEffacer(): Promise<void> {
  await Promise.all([base.fiches.clear(), base.memoire.clear(), base.erreurs.clear()]);
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
