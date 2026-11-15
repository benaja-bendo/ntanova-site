import { v2 } from '@/ui/v2/classes';
import { IconeBas, IconeCorriger, IconeFiltre, IconeOuvrir } from '@/ui/shadcn/icones';
import { Compteur } from './ui';
import { cn } from '@/lib/utils';
import { CorrectionAvantAcceptation } from './CorrectionAvantAcceptation';
import { useCallback, useEffect, useState } from 'react';
import {
  ceQuiManqueDuNumero,
  ceQuiManquePourAccepter,
  numeroAConfirmer,
  numeroPeutEtreRetire,
  peutSaisirLaPosition,
  type ChoixNumero,
  divisionRequise as divisionRequisePour,
  type Cible,
  type PositionSaisie,
} from '../../modele/acceptation';
import { arrondissementDeLaPosition } from '../../modele/carte/plan';
import { lireChampPosition } from '../../modele/correction-ecole';
import { ageDe, trierParAnciennete } from '../../modele/age';
import { peutParaitreSurLeSite } from '../../modele/photos-publiques';
import { ON_Y_VOIT } from '../../modele/fiche';
import { messageManquant } from '../../modele/decision';
import {
  compterIndices,
  filtrerFile,
  relaisDeLaFile,
  type IndiceDeFiche,
} from '../../modele/file-validation';
import { cheminLisible } from '../../modele/geo-divisions';
import type { Valeur } from '../../modele/listes';
import {
  libelleMotif,
  libelleNiveau,
  libelleRolePhoto,
  libelleStatutReleve,
  libelleTypeEcole,
  motifsProposes,
} from '../../modele/libelles';
import type {
  ContactDirection,
  DomainePublic,
  CorrectionEcole,
  DecisionAcceptation,
  DetailReleve,
  DivisionVue,
  FaitGarde,
  FormationSaisie,
  PhotoVue,
  PortAdministration,
  ReleveAValider,
  ReleveDecide,
} from '../../modele/ports';
import { ErreurDecision } from '../../modele/ports';
import { ActionsSecondaires, Bouton, Dialogue } from '@/ui/v2/admin';
import { TitreEcran } from './Cadre';
import { EcoleConnue } from './EcoleConnue';
import { afficherTelephone, numeroCongolaisSuspect } from '../../modele/telephone';
import { libelleEquipement } from '../../modele/equipements-ecole';
import { Bandeau, Champ, Icone } from '@/ui/v2/formulaire';
import { jour, quand } from '../../ui/composants';
import { aller, useAdresse } from '../commun/adresse';
import { ficheApresLeGeste, gesteDeLaTouche } from '../../modele/raccourcis';
import { ChampPosition, messageErreur } from './ChampPosition';
import { Personnes } from './Personnes';
import { Formations } from './Formations';
import { cycleAvecFormations } from '../../modele/formations';
import { Pont } from './Pont';

type Filtre = 'tout' | 'releve' | 'correction' | 'contre_visite' | 'renvoyees' | 'decidees';

const libelleType: Record<ReleveAValider['type'], string> = {
  releve: 'Nouvelle fiche',
  correction: 'Correction',
  contre_visite: 'Contre-visite',
};

const ACCEPTEE =
  'Acceptée : l’école est prête. Publie-la depuis l’onglet « Écoles » (une école, une zone ou un lot).';

const pastilleDecision: Record<ReleveDecide['statut'], string> = {
  a_valider: v2.pastilleAttention,
  a_corriger: v2.pastilleAttention,
  accepte: v2.pastilleSucces,
  refuse: v2.pastilleDanger,
};

/** Les pastilles d'une ligne (planche) : seulement ce qui dit où est l'école ; le reste se lit dans la fiche. */
function Etiquettes({ r }: { r: ReleveAValider }) {
  const etiquettes = [
    r.essai && 'Lot d’essai',
    r.doublonPossible && 'Doublon possible',
    r.precisionM === null && !r.essai && 'Sans position',
    // Une correction ou une contre-visite peut se passer de photo : NTanova a déjà celle de l'école.
    !r.enseigneRecue && (r.type === 'releve' ? 'Photo pas encore reçue' : 'Pas de nouvelle photo'),
  ].filter((e): e is string => Boolean(e));
  if (etiquettes.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {etiquettes.map((texte) => (
        <span key={texte} className={v2.pastilleAttention}>
          {texte}
        </span>
      ))}
    </span>
  );
}

/** Depuis quand la fiche attend ; au-delà de 24 heures, elle se voit (ticket #76). */
function AgeDeLaFiche({ age }: { age: ReturnType<typeof ageDe> }) {
  return age.ancienne ? <b className="font-bold text-bonus">{age.texte}</b> : <>{age.texte}</>;
}

