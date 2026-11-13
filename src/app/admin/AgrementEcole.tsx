import { useEffect, useState } from 'react';
import {
  intituleAgrement,
  lireAgrement,
  referenceEnMots,
  type AgrementEnregistre,
} from '../../modele/agrement';
import { jourDuCongo } from '../../modele/date-declaration';
import { libelleGenreAgrement, libelleRolePhotoCourt } from '../../modele/libelles';
import { libelleGenrePreuve, type GenrePreuve } from '../../modele/fiche-admin';
import { listes } from '../../modele/listes';
import type { PhotoVue, PortAdministration } from '../../modele/ports';
import { Bouton } from '../../ui/actions';
import { ImageIllisible, preparerImage } from '../commun/image';
import { Champ } from '../../ui/composants';
import { Dialogue } from '../../ui/Dialogue';
import { dateLongue } from '../../modele/pointe-noire';
import { Bandeau } from '../../ui/composants';
import { messageErreur } from './ChampPosition';

const VIDE = {
  formationId: '',
  genre: '',
  precision: '',
  reference: '',
  delivreLe: '',
  sourceTexte: '',
  sourceLien: '',
  controleLe: '',
  documentVu: false,
};

/**
 * L'agrément d'une école ou d'une filière (ticket 148) : la référence d'un document que l'administration a vu. Une ligne par
 * école et par filière. Elle cite le document : ni badge, ni garantie.
 */
