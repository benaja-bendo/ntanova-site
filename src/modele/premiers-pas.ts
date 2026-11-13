/**
 * Les premiers pas du relais (ticket #79) : tester son téléphone AVANT sa première fiche. Un relais ne découvrait une
 * position refusée ou une photo qui ne part pas que devant l'école, souvent sans réseau. Ici, une phrase par test : ce
 * qui marche, et ce qu'il doit régler. Rien n'est jamais envoyé : ni photo, ni position.
 */
import { nomDuNavigateur, type Environnement } from './aide-position';
import { PRECISION_SUFFISANTE_M, type ErreurPosition } from './geo';

export interface Verdict {
  bon: boolean;
  phrase: string;
}

export interface ResultatsTests {
  position?: { ok: true; precisionM: number } | { ok: false; erreur: ErreurPosition };
  photo?: { ok: boolean; octets: number };
  connexion?: { enLigne: boolean; repond: boolean };
}

const ko = (octets: number) => Math.round(octets / 1000);

export function verdictPosition(precisionM: number): Verdict {
  const m = Math.round(precisionM);
  if (precisionM <= PRECISION_SUFFISANTE_M) {
    return { bon: true, phrase: `La position est prise, à ${m} m près.` };
  }
  return {
    bon: false,
    phrase: `La position est prise, mais à ${m} m près seulement : devant l’entrée, dehors, elle sera plus fine.`,
  };
}

export function verdictPhoto(r: { octets: number; relue: boolean }): Verdict {
  if (r.relue) {
    return {
      bon: true,
      phrase: `La photo est lisible (${ko(r.octets)} Ko) : elle se relit comme il faut. Rien n’est envoyé.`,
    };
  }
  return {
    bon: false,
    phrase:
      'La photo ne se relit pas une fois rangée dans le téléphone. Écrivez à NTanova avant de commencer une fiche : elle partirait sans sa photo.',
  };
}

export function verdictConnexion(r: { enLigne: boolean; repond: boolean }): Verdict {
  if (r.repond) return { bon: true, phrase: 'NTanova répond.' };
  if (!r.enLigne) {
    return {
      bon: false,
      phrase:
        'Le téléphone n’a pas de réseau pour le moment. Ce n’est pas grave : vous pouvez relever, les fiches partiront plus tard.',
    };
  }
  return {
    bon: false,
    phrase: 'Le téléphone a du réseau, mais NTanova ne répond pas. Réessayez dans un instant.',
  };
}

const LIBELLE_ERREUR: Record<ErreurPosition, string> = {
  refusee: 'refusée',
  indisponible: 'indisponible',
  trop_longue: 'trop longue',
  absente: 'absente',
};

/** Une ligne pour le journal : ce que chaque test a dit, sans rien de personnel. */
export function resumeDesTests(t: ResultatsTests, installee: boolean): string {
  const position = !t.position
    ? 'non testée'
    : t.position.ok
      ? `ok (${Math.round(t.position.precisionM)} m)`
      : LIBELLE_ERREUR[t.position.erreur];
  const photo = !t.photo
    ? 'non testée'
    : t.photo.ok
      ? `lisible (${ko(t.photo.octets)} Ko)`
      : 'ne se relit pas';
  const connexion = !t.connexion
    ? 'non testée'
    : t.connexion.repond
      ? 'ok'
      : t.connexion.enLigne
        ? 'NTanova ne répond pas'
        : 'hors ligne';
  return `position : ${position} ; photo : ${photo} ; connexion : ${connexion} ; écran d’accueil : ${installee ? 'oui' : 'non'}`;
}

/** Le message à NTanova : le téléphone, et ce qui ne marche pas. Rien de personnel. */
export function messageDeSupportPremiersPas(env: Environnement, t: ResultatsTests): string {
  const problemes: string[] = [];
  if (t.position && !t.position.ok) {
    problemes.push(`la position (${LIBELLE_ERREUR[t.position.erreur]})`);
  }
  if (t.photo && !t.photo.ok) problemes.push('la photo (elle ne se relit pas une fois rangée)');
  if (t.connexion && t.connexion.enLigne && !t.connexion.repond) {
    problemes.push('la connexion à NTanova');
  }
  const sur = `${env.appareil} (${nomDuNavigateur(env)})`;
  return problemes.length > 0
    ? `Bonjour, j’ai testé mon téléphone, ${sur} : ça ne marche pas pour ${problemes.join(', ')}.`
    : `Bonjour, j’ai testé mon téléphone, ${sur} : tout marche.`;
}

export function testsTermines(t: ResultatsTests): boolean {
  return t.position !== undefined && t.photo !== undefined && t.connexion !== undefined;
}

export interface BilanDesTests {
  titre: string;
  echec: boolean;
  lignes: { libelle: 'Position' | 'Photo' | 'Réseau'; etat: 'bon' | 'mauvais' | 'non_teste' }[];
}

/**
 * Lot H, « Compte › Mon téléphone est prêt » : les trois tests sur une ligne. Le titre dit le premier test qui a échoué ;
 * sans test, il invite à tester. `null` : jamais testé sur ce téléphone.
 */
export function bilanDesTests(t: ResultatsTests | null): BilanDesTests {
  const position = !t?.position
    ? 'non_teste'
    : t.position.ok && verdictPosition(t.position.precisionM).bon
      ? 'bon'
      : 'mauvais';
  const photo = !t?.photo
    ? 'non_teste'
    : verdictPhoto({ octets: t.photo.octets, relue: t.photo.ok }).bon
      ? 'bon'
      : 'mauvais';
  const reseau = !t?.connexion
    ? 'non_teste'
    : verdictConnexion(t.connexion).bon
      ? 'bon'
      : 'mauvais';
  const lignes: BilanDesTests['lignes'] = [
    { libelle: 'Position', etat: position },
    { libelle: 'Photo', etat: photo },
    { libelle: 'Réseau', etat: reseau },
  ];
  const rate = lignes.find((l) => l.etat === 'mauvais');
  if (rate) {
    const quoi = { Position: 'La position', Photo: 'La photo', Réseau: 'Le réseau' }[rate.libelle];
    return { titre: `${quoi} ne marche pas`, echec: true, lignes };
  }
  if (lignes.every((l) => l.etat === 'bon'))
    return { titre: 'Mon téléphone est prêt', echec: false, lignes };
  return { titre: 'Mon téléphone n’est pas encore testé', echec: false, lignes };
}
