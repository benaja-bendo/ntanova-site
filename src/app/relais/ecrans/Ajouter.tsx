import { useEffect, useMemo, useRef, useState } from 'react';
import {
  avecPhoto,
  contactVide,
  demandeLesFormations,
  erreursEtape1,
  erreursEtape2,
  erreursEtape3,
  nouvelleContreVisite,
  nouvelleCorrection,
  nouvelleFiche,
  peutAjouterPhoto,
  photoEnseigne,
  PHOTOS_FACULTATIVES_MAX,
  photosFacultatives,
  sansPhoto,
  versContact,
  type ContactSaisi,
  type Erreurs,
  type FicheLocale,
  type PhotoLocale,
} from '../../../modele/fiche';
import { plusProche, PRECISION_SUFFISANTE_M, type Point } from '../../../modele/geo';
import { listes, type Valeur } from '../../../modele/listes';
import type { EcoleACompleter, ReleveRecu } from '../../../modele/ports';
import {
  libelleDirection,
  libelleFonction,
  libelleNiveau,
  libelleRolePhotoCourt,
  libelleTypeEcole,
} from '../../../modele/libelles';
import { brouillonEnCours } from '../actions-fiches';
import { base, garder, lireMemoire, oublier } from '../base-locale';
import { aller, useRelais } from '../contexte';
import { Bandeau, Champ, Choix, EnteteEtape, Icone } from '../composants';
import { journaliser } from '../journal';
import { alleger, PhotoTropLourde } from '../photo';
import { mesurerPosition, type ErreurPosition, type Mesure } from '../position';

/** Change des champs de la fiche en cours ; une fonction reçoit la fiche à jour (deux photos qui se suivent ne s'écrasent pas). */
type Modifier = (
  champs: Partial<FicheLocale> | ((fiche: FicheLocale) => Partial<FicheLocale>),
) => void;

/** Crée la fiche en cours si besoin, puis la garde dans le téléphone à chaque changement. */
function useFicheEnCours(): [FicheLocale | null, Modifier] {
  const [fiche, setFiche] = useState<FicheLocale | null>(null);
  useEffect(() => {
    let actif = true;
    void (async () => {
      const id = await lireMemoire('brouillon');
      let enCours = id ? await base.fiches.get(id) : undefined;
      if (!enCours || enCours.etat !== 'brouillon') {
        const profil = await lireMemoire('profil');
        enCours = nouvelleFiche(
          crypto.randomUUID(),
          new Date().toISOString(),
          profil?.lotId ?? null,
        );
        await base.fiches.put(enCours);
        await garder('brouillon', enCours.id);
      }
      if (actif) setFiche(enCours);
    })();
    return () => {
      actif = false;
    };
  }, []);

  const modifier: Modifier = (champs) => {
    setFiche((avant) => {
      if (!avant) return avant;
      const apres = { ...avant, ...(typeof champs === 'function' ? champs(avant) : champs) };
      void base.fiches.put(apres);
      return apres;
    });
  };
  return [fiche, modifier];
}

export function Ajouter({ etape }: { etape: 1 | 2 | 3 }) {
  const [fiche, modifier] = useFicheEnCours();
  if (!fiche) return <div className="ecran" aria-busy="true" />;
  if (etape === 1) return <Etape1 fiche={fiche} modifier={modifier} />;
  if (etape === 2) return <Etape2 fiche={fiche} modifier={modifier} />;
  return <Etape3 fiche={fiche} modifier={modifier} />;
}

function PiedEtape({ children }: { children: React.ReactNode }) {
  return <div className="pied-etape">{children}</div>;
}

/**
 * Abandonner la fiche en cours, à chaque étape : elle est effacée du téléphone. Une fiche rouverte pour être
 * modifiée l'est aussi (elle n'a pas encore été reçue par NTanova) ; l'école confiée au relais, elle, revient
 * dans « Mon secteur ».
 */
function BoutonAbandonner({ fiche }: { fiche: FicheLocale }) {
  const abandonner = async () => {
    if (!confirm('Abandonner cette fiche ? Ce qui a été saisi sera effacé du téléphone.')) return;
    await base.fiches.delete(fiche.id);
    await oublier('brouillon');
    aller('lot', true);
  };
  return (
    <button type="button" className="lien lien-discret" onClick={() => void abandonner()}>
      Abandonner cette fiche
    </button>
  );
}

