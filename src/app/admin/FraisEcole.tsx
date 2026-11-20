/**
 * « Frais par classe » (planche « Frais, avec le prospectus ») : on recopie ce que dit le prospectus, ligne par ligne. À
 * gauche, le prospectus photographié par un relais (photo de travail, jamais publique) ; à droite, l'année scolaire, la
 * date de déclaration, les mois facturés et le tableau des lignes (cycle, classe, montant, période, inscription,
 * « Illisible ? »). Une ligne illisible n'est jamais publiée : « Demander … » l'ajoute à ce qui manque, demandée à l'école.
 *
 * Lot 2 du site public (15/11) : une ligne enregistrée ne paraît sur le site qu'avec **le OUI écrit de l'école**, noté ici
 * avec son jour (« Noter le OUI de l'école », `confirmerFraisEcole`). Modifier une ligne le lui retire : seules les lignes
 * qui changent sont réécrites. Tailwind et shadcn seulement.
 */
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { v2 } from '@/ui/v2/classes';
import { Bouton, Dialogue } from '@/ui/v2/admin';
import { Bande } from '@/ui/v2/bande';
import { Bandeau, Champ } from '@/ui/v2/formulaire';
import {
  IconeAjouter,
  IconeAttente,
  IconeCadenas,
  IconeFait,
  IconeFermer,
  IconeMoins,
} from '@/ui/shadcn/icones';
import { jourDuCongo } from '../../modele/date-declaration';
import {
  erreurDesChampsCommuns,
  erreurDuOui,
  etatDuOuiAvecDossier,
  francsCFA,
  inscriptionLaPlusFrequente,
  ligneChangee,
  lireFraisEcole,
  moisFacturesDesLignes,
  montantFrais,
  periodesFrais,
  type FraisEcole as Frais,
} from '../../modele/frais-ecole';
import { libelleNiveau } from '../../modele/libelles';
import { dateCourte, dateLongue, jourEtMois } from '../../modele/pointe-noire';
import type { Valeur } from '../../modele/listes';
import type { FraisDeDossier, PhotoVue, PortAdministration } from '../../modele/ports';
import { messageErreur } from './ChampPosition';

/** Une ligne du tableau, telle qu'on la tape. `id` : la ligne enregistrée qu'elle modifie ; `avant`, ce qu'elle était. */
interface Ligne {
  cle: string;
  id: string | null;
  cycle: string;
  classe: string;
  montant: string;
  periode: string;
  inscription: string;
  illisible: boolean;
  /** Ticket 199 (A23) : « à partir de » le montant, sans plafond. */
  aPartirDe: boolean;
  /** La formation du supérieur de la ligne : gardée quand on l'enregistre de nouveau. */
  formationId: string | null;
  avant: Frais | null;
}

const montantEnTexte = (f: Frais) =>
  f.maximum === null || f.minimum === f.maximum ? String(f.minimum) : `${f.minimum}-${f.maximum}`;

/** « 15000 » ou « 15000-20000 » (une fourchette), espaces permis. */
function lireMontantOuFourchette(t: string): { minimum: string; maximum: string } {
  const [a = '', b = ''] = t.split(/\s*[-–à]\s*/);
  return { minimum: a, maximum: b || a };
}

let suivante = 0;
const nouvelle = (cycle = ''): Ligne => ({
  cle: `n${suivante++}`,
  id: null,
  cycle,
  classe: '',
  montant: '',
  periode: 'mois',
  inscription: '',
  illisible: false,
  aPartirDe: false,
  formationId: null,
  avant: null,
});

/** La ligne a-t-elle été retouchée à l'écran depuis son enregistrement ? */
const retouchee = (l: Ligne) =>
  !l.avant ||
  l.illisible ||
  l.aPartirDe !== (l.avant.maximum === null) ||
  l.cycle !== l.avant.cycle ||
  l.classe !== (l.avant.classe ?? '') ||
  l.montant !== montantEnTexte(l.avant) ||
  l.periode !== l.avant.periode ||
  l.inscription !== (l.avant.inscription === null ? '' : String(l.avant.inscription));

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

