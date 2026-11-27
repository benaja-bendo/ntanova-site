/**
 * Avant de publier (ticket 236, 27/11) : la direction a dit non, ou a laissé un mot au relais. Le geste « Publier » le
 * montre, avec le jour, et demande une confirmation explicite ; rien n'est bloqué pour toujours. Le mot reste privé : il ne
 * paraît nulle part sur le site.
 */
import { Bouton, Dialogue } from '@/ui/v2/admin';
import { dateLongue } from '../../modele/pointe-noire';
import type { AlertePublication } from '../../modele/ports';

export const unRefus = (alertes: readonly AlertePublication[]) => alertes.some((a) => a.refus);

/** Ce que le relais a rapporté, fiche par fiche : le jour, le refus ou le mot. */
export function MotsDeLaDirection({ alertes }: { alertes: readonly AlertePublication[] }) {
  const fiches = [...new Set(alertes.map((a) => a.releveId))].map((id) =>
    alertes.filter((a) => a.releveId === id),
  );
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px]">
      {fiches.map((mots) => {
        const premier = mots[0]!;
        return (
          <li key={premier.releveId} className="flex flex-col gap-0.5 [overflow-wrap:anywhere]">
            <b>
              {premier.refus ? 'La direction a dit non' : 'Un mot de la direction'} ·{' '}
              {dateLongue(premier.releveLe)}
            </b>
            {mots.map((a, i) => (a.mot ? <span key={i}>« {a.mot} »</span> : null))}
            {premier.relais && (
              <span className="text-sm text-muted-foreground">Rapporté par {premier.relais}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ConfirmationAvantPublication({
  ecoles,
  alertes,
  autres = 0,
  enCours,
  publier,
  publierLesAutres,
  fermer,
}: {
  /** Les écoles signalées ; une seule depuis sa ligne ou sa fiche. */
  ecoles: { id: string; nom: string }[];
  alertes: readonly AlertePublication[];
  /** « Publier les N d'un coup » : les écoles prêtes sans rien de signalé. */
  autres?: number;
  enCours: boolean;
  /** Publier malgré ce qui est signalé (avec les autres, dans la publication groupée). */
  publier: () => void;
  publierLesAutres?: () => void;
  fermer: () => void;
}) {
  const refus = unRefus(alertes);
  const titre = refus ? 'La direction a dit non' : 'Un mot de la direction';
  const groupee = publierLesAutres !== undefined;
  return (
    <Dialogue
      titre={`Avant de publier : ${titre.toLocaleLowerCase('fr')}`}
      variante="confirmation"
      libelleFermeture="Ne pas publier"
      occupe={enCours}
      fermer={fermer}
      entete={<h2>Avant de publier</h2>}
    >
      <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
        {ecoles.map((e) => (
          <section key={e.id} className="flex flex-col gap-1.5 rounded-md bg-attention p-3">
            <h3 className="m-0 font-serif text-lg font-bold [overflow-wrap:anywhere]">{e.nom}</h3>
            <MotsDeLaDirection alertes={alertes.filter((a) => a.ecoleId === e.id)} />
          </section>
        ))}
      </div>
      <p className="m-0 text-sm text-muted-foreground">
        Une école qui ne veut pas paraître se retire du site. Ces mots restent privés.
      </p>
      <div className="flex flex-wrap justify-end gap-2.5">
        {groupee && autres > 0 && (
          <Bouton enCours={enCours} texteEnCours="Publication…" onClick={publierLesAutres}>
            {autres > 1 ? `Publier les ${autres} autres` : 'Publier l’autre'}
          </Bouton>
        )}
        <Bouton variante="secondaire" disabled={enCours} onClick={publier}>
          {groupee
            ? `Publier les ${autres + ecoles.length}, ${refus ? 'refus compris' : 'signalées comprises'}`
            : refus
              ? 'Publier malgré ce refus'
              : 'Publier quand même'}
        </Bouton>
      </div>
    </Dialogue>
  );
}
