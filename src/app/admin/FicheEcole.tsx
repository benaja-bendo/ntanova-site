/**
 * La fiche d'une école en plein écran, d'après les planches « Fiche d'école, admin » (ordinateur et téléphone) : la carte
 * de l'école (couverture, rond du logo à cheval, nom et crayon, sigle, type, lieu, état, ses sites), ses photos, ses
 * rubriques en cartes, et à droite ce qui lui manque (la jauge « 7/10 »), ce qui est en cours et son historique. Chaque
 * carte ouvre sa rubrique (un tiroir à droite sur ordinateur, un écran plein sur téléphone) : `ouvrir` la nomme.
 * Tailwind et shadcn seulement.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { v2 } from '@/ui/v2/classes';
import {
  IconeAjouter,
  IconeCadenas,
  IconeCamera,
  IconeCorriger,
  IconeOuvrir,
} from '@/ui/shadcn/icones';
import {
  completudeDeLaFiche,
  libelleSujetDemande,
  type Manque,
  type MediaAdmin,
  type NouvelleAdmin,
} from '../../modele/fiche-admin';
import { libelleEquipement } from '../../modele/equipements-ecole';
import {
  libelleNiveau,
  libelleRolePhotoCourt,
  libelleTypeEcole,
  libelleTypeMission,
} from '../../modele/libelles';
import type { EcoleVue, PhotoVue, PortAdministration } from '../../modele/ports';
import { jour } from '../../ui/composants';

export type RubriqueFiche =
  | 'completer'
  | 'modifier'
  | 'situer'
  | 'equipements'
  | 'frais'
  | 'contact-public'
  | 'inscriptions'
  | 'agrement'
  | 'mot-direction'
  | 'images'
  | 'photo-publique'
  | 'nouvelles'
  | 'admission'
  | 'formations'
  | 'mission';

/** « Maternelle à Collège » : du premier au dernier niveau, comme la planche. */
function etendue(niveaux: EcoleVue['niveaux']): string {
  if (niveaux.length === 0) return 'Aucun niveau';
  if (niveaux.length === 1) return libelleNiveau[niveaux[0]!];
  return `${libelleNiveau[niveaux[0]!]} à ${libelleNiveau[niveaux.at(-1)!].toLocaleLowerCase('fr')}`;
}

/** Le cercle de la jauge (planche : « 7/10 », l'arc vert sur le gris). */
function Jauge({ remplies, total }: { remplies: number; total: number }) {
  const r = 22;
  const tour = 2 * Math.PI * r;
  return (
    <span className="relative flex size-14 shrink-0 items-center justify-center">
      <svg viewBox="0 0 52 52" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--trait)" strokeWidth="5" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke="var(--marque-appuyee)"
          strokeWidth="5"
          strokeDasharray={`${(tour * remplies) / Math.max(1, total)} ${tour}`}
          strokeLinecap="round"
        />
      </svg>
      <b className="text-[13px]">
        {remplies}/{total}
      </b>
    </span>
  );
}

/** Une carte de rubrique : le titre, une ligne de résumé, une ligne douce (ou ce qui manque, en rouge), le chevron. */
function CarteRubrique({
  titre,
  resume,
  detail,
  manque,
  ouvrir,
}: {
  titre: string;
  resume: ReactNode;
  detail?: ReactNode;
  manque?: string | null;
  ouvrir: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={ouvrir}
        aria-label={`${titre} : ouvrir`}
        className="flex h-full w-full cursor-pointer flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3.5 text-left font-sans text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring max-lg:rounded-none max-lg:border-0 max-lg:border-b [@media(hover:hover)]:hover:border-primary"
      >
        <span className="flex items-center justify-between gap-2">
          <b className="text-[17px]">{titre}</b>
          <IconeOuvrir className="size-5 shrink-0" aria-hidden />
        </span>
        <span className="text-[15px] leading-snug">{resume}</span>
        {manque ? (
          <span className="text-sm font-bold text-destructive">{manque}</span>
        ) : (
          detail && <span className="text-sm text-muted-foreground">{detail}</span>
        )}
      </button>
    </li>
  );
}

