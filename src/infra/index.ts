/**
 * Le seul point d'entrée de src/infra/ pour les écrans : il branche les ports
 * sur Supabase, ou sur le faux serveur des parcours Playwright
 * (`PUBLIC_ADAPTATEUR=faux` à la construction).
 */
import { PUBLIC_ADAPTATEUR } from 'astro:env/client';
import type { PortRelais, PortSession } from '../modele/ports';

export interface Adaptateurs {
  nom: 'supabase' | 'faux';
  session: PortSession;
  relais: PortRelais;
}

let adaptateurs: Promise<Adaptateurs> | null = null;

/** Chargés à la demande : la page n'emporte le client Supabase que si elle s'en sert. */
export function obtenirAdaptateurs(): Promise<Adaptateurs> {
  adaptateurs ??=
    PUBLIC_ADAPTATEUR === 'faux'
      ? import('./faux/index').then((m) => m.faux)
      : Promise.all([import('./supabase/session'), import('./supabase/relais')]).then(
          ([s, r]): Adaptateurs => ({ nom: 'supabase', session: s.session, relais: r.relais }),
        );
  return adaptateurs;
}
