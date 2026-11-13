import { v2 } from '@/ui/v2/classes';
import { useEffect, useState } from 'react';
import { jourDuCongo } from '../../modele/date-declaration';
import {
  lireEquipement,
  saisieEquipementVide,
  saisieDeEquipement,
  libelleEquipement,
  libelleEtatEquipement,
  nomEquipement,
  etatPublicEquipement,
  type Equipement,
  type SaisieEquipement,
} from '../../modele/equipements-ecole';
import { listes } from '../../modele/listes';
import type { PortAdministration } from '../../modele/ports';
import { Bandeau } from '@/ui/v2/formulaire';
import { jour } from '../../ui/composants';
import { Dialogue } from '@/ui/v2/admin';
import { messageErreur } from './ChampPosition';
export function EquipementsEcole({
  ecoleId,
  nom,
  equipements,
  admin,
  fermer,
  integre = false,
  surOccupation,
  surChangement,
}: {
  ecoleId: string;
  nom: string;
  equipements: Equipement[];
  admin: PortAdministration;
  fermer: () => void;
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
    const resultat = lireEquipement(saisie);
    if (!resultat.equipement) {
      setErreur(resultat.erreur);
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await admin.enregistrerEquipement(ecoleId, resultat.equipement, id);
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
  return (
    <Dialogue titre={`Équipements de ${nom}`} fermer={fermer} integre={integre}>
      <h3>Équipements et infrastructures</h3>
      <p>
        Non observé ne veut pas dire absent. Le terrain dit ce qu’il a vu ; une absence ne se dit
        que pour la clôture, les autres restent des déclarations de l’école.
      </p>
      {equipements.length > 0 && (
        <ul className="admin-equipements-liste">
          {equipements.map((e) => (
            <li key={e.id}>
              <b>{nomEquipement(e)}</b>
              <p>
                {etatPublicEquipement(e)} · {jour(e.constateLe)}
              </p>
              <button
                type="button"
                className={v2.boutonSecondaire}
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
                className={v2.boutonSecondaire}
                disabled={enCours}
                onClick={() => void retirer(e)}
              >
                Retirer {nomEquipement(e)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className={v2.motif}
        aria-label={`Équipement de ${nom}`}
        onSubmit={(e) => {
          e.preventDefault();
          void sauver();
        }}
      >
        <h4>{id ? 'Modifier une information' : 'Ajouter une information'}</h4>
        <label className={v2.groupe}>
          Équipement
          <select
            className={v2.champ}
            value={saisie.cle}
            onChange={(e) => champ('cle', e.target.value)}
          >
            <option value="">Choisir</option>
            {listes.equipment_key.map((c) => (
              <option key={c} value={c}>
                {libelleEquipement[c]}
              </option>
            ))}
          </select>
        </label>
        {saisie.cle === 'autre' && (
          <label className={v2.groupe}>
            Préciser cet autre équipement
            <input
              className={v2.champ}
              maxLength={80}
              value={saisie.precision}
              onChange={(e) => champ('precision', e.target.value)}
            />
          </label>
        )}
        <label className={v2.groupe}>
          État
          <select
            className={v2.champ}
            value={saisie.etat}
            onChange={(e) => champ('etat', e.target.value)}
          >
            <option value="">Choisir</option>
            {listes.equipment_state.map((v) => (
              <option key={v} value={v}>
                {libelleEtatEquipement[v]}
              </option>
            ))}
          </select>
        </label>
        <label className={v2.groupe}>
          Source
          <select
            className={v2.champ}
            value={saisie.source}
            onChange={(e) => {
              champ('source', e.target.value);
              champ('confirme', false);
            }}
          >
            <option value="">Choisir</option>
            <option value="ecole">Déclaration de l’école</option>
            <option value="terrain">Observation de terrain</option>
          </select>
        </label>
        <p className={v2.mention}>
          Depuis la rue : clôture, terrain de sport ou autre élément visible précisé. La présence
          d’un réseau ou d’un véhicule ne prouve pas un service d’eau, d’électricité ou de
          transport.
        </p>
        <label className={v2.groupe}>
          Date de déclaration ou d’observation
          <input
            className={v2.champ}
            type="date"
            max={jourDuCongo()}
            value={saisie.constateLe}
            onChange={(e) => champ('constateLe', e.target.value)}
          />
        </label>
        <label className={v2.groupe}>
          Précision (facultatif)
          <textarea
            className={v2.champ}
            maxLength={300}
            value={saisie.note}
            onChange={(e) => champ('note', e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={saisie.confirme}
            onChange={(e) => champ('confirme', e.target.checked)}
          />{' '}
          {saisie.source === 'terrain'
            ? 'Ce constat a été réellement observé sur place, sans déduire ce qui n’est pas visible.'
            : 'Cette information a été communiquée par l’école pour être affichée.'}
        </label>
        <button type="submit" className={v2.bouton} disabled={enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer l’équipement'}
        </button>
        {id && (
          <button
            type="button"
            className={v2.boutonSecondaire}
            onClick={() => {
              setId(null);
              setSaisie(saisieEquipementVide());
            }}
          >
            Annuler la modification
          </button>
        )}
      </form>
      {erreur && (
        <Bandeau ton="erreur" icone="alerte">
          {erreur}
        </Bandeau>
      )}
      <p className={v2.mention}>
        Ces informations ne donnent aucun badge et ne publient pas l’école. Modification et retrait
        sont tracés ; reconstruis le site après chaque changement.
      </p>
      <a
        href="https://github.com/benaja-bendo/ntanova-site/actions/workflows/mise-en-ligne.yml"
        target="_blank"
        rel="noopener noreferrer"
      >
        Ouvrir la mise à jour du site
      </a>
    </Dialogue>
  );
}
