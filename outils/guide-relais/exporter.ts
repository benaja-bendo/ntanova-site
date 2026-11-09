// Exporte le guide du relais en PDF et en images pour WhatsApp (ticket #110), après `astro build`.
//
//   node outils/guide-relais/exporter.ts            (lancé par `pnpm build`, après la construction du site)
//
// Le texte vient de src/modele/guide-relais.ts, le même que celui de la page /guide-relais/ ; la mise en page est celle du
// livret v3 (1 080 × 1 920, lisible sur un téléphone). Un seul export, dans dist/guide-relais/ (avec le site) :
// NTANOVA-guide-relais-<version>-<date>.pdf et une image par page. Le guide ne porte aucun montant ni aucune mention de
// paiement (décision du 09/11/2026) : la page est lisible par quiconque a le lien.
//
// Ce qu'il vérifie dans le navigateur, pour chaque page (la construction échoue sinon) : le contenu ne déborde pas sur
// le pied de page ; le badge « n/5 » est en haut à droite sans chevaucher un bloc ; le tableau « Où trouver » est aligné ;
// la police Poppins est chargée ; sur la carte de passage, les écarts du numéro sont égaux. Puis : le PDF a bien 6 pages.
//
// Le numéro WhatsApp n'est jamais écrit dans le dépôt : il est lu dans PUBLIC_WHATSAPP (l'environnement, sinon le .env).
// Il n'apparaît que sur la carte de passage exportée.
//
// Il faut le Chromium de Playwright : `pnpm exec playwright install chromium`.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDE, nomsDesFichiers, numeroLisible } from '../../src/modele/guide-relais.ts';
import {
  carteEnHtml,
  echapper,
  numeroEnHtml,
  pageEnHtml,
  typo,
} from '../../src/modele/guide-relais-html.ts';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..', '..');
const SORTIE = join(RACINE, 'dist', 'guide-relais');
const LARGEUR = 1080;
const HAUTEUR = 1920;
const ORIGINE = 'http://guide.invalid';

