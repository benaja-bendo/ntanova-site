import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * La sauvegarde de nuit (ticket #81) : une copie chiffrée de la base et des photos, hors de Supabase. On ne peut pas
 * déclencher une nuit de GitHub pour l'essayer : le test lit le workflow et le script, et refuse ce qui rendrait la
 * sauvegarde inutile (ne jamais tourner, partir en clair) ou dangereuse (un secret dans le dépôt).
 */

const workflow = readFileSync('.github/workflows/sauvegarde.yml', 'utf8');
const script = readFileSync('outils/sauvegarder-la-base.sh', 'utf8');

describe('le workflow de sauvegarde', () => {
  it('tourne chaque nuit et à la main, jamais sur une pull request ni une poussée', () => {
    expect(workflow).toMatch(/\n {2}schedule:\n(?: {4}#.*\n)* {4}- cron: '/);
    expect(workflow).toMatch(/\n {2}workflow_dispatch:/);
    // Une pull request venue d'ailleurs ne doit jamais approcher les secrets.
    expect(workflow).not.toMatch(/\n {2}pull_request/);
    expect(workflow).not.toMatch(/\n {2}push:/);
  });

  it('ne demande que la lecture du dépôt', () => {
    expect(workflow).toMatch(/permissions:\n {2}contents: read\n/);
    expect(workflow).not.toMatch(/contents: write|id-token|pull-requests: write/);
  });

  it('lit la base avec un client PostgreSQL 17 (la version du serveur)', () => {
    expect(workflow).toMatch(/postgresql-client-17/);
    expect(workflow).toMatch(/PG_DUMP: \/usr\/lib\/postgresql\/17\/bin\/pg_dump/);
  });

  it('ne reçoit ses secrets que par `secrets.*`, au nombre de quatre', () => {
    const noms = [...workflow.matchAll(/\$\{\{ secrets\.([A-Z_]+) \}\}/g)].map((m) => m[1]);
    expect(noms.sort()).toEqual([
      'SAUVEGARDE_CLE_PUBLIQUE',
      'SAUVEGARDE_DB_URL',
      'SUPABASE_SECRET_KEY',
      'SUPABASE_URL',
    ]);
  });

  it('ne laisse aucune valeur secrète dans le dépôt', () => {
    for (const texte of [workflow, script]) {
      // Une chaîne de connexion, une clé secrète, une clé publique ou privée `age`, un jeton.
      expect(texte).not.toMatch(/postgres(ql)?:\/\/[^\s$"'{]+:[^\s$"'{]+@/);
      expect(texte).not.toMatch(/sb_secret_[A-Za-z0-9_-]{8,}/);
      expect(texte).not.toMatch(/age1[0-9a-z]{50,}/);
      expect(texte).not.toMatch(/AGE-SECRET-KEY-/);
      expect(texte).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
    }
  });

  it('ne dépose que le fichier chiffré, 30 jours, et échoue s’il n’y en a pas', () => {
    const depot = /actions\/upload-artifact@[^\n]*\n {8}with:\n([\s\S]*?)(?:\n {6}- |\s*$)/.exec(
      workflow,
    );
    expect(depot?.[1]).toBeDefined();
    expect(depot?.[1]).toMatch(/path: sauvegardes\/\*\.age\n/);
    expect(depot?.[1]).not.toMatch(/\.sql|\.tar\.gz\n|photos/);
    const jours = Number(/retention-days: (\d+)/.exec(depot?.[1] ?? '')?.[1]);
    expect(jours).toBeGreaterThanOrEqual(1);
    expect(jours).toBeLessThanOrEqual(90);
    expect(depot?.[1]).toMatch(/if-no-files-found: error/);
  });
});

describe('le script de sauvegarde', () => {
  it('s’arrête à la première erreur, et sans secret manquant', () => {
    expect(script).toMatch(/set -euo pipefail/);
    for (const nom of [
      'SAUVEGARDE_DB_URL',
      'SUPABASE_URL',
      'SUPABASE_SECRET_KEY',
      'SAUVEGARDE_CLE_PUBLIQUE',
    ]) {
      expect(script).toContain(`: "\${${nom}:?`);
    }
  });

  it('refuse un dump vide ou sans les tables attendues', () => {
    expect(script).toMatch(/TAILLE_MINIMALE:-\d+/);
    expect(script).toMatch(/la sauvegarde est refusée/);
    for (const table of ['field_submissions', 'campuses', 'admins']) {
      expect(script).toContain(`"${table}"`);
    }
  });

  it('ne copie les photos qu’avec une clé secrète en `apikey`, sans jamais la mettre dans une adresse', () => {
    expect(script).toMatch(/-H "apikey: \$SUPABASE_SECRET_KEY"/);
    expect(script).not.toMatch(/\?apikey=|\?token=/);
  });

  it('chiffre avant d’écrire : le seul fichier de sortie est un .age', () => {
    expect(script).toMatch(/\| age -r "\$SAUVEGARDE_CLE_PUBLIQUE" -o "\$fichier"/);
    expect(script).toMatch(/fichier="\$sortie\/sauvegarde-[^"]*\.tar\.gz\.age"/);
    // Le clair vit dans un dossier temporaire, effacé à la sortie.
    expect(script).toMatch(/trap 'rm -rf "\$travail"' EXIT/);
  });
});
