import { CorrectionAvantAcceptation } from './CorrectionAvantAcceptation';
import { useCallback, useEffect, useState } from 'react';
import { cycleAvecFormations } from '../../modele/formations';
import {
  avantDAccepter,
  ceQuiManqueDuNumero,
  ceQuiManquePourAccepter,
  numeroAConfirmer,
  numeroPeutEtreRetire,
  peutSaisirLaPosition,
  type ChoixNumero,
  divisionRequise as divisionRequisePour,
  type Cible,
  type EtatDeLaLigne,
  type PositionSaisie,
} from '../../modele/acceptation';
import { arrondissementDeLaPosition } from '../../modele/carte/plan';
import { lireChampPosition } from '../../modele/correction-ecole';
import { ageDe, trierParAnciennete } from '../../modele/age';
import { peutParaitreSurLeSite } from '../../modele/photos-publiques';
import { messageManquant } from '../../modele/decision';
import {
  compterIndices,
  filtrerFile,
  relaisDeLaFile,
  type IndiceDeFiche,
} from '../../modele/file-validation';
import { cheminLisible } from '../../modele/geo-divisions';
import type { Valeur } from '../../modele/listes';
import {
  libelleMotif,
  libelleNiveau,
  libelleRolePhoto,
  libelleStatutReleve,
  libelleTypeEcole,
  motifsProposes,
} from '../../modele/libelles';
import type {
  CorrectionEcole,
  ContactDirection,
  DecisionAcceptation,
  DetailReleve,
  DivisionVue,
  DomainePublic,
  FormationSaisie,
  InstitutionVue,
  ModeAcceptation,
  PhotoVue,
  PortAdministration,
  ReleveAValider,
  ReleveDecide,
} from '../../modele/ports';
import { ErreurDecision } from '../../modele/ports';
import { Bouton } from '../../ui/actions';
import { Dialogue } from '../../ui/Dialogue';
import { SectionRepliable } from '../../ui/SectionRepliable';
import { afficherTelephone } from '../../modele/telephone';
import { Bandeau, Champ, Choix, Icone, jour, quand } from '../../ui/composants';
import { aller, useAdresse } from '../commun/adresse';
import { SignauxDuRelais } from './Sante';
import { ChampPosition, messageErreur } from './ChampPosition';
import { Formations } from './Formations';
import { Personnes } from './Personnes';
import { Pont } from './Pont';

type Filtre = 'tout' | 'releve' | 'correction' | 'contre_visite' | 'renvoyees' | 'decidees';

const libelleType: Record<ReleveAValider['type'], string> = {
  releve: 'Nouvelle fiche',
  correction: 'Correction',
  contre_visite: 'Contre-visite',
};

const ACCEPTEE =
  'Acceptée : l’école est prête. Publie-la depuis l’onglet « Écoles » (une école, une zone ou un lot).';

/** L'icône de chaque ligne d'« Avant d'accepter » : coché quand c'est prêt, alerte quand quelque chose manque. */
const iconeDeLaLigne: Record<EtatDeLaLigne, 'coche' | 'alerte' | 'fiche'> = {
  ok: 'coche',
  info: 'fiche',
  a_faire: 'alerte',
  bloque: 'alerte',
};

const classeDecision: Record<ReleveDecide['statut'], string> = {
  a_valider: 'etat-attente',
  a_corriger: 'etat-a-corriger',
  accepte: 'etat-verifiee',
  refuse: 'etat-refusee',
};

