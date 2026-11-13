/**
 * « Une de mes fiches » (lot F du ticket 165) : ce que le relais lit d'une de ses fiches quand il l'ouvre. Où elle en est
 * (envoyée, acceptée, en ligne), la raison d'un refus ou d'une correction, ce qui vient de son relevé, et ce qui manque
 * encore à la page de l'école. Rien que de l'affichage, calculé dans le téléphone sur ce qu'il garde déjà : l'écran marche
 * hors ligne.
 *
 * « Ce qui manque encore » se lit sur le relevé seul : le téléphone ne voit pas les demandes de l'administration (elles lui
 * restent fermées). Ce sont donc les blocs de la page que ce relevé n'a pas remplis, jamais une promesse de paie.
 */
import { demandeLesFormations, ROLES_POUR_LA_PAGE } from './fiche';
import {
  libelleDirection,
  libelleMotif,
  libelleNiveau,
  libelleRolePhotoCourt,
  libelleTypeEcole,
} from './libelles';
import { listes, type Valeur } from './listes';
import type { ReleveRecu } from './ports';

export interface EtapeDeLaFiche {
  cle: 'envoyee' | 'acceptee' | 'en_ligne';
  libelle: string;
  /** Faite, en cours (la prochaine), ou pas encore. Une fiche refusée s'arrête à « envoyée ». */
  etat: 'faite' | 'en_cours' | 'a_venir' | 'arretee';
}

/** Les trois étapes d'une fiche : envoyée, acceptée par NTanova, en ligne sur ntanova.com. */
export function etapesDeLaFiche(r: Pick<ReleveRecu, 'statut' | 'pageEnLigne'>): EtapeDeLaFiche[] {
  const acceptee = r.statut === 'accepte';
  const enLigne = acceptee && r.pageEnLigne != null;
  return [
    { cle: 'envoyee', libelle: 'Envoyée', etat: 'faite' },
    {
      cle: 'acceptee',
      libelle:
        r.statut === 'refuse' ? 'Refusée' : r.statut === 'a_corriger' ? 'À corriger' : 'Acceptée',
      etat: acceptee
        ? 'faite'
        : r.statut === 'refuse' || r.statut === 'a_corriger'
          ? 'arretee'
          : 'en_cours',
    },
    {
      cle: 'en_ligne',
      libelle: 'En ligne',
      etat: enLigne ? 'faite' : acceptee ? 'en_cours' : 'a_venir',
    },
  ];
}

/** La raison que NTanova donne d'un refus ou d'une correction : son message, sinon le motif en clair. */
export function raisonDeNTanova(
  r: Pick<ReleveRecu, 'statut' | 'messageAuRelais' | 'motif'>,
): string | null {
  if (r.statut !== 'refuse' && r.statut !== 'a_corriger') return null;
  return r.messageAuRelais ?? (r.motif ? libelleMotif[r.motif] : null);
}

export interface Rubrique {
  libelle: string;
  valeur: string;
}

const connu = <C extends keyof typeof listes>(cle: C, v: string): v is Valeur<C> =>
  (listes[cle] as readonly string[]).includes(v);

/** Ce qui vient de son relevé, dans l'ordre de la page de l'école. Une valeur qu'il ne connaît pas encore se dit telle quelle. */
export function ceQuiVientDuReleve(r: ReleveRecu): Rubrique[] {
  const lignes: Rubrique[] = [];
  const photos = r.photos.filter((p, i, toutes) => toutes.indexOf(p) === i);
  if (photos.length > 0)
    lignes.push({
      libelle: `Photo${r.photos.length > 1 ? 's' : ''}`,
      valeur: photos.map((p) => (connu('photo_role', p) ? libelleRolePhotoCourt[p] : p)).join(', '),
    });
  lignes.push({ libelle: 'Nom', valeur: r.nomEnseigne });
  if (r.typeEcole && r.typeEcole !== 'non_indique')
    lignes.push({
      libelle: 'Type',
      valeur: connu('type_ecole', r.typeEcole) ? libelleTypeEcole[r.typeEcole] : r.typeEcole,
    });
  if (r.niveaux.length > 0)
    lignes.push({
      libelle: 'Niveaux',
      valeur: r.niveaux.map((n) => (connu('niveau', n) ? libelleNiveau[n] : n)).join(', '),
    });
  const formations = (r.formationsVues ?? []).map((f) => f.titre);
  if (formations.length > 0) lignes.push({ libelle: 'Formations', valeur: formations.join(', ') });
  else if (r.programmesVus) lignes.push({ libelle: 'Formations', valeur: r.programmesVus });
  if (r.repere) lignes.push({ libelle: 'Comment la trouver', valeur: r.repere });
  if (r.position)
    lignes.push({
      libelle: 'Position',
      valeur: r.precisionM != null ? `Prise à ${Math.round(r.precisionM)} m près` : 'Prise',
    });
  if (r.numeroEnseigne) lignes.push({ libelle: 'Numéro écrit', valeur: r.numeroEnseigne });
  if (r.direction)
    lignes.push({
      libelle: 'La rencontre',
      valeur:
        r.direction === 'vue' && r.aContact
          ? 'Oui · contact envoyé à NTanova'
          : connu('direction_vue', r.direction)
            ? libelleDirection[r.direction]
            : r.direction,
    });
  return lignes;
}

/**
 * Les blocs de la page que ce relevé n'a pas remplis : de quoi savoir quoi rapporter en repassant. Le contact d'une
 * direction qui a refusé n'est jamais demandé ; les formations, seulement pour un lycée, le technique ou le supérieur.
 */
export function ceQuiManqueEncore(r: ReleveRecu): string[] {
  const manques: string[] = [];
  if (!r.photos.includes('signboard')) manques.push('La photo de l’enseigne');
  if (!r.position) manques.push('La position devant l’entrée');
  else if (r.precisionM != null && r.precisionM > 50) manques.push('Une position plus précise');
  if (!r.repere) manques.push('Comment la trouver (un repère)');
  if (r.niveaux.length === 0) manques.push('Les niveaux');
  const niveaux = r.niveaux.filter((n): n is Valeur<'niveau'> => connu('niveau', n));
  if (demandeLesFormations(niveaux) && (r.formationsVues ?? []).length === 0 && !r.programmesVus)
    manques.push('Les formations affichées');
  if (!r.photos.some((p) => (ROLES_POUR_LA_PAGE as readonly string[]).includes(p)))
    manques.push('Des photos des lieux, vides (bonus)');
  if (!r.aContact && r.direction !== 'refus')
    manques.push('Le contact de la direction, avec son accord');
  return manques;
}
