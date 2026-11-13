/**
 * « Déjà sur NTanova ? » (lot B du ticket 165, canevas « Espace relais », étape 2). En tapant le nom, deux groupes : « Près
 * d'ici » (par la distance : même endroit possible) et « Même nom, ailleurs » (par le nom, dans tout le Congo : un autre site
 * possible). Un toucher ouvre « Vous la reconnaissez ? ». Deux sorties toujours visibles : « Un autre site d'une école connue »
 * (recherche dans tout NTanova) et « Aucune : c'est une nouvelle école ».
 *
 * Tout se calcule dans le téléphone, hors ligne, sur ce qu'il garde (`ecoles`, `ecolesDuPays`). La réponse part avec la fiche
 * comme un indice : le relais ne tranche jamais, rien n'est fusionné, l'envoi n'est jamais bloqué.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  chercherUneEcole,
  distanceEnMots,
  memeEndroitPossible,
  rapprocher,
  type EcoleConnue,
  type Proposition,
} from '../../../modele/deja-sur-ntanova';
import { photoEnseigne, type FicheLocale } from '../../../modele/fiche';
import { lireMemoire, useRequete } from '../base-locale';
import { Icone } from '../composants';
import { useRelais } from '../contexte';
import type { Modifier } from './fiche-en-cours';

type Choisie = Pick<
  EcoleConnue,
  'id' | 'nom' | 'sigle' | 'institutionId' | 'sites' | 'vignette'
> & {
  campus: boolean;
};

export function DejaSurNTanova({ fiche, modifier }: { fiche: FicheLocale; modifier: Modifier }) {
  const lieux = useRequete(() => lireMemoire('ecoles'));
  const pays = useRequete(() => lireMemoire('ecolesDuPays'));
  const [choisie, setChoisie] = useState<Choisie | null>(null);
  const [recherche, setRecherche] = useState<string | null>(null);

  const connues = useMemo<EcoleConnue[]>(
    () => [
      ...(lieux ?? [])
        .filter((l) => l.id !== fiche.corrigeReleveId)
        .map((l) => ({
          id: l.id,
          nom: l.nom,
          sigle: l.sigle ?? null,
          institutionId: l.institutionId ?? null,
          sites: l.sites ?? 1,
          lieu: null,
          position: { latitude: l.latitude, longitude: l.longitude },
          vignette: l.vignette ?? null,
          campus: l.genre !== 'releve',
        })),
      ...(pays ?? []).map((p) => ({
        id: p.id,
        nom: p.nom,
        sigle: p.sigle,
        institutionId: p.id,
        sites: p.sites,
        lieu: p.ville,
        position: null,
        campus: false,
      })),
    ],
    [lieux, pays, fiche.corrigeReleveId],
  );
  const nom = fiche.nomEnseigne.trim();
  const propositions = useMemo(
    () => (nom.length >= 3 ? rapprocher(nom, fiche.position, connues) : null),
    [nom, fiche.position, connues],
  );
  const estCampus = (id: string) => (lieux ?? []).some((l) => l.id === id && l.genre !== 'releve');

  const repondre = (champs: Partial<FicheLocale>) => {
    modifier(champs);
    setChoisie(null);
    setRecherche(null);
  };
  const reponse = libelleReponse(fiche);

  if (nom.length < 3) return null;
  return (
    <section className="carte-blanche pile-serree" aria-labelledby="deja-sur-ntanova">
      <h2 id="deja-sur-ntanova" className="titre-section">
        Déjà sur NTanova&nbsp;?
      </h2>
      {lieux === undefined && pays === undefined ? null : connues.length === 0 ? (
        <p className="mention">
          La liste des écoles n’est pas encore sur ce téléphone&nbsp;: NTanova vérifiera.
        </p>
      ) : null}

      {reponse && (
        <p className="rang" role="status">
          <Icone nom="coche" taille={16} />
          <span>{reponse}</span>
        </p>
      )}

      {propositions && propositions.presDIci.length > 0 && (
        <Groupe
          titre="Près d’ici"
          liste={propositions.presDIci}
          ligne={(p) =>
            [
              p.distanceM !== null ? distanceEnMots(p.distanceM) : null,
              p.sites > 1 ? `${p.sites} sites` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          }
          choisir={(p) => setChoisie({ ...p, campus: estCampus(p.id) })}
        />
      )}
      {propositions && propositions.memeNomAilleurs.length > 0 && (
        <Groupe
          titre="Même nom, ailleurs"
          liste={propositions.memeNomAilleurs}
          ligne={(p) =>
            [
              p.lieu,
              p.distanceM !== null ? distanceEnMots(p.distanceM) : null,
              p.sites > 1 ? `${p.sites} sites` : `1 site`,
            ]
              .filter(Boolean)
              .join(' · ')
          }
          choisir={(p) => setChoisie({ ...p, campus: estCampus(p.id) })}
        />
      )}

      {choisie && (
        <Reconnue
          ecole={choisie}
          photoDuRelais={photoEnseigne(fiche)?.blob ?? null}
          proche={propositions?.presDIci.find((p) => p.id === choisie.id)}
          repondre={repondre}
          fermer={() => setChoisie(null)}
        />
      )}

      {recherche !== null && (
        <Chercher
          texte={recherche}
          changer={setRecherche}
          ecoles={connues.filter((e) => e.institutionId)}
          choisir={(e) =>
            repondre({
              reponseDoublon: 'autre_site',
              autreSiteDe: { institutionId: e.institutionId!, nom: e.nom },
            })
          }
        />
      )}

      <div className="pile-serree">
        <button
          type="button"
          className="lien"
          onClick={() => setRecherche(recherche === null ? '' : null)}
        >
          Un autre site d’une école connue
        </button>
        <button
          type="button"
          className="lien"
          onClick={() =>
            repondre({
              reponseDoublon: fiche.doublonPropose ? 'une_autre' : null,
              autreSiteDe: null,
            })
          }
        >
          Aucune&nbsp;: c’est une nouvelle école
        </button>
      </div>
    </section>
  );
}

function Groupe({
  titre,
  liste,
  ligne,
  choisir,
}: {
  titre: string;
  liste: Proposition[];
  ligne: (p: Proposition) => string;
  choisir: (p: Proposition) => void;
}) {
  return (
    <div className="pile-serree">
      <h3 className="rang">{titre}</h3>
      <ul className="liste-ecoles-connues">
        {liste.map((p) => (
          <li key={p.id}>
            <button type="button" className="ecole-connue" onClick={() => choisir(p)}>
              <span className="sigle-rond" aria-hidden="true">
                {p.sigle ?? p.nom.replace(/^\[/, '').charAt(0)}
              </span>
              <span className="ecole-connue-texte">
                <b>{p.nom}</b>
                <span className="mention">{ligne(p)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** « Vous la reconnaissez ? » : le même endroit d'abord ; jamais de fusion, seulement un indice pour NTanova. */
