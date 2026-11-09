// Les icônes que le `<head>` des pages publiques déclare (constat du 09/11/2026 : Google n'avait aucun favicon pour
// ntanova.com). Google veut un favicon carré (1:1), en multiple de 48 px, qu'il sait relire : d'où un `.ico` (16, 32, 48), un
// PNG de 48 px et un SVG au cadre carré, comme les sites dont l'icône s'affiche. `favicon.svg`, rectangulaire (163 × 125), reste
// pour l'interface (l'administration, l'espace relais) et son service worker : il n'est plus déclaré comme icône du site public.
// Les fichiers se refont avec `pnpm icones` (outils/generer-icones.mjs, à partir de public/icone.svg).

export interface IconeSite {
  rel: 'icon' | 'apple-touch-icon';
  /** Une adresse de public/, à la racine : Google relit les icônes à une adresse stable. */
  href: string;
  type?: string;
  sizes: string;
}

export const ICONES_SITE: readonly IconeSite[] = [
  { rel: 'icon', href: '/favicon.ico', sizes: '16x16 32x32 48x48' },
  { rel: 'icon', href: '/favicon-48.png', type: 'image/png', sizes: '48x48' },
  { rel: 'icon', href: '/icone.svg', type: 'image/svg+xml', sizes: 'any' },
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
];
