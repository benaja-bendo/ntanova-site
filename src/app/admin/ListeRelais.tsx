import { v2 } from '@/ui/v2/classes';
import { useCallback, useEffect, useState } from 'react';
import {
  ErreurDecision,
  type LotVu,
  type PortAdministration,
  type RelaisVu,
} from '../../modele/ports';
import { Bandeau } from '@/ui/v2/formulaire';
import { jour } from '../../ui/composants';
import { TitreEcran } from './Cadre';
import { ActionsSecondaires, Bouton, Dialogue } from '@/ui/v2/admin';
import { cn } from '@/lib/utils';
import { IconeBas } from '@/ui/shadcn/icones';

/** Lot G : ce qui demande un regard — des fiches renvoyées, une position lente cette semaine ; sinon « Aucun ». */
export function signauxDuRelais(r: Pick<RelaisVu, 'compteurs'>): string[] {
  const s: string[] = [];
  const { aCorriger, positionLenteSemaine } = r.compteurs;
  if (aCorriger > 0)
    s.push(`${aCorriger} fiche${aCorriger > 1 ? 's' : ''} renvoyée${aCorriger > 1 ? 's' : ''}`);
  if (positionLenteSemaine > 0) s.push(`Position lente ${positionLenteSemaine} fois`);
  return s;
}

function SignalDuRelais({ r }: { r: RelaisVu }) {
  const s = signauxDuRelais(r);
  if (s.length === 0) return <span className="text-muted-foreground max-lg:hidden">Aucun</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {s.map((x) => (
        <span key={x} className={v2.pastilleAttention}>
          {x}
        </span>
      ))}
    </span>
  );
}

/** Lot G : en tête, les comptes à activer et les relais de la semaine ; les autres, repliés en bas de liste. */
export function relaisDeLaSemaine(
  r: Pick<RelaisVu, 'statut' | 'activeLe' | 'compteurs'>,
  maintenant: number = Date.now(),
): boolean {
  if (r.statut === 'en_attente') return true;
  if (r.compteurs.envoyeesSemaine > 0) return true;
  // Un relais activé depuis moins de 7 jours reste en vue : il commence.
  return (
    r.statut === 'actif' &&
    r.activeLe !== null &&
    maintenant - Date.parse(r.activeLe) < 7 * 86_400_000
  );
}

/** « Première connexion hier », « Jamais connecté » : ce que dit la colonne « Compte » (planche). */
function PastilleCompte({ r }: { r: RelaisVu }) {
  if (r.statut === 'suspendu') return <span className={v2.pastilleDanger}>Suspendu</span>;
  if (r.statut === 'en_attente') return <span className={v2.pastilleAttention}>À activer</span>;
  if (r.compteurs.envoyees === 0) return <span className={v2.pastilleNeutre}>Jamais connecté</span>;
  return <span className={v2.pastilleSucces}>Actif</span>;
}

