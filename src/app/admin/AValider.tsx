import { useCallback, useEffect, useState } from 'react';
import { cycleAvecFormations } from '../../modele/formations';
import { cheminLisible } from '../../modele/geo-divisions';
import type { Valeur } from '../../modele/listes';
import {
  libelleFonction,
  libelleMotif,
  libelleNiveau,
  libelleRolePhoto,
  libelleStatutReleve,
  libelleTypeEcole,
  motifsProposes,
} from '../../modele/libelles';
import type {
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
import { afficherTelephone } from '../../modele/telephone';
import { Bandeau, Champ, Choix, Icone, jour, quand } from '../../ui/composants';
import { aller, useAdresse } from '../commun/adresse';
import { SignauxDuRelais } from './Sante';
import { messageErreur } from './ChampPosition';
import { Formations } from './Formations';
import { Pont } from './Pont';

type Filtre = 'tout' | 'releve' | 'correction' | 'contre_visite' | 'decidees';

const libelleType: Record<ReleveAValider['type'], string> = {
  releve: 'Nouvelle fiche',
  correction: 'Correction',
  contre_visite: 'Contre-visite',
};

const ACCEPTEE =
  'Acceptée : l’école est prête. Publie-la depuis l’onglet « Écoles » (une école, une zone ou un lot).';

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

  const visibles = (releves ?? []).filter((r) => filtre === 'tout' || r.type === filtre);
  const selection =
    filtre === 'decidees'
      ? (decides?.find((r) => r.id === choisi) ?? null)
      : (visibles.find((r) => r.id === choisi) ?? null);

  const apresDecision = (texte: string) => {
    setAnnonce(texte);
    // Seulement si l'on est encore sur « À valider » : un autre onglet ouvert entre-temps reste ouvert.
    if (location.hash.startsWith('#valider') || location.hash === '') {
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
        {filtre === 'decidees' ? (
          <ul className="admin-liste" aria-label="Décisions récentes">
            {decides !== null && decides.length === 0 && (
              <li className="texte-doux">Aucune décision pour le moment.</li>
            )}
            {decides?.map((r) => (
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
                    <span className="mention">{r.decideLe ? jour(r.decideLe) : ''}</span>
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
        )}

        {selection && (
          <Detail
            key={selection.id}
            admin={admin}
            id={selection.id}
            lectureSeule={filtre === 'decidees'}
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
  surChangement,
}: {
  admin: PortAdministration;
  photos: PhotoVue[];
  nom: string;
  surChangement: () => void;
}) {
  const [aEffacer, setAEffacer] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

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
      <div className="admin-photos" role="list" aria-label="Photos de l'envoi">
        {photos.map((p) => (
          <figure className="admin-figure" key={p.id} role="listitem">
            {p.adresse ? (
              <a
                href={p.adresse}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ouvrir en grand : ${libelleRolePhoto[p.role]}`}
              >
                <img src={p.adresse} alt={`${libelleRolePhoto[p.role]} — ${nom}`} />
              </a>
            ) : (
              <div className="apercu-vide">Photo illisible</div>
            )}
            <figcaption className="mention">
              <b>{libelleRolePhoto[p.role]}</b>
              <br />
              {p.role === 'signboard'
                ? 'Nette, cadrée, sans enfant ?'
                : 'À lire pour saisir les formations, sans enfant ?'}
              {' · '}
              {Math.round(p.octets / 1000)} Ko
            </figcaption>
            <div className="admin-actions">
              {p.publiable ? (
                <span className="etiquette etat-verifiee">Vérifiée : publiable</span>
              ) : (
                <button
                  type="button"
                  className="bouton bouton-secondaire bouton-petit"
                  onClick={() => void agir(() => admin.marquerPhotoPubliable(p.id, true))}
                >
                  Marquer publiable
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
    </div>
  );
}

// Le détail d'un envoi -----------------------------------------------------------------------

/** Comment l'envoi entre dans le catalogue : la décision en un geste. */
type Cible =
  | { mode: 'nouvelle' }
  | { mode: 'new_campus'; institutionId: string }
  | { mode: 'update_campus'; campusId: string }
  | { mode: 'add_cycle'; campusId: string };

function Detail({
  admin,
  id,
  lectureSeule,
  surDecision,
  surAnnonce,
}: {
  admin: PortAdministration;
  id: string;
  /** Une décision déjà prise : on la relit, on peut encore effacer, on ne décide plus. */
  lectureSeule: boolean;
  surDecision: (texte: string) => void;
  surAnnonce: (texte: string) => void;
}) {
  const [detail, setDetail] = useState<DetailReleve | null>(null);
  const [photos, setPhotos] = useState<PhotoVue[]>([]);
  const [contact, setContact] = useState<ContactDirection | null>(null);
  const [institutions, setInstitutions] = useState<InstitutionVue[]>([]);
  const [domaines, setDomaines] = useState<DomainePublic[]>([]);
  const [divisions, setDivisions] = useState<DivisionVue[]>([]);
  const [divisionId, setDivisionId] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [mode, setMode] = useState<'correction' | 'refus' | null>(null);
  const [motif, setMotif] = useState<Valeur<'motif_decision'>>('photo_floue');
  const [message, setMessage] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [aEffacerContact, setAEffacerContact] = useState(false);
  const [efface, setEfface] = useState<string | null>(null);
  const [cible, setCible] = useState<Cible>({ mode: 'nouvelle' });
  const [etiquette, setEtiquette] = useState('');
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
      admin.contactReleve(id),
      admin.institutions(),
      admin.domaines(),
      admin.divisions(),
    ])
      .then(([d, p, c, i, dom, div]) => {
        setDetail(d);
        setPhotos(p);
        setContact(c);
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

  const effacerContact = async () => {
    setErreur(null);
    try {
      await admin.effacerContact(id, null);
      setContact(null);
      setEfface('Le contact de la direction est effacé.');
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setAEffacerContact(false);
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
    detail.niveaux.some(cycleAvecFormations) || detail.indiceFormations || formations.length > 0;

  // La division de l'école : celle de la position quand un contour la contient. Sinon (aucun contour connu, ou ni position
  // ni lot), l'administration la choisit : la fiche ne retombe plus sur la division du lot du relais (ticket n° 67).
  const divisionRequise =
    !detail.essai &&
    (cible.mode === 'nouvelle' || cible.mode === 'new_campus') &&
    detail.divisionId === null &&
    (detail.position !== null || detail.lot === null);
  const divisionsChoisissables = divisions
    .filter((d) => d.niveau >= 2)
    .map((d) => ({ id: d.id, chemin: cheminLisible(d.id, divisions) }))
    .sort((a, b) => a.chemin.localeCompare(b.chemin, 'fr'));
  const decision = (): DecisionAcceptation => {
    const base: DecisionAcceptation = {
      formations,
      ...(divisionRequise && divisionId !== '' ? { divisionId } : {}),
    };
    if (detail.type === 'correction') return {};
    switch (cible.mode) {
      case 'nouvelle':
        return { ...base, mode: 'new_institution', etiquette: etiquette.trim() || null };
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
  const cibleIncomplete =
    (divisionRequise && divisionId === '') ||
    (cible.mode === 'new_campus' && cible.institutionId === '') ||
    ((cible.mode === 'update_campus' || cible.mode === 'add_cycle') && cible.campusId === '');
  const texteAccepter =
    detail.type === 'correction'
      ? 'Accepter la correction'
      : cible.mode === 'nouvelle'
        ? 'Accepter la fiche'
        : cible.mode === 'new_campus'
          ? 'Accepter comme nouvelle implantation'
          : cible.mode === 'update_campus'
            ? detail.type === 'contre_visite'
              ? 'Situer l’école'
              : 'Mettre à jour la fiche'
            : 'Ajouter les niveaux à la fiche';

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

      <Photos
        admin={admin}
        photos={photos}
        nom={detail.nomEnseigne}
        surChangement={chargerPhotos}
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
            {aEffacerContact ? (
              <span className="admin-actions">
                <button
                  type="button"
                  className="bouton bouton-petit admin-bouton-refus"
                  onClick={() => void effacerContact()}
                >
                  Confirmer : effacer le contact (droit d'effacement)
                </button>
                <button
                  type="button"
                  className="bouton bouton-secondaire bouton-petit"
                  onClick={() => setAEffacerContact(false)}
                >
                  Annuler
                </button>
              </span>
            ) : (
              <button type="button" className="lien" onClick={() => setAEffacerContact(true)}>
                Effacer le contact (droit d'effacement)
              </button>
            )}
          </>
        )}
      </section>

      {contact && (
        <section className="pile-serree" aria-label="Écrire à la direction">
          <h3 className="rang">
            <Icone nom="coche" />
            Écrire à la direction
          </h3>
          <Pont admin={admin} detail={detail} contact={contact} surAnnonce={surAnnonce} />
        </section>
      )}

      {efface && (
        <p className="bandeau bandeau-envoye" role="status">
          {efface}
        </p>
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
        <div className="admin-decision pile">
          {detail.essai && (
            <Bandeau ton="attente" icone="alerte">
              <p>
                <b>Lot d'entraînement</b> : cette fiche ne sera jamais publiée. Valide-la avec le
                relais (elle compte pour son essai), demande une correction, ou refuse-la.
              </p>
            </Bandeau>
          )}

          {!detail.essai && detail.type !== 'correction' && (
            <div className="pile-serree" aria-label="Que faire de cette fiche">
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
              {divisionRequise && (
                <Champ
                  libelle="Division de l’école"
                  aide={
                    detail.position !== null
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
                      <option value="">Choisir une division…</option>
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
                    Lis les photos du panneau ou du prospectus : les séries et les formations notées
                    ici rendent l’école cherchable (série C, BTS, licence…).
                  </p>
                  <Formations
                    cycles={detail.niveaux}
                    formations={formations}
                    domaines={domaines}
                    surChangement={setFormations}
                  />
                </>
              )}
            </div>
          )}

          <div className="admin-actions">
            {!detail.essai && (
              <button
                type="button"
                className="bouton"
                disabled={enCours || cibleIncomplete}
                onClick={() =>
                  void agir(
                    () => admin.accepter(id, decision()),
                    cible.mode === 'update_campus' || cible.mode === 'add_cycle'
                      ? 'La fiche de l’école est mise à jour. Si elle était déjà en ligne, la correction paraît après la prochaine mise à jour du site ; sinon, publie-la depuis « Écoles ».'
                      : ACCEPTEE,
                  )
                }
              >
                {texteAccepter}
              </button>
            )}
            {detail.essai && !detail.essaiValideLe && (
              <button
                type="button"
                className="bouton"
                disabled={enCours}
                onClick={() =>
                  void agir(
                    () => admin.validerEssai(id),
                    'Validée avec le relais : elle compte pour son essai et ne sera jamais publiée.',
                  )
                }
              >
                Valider pour l’essai
              </button>
            )}
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
      )}
    </section>
  );
}
