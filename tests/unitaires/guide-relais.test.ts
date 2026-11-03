// Le guide du relais (ticket #110) : ce qu'on doit y lire, ce qu'on ne doit jamais y lire, et que les phrases communes
// avec l'application n'ont pas bougé. Reprend le contrôle du livret PDF (outils/livret-relais/controler_livret.py, dépôt
// `ntanova`) : il lisait le PDF, celui-ci lit le texte dont le PDF et la page sont faits.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONTACT,
  ESSAI,
  FICHE,
  GUIDE,
  chiffresDuNumero,
  dateLisible,
  montant,
  nomsDesFichiers,
  numeroLisible,
} from '../../src/modele/guide-relais';
import {
  carteEnHtml,
  numeroEnHtml,
  pageEnHtml,
  texteBrut,
  typo,
} from '../../src/modele/guide-relais-html';

// La page en ligne et le PDF publié n'ont aucun montant ; le document complet remis aux relais les a.
const ctx = {
  urlCapture: (nom: string) => `/guide-relais/captures/${nom}.webp`,
  avecMontants: false,
};
const ctxComplet = { ...ctx, avecMontants: true };

/** Sans la typographie : espaces (insécables comprises), guillemets, apostrophes, casse. */
function normaliser(t: string): string {
  return texteBrut(t).replace(/[«»]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const pages = GUIDE.pages.map((p) => ({
  p,
  titre: normaliser(`${p.titre} ${p.lead}`),
  texte: normaliser(`${p.titre} ${p.lead} ${pageEnHtml(p, ctx)}`),
}));
const carte = normaliser(carteEnHtml(GUIDE.carte, numeroEnHtml(numeroLisible('242061234567'))));
const tout = [...pages.map((p) => p.texte), carte].join(' ');
const toutComplet = [
  ...GUIDE.pages.map((p) => normaliser(`${p.titre} ${p.lead} ${pageEnHtml(p, ctxComplet)}`)),
  carte,
].join(' ');

describe('le contenu du guide', () => {
  it('a six pages et la carte de passage, une version et une date', () => {
    expect(GUIDE.pages).toHaveLength(6);
    expect(GUIDE.version).toMatch(/^v\d+$/);
    expect(GUIDE.miseAJour).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(GUIDE.changements.length).toBeGreaterThan(0);
  });

  it('dit la date de mise à jour comme une personne la lit, et la dernière ligne des changements est la plus récente', () => {
    expect(dateLisible('2026-11-03')).toBe('3 novembre 2026');
    expect(dateLisible('2026-12-01')).toBe('1 décembre 2026');
    const dates = GUIDE.changements.map((c) => c.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(dates[0]).toBe(GUIDE.miseAJour);
  });

  // Ce qu'on doit lire, page par page.
  const attendu: Record<string, string[]> = {
    '01-bienvenue': [
      'Bienvenue dans',
      'l’équipe terrain',
      'Dans la rue',
      'Votre téléphone',
      'NTanova',
      'Le site',
      'ntanova.com',
      'Répertorier les écoles autour de vous',
      'Votre secteur',
      'conseil, pas une limite',
      'couvrir votre secteur',
    ],
    '02-toutes-les-ecoles': [
      'Toutes les écoles',
      'Type d’école',
      'Privée',
      'Publique',
      'Confessionnelle',
      'Communautaire',
      'Autre',
      'Pas indiqué',
      'Autre formation',
      'séries ou filières',
      'doublon possible',
    ],
    '03-trois-ecrans': [
      'Le déroulé en trois écrans',
      '1/3',
      '2/3',
      '3/3',
      'Photo et position',
      'La direction',
      'Où trouver chaque information',
      'Séries, filières',
      'Mentions, numéro',
      'Repère',
      'Pour être payée',
      'panneau des filières, prospectus, vue du bâtiment',
    ],
    '04-posture': [
      'La posture',
      'On vous refuse l’entrée',
      '« Refus »',
      '« Absente »',
      'Avez-vous vu la direction ?',
      'ne forcez pas',
    ],
    '05-argent': ['Les montants', 'Mobile Money', 'vendredi soir'],
    '06-premier-jour': ['Votre premier jour', 'Lot Essai : 3 fiches', 'Avant de partir'],
  };

  for (const [fichier, mots] of Object.entries(attendu)) {
    it(`la page ${fichier} contient ce qu’on attend d’elle`, () => {
      const page = pages.find((x) => x.p.fichier === fichier);
      expect(page, `la page ${fichier} existe`).toBeDefined();
      for (const mot of mots) expect(page?.texte, `« ${mot} »`).toContain(normaliser(mot));
    });
  }

  it('la carte de passage dit qu’on ne photographie aucun enfant', () => {
    for (const mot of [
      'Aucune photo d’enfant',
      'Recensement des établissements scolaires',
      'ntanova.com',
    ]) {
      expect(carte, `« ${mot} »`).toContain(normaliser(mot));
    }
  });

  // Ce qu'on ne doit jamais lire dans le guide.
  const interdit: [string, string][] = [
    ['direction pas vue', 'la consigne du refus est de cocher « Refus » (ou « Absente »)'],
    ['matematie', 'enseigne illisible (« Maternelle - Primaire »)'],
    ['�', 'caractère de remplacement : texte cassé'],
    ['[numéro', 'numéro WhatsApp manquant'],
    ['undefined', 'gabarit resté tel quel'],
    ['{', 'gabarit resté tel quel'],
    ['}', 'gabarit resté tel quel'],
    ['est gratuit', 'NTanova ne promet pas la gratuité'],
    ['100 % gratuit', 'NTanova ne promet pas la gratuité'],
    ['république démocratique', 'le Congo-Brazzaville n’est pas la RDC'],
    ['rdc', 'le Congo-Brazzaville n’est pas la RDC'],
    // Le lot est un secteur conseillé, jamais une limite ni une condition de paie (ticket 67).
    ['dans votre zone', 'le secteur est un conseil'],
    ['hors de votre zone', 'le secteur est un conseil'],
    ['hors de la zone', 'un relais relève où il se trouve : la zone n’est plus un motif de refus'],
    ['signalez-la, ne la relevez pas', 'une école hors du secteur se relève'],
    ['votre lot', 'le lot est un secteur conseillé : on dit « votre secteur »'],
    // Rien du registre ne sort du dépôt de la stratégie.
    ['d7', 'aucune hypothèse du registre'],
    ['seuil', 'aucune hypothèse du registre'],
    ['hypothèse', 'aucune hypothèse du registre'],
  ];
  for (const [mot, pourquoi] of interdit) {
    it(`ne dit jamais « ${mot} »`, () => {
      expect(tout, `${pourquoi} (page en ligne)`).not.toContain(mot);
      expect(toutComplet, `${pourquoi} (document complet)`).not.toContain(mot);
    });
  }

  it('le guide en ligne ne dit jamais les montants à une école : ni gratuit, ni tarif promis', () => {
    expect(tout).toContain("on ne parle pas de prix pour l'instant");
    expect(tout).toContain('ni gratuit, ni tarif');
  });
});

describe('les montants', () => {
  it('viennent des constantes et s’écrivent avec une espace insécable', () => {
    expect([FICHE, CONTACT, ESSAI]).toEqual([500, 300, 1500]);
    expect(montant(1500)).toBe('1\u00a0500');
    expect(montant(6500)).toBe('6\u00a0500');
  });

  // La page est lisible par quiconque a le lien : jamais un montant dessus, ni dans le PDF publié (décision du 03/11).
  it('ne sont jamais sur la page en ligne ni dans le PDF publié', () => {
    expect(tout).not.toMatch(/fcfa/);
    expect(tout).not.toMatch(/\b(500|300|1 500|5 000|1 500|6 500)\b/);
    const page = pages.find((x) => x.p.fichier === '05-argent');
    expect(page?.texte).toContain('les montants');
    expect(page?.texte).toContain('whatsapp');
    const jour = pages.find((x) => x.p.fichier === '06-premier-jour');
    expect(jour?.texte).toContain('payées tout de suite');
  });

  it('sont dans le document complet remis aux relais, et l’exemple de la page 5 est juste', () => {
    const complet = normaliser(
      pageEnHtml(GUIDE.pages.find((x) => x.fichier === '05-argent') ?? GUIDE.pages[0]!, ctxComplet),
    );
    expect(complet).toContain('500 fcfa');
    expect(complet).toContain('300 fcfa');
    expect(complet).toContain('1 500 fcfa');
    expect(complet).toContain('10 fiches acceptées = 5 000 fcfa');
    expect(complet).toContain('+ 1 500 fcfa');
    expect(complet).toContain('6 500 fcfa en tout');
    expect(toutComplet).toContain('1 500 fcfa, tout de suite');
  });
});

describe('les phrases communes avec l’application', () => {
  const lire = (chemin: string) => readFileSync(chemin, 'utf8');

  /** Une phrase de JSX lue comme on la lit à l'écran ; une valeur calculée `{…}` coupe la phrase. */
  function jsx(t: string): string {
    return normaliser(t.replace(/\{[^}]*\}/g, '|').replace(/&#39;/g, "'"));
  }
  const morceaux = (phrase: string, coupe: RegExp) =>
    phrase
      .split(coupe)
      .map((x) => x.trim())
      .filter(Boolean);

  const monLot = lire('src/app/relais/ecrans/MonLot.tsx');
  const ajouter = lire('src/app/relais/ecrans/Ajouter.tsx');

  it('« À dire en entrant » est la phrase de l’application', () => {
    const phrase = /«&nbsp;(Bonjour\..*?)&nbsp;»/s.exec(monLot)?.[1];
    expect(
      phrase,
      'la phrase est introuvable dans MonLot.tsx : ce test est à mettre à jour',
    ).toBeDefined();
    const parties = morceaux(jsx(phrase ?? ''), /\|/);
    expect(parties.length).toBeGreaterThan(0);
    for (const partie of parties) expect(tout, `« ${partie.slice(0, 70)}… »`).toContain(partie);
  });

  it('« Jamais » est la liste de l’application', () => {
    const phrase = /<b>Jamais&nbsp;:<\/b>(.*?)<\/p>/s.exec(monLot)?.[1];
    expect(
      phrase,
      'la liste est introuvable dans MonLot.tsx : ce test est à mettre à jour',
    ).toBeDefined();
    const parties = morceaux(jsx(phrase ?? ''), /[.,]/);
    expect(parties.length).toBe(4);
    for (const partie of parties) expect(tout, `« ${partie} »`).toContain(partie);
  });

  it('« À lui dire » est la phrase de l’application', () => {
    const phrase = /À lui dire&nbsp;: «&nbsp;(.*?)&nbsp;»/s.exec(ajouter)?.[1];
    expect(
      phrase,
      'la phrase est introuvable dans Ajouter.tsx : ce test est à mettre à jour',
    ).toBeDefined();
    const parties = morceaux(jsx(phrase ?? ''), /\|/);
    expect(parties.length).toBeGreaterThan(0);
    for (const partie of parties) expect(tout, `« ${partie.slice(0, 70)}… »`).toContain(partie);
  });
});

describe('le numéro WhatsApp', () => {
  it('s’écrit +242 06 123 45 67, en groupes de 2-3-2-2', () => {
    expect(numeroLisible('242061234567')).toEqual(['+242', '06', '123', '45', '67']);
    expect(numeroLisible('+242 06 123 45 67')).toEqual(['+242', '06', '123', '45', '67']);
    expect(numeroLisible('061234567')).toEqual(['+242', '06', '123', '45', '67']);
  });

  it('n’invente jamais un numéro', () => {
    expect(numeroLisible(undefined)).toBeNull();
    expect(numeroLisible('')).toBeNull();
    expect(numeroLisible('24206123')).toBeNull();
    expect(chiffresDuNumero('abc')).toBeNull();
  });

  it('manquant, la carte le dit clairement, et la page ne le laisse jamais passer en silence', () => {
    expect(numeroEnHtml(null)).toContain('[numéro');
    expect(numeroEnHtml(['+242', '06'])).toBe(
      '<b class="tel"><span>+242</span><span>06</span></b>',
    );
  });
});

describe('les fichiers exportés', () => {
  it('portent la version et la date, une image par page et la carte de passage', () => {
    const noms = nomsDesFichiers();
    expect(noms.pdf).toBe(`NTANOVA-guide-relais-${GUIDE.version}-${GUIDE.miseAJour}.pdf`);
    expect(noms.images).toHaveLength(6);
    expect(noms.images[0]?.fichier).toBe(
      `guide-relais-${GUIDE.version}-${GUIDE.miseAJour}-01-bienvenue.png`,
    );
    expect(noms.carte).toContain('07-carte-de-passage');
  });

  it('le document complet (avec les montants) a son propre nom : il n’est jamais confondu avec le publié', () => {
    const publie = nomsDesFichiers();
    const complet = nomsDesFichiers(GUIDE, { complet: true });
    expect(complet.pdf).toBe(publie.pdf.replace('.pdf', '-complet.pdf'));
    expect(complet.pdf).not.toBe(publie.pdf);
    expect(complet.images[0]?.fichier).not.toBe(publie.images[0]?.fichier);
  });
});

describe('la typographie', () => {
  it('colle les guillemets français et la ponctuation haute, sans toucher aux balises', () => {
    expect(typo('« Bonjour » ?')).toBe('«\u00a0Bonjour\u00a0»\u00a0?');
    expect(typo('Un doute : écrivez')).toBe('Un doute\u00a0: écrivez');
    expect(typo('<span style="a: b">x</span>')).toBe('<span style="a: b">x</span>');
  });
});

describe('les captures', () => {
  it('toutes celles que le guide montre sont déclarées', () => {
    const html = GUIDE.pages.map((p) => pageEnHtml(p, ctx)).join('');
    const vues = [...html.matchAll(/captures\/([\w-]+)\.webp/g)].map((m) => m[1]);
    expect(new Set(vues)).toEqual(new Set(GUIDE.captures));
  });
});
