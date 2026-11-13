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
import { Icone, classeBouton, classeChamp } from '../formulaire';
import { cn } from '@/lib/utils';
import { IconeAjouter, IconeChercher, IconeOuvrir } from '@/ui/shadcn/icones';
import { TitreAvecAide } from '../choix';
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
    <section
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
      aria-labelledby="deja-sur-ntanova"
    >
      <div className="px-3 py-1">
        <TitreAvecAide
          niveau="b"
          titre={<span id="deja-sur-ntanova">Déjà sur NTanova&nbsp;?</span>}
          libelleAide="Aide : les écoles déjà connues"
          aide={
            <p>
              Les écoles que NTanova connaît déjà, près d’ici ou du même nom. Touchez-en une si vous
              la reconnaissez&nbsp;: rien n’est fusionné, NTanova vérifie.
            </p>
          }
        />
      </div>
      {lieux === undefined && pays === undefined ? null : connues.length === 0 ? (
        <p className="m-0 border-t border-border px-3 py-2.5 text-[13px] text-muted-foreground">
          La liste des écoles n’est pas encore sur ce téléphone&nbsp;: NTanova vérifiera.
        </p>
      ) : null}

      {reponse && (
        <p
          className="m-0 flex items-center gap-2 border-t border-border bg-succes px-3 py-2.5 text-[15px] text-succes-foreground"
          role="status"
        >
          <Icone nom="coche" taille={18} />
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

      <div className="flex flex-col">
        <button
          type="button"
          aria-expanded={recherche !== null}
          className={ligneBouton}
          onClick={() => setRecherche(recherche === null ? '' : null)}
        >
          <IconeChercher className="size-5 text-muted-foreground" />
          <b className="flex-1">Un autre site d’une école connue</b>
          <IconeOuvrir className="size-5" />
        </button>
        <button
          type="button"
          className={cn(ligneBouton, 'text-primary')}
          onClick={() =>
            repondre({
              reponseDoublon: fiche.doublonPropose ? 'une_autre' : null,
              autreSiteDe: null,
            })
          }
        >
          <IconeAjouter className="size-5" />
          <b>Aucune&nbsp;: c’est une nouvelle école</b>
        </button>
      </div>
    </section>
  );
}

const ligneBouton =
  'flex min-h-[52px] w-full cursor-pointer items-center gap-2.5 border-0 border-t border-border bg-card px-3 text-left font-sans text-base text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset';

/** Le rond du sigle d'une école connue (un cercle, parce qu'il nomme). */
function RondSigle({ sigle, nom }: { sigle: string | null | undefined; nom: string }) {
  const texte = sigle ?? nom.replace(/^\[/, '').charAt(0);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-strong font-serif font-bold text-primary-foreground',
        texte.length > 3 ? 'text-[13px]' : 'text-[15px]',
      )}
    >
      {texte}
    </span>
  );
}

