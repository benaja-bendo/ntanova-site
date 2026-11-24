// Vérifie que la règle ESLint des frontières existe et mord :
// si quelqu'un l'affaiblit, ce test échoue.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

async function interdit(fichier: string, source: string): Promise<boolean> {
  const [resultat] = await eslint.lintText(`import x from '${source}';\nexport default x;\n`, {
    filePath: fichier,
  });
  return (resultat?.messages ?? []).some((m) => m.ruleId === 'no-restricted-imports');
}

// Le premier appel charge toute la configuration d'ESLint : plusieurs secondes sous charge (la suite entière en
// parallèle). Une limite large évite un échec qui n'en est pas un (18/11 : 5,7 s pendant `pnpm verif`).
describe('frontières entre dossiers', { timeout: 30_000 }, () => {
  it('Supabase seulement dans src/infra/', async () => {
    expect(await interdit('src/infra/supabase/client.ts', '@supabase/supabase-js')).toBe(false);
    expect(await interdit('src/app/relais/Envoi.tsx', '@supabase/supabase-js')).toBe(true);
    expect(await interdit('src/app/admin/Liste.tsx', '@supabase/supabase-js')).toBe(true);
    expect(await interdit('src/modele/ecole.ts', '@supabase/supabase-js')).toBe(true);
    expect(await interdit('src/pages/index.astro.ts', '@supabase/supabase-js')).toBe(true);
  });

  it('les écrans passent par src/infra/index.ts, pas par un adaptateur', async () => {
    expect(await interdit('src/app/relais/Envoi.tsx', '../../infra')).toBe(false);
    expect(await interdit('src/app/relais/Envoi.tsx', '../../infra/index')).toBe(false);
    expect(await interdit('src/app/relais/Envoi.tsx', '../../infra/supabase/client')).toBe(true);
  });

  it('le modèle reste pur', async () => {
    expect(await interdit('src/modele/ecole.ts', 'zod')).toBe(false);
    expect(await interdit('src/modele/ecole.ts', 'react')).toBe(true);
    expect(await interdit('src/modele/ecole.ts', '../infra')).toBe(true);
    expect(await interdit('src/modele/ecole.ts', '../ui/jetons.css')).toBe(true);
  });

  it('les composants ne font aucun appel réseau', async () => {
    expect(await interdit('src/ui/Bouton.tsx', '../infra')).toBe(true);
  });

  it('les activités de S’orienter ne lisent que le modèle : ni base, ni réseau, ni React', async () => {
    expect(await interdit('src/app/orienter/activites.ts', '../../modele/orientation')).toBe(false);
    expect(await interdit('src/app/orienter/activites.ts', '../../infra')).toBe(true);
    expect(await interdit('src/app/orienter/activites.ts', '@supabase/supabase-js')).toBe(true);
    expect(await interdit('src/app/orienter/activites.ts', 'react')).toBe(true);
  });

  it("l'espace relais et l'administration ne dépendent pas l'un de l'autre", async () => {
    expect(await interdit('src/app/relais/Envoi.tsx', '../admin/Liste')).toBe(true);
    expect(await interdit('src/app/admin/Liste.tsx', '../relais/Envoi')).toBe(true);
  });
});
