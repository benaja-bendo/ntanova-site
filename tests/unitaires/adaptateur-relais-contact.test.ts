import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { creerPortRelais } from '../../src/infra/supabase/relais';

// L'envoi d'un contact (ticket #96) : le contact d'avant garde exactement l'ancienne forme de l'appel, donc un téléphone
// à jour marche aussi sur une base pas encore à jour ; seules les personnes en plus portent les nouveaux paramètres.

function fausseApi() {
  const appels: { nom: string; arguments: Record<string, unknown> }[] = [];
  const client = {
    rpc: (nom: string, args: Record<string, unknown>) => {
      appels.push({ nom, arguments: args });
      return Promise.resolve({ data: 'recu', error: null });
    },
  };
  return { port: creerPortRelais(() => client as unknown as SupabaseClient), appels };
}

const base = {
  releveId: 'f1',
  fonction: 'directeur' as const,
  nom: '[Nom]',
  whatsapp: '242061234567',
  accord: true,
  accordLe: '2026-11-03T08:00:00.000Z',
  note: null,
};

describe('l’envoi d’un contact', () => {
  it('le contact de la direction part avec les sept paramètres d’avant, rien de plus', async () => {
    const { port, appels } = fausseApi();
    await expect(port.envoyerContact(base)).resolves.toBe('recu');
    expect(appels[0]?.nom).toBe('send_contact');
    expect(Object.keys(appels[0]?.arguments ?? {}).sort()).toEqual(
      [
        'p_agreement',
        'p_agreement_at',
        'p_name',
        'p_note',
        'p_role',
        'p_submission',
        'p_whatsapp',
      ].sort(),
    );
  });

  it('une personne en plus part avec son identifiant, et sa précision quand la fonction est « autre »', async () => {
    const { port, appels } = fausseApi();
    await port.envoyerContact({
      ...base,
      fonction: 'autre',
      contactId: 'p1',
      precisionFonction: 'enseignant',
    });
    expect(appels[0]?.arguments).toMatchObject({
      p_submission: 'f1',
      p_contact: 'p1',
      p_role: 'autre',
      p_role_detail: 'enseignant',
    });
  });

  it('une personne en plus sans précision ne porte que son identifiant', async () => {
    const { port, appels } = fausseApi();
    await port.envoyerContact({ ...base, contactId: 'p2' });
    expect(appels[0]?.arguments).toMatchObject({ p_contact: 'p2' });
    expect(appels[0]?.arguments).not.toHaveProperty('p_role_detail');
  });
});
