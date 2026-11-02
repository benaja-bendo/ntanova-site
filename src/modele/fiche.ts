/**
 * La fiche d'une école telle que le relais la remplit, étape par étape, dans son
 * téléphone. Elle part ensuite en trois envois : le relevé, la photo, le contact.
 */
import { z } from 'zod';
import { listes, niveauxConnus, typeConnu, type Valeur } from './listes';
import type { Point } from './geo';
import type { ContactAEnvoyer, EcoleACompleter, PhotoAEnvoyer, ReleveAEnvoyer } from './ports';
import { normaliserTelephone } from './telephone';

export interface ContactSaisi {
  fonction: Valeur<'fonction_direction'> | null;
  nom: string;
  whatsapp: string;
  accord: boolean;
  accordLe: string | null;
  /** « Ce qu'on vous a dit », en cas de refus. */
  note: string;
}

/** Une photo gardée dans le téléphone (IndexedDB), déjà allégée à moins de 200 Ko. */
export interface PhotoLocale {
  /** Créé sur le téléphone : l'envoi se rejoue sans doublon. */
  id: string;
  role: Valeur<'photo_role'>;
  /** Effacée du téléphone dès que la base l'a reçue. */
  blob: Blob | null;
  mime: 'image/webp' | 'image/jpeg';
  octets: number;
  largeur: number;
  hauteur: number;
  prisLe: string;
  envoyee: boolean;
}

/** L'enseigne est la seule photo obligatoire ; on peut en ajouter trois autres au plus. */
export const PHOTOS_FACULTATIVES_MAX = 3;

/** Les niveaux pour lesquels l'enseigne ou un panneau annonce des séries, des filières ou des formations. */
export const NIVEAUX_AVEC_FORMATIONS: readonly Valeur<'niveau'>[] = [
  'lycee',
  'technique',
  'superieur',
  'autre_formation',
];

export interface FicheLocale {
  id: string;
  creeeLe: string;
  type: 'releve' | 'correction' | 'contre_visite';
  corrigeReleveId: string | null;
  lotId: string | null;

  // 1/3 : photos et position
  /**
   * L'enseigne (obligatoire) et jusqu'à trois autres photos : panneau des formations, prospectus,
   * vue du bâtiment. Absente des fiches d'avant : la base du téléphone la remplit à la mise à jour.
   */
  photos: PhotoLocale[];
  position: Point | null;
  precisionM: number | null;
  prisLe: string | null;
  horsLot: boolean | null;
  /** L'école publiée (ou la fiche du téléphone, sans identifiant d'école) relevée à moins de 40 m. */
  doublonPropose: { ecoleId: string | null; nom: string } | null;
  reponseDoublon: Valeur<'reponse_doublon'> | null;

  // 2/3 : ce qui se voit de la rue (public)
  nomEnseigne: string;
  niveaux: Valeur<'niveau'>[];
  typeEcole: Valeur<'type_ecole'>;
  /**
   * Une ligne libre : le programme, les langues, une mention écrite sur l'enseigne.
   * Absente des fiches faites avant le ticket 12, qui restent valables : toujours lue
   * avec `?? ''`.
   */
  programme?: string;
  /**
   * Les séries, filières ou formations lues sur l'enseigne (« séries C et D, BTS gestion »), pour un lycée,
   * un établissement technique ou professionnel, du supérieur ou une autre formation. Facultatif.
   */
  programmesVus?: string;
  /** Les formations sont sur un panneau, une affiche ou un prospectus pris en photo. */
  programmesEnPhoto?: boolean;
  repere: string;
  numeroEnseigne: string;

  // 3/3 : la direction (privé)
  direction: Valeur<'direction_vue'> | null;
  /** Effacé du téléphone dès que la base l'a reçu. */
  contact: ContactSaisi | null;
  repasser: string;

  // L'envoi
  etat: 'brouillon' | 'a_envoyer' | 'envoyee';
  envoyes: { releve: boolean; photo: boolean; contact: boolean };
  dernierEssai: string | null;
}

