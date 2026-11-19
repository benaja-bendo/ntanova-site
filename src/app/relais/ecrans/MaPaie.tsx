/**
 * « Ma paie » (planche « Ma paie (solde) », 19/11) : ce que NTanova vous doit, comme une facture (tout ce qui est gagné,
 * une ligne par genre, « 5 × 500 », moins « Déjà reçu »), ce qui n'est pas encore compté, puis les versements reçus.
 * Lecture seule : la base calcule, l'écran n'affiche que ce qu'elle dit. Sans le solde (base ou paie gardée d'avant la
 * mise à jour), l'ancienne vue : l'acquis du vendredi et les semaines closes.
 */
import {
  chiffres,
  compteDesFiches,
  factureCourte,
  francs,
  jourLong,
  resumeDeLaSemaine,
  vendrediLong,
} from '../../../modele/paie';
import type { LigneDeFacture, LigneDeMaPaie, SoldeDuRelais } from '../../../modele/ports';
import { cn } from '@/lib/utils';
import { Badge } from '@/ui/shadcn/badge';
import { Card } from '@/ui/shadcn/card';
import { IconeAlerte, IconeAttente, IconeOuvrir } from '@/ui/shadcn/icones';
import { lireMemoire, useRequete } from '../base-locale';
import { BarreDuBas, EnTete, Surtitre } from '../cadre';
import { ChargementEcran, EtatVide } from '../etats';

const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function MaPaie() {
  const paie = useRequete(async () => (await lireMemoire('paie')) ?? null);
  const releves = useRequete(async () => (await lireMemoire('releves')) ?? []);

  if (paie === undefined || releves === undefined) return <ChargementEcran titre="Ma paie" />;

  const compte = compteDesFiches(releves);
  const pasComptees = [
    compte.enAttente ? `${compte.enAttente} en attente` : null,
    compte.aCorriger ? `${compte.aCorriger} à corriger` : null,
  ].filter(Boolean);
  const closes = paie?.historique ?? [];

  return (
    <div className="ecran">
      <EnTete titre="Ma paie" />
      <main className="flex flex-1 flex-col gap-4 p-4">
        {paie === null ? (
          <EtatVide titre="La paie s’affiche dès que le téléphone capte.">
            Vos fiches restent sur le téléphone en attendant.
          </EtatVide>
        ) : (
          <>
            {paie.acquis.solde ? (
              <Solde
                solde={paie.acquis.solde}
                lignes={[paie.acquis, ...closes].flatMap((l) => l.lignes ?? [])}
                nonPayables={paie.acquis.nonPayables}
              />
            ) : (
              <Acquis ligne={paie.acquis} />
            )}

            {pasComptees.length > 0 && (
              <a
                href="#fiches"
                className="flex min-h-12 items-center gap-3 rounded-lg bg-attention px-4 py-3 text-sm text-attention-foreground no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
              >
                <IconeAttente className="size-5 shrink-0" aria-hidden />
                <span className="flex-1">
                  <b>Pas comptées&nbsp;:</b> {pasComptees.join(', ')}
                </span>
                <IconeOuvrir className="size-5 shrink-0" aria-hidden />
              </a>
            )}

            {!paie.numeroConnu && (
              <a
                href="#compte"
                className="flex min-h-12 items-center gap-3 rounded-lg bg-danger px-4 py-3 text-[15px] text-danger-foreground no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
              >
                <IconeAlerte className="size-5 shrink-0" aria-hidden />
                <span className="flex-1">
                  <b>Votre numéro Mobile Money manque.</b> Ajoutez-le pour être payé.
                </span>
                <IconeOuvrir className="size-5 shrink-0" aria-hidden />
              </a>
            )}

            {paie.acquis.solde ? (
              <Recus versements={paie.acquis.solde.versements} />
            ) : (
              <section className="mt-2 flex flex-col gap-2.5" aria-label="Semaines closes">
                <Surtitre>Déjà payé</Surtitre>
                {closes.length === 0 ? (
                  <p className="m-0 text-[15px] text-muted-foreground">
                    Aucune semaine close pour le moment.
                  </p>
                ) : (
                  <Card className="gap-0 overflow-hidden py-0">
                    <ul className="m-0 list-none p-0">
                      {closes.map((s, i) => (
                        <Semaine key={s.vendredi} ligne={s} premiere={i === 0} />
                      ))}
                    </ul>
                  </Card>
                )}
              </section>
            )}
          </>
        )}
      </main>
      <BarreDuBas />
    </div>
  );
}

