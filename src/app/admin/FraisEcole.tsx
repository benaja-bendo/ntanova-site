import { useEffect, useState } from 'react';
import { jourDuCongo } from '../../modele/date-declaration';
import {
  avecMemeInscription,
  francsCFA,
  inscriptionLaPlusFrequente,
  lireMontant,
  lireFraisEcole,
  saisieFraisVide,
  saisieDeFrais,
  montantFrais,
  periodesFrais,
  type FraisEcole as Frais,
  type SaisieFrais,
} from '../../modele/frais-ecole';
import { libelleNiveau } from '../../modele/libelles';
import type { Valeur } from '../../modele/listes';
import type { PhotoVue, PortAdministration } from '../../modele/ports';
import { Bandeau, jour } from '../../ui/composants';
import { Dialogue } from '../../ui/Dialogue';
import { messageErreur } from './ChampPosition';
export function FraisEcole({
  ecoleId,
  nom,
  cycles,
  frais,
  admin,
  fermer,
  integre = false,
  surOccupation,
  surChangement,
}: {
  ecoleId: string;
  nom: string;
  cycles: Valeur<'niveau'>[];
  frais: Frais[];
  admin: PortAdministration;
  fermer: () => void;
  integre?: boolean;
  surOccupation?: (occupe: boolean) => void;
  surChangement: (texte: string) => void;
}) {
  const [saisie, setSaisie] = useState(saisieFraisVide);
  const [id, setId] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    surOccupation?.(enCours);
    return () => surOccupation?.(false);
  }, [enCours, surOccupation]);
  const champ = (cle: keyof SaisieFrais, valeur: string | boolean | null) =>
    setSaisie((s) => ({ ...s, [cle]: valeur }));
  // v2 (13/11) : le prospectus photographié par un relais, à côté du formulaire. Photo de travail : jamais publique ; seules
  // les lignes recopiées le sont.
  const [prospectus, setProspectus] = useState<PhotoVue[] | null>(null);
  const [vue, setVue] = useState(0);
  useEffect(() => {
    let vivant = true;
    void admin
      .photosDeTravail(ecoleId)
      .then((p) => vivant && setProspectus(p.filter((x) => x.role === 'brochure')))
      .catch(() => vivant && setProspectus([]));
    return () => {
      vivant = false;
    };
  }, [admin, ecoleId]);
  const photo = prospectus?.[vue] ?? null;
  // « Illisible » : la ligne n'est pas enregistrée ; elle devient un manque précisé, demandé à l'école.
  const illisible = async () => {
    const quoi =
      (saisie.classe ?? '').trim() ||
      (saisie.cycle ? libelleNiveau[saisie.cycle as Valeur<'niveau'>] : '');
    if (!quoi) return setErreur('Choisis le cycle (ou écris la classe) de la ligne illisible.');
    setEnCours(true);
    setErreur(null);
    try {
      await admin.demanderALEcole(ecoleId, 'frais', `Frais ${quoi}, illisible sur le prospectus`);
      setSaisie(saisieFraisVide());
      surChangement(`« Frais ${quoi} » s’ajoute à ce qui manque : demandé à l’école.`);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };
  const sauver = async () => {
    const resultat = lireFraisEcole(saisie);
    if (!resultat.frais) {
      setErreur(resultat.erreur);
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await admin.enregistrerFraisEcole(ecoleId, resultat.frais, id);
      setId(null);
      setSaisie(saisieFraisVide());
      surChangement(
        `Les frais déclarés de ${nom} sont enregistrés. Reconstruis le site pour publier ce changement.`,
      );
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };
  const retirer = async (f: Frais) => {
    setEnCours(true);
    setErreur(null);
    try {
      await admin.retirerFraisEcole(ecoleId, f.id);
      if (id === f.id) {
        setId(null);
        setSaisie(saisieFraisVide());
      }
      surChangement(
        `Les frais déclarés de ${nom} sont retirés du catalogue. Reconstruis le site pour les retirer des pages en ligne ; leur historique est conservé.`,
      );
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };
  return (
    <Dialogue titre={`Frais de ${nom}`} fermer={fermer} integre={integre}>
      <h3>Frais déclarés par l’école</h3>
      <p>
        Saisis les montants et la période communiqués par l’école. Pas de calcul automatique d’un
        total annuel, ni de badge de confirmation.
      </p>
      {frais.length > 0 && (
        <ul className="admin-frais-liste">
          {frais.map((f) => (
            <li key={f.id}>
              <b>
                {libelleNiveau[f.cycle]}
                {f.classe ? ` · ${f.classe}` : ''} · {montantFrais(f)}
              </b>
              <p>
                {f.periode === 'autre' ? f.precisionPeriode : periodesFrais[f.periode]} ·{' '}
                {f.anneeScolaire ?? 'Année scolaire non précisée'} · déclaration du{' '}
                {jour(f.declaresLe)}
              </p>
              <button
                type="button"
                className="bouton bouton-secondaire"
                disabled={enCours}
                aria-label={`Modifier les frais de ${libelleNiveau[f.cycle]} · ${f.precisionPeriode ?? periodesFrais[f.periode]} · ${f.anneeScolaire ?? 'année non précisée'}`}
                onClick={() => {
                  setId(f.id);
                  setSaisie(saisieDeFrais(f));
                  setErreur(null);
                }}
              >
                Modifier les frais de {libelleNiveau[f.cycle]}
              </button>
              <button
                type="button"
                className="bouton bouton-secondaire"
                disabled={enCours}
                aria-label={`Retirer les frais de ${libelleNiveau[f.cycle]} · ${f.precisionPeriode ?? periodesFrais[f.periode]} · ${f.anneeScolaire ?? 'année non précisée'}`}
                onClick={() => void retirer(f)}
              >
                Retirer les frais de {libelleNiveau[f.cycle]}
              </button>
            </li>
          ))}
        </ul>
      )}
      {frais.length >= 2 && (
        <MemeInscription
          frais={frais}
          enCours={enCours}
          appliquer={async (montant) => {
            const aChanger = avecMemeInscription(frais, montant);
            if (aChanger.length === 0)
              return surChangement(
                `Toutes les lignes ont déjà ${francsCFA(montant)} d’inscription.`,
              );
            setEnCours(true);
            setErreur(null);
            try {
              // Une ligne à la fois : chacune garde sa preuve, sa formation et sa date ; la base trace chaque modification.
              for (const f of aChanger) await admin.enregistrerFraisEcole(ecoleId, f, f.id);
              surChangement(
                `Inscription de ${francsCFA(montant)} sur ${aChanger.length} ligne${aChanger.length > 1 ? 's' : ''}. Reconstruis le site pour publier ce changement.`,
              );
            } catch (e) {
              setErreur(messageErreur(e));
            } finally {
              setEnCours(false);
            }
          }}
        />
      )}
      {cycles.length === 0 ? (
        <p>
          Renseigne d’abord les cycles enseignés dans « Modifier la fiche » pour ajouter des frais.
        </p>
      ) : (
        <form
          className="admin-motif"
          aria-label={`Frais déclarés de ${nom}`}
          onSubmit={(e) => {
            e.preventDefault();
            void sauver();
          }}
        >
          <h4>{id ? 'Modifier la déclaration' : 'Ajouter une déclaration'}</h4>
          {prospectus && prospectus.length > 0 && photo && (
            <figure className="admin-prospectus">
              {photo.adresse && (
                <img src={photo.adresse} alt="Le prospectus des frais, pris par un relais" />
              )}
              <figcaption className="mention">
                Prospectus · photo de travail, jamais publique
                {prospectus.length > 1 && (
                  <>
                    {' '}
                    ·{' '}
                    <button
                      type="button"
                      className="lien"
                      onClick={() => setVue((vue + 1) % prospectus.length)}
                    >
                      Photo suivante ({vue + 1} sur {prospectus.length})
                    </button>
                  </>
                )}
              </figcaption>
              <label className="case">
                <input
                  type="checkbox"
                  checked={saisie.photoPreuve === photo.id}
                  onChange={(e) => champ('photoPreuve', e.target.checked ? photo.id : null)}
                />
                Ligne lue sur ce prospectus
              </label>
            </figure>
          )}
          {prospectus && prospectus.length === 0 && (
            <p className="mention">
              Pas de prospectus photographié : la ligne se publie « dite par l’école », avec sa
              date.
            </p>
          )}
          <label className="champ-groupe">
            Cycle
            <select
              className="champ"
              value={saisie.cycle}
              onChange={(e) => champ('cycle', e.target.value)}
            >
              <option value="">Choisir</option>
              {cycles.map((c) => (
                <option key={c} value={c}>
                  {libelleNiveau[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="champ-groupe">
            Classe (facultatif)
            <input
              className="champ"
              maxLength={40}
              placeholder="Ex. : CP1 à CM2, 3e"
              value={saisie.classe ?? ''}
              onChange={(e) => champ('classe', e.target.value)}
            />
          </label>
          <label className="champ-groupe">
            Montant minimum ou unique (FCFA)
            <input
              className="champ"
              inputMode="numeric"
              value={saisie.minimum}
              onChange={(e) => champ('minimum', e.target.value)}
            />
          </label>
          <label className="champ-groupe">
            Maximum si fourchette (facultatif, FCFA)
            <input
              className="champ"
              inputMode="numeric"
              value={saisie.maximum}
              onChange={(e) => champ('maximum', e.target.value)}
            />
          </label>
          <label className="champ-groupe">
            Période
            <select
              className="champ"
              value={saisie.periode}
              onChange={(e) => champ('periode', e.target.value)}
            >
              <option value="">Choisir</option>
              {Object.entries(periodesFrais).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {saisie.periode === 'autre' && (
            <label className="champ-groupe">
              Préciser la période
              <input
                className="champ"
                maxLength={80}
                value={saisie.precisionPeriode}
                onChange={(e) => champ('precisionPeriode', e.target.value)}
              />
            </label>
          )}
          <label className="champ-groupe">
            Frais d’inscription (facultatif, FCFA)
            <input
              className="champ"
              inputMode="numeric"
              value={saisie.inscription}
              onChange={(e) => champ('inscription', e.target.value)}
            />
          </label>
          <label className="champ-groupe">
            Année scolaire (facultatif)
            <input
              className="champ"
              maxLength={30}
              placeholder="Par exemple 2026-2027"
              value={saisie.anneeScolaire}
              onChange={(e) => champ('anneeScolaire', e.target.value)}
            />
          </label>
          <label className="champ-groupe">
            Date de déclaration
            <input
              className="champ"
              type="date"
              max={jourDuCongo()}
              value={saisie.declaresLe}
              onChange={(e) => champ('declaresLe', e.target.value)}
            />
          </label>
          <label className="champ-groupe">
            Précision communiquée par l’école (facultatif)
            <textarea
              className="champ"
              maxLength={300}
              value={saisie.note}
              onChange={(e) => champ('note', e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={saisie.declarationConfirmee}
              onChange={(e) => champ('declarationConfirmee', e.target.checked)}
            />{' '}
            Ces frais ont été communiqués par l’école pour être affichés.
          </label>
          <button type="submit" className="bouton" disabled={enCours}>
            {enCours ? 'Enregistrement…' : 'Enregistrer les frais'}
          </button>
          {id && (
            <button
              type="button"
              className="bouton bouton-secondaire"
              onClick={() => {
                setId(null);
                setSaisie(saisieFraisVide());
              }}
            >
              Annuler la modification
            </button>
          )}
          {!id && (
            <button
              type="button"
              className="bouton bouton-secondaire"
              disabled={enCours}
              onClick={() => void illisible()}
            >
              Illisible : la demander à l’école
            </button>
          )}
          <p className="mention">
            Une ligne illisible n’est jamais publiée : elle s’ajoute à ce qui manque.
          </p>
        </form>
      )}
      {erreur && (
        <Bandeau ton="erreur" icone="alerte">
          {erreur}
        </Bandeau>
      )}
      <p className="mention">
        Une donnée non communiquée reste vide ; zéro n’est saisi que si l’école l’a déclaré. La
        modification et le retrait sont tracés et nécessitent une reconstruction du site.
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

/**
 * Lot I (planche « Frais par classe ») : « Même inscription sur toutes les lignes ». Un prospectus donne souvent une seule
 * inscription pour plusieurs classes : on la pose partout en un geste, préremplie avec la plus fréquente.
 */
function MemeInscription({
  frais,
  enCours,
  appliquer,
}: {
  frais: Frais[];
  enCours: boolean;
  appliquer: (montant: number) => Promise<void>;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  if (!ouvert)
    return (
      <button
        type="button"
        className="bouton bouton-secondaire"
        disabled={enCours}
        onClick={() => {
          const m = inscriptionLaPlusFrequente(frais);
          setSaisie(m === null ? '' : String(m));
          setErreur(null);
          setOuvert(true);
        }}
      >
        Même inscription sur toutes les lignes
      </button>
    );
  return (
    <form
      className="admin-motif"
      aria-label="Même inscription sur toutes les lignes"
      onSubmit={(e) => {
        e.preventDefault();
        const montant = lireMontant(saisie);
        if (montant === null) return setErreur('Indique un montant entier en FCFA.');
        void appliquer(montant).then(() => setOuvert(false));
      }}
    >
      <label className="champ-groupe">
        Inscription pour les {frais.length} lignes (FCFA)
        <input
          className="champ"
          inputMode="numeric"
          value={saisie}
          onChange={(e) => {
            setSaisie(e.target.value);
            setErreur(null);
          }}
        />
      </label>
      {erreur && <p className="message-erreur">{erreur}</p>}
      <div className="admin-actions">
        <button type="submit" className="bouton" disabled={enCours}>
          {enCours ? 'Enregistrement…' : 'Appliquer à toutes les lignes'}
        </button>
        <button type="button" className="lien" onClick={() => setOuvert(false)}>
          Annuler
        </button>
      </div>
    </form>
  );
}
