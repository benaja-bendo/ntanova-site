import { describe, expect, it } from 'vitest';
import { traduire } from '../../src/infra/supabase/erreurs';
import { ErreurRejet, ErreurReseau, ErreurSession } from '../../src/modele/ports';

// Ce que la base répond à un envoi, traduit dans les termes de la file d'envoi (ticket #55, PR 2) :
//   - le réseau manque       → la fiche reste en file et repart seule ;
//   - la session est perdue  → le relais se reconnecte, la fiche reste en file ;
//   - la base REFUSE         → la fiche sort de la file avec la raison exacte (rien ne sert de la rejouer) ;
//   - tout le reste          → une panne dont on ne sait rien : elle reste en file, on compte les essais.

function attrape(erreur: Parameters<typeof traduire>[0]): unknown {
  try {
    return traduire(erreur);
  } catch (e) {
    return e;
  }
}

describe('un envoi reçu', () => {
  it('sans erreur : « reçu »', () => {
    expect(traduire(null)).toBe('recu');
  });

  it('un doublon (23505, ou 409 pour une photo) : « déjà reçu », ce n’est pas une erreur', () => {
    expect(traduire({ code: '23505', message: 'duplicate key' })).toBe('deja_recu');
    expect(traduire({ statusCode: '409', message: 'The resource already exists' })).toBe(
      'deja_recu',
    );
  });
});

describe('le réseau manque : la fiche reste en file', () => {
  it('une requête qui n’aboutit pas', () => {
    expect(attrape({ message: 'Failed to fetch' })).toBeInstanceOf(ErreurReseau);
    expect(attrape({ message: 'NetworkError when attempting to fetch resource.' })).toBeInstanceOf(
      ErreurReseau,
    );
    expect(attrape({ message: 'canceling statement due to statement timeout' })).toBeInstanceOf(
      ErreurReseau,
    );
  });
});

describe('la session est perdue : le relais se reconnecte', () => {
  it('un jeton refusé par l’API', () => {
    expect(attrape({ code: 'PGRST301', message: 'JWT expired' })).toBeInstanceOf(ErreurSession);
    expect(attrape({ code: 'PGRST303', message: 'JWT issued at future' })).toBeInstanceOf(
      ErreurSession,
    );
    expect(attrape({ status: 401, message: 'Unauthorized' })).toBeInstanceOf(ErreurSession);
  });

  it('un refus du stockage qui parle du jeton', () => {
    expect(attrape({ statusCode: '401', message: 'Unauthorized' })).toBeInstanceOf(ErreurSession);
    expect(attrape({ statusCode: '403', message: 'jwt expired' })).toBeInstanceOf(ErreurSession);
  });
});

describe('la base refuse : la fiche sort de la file avec la raison', () => {
  it('un compte relais inactif (42501) : le message écrit par la base est gardé tel quel', () => {
    const e = attrape({ code: '42501', message: 'Compte relais inactif.' });
    expect(e).toBeInstanceOf(ErreurRejet);
    expect(e).toMatchObject({ code: '42501', message: 'Compte relais inactif.' });
  });

  it('une règle de la base non respectée (22xxx, 23xxx, P0001, P0002)', () => {
    for (const code of ['22023', '22P02', '23514', '23502', '23503', 'P0001', 'P0002']) {
      const e = attrape({ code, message: `refus ${code}` });
      expect(e, code).toBeInstanceOf(ErreurRejet);
      expect(e, code).toMatchObject({ code, message: `refus ${code}` });
    }
  });

  it('un refus de droits du stockage qui ne parle pas du jeton : c’est un refus, pas une session perdue', () => {
    const e = attrape({
      statusCode: '403',
      message: 'new row violates row-level security policy',
    });
    expect(e).toBeInstanceOf(ErreurRejet);
    expect(e).toMatchObject({ code: '403' });
  });

  it('ne garde que le message, jamais le détail de la ligne refusée (qui peut porter des données)', () => {
    const e = attrape({
      code: '23514',
      message: 'new row violates check constraint "x"',
      details: 'Failing row contains ([Nom], 06 123 45 67).',
    } as Parameters<typeof traduire>[0]);
    expect(String((e as Error).message)).not.toContain('06 123');
  });
});

describe('une panne dont on ne sait rien : la fiche reste en file', () => {
  it('une erreur serveur ou inconnue n’est ni un refus, ni le réseau, ni la session', () => {
    for (const erreur of [
      { status: 503, message: 'Service Unavailable' },
      { code: '53300', message: 'too many connections for role' },
      { code: 'XX000', message: 'internal error' },
      { message: 'boom' },
    ]) {
      const e = attrape(erreur);
      expect(e, JSON.stringify(erreur)).toBeInstanceOf(Error);
      expect(e).not.toBeInstanceOf(ErreurRejet);
      expect(e).not.toBeInstanceOf(ErreurReseau);
      expect(e).not.toBeInstanceOf(ErreurSession);
    }
  });
});
