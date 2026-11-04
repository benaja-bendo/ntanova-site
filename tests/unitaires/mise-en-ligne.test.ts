import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * La mise en ligne de nuit n'envoie la production que sur ordre (ticket #55, décision du fondateur du 02/11/2026) :
 * tant que la variable GitHub `NUIT_VERS_PRODUCTION` ne vaut pas « oui », la nuit met à jour essai seulement.
 * Un lancement à la main garde son sens : `cible` dit où aller.
 *
 * Le test lit la condition de la tâche `production` dans le workflow et l'évalue pour chaque situation :
 * on ne peut pas déclencher une nuit de GitHub pour l'essayer.
 */

const workflow = readFileSync('.github/workflows/mise-en-ligne.yml', 'utf8');

function conditionDeLaProduction(): string {
  const bloc = /\n {2}production:\n[\s\S]*?\n {4}if: >-\n((?: {6}.*\n)+)/.exec(workflow);
  if (!bloc?.[1]) throw new Error('La condition de la tâche `production` est introuvable.');
  return bloc[1]
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter(Boolean)
    .join(' ');
}

interface Situation {
  evenement: 'schedule' | 'workflow_dispatch';
  cible?: 'essai' | 'production' | 'les deux';
  variable?: string;
  reference?: string;
  construction?: string;
  essai?: string;
  controles?: string;
}

/** Évalue la condition comme GitHub : un contexte absent vaut une chaîne vide, `always()` est vrai. */
function production(s: Situation): boolean {
  const expression = conditionDeLaProduction();
  const contexte = {
    github: { event_name: s.evenement, ref: s.reference ?? 'refs/heads/main' },
    inputs: { cible: s.cible ?? '' },
    vars: { NUIT_VERS_PRODUCTION: s.variable ?? '' },
    needs: {
      construction: { result: s.construction ?? 'success' },
      controles: { result: s.controles ?? 'success' },
      essai: { result: s.essai ?? 'success' },
    },
    always: () => true,
  };
  // L'expression est écrite dans notre propre workflow ; ses opérateurs (&&, ||, ==, !=) sont ceux de JavaScript.
  const evaluer = new Function(...Object.keys(contexte), `return (${expression});`) as (
    ...valeurs: unknown[]
  ) => boolean;
  return evaluer(...Object.values(contexte));
}

describe('la mise en ligne de nuit', () => {
  it('ne va pas en production quand la variable n’est pas posée', () => {
    expect(production({ evenement: 'schedule' })).toBe(false);
  });

  it('ne va pas en production quand la variable dit « non »', () => {
    expect(production({ evenement: 'schedule', variable: 'non' })).toBe(false);
  });

  it('ne va pas en production pour toute autre valeur que « oui »', () => {
    expect(production({ evenement: 'schedule', variable: 'Oui ' })).toBe(false);
    expect(production({ evenement: 'schedule', variable: 'true' })).toBe(false);
  });

  it('va en production quand la variable dit « oui »', () => {
    expect(production({ evenement: 'schedule', variable: 'oui' })).toBe(true);
  });

  it('reste soumise aux contrôles, même quand la variable dit « oui »', () => {
    expect(production({ evenement: 'schedule', variable: 'oui', construction: 'failure' })).toBe(
      false,
    );
    expect(production({ evenement: 'schedule', variable: 'oui', essai: 'failure' })).toBe(false);
  });
});

