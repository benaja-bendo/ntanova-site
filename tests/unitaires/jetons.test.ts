// Les jetons de la direction artistique (ticket #100, décisions du fondateur du 03/11) : fond neutre,
// couleurs de preuve, couleurs et lettres des cycles. On lit `jetons.css` tel qu'il est servi et on
// mesure les contrastes (WCAG 2.x) : une couleur qui change sans tenir son contraste fait échouer ce test.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/ui/jetons.css', 'utf8');

/** La valeur d'un jeton, en suivant les `var(--…)` jusqu'à une couleur. */
function jeton(nom: string): string {
  const trouve = new RegExp(`--${nom}:\\s*([^;]+);`).exec(css);
  if (!trouve?.[1]) throw new Error(`jeton absent : --${nom}`);
  const valeur = trouve[1].trim();
  const renvoi = /^var\(--([\w-]+)\)$/.exec(valeur);
  return renvoi?.[1] ? jeton(renvoi[1]) : valeur.toLowerCase();
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [clair, fonce] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (clair + 0.05) / (fonce + 0.05);
}

describe('le fond et les filets', () => {
  it('le fond de page est la pierre du système v2 (12/11), plus le neutre froid', () => {
    expect(jeton('fond')).toBe('#f8f6f2');
    expect(jeton('trait')).toBe('#e6e2da');
  });

  it('le bord qui porte du sens se lit sur blanc (v2 : 7,5:1, était 3,4:1)', () => {
    expect(contraste(jeton('trait-fort'), jeton('fond-releve'))).toBeGreaterThanOrEqual(7);
  });

  it('les textes restent lisibles sur le fond et sur la bande', () => {
    for (const fond of ['fond', 'fond-bande', 'fond-releve']) {
      expect(contraste(jeton('texte'), jeton(fond))).toBeGreaterThanOrEqual(7);
      expect(contraste(jeton('texte-doux'), jeton(fond))).toBeGreaterThanOrEqual(4.5);
      expect(contraste(jeton('marque'), jeton(fond))).toBeGreaterThanOrEqual(4.5);
      expect(contraste(jeton('erreur'), jeton(fond))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('les couleurs de la preuve', () => {
  it('chaque preuve a sa couleur, lisible en texte sur le fond et sur une carte blanche', () => {
    expect(jeton('preuve-direction')).toBe('#0b5d4a');
    expect(jeton('preuve-terrain')).toBe('#0b5d4a');
    expect(jeton('preuve-ecole')).toBe('#2f5d8a');
    expect(jeton('preuve-vide')).toBe('#6b716c');
    for (const nom of ['preuve-direction', 'preuve-terrain', 'preuve-ecole', 'preuve-vide']) {
      expect(contraste(jeton(nom), jeton('fond'))).toBeGreaterThanOrEqual(4.5);
      expect(contraste(jeton(nom), jeton('fond-releve'))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('le texte sur la preuve de la direction est lisible', () => {
    expect(
      contraste(jeton('preuve-direction-texte'), jeton('preuve-direction')),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe('les couleurs des cycles', () => {
  const cycles = {
    M: ['cycle-maternelle', '#b45309'],
    P: ['cycle-primaire', '#1d6fa5'],
    C: ['cycle-college', '#7c3aed'],
    L: ['cycle-lycee', '#be185d'],
    T: ['cycle-technique', '#475569'],
    S: ['cycle-superieur', '#1e3a8a'],
  } as const;

  it.each(Object.entries(cycles))(
    '%s : sa couleur, et la lettre blanche se lit dessus',
    (_l, c) => {
      const [nom, hex] = c;
      expect(jeton(nom)).toBe(hex);
      expect(contraste(jeton('cycle-lettre'), jeton(nom))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('aucun cycle ne prend le vert de la marque : le vert dit la preuve', () => {
    for (const [nom] of Object.values(cycles)) expect(jeton(nom)).not.toBe(jeton('marque'));
  });
});
