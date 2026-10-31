/** Le journal des erreurs de l'application, envoyé avec les fiches. Aucune donnée personnelle. */
import { base } from './base-locale';

declare const __VERSION_APP__: string;

export const versionApp = typeof __VERSION_APP__ === 'string' ? __VERSION_APP__ : 'dev';

export async function journaliser(ecran: string, code: string, erreur?: unknown): Promise<void> {
  const detail =
    erreur instanceof Error ? `${erreur.name} : ${erreur.message}` : erreur ? String(erreur) : null;
  try {
    await base.erreurs.add({
      id: crypto.randomUUID(),
      survenueLe: new Date().toISOString(),
      ecran,
      code,
      detail: detail?.slice(0, 500) ?? null,
      versionApp,
      appareil: navigator.userAgent.slice(0, 200),
    });
  } catch {
    // Le journal ne doit jamais faire échouer l'application.
  }
}
