/**
 * Une limite de temps pour une promesse (ticket #74). La file d'envoi n'admet qu'un envoi à la fois : un second appel
 * attend le premier. Si le premier ne finit jamais (une connexion qui ne répond plus, un verrou du navigateur qui ne se
 * libère pas), rien ne repart plus et « Envoyer maintenant » ne fait rien. Passé le délai, on rend la valeur de repli : la
 * suite peut recommencer ; l'envoi resté en l'air, s'il finit un jour, est sans danger (chaque envoi est rejouable :
 * « déjà reçu »).
 */
export async function limiterLeTemps<T, R>(
  promesse: Promise<T>,
  ms: number,
  repli: R,
  surDelai?: () => void,
): Promise<T | R> {
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<R>((resoudre) => {
    minuterie = setTimeout(() => {
      surDelai?.();
      resoudre(repli);
    }, ms);
  });
  try {
    return await Promise.race([promesse, delai]);
  } finally {
    clearTimeout(minuterie);
  }
}
