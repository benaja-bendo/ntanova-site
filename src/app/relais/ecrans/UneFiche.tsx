/**
 * « Une de mes fiches » (lot F du ticket 165, canevas « Espace relais ») : ce que le relais lit quand il ouvre une de ses
 * fiches. Où elle en est (envoyée, acceptée, en ligne) ; la raison de NTanova en cas de refus ou de correction ; « Voir la
 * page de l'école » quand elle est en ligne ; ce qui vient de son relevé ; ce qui manque encore ; ce qu'elle rapporte. Tout
 * vient de ce que le téléphone garde : l'écran marche hors ligne.
 */
import { appartientAuCompte } from '../../../modele/compte';
import {
  ceQuiManqueEncore,
  ceQuiVientDuReleve,
  etapesDeLaFiche,
  raisonDeNTanova,
} from '../../../modele/ma-fiche';
import { francs, paieDeLaFiche, vendrediLong } from '../../../modele/paie';
import { base, compteConnecte, lireMemoire, useRequete } from '../base-locale';
import { jour } from '../composants';
import { libelleFonctionCourt } from '../../../modele/libelles';
import { aller } from '../contexte';
import { cn } from '@/lib/utils';
import { Badge } from '@/ui/shadcn/badge';
import { Button } from '@/ui/shadcn/button';
import {
  IconeAttente,
  IconeCorriger,
  IconeFait,
  IconeOuvrirAilleurs,
  IconeRefus,
  IconeTelephone,
} from '@/ui/shadcn/icones';
import { BarreDuBas, EnTeteRetour } from '../cadre';
import { Bande, ChargementEcran, EtatVide } from '../etats';
import { GestesDeLaFiche } from './MesFiches';