export function nouvelleFiche(
  id: string,
  maintenant: string,
  lotId: string | null,
  corrige: { releveId: string; nomEnseigne: string } | null = null,
): FicheLocale {
  return {
    id,
    creeeLe: maintenant,
    type: corrige ? 'correction' : 'releve',
    corrigeReleveId: corrige?.releveId ?? null,
    lotId,
    photos: [],
    position: null,
    precisionM: null,
    prisLe: null,
    horsLot: null,
    doublonPropose: null,
    reponseDoublon: null,
    nomEnseigne: corrige?.nomEnseigne ?? '',
    niveaux: [],
    // Comme la base : tant que le relais n'a rien lu sur l'enseigne, c'est « Pas indiqué ».
    // Jamais « Privée » d'avance : un relais pressé déclarerait privée une école publique.
    typeEcole: 'non_indique',
    programme: '',
    programmesVus: '',
    programmesEnPhoto: false,
    repere: '',
    numeroEnseigne: '',
    direction: null,
    contact: null,
    repasser: '',
    etat: 'brouillon',
    envoyes: { releve: false, photo: false, contact: false },
    dernierEssai: null,
  };
}

/**
 * La contre-visite d'une école connue, confiée au relais : ce qu'on sait déjà est
 * prérempli, le relais le vérifie sur place, et la fiche dit quelle école elle visite.
 * Elle ne reprend que ce que cette version connaît : un type ou un niveau ajouté à la base
 * depuis la dernière mise à jour du téléphone devient « Pas indiqué » ou disparaît, et ne
 * bloque jamais l'étape 2/3.
 */
export function nouvelleContreVisite(
  id: string,
  maintenant: string,
  lotId: string | null,
  ecole: EcoleACompleter,
): FicheLocale {
  return {
    ...nouvelleFiche(id, maintenant, lotId),
    type: 'contre_visite',
    doublonPropose: { ecoleId: ecole.id, nom: ecole.nom },
    reponseDoublon: 'la_meme',
    nomEnseigne: ecole.nom,
    niveaux: niveauxConnus(ecole.niveaux),
    typeEcole: typeConnu(ecole.typeEcole),
    programme: ecole.programme ?? '',
    repere: ecole.repere ?? '',
    numeroEnseigne: ecole.numeroEnseigne ? `+${ecole.numeroEnseigne}` : '',
  };
}

// Les photos ---------------------------------------------------------------------

/** La photo de l'enseigne, la seule obligatoire. */
export function photoEnseigne(fiche: FicheLocale): PhotoLocale | undefined {
  return fiche.photos.find((p) => p.role === 'signboard');
}

/** Les photos en plus de l'enseigne. */
export function photosFacultatives(fiche: FicheLocale): PhotoLocale[] {
  return fiche.photos.filter((p) => p.role !== 'signboard');
}

export function peutAjouterPhoto(fiche: FicheLocale): boolean {
  return photosFacultatives(fiche).length < PHOTOS_FACULTATIVES_MAX;
}

/** Ajoute une photo ; une seconde « enseigne » remplace la première ; au plus trois photos en plus. */
export function avecPhoto(fiche: FicheLocale, photo: PhotoLocale): FicheLocale {
  if (photo.role === 'signboard') {
    return { ...fiche, photos: [photo, ...fiche.photos.filter((p) => p.role !== 'signboard')] };
  }
  if (!peutAjouterPhoto(fiche)) return fiche;
  return { ...fiche, photos: [...fiche.photos, photo] };
}

export function sansPhoto(fiche: FicheLocale, id: string): FicheLocale {
  return { ...fiche, photos: fiche.photos.filter((p) => p.id !== id) };
}

/** Faut-il demander les séries et filières ? Seulement si un niveau coché en annonce. */
export function demandeLesFormations(niveaux: readonly Valeur<'niveau'>[]): boolean {
  return niveaux.some((n) => NIVEAUX_AVEC_FORMATIONS.includes(n));
}

