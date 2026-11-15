/**
 * « Places et effectifs » (lot 2 du site public, 15/11) : ce que l'école dit de ses classes, à une date, saisi par
 * l'administration (jamais par un relais). Deux listes, une ligne par classe :
 *
 * - **Places annoncées** (P3) : disponibles, peu, complet. Le site montre une annonce 30 jours après le jour où l'école
 *   l'a dite, puis la cache : la liste dit jusqu'à quand, et une annonce passée se redemande.
 * - **Effectif par classe** (P4), facultatif : en tranches, jamais le nombre exact.
 *
 * Même dessin que « Sur place » : la liste, la ligne qu'on écrit, « ⋯ » pour modifier ou retirer. Tailwind et shadcn.
 */
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { v2 } from '@/ui/v2/classes';
import { ActionsSecondaires, Bouton } from '@/ui/v2/admin';
import { Bandeau } from '@/ui/v2/formulaire';
import { IconeFermer } from '@/ui/shadcn/icones';
import { ajouterJours, jourDuCongo } from '../../modele/date-declaration';
import { libelleEtatPlaces, libelleNiveau, libelleTrancheEffectif } from '../../modele/libelles';
import { listes, type Valeur } from '../../modele/listes';
import {
  annonceEnCours,
  finDeLAnnonce,
  JOURS_D_UNE_ANNONCE,
  lireEffectif,
  lirePlaces,
  nomDeClasse,
  saisieClasseVide,
  saisieDEffectif,
  saisieDePlaces,
  trierParClasse,
  type EffectifClasse,
  type PlacesAnnoncees,
  type SaisieClasse,
} from '../../modele/places-effectifs';
import type { PortAdministration } from '../../modele/ports';
import { dateLongue, jourEtMois } from '../../modele/pointe-noire';
import { messageErreur } from './ChampPosition';

type Genre = 'places' | 'effectifs';

const tonDesPlaces: Record<Valeur<'opening_state'>, string> = {
  disponibles: v2.pastilleSucces,
  peu: v2.pastilleAttention,
  complet: v2.pastilleNeutre,
  autre: v2.pastilleNeutre,
};

