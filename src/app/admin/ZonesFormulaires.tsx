/**
 * Les deux formulaires de l'onglet Zones : ajouter une zone sous une zone, poser un lot. Ils s'ouvrent dans le volet de la
 * zone choisie, qui leur donne déjà la zone : on n'a plus à la chercher dans une liste de toutes les zones.
 */
import { useState } from 'react';
import { cheminLisible } from '../../modele/geo-divisions';
import { libelleGenreDivision } from '../../modele/libelles';
import type { Valeur } from '../../modele/listes';
import type { DivisionVue, PortAdministration } from '../../modele/ports';
import { Champ } from '../../ui/composants';
import { messageErreur } from './ChampPosition';

/** Les genres qu'une division peut avoir sous un parent de ce niveau (voir `geo_divisions_genre_du_niveau`). */
export const GENRES_SOUS: Record<number, readonly Valeur<'geo_kind'>[]> = {
  0: ['department', 'region'],
  1: ['city', 'commune', 'district'],
  2: ['arrondissement'],
  3: ['quarter', 'zone'],
};

const adresseDe = (nom: string): string =>
  nom
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function AjouterDivision({
  divisions,
  estOuverte,
  admin,
  surFait,
  parentInitial = '',
}: {
  divisions: DivisionVue[];
  /** La zone est-elle ouverte au relevé (elle-même, ou par une zone au-dessus d'elle) ? */
  estOuverte: (divisionId: string) => boolean;
  admin: PortAdministration;
  /** Dit ce qui s'est passé ; `zoneId` est la zone créée, que l'écran ouvre aussitôt. */
  surFait: (texte: string, zoneId?: string) => void;
  /** La zone du volet : le formulaire s'ouvre déjà sous elle. */
  parentInitial?: string;
}) {
  const parents = divisions.filter((d) => d.niveau <= 3);
  const premierGenre = (id: string): Valeur<'geo_kind'> => {
    const p = parents.find((d) => d.id === id);
    return (p ? GENRES_SOUS[p.niveau]?.[0] : undefined) ?? 'quarter';
  };
  const [parentId, setParentId] = useState(parentInitial);
  const parent = parents.find((d) => d.id === parentId);
  const genres = parent ? (GENRES_SOUS[parent.niveau] ?? []) : [];
  const [genre, setGenre] = useState<Valeur<'geo_kind'>>(() => premierGenre(parentInitial));
  const [nom, setNom] = useState('');
  const [adresse, setAdresse] = useState('');
  const [adresseLibre, setAdresseLibre] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const choisirParent = (id: string) => {
    setParentId(id);
    const p = parents.find((d) => d.id === id);
    const permis = p ? (GENRES_SOUS[p.niveau] ?? []) : [];
    if (permis.length > 0 && !permis.includes(genre)) setGenre(permis[0] ?? 'quarter');
  };

  const valider = async (ev: { preventDefault: () => void }) => {
    ev.preventDefault();
    if (!parent || nom.trim() === '') return;
    setEnCours(true);
    setErreur(null);
    try {
      const id = await admin.ajouterDivision(
        parent.id,
        genre,
        nom.trim(),
        adresse.trim() || adresseDe(nom),
      );
      // Une zone nouvelle n'est pas ouverte en soi ; elle l'est par la zone qui la contient, si celle-ci l'est.
      surFait(
        `${nom.trim()} est ajouté sous ${parent.nom}. ` +
          (estOuverte(parent.id)
            ? 'Les relais peuvent y relever, comme dans tout ce que contient sa zone.'
            : 'Fermé aux relais : ouvre-le quand tu veux.'),
        id,
      );
      setNom('');
      setAdresse('');
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form className="admin-motif" aria-label="Ajouter une zone" onSubmit={(ev) => void valider(ev)}>
      <p className="mention admin-pleine-largeur">
        Un département sous un pays, une ville sous un département, un arrondissement sous une
        ville, un quartier ou une zone sous un arrondissement. L’adresse d’une zone se fabrique à
        partir de son nom et ne change plus ensuite : elle est dans des liens publics.
      </p>
      <Champ libelle="Sous quelle zone ?">
        {(a) => (
          <select
            {...a}
            className="champ"
            value={parentId}
            onChange={(ev) => choisirParent(ev.target.value)}
          >
            <option value="">Choisir…</option>
            {parents.map((d) => (
              <option key={d.id} value={d.id}>
                {cheminLisible(d.id, divisions)} ({libelleGenreDivision[d.genre].toLowerCase()})
              </option>
            ))}
          </select>
        )}
      </Champ>
      <Champ libelle="Genre">
        {(a) => (
          <select
            {...a}
            className="champ"
            value={genre}
            disabled={genres.length === 0}
            onChange={(ev) => setGenre(ev.target.value as Valeur<'geo_kind'>)}
          >
            {genres.map((g) => (
              <option key={g} value={g}>
                {libelleGenreDivision[g]}
              </option>
            ))}
          </select>
        )}
      </Champ>
      <Champ libelle="Nom">
        {(a) => (
          <input
            {...a}
            className="champ"
            type="text"
            autoComplete="off"
            maxLength={120}
            value={nom}
            onChange={(ev) => {
              setNom(ev.target.value);
              if (!adresseLibre) setAdresse(adresseDe(ev.target.value));
            }}
          />
        )}
      </Champ>
      <Champ
        libelle="Adresse (dans le lien)"
        aide="Lettres minuscules, chiffres et tirets : « mpaka », « centre-ville »."
      >
        {(a) => (
          <input
            {...a}
            className="champ"
            type="text"
            autoComplete="off"
            maxLength={60}
            value={adresse}
            onChange={(ev) => {
              setAdresse(ev.target.value);
              setAdresseLibre(true);
            }}
          />
        )}
      </Champ>
      {erreur && (
        <p className="message-erreur admin-pleine-largeur" role="alert">
          {erreur}
        </p>
      )}
      <div className="admin-actions admin-pleine-largeur">
        <button type="submit" className="bouton" disabled={enCours || !parent || nom.trim() === ''}>
          Ajouter la zone
        </button>
      </div>
    </form>
  );
}

export function NouveauLot({
  divisions,
  estOuverte,
  admin,
  surFait,
  zoneInitiale = '',
}: {
  divisions: DivisionVue[];
  /** La zone est-elle ouverte au relevé (elle-même, ou par une zone au-dessus) ? */
  estOuverte: (divisionId: string) => boolean;
  admin: PortAdministration;
  surFait: (texte: string) => void;
  /** La zone du volet : le lot se pose déjà dessus. */
  zoneInitiale?: string;
}) {
  const [nom, setNom] = useState('');
  const [divisionId, setDivisionId] = useState(zoneInitiale);
  const [rendreLe, setRendreLe] = useState('');
  const [essai, setEssai] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const creer = async (ev: { preventDefault: () => void }) => {
    ev.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      await admin.creerLot(nom.trim(), divisionId, rendreLe || null, essai);
      surFait(`Le lot ${nom.trim()} est créé. Active un relais dessus depuis l’onglet « Relais ».`);
      setNom('');
      setRendreLe('');
      setEssai(false);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form className="admin-motif" aria-label="Créer un lot" onSubmit={(ev) => void creer(ev)}>
      <p className="mention admin-pleine-largeur">
        Un lot est la zone qu’un relais parcourt : une ville, un arrondissement ou un quartier,
        n’importe où dans le pays. Il se pose sur une zone <b>ouverte</b> au relevé ; un lot
        d’entraînement se pose n’importe où.
      </p>
      <Champ libelle="Nom du lot">
        {(a) => (
          <input
            {...a}
            className="champ"
            type="text"
            autoComplete="off"
            maxLength={80}
            value={nom}
            onChange={(ev) => setNom(ev.target.value)}
          />
        )}
      </Champ>
      <Champ libelle="Zone">
        {(a) => (
          <select
            {...a}
            className="champ"
            value={divisionId}
            onChange={(ev) => setDivisionId(ev.target.value)}
          >
            <option value="">Choisir…</option>
            {divisions
              .filter((d) => d.niveau >= 2)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {cheminLisible(d.id, divisions)}
                  {estOuverte(d.id) ? '' : ' (fermée)'}
                </option>
              ))}
          </select>
        )}
      </Champ>
      <Champ libelle="À rendre pour le" facultatif>
        {(a) => (
          <input
            {...a}
            className="champ"
            type="date"
            value={rendreLe}
            onChange={(ev) => setRendreLe(ev.target.value)}
          />
        )}
      </Champ>
      <label className="rang admin-pleine-largeur">
        <input type="checkbox" checked={essai} onChange={(ev) => setEssai(ev.target.checked)} />
        <span>Lot d’entraînement : ses fiches ne sont jamais publiées.</span>
      </label>
      {erreur && (
        <p className="message-erreur admin-pleine-largeur" role="alert">
          {erreur}
        </p>
      )}
      <div className="admin-actions admin-pleine-largeur">
        <button
          type="submit"
          className="bouton"
          disabled={
            enCours || nom.trim() === '' || divisionId === '' || (!essai && !estOuverte(divisionId))
          }
        >
          Créer le lot
        </button>
        {divisionId !== '' && !essai && !estOuverte(divisionId) && (
          <span className="mention">
            Cette zone est fermée : ouvre-la d’abord, ou fais-en un lot d’entraînement.
          </span>
        )}
      </div>
    </form>
  );
}