function Reconnue({
  ecole,
  photoDuRelais,
  proche,
  repondre,
  fermer,
}: {
  ecole: Choisie;
  photoDuRelais: Blob | null;
  proche: Proposition | undefined;
  repondre: (champs: Partial<FicheLocale>) => void;
  fermer: () => void;
}) {
  const designee = { ecoleId: ecole.campus ? ecole.id : null, nom: ecole.nom };
  return (
    <section className="bandeau bandeau-attente pile-serree" aria-label="Vous la reconnaissez ?">
      <p>
        <b>NTanova connaît déjà</b> {ecole.nom}
        {proche?.distanceM != null ? `, ${distanceEnMots(proche.distanceM)}` : ''}. Vous la
        reconnaissez&nbsp;?
      </p>
      {proche && memeEndroitPossible(proche) && <p className="mention">Même endroit possible.</p>}
      <div className="cote-a-cote">
        <figure>
          <VignetteConnue chemin={ecole.vignette ?? null} sigle={ecole.sigle} nom={ecole.nom} />
          <figcaption>Sur NTanova</figcaption>
        </figure>
        <figure>
          <PhotoDuRelais photo={photoDuRelais} />
          <figcaption>Votre photo</figcaption>
        </figure>
      </div>
      <div className="pile-serree">
        {ecole.campus && (
          <button
            type="button"
            className="bouton bouton-secondaire"
            onClick={() =>
              repondre({ reponseDoublon: 'la_meme', doublonPropose: designee, autreSiteDe: null })
            }
          >
            Oui, c’est le même endroit
          </button>
        )}
        {ecole.institutionId && (
          <button
            type="button"
            className="bouton bouton-secondaire"
            onClick={() =>
              repondre({
                reponseDoublon: 'autre_site',
                autreSiteDe: { institutionId: ecole.institutionId!, nom: ecole.nom },
              })
            }
          >
            Oui, et c’est un autre site
          </button>
        )}
        <button
          type="button"
          className="bouton bouton-secondaire"
          onClick={() =>
            repondre({ reponseDoublon: 'autre_ecole', doublonPropose: designee, autreSiteDe: null })
          }
        >
          Non, c’est une autre école
        </button>
        <button
          type="button"
          className="bouton bouton-secondaire"
          onClick={() =>
            repondre({ reponseDoublon: 'ne_sait_pas', doublonPropose: designee, autreSiteDe: null })
          }
        >
          Je ne sais pas
        </button>
        <button type="button" className="lien lien-discret" onClick={fermer}>
          Fermer
        </button>
      </div>
    </section>
  );
}