/** Les gestes rares d'un relais (planche : ils ne sont pas dans la ligne) : changer de lot, suspendre, réactiver. */
function GestesDuRelais({
  r,
  lots,
  admin,
  surChangement,
}: {
  r: RelaisVu;
  lots: LotVu[];
  admin: PortAdministration;
  surChangement: (texte: string) => void;
}) {
  // Un relais sans lot (valeur vide) relève où il se trouve : le lot n'est qu'un secteur conseillé. Un nouveau relais
  // ne commence plus par le lot d'essai (décision du fondateur, 05/11/2026).
  const [lot, setLot] = useState(r.lotId ?? '');
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const agir = async (action: () => Promise<void>, texte: string) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      setOuvert(false);
      surChangement(texte);
    } catch (e) {
      setErreur(e instanceof ErreurDecision ? e.message : 'La base ne répond pas.');
    } finally {
      setEnCours(false);
    }
  };
  return (
    <>
      <ActionsSecondaires nom={r.prenom || 'ce relais'} discret>
        <button type="button" onClick={() => setOuvert(true)}>
          {r.statut === 'actif' ? 'Changer de lot' : 'Choisir son lot et l’activer'}
        </button>
        {r.statut === 'actif' ? (
          <button
            type="button"
            className="text-destructive!"
            disabled={enCours}
            onClick={() =>
              void agir(() => admin.suspendreRelais(r.id), `${r.prenom} est suspendu.`)
            }
          >
            Suspendre
          </button>
        ) : r.statut === 'suspendu' ? (
          <button
            type="button"
            disabled={enCours}
            onClick={() =>
              void agir(() => admin.activerRelais(r.id, r.lotId), `${r.prenom} est actif.`)
            }
          >
            Réactiver
          </button>
        ) : (
          // Un compte inconnu s'écarte : il passe « suspendu », et peut être réactivé plus tard.
          <button
            type="button"
            className="text-destructive!"
            disabled={enCours}
            onClick={() => void agir(() => admin.suspendreRelais(r.id), `${r.prenom} est écarté.`)}
          >
            Écarter ce compte
          </button>
        )}
      </ActionsSecondaires>
      {erreur && !ouvert && <span className={v2.erreur}>{erreur}</span>}
      {ouvert && (
        <Dialogue
          titre={`Le lot de ${r.prenom}`}
          variante="confirmation"
          libelleFermeture="Annuler"
          occupe={enCours}
          fermer={() => setOuvert(false)}
          entete={<h2>Le lot de {r.prenom || 'ce relais'}</h2>}
        >
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Lot (un secteur conseillé)
            <select
              className={v2.champ}
              aria-label={`Lot de ${r.prenom}`}
              value={lot}
              onChange={(e) => setLot(e.target.value)}
            >
              <option value="">Sans lot</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nom === l.divisionNom ? l.nom : `${l.nom} — ${l.divisionNom}`}
                </option>
              ))}
            </select>
          </label>
          {erreur && <p className={v2.erreur}>{erreur}</p>}
          <Bouton
            enCours={enCours}
            onClick={() =>
              void agir(
                () => admin.activerRelais(r.id, lot || null),
                r.statut === 'actif' ? `${r.prenom} change de lot.` : `${r.prenom} est actif.`,
              )
            }
          >
            {r.statut === 'actif' ? 'Changer de lot' : 'Activer'}
          </Bouton>
        </Dialogue>
      )}
    </>
  );
}

/** Une ligne (ordinateur) ou une carte (téléphone) : le relais, son compte, ses fiches, ses contacts, son signal. */
function LigneRelais({
  r,
  lots,
  admin,
  surChangement,
}: {
  r: RelaisVu;
  lots: LotVu[];
  admin: PortAdministration;
  surChangement: (texte: string) => void;
}) {
  const fiches = (
    <>
      <b>{r.compteurs.envoyees}</b>
      {r.compteurs.envoyeesSemaine > 0 && (
        <span className="text-muted-foreground">
          {' '}
          · {r.compteurs.envoyeesSemaine} cette semaine
        </span>
      )}
    </>
  );
  return (
    <div
      role="row"
      aria-label={r.prenom || '[sans prénom]'}
      className="grid items-center border-t border-border lg:grid-cols-[minmax(0,1.4fr)_1fr_1.4fr_1fr_1.4fr_auto] max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-y-1 max-lg:rounded-xl max-lg:border max-lg:bg-card max-lg:px-4 max-lg:py-3.5"
    >
      <div role="cell" className="px-4 py-3.5 max-lg:p-0">
        <b className="text-[17px]">{r.prenom || '[sans prénom]'}</b>
        <span className="block text-sm text-muted-foreground lg:hidden">
          {r.compteurs.envoyees} fiche{r.compteurs.envoyees > 1 ? 's' : ''} envoyée
          {r.compteurs.envoyees > 1 ? 's' : ''}
          {r.compteurs.envoyeesSemaine > 0 ? ` · ${r.compteurs.envoyeesSemaine} cette semaine` : ''}
          {r.compteurs.contactsConfirmes > 0
            ? ` · ${r.compteurs.contactsConfirmes} contact${r.compteurs.contactsConfirmes > 1 ? 's' : ''} confirmé${r.compteurs.contactsConfirmes > 1 ? 's' : ''}`
            : ''}
        </span>
      </div>
      <div role="cell" className="px-4 py-3.5 max-lg:hidden">
        <PastilleCompte r={r} />
      </div>
      <div role="cell" className="px-4 py-3.5 max-lg:hidden">
        {fiches}
      </div>
      <div role="cell" className="px-4 py-3.5 max-lg:hidden">
        {r.compteurs.contactsConfirmes}
      </div>
      <div role="cell" className="px-4 py-3.5 max-lg:col-span-2 max-lg:p-0 max-lg:empty:hidden">
        <SignalDuRelais r={r} />
      </div>
      <div
        role="cell"
        className="flex items-center justify-end gap-2 px-4 py-3.5 max-lg:col-start-2 max-lg:row-start-1 max-lg:p-0"
      >
        {r.compteurs.envoyees > 0 && (
          <a className="text-[15px] font-bold text-primary underline max-lg:hidden" href="#valider">
            Voir ses fiches
          </a>
        )}
        <GestesDuRelais r={r} lots={lots} admin={admin} surChangement={surChangement} />
      </div>
    </div>
  );
}

