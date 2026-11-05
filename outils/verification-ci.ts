/** Preuve de vérification complète pour essai. Une absence/erreur impose les contrôles complets. */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

interface Contexte {
  sha: string;
  repo: string;
  executionCourante: number;
}
interface Execution {
  id: number;
  run_attempt: number;
  head_sha: string;
  head_repository: { full_name: string } | null;
  path: string;
  event: string;
  status: string;
  conclusion: string | null;
}
type Resultats = { verif: string; parcours: string; base: string };
const complet = (r: Resultats) =>
  r.verif === 'success' && r.parcours === 'success' && r.base === 'success';
const objet = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export function creerPreuve({
  sha,
  checkoutSha,
  repo,
  runId,
  attempt,
  resultats,
  date = new Date(),
}: {
  sha: string;
  checkoutSha: string;
  repo: string;
  runId: number;
  attempt: number;
  resultats: Resultats;
  date?: Date;
}) {
  if (
    !/^[a-f0-9]{40}$/.test(sha) ||
    sha !== checkoutSha ||
    !complet(resultats) ||
    !repo ||
    !Number.isSafeInteger(runId) ||
    runId <= 0 ||
    !Number.isSafeInteger(attempt) ||
    attempt <= 0
  )
    throw new Error('Vérification complète non attestable.');
  return {
    version: 1,
    scope: 'complet',
    sha,
    repository: repo,
    run_id: runId,
    run_attempt: attempt,
    partitions: 2,
    resultats,
    created_at: date.toISOString(),
  };
}
export function preuveValide(
  p: unknown,
  r: Execution,
  c: Contexte,
  maintenant = Date.now(),
): boolean {
  if (
    !objet(p) ||
    !objet(p.resultats) ||
    r.status !== 'completed' ||
    r.conclusion !== 'success' ||
    executionCandidate([r], c) !== r
  )
    return false;
  const age = maintenant - Date.parse(String(p.created_at));
  return (
    p.version === 1 &&
    p.scope === 'complet' &&
    p.sha === c.sha &&
    p.repository === c.repo &&
    p.run_id === r.id &&
    p.run_attempt === r.run_attempt &&
    p.partitions === 2 &&
    complet({
      verif: String(p.resultats.verif),
      parcours: String(p.resultats.parcours),
      base: String(p.resultats.base),
    }) &&
    Number.isFinite(age) &&
    age >= -60000 &&
    age <= 24 * 3600000
  );
}
export function executionCandidate(runs: Execution[], c: Contexte): Execution | undefined {
  return runs
    .filter(
      (r) =>
        r.id !== c.executionCourante &&
        r.head_sha === c.sha &&
        r.head_repository?.full_name === c.repo &&
        ['.github/workflows/verif.yml', '.github/workflows/mise-en-ligne.yml'].includes(r.path) &&
        ['pull_request', 'push', 'workflow_dispatch', 'schedule'].includes(r.event),
    )
    .sort((a, b) => b.id - a.id)[0];
}
interface Acces {
  lister: () => Promise<Execution[]>;
  charger: (r: Execution) => Promise<unknown>;
  pause: () => Promise<void>;
  maintenant: () => number;
  delai: number;
}
export async function attendreVerification(
  c: Contexte,
  a: Acces,
): Promise<{ reutiliser: false } | { reutiliser: true; execution: number }> {
  const fin = a.maintenant() + a.delai;
  for (;;) {
    const r = executionCandidate(await a.lister(), c);
    if (!r) return { reutiliser: false };
    if (r.status === 'completed')
      return r.conclusion === 'success' && preuveValide(await a.charger(r), r, c, a.maintenant())
        ? { reutiliser: true, execution: r.id }
        : { reutiliser: false };
    if (a.maintenant() >= fin) return { reutiliser: false };
    await a.pause();
  }
}
interface Suite {
  specs?: { id: string; tests: { projectName: string }[] }[];
  suites?: Suite[];
}
export function idsDesParcours(rapport: { suites?: Suite[] }): string[] {
  const ids: string[] = [];
  const lire = (s: Suite) => {
    for (const p of s.specs ?? []) for (const t of p.tests) ids.push(`${t.projectName}:${p.id}`);
    for (const enfant of s.suites ?? []) lire(enfant);
  };
  for (const s of rapport.suites ?? []) lire(s);
  return ids.sort();
}
export function verifierPartition(total: string[], lots: string[][]): void {
  const union = lots.flat();
  if (
    !total.length ||
    lots.some((l) => !l.length) ||
    new Set(union).size !== union.length ||
    [...union].sort().join('\n') !== [...total].sort().join('\n')
  )
    throw new Error('Les partitions ne couvrent pas exactement tous les parcours.');
}
const gh = (args: string[]) =>
  execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