describe('un lancement à la main', () => {
  it('exige tous les contrôles avant production, jamais leur simple réutilisation', () => {
    for (const controles of ['failure', 'cancelled', 'skipped', ''])
      expect(production({ evenement: 'workflow_dispatch', cible: 'production', controles })).toBe(
        false,
      );
  });
  it('va en production quand on le demande, sans dépendre de la variable', () => {
    expect(production({ evenement: 'workflow_dispatch', cible: 'production' })).toBe(true);
    expect(production({ evenement: 'workflow_dispatch', cible: 'les deux' })).toBe(true);
  });

  it('ne va pas en production quand on ne veut que l’essai', () => {
    expect(production({ evenement: 'workflow_dispatch', cible: 'essai' })).toBe(false);
    expect(production({ evenement: 'workflow_dispatch', cible: 'essai', variable: 'oui' })).toBe(
      false,
    );
  });

  it('ne part jamais d’une branche autre que main', () => {
    expect(
      production({
        evenement: 'workflow_dispatch',
        cible: 'production',
        reference: 'refs/heads/une-branche',
      }),
    ).toBe(false);
  });

  it('ne va pas en production quand l’essai a échoué', () => {
    expect(
      production({ evenement: 'workflow_dispatch', cible: 'les deux', essai: 'failure' }),
    ).toBe(false);
  });
});

describe('ce que l’administration promet de la mise en ligne', () => {
  // La nuit ne met à jour qu'essai tant que `NUIT_VERS_PRODUCTION` n'est pas « oui » : « cette nuit à 2 h »,
  // écrit sous un geste de publication, annonçait ntanova.com à une heure que rien ne garantissait (ticket #62, M3).
  // L'administration dit « à la prochaine mise à jour du site », vrai dans les deux cas.
  const ecrans = readdirSync('src/app/admin')
    .filter((nom) => nom.endsWith('.tsx'))
    .map((nom) => ({ nom, texte: readFileSync(`src/app/admin/${nom}`, 'utf8') }));

  it('lit bien les écrans de l’administration', () => {
    expect(ecrans.length).toBeGreaterThan(5);
    expect(ecrans.some((e) => e.texte.includes('prochaine mise à jour du site'))).toBe(true);
  });

  it('ne promet aucune heure ni aucune nuit pour l’arrivée d’un changement sur ntanova.com', () => {
    const promesses = ecrans.flatMap(({ nom, texte }) =>
      texte
        .split('\n')
        .map((ligne, i) => ({ ligne, endroit: `${nom}:${i + 1}` }))
        .filter(({ ligne }) => /cette nuit|chaque nuit|à 2 h|à 2 heures/.test(ligne))
        .map(({ endroit }) => endroit),
    );
    expect(promesses).toEqual([]);
  });
});

describe('la construction réelle ne contourne pas les contrôles', () => {
  const bloc = /\n {2}construction:\n[\s\S]*?\n {4}if: >-\n((?: {6}.*\n)+)/.exec(workflow);
  if (!bloc?.[1]) throw new Error('Condition de construction absente.');
  const expression = bloc[1]
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');
  function construire({
    cible = 'essai',
    evenement = 'workflow_dispatch',
    preuve = 'false',
    verification = 'success',
    controles = 'skipped',
    force = false,
  } = {}) {
    const evaluer = new Function('github', 'inputs', 'needs', 'always', `return (${expression});`);
    return evaluer(
      { event_name: evenement },
      { cible, tout_verifier: force },
      {
        verification: { result: verification, outputs: { reutiliser: preuve } },
        controles: { result: controles },
      },
      () => true,
    );
  }
  it('réutilise seulement pour essai après une preuve valide', () => {
    expect(construire({ preuve: 'true' })).toBe(true);
    expect(construire({ preuve: 'true', cible: 'production' })).toBe(false);
    expect(construire({ preuve: 'true', force: true })).toBe(false);
    expect(construire({ preuve: 'true', evenement: 'schedule' })).toBe(false);
  });
  it('une preuve absente ou défaillante impose des contrôles réussis', () => {
    expect(construire()).toBe(false);
    expect(construire({ controles: 'success' })).toBe(true);
    expect(construire({ preuve: 'true', verification: 'failure' })).toBe(false);
    for (const controles of ['failure', 'cancelled'])
      expect(construire({ preuve: 'true', controles })).toBe(false);
  });
});