export function FraisEcole({
  ecoleId,
  nom,
  cycles,
  frais,
  fraisDeDossier = [],
  admin,
  fermer,
  surOccupation,
  surChangement,
}: {
  ecoleId: string;
  nom: string;
  cycles: Valeur<'niveau'>[];
  frais: Frais[];
  /** Ticket 199 (A1) : les frais de dossier des formations, que le même OUI de l'école confirme. */
  fraisDeDossier?: FraisDeDossier[];
  admin: PortAdministration;
  fermer: () => void;
  /** Toujours dans la fiche depuis la refonte v2 ; gardé pour les appels d'avant. */
  integre?: boolean;
  surOccupation?: (occupe: boolean) => void;
  surChangement: (texte: string) => void;
}) {
  const [lignes, setLignes] = useState<Ligne[]>(() =>
    frais.length > 0
      ? frais.map((f) => ({
          cle: f.id,
          id: f.id,
          cycle: f.cycle,
          classe: f.classe ?? '',
          montant: montantEnTexte(f),
          periode: f.periode,
          inscription: f.inscription === null ? '' : String(f.inscription),
          illisible: false,
          aPartirDe: f.maximum === null,
          formationId: f.formationId ?? null,
          avant: f,
        }))
      : [nouvelle(cycles[0] ?? '')],
  );
  const [retirees, setRetirees] = useState<string[]>([]);
  const depart = {
    annee: frais[0]?.anneeScolaire ?? '',
    // Ticket 199 (A2) : jamais aujourd'hui par défaut ; on tape le jour où l'école a déclaré ses frais.
    declaresLe: frais[0]?.declaresLe ?? '',
    note: frais[0]?.note ?? '',
    mois: String(moisFacturesDesLignes(frais) ?? ''),
  };
  const [annee, setAnnee] = useState(depart.annee);
  const [declaresLe, setDeclaresLe] = useState(depart.declaresLe);
  const [note, setNote] = useState(depart.note);
  // Lot 2 : les mois facturés dans l'année, dits par l'école ; ils valent pour chaque ligne au mois.
  const [mois, setMois] = useState(depart.mois);
  const oui = etatDuOuiAvecDossier(frais, fraisDeDossier);
  const dossierEnAttente = fraisDeDossier.filter((d) => !d.confirmeLe);
  const aConfirmer = frais.length + fraisDeDossier.length;
  const [noterOui, setNoterOui] = useState(false);
  const [jourOui, setJourOui] = useState('');
  const [erreurOui, setErreurOui] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [prospectus, setProspectus] = useState<PhotoVue[] | null>(null);
  const [vue, setVue] = useState(0);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    surOccupation?.(enCours);
    return () => surOccupation?.(false);
  }, [enCours, surOccupation]);
  useEffect(() => {
    let vivant = true;
    void admin
      .photosDeTravail(ecoleId)
      .then((p) => vivant && setProspectus(p.filter((x) => x.role === 'brochure')))
      .catch(() => vivant && setProspectus([]));
    return () => {
      vivant = false;
    };
  }, [admin, ecoleId]);
  const photo = prospectus?.[vue] ?? null;

  // Téléphone (planche) : une ligne déjà enregistrée se lit repliée (classe, montant, inscription) ; un toucher l'ouvre.
  const [ouverte, setOuverte] = useState<string | null>(null);
  const repliee = (l: Ligne) => l.id !== null && !l.illisible && ouverte !== l.cle;
  const changer = (cle: string, champs: Partial<Ligne>) =>
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...champs } : l)));
  const retirer = (l: Ligne) => {
    setLignes((ls) => ls.filter((x) => x.cle !== l.cle));
    if (l.id) setRetirees((r) => [...r, l.id!]);
  };
  const publiables = lignes.filter((l) => !l.illisible);
  const illisibles = lignes.filter((l) => l.illisible);
  const nomDeLigne = (l: Ligne) =>
    l.classe.trim() || (l.cycle ? libelleNiveau[l.cycle as Valeur<'niveau'>] : 'cette ligne');
  // Ce qui vaut pour toutes les lignes (année, date, note, mois) : le changer retouche chacune.
  const communChange =
    annee !== depart.annee ||
    declaresLe !== depart.declaresLe ||
    note !== depart.note ||
    mois !== depart.mois;
  const modifiee = (l: Ligne) => communChange || retouchee(l);
  const nonEnregistre = retirees.length > 0 || lignes.some(modifiee);

  const enregistrer = async () => {
    setErreur(null);
    // Ce qui vaut pour toutes les lignes se dit sans nommer de ligne (ticket 199, A12).
    const commun = erreurDesChampsCommuns({ anneeScolaire: annee, note, declaresLe });
    if (commun) return setErreur(commun);
    const saisies = publiables.map((l) => {
      const { minimum, maximum } = lireMontantOuFourchette(l.montant);
      return {
        l,
        lu: lireFraisEcole({
          cycle: l.cycle,
          classe: l.classe,
          minimum,
          maximum,
          periode: l.periode,
          precisionPeriode: '',
          inscription: l.inscription,
          anneeScolaire: annee,
          declaresLe,
          note,
          moisFactures: mois,
          aPartirDe: l.aPartirDe,
          // Planche : enregistrer les lignes recopiées vaut déclaration de l'école (le prospectus en est la preuve).
          declarationConfirmee: true,
          photoPreuve: l.avant?.photoPreuve ?? photo?.id ?? null,
          formationId: l.formationId,
        }),
      };
    });
    const fautive = saisies.find((x) => !x.lu.frais);
    if (fautive) return setErreur(`${nomDeLigne(fautive.l)} : ${fautive.lu.erreur}`);
    // Une ligne qui ne change pas n'est pas réécrite : elle garde le OUI de l'école.
    const aEcrire = saisies.filter(({ l, lu }) => !l.avant || ligneChangee(l.avant, lu.frais!));
    setEnCours(true);
    try {
      for (const id of retirees) await admin.retirerFraisEcole(ecoleId, id);
      for (const { l, lu } of aEcrire) await admin.enregistrerFraisEcole(ecoleId, lu.frais!, l.id);
      setRetirees([]);
      const n = aEcrire.length;
      surChangement(
        n > 0
          ? `${pluriel(n, 'ligne')} de frais enregistrée${n > 1 ? 's' : ''} pour ${nom} : ${n > 1 ? 'elles attendent' : 'elle attend'} le OUI de l’école pour paraître sur le site.${retirees.length ? ` ${pluriel(retirees.length, 'ligne')} retirée${retirees.length > 1 ? 's' : ''}.` : ''}`
          : retirees.length > 0
            ? `${pluriel(retirees.length, 'ligne')} de frais retirée${retirees.length > 1 ? 's' : ''} pour ${nom}. Visible à la prochaine mise à jour du site.`
            : `Rien n’a changé dans les frais de ${nom}.`,
      );
      fermer();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  const confirmerOui = async () => {
    if (oui.etat !== 'attend') return;
    const probleme = erreurDuOui(jourOui, oui.auPlusTot);
    if (probleme) return setErreurOui(probleme);
    setErreurOui(null);
    setEnCours(true);
    try {
      const n = await admin.confirmerFraisEcole(ecoleId, jourOui);
      surChangement(
        `OUI de l’école noté, daté du ${dateLongue(jourOui)} : ${pluriel(n, 'ligne')} de frais de ${nom} ${n > 1 ? 'paraîtront' : 'paraîtra'} à la prochaine mise à jour du site.`,
      );
      setNoterOui(false);
      fermer();
    } catch (e) {
      setErreurOui(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  /** Où en est le OUI de la ligne : confirmée, en attente, à redemander (retouchée), nouvelle. */
  const etatDeLaLigne = (l: Ligne) =>
    !l.avant ? (
      <span className={v2.pastilleNeutre}>Nouvelle</span>
    ) : l.avant.confirmeLe && !modifiee(l) ? (
      <span className={v2.pastilleSucces}>OUI le {jourEtMois(l.avant.confirmeLe)}</span>
    ) : l.avant.confirmeLe ? (
      <span className={v2.pastilleAttention}>OUI à redemander</span>
    ) : (
      <span className={v2.pastilleAttention}>En attente du OUI</span>
    );

  const demander = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      for (const l of illisibles)
        await admin.demanderALEcole(
          ecoleId,
          'frais',
          `Frais ${nomDeLigne(l)}, illisible sur le prospectus`,
        );
      setLignes((ls) => ls.filter((l) => !l.illisible));
      surChangement(
        `${illisibles.map((l) => `« Frais ${nomDeLigne(l)} »`).join(', ')} : demandé à l’école, ajouté à ce qui manque.`,
      );
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  const champ = cn(v2.champ, 'h-10 px-2.5 text-[15px]');
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      {/* Le prospectus. */}
      <section className="flex flex-col gap-2.5" aria-label="Prospectus des frais">
        <h3 className="m-0 flex flex-wrap items-center justify-between gap-2 font-sans text-base font-bold">
          Prospectus des frais
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
            <IconeCadenas className="size-3.5" aria-hidden />
            Photo de travail, jamais publique
          </span>
        </h3>
        {photo?.adresse ? (
          <div
            className="relative overflow-auto rounded-xl bg-foreground p-4 max-lg:max-h-64"
            style={{ maxHeight: 420 }}
          >
            <img
              src={photo.adresse}
              alt="Le prospectus des frais, pris par un relais"
              className="mx-auto block w-full origin-top rounded-sm"
              style={{ transform: `scale(${zoom})` }}
            />
            <span className="sticky bottom-0 float-right flex gap-1.5">
              <button
                type="button"
                aria-label="Agrandir le prospectus"
                onClick={() => setZoom((z) => Math.min(3, z + 0.5))}
                className="flex size-9 cursor-pointer items-center justify-center rounded-md border-0 bg-card p-0 text-foreground"
              >
                <IconeAjouter className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Réduire le prospectus"
                onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
                className="flex size-9 cursor-pointer items-center justify-center rounded-md border-0 bg-card p-0 text-foreground"
              >
                <IconeMoins className="size-4" aria-hidden />
              </button>
            </span>
          </div>
        ) : (
          <div className="flex aspect-[3/4] items-center max-lg:aspect-[16/9] justify-center rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            {prospectus === null
              ? 'Chargement…'
              : 'Pas de prospectus photographié : les lignes se publient « dites par l’école », avec leur date.'}
          </div>
        )}
        {photo && (
          <p className="m-0 text-sm text-muted-foreground">
            Prise par un relais{photo.prisLe ? ` le ${jourEtMois(photo.prisLe)}` : ''}, dans son
            relevé.
            {prospectus && prospectus.length > 1 && (
              <>
                {' '}
                <button
                  type="button"
                  className={cn(v2.lien, 'min-h-0 text-sm')}
                  onClick={() => setVue((vue + 1) % prospectus.length)}
                >
                  Photo suivante ({vue + 1} sur {prospectus.length})
                </button>
              </>
            )}
          </p>
        )}
      </section>

      {/* Les lignes. */}
      <section className="flex min-w-0 flex-col gap-4" aria-label={`Frais déclarés de ${nom}`}>
        {oui.etat === 'attend' && (
          <Bande
            ton="attention"
            region="Le OUI de l’école"
            icone={<IconeAttente aria-hidden />}
            action={
              <Bouton
                className={v2.petit}
                disabled={enCours || nonEnregistre}
                onClick={() => {
                  setJourOui('');
                  setErreurOui(null);
                  setNoterOui(true);
                }}
              >
                Noter le OUI de l’école
              </Bouton>
            }
          >
            <p>
              <b>En attente du OUI de l’école</b> :{' '}
              {oui.lignes === aConfirmer
                ? `${aConfirmer > 1 ? `les ${aConfirmer} lignes ne paraissent` : 'la ligne ne paraît'} pas sur le site.`
                : `${oui.lignes} ligne${oui.lignes > 1 ? 's' : ''} sur ${aConfirmer} ne ${oui.lignes > 1 ? 'paraissent' : 'paraît'} pas sur le site.`}
            </p>
            <p>
              {nonEnregistre
                ? 'Enregistre d’abord tes changements : le OUI porte sur les montants enregistrés.'
                : 'Seulement un OUI écrit (WhatsApp, courrier) de la direction sur ces montants.'}
            </p>
          </Bande>
        )}
        {oui.etat === 'confirme' && (
          <Bande ton="succes" region="Le OUI de l’école" icone={<IconeFait aria-hidden />}>
            <p>
              <b>OUI de l’école le {dateCourte(oui.le)}</b> : ces frais peuvent paraître sur le
              site.
            </p>
          </Bande>
        )}
        <div className="grid grid-cols-2 gap-3 lg:flex lg:flex-wrap">
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Année scolaire
            <input
              className={cn(champ, 'w-full lg:w-40')}
              maxLength={30}
              placeholder="ex. 2026-2027"
              value={annee}
              onChange={(e) => setAnnee(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Déclarés par l’école le
            <input
              className={cn(champ, 'w-full lg:w-44')}
              type="date"
              max={jourDuCongo()}
              value={declaresLe}
              onChange={(e) => setDeclaresLe(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Mois facturés
            <select
              className={cn(champ, 'w-full lg:w-36')}
              value={mois}
              onChange={(e) => setMois(e.target.value)}
            >
              <option value="">Pas dit</option>
              {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                <option key={m} value={m}>
                  {m} mois
                </option>
              ))}
            </select>
          </label>
        </div>

        {cycles.length === 0 ? (
          <p className="m-0 text-muted-foreground">
            Renseigne d’abord les niveaux de l’école (« En bref ») pour ajouter des frais.
          </p>
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 lg:overflow-x-auto">
            {/* Ordinateur : le tableau de la planche. Téléphone : une carte par ligne, les mêmes champs (sans dézoomer la page). */}
            <table
              role="table"
              className="w-full border-collapse text-left text-[15px] max-lg:block lg:min-w-[720px] max-lg:[&_tbody]:flex max-lg:[&_tbody]:flex-col max-lg:[&_tbody]:gap-3 max-lg:[&_td]:block max-lg:[&_td]:p-0 max-lg:[&_thead]:hidden max-lg:[&_tr]:grid max-lg:[&_tr]:grid-cols-2 max-lg:[&_tr]:gap-2 max-lg:[&_tr]:rounded-lg max-lg:[&_tr]:border max-lg:[&_tr]:border-border max-lg:[&_tr]:p-2"
            >
              <thead>
                <tr
                  role="row"
                  className="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase"
                >
                  <th role="columnheader" className="px-2 py-2">
                    Cycle
                  </th>
                  <th role="columnheader" className="px-2 py-2">
                    Classe (facultatif)
                  </th>
                  <th role="columnheader" className="px-2 py-2">
                    Montant
                  </th>
                  <th role="columnheader" className="px-2 py-2">
                    Période
                  </th>
                  <th role="columnheader" className="px-2 py-2">
                    Inscription
                  </th>
                  <th role="columnheader" className="px-2 py-2">
                    Illisible ?
                  </th>
                  <th role="columnheader" className="px-2 py-2">
                    <span className="sr-only">Retirer</span>
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {lignes.map((l) => (
                  <tr
                    role="row"
                    key={l.cle}
                    aria-label={nomDeLigne(l)}
                    className={cn(
                      'border-t border-border',
                      l.illisible && 'shadow-[inset_3px_0_0_var(--erreur)]',
                      repliee(l) && 'max-lg:[&>td:not(:first-child)]:hidden',
                    )}
                  >
                    <td role="cell" className="col-span-2 lg:hidden">
                      <button
                        type="button"
                        aria-expanded={!repliee(l)}
                        onClick={() => setOuverte(repliee(l) ? l.cle : null)}
                        className="flex w-full cursor-pointer items-start justify-between gap-3 border-0 bg-transparent p-1 text-left font-sans text-foreground"
                      >
                        <span className="flex min-w-0 flex-col">
                          <b className="text-[17px]">
                            {l.cycle
                              ? libelleNiveau[l.cycle as Valeur<'niveau'>]
                              : 'Cycle à choisir'}
                            {l.illisible && l.classe.trim() ? ` · ${l.classe.trim()}` : ''}
                          </b>
                          {!l.illisible && (
                            <span className="text-sm text-muted-foreground">
                              {l.classe.trim() || 'toutes les classes'}
                            </span>
                          )}
                          {!l.illisible && <span className="mt-1">{etatDeLaLigne(l)}</span>}
                        </span>
                        {l.illisible ? (
                          <span className={v2.pastilleDanger}>Illisible</span>
                        ) : (
                          <span className="flex flex-col items-end text-right">
                            <b className="text-[17px]">
                              {l.aPartirDe && l.montant.trim() ? 'dès ' : ''}
                              {l.montant.trim() || '—'} /{' '}
                              {(
                                periodesFrais[l.periode as keyof typeof periodesFrais] ?? ''
                              ).replace('Par ', '')}
                            </b>
                            <span className="text-sm text-muted-foreground">
                              inscription {l.inscription.trim() || '—'}
                            </span>
                          </span>
                        )}
                      </button>
                    </td>
                    <td role="cell" className="px-2 py-1.5">
                      <select
                        aria-label="Cycle"
                        className={cn(champ, 'w-32')}
                        value={l.cycle}
                        onChange={(e) => changer(l.cle, { cycle: e.target.value })}
                      >
                        <option value="">Choisir</option>
                        {cycles.map((c) => (
                          <option key={c} value={c}>
                            {libelleNiveau[c]}
                          </option>
                        ))}
                      </select>
                      {/* Ordinateur : l'état du OUI sous le cycle (sur téléphone, il est dans le résumé de la ligne). */}
                      {!l.illisible && (
                        <span className="mt-1.5 hidden lg:flex">{etatDeLaLigne(l)}</span>
                      )}
                    </td>
                    <td role="cell" className="px-2 py-1.5">
                      <input
                        aria-label="Classe"
                        className={champ}
                        maxLength={40}
                        placeholder="toutes"
                        value={l.classe}
                        onChange={(e) => changer(l.cle, { classe: e.target.value })}
                      />
                    </td>
                    <td role="cell" className="px-2 py-1.5">
                      <input
                        aria-label="Montant (FCFA)"
                        className={champ}
                        inputMode="numeric"
                        disabled={l.illisible}
                        placeholder={l.illisible ? 'illisible' : 'FCFA'}
                        value={l.illisible ? '' : l.montant}
                        onChange={(e) => changer(l.cle, { montant: e.target.value })}
                      />
                      {/* Ticket 199 (A23) : « à partir de 40 000 », sans plafond ; le site l'écrit ainsi. */}
                      <button
                        type="button"
                        aria-pressed={l.aPartirDe}
                        disabled={l.illisible}
                        onClick={() => changer(l.cle, { aPartirDe: !l.aPartirDe })}
                        className="mt-1.5 inline-flex min-h-9 cursor-pointer items-center rounded-full border border-input bg-card px-3 font-sans text-sm font-bold text-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                      >
                        À partir de
                      </button>
                    </td>
                    <td role="cell" className="px-2 py-1.5">
                      <select
                        aria-label="Période"
                        className={cn(champ, 'w-28')}
                        value={l.periode}
                        onChange={(e) => changer(l.cle, { periode: e.target.value })}
                      >
                        {Object.entries(periodesFrais)
                          .filter(([k]) => k !== 'autre')
                          .map(([k, v]) => (
                            <option key={k} value={k}>
                              {v.replace('Par ', '')}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td role="cell" className="px-2 py-1.5">
                      <input
                        aria-label="Inscription (FCFA)"
                        className={champ}
                        inputMode="numeric"
                        value={l.inscription}
                        onChange={(e) => changer(l.cle, { inscription: e.target.value })}
                      />
                    </td>
                    <td role="cell" className="px-2 py-1.5">
                      <button
                        type="button"
                        aria-pressed={l.illisible}
                        onClick={() => changer(l.cle, { illisible: !l.illisible })}
                        className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-input bg-card px-3 font-sans text-sm font-bold text-foreground aria-pressed:border-destructive aria-pressed:bg-danger aria-pressed:text-danger-foreground"
                      >
                        Illisible
                      </button>
                    </td>
                    <td role="cell" className="px-1 py-1.5">
                      <button
                        type="button"
                        aria-label={`Retirer la ligne ${nomDeLigne(l)}`}
                        onClick={() => retirer(l)}
                        className="flex size-9 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-muted-foreground"
                      >
                        <IconeFermer className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setLignes((ls) => [...ls, nouvelle(cycles[0] ?? '')])}
                className={cn(v2.boutonSecondairePetit, 'border-dashed')}
              >
                + Ajouter une ligne
              </button>
              {lignes.length >= 2 && (
                <button
                  type="button"
                  className={v2.boutonSecondairePetit}
                  onClick={() => {
                    const deja = lignes.find((l) => l.inscription.trim())?.inscription;
                    const m = deja ?? String(inscriptionLaPlusFrequente(frais) ?? '');
                    setLignes((ls) => ls.map((l) => ({ ...l, inscription: m })));
                  }}
                >
                  Même inscription sur toutes les lignes
                </button>
              )}
            </div>
          </div>
        )}

        <label className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3 text-sm font-bold">
          <span className="flex items-baseline justify-between gap-3">
            Note (tenue, fournitures…)
            {/* Ticket 199 (A12) : rien n'est coupé en silence ; le compteur dit la limite de la base. */}
            <span
              className={cn(
                'font-normal tabular-nums',
                note.trim().length > 300 ? 'font-bold text-destructive' : 'text-muted-foreground',
              )}
            >
              {note.trim().length} / 300
            </span>
          </span>
          <input
            className={champ}
            aria-invalid={note.trim().length > 300 || undefined}
            placeholder="Tenue : …"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {erreur && (
          <Bandeau ton="erreur" icone="alerte">
            <p>{erreur}</p>
          </Bandeau>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Bouton
            enCours={enCours}
            disabled={publiables.length === 0 && retirees.length === 0}
            onClick={() => void enregistrer()}
          >
            Enregistrer {publiables.length} ligne{publiables.length > 1 ? 's' : ''} publiable
            {publiables.length > 1 ? 's' : ''}
          </Bouton>
          {illisibles.length > 0 && (
            <Bouton variante="secondaire" disabled={enCours} onClick={() => void demander()}>
              Demander {illisibles.map(nomDeLigne).join(', ')}
            </Bouton>
          )}
        </div>
        <p className="m-0 text-sm text-muted-foreground">
          « Illisible » grise le montant : la ligne n’est pas publiée et s’ajoute aux manques. Une
          ligne enregistrée attend le OUI de l’école ; modifier ses montants le lui retire.
        </p>
      </section>

      {noterOui && oui.etat === 'attend' && (
        <Dialogue
          titre="Noter le OUI de l’école"
          variante="confirmation"
          libelleFermeture="Annuler"
          occupe={enCours}
          fermer={() => setNoterOui(false)}
          entete={<b>Noter le OUI de l’école</b>}
        >
          <p className="m-0 text-[15px]">
            {nom} a répondu OUI par écrit sur ces montants.{' '}
            {oui.lignes > 1
              ? `Les ${oui.lignes} lignes en attente paraîtront`
              : 'La ligne en attente paraîtra'}{' '}
            sur le site à sa prochaine mise à jour.
          </p>
          <ul className="m-0 flex list-none flex-col gap-1 rounded-md bg-muted p-3 text-[15px]">
            {frais
              .filter((f) => !f.confirmeLe)
              .map((f) => (
                <li key={f.id}>
                  <b>{f.classe?.trim() || libelleNiveau[f.cycle]}</b> : {montantFrais(f)}{' '}
                  {(periodesFrais[f.periode] ?? '').toLocaleLowerCase('fr')}
                </li>
              ))}
            {dossierEnAttente.map((d) => (
              <li key={d.formationId}>
                <b>Frais de dossier · {d.titre}</b> : {francsCFA(d.montant)}
              </li>
            ))}
          </ul>
          <Champ libelle="Le jour où l’école a répondu OUI" erreur={erreurOui ?? undefined}>
            {(x) => (
              <input
                {...x}
                type="date"
                className={cn(v2.champ, 'sm:w-48')}
                min={oui.auPlusTot}
                max={jourDuCongo()}
                value={jourOui}
                onChange={(e) => setJourOui(e.target.value)}
              />
            )}
          </Champ>
          <div className="flex flex-wrap justify-end gap-2.5">
            <Bouton enCours={enCours} onClick={() => void confirmerOui()}>
              Noter le OUI
            </Bouton>
          </div>
        </Dialogue>
      )}
    </div>
  );
}