export function contactVide(): ContactSaisi {
  return { fonction: null, nom: '', whatsapp: '', accord: false, accordLe: null, note: '' };
}

// Les contrôles de chaque étape -----------------------------------------------

/** Les messages d'erreur, champ par champ. Vide : l'étape est complète. */
export type Erreurs = Partial<Record<string, string>>;

export function erreursDe(resultat: z.ZodSafeParseResult<unknown>): Erreurs {
  if (resultat.success) return {};
  const erreurs: Erreurs = {};
  for (const probleme of resultat.error.issues) {
    const champ = String(probleme.path[0] ?? 'fiche');
    erreurs[champ] ??= probleme.message;
  }
  return erreurs;
}

const etape1 = z
  .object({
    // Seule l'enseigne est obligatoire ; les autres photos sont facultatives.
    photos: z.custom<PhotoLocale[]>(
      (v) => Array.isArray(v) && v.some((p: PhotoLocale) => p.role === 'signboard'),
      { message: "Ajoutez la photo de l'enseigne." },
    ),
    doublonPropose: z.unknown(),
    reponseDoublon: z.unknown(),
  })
  .refine((f) => f.doublonPropose == null || f.reponseDoublon != null, {
    message: 'Dites si c’est la même école.',
    path: ['reponseDoublon'],
  });

/** La position n'est pas exigée : si le GPS échoue, le relais peut continuer, et NTanova le voit. */
export function erreursEtape1(fiche: FicheLocale): Erreurs {
  const erreurs = erreursDe(etape1.safeParse(fiche));
  // L'erreur de l'enseigne s'affiche sous la photo, qui s'appelait `photo` avant les photos multiples.
  if (erreurs.photos) {
    erreurs.photo = erreurs.photos;
    delete erreurs.photos;
  }
  return erreurs;
}

const telephoneFacultatif = (message: string) =>
  z.string().refine((v) => v.trim() === '' || normaliserTelephone(v) !== null, { message });

const etape2 = z.object({
  nomEnseigne: z
    .string()
    .trim()
    .min(1, "Écrivez le nom qui est sur l'enseigne.")
    .max(200, 'Ce nom est trop long.'),
  // Ces deux listes ne bloquent personne : rien n'y est obligatoire. Une valeur que la
  // version ne connaît pas dit pourquoi, en français, à l'endroit où le relais la voit.
  niveaux: z.array(z.enum(listes.niveau, { message: 'Choisissez les niveaux dans la liste.' })),
  typeEcole: z.enum(listes.type_ecole, { message: 'Choisissez un type d’école dans la liste.' }),
  programme: z.string().max(200, 'Cette ligne est trop longue.').optional(),
  programmesVus: z.string().max(600, 'Cette liste est trop longue.').optional(),
  repere: z.string().max(300, 'Ce repère est trop long.'),
  numeroEnseigne: telephoneFacultatif('Ce numéro ne semble pas complet.'),
});

export function erreursEtape2(fiche: FicheLocale): Erreurs {
  return erreursDe(etape2.safeParse(fiche));
}

const etape3 = z.discriminatedUnion('direction', [
  z.object({
    direction: z.literal('vue'),
    contact: z
      .object({
        fonction: z.enum(listes.fonction_direction, { message: 'Choisissez sa fonction.' }),
        nom: z.string().max(120, 'Ce nom est trop long.'),
        accord: z.boolean(),
        whatsapp: z.string(),
      })
      .refine((c) => c.accord || c.whatsapp.trim() === '', {
        message: 'Sans son accord, ne notez pas son numéro.',
        path: ['whatsapp'],
      })
      .refine((c) => c.whatsapp.trim() === '' || normaliserTelephone(c.whatsapp) !== null, {
        message: 'Ce numéro ne semble pas complet.',
        path: ['whatsapp'],
      }),
  }),
  z.object({ direction: z.literal('absente'), repasser: z.string().max(200) }),
  z.object({
    direction: z.literal('refus'),
    contact: z.object({ note: z.string().max(1000, 'Ce texte est trop long.') }).nullable(),
  }),
]);

