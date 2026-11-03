/**
 * Les personnes à contacter pour une fiche (ticket #96) : celles que le relais a rencontrées, et celles que
 * l'administration note elle-même (un numéro reçu par WhatsApp que l'application n'a pas pu prendre). Trois au plus.
 * Privées : jamais publiées, jamais relues par le relais. Chacune s'ajoute, se corrige et s'efface seule.
 */
import { useState } from 'react';
import {
  erreursPersonne,
  ficheQuiPorteLesPersonnes,
  libellePersonne,
  peutAjouterUnePersonne,
  personneVide,
  versContactASaisir,
  versPersonneSaisie,
  type PersonneSaisie,
} from '../../modele/contacts';
import { libelleFonction } from '../../modele/libelles';
import { listes, type Valeur } from '../../modele/listes';
import type { ContactDirection, DetailReleve, PortAdministration } from '../../modele/ports';
import { afficherTelephone } from '../../modele/telephone';
import { Champ, Icone, quand } from '../../ui/composants';
import { messageErreur } from './ChampPosition';

type Edition = { mode: 'ajout' } | { mode: 'correction'; contact: ContactDirection } | null;

export function Personnes({
  admin,
  id,
  detail,
  personnes,
  surChangement,
  annoncer,
  surErreur,
}: {
  admin: PortAdministration;
  /** La fiche qu'on regarde. */
  id: string;
  detail: DetailReleve;
  personnes: ContactDirection[];
  /** Les personnes ont changé : la fiche les relit. */
  surChangement: () => Promise<void>;
  annoncer: (texte: string) => void;
  surErreur: (texte: string | null) => void;
}) {
  const [edition, setEdition] = useState<Edition>(null);
  const [aEffacer, setAEffacer] = useState<string | null>(null);

  const effacer = async (c: ContactDirection) => {
    surErreur(null);
    try {
      await admin.effacerContact(c.id, null);
      await surChangement();
      annoncer('Le contact de la direction est effacé.');
    } catch (e) {
      surErreur(messageErreur(e));
    } finally {
      setAEffacer(null);
    }
  };

  const enregistrer = async (saisie: PersonneSaisie): Promise<void> => {
    surErreur(null);
    const contact = versContactASaisir(saisie);
    if (edition?.mode === 'correction') {
      await admin.corrigerContact(edition.contact.id, contact);
      annoncer('La personne est corrigée.');
    } else {
      // La personne rejoint la fiche qui porte déjà les autres (l'original d'une correction), sinon la fiche regardée.
      await admin.ajouterContact(ficheQuiPorteLesPersonnes(personnes, id), contact);
      annoncer('La personne est ajoutée.');
    }
    await surChangement();
    setEdition(null);
  };

  const plusieurs = personnes.length > 1;
  return (
    <section className="admin-prive pile-serree" aria-label="Partie privée">
      <h3 className="rang">
        <Icone nom="cadenas" />
        Privé : la direction
      </h3>
      {detail.direction === 'absente' && (
        <p>Direction absente{detail.repasser ? ` · à repasser : ${detail.repasser}` : ''}.</p>
      )}
      {detail.direction === null && <p>Le relais n'a rien dit de la direction.</p>}
      {(detail.direction === 'vue' || detail.direction === 'refus') && personnes.length === 0 && (
        <p>Contact pas encore reçu.</p>
      )}
      {detail.direction === 'refus' && personnes.length > 0 && <p>La direction a refusé.</p>}

      {personnes.length > 0 && (
        <ul className="pile admin-personnes" aria-label="Personnes à contacter">
          {personnes.map((c) => (
            <li key={c.id} className="pile-serree">
              {plusieurs && <h4 className="rang">{libellePersonne(c)}</h4>}
              {c.releveId && c.releveId !== id && (
                <p className="mention">Ce contact est arrivé avec la fiche d’origine.</p>
              )}
              <dl className="admin-champs">
                {c.fonction && (
                  <>
                    <dt>Fonction</dt>
                    <dd>
                      {c.fonction === 'autre' && c.precisionFonction
                        ? `Autre : ${c.precisionFonction}`
                        : libelleFonction[c.fonction]}
                    </dd>
                  </>
                )}
                {c.nom && (
                  <>
                    <dt>Nom</dt>
                    <dd>{c.nom}</dd>
                  </>
                )}
                <dt>WhatsApp</dt>
                <dd>{c.whatsapp ? afficherTelephone(c.whatsapp) : '—'}</dd>
                <dt>Accord pour être contacté</dt>
                <dd>{c.accord && c.accordLe ? `Oui, ${quand(c.accordLe)}` : 'Non'}</dd>
                {c.note && (
                  <>
                    <dt>Ce qui a été dit</dt>
                    <dd>{c.note}</dd>
                  </>
                )}
                <dt>Notée par</dt>
                <dd>{c.source === 'administration' ? 'L’administration' : 'Le relais'}</dd>
              </dl>
              {aEffacer === c.id ? (
                <span className="admin-actions">
                  <button
                    type="button"
                    className="bouton bouton-petit admin-bouton-refus"
                    onClick={() => void effacer(c)}
                  >
                    Confirmer : effacer le contact (droit d'effacement)
                  </button>
                  <button
                    type="button"
                    className="bouton bouton-secondaire bouton-petit"
                    onClick={() => setAEffacer(null)}
                  >
                    Annuler
                  </button>
                </span>
              ) : (
                <span className="admin-actions">
                  <button
                    type="button"
                    className="lien"
                    onClick={() => setEdition({ mode: 'correction', contact: c })}
                  >
                    Corriger cette personne
                  </button>
                  <button type="button" className="lien" onClick={() => setAEffacer(c.id)}>
                    {plusieurs
                      ? `Effacer le contact de ${libellePersonne(c)} (droit d'effacement)`
                      : "Effacer le contact (droit d'effacement)"}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {edition ? (
        <FormulairePersonne
          // Une autre personne, un autre formulaire : rien ne reste de la précédente.
          key={edition.mode === 'correction' ? edition.contact.id : 'ajout'}
          nom={edition.mode === 'correction' ? 'Corriger la personne' : 'Nouvelle personne'}
          depart={
            edition.mode === 'correction' ? versPersonneSaisie(edition.contact) : personneVide()
          }
          enregistrer={enregistrer}
          annuler={() => setEdition(null)}
          surErreur={surErreur}
        />
      ) : peutAjouterUnePersonne(personnes.length) ? (
        <button
          type="button"
          className="bouton bouton-secondaire bouton-petit"
          onClick={() => setEdition({ mode: 'ajout' })}
        >
          Ajouter une personne
        </button>
      ) : (
        <p className="mention">Trois personnes au plus par fiche.</p>
      )}
    </section>
  );
}

function FormulairePersonne({
  nom,
  depart,
  enregistrer,
  annuler,
  surErreur,
}: {
  nom: string;
  depart: PersonneSaisie;
  enregistrer: (saisie: PersonneSaisie) => Promise<void>;
  annuler: () => void;
  surErreur: (texte: string | null) => void;
}) {
  const [saisie, setSaisie] = useState<PersonneSaisie>(depart);
  const [erreurs, setErreurs] = useState<Partial<Record<string, string>>>({});
  const [enCours, setEnCours] = useState(false);
  const change = (champs: Partial<PersonneSaisie>) => setSaisie((s) => ({ ...s, ...champs }));

  const envoyer = async (ev: { preventDefault: () => void }) => {
    ev.preventDefault();
    const trouvees = erreursPersonne(saisie);
    setErreurs(trouvees);
    if (Object.keys(trouvees).length > 0) return;
    setEnCours(true);
    try {
      await enregistrer(saisie);
    } catch (e) {
      surErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form
      className="admin-motif pile-serree"
      aria-label={nom}
      onSubmit={(ev) => void envoyer(ev)}
      noValidate
    >
      <Champ libelle="Fonction" erreur={erreurs['fonction']}>
        {(a) => (
          <select
            {...a}
            className="champ"
            value={saisie.fonction ?? ''}
            onChange={(ev) =>
              change({ fonction: (ev.target.value || null) as Valeur<'fonction_direction'> | null })
            }
          >
            <option value="">Choisir…</option>
            {listes.fonction_direction.map((f) => (
              <option key={f} value={f}>
                {libelleFonction[f]}
              </option>
            ))}
          </select>
        )}
      </Champ>
      {saisie.fonction === 'autre' && (
        <Champ libelle="Précision de la fonction" facultatif erreur={erreurs['precision']}>
          {(a) => (
            <input
              {...a}
              className="champ"
              type="text"
              maxLength={200}
              autoComplete="off"
              value={saisie.precision}
              onChange={(ev) => change({ precision: ev.target.value })}
            />
          )}
        </Champ>
      )}
      <Champ libelle="Nom" facultatif erreur={erreurs['nom']}>
        {(a) => (
          <input
            {...a}
            className="champ"
            type="text"
            autoComplete="off"
            value={saisie.nom}
            onChange={(ev) => change({ nom: ev.target.value })}
          />
        )}
      </Champ>
      <Champ libelle="WhatsApp" facultatif erreur={erreurs['whatsapp']}>
        {(a) => (
          <input
            {...a}
            className="champ"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={saisie.whatsapp}
            onChange={(ev) => change({ whatsapp: ev.target.value })}
          />
        )}
      </Champ>
      <label className="case">
        <input
          type="checkbox"
          checked={saisie.accord}
          onChange={(ev) => change({ accord: ev.target.checked })}
        />
        La personne accepte que NTanova lui écrive sur WhatsApp
      </label>
      <Champ libelle="Note" facultatif erreur={erreurs['note']}>
        {(a) => (
          <input
            {...a}
            className="champ"
            type="text"
            autoComplete="off"
            value={saisie.note}
            onChange={(ev) => change({ note: ev.target.value })}
          />
        )}
      </Champ>
      <div className="admin-actions admin-pleine-largeur">
        <button type="submit" className="bouton bouton-petit" disabled={enCours}>
          Enregistrer
        </button>
        <button type="button" className="bouton bouton-secondaire bouton-petit" onClick={annuler}>
          Annuler
        </button>
      </div>
    </form>
  );
}
