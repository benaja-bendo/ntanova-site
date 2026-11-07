/**
 * Accepter une fiche (tickets #89 et #95). Trois règles, que l'écran et les tests partagent :
 *
 * 1. **Le bouton « Accepter » ne se grise jamais sans dire pourquoi** (`ceQuiManquePourAccepter`).
 * 2. **Une correction d'une fiche pas encore acceptée hérite de la fiche d'origine** (`heriterDeLOrigine`). Un relais qui
 *    reprend sa photo après un « à corriger » envoie une correction sans position (« corriger pour la photo » ne la
 *    redemande pas) ; la fiche qu'elle corrige n'a pas d'école. La base crée l'école à partir de la correction, avec la
 *    position, la division et le secteur de la fiche d'origine ; l'écran traite donc cette correction comme une nouvelle
 *    fiche. Une correction d'une école déjà créée, elle, met l'école à jour : aucune division à choisir.
 * 3. **L'écran dit ce que fait « Accepter », ce qui manque sans bloquer, et ce qui bloque** (`avantDAccepter`) : le
 *    fondateur ne savait pas « pourquoi il ne pouvait pas publier » la correction d'ESTAM, alors que rien ne bloquait.
 */
import type { Point } from './geo';
import { cycleAvecFormations } from './formations';
import { libelleNiveau } from './libelles';
import type { Valeur } from './listes';
import type { DetailReleve } from './ports';
import { afficherTelephone, numeroCongolaisSuspect } from './telephone';
import { peutParaitreSurLeSite } from './photos-publiques';

/** Comment l'envoi entre dans le catalogue : la décision en un geste. */
export type Cible =
  | { mode: 'nouvelle' }
  | { mode: 'new_campus'; institutionId: string }
  | { mode: 'update_campus'; campusId: string }
  | { mode: 'add_cycle'; campusId: string };

/** Ce que l'on sait de la fiche qu'une correction corrige. */
export interface OrigineDeLaCorrection {
  /** L'école créée à partir de cette fiche ; nulle tant qu'elle n'est pas acceptée. */
  campusId: string | null;
  position: Point | null;
  divisionId: string | null;
  lot: string | null;
}

export interface ChampsHerites {
  /** Vrai : la fiche d'origine n'a pas d'école ; la correction est traitée comme une nouvelle fiche. */
  corrigeUneFicheEnAttente: boolean;
  position: Point | null;
  divisionId: string | null;
  lot: string | null;
  /** Vrai : la position affichée est celle de la fiche d'origine, pas de la correction. */
  positionDeLaFicheDOrigine: boolean;
  /**
   * Vrai : `lot` est celui de la fiche d'origine, pas de la correction (qui n'en a pas). Il sert à déduire la division ;
   * l'écran ne le montre pas comme celui de la correction (ticket #95 : « Lot Essai » sur une fiche qui n'était dans
   * aucun lot).
   */
  lotDeLaFicheDOrigine: boolean;
}

/** Ce qu'une correction reprend de la fiche d'origine, quand cette fiche n'a pas encore d'école. */
export function heriterDeLOrigine(
  correction: Pick<DetailReleve, 'type' | 'position' | 'divisionId' | 'lot'>,
  origine: OrigineDeLaCorrection | null,
): ChampsHerites {
  const rien: ChampsHerites = {
    corrigeUneFicheEnAttente: false,
    position: correction.position,
    divisionId: correction.divisionId,
    lot: correction.lot,
    positionDeLaFicheDOrigine: false,
    lotDeLaFicheDOrigine: false,
  };
  if (correction.type !== 'correction' || origine === null || origine.campusId !== null)
    return rien;
  return {
    corrigeUneFicheEnAttente: true,
    position: correction.position ?? origine.position,
    divisionId: correction.divisionId ?? origine.divisionId,
    lot: correction.lot ?? origine.lot,
    positionDeLaFicheDOrigine: correction.position === null && origine.position !== null,
    lotDeLaFicheDOrigine: correction.lot === null && origine.lot !== null,
  };
}

type FichePourAccepter = Pick<
  DetailReleve,
  'essai' | 'type' | 'corrigeUneFicheEnAttente' | 'divisionId' | 'position' | 'lot'
>;

/**
 * L'administration doit-elle choisir la division de l'école ? Seulement quand une école va être créée : la division est
 * celle de la position quand un contour la contient ; sinon (aucun contour connu, ou ni position ni secteur), c'est
 * l'administration qui la choisit : la fiche ne retombe plus sur le secteur du relais (ticket n° 67).
 * **Une correction d'une école déjà créée n'en demande jamais** : l'école a déjà sa division.
 */
