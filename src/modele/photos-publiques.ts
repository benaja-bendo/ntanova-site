import type { Valeur } from './listes';
import type { PhotoVue } from './ports';

/** Une photo contrôlée retenue pour une fiche publique (choix explicite ou repli). */
export interface PhotoPublique {
  id: string;
  prisLe: string | null;
}
export const BUDGET_PHOTO_PUBLIQUE = 32 * 1024;
export const cheminPhotoPublique = (p: PhotoPublique): string => `/photos/${p.id}.webp`;

// L'administration : pilotage de la photo publique d'une école ----------------------------------------------------------

/**
 * Les seuls rôles qu'une photo peut avoir pour paraître sur une fiche (la vue `public_campus_photos` et
 * `set_campus_public_photo` les connaissent). Un panneau des formations ou un prospectus se contrôle pour être lu, mais
 * reste privé : il peut porter le nom d'un directeur.
 */
export const ROLES_PUBLIABLES: readonly Valeur<'photo_role'>[] = ['signboard', 'building'];
export const peutParaitreSurLeSite = (role: Valeur<'photo_role'>): boolean =>
  ROLES_PUBLIABLES.includes(role);

/**
 * Comment la photo d'une école est décidée :
 * - `automatique` : aucune ligne de choix, la première enseigne ou vue du bâtiment contrôlée est retenue ;
 * - `choix` : une photo choisie par l'administration, prioritaire ;
 * - `retire` : un retrait explicite, qui bloque tout repli même si d'autres photos sont contrôlées.
 */
export type ModePhotoPublique = 'automatique' | 'choix' | 'retire';

/** Ce que `campus_public_photo_state` répond (administration seule). */
export interface EtatPhotoPublique {
  mode: ModePhotoPublique;
  /** La photo choisie (mode `choix` seulement). */
  choisieId: string | null;
  /** La fiche est publiée et hors corbeille : sinon aucune photo n'est publique, quel que soit le mode. */
  publiee: boolean;
  /** La photo que la vue publique expose en ce moment (nulle quand rien n'est exposé). */
  retenueId: string | null;
}

/** Lit la réponse de la base avec tolérance : un mode inconnu vaut « automatique », jamais une erreur. */
export function lireEtatPhotoPublique(brut: unknown): EtatPhotoPublique {
  const d = (brut ?? {}) as Record<string, unknown>;
  const texte = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
  const mode: ModePhotoPublique =
    d['mode'] === 'choix' || d['mode'] === 'retire' ? d['mode'] : 'automatique';
  return {
    mode,
    choisieId: texte(d['choice']),
    publiee: d['published'] === true,
    retenueId: texte(d['retained']),
  };
}

/** Où en est une photo, pour le dire à l'administration sans présenter toutes les candidates comme publiques. */
export type SituationPhoto =
  'retenue' | 'prioritaire' | 'prioritaire_invalide' | 'candidate' | 'ecartee' | 'non_controlee';

/** Ce que la description lit d'une photo de l'école. */
type PhotoLue = Pick<PhotoVue, 'id' | 'role' | 'publiable' | 'publique'>;

export interface PhotoDecrite {
  id: string;
  situation: SituationPhoto;
  /** C'est le choix prioritaire (valide ou non). */
  prioritaire: boolean;
  phrase: string;
}

export interface DescriptionPhotosPubliques {
  /** Une phrase pour toute l'école. */
  resume: string;
  /** Le retrait a un sens : un choix existe, ou une photo contrôlée pourrait être retenue automatiquement. */
  retirable: boolean;
  /** Au moins une photo contrôlée pourrait être retenue automatiquement (mode `automatique`). */
  aDesCandidates: boolean;
  photos: PhotoDecrite[];
}

const APRES_MISE_A_JOUR = 'après la prochaine mise à jour du site';

/**
 * Dit l'état des photos d'une école à partir de ce que la base répond : jamais d'après une règle recopiée. La photo
 * « retenue » est celle que la vue publique expose (fiche publiée seulement) ; une photo contrôlée qui n'est pas retenue
 * n'est qu'une candidate. Un choix devenu invalide (contrôle retiré, photo qui n'est plus d'un relevé accepté) ne laisse
 * apparaître aucune autre photo : c'est dit.
 */
