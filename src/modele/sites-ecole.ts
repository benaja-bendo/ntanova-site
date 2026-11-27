/**
 * Les noms des sites d'une école, quand elle en a plusieurs (ticket 236, 27/11) : deux sites sans nom se lisaient pareil
 * (« Site · Crèche ou garderie à lycée »). Sans nom, un site se distingue par son quartier, sinon son repère, sinon sa
 * division (« Site · [quartier] ») ; deux sites que rien ne sépare prennent leur rang. Pur : ni DOM, ni réseau.
 */
export interface SiteANommer {
  id: string;
  etiquette: string | null;
  quartier?: string | null;
  repere?: string | null;
  division?: string | null;
}

const LONGUEUR = 40;
const net = (v: string | null | undefined) => v?.trim() || null;

/** Un repère entier ne tient pas dans une pastille : il se coupe entre deux mots. */
export function raccourci(texte: string): string {
  if (texte.length <= LONGUEUR) return texte;
  const coupe = texte.slice(0, LONGUEUR);
  const dernierMot = coupe.lastIndexOf(' ');
  return `${coupe.slice(0, dernierMot > LONGUEUR / 2 ? dernierMot : LONGUEUR).trimEnd()}…`;
}

const criteres: ((s: SiteANommer) => string | null)[] = [
  (s) => net(s.quartier),
  (s) => net(s.repere),
  (s) => net(s.division),
];

/** Le libellé de chaque site, par identifiant. `sites` : tous ceux d'une même école, dans leur ordre. */
export function libellesDesSites(sites: readonly SiteANommer[]): Map<string, string> {
  const sansNom = sites.filter((s) => !net(s.etiquette));
  const memes = (a: string | null, b: string) =>
    a?.toLocaleLowerCase('fr') === b.toLocaleLowerCase('fr');
  return new Map(
    sites.map((s, i): [string, string] => {
      const nom = net(s.etiquette);
      if (nom) return [s.id, nom];
      for (const critere of criteres) {
        const valeur = critere(s);
        if (valeur && sansNom.filter((x) => memes(critere(x), valeur)).length === 1)
          return [s.id, `Site · ${raccourci(valeur)}`];
      }
      const valeur = criteres.map((c) => c(s)).find((v) => v !== null);
      return [s.id, valeur ? `Site ${i + 1} · ${raccourci(valeur)}` : `Site ${i + 1}`];
    }),
  );
}