const api = <T>(chemin: string): T => JSON.parse(gh(['api', chemin])) as T;
function sortie(r: { reutiliser: boolean; execution?: number }) {
  const lignes = `reutiliser=${r.reutiliser}\nexecution=${r.execution ?? ''}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lignes);
  console.log(
    r.reutiliser
      ? `Vérification complète réutilisée : ${r.execution}.`
      : 'Contrôles complets requis.',
  );
}
export const reutilisationPermise = (evenement: string, cible: string, forcer = false): boolean =>
  evenement === 'workflow_dispatch' && cible === 'essai' && !forcer;
async function reutiliser() {
  // La production et la nuit vérifient toujours tout, même s'il existe une preuve antérieure.
  if (
    !reutilisationPermise(
      process.env.EVENEMENT ?? '',
      process.env.CIBLE ?? '',
      process.env.TOUT_VERIFIER === 'true',
    )
  ) {
    sortie({ reutiliser: false });
    return;
  }
  const c = {
    sha: process.env.GITHUB_SHA ?? '',
    repo: process.env.GITHUB_REPOSITORY ?? '',
    executionCourante: Number(process.env.GITHUB_RUN_ID),
  };
  if (
    !/^[a-f0-9]{40}$/.test(c.sha) ||
    !/^[-\w.]+\/[-\w.]+$/.test(c.repo) ||
    !Number.isSafeInteger(c.executionCourante)
  )
    throw new Error('Contexte GitHub invalide.');
  try {
    const r = await attendreVerification(c, {
      lister: async () =>
        api<{ workflow_runs: Execution[] }>(
          `repos/${c.repo}/actions/runs?head_sha=${c.sha}&per_page=100`,
        ).workflow_runs,
      charger: async (r) => {
        const artifacts = api<{
          artifacts: { name: string; expired: boolean; size_in_bytes: number }[];
        }>(`repos/${c.repo}/actions/runs/${r.id}/artifacts?per_page=100`).artifacts;
        if (
          !artifacts.some(
            (a) => a.name === 'verification-complete' && !a.expired && a.size_in_bytes <= 65536,
          )
        )
          return null;
        const dossier = mkdtempSync(join(tmpdir(), 'ntanova-ci-'));
        try {
          gh([
            'run',
            'download',
            String(r.id),
            '--repo',
            c.repo,
            '--name',
            'verification-complete',
            '--dir',
            dossier,
          ]);
          return JSON.parse(readFileSync(join(dossier, 'verification.json'), 'utf8')) as unknown;
        } finally {
          rmSync(dossier, { recursive: true, force: true });
        }
      },
      pause: async () => {
        console.log('Vérification de ce commit déjà en cours ; attente sans doublon.');
        await new Promise((r) => setTimeout(r, 30000));
      },
      maintenant: () => Date.now(),
      delai: 12 * 60 * 1000,
    });
    sortie(r);
  } catch {
    console.log('Preuve indisponible : retour à la vérification complète.');
    sortie({ reutiliser: false });
  }
}
function attester() {
  const preuve = creerPreuve({
    sha: process.env.REFERENCE_VERIF ?? '',
    checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    repo: process.env.GITHUB_REPOSITORY ?? '',
    runId: Number(process.env.GITHUB_RUN_ID),
    attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    resultats: {
      verif: process.env.RESULTAT_VERIF ?? '',
      parcours: process.env.RESULTAT_PARCOURS ?? '',
      base: process.env.RESULTAT_BASE ?? '',
    },
  });
  writeFileSync('verification.json', JSON.stringify(preuve, null, 2) + '\n');
  console.log('Tous les contrôles ont réussi pour le commit exact.');
}
function partitions() {
  const liste = (shard?: string) =>
    idsDesParcours(
      JSON.parse(
        execFileSync(
          'pnpm',
          [
            'exec',
            'playwright',
            'test',
            '--list',
            '--reporter=json',
            ...(shard ? ['--shard', shard] : []),
          ],
          { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
        ),
      ) as { suites: Suite[] },
    );
  const total = liste(),
    lots = [liste('1/2'), liste('2/2')];
  verifierPartition(total, lots);
  console.log(
    `${total.length} parcours déclarés, répartis sans perte ni doublon : ${lots.map((l) => l.length).join(' + ')}.`,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const commande = process.argv[2];
  if (commande === 'reutiliser') await reutiliser();
  else if (commande === 'attester') attester();
  else if (commande === 'partitions') partitions();
  else throw new Error('Commande attendue : reutiliser, attester ou partitions.');
}