/** Une école connue, sur une ligne : le rond du sigle, le nom, où elle est ; le chevron dit qu'elle s'ouvre. */
function LigneEcole({
  nom,
  sigle,
  detail,
  onClick,
}: {
  nom: string;
  sigle: string | null | undefined;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={cn(ligneBouton, 'min-h-14 py-2')} onClick={onClick}>
      <RondSigle sigle={sigle} nom={nom} />
      <span className="flex min-w-0 flex-1 flex-col">
        <b>{nom}</b>
        <span className="text-[13px] text-muted-foreground">{detail}</span>
      </span>
      <IconeOuvrir className="size-5" />
    </button>
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
    <div className="flex flex-col">
      <h3 className="m-0 border-t border-border px-3 pt-2.5 pb-1 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
        {titre}
      </h3>
      <ul className="m-0 list-none p-0">
        {liste.map((p) => (
          <li key={p.id}>
            <LigneEcole nom={p.nom} sigle={p.sigle} detail={ligne(p)} onClick={() => choisir(p)} />
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
    <section
      className="flex flex-col gap-3 border-t border-border bg-attention px-3 py-3 text-[15px] text-attention-foreground [&_p]:m-0"
      aria-label="Vous la reconnaissez ?"
    >
      <p>
        <b>NTanova connaît déjà</b> {ecole.nom}
        {proche?.distanceM != null ? `, ${distanceEnMots(proche.distanceM)}` : ''}. Vous la
        reconnaissez&nbsp;?
      </p>
      {proche && memeEndroitPossible(proche) && (
        <p className="m-0 text-[13px] text-muted-foreground">Même endroit possible.</p>
      )}
      <div className="grid grid-cols-2 gap-3 [&_figure]:m-0 [&_figure]:flex [&_figure]:flex-col [&_figure]:gap-1 [&_figcaption]:text-[13px] [&_figcaption]:font-bold">
        <figure>
          <VignetteConnue chemin={ecole.vignette ?? null} sigle={ecole.sigle} nom={ecole.nom} />
          <figcaption>Sur NTanova</figcaption>
        </figure>
        <figure>
          <PhotoDuRelais photo={photoDuRelais} />
          <figcaption>Votre photo</figcaption>
        </figure>
      </div>
      <div className="flex flex-col gap-2.5">
        {ecole.campus && (
          <button
            type="button"
            className={classeBouton({ variant: 'outline', size: 'lg', className: 'w-full' })}
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
            className={classeBouton({ variant: 'outline', size: 'lg', className: 'w-full' })}
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
          className={classeBouton({ variant: 'outline', size: 'lg', className: 'w-full' })}
          onClick={() =>
            repondre({ reponseDoublon: 'autre_ecole', doublonPropose: designee, autreSiteDe: null })
          }
        >
          Non, c’est une autre école
        </button>
        <button
          type="button"
          className={classeBouton({ variant: 'outline', size: 'lg', className: 'w-full' })}
          onClick={() =>
            repondre({ reponseDoublon: 'ne_sait_pas', doublonPropose: designee, autreSiteDe: null })
          }
        >
          Je ne sais pas
        </button>
        <button
          type="button"
          className={classeBouton({ variant: 'link', className: 'text-muted-foreground' })}
          onClick={fermer}
        >
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
        className={vignette}
        src={adresse}
        alt={`La photo de ${nom} sur NTanova`}
        onError={() => setAdresse(null)}
      />
    );
  return (
    <span
      className={cn(
        vignette,
        'flex items-center justify-center bg-primary-strong font-serif text-2xl font-bold text-primary-foreground',
      )}
      role="img"
      aria-label={`Sigle de ${nom}`}
    >
      {sigle ?? nom.replace(/^\[/, '').charAt(0)}
    </span>
  );
}

const vignette = 'block aspect-[4/3] w-full rounded-md object-cover';

function PhotoDuRelais({ photo }: { photo: Blob | null }) {
  const adresse = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(
    () => () => {
      if (adresse) URL.revokeObjectURL(adresse);
    },
    [adresse],
  );
  return adresse ? (
    <img className={vignette} src={adresse} alt="Votre photo de l’enseigne" />
  ) : (
    <span
      className={cn(
        vignette,
        'flex items-center justify-center bg-muted text-sm text-muted-foreground',
      )}
    >
      Pas de photo
    </span>
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
    <section className="flex flex-col gap-2.5" aria-label="Un autre site de quelle école ?">
      <label className="flex flex-col gap-1.5 border-t border-border px-3 pt-3 text-sm font-bold">
        <span>Un autre site de quelle école&nbsp;?</span>
        <input
          className={classeChamp}
          type="search"
          autoComplete="off"
          placeholder="Son nom ou son sigle"
          value={texte}
          onChange={(e) => changer(e.target.value)}
        />
      </label>
      {texte.trim().length >= 2 && resultats.length === 0 && (
        <p className="m-0 px-3 text-[13px] text-muted-foreground">
          Aucune école de ce nom sur ce téléphone.
        </p>
      )}
      <ul className="m-0 list-none p-0">
        {resultats.map((e) => (
          <li key={e.institutionId}>
            <LigneEcole
              nom={e.nom}
              sigle={e.sigle}
              detail={`${[e.lieu, `${e.sites} site${e.sites > 1 ? 's' : ''}`].filter(Boolean).join(' · ')} · En faire son ${e.sites + 1}e site`}
              onClick={() => choisir(e)}
            />
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
