/**
 * Le guide du relais en HTML : un seul rendu, pour la page du site et pour le PDF (outils/guide-relais/).
 *
 * Les deux n'ont pas la même feuille de style (la page est fluide, le PDF est en 1 080 × 1 920), mais elles ont le même
 * balisage, donc le même texte. Les textes viennent de `guide-relais.ts` : du HTML de confiance, jamais une saisie.
 */
import type { Bloc, CartePassage, Ligne, PageGuide } from './guide-relais';

export interface ContexteRendu {
  /** L'adresse d'une capture d'écran de l'application : `/guide-relais/captures/mon-lot.webp` pour la page. */
  urlCapture: (nom: string) => string;
}

export function echapper(texte: string): string {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * La typographie française : espace insécable dans « … » et avant ? ! : ; (jamais un signe seul en début de ligne).
 * Seul le texte est touché, jamais une balise.
 */
export function typo(html: string): string {
  return html
    .split(/(<[^>]+>)/)
    .map((morceau) =>
      morceau.startsWith('<')
        ? morceau
        : morceau
            .replace(/« /g, '«\u00a0')
            .replace(/ »/g, '\u00a0»')
            .replace(/ ([?!:;])/g, '\u00a0$1'),
    )
    .join('');
}

/** Le texte lu par une personne : sans balise, les espaces insécables en espaces, apostrophes droites. */
export function texteBrut(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/’/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function lignes(items: Ligne[]): string {
  return items
    .map(
      (l) =>
        `<div class="ligne"><span class="n">${echapper(l.signe)}</span><div><h3>${typo(l.titre)}</h3><p>${typo(l.html)}</p></div></div>`,
    )
    .join('');
}

export function blocEnHtml(bloc: Bloc, ctx: ContexteRendu): string {
  switch (bloc.type) {
    case 'titre':
      return `<h4>${typo(echapper(bloc.texte))}</h4>`;
    case 'texte':
      return `<p${bloc.petit ? ' class="petit"' : ''}>${typo(bloc.html)}</p>`;
    case 'puces': {
      const normales = bloc.items.map((x) => `<span>${echapper(x)}</span>`);
      const sorties = (bloc.sorties ?? []).map((x) => `<span class="sortie">${echapper(x)}</span>`);
      return `<div class="chips">${[...normales, ...sorties].join('')}</div>`;
    }
    case 'lignes':
      return lignes(bloc.items);
    case 'attention':
      return `<div class="attention">${typo(bloc.html)}</div>`;
    case 'dire':
      return `<div class="dire">${typo(bloc.html)}</div>`;
    case 'jamais':
      return `<div class="jamais">${bloc.items.map((x) => `<span>${echapper(x)}</span>`).join('')}</div>`;
    case 'ou':
      return (
        '<div class="ou">' +
        bloc.items
          .map(
            (o) =>
              `<div class="r"><span class="k">${typo(echapper(o.cle))}</span><span class="v">${typo(o.html)}</span></div>`,
          )
          .join('') +
        '</div>'
      );
    case 'flux':
      return (
        '<div class="flux">' +
        bloc.cases
          .map(
            (c) =>
              `<div class="case${c.actif ? ' on' : ''}"><i>${c.numero}</i><b>${typo(c.titre)}</b><span>${typo(c.html)}</span></div>`,
          )
          .join('<div class="fl" aria-hidden="true">›</div>') +
        '</div>'
      );
    case 'ecrans':
      return (
        '<div class="trois">' +
        bloc.items
          .map(
            (e) =>
              `<div class="ec"><div class="cadre-ecran"><div class="vue" style="aspect-ratio:${e.rapport}">` +
              `<img alt="L’écran ${e.numero} de l’application : ${echapper(e.titre)}" src="${ctx.urlCapture(e.capture)}" loading="lazy"></div></div>` +
              `<h3><span class="n3">${e.numero}</span>${typo(echapper(e.titre))}</h3><p>${typo(e.html)}</p></div>`,
          )
          .join('') +
        '</div>'
      );
    case 'premier-jour':
      return (
        `<div class="deuxcol"><div>${lignes(bloc.etapes)}</div>` +
        `<div class="cote-ecran"><div class="ecran"><img alt="L’écran d’accueil de l’espace relais" src="${ctx.urlCapture(bloc.capture)}" loading="lazy"></div>` +
        `<p class="legende">${typo(echapper(bloc.legende))}</p></div></div>`
      );
    case 'coches':
      return (
        `<h4>${typo(echapper(bloc.titre))}</h4>` +
        `<ul class="check">${bloc.items.map((x) => `<li>${typo(x)}</li>`).join('')}</ul>`
      );
  }
}

export function blocsEnHtml(blocs: Bloc[], ctx: ContexteRendu): string {
  return blocs.map((b) => blocEnHtml(b, ctx)).join('');
}

/** Le contenu d'une page (hors titre et pied) : le schéma d'avant, puis les panneaux clairs. */
export function pageEnHtml(page: PageGuide, ctx: ContexteRendu): string {
  const avant = page.avant ? blocsEnHtml(page.avant, ctx) : '';
  const panneaux = page.panneaux
    .map((p) => `<div class="panel${p.large ? ' large' : ''}">${blocsEnHtml(p.blocs, ctx)}</div>`)
    .join('');
  return avant + panneaux;
}

/** Le numéro, chaque groupe de chiffres dans sa boîte : la même espace entre deux groupes. */
export function numeroEnHtml(groupes: string[] | null): string {
  return groupes
    ? `<b class="tel">${groupes.map((g) => `<span>${echapper(g)}</span>`).join('')}</b>`
    : '<b class="tel"><span>[numéro</span><span>WhatsApp]</span></b>';
}

/** Le texte de la carte de passage, sans le titre et sans le numéro. */
export function carteEnHtml(carte: CartePassage, numero: string): string {
  return (
    `<h1>${typo(echapper(carte.titre))}</h1>` +
    `<div class="interdit">${typo(echapper(carte.interdit))}</div>` +
    `<p class="texte">${typo(echapper(carte.texte))}</p>` +
    `<div class="contact"><small>${typo(echapper(carte.contact))}</small>${numero}` +
    `<span class="site">${echapper(carte.site)}</span></div>`
  );
}
