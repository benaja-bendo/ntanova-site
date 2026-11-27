import { v2 } from '@/ui/v2/classes';
import { useEffect, useRef, useState } from 'react';
import {
  erreursRelecture,
  formulaireDeRelecture,
  versCorrectionDeRelecture,
  type AvantRelecture,
  type ModeDeRelecture,
  type ValeursRelues,
} from '../../modele/correction-ecole';
import type { CorrectionEcole, EcoleVue } from '../../modele/ports';
import type { Erreurs } from '../../modele/fiche';
import { Bouton, Dialogue } from '@/ui/v2/admin';
import { Champ } from '@/ui/v2/formulaire';
import { ChampsFiche } from './ChampsFiche';

/** Une préparation locale : seule l’acceptation écrit les valeurs dans la base. */
export function CorrectionAvantAcceptation({
  avant,
  mode,
  ecole,
  correction,
  surChangement,
  surEdition,
  demande = 0,
}: {
  /** Les valeurs du relevé. */
  avant: AvantRelecture;
  mode: ModeDeRelecture;
  /** L'école complétée, ou un site de l'école qui en reçoit un : ce qu'elle a déjà ne se saisit pas ici. */
  ecole: Pick<EcoleVue, 'sigle' | 'anneeCreation' | 'etiquette'> | null;
  correction: CorrectionEcole;
  surChangement: (valeurs: CorrectionEcole) => void;
  surEdition: (edition: boolean) => void;
  /** Lot G : « Différent » (le nom n'est pas celui de l'enseigne) ouvre la correction ; chaque demande l'ouvre. */
  demande?: number;
}) {
  const formulaire = useRef<HTMLFormElement>(null);
  const [edition, setEdition] = useState(false);
  const [champs, setChamps] = useState<ValeursRelues>(() => formulaireDeRelecture(avant, {}));
  const [erreurs, setErreurs] = useState<Erreurs>({});
  useEffect(() => {
    if (!edition) return;
    // Après l'ouverture du tiroir (Radix pose d'abord le focus sur « Fermer ») : le premier champ.
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
    setChamps(formulaireDeRelecture(avant, correction));
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
  const changer = (valeurs: Partial<ValeursRelues>) => setChamps((c) => ({ ...c, ...valeurs }));
  // Le sigle et l'année d'une école déjà connue ne se remplacent pas ; un site déjà nommé garde son nom.
  const sigleConnu = mode !== 'nouvelle' ? ecole?.sigle?.trim() : undefined;
  const anneeConnue = mode !== 'nouvelle' ? ecole?.anneeCreation : undefined;
  const nomDuSiteConnu = mode === 'completer' ? ecole?.etiquette?.trim() : undefined;
  const dejaLa = [
    sigleConnu ? `le sigle « ${sigleConnu} »` : null,
    anneeConnue ? `l’année ${anneeConnue}` : null,
    nomDuSiteConnu ? `le nom du site « ${nomDuSiteConnu} »` : null,
  ].filter(Boolean);
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
          const trouvees = erreursRelecture(champs);
          setErreurs(trouvees);
          if (Object.keys(trouvees).length) {
            requestAnimationFrame(() =>
              formulaire.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
            );
            return;
          }
          surChangement(versCorrectionDeRelecture(avant, champs));
          fermer();
        }}
      >
        <p className={v2.mention}>
          Enregistrées avec l’acceptation ; le relevé du relais est conservé.
        </p>
        {mode === 'nouveau_site' && (
          <p className={v2.mention}>Le nom et le type restent ceux de l’école.</p>
        )}
        {dejaLa.length > 0 && (
          <p className={v2.mention}>
            L’école a déjà {dejaLa.join(', ')} : cela se change dans « Écoles ».
          </p>
        )}
        <ChampsFiche
          champs={champs}
          erreurs={erreurs}
          changer={changer}
          sansNomNiType={mode === 'nouveau_site'}
          apresNom={
            <>
              {!sigleConnu && (
                <Champ libelle="Sigle" facultatif erreur={erreurs.sigle}>
                  {(a) => (
                    <input
                      {...a}
                      className={v2.champ}
                      type="text"
                      autoComplete="off"
                      value={champs.sigle}
                      onChange={(ev) => changer({ sigle: ev.target.value })}
                    />
                  )}
                </Champ>
              )}
              {!nomDuSiteConnu && (
                <Champ
                  libelle="Nom de ce site"
                  facultatif
                  erreur={erreurs.etiquette}
                  aide="Par exemple « Annexe » : il distingue les sites d’une même école."
                >
                  {(a) => (
                    <input
                      {...a}
                      className={v2.champ}
                      type="text"
                      autoComplete="off"
                      value={champs.etiquette}
                      onChange={(ev) => changer({ etiquette: ev.target.value })}
                    />
                  )}
                </Champ>
              )}
            </>
          }
        />
        {!anneeConnue && (
          <Champ libelle="Année de création" facultatif erreur={erreurs.anneeCreation}>
            {(a) => (
              <input
                {...a}
                className={v2.champ}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={champs.anneeCreation}
                onChange={(ev) => changer({ anneeCreation: ev.target.value })}
              />
            )}
          </Champ>
        )}
        <Champ
          libelle="E-mail lu sur l’enseigne"
          facultatif
          erreur={erreurs.email}
          aide="Privé : jamais publié. Il rejoint les contacts de l’école."
        >
          {(a) => (
            <input
              {...a}
              className={v2.champ}
              type="email"
              autoComplete="off"
              value={champs.email}
              onChange={(ev) => changer({ email: ev.target.value })}
            />
          )}
        </Champ>
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
