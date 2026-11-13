/**
 * « Ma paie » (planche v2 « Ma paie · téléphone ») : ce qui sera payé vendredi, comme une facture (une ligne par genre,
 * « 5 × 500 », le sous-total), ce qui n'est pas encore compté, puis les semaines déjà payées. Lecture seule : la base
 * calcule avec les règles de l'administration, l'écran n'affiche que ce qu'elle dit. Un acquis n'est pas une promesse.
 */
import {
  chiffres,
  compteDesFiches,
  factureCourte,
  francs,
  resumeDeLaSemaine,
  vendrediLong,
} from '../../../modele/paie';
import type { LigneDeMaPaie } from '../../../modele/ports';
import { cn } from '@/lib/utils';
import { Badge } from '@/ui/shadcn/badge';
import { Card } from '@/ui/shadcn/card';
import { IconeAlerte, IconeAttente, IconeOuvrir } from '@/ui/shadcn/icones';
import { lireMemoire, useRequete } from '../base-locale';
import { BarreDuBas, EnTete, Surtitre } from '../cadre';
import { jour } from '../composants';
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
            <Acquis ligne={paie.acquis} />

            {pasComptees.length > 0 && (
              <a
                href="#fiches"
                className="flex min-h-12 items-center gap-3 rounded-lg bg-attention px-4 py-3 text-[15px] text-attention-foreground no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
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
          </>
        )}
      </main>
      <BarreDuBas />
    </div>
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
          {[
            resume,
            ligne.etat === 'paye' && ligne.payeLe ? `payé le ${jour(ligne.payeLe)}` : null,
            ligne.reference ? `réf. ${ligne.reference}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <b className="text-[17px]">{chiffres(ligne.totalXaf)}</b>
        {ligne.etat !== 'paye' && <Badge variant="attention">À payer</Badge>}
      </span>
    </li>
  );
}