export function erreursEtape3(fiche: FicheLocale): Erreurs {
  if (fiche.direction === null) return { direction: 'Dites si vous avez vu la direction.' };
  const resultat = etape3.safeParse(fiche);
  if (resultat.success) return {};
  // Les erreurs du contact portent le nom du champ du contact (fonction, whatsapp…).
  const erreurs: Erreurs = {};
  for (const probleme of resultat.error.issues) {
    const champ = String(probleme.path.at(-1) ?? 'fiche');
    erreurs[champ] ??= probleme.message;
  }
  return erreurs;
}

// Ce qui part vers la base ----------------------------------------------------

const vide = (texte: string) => (texte.trim() === '' ? null : texte.trim());

export function versReleve(fiche: FicheLocale): ReleveAEnvoyer {
  return {
    id: fiche.id,
    lotId: fiche.lotId,
    type: fiche.type,
    corrigeReleveId: fiche.corrigeReleveId,
    position: fiche.position,
    precisionM: fiche.precisionM === null ? null : Math.round(fiche.precisionM),
    prisLe: fiche.prisLe ?? fiche.creeeLe,
    reponseDoublon: fiche.reponseDoublon,
    doublonDe: fiche.reponseDoublon === 'la_meme' ? (fiche.doublonPropose?.ecoleId ?? null) : null,
    nomEnseigne: fiche.nomEnseigne.trim(),
    niveaux: fiche.niveaux,
    typeEcole: fiche.typeEcole,
    programme: vide(fiche.programme ?? ''),
    // Les séries ou filières ne se gardent que si un niveau coché en annonce : une fiche corrigée ne traîne pas
    // une note devenue sans objet.
    programmesVus: demandeLesFormations(fiche.niveaux) ? vide(fiche.programmesVus ?? '') : null,
    programmesEnPhoto: demandeLesFormations(fiche.niveaux) && (fiche.programmesEnPhoto ?? false),
    repere: vide(fiche.repere),
    numeroEnseigne: normaliserTelephone(fiche.numeroEnseigne),
    direction: fiche.direction,
    repasser: fiche.direction === 'absente' ? vide(fiche.repasser) : null,
  };
}

/** Les photos qui attendent encore d'être envoyées, l'enseigne d'abord. */
export function versPhotos(fiche: FicheLocale): PhotoAEnvoyer[] {
  return [...fiche.photos]
    .sort((a, b) => Number(b.role === 'signboard') - Number(a.role === 'signboard'))
    .flatMap((p) =>
      p.envoyee || p.blob === null
        ? []
        : [
            {
              id: p.id,
              role: p.role,
              blob: p.blob,
              mime: p.mime,
              octets: p.octets,
              largeur: p.largeur,
              hauteur: p.hauteur,
              prisLe: p.prisLe,
            },
          ],
    );
}

/** Le contact à envoyer, ou null s'il n'y a rien à envoyer. */
export function versContact(fiche: FicheLocale): ContactAEnvoyer | null {
  const c = fiche.contact;
  if (c === null) return null;
  if (fiche.direction === 'vue') {
    return {
      releveId: fiche.id,
      fonction: c.fonction,
      nom: vide(c.nom),
      whatsapp: c.accord ? normaliserTelephone(c.whatsapp) : null,
      accord: c.accord,
      accordLe: c.accord ? c.accordLe : null,
      note: null,
    };
  }
  if (fiche.direction === 'refus' && vide(c.note) !== null) {
    return {
      releveId: fiche.id,
      fonction: null,
      nom: null,
      whatsapp: null,
      accord: false,
      accordLe: null,
      note: vide(c.note),
    };
  }
  return null;
}

/** La fiche est-elle entièrement partie ? */
export function toutEnvoye(fiche: FicheLocale): boolean {
  return (
    fiche.envoyes.releve &&
    fiche.envoyes.photo &&
    fiche.envoyes.contact &&
    fiche.photos.every((p) => p.envoyee)
  );
}