export function AValider({
  admin,
  surCompte,
}: {
  admin: PortAdministration;
  surCompte: (n: number) => void;
}) {
  const [, choisi] = useAdresse();
  const [releves, setReleves] = useState<ReleveAValider[] | null>(null);
  const [decides, setDecides] = useState<ReleveDecide[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('tout');
  const [relaisChoisi, setRelaisChoisi] = useState<string | null>(null);
  const [indice, setIndice] = useState<IndiceDeFiche | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);

  const charger = useCallback(() => {
    Promise.all([admin.relevesAValider(), admin.relevesDecides()])
      .then(([r, d]) => {
        setReleves(r);
        setDecides(d);
        setErreur(null);
        surCompte(r.length);
      })
      .catch((e: unknown) => setErreur(messageErreur(e)));
  }, [admin, surCompte]);

  useEffect(() => {
    charger();
  }, [charger]);

  // La plus ancienne d'abord : la promesse faite aux relais est une validation sous 24 à 48 heures (ticket #76).
  const typeFiltre =
    filtre === 'releve' || filtre === 'correction' || filtre === 'contre_visite' ? filtre : 'tout';
  // Les relais et les indices se comptent sur la file entière : choisir un relais ne vide pas la liste des relais.
  const relaisProposes = relaisDeLaFile(releves ?? []);
  // Un relais dont toutes les fiches viennent d'être décidées n'est plus un choix : on retombe sur « Tous les relais ».
  const relaisActif = relaisProposes.some((r) => r.relais === relaisChoisi) ? relaisChoisi : null;
  const visibles = trierParAnciennete(
    filtrerFile(releves ?? [], { type: typeFiltre, relais: relaisActif, indice }),
  );
  const indices = compterIndices(releves ?? []);
  const maintenant = new Date();
  // « Renvoyées » : les fiches qui attendent leur relais, sorties de la file (ticket #92). Comme « Décidées », en lecture seule.
  const surLesDecidees = filtre === 'decidees' || filtre === 'renvoyees';
  const decidesVisibles =
    filtre === 'renvoyees'
      ? (decides ?? []).filter((r) => r.statut === 'a_corriger')
      : (decides ?? []);
  const selection = surLesDecidees
    ? (decidesVisibles.find((r) => r.id === choisi) ?? null)
    : (visibles.find((r) => r.id === choisi) ?? null);

  const apresDecision = (texte: string) => {
    setAnnonce(texte);
    // Seulement si l'on est encore sur « À valider » : un autre onglet ouvert entre-temps reste ouvert.
    if (location.hash.startsWith('#valider')) {
      const suivant = visibles.find((r) => r.id !== choisi);
      aller(suivant ? `valider/${suivant.id}` : 'valider', true);
    }
    charger();
  };

  const renvoyeesN = (decides ?? []).filter((r) => r.statut === 'a_corriger').length;
  const onglet: 'a_traiter' | 'renvoyees' | 'decidees' =
    filtre === 'renvoyees' ? 'renvoyees' : filtre === 'decidees' ? 'decidees' : 'a_traiter';
  const listeEnCours = surLesDecidees ? decidesVisibles : visibles;
  const rang = selection ? listeEnCours.findIndex((r) => r.id === selection.id) + 1 : 0;
  // Lot G : sur ordinateur, J/K passent d'une fiche à l'autre, Échap revient à la liste.
  const idsEnCours = listeEnCours.map((r) => r.id).join(' ');
  const idSelection = selection?.id ?? null;
  useEffect(() => {
    if (!matchMedia('(min-width: 64rem)').matches) return;
    const ecouter = (e: KeyboardEvent) => {
      const actif = document.activeElement as HTMLElement | null;
      const geste = gesteDeLaTouche({
        key: e.key,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        cible: actif?.tagName ?? null,
        modifiable: actif?.isContentEditable ?? false,
        fenetreOuverte: document.querySelector('dialog[open]') !== null,
      });
      if (geste === null) return;
      const ids = idsEnCours === '' ? [] : idsEnCours.split(' ');
      const apres = ficheApresLeGeste(geste, ids, idSelection);
      if (apres === undefined) return;
      e.preventDefault();
      aller(apres === null ? 'valider' : `valider/${apres}`);
    };
    addEventListener('keydown', ecouter);
    return () => removeEventListener('keydown', ecouter);
  }, [idsEnCours, idSelection]);
  const filtresDeLaFile = !surLesDecidees && releves !== null && (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Affiner la file">
      {relaisProposes.length > 1 && (
        <label className="relative inline-flex">
          <span className="sr-only">Relais</span>
          <select
            className={cn(v2.puce, 'appearance-none pr-8')}
            value={relaisActif ?? ''}
            onChange={(e) => setRelaisChoisi(e.target.value || null)}
          >
            <option value="">Tous les relais</option>
            {relaisProposes.map((r) => (
              <option key={r.relais} value={r.relais}>
                {r.relais} · {r.fiches}
              </option>
            ))}
          </select>
          <IconeBas
            className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
        </label>
      )}
      {(
        [
          ['sans_position', 'Sans position', indices.sansPosition],
          ['doublon_possible', 'Doublon possible', indices.doublonPossible],
        ] as const
      ).map(
        ([valeur, libelle, n]) =>
          (n > 0 || indice === valeur) && (
            <button
              key={valeur}
              type="button"
              className={v2.puce}
              aria-pressed={indice === valeur}
              onClick={() => setIndice(indice === valeur ? null : valeur)}
            >
              {libelle} · {n}
            </button>
          ),
      )}
    </div>
  );

  /** Une ligne de la file : le nom en serif, le relais et l'âge, une pastille au besoin (planche « À valider »). */
  const ligne = (
    r: {
      id: string;
      nomEnseigne: string;
      relais: string;
      lot: string | null;
      type: ReleveAValider['type'];
    },
    age: React.ReactNode,
    etiquettes: React.ReactNode,
  ) => (
    <li key={r.id}>
      <a
        href={`#valider/${r.id}`}
        aria-current={r.id === choisi ? 'true' : undefined}
        onClick={(e) => {
          e.preventDefault();
          setAnnonce(null);
          aller(`valider/${r.id}`);
        }}
        className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 text-foreground no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring aria-[current=true]:border-2 aria-[current=true]:border-primary aria-[current=true]:px-[13px] aria-[current=true]:py-[11px] [@media(hover:hover)]:hover:border-primary"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <b className="font-serif text-[17px] leading-snug">{r.nomEnseigne}</b>
          <span className="text-sm text-muted-foreground">
            {r.type !== 'releve' && `${libelleType[r.type]} · `}
            {r.relais} · {age}
            {r.lot ? <span className="sr-only">{` · Lot ${r.lot}`}</span> : null}
          </span>
          {etiquettes}
        </span>
        <IconeOuvrir className="size-5 shrink-0 lg:hidden" aria-hidden />
      </a>
    </li>
  );

  return (
    <>
      <TitreEcran
        titre="À valider"
        retour={selection ? { libelle: 'À valider', chemin: 'valider' } : null}
        titreHaut={selection?.nomEnseigne ?? null}
        droiteHaut={selection && rang > 0 ? `${rang} sur ${listeEnCours.length}` : null}
        regles={
          <>
            <p>Rien n’est publié avant ton accord : « Accepter » crée l’école sans la publier.</p>
            <p>
              La plus ancienne d’abord : la promesse faite aux relais est une validation sous 24 à
              48 heures. « Renvoyées » : les fiches qui attendent leur relais. « Décidées » se lit
              sans rien changer.
            </p>
            <p>« Refuser » est à l’écart des autres gestes, et n’a jamais de raccourci.</p>
            <p>
              « Photo publiable » : nette, sans enfant ni personne reconnaissable. Seules l’enseigne
              et la vue du bâtiment peuvent paraître sur la fiche ; le panneau des formations et le
              prospectus restent privés. Effacer une photo (en l’agrandissant) ne retire pas les
              copies déjà publiées : reconstruis le site après un retrait.
            </p>
            <p>
              Sur ordinateur : J ouvre la fiche suivante, K la précédente, Échap revient à la liste.
              Aucune touche ne décide à ta place.
            </p>
          </>
        }
      />

      <div
        className={cn(
          'flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-border max-lg:border-0',
          selection && 'max-lg:hidden',
        )}
      >
        <div
          className="flex gap-5 max-lg:w-full max-lg:border-b max-lg:border-border"
          role="group"
          aria-label="État des fiches"
        >
          {(
            [
              ['tout', 'À traiter', releves?.length ?? null, onglet === 'a_traiter'],
              ['renvoyees', 'Renvoyées', renvoyeesN, onglet === 'renvoyees'],
              ['decidees', 'Décidées', null, onglet === 'decidees'],
            ] as const
          ).map(([valeur, libelle, n, actif]) => (
            <button
              key={valeur}
              type="button"
              aria-pressed={actif}
              onClick={() => setFiltre(valeur)}
              className="-mb-px flex min-h-11 cursor-pointer items-center border-0 border-b-[3px] border-transparent bg-transparent px-0 font-sans text-[15px] font-bold whitespace-nowrap text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring aria-pressed:border-primary aria-pressed:text-primary-strong"
            >
              {libelle}
              <Compteur n={n} />
            </button>
          ))}
        </div>
        {filtresDeLaFile && <div className="ml-auto pb-2 max-lg:hidden">{filtresDeLaFile}</div>}
      </div>
      {filtresDeLaFile && (
        <details
          className={cn('group lg:hidden [&[open]>summary]:mb-3', selection && 'max-lg:hidden')}
        >
          <summary className={cn(v2.puce, 'list-none [&::-webkit-details-marker]:hidden')}>
            <IconeFiltre className="size-4" aria-hidden />
            Filtrer
          </summary>
          {filtresDeLaFile}
        </details>
      )}

      {erreur && (
        <Bandeau ton="erreur" icone="alerte">
          <p>{erreur}</p>
        </Bandeau>
      )}
      {annonce && (
        <p className={v2.bandeSucces} role="status">
          <Icone nom="coche" />
          {annonce}
        </p>
      )}

      <div className="flex items-start gap-4">
        <ul
          className={cn(
            'm-0 flex w-full list-none flex-col gap-2 p-0 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:w-[250px] lg:shrink-0 lg:overflow-y-auto',
            selection && 'max-lg:hidden',
          )}
          aria-label={surLesDecidees ? 'Décisions récentes' : 'Envois à valider'}
        >
          {surLesDecidees ? (
            <>
              {decides !== null && decidesVisibles.length === 0 && (
                <li className="text-muted-foreground">
                  {filtre === 'renvoyees'
                    ? 'Aucune fiche n’attend son relais.'
                    : 'Aucune décision pour le moment.'}
                </li>
              )}
              {decidesVisibles.map((r) =>
                ligne(
                  r,
                  r.decideLe
                    ? filtre === 'renvoyees'
                      ? `renvoyée ${ageDe(r.decideLe, maintenant).texte}`
                      : jour(r.decideLe)
                    : '',
                  <span className={pastilleDecision[r.statut]}>
                    {libelleStatutReleve[r.statut]}
                  </span>,
                ),
              )}
            </>
          ) : (
            <>
              {releves !== null && visibles.length === 0 && (
                <li className="text-muted-foreground">
                  {releves.length > 0
                    ? 'Aucune fiche ne correspond à ces filtres.'
                    : 'Rien à valider pour le moment.'}
                </li>
              )}
              {visibles.map((r) =>
                ligne(r, <AgeDeLaFiche age={ageDe(r.recuLe, maintenant)} />, <Etiquettes r={r} />),
              )}
            </>
          )}
        </ul>

        {selection && (
          <Detail
            key={selection.id}
            admin={admin}
            id={selection.id}
            lectureSeule={surLesDecidees}
            refusee={(decides ?? []).find((d) => d.id === selection.id)?.statut === 'refuse'}
            statutDecide={
              surLesDecidees
                ? ((decides ?? []).find((d) => d.id === selection.id)?.statut ?? null)
                : null
            }
            surDecision={apresDecision}
            rang={rang > 0 ? `${rang} sur ${listeEnCours.length}` : null}
          />
        )}
      </div>
    </>
  );
}

