/**
 * Le volet d'une zone : tout ce qu'on règle sur elle, au même endroit. Trois réglages, trois noms (voir
 * `modele/zones-admin.ts`) : « Sur la carte » (ce que voient les familles), « Ouverte aux relais » (où NTanova envoie
 * des relais), et d'où viennent ses fiches.
 */
import { v2 } from '@/ui/v2/classes';
import { useState, type ReactNode } from 'react';
import {
  ETATS_CARTE,
  SEUIL_OUVERTURE_LARGE,
  etatHerite,
  libelleEtat,
  phraseDesEcoles,
  raisonsDeNePasSupprimer,
  surLaCarte,
  zonesDessous,
  type EtatCarte,
} from '../../modele/zones-admin';
import { libelleGenreDivision } from '../../modele/libelles';
import type { DivisionVue, LotVu, PortAdministration } from '../../modele/ports';
import { Bouton, Dialogue } from '@/ui/v2/admin';
import { cn } from '@/lib/utils';
import { IconeBas, IconeFait } from '@/ui/shadcn/icones';
import { aller } from '../commun/adresse';
import { AjouterDivision, RenommerZone } from './ZonesFormulaires';

export function VoletDeZone({
  zone,
  divisions,
  lots,
  ouvertePar,
  occupee,
  admin,
  retour,
  surEtat,
  surOuverture,
  surFait,
  surSuppression,
}: {
  zone: DivisionVue;
  divisions: DivisionVue[];
  lots: LotVu[];
  /** La zone qui ouvre chaque zone aux relais : elle-même, une zone au-dessus d'elle, ou personne. */
  ouvertePar: ReadonlyMap<string, DivisionVue | null>;
  occupee: boolean;
  admin: PortAdministration;
  retour: ReactNode;
  surEtat: (etat: EtatCarte) => void;
  surOuverture: (ouverte: boolean) => void;
  surFait: (texte: string, zoneId?: string) => void;
  /** Demande de supprimer la zone : l'écran de l'onglet montre la confirmation. */
  surSuppression: (zone: DivisionVue) => void;
}) {
  const parent = divisions.find((d) => d.id === zone.parentId);
  const par = ouvertePar.get(zone.id) ?? null;
  const ouverteParUneAutre = par !== null && par.id !== zone.id;
  const ouverte = par !== null;
  const dessous = zonesDessous(zone, divisions);
  const herite = etatHerite(zone, divisions);
  const etat: EtatCarte = zone.deploiement;
  const nbFiches = zone.relevees + zone.ajoutees + zone.importees;
  const estOuverte = (id: string) => ouvertePar.get(id) != null;
  const raisons = raisonsDeNePasSupprimer(zone, divisions, lots);

  const [ouvert, setOuvert] = useState<'sous-zone' | 'renommer' | 'supprimer' | null>(null);
  const titres = {
    'sous-zone': 'Ajouter une sous-zone',
    renommer: 'Renommer, autres écritures',
    supprimer: 'Supprimer cette zone',
  } as const;
  const fait = (texte: string, zoneId?: string) => {
    setOuvert(null);
    surFait(texte, zoneId);
  };

  return (
    <section
      className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 max-lg:-mx-4 max-lg:-mt-5 max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:p-4"
      aria-label={`${zone.nom} : en bref`}
    >
      <div className="flex flex-col gap-0.5 max-lg:sr-only">
        <h2 className="m-0 font-serif text-[26px] font-bold">{zone.nom}</h2>
        <p className="m-0 text-[15px] text-muted-foreground">
          {libelleGenreDivision[zone.genre]}
          {parent ? ` · ${parent.nom}` : ''}
        </p>
      </div>
      {retour}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        {surLaCarte(zone) ? (
          <fieldset
            className="m-0 flex flex-col gap-2.5 border-0 p-0 max-lg:rounded-xl max-lg:border max-lg:border-border max-lg:bg-card max-lg:p-4"
            disabled={occupee}
            aria-label="Sur la carte du site"
          >
            <legend className="mb-2.5 p-0 font-sans text-base font-bold max-lg:font-serif max-lg:text-lg">
              Ce que les familles voient sur la carte
            </legend>
            <div className="flex flex-wrap gap-2 max-lg:flex-col">
              {ETATS_CARTE.map((e) => (
                <button
                  key={e ?? 'aucun'}
                  type="button"
                  aria-pressed={etat === e}
                  onClick={() => surEtat(e)}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border-2 border-input bg-card px-3.5 font-sans text-[15px] font-bold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-50 aria-pressed:border-primary aria-pressed:bg-succes aria-pressed:text-primary-strong"
                >
                  {etat === e && <IconeFait className="size-4" aria-hidden />}
                  {libelleEtat(e)}
                </button>
              ))}
            </div>
            {etat === null && herite !== null && (
              <span className="text-[13px] text-muted-foreground">
                Ce qu’elle contient est quand même sur la carte (« {libelleEtat(herite)} »).
              </span>
            )}
          </fieldset>
        ) : (
          <p className="m-0 self-center text-sm text-muted-foreground">
            {libelleGenreDivision[zone.genre]} : la carte se règle sur ses villes et ses
            arrondissements.
          </p>
        )}

        <div className="flex items-center gap-4 rounded-xl bg-muted p-4 max-lg:border max-lg:border-border max-lg:bg-card">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <b className="text-base">Ouverte aux relais</b>
            <span className="text-sm text-muted-foreground">
              {ouverteParUneAutre
                ? `Ouverte par ${par.nom}, avec tout ce qu’elle contient.`
                : 'Où tu envoies des relais. Ils peuvent relever partout.'}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={ouverte}
            aria-label={`Ouverte aux relais : ${zone.nom}`}
            disabled={occupee || ouverteParUneAutre}
            onClick={() => surOuverture(!ouverte)}
            className={cn(
              'relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent p-0 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
              ouverte ? 'bg-primary' : 'bg-input/60',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'block size-7 rounded-full bg-card shadow transition-transform',
                ouverte ? 'translate-x-6' : 'translate-x-0',
              )}
            />
          </button>
        </div>
      </div>
      {!ouverte && dessous.length >= SEUIL_OUVERTURE_LARGE && (
        <p className="m-0 text-[13px] text-muted-foreground">
          Ouvrir {zone.nom} ouvre aussi les {dessous.length} zones qu’elle contient : une
          confirmation te montrera ce qui change.
        </p>
      )}

      <div className="grid gap-4 border-t border-border pt-4 xl:grid-cols-2 max-lg:rounded-xl max-lg:border max-lg:bg-card max-lg:p-4">
        <section className="flex flex-col gap-1.5" aria-label="Écoles de la zone">
          <h3 className="m-0 font-sans text-base font-bold max-lg:hidden">Écoles de cette zone</h3>
          <p className="m-0 flex items-baseline gap-3">
            <b className="font-serif text-[30px] text-primary-strong">{zone.ecoles}</b>
            <span className="text-[15px]">
              {zone.ecoles === 0 ? 'Aucune école relevée ici' : phraseDesEcoles(zone)}
            </span>
          </p>
          {zone.ecoles > 0 && zone.niveau >= 2 && (
            <a
              className="self-start text-[15px] font-bold text-primary underline"
              href={`#ecoles/zone/${zone.id}`}
              onClick={(e) => {
                e.preventDefault();
                aller(`ecoles/zone/${zone.id}`);
              }}
            >
              Voir les {zone.ecoles} écoles
            </a>
          )}
        </section>
        <section className="flex flex-col gap-2" aria-label="D’où viennent les fiches">
          <h3 className="m-0 font-sans text-base font-bold">D’où viennent les fiches</h3>
          {nbFiches === 0 ? (
            <span className="text-sm text-muted-foreground">Aucune fiche pour l’instant.</span>
          ) : (
            <span className="flex flex-wrap gap-1.5">
              {(
                [
                  ['Relevées par un relais', zone.relevees],
                  ['Ajoutées par toi', zone.ajoutees],
                  ['Importées', zone.importees],
                ] as const
              )
                .filter(([, n]) => n > 0)
                .map(([t, n]) => (
                  <span key={t} className={v2.pastilleNeutre}>
                    {t} · {n}
                  </span>
                ))}
            </span>
          )}
        </section>
      </div>

      <div className="flex flex-wrap gap-2.5 border-t border-border pt-4 max-lg:flex-col max-lg:gap-0 max-lg:overflow-hidden max-lg:rounded-xl max-lg:border max-lg:bg-card max-lg:p-0">
        {(zone.niveau <= 3 ? (['sous-zone', 'renommer'] as const) : (['renommer'] as const)).map(
          (m) => (
            <button
              key={m}
              type="button"
              onClick={() => setOuvert(m)}
              className={cn(
                v2.boutonSecondairePetit,
                'max-lg:h-14 max-lg:justify-between max-lg:rounded-none max-lg:border-0 max-lg:border-b max-lg:border-border max-lg:px-4 max-lg:text-[15px] max-lg:text-foreground',
              )}
            >
              {m === 'sous-zone' ? 'Ajouter une sous-zone' : 'Renommer'}
              <IconeBas className="size-5 lg:hidden" aria-hidden />
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => setOuvert('supprimer')}
          className={cn(
            v2.boutonRefusPetit,
            'ml-auto max-lg:ml-0 max-lg:h-14 max-lg:justify-between max-lg:rounded-none max-lg:border-0 max-lg:px-4 max-lg:text-[15px]',
          )}
        >
          Supprimer cette zone
          <IconeBas className="size-5 lg:hidden" aria-hidden />
        </button>
      </div>

      {ouvert && (
        <Dialogue
          titre={`${titres[ouvert]} : ${zone.nom}`}
          variante={ouvert === 'supprimer' ? 'confirmation' : 'dialogue'}
          libelleFermeture={ouvert === 'supprimer' ? 'Annuler' : 'Fermer'}
          fermer={() => setOuvert(null)}
          entete={<h2>{titres[ouvert]}</h2>}
        >
          {ouvert === 'sous-zone' && (
            <AjouterDivision
              key={zone.id}
              divisions={divisions}
              estOuverte={estOuverte}
              admin={admin}
              surFait={fait}
              parentInitial={zone.id}
            />
          )}
          {ouvert === 'renommer' && (
            <RenommerZone
              key={`${zone.id}|${zone.nom}|${zone.aliases.join('|')}`}
              zone={zone}
              divisions={divisions}
              admin={admin}
              surFait={fait}
            />
          )}
          {ouvert === 'supprimer' &&
            (raisons.length > 0 ? (
              <p className="m-0 text-[15px]">
                Cette zone ne se supprime pas : {raisons.join(' ; ')}. Supprimer sert à corriger une
                zone saisie par erreur, quand elle ne contient plus rien.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="m-0 text-[15px]">
                  La zone est vide : ni sous-zone, ni école, ni lot, ni état sur la carte. La
                  suppression est définitive ; son adresse ({zone.slug}) pourra être réutilisée.
                </p>
                <Bouton
                  variante="danger"
                  disabled={occupee}
                  onClick={() => {
                    setOuvert(null);
                    surSuppression(zone);
                  }}
                >
                  Supprimer {zone.nom}…
                </Bouton>
              </div>
            ))}
        </Dialogue>
      )}
    </section>
  );
}
