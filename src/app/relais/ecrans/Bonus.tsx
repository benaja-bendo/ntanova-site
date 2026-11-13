/**
 * Le bonus (lot B du ticket 165, canevas « Espace relais », 12/11) : la fiche est complète, tout ici est en plus. Ce que le relais
 * a vu (« vu » seulement, jamais « absent ») ; la clôture, oui ou non, parce qu'elle se voit de la rue ; cinq photos au plus en
 * plus de l'enseigne, des lieux vides pour la page de l'école, et des photos de travail pour NTanova, jamais publiées. Le bonus
 * ne bloque jamais l'envoi et n'est pas payé.
 */
import { useEffect, useMemo, useState } from 'react';
import { libelleEquipement } from '../../../modele/equipements-ecole';
import {
  avecPhoto,
  peutAjouterPhoto,
  photosFacultatives,
  PHOTOS_FACULTATIVES_MAX,
  ROLES_DE_TRAVAIL,
  ROLES_POUR_LA_PAGE,
  sansPhoto,
  type FicheLocale,
  type PhotoLocale,
} from '../../../modele/fiche';
import { libelleRolePhotoCourt } from '../../../modele/libelles';
import { listes, type Valeur } from '../../../modele/listes';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/shadcn/alert-dialog';
import { Button } from '@/ui/shadcn/button';
import { aller } from '../contexte';
import { EnteteEtape } from '../composants';
import { Choix } from '../formulaire';
import { cn } from '@/lib/utils';
import {
  IconeAjouter,
  IconeChargement,
  IconeFait,
  IconeFermer,
  IconeOeilBarre,
  IconeSansEnfant,
} from '@/ui/shadcn/icones';
import { PiedFixe } from '../cadre';
import { Segments, TitreAvecAide } from '../choix';
import { Bande } from '../etats';
import { journaliser } from '../journal';
import { alleger, PhotoTropLourde } from '../photo';
import { useEnregistrer, type Modifier } from './fiche-en-cours';

/** Les équipements qu'on coche « vu » : tout sauf la clôture (oui ou non) et « autre » (qui demande une précision). */
const VUS = listes.equipment_key.filter((k) => k !== 'cloture' && k !== 'autre');

export function Bonus({ fiche, modifier }: { fiche: FicheLocale; modifier: Modifier }) {
  const enregistrer = useEnregistrer(fiche);
  const [envoi, setEnvoi] = useState(false);
  // Une photo en préparation : « Envoyer la fiche » attend qu'elle soit gardée, sinon son enregistrement arriverait après
  // et remettrait la fiche en brouillon (elle ne partirait jamais, sans rien dire).
  const [prepare, setPrepare] = useState(0);
  const vus = fiche.vusSurPlace ?? [];
  const basculer = (k: Valeur<'equipment_key'>) =>
    modifier({ vusSurPlace: vus.includes(k) ? vus.filter((x) => x !== k) : [...vus, k] });
  const cloture = fiche.cloture === 'oui' ? 'oui' : fiche.cloture === 'non' ? 'non' : 'pas_vu';
  return (
    <div className="ecran">
      <EnteteEtape etape={4} titre="Le bonus" retour="ajouter/3" type={fiche.type} />
      <main className="flex flex-1 flex-col gap-[18px] px-4 py-3.5">
        <Bande ton="succes" icone={<IconeFait />}>
          <p className="text-[15px]">La fiche est complète. Tout ici est en plus.</p>
        </Bande>

        <section className="flex flex-col gap-2.5" aria-label="Ce que vous avez vu">
          <TitreAvecAide
            titre="Ce que vous avez vu"
            libelleAide="Aide : ce que vous avez vu"
            aide={
              <p>
                Touchez ce que vous avez vu de vos yeux. Ce que vous n’avez pas vu,
                laissez-le&nbsp;: ce n’est pas «&nbsp;absent&nbsp;».
              </p>
            }
          />
          <Choix
            legende="Ce que vous avez vu"
            cacherLegende
            options={VUS.map((k) => ({ valeur: k, libelle: libelleEquipement[k] }))}
            valeurs={vus}
            surChoix={basculer}
            colonnes={2}
          />
          <div className="flex items-center gap-3">
            <span id="cloture" className="w-[90px] shrink-0 text-base font-bold">
              Clôture
            </span>
            <div className="flex-1">
              <Segments
                legende="Clôture"
                options={[
                  { valeur: 'oui', libelle: 'Oui' },
                  { valeur: 'non', libelle: 'Non' },
                  { valeur: 'pas_vu', libelle: 'Pas vu' },
                ]}
                valeur={cloture}
                surChoix={(v) => modifier({ cloture: v === 'pas_vu' ? null : v })}
              />
            </div>
          </div>
        </section>

        <PhotosEnPlus fiche={fiche} modifier={modifier} prepare={prepare} setPrepare={setPrepare} />
      </main>
      <PiedFixe>
        <Button
          size="xl"
          className="w-full"
          disabled={prepare > 0 || envoi}
          aria-busy={envoi || undefined}
          onClick={() => {
            setEnvoi(true);
            void enregistrer().finally(() => setEnvoi(false));
          }}
        >
          {envoi
            ? 'Enregistrement…'
            : prepare > 0
              ? 'Préparation de la photo…'
              : 'Envoyer la fiche'}
        </Button>
      </PiedFixe>
    </div>
  );
}

