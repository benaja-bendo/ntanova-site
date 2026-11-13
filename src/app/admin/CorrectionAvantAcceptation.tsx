import { useEffect, useRef, useState } from 'react';
import {
  erreursFormulaireEcole,
  formulaireDe,
  versCorrection,
  type FormulaireEcole,
} from '../../modele/correction-ecole';
import type { CorrectionEcole, DetailReleve } from '../../modele/ports';
import type { Erreurs } from '../../modele/fiche';
import { Bouton } from '../../ui/actions';
import { ChampsFiche } from './ChampsFiche';

/** Une préparation locale : seule l’acceptation écrit les valeurs dans la base. */
export function CorrectionAvantAcceptation({
  fiche,
  correction,
  surChangement,
  surEdition,
  demande = 0,
}: {
  fiche: DetailReleve;
  correction: CorrectionEcole;
  surChangement: (valeurs: CorrectionEcole) => void;
  surEdition: (edition: boolean) => void;
  /** Lot G : « Différent » (le nom n'est pas celui de l'enseigne) ouvre la correction ; chaque demande l'ouvre. */
  demande?: number;
}) {
  const declencheur = useRef<HTMLDivElement>(null);
  const formulaire = useRef<HTMLFormElement>(null);
  const avant = { ...fiche, nom: fiche.nomEnseigne };
  const [edition, setEdition] = useState(false);
  const [champs, setChamps] = useState<FormulaireEcole>(() => formulaireDe(avant));
  const [erreurs, setErreurs] = useState<Erreurs>({});
  useEffect(() => {
    if (edition) formulaire.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [edition]);
  const ouvrir = () => {
    setChamps(formulaireDe({ ...avant, ...correction }));
    setErreurs({});
    setEdition(true);
    surEdition(true);
  };
  const derniereDemande = useRef(demande);
  useEffect(() => {
    if (demande === derniereDemande.current) return;
    derniereDemande.current = demande;
    setChamps(formulaireDe({ ...avant, ...correction }));
    setErreurs({});
    setEdition(true);
    surEdition(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demande]);
  const fermer = () => {
    setEdition(false);
    surEdition(false);
    requestAnimationFrame(() => declencheur.current?.querySelector('button')?.focus());
  };
  return edition ? (
    <form
      ref={formulaire}
      className="admin-motif"
      aria-label="Corriger avant d’accepter"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        const trouvees = erreursFormulaireEcole(champs);
        setErreurs(trouvees);
        if (Object.keys(trouvees).length) {
          requestAnimationFrame(() =>
            formulaire.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
          );
          return;
        }
        surChangement(versCorrection(avant, champs));
        fermer();
      }}
    >
      <p className="mention admin-pleine-largeur">
        Corrige seulement ce que les photos ou les informations reçues permettent de confirmer. Ces
        valeurs seront enregistrées avec l’acceptation ; le relevé du relais sera conservé.
      </p>
      <ChampsFiche
        champs={champs}
        erreurs={erreurs}
        changer={(valeurs) => setChamps((c) => ({ ...c, ...valeurs }))}
      />
      <div className="admin-actions admin-pleine-largeur">
        <Bouton type="submit">Utiliser ces valeurs</Bouton>
        <Bouton variante="secondaire" onClick={fermer}>
          Annuler
        </Bouton>
      </div>
    </form>
  ) : (
    <div ref={declencheur} className="pile-serree">
      <Bouton variante="secondaire" onClick={ouvrir}>
        Corriger avant d’accepter
      </Bouton>
      {Object.keys(correction).length > 0 && (
        <>
          <p className="mention" role="status">
            Les valeurs corrigées seront enregistrées à l’acceptation.
          </p>
          <Bouton variante="discret" onClick={() => surChangement({})}>
            Reprendre les valeurs du relais
          </Bouton>
        </>
      )}
    </div>
  );
}
