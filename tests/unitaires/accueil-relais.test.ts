import { describe, expect, it } from 'vitest';
import { missionsDeLAccueil, semaineDuRelais } from '../../src/modele/accueil-relais';
import type { EcoleACompleter, ReleveRecu } from '../../src/modele/ports';

const releve = (r: Partial<ReleveRecu>): ReleveRecu =>
  ({
    id: 'r',
    type: 'releve',
    nomEnseigne: '[École]',
    prisLe: '2026-11-12T10:00:00Z',
    statut: 'a_valider',
    motif: null,
    messageAuRelais: null,
    ...r,
  }) as ReleveRecu;
const ecole = (e: Partial<EcoleACompleter>): EcoleACompleter =>
  ({ id: 'c', nom: '[Collège]', genre: 'locate', ...e }) as EcoleACompleter;

describe('l’accueil du relais', () => {
  it('les fiches à corriger d’abord, puis les missions, la plus pressée d’abord', () => {
    const m = missionsDeLAccueil(
      [
        releve({
          id: 'a',
          statut: 'a_corriger',
          messageAuRelais: 'La photo de l’enseigne est floue.',
        }),
        releve({ id: 'b', statut: 'a_corriger', motif: null }),
        releve({ id: 'c', statut: 'accepte' }),
      ],
      [
        ecole({ id: 'x', genre: 'locate' }),
        ecole({
          id: 'y',
          genre: 'complete',
          tache: 'Photographier le prospectus des frais.',
          avantLe: '2026-11-10',
          missionId: 'm1',
        }),
      ],
      new Set(['b']),
      '2026-11-13',
    );
    expect(m.map((x) => [x.id, x.etiquette])).toEqual([
      ['a', 'À corriger'],
      ['y', 'En retard · avant le 10 novembre'],
      ['x', 'À situer'],
    ]);
    expect(m[0]?.texte).toBe('NTanova : « La photo de l’enseigne est floue. »');
    expect(m[2]?.texte).toBe('Il manque sa position : y retourner.');
  });

  it('la semaine : reçues depuis 7 jours, acceptées, en attente', () => {
    const maintenant = Date.parse('2026-11-13T12:00:00Z');
    expect(
      semaineDuRelais(
        [
          releve({ prisLe: '2026-11-12T10:00:00Z', statut: 'accepte' }),
          releve({ prisLe: '2026-11-11T10:00:00Z', statut: 'a_valider' }),
          releve({ prisLe: '2026-11-01T10:00:00Z', statut: 'accepte' }),
        ],
        maintenant,
      ),
    ).toEqual({ envoyees: 2, acceptees: 1, enAttente: 1 });
  });
});
