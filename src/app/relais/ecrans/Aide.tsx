/**
 * L'aide du relais (lot H, planche « Compte › Aide ») : trois sujets, chacun sur sa page, qu'on ouvre depuis l'accueil (le
 * « ? » et « Quoi dire en entrant ») ou depuis « Compte ». Tout est dans l'application : l'aide se lit hors ligne.
 * - `entrer` : la phrase à dire en entrant, et ce qu'on ne fait jamais ;
 * - `regles` : les règles du relais (photos, accord, ce qui ne se publie pas) ;
 * - `paie` : comment le relais est payé.
 */
import type { ReactNode } from 'react';
import { IconeFait, IconeMessage, IconeRefus } from '@/ui/shadcn/icones';
import { EnTeteRetour, LigneLien, Surtitre } from '../cadre';
import { aller, useRelais } from '../contexte';

export type SujetDAide = 'entrer' | 'regles' | 'paie';

const titres: Record<SujetDAide, string> = {
  entrer: 'Quoi dire en entrant',
  regles: 'Les règles du relais',
  paie: 'Comment je suis payé',
};

/** Une règle : la coche verte, la phrase ; le début en gras dit l'essentiel. */
function Regle({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
      <IconeFait className="mt-[3px] size-[18px] text-primary [stroke-width:2.4]" />
      <span className="text-[15px]">{children}</span>
    </li>
  );
}

export function Aide({ sujet }: { sujet: SujetDAide }) {
  const { lienNTanova } = useRelais();
  return (
    <div className="ecran">
      <EnTeteRetour
        titre={titres[sujet]}
        sousTitre="Aide du relais"
        retour={() => (history.length > 1 ? history.back() : aller('missions'))}
        libelleRetour="Retour"
      />
      <main className="flex flex-1 flex-col gap-3.5 px-4 py-3.5">
        {sujet === 'entrer' && (
          <>
            <section
              aria-label="À dire en entrant"
              className="flex flex-col gap-1.5 rounded-lg bg-muted p-3.5"
            >
              <b>À dire en entrant</b>
              <p className="m-0 text-[15px]">
                «&nbsp;Bonjour. Nous relevons les écoles du quartier pour un annuaire en ligne
                destiné aux familles. Nous venons de relever votre école, avec ce qui se voit de la
                rue. Pour que sa fiche soit juste et que l'établissement puisse la corriger si
                besoin, nous voulons la faire valider par la direction&nbsp;: à qui pouvons-nous
                nous adresser&nbsp;?&nbsp;»
              </p>
            </section>
            <section
              aria-label="Jamais"
              className="flex flex-col gap-2 rounded-lg border-2 border-destructive bg-card p-3.5"
            >
              <Surtitre className="text-destructive">Jamais</Surtitre>
              <ul className="m-0 flex list-none flex-col p-0">
                {[
                  'Se dire parent.',
                  'Dire que le site est déjà connu.',
                  'Promettre quelque chose.',
                  'Photographier un enfant.',
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2.5 py-1 text-[15px]">
                    <IconeRefus className="size-[18px] text-destructive" />
                    {t}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {sujet === 'regles' && (
          <ul
            aria-label="Les règles"
            className="m-0 flex list-none flex-col rounded-lg border border-border bg-card p-3.5"
          >
            <Regle>
              <b>Aucun enfant en photo.</b> L’enseigne, le portail, une cour ou une salle vides.
            </Regle>
            <Regle>
              <b>Un numéro seulement avec l’accord</b> de la personne, coché sur la fiche. Il n’est
              jamais publié, et ne s’affiche plus sur le téléphone une fois envoyé&nbsp;: seul
              NTanova le voit.
            </Regle>
            <Regle>
              <b>Les photos de travail ne se publient jamais</b>&nbsp;: prospectus des frais,
              affiche des inscriptions, liste des programmes. Elles servent à NTanova.
            </Regle>
            <Regle>
              <b>Rien n’est inventé.</b> Ce que vous n’avez pas vu, vous ne l’écrivez pas&nbsp;:
              «&nbsp;Je ne sais pas&nbsp;» est une bonne réponse.
            </Regle>
            <Regle>
              <b>NTanova relit tout</b> avant de publier&nbsp;: votre fiche peut être acceptée,
              renvoyée pour une correction, ou refusée, avec la raison.
            </Regle>
          </ul>
        )}

        {sujet === 'paie' && (
          <ul
            aria-label="La paie"
            className="m-0 flex list-none flex-col rounded-lg border border-border bg-card p-3.5"
          >
            <Regle>
              <b>500 FCFA par fiche acceptée</b> par NTanova. Une fiche en attente ou à corriger
              n’est pas encore comptée.
            </Regle>
            <Regle>
              <b>Une mission</b>&nbsp;: le montant écrit sur la mission, quand elle est faite.
            </Regle>
            <Regle>Le bonus n’est pas payé pour l’instant.</Regle>
            <Regle>
              La paie se compte chaque semaine, jusqu’au vendredi, et part sur votre numéro Mobile
              Money (Compte › Pour recevoir la paie). Le détail est dans «&nbsp;Ma paie&nbsp;».
            </Regle>
          </ul>
        )}

        <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card [&>a+a]:border-t [&>a+a]:border-border">
          <LigneLien
            href="/relais/guide/"
            titre="Lire le guide du relais"
            detail="tout le guide, en une page"
          />
          {lienNTanova && (
            <a
              href={lienNTanova}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[72px] items-center gap-3 px-4 py-3 text-foreground no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <b className="text-[17px]">Une question&nbsp;? Écrire à NTanova</b>
                <span className="text-sm text-muted-foreground">sur WhatsApp</span>
              </span>
              <IconeMessage className="size-5" />
            </a>
          )}
        </div>
        {!lienNTanova && (
          <p className="m-0 text-sm text-muted-foreground">
            Une question&nbsp;? Écrivez à NTanova sur WhatsApp, au numéro donné pendant la
            formation.
          </p>
        )}
      </main>
    </div>
  );
}