function TableauRelais({
  relais,
  lots,
  admin,
  surChangement,
  vide,
  entete = true,
}: {
  relais: RelaisVu[];
  lots: LotVu[];
  admin: PortAdministration;
  surChangement: (id: string, texte: string) => void;
  vide: string | null;
  entete?: boolean;
}) {
  return (
    <div role="table" aria-label="Relais" className="flex flex-col max-lg:gap-2.5">
      {entete && (
        <div
          role="row"
          className="grid bg-muted text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase lg:grid-cols-[minmax(0,1.4fr)_1fr_1.4fr_1fr_1.4fr_auto] max-lg:hidden"
        >
          {['Relais', 'Compte', 'Fiches envoyées', 'Contacts confirmés', 'Signal', ''].map(
            (t, i) => (
              <div role="columnheader" key={i} className="px-4 py-3">
                {t || <span className="sr-only">Gestes</span>}
              </div>
            ),
          )}
        </div>
      )}
      {relais.map((r) => (
        <LigneRelais
          key={`${r.id}-${r.statut}-${r.lotId ?? ''}`}
          r={r}
          lots={lots}
          admin={admin}
          surChangement={(texte) => surChangement(r.id, texte)}
        />
      ))}
      {vide && <p className="m-0 border-t border-border px-4 py-3 text-muted-foreground">{vide}</p>}
    </div>
  );
}

