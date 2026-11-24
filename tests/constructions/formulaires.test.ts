// Des constructions entières du site, sur le faux catalogue, à la main : `pnpm test:constructions` (trois minutes). Deux preuves que ni
// un unitaire ni un parcours ne donnent (refonte, lot 3C) :
//   - les deux positions du réglage `PUBLIC_FORMULAIRES` ;
//   - un retrait de bout en bout (cas 35 du contrat) : ce qui est retiré est cherché dans CHAQUE fichier construit, avant puis après.
// Les constructions vont dans un dossier temporaire : `dist/`, celle que sert le poste du fondateur, n'est jamais touchée.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RETRAIT_FAUX } from '../../src/infra/faux/catalogue';

const dossier = mkdtempSync(join(tmpdir(), 'ntanova-constructions-'));
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

function construire(nom: string, env: Record<string, string>): string {
  const sortie = join(dossier, nom);
  execFileSync('pnpm', ['exec', 'astro', 'build', '--outDir', sortie], {
    env: {
      ...process.env,
      PUBLIC_ADAPTATEUR: 'faux',
      PUBLIC_WHATSAPP: '242000000000',
      PUBLIC_SUPABASE_URL: '',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      ...env,
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return sortie;
}
function* fichiers(racine: string): Generator<string> {
  for (const e of readdirSync(racine, { withFileTypes: true })) {
    const chemin = join(racine, e.name);
    if (e.isDirectory()) yield* fichiers(chemin);
    else yield chemin;
  }
}
/** Chaque fichier public, son chemin et son contenu : pages, données, plans, images, scripts. Le faux serveur n'est pas une sortie. */
const sorties = (racine: string) =>
  [...fichiers(racine)]
    .map((f) => ({ chemin: relative(racine, f), contenu: readFileSync(f, 'latin1') }))
    .filter((s) => !s.contenu.includes('ntanova-faux-') && !/^(admin|relais)\//.test(s.chemin));
/** Les fichiers qui portent ce texte, dans leur nom ou dans leur contenu, sous ses écritures possibles. */
function ou(racine: string, texte: string): string[] {
  const utf8 = Buffer.from(texte, 'utf8').toString('latin1');
  const formes = [texte, utf8, encodeURIComponent(texte), JSON.stringify(utf8).slice(1, -1)];
  return sorties(racine)
    .filter((s) => formes.some((f) => s.chemin.includes(f) || s.contenu.includes(f)))
    .map((s) => s.chemin);
}
/** Un numéro tel qu'une page peut l'écrire. */
const ecritures = (numero: string) => {
  const n = numero.slice(3);
  return [
    numero,
    `${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7)}`,
    n.replace(/(\d{2})(?=\d)/g, '$1 '),
    n,
  ];
};
const lire = (racine: string, chemin: string) => readFileSync(join(racine, chemin), 'utf8');

const LIENS = /href="\/(contact|contribuer)\/[^"]*"/g;
const PAGES = [
  'index.html',
  'ecoles/index.html',
  'ecoles/pointe-noire/index.html',
  'ecoles/complexe-scolaire-exemple-482913/index.html',
  'pour-les-ecoles/index.html',
  'methode/index.html',
  'confidentialite/index.html',
  // Lot 4 (24/11) : les pages de confiance et « Toutes les villes ».
  'villes/index.html',
  'a-propos/index.html',
  'donnees/index.html',
];
const liens = (racine: string, page: string) =>
  [...new Set([...lire(racine, page).matchAll(LIENS)].map((m) => m[0].slice(6, -1)))].map((h) =>
    h.replaceAll('&amp;', '&').replaceAll('&#38;', '&'),
  );

describe('le réglage des formulaires', () => {
  let ferme = '';
  let ouvert = '';
  beforeAll(() => {
    ferme = construire('ferme', {});
    ouvert = construire('ouvert', { PUBLIC_FORMULAIRES: 'ouverts' });
  });

  it('fermé, par défaut : les pages existent en « noindex » ; aucun lien, aucun plan n’y mène ; WhatsApp partout', () => {
    for (const p of ['contact', 'contribuer']) {
      expect(lire(ferme, `${p}/index.html`)).toContain('<meta name="robots" content="noindex"');
    }
    for (const s of sorties(ferme)) {
      if (/^(contact|contribuer)\//.test(s.chemin)) continue;
      expect(s.contenu.match(LIENS) ?? [], s.chemin).toEqual([]);
    }
    expect(lire(ferme, 'sitemap.xml')).not.toMatch(/\/contact\/|\/contribuer\//);
    expect(lire(ferme, 'llms.txt')).not.toMatch(/\/contact\/|\/contribuer\//);
    expect(lire(ferme, 'index.html')).toContain('Écrire à NTanova sur WhatsApp');
    expect(lire(ferme, 'confidentialite/index.html')).not.toContain('formulaire du site');
  });

  it('ouvert : chaque arrivée prévue mène à son formulaire, avec son origine', () => {
    const attendu: Record<string, string[]> = {
      'index.html': ['/contribuer/?type=manque&depuis=accueil'],
      'ecoles/index.html': ['/contribuer/?type=manque&depuis=ecoles'],
      'ecoles/pointe-noire/index.html': ['/contribuer/?type=manque&depuis=villes'],
      'ecoles/complexe-scolaire-exemple-482913/index.html': [
        '/contribuer/?type=erreur&ecole=482913&depuis=fiche',
      ],
      'pour-les-ecoles/index.html': [
        '/contribuer/?type=manque&depuis=pour-les-ecoles',
        '/contact/?sujet=ecole&depuis=pour-les-ecoles',
      ],
      'methode/index.html': ['/contribuer/?type=erreur&depuis=fiabilite'],
      'villes/index.html': ['/contribuer/?type=manque&depuis=villes'],
      'a-propos/index.html': ['/contact/?depuis=direct'],
      'donnees/index.html': ['/contact/?sujet=donnees&depuis=direct'],
      'confidentialite/index.html': [
        '/contact/?sujet=donnees&depuis=confidentialite',
        '/contribuer/?type=retrait&depuis=confidentialite',
      ],
    };
    const pied = [
      '/contribuer/?type=manque&depuis=pied',
      '/contribuer/?type=erreur&depuis=pied',
      '/contact/?depuis=pied',
    ];
    for (const page of PAGES) {
      expect(liens(ouvert, page).sort(), page).toEqual([...(attendu[page] ?? []), ...pied].sort());
    }
    for (const p of ['contact', 'contribuer']) {
      expect(lire(ouvert, `${p}/index.html`)).not.toContain('noindex');
      expect(lire(ouvert, 'sitemap.xml')).toContain(`https://ntanova.com/${p}/`);
      expect(lire(ouvert, 'llms.txt')).toContain(`https://ntanova.com/${p}/`);
    }
  });

  it('ouvert : chaque adresse d’arrivée ne porte que des codes et le numéro public d’une fiche', () => {
    for (const s of sorties(ouvert)) {
      for (const lien of s.contenu.match(LIENS) ?? []) {
        const url = new URL(
          lien.slice(6, -1).replaceAll('&amp;', '&').replaceAll('&#38;', '&'),
          'https://x.test',
        );
        for (const [nom, valeur] of url.searchParams) {
          expect(['type', 'sujet', 'ecole', 'depuis'], s.chemin).toContain(nom);
          expect(valeur, s.chemin).toMatch(/^[a-z-]+$|^\d+$/);
        }
      }
    }
  });

  it('ouvert : la confidentialité dit ce que deviennent les messages, sans annoncer d’adresse IP pour eux', () => {
    const page = lire(ouvert, 'confidentialite/index.html');
    for (const dit of [
      'formulaire du site',
      '12 mois après la clôture',
      '30 jours pour un message indésirable',
      'l’effacement automatique du site ne les atteint pas',
      'pièce d’identité',
    ]) {
      expect(page, dit).toContain(dit);
    }
    expect(page).not.toContain('Vos messages partent sur WhatsApp.');
    expect(page.match(/adresse IP/g)).toHaveLength(2);
  });

  it('un fichier par fiche publiée, qui ne dit que ce que la fiche publique dit déjà', () => {
    const noms = readdirSync(join(ferme, 'contribuer/fiche'));
    expect(noms.length).toBeGreaterThan(3);
    for (const n of noms) {
      const f = JSON.parse(lire(ferme, `contribuer/fiche/${n}`)) as Record<string, string>;
      expect(Object.keys(f).sort()).toEqual(['id', 'lien', 'lieu', 'nom', 'numero']);
      expect(n).toBe(`${f.numero}.json`);
      expect(existsSync(join(ferme, f.lien!, 'index.html'))).toBe(true);
      expect(Object.values(f).join(' ')).not.toMatch(/\b242\d{9}\b/);
    }
  });
});

describe('un retrait, de bout en bout', () => {
  let avant = '';
  let apres = '';
  beforeAll(() => {
    avant = construire('avant', { NTANOVA_FAUX_RETRAIT: 'avant' });
    apres = construire('apres', { NTANOVA_FAUX_RETRAIT: 'apres' });
  });
  const R = RETRAIT_FAUX;

  it('avant : chaque information est bien dans les sorties (sinon l’absence ne prouverait rien)', () => {
    const fiche = 'ecoles/ecole-gardee-700001/index.html';
    expect(ecritures(R.contact).flatMap((n) => ou(avant, n))).toContain(fiche);
    expect(ou(avant, R.photo)).toEqual(
      expect.arrayContaining([fiche, 'recherche.json', `photos/${R.photo}.webp`]),
    );
    expect(ou(avant, R.photo).some((f) => f.startsWith('photos/vignettes/'))).toBe(true);
    expect(ou(avant, R.image).some((f) => f.startsWith('medias/'))).toBe(true);
    expect(ou(avant, R.personne)).toEqual(expect.arrayContaining([fiche, 'recherche.json']));
    const { id, nom, numero } = R.ficheEntiere;
    expect(ou(avant, nom)).toEqual(
      expect.arrayContaining([
        'recherche.json',
        'carte/ecoles.geojson',
        'llms.txt',
        `contribuer/fiche/${numero}.json`,
        'ecoles/pointe-noire/mvou-mvou/index.html',
      ]),
    );
    expect(ou(avant, numero)).toEqual(
      expect.arrayContaining(['sitemap.xml', 'llms.txt', 'ecoles/ecole-retiree-700002/index.html']),
    );
    expect(ou(avant, numero).some((f) => f.startsWith('partage/'))).toBe(true);
    expect(ou(avant, id).length).toBeGreaterThan(0);
  });

  it('avant : le numéro de l’enseigne est public tant que la fiche n’a pas de contact, sinon il n’y paraît pas', () => {
    // Sans contact publié : le numéro de l'enseigne est sur la fiche, en lien d'appel, en clair et avec sa source.
    const seule = `ecoles/ecole-retiree-${R.ficheEntiere.numero}/index.html`;
    const page = lire(avant, seule);
    const national = R.enseigneSeule.slice(3);
    expect(page).toContain(`href="tel:+${R.enseigneSeule}"`);
    expect(page).toContain(
      `+242 ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5, 7)} ${national.slice(7)}`,
    );
    expect(page).toContain('Numéro relevé sur l’enseigne.');
    expect(ecritures(R.enseigneSeule).flatMap((n) => ou(avant, n))).toContain(seule);
    // Avec un contact publié avec l'accord de la direction : le contact passe devant, et le numéro de l'enseigne n'est dans
    // AUCUNE sortie (fiche, recherche, carte, partage, plans), sous aucune de ses écritures.
    const gardee = lire(avant, 'ecoles/ecole-gardee-700001/index.html');
    expect(gardee).toContain(`href="tel:+${R.contact}"`);
    expect(gardee).toContain('Numéro communiqué par l’école');
    expect(ecritures(R.enseigne).flatMap((n) => ou(avant, n))).toEqual([]);
  });

  it('après : plus aucune trace, dans aucun fichier, nom ou contenu', () => {
    const cherches = [
      ...ecritures(R.contact),
      ...ecritures(R.enseigne),
      ...ecritures(R.enseigneSeule),
      R.photo,
      R.image,
      R.personne,
      R.ficheEntiere.id,
      R.ficheEntiere.nom,
      'ecole-retiree',
    ];
    for (const texte of cherches) expect(ou(apres, texte), texte).toEqual([]);
    // Le numéro public d'une fiche est six chiffres : on le cherche dans ses adresses, pas au milieu d'un autre nombre.
    for (const forme of [`-${R.ficheEntiere.numero}`, `/${R.ficheEntiere.numero}`]) {
      expect(ou(apres, forme), forme).toEqual([]);
    }
  });

  it('après : la fiche gardée reste, son lieu aussi ; le lieu vidé n’est plus un lien ni une entrée du plan', () => {
    expect(ou(apres, '[École Gardée]')).toEqual(
      expect.arrayContaining([
        'ecoles/ecole-gardee-700001/index.html',
        'recherche.json',
        'llms.txt',
      ]),
    );
    expect(lire(avant, 'sitemap.xml')).toContain('/ecoles/pointe-noire/mvou-mvou/');
    expect(lire(apres, 'sitemap.xml')).not.toContain('/ecoles/pointe-noire/mvou-mvou/');
    expect(lire(apres, 'llms.txt')).not.toContain('mvou-mvou');
    expect(lire(apres, 'ecoles/pointe-noire/mvou-mvou/index.html')).toContain('noindex');
    // Lot 4 : « Toutes les villes », Données et À propos se recalculent ; le lieu vidé n'y est plus un lien, et chaque compteur
    // perd la fiche retirée.
    expect(lire(avant, 'villes/index.html')).toContain('href="/ecoles/pointe-noire/mvou-mvou/"');
    expect(lire(apres, 'villes/index.html')).not.toContain('mvou-mvou');
    const fiches = (racine: string) =>
      Number(
        /<strong[^>]*>(\d+)<\/strong>\s*fiches? publiées? au total/.exec(
          lire(racine, 'donnees/index.html'),
        )?.[1],
      );
    expect(fiches(avant) - fiches(apres)).toBe(1);
    const pn = (racine: string) =>
      Number(
        /Pointe-Noire<\/b>\s*<span[^>]*>\s*(\d+) écoles?/.exec(
          lire(racine, 'villes/index.html'),
        )?.[1],
      );
    expect(pn(avant) - pn(apres)).toBe(1);
    expect(existsSync(join(apres, `contribuer/fiche/${R.ficheEntiere.numero}.json`))).toBe(false);
  });
});