export function AgrementEcole({
  ecoleId,
  nom,
  agrements,
  filieres,
  admin,
  surChangement,
  fermer,
  integre = false,
  surOccupation,
}: {
  ecoleId: string;
  nom: string;
  agrements: AgrementEnregistre[];
  filieres: { id: string; titre: string }[];
  admin: PortAdministration;
  surChangement: (texte: string) => void;
  fermer: () => void;
  integre?: boolean;
  surOccupation?: (occupe: boolean) => void;
}) {
  const [saisie, setSaisie] = useState(VIDE);
  const [enModification, setEnModification] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    surOccupation?.(enCours);
    return () => surOccupation?.(false);
  }, [enCours, surOccupation]);
  const changer = (champ: Partial<typeof VIDE>) => setSaisie((s) => ({ ...s, ...champ }));
  const cible = (a: Pick<AgrementEnregistre, 'formationId'>) =>
    a.formationId === null
      ? 'L’établissement'
      : (filieres.find((f) => f.id === a.formationId)?.titre ?? 'Une filière');

  const agir = async (action: () => Promise<unknown>, succes: string) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      setSaisie(VIDE);
      setEnModification(false);
      surChangement(`${succes} Visible après la prochaine mise à jour du site.`);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };
  const enregistrer = () => {
    const { agrement, erreur: refus } = lireAgrement(saisie);
    if (!agrement) {
      setErreur(refus);
      return;
    }
    void agir(() => admin.enregistrerAgrement(ecoleId, agrement), `Agrément de ${nom} enregistré.`);
  };

  return (
    <Dialogue titre={`Agrément de ${nom}`} fermer={fermer} integre={integre}>
      <form
        className="admin-motif"
        aria-label={`Agrément de ${nom}`}
        onSubmit={(ev) => {
          ev.preventDefault();
          enregistrer();
        }}
      >
        <h3>Référence officielle</h3>
        <p>
          Seulement le document que tu as vu, avec ses mots à lui. Sans ligne ici, la fiche n’écrit
          rien. Cette ligne cite un document : ni badge, ni garantie de NTanova.
        </p>
        {agrements.length > 0 && (
          <ul className="admin-frais-liste">
            {agrements.map((a) => (
              <li key={a.id}>
                <b>
                  {cible(a)} · {intituleAgrement(a)}
                </b>
                <p>
                  {referenceEnMots(a)} · {a.sourceTexte} · vu le {dateLongue(a.controleLe)}
                </p>
                <button
                  type="button"
                  className="bouton bouton-secondaire"
                  disabled={enCours}
                  onClick={() => {
                    setEnModification(true);
                    setSaisie({
                      formationId: a.formationId ?? '',
                      genre: a.genre,
                      precision: a.precision ?? '',
                      reference: a.reference,
                      delivreLe: a.delivreLe,
                      sourceTexte: a.sourceTexte,
                      sourceLien: a.sourceLien ?? '',
                      controleLe: a.controleLe,
                      documentVu: false,
                    });
                    setErreur(null);
                  }}
                >
                  Modifier : {cible(a)}
                </button>
                <button
                  type="button"
                  className="bouton bouton-secondaire admin-bouton-refus"
                  disabled={enCours}
                  onClick={() =>
                    void agir(() => admin.retirerAgrement(a.id), `Agrément de ${nom} retiré.`)
                  }
                >
                  Retirer : {cible(a)}
                </button>
                <PreuveDeLAgrement
                  ecoleId={ecoleId}
                  agrement={a}
                  cible={cible(a)}
                  admin={admin}
                  surChangement={surChangement}
                />
              </li>
            ))}
          </ul>
        )}
        {filieres.length > 0 && (
          <label className="champ-groupe">
            Concerne
            <select
              className="champ"
              value={saisie.formationId}
              disabled={enModification}
              onChange={(e) => changer({ formationId: e.target.value })}
            >
              <option value="">L’établissement</option>
              {filieres.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.titre}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="champ-groupe">
          Intitulé du document
          <select
            className="champ"
            value={saisie.genre}
            onChange={(e) => changer({ genre: e.target.value })}
          >
            <option value="">Choisir</option>
            {listes.accreditation_kind.map((g) => (
              <option key={g} value={g}>
                {libelleGenreAgrement[g]}
              </option>
            ))}
          </select>
        </label>
        {saisie.genre === 'autre' && (
          <label className="champ-groupe">
            Intitulé écrit sur le document
            <input
              className="champ"
              maxLength={80}
              value={saisie.precision}
              onChange={(e) => changer({ precision: e.target.value })}
            />
          </label>
        )}
        <label className="champ-groupe">
          Référence, telle qu’elle est écrite (« arrêté n° … »)
          <input
            className="champ"
            maxLength={160}
            value={saisie.reference}
            onChange={(e) => changer({ reference: e.target.value })}
          />
        </label>
        <label className="champ-groupe">
          Date du document
          <input
            className="champ"
            type="date"
            max={jourDuCongo()}
            value={saisie.delivreLe}
            onChange={(e) => changer({ delivreLe: e.target.value })}
          />
        </label>
        <label className="champ-groupe">
          Source, en mots (où se trouve le document)
          <input
            className="champ"
            maxLength={200}
            value={saisie.sourceTexte}
            onChange={(e) => changer({ sourceTexte: e.target.value })}
          />
        </label>
        <label className="champ-groupe">
          Lien vers le document (facultatif)
          <input
            className="champ"
            type="url"
            maxLength={500}
            placeholder="https://"
            value={saisie.sourceLien}
            onChange={(e) => changer({ sourceLien: e.target.value })}
          />
        </label>
        <label className="champ-groupe">
          Jour où tu as vu le document (jamais publié)
          <input
            className="champ"
            type="date"
            max={jourDuCongo()}
            value={saisie.controleLe}
            onChange={(e) => changer({ controleLe: e.target.value })}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={saisie.documentVu}
            onChange={(e) => changer({ documentVu: e.target.checked })}
          />{' '}
          J’ai vu ce document.
        </label>
        {erreur && (
          <Bandeau ton="erreur" icone="alerte">
            {erreur}
          </Bandeau>
        )}
        <button className="bouton" type="submit" disabled={enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer l’agrément'}
        </button>
        {enModification && (
          <button
            type="button"
            className="bouton bouton-secondaire"
            disabled={enCours}
            onClick={() => {
              setEnModification(false);
              setSaisie(VIDE);
              setErreur(null);
            }}
          >
            Annuler la modification
          </button>
        )}
        <p className="mention">Visible après la prochaine mise à jour du site.</p>
      </form>
    </Dialogue>
  );
}

/**
 * Lot F (13/11) : la preuve d'un agrément. La photo du document (une photo de travail d'un relevé, ou un fichier téléversé
 * ici), le document vu sur place, ou ce que dit l'école sans document. La photo reste privée : la page écrit seulement « vue
 * sur le document » ou « dite par l'école », jamais « reconnue par l'État ».
 */
function PreuveDeLAgrement({
  ecoleId,
  agrement,
  cible,
  admin,
  surChangement,
}: {
  ecoleId: string;
  agrement: AgrementEnregistre;
  cible: string;
  admin: PortAdministration;
  surChangement: (texte: string) => void;
}) {
  const actuelle = agrement.preuveDetail ?? null;
  const [ouverte, setOuverte] = useState(false);
  const [genre, setGenre] = useState<GenrePreuve | ''>(actuelle?.genre ?? '');
  const [photos, setPhotos] = useState<PhotoVue[] | null>(null);
  const [photoId, setPhotoId] = useState<string>(actuelle?.photoId ?? '');
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!ouverte || genre !== 'photo' || photos) return;
    let vivant = true;
    void admin
      .photosDeTravail(ecoleId)
      .then((p) => vivant && setPhotos(p))
      .catch(() => vivant && setPhotos([]));
    return () => {
      vivant = false;
    };
  }, [admin, ecoleId, genre, ouverte, photos]);
  useEffect(() => {
    if (!ouverte || !actuelle?.chemin) return;
    let vivant = true;
    void admin
      .adresseDePreuve(actuelle.chemin)
      .then((a) => vivant && setApercu(a))
      .catch(() => vivant && setApercu(null));
    return () => {
      vivant = false;
    };
  }, [admin, actuelle?.chemin, ouverte]);

  const sauver = async () => {
    if (!genre) return setErreur('Choisis ce qui prouve la référence.');
    if (genre === 'photo' && !fichier && !photoId && !actuelle?.chemin)
      return setErreur('Choisis la photo du document parmi celles des relevés, ou ajoute-la.');
    setEnCours(true);
    setErreur(null);
    try {
      // Garder le fichier déjà envoyé : on renvoie seulement ce qui change.
      if (genre === 'photo' && !fichier && !photoId && actuelle?.chemin) {
        setOuverte(false);
        return;
      }
      const image = genre === 'photo' && fichier ? await preparerImage(fichier) : null;
      await admin.enregistrerPreuveAgrement(ecoleId, agrement.id, {
        genre,
        photoId: genre === 'photo' && !image ? photoId || null : null,
        image,
      });
      setOuverte(false);
      setFichier(null);
      surChangement(`Preuve de l’agrément (${cible}) enregistrée. Elle reste privée.`);
    } catch (e) {
      setErreur(e instanceof ImageIllisible ? e.message : messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="pile-serree">
      <p className="mention">
        Preuve :{' '}
        {actuelle
          ? `${libelleGenrePreuve[actuelle.genre]}${actuelle.chemin ? ' (photo ajoutée ici)' : actuelle.photoId ? ' (photo d’un relevé)' : ''}`
          : 'pas encore dite'}
      </p>
      {!ouverte ? (
        <button
          type="button"
          className="bouton bouton-secondaire"
          onClick={() => {
            setOuverte(true);
            setErreur(null);
          }}
        >
          Preuve : {cible}
        </button>
      ) : (
        <fieldset className="pile-serree" aria-label={`Preuve de l’agrément : ${cible}`}>
          <legend>Ce qui prouve la référence</legend>
          {(Object.keys(libelleGenrePreuve) as GenrePreuve[]).map((g) => (
            <label key={g} className="case">
              <input
                type="radio"
                name={`preuve-${agrement.id}`}
                checked={genre === g}
                onChange={() => setGenre(g)}
              />
              {libelleGenrePreuve[g]}
            </label>
          ))}
          {genre === 'photo' && (
            <>
              {apercu && (
                <a href={apercu} target="_blank" rel="noopener">
                  Voir la photo déjà ajoutée
                </a>
              )}
              {photos === null ? (
                <p aria-busy="true">Chargement des photos de travail…</p>
              ) : photos.length > 0 ? (
                <div className="pile-serree" role="radiogroup" aria-label="Photo d’un relevé">
                  {photos.map((p) => (
                    <label key={p.id} className="case">
                      <input
                        type="radio"
                        name={`photo-preuve-${agrement.id}`}
                        checked={photoId === p.id}
                        onChange={() => {
                          setPhotoId(p.id);
                          setFichier(null);
                        }}
                      />
                      {p.adresse && <img src={p.adresse} alt="" width={64} height={48} />}
                      {libelleRolePhotoCourt[p.role]}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="mention">Aucune photo de travail dans les relevés de ce site.</p>
              )}
              <Champ libelle="Ou ajouter la photo du document" facultatif>
                {(a) => (
                  <input
                    {...a}
                    className="champ"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(ev) => {
                      setFichier(ev.target.files?.[0] ?? null);
                      setPhotoId('');
                    }}
                  />
                )}
              </Champ>
              <p className="mention">Photo de travail : jamais publiée.</p>
            </>
          )}
          {erreur && (
            <Bandeau ton="erreur" icone="alerte">
              {erreur}
            </Bandeau>
          )}
          <div className="admin-actions">
            <Bouton type="button" enCours={enCours} onClick={() => void sauver()}>
              Enregistrer la preuve
            </Bouton>
            <button
              type="button"
              className="bouton bouton-secondaire"
              disabled={enCours}
              onClick={() => setOuverte(false)}
            >
              Annuler
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
