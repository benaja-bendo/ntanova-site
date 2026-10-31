import { useCallback, useEffect, useState } from 'react';
import { listes, type Valeur } from '../../modele/listes';
import {
  libelleFonction,
  libelleMotif,
  libelleNiveau,
  libelleTypeEcole,
} from '../../modele/libelles';
import {
  ErreurDecision,
  type ContactDirection,
  type DetailReleve,
  type PortAdministration,
  type ReleveAValider,
} from '../../modele/ports';
import { afficherTelephone } from '../../modele/telephone';
import { Bandeau, Champ, Icone, jour, quand } from '../../ui/composants';
import { aller, useAdresse } from '../commun/adresse';

type Filtre = 'tout' | 'releve' | 'correction' | 'contre_visite';

const libelleType: Record<ReleveAValider['type'], string> = {
  releve: 'Nouvelle fiche',
  correction: 'Correction',
  contre_visite: 'Contre-visite',
};

const messageErreur = (e: unknown) =>
  e instanceof ErreurDecision ? e.message : 'La base ne répond pas. Vérifie le réseau et réessaie.';

function Etiquettes({ r }: { r: ReleveAValider }) {
  return (
    <span className="admin-etiquettes">
      {r.essai && <span className="etiquette etat-telephone">Lot d'essai</span>}
      {r.horsLot && !r.essai && <span className="etiquette etat-refusee">Hors du lot</span>}
      {r.doublonPossible && <span className="etiquette etat-attente">Doublon possible</span>}
      {!r.photoRecue && <span className="etiquette etat-telephone">Photo pas encore reçue</span>}
    </span>
  );
}

export function AValider({
  admin,
  surCompte,
}: {
  admin: PortAdministration;
  surCompte: (n: number) => void;
}) {
  const [, choisi] = useAdresse();
  const [releves, setReleves] = useState<ReleveAValider[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('tout');
  const [annonce, setAnnonce] = useState<string | null>(null);

  const charger = useCallback(() => {
    admin
      .relevesAValider()
      .then((r) => {
        setReleves(r);
        setErreur(null);
        surCompte(r.length);
      })
      .catch((e: unknown) => setErreur(messageErreur(e)));
  }, [admin, surCompte]);

  useEffect(() => {
    charger();
  }, [charger]);

  const visibles = (releves ?? []).filter((r) => filtre === 'tout' || r.type === filtre);
  const selection = visibles.find((r) => r.id === choisi) ?? null;

  const apresDecision = (texte: string) => {
    setAnnonce(texte);
    const suivant = visibles.find((r) => r.id !== choisi);
    aller(suivant ? `valider/${suivant.id}` : 'valider', true);
    charger();
  };

  return (
    <div className="pile">
      <div className="admin-titre">
        <div>
          <h1>À valider</h1>
          <p className="texte-doux">
            {releves === null
              ? 'Chargement…'
              : `${releves.length} envoi${releves.length > 1 ? 's' : ''} des relais. Rien n'est publié avant ton accord.`}
          </p>
        </div>
        <div className="filtres" role="group" aria-label="Filtrer">
          {(
            [
              ['tout', 'Tout'],
              ['releve', 'Nouvelles fiches'],
              ['correction', 'Corrections'],
              ['contre_visite', 'Contre-visites'],
            ] as const
          ).map(([valeur, libelle]) => (
            <button
              key={valeur}
              type="button"
              className="pastille-choix"
              aria-pressed={filtre === valeur}
              onClick={() => setFiltre(valeur)}
            >
              {libelle}
            </button>
          ))}
        </div>
      </div>

      {erreur && (
        <Bandeau ton="erreur" icone="alerte">
          <p>{erreur}</p>
        </Bandeau>
      )}
      {annonce && (
        <p className="bandeau bandeau-envoye" role="status">
          <Icone nom="coche" />
          {annonce}
        </p>
      )}

      <div className={`admin-file${selection ? ' avec-selection' : ''}`}>
        <ul className="admin-liste" aria-label="Envois à valider">
          {releves !== null && visibles.length === 0 && (
            <li className="texte-doux">Rien à valider pour le moment.</li>
          )}
          {visibles.map((r) => (
            <li key={r.id}>
              <a
                href={`#valider/${r.id}`}
                className="admin-ligne"
                aria-current={r.id === choisi ? 'true' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  setAnnonce(null);
                  aller(`valider/${r.id}`);
                }}
              >
                <span className="admin-ligne-tete">
                  <b>{r.nomEnseigne}</b>
                  <span className="mention">{jour(r.recuLe)}</span>
                </span>
                <span className="mention">
                  {libelleType[r.type]} · {r.relais}
                  {r.lot ? ` · Lot ${r.lot}` : ''}
                </span>
                <Etiquettes r={r} />
              </a>
            </li>
          ))}
        </ul>

        {selection && (
          <Detail key={selection.id} admin={admin} ligne={selection} surDecision={apresDecision} />
        )}
      </div>
    </div>
  );
}

function Detail({
  admin,
  ligne,
  surDecision,
}: {
  admin: PortAdministration;
  ligne: ReleveAValider;
  surDecision: (texte: string) => void;
}) {
  const [detail, setDetail] = useState<DetailReleve | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [contact, setContact] = useState<ContactDirection | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [mode, setMode] = useState<'correction' | 'refus' | null>(null);
  const [motif, setMotif] = useState<Valeur<'motif_decision'>>('photo_floue');
  const [message, setMessage] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [contactConfirme, setContactConfirme] = useState(false);

  useEffect(() => {
    Promise.all([
      admin.detailReleve(ligne.id),
      admin.photoReleve(ligne.id),
      admin.contactReleve(ligne.id),
    ])
      .then(([d, p, c]) => {
        setDetail(d);
        setPhoto(p);
        setContact(c);
      })
      .catch((e: unknown) => setErreur(messageErreur(e)));
  }, [admin, ligne.id]);

  const agir = async (action: () => Promise<unknown>, texte: string) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      surDecision(texte);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  const confirmer = async (fonction: Valeur<'fonction_direction'>) => {
    setErreur(null);
    try {
      await admin.confirmerContact(ligne.id, fonction);
      setContactConfirme(true);
    } catch (e) {
      setErreur(messageErreur(e));
    }
  };

  if (!detail) {
    return (
      <section className="admin-detail" aria-busy={!erreur}>
        {erreur ? <p className="message-erreur">{erreur}</p> : <p>Chargement…</p>}
      </section>
    );
  }

  const position = detail.position;
  // Sur le lot d'entraînement, « hors du lot » ne veut rien dire.
  const horsLot = detail.essai ? null : detail.horsLot;
  const memeEcole = detail.reponseDoublon === 'la_meme' && detail.doublonDe;

  return (
    <section className="admin-detail" aria-label="Envoi sélectionné">
      <div className="admin-titre">
        <div>
          <h2>{detail.nomEnseigne}</h2>
          <p className="mention">
            Relevée par {detail.relais} {quand(detail.prisLe)}
            {detail.lot ? ` · Lot ${detail.lot}` : ''}
          </p>
        </div>
        <span className="etiquette etat-attente">{libelleType[detail.type]}</span>
      </div>

      <div className="admin-deux">
        <figure className="admin-figure">
          {photo ? (
            <img src={photo} alt={`L'enseigne de ${detail.nomEnseigne}`} />
          ) : (
            <div className="apercu-vide">Photo pas encore reçue</div>
          )}
          <figcaption className="mention">
            Photo de l'enseigne. Nette, cadrée, sans enfant&nbsp;?
          </figcaption>
        </figure>
        <div className="pile-serree">
          <p className="rang">
            <Icone nom={horsLot ? 'alerte' : 'coche'} taille={16} />
            <span>
              <b>
                {position === null
                  ? 'Sans position'
                  : horsLot
                    ? 'Hors du lot'
                    : horsLot === false
                      ? 'Dans le lot'
                      : 'Position prise'}
              </b>
              {detail.precisionM !== null && ` · précision ${Math.round(detail.precisionM)} m`}
            </span>
          </p>
          {position && (
            <a
              className="lien"
              href={`https://www.openstreetmap.org/?mlat=${position.latitude}&mlon=${position.longitude}#map=18/${position.latitude}/${position.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Voir sur OpenStreetMap
            </a>
          )}
          {detail.doublonPossible && (
            <Bandeau ton="attente" icone="alerte">
              <p>
                <b>Une école est déjà relevée à 40&nbsp;m</b>
                {detail.doublonDe ? <>&nbsp;: {detail.doublonDe.nom}</> : null}. Le relais a répondu
                «&nbsp;
                {detail.reponseDoublon === 'la_meme'
                  ? 'la même école'
                  : detail.reponseDoublon === 'une_autre'
                    ? 'une autre école'
                    : 'sans réponse'}
                &nbsp;».
              </p>
            </Bandeau>
          )}
        </div>
      </div>

      <section className="pile-serree" aria-label="Partie publique">
        <h3 className="rang">
          <Icone nom="oeil" />
          Public : ce qui se voit de la rue
        </h3>
        <dl className="admin-champs">
          <dt>Nom sur l'enseigne</dt>
          <dd>{detail.nomEnseigne}</dd>
          <dt>Type</dt>
          <dd>{libelleTypeEcole[detail.typeEcole]}</dd>
          <dt>Niveaux</dt>
          <dd>{detail.niveaux.map((n) => libelleNiveau[n]).join(', ') || '—'}</dd>
          <dt>Repère</dt>
          <dd>{detail.repere ?? '—'}</dd>
          <dt>Numéro sur l'enseigne</dt>
          <dd>{detail.numeroEnseigne ? afficherTelephone(detail.numeroEnseigne) : '—'}</dd>
        </dl>
      </section>

      <section className="admin-prive pile-serree" aria-label="Partie privée">
        <h3 className="rang">
          <Icone nom="cadenas" />
          Privé : la direction
        </h3>
        {detail.direction === 'absente' && (
          <p>Direction absente{detail.repasser ? ` · à repasser : ${detail.repasser}` : ''}.</p>
        )}
        {detail.direction === null && <p>Le relais n'a rien dit de la direction.</p>}
        {(detail.direction === 'vue' || detail.direction === 'refus') && !contact && (
          <p>Contact pas encore reçu.</p>
        )}
        {contact && (
          <>
            {detail.direction === 'refus' && <p>La direction a refusé.</p>}
            <dl className="admin-champs">
              {contact.fonction && (
                <>
                  <dt>Fonction</dt>
                  <dd>{libelleFonction[contact.fonction]}</dd>
                </>
              )}
              {contact.nom && (
                <>
                  <dt>Nom</dt>
                  <dd>{contact.nom}</dd>
                </>
              )}
              <dt>WhatsApp</dt>
              <dd>{contact.whatsapp ? afficherTelephone(contact.whatsapp) : '—'}</dd>
              <dt>Accord pour être contacté</dt>
              <dd>
                {contact.accord && contact.accordLe ? `Oui, ${quand(contact.accordLe)}` : 'Non'}
              </dd>
              {contact.note && (
                <>
                  <dt>Ce qui a été dit</dt>
                  <dd>{contact.note}</dd>
                </>
              )}
            </dl>
            <div className="admin-actions">
              {contact.whatsapp && contact.accord && (
                <a
                  className="bouton bouton-petit admin-bouton-accent"
                  href={`https://wa.me/${contact.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Écrire sur WhatsApp
                </a>
              )}
              {contact.fonction &&
                (detail.contactConfirmeLe || contactConfirme ? (
                  <span className="etiquette etat-verifiee">Fonction confirmée</span>
                ) : (
                  <button
                    type="button"
                    className="bouton bouton-secondaire bouton-petit"
                    onClick={() => contact.fonction && void confirmer(contact.fonction)}
                  >
                    Confirmer sa fonction
                  </button>
                ))}
            </div>
          </>
        )}
      </section>

      {erreur && (
        <p className="message-erreur" role="alert">
          {erreur}
        </p>
      )}

      <div className="admin-decision pile">
        {detail.essai && (
          <Bandeau ton="attente" icone="alerte">
            <p>
              <b>Lot d'entraînement</b> : cette fiche ne sera jamais publiée. Demande une correction
              pour entraîner le relais, ou refuse-la.
            </p>
          </Bandeau>
        )}
        <div className="admin-actions">
          {!detail.essai &&
            (memeEcole && detail.doublonDe ? (
              <>
                <button
                  type="button"
                  className="bouton"
                  disabled={enCours}
                  onClick={() =>
                    void agir(
                      () => admin.accepter(ligne.id, detail.doublonDe?.id),
                      `${detail.doublonDe?.nom} est mise à jour.`,
                    )
                  }
                >
                  {detail.type === 'contre_visite' ? 'Situer et publier' : 'Mettre à jour'}{' '}
                  {detail.doublonDe.nom}
                </button>
                <button
                  type="button"
                  className="bouton bouton-secondaire"
                  disabled={enCours}
                  onClick={() => void agir(() => admin.accepter(ligne.id), 'La fiche est publiée.')}
                >
                  Publier comme une autre école
                </button>
              </>
            ) : (
              <button
                type="button"
                className="bouton"
                disabled={enCours}
                onClick={() => void agir(() => admin.accepter(ligne.id), 'La fiche est publiée.')}
              >
                Accepter et publier la fiche relevée
              </button>
            ))}
          <button
            type="button"
            className="bouton bouton-secondaire"
            aria-expanded={mode === 'correction'}
            onClick={() => setMode(mode === 'correction' ? null : 'correction')}
          >
            Demander une correction
          </button>
          <button
            type="button"
            className="bouton bouton-secondaire admin-bouton-refus"
            aria-expanded={mode === 'refus'}
            onClick={() => {
              setMode(mode === 'refus' ? null : 'refus');
              setMotif('autre');
            }}
          >
            Refuser
          </button>
        </div>

        {mode && (
          <form
            className="admin-motif"
            onSubmit={(e) => {
              e.preventDefault();
              const texte = message.trim() || null;
              void agir(
                () =>
                  mode === 'correction'
                    ? admin.demanderCorrection(ligne.id, motif, texte)
                    : admin.refuser(ligne.id, motif, texte),
                mode === 'correction'
                  ? 'La demande de correction part au relais.'
                  : 'La fiche est refusée.',
              );
            }}
          >
            <Champ libelle="Motif">
              {(a) => (
                <select
                  {...a}
                  className="champ"
                  value={motif}
                  onChange={(e) => setMotif(e.target.value as Valeur<'motif_decision'>)}
                >
                  {listes.motif_decision.map((m) => (
                    <option key={m} value={m}>
                      {libelleMotif[m]}
                    </option>
                  ))}
                </select>
              )}
            </Champ>
            <Champ
              libelle="Message au relais"
              facultatif
              aide="Le relais le lit dans « Mes fiches ». Vouvoie-le."
            >
              {(a) => (
                <textarea
                  {...a}
                  className="champ"
                  rows={2}
                  maxLength={500}
                  placeholder="Ex. : la photo est floue, reprenez-la de face."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              )}
            </Champ>
            <button type="submit" className="bouton" disabled={enCours}>
              {mode === 'correction' ? 'Envoyer la demande' : 'Refuser la fiche'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