/** Les lignes de toutes les semaines réunies : une par genre et par tarif (« 24 × 500 »). */
function reunir(lignes: readonly LigneDeFacture[]): LigneDeFacture[] {
  const parCle = new Map<string, LigneDeFacture>();
  for (const l of lignes) {
    const cle = `${l.genre}|${l.tarifXaf}`;
    const deja = parCle.get(cle);
    parCle.set(
      cle,
      deja
        ? { ...deja, nombre: deja.nombre + l.nombre, fiches: [...deja.fiches, ...l.fiches] }
        : { ...l },
    );
  }
  return [...parCle.values()];
}

/** 19/11 : la carte du haut. Ce que NTanova vous doit en grand, puis tout ce qui est gagné, moins ce qui est reçu. */
function Solde({
  solde,
  lignes,
  nonPayables,
}: {
  solde: SoldeDuRelais;
  lignes: readonly LigneDeFacture[];
  nonPayables: number;
}) {
  const facture = factureCourte({ fiches: 0, contacts: 0, essais: 0, lignes: reunir(lignes) });
  const ligne =
    'grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 border-t border-border py-3.5 text-base tabular-nums';
  return (
    <section
      aria-label="Ce que NTanova vous doit"
      className="flex flex-col rounded-lg border-2 border-primary bg-card px-[17px] pt-4 pb-1"
    >
      <p className="m-0 text-[15px] font-bold text-muted-foreground">NTanova vous doit</p>
      <p className="m-0 mt-1 mb-3 font-serif text-[34px] leading-tight font-bold text-primary-strong tabular-nums [overflow-wrap:anywhere]">
        {francs(Math.max(solde.resteXaf, 0))}
      </p>
      {facture.length > 0 ? (
        <ul className="m-0 list-none p-0" aria-label="Le détail">
          {facture.map((l) => (
            <li key={`${l.libelle}|${l.calcul ?? ''}`} className={ligne}>
              <span>{l.libelle}</span>
              <span className="text-[15px] whitespace-nowrap text-muted-foreground">
                {l.calcul ?? ''}
              </span>
              <b className="min-w-14 text-right whitespace-nowrap">
                {l.sousTotal !== null ? chiffres(l.sousTotal) : ''}
              </b>
            </li>
          ))}
          {solde.recuXaf > 0 && (
            <li className={cn(ligne, 'text-muted-foreground')}>
              <span>Déjà reçu</span>
              <span />
              <b className="min-w-14 text-right whitespace-nowrap">−{chiffres(solde.recuXaf)}</b>
            </li>
          )}
        </ul>
      ) : (
        <p className="m-0 border-t border-border py-3.5 text-[15px] text-muted-foreground">
          Rien pour le moment. Une fiche acceptée par NTanova est payée.
        </p>
      )}
      {facture.length > 0 && solde.resteXaf <= 0 && (
        <p className="m-0 border-t border-border py-3 text-sm text-muted-foreground">
          Tout est réglé. Merci&nbsp;!
        </p>
      )}
      {nonPayables > 0 && (
        <p className="m-0 border-t border-border py-3 text-sm text-muted-foreground">
          {nonPayables} fiche{nonPayables > 1 ? 's' : ''} acceptée{nonPayables > 1 ? 's' : ''} sans
          paie&nbsp;: l’école était déjà relevée par un autre relais.
        </p>
      )}
      <p className="m-0 border-t border-border py-3 text-sm text-muted-foreground">
        NTanova paie chaque semaine par Mobile Money.
      </p>
    </section>
  );
}

