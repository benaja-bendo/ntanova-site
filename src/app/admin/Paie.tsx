/**
 * La paie des relais (19/11, planches « Paie · téléphone / ordinateur / Noter un versement »). Chaque relais a un solde :
 * ce qu'il a gagné (la base le calcule, mêmes règles qu'avant) moins ce que NTanova lui a versé. On note un versement à
 * tout moment, tout ou partie du reste dû, jamais plus ; une erreur s'annule et reste lisible. Le relais lit le nouveau
 * montant dans « Ma paie ». Un seul code : des cartes sous 1 024 px, un tableau au-delà.
 */
import { v2 } from '@/ui/v2/classes';
import { cn } from '@/lib/utils';
import { useCallback, useEffect, useId, useState } from 'react';
import { francs, chiffres, jourABrazzaville, jourCourt, lireMontant } from '../../modele/paie';
import type { PortAdministration, SoldeRelais, VersementVu } from '../../modele/ports';
import { afficherTelephone } from '../../modele/telephone';
import { Bandeau, Champ } from '@/ui/v2/formulaire';
import { Bouton, Dialogue } from '@/ui/v2/admin';
import { IconeBas } from '@/ui/shadcn/icones';
import { messageErreur } from './ChampPosition';
import { TitreEcran } from './Cadre';

type Operateur = 'mtn' | 'airtel' | 'autre';
const libelleOperateur: Record<Operateur, string> = {
  mtn: 'MTN',
  airtel: 'Airtel',
  autre: 'Autre opérateur',
};
const operateur = (o: string | null) => libelleOperateur[(o as Operateur | null) ?? 'autre'] ?? o;

/** Les colonnes du tableau, sur ordinateur ; sur téléphone, chaque ligne devient une carte. */
const COLONNES =
  'lg:grid-cols-[minmax(110px,1.2fr)_88px_88px_104px_minmax(170px,1.8fr)_minmax(100px,1fr)_auto]';
const ENTETE =
  'bg-muted px-4 py-3 text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase';