/**
 * Lot F (13/11) : la vignette publique de l'école connue. Hors ligne, ou si elle ne se charge pas, son sigle dans le rond
 * vert (comme sur sa page) : le téléphone ne garde jamais l'image, seulement son chemin.
 */
function VignetteConnue({
  chemin,
  sigle,
  nom,
}: {
  chemin: string | null;
  sigle: string | null | undefined;
  nom: string;
}) {
  const { adaptateurs } = useRelais();
  const [adresse, setAdresse] = useState<string | null>(null);
  useEffect(() => {
    if (!chemin || !navigator.onLine) return;
    let vivant = true;
    adaptateurs.relais
      .adresseDeVignette(chemin)
      .then((a) => vivant && setAdresse(a))
      .catch(() => vivant && setAdresse(null));
    return () => {
      vivant = false;
    };
  }, [adaptateurs, chemin]);
  if (adresse)
    return (
      <img
        className="vignette-comparee"
        src={adresse}
        alt={`La photo de ${nom} sur NTanova`}
        onError={() => setAdresse(null)}
      />
    );
  return (
    <span className="vignette-comparee vignette-sigle" role="img" aria-label={`Sigle de ${nom}`}>
      {sigle ?? nom.replace(/^\[/, '').charAt(0)}
    </span>
  );
}

function PhotoDuRelais({ photo }: { photo: Blob | null }) {
  const adresse = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(
    () => () => {
      if (adresse) URL.revokeObjectURL(adresse);
    },
    [adresse],
  );
  return adresse ? (
    <img className="vignette-comparee" src={adresse} alt="Votre photo de l’enseigne" />
  ) : (
    <span className="vignette-comparee vignette-vide">Pas de photo</span>
  );
}

/** « Un autre site de quelle école ? » : par le nom ou le sigle, dans tout ce que le téléphone connaît. */
function Chercher({
  texte,
  changer,
  ecoles,
  choisir,
}: {
  texte: string;
  changer: (t: string) => void;
  ecoles: EcoleConnue[];
  choisir: (e: EcoleConnue) => void;
}) {
  // Une école à plusieurs sites ne paraît qu'une fois.
  const uniques = useMemo(() => {
    const vues = new Set<string>();
    return ecoles.filter((e) => !vues.has(e.institutionId!) && vues.add(e.institutionId!));
  }, [ecoles]);
  const resultats = chercherUneEcole(texte, uniques);
  return (
    <section className="pile-serree" aria-label="Un autre site de quelle école ?">
      <label className="champ-groupe">
        <span>Un autre site de quelle école&nbsp;?</span>
        <input
          className="champ"
          type="search"
          autoComplete="off"
          placeholder="Son nom ou son sigle"
          value={texte}
          onChange={(e) => changer(e.target.value)}
        />
      </label>
      {texte.trim().length >= 2 && resultats.length === 0 && (
        <p className="mention">Aucune école de ce nom sur ce téléphone.</p>
      )}
      <ul className="liste-ecoles-connues">
        {resultats.map((e) => (
          <li key={e.institutionId}>
            <button type="button" className="ecole-connue" onClick={() => choisir(e)}>
              <span className="sigle-rond" aria-hidden="true">
                {e.sigle ?? e.nom.replace(/^\[/, '').charAt(0)}
              </span>
              <span className="ecole-connue-texte">
                <b>{e.nom}</b>
                <span className="mention">
                  {[e.lieu, `${e.sites} site${e.sites > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}{' '}
                  · En faire son {e.sites + 1}e site
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Ce que le relais a répondu, dit en une ligne. */
function libelleReponse(fiche: FicheLocale): string | null {
  const nom = fiche.autreSiteDe?.nom ?? fiche.doublonPropose?.nom ?? '';
  switch (fiche.reponseDoublon) {
    case 'la_meme':
      return `Le même endroit que ${nom}.`;
    case 'autre_site':
      return `Un autre site de ${nom}.`;
    case 'autre_ecole':
    case 'une_autre':
      return 'Une autre école.';
    case 'ne_sait_pas':
      return 'Vous ne savez pas : NTanova vérifiera.';
    default:
      return null;
  }
}