export function FicheEcole({
  e,
  sites,
  etat,
  admin,
  ouvrir,
  memeLieu,
  retirerMemeLieu,
  publier,
  gestes,
}: {
  e: EcoleVue;
  sites: EcoleVue[];
  etat: 'a_situer' | 'prete' | 'publiee' | 'retiree' | 'corbeille' | 'brouillon';
  admin: PortAdministration;
  ouvrir: (rubrique: RubriqueFiche) => void;
  memeLieu: EcoleVue | null;
  retirerMemeLieu: () => void;
  /** « Publier » quand la fiche est prête (absent sinon). */
  publier: ReactNode;
  /** L'aperçu et « ⋯ » : sur ordinateur, en haut de la fiche ; sur téléphone, dans la barre verte. */
  gestes: ReactNode;
}) {
  const [medias, setMedias] = useState<MediaAdmin[] | null>(null);
  const [manques, setManques] = useState<Manque[] | null>(null);
  const [photos, setPhotos] = useState<PhotoVue[]>([]);
  const [travail, setTravail] = useState<PhotoVue[]>([]);
  const [nouvelles, setNouvelles] = useState<NouvelleAdmin[]>([]);
  useEffect(() => {
    let vivant = true;
    const garder =
      <T,>(f: (v: T) => void, defaut: T) =>
      (p: Promise<T>) =>
        void p.then((v) => vivant && f(v)).catch(() => vivant && f(defaut));
    garder(setMedias, [] as MediaAdmin[])(admin.mediasDeLEcole(e.id));
    garder(setManques, [] as Manque[])(admin.manquesDeLEcole(e.id));
    garder(setPhotos, [] as PhotoVue[])(admin.photosEcole(e.id));
    garder(setTravail, [] as PhotoVue[])(admin.photosDeTravail(e.id));
    garder(setNouvelles, [] as NouvelleAdmin[])(admin.nouvellesDeLEcole(e.id));
    return () => {
      vivant = false;
    };
  }, [admin, e]);

  const couverture = medias?.find((m) => m.genre === 'cover' && m.publique && m.adresse);
  const logo = medias?.find((m) => m.genre === 'logo' && m.publique && m.adresse);
  const completude = medias && manques ? completudeDeLaFiche(e, medias, manques) : null;
  const demandes = (manques ?? []).filter((m) => m.demandeLe).length;
  const superieur = e.niveaux.some((n) => n === 'superieur' || n === 'technique');
  const publiques = photos.filter((p) => p.publique).length;
  const aRelire = photos.filter((p) => !p.publiable).length;
  const equipementsVus = (e.equipements ?? []).filter((x) => x.etat !== 'absent');
  const derniereInscription = (e.inscriptions ?? [])
    .map((i) => i.limite)
    .sort()
    .at(-1);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-5 rounded-xl border border-border bg-card pb-5 max-lg:-mx-4 max-lg:-mt-5 max-lg:rounded-none max-lg:border-0 max-lg:bg-background max-lg:pb-0">
        {/* La couverture, le rond du logo à cheval. */}
        <div className="relative">
          <div className="relative flex h-[180px] items-center justify-center overflow-hidden rounded-t-xl bg-[var(--sable-pale)] max-lg:h-[132px] max-lg:rounded-none">
            {couverture?.adresse ? (
              <img
                src={couverture.adresse}
                alt={`Photo de couverture de ${e.nom}`}
                className="size-full object-cover"
              />
            ) : (
              <span className="flex flex-col items-center gap-1.5 text-sm font-bold text-muted-foreground">
                <IconeCamera className="size-6" aria-hidden />
                Photo de couverture
              </span>
            )}
            <button
              type="button"
              onClick={() => ouvrir('images')}
              className="absolute right-3 bottom-3 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border-0 bg-card px-3 font-sans text-sm font-bold text-foreground shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring max-lg:size-10 max-lg:justify-center max-lg:rounded-full max-lg:px-0"
              aria-label="Changer la couverture"
            >
              <IconeCorriger className="size-4" aria-hidden />
              <span className="max-lg:hidden">Changer la couverture</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => ouvrir('images')}
            aria-label={logo ? 'Changer le logo' : 'Ajouter le logo'}
            className={cn(
              'absolute -bottom-10 left-5 flex size-[84px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-full bg-card p-0 font-sans text-xs font-bold text-destructive outline-none focus-visible:ring-[3px] focus-visible:ring-ring max-lg:-bottom-8 max-lg:left-4 max-lg:size-[68px]',
              logo ? 'border-2 border-card shadow' : 'border-2 border-dashed border-destructive',
            )}
          >
            {logo?.adresse ? (
              <img src={logo.adresse} alt="" className="size-full object-cover" />
            ) : (
              <>
                <IconeAjouter className="size-5" aria-hidden />
                Logo
              </>
            )}
          </button>
        </div>

        {/* L'identité de l'école. */}
        <div className="flex flex-col gap-2.5 px-5 pt-9 max-lg:px-4 max-lg:pt-8">
          <div className="flex items-start gap-3">
            <p className="m-0 flex-1 font-serif text-[30px] leading-tight font-bold max-lg:text-[24px]">
              {e.nom}
              {e.etiquette ? ` · ${e.etiquette}` : ''}
            </p>
            <button
              type="button"
              onClick={() => ouvrir('modifier')}
              aria-label="Modifier les informations"
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-input bg-card p-0 text-primary-strong outline-none focus-visible:ring-[3px] focus-visible:ring-ring max-lg:border-0 max-lg:bg-transparent"
            >
              <IconeCorriger className="size-[18px]" aria-hidden />
            </button>
          </div>
          <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[15px] text-muted-foreground">
            {[
              e.etiquette,
              libelleTypeEcole[e.typeEcole],
              [...new Set([e.quartier, e.division].filter(Boolean))].join(' · ') || null,
            ]
              .filter(Boolean)
              .join(' · ')}
            <span className={pastilleEtat[etat]}>{libelleEtat[etat]}</span>
            {e.verifieeLe && <span className={v2.pastilleSucces}>Confirmée par la direction</span>}
          </p>
          {memeLieu && (
            <p className="m-0 text-sm text-muted-foreground">
              Même lieu que{' '}
              <a className="text-primary underline" href={`#ecoles/fiche/${memeLieu.id}`}>
                {memeLieu.etiquette ? `${memeLieu.nom} — ${memeLieu.etiquette}` : memeLieu.nom}
              </a>
              {' · '}
              <button type="button" className={cn(v2.lien, 'min-h-0')} onClick={retirerMemeLieu}>
                Retirer
              </button>
            </p>
          )}
          <nav aria-label="Les sites de cette école" className="flex gap-2 overflow-x-auto pb-1">
            {sites.map((x) => (
              <a
                key={x.id}
                href={`#ecoles/fiche/${x.id}`}
                aria-current={x.id === e.id ? 'page' : undefined}
                className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-input bg-card px-3.5 text-sm font-bold whitespace-nowrap text-foreground no-underline aria-[current=page]:border-2 aria-[current=page]:border-primary aria-[current=page]:bg-succes aria-[current=page]:text-primary-strong"
              >
                {[x.etiquette ?? (sites.length > 1 ? 'Site' : null), etendue(x.niveaux)]
                  .filter(Boolean)
                  .join(' · ')}
              </a>
            ))}
            <a
              href="#ecoles/ajouter"
              className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-dashed border-primary px-3.5 text-sm font-bold whitespace-nowrap text-primary-strong no-underline"
            >
              <IconeAjouter className="size-4" aria-hidden />
              Un site
            </a>
          </nav>
          {publier && <div className="flex flex-wrap gap-2.5">{publier}</div>}
        </div>

        {/* Ce qui manque : sur téléphone, juste sous l'identité (planche). */}
        <div className="px-4 lg:hidden">
          <CarteManques
            completude={completude}
            manques={manques}
            demandes={demandes}
            ouvrir={ouvrir}
          />
        </div>

        {/* Les photos. */}
        <section className="flex flex-col gap-2.5 px-5 max-lg:px-4" aria-label="Photos">
          <h2 className="m-0 flex items-baseline justify-between gap-3 font-serif text-xl font-bold">
            Photos
            <span className="font-sans text-sm font-normal text-muted-foreground max-lg:hidden">
              {publiques} publique{publiques > 1 ? 's' : ''} · {aRelire} à relire · {travail.length}{' '}
              de travail
            </span>
            <button
              type="button"
              onClick={() => ouvrir('photo-publique')}
              className={cn(v2.lien, 'min-h-0 text-[15px] lg:hidden')}
            >
              Gérer
            </button>
          </h2>
          <ul className="m-0 grid list-none grid-cols-3 gap-2.5 p-0 lg:grid-cols-6 max-lg:flex max-lg:overflow-x-auto">
            {[...photos, ...travail].map((p) => {
              const deTravail = travail.includes(p);
              return (
                <li key={p.id} className="max-lg:w-[110px] max-lg:shrink-0">
                  <button
                    type="button"
                    onClick={() => ouvrir('photo-publique')}
                    aria-label={`${deTravail ? 'Photo de travail' : 'Photo'} : ${libelleRolePhotoCourt[p.role]}`}
                    className={cn(
                      'relative flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-muted p-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                      !deTravail && !p.publiable ? 'border-2 border-ambre' : 'border-0',
                    )}
                  >
                    {p.adresse && !deTravail && (
                      <img src={p.adresse} alt="" className="size-full object-cover" />
                    )}
                    {deTravail && <IconeCadenas className="size-5 text-muted-foreground" />}
                    <span
                      className={cn(
                        'absolute bottom-1.5 left-1.5 rounded-sm px-1.5 py-px text-[11px] font-bold',
                        !deTravail && !p.publiable ? 'bg-attention' : 'bg-card',
                      )}
                    >
                      {!deTravail && !p.publiable ? 'À relire' : libelleRolePhotoCourt[p.role]}
                    </span>
                  </button>
                </li>
              );
            })}
            <li className="max-lg:hidden">
              <button
                type="button"
                onClick={() => ouvrir('images')}
                aria-label="Ajouter une image"
                className="flex aspect-[4/3] w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-input bg-card p-0 text-primary-strong"
              >
                <IconeAjouter className="size-6" aria-hidden />
              </button>
            </li>
          </ul>
          <p className="m-0 text-sm text-muted-foreground lg:hidden">
            {publiques} publique{publiques > 1 ? 's' : ''} · {aRelire} à relire · {travail.length}{' '}
            de travail
          </p>
        </section>

        {/* Les rubriques. */}
        <ul className="m-0 grid list-none grid-cols-1 gap-3 px-5 p-0 sm:grid-cols-2 xl:grid-cols-3 max-lg:gap-0 max-lg:overflow-hidden max-lg:rounded-xl max-lg:border max-lg:border-border max-lg:bg-card lg:px-5 max-lg:mx-4">
          {superieur ? (
            <CarteRubrique
              titre="Formations"
              resume={`${e.formations} formation${e.formations > 1 ? 's' : ''}`}
              detail={
                (e.filieres ?? [])
                  .map((f) => f.titre)
                  .slice(0, 3)
                  .join(' · ') || null
              }
              manque={e.formations === 0 ? 'Aucune formation saisie' : null}
              ouvrir={() => ouvrir('formations')}
            />
          ) : (
            <CarteRubrique
              titre="En bref"
              resume={[etendue(e.niveaux), e.programme].filter(Boolean).join(' · ')}
              detail={e.repere ? `Repère : ${e.repere}` : null}
              manque={e.repere ? null : 'Le repère manque'}
              ouvrir={() => ouvrir('modifier')}
            />
          )}
          <CarteRubrique
            titre="Sur place"
            resume={
              equipementsVus.length > 0
                ? equipementsVus
                    .map((x) => libelleEquipement[x.cle].toLocaleLowerCase('fr'))
                    .join(', ')
                : 'Rien de noté'
            }
            detail={
              equipementsVus.length > 0
                ? `${equipementsVus.filter((x) => x.source === 'terrain').length} vus par un relais · ${equipementsVus.filter((x) => x.source === 'ecole').length} dit par l’école`
                : null
            }
            ouvrir={() => ouvrir('equipements')}
          />
          <CarteRubrique
            titre="Frais"
            resume={
              (e.frais ?? []).length > 0
                ? `${(e.frais ?? []).length} ligne${(e.frais ?? []).length > 1 ? 's' : ''} par classe${(e.frais ?? []).some((f) => f.inscription !== null) ? ' · inscription' : ''}`
                : 'Aucune ligne'
            }
            manque={(e.frais ?? []).length === 0 ? 'À demander' : null}
            ouvrir={() => ouvrir('frais')}
          />
          {superieur && (
            <CarteRubrique
              titre="Admission"
              resume="Conditions, dossier, dates"
              ouvrir={() => ouvrir('admission')}
            />
          )}
          <CarteRubrique
            titre={superieur ? 'Contact' : 'Contact et inscriptions'}
            resume={
              [
                e.contactPublic?.numero ?? null,
                derniereInscription ? `jusqu'au ${jour(derniereInscription)}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Aucun contact public'
            }
            detail={
              e.contactPublic ? `Accord de la direction · ${jour(e.contactPublic.accordLe)}` : null
            }
            ouvrir={() => ouvrir('contact-public')}
          />
          <CarteRubrique
            titre="Mot de la direction"
            resume={
              e.motDirection
                ? `« ${e.motDirection.texte.slice(0, 60)}${e.motDirection.texte.length > 60 ? '…' : ''} »`
                : 'Pas encore remis'
            }
            detail={e.motDirection ? `Remis le ${jour(e.motDirection.ditLe)}` : null}
            ouvrir={() => ouvrir('mot-direction')}
          />
          <CarteRubrique
            titre="Nouvelles"
            resume={
              nouvelles.length > 0
                ? `${nouvelles.length} publiée${nouvelles.length > 1 ? 's' : ''}`
                : 'Aucune nouvelle'
            }
            detail="Cachées sur la page s’il n’y en a aucune"
            ouvrir={() => ouvrir('nouvelles')}
          />
        </ul>
      </div>

      {/* À droite (ordinateur) : ce qui manque, ce qui est en cours, l'historique. */}
      <aside className="flex flex-col gap-4 max-lg:contents">
        <div className="max-lg:hidden">
          <CarteManques
            completude={completude}
            manques={manques}
            demandes={demandes}
            ouvrir={ouvrir}
          />
        </div>
        <section
          className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4"
          aria-label="En cours"
        >
          <h2 className="m-0 font-sans text-base font-bold">En cours</h2>
          <p className="m-0 text-[15px]">
            {e.confiee
              ? `Confiée à ${e.confiee.prenom} · ${libelleTypeMission[e.confiee.genre].toLocaleLowerCase('fr')}`
              : 'Aucune mission ouverte sur ce site.'}
          </p>
        </section>
        <section
          className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4"
          aria-label="Historique"
        >
          <h2 className="m-0 font-sans text-base font-bold">Historique</h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[15px]">
            {e.declareeLe && (
              <li>
                {jour(e.declareeLe)} ·{' '}
                {e.origine === 'field'
                  ? 'Relevée par un relais'
                  : e.origine === 'import'
                    ? 'Importée'
                    : e.origine === 'school'
                      ? 'Déclarée par l’école'
                      : 'Ajoutée par NTanova'}
              </li>
            )}
            {e.verifieeLe && <li>{jour(e.verifieeLe)} · Confirmée par la direction</li>}
            {(e.frais ?? []).length > 0 && (
              <li>{jour((e.frais ?? [])[0]!.declaresLe)} · Frais déclarés</li>
            )}
            {e.retrait && <li>{jour(e.retrait.le)} · Retirée du site</li>}
            {!e.declareeLe && !e.verifieeLe && !(e.frais ?? []).length && !e.retrait && (
              <li className="text-muted-foreground">{libelleEtat[etat]}</li>
            )}
          </ul>
        </section>
        <div className="flex flex-wrap gap-2 lg:hidden">{gestes}</div>
      </aside>
    </div>
  );
}

/** La carte « N choses à compléter » : la jauge, ce qui manque et qui peut le donner, « Compléter la fiche ». */
function CarteManques({
  completude,
  manques,
  demandes,
  ouvrir,
}: {
  completude: ReturnType<typeof completudeDeLaFiche> | null;
  manques: Manque[] | null;
  demandes: number;
  ouvrir: (r: RubriqueFiche) => void;
}) {
  if (!completude || !manques) return <div className="h-40 rounded-xl bg-muted" aria-busy="true" />;
  const n = manques.length;
  return (
    <section
      className={cn(
        'flex flex-col gap-3 rounded-xl bg-card p-4',
        n > 0 ? 'border-2 border-destructive' : 'border border-border',
      )}
      aria-label="À compléter"
    >
      <div className="flex items-center gap-3">
        <Jauge remplies={completude.remplies} total={completude.total} />
        <span className="flex flex-col">
          <b className="text-lg leading-tight">
            {n === 0 ? 'Fiche complète' : `${n} chose${n > 1 ? 's' : ''} à compléter`}
          </b>
          <span className="text-sm text-muted-foreground">
            {demandes === 0
              ? 'Rien n’est encore demandé.'
              : `${demandes} demandée${demandes > 1 ? 's' : ''} à l’école.`}
          </span>
        </span>
      </div>
      {n > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {manques.slice(0, 5).map((m, i) => (
            <li
              key={`${m.sujet}-${i}`}
              className="flex items-center gap-2.5 border-t border-border py-2.5 text-[15px]"
            >
              <span className="size-2 shrink-0 rounded-full bg-destructive" aria-hidden />
              <b className="flex-1">{m.detail ?? libelleSujetDemande[m.sujet]}</b>
              <span className="text-sm text-muted-foreground">
                {m.quiPeut.includes('ecole') ? 'l’école' : 'un relais'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => ouvrir('completer')}
        className={cn(v2.bouton, 'h-12 w-full text-base')}
      >
        Compléter la fiche
        <IconeOuvrir className="size-5 lg:hidden" aria-hidden />
      </button>
    </section>
  );
}

const libelleEtat = {
  a_situer: 'Sans position',
  prete: 'Prête',
  publiee: 'Publiée',
  retiree: 'Retirée',
  corbeille: 'À la corbeille',
  brouillon: 'Brouillon',
} as const;

const pastilleEtat = {
  a_situer: v2.pastilleNeutre,
  prete: v2.pastilleAttention,
  publiee: v2.pastilleSucces,
  retiree: v2.pastilleDanger,
  corbeille: v2.pastilleDanger,
  brouillon: v2.pastilleNeutre,
} as const;
