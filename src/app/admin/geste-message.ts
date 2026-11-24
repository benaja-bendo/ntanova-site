/**
 * Un geste sur un message : ce qu'on dit quand il n'aboutit pas. Trois cas qui ne se confondent pas :
 * - la base a refusé : le geste n'est PAS enregistré, et elle dit pourquoi ;
 * - le message a changé entre-temps : rien n'est écrasé, il faut le relire ;
 * - pas de réponse : on ne sait pas. Réessayer ne l'écrit jamais deux fois, la version lue le garde.
 */
import { useCallback, useState } from 'react';
import {
  ErreurAcces,
  ErreurConflit,
  ErreurDecision,
  ErreurIntrouvable,
  ErreurSession,
} from '../../modele/ports';

export type GenreEchec = 'refus' | 'conflit' | 'inconnu' | 'introuvable' | 'acces' | 'session';

export interface Echec {
  genre: GenreEchec;
  titre: string;
  texte: string;
}

export function lireEchec(e: unknown): Echec {
  if (e instanceof ErreurConflit) {
    return {
      genre: 'conflit',
      titre: 'Ce message a changé entre-temps.',
      texte:
        'Rien n’est écrasé et ta saisie est gardée. Relis le message, puis recommence si c’est utile.',
    };
  }
  if (e instanceof ErreurIntrouvable) {
    return { genre: 'introuvable', titre: 'Ce geste n’est pas enregistré.', texte: e.message };
  }
  if (e instanceof ErreurDecision) {
    return { genre: 'refus', titre: 'Ce geste n’est pas enregistré.', texte: e.message };
  }
  if (e instanceof ErreurAcces) {
    return {
      genre: 'acces',
      titre: 'Ce geste n’est pas enregistré.',
      texte: 'Ce compte n’est pas, ou plus, administrateur.',
    };
  }
  if (e instanceof ErreurSession) {
    return {
      genre: 'session',
      titre: 'Ce geste n’est pas enregistré.',
      texte:
        'Ta session est terminée. Reconnecte-toi dans un autre onglet, puis réessaie : ta saisie reste ici.',
    };
  }
  return {
    genre: 'inconnu',
    titre: 'Ce geste n’est pas confirmé.',
    texte: 'Réseau ou serveur. Ta saisie est gardée ; réessayer ne l’écrit jamais deux fois.',
  };
}

/**
 * Le geste en cours d'un écran, un à la fois. `reussi` reçoit ce que la base a rendu ; `quel` dit quel geste a échoué, pour que
 * l'écran montre l'échec là où l'on agissait.
 */
export function useGeste() {
  const [enCours, setEnCours] = useState<string | null>(null);
  const [echec, setEchec] = useState<(Echec & { quel: string }) | null>(null);
  const faire = useCallback(
    async <T>(
      quel: string,
      action: () => Promise<T>,
      reussi: (rendu: T) => void | Promise<void>,
    ) => {
      setEnCours(quel);
      setEchec(null);
      try {
        const rendu = await action();
        await reussi(rendu);
      } catch (e) {
        setEchec({ ...lireEchec(e), quel });
      } finally {
        setEnCours(null);
      }
    },
    [],
  );
  const oublier = useCallback(() => setEchec(null), []);
  return { enCours, echec, faire, oublier };
}
export type Geste = ReturnType<typeof useGeste>;