export function divisionRequise(fiche: FichePourAccepter, cible: Cible): boolean {
  if (fiche.essai) return false;
  if (fiche.type === 'correction' && !fiche.corrigeUneFicheEnAttente) return false;
  if (cible.mode !== 'nouvelle' && cible.mode !== 'new_campus') return false;
  return fiche.divisionId === null && (fiche.position !== null || fiche.lot === null);
}

/** Ce qui manque pour accepter, dit en une phrase ; `null` quand le bouton peut être actif. */
export function ceQuiManquePourAccepter(
  fiche: FichePourAccepter,
  cible: Cible,
  divisionChoisie: string,
): string | null {
  if (divisionRequise(fiche, cible) && divisionChoisie === '') {
    return 'Choisis la division de l’école pour pouvoir accepter.';
  }
  if (cible.mode === 'new_campus' && cible.institutionId === '') {
    return 'Choisis l’institution à laquelle rattacher cette implantation.';
  }
  if ((cible.mode === 'update_campus' || cible.mode === 'add_cycle') && cible.campusId === '') {
    return 'Choisis l’implantation à mettre à jour.';
  }
  return null;
}

// Le numéro écrit sur l'enseigne ---------------------------------------------------------------------------------------------

/**
 * Ce que l'administration dit du numéro que le relais a saisi. Ce numéro est publié tel quel, avec un bouton « Appeler »,
 * dès que l'école l'est : trois numéros non vérifiés ont paru ainsi le 06/11/2026 (deux photos sans aucun numéro, une qui
 * en montrait d'autres). Accepter demande donc de dire, d'après la photo, s'il y est.
 */
export type ChoixNumero = 'verifie' | 'retire';

/**
 * Le numéro à confirmer avant d'accepter : celui du relais, tant que l'administration ne l'a pas corrigé elle-même (le
 * corriger, c'est l'avoir lu sur la photo). Rien à confirmer sans numéro, ni sur le lot d'entraînement (jamais publié).
 */
export function numeroAConfirmer(
  fiche: Pick<DetailReleve, 'essai' | 'numeroEnseigne'>,
  corrigeParLAdministration: boolean,
): string | null {
  if (fiche.essai || corrigeParLAdministration) return null;
  const numero = fiche.numeroEnseigne?.trim();
  return numero ? numero : null;
}

/** Ce qui manque du côté du numéro pour pouvoir accepter, en une phrase ; `null` quand il n'y a rien à dire. */
export function ceQuiManqueDuNumero(
  aConfirmer: string | null,
  choix: ChoixNumero | null,
): string | null {
  return aConfirmer !== null && choix === null
    ? 'Dis si le numéro de l’enseigne est sur la photo : il sera public, avec un bouton « Appeler ».'
    : null;
}

/**
 * Peut-on ne pas publier le numéro ? Oui dans tous les cas où l'on sait quelle école l'accueille. Une correction d'une
 * école déjà créée ne le dit pas avant l'acceptation : on ne retire rien alors, de peur d'effacer un numéro déjà vérifié
 * (« Écoles › Gérer la fiche » le retire après).
 */
export function numeroPeutEtreRetire(
  fiche: Pick<DetailReleve, 'type' | 'corrigeUneFicheEnAttente'>,
): boolean {
  return !(fiche.type === 'correction' && !fiche.corrigeUneFicheEnAttente);
}

// Avant d'accepter (ticket #95) --------------------------------------------------------------------------------------------

/** `ok` : prêt ; `info` : à savoir ; `a_faire` : manque, sans bloquer ; `bloque` : le bouton reste grisé. */
export type EtatDeLaLigne = 'ok' | 'info' | 'a_faire' | 'bloque';

export interface LigneAvantAccepter {
  cle: 'photos' | 'position' | 'zone' | 'contact' | 'formations' | 'numero' | 'lot';
  etat: EtatDeLaLigne;
  titre: string;
  texte: string;
}

/** Ce que l'écran sait au moment d'accepter. */
export interface EntreeAvantAccepter {
  fiche: Pick<
    DetailReleve,
    | 'essai'
    | 'type'
    | 'corrigeUneFicheEnAttente'
    | 'divisionId'
    | 'position'
    | 'lot'
    | 'positionDeLaFicheDOrigine'
    | 'precisionM'
    | 'lotDeLaFicheDOrigine'
    | 'niveaux'
    | 'numeroEnseigne'
    | 'direction'
  >;
  /** Les photos reçues : leur rôle, et si l'administration les a contrôlées (sans enfant, sans nom ni numéro de personne). */
  photos: readonly { role: Valeur<'photo_role'>; publiable: boolean }[];
  /** Un contact est lu pour cette fiche (la sienne, ou celle qu'elle corrige). */
  contact: boolean;
  contactDeLaFicheDOrigine: boolean;
  nombreDeFormations: number;
  /** Les niveaux de la fiche annoncent des séries, des filières ou des formations. */
  formationsAttendues: boolean;
  cible: Cible;
  divisionChoisie: string;
  /** Le nom de la division que dit la position, ou que l'administration a choisie. */
  divisionNom: string | null;
  /** Ce que l'administration a dit du numéro de l'enseigne (`null` : pas encore). */
  choixNumero?: ChoixNumero | null;
  /** L'administration a corrigé elle-même le numéro : elle l'a lu sur la photo. */
  numeroCorrige?: boolean;
}

