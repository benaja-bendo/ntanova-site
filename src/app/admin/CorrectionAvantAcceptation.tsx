import { v2 } from '@/ui/v2/classes';
import { useEffect, useRef, useState } from 'react';
import {
  erreursFormulaireEcole,
  formulaireDe,
  versCorrection,
  type FormulaireEcole,
} from '../../modele/correction-ecole';
import type { CorrectionEcole, DetailReleve } from '../../modele/ports';
import type { Erreurs } from '../../modele/fiche';
import { Bouton, Dialogue } from '@/ui/v2/admin';
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
  const formulaire = useRef<HTMLFormElement>(null);
  const avant = { ...fiche, nom: fiche.nomEnseigne };
  const [edition, setEdition] = useState(false);
  const [champs, setChamps] = useState<FormulaireEcole>(() => formulaireDe(avant));
  const [erreurs, setErreurs] = useState<Erreurs>({});
  useEffect(() => {
    if (!edition) return;
    // Après l'ouverture du tiroir (Radix pose d'abord le focus sur « Fermer ») : le premier champ, le nom.
    const t = setTimeout(
      () => formulaire.current?.querySelector<HTMLInputElement>('input')?.focus(),
      50,
    );
    return () => clearTimeout(t);
  }, [edition]);
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
  };
  // Planche : rien ne se voit tant qu'on ne corrige pas ; « Corriger » ou « Différent » ouvre le tiroir.
  if (!edition) return null;
  return (
    <Dialogue
      titre="Corriger avant d’accepter"
      variante="tiroir"
      fermer={fermer}
      libelleFermeture="Annuler"
      entete={<h2>Corriger avant d’accepter</h2>}
    >
      <form
        ref={formulaire}
        className="flex flex-col gap-4"
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
        <p className={v2.mention}>
          Enregistrées avec l’acceptation ; le relevé du relais est conservé.
        </p>
        <ChampsFiche
          champs={champs}
          erreurs={erreurs}
          changer={(valeurs) => setChamps((c) => ({ ...c, ...valeurs }))}
        />
        <div className={v2.actions}>
          <Bouton type="submit">Utiliser ces valeurs</Bouton>
          {Object.keys(correction).length > 0 && (
            <Bouton
              variante="discret"
              onClick={() => {
                surChangement({});
                fermer();
              }}
            >
              Reprendre les valeurs du relais
            </Bouton>
          )}
        </div>
      </form>
    </Dialogue>
  );
}