// Les photos, côte à côte ----------------------------------------------------------------

/** Une bascule (shadcn Switch) : « Photo publiable », dite et lue comme un interrupteur. */
function Bascule({
  allumee,
  libelle,
  surChange,
  desactivee = false,
}: {
  allumee: boolean;
  libelle: string;
  surChange: (allumee: boolean) => void;
  desactivee?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={allumee}
      aria-label={libelle}
      disabled={desactivee}
      onClick={() => surChange(!allumee)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent p-0 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        allumee ? 'bg-primary' : 'bg-input/60',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'block size-6 rounded-full bg-card shadow transition-transform',
          allumee ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}

function Photos({
  admin,
  photos,
  nom,
  sansNouvellePhoto = false,
  surChangement,
  peutMarquer = true,
}: {
  admin: PortAdministration;
  photos: PhotoVue[];
  nom: string;
  /** Une correction ou une contre-visite sans photo : NTanova a déjà celle de l'école. */
  sansNouvellePhoto?: boolean;
  surChangement: () => void;
  /** Faux sur une fiche refusée : ses photos ne paraîtront jamais, on ne les déclare pas publiables. */
  peutMarquer?: boolean;
}) {
  const [aEffacer, setAEffacer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<PhotoVue | null>(null);

  const agir = async (action: () => Promise<void>) => {
    setErreur(null);
    try {
      await action();
      surChangement();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setAEffacer(false);
    }
  };

  // La photo principale : l'enseigne, sinon la première reçue (planche : grande, en tête).
  const principale = photos.find((p) => p.role === 'signboard') ?? photos[0] ?? null;
  const rang = principale ? photos.indexOf(principale) + 1 : 0;
  // « On y voit » (étape 1 du relais) : un petit avertissement seulement quand il a coché autre chose que l'enseigne.
  const vu = principale?.role === 'signboard' ? (principale.onYVoit ?? []) : [];
  const autreQueLEnseigne = vu.some((v) => v !== 'signboard')
    ? ON_Y_VOIT.filter((o) => vu.includes(o.valeur))
        .map((o) => o.libelle.replace(/^L’|^Le /, (m) => m.toLowerCase()))
        .join(', ')
    : null;
  const agrandir = (p: PhotoVue) => {
    setAEffacer(false);
    setOuverte(p);
  };
  return (
    <>
      <div className="flex min-w-0 flex-col gap-3 self-start rounded-xl border border-border bg-card p-4 [grid-area:photo] max-lg:-mx-4 max-lg:-mt-5 max-lg:rounded-none max-lg:border-0 max-lg:p-0">
        {principale?.adresse ? (
          <div className="relative">
            <button
              type="button"
              className="block w-full cursor-zoom-in overflow-hidden rounded-lg border-0 bg-muted p-0 max-lg:rounded-none [&_img]:block [&_img]:aspect-[16/10] [&_img]:w-full [&_img]:object-cover"
              aria-label={`Agrandir : ${libelleRolePhoto[principale.role]}`}
              onClick={() => agrandir(principale)}
            >
              <img src={principale.adresse} alt={`${libelleRolePhoto[principale.role]} — ${nom}`} />
            </button>
            {autreQueLEnseigne && (
              <span
                className="pointer-events-none absolute top-2.5 left-2.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[13px] font-bold text-amber-900"
                role="note"
              >
                On y voit : {autreQueLEnseigne}
              </span>
            )}
            <span className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-full bg-card px-2.5 py-0.5 text-[13px] font-bold lg:hidden">
              {libelleRolePhoto[principale.role]} · {rang} sur {photos.length}
            </span>
          </div>
        ) : (
          <div className="flex aspect-[16/10] items-center justify-center rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
            {photos.length === 0
              ? sansNouvellePhoto
                ? 'Pas de nouvelle photo'
                : 'Photo pas encore reçue'
              : 'Photo illisible'}
          </div>
        )}
        {principale && peutParaitreSurLeSite(principale.role) && (
          <span className="flex items-center gap-3 max-lg:hidden">
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="text-[15px]">Photo publiable</b>
              <span className="text-sm text-muted-foreground">
                Sans enfant ni personne reconnaissable.
              </span>
            </span>
            <Bascule
              allumee={principale.publiable}
              libelle="Photo publiable"
              desactivee={!peutMarquer}
              surChange={(oui) => void agir(() => admin.marquerPhotoPubliable(principale.id, oui))}
            />
          </span>
        )}
      </div>

      {photos.length > 0 && (
        <section
          className={cn(
            'flex flex-col gap-1 self-start rounded-xl border border-border bg-card p-4 [grid-area:liste]',
            photos.length < 2 && 'lg:hidden',
          )}
          aria-label="Photos du relevé"
        >
          <h3 className="m-0 flex items-baseline justify-between font-sans text-[17px] font-bold">
            Photos du relevé
            <span className="text-sm font-normal text-muted-foreground">
              {photos.filter((p) => p.publiable && peutParaitreSurLeSite(p.role)).length} sur{' '}
              {photos.length} publiques
            </span>
          </h3>
          <p className="m-0 mb-1 text-sm text-muted-foreground">
            Publique seulement sans enfant reconnaissable.
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {photos.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <button
                  type="button"
                  className="size-14 shrink-0 cursor-zoom-in overflow-hidden rounded-md border-0 bg-muted p-0 [&_img]:size-full [&_img]:object-cover"
                  aria-label={`Agrandir : ${libelleRolePhoto[p.role]}`}
                  onClick={() => agrandir(p)}
                >
                  {p.adresse && <img src={p.adresse} alt="" />}
                </button>
                <b className="min-w-0 flex-1 text-[15px]">{libelleRolePhoto[p.role]}</b>
                {peutParaitreSurLeSite(p.role) ? (
                  <span
                    className="inline-flex overflow-hidden rounded-md border border-input"
                    role="group"
                    aria-label={`${libelleRolePhoto[p.role]} : publique ou écartée ?`}
                  >
                    {(
                      [
                        [
                          true,
                          'Publique',
                          'aria-pressed:bg-succes aria-pressed:text-primary-strong',
                        ],
                        [
                          false,
                          'Écarter',
                          'aria-pressed:bg-danger aria-pressed:text-danger-foreground',
                        ],
                      ] as const
                    ).map(([oui, texte, choisi]) => (
                      <button
                        key={texte}
                        type="button"
                        disabled={!peutMarquer}
                        aria-pressed={p.publiable === oui}
                        onClick={() => void agir(() => admin.marquerPhotoPubliable(p.id, oui))}
                        className={cn(
                          'min-h-10 cursor-pointer border-0 bg-card px-3 font-sans text-sm font-bold text-foreground not-first:border-l not-first:border-input disabled:cursor-not-allowed',
                          choisi,
                        )}
                      >
                        {texte}
                      </button>
                    ))}
                  </span>
                ) : (
                  <span className={v2.pastilleNeutre}>Travail, privée</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {erreur && <p className={cn(v2.erreur, '[grid-area:liste]')}>{erreur}</p>}
      {ouverte?.adresse && (
        <Dialogue
          titre={`${libelleRolePhoto[ouverte.role]} — ${nom}`}
          fermer={() => {
            setOuverte(null);
            setAEffacer(false);
          }}
          entete={<h2>{libelleRolePhoto[ouverte.role]}</h2>}
        >
          <img
            className="block h-auto max-h-[70dvh] w-full rounded-lg object-contain"
            src={ouverte.adresse}
            alt={`${libelleRolePhoto[ouverte.role]} — ${nom}`}
          />
          <div className={v2.actions}>
            <a className={v2.lien} href={ouverte.adresse} target="_blank" rel="noopener noreferrer">
              Ouvrir l’original
            </a>
            {/* Le droit d'effacement s'exerce aussi sur une fiche déjà décidée. */}
            {aEffacer ? (
              <Bouton
                variante="danger"
                onClick={() =>
                  void agir(async () => {
                    await admin.effacerPhoto(ouverte.id, null);
                    setOuverte(null);
                  })
                }
              >
                Confirmer : effacer la photo
              </Bouton>
            ) : (
              <button type="button" className={v2.lienDanger} onClick={() => setAEffacer(true)}>
                Effacer la photo
              </button>
            )}
          </div>
        </Dialogue>
      )}
    </>
  );
}

// Le détail d'un envoi -----------------------------------------------------------------------

function Detail({
  admin,
  id,
  lectureSeule,
  refusee = false,
  surDecision,
  rang = null,
  statutDecide = null,
}: {
  admin: PortAdministration;
  id: string;
  /** Une décision déjà prise : on la relit, on peut encore effacer, on ne décide plus. */
  lectureSeule: boolean;
  /** La décision prise est un refus : ses photos ne se marquent plus publiables. */
  refusee?: boolean;
  surDecision: (texte: string) => void;
  /** « 2 sur 15 » : où est cette fiche dans la file. */
  rang?: string | null;
  /** Une fiche décidée : sa décision, dite en tête (sur téléphone, la liste n'est plus à l'écran). */
  statutDecide?: ReleveDecide['statut'] | null;
}) {
  const [detail, setDetail] = useState<DetailReleve | null>(null);
  const [photos, setPhotos] = useState<PhotoVue[]>([]);
  const [divisions, setDivisions] = useState<DivisionVue[]>([]);
  // Les personnes à contacter, notées par le relais ou par l'administration (D7) : dans un tiroir, depuis la ligne
  // « Contacts » des faits.
  const [personnes, setPersonnes] = useState<ContactDirection[]>([]);
  const [contactsOuverts, setContactsOuverts] = useState(false);
  // Les séries et formations lues sur les photos (panneau, prospectus) : un tiroir, depuis la ligne « Formations ».
  const [domaines, setDomaines] = useState<DomainePublic[]>([]);
  const [formationsOuvertes, setFormationsOuvertes] = useState(false);
  const [efface, setEfface] = useState<string | null>(null);
  const [erreurContact, setErreurContact] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState('');
  // La position que l'administration lit sur une carte quand le téléphone du relais n'a pas pu la mesurer (ticket 144).
  const [positionTexte, setPositionTexte] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [mode, setMode] = useState<'correction' | 'refus' | null>(null);
  const [motif, setMotif] = useState<Valeur<'motif_decision'>>('photo_floue');
  const [message, setMessage] = useState('');
  const [operation, setOperation] = useState<
    'acceptation' | 'essai' | 'correction' | 'refus' | null
  >(null);
  const enCours = operation !== null;
  const [cible, setCible] = useState<Cible>({ mode: 'nouvelle' });
  const [corrections, setCorrections] = useState<CorrectionEcole>({});
  // Le numéro de l'enseigne que le relais a saisi : il est public, l'administration dit s'il est sur la photo.
  const [choixNumero, setChoixNumero] = useState<ChoixNumero | null>(null);
  // Lot G : le nom saisi se compare à l'enseigne ; « Différent » ouvre la correction avant d'accepter.
  const [nomCompare, setNomCompare] = useState<'comme' | 'different' | null>(null);
  const [demandeCorrection, setDemandeCorrection] = useState(0);
  // Planche : « Reprendre sur la fiche » garde tout ce que le relais a vu (par défaut), ou rien.
  const [garderBonus, setGarderBonus] = useState(true);
  const [editionInformations, setEditionInformations] = useState(false);
  const [formations, setFormations] = useState<FormationSaisie[]>([]);

  const chargerPhotos = useCallback(() => {
    admin
      .photosReleve(id)
      .then(setPhotos)
      .catch((e: unknown) => setErreur(messageErreur(e)));
  }, [admin, id]);

  // Les personnes ont changé (ajoutée, corrigée, effacée) : on les relit, car celles d'une correction peuvent venir de
  // la fiche d'origine.
  const relirePersonnes = async () => {
    setPersonnes(await admin.contactsReleve(id));
  };
  useEffect(() => {
    admin
      .domaines()
      .then(setDomaines)
      .catch(() => setDomaines([]));
  }, [admin]);
  useEffect(() => {
    admin
      .contactsReleve(id)
      .then(setPersonnes)
      .catch((e: unknown) => setErreurContact(messageErreur(e)));
  }, [admin, id]);

  useEffect(() => {
    Promise.all([admin.detailReleve(id), admin.photosReleve(id), admin.divisions()])
      .then(([d, p, div]) => {
        setDetail(d);
        setPhotos(p);
        setDivisions(div);
        // Ce que le relais a coché sur place préremplit les formations : l'administration le corrige avec les photos
        // avant d'accepter, et rien ne se publie seul (collecter, accepter, publier : trois gestes).
        setFormations(d.formationsVues);
        // Par défaut : une école déjà connue au même endroit (« la même ») se met à jour ; sinon, une nouvelle école.
        if (d.doublonDe && (d.reponseDoublon === 'la_meme' || d.type === 'contre_visite')) {
          setCible({ mode: 'update_campus', campusId: d.doublonDe.id });
        }
      })
      .catch((e: unknown) => setErreur(messageErreur(e)));
  }, [admin, id]);

  const agir = async (
    nom: NonNullable<typeof operation>,
    action: () => Promise<unknown>,
    texte: string,
  ) => {
    setOperation(nom);
    setErreur(null);
    try {
      await action();
      surDecision(texte);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOperation(null);
    }
  };

  if (!detail) {
    return (
      <section className="flex-1 p-4" aria-busy={!erreur}>
        {erreur ? <p className={v2.erreur}>{erreur}</p> : <p>Chargement…</p>}
      </section>
    );
  }

  const nouvelleEcole =
    cible.mode === 'nouvelle' &&
    !detail.essai &&
    (detail.type !== 'correction' || detail.corrigeUneFicheEnAttente);
  const retenues = nouvelleEcole ? corrections : {};
  const valeurs = { ...detail, ...retenues, nomEnseigne: retenues.nom ?? detail.nomEnseigne };
  const formationsRetenues = retenues.niveaux
    ? formations.filter((f) => retenues.niveaux?.includes(f.cycle))
    : formations;
  const position = detail.position;
  // Sur le lot d'entraînement, on se forme n'importe où : ni la zone ni le secteur ne disent rien.
  const enZoneOuverte = detail.essai ? null : detail.enZoneOuverte;
  const horsDuSecteur = detail.essai ? false : detail.horsLot === true;

  // La division de l'école : celle de la position quand un contour la contient. Sinon (aucun contour connu, ou ni position
  // ni lot), l'administration la choisit : la fiche ne retombe plus sur la division du lot du relais (ticket n° 67).
  const saisiePossible = peutSaisirLaPosition(detail, cible);
  const lecturePosition = saisiePossible ? lireChampPosition(positionTexte) : null;
  const saisie: PositionSaisie | null =
    saisiePossible && positionTexte.trim() !== '' && lecturePosition
      ? {
          illisible: lecturePosition.position === null,
          position: lecturePosition.position,
          contour: lecturePosition.position
            ? (arrondissementDeLaPosition(lecturePosition.position)?.nom ?? null)
            : null,
        }
      : null;
  const divisionRequise = divisionRequisePour(detail, cible, saisie);
  // Une position saisie dans un contour connu se passe de choix ; la division reste modifiable, comme dans « Situer ».
  const divisionFacultative = !divisionRequise && saisie?.position != null;
  const divisionsChoisissables = divisions
    .filter((d) => d.niveau >= 2)
    .map((d) => ({ id: d.id, chemin: cheminLisible(d.id, divisions) }))
    .sort((a, b) => a.chemin.localeCompare(b.chemin, 'fr'));
  // v2 (13/11) : le bonus du relais. L'administration garde ce qu'il a vu (tout, par défaut) ; elle n'ajoute jamais rien.
  const faitsBonus = faitsProposes(detail);
  const faitsGardes = garderBonus ? faitsBonus : [];
  const prospectus = photos.find((p) => p.role === 'brochure') ?? null;
  const decision = (): DecisionAcceptation => {
    const base: DecisionAcceptation = {
      formations: formationsRetenues,
      ...(faitsGardes.length > 0 ? { faits: faitsGardes } : {}),
      ...((divisionRequise || divisionFacultative) && divisionId !== '' ? { divisionId } : {}),
      ...(saisie?.position ? { position: saisie.position } : {}),
    };
    // Une correction d'une école déjà créée met l'école à jour : la base sait laquelle. Celle d'une fiche pas encore
    // acceptée se traite comme une nouvelle fiche (ticket #89).
    if (detail.type === 'correction' && !detail.corrigeUneFicheEnAttente) return {};
    switch (cible.mode) {
      case 'nouvelle':
        return {
          ...base,
          corrections: {
            // Le sigle lu par le relais remplit celui de la nouvelle école, sauf si l'administration l'a corrigé.
            ...(detail.sigle && retenues.sigle === undefined ? { sigle: detail.sigle } : {}),
            ...(choixNumero === 'retire' ? { ...retenues, numeroEnseigne: null } : retenues),
          },
          mode: 'new_institution',
          etiquette: null,
          ...(cible.memeLieuQue ? { memeLieuQue: cible.memeLieuQue } : {}),
        };
      case 'new_campus':
        return {
          ...base,
          mode: 'new_campus',
          institutionId: cible.institutionId,
          etiquette: null,
        };
      case 'update_campus':
        return { ...base, mode: 'update_campus', campusId: cible.campusId };
      case 'add_cycle':
        return { ...base, mode: 'add_cycle', campusId: cible.campusId };
    }
  };

  // Ce qui manque pour accepter : l'écran le dit, le bouton ne se grise jamais sans un mot (ticket #89).
  const numeroCorrige = retenues.numeroEnseigne !== undefined;
  const aConfirmer = numeroAConfirmer(valeurs, numeroCorrige);
  const manque =
    ceQuiManquePourAccepter(detail, cible, divisionId, saisie) ??
    ceQuiManqueDuNumero(aConfirmer, choixNumero);
  const cibleIncomplete = manque !== null;
  // « Pas sur la photo » : une nouvelle école naît sans numéro (la décision le dit à la base). Pour une implantation ou une
  // mise à jour, le numéro du relais remplace celui de l'école : on remet aussitôt après l'acceptation celui qu'elle avait
  // (aucun pour une nouvelle implantation).
  const accepterLaFiche = async () => {
    const retirerApres =
      aConfirmer !== null && choixNumero === 'retire' && cible.mode !== 'nouvelle';
    const ecoleConnue =
      cible.mode === 'update_campus' || cible.mode === 'add_cycle' ? cible.campusId : null;
    const ancien =
      retirerApres && ecoleConnue !== null
        ? ((await admin.ecoles()).find((e) => e.id === ecoleConnue)?.numeroEnseigne ?? null)
        : null;
    const campusId = await admin.accepter(id, decision());
    if (!retirerApres) return;
    try {
      await admin.modifierEcole(campusId, { numeroEnseigne: ancien });
    } catch {
      throw new ErreurDecision(
        'La fiche est acceptée, mais son numéro n’a pas pu être retiré : retire-le dans « Écoles › Gérer la fiche ».',
      );
    }
  };
  // Planche : « Accepter » ; l'encart ambre dit déjà ce que l'acceptation fera de la fiche.
  // Planche : « Accepter », ou « Accepter la correction » pour une correction (d'une école créée ou d'une fiche en attente).
  const texteAccepter = detail.type === 'correction' ? 'Accepter la correction' : 'Accepter';

  const ligneFait =
    'flex flex-col gap-1 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0';
  const libelleFait = 'text-[13px] font-bold text-muted-foreground';
  const nombreAccords = personnes.filter((p) => p.accord).length;
  const avecFormations =
    valeurs.niveaux.some(cycleAvecFormations) || detail.indiceFormations || formations.length > 0;
  const numeroSuspect = valeurs.numeroEnseigne
    ? numeroCongolaisSuspect(valeurs.numeroEnseigne)
    : null;
  return (
    <section
      className="grid min-w-0 flex-1 grid-cols-1 [grid-template-areas:'photo'_'encart'_'faits'_'liste'_'bonus'_'pied'] lg:[grid-template-areas:'tete'_'encart'_'photo'_'faits'_'liste'_'bonus'_'pied'] xl:grid-cols-2 xl:gap-x-4 xl:[grid-template-areas:'tete_tete'_'encart_encart'_'photo_faits'_'liste_faits'_'bonus_faits'_'pied_pied'] [&>*]:mb-4"
      aria-label="Envoi sélectionné"
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 [grid-area:tete] max-lg:sr-only">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="m-0 font-serif text-[26px] leading-tight font-bold">
            {detail.nomEnseigne}
          </h2>
          <p className="m-0 text-sm text-muted-foreground">
            {detail.relais} · reçue {quand(detail.prisLe)}
            {detail.lot && !detail.lotDeLaFicheDOrigine ? ` · Lot ${detail.lot}` : ''}
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {detail.type !== 'releve' && (
            <span className={v2.pastilleAttention}>{libelleType[detail.type]}</span>
          )}
          {statutDecide && (
            <span className={pastilleDecision[statutDecide]}>
              {libelleStatutReleve[statutDecide]}
            </span>
          )}
          {rang && <span className="text-sm text-muted-foreground">{rang}</span>}
        </span>
      </div>

      {!lectureSeule && detail.type === 'releve' && (
        <div className="[grid-area:encart]">
          <EcoleConnue
            admin={admin}
            releveId={detail.id}
            nom={detail.nomEnseigne}
            position={detail.position}
            reponseDuRelais={detail.reponseDoublon}
            cible={cible}
            choisir={setCible}
          />
        </div>
      )}

      <Photos
        admin={admin}
        photos={photos}
        nom={detail.nomEnseigne}
        sansNouvellePhoto={detail.type !== 'releve'}
        surChangement={chargerPhotos}
        peutMarquer={!refusee}
      />

      <section
        className="flex min-w-0 flex-col self-start rounded-xl border border-border bg-card p-4 [grid-area:faits]"
        aria-label="Partie publique"
      >
        <h3 className="sr-only">Public : ce qui se voit de la rue</h3>
        <dl className="m-0 flex flex-col [&_dd]:m-0 [&_dd]:text-[17px] [&_dd]:font-bold">
          <div className={ligneFait}>
            <dt className={libelleFait}>Nom de l'établissement</dt>
            <dd>{valeurs.nomEnseigne}</dd>
            {nouvelleEcole && !lectureSeule && (
              <span
                className="flex flex-wrap gap-2 pt-1"
                role="group"
                aria-label="Le nom, comparé à l’enseigne"
              >
                <button
                  type="button"
                  className={v2.puceCarree}
                  aria-pressed={nomCompare === 'comme'}
                  onClick={() => setNomCompare('comme')}
                >
                  Comme sur l’enseigne
                </button>
                <button
                  type="button"
                  className={v2.puceCarree}
                  aria-pressed={nomCompare === 'different'}
                  onClick={() => {
                    setNomCompare('different');
                    setDemandeCorrection((n) => n + 1);
                  }}
                >
                  Différent
                </button>
              </span>
            )}
          </div>
          {detail.sigle && (
            <div className={ligneFait}>
              <dt className={libelleFait}>Sigle</dt>
              <dd>{detail.sigle}</dd>
            </div>
          )}
          <div className={ligneFait}>
            <dt className={libelleFait}>Type</dt>
            <dd className="flex items-baseline justify-between gap-3">
              <span>{libelleTypeEcole[valeurs.typeEcole]}</span>
              {nouvelleEcole && !lectureSeule && (
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent p-0 font-sans text-[15px] font-normal text-primary underline underline-offset-4 max-lg:flex max-lg:size-10 max-lg:items-center max-lg:justify-center max-lg:rounded-md max-lg:border max-lg:border-input max-lg:text-foreground max-lg:no-underline"
                  aria-label="Corriger le type"
                  onClick={() => setDemandeCorrection((n) => n + 1)}
                >
                  <span className="max-lg:hidden">Corriger</span>
                  <IconeCorriger className="size-[18px] lg:hidden" aria-hidden />
                </button>
              )}
            </dd>
          </div>
          <div className={ligneFait}>
            <dt className={libelleFait}>Niveaux</dt>
            <dd className="flex items-baseline justify-between gap-3">
              <span>{valeurs.niveaux.map((n) => libelleNiveau[n]).join(', ') || '—'}</span>
              {nouvelleEcole && !lectureSeule && (
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent p-0 font-sans text-[15px] font-normal text-primary underline underline-offset-4 max-lg:flex max-lg:size-10 max-lg:items-center max-lg:justify-center max-lg:rounded-md max-lg:border max-lg:border-input max-lg:text-foreground max-lg:no-underline"
                  aria-label="Corriger les niveaux"
                  onClick={() => setDemandeCorrection((n) => n + 1)}
                >
                  <span className="max-lg:hidden">Corriger</span>
                  <IconeCorriger className="size-[18px] lg:hidden" aria-hidden />
                </button>
              )}
            </dd>
          </div>
          {avecFormations && (
            <div className={ligneFait}>
              <dt className={libelleFait}>Formations</dt>
              <dd className="flex items-baseline justify-between gap-3">
                <span>{formationsRetenues.map((f) => f.titre).join(', ') || '—'}</span>
                {!lectureSeule && (
                  <button
                    type="button"
                    className="cursor-pointer border-0 bg-transparent p-0 font-sans text-[15px] font-normal text-primary underline underline-offset-4 max-lg:flex max-lg:size-10 max-lg:items-center max-lg:justify-center max-lg:rounded-md max-lg:border max-lg:border-input max-lg:text-foreground max-lg:no-underline"
                    aria-label="Corriger les formations"
                    onClick={() => setFormationsOuvertes(true)}
                  >
                    <span className="max-lg:hidden">Corriger</span>
                    <IconeCorriger className="size-[18px] lg:hidden" aria-hidden />
                  </button>
                )}
              </dd>
            </div>
          )}
          {detail.programme && (
            <div className={ligneFait}>
              <dt className={libelleFait}>Programme</dt>
              <dd>{detail.programme}</dd>
            </div>
          )}
          {(detail.programmesVus !== null || detail.programmesEnPhoto) && (
            <div className={ligneFait}>
              <dt className={libelleFait}>Séries ou filières vues</dt>
              <dd>
                {detail.programmesVus ?? '—'}
                {detail.programmesEnPhoto && (
                  <span className="block text-sm font-normal text-muted-foreground">
                    Le relais les a aussi prises en photo (panneau, affiche ou prospectus).
                  </span>
                )}
              </dd>
            </div>
          )}
          <div className={ligneFait}>
            <dt className={libelleFait}>Numéro sur l'enseigne</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {valeurs.numeroEnseigne ? afficherTelephone(valeurs.numeroEnseigne) : '—'}
              {aConfirmer !== null && !lectureSeule && choixNumero === null && (
                <span className={v2.pastilleAttention}>Sur la photo ?</span>
              )}
            </dd>
            {numeroSuspect && (
              <span className="text-[13px] font-bold text-bonus">
                {numeroSuspect.chiffres} chiffres après +242 : un numéro congolais en a 9. Relis-le
                sur la photo.
              </span>
            )}
            {aConfirmer !== null && !lectureSeule && (
              <>
                <span
                  className="flex flex-wrap gap-2 pt-1"
                  role="group"
                  aria-label="Le numéro, sur la photo ?"
                >
                  <button
                    type="button"
                    className={v2.puceCarree}
                    aria-pressed={choixNumero === 'verifie'}
                    onClick={() => setChoixNumero('verifie')}
                  >
                    Sur la photo
                  </button>
                  {numeroPeutEtreRetire(detail) && (
                    <button
                      type="button"
                      className={v2.puceCarree}
                      aria-pressed={choixNumero === 'retire'}
                      onClick={() => setChoixNumero('retire')}
                    >
                      Pas sur la photo
                    </button>
                  )}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {numeroPeutEtreRetire(detail)
                    ? 'Publié tel quel, avec « Appeler » ; « Pas sur la photo » : il ne sera pas publié.'
                    : 'Pour ne pas le publier, accepte puis retire-le dans la fiche de l’école.'}
                </span>
              </>
            )}
          </div>
          <div className={ligneFait}>
            <dt className={libelleFait}>Où</dt>
            <dd className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="inline-flex items-center gap-1.5">
                {enZoneOuverte === false || position === null ? (
                  <Icone nom="alerte" taille={16} />
                ) : null}
                {position === null
                  ? 'Sans position'
                  : enZoneOuverte === false
                    ? 'Hors zone ouverte'
                    : enZoneOuverte === true
                      ? 'En zone ouverte'
                      : detail.essai
                        ? 'Position prise'
                        : 'Zone inconnue'}
              </span>
              {position && (
                <a
                  className="text-[15px] text-primary underline underline-offset-4"
                  href={`https://www.openstreetmap.org/?mlat=${position.latitude}&mlon=${position.longitude}#map=18/${position.latitude}/${position.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Voir sur OpenStreetMap"
                >
                  Carte
                </a>
              )}
            </dd>
            <span className="text-[13px] text-muted-foreground">
              {[
                detail.precisionM !== null ? `précision ${Math.round(detail.precisionM)} m` : null,
                detail.repere ? `repère : ${detail.repere}` : null,
                horsDuSecteur ? `hors du secteur de ${detail.relais}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {!lectureSeule && saisiePossible && (
              <ChampPosition
                valeur={positionTexte}
                surChange={setPositionTexte}
                erreur={
                  saisie?.illisible === true ? lireChampPosition(positionTexte).erreur : undefined
                }
                facultatif
                aide="Lue sur la capture Google Maps du relais (clic droit sur l’entrée de l’école), par exemple -4.79105, 11.92500."
              />
            )}
            {!lectureSeule && (divisionRequise || divisionFacultative) && (
              <Champ libelle="Division de l’école">
                {(a) => (
                  <select
                    {...a}
                    className={v2.champ}
                    value={divisionId}
                    onChange={(ev) => setDivisionId(ev.target.value)}
                  >
                    <option value="">
                      {divisionFacultative
                        ? 'Détectée d’après la position'
                        : 'Choisir une division…'}
                    </option>
                    {divisionsChoisissables.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.chemin}
                      </option>
                    ))}
                  </select>
                )}
              </Champ>
            )}
          </div>
          <div className={ligneFait}>
            <dt className={libelleFait}>Contacts de la direction</dt>
            <dd className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                {personnes.length === 0
                  ? 'Aucun'
                  : `${personnes.length} personne${personnes.length > 1 ? 's' : ''} · ${nombreAccords} accord${nombreAccords > 1 ? 's' : ''}`}
                {erreurContact ? ' · à réessayer' : ''}
              </span>
              <button
                type="button"
                onClick={() => setContactsOuverts(true)}
                aria-label="Contact et échanges avec la direction"
                className="cursor-pointer border-0 bg-transparent p-0 font-sans text-[15px] font-bold text-primary underline underline-offset-4"
              >
                {personnes.length === 0 ? 'Ajouter' : 'Voir'}
              </button>
            </dd>
          </div>
        </dl>
      </section>

      {(faitsBonus.length > 0 || detail.remarque) && (
        <section
          className="flex flex-col gap-2 rounded-xl border-2 border-dashed border-ambre bg-card p-4 text-[15px] [grid-area:bonus]"
          aria-label="Le bonus du relais"
        >
          <h3 className="m-0 flex items-baseline justify-between gap-3 font-sans text-[17px] font-bold">
            Bonus du relais
            <span className="text-sm font-normal text-muted-foreground">non payé</span>
          </h3>
          {faitsBonus.length > 0 && (
            <p className="m-0">
              Vu :{' '}
              {faitsBonus
                .map((f) =>
                  f.cle === 'cloture'
                    ? `clôture ${f.etat === 'present' ? 'oui' : 'non'}`
                    : libelleEquipement[f.cle].toLocaleLowerCase('fr'),
                )
                .join(', ')}
            </p>
          )}
          {detail.remarque && <p className="m-0 text-muted-foreground">« {detail.remarque} »</p>}
          {faitsBonus.length > 0 && !lectureSeule && (
            <span className="flex items-center justify-between gap-3">
              <b>Reprendre sur la fiche</b>
              <Bascule
                allumee={garderBonus}
                libelle="Reprendre sur la fiche"
                surChange={setGarderBonus}
              />
            </span>
          )}
          {prospectus?.adresse && (
            <a
              className={v2.lien}
              href={prospectus.adresse}
              target="_blank"
              rel="noopener noreferrer"
            >
              Lire le prospectus pour les frais
            </a>
          )}
        </section>
      )}

      {erreur && (
        <p className={cn(v2.erreur, '[grid-area:pied]')} role="alert">
          {erreur}
        </p>
      )}

      {lectureSeule ? (
        <p className="m-0 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground [grid-area:pied]">
          Décision prise. Pour revenir dessus : demander au relais une nouvelle fiche (un refus est
          définitif), ou agir sur l'école dans l'onglet « Écoles ».
        </p>
      ) : (
        <>
          {nouvelleEcole && (
            <CorrectionAvantAcceptation
              fiche={detail}
              correction={corrections}
              surChangement={setCorrections}
              surEdition={setEditionInformations}
              demande={demandeCorrection}
            />
          )}
          {/* Les boutons sont un enfant direct de la fiche : « collants », ils restent à l'écran pendant tout son défilement. */}
          <fieldset
            className="sticky bottom-16 z-10 m-0 -mx-4 mb-0! flex min-w-0 flex-col gap-3 self-end border-0 border-t border-border bg-background px-4 py-3 [grid-area:pied] lg:bottom-0 lg:mx-0 lg:px-0"
            disabled={enCours}
            aria-label="Accepter, corriger ou refuser"
          >
            <div className={v2.actions}>
              {!detail.essai && (
                <Bouton
                  type="button"
                  enCours={operation === 'acceptation'}
                  texteEnCours="Acceptation…"
                  disabled={enCours || cibleIncomplete || editionInformations}
                  onClick={() =>
                    void agir(
                      'acceptation',
                      accepterLaFiche,
                      cible.mode === 'update_campus' || cible.mode === 'add_cycle'
                        ? 'La fiche de l’école est mise à jour. Si elle était déjà en ligne, la correction paraît après la prochaine mise à jour du site ; sinon, publie-la depuis « Écoles ».'
                        : ACCEPTEE,
                    )
                  }
                >
                  {texteAccepter}
                </Bouton>
              )}
              {detail.essai && !detail.essaiValideLe && (
                <Bouton
                  type="button"
                  enCours={operation === 'essai'}
                  texteEnCours="Validation…"
                  disabled={enCours}
                  onClick={() =>
                    void agir(
                      'essai',
                      () => admin.validerEssai(id),
                      'Validée avec le relais : elle compte pour son essai et ne sera jamais publiée.',
                    )
                  }
                >
                  Valider pour l’essai
                </Bouton>
              )}
              <button
                type="button"
                className={v2.boutonSecondaire}
                disabled={editionInformations}
                aria-expanded={mode === 'correction'}
                onClick={() => setMode(mode === 'correction' ? null : 'correction')}
                aria-label="Demander une correction"
              >
                <span className="lg:hidden">Corriger</span>
                <span className="max-lg:hidden">Demander une correction</span>
              </button>
              <span
                className={cn(
                  'text-sm',
                  'max-lg:order-last max-lg:w-full max-lg:text-center',
                  manque && !detail.essai ? 'font-bold text-bonus' : 'text-muted-foreground',
                )}
                role={manque && !detail.essai ? 'status' : undefined}
              >
                {manque && !detail.essai
                  ? manque
                  : detail.essai
                    ? 'Lot d’essai : cette fiche ne sera jamais publiée.'
                    : 'Accepter crée l’école sans la publier.'}
              </span>
              <button
                type="button"
                className={cn(v2.boutonRefus, 'ml-auto max-lg:hidden')}
                disabled={editionInformations}
                aria-expanded={mode === 'refus'}
                onClick={() => {
                  setMode(mode === 'refus' ? null : 'refus');
                  setMotif('autre');
                }}
              >
                Refuser
              </button>
              {/* Téléphone (planche) : « Refuser » est derrière « ⋯ », à l'écart des deux autres gestes. */}
              <div className="lg:hidden">
                <ActionsSecondaires nom={detail.nomEnseigne} versLeHaut>
                  <button
                    type="button"
                    className="text-destructive!"
                    disabled={editionInformations}
                    onClick={() => {
                      setMode('refus');
                      setMotif('autre');
                    }}
                  >
                    Refuser
                  </button>
                </ActionsSecondaires>
              </div>
            </div>

            {mode && (
              <Dialogue
                titre={mode === 'correction' ? 'Demander une correction' : 'Refuser la fiche'}
                variante="confirmation"
                occupe={enCours}
                fermer={() => setMode(null)}
                libelleFermeture="Annuler"
                entete={
                  <h2>{mode === 'correction' ? 'Demander une correction' : 'Refuser la fiche'}</h2>
                }
              >
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const texte = message.trim() || null;
                    // « autre » ne dit rien tout seul : sans message, rien ne part (la base refuse aussi).
                    const manque = messageManquant(motif, texte);
                    if (manque) {
                      setErreur(manque);
                      return;
                    }
                    void agir(
                      mode,
                      () =>
                        mode === 'correction'
                          ? admin.demanderCorrection(id, motif, texte)
                          : admin.refuser(id, motif, texte),
                      mode === 'correction'
                        ? 'La demande de correction part au relais.'
                        : 'La fiche est refusée.',
                    );
                  }}
                >
                  <fieldset disabled={enCours} className={v2.occupe}>
                    <Champ libelle="Motif">
                      {(a) => (
                        <select
                          {...a}
                          className={v2.champ}
                          value={motif}
                          onChange={(e) => setMotif(e.target.value as Valeur<'motif_decision'>)}
                        >
                          {motifsProposes.map((m) => (
                            <option key={m} value={m}>
                              {libelleMotif[m]}
                            </option>
                          ))}
                        </select>
                      )}
                    </Champ>
                    <Champ
                      libelle="Message au relais"
                      facultatif={motif !== 'autre'}
                      aide={
                        motif === 'autre'
                          ? 'Obligatoire avec « Autre » : dis au relais ce qu’il doit faire. Il le lit dans « Mes fiches ». Vouvoie-le.'
                          : 'Le relais le lit dans « Mes fiches ». Vouvoie-le.'
                      }
                    >
                      {(a) => (
                        <textarea
                          {...a}
                          className={v2.champ}
                          rows={2}
                          maxLength={500}
                          placeholder="Ex. : la photo est floue, reprenez-la de face."
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                        />
                      )}
                    </Champ>
                    <Bouton
                      type="submit"
                      variante={mode === 'refus' ? 'danger' : 'principal'}
                      enCours={operation === mode}
                      texteEnCours={mode === 'correction' ? 'Envoi de la demande…' : 'Refus…'}
                      disabled={enCours}
                    >
                      {mode === 'correction' ? 'Envoyer la demande' : 'Refuser la fiche'}
                    </Bouton>
                    {erreur && (
                      <p className={v2.erreur} role="alert">
                        {erreur}
                      </p>
                    )}
                  </fieldset>
                </form>
              </Dialogue>
            )}
          </fieldset>
        </>
      )}
      {formationsOuvertes && (
        <Dialogue
          titre="Formations lues sur les photos"
          variante="tiroir"
          fermer={() => setFormationsOuvertes(false)}
          entete={<h2>Formations lues sur les photos</h2>}
        >
          <p className={v2.mention}>
            Lis le panneau ou le prospectus : les séries et formations notées ici rendent l’école
            cherchable (série C, BTS, licence…). Elles partent avec l’acceptation.
          </p>
          <Formations
            cycles={valeurs.niveaux}
            formations={formationsRetenues}
            domaines={domaines}
            surChangement={setFormations}
          />
        </Dialogue>
      )}
      {contactsOuverts && (
        <Dialogue
          titre="Contact et échanges avec la direction"
          variante="tiroir"
          fermer={() => setContactsOuverts(false)}
          entete={<h2>Contact et échanges avec la direction</h2>}
        >
          {efface && (
            <p className={v2.bandeSucces} role="status">
              {efface}
            </p>
          )}
          {erreurContact && (
            <p className={v2.erreur} role="alert">
              {erreurContact}
            </p>
          )}
          <Personnes
            admin={admin}
            id={id}
            detail={detail}
            personnes={personnes}
            surChangement={relirePersonnes}
            annoncer={setEfface}
            surErreur={setErreurContact}
          />
          {personnes.length > 0 && (
            <section className={v2.pileSerree} aria-label="Écrire à la direction">
              <h3 className={cn(v2.rang, 'm-0 text-base font-bold')}>Écrire à la direction</h3>
              <Pont admin={admin} detail={detail} contacts={personnes} surAnnonce={setEfface} />
            </section>
          )}
        </Dialogue>
      )}
    </section>
  );
}

/** Les faits que propose le bonus d'un relevé : chaque équipement vu, et la clôture (oui ou non). */
function faitsProposes(d: Pick<DetailReleve, 'vusSurPlace' | 'cloture'>): FaitGarde[] {
  return [
    ...(d.vusSurPlace ?? []).map((cle): FaitGarde => ({ cle, etat: 'present' })),
    ...(d.cloture
      ? [
          {
            cle: 'cloture' as const,
            etat: d.cloture === 'oui' ? ('present' as const) : ('absent' as const),
          },
        ]
      : []),
  ];
}
