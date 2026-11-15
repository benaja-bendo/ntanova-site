import { v2 } from '@/ui/v2/classes';
import { useEffect, useState } from 'react';
import { jourDuCongo } from '../../modele/date-declaration';
import {
  lireEquipement,
  saisieEquipementVide,
  saisieDeEquipement,
  libelleEquipement,
  nomEquipement,
  type Equipement,
  type SaisieEquipement,
} from '../../modele/equipements-ecole';
import { listes } from '../../modele/listes';
import type { PortAdministration } from '../../modele/ports';
import { Bandeau } from '@/ui/v2/formulaire';
import { jour } from '../../ui/composants';
import { ActionsSecondaires, Bouton } from '@/ui/v2/admin';
import { cn } from '@/lib/utils';
import { IconeFermer } from '@/ui/shadcn/icones';
import { messageErreur } from './ChampPosition';
export function EquipementsEcole({
  ecoleId,
  nom,
  equipements,
  admin,
  fermer,
  surOccupation,
  surChangement,
}: {
  ecoleId: string;
  nom: string;
  equipements: Equipement[];
  admin: PortAdministration;
  fermer: () => void;
  /** Toujours dans la fiche (tiroir) depuis la refonte v2 ; gardé pour les appels d'avant. */
  integre?: boolean;
  surOccupation?: (occupe: boolean) => void;
  surChangement: (texte: string) => void;
}) {
  const [saisie, setSaisie] = useState(saisieEquipementVide);
  const [id, setId] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    surOccupation?.(enCours);
    return () => surOccupation?.(false);
  }, [enCours, surOccupation]);
  const champ = (cle: keyof SaisieEquipement, valeur: string | boolean) =>
    setSaisie((s) => ({ ...s, [cle]: valeur }));
  const sauver = async () => {
    // Planche : enregistrer la ligne vaut confirmation de sa provenance (qui le dit, quand).
    const resultat = lireEquipement({ ...saisie, confirme: true });
    if (!resultat.equipement) {
      setErreur(resultat.erreur);
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await admin.enregistrerEquipement(ecoleId, resultat.equipement, id === 'nouveau' ? null : id);
      setId(null);
      setSaisie(saisieEquipementVide());
      surChangement(
        `L’équipement de ${nom} est enregistré avec sa source et sa date. Reconstruis le site pour publier ce changement.`,
      );
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };
  const retirer = async (e: Equipement) => {
    setEnCours(true);
    setErreur(null);
    try {
      await admin.retirerEquipement(ecoleId, e.id);
      if (id === e.id) {
        setId(null);
        setSaisie(saisieEquipementVide());
      }
      surChangement(
        `L’équipement de ${nom} est retiré du catalogue. Reconstruis le site pour le retirer des pages en ligne ; l’historique est conservé.`,
      );
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };
  const ouvrirNouveau = (cle: string) => {
    setId('nouveau');
    setSaisie({
      ...saisieEquipementVide(),
      cle,
      etat: 'present',
      source: 'ecole',
      constateLe: jourDuCongo(),
    });
    setErreur(null);
  };
  const absents = listes.equipment_key.filter(
    (c) => c !== 'autre' && !equipements.some((e) => e.cle === c),
  );
  const editeur = (
    <div
      role="row"
      className="grid items-center gap-2 border-t border-border bg-succes/40 px-3 py-2.5 shadow-[inset_3px_0_0_var(--marque)] lg:grid-cols-[minmax(0,1.3fr)_1fr_1fr_1.2fr_1fr_auto]"
    >
      <b role="cell" className="text-[15px]">
        {saisie.cle === 'autre' ? (
          <input
            aria-label="Préciser cet autre équipement"
            className={cn(v2.champ, 'h-10')}
            maxLength={80}
            value={saisie.precision}
            onChange={(e) => champ('precision', e.target.value)}
          />
        ) : (
          (libelleEquipement[saisie.cle as keyof typeof libelleEquipement] ?? 'Équipement')
        )}
      </b>
      <select
        role="cell"
        aria-label="Qui le dit"
        className={cn(v2.champ, 'h-10 text-sm')}
        value={saisie.source}
        onChange={(e) => champ('source', e.target.value)}
      >
        <option value="ecole">L’école</option>
        <option value="terrain">Vu sur place</option>
      </select>
      <select
        role="cell"
        aria-label="Ce qu’il dit"
        className={cn(v2.champ, 'h-10 text-sm')}
        value={saisie.etat}
        onChange={(e) => champ('etat', e.target.value)}
      >
        {listes.equipment_state.map((v) => (
          <option key={v} value={v}>
            {ceQuIlDit[v]}
          </option>
        ))}
      </select>
      <input
        role="cell"
        aria-label="Précision (facultatif)"
        className={cn(v2.champ, 'h-10 text-sm')}
        maxLength={300}
        value={saisie.note}
        onChange={(e) => champ('note', e.target.value)}
      />
      <input
        role="cell"
        aria-label="Le"
        type="date"
        max={jourDuCongo()}
        className={cn(v2.champ, 'h-10 text-sm')}
        value={saisie.constateLe}
        onChange={(e) => champ('constateLe', e.target.value)}
      />
      <button
        type="button"
        role="cell"
        aria-label="Annuler cette ligne"
        onClick={() => {
          setId(null);
          setSaisie(saisieEquipementVide());
        }}
        className="flex size-9 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-destructive"
      >
        <IconeFermer className="size-4" aria-hidden />
      </button>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm text-muted-foreground">Chaque ligne dit qui l’affirme et quand.</p>
      <div
        role="table"
        aria-label={`Équipements de ${nom}`}
        className="overflow-hidden rounded-xl border border-border bg-card text-[15px]"
      >
        <div
          role="row"
          className="grid gap-2 bg-muted px-3 py-2.5 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase lg:grid-cols-[minmax(0,1.3fr)_1fr_1fr_1.2fr_1fr_auto] max-lg:hidden"
        >
          {['Équipement', 'Qui le dit', 'Ce qu’il dit', 'Précision (facultatif)', 'Le', ''].map(
            (t, i) => (
              <span role="columnheader" key={i}>
                {t}
              </span>
            ),
          )}
        </div>
        {equipements.map((e) =>
          id === e.id ? (
            <div key={e.id}>{editeur}</div>
          ) : (
            <div
              key={e.id}
              role="row"
              aria-label={nomEquipement(e)}
              className="grid items-center gap-x-2 gap-y-0.5 border-t border-border px-3 py-2.5 lg:grid-cols-[minmax(0,1.3fr)_1fr_1fr_1.2fr_1fr_auto] max-lg:grid-cols-[minmax(0,1fr)_auto]"
            >
              <b role="cell">{nomEquipement(e)}</b>
              <span
                role="cell"
                className="max-lg:col-start-1 max-lg:text-sm max-lg:text-muted-foreground"
              >
                {e.source === 'terrain' ? 'Vu sur place' : 'L’école'}
                <span className="lg:hidden"> · {jour(e.constateLe)}</span>
              </span>
              <span role="cell" className="max-lg:col-start-2 max-lg:row-start-1">
                <span className="lg:hidden">
                  <span className={e.etat === 'present' ? v2.pastilleSucces : v2.pastilleNeutre}>
                    {ceQuIlDit[e.etat]}
                  </span>
                </span>
                <span className="max-lg:hidden">{ceQuIlDit[e.etat]}</span>
              </span>
              <span role="cell" className="text-muted-foreground max-lg:hidden">
                {e.note ?? e.precision ?? '—'}
              </span>
              <span role="cell" className="max-lg:hidden">
                {jour(e.constateLe)}
              </span>
              <span role="cell" className="max-lg:col-start-2 max-lg:row-start-2">
                <ActionsSecondaires nom={nomEquipement(e)} discret>
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => {
                      setId(e.id);
                      setSaisie(saisieDeEquipement(e));
                      setErreur(null);
                    }}
                  >
                    Modifier {nomEquipement(e)}
                  </button>
                  <button
                    type="button"
                    className="text-destructive!"
                    disabled={enCours}
                    onClick={() => void retirer(e)}
                  >
                    Retirer {nomEquipement(e)}
                  </button>
                </ActionsSecondaires>
              </span>
            </div>
          ),
        )}
        {id === 'nouveau' && editeur}
        {equipements.length === 0 && id !== 'nouveau' && (
          <p className="m-0 border-t border-border px-3 py-3 text-muted-foreground">
            Rien de noté pour le moment.
          </p>
        )}
      </div>
      <p className="m-0 text-[13px] text-muted-foreground">
        « Il n’y en a pas » : seulement si l’école le dit. Vu sur place = « Il y en a ».
      </p>
      <div className="flex flex-col gap-2">
        <b className="text-sm">Ajouter</b>
        <div className="flex flex-wrap gap-2">
          {[...absents, 'autre' as const].map((c) => (
            <button
              key={c}
              type="button"
              disabled={enCours}
              onClick={() => ouvrirNouveau(c)}
              className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-dashed border-input bg-card px-3.5 font-sans text-sm font-bold text-foreground"
            >
              + {libelleEquipement[c]}
            </button>
          ))}
        </div>
      </div>
      {erreur && (
        <Bandeau ton="erreur" icone="alerte">
          <p>{erreur}</p>
        </Bandeau>
      )}
      <div className="sticky bottom-0 -mx-5 -mb-4 flex flex-wrap items-center gap-3 border-t border-border bg-card px-5 py-3">
        <span className="mr-auto text-sm text-muted-foreground">
          Visible à la prochaine mise à jour du site.
        </span>
        <Bouton variante="secondaire" onClick={fermer} disabled={enCours}>
          Annuler
        </Bouton>
        <Bouton enCours={enCours} disabled={id === null} onClick={() => void sauver()}>
          Enregistrer
        </Bouton>
      </div>
    </div>
  );
}

/** Ce que dit la ligne, dans les mots de la planche. */
const ceQuIlDit: Record<string, string> = {
  present: 'Il y en a',
  absent: 'Il n’y en a pas',
  non_precise: 'Pas précisé',
};