/** Le mot d'une tuile, court comme sur la planche (le nom accessible garde le libellé entier). */
const MOT_DE_LA_TUILE: Partial<Record<PhotoLocale['role'], string>> = {
  building: 'Bâtiment',
  courtyard: 'Cour',
  room_empty: 'Une salle',
  sports_ground: 'Terrain',
  entrance: 'Portail',
  brochure: 'Prospectus',
  enrollment_poster: 'Affiche d’inscription',
  programs_board: 'Programmes',
};

/** Les photos en plus, en deux groupes ; un compteur « 2 sur 5 » ; la sixième est refusée avec sa raison. */
function PhotosEnPlus({
  fiche,
  modifier,
  prepare,
  setPrepare,
}: {
  fiche: FicheLocale;
  modifier: Modifier;
  prepare: number;
  setPrepare: (f: (n: number) => number) => void;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const autres = photosFacultatives(fiche);
  const apercus = useMemo(
    () =>
      Object.fromEntries(
        autres.flatMap((p) => (p.blob ? [[p.id, URL.createObjectURL(p.blob)] as const] : [])),
      ),
    [autres],
  );
  useEffect(() => () => Object.values(apercus).forEach((u) => URL.revokeObjectURL(u)), [apercus]);

  const ajouter = async (fichier: File | undefined, role: PhotoLocale['role']) => {
    if (!fichier) return;
    setErreur(null);
    if (!peutAjouterPhoto(fiche)) {
      setErreur(
        `Cinq photos au plus en plus de l’enseigne : retirez-en une pour en ajouter une autre.`,
      );
      return;
    }
    setPrepare((n) => n + 1);
    try {
      const a = await alleger(fichier);
      const photo: PhotoLocale = {
        id: crypto.randomUUID(),
        role,
        blob: a.blob,
        mime: a.mime,
        octets: a.octets,
        largeur: a.largeur,
        hauteur: a.hauteur,
        prisLe: new Date().toISOString(),
        envoyee: false,
      };
      modifier((f) => ({ photos: avecPhoto(f, photo).photos }));
    } catch (e) {
      await journaliser(
        'bonus',
        e instanceof PhotoTropLourde ? 'photo_trop_lourde' : 'photo_illisible',
        e,
      );
      setErreur('Cette photo ne peut pas être lue. Reprenez-la, ou choisissez-en une autre.');
    } finally {
      setPrepare((n) => n - 1);
    }
  };

  const groupe = (titre: string, roles: readonly PhotoLocale['role'][], note?: string) => (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 font-sans text-base font-bold">
        {titre}{' '}
        {note && <span className="text-[15px] font-normal text-muted-foreground">{note}</span>}
      </h3>
      <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
        {roles.map((role) => {
          const prise = autres.find((p) => p.role === role);
          const libelle = libelleRolePhotoCourt[role];
          const court = MOT_DE_LA_TUILE[role] ?? libelle;
          return (
            <li key={role} className="relative aspect-[4/3]">
              {prise ? (
                <span className="relative block size-full overflow-hidden rounded-md bg-border">
                  {apercus[prise.id] && (
                    <img src={apercus[prise.id]} alt={libelle} className="size-full object-cover" />
                  )}
                  <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs font-bold">
                    {(ROLES_DE_TRAVAIL as readonly string[]).includes(role) && (
                      <IconeOeilBarre className="size-3.5" />
                    )}
                    {court}
                    <IconeFait className="size-3.5 [stroke-width:2.6]" />
                  </span>
                  <button
                    type="button"
                    aria-label={`Retirer la photo : ${libelle}`}
                    onClick={() => modifier((f) => ({ photos: sansPhoto(f, prise.id).photos }))}
                    className="absolute top-1 right-1 flex size-8 cursor-pointer items-center justify-center rounded-full border-0 bg-card p-0 text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                  >
                    <IconeFermer className="size-4" />
                  </button>
                </span>
              ) : (
                <label
                  className={cn(
                    'flex size-full cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-input px-1 text-center text-[13px] leading-tight font-bold text-primary focus-within:ring-[3px] focus-within:ring-ring',
                    !peutAjouterPhoto(fiche) && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <IconeAjouter className="size-5" />
                  {court}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    aria-label={`Photo : ${libelle}`}
                    disabled={!peutAjouterPhoto(fiche)}
                    onChange={(e) => {
                      void ajouter(e.target.files?.[0], role);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <section className="flex flex-col gap-3" aria-labelledby="photos-en-plus">
      <div className="flex items-baseline justify-between">
        <h2 id="photos-en-plus" className="m-0 font-serif text-[19px] leading-tight font-bold">
          Photos en plus
        </h2>
        <span className="text-[15px] text-muted-foreground tabular-nums">
          {autres.length} sur {PHOTOS_FACULTATIVES_MAX}
        </span>
      </div>
      <a
        href="#aide/regles"
        className="flex items-center gap-2 text-[15px] font-bold text-destructive no-underline"
      >
        <IconeSansEnfant className="size-[18px]" />
        Aucun enfant sur les photos · les règles
      </a>
      {groupe('Pour la page de l’école', ROLES_POUR_LA_PAGE)}
      {groupe('Pour NTanova', ROLES_DE_TRAVAIL, '(facultatif, non publiées)')}
      {prepare > 0 && (
        <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <IconeChargement className="size-4 animate-spin motion-reduce:animate-none" />
          Préparation de la photo…
        </p>
      )}
      {erreur && (
        <p className="m-0 text-sm font-bold text-destructive" role="alert">
          {erreur}
        </p>
      )}
    </section>
  );
}

/**
 * « Envoyer maintenant », depuis l'étape 3 : une fenêtre demande confirmation, « Ajouter le bonus » en bouton principal
 * (canevas : AlertDialog). La fiche est complète : l'envoyer sans bonus est permis.
 */
export function EnvoyerSansBonus({
  avant,
  enregistrer,
}: {
  avant: () => boolean;
  enregistrer: () => Promise<void>;
}) {
  const [ouverte, setOuverte] = useState(false);
  const [enCours, setEnCours] = useState(false);
  return (
    <AlertDialog open={ouverte} onOpenChange={(o) => !enCours && setOuverte(o)}>
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        aria-haspopup="dialog"
        onClick={() => {
          if (avant()) setOuverte(true);
        }}
      >
        Envoyer maintenant
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Envoyer sans le bonus&nbsp;?</AlertDialogTitle>
          <AlertDialogDescription>
            La fiche est complète. Le bonus prend deux minutes&nbsp;: ce que vous avez vu, et des
            photos en plus.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button size="lg" disabled={enCours} onClick={() => aller('ajouter/bonus')}>
            Ajouter le bonus
          </Button>
          <Button
            variant="outline"
            size="lg"
            disabled={enCours}
            aria-busy={enCours || undefined}
            onClick={() => {
              setEnCours(true);
              void enregistrer().finally(() => setEnCours(false));
            }}
          >
            {enCours ? 'Enregistrement…' : 'Envoyer sans bonus'}
          </Button>
          <AlertDialogCancel asChild>
            <Button variant="ghost" size="lg" disabled={enCours}>
              Annuler
            </Button>
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
