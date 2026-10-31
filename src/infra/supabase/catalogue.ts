import type {
  ArrondissementPublic,
  EcolePubliee,
  PortCatalogue,
  Redirection,
} from '../../modele/ports';

/**
 * Le catalogue lu à la construction, par l'API publique de la base (clé
 * `publishable`, droits d'un visiteur : seulement ce qui est publié). Une erreur
 * arrête la construction : mieux vaut garder l'ancien site qu'en publier un vide.
 */
export function creerCatalogue(url: string, cle: string): PortCatalogue {
  const lire = async <T>(chemin: string): Promise<T> => {
    const reponse = await fetch(`${url}/rest/v1/${chemin}`, {
      headers: { apikey: cle, Authorization: `Bearer ${cle}` },
    });
    if (!reponse.ok) {
      throw new Error(`Catalogue illisible (${reponse.status}) : ${chemin}`);
    }
    return (await reponse.json()) as T;
  };

  return {
    async redirections(): Promise<Redirection[]> {
      const lignes = await lire<
        { de_arrondissement: string; de_slug: string; vers_arrondissement: string; vers_slug: string }[]
      >('ecoles_redirections?select=*');
      return lignes.map((r) => ({
        de: { arrondissement: r.de_arrondissement, slug: r.de_slug },
        vers: { arrondissement: r.vers_arrondissement, slug: r.vers_slug },
      }));
    },

    arrondissements: () =>
      lire<ArrondissementPublic[]>('arrondissements?select=slug,nom&order=nom'),

    async ecoles() {
      const lignes = await lire<
        {
          id: string;
          arrondissement: string;
          slug: string;
          nom: string;
          quartier: string | null;
          type_ecole: EcolePubliee['typeEcole'];
          niveaux: EcolePubliee['niveaux'];
          repere: string | null;
          numero_enseigne: string | null;
          latitude: number | null;
          longitude: number | null;
          etat: EcolePubliee['etat'];
          mis_a_jour_le: string;
        }[]
      >('ecoles_publiees?select=*&order=nom');
      return lignes.map((e) => ({
        id: e.id,
        arrondissement: e.arrondissement,
        slug: e.slug,
        nom: e.nom,
        quartier: e.quartier,
        typeEcole: e.type_ecole,
        niveaux: e.niveaux,
        repere: e.repere,
        numeroEnseigne: e.numero_enseigne,
        latitude: e.latitude,
        longitude: e.longitude,
        etat: e.etat,
        misAJourLe: e.mis_a_jour_le,
      }));
    },
  };
}
