/**
 * Les images de la carte interactive, dessinées dans le navigateur au moment où MapLibre les demande (ticket 103) : les
 * marqueurs d'école, l'écusson d'une direction qui a confirmé, les hachures d'un déploiement programmé.
 *
 * Aucune couleur n'est écrite ici : elles sont lues dans les jetons de `src/ui/jetons.css` (`getComputedStyle` résout les
 * `var(--…)`). Aucun fichier d'image n'est servi : le style n'a pas de sprite (décision D6, pas de pictogramme).
 */
import {
  IMAGE_ECUSSON,
  IMAGE_HACHURES,
  JETON_DU_CYCLE,
  LETTRES_DES_CYCLES,
  lireLEpingle,
  nomDeLEpingle,
} from '../../modele/carte/marqueurs';

export interface ImageDessinee {
  data: ImageData;
  /** 2 : l'image est dessinée au double de sa taille, pour rester nette sur un écran dense. */
  pixelRatio: number;
}

const RATIO = 2;

const jeton = (nom: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(`--${nom}`).trim();

function toile(largeur: number, hauteur: number) {
  const canvas = document.createElement('canvas');
  canvas.width = largeur * RATIO;
  canvas.height = hauteur * RATIO;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Le navigateur ne sait pas dessiner une image.');
  ctx.scale(RATIO, RATIO);
  return { canvas, ctx };
}

function pret({ canvas, ctx }: ReturnType<typeof toile>): ImageDessinee {
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), pixelRatio: RATIO };
}

/** L'écusson à coche d'une école (ou d'un groupe) confirmée par sa direction, en haut à gauche de (x, y). */
function tracerEcusson(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.moveTo(x + 7, y);
  ctx.lineTo(x + 14, y + 2.5);
  ctx.lineTo(x + 14, y + 8);
  ctx.quadraticCurveTo(x + 14, y + 13, x + 7, y + 16);
  ctx.quadraticCurveTo(x, y + 13, x, y + 8);
  ctx.lineTo(x, y + 2.5);
  ctx.closePath();
  ctx.fillStyle = jeton('carte-ecusson-fond');
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = jeton('carte-ecusson');
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 8);
  ctx.lineTo(x + 6.3, y + 10.5);
  ctx.lineTo(x + 10.3, y + 5.5);
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** L'épingle de l'école choisie est celle des autres, 28 % plus grande : dessinée à sa taille, elle reste nette. */
const ECHELLE_CHOISIE = 1.28;

/** Une épingle : le corps a la couleur du cycle, la lettre est blanche, l'écusson dit la confirmation de la direction. */
function dessinerEpingle(
  lettre: string | null,
  confirmee: boolean,
  choisie: boolean,
): ImageDessinee {
  const echelle = choisie ? ECHELLE_CHOISIE : 1;
  const t = toile(Math.ceil(40 * echelle), Math.ceil(46 * echelle));
  const { ctx } = t;
  ctx.scale(echelle, echelle);
  const cx = 18;
  const cy = 18;
  const r = 15;
  const pointe = 44;
  ctx.beginPath();
  ctx.moveTo(cx, pointe);
  ctx.bezierCurveTo(cx - 7, pointe - 11, cx - r, cy + 7, cx - r, cy);
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.bezierCurveTo(cx + r, cy + 7, cx + 7, pointe - 11, cx, pointe);
  ctx.closePath();
  const cycle = lettre ? JETON_DU_CYCLE[lettre as keyof typeof JETON_DU_CYCLE] : null;
  ctx.fillStyle = jeton(cycle ?? 'carte-epingle-neutre');
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = jeton('carte-epingle-contour');
  ctx.stroke();
  if (lettre) {
    ctx.fillStyle = jeton('cycle-lettre');
    ctx.font = `700 17px ${jeton('police-titre')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lettre, cx, cy + 1);
  }
  if (confirmee) tracerEcusson(ctx, 22, 0);
  return pret(t);
}

function dessinerEcusson(): ImageDessinee {
  const t = toile(18, 20);
  tracerEcusson(t.ctx, 2, 2);
  return pret(t);
}

/** Des hachures sobres : un trait à 45° de la couleur « programmé », assez pâle pour laisser lire le fond. */
function dessinerHachures(): ImageDessinee {
  const taille = 12;
  const t = toile(taille, taille);
  const { ctx } = t;
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = jeton('carte-zone-programme');
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const decalage of [-taille, 0, taille]) {
    ctx.moveTo(decalage, taille);
    ctx.lineTo(decalage + taille, 0);
  }
  ctx.stroke();
  return pret(t);
}

/** L'image que MapLibre demande sous ce nom, ou rien si ce n'est pas une des nôtres. */
export function imageDeLaCarte(nom: string): ImageDessinee | null {
  if (nom === IMAGE_ECUSSON) return dessinerEcusson();
  if (nom === IMAGE_HACHURES) return dessinerHachures();
  const epingle = lireLEpingle(nom);
  return epingle ? dessinerEpingle(epingle.lettre, epingle.confirmee, epingle.choisie) : null;
}

/**
 * Tous les noms d'image que le style peut demander : les hachures, l'écusson, et une épingle par lettre de cycle (plus la
 * neutre), avec et sans écusson. Enregistrés d'un coup, avant que MapLibre en ait besoin : le rattrapage à la demande
 * (`styleimagemissing`) arrive trop tard pour la première mise en place des marqueurs, qui n'apparaissent alors pas.
 */
export function nomsDesImages(): string[] {
  const lettres: (string | null)[] = [...LETTRES_DES_CYCLES, null];
  return [
    IMAGE_ECUSSON,
    IMAGE_HACHURES,
    ...lettres.flatMap((l) => [nomDeLEpingle(l, false), nomDeLEpingle(l, true)]),
  ];
}