/** Le numéro WhatsApp : l'environnement, sinon le .env du site. */
function numeroWhatsApp(): string | undefined {
  if (process.env['PUBLIC_WHATSAPP']) return process.env['PUBLIC_WHATSAPP'];
  const env = join(RACINE, '.env');
  if (!existsSync(env)) return undefined;
  return /^PUBLIC_WHATSAPP=(.+)$/m
    .exec(readFileSync(env, 'utf8'))?.[1]
    ?.trim()
    .replace(/^['"]|['"]$/g, '');
}

const logo = () => readFileSync(join(ICI, 'logo-mark-sombre.svg'), 'utf8');

function haut(numero: number, total: number): string {
  return (
    `<header class="top"><span class="brand">${logo()}<span>NTANOVA <small>RELAIS ET CONTRIBUTEURS</small></span></span>` +
    `<span class="nav"><span class="badge-page">${numero}/${total}</span></span></header>`
  );
}

function police(): string {
  return [400, 500, 600, 700, 800]
    .map(
      (poids) =>
        `@font-face{font-family:'Poppins';font-style:normal;font-weight:${poids};font-display:block;` +
        `src:url(${ORIGINE}/polices/poppins-latin-${poids}-normal.woff2) format('woff2');}`,
    )
    .join('');
}

function documentHtml(numero: string | undefined): string {
  const total = GUIDE.pages.length;
  // Les images se chargent d'un coup : le PDF et les captures ne tiennent pas compte du défilement.
  const eager = (html: string) => html.replaceAll(' loading="lazy"', '');
  const ctx = { urlCapture: (nom: string) => `${ORIGINE}/captures/${nom}.png` };
  const pied = `<footer class="regles">${GUIDE.pied.map((r) => `<span>${echapper(typo(r))}</span>`).join('')}</footer>`;
  const pages = GUIDE.pages.map(
    (p, i) =>
      `<section class="page" data-page="${p.fichier}">${haut(i + 1, total)}` +
      `<h2 class="grand">${typo(p.titre)}</h2><p class="lead">${typo(echapper(p.lead))}</p>` +
      `${eager(pageEnHtml(p, ctx))}${pied}</section>`,
  );
  const carte =
    `<section class="page passage" data-page="06-carte-de-passage">` +
    `<div class="haut">${logo()}<div class="mot">NTANOVA<small>RECENSEMENT DES ÉCOLES</small></div></div>` +
    `${carteEnHtml(GUIDE.carte, numeroEnHtml(numeroLisible(numero)))}</section>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>NTANOVA · Guide du relais</title>
<meta name="viewport" content="width=${LARGEUR}">
<style>${police()}${readFileSync(join(ICI, 'export.css'), 'utf8')}</style></head><body>${pages.join('')}${carte}</body></html>`;
}

interface Mesure {
  page: string;
  fin: number;
  limite: number;
  badge: 'ok' | 'mal' | null;
  grille: 'ok' | 'mal' | null;
  ecarts: number[] | null;
}

/** Les mesures de mise en page, dans le navigateur. */
function mesurer(): { police: boolean; pages: Mesure[] } {
  const rect = (el: Element) => el.getBoundingClientRect();
  const pages = [...document.querySelectorAll<HTMLElement>('.page')].map((p) => {
    const origine = rect(p).top;
    const regles = p.querySelector('.regles');
    const enfants = [...p.children].filter((c) => !c.classList.contains('regles'));
    const dernier = enfants[enfants.length - 1];
    const fin = Math.round(rect(dernier as Element).bottom - origine);
    const limite = Math.round((regles ? rect(regles).top : rect(p).bottom) - origine);

    let badge: 'ok' | 'mal' | null = null;
    const b = p.querySelector('.badge-page');
    if (b) {
      const rb = rect(b);
      const po = rect(p);
      const bon = rb.right >= po.right - 110 && rb.top - po.top <= 120;
      let chevauche = false;
      p.querySelectorAll('.page > *:not(.top), .page .flux .case').forEach((c) => {
        const rc = rect(c);
        if (
          rc.width &&
          rc.height &&
          rb.left < rc.right &&
          rb.right > rc.left &&
          rb.top < rc.bottom &&
          rb.bottom > rc.top
        )
          chevauche = true;
      });
      badge = bon && !chevauche ? 'ok' : 'mal';
    }

    const tel = [...p.querySelectorAll('.tel span')];
    const ecarts =
      tel.length > 1
        ? tel.slice(1).map((t, i) => Math.round(rect(t).left - rect(tel[i] as Element).right))
        : null;

    let grille: 'ok' | 'mal' | null = null;
    const rangees = [...p.querySelectorAll('.ou .r')];
    if (rangees.length) {
      const gauches = new Set<number>();
      const droites = new Set<number>();
      let coupes = 0;
      let bords = 0;
      rangees.forEach((r) => {
        const k = r.querySelector('.k') as Element;
        const v = r.querySelector('.v') as Element;
        gauches.add(Math.round(rect(k).left));
        droites.add(Math.round(rect(v).left));
        if (rect(k).height > parseFloat(getComputedStyle(k).lineHeight) * 1.5) coupes++;
        if (Math.abs(rect(r).width - rect(r.parentElement as Element).width) > 1) bords++;
      });
      grille = gauches.size === 1 && droites.size === 1 && !coupes && !bords ? 'ok' : 'mal';
    }
    return { page: p.dataset['page'] ?? '', fin, limite, badge, grille, ecarts };
  });
  return { police: window.document.fonts.check('700 20px Poppins'), pages };
}

function fautesDeMiseEnPage(mesures: { police: boolean; pages: Mesure[] }): string[] {
  const fautes: string[] = [];
  if (!mesures.police)
    fautes.push("la police Poppins n'est pas chargée (outils/guide-relais/polices/)");
  for (const m of mesures.pages) {
    if (m.fin > m.limite - 12)
      fautes.push(`${m.page} déborde : contenu jusqu'à ${m.fin} px, pied de page à ${m.limite} px`);
    if (m.badge === 'mal')
      fautes.push(
        `${m.page} : le badge de page doit être en haut à droite, sans chevaucher le contenu`,
      );
    if (m.grille === 'mal')
      fautes.push(
        `${m.page} : « Où trouver » doit être aligné (libellés sur une ligne, filets de bord à bord)`,
      );
    if (m.ecarts && Math.max(...m.ecarts) - Math.min(...m.ecarts) > 1) {
      fautes.push(`${m.page} : les écarts du numéro ne sont pas égaux (${m.ecarts.join(', ')})`);
    }
  }
  return fautes;
}

async function main(): Promise<void> {
  if (!existsSync(join(RACINE, 'dist', 'guide-relais'))) {
    throw new Error("dist/guide-relais/ manque : lancer `astro build` d'abord.");
  }
  const numero = numeroWhatsApp();
  if (!numeroLisible(numero)) {
    if (process.env['GUIDE_NUMERO_OBLIGATOIRE'] === 'oui') {
      throw new Error(
        'PUBLIC_WHATSAPP manque ou est incomplet : la carte de passage ne peut pas porter le numéro.',
      );
    }
    console.warn(
      ' ! PUBLIC_WHATSAPP absent ou incomplet : la carte de passage affichera [numéro WhatsApp].',
    );
  }

  const navigateur = await chromium.launch().catch((erreur: unknown) => {
    throw new Error(
      `Chromium de Playwright introuvable (\`pnpm exec playwright install chromium\`) : ${String(erreur)}`,
    );
  });
  try {
    const contexte = await navigateur.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
    const page = await contexte.newPage();
    // Aucun réseau : la page, les polices et les captures viennent du disque.
    await page.route(`${ORIGINE}/**`, async (route) => {
      const url = new URL(route.request().url());
      const { pathname } = url;
      if (pathname === '/guide.html') {
        const html = documentHtml(numero);
        return route.fulfill({ contentType: 'text/html', body: html });
      }
      const dossier = pathname.startsWith('/polices/')
        ? 'polices'
        : pathname.startsWith('/captures/')
          ? 'captures'
          : null;
      const fichier = dossier ? join(ICI, dossier, pathname.split('/').pop() ?? '') : null;
      if (!fichier || !existsSync(fichier)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({
        body: readFileSync(fichier),
        contentType: dossier === 'polices' ? 'font/woff2' : 'image/png',
      });
    });

    const dossier = SORTIE;
    const libelle = 'publié';
    const noms = nomsDesFichiers(GUIDE);
    mkdirSync(dossier, { recursive: true });
    await page.goto(`${ORIGINE}/guide.html`, { waitUntil: 'load' });
    await page.evaluate(() => window.document.fonts.ready);

    // Ce qui est publié ne dit jamais un montant ni un paiement : la page est lisible par quiconque a le lien.
    const paiement = await page.evaluate(() =>
      /FCFA|Mobile Money|paiement|rémunér/i.test(window.document.body.innerText),
    );
    if (paiement) {
      throw new Error(
        'Le guide publié parle de montant ou de paiement (FCFA, Mobile Money, paiement, rémunération) : décision du 09/11/2026, jamais sur le guide.',
      );
    }

    const mesures = await page.evaluate(mesurer);
    // La marge de chaque page, pour voir venir un débordement : Linux (la CI) et macOS ne coupent pas toujours les
    // lignes au même endroit.
    console.log(
      `  marges (px avant le pied de page) : ${mesures.pages
        .filter((m) => m.limite > 0)
        .map((m) => `${m.page.slice(0, 2)}=${m.limite - m.fin}`)
        .join(' ')}`,
    );
    const fautes = fautesDeMiseEnPage(mesures);
    if (fautes.length)
      throw new Error(
        `Le guide exporté (${libelle}) est mal mis en page :\n  - ${fautes.join('\n  - ')}`,
      );

    const pdf = await page.pdf({
      width: `${LARGEUR}px`,
      height: `${HAUTEUR}px`,
      printBackground: true,
      preferCSSPageSize: true,
    });
    const pagesDuPdf = (pdf.toString('latin1').match(/\/Type\s*\/Page(?![\w])/g) ?? []).length;
    const attendu = GUIDE.pages.length + 1;
    if (pagesDuPdf !== attendu)
      throw new Error(
        `Le PDF (${libelle}) a ${pagesDuPdf} pages, pas ${attendu} (les pages et la carte de passage).`,
      );
    writeFileSync(join(dossier, noms.pdf), pdf);

    const fichiers = [
      ...noms.images.map((i) => ({ fichier: i.fichier, page: i.page })),
      { fichier: noms.carte, page: '06-carte-de-passage' },
    ];
    for (const { fichier, page: nom } of fichiers) {
      await page.locator(`.page[data-page="${nom}"]`).screenshot({ path: join(dossier, fichier) });
    }
    console.log(
      `Guide du relais ${GUIDE.version} (${GUIDE.miseAJour}), ${libelle} : ${noms.pdf} et ${fichiers.length} images, dans ${relative(RACINE, dossier)}/`,
    );
  } finally {
    await navigateur.close();
  }
}

main().catch((erreur: unknown) => {
  console.error(erreur instanceof Error ? erreur.message : erreur);
  process.exit(1);
});