export function Paie({ admin }: { admin: PortAdministration }) {
  const [soldes, setSoldes] = useState<SoldeRelais[] | null>(null);
  const [versements, setVersements] = useState<VersementVu[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [aVerser, setAVerser] = useState<SoldeRelais | null>(null);
  const [aNumeroter, setANumeroter] = useState<SoldeRelais | null>(null);
  const [aAnnuler, setAAnnuler] = useState<VersementVu | null>(null);
  const [aJourOuverts, setAJourOuverts] = useState(false);

  const charger = useCallback(() => {
    admin
      .soldesPaie()
      .then(setSoldes)
      .catch((e: unknown) => setErreur(messageErreur(e)));
    admin
      .versements()
      .then(setVersements)
      .catch((e: unknown) => setErreur(messageErreur(e)));
  }, [admin]);
  useEffect(charger, [charger]);

  const dus = (soldes ?? []).filter((s) => s.resteXaf > 0);
  const aJour = (soldes ?? []).filter((s) => s.resteXaf <= 0);
  const totalDu = dus.reduce((t, s) => t + s.resteXaf, 0);
  const mois = jourABrazzaville(new Date()).slice(0, 7);
  const verseCeMois = (versements ?? [])
    .filter((v) => !v.annuleLe && v.verseLe.startsWith(mois))
    .reduce((t, v) => t + v.montantXaf, 0);

  return (
    <div className={v2.pile}>
      <TitreEcran
        titre="Paie"
        regles={
          <>
            <p>
              Chaque relais a un reste dû : ce qu’il a gagné (fiche acceptée, mission, essai), moins
              ce que NTanova lui a versé. La base calcule ; rien n’est compté deux fois.
            </p>
            <p>
              Note un versement à tout moment, tout ou partie du reste dû, jamais plus. Le relais
              lit aussitôt le nouveau montant dans « Ma paie ». Une erreur s’annule : elle reste
              lisible ici, le relais ne la voit plus.
            </p>
          </>
        }
      />

      {erreur && (
        <Bandeau ton="erreur" icone="alerte">
          <p>{erreur}</p>
        </Bandeau>
      )}
      {annonce && (
        <p className={v2.bandeSucces} role="status">
          {annonce}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <section
          aria-label="Reste dû aux relais"
          className="flex min-w-0 flex-[1_1_220px] flex-col rounded-xl border-2 border-primary bg-card px-4 py-3.5"
        >
          <span className="text-sm font-bold text-muted-foreground">Reste dû aux relais</span>
          <b className="font-serif text-[32px] leading-tight text-primary-strong tabular-nums">
            {soldes === null ? '…' : francs(totalDu)}
          </b>
          <span className="text-sm text-muted-foreground lg:hidden">
            Versé ce mois&nbsp;: {francs(verseCeMois)}
          </span>
        </section>
        <section
          aria-label="Versé ce mois"
          className="flex min-w-0 flex-[1_1_220px] flex-col rounded-xl border border-border bg-card px-4 py-3.5 max-lg:hidden"
        >
          <span className="text-sm font-bold text-muted-foreground">Versé ce mois</span>
          <b className="font-serif text-[32px] leading-tight tabular-nums">{francs(verseCeMois)}</b>
        </section>
      </div>

      <section aria-label="À verser" className="flex flex-col gap-2.5">
        <h2 className={cn(v2.surtitre, 'mt-1')}>À verser</h2>
        <div
          role="table"
          aria-label="Reste dû par relais"
          className="flex flex-col gap-2.5 lg:gap-0 lg:overflow-hidden lg:rounded-xl lg:border lg:border-border lg:bg-card"
        >
          <div role="row" className={cn('grid max-lg:hidden', COLONNES)}>
            {['Relais', 'Gagné', 'Versé', 'Reste dû', 'Mobile Money', 'Dernier versement', ''].map(
              (t, i) => (
                <span key={i} role="columnheader" className={ENTETE}>
                  {t}
                </span>
              ),
            )}
          </div>
          {dus.map((s) => (
            <LigneSolde
              key={s.relaisId}
              s={s}
              verser={() => setAVerser(s)}
              numeroter={() => setANumeroter(s)}
            />
          ))}
          {soldes !== null && dus.length === 0 && (
            <div
              role="row"
              className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 lg:rounded-none lg:border-0"
            >
              <b role="cell">Rien à verser.</b>
              <span role="cell" className="text-[15px] text-muted-foreground">
                Une fiche acceptée ajoute 500&nbsp;FCFA au reste dû de son relais.
              </span>
            </div>
          )}
          {soldes === null && !erreur && (
            <p role="row" className="m-0 p-4 text-muted-foreground" aria-busy="true">
              <span role="cell">Calcul…</span>
            </p>
          )}
        </div>
        {aJour.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={aJourOuverts}
              onClick={() => setAJourOuverts((o) => !o)}
              className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg border border-input bg-card px-3.5 text-left font-sans text-[15px] font-bold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              {aJour.length} relais à jour, rien à verser
              <IconeBas
                className={cn('size-5 shrink-0 transition-transform', aJourOuverts && 'rotate-180')}
                aria-hidden
              />
            </button>
            {aJourOuverts && (
              <ul className="m-0 flex list-none flex-col rounded-xl border border-border bg-card p-0">
                {aJour.map((s, i) => (
                  <li
                    key={s.relaisId}
                    className={cn(
                      'flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 tabular-nums',
                      i > 0 && 'border-t border-border',
                    )}
                  >
                    <b className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                      {s.prenom || '[sans prénom]'}
                    </b>
                    <span className="text-sm text-muted-foreground">
                      Gagné {chiffres(s.gagneXaf)} · Versé {chiffres(s.verseXaf)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <Versements versements={versements} annuler={setAAnnuler} />

      {aVerser && (
        <NoterUnVersement
          admin={admin}
          s={aVerser}
          fermer={() => setAVerser(null)}
          surFait={(montant) => {
            setAVerser(null);
            setAnnonce(
              `${aVerser.prenom || 'Le relais'} : ${francs(montant)} versés. Il lit maintenant ${francs(aVerser.resteXaf - montant)} dus.`,
            );
            charger();
          }}
        />
      )}
      {aNumeroter && (
        <Dialogue
          titre="Numéro Mobile Money"
          entete={<b>Numéro Mobile Money de {aNumeroter.prenom || '[sans prénom]'}</b>}
          fermer={() => setANumeroter(null)}
          variante="feuille"
        >
          <NumeroMobileMoney
            admin={admin}
            relaisId={aNumeroter.relaisId}
            surFait={() => {
              setANumeroter(null);
              charger();
            }}
          />
        </Dialogue>
      )}
      {aAnnuler && (
        <AnnulerUnVersement
          admin={admin}
          v={aAnnuler}
          fermer={() => setAAnnuler(null)}
          surFait={() => {
            setAnnonce(
              `Versement du ${jourCourt(aAnnuler.verseLe)} annulé : ${francs(aAnnuler.montantXaf)} redeviennent dus à ${aAnnuler.prenom || 'ce relais'}.`,
            );
            setAAnnuler(null);
            charger();
          }}
        />
      )}
    </div>
  );
}

/** Un relais qui attend son argent : une carte sur téléphone, une ligne du tableau sur ordinateur. */
function LigneSolde({
  s,
  verser,
  numeroter,
}: {
  s: SoldeRelais;
  verser: () => void;
  numeroter: () => void;
}) {
  const prenom = s.prenom || '[sans prénom]';
  return (
    <div
      role="row"
      aria-label={prenom}
      className={cn(
        'grid items-center tabular-nums lg:border-t lg:border-border',
        COLONNES,
        'max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-x-3 max-lg:gap-y-1.5 max-lg:rounded-xl max-lg:border max-lg:border-border max-lg:bg-card max-lg:p-3.5',
      )}
    >
      <div role="cell" className="min-w-0 lg:px-4 lg:py-3">
        <b className="block [overflow-wrap:anywhere]">{prenom}</b>
      </div>
      <div role="cell" className="max-lg:hidden lg:px-4 lg:py-3">
        {chiffres(s.gagneXaf)}
      </div>
      <div role="cell" className="max-lg:hidden lg:px-4 lg:py-3">
        {chiffres(s.verseXaf)}
      </div>
      <div
        role="cell"
        className="max-lg:col-start-2 max-lg:row-start-1 max-lg:self-start max-lg:text-right lg:px-4 lg:py-3"
      >
        <span className="block text-xs text-muted-foreground lg:hidden">Reste dû</span>
        <b className="font-serif text-[22px] whitespace-nowrap text-primary-strong lg:font-sans lg:text-base">
          <span className="lg:hidden">{francs(s.resteXaf)}</span>
          <span className="max-lg:hidden">{chiffres(s.resteXaf)}</span>
        </b>
      </div>
      <div role="cell" className="min-w-0 max-lg:col-span-2 max-lg:row-start-2 lg:px-4 lg:py-3">
        {s.numero ? (
          <span className="flex flex-col text-sm text-muted-foreground lg:text-foreground">
            <span>
              {operateur(s.operateur)} ·{' '}
              <span className="whitespace-nowrap">{afficherTelephone(s.numero)}</span>
            </span>
            {s.titulaire && (
              <span className="text-muted-foreground [overflow-wrap:anywhere]">
                au nom de {s.titulaire}
              </span>
            )}
          </span>
        ) : (
          <span className={v2.pastilleAttention}>Numéro Mobile Money manquant</span>
        )}
      </div>
      <div role="cell" className="text-sm text-muted-foreground max-lg:col-span-2 lg:px-4 lg:py-3">
        <span className="lg:hidden">
          Gagné {chiffres(s.gagneXaf)} · Versé {chiffres(s.verseXaf)}
          {s.dernierLe && s.dernierXaf !== null && (
            <span className="block">
              Dernier versement&nbsp;: {jourCourt(s.dernierLe)} · {chiffres(s.dernierXaf)}
            </span>
          )}
        </span>
        <span className="max-lg:hidden">
          {s.dernierLe && s.dernierXaf !== null
            ? `${jourCourt(s.dernierLe)} · ${chiffres(s.dernierXaf)}`
            : 'Jamais'}
        </span>
      </div>
      <div role="cell" className="max-lg:col-span-2 max-lg:mt-1 lg:px-4 lg:py-3 lg:text-right">
        {s.numero ? (
          <Bouton type="button" className="max-lg:w-full" onClick={verser}>
            Noter un versement
          </Bouton>
        ) : (
          <Bouton type="button" variante="secondaire" className="max-lg:w-full" onClick={numeroter}>
            Ajouter son numéro
          </Bouton>
        )}
      </div>
    </div>
  );
}

/** La feuille « Noter un versement » : le montant pré-rempli au reste dû, la date du jour, la référence facultative. */
function NoterUnVersement({
  admin,
  s,
  fermer,
  surFait,
}: {
  admin: PortAdministration;
  s: SoldeRelais;
  fermer: () => void;
  surFait: (montant: number) => void;
}) {
  const aujourdhui = jourABrazzaville(new Date());
  const [montant, setMontant] = useState(chiffres(s.resteXaf));
  const [le, setLe] = useState(aujourdhui);
  const [reference, setReference] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const prenom = s.prenom || '[sans prénom]';
  const lu = lireMontant(montant);
  const erreurMontant =
    montant.trim() === ''
      ? undefined
      : lu === null || lu <= 0
        ? 'Un montant en francs, plus grand que 0.'
        : lu > s.resteXaf
          ? `Plus que le reste dû (${francs(s.resteXaf)}). Une avance n’est pas permise.`
          : undefined;
  const erreurDate = le > aujourdhui ? 'Pas de date dans le futur.' : undefined;
  const pret = lu !== null && lu > 0 && !erreurMontant && !erreurDate && le !== '';

  const noter = async (ev: { preventDefault: () => void }) => {
    ev.preventDefault();
    if (!pret || lu === null) return;
    setEnCours(true);
    setErreur(null);
    try {
      await admin.noterVersement(s.relaisId, lu, le, reference.trim() || null);
      surFait(lu);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Dialogue
      titre="Noter un versement"
      entete={<b>Noter un versement</b>}
      fermer={fermer}
      variante="feuille"
      occupe={enCours}
    >
      <form className="flex flex-col gap-4" onSubmit={(ev) => void noter(ev)}>
        <div className="flex items-start gap-3 rounded-xl border border-border bg-background px-3.5 py-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="[overflow-wrap:anywhere]">{prenom}</b>
            {s.numero && (
              <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {operateur(s.operateur)} · {afficherTelephone(s.numero)}
                {s.titulaire ? ` · au nom de ${s.titulaire}` : ''}
              </span>
            )}
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <span className="text-xs text-muted-foreground">Reste dû</span>
            <b className="whitespace-nowrap tabular-nums">{francs(s.resteXaf)}</b>
          </span>
        </div>
        <Champ
          libelle="Montant versé"
          aide="Le reste dû, ou moins pour un paiement partiel."
          erreur={erreurMontant}
        >
          {(a) => (
            <span className="relative flex">
              <input
                {...a}
                className={cn(v2.champ, 'pr-16 font-bold tabular-nums')}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={montant}
                onChange={(ev) => setMontant(ev.target.value)}
              />
              <span
                className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 font-bold text-muted-foreground"
                aria-hidden
              >
                FCFA
              </span>
            </span>
          )}
        </Champ>
        <Champ libelle="Date du versement" erreur={erreurDate}>
          {(a) => (
            <input
              {...a}
              className={cn(v2.champ, 'w-full sm:w-56')}
              type="date"
              max={aujourdhui}
              value={le}
              onChange={(ev) => setLe(ev.target.value)}
            />
          )}
        </Champ>
        <Champ libelle="Référence Mobile Money" facultatif>
          {(a) => (
            <input
              {...a}
              className={v2.champ}
              type="text"
              autoComplete="off"
              maxLength={80}
              placeholder="ex. MP261119.1432"
              value={reference}
              onChange={(ev) => setReference(ev.target.value)}
            />
          )}
        </Champ>
        {pret && lu !== null && (
          <p className={v2.bandeSucces}>
            <span>
              {prenom} lira&nbsp;: <b>NTanova vous doit {francs(s.resteXaf - lu)}</b>, et ce
              versement dans «&nbsp;Reçu&nbsp;».
            </span>
          </p>
        )}
        {erreur && <p className={v2.erreur}>{erreur}</p>}
        <Bouton
          type="submit"
          className="w-full"
          disabled={!pret}
          enCours={enCours}
          texteEnCours="Enregistrement…"
        >
          {pret && lu !== null ? `Noter ${francs(lu)} versés` : 'Noter le versement'}
        </Bouton>
      </form>
    </Dialogue>
  );
}

/** Les derniers versements : une liste sur téléphone, un tableau sur ordinateur ; « Annuler » sur ceux qui comptent. */
function Versements({
  versements,
  annuler,
}: {
  versements: VersementVu[] | null;
  annuler: (v: VersementVu) => void;
}) {
  const cols =
    'lg:grid-cols-[88px_minmax(120px,1fr)_96px_minmax(130px,1.2fr)_minmax(90px,0.8fr)_minmax(120px,1.2fr)]';
  if (versements === null) return null;
  return (
    <section aria-label="Derniers versements" className="flex flex-col gap-2.5">
      <h2 className={cn(v2.titreSection, 'mt-2')}>Derniers versements</h2>
      {versements.length === 0 ? (
        <p className="m-0 text-[15px] text-muted-foreground">Aucun versement noté.</p>
      ) : (
        <div
          role="table"
          aria-label="Derniers versements"
          className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
        >
          <div role="row" className={cn('grid max-lg:hidden', cols)}>
            {['Date', 'Relais', 'Montant', 'Référence', 'Noté par', ''].map((t, i) => (
              <span key={i} role="columnheader" className={ENTETE}>
                {t}
              </span>
            ))}
          </div>
          {versements.map((v) => {
            const annule = v.annuleLe !== null;
            return (
              <div
                key={v.id}
                role="row"
                className={cn(
                  'grid items-center tabular-nums',
                  cols,
                  'max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-x-3 max-lg:gap-y-1 max-lg:px-3.5 max-lg:py-3',
                  'border-t border-border max-lg:nth-2:border-t-0',
                  annule && 'text-muted-foreground',
                )}
              >
                <span role="cell" className="max-lg:hidden lg:px-4 lg:py-3">
                  {jourCourt(v.verseLe)}
                </span>
                <span role="cell" className="min-w-0 lg:px-4 lg:py-3">
                  <span className={cn('block [overflow-wrap:anywhere]', annule && 'line-through')}>
                    <span className="lg:hidden">{jourCourt(v.verseLe)} · </span>
                    {v.prenom || '[sans prénom]'}
                  </span>
                </span>
                <span role="cell" className="text-right lg:px-4 lg:py-3 lg:text-left">
                  {annule ? <s>{chiffres(v.montantXaf)}</s> : <b>{chiffres(v.montantXaf)}</b>}
                </span>
                <span
                  role="cell"
                  className="min-w-0 text-sm [overflow-wrap:anywhere] max-lg:col-span-2 lg:px-4 lg:py-3"
                >
                  {v.reference ? `réf. ${v.reference}` : 'sans référence'}
                  <span className="lg:hidden">{v.notePar ? ` · noté par ${v.notePar}` : ''}</span>
                </span>
                <span role="cell" className="text-sm max-lg:hidden lg:px-4 lg:py-3">
                  {v.notePar ?? '—'}
                </span>
                <span role="cell" className="max-lg:col-span-2 lg:px-4 lg:py-2 lg:text-right">
                  {annule ? (
                    <span className={cn(v2.pastilleAttention, 'whitespace-normal')}>
                      Annulé{v.motifAnnulation ? ` : ${v.motifAnnulation}` : ''}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={v2.lien}
                      aria-label={`Annuler le versement du ${jourCourt(v.verseLe)} à ${v.prenom || 'ce relais'}`}
                      onClick={() => annuler(v)}
                    >
                      Annuler
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AnnulerUnVersement({
  admin,
  v,
  fermer,
  surFait,
}: {
  admin: PortAdministration;
  v: VersementVu;
  fermer: () => void;
  surFait: () => void;
}) {
  const [motif, setMotif] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const id = useId();
  const annuler = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      await admin.annulerVersement(v.id, motif.trim());
      surFait();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };
  return (
    <Dialogue
      titre="Annuler ce versement"
      entete={<b>Annuler ce versement ?</b>}
      fermer={fermer}
      variante="confirmation"
      libelleFermeture="Garder"
      occupe={enCours}
    >
      <p className="m-0 text-[15px]">
        {jourCourt(v.verseLe)} · {v.prenom || '[sans prénom]'} · <b>{francs(v.montantXaf)}</b>. Le
        montant redevient dû ; le versement reste lisible ici, le relais ne le voit plus.
      </p>
      <div className={v2.groupe}>
        <label htmlFor={id}>Pourquoi ?</label>
        <input
          id={id}
          className={v2.champ}
          type="text"
          maxLength={200}
          placeholder="ex. erreur de montant"
          value={motif}
          onChange={(ev) => setMotif(ev.target.value)}
        />
      </div>
      {erreur && <p className={v2.erreur}>{erreur}</p>}
      <Bouton
        type="button"
        variante="danger"
        disabled={motif.trim().length < 2}
        enCours={enCours}
        texteEnCours="Annulation…"
        onClick={() => void annuler()}
      >
        Annuler le versement
      </Bouton>
    </Dialogue>
  );
}

/** Le numéro Mobile Money d'un relais, quand il ne l'a pas donné lui-même. */
function NumeroMobileMoney({
  admin,
  relaisId,
  surFait,
}: {
  admin: PortAdministration;
  relaisId: string;
  surFait: () => void;
}) {
  const [choix, setChoix] = useState<Operateur>('mtn');
  const [numero, setNumero] = useState('');
  const [titulaire, setTitulaire] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const noter = async (ev: { preventDefault: () => void }) => {
    ev.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      await admin.enregistrerMobileMoney(
        relaisId,
        choix,
        numero.replace(/[\s.+()-]/g, ''),
        titulaire.trim() || null,
      );
      surFait();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };
  return (
    <form className="flex flex-col gap-4" onSubmit={(ev) => void noter(ev)}>
      <Champ libelle="Opérateur">
        {(a) => (
          <select
            {...a}
            className={v2.champ}
            value={choix}
            onChange={(ev) => setChoix(ev.target.value as Operateur)}
          >
            {(Object.keys(libelleOperateur) as Operateur[]).map((o) => (
              <option key={o} value={o}>
                {libelleOperateur[o]}
              </option>
            ))}
          </select>
        )}
      </Champ>
      <Champ libelle="Numéro Mobile Money" aide="Avec l’indicatif : 242 06 …">
        {(a) => (
          <input
            {...a}
            className={v2.champ}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={numero}
            onChange={(ev) => setNumero(ev.target.value)}
          />
        )}
      </Champ>
      <Champ libelle="Au nom de" facultatif>
        {(a) => (
          <input
            {...a}
            className={v2.champ}
            type="text"
            autoComplete="off"
            value={titulaire}
            onChange={(ev) => setTitulaire(ev.target.value)}
          />
        )}
      </Champ>
      {erreur && <p className={v2.erreur}>{erreur}</p>}
      <Bouton type="submit" disabled={numero.trim() === ''} enCours={enCours}>
        Noter le numéro
      </Bouton>
    </form>
  );
}
