/**
 * La navigation par le dièse (#lot, #valider/<id>…) : une seule page par
 * application, qui reste la seule à mettre en cache et survit à un rechargement.
 */
import { useSyncExternalStore } from 'react';

function abonnerAdresse(rappel: () => void) {
  addEventListener('hashchange', rappel);
  return () => removeEventListener('hashchange', rappel);
}

export function useAdresse(): string[] {
  const diese = useSyncExternalStore(abonnerAdresse, () => location.hash);
  return diese.replace(/^#\/?/, '').split('/').filter(Boolean);
}

export function aller(chemin: string, remplacer = false): void {
  const cible = `#${chemin}`;
  if (remplacer) history.replaceState(null, '', cible);
  else history.pushState(null, '', cible);
  dispatchEvent(new HashChangeEvent('hashchange'));
}
