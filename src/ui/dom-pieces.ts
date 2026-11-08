/**
 * Les pièces du site écrites dans le navigateur : l'icône, le disque d'un cycle, la ligne d'une école, l'état vide.
 * Chacune a son jumeau écrit à la construction (`Icone.astro`, `LigneEcole.astro`, `EtatVide.astro`) : mêmes balises, mêmes
 * classes (`carte-pieces.css`). Un parcours compare les deux rendus ; changer l'un, c'est changer l'autre.
 * Les données sont toujours du texte (`textContent`), jamais du HTML.
 */
import { ICONES, type NomIcone } from '../modele/carte/icones';
import { estUneLettreDeCycle } from '../modele/carte/marqueurs';
import { iconeDeProvenance, type LigneAffichee } from '../modele/ligne-ecole';

const SVG = 'http://www.w3.org/2000/svg';

export function icone(nom: NomIcone, petite = true): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  // Dans l'ordre d'`Icone.astro` : un parcours compare les deux balisages.
  svg.setAttribute('class', petite ? 'ico ico-s' : 'ico');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of ICONES[nom]) {
    const trace = document.createElementNS(SVG, 'path');
    trace.setAttribute('d', d);
    svg.append(trace);
  }
  return svg;
}

export function element<K extends keyof HTMLElementTagNameMap>(
  balise: K,
  classe?: string,
  texte?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

/** Le disque d'un cycle : sa lettre et sa couleur ; gris et sans lettre quand le niveau n'est pas noté. */
export function disque(lettre: string | null | undefined, taille = ''): HTMLElement {
  const classes = ['disque'];
  if (taille) classes.push(taille);
  if (estUneLettreDeCycle(lettre)) classes.push(`c-${lettre}`);
  const d = element('span', classes.join(' '));
  d.setAttribute('aria-hidden', 'true');
  if (estUneLettreDeCycle(lettre)) d.textContent = lettre;
  return d;
}

/**
 * La carte d'une école : disque, distance quand la liste est classée, nom, puces et niveaux en mots, lieu, repère, preuve
 * datée, flèche. Même balisage que `LigneEcole.astro`.
 */
export function creerLigneEcole(d: LigneAffichee): HTMLLIElement {
  const li = document.createElement('li');
  const a = element('a', 'ligne-ecole');
  a.href = d.url;
  const corps = element('span', 'ligne-corps');
  if (d.distance) corps.append(element('span', 'ligne-distance', d.distance));
  corps.append(element('span', 'ligne-nom', d.nom));
  if (d.etiquette) corps.append(element('span', 'ligne-sous', d.etiquette));
  if (d.niveaux) {
    const niveaux = element('span', 'ligne-niveaux');
    if (d.lettres.length > 0) {
      const puces = element('span', 'ligne-puces');
      puces.setAttribute('aria-hidden', 'true');
      for (const l of d.lettres) puces.append(element('span', `disque disque-s c-${l}`, l));
      niveaux.append(puces);
    }
    niveaux.append(element('span', '', d.niveaux));
    corps.append(niveaux);
  }
  const lieu = element('span', 'ligne-lieu');
  lieu.append(element('b', '', d.lieu.fort));
  if (d.lieu.reste) lieu.append(` · ${d.lieu.reste}`);
  corps.append(lieu);
  if (d.repere) {
    const repere = element('span', 'ligne-repere');
    repere.append(icone('repere'), element('span', '', d.repere));
    corps.append(repere);
  }
  if (d.repereManquant)
    corps.append(element('span', 'ligne-repere ligne-repere-vide', 'Repère pas encore relevé'));
  const rang = element('span', 'ligne-preuve-rang');
  const preuve = element('span', `ligne-preuve ligne-preuve-${d.preuve}`);
  preuve.append(icone(iconeDeProvenance[d.preuve]), d.preuveTexte);
  rang.append(preuve);
  if (d.preuveDate) rang.append(element('span', 'ligne-preuve-date', d.preuveDate));
  corps.append(rang);
  const rond = d.lettre
    ? disque(d.lettre, 'disque-l')
    : (() => {
        const vide = disque(null, 'disque-l disque-vide');
        vide.textContent = '–';
        return vide;
      })();
  a.append(rond, corps, icone('suite', false));
  li.append(a);
  return li;
}

export type ActionVide = { texte: string; url: string } | { texte: string; surClic: () => void };

export interface EtatVideDonnees {
  /** Ce qui se passe, en une phrase claire. */
  titre: string;
  detail?: string | undefined;
  /** Ce qu'on peut faire d'autre : des boutons à contour. */
  actions?: ActionVide[] | undefined;
  /** « Une école manque ? » : la porte WhatsApp, quand elle est configurée. */
  manque?: { texte: string; url: string } | null | undefined;
}

/** L'état vide, le même partout : un état clair, de quoi continuer, et la porte « Une école manque ? ». Même balisage que `EtatVide.astro`. */
export function creerEtatVide(d: EtatVideDonnees): HTMLElement {
  const bloc = element('div', 'etat-vide');
  bloc.append(element('p', 'etat-vide-titre', d.titre));
  if (d.detail) bloc.append(element('p', 'etat-vide-detail', d.detail));
  if (d.actions?.length) {
    const actions = element('div', 'etat-vide-actions');
    for (const action of d.actions) {
      if ('url' in action) {
        const lien = element('a', 'bouton bouton-secondaire', action.texte);
        lien.href = action.url;
        actions.append(lien);
      } else {
        const bouton = element('button', 'bouton bouton-secondaire', action.texte);
        bouton.type = 'button';
        bouton.addEventListener('click', action.surClic);
        actions.append(bouton);
      }
    }
    bloc.append(actions);
  }
  if (d.manque) {
    const p = element('p', 'etat-vide-manque');
    const lien = element('a', undefined, d.manque.texte);
    lien.href = d.manque.url;
    p.append(lien);
    bloc.append(p);
  }
  return bloc;
}