export function UneFiche({ releveId }: { releveId: string }) {
  const recus = useRequete(() => lireMemoire('releves'));
  const paie = useRequete(async () => (await lireMemoire('paie')) ?? null);
  // Ses fiches dans le téléphone : celle-ci tant qu'elle n'est pas partie, et une correction qui en serait déjà partie.
  const locales = useRequete(async () => {
    const compte = await compteConnecte();
    return (await base.fiches.where('etat').notEqual('brouillon').toArray()).filter((f) =>
      appartientAuCompte(f, compte),
    );
  });

  if (recus === undefined || paie === undefined || locales === undefined)
    return <ChargementEcran titre="Une de mes fiches" />;
  const recu = (recus ?? []).find((r) => r.id === releveId);
  const locale = locales.find((f) => f.id === releveId);

  if (!recu) {
    return (
      <div className="ecran">
        <EnTeteRetour
          titre={locale ? locale.nomEnseigne || 'Fiche sans nom' : 'Une de mes fiches'}
          sousTitre={
            locale
              ? locale.etat === 'refusee'
                ? 'Refusée par la base'
                : 'Sur le téléphone'
              : undefined
          }
          retour="fiches"
          libelleRetour="Retour à mes fiches"
        />
        <main className="flex flex-1 flex-col gap-3.5 px-4 py-3.5">
          {locale ? (
            <>
              <Bande ton="neutre" icone={<IconeTelephone />}>
                <p>
                  <b>NTanova ne l’a pas encore reçue.</b> Elle part dès que le téléphone
                  capte&nbsp;; son détail s’affiche ensuite ici.
                </p>
              </Bande>
              <GestesDeLaFiche id={locale.id} />
            </>
          ) : (
            <EtatVide
              titre="Cette fiche n’est plus dans votre liste."
              action={
                <Button variant="outline" onClick={() => aller('fiches')}>
                  Retour à mes fiches
                </Button>
              }
            />
          )}
        </main>
        <BarreDuBas />
      </div>
    );
  }

  const etapes = etapesDeLaFiche(recu);
  const raison = raisonDeNTanova(recu);
  const contenu = ceQuiVientDuReleve(recu);
  const manques = recu.statut === 'refuse' ? [] : ceQuiManqueEncore(recu);
  const sesPaies = paie ? paieDeLaFiche(paie, recu.id) : null;
  // Une correction partie du téléphone : la fiche reste « à corriger » chez NTanova jusqu'à sa décision.
  const corrigee = locales.some((f) => f.corrigeReleveId === recu.id);
  const enLigne = recu.statut === 'accepte' && recu.pageEnLigne != null;
  const paieTexte = phraseDeLaPaie(recu.statut, sesPaies, paie === null);

  return (
    <div className="ecran">
      <EnTeteRetour
        titre={recu.nomEnseigne}
        sousTitre={`Relevée ${quandCourt(recu.prisLe)}`}
        retour="fiches"
        libelleRetour="Retour à mes fiches"
      />
      <main className="flex flex-1 flex-col gap-3.5 px-4 py-3.5">
        <ol
          aria-label="Où en est la fiche"
          className="m-0 grid list-none grid-cols-3 rounded-lg border border-border bg-card px-2 py-3.5"
        >
          {etapes.map((e) => (
            <li key={e.cle} className="flex flex-col items-center gap-1 text-center">
              <span
                aria-hidden
                className={cn(
                  'flex size-7 items-center justify-center rounded-full',
                  e.etat === 'faite' && 'bg-primary text-primary-foreground',
                  e.etat === 'en_cours' && 'border-2 border-primary bg-card text-primary',
                  e.etat === 'a_venir' && 'border-2 border-border bg-card',
                  e.etat === 'arretee' && 'bg-destructive text-blanc',
                )}
              >
                {e.etat === 'faite' && <IconeFait className="size-4 [stroke-width:2.6]" />}
                {e.etat === 'en_cours' && <IconeAttente className="size-4" />}
                {e.etat === 'arretee' && <IconeRefus className="size-4 [stroke-width:2.6]" />}
              </span>
              <b className={cn('text-sm', e.etat === 'a_venir' && 'text-muted-foreground')}>
                {e.libelle}
              </b>
            </li>
          ))}
        </ol>

        {raison && (
          <Bande
            ton={recu.statut === 'refuse' ? 'danger' : 'attention'}
            icone={recu.statut === 'refuse' ? <IconeRefus /> : <IconeCorriger />}
          >
            <p>
              <b>NTanova&nbsp;:</b> «&nbsp;{raison}&nbsp;»
            </p>
          </Bande>
        )}
        {recu.statut === 'a_corriger' && corrigee && (
          <Badge variant="neutre" className="self-start">
            Correction envoyée
          </Badge>
        )}
        {!(recu.statut === 'a_corriger' && corrigee) && <GestesDeLaFiche id={recu.id} />}
        {enLigne && (
          <Button variant="outline" size="lg" className="w-full" asChild>
            <a href={`/ecoles/${recu.pageEnLigne}/`} target="_blank" rel="noopener">
              <IconeOuvrirAilleurs />
              Voir la page de l’école
            </a>
          </Button>
        )}

        <section
          aria-labelledby="titre-releve"
          className="flex flex-col rounded-lg border border-border bg-card px-3.5 pt-3 pb-1"
        >
          <h2 id="titre-releve" className="m-0 pb-1.5 font-serif text-lg font-bold">
            {enLigne ? 'Sur la page, grâce à vous' : 'Ce qui vient de mon relevé'}
          </h2>
          <dl className="m-0">
            {[
              ...contenu,
              ...(recu.contactConfirmeLe
                ? [
                    {
                      libelle: 'Le contact de la direction',
                      valeur: `Confirmé · ${recu.contactFonction ? libelleFonctionCourt[recu.contactFonction] : ''}`,
                    },
                  ]
                : []),
            ].map((c) => (
              <div
                key={c.libelle}
                className="flex items-start gap-2.5 border-t border-border py-2.5"
              >
                <IconeFait className="mt-[3px] size-[18px] text-primary [stroke-width:2.4]" />
                <span className="flex flex-col">
                  <dt className="font-bold">{c.libelle}</dt>
                  <dd className="m-0 text-[13px] text-muted-foreground">{c.valeur}</dd>
                </span>
              </div>
            ))}
          </dl>
        </section>

        {manques.length > 0 && (
          <section
            aria-labelledby="titre-manques"
            className="flex flex-col rounded-lg border border-border bg-card px-3.5 pt-3 pb-1"
          >
            <h2 id="titre-manques" className="m-0 pb-1.5 font-serif text-lg font-bold">
              Ce qui manque encore
            </h2>
            <ul className="m-0 list-none p-0">
              {manques.map((m) => (
                <li key={m} className="flex items-start gap-2.5 border-t border-border py-2.5">
                  <span
                    aria-hidden
                    className="mx-[5px] mt-2 size-2 shrink-0 rounded-full bg-ambre"
                  />
                  <b>{m}</b>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section
          aria-label="Ce qu’elle rapporte"
          className={cn(
            'flex justify-between gap-2.5 rounded-md px-3.5 py-3 text-[15px]',
            sesPaies ? 'bg-succes text-succes-foreground' : 'bg-muted text-foreground',
          )}
        >
          <span>{paieTexte.texte}</span>
          {paieTexte.montant && (
            <b className="whitespace-nowrap tabular-nums">{paieTexte.montant}</b>
          )}
        </section>
      </main>
      <BarreDuBas />
    </div>
  );
}

/** « le 3 novembre », « aujourd'hui », « hier ». */
function quandCourt(date: string): string {
  const j = jour(date);
  return /^(Aujourd|Hier)/.test(j) ? j.charAt(0).toLowerCase() + j.slice(1) : `le ${j}`;
}

function phraseDeLaPaie(
  statut: string,
  p: ReturnType<typeof paieDeLaFiche>,
  paieInconnue: boolean,
): { texte: string; montant: string | null } {
  if (p) {
    const montant = francs(p.montantXaf);
    const quoi = p.genres.includes('mission') ? 'La mission' : 'Cette fiche';
    if (p.etat === 'paye')
      return { texte: `${quoi} : payée${p.payeLe ? ` le ${jour(p.payeLe)}` : ''}`, montant };
    if (p.etat === 'a_payer')
      return { texte: `${quoi} : à payer (semaine du ${vendrediLong(p.vendredi)} close)`, montant };
    return { texte: `Comptée dans la paie du ${vendrediLong(p.vendredi)}`, montant };
  }
  if (paieInconnue)
    return { texte: 'La paie s’affiche dès que le téléphone capte.', montant: null };
  if (statut === 'refuse') return { texte: 'Une fiche refusée n’est pas payée.', montant: null };
  if (statut === 'accepte')
    return {
      texte:
        'Elle ne figure dans aucune ligne de paie (lot d’essai, correction, ou école déjà relevée par un autre relais).',
      montant: null,
    };
  return { texte: 'Elle sera payée si NTanova l’accepte.', montant: null };
}