export function ListeRelais({
  admin,
  surCompte,
}: {
  admin: PortAdministration;
  /** Combien de comptes attendent d'être activés : le menu le dit, d'où qu'on arrive. */
  surCompte: (n: number) => void;
}) {
  const [relais, setRelais] = useState<RelaisVu[] | null>(null);
  const [lots, setLots] = useState<LotVu[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Un relais sur lequel on vient d'agir reste en vue pendant la visite : il ne file pas dans « autres relais ».
  const [touches, setTouches] = useState<ReadonlySet<string>>(new Set());
  const aActiver = (relais ?? []).filter((r) => r.statut === 'en_attente');
  const enVue = (relais ?? []).filter(
    (r) => r.statut !== 'en_attente' && (relaisDeLaSemaine(r) || touches.has(r.id)),
  );
  const autres = (relais ?? []).filter(
    (r) => r.statut !== 'en_attente' && !relaisDeLaSemaine(r) && !touches.has(r.id),
  );
  const charger = useCallback(() => {
    Promise.all([admin.relais(), admin.lots()])
      .then(([r, l]) => {
        const ordre = { en_attente: 0, actif: 1, suspendu: 2 } as const;
        setRelais(
          [...r].sort(
            (a, b) =>
              ordre[a.statut] - ordre[b.statut] ||
              b.compteurs.envoyeesSemaine - a.compteurs.envoyeesSemaine,
          ),
        );
        setLots(l);
        setErreur(null);
        surCompte(r.filter((x) => x.statut === 'en_attente').length);
      })
      .catch(() => setErreur('La base ne répond pas. Vérifie le réseau et recharge la page.'));
  }, [admin, surCompte]);

  useEffect(() => {
    charger();
  }, [charger]);

  const surChangement = (id: string, texte: string) => {
    setTouches((avant) => new Set(avant).add(id));
    setAnnonce(texte);
    charger();
  };
  const activer = async (r: RelaisVu) => {
    setEnCours(true);
    try {
      await admin.activerRelais(r.id, null);
      surChangement(r.id, `${r.prenom || 'Le relais'} est actif.`);
    } catch (e) {
      setErreur(e instanceof ErreurDecision ? e.message : 'La base ne répond pas.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <>
      <TitreEcran
        titre="Relais"
        regles={
          <>
            <p>
              Un relais apparaît ici dès sa première connexion, « à activer », avec l’adresse de son
              compte : relie-la à la personne (son message WhatsApp), puis active-la. « Écarter »
              (dans « ⋯ ») met de côté un compte que tu ne connais pas. Le lot, un secteur
              conseillé, se change aussi dans « ⋯ ».
            </p>
            <p>
              « Signal » : des fiches renvoyées, ou une position lente cette semaine. Les relais
              sans envoi cette semaine sont repliés en bas.
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

      {aActiver.map((r) => (
        <section
          key={r.id}
          aria-label={`Compte à activer : ${r.prenom}`}
          className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border-2 border-ambre bg-attention px-4 py-3.5"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="font-serif text-xl max-lg:font-sans max-lg:text-lg">
              {aActiver.length > 1 ? 'Compte à activer' : 'Un compte à activer'}
            </b>
            <span className="text-[15px]">
              Créé {jourRelatif(r.creeLe)}, à relier à une personne
              {r.email ? ` · ${r.email}` : ''}.
            </span>
          </span>
          <span className="flex items-center gap-1">
            <Bouton enCours={enCours} texteEnCours="Activation…" onClick={() => void activer(r)}>
              Activer
            </Bouton>
            <GestesDuRelais
              r={r}
              lots={lots}
              admin={admin}
              surChangement={(texte) => surChangement(r.id, texte)}
            />
          </span>
        </section>
      ))}

      <h2 className={cn(v2.surtitre, 'lg:hidden')}>Actifs cette semaine</h2>
      <div className="overflow-hidden rounded-xl border border-border bg-card max-lg:overflow-visible max-lg:border-0 max-lg:bg-transparent">
        <TableauRelais
          relais={enVue}
          lots={lots}
          admin={admin}
          surChangement={surChangement}
          vide={
            relais === null && !erreur
              ? 'Chargement des relais…'
              : relais?.length === 0
                ? 'Aucun relais ne s’est encore connecté.'
                : enVue.length === 0
                  ? 'Aucun relais n’a envoyé de fiche cette semaine.'
                  : null
          }
        />
        {autres.length > 0 && (
          <details className="group border-t border-border max-lg:mt-2.5 max-lg:rounded-xl max-lg:border max-lg:bg-card">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-[15px] font-bold text-primary-strong [&::-webkit-details-marker]:hidden max-lg:justify-between max-lg:text-foreground">
              <IconeBas
                className="size-5 transition-transform group-open:rotate-180 max-lg:order-last"
                aria-hidden
              />
              {autres.length} autre{autres.length > 1 ? 's' : ''} relais, sans envoi cette semaine
            </summary>
            <TableauRelais
              relais={autres}
              lots={lots}
              admin={admin}
              surChangement={surChangement}
              vide={null}
              entete={false}
            />
          </details>
        )}
      </div>
      <details className="group">
        <summary className="cursor-pointer list-none text-[15px] font-bold text-primary-strong underline [&::-webkit-details-marker]:hidden">
          Quelqu’un ne peut pas se connecter ?
        </summary>
        <p className="mt-2 mb-0 text-sm text-muted-foreground">
          Tant que l’application Google est en mode « test », seules les adresses ajoutées dans
          Google Cloud (Écran de consentement, Utilisateurs de test) peuvent se connecter. Publier
          l’application lève cette limite.
        </p>
      </details>
    </>
  );
}

/** « hier », « aujourd'hui », sinon « le 30/10 ». */
function jourRelatif(iso: string): string {
  const jours = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (jours <= 0) return 'aujourd’hui';
  if (jours === 1) return 'hier';
  return `le ${jour(iso)}`;
}
