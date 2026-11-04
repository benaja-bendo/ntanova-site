import { describe, expect, it } from 'vitest';
import {
  creerPreuve,
  reutilisationPermise,
  preuveValide,
  executionCandidate,
  attendreVerification,
  idsDesParcours,
  verifierPartition,
} from '../../outils/verification-ci';
const sha = 'a'.repeat(40),
  repo = 'benaja-bendo/ntanova-site';
const run = {
  id: 12,
  run_attempt: 1,
  head_sha: sha,
  head_repository: { full_name: repo },
  path: '.github/workflows/verif.yml',
  event: 'pull_request',
  status: 'completed',
  conclusion: 'success',
};
const contexte = { sha, repo, executionCourante: 99 };
const date = new Date('2026-11-04T12:00:00Z');
const preuve = () =>
  creerPreuve({
    sha,
    checkoutSha: sha,
    repo,
    runId: 12,
    attempt: 1,
    resultats: { verif: 'success', parcours: 'success', base: 'success' },
    date,
  });
describe('une réutilisation exige les contrôles complets du code exact', () => {
  it('accepte une preuve complète et récente du même commit', () =>
    expect(preuveValide(preuve(), run, contexte, date.getTime())).toBe(true));
  it.each(['verif', 'parcours', 'base'] as const)(
    'un contrôle %s absent ou non réussi interdit une attestation',
    (nom) => {
      for (const etat of ['failure', 'cancelled', 'skipped', ''])
        expect(() =>
          creerPreuve({
            sha,
            checkoutSha: sha,
            repo,
            runId: 12,
            attempt: 1,
            resultats: { verif: 'success', parcours: 'success', base: 'success', [nom]: etat },
            date,
          }),
        ).toThrow();
    },
  );
  it('ne confond pas le commit de branche et une autre construction', () => {
    expect(() =>
      creerPreuve({
        sha,
        checkoutSha: 'b'.repeat(40),
        repo,
        runId: 12,
        attempt: 1,
        resultats: { verif: 'success', parcours: 'success', base: 'success' },
        date,
      }),
    ).toThrow();
  });
  it('refuse toute preuve absente, incomplète ou d’un autre périmètre', () => {
    for (const p of [
      null,
      {},
      { ...preuve(), sha: 'b'.repeat(40) },
      { ...preuve(), scope: 'partiel' },
      { ...preuve(), partitions: 1 },
      { ...preuve(), repository: 'autre/depot' },
      { ...preuve(), run_id: 13 },
      { ...preuve(), run_attempt: 2 },
      { ...preuve(), resultats: { verif: 'success', parcours: 'skipped', base: 'success' } },
    ])
      expect(preuveValide(p, run, contexte, date.getTime())).toBe(false);
  });
  it('refuse une preuve périmée ou datée dans le futur', () => {
    expect(preuveValide(preuve(), run, contexte, date.getTime() + 25 * 3600000)).toBe(false);
    expect(
      preuveValide({ ...preuve(), created_at: '2999-01-01' }, run, contexte, date.getTime()),
    ).toBe(false);
  });
  it('ignore autre commit, fork, workflow étranger et le workflow courant', () => {
    for (const r of [
      { ...run, head_sha: 'b'.repeat(40) },
      { ...run, head_repository: { full_name: 'fork/site' } },
      { ...run, path: '.github/workflows/autre.yml' },
      { ...run, id: 99 },
    ])
      expect(executionCandidate([r], contexte)).toBeUndefined();
  });
  it('ne revient pas à un ancien succès quand une vérification plus récente a échoué', () => {
    const recent = { ...run, id: 13, conclusion: 'failure' };
    expect(executionCandidate([run, recent], contexte)).toEqual(recent);
  });
  it('ne réutilise jamais un contrôle incomplet ou échoué même avec une preuve', () => {
    for (const r of [
      { ...run, status: 'in_progress' },
      { ...run, conclusion: 'failure' },
      { ...run, head_sha: 'b'.repeat(40) },
    ])
      expect(preuveValide(preuve(), r, contexte, date.getTime())).toBe(false);
  });
  it('revient à une vérification complète quand l’attente expire', async () => {
    expect(
      await attendreVerification(contexte, {
        lister: async () => [{ ...run, status: 'in_progress' }],
        charger: async () => preuve(),
        pause: async () => {},
        maintenant: () => date.getTime(),
        delai: 0,
      }),
    ).toEqual({ reutiliser: false });
  });
  it('attend un contrôle déjà lancé sans en lancer un deuxième', async () => {
    let lectures = 0,
      pauses = 0;
    const r = await attendreVerification(contexte, {
      lister: async () => [{ ...run, status: ++lectures === 1 ? 'in_progress' : 'completed' }],
      charger: async () => preuve(),
      pause: async () => {
        pauses++;
      },
      maintenant: () => date.getTime(),
      delai: 1000,
    });
    expect(r).toEqual({ reutiliser: true, execution: 12 });
    expect(pauses).toBe(1);
  });
  it('revient aux contrôles complets quand la preuve est absente ou le contrôle échoue', async () => {
    for (const r of [run, { ...run, conclusion: 'failure' }])
      expect(
        await attendreVerification(contexte, {
          lister: async () => [r],
          charger: async () => null,
          pause: async () => {},
          maintenant: () => date.getTime(),
          delai: 0,
        }),
      ).toEqual({ reutiliser: false });
  });
});
it('les partitions doivent couvrir toute la suite une seule fois', () => {
  const total = ['a', 'b', 'c'];
  expect(() => verifierPartition(total, [['a'], ['b', 'c']])).not.toThrow();
  for (const morceaux of [
    [['a'], ['b']],
    [
      ['a', 'b'],
      ['b', 'c'],
    ],
    [[], total],
  ])
    expect(() => verifierPartition(total, morceaux)).toThrow();
  expect(
    idsDesParcours({
      suites: [{ specs: [{ id: 'a', tests: [{ projectName: 'android' }] }], suites: [] }],
    }),
  ).toEqual(['android:a']);
});

it('seul essai manuel autorise la réutilisation, avec possibilité de tout revérifier', () => {
  expect(reutilisationPermise('workflow_dispatch', 'essai')).toBe(true);
  for (const cible of ['production', 'les deux', ''])
    expect(reutilisationPermise('workflow_dispatch', cible)).toBe(false);
  expect(reutilisationPermise('schedule', 'essai')).toBe(false);
  expect(reutilisationPermise('workflow_dispatch', 'essai', true)).toBe(false);
});
