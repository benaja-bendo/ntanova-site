/**
 * Une mission (lot H, planche « Relais · une mission ») : l'école confiée par NTanova, où elle est, ce qu'il faut faire et
 * pourquoi, avant quand, ce qu'elle paie, la phrase à dire en entrant ; puis « Prendre la photo » (la fiche s'ouvre sur la
 * photo et la position, l'école déjà connue) ou « Je n'ai pas pu ». Tout se lit dans le téléphone : la mission s'ouvre
 * hors ligne.
 */
import { useState } from 'react';
import { lienGoogleMaps } from '../../../modele/coordonnees';
import { texteDestineAuRelais } from '../../../modele/consigne';
import { jourDuCongo } from '../../../modele/date-declaration';
import { libelleNiveau } from '../../../modele/libelles';
import type { Valeur } from '../../../modele/listes';
import { francs } from '../../../modele/paie';
import { lireMemoire, useRequete } from '../base-locale';
import { aller } from '../contexte';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/shadcn/button';
import { IconeAlerte, IconeAller, IconeRepere } from '@/ui/shadcn/icones';
import { EnTeteRetour, PiedFixe, Surtitre } from '../cadre';
import { Bande, ChargementEcran, EtatVide } from '../etats';
import { MiniCarte } from '../mini-carte';
import { commencerContreVisite } from './Ajouter';
import { PasPu } from './MonLot';

const consigne: Record<Valeur<'mission_kind'>, string> = {
  verify: 'Vérifier l’école sur place : le nom écrit, le repère, la photo de l’enseigne.',
  locate: 'La situer : la photo de l’enseigne et la position, devant l’entrée.',
  complete: 'Compléter sa fiche : ce qui manque, et une photo.',
};

export const PHRASE_DE_MISSION =
  '« Bonjour, je viens pour NTanova, l’annuaire des écoles. Je passe compléter la fiche de votre école, avec ce qui se voit d’ici. »';

const jourLong = (j: string): string =>
  new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

export function Mission({ ecoleId }: { ecoleId: string }) {
  const ecoles = useRequete(() => lireMemoire('aCompleter'));
  const [avis, setAvis] = useState<string | null>(null);
  if (ecoles === undefined) return <ChargementEcran titre="Une mission" />;
  const e = ecoles.find((x) => x.id === ecoleId);
  const retard = !!e?.avantLe && jourDuCongo() > e.avantLe;

  return (
    <div className="ecran">
      <EnTeteRetour
        titre="Une mission"
        retour="missions"
        libelleRetour="Retour aux missions"
        sousTitre={
          e
            ? `Confiée par NTanova${e.confieeLe ? ` le ${jourLong(jourDuCongo(new Date(e.confieeLe)))}` : ''}`
            : undefined
        }
      />
      {!e ? (
        <main className="flex flex-1 flex-col gap-3.5 px-4 py-3.5">
          <EtatVide
            titre="Mission terminée"
            action={
              <Button variant="outline" onClick={() => aller('missions')}>
                Retour aux missions
              </Button>
            }
          >
            Cette mission n’est plus sur le téléphone : elle est faite, ou NTanova l’a retirée.
          </EtatVide>
        </main>
      ) : (
        <>
          <main className="flex flex-1 flex-col gap-3.5 px-4 py-3.5">
            <section
              aria-label="L’école"
              className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
            >
              {e.position && <MiniCarte position={e.position} libelle="L’école sur le plan" />}
              <div className="flex flex-col gap-1 px-3.5 py-3">
                <h2 className="m-0 font-serif text-lg leading-snug font-bold">{e.nom}</h2>
                <span className="text-[13px] text-muted-foreground">
                  {[
                    e.etiquette,
                    e.niveaux.map((n) => libelleNiveau[n as Valeur<'niveau'>] ?? n).join(', '),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {(e.repere || e.quartier) && (
                  <span className="flex items-center gap-1.5 text-[15px]">
                    <IconeRepere className="size-[18px] text-primary" />
                    <span>
                      {e.repere && <b>{e.repere}</b>}
                      {e.repere && e.quartier ? ' · ' : ''}
                      {e.quartier}
                    </span>
                  </span>
                )}
              </div>
              {e.position && (
                <div className="px-3.5 pb-3.5">
                  <Button variant="outline" size="lg" className="w-full" asChild>
                    <a href={lienGoogleMaps(e.position)} target="_blank" rel="noopener noreferrer">
                      <IconeAller />Y aller
                    </a>
                  </Button>
                </div>
              )}
            </section>

            <section
              aria-label="Ce qu’il faut faire"
              className="flex flex-col gap-2 rounded-lg border-2 border-primary bg-card p-3.5"
            >
              <Surtitre>Ce qu’il faut faire</Surtitre>
              <b className="text-[17px]">{e.tache ?? consigne[e.genre]}</b>
              {e.raison && <p className="m-0 text-[15px]">Pourquoi&nbsp;: {e.raison}</p>}
              {texteDestineAuRelais(e.note) && (
                <p className="m-0 text-[15px]">À vérifier&nbsp;: {texteDestineAuRelais(e.note)}</p>
              )}
              {(e.avantLe || e.paieXaf) && (
                <dl className="m-0 flex flex-col gap-2 border-t border-border pt-2 text-[15px]">
                  {e.avantLe && (
                    <div className="flex justify-between gap-2.5">
                      <dt className="text-muted-foreground">Avant le</dt>
                      <dd className={cn('m-0 font-bold', retard && 'text-destructive')}>
                        {jourLong(e.avantLe)}
                        {retard ? ' · en retard' : ''}
                      </dd>
                    </div>
                  )}
                  {e.paieXaf ? (
                    <div className="flex justify-between gap-2.5">
                      <dt className="text-muted-foreground">Paie de la mission</dt>
                      <dd className="m-0 font-bold tabular-nums">{francs(e.paieXaf)}</dd>
                    </div>
                  ) : null}
                </dl>
              )}
            </section>

            <section
              aria-label="À dire en entrant"
              className="flex flex-col gap-1.5 rounded-lg bg-muted p-3.5"
            >
              <b>À dire en entrant</b>
              <p className="m-0 text-[15px]">{PHRASE_DE_MISSION}</p>
            </section>

            {e.missionId && <PasPu missionId={e.missionId} apres={() => aller('missions')} />}
          </main>
          <PiedFixe>
            {avis && (
              <Bande ton="attention" role="status" icone={<IconeAlerte />}>
                <p>{avis}</p>
              </Bande>
            )}
            <Button
              size="xl"
              className="w-full"
              onClick={() =>
                void commencerContreVisite(e).then((issue) =>
                  setAvis(
                    issue === 'ok'
                      ? null
                      : 'Une autre fiche est déjà en cours. Terminez-la ou abandonnez-la d’abord (« Reprendre la fiche en cours »).',
                  ),
                )
              }
            >
              Prendre la photo
            </Button>
            <span className="text-center text-[13px] text-muted-foreground">
              La fiche s’ouvre sur la photo et la position ; l’école est déjà connue.
            </span>
          </PiedFixe>
        </>
      )}
    </div>
  );
}
