// Une fiche publiée, en une ligne, pour « Compléter ou corriger l'annuaire » (refonte, lot 3C) : son identifiant public, son nom, son
// lieu, son adresse. Rien que la fiche publique ne dise déjà. Le formulaire la demande quand on vient d'une fiche ; une fiche
// qui n'est plus publiée n'a plus ce fichier, et le formulaire demande alors son nom.
import type { APIRoute, GetStaticPaths } from 'astro';
import { obtenirSite } from '../../../infra/index';
import { ligneDeLieu, lienEcole } from '../../../modele/geo-divisions';

export const getStaticPaths = (async () => {
  const { ecoles, arbre } = await obtenirSite();
  return ecoles.map((e) => ({
    params: { numero: e.numero },
    props: {
      fiche: {
        numero: e.numero,
        id: e.id,
        nom: e.etiquette ? `${e.nom} (${e.etiquette})` : e.nom,
        lieu: ligneDeLieu(e.quartier, arbre.parId.get(e.divisionId)?.noms ?? []),
        lien: lienEcole(e),
      },
    },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify(props.fiche), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
