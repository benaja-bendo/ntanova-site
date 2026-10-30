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

describe('frontières entre dossiers', () => {
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

  it("l'espace relais et l'administration ne dépendent pas l'un de l'autre", async () => {
    expect(await interdit('src/app/relais/Envoi.tsx', '../admin/Liste')).toBe(true);
    expect(await interdit('src/app/admin/Liste.tsx', '../relais/Envoi')).toBe(true);
  });
});