export function PlacesEffectifs({
  ecoleId,
  nom,
  cycles,
  places,
  effectifs,
  admin,
  surOccupation,
  surChangement,
}: {
  ecoleId: string;
  nom: string;
  cycles: Valeur<'niveau'>[];
  places: PlacesAnnoncees[];
  effectifs: EffectifClasse[];
  admin: PortAdministration;
  surOccupation?: (occupe: boolean) => void;
  surChangement: (texte: string) => void;
}) {
  // La ligne en cours d'écriture : son genre, la ligne enregistrée qu'elle modifie (`nouvelle` sinon), ce qu'on tape.
  const [edition, setEdition] = useState<{ genre: Genre; id: string; saisie: SaisieClasse } | null>(
    null,
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    surOccupation?.(enCours);
    return () => surOccupation?.(false);
  }, [enCours, surOccupation]);
  const aujourdhui = jourDuCongo();

  const changer = (champs: Partial<SaisieClasse>) =>
    setEdition((e) => (e ? { ...e, saisie: { ...e.saisie, ...champs } } : e));

  const agir = async (action: () => Promise<unknown>, texte: string) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      setEdition(null);
      surChangement(texte);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  const enregistrer = () => {
    if (!edition) return;
    const id = edition.id === 'nouvelle' ? null : edition.id;
    if (edition.genre === 'places') {
      const lu = lirePlaces(edition.saisie, cycles);
      if (!lu.places) return setErreur(lu.erreur);
      return void agir(
        () => admin.enregistrerPlaces(ecoleId, lu.places!, id),
        `Places de ${nomDeClasse(lu.places)} enregistrées pour ${nom} : visibles à la prochaine mise à jour du site, et jusqu’au ${dateLongue(finDeLAnnonce(lu.places.ditLe))}.`,
      );
    }
    const lu = lireEffectif(edition.saisie, cycles);
    if (!lu.effectif) return setErreur(lu.erreur);
    return void agir(
      () => admin.enregistrerEffectif(ecoleId, lu.effectif!, id),
      `Effectif de ${nomDeClasse(lu.effectif)} enregistré pour ${nom}. Visible à la prochaine mise à jour du site.`,
    );
  };

  const ouvrir = (genre: Genre, id: string, saisie: SaisieClasse) => {
    setErreur(null);
    setEdition({ genre, id, saisie });
  };

  /** La ligne qu'on écrit : cycle, classe, ce que dit l'école, précision, le jour, puis Enregistrer. */
  const editeur = (genre: Genre) => {
    const s = edition!.saisie;
    const valeurs = genre === 'places' ? listes.opening_state : listes.class_size_band;
    const libelles: Record<string, string> =
      genre === 'places' ? libelleEtatPlaces : libelleTrancheEffectif;
    return (
      <div
        role="row"
        aria-label={
          genre === 'places' ? 'Annonce en cours d’écriture' : 'Effectif en cours d’écriture'
        }
        className="grid gap-2 border-t border-border bg-succes/40 px-3 py-3 shadow-[inset_3px_0_0_var(--marque)] sm:grid-cols-2 lg:grid-cols-[8.5rem_minmax(0,1fr)_11rem_minmax(0,1fr)_9.5rem]"
      >
        <select
          role="cell"
          aria-label="Cycle"
          className={cn(v2.champ, 'h-10 text-sm')}
          value={s.cycle}
          onChange={(e) => changer({ cycle: e.target.value })}
        >
          <option value="">Choisir</option>
          {cycles.map((c) => (
            <option key={c} value={c}>
              {libelleNiveau[c]}
            </option>
          ))}
        </select>
        <input
          role="cell"
          aria-label="Classe"
          className={cn(v2.champ, 'h-10 text-sm')}
          maxLength={40}
          placeholder="CP1, 6e… (vide : tout le cycle)"
          value={s.classe}
          onChange={(e) => changer({ classe: e.target.value })}
        />
        <select
          role="cell"
          aria-label={genre === 'places' ? 'Ce que dit l’école' : 'Tranche d’effectif'}
          className={cn(v2.champ, 'h-10 text-sm')}
          value={s.valeur}
          onChange={(e) => changer({ valeur: e.target.value })}
        >
          <option value="">Choisir</option>
          {valeurs.map((v) => (
            <option key={v} value={v}>
              {libelles[v]}
            </option>
          ))}
        </select>
        <input
          role="cell"
          aria-label={s.valeur === 'autre' ? 'Précision' : 'Précision (facultatif)'}
          className={cn(v2.champ, 'h-10 text-sm')}
          maxLength={120}
          placeholder={s.valeur === 'autre' ? 'À préciser' : 'Précision (facultatif)'}
          value={s.precision}
          onChange={(e) => changer({ precision: e.target.value })}
        />
        <input
          role="cell"
          aria-label="Dit par l’école le"
          type="date"
          className={cn(v2.champ, 'h-10 text-sm')}
          max={aujourdhui}
          {...(genre === 'places' ? { min: ajouterJours(aujourdhui, -JOURS_D_UNE_ANNONCE) } : {})}
          value={s.ditLe}
          onChange={(e) => changer({ ditLe: e.target.value })}
        />
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-5 lg:justify-end">
          <Bouton
            className={v2.petit}
            enCours={enCours}
            onClick={enregistrer}
            aria-label={genre === 'places' ? 'Enregistrer l’annonce' : 'Enregistrer l’effectif'}
          >
            Enregistrer
          </Bouton>
          <button
            type="button"
            disabled={enCours}
            onClick={() => {
              setEdition(null);
              setErreur(null);
            }}
            className={cn(v2.boutonSecondairePetit, 'gap-1.5')}
          >
            <IconeFermer className="size-4" aria-hidden />
            Annuler
          </button>
        </div>
      </div>
    );
  };

  const lignesPlaces = trierParClasse(places);
  const lignesEffectifs = trierParClasse(effectifs);
  const enEdition = (genre: Genre, id: string) => edition?.genre === genre && edition.id === id;
  const cellule = 'max-lg:text-sm max-lg:text-muted-foreground';

  return (
    <div className="flex flex-col gap-6">
      <p className="m-0 text-sm text-muted-foreground">
        Ce que l’école dit de ses classes, avec le jour où elle l’a dit.
      </p>

      {/* Les places annoncées. */}
      <section className="flex flex-col gap-2.5" aria-label="Places annoncées">
        <h3 className="m-0 font-sans text-base font-bold">Places annoncées</h3>
        <p className="m-0 text-[13px] text-muted-foreground">
          Le site montre une annonce {JOURS_D_UNE_ANNONCE} jours après le jour où l’école l’a dite,
          puis la cache : redemande-la chaque mois.
        </p>
        <div
          role="table"
          aria-label={`Places annoncées de ${nom}`}
          className="overflow-hidden rounded-xl border border-border bg-card text-[15px]"
        >
          <div
            role="row"
            className="grid gap-2 bg-muted px-3 py-2.5 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase max-lg:hidden lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_7rem_minmax(0,1.2fr)_auto]"
          >
            {['Classe', 'Ce que dit l’école', 'Dit le', 'Sur le site', ''].map((t, i) => (
              <span role="columnheader" key={i}>
                {t}
              </span>
            ))}
          </div>
          {lignesPlaces.map((p) =>
            enEdition('places', p.id) ? (
              <div key={p.id}>{editeur('places')}</div>
            ) : (
              <div
                key={p.id}
                role="row"
                aria-label={`Places : ${nomDeClasse(p)}`}
                className="grid items-center gap-x-2 gap-y-1 border-t border-border px-3 py-2.5 max-lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_7rem_minmax(0,1.2fr)_auto]"
              >
                <b role="cell">{nomDeClasse(p)}</b>
                <span role="cell" className="max-lg:col-start-1">
                  <span className={tonDesPlaces[p.etat]}>
                    {p.etat === 'autre' ? (p.precision ?? 'Autre') : libelleEtatPlaces[p.etat]}
                  </span>
                  {p.etat !== 'autre' && p.precision && (
                    <span className="ml-2 text-sm text-muted-foreground">{p.precision}</span>
                  )}
                </span>
                <span role="cell" className={cn(cellule, 'max-lg:col-start-1')}>
                  <span className="lg:hidden">Dit le </span>
                  {jourEtMois(p.ditLe)}
                </span>
                <span
                  role="cell"
                  className={cn(
                    'max-lg:col-start-1 max-lg:text-sm',
                    annonceEnCours(p, aujourdhui) ? 'text-foreground' : 'font-bold text-bonus',
                  )}
                >
                  {annonceEnCours(p, aujourdhui)
                    ? `Jusqu’au ${jourEtMois(p.finLe)}`
                    : `Plus sur le site depuis le ${jourEtMois(ajouterJours(p.finLe, 1))} : à redemander`}
                </span>
                <span role="cell" className="max-lg:col-start-2 max-lg:row-start-1">
                  <ActionsSecondaires nom={`les places de ${nomDeClasse(p)}`} discret>
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() =>
                        ouvrir('places', p.id, {
                          ...saisieDePlaces(p),
                          // Redire une annonce passée, c'est la redater : le jour où l'école la redit.
                          ditLe: annonceEnCours(p, aujourdhui) ? p.ditLe : aujourdhui,
                        })
                      }
                    >
                      {annonceEnCours(p, aujourdhui) ? 'Modifier' : 'Redire'} les places de{' '}
                      {nomDeClasse(p)}
                    </button>
                    <button
                      type="button"
                      className="text-destructive!"
                      disabled={enCours}
                      onClick={() =>
                        void agir(
                          () => admin.retirerPlaces(ecoleId, p.id),
                          `L’annonce de ${nomDeClasse(p)} est retirée pour ${nom}. Visible à la prochaine mise à jour du site.`,
                        )
                      }
                    >
                      Retirer les places de {nomDeClasse(p)}
                    </button>
                  </ActionsSecondaires>
                </span>
              </div>
            ),
          )}
          {enEdition('places', 'nouvelle') && editeur('places')}
          {lignesPlaces.length === 0 && !enEdition('places', 'nouvelle') && (
            <p className="m-0 border-t border-border px-3 py-3 text-muted-foreground">
              Aucune place annoncée.
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={enCours || cycles.length === 0}
          onClick={() => ouvrir('places', 'nouvelle', saisieClasseVide(cycles[0] ?? ''))}
          className="inline-flex min-h-10 w-fit cursor-pointer items-center rounded-full border border-dashed border-input bg-card px-3.5 font-sans text-sm font-bold text-foreground disabled:cursor-default disabled:opacity-60"
        >
          + Annoncer des places
        </button>
      </section>

      {/* L'effectif des classes, en tranches. */}
      <section className="flex flex-col gap-2.5" aria-label="Effectif par classe">
        <h3 className="m-0 font-sans text-base font-bold">
          Effectif par classe{' '}
          <span className="font-normal text-muted-foreground">(facultatif)</span>
        </h3>
        <p className="m-0 text-[13px] text-muted-foreground">
          En tranches, jamais le nombre exact. Il n’entre pas dans ce qui manque à la fiche.
        </p>
        <div
          role="table"
          aria-label={`Effectif par classe de ${nom}`}
          className="overflow-hidden rounded-xl border border-border bg-card text-[15px]"
        >
          <div
            role="row"
            className="grid gap-2 bg-muted px-3 py-2.5 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase max-lg:hidden lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_7rem_minmax(0,1.2fr)_auto]"
          >
            {['Classe', 'Effectif', 'Dit le', 'Précision', ''].map((t, i) => (
              <span role="columnheader" key={i}>
                {t}
              </span>
            ))}
          </div>
          {lignesEffectifs.map((t) =>
            enEdition('effectifs', t.id) ? (
              <div key={t.id}>{editeur('effectifs')}</div>
            ) : (
              <div
                key={t.id}
                role="row"
                aria-label={`Effectif : ${nomDeClasse(t)}`}
                className="grid items-center gap-x-2 gap-y-1 border-t border-border px-3 py-2.5 max-lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_7rem_minmax(0,1.2fr)_auto]"
              >
                <b role="cell">{nomDeClasse(t)}</b>
                <span role="cell" className="max-lg:col-start-1">
                  {t.tranche === 'autre'
                    ? (t.precision ?? 'Autre')
                    : libelleTrancheEffectif[t.tranche]}
                </span>
                <span role="cell" className={cn(cellule, 'max-lg:col-start-1')}>
                  <span className="lg:hidden">Dit le </span>
                  {jourEtMois(t.ditLe)}
                </span>
                <span role="cell" className={cn(cellule, 'max-lg:col-start-1')}>
                  {t.tranche !== 'autre' && t.precision ? (
                    t.precision
                  ) : (
                    <span className="max-lg:hidden">—</span>
                  )}
                </span>
                <span role="cell" className="max-lg:col-start-2 max-lg:row-start-1">
                  <ActionsSecondaires nom={`l’effectif de ${nomDeClasse(t)}`} discret>
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() => ouvrir('effectifs', t.id, saisieDEffectif(t))}
                    >
                      Modifier l’effectif de {nomDeClasse(t)}
                    </button>
                    <button
                      type="button"
                      className="text-destructive!"
                      disabled={enCours}
                      onClick={() =>
                        void agir(
                          () => admin.retirerEffectif(ecoleId, t.id),
                          `L’effectif de ${nomDeClasse(t)} est retiré pour ${nom}. Visible à la prochaine mise à jour du site.`,
                        )
                      }
                    >
                      Retirer l’effectif de {nomDeClasse(t)}
                    </button>
                  </ActionsSecondaires>
                </span>
              </div>
            ),
          )}
          {enEdition('effectifs', 'nouvelle') && editeur('effectifs')}
          {lignesEffectifs.length === 0 && !enEdition('effectifs', 'nouvelle') && (
            <p className="m-0 border-t border-border px-3 py-3 text-muted-foreground">
              Aucun effectif noté.
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={enCours || cycles.length === 0}
          onClick={() => ouvrir('effectifs', 'nouvelle', saisieClasseVide(cycles[0] ?? ''))}
          className="inline-flex min-h-10 w-fit cursor-pointer items-center rounded-full border border-dashed border-input bg-card px-3.5 font-sans text-sm font-bold text-foreground disabled:cursor-default disabled:opacity-60"
        >
          + Dire un effectif
        </button>
      </section>

      {cycles.length === 0 && (
        <p className="m-0 text-sm text-muted-foreground">
          Renseigne d’abord les niveaux de l’école (« En bref »).
        </p>
      )}
      {erreur && (
        <Bandeau ton="erreur" icone="alerte">
          <p>{erreur}</p>
        </Bandeau>
      )}
    </div>
  );
}