/** 19/11 : les versements reçus, le plus récent d'abord (jamais un versement annulé). */
function Recus({ versements }: { versements: SoldeDuRelais['versements'] }) {
  return (
    <section className="mt-2 flex flex-col gap-2.5" aria-label="Reçu">
      <Surtitre>Reçu</Surtitre>
      {versements.length === 0 ? (
        <p className="m-0 text-[15px] text-muted-foreground">Rien de reçu pour le moment.</p>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="m-0 list-none p-0">
            {versements.map((v, i) => (
              <li
                key={`${v.verseLe}|${i}`}
                className={cn(
                  'flex items-center gap-3 px-4 py-3.5 tabular-nums',
                  i > 0 && 'border-t border-border',
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="text-[17px]">{majuscule(jourLong(v.verseLe))}</b>
                  <span className="text-[15px] text-muted-foreground [overflow-wrap:anywhere]">
                    {v.reference ? `réf. ${v.reference}` : 'Mobile Money'}
                  </span>
                </span>
                <b className="text-[17px] whitespace-nowrap">{chiffres(v.montantXaf)}</b>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

/** La carte du haut : le vendredi, le total en grand, puis la facture. */
function Acquis({ ligne }: { ligne: LigneDeMaPaie }) {
  const lignes = factureCourte(ligne);
  return (
    <section
      aria-label="Acquis"
      className="flex flex-col rounded-lg border-2 border-primary bg-card px-[17px] pt-4 pb-1"
    >
      <p className="m-0 text-[15px] font-bold text-muted-foreground">
        {ligne.vendredi ? `À payer ${vendrediLong(ligne.vendredi)}` : 'À payer vendredi'}
      </p>
      <p className="m-0 mt-1 mb-3 font-serif text-[34px] leading-tight font-bold text-primary-strong tabular-nums">
        {francs(ligne.totalXaf)}
      </p>
      {lignes.length > 0 ? (
        <ul className="m-0 list-none p-0" aria-label="Le détail">
          {lignes.map((l) => (
            <li
              key={l.libelle}
              className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 border-t border-border py-3.5 text-base tabular-nums"
            >
              <span>{l.libelle}</span>
              <span className="text-[15px] text-muted-foreground">{l.calcul ?? ''}</span>
              <b className="min-w-14 text-right">
                {l.sousTotal !== null ? chiffres(l.sousTotal) : ''}
              </b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 border-t border-border py-3.5 text-[15px] text-muted-foreground">
          Rien d’acquis pour le moment. Une fiche acceptée par NTanova est payée.
        </p>
      )}
      {ligne.nonPayables > 0 && (
        <p className="m-0 border-t border-border py-3 text-sm text-muted-foreground">
          {ligne.nonPayables} fiche{ligne.nonPayables > 1 ? 's' : ''} acceptée
          {ligne.nonPayables > 1 ? 's' : ''} sans paie&nbsp;: l’école était déjà relevée par un
          autre relais.
        </p>
      )}
    </section>
  );
}

/** Une semaine close : le vendredi, ce qu'elle a compté, le montant ; « À payer » tant que NTanova n'a pas envoyé. */
function Semaine({ ligne, premiere }: { ligne: LigneDeMaPaie; premiere: boolean }) {
  const resume = resumeDeLaSemaine(ligne);
  return (
    <li
      className={cn(
        'flex items-center gap-3 px-4 py-3.5 tabular-nums',
        !premiere && 'border-t border-border',
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="text-[17px]">{majuscule(vendrediLong(ligne.vendredi))}</b>
        <span className="text-[15px] text-muted-foreground">
          {[resume, ligne.reference ? `réf. ${ligne.reference}` : null].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <b className="text-[17px]">{chiffres(ligne.totalXaf)}</b>
        {ligne.etat !== 'paye' && <Badge variant="attention">À payer</Badge>}
      </span>
    </li>
  );
}