export function decrirePhotosPubliques(
  photos: readonly PhotoLue[],
  etat: EtatPhotoPublique,
): DescriptionPhotosPubliques {
  const candidates = photos.filter((p) => p.publiable && peutParaitreSurLeSite(p.role));
  const choisie = etat.mode === 'choix' ? photos.find((p) => p.id === etat.choisieId) : undefined;
  const choixValide = choisie !== undefined && choisie.publique === true && choisie.publiable;
  const retenue = etat.retenueId;

  const decrites = photos.map((p): PhotoDecrite => {
    const prioritaire = etat.mode === 'choix' && p.id === etat.choisieId;
    if (retenue === p.id) {
      return {
        id: p.id,
        situation: 'retenue',
        prioritaire,
        phrase: prioritaire
          ? `Choix prioritaire, retenu : elle paraît sur la fiche publiée ${APRES_MISE_A_JOUR}.`
          : `Retenue automatiquement (la première enseigne ou vue du bâtiment contrôlée) : elle paraît sur la fiche publiée ${APRES_MISE_A_JOUR}.`,
      };
    }
    if (prioritaire) {
      return choixValide
        ? {
            id: p.id,
            situation: 'prioritaire',
            prioritaire,
            phrase: etat.publiee
              ? `Choix prioritaire : elle paraîtra sur la fiche publiée ${APRES_MISE_A_JOUR}.`
              : 'Choix prioritaire. Elle paraîtra quand la fiche sera publiée, après la mise à jour du site.',
          }
        : {
            id: p.id,
            situation: 'prioritaire_invalide',
            prioritaire,
            phrase:
              'Choix prioritaire devenu invalide : aucune autre photo ne la remplace. Retire-le ou choisis une photo.',
          };
    }
    if (!(p.publiable && peutParaitreSurLeSite(p.role))) {
      return {
        id: p.id,
        situation: 'non_controlee',
        prioritaire,
        phrase: 'Non contrôlée : elle reste privée.',
      };
    }
    if (etat.mode === 'retire') {
      return {
        id: p.id,
        situation: 'ecartee',
        prioritaire,
        phrase: 'Contrôlée, mais le retrait empêche toute photo automatique.',
      };
    }
    return {
      id: p.id,
      situation: 'candidate',
      prioritaire,
      phrase:
        etat.mode === 'choix'
          ? 'Contrôlée, mais le choix prioritaire passe avant.'
          : retenue
            ? 'Contrôlée, candidate automatique : une autre photo est retenue.'
            : 'Contrôlée, candidate automatique.',
    };
  });

  let resume: string;
  if (etat.mode === 'retire') {
    resume =
      'Retrait demandé : aucune photo ne paraît sur cette fiche, même contrôlée. Choisis une photo pour qu’elle reparaisse.';
  } else if (etat.mode === 'choix') {
    resume = !choixValide
      ? 'Le choix prioritaire n’est plus valable : aucune autre photo ne le remplace. Retire-le ou choisis une autre photo.'
      : etat.publiee
        ? `Choix prioritaire : cette photo paraît sur la fiche publiée ${APRES_MISE_A_JOUR}.`
        : 'Choix prioritaire enregistré. Aucune photo n’est publique tant que la fiche n’est pas publiée.';
  } else if (etat.publiee) {
    resume = retenue
      ? 'Aucun choix : la première enseigne ou vue du bâtiment contrôlée est retenue automatiquement.'
      : 'Aucune enseigne ni vue du bâtiment contrôlée : la fiche paraît sans photo.';
  } else {
    resume = candidates.length
      ? 'La fiche n’est pas publiée : aucune photo n’est publique. À sa publication, la première enseigne ou vue du bâtiment contrôlée sera retenue.'
      : 'Aucune enseigne ni vue du bâtiment contrôlée : la fiche paraîtra sans photo.';
  }

  return {
    resume,
    retirable: etat.mode === 'choix' || (etat.mode === 'automatique' && candidates.length > 0),
    aDesCandidates: etat.mode === 'automatique' && candidates.length > 0,
    photos: decrites,
  };
}
