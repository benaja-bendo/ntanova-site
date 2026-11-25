import { describe, expect, it } from 'vitest';
import { lireArrivee } from '../../src/modele/envoi-public';
import { llmsTxt } from '../../src/modele/fichiers-standards';
import {
  adresseDArrivee,
  PAGES_DES_FORMULAIRES,
  porte,
  type Arrivee,
} from '../../src/modele/liens-demandes';
import { entreesDuPlan } from '../../src/modele/plan-du-site';

// Le seul réglage de l'ouverture (refonte, lot 3C) : fermé par défaut, WhatsApp partout ; ouvert, les formulaires. Les deux positions
// sont aussi construites pour de bon (`tests/constructions/`).

const WA = 'https://wa.me/242000000000?text=Bonjour';
const ARRIVEES: Arrivee[] = [
  { vers: 'contact', depuis: 'pied' },
  { vers: 'contact', depuis: 'pour-les-ecoles', sujet: 'ecole' },
  // Lot 5 (25/11) : « raconter une rentrée ».
  { vers: 'contact', depuis: 'outils', sujet: 'outils' },
  { vers: 'annuaire', depuis: 'contact' },
  { vers: 'manque', depuis: 'ecoles' },
  { vers: 'erreur', depuis: 'fiche', ecole: '482913' },
  { vers: 'retrait', depuis: 'confidentialite' },
];

describe('fermé', () => {
  it('chaque porte reste le lien WhatsApp d’aujourd’hui, ou aucune', () => {
    for (const a of ARRIVEES) {
      expect(porte(false, a, WA)).toEqual({ href: WA, parFormulaire: false });
      expect(porte(false, a, null)).toBeNull();
    }
  });
  it('ni plan du site, ni llms.txt', () => {
    const plan = entreesDuPlan([], []).map((e) => e.chemin);
    const llms = llmsTxt('https://ntanova.com', [], []);
    for (const page of PAGES_DES_FORMULAIRES) {
      expect(plan).not.toContain(page);
      expect(llms).not.toContain(page);
    }
  });
});

describe('ouvert', () => {
  it('chaque porte mène à son formulaire, qui comprend d’où l’on vient', () => {
    for (const a of ARRIVEES) {
      const p = porte(true, a, WA);
      expect(p?.parFormulaire).toBe(true);
      const url = new URL(p!.href, 'https://ntanova.com');
      expect(PAGES_DES_FORMULAIRES).toContain(url.pathname);
      const lue = lireArrivee(url.searchParams);
      expect(lue.origine).toBe(a.depuis);
      expect(lue.ecole).toBe(a.ecole ?? null);
      expect(lue.sujet).toBe(a.sujet ?? null);
    }
    expect(adresseDArrivee({ vers: 'erreur', depuis: 'fiche', ecole: '482913' })).toBe(
      '/contribuer/?type=erreur&ecole=482913&depuis=fiche',
    );
  });
  it('une adresse ne porte que des codes : aucun autre paramètre', () => {
    for (const a of ARRIVEES) {
      const noms = [...new URL(adresseDArrivee(a), 'https://x.test').searchParams.keys()];
      for (const n of noms) expect(['type', 'sujet', 'ecole', 'depuis']).toContain(n);
    }
  });
  it('les deux pages entrent dans le plan du site et llms.txt, une fois', () => {
    const plan = entreesDuPlan([], [], true).map((e) => e.chemin);
    const llms = llmsTxt('https://ntanova.com', [], [], true);
    for (const page of PAGES_DES_FORMULAIRES) {
      expect(plan.filter((p) => p === page)).toHaveLength(1);
      expect(llms).toContain(`(https://ntanova.com${page})`);
    }
  });
});
