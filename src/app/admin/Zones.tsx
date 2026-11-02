/**
 * Les zones et les lots. La géographie va du pays au quartier ; une zone est fermée aux relais tant qu'on ne
 * l'ouvre pas (ouvrir une ville ouvre tout ce qu'elle contient), et un lot se pose sur n'importe quelle ville,
 * n'importe quel arrondissement ou quartier.
 *
 * Ouvrir une zone n'est pas annoncer une couverture : le site n'affiche que ce qui est publié.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cheminLisible } from '../../modele/geo-divisions';
import { libelleGenreDivision } from '../../modele/libelles';
import type { Valeur } from '../../modele/listes';
import type { DivisionVue, LotVu, PortAdministration, RelaisVu } from '../../modele/ports';
import { Bandeau, Champ, jour } from '../../ui/composants';
import { messageErreur } from './ChampPosition';

/** Les genres qu'une division peut avoir sous un parent de ce niveau (voir `geo_divisions_genre_du_niveau`). */
const GENRES_SOUS: Record<number, readonly Valeur<'geo_kind'>[]> = {
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

function AjouterDivision({
  divisions,
  estOuverte,
  admin,
  surFait,
}: {
  divisions: DivisionVue[];
  /** La zone est-elle ouverte au relevé (elle-même, ou par une zone au-dessus d'elle) ? */
  estOuverte: (divisionId: string) => boolean;
  admin: PortAdministration;
  surFait: (texte: string) => void;
}) {
  const parents = divisions.filter((d) => d.niveau <= 3);
  const [parentId, setParentId] = useState('');
  const parent = parents.find((d) => d.id === parentId);
  const genres = parent ? (GENRES_SOUS[parent.niveau] ?? []) : [];
  const [genre, setGenre] = useState<Valeur<'geo_kind'>>('quarter');
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
      await admin.ajouterDivision(parent.id, genre, nom.trim(), adresse.trim() || adresseDe(nom));
      // Une zone nouvelle n'est pas ouverte en soi ; elle l'est par la zone qui la contient, si celle-ci l'est.
      surFait(
        `${nom.trim()} est ajouté sous ${parent.nom}. ` +
          (estOuverte(parent.id)
            ? 'Les relais peuvent y relever, comme dans tout ce que contient sa zone.'
            : 'Fermé aux relais : ouvre-le quand tu veux.'),
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
    <form
      className="admin-motif carte-blanche"
      aria-label="Ajouter une zone"
      onSubmit={(ev) => void valider(ev)}
    >
      <h2 className="titre-section admin-pleine-largeur">Ajouter une zone</h2>
      <p className="mention admin-pleine-largeur">
        Un département sous un pays, une ville sous un département, un arrondissement sous une
        ville, un quartier ou une zone sous un arrondissement. L’adresse d’une zone ne change plus
        ensuite : elle est dans des liens publics.
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

function NouveauLot({
  divisions,
  estOuverte,
  admin,
  surFait,
}: {
  divisions: DivisionVue[];
  /** La zone est-elle ouverte au relevé (elle-même, ou par une zone au-dessus) ? */
  estOuverte: (divisionId: string) => boolean;
  admin: PortAdministration;
  surFait: (texte: string) => void;
}) {
  const [nom, setNom] = useState('');
  const [divisionId, setDivisionId] = useState('');
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
    <form
      className="admin-motif carte-blanche"
      aria-label="Créer un lot"
      onSubmit={(ev) => void creer(ev)}
    >
      <h2 className="titre-section admin-pleine-largeur">Créer un lot</h2>
      <p className="mention admin-pleine-largeur">
        Un lot est la zone qu’un relais parcourt : une ville, un arrondissement ou un quartier,
        n’importe où dans le pays. Il se pose sur une zone <b>ouverte</b> au relevé (ouvre-la
        d’abord dans le tableau ci-dessus) ; un lot d’entraînement se pose n’importe où.
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

export function Zones({ admin }: { admin: PortAdministration }) {
  const [divisions, setDivisions] = useState<DivisionVue[] | null>(null);
  const [lots, setLots] = useState<LotVu[]>([]);
  const [relais, setRelais] = useState<RelaisVu[]>([]);
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(() => {
    Promise.all([admin.divisions(), admin.lots(), admin.relais()])
      .then(([d, l, r]) => {
        setDivisions(d);
        setLots(l);
        setRelais(r);
        setErreur(null);
      })
      .catch(() => setErreur('La base ne répond pas. Vérifie le réseau et recharge la page.'));
  }, [admin]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Ouverte : par elle-même ou par une zone au-dessus d'elle.
  const ouvertePar = useMemo(() => {
    const parChemin = new Map((divisions ?? []).map((d) => [d.chemin, d]));
    const resultat = new Map<string, DivisionVue | null>();
    for (const d of divisions ?? []) {
      let trouve: DivisionVue | null = null;
      const morceaux = d.chemin.split('.');
      for (let n = morceaux.length; n >= 1 && !trouve; n--) {
        const x = parChemin.get(morceaux.slice(0, n).join('.'));
        if (x?.ouverte) trouve = x;
      }
      resultat.set(d.id, trouve);
    }
    return resultat;
  }, [divisions]);

  const basculer = async (d: DivisionVue, ouverte: boolean) => {
    setEnCours(true);
    setErreur(null);
    try {
      await admin.ouvrirZone(d.id, ouverte);
      setAnnonce(
        ouverte
          ? `${d.nom} est ouverte au relevé (avec tout ce qu’elle contient).`
          : `${d.nom} n’est plus ouverte au relevé.`,
      );
      charger();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  // Un secteur est « rendu » quand l'administration le déclare terminé : c'est ce que compte la mesure, à sa date.
  const rendre = async (l: LotVu, rendu: boolean) => {
    setEnCours(true);
    setErreur(null);
    try {
      await admin.marquerLotRendu(l.id, rendu);
      setAnnonce(
        rendu ? `Le lot « ${l.nom} » est marqué rendu.` : `Le lot « ${l.nom} » est remis en cours.`,
      );
      charger();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  const requete = recherche
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
  const visibles = (divisions ?? []).filter(
    (d) =>
      requete === '' ||
      d.nom
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .includes(requete),
  );

  return (
    <div className="pile">
      <div className="admin-titre">
        <div>
          <h1>Zones et lots</h1>
          <p className="texte-doux">
            Les relais ne relèvent que dans une zone ouverte. Ouvrir une zone ouvre tout ce qu’elle
            contient. Les écoles ajoutées par toi ou importées sont comptées à part de celles qu’un
            relais a relevées.
          </p>
        </div>
      </div>

      {erreur && (
        <Bandeau ton="erreur" icone="alerte">
          <p>{erreur}</p>
        </Bandeau>
      )}
      {annonce && (
        <p className="bandeau bandeau-envoye" role="status">
          {annonce}
        </p>
      )}

      <Champ libelle="Chercher une zone" facultatif>
        {(a) => (
          <input
            {...a}
            className="champ"
            type="search"
            autoComplete="off"
            value={recherche}
            onChange={(ev) => setRecherche(ev.target.value)}
          />
        )}
      </Champ>

      <div className="admin-tableau">
        <table>
          <thead>
            <tr>
              <th scope="col">Zone</th>
              <th scope="col">Écoles</th>
              <th scope="col">Publiées</th>
              <th scope="col">Relevées / ajoutées / importées</th>
              <th scope="col">Relevé</th>
            </tr>
          </thead>
          <tbody>
            {divisions === null && !erreur && (
              <tr>
                <td colSpan={5} className="texte-doux" aria-busy="true">
                  Chargement des zones…
                </td>
              </tr>
            )}
            {visibles.map((d) => {
              const par = ouvertePar.get(d.id);
              return (
                <tr key={d.id}>
                  <td style={{ paddingLeft: `calc(var(--espace-4) + ${d.niveau} * 1.25rem)` }}>
                    <b>{d.nom}</b>
                    <span className="mention admin-sous-ligne">
                      {libelleGenreDivision[d.genre]}
                    </span>
                  </td>
                  <td>{d.ecoles}</td>
                  <td>{d.publiees}</td>
                  <td>
                    {d.relevees} / {d.ajoutees} / {d.importees}
                  </td>
                  <td>
                    {par && par.id !== d.id ? (
                      <span className="etiquette etat-envoye">Ouverte par {par.nom}</span>
                    ) : par ? (
                      <button
                        type="button"
                        className="bouton bouton-secondaire bouton-petit"
                        disabled={enCours}
                        aria-label={`Fermer ${d.nom} au relevé`}
                        onClick={() => void basculer(d, false)}
                      >
                        Ouverte : fermer
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="bouton bouton-petit"
                        disabled={enCours}
                        aria-label={`Ouvrir ${d.nom} au relevé`}
                        onClick={() => void basculer(d, true)}
                      >
                        Fermée : ouvrir
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {divisions && (
        <>
          <AjouterDivision
            divisions={divisions}
            estOuverte={(id) => ouvertePar.get(id) != null}
            admin={admin}
            surFait={(texte) => {
              setAnnonce(texte);
              charger();
            }}
          />
          <NouveauLot
            divisions={divisions}
            estOuverte={(id) => ouvertePar.get(id) != null}
            admin={admin}
            surFait={(texte) => {
              setAnnonce(texte);
              charger();
            }}
          />
        </>
      )}

      <h2>Les lots</h2>
      <div className="admin-tableau">
        <table>
          <thead>
            <tr>
              <th scope="col">Lot</th>
              <th scope="col">Zone</th>
              <th scope="col">À rendre</th>
              <th scope="col">Rendu</th>
              <th scope="col">Relais actifs</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => (
              <tr key={l.id}>
                <td>
                  <b>{l.nom}</b>
                </td>
                <td>{divisions ? cheminLisible(l.divisionId, divisions) : l.divisionNom}</td>
                <td>{l.aRendreLe ? jour(l.aRendreLe) : '—'}</td>
                <td>
                  {l.essai ? (
                    '—'
                  ) : l.renduLe ? (
                    <>
                      Rendu le {jour(l.renduLe)}{' '}
                      <button
                        type="button"
                        className="bouton bouton-secondaire bouton-petit"
                        disabled={enCours}
                        onClick={() => void rendre(l, false)}
                      >
                        Remettre en cours
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="bouton bouton-secondaire bouton-petit"
                      disabled={enCours}
                      onClick={() => void rendre(l, true)}
                    >
                      Marquer rendu
                    </button>
                  )}
                </td>
                <td>{relais.filter((r) => r.lotId === l.id && r.statut === 'actif').length}</td>
                <td className="mention">
                  {l.essai
                    ? 'Entraînement : ses fiches ne sont jamais publiées.'
                    : 'Toute la zone.'}
                  {divisions &&
                    !ouvertePar.get(l.divisionId) &&
                    !l.essai &&
                    ' La zone est fermée : ouvre-la pour que les relais puissent envoyer.'}
                </td>
              </tr>
            ))}
            {lots.length === 0 && (
              <tr>
                <td colSpan={6} className="texte-doux">
                  Aucun lot.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