function Etiquettes({ r }: { r: ReleveAValider }) {
  return (
    <span className="admin-etiquettes">
      {r.essai && <span className="etiquette etat-telephone">Lot d'essai</span>}
      {/* Une information, jamais une alerte : le relais relève où il se trouve (ticket n° 67). */}
      {r.enZoneOuverte === false && !r.essai && (
        <span className="etiquette etat-attente">Hors zone ouverte</span>
      )}
      {r.doublonPossible && <span className="etiquette etat-attente">Doublon possible</span>}
      {!r.enseigneRecue && (
        <span className="etiquette etat-telephone">
          {/* Une correction ou une contre-visite peut se passer de photo : NTanova a déjà celle de l'école. */}
          {r.type === 'releve' ? 'Photo pas encore reçue' : 'Pas de nouvelle photo'}
        </span>
      )}
      {r.photos > 1 && <span className="etiquette etat-envoye">{r.photos} photos</span>}
      {r.indiceFormations && <span className="etiquette etat-a-corriger">Formations à saisir</span>}
    </span>
  );
}

/** Depuis quand la fiche attend ; au-delà de 24 heures, elle se voit (ticket #76). */
function AgeDeLaFiche({ age }: { age: ReturnType<typeof ageDe> }) {
  return age.ancienne ? (
    <span className="etiquette etat-attente">{age.texte}</span>
  ) : (
    <span className="mention">{age.texte}</span>
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
  const [decides, setDecides] = useState<ReleveDecide[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('tout');
  const [relaisChoisi, setRelaisChoisi] = useState<string | null>(null);
  const [indice, setIndice] = useState<IndiceDeFiche | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);

  const charger = useCallback(() => {
    Promise.all([admin.relevesAValider(), admin.relevesDecides()])
      .then(([r, d]) => {
        setReleves(r);
        setDecides(d);
        setErreur(null);
        surCompte(r.length);
      })
      .catch((e: unknown) => setErreur(messageErreur(e)));
  }, [admin, surCompte]);

  useEffect(() => {
    charger();
  }, [charger]);

  // La plus ancienne d'abord : la promesse faite aux relais est une validation sous 24 à 48 heures (ticket #76).
  const typeFiltre =
    filtre === 'releve' || filtre === 'correction' || filtre === 'contre_visite' ? filtre : 'tout';
  // Les relais et les indices se comptent sur la file entière : choisir un relais ne vide pas la liste des relais.
  const relaisProposes = relaisDeLaFile(releves ?? []);
  // Un relais dont toutes les fiches viennent d'être décidées n'est plus un choix : on retombe sur « Tous les relais ».
  const relaisActif = relaisProposes.some((r) => r.relais === relaisChoisi) ? relaisChoisi : null;
  const visibles = trierParAnciennete(
    filtrerFile(releves ?? [], { type: typeFiltre, relais: relaisActif, indice }),
  );
  const indices = compterIndices(releves ?? []);
  const maintenant = new Date();
  // « Renvoyées » : les fiches qui attendent leur relais, sorties de la file (ticket #92). Comme « Décidées », en lecture seule.
  const surLesDecidees = filtre === 'decidees' || filtre === 'renvoyees';
  const decidesVisibles =
    filtre === 'renvoyees'
      ? (decides ?? []).filter((r) => r.statut === 'a_corriger')
      : (decides ?? []);
  const selection = surLesDecidees
    ? (decidesVisibles.find((r) => r.id === choisi) ?? null)
    : (visibles.find((r) => r.id === choisi) ?? null);

  const apresDecision = (texte: string) => {
    setAnnonce(texte);
    // Seulement si l'on est encore sur « À valider » : un autre onglet ouvert entre-temps reste ouvert.
    if (location.hash.startsWith('#valider')) {
      const suivant = visibles.find((r) => r.id !== choisi);
      aller(suivant ? `valider/${suivant.id}` : 'valider', true);
    }
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
              ['renvoyees', 'Renvoyées'],
              ['decidees', 'Décidées'],
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

      {!surLesDecidees &&
        releves !== null &&
        (relaisProposes.length > 1 || indices.sansPosition > 0 || indices.doublonPossible > 0) && (
          <div className="admin-affiner" role="group" aria-label="Affiner la file">
            {relaisProposes.length > 1 && (
              <label className="admin-affiner-relais">
                <span className="mention">Relais</span>
                <select
                  className="champ"
                  value={relaisActif ?? ''}
                  onChange={(e) => setRelaisChoisi(e.target.value || null)}
                >
                  <option value="">Tous les relais</option>
                  {relaisProposes.map((r) => (
                    <option key={r.relais} value={r.relais}>
                      {r.relais} · {r.fiches}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(
              [
                ['sans_position', 'Sans position', indices.sansPosition],
                ['doublon_possible', 'Doublon possible', indices.doublonPossible],
              ] as const
            ).map(
              ([valeur, libelle, n]) =>
                (n > 0 || indice === valeur) && (
                  <button
                    key={valeur}
                    type="button"
                    className="pastille-choix"
                    aria-pressed={indice === valeur}
                    onClick={() => setIndice(indice === valeur ? null : valeur)}
                  >
                    {libelle} · {n}
                  </button>
                ),
            )}
          </div>
        )}

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
        {surLesDecidees ? (
          <ul className="admin-liste" aria-label="Décisions récentes">
            {decides !== null && decidesVisibles.length === 0 && (
              <li className="texte-doux">
                {filtre === 'renvoyees'
                  ? 'Aucune fiche n’attend son relais.'
                  : 'Aucune décision pour le moment.'}
              </li>
            )}
            {decidesVisibles.map((r) => (
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
                    <span className="mention">
                      {r.decideLe
                        ? filtre === 'renvoyees'
                          ? `Renvoyée ${ageDe(r.decideLe, maintenant).texte}`
                          : jour(r.decideLe)
                        : ''}
                    </span>
                  </span>
                  <span className="mention">
                    {libelleType[r.type]} · {r.relais}
                    {r.lot ? ` · Lot ${r.lot}` : ''}
                  </span>
                  <span className="admin-etiquettes">
                    <span className={`etiquette ${classeDecision[r.statut]}`}>
                      {libelleStatutReleve[r.statut]}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="admin-liste" aria-label="Envois à valider">
            {releves !== null && visibles.length === 0 && (
              <li className="texte-doux">
                {releves.length > 0
                  ? 'Aucune fiche ne correspond à ces filtres.'
                  : 'Rien à valider pour le moment.'}
              </li>
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
                    <AgeDeLaFiche age={ageDe(r.recuLe, maintenant)} />
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
        )}

        {selection && (
          <Detail
            key={selection.id}
            admin={admin}
            id={selection.id}
            lectureSeule={surLesDecidees}
            refusee={(decides ?? []).find((d) => d.id === selection.id)?.statut === 'refuse'}
            surDecision={apresDecision}
            surAnnonce={setAnnonce}
          />
        )}
      </div>
    </div>
  );
}

// Les photos, côte à côte ----------------------------------------------------------------

function Photos({
  admin,
  photos,
  nom,
  numeroSaisi = null,
  surChangement,
  peutMarquer = true,
}: {
  admin: PortAdministration;
  photos: PhotoVue[];
  nom: string;
  /** Le numéro écrit sur l'enseigne que le relais a saisi : il se lit à côté de la photo, pour le comparer. */
  numeroSaisi?: string | null;
  surChangement: () => void;
  /** Faux sur une fiche refusée : ses photos ne paraîtront jamais, on ne les déclare pas publiables. */
  peutMarquer?: boolean;
}) {
  const [aEffacer, setAEffacer] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<PhotoVue | null>(null);
  // Plusieurs photos à contrôler : un seul geste, après les avoir regardées (audit du 06/11 : 32 photos = 32 clics).
  const aMarquer = peutMarquer ? photos.filter((p) => p.adresse && !p.publiable) : [];
  // Seules une enseigne et une vue du bâtiment contrôlées peuvent paraître sur la fiche (repli automatique, ou choix
  // prioritaire). Le panneau des formations et le prospectus se contrôlent aussi, mais restent privés.
  const aDesPubliables = photos.some((p) => peutParaitreSurLeSite(p.role));
  const aDesPrivees = photos.some((p) => !peutParaitreSurLeSite(p.role));

  const agir = async (action: () => Promise<void>) => {
    setErreur(null);
    try {
      await action();
      surChangement();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setAEffacer(null);
    }
  };

  if (photos.length === 0) {
    return (
      <figure className="admin-figure">
        <div className="apercu-vide">Photo pas encore reçue</div>
      </figure>
    );
  }
  return (
    <div className="pile-serree">
      <p className="mention">
        Effacer l’original ne retire pas les copies déjà publiées sur le site : reconstruis le site
        après un retrait. Les copies partagées peuvent subsister.
      </p>
      {peutMarquer && aDesPubliables && (
        <p className="mention">
          <b>Contrôler pour publication.</b> Photo nette, sans enfant ni donnée personnelle. Elle
          pourra apparaître sur la fiche publiée après la prochaine mise à jour du site.
          {aDesPrivees &&
            ' Le panneau des formations et le prospectus restent privés, même contrôlés.'}
        </p>
      )}
      {aMarquer.length > 1 && (
        <div className="admin-actions">
          <button
            type="button"
            className="bouton bouton-secondaire bouton-petit"
            onClick={() =>
              void agir(async () => {
                for (const p of aMarquer) await admin.marquerPhotoPubliable(p.id, true);
              })
            }
          >
            Contrôler les {aMarquer.length} photos
          </button>
          <span className="mention">
            Seulement si aucune ne montre d’enfant ni de numéro lisible.
          </span>
        </div>
      )}
      <div className="admin-photos" role="list" aria-label="Photos de l'envoi">
        {photos.map((p) => (
          <figure className="admin-figure" key={p.id} role="listitem">
            {p.adresse ? (
              <button
                type="button"
                className="admin-photo-ouvrir"
                aria-label={`Agrandir : ${libelleRolePhoto[p.role]}`}
                onClick={() => setOuverte(p)}
              >
                <img src={p.adresse} alt={`${libelleRolePhoto[p.role]} — ${nom}`} />
              </button>
            ) : (
              <div className="apercu-vide">Photo illisible</div>
            )}
            <figcaption className="mention">
              <b>{libelleRolePhoto[p.role]}</b>
              {p.role === 'signboard' && (
                <>
                  <br />
                  <span className="admin-numero-saisi">
                    {numeroSaisi
                      ? `Numéro saisi par le relais : ${afficherTelephone(numeroSaisi)}`
                      : 'Aucun numéro saisi par le relais'}
                  </span>
                </>
              )}
              <br />
              {peutParaitreSurLeSite(p.role)
                ? 'Nette, cadrée, sans enfant ?'
                : 'À lire pour saisir les formations, sans enfant ? Reste privée.'}
              {' · '}
              {Math.round(p.octets / 1000)} Ko
            </figcaption>
            <div className="admin-actions">
              {p.publiable ? (
                <span className="etiquette etat-verifiee">
                  {peutParaitreSurLeSite(p.role)
                    ? 'Contrôlée pour publication'
                    : 'Contrôlée : reste privée'}
                </span>
              ) : !peutMarquer ? null : (
                <button
                  type="button"
                  className="bouton bouton-secondaire bouton-petit"
                  onClick={() => void agir(() => admin.marquerPhotoPubliable(p.id, true))}
                >
                  {peutParaitreSurLeSite(p.role)
                    ? 'Contrôler pour publication'
                    : 'Marquer comme contrôlée (privée)'}
                </button>
              )}
              {aEffacer === p.id ? (
                <>
                  <button
                    type="button"
                    className="bouton bouton-petit admin-bouton-refus"
                    onClick={() => void agir(() => admin.effacerPhoto(p.id, null))}
                  >
                    Confirmer : effacer la photo
                  </button>
                  <button
                    type="button"
                    className="bouton bouton-secondaire bouton-petit"
                    onClick={() => setAEffacer(null)}
                  >
                    Annuler
                  </button>
                </>
              ) : (
                // Le droit d'effacement s'exerce aussi sur une fiche déjà décidée.
                <button type="button" className="lien" onClick={() => setAEffacer(p.id)}>
                  Effacer la photo
                </button>
              )}
            </div>
          </figure>
        ))}
      </div>
      {erreur && <p className="message-erreur">{erreur}</p>}
      {ouverte?.adresse && (
        <Dialogue
          titre={`${libelleRolePhoto[ouverte.role]} — ${nom}`}
          fermer={() => setOuverte(null)}
          entete={<h2>{libelleRolePhoto[ouverte.role]}</h2>}
        >
          <img
            className="admin-photo-grande"
            src={ouverte.adresse}
            alt={`${libelleRolePhoto[ouverte.role]} — ${nom}`}
          />
          <p className="mention">
            <a href={ouverte.adresse} target="_blank" rel="noopener noreferrer">
              Ouvrir l’original dans un nouvel onglet
            </a>
          </p>
        </Dialogue>
      )}
    </div>
  );
}

// Le détail d'un envoi -----------------------------------------------------------------------

function Detail({
  admin,
  id,
  lectureSeule,
  refusee = false,
  surDecision,
  surAnnonce,
}: {
  admin: PortAdministration;
  id: string;
  /** Une décision déjà prise : on la relit, on peut encore effacer, on ne décide plus. */
  lectureSeule: boolean;
  /** La décision prise est un refus : ses photos ne se marquent plus publiables. */
  refusee?: boolean;
  surDecision: (texte: string) => void;
  surAnnonce: (texte: string) => void;
}) {
  const [detail, setDetail] = useState<DetailReleve | null>(null);
  const [photos, setPhotos] = useState<PhotoVue[]>([]);
  const [personnes, setPersonnes] = useState<ContactDirection[]>([]);
  const [institutions, setInstitutions] = useState<InstitutionVue[]>([]);
  const [domaines, setDomaines] = useState<DomainePublic[]>([]);
  const [divisions, setDivisions] = useState<DivisionVue[]>([]);
  const [divisionId, setDivisionId] = useState('');
  // La position que l'administration lit sur une carte quand le téléphone du relais n'a pas pu la mesurer (ticket 144).
  const [positionTexte, setPositionTexte] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [mode, setMode] = useState<'correction' | 'refus' | null>(null);
  const [motif, setMotif] = useState<Valeur<'motif_decision'>>('photo_floue');
  const [message, setMessage] = useState('');
  const [operation, setOperation] = useState<
    'acceptation' | 'essai' | 'correction' | 'refus' | null
  >(null);
  const enCours = operation !== null;
  const [efface, setEfface] = useState<string | null>(null);
  const [erreurContact, setErreurContact] = useState<string | null>(null);
  const [cible, setCible] = useState<Cible>({ mode: 'nouvelle' });
  const [etiquette, setEtiquette] = useState('');
  const [corrections, setCorrections] = useState<CorrectionEcole>({});
  // Le numéro de l'enseigne que le relais a saisi : il est public, l'administration dit s'il est sur la photo.
  const [choixNumero, setChoixNumero] = useState<ChoixNumero | null>(null);
  const [editionInformations, setEditionInformations] = useState(false);
  const [formations, setFormations] = useState<FormationSaisie[]>([]);

  const chargerPhotos = useCallback(() => {
    admin
      .photosReleve(id)
      .then(setPhotos)
      .catch((e: unknown) => setErreur(messageErreur(e)));
  }, [admin, id]);

  useEffect(() => {
    Promise.all([
      admin.detailReleve(id),
      admin.photosReleve(id),
      admin.contactsReleve(id),
      admin.institutions(),
      admin.domaines(),
      admin.divisions(),
    ])
      .then(([d, p, c, i, dom, div]) => {
        setDetail(d);
        setPhotos(p);
        setPersonnes(c);
        setInstitutions(i);
        setDomaines(dom);
        setDivisions(div);
        // Par défaut : une école déjà connue au même endroit (« la même ») se met à jour ; sinon, une nouvelle école.
        if (d.doublonDe && (d.reponseDoublon === 'la_meme' || d.type === 'contre_visite')) {
          setCible({ mode: 'update_campus', campusId: d.doublonDe.id });
        }
      })
      .catch((e: unknown) => setErreur(messageErreur(e)));
  }, [admin, id]);

  const agir = async (
    nom: NonNullable<typeof operation>,
    action: () => Promise<unknown>,
    texte: string,
  ) => {
    setOperation(nom);
    setErreur(null);
    try {
      await action();
      surDecision(texte);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOperation(null);
    }
  };

  // Les personnes ont changé (ajoutée, corrigée, effacée) : on les relit, car celles d'une correction peuvent venir de
  // la fiche d'origine (ticket #94).
  const relirePersonnes = async () => {
    setPersonnes(await admin.contactsReleve(id));
  };

  if (!detail) {
    return (
      <section className="admin-detail" aria-busy={!erreur}>
        {erreur ? <p className="message-erreur">{erreur}</p> : <p>Chargement…</p>}
      </section>
    );
  }

  const nouvelleEcole =
    cible.mode === 'nouvelle' &&
    !detail.essai &&
    (detail.type !== 'correction' || detail.corrigeUneFicheEnAttente);
  const retenues = nouvelleEcole ? corrections : {};
  const valeurs = { ...detail, ...retenues, nomEnseigne: retenues.nom ?? detail.nomEnseigne };
  const formationsRetenues = retenues.niveaux
    ? formations.filter((f) => retenues.niveaux?.includes(f.cycle))
    : formations;
  const position = detail.position;
  // Sur le lot d'entraînement, on se forme n'importe où : ni la zone ni le secteur ne disent rien.
  const enZoneOuverte = detail.essai ? null : detail.enZoneOuverte;
  const horsDuSecteur = detail.essai ? false : detail.horsLot === true;
  const campusConnus = institutions.flatMap((i) =>
    i.campus.map((c) => ({
      id: c.id,
      institutionId: i.id,
      libelle: [i.nom, c.etiquette, c.division].filter(Boolean).join(' — '),
    })),
  );
  const avecFormations =
    valeurs.niveaux.some(cycleAvecFormations) || detail.indiceFormations || formations.length > 0;

  // La division de l'école : celle de la position quand un contour la contient. Sinon (aucun contour connu, ou ni position
  // ni lot), l'administration la choisit : la fiche ne retombe plus sur la division du lot du relais (ticket n° 67).
  const saisiePossible = peutSaisirLaPosition(detail, cible);
  const lecturePosition = saisiePossible ? lireChampPosition(positionTexte) : null;
  const saisie: PositionSaisie | null =
    saisiePossible && positionTexte.trim() !== '' && lecturePosition
      ? {
          illisible: lecturePosition.position === null,
          position: lecturePosition.position,
          contour: lecturePosition.position
            ? (arrondissementDeLaPosition(lecturePosition.position)?.nom ?? null)
            : null,
        }
      : null;
  const divisionRequise = divisionRequisePour(detail, cible, saisie);
  // Une position saisie dans un contour connu se passe de choix ; la division reste modifiable, comme dans « Situer ».
  const divisionFacultative = !divisionRequise && saisie?.position != null;
  const divisionsChoisissables = divisions
    .filter((d) => d.niveau >= 2)
    .map((d) => ({ id: d.id, chemin: cheminLisible(d.id, divisions) }))
    .sort((a, b) => a.chemin.localeCompare(b.chemin, 'fr'));
  const decision = (): DecisionAcceptation => {
    const base: DecisionAcceptation = {
      formations: formationsRetenues,
      ...((divisionRequise || divisionFacultative) && divisionId !== '' ? { divisionId } : {}),
      ...(saisie?.position ? { position: saisie.position } : {}),
    };
    // Une correction d'une école déjà créée met l'école à jour : la base sait laquelle. Celle d'une fiche pas encore
    // acceptée se traite comme une nouvelle fiche (ticket #89).
    if (detail.type === 'correction' && !detail.corrigeUneFicheEnAttente) return {};
    switch (cible.mode) {
      case 'nouvelle':
        return {
          ...base,
          corrections: choixNumero === 'retire' ? { ...retenues, numeroEnseigne: null } : retenues,
          mode: 'new_institution',
          etiquette: etiquette.trim() || null,
        };
      case 'new_campus':
        return {
          ...base,
          mode: 'new_campus',
          institutionId: cible.institutionId,
          etiquette: etiquette.trim() || null,
        };
      case 'update_campus':
        return { ...base, mode: 'update_campus', campusId: cible.campusId };
      case 'add_cycle':
        return { ...base, mode: 'add_cycle', campusId: cible.campusId };
    }
  };

  const options: { valeur: ModeAcceptation | 'nouvelle'; libelle: string }[] = [
    { valeur: 'nouvelle', libelle: 'Nouvelle école' },
    { valeur: 'new_campus', libelle: 'Nouvelle implantation d’une école connue' },
    { valeur: 'update_campus', libelle: 'Mettre à jour une implantation connue' },
    { valeur: 'add_cycle', libelle: 'Ajouter ses niveaux à une implantation connue' },
  ];
  const modeActuel = cible.mode === 'nouvelle' ? 'nouvelle' : cible.mode;
  const choisirMode = (valeur: ModeAcceptation | 'nouvelle') => {
    if (valeur === 'nouvelle') setCible({ mode: 'nouvelle' });
    else if (valeur === 'new_campus')
      setCible({ mode: 'new_campus', institutionId: institutions[0]?.id ?? '' });
    else if (valeur === 'update_campus' || valeur === 'add_cycle')
      setCible({ mode: valeur, campusId: detail.doublonDe?.id ?? campusConnus[0]?.id ?? '' });
    else setCible({ mode: 'nouvelle' });
  };
  // Ce qui manque pour accepter : l'écran le dit, le bouton ne se grise jamais sans un mot (ticket #89).
  const numeroCorrige = retenues.numeroEnseigne !== undefined;
  const aConfirmer = numeroAConfirmer(valeurs, numeroCorrige);
  const manque =
    ceQuiManquePourAccepter(detail, cible, divisionId, saisie) ??
    ceQuiManqueDuNumero(aConfirmer, choixNumero);
  const cibleIncomplete = manque !== null;
  // Avant d'accepter : ce qui est prêt, ce qui manque sans bloquer, ce que fait « Accepter » (ticket #95).
  const bilanAvant = detail.essai
    ? null
    : avantDAccepter({
        fiche: valeurs,
        photos,
        contact: personnes.length > 0,
        contactDeLaFicheDOrigine:
          personnes[0]?.releveId !== undefined && personnes[0].releveId !== id,
        nombreDeFormations: formationsRetenues.length,
        formationsAttendues: avecFormations,
        cible,
        positionSaisie: saisie,
        divisionChoisie: divisionId,
        divisionNom: divisions.find((d) => d.id === (divisionId || detail.divisionId))?.nom ?? null,
        choixNumero,
        numeroCorrige,
      });
  // « Pas sur la photo » : une nouvelle école naît sans numéro (la décision le dit à la base). Pour une implantation ou une
  // mise à jour, le numéro du relais remplace celui de l'école : on remet aussitôt après l'acceptation celui qu'elle avait
  // (aucun pour une nouvelle implantation).
  const accepterLaFiche = async () => {
    const retirerApres =
      aConfirmer !== null && choixNumero === 'retire' && cible.mode !== 'nouvelle';
    const ecoleConnue =
      cible.mode === 'update_campus' || cible.mode === 'add_cycle' ? cible.campusId : null;
    const ancien =
      retirerApres && ecoleConnue !== null
        ? ((await admin.ecoles()).find((e) => e.id === ecoleConnue)?.numeroEnseigne ?? null)
        : null;
    const campusId = await admin.accepter(id, decision());
    if (!retirerApres) return;
    try {
      await admin.modifierEcole(campusId, { numeroEnseigne: ancien });
    } catch {
      throw new ErreurDecision(
        'La fiche est acceptée, mais son numéro n’a pas pu être retiré : retire-le dans « Écoles › Gérer la fiche ».',
      );
    }
  };
  const texteAccepter =
    detail.type === 'correction' && !detail.corrigeUneFicheEnAttente
      ? 'Accepter la correction'
      : cible.mode === 'nouvelle'
        ? detail.type === 'correction'
          ? 'Accepter la fiche corrigée'
          : 'Accepter la fiche'
        : cible.mode === 'new_campus'
          ? 'Accepter comme nouvelle implantation'
          : cible.mode === 'update_campus'
            ? detail.type === 'contre_visite'
              ? 'Accepter et situer l’école'
              : 'Mettre à jour la fiche'
            : 'Ajouter les niveaux à la fiche';

  const nombreAccords = personnes.filter((p) => p.accord).length;
  const syntheseContact =
    personnes.length > 0
      ? `${personnes.length} personne${personnes.length > 1 ? 's' : ''} enregistrée${personnes.length > 1 ? 's' : ''} · ${nombreAccords} accord${nombreAccords > 1 ? 's' : ''} de contact`
      : detail.direction === 'absente'
        ? 'Direction absente · aucun contact reçu'
        : detail.direction === 'refus'
          ? 'Contact refusé · aucun contact reçu'
          : 'Aucun contact reçu';

  return (
    <section className="admin-detail" aria-label="Envoi sélectionné">
      <div className="admin-titre">
        <div>
          <h2>{detail.nomEnseigne}</h2>
          <p className="mention">
            Relevée par {detail.relais} {quand(detail.prisLe)}
            {detail.lot && !detail.lotDeLaFicheDOrigine ? ` · Lot ${detail.lot}` : ''}
          </p>
        </div>
        <span className="etiquette etat-attente">{libelleType[detail.type]}</span>
      </div>

      <Photos
        admin={admin}
        photos={photos}
        nom={detail.nomEnseigne}
        numeroSaisi={valeurs.numeroEnseigne}
        surChangement={chargerPhotos}
        peutMarquer={!refusee}
      />

      <SignauxDuRelais admin={admin} relaisId={detail.relaisId} prenom={detail.relais} />

      <div className="admin-deux">
        <div className="pile-serree">
          <p className="rang">
            <Icone nom={enZoneOuverte === false ? 'alerte' : 'coche'} taille={16} />
            <span>
              <b>
                {position === null
                  ? 'Sans position'
                  : enZoneOuverte === false
                    ? 'Hors zone ouverte'
                    : enZoneOuverte === true
                      ? 'En zone ouverte'
                      : detail.essai
                        ? 'Position prise'
                        : 'Zone inconnue'}
              </b>
              {detail.precisionM !== null && ` · précision ${Math.round(detail.precisionM)} m`}
              {horsDuSecteur && ` · hors du secteur de ${detail.relais}`}
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
        </div>
        <div className="pile-serree">
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
          <dt>Programme</dt>
          <dd>{detail.programme ?? '—'}</dd>
          {(detail.programmesVus !== null || detail.programmesEnPhoto) && (
            <>
              <dt>Séries ou filières vues</dt>
              <dd>
                {detail.programmesVus ?? '—'}
                {detail.programmesEnPhoto && (
                  <span className="mention admin-sous-ligne">
                    Le relais les a aussi prises en photo (panneau, affiche ou prospectus).
                  </span>
                )}
              </dd>
            </>
          )}
          <dt>Repère</dt>
          <dd>{detail.repere ?? '—'}</dd>
          <dt>Numéro sur l'enseigne</dt>
          <dd>{detail.numeroEnseigne ? afficherTelephone(detail.numeroEnseigne) : '—'}</dd>
        </dl>
      </section>

      {(Object.keys(retenues).length > 0 || detail.revision) && (
        <section className="admin-motif pile-serree" aria-label="Valeurs retenues par NTanova">
          <h3>Valeurs retenues par NTanova</h3>
          <p className="mention">
            {detail.revision
              ? `Enregistrées ${quand(detail.revision.le)}. Le relevé original ci-dessus est conservé.`
              : 'Préparées pour l’acceptation ; le relevé original ci-dessus est conservé.'}
          </p>
          <dl className="admin-champs">
            {Object.entries(detail.revision?.valeurs ?? retenues).map(([cle, valeur]) => (
              <div className="admin-pleine-largeur" key={cle}>
                <dt>
                  {
                    (
                      {
                        nom: 'Nom',
                        typeEcole: 'Type',
                        niveaux: 'Niveaux',
                        programme: 'Programme et langues',
                        repere: 'Repère',
                        numeroEnseigne: 'Numéro sur l’enseigne',
                      } as Record<string, string>
                    )[cle]
                  }
                </dt>
                <dd>
                  {cle === 'niveaux'
                    ? (valeur as Valeur<'niveau'>[]).map((n) => libelleNiveau[n]).join(', ') ||
                      'Pas indiqué'
                    : cle === 'typeEcole'
                      ? libelleTypeEcole[valeur as Valeur<'type_ecole'>]
                      : cle === 'numeroEnseigne' && valeur
                        ? afficherTelephone(valeur as string)
                        : (valeur as string) || 'Pas indiqué'}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {erreur && (
        <p className="message-erreur" role="alert">
          {erreur}
        </p>
      )}

      {lectureSeule ? (
        <p className="admin-decision mention">
          Décision prise. Pour revenir dessus : demander au relais une nouvelle fiche (un refus est
          définitif), ou agir sur l'école dans l'onglet « Écoles ».
        </p>
      ) : (
        <>
          <fieldset
            className="admin-decision pile"
            disabled={enCours}
            aria-label="Décision de NTanova"
          >
            {nouvelleEcole && (
              <CorrectionAvantAcceptation
                fiche={detail}
                correction={corrections}
                surChangement={setCorrections}
                surEdition={setEditionInformations}
              />
            )}
            {editionInformations && (
              <p className="mention">
                Utilise les valeurs corrigées ou annule leur saisie avant de décider.
              </p>
            )}
            {detail.essai && (
              <Bandeau ton="attente" icone="alerte">
                <p>
                  <b>Lot d'entraînement</b> : cette fiche ne sera jamais publiée. Valide-la avec le
                  relais (elle compte pour son essai), demande une correction, ou refuse-la.
                </p>
              </Bandeau>
            )}

            {detail.type === 'correction' && detail.corrigeUneFicheEnAttente && (
              <Bandeau ton="attente" icone="alerte">
                <p>
                  <b>Cette correction remplace la fiche que tu as renvoyée</b> : l’école n’est pas
                  encore créée.
                  {detail.positionDeLaFicheDOrigine
                    ? ' Elle reprend la position de la fiche d’origine.'
                    : ''}
                </p>
              </Bandeau>
            )}

            {!detail.essai && (detail.type !== 'correction' || detail.corrigeUneFicheEnAttente) && (
              <fieldset
                className="pile-serree formulaire-occupe"
                disabled={editionInformations}
                aria-label="Que faire de cette fiche"
              >
                <Choix
                  legende="Que faire de cette fiche ?"
                  options={options}
                  valeurs={[modeActuel]}
                  surChoix={choisirMode}
                />
                {cible.mode === 'new_campus' && (
                  <Champ libelle="Institution connue">
                    {(a) => (
                      <select
                        {...a}
                        className="champ"
                        value={cible.institutionId}
                        onChange={(ev) =>
                          setCible({ mode: 'new_campus', institutionId: ev.target.value })
                        }
                      >
                        {institutions.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nom} ({i.campus.length} implantation{i.campus.length > 1 ? 's' : ''})
                          </option>
                        ))}
                      </select>
                    )}
                  </Champ>
                )}
                {(cible.mode === 'update_campus' || cible.mode === 'add_cycle') && (
                  <Champ libelle="Implantation connue">
                    {(a) => (
                      <select
                        {...a}
                        className="champ"
                        value={cible.campusId}
                        onChange={(ev) => setCible({ mode: cible.mode, campusId: ev.target.value })}
                      >
                        {campusConnus.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.libelle}
                          </option>
                        ))}
                      </select>
                    )}
                  </Champ>
                )}
                {saisiePossible && (
                  <ChampPosition
                    valeur={positionTexte}
                    surChange={setPositionTexte}
                    erreur={
                      saisie?.illisible === true
                        ? lireChampPosition(positionTexte).erreur
                        : undefined
                    }
                    facultatif
                    aide="Le téléphone du relais n’a pas donné la position. Lis-la sur la capture de Google Maps qu’il a envoyée, ou sur Google Maps : un clic droit sur l’entrée de l’école, puis copie les chiffres, par exemple -4.79105, 11.92500. Elle est gardée avec ton nom et la date."
                  />
                )}
                {(divisionRequise || divisionFacultative) && (
                  <Champ
                    libelle="Division de l’école"
                    aide={
                      divisionFacultative
                        ? 'Laisse « Détectée d’après la position » : la base cherche l’arrondissement ou la ville. Choisis-la seulement quand aucun contour n’est connu à cet endroit.'
                        : detail.position !== null || saisie?.position
                          ? 'Aucun contour connu ne contient cette position. Choisissez la division de l’école : elle n’est pas déduite du lot du relais.'
                          : 'Cette fiche n’a pas de position et le relais n’a pas de lot. Choisissez la division de l’école.'
                    }
                  >
                    {(a) => (
                      <select
                        {...a}
                        className="champ"
                        value={divisionId}
                        onChange={(ev) => setDivisionId(ev.target.value)}
                      >
                        <option value="">
                          {divisionFacultative
                            ? 'Détectée d’après la position'
                            : 'Choisir une division…'}
                        </option>
                        {divisionsChoisissables.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.chemin}
                          </option>
                        ))}
                      </select>
                    )}
                  </Champ>
                )}
                {(cible.mode === 'nouvelle' || cible.mode === 'new_campus') && (
                  <Champ
                    libelle="Nom de l’implantation"
                    facultatif
                    aide="« Campus de Loandjili » : seulement quand l’école a plusieurs implantations."
                  >
                    {(a) => (
                      <input
                        {...a}
                        className="champ"
                        type="text"
                        maxLength={120}
                        autoComplete="off"
                        value={etiquette}
                        onChange={(ev) => setEtiquette(ev.target.value)}
                      />
                    )}
                  </Champ>
                )}
                {avecFormations && (
                  <>
                    <p className="mention">
                      Lis les photos du panneau ou du prospectus : les séries et les formations
                      notées ici rendent l’école cherchable (série C, BTS, licence…).
                    </p>
                    <Formations
                      cycles={valeurs.niveaux}
                      formations={formationsRetenues}
                      domaines={domaines}
                      surChangement={setFormations}
                    />
                  </>
                )}
              </fieldset>
            )}

            {aConfirmer !== null && (
              <fieldset className="admin-numero pile-serree">
                <legend>
                  Numéro écrit sur l’enseigne : <b>{afficherTelephone(aConfirmer)}</b>
                </legend>
                <p className="mention">
                  Saisi par le relais : compare-le à la photo de l’enseigne ci-dessus. Il sera
                  publié tel quel, avec un bouton « Appeler », dès que l’école le sera.
                </p>
                <label className="rang">
                  <input
                    type="radio"
                    name="numero-enseigne"
                    checked={choixNumero === 'verifie'}
                    onChange={() => setChoixNumero('verifie')}
                  />
                  <span>Je l’ai vérifié sur la photo de l’enseigne</span>
                </label>
                {numeroPeutEtreRetire(detail) ? (
                  <label className="rang">
                    <input
                      type="radio"
                      name="numero-enseigne"
                      checked={choixNumero === 'retire'}
                      onChange={() => setChoixNumero('retire')}
                    />
                    <span>Il n’est pas sur la photo : ne pas le publier</span>
                  </label>
                ) : (
                  <p className="mention">
                    Pour ne pas le publier, accepte puis retire-le dans « Écoles › Gérer la fiche ».
                  </p>
                )}
              </fieldset>
            )}

            {bilanAvant && (
              <section className="admin-avant pile-serree" aria-label="Avant d’accepter">
                <h3 className="rang">
                  <Icone nom="coche" />
                  Avant d’accepter
                </h3>
                <p>
                  {bilanAvant.bloque
                    ? 'Il reste un choix à faire avant de pouvoir accepter.'
                    : 'Rien ne bloque : tu peux accepter.'}
                </p>
                <ul className="admin-avant-liste">
                  {bilanAvant.lignes.map((l) => (
                    <li key={l.cle} className="rang">
                      <Icone nom={iconeDeLaLigne[l.etat]} taille={16} />
                      <span>
                        <b>{l.titre}</b> · {l.texte}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mention">{bilanAvant.phrase}</p>
              </section>
            )}

            {manque && !detail.essai && (
              <p className="message-attention" role="status">
                {manque}
              </p>
            )}
          </fieldset>
          {/* Les boutons sont un enfant direct de la fiche : « collants », ils restent à l'écran pendant tout son défilement. */}
          <fieldset
            className="admin-decision-barre pile-serree"
            disabled={enCours}
            aria-label="Accepter, corriger ou refuser"
          >
            <div className="admin-actions">
              {!detail.essai && (
                <Bouton
                  type="button"
                  enCours={operation === 'acceptation'}
                  texteEnCours="Acceptation…"
                  disabled={enCours || cibleIncomplete || editionInformations}
                  onClick={() =>
                    void agir(
                      'acceptation',
                      accepterLaFiche,
                      cible.mode === 'update_campus' || cible.mode === 'add_cycle'
                        ? 'La fiche de l’école est mise à jour. Si elle était déjà en ligne, la correction paraît après la prochaine mise à jour du site ; sinon, publie-la depuis « Écoles ».'
                        : ACCEPTEE,
                    )
                  }
                >
                  {texteAccepter}
                </Bouton>
              )}
              {detail.essai && !detail.essaiValideLe && (
                <Bouton
                  type="button"
                  enCours={operation === 'essai'}
                  texteEnCours="Validation…"
                  disabled={enCours}
                  onClick={() =>
                    void agir(
                      'essai',
                      () => admin.validerEssai(id),
                      'Validée avec le relais : elle compte pour son essai et ne sera jamais publiée.',
                    )
                  }
                >
                  Valider pour l’essai
                </Bouton>
              )}
              <button
                type="button"
                className="bouton bouton-secondaire"
                disabled={editionInformations}
                aria-expanded={mode === 'correction'}
                onClick={() => setMode(mode === 'correction' ? null : 'correction')}
              >
                Demander une correction
              </button>
              <button
                type="button"
                className="bouton bouton-secondaire admin-bouton-refus"
                disabled={editionInformations}
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
                  // « autre » ne dit rien tout seul : sans message, rien ne part (la base refuse aussi).
                  const manque = messageManquant(motif, texte);
                  if (manque) {
                    setErreur(manque);
                    return;
                  }
                  void agir(
                    mode,
                    () =>
                      mode === 'correction'
                        ? admin.demanderCorrection(id, motif, texte)
                        : admin.refuser(id, motif, texte),
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
                      {motifsProposes.map((m) => (
                        <option key={m} value={m}>
                          {libelleMotif[m]}
                        </option>
                      ))}
                    </select>
                  )}
                </Champ>
                <Champ
                  libelle="Message au relais"
                  facultatif={motif !== 'autre'}
                  aide={
                    motif === 'autre'
                      ? 'Obligatoire avec « Autre » : dis au relais ce qu’il doit faire. Il le lit dans « Mes fiches ». Vouvoie-le.'
                      : 'Le relais le lit dans « Mes fiches ». Vouvoie-le.'
                  }
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
                <Bouton
                  type="submit"
                  variante={mode === 'refus' ? 'danger' : 'principal'}
                  enCours={operation === mode}
                  texteEnCours={mode === 'correction' ? 'Envoi de la demande…' : 'Refus…'}
                  disabled={enCours}
                >
                  {mode === 'correction' ? 'Envoyer la demande' : 'Refuser la fiche'}
                </Bouton>
              </form>
            )}
          </fieldset>
        </>
      )}
      <SectionRepliable
        titre="Contact et échanges avec la direction"
        synthese={`${syntheseContact}${erreurContact ? ' · Action à réessayer' : ''}`}
      >
        {efface && (
          <p className="bandeau bandeau-envoye" role="status">
            {efface}
          </p>
        )}
        {erreurContact && (
          <p className="message-erreur" role="alert">
            {erreurContact}
          </p>
        )}
        <Personnes
          admin={admin}
          id={id}
          detail={detail}
          personnes={personnes}
          surChangement={relirePersonnes}
          annoncer={setEfface}
          surErreur={setErreurContact}
        />

        {personnes.length > 0 && (
          <section className="pile-serree" aria-label="Écrire à la direction">
            <h3 className="rang">
              <Icone nom="coche" />
              Écrire à la direction
            </h3>
            <Pont admin={admin} detail={detail} contacts={personnes} surAnnonce={surAnnonce} />
          </section>
        )}
      </SectionRepliable>
    </section>
  );
}
