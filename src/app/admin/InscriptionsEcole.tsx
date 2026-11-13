import { v2 } from '@/ui/v2/classes';
import { useEffect, useState } from 'react';
import { jourDuCongo } from '../../modele/date-declaration';
import { lireDateInscription, type DateInscription } from '../../modele/inscriptions';
import type { PortAdministration } from '../../modele/ports';
import { Dialogue } from '@/ui/v2/admin';
import { dateLongue } from '../../modele/pointe-noire';
import { Bandeau } from '@/ui/v2/formulaire';
import { messageErreur } from './ChampPosition';

const VIDE = { anneeScolaire: '', limite: '', declareeLe: '' };

/** La date limite des inscriptions (ticket 148) : déclarée par l'école et datée, une ligne par année scolaire. */
export function InscriptionsEcole({
  ecoleId,
  nom,
  inscriptions,
  admin,
  surChangement,
  fermer,
  integre = false,
  surOccupation,
}: {
  ecoleId: string;
  nom: string;
  inscriptions: DateInscription[];
  admin: PortAdministration;
  surChangement: (texte: string) => void;
  fermer: () => void;
  integre?: boolean;
  surOccupation?: (occupe: boolean) => void;
}) {
  const [saisie, setSaisie] = useState(VIDE);
  const [id, setId] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    surOccupation?.(enCours);
    return () => surOccupation?.(false);
  }, [enCours, surOccupation]);
  const changer = (champ: Partial<typeof VIDE>) => setSaisie((s) => ({ ...s, ...champ }));

  const agir = async (action: () => Promise<unknown>, succes: string) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      setSaisie(VIDE);
      setId(null);
      surChangement(`${succes} Visible après la prochaine mise à jour du site.`);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };
  const enregistrer = () => {
    const { date, erreur: refus } = lireDateInscription(saisie);
    if (!date) {
      setErreur(refus);
      return;
    }
    void agir(
      () => admin.enregistrerDateInscription(ecoleId, date, id),
      `Date d’inscription de ${nom} enregistrée.`,
    );
  };

  return (
    <Dialogue titre={`Inscriptions de ${nom}`} fermer={fermer} integre={integre}>
      <form
        className={v2.motif}
        aria-label={`Inscriptions de ${nom}`}
        onSubmit={(ev) => {
          ev.preventDefault();
          enregistrer();
        }}
      >
        <h3>Date limite des inscriptions</h3>
        <p>
          La date annoncée par l’école. La fiche écrit « Date limite annoncée » et la retire, une
          fois passée, à la mise à jour suivante du site.
        </p>
        {inscriptions.length > 0 && (
          <ul className="admin-frais-liste">
            {inscriptions.map((d) => (
              <li key={d.id}>
                <b>
                  {d.anneeScolaire} · limite du {dateLongue(d.limite)}
                </b>
                <p>
                  Déclarée le {dateLongue(d.declareeLe)}
                  {d.limite < jourDuCongo() && ' · date passée : la fiche ne l’affiche plus'}
                </p>
                <button
                  type="button"
                  className={v2.boutonSecondaire}
                  disabled={enCours}
                  onClick={() => {
                    setId(d.id);
                    setSaisie({
                      anneeScolaire: d.anneeScolaire,
                      limite: d.limite,
                      declareeLe: d.declareeLe,
                    });
                    setErreur(null);
                  }}
                >
                  Modifier {d.anneeScolaire}
                </button>
                <button
                  type="button"
                  className={v2.boutonRefus}
                  disabled={enCours}
                  onClick={() =>
                    void agir(
                      () => admin.retirerDateInscription(ecoleId, d.id),
                      `Date d’inscription de ${nom} retirée.`,
                    )
                  }
                >
                  Retirer {d.anneeScolaire}
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className={v2.groupe}>
          Année scolaire (2026-2027)
          <input
            className={v2.champ}
            maxLength={30}
            value={saisie.anneeScolaire}
            onChange={(e) => changer({ anneeScolaire: e.target.value })}
          />
        </label>
        <label className={v2.groupe}>
          Date limite annoncée
          <input
            className={v2.champ}
            type="date"
            value={saisie.limite}
            onChange={(e) => changer({ limite: e.target.value })}
          />
        </label>
        <label className={v2.groupe}>
          Date de la déclaration de l’école
          <input
            className={v2.champ}
            type="date"
            max={jourDuCongo()}
            value={saisie.declareeLe}
            onChange={(e) => changer({ declareeLe: e.target.value })}
          />
        </label>
        {erreur && (
          <Bandeau ton="erreur" icone="alerte">
            {erreur}
          </Bandeau>
        )}
        <button className={v2.bouton} type="submit" disabled={enCours}>
          {enCours ? 'Enregistrement…' : id ? 'Modifier la date' : 'Ajouter la date'}
        </button>
        {id && (
          <button
            type="button"
            className={v2.boutonSecondaire}
            disabled={enCours}
            onClick={() => {
              setId(null);
              setSaisie(VIDE);
              setErreur(null);
            }}
          >
            Annuler la modification
          </button>
        )}
        <p className={v2.mention}>Visible après la prochaine mise à jour du site.</p>
      </form>
    </Dialogue>
  );
}
