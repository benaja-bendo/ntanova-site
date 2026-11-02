/**
 * Le port de `wrangler dev` pour les parcours et les captures : 4329, ou `PLAYWRIGHT_PORT` pour qu'une autre suite
 * (une autre session, un autre clone) tourne en même temps sur le même Mac sans se disputer le port.
 */
export function portDesParcours(): number {
  const brut = process.env['PLAYWRIGHT_PORT'];
  if (brut === undefined || brut === '') return 4329;
  const port = Number(brut);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`PLAYWRIGHT_PORT doit être un port entre 1024 et 65535 (reçu : « ${brut} »).`);
  }
  return port;
}
