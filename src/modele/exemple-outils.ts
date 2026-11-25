/**
 * L'exemple de la page « Outils en préparation » (refonte publique, lot 5, 25/11/2026 ; canevas « Points de repère », planche
 * « Outils, en préparation »). Tout est inventé : l'école, les dossiers, les jours, les sommes, le reçu. Aucun nom d'élève ni de
 * famille. Rien ici n'entre dans le catalogue, la recherche, la carte, ni aucun formulaire.
 *
 * Le dossier 016 se raconte quatre fois (tableau, chronologie, reçu, aperçu famille) depuis un seul objet : les quatre récits ne
 * peuvent pas se contredire. Ce n'est pas un moteur de gestion : des constantes, deux soustractions et leur mise en mots.
 */
import { francsCFA } from './frais-ecole';

export const ECOLE_EXEMPLE = { debut: 'École Les', fin: 'Manguiers' } as const;
export const RENTREE_EXEMPLE = '2027';

export const DOSSIER_016 = {
  numero: '016',
  classe: 'CP1',
  recuLe: '2027-06-02',
  par: 'Fiche NTanova',
  pieces: 3,
  piecesLe: '2027-06-09',
  admisLe: '2027-06-14',
  recu: { numero: '0042', le: '2027-06-28', caisse: 'caisse 1', montant: 20_000 },
  confirmeLe: '2027-06-28',
  transmis: { le: '2027-06-28', heure: '17 h 10' },
  du: 30_000,
  echeances: [
    { nom: '1re échéance', mois: 'juin', du: 15_000, verse: 15_000 },
    { nom: '2e échéance', mois: 'octobre', du: 15_000, verse: 5_000 },
  ],
} as const;

/** Ce qu'il reste à payer : le dû moins le seul versement du reçu. */
export const RESTE_016 = DOSSIER_016.du - DOSSIER_016.recu.montant;

/** La prochaine échéance, celle qui n'est pas soldée. */
export const PROCHAINE_016 = DOSSIER_016.echeances.find((e) => e.verse < e.du)!;

/** « 20 000 FCFA », insécable jusqu'à l'unité. */
export const somme = (n: number): string => francsCFA(n).replace(' FCFA', '\u00a0FCFA');
/** « 20 000 », l'unité venant plus loin. */
export const nombre = (n: number): string => somme(n).replace('\u00a0FCFA', '');
/** « 20 000 sur 30 000 FCFA ». */
export const verseSur = (verse: number, du: number): string => `${nombre(verse)} sur ${somme(du)}`;

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
/** « 2 juin », « 1er juin », et « 2 juin 2027 » quand l'année se dit. */
export function jourEcrit(iso: string, avecAnnee = false): string {
  const [annee, mois, jour] = iso.split('-').map(Number);
  const dit = `${jour === 1 ? '1er' : jour}\u00a0${MOIS[mois! - 1]}`;
  return avecAnnee ? `${dit}\u00a0${annee}` : dit;
}

/** Une ligne du tableau : cinq questions distinctes, une réponse chacune. */
export interface LigneDossier {
  dossier: string;
  recue: string;
  par: string;
  pieces: string;
  decision: string;
  paiement: string;
  inscription: string;
  /** Le dossier suivi plus bas. */
  suivi?: boolean;
}

const RIEN_DE_DU = 'Rien de dû';
const NON_CONFIRMEE = 'Non confirmée';
const d = DOSSIER_016;

export const DOSSIERS_EXEMPLE: readonly LigneDossier[] = [
  {
    dossier: '014 · CE1',
    recue: jourEcrit('2027-06-01'),
    par: 'Secrétariat',
    pieces: 'Incomplet\u00a0: 1 pièce manque',
    decision: 'À examiner',
    paiement: RIEN_DE_DU,
    inscription: NON_CONFIRMEE,
  },
  {
    dossier: '015 · 6e',
    recue: jourEcrit('2027-06-02'),
    par: 'Fiche NTanova',
    pieces: 'Complet',
    decision: 'À décider',
    paiement: RIEN_DE_DU,
    inscription: NON_CONFIRMEE,
  },
  {
    dossier: `${d.numero} · ${d.classe}`,
    recue: jourEcrit(d.recuLe),
    par: d.par,
    pieces: `Complet le ${jourEcrit(d.piecesLe)}`,
    decision: `Admis le ${jourEcrit(d.admisLe)}`,
    paiement: verseSur(d.recu.montant, d.du),
    inscription: `Confirmée le ${jourEcrit(d.confirmeLe)}`,
    suivi: true,
  },
  {
    dossier: '017 · CM2',
    recue: jourEcrit('2027-06-03'),
    par: 'Secrétariat',
    pieces: 'Complet',
    decision: 'Liste d’attente\u00a0: classe pleine',
    paiement: RIEN_DE_DU,
    inscription: NON_CONFIRMEE,
  },
  {
    dossier: '018 · 3e',
    recue: jourEcrit('2027-06-04'),
    par: 'Import, élève déjà inscrit',
    pieces: 'Complet',
    decision: `Réadmis le ${jourEcrit('2027-06-12')}`,
    paiement: verseSur(0, 30_000),
    inscription: `Confirmée le ${jourEcrit('2027-06-20')}, sur dérogation`,
  },
];

/** Ce que l'école note sur le dossier 016, dans l'ordre. */
export const CHRONOLOGIE_016: readonly { quand: string; quoi: string }[] = [
  { quand: jourEcrit(d.recuLe, true), quoi: 'Demande reçue, depuis la fiche.' },
  {
    quand: jourEcrit(d.piecesLe),
    quoi: `Dossier complet\u00a0: ${d.pieces} pièces sur ${d.pieces}.`,
  },
  { quand: jourEcrit(d.admisLe), quoi: 'Admission décidée par la direction.' },
  {
    quand: jourEcrit(d.recu.le),
    quoi: `${somme(d.recu.montant)} reçus à la caisse. Reçu n°\u00a0${d.recu.numero}.`,
  },
  {
    quand: jourEcrit(d.confirmeLe),
    quoi: `Inscription confirmée\u00a0: l’école demande la première échéance, ${somme(d.echeances[0].du)}.`,
  },
  {
    quand: `${jourEcrit(d.transmis.le)}, ${d.transmis.heure}`,
    quoi: 'Transmis en ligne\u00a0: la famille le voit à cette heure.',
  },
];