function BoutonSuivant({ surClic, occupe = false }: { surClic: () => void; occupe?: boolean }) {
  return (
    <button type="button" className="bouton bouton-large" onClick={surClic} disabled={occupe}>
      Suivant
      <Icone nom="suivant" />
    </button>
  );
}

// 1/3 : photo et position ------------------------------------------------------

const messagesPosition: Record<ErreurPosition, string> = {
  refusee:
    'La position est bloquée. Dans Chrome, touchez le cadenas à gauche de l’adresse, autorisez la position, puis réessayez.',
  indisponible:
    'La position est introuvable. Sur un téléphone, activez la localisation. Sur un Mac, ouvrez Réglages Système, Confidentialité et sécurité, Service de localisation, et autorisez Chrome. Puis réessayez.',
  trop_longue: 'La position tarde. Sortez devant l’entrée, à découvert, puis réessayez.',
  absente: 'Ce téléphone ne donne pas sa position.',
};

function Etape1({ fiche, modifier }: { fiche: FicheLocale; modifier: Modifier }) {
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const [erreurPhoto, setErreurPhoto] = useState<string | null>(null);
  const [mesure, setMesure] = useState<Mesure | null>(null);
  const [erreurPosition, setErreurPosition] = useState<ErreurPosition | null>(null);
  // Ce que NTanova attend du relais (absent d'une école nouvelle : tout est demandé).
  const photoExigee = fiche.taches?.photo ?? true;
  const positionAttendue = fiche.taches?.position ?? true;
  const [recherche, setRecherche] = useState(!fiche.position && positionAttendue);
  const arret = useRef<() => void>(() => {});
  const monte = useRef(true);

  const [autresOuvert, setAutresOuvert] = useState(false);
  // Des photos en cours d'allègement : « Suivant » attend qu'elles soient gardées, sinon la fiche partirait sans elles.
  const [allegement, setAllegement] = useState(0);
  const [rolePhoto, setRolePhoto] = useState<'programs_board' | 'brochure' | 'building'>(
    'programs_board',
  );

  // Un aperçu par photo : les fichiers sont dans le téléphone (IndexedDB), jamais envoyés pour s'afficher.
  const apercus = useMemo(
    () =>
      Object.fromEntries(
        fiche.photos.flatMap((p) => (p.blob ? [[p.id, URL.createObjectURL(p.blob)] as const] : [])),
      ),
    [fiche.photos],
  );
  useEffect(
    () => () => Object.values(apercus).forEach((url) => URL.revokeObjectURL(url)),
    [apercus],
  );
  const enseigne = photoEnseigne(fiche);
  const autres = photosFacultatives(fiche);

  /** Allège la photo (moins de 200 Ko), puis la garde dans le téléphone avec son rôle. */
  const prendrePhoto = async (fichier: File | undefined, role: PhotoLocale['role']) => {
    if (!fichier) return;
    setErreurPhoto(null);
    setAllegement((n) => n + 1);
    try {
      const a = await alleger(fichier);
      const photo: PhotoLocale = {
        id: crypto.randomUUID(),
        role,
        blob: a.blob,
        mime: a.mime,
        octets: a.octets,
        largeur: a.largeur,
        hauteur: a.hauteur,
        prisLe: new Date().toISOString(),
        envoyee: false,
      };
      modifier((f) => ({ photos: avecPhoto(f, photo).photos }));
    } catch (e) {
      await journaliser(
        'ajouter-1',
        e instanceof PhotoTropLourde ? 'photo_trop_lourde' : 'photo_illisible',
        e,
      );
      setErreurPhoto('Cette photo ne peut pas être lue. Reprenez-la, ou choisissez-en une autre.');
    } finally {
      setAllegement((n) => n - 1);
    }
  };

  const verifier = async (m: Mesure) => {
    // La fiche qu'on corrige n'est pas un doublon d'elle-même : ni son relevé du téléphone, ni sa ligne du cache.
    const corrigee = fiche.corrigeReleveId;
    const ecoles = ((await lireMemoire('ecoles')) ?? []).filter((e) => e.id !== corrigee);
    const autres = (await base.fiches.toArray())
      .filter((f) => f.id !== fiche.id && f.id !== corrigee && f.position && f.type === 'releve')
      .map((f) => ({
        ...(f.position as Point),
        id: null,
        nom: f.nomEnseigne || 'une de vos fiches',
      }));
    // Un relevé pas encore accepté n'est pas un campus : si c'est « la même », son identifiant ne part jamais comme
    // identifiant de campus (la base le refuserait). Seul un campus connu est désigné par son identifiant.
    const connues = ecoles.map((e) => ({ ...e, id: e.genre === 'releve' ? null : e.id }));
    const proche = plusProche(m, [...connues, ...autres]);
    const champs: Partial<FicheLocale> = {
      position: { latitude: m.latitude, longitude: m.longitude },
      precisionM: m.precisionM,
      prisLe: m.prisLe,
      // Une contre-visite sait déjà quelle école elle visite : pas de question de doublon.
      ...(fiche.type === 'contre_visite'
        ? {}
        : {
            doublonPropose: proche ? { ecoleId: proche.id, nom: proche.nom } : null,
            reponseDoublon: null,
          }),
    };
    // Si le relais est déjà passé à l'étape 2, la position est gardée quand même.
    if (monte.current) modifier(champs);
    else await base.fiches.update(fiche.id, champs);
  };

  /** Écoute le GPS ; l'état ne change que dans les rappels. */
  const ecouterGps = () => {
    arret.current();
    const { fin, arreter } = mesurerPosition(setMesure);
    arret.current = arreter;
    fin
      .then(verifier)
      .catch((e: unknown) => {
        const code = (e instanceof Error ? e.message : 'indisponible') as ErreurPosition;
        setErreurPosition(code);
        void journaliser('ajouter-1', `position_${code}`);
      })
      .finally(() => setRecherche(false));
  };

  const prendrePosition = () => {
    setErreurPosition(null);
    setRecherche(true);
    ecouterGps();
  };

  useEffect(() => {
    monte.current = true;
    if (!fiche.position && positionAttendue) ecouterGps();
    return () => {
      monte.current = false;
      arret.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suivant = () => {
    const e = erreursEtape1(fiche);
    setErreurs(e);
    if (Object.keys(e).length === 0) aller('ajouter/2');
  };

  const precision = fiche.precisionM ?? mesure?.precisionM ?? null;

  return (
    <div className="ecran">
      <EnteteEtape etape={1} titre="Photo et position" retour="lot" type={fiche.type} />
      <main className="contenu-relais">
        <EncartTaches fiche={fiche} />

        <section className="carte-blanche pile-serree">
          <h2 className="titre-section">
            La photo de l'enseigne {!photoExigee && <span className="mention">facultatif</span>}
          </h2>
          {!photoExigee && !enseigne && (
            <p className="mention">
              NTanova a déjà la photo de l'enseigne. Reprenez-la seulement si elle est fausse.
            </p>
          )}
          {enseigne && apercus[enseigne.id] ? (
            <div className="apercu-photo">
              <img src={apercus[enseigne.id]} alt="La photo de l'enseigne" />
              <span className="etiquette-photo">Allégée pour l'envoi</span>
            </div>
          ) : (
            <div className="apercu-vide">
              <Icone nom="photo" taille={32} />
            </div>
          )}
          <div className="deux-colonnes">
            <label className="bouton bouton-petit">
              <Icone nom="galerie" />
              Galerie
              <input
                type="file"
                accept="image/*"
                className="cache"
                onChange={(e) => void prendrePhoto(e.target.files?.[0], 'signboard')}
              />
            </label>
            <label className="bouton bouton-secondaire bouton-petit">
              <Icone nom="photo" />
              Appareil photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="cache"
                onChange={(e) => void prendrePhoto(e.target.files?.[0], 'signboard')}
              />
            </label>
          </div>
          <p className="mention">
            Le plus sûr&nbsp;: photographiez avec l'appareil du téléphone, puis choisissez la photo
            dans la galerie. Cadrez l'enseigne et l'entrée, sans enfant.
          </p>
          {allegement > 0 && (
            <p className="mention" role="status">
              Allègement de la photo…
            </p>
          )}
          {(erreurPhoto ?? erreurs.photo) && (
            <p className="message-erreur" role="alert">
              {erreurPhoto ?? erreurs.photo}
            </p>
          )}
        </section>

        <section className="carte-blanche pile-serree" aria-labelledby="autres-photos">
          <h2 id="autres-photos" className="titre-section">
            Autres photos <span className="mention">facultatif</span>
          </h2>
          {autres.length > 0 && (
            <ul className="liste-photos">
              {autres.map((p) => (
                <li key={p.id} className="photo-ajoutee">
                  {apercus[p.id] && <img src={apercus[p.id]} alt={libelleRolePhotoCourt[p.role]} />}
                  <span>{libelleRolePhotoCourt[p.role]}</span>
                  <button
                    type="button"
                    className="lien lien-discret"
                    aria-label={`Retirer la photo : ${libelleRolePhotoCourt[p.role]}`}
                    onClick={() => modifier((f) => ({ photos: sansPhoto(f, p.id).photos }))}
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          )}
          {peutAjouterPhoto(fiche) && !autresOuvert && (
            <button
              type="button"
              className="bouton bouton-secondaire bouton-petit"
              onClick={() => setAutresOuvert(true)}
            >
              + Ajouter d'autres photos (max {PHOTOS_FACULTATIVES_MAX})
            </button>
          )}
          {peutAjouterPhoto(fiche) && autresOuvert && (
            <>
              <Choix
                legende="Que montre cette photo ?"
                options={(['programs_board', 'brochure', 'building'] as const).map((r) => ({
                  valeur: r,
                  libelle: libelleRolePhotoCourt[r],
                }))}
                valeurs={[rolePhoto]}
                surChoix={setRolePhoto}
                colonnes={1}
              />
              <div className="deux-colonnes">
                <label className="bouton bouton-petit">
                  <Icone nom="galerie" />
                  Galerie
                  <input
                    type="file"
                    accept="image/*"
                    className="cache"
                    aria-label="Galerie : autre photo"
                    onChange={(e) => {
                      void prendrePhoto(e.target.files?.[0], rolePhoto);
                      e.target.value = '';
                    }}
                  />
                </label>
                <label className="bouton bouton-secondaire bouton-petit">
                  <Icone nom="photo" />
                  Appareil photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="cache"
                    aria-label="Appareil photo : autre photo"
                    onChange={(e) => {
                      void prendrePhoto(e.target.files?.[0], rolePhoto);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </>
          )}
          <p className="mention">
            {autres.length}/{PHOTOS_FACULTATIVES_MAX} en plus de l'enseigne. Un panneau ou une
            affiche qui liste les filières, un prospectus remis par l'école, une autre vue du
            bâtiment (toujours sans enfant). Un prospectus, oui : jamais une liste d'élèves ni un
            bulletin.
          </p>
        </section>

        <section className="carte-blanche pile-serree">
          <h2 className="titre-section">La position, devant l'entrée</h2>
          {recherche && (
            <p className="rang" aria-live="polite">
              <span className="roue" aria-hidden="true" />
              Recherche de la position
              {mesure ? ` · précision ${Math.round(mesure.precisionM)} m` : '…'}
            </p>
          )}
          {!recherche && fiche.position && precision !== null && (
            <>
              <p className="rang">
                <Icone nom="coche" taille={16} />
                <span>
                  <b>Position prise</b> · précision {Math.round(precision)}&nbsp;m
                </span>
              </p>
              {precision > PRECISION_SUFFISANTE_M && (
                <p className="message-attention">
                  La précision est faible. Placez-vous devant l'entrée, à découvert, puis reprenez
                  la position.
                </p>
              )}
            </>
          )}
          {erreurPosition && (
            <p className="message-erreur" role="alert">
              {messagesPosition[erreurPosition]}
            </p>
          )}
          {!positionAttendue && !fiche.position && !recherche && !erreurPosition && (
            <p className="mention">
              NTanova connaît déjà la position de cette école. Reprenez-la seulement si elle est
              fausse.
            </p>
          )}
          {!recherche && (
            <button
              type="button"
              className="bouton bouton-secondaire bouton-petit"
              onClick={prendrePosition}
            >
              {fiche.position ? 'Reprendre la position' : 'Prendre la position'}
            </button>
          )}
          {erreurPosition && !fiche.position && (
            <p className="mention">Sans position, vous pouvez continuer&nbsp;: NTanova le verra.</p>
          )}
        </section>

        {fiche.type !== 'contre_visite' && fiche.doublonPropose && (
          <section className="bandeau bandeau-attente pile-serree" aria-label="Doublon possible">
            <p>
              <b>Une école est déjà relevée à 40&nbsp;m&nbsp;:</b> {fiche.doublonPropose.nom}.
              Est-ce la même&nbsp;?
            </p>
            <Choix
              legende="Est-ce la même école ?"
              options={[
                { valeur: 'la_meme', libelle: 'Oui, la même' },
                { valeur: 'une_autre', libelle: 'Non, une autre' },
              ]}
              valeurs={fiche.reponseDoublon ? [fiche.reponseDoublon] : []}
              surChoix={(v) => modifier({ reponseDoublon: v })}
              colonnes={2}
              erreur={erreurs.reponseDoublon}
            />
          </section>
        )}

        <BoutonAbandonner fiche={fiche} />
      </main>
      <PiedEtape>
        <BoutonSuivant surClic={suivant} occupe={allegement > 0} />
      </PiedEtape>
    </div>
  );
}

// 2/3 : ce qui se voit de la rue -----------------------------------------------

function Etape2({ fiche, modifier }: { fiche: FicheLocale; modifier: Modifier }) {
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const suivant = () => {
    const e = erreursEtape2(fiche);
    setErreurs(e);
    if (Object.keys(e).length === 0) aller('ajouter/3');
  };
  const basculerNiveau = (n: Valeur<'niveau'>) =>
    modifier({
      niveaux: fiche.niveaux.includes(n)
        ? fiche.niveaux.filter((x) => x !== n)
        : listes.niveau.filter((x) => x === n || fiche.niveaux.includes(x)),
    });

  return (
    <div className="ecran">
      <EnteteEtape
        etape={2}
        titre="Ce qui se voit de la rue"
        retour="ajouter/1"
        type={fiche.type}
      />
      <main className="contenu-relais">
        <Bandeau ton="public" icone="oeil">
          <p>
            <b>Public.</b> Ces informations paraîtront sur la fiche. Notez seulement ce qui est
            écrit ou visible depuis la rue.
          </p>
        </Bandeau>

        {fiche.taches && (
          <p className="mention">
            {fiche.taches.informations
              ? 'Ces informations viennent de la fiche de NTanova. Vérifiez-les sur place et corrigez ce qui est faux.'
              : 'Ces informations viennent de la fiche. Corrigez-les seulement si elles sont fausses.'}
          </p>
        )}

        <Champ libelle="Nom sur l'enseigne" erreur={erreurs.nomEnseigne}>
          {(a) => (
            <input
              {...a}
              className="champ"
              type="text"
              autoComplete="off"
              placeholder="Ex. : Complexe scolaire [Nom]"
              value={fiche.nomEnseigne}
              onChange={(e) => modifier({ nomEnseigne: e.target.value })}
            />
          )}
        </Champ>

        <Choix
          legende="Niveaux écrits sur l'enseigne"
          options={listes.niveau.map((n) => ({ valeur: n, libelle: libelleNiveau[n] }))}
          valeurs={fiche.niveaux}
          surChoix={basculerNiveau}
          colonnes={2}
          erreur={erreurs.niveaux}
        />

        {demandeLesFormations(fiche.niveaux) && (
          <section className="carte-blanche pile-serree" aria-label="Séries et formations">
            <Champ
              libelle="Séries, filières ou formations visibles"
              facultatif
              aide="Ex. : séries C et D, BTS gestion, licence en droit. Notez ce qui est écrit sur l'enseigne ou sur un panneau."
              erreur={erreurs.programmesVus}
            >
              {(a) => (
                <input
                  {...a}
                  className="champ"
                  type="text"
                  autoComplete="off"
                  placeholder="Ex. : séries C et D, BTS gestion"
                  value={fiche.programmesVus ?? ''}
                  onChange={(e) => modifier({ programmesVus: e.target.value })}
                />
              )}
            </Champ>
            <label className="case">
              <input
                type="checkbox"
                checked={fiche.programmesEnPhoto ?? false}
                onChange={(e) => modifier({ programmesEnPhoto: e.target.checked })}
              />
              Je les ai prises en photo (panneau, affiche ou prospectus)
            </label>
            {fiche.programmesEnPhoto &&
              !fiche.photos.some((p) => p.role === 'programs_board' || p.role === 'brochure') && (
                <p className="message-attention">
                  Ajoutez cette photo à l'étape 1/3 («&nbsp;+ Ajouter d'autres photos&nbsp;»).{' '}
                  <button type="button" className="lien" onClick={() => aller('ajouter/1')}>
                    Retour à la photo
                  </button>
                </p>
              )}
          </section>
        )}

        <div className="pile-serree">
          <Choix
            legende="Type d'école"
            options={(Object.keys(libelleTypeEcole) as Valeur<'type_ecole'>[]).map((t) => ({
              valeur: t,
              libelle: libelleTypeEcole[t],
            }))}
            valeurs={[fiche.typeEcole]}
            surChoix={(t) => modifier({ typeEcole: t })}
            colonnes={2}
            erreur={erreurs.typeEcole}
          />
          <p className="mention">
            <b>Pas indiqué</b>&nbsp;: rien d'écrit. <b>Autre</b>&nbsp;: c'est écrit mais ça ne
            rentre pas, dites-le dans la ligne du dessous.
          </p>
        </div>

        <Champ
          libelle="Programme, langues ou autre mention écrite"
          facultatif
          erreur={erreurs.programme}
        >
          {(a) => (
            <input
              {...a}
              className="champ"
              type="text"
              autoComplete="off"
              placeholder="Ex. : français-congolais, bilingue"
              value={fiche.programme ?? ''}
              onChange={(e) => modifier({ programme: e.target.value })}
            />
          )}
        </Champ>

        <Champ libelle="Repère" facultatif erreur={erreurs.repere}>
          {(a) => (
            <input
              {...a}
              className="champ"
              type="text"
              autoComplete="off"
              placeholder="Ex. : face au marché, derrière la pharmacie"
              value={fiche.repere}
              onChange={(e) => modifier({ repere: e.target.value })}
            />
          )}
        </Champ>

        <Champ
          libelle="Numéro écrit sur l'enseigne"
          facultatif
          aide="S'il y en a un. C'est le numéro public de l'école."
          erreur={erreurs.numeroEnseigne}
        >
          {(a) => (
            <input
              {...a}
              className="champ"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="+242 …"
              value={fiche.numeroEnseigne}
              onChange={(e) => modifier({ numeroEnseigne: e.target.value })}
            />
          )}
        </Champ>

        <BoutonAbandonner fiche={fiche} />
      </main>
      <PiedEtape>
        <BoutonSuivant surClic={suivant} />
      </PiedEtape>
    </div>
  );
}

// 3/3 : la direction --------------------------------------------------------------

function Etape3({ fiche, modifier }: { fiche: FicheLocale; modifier: Modifier }) {
  const { synchroniser } = useRelais();
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const contact = fiche.contact ?? contactVide();
  const modifierContact = (champs: Partial<ContactSaisi>) =>
    modifier({ contact: { ...contact, ...champs } });

  // Le contact de la direction est déjà confirmé, ou déjà parti avec la fiche qu'on corrige : rien à redemander.
  const choixDeLaDirection = !fiche.taches || fiche.taches.direction;

  const choisirDirection = (direction: Valeur<'direction_vue'>) =>
    modifier({ direction, contact: direction === 'absente' ? null : contact });

  const enregistrer = async () => {
    const e = erreursEtape3(fiche);
    setErreurs(e);
    if (Object.keys(e).length > 0) return;
    const prete: FicheLocale = {
      ...fiche,
      contact: fiche.direction === 'absente' ? null : fiche.contact,
      etat: 'a_envoyer',
      envoyes: { releve: false, photo: false, contact: versContact(fiche) === null },
      // Une fiche modifiée repart comme neuve : ni refus, ni essais ratés d'avant.
      rejet: null,
      essais: 0,
    };
    await base.fiches.put(prete);
    await oublier('brouillon');
    aller('fiches', true);
    synchroniser();
  };

  return (
    <div className="ecran">
      <EnteteEtape etape={3} titre="La direction" retour="ajouter/2" type={fiche.type} />
      <main className="contenu-relais">
        <Bandeau ton="prive" icone="cadenas">
          <p>
            <b>Privé.</b> Seul NTanova voit cette partie. Elle s'efface du téléphone une fois
            envoyée.
          </p>
        </Bandeau>

        {!choixDeLaDirection && (
          <section className="carte-blanche pile-serree" aria-label="Rien à refaire">
            <p>
              <b>Rien à refaire ici.</b>{' '}
              {fiche.type === 'correction'
                ? 'Le contact de la direction est déjà parti avec cette fiche.'
                : 'Le contact de la direction est déjà confirmé.'}
            </p>
          </section>
        )}

        {choixDeLaDirection && (
          <>
            <Choix
              legende="Avez-vous vu la direction ?"
              options={listes.direction_vue.map((d) => ({
                valeur: d,
                libelle: libelleDirection[d],
              }))}
              valeurs={fiche.direction ? [fiche.direction] : []}
              surChoix={choisirDirection}
              colonnes={3}
              erreur={erreurs.direction}
            />

            {fiche.direction === 'vue' && (
              <ChampsContact
                contact={contact}
                modifierContact={modifierContact}
                erreurs={erreurs}
              />
            )}

            {fiche.direction === 'absente' && (
              <>
                <Champ libelle="Quand repasser ?" facultatif>
                  {(a) => (
                    <input
                      {...a}
                      className="champ"
                      type="text"
                      autoComplete="off"
                      placeholder="Ex. : lundi matin, avant 10 h"
                      value={fiche.repasser}
                      onChange={(e) => modifier({ repasser: e.target.value })}
                    />
                  )}
                </Champ>
                <p className="mention">
                  La fiche part quand même. Vous repasserez voir la direction.
                </p>
              </>
            )}

            {fiche.direction === 'refus' && (
              <>
                <Champ libelle="Ce qu'on vous a dit" facultatif erreur={erreurs.note}>
                  {(a) => (
                    <textarea
                      {...a}
                      className="champ"
                      rows={3}
                      placeholder="Ex. : la direction ne veut pas apparaître"
                      value={contact.note}
                      onChange={(e) => modifierContact({ note: e.target.value })}
                    />
                  )}
                </Champ>
                <p className="mention">
                  NTanova lit chaque refus avant de publier quoi que ce soit.
                </p>
              </>
            )}
          </>
        )}

        <BoutonAbandonner fiche={fiche} />
      </main>
      <PiedEtape>
        <button type="button" className="bouton bouton-large" onClick={() => void enregistrer()}>
          <Icone nom="coche" />
          Enregistrer la fiche
        </button>
      </PiedEtape>
    </div>
  );
}

/**
 * Les champs du contact de la direction : sa fonction, son accord, son nom, son WhatsApp. Ceux de l'étape 3/3, et ceux de
 * « J'ai revu la direction » (ajouter le contact après « À repasser »).
 */
export function ChampsContact({
  contact,
  modifierContact,
  erreurs,
}: {
  contact: ContactSaisi;
  modifierContact: (champs: Partial<ContactSaisi>) => void;
  erreurs: Erreurs;
}) {
  return (
    <>
      <Champ libelle="Sa fonction" erreur={erreurs.fonction}>
        {(a) => (
          <select
            {...a}
            className="champ"
            value={contact.fonction ?? ''}
            onChange={(e) =>
              modifierContact({
                fonction: (e.target.value || null) as Valeur<'fonction_direction'> | null,
              })
            }
          >
            <option value="">Choisir</option>
            {listes.fonction_direction.map((f) => (
              <option key={f} value={f}>
                {libelleFonction[f]}
              </option>
            ))}
          </select>
        )}
      </Champ>

      <section className="carte-blanche pile-serree">
        <label className="case">
          <input
            type="checkbox"
            checked={contact.accord}
            onChange={(e) =>
              modifierContact({
                accord: e.target.checked,
                accordLe: e.target.checked ? new Date().toISOString() : null,
                whatsapp: e.target.checked ? contact.whatsapp : '',
              })
            }
          />
          La personne accepte que NTanova lui écrive sur WhatsApp
        </label>
        <p className="mention">
          À lui dire&nbsp;: «&nbsp;Votre numéro ne sera jamais publié. NTanova vous écrira au sujet
          de la fiche de l'école, et l'effacera si vous le demandez.&nbsp;»
        </p>
        <p className="message-attention">Sans son accord, ne notez pas son numéro.</p>
      </section>

      <Champ libelle="Son nom" facultatif erreur={erreurs.nom}>
        {(a) => (
          <input
            {...a}
            className="champ"
            type="text"
            autoComplete="off"
            placeholder="M. ou Mme [Nom]"
            value={contact.nom}
            onChange={(e) => modifierContact({ nom: e.target.value })}
          />
        )}
      </Champ>
      <Champ
        libelle="Son WhatsApp"
        facultatif
        aide={contact.accord ? undefined : 'Seulement avec son accord (case ci-dessus).'}
        erreur={erreurs.whatsapp}
      >
        {(a) => (
          <input
            {...a}
            className="champ"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+242 …"
            disabled={!contact.accord}
            value={contact.whatsapp}
            onChange={(e) => modifierContact({ whatsapp: e.target.value })}
          />
        )}
      </Champ>
    </>
  );
}

/**
 * Depuis « Mon secteur » : on complète une école que NTanova connaît. Le téléphone ne garde qu'une fiche en cours : si
 * une autre l'est déjà, on ne l'écrase pas.
 */
export async function commencerContreVisite(
  ecole: EcoleACompleter,
): Promise<'ok' | 'brouillon_existant'> {
  if (await brouillonEnCours()) return 'brouillon_existant';
  const profil = await lireMemoire('profil');
  const fiche = nouvelleContreVisite(
    crypto.randomUUID(),
    new Date().toISOString(),
    profil?.lotId ?? null,
    ecole,
  );
  await base.fiches.put(fiche);
  await garder('brouillon', fiche.id);
  aller('ajouter/1');
  return 'ok';
}

/**
 * Depuis « Mes fiches » : une correction, qui part comme une nouvelle fiche liée à l'ancienne, avec tout ce que le
 * relais avait saisi. Comme ci-dessus, jamais en écrasant une fiche en cours.
 */
export async function commencerCorrection(recu: ReleveRecu): Promise<'ok' | 'brouillon_existant'> {
  if (await brouillonEnCours()) return 'brouillon_existant';
  const profil = await lireMemoire('profil');
  const fiche = nouvelleCorrection(
    crypto.randomUUID(),
    new Date().toISOString(),
    profil?.lotId ?? null,
    recu,
  );
  await base.fiches.put(fiche);
  await garder('brouillon', fiche.id);
  aller('ajouter/1');
  return 'ok';
}

/** Ce que NTanova attend du relais sur cette école, en tête de la première étape. */
function EncartTaches({ fiche }: { fiche: FicheLocale }) {
  const taches = fiche.taches;
  if (!taches) return null;
  const lignes = [
    {
      nom: 'Photo de l’enseigne',
      faire: taches.photo,
      fait: 'Déjà chez NTanova · facultative',
      a: 'À prendre',
    },
    {
      nom: 'Position devant l’entrée',
      faire: taches.position,
      fait: 'Déjà connue · facultative',
      a: 'À prendre',
    },
    {
      nom: 'Informations (étape 2/3)',
      faire: taches.informations,
      fait: 'Reprises de la fiche · à corriger au besoin',
      a: 'À vérifier',
    },
    {
      nom: 'La direction (étape 3/3)',
      faire: taches.direction,
      fait: 'Rien à refaire',
      a: 'À voir',
    },
  ];
  return (
    <section
      className="carte-blanche pile-serree encart-taches"
      aria-label="À faire sur cette école"
    >
      <p className="surtitre">À faire sur cette école</p>
      <p>
        <b>
          {fiche.type === 'correction' ? 'Corriger' : 'Compléter'}&nbsp;: {fiche.nomEnseigne}.
        </b>{' '}
        {taches.titre}
      </p>
      {taches.consigne && (
        <p className="message-ntanova">
          <b>NTanova&nbsp;:</b> {taches.consigne}
        </p>
      )}
      <ul className="liste-taches">
        {lignes.map((l) => (
          <li key={l.nom}>
            <span>{l.nom}</span>
            <span className={`etiquette ${l.faire ? 'etat-attente' : 'etat-verifiee'}`}>
              {l.faire ? l.a : l.fait}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
