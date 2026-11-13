/**
 * « Est-ce une école connue ? » (lot 3 du cahier, planche « Est-ce une école connue ? ») : avant d'accepter une nouvelle fiche,
 * la base compare son nom (sans « complexe », « scolaire », « école »…) et sa position aux écoles connues et aux fiches en
 * attente (`similar_schools`). Elle propose ; l'administration confirme. Quatre états, deux boutons au plus, jamais de fusion :
 * - même endroit : « Compléter sa fiche » (`update_campus`) ou « Non, une autre école » ;
 * - même nom plus loin : « Oui, nouveau site » (`new_campus` de cette école) ou « Non, autre école » ;
 * - autre nom tout près : une école voisine, dite seulement (« Même lieu » attend la décision du fondateur) ;
 * - rien : « Nouvelle école ».
 */
import { useEffect, useState } from 'react';
import type { Cible } from '../../modele/acceptation';
import { distanceEnMots } from '../../modele/deja-sur-ntanova';
import type { EcoleSimilaire } from '../../modele/fiche-admin';
import type { Point } from '../../modele/geo';
import type { Valeur } from '../../modele/listes';
import type { PortAdministration } from '../../modele/ports';

const libelleReponse: Partial<Record<Valeur<'reponse_doublon'>, string>> = {
  la_meme: 'le même endroit',
  une_autre: 'une autre école',
  autre_site: 'un autre site',
  autre_ecole: 'une autre école',
  ne_sait_pas: 'je ne sais pas',
};

export function EcoleConnue({
  admin,
  releveId,
  nom,
  position,
  reponseDuRelais,
  cible,
  choisir,
}: {
  admin: PortAdministration;
  releveId: string;
  nom: string;
  position: Point | null;
  reponseDuRelais: Valeur<'reponse_doublon'> | null;
  cible: Cible;
  choisir: (c: Cible) => void;
}) {
  const [candidats, setCandidats] = useState<EcoleSimilaire[] | null>(null);
  useEffect(() => {
    let vivant = true;
    admin
      .ecolesSimilaires(nom, position, releveId)
      .then((c) => vivant && setCandidats(c))
      .catch(() => vivant && setCandidats([]));
    return () => {
      vivant = false;
    };
  }, [admin, nom, position, releveId]);

  if (candidats === null) return null;
  // Le premier site connu : la base les range du plus sûr au moins sûr. Un relevé en attente se dit, sans geste.
  const site = candidats.find((c) => c.genre === 'campus');
  const enAttente = candidats.find((c) => c.genre === 'releve');
  const ou = (c: EcoleSimilaire) =>
    [
      c.distanceM !== null ? distanceEnMots(c.distanceM) : null,
      c.etat === 'publiee' ? 'publiée' : c.etat === 'prete' ? 'prête' : null,
    ]
      .filter(Boolean)
      .join(' · ');
  const relais = reponseDuRelais && libelleReponse[reponseDuRelais];

  let titre: string;
  let texte: React.ReactNode;
  let gestes: { libelle: string; c: Cible; actif: boolean }[] = [];
  if (site?.verdict === 'deja_la') {
    titre = 'Déjà dans la base ?';
    texte = (
      <>
        « {site.nom} » existe déjà, <b>{ou(site)}</b>.
      </>
    );
    gestes = [
      {
        libelle: 'Compléter sa fiche',
        c: { mode: 'update_campus', campusId: site.id },
        actif: cible.mode === 'update_campus' && cible.campusId === site.id,
      },
      {
        libelle: 'Non, une autre école',
        c: { mode: 'nouvelle' },
        actif: cible.mode === 'nouvelle',
      },
    ];
  } else if (site?.verdict === 'autre_site' && site.institutionId) {
    titre = 'Un autre site de cette école ?';
    texte = (
      <>
        « {site.nom} » existe déjà{site.distanceM !== null ? ', ' : ''}
        <b>{ou(site)}</b>.
      </>
    );
    gestes = [
      {
        libelle: 'Oui, nouveau site',
        c: { mode: 'new_campus', institutionId: site.institutionId },
        actif: cible.mode === 'new_campus' && cible.institutionId === site.institutionId,
      },
      { libelle: 'Non, autre école', c: { mode: 'nouvelle' }, actif: cible.mode === 'nouvelle' },
    ];
  } else if (site?.verdict === 'voisine') {
    titre = 'Une école voisine';
    texte = (
      <>
        « {site.nom} », <b>{ou(site)}</b> : un autre nom, tout près. Deux écoles peuvent partager un
        portail ; rien ne change ici.
      </>
    );
  } else {
    titre = 'Nouvelle école';
    texte = 'Aucune école de ce nom, et rien à moins de 500 m.';
  }

  return (
    <section
      className={`ecole-connue-admin${site ? ' ecole-connue-trouvee' : ''}`}
      aria-label="Est-ce une école connue ?"
    >
      <div className="ecole-connue-texte">
        <b>{titre}</b>
        <span>{texte}</span>
        {relais && <span className="mention">Le relais a répondu : {relais}.</span>}
        {enAttente && (
          <span className="mention">
            Une fiche en attente porte un nom proche : « {enAttente.nom} »
            {enAttente.distanceM !== null ? `, ${distanceEnMots(enAttente.distanceM)}` : ''}.
          </span>
        )}
      </div>
      {gestes.length > 0 && (
        <div className="ecole-connue-gestes" role="group" aria-label="Ta réponse">
          {gestes.map((g, i) => (
            <button
              key={g.libelle}
              type="button"
              className={`bouton ${i === 0 ? '' : 'bouton-secondaire'}`}
              aria-pressed={g.actif}
              onClick={() => choisir(g.c)}
            >
              {g.libelle}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