export interface AvantDAccepter {
  /** Un choix manque encore : le bouton est grisé (`ceQuiManquePourAccepter` le dit sous les boutons). */
  bloque: boolean;
  lignes: LigneAvantAccepter[];
  /** Ce que fait « Accepter », et où l'école se publie. */
  phrase: string;
}

/**
 * Ce qui est prêt, ce qui manque sans bloquer, et ce que fait « Accepter » : le fondateur lit ce qui se passe avant de
 * cliquer. Un contact qui manque, des formations pas saisies, une photo pas encore contrôlée n'empêchent jamais d'accepter ;
 * ils sont dits comme tels. Seule la division à choisir (ou l'institution, l'implantation) bloque.
 */
export function avantDAccepter(entree: EntreeAvantAccepter): AvantDAccepter {
  const { fiche, photos, cible } = entree;
  const lignes: LigneAvantAccepter[] = [];
  const miseAJour = fiche.type === 'correction' && !fiche.corrigeUneFicheEnAttente;

  // Les photos : seules une enseigne et une vue du bâtiment, contrôlées, peuvent paraître (la première retenue par le
  // repli automatique, ou un choix prioritaire). Le panneau des formations et le prospectus restent privés.
  const nombre = photos.length;
  const publiables = photos.filter((p) => peutParaitreSurLeSite(p.role));
  const controlees = publiables.filter((p) => p.publiable).length;
  const APRES = 'après la prochaine mise à jour du site';
  const photosTexte =
    nombre === 0
      ? { etat: 'a_faire' as const, texte: 'Aucune photo reçue : l’école n’aura pas d’image.' }
      : publiables.length === 0
        ? {
            etat: 'a_faire' as const,
            texte:
              'Ni enseigne ni vue du bâtiment reçue : l’école n’aura pas d’image (les autres photos restent privées).',
          }
        : controlees === publiables.length
          ? {
              etat: 'ok' as const,
              texte:
                publiables.length === 1
                  ? `1 reçue, contrôlée pour publication : elle pourra paraître ${APRES}.`
                  : `${publiables.length} reçues, toutes contrôlées pour publication : la première pourra paraître ${APRES}.`,
            }
          : controlees === 0
            ? {
                etat: 'a_faire' as const,
                texte:
                  publiables.length === 1
                    ? '1 reçue, pas encore contrôlée : sans « Contrôler pour publication », elle ne paraîtra pas.'
                    : `${publiables.length} reçues, aucune contrôlée : sans « Contrôler pour publication », elles ne paraîtront pas.`,
              }
            : {
                etat: 'a_faire' as const,
                texte: `${publiables.length} reçues, ${controlees} contrôlée${controlees > 1 ? 's' : ''} pour publication : les autres ne paraîtront pas tant qu’elles ne sont pas contrôlées.`,
              };
  lignes.push({ cle: 'photos', titre: 'Photos', ...photosTexte });

  // La position et la zone : seulement quand une école va être créée. Une correction d'une école déjà créée la met à jour.
  if (!miseAJour) {
    lignes.push(
      fiche.position === null
        ? {
            cle: 'position',
            etat: 'a_faire',
            titre: 'Position',
            texte: 'Sans position : l’école ne sera pas sur la carte.',
          }
        : {
            cle: 'position',
            etat: 'ok',
            titre: 'Position',
            texte: fiche.positionDeLaFicheDOrigine
              ? 'Reprise de la fiche d’origine.'
              : fiche.precisionM !== null
                ? `Prise, précision ${Math.round(fiche.precisionM)} m.`
                : 'Prise.',
          },
    );
    if (divisionRequise(fiche, cible)) {
      lignes.push(
        entree.divisionChoisie === ''
          ? {
              cle: 'zone',
              etat: 'bloque',
              titre: 'Zone',
              texte:
                fiche.position !== null
                  ? 'À choisir ci-dessus : aucun contour connu ne contient cette position.'
                  : 'À choisir ci-dessus : la fiche n’a ni position ni secteur.',
            }
          : {
              cle: 'zone',
              etat: 'ok',
              titre: 'Zone',
              texte: `${entree.divisionNom ?? 'Division'}, choisie par toi.`,
            },
      );
    } else if (entree.divisionNom !== null) {
      lignes.push({ cle: 'zone', etat: 'ok', titre: 'Zone', texte: `${entree.divisionNom}.` });
    }
  }

  // Le contact : jamais nécessaire pour accepter ni pour publier.
  lignes.push(
    entree.contact
      ? {
          cle: 'contact',
          etat: 'ok',
          titre: 'Contact',
          texte: entree.contactDeLaFicheDOrigine ? 'Reçu, avec la fiche d’origine.' : 'Reçu.',
        }
      : {
          cle: 'contact',
          etat: 'a_faire',
          titre: 'Contact',
          texte:
            fiche.direction === 'vue'
              ? 'Pas reçu. Il n’empêche ni d’accepter ni de publier.'
              : fiche.direction === 'refus'
                ? 'La direction a refusé : pas de contact. Facultatif pour accepter.'
                : fiche.direction === 'absente'
                  ? 'Direction absente : à repasser. Facultatif pour accepter.'
                  : 'Le relais n’a rien dit de la direction. Facultatif pour accepter.',
        },
  );

  // Les formations : elles rendent l'école cherchable, mais ne se saisissent pas forcément ici.
  if (entree.formationsAttendues) {
    const niveaux = fiche.niveaux.filter(cycleAvecFormations).map((n) => libelleNiveau[n]);
    lignes.push(
      entree.nombreDeFormations > 0
        ? {
            cle: 'formations',
            etat: 'ok',
            titre: 'Formations',
            texte: `${entree.nombreDeFormations} saisie${entree.nombreDeFormations > 1 ? 's' : ''} ci-dessus.`,
          }
        : {
            cle: 'formations',
            etat: 'a_faire',
            titre: 'Formations',
            texte: `Pas encore saisies${niveaux.length > 0 ? ` (${niveaux.join(', ')})` : ''} : lis-les sur les photos, ici ou dans « Écoles » après l’acceptation. Facultatif pour accepter.`,
          },
    );
  }

  // Le numéro de l'enseigne est public : il se lit sur la photo, et un numéro congolais a 9 chiffres après +242.
  const aConfirmer = numeroAConfirmer(fiche, entree.numeroCorrige === true);
  const choix = entree.choixNumero ?? null;
  const suspect = fiche.numeroEnseigne ? numeroCongolaisSuspect(fiche.numeroEnseigne) : null;
  const avertissement = suspect
    ? ` ${suspect.chiffres} chiffres après +242 : un numéro congolais en a 9. Relis-le sur la photo.`
    : '';
  if (aConfirmer !== null) {
    lignes.push(
      choix === null
        ? {
            cle: 'numero',
            etat: 'bloque',
            titre: 'Numéro de l’enseigne',
            texte: `Saisi par le relais : ${afficherTelephone(aConfirmer)}. Lis-le sur la photo de l’enseigne et dis s’il y est : il sera public, avec un bouton « Appeler ».${avertissement}`,
          }
        : choix === 'verifie'
          ? {
              cle: 'numero',
              etat: suspect ? 'a_faire' : 'ok',
              titre: 'Numéro de l’enseigne',
              texte: `Vérifié sur la photo : il sera publié avec un bouton « Appeler » quand l’école le sera.${avertissement}`,
            }
          : {
              cle: 'numero',
              etat: 'ok',
              titre: 'Numéro de l’enseigne',
              texte: 'Pas sur la photo : il ne sera pas publié.',
            },
    );
  } else if (suspect) {
    lignes.push({
      cle: 'numero',
      etat: 'a_faire',
      titre: 'Numéro de l’enseigne',
      texte: `${suspect.chiffres} chiffres après +242 : un numéro congolais en a 9. Relis-le sur la photo, il sera public ; tu pourras le corriger dans « Écoles » après l’acceptation.`,
    });
  }

  // Le lot repris de la fiche d'origine n'est pas celui de la correction : c'est dit, sans le confondre avec lui.
  if (fiche.lotDeLaFicheDOrigine && fiche.lot) {
    lignes.push({
      cle: 'lot',
      etat: 'info',
      titre: 'Lot',
      texte: `La fiche d’origine a été reçue dans le lot « ${fiche.lot} ». Cette correction n’est dans aucun lot.`,
    });
  }

  const phrase =
    miseAJour || cible.mode === 'update_campus' || cible.mode === 'add_cycle'
      ? 'Accepter met à jour l’école. Si elle est déjà en ligne, le changement paraît à la prochaine mise en ligne du site.'
      : cible.mode === 'new_campus'
        ? 'Accepter crée l’implantation : elle devient « prête ». Elle ne paraît sur ntanova.com que lorsque tu la publies (Écoles › Publier).'
        : 'Accepter crée l’école : elle devient « prête ». Elle ne paraît sur ntanova.com que lorsque tu la publies (Écoles › Publier).';

  return {
    bloque:
      ceQuiManquePourAccepter(fiche, cible, entree.divisionChoisie) !== null ||
      ceQuiManqueDuNumero(aConfirmer, choix) !== null,
    lignes,
    phrase,
  };
}
