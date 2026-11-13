import { ConfirmationAction } from '../../../ui/ConfirmationAction';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  avecPhoto,
  ajouterUnePersonne,
  contactVide,
  demandeLesFormations,
  erreursEtape1,
  erreursEtape2,
  erreursEtape3,
  nouvelleContreVisite,
  nouvelleCorrection,
  nouvelleFiche,
  photoEnseigne,
  retirerUnePersonne,
  type ContactSaisi,
  type Erreurs,
  type FicheLocale,
  type PhotoLocale,
} from '../../../modele/fiche';
import { PERSONNES_MAX } from '../../../modele/contacts';
import { lireFormationsVues, sansLesFormationsDuCycle } from '../../../modele/formations-rapides';
import {
  REPERES_RAPIDES,
  basculerRepere,
  repereCoche,
  repereManquant,
} from '../../../modele/repere';
import { plusProche, PRECISION_SUFFISANTE_M, type Point } from '../../../modele/geo';
import { listes, type Valeur } from '../../../modele/listes';
import type { EcoleACompleter, ReleveRecu } from '../../../modele/ports';
import { normaliserTelephone, numeroCongolaisSuspect } from '../../../modele/telephone';
import {
  libelleDirection,
  libelleFonction,
  libelleNiveau,
  libelleTypeEcole,
} from '../../../modele/libelles';
import { brouillonDuCompte } from '../actions-fiches';
import { base, lireMemoire } from '../base-locale';
import { aller } from '../contexte';
import { Bandeau, Champ, Choix, EnteteEtape, Icone } from '../composants';
import { journaliser } from '../journal';
import { alleger, PhotoTropLourde } from '../photo';
import { mesurerPosition, type ErreurPosition, type Mesure } from '../position';
import { AidePosition } from './AidePosition';
import { FormationsRapides } from './FormationsRapides';
import { aideDePrecision, lireErreurPosition } from '../../../modele/aide-position';
import { environnementActuel, etatDeLAutorisation } from '../environnement';
import { useReprisePosition } from '../reprise-position';
import { PhotosRecues, PositionRecue, VoirSurLaCarte } from './DejaRecu';
import { Bonus, EnvoyerSansBonus } from './Bonus';
import { DejaSurNTanova } from './DejaSurNTanova';
import { useEnregistrer, type Modifier } from './fiche-en-cours';

/** Les fiches qui ont déjà eu leur relance sur le repère (l'étape 2/3 en fait une seule par fiche). */
const fichesDejaRelancees = new Set<string>();

/** Crée la fiche en cours si besoin, puis la garde dans le téléphone à chaque changement. */
function useFicheEnCours(): [FicheLocale | null, Modifier] {
  const [fiche, setFiche] = useState<FicheLocale | null>(null);
  useEffect(() => {
    let actif = true;
    void (async () => {
      // Le brouillon de ce compte : jamais celui d'un autre relais qui s'est servi du téléphone.
      let enCours = await brouillonDuCompte();
      if (!enCours) {
        const profil = await lireMemoire('profil');
        enCours = {
          ...nouvelleFiche(crypto.randomUUID(), new Date().toISOString(), profil?.lotId ?? null),
          compteId: profil?.id ?? null,
        };
        await base.fiches.put(enCours);
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

export function Ajouter({ etape }: { etape: 1 | 2 | 3 | 4 }) {
  const [fiche, modifier] = useFicheEnCours();
  if (!fiche) return <div className="ecran" aria-busy="true" />;
  if (etape === 1) return <Etape1 fiche={fiche} modifier={modifier} />;
  if (etape === 2) return <Etape2 fiche={fiche} modifier={modifier} />;
  if (etape === 3) return <Etape3 fiche={fiche} modifier={modifier} />;
  return <Bonus fiche={fiche} modifier={modifier} />;
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
    await base.fiches.delete(fiche.id);
    aller('lot', true);
  };
  return (
    <ConfirmationAction
      libelle="Abandonner cette fiche"
      titre="Abandonner cette fiche ?"
      description="Ce qui a été saisi sera effacé du téléphone. Cette action est définitive."
      confirmer="Oui, abandonner la fiche"
      classe="lien lien-discret"
      surConfirmer={abandonner}
    />
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

function Etape1({ fiche, modifier }: { fiche: FicheLocale; modifier: Modifier }) {
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const [erreurPhoto, setErreurPhoto] = useState<string | null>(null);
  const [mesure, setMesure] = useState<Mesure | null>(null);
  const [erreurPosition, setErreurPosition] = useState<ErreurPosition | null>(null);
  // Le téléphone et le navigateur du relais : l'aide de la position est écrite pour eux.
  const environnement = useMemo(() => environnementActuel(), []);
  // Ce que NTanova attend du relais (absent d'une école nouvelle : tout est demandé).
  const photoExigee = fiche.taches?.photo ?? true;
  const positionAttendue = fiche.taches?.position ?? true;
  const [recherche, setRecherche] = useState(!fiche.position && positionAttendue);
  const arret = useRef<() => void>(() => {});
  const monte = useRef(true);

  // Des photos en cours d'allègement : « Suivant » attend qu'elles soient gardées, sinon la fiche partirait sans elles.
  const [allegement, setAllegement] = useState(0);

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
        const code = lireErreurPosition(e instanceof Error ? e.message : undefined);
        setErreurPosition(code);
        // L'état de l'autorisation et l'écran d'accueil, sans rien de personnel : de quoi comprendre le blocage ensuite.
        void etatDeLAutorisation().then((etat) =>
          journaliser(
            'ajouter-1',
            `position_${code}`,
            `autorisation : ${etat}${environnement.installee ? ' ; écran d’accueil' : ''}`,
          ),
        );
      })
      .finally(() => setRecherche(false));
  };

  const prendrePosition = () => {
    setErreurPosition(null);
    setRecherche(true);
    ecouterGps();
  };

  // Le relais va dans les réglages du téléphone, puis revient : la mesure se relance toute seule.
  useReprisePosition(erreurPosition !== null && erreurPosition !== 'absente', prendrePosition);

  useEffect(() => {
    monte.current = true;
    if (!fiche.position && positionAttendue) ecouterGps();
    return () => {
      monte.current = false;
      arret.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const champRepere = useRef<HTMLInputElement>(null);
  // Une seule relance sur le repère **par fiche**, jamais un blocage : le deuxième « Suivant » passe quoi qu'il arrive,
  // et revenir à l'étape 1 depuis la 2 ne la répète pas.
  const [relanceRepere, setRelanceRepere] = useState(false);
  const suivant = () => {
    const e = erreursEtape1(fiche);
    setErreurs(e);
    if (Object.keys(e).length > 0) return;
    if (repereManquant(fiche.repere) && !fichesDejaRelancees.has(fiche.id)) {
      fichesDejaRelancees.add(fiche.id);
      setRelanceRepere(true);
      return;
    }
    aller('ajouter/2');
  };

  const precision = fiche.precisionM ?? mesure?.precisionM ?? null;

  return (
    <div className="ecran">
      <EnteteEtape etape={1} titre="Photo et lieu" retour="lot" type={fiche.type} />
      <main className="contenu-relais">
        <EncartTaches fiche={fiche} />

        <section className="carte-blanche pile-serree">
          <h2 className="titre-section">
            La photo de l'enseigne {!photoExigee && <span className="mention">facultatif</span>}
          </h2>
          {fiche.dejaRecu ? (
            <PhotosRecues fiche={fiche} />
          ) : (
            !photoExigee &&
            !enseigne && (
              <p className="mention">
                NTanova a déjà la photo de l'enseigne. Reprenez-la seulement si elle est fausse.
              </p>
            )
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

        <section className="carte-blanche pile-serree">
          <h2 className="titre-section">La position, devant l'entrée</h2>
          {fiche.dejaRecu && <PositionRecue fiche={fiche} />}
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
              {aideDePrecision(precision, environnement) && (
                <p className="message-attention">{aideDePrecision(precision, environnement)}</p>
              )}
              <VoirSurLaCarte
                position={fiche.position}
                precisionM={precision}
                legende="Position prise maintenant"
              />
            </>
          )}
          {erreurPosition && (
            <AidePosition erreur={erreurPosition} surReessayer={prendrePosition} />
          )}
          {!positionAttendue && !fiche.position && !recherche && !erreurPosition && (
            <p className="mention">
              NTanova connaît déjà la position de cette école. Reprenez-la seulement si elle est
              fausse.
            </p>
          )}
          {!recherche && !erreurPosition && (
            <button
              type="button"
              className="bouton bouton-secondaire bouton-petit"
              onClick={prendrePosition}
            >
              {fiche.position || fiche.dejaRecu?.position
                ? 'Reprendre la position'
                : 'Prendre la position'}
            </button>
          )}
          {erreurPosition && !fiche.position && (
            <p className="mention">Sans position, vous pouvez continuer&nbsp;: NTanova le verra.</p>
          )}
        </section>

        {/* v2 (13/11, canevas) : le repère vient avec le lieu, à l'étape 1 ; les puces remplissent le champ. */}
        <div className="pile-serree">
          <Champ libelle="Comment la trouver ?" erreur={erreurs.repere}>
            {(a) => (
              <input
                {...a}
                ref={champRepere}
                className="champ"
                type="text"
                autoComplete="off"
                placeholder="Ex. : face au marché, derrière la pharmacie"
                value={fiche.repere}
                onChange={(e) => modifier({ repere: e.target.value })}
              />
            )}
          </Champ>
          <Choix
            legende="Repères rapides"
            options={REPERES_RAPIDES.map((r) => ({ valeur: r.cle, libelle: r.libelle }))}
            valeurs={REPERES_RAPIDES.filter((r) => repereCoche(fiche.repere, r.phrase)).map(
              (r) => r.cle,
            )}
            surChoix={(cle) => {
              const r = REPERES_RAPIDES.find((x) => x.cle === cle);
              if (r) modifier({ repere: basculerRepere(fiche.repere, r.phrase) });
            }}
          />
        </div>

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
        {relanceRepere && repereManquant(fiche.repere) && (
          <section className="bandeau bandeau-attente pile-serree" aria-label="Un repère aide">
            <p>
              <b>Un repère aide les familles.</b> Même un seul mot (le marché, la pharmacie) les
              aide à trouver l’école.
            </p>
            <div className="ligne-boutons">
              <button
                type="button"
                className="bouton bouton-secondaire bouton-petit"
                onClick={() => {
                  champRepere.current?.scrollIntoView({ block: 'center' });
                  champRepere.current?.focus();
                }}
              >
                Ajouter un repère
              </button>
              <button
                type="button"
                className="bouton bouton-secondaire bouton-petit"
                onClick={() => aller('ajouter/2')}
              >
                Continuer sans
              </button>
            </div>
          </section>
        )}
        <BoutonSuivant surClic={suivant} occupe={allegement > 0} />
      </PiedEtape>
    </div>
  );
}

// 2/3 : ce qui se voit de la rue -----------------------------------------------

function Etape2({ fiche, modifier }: { fiche: FicheLocale; modifier: Modifier }) {
  const [erreurs, setErreurs] = useState<Erreurs>({});
  // Un numéro congolais a 9 chiffres après +242 : le relais est prévenu, sans être bloqué (ticket #95).
  const numeroSuspect = numeroCongolaisSuspect(normaliserTelephone(fiche.numeroEnseigne));
  const suivant = () => {
    const e = erreursEtape2(fiche);
    setErreurs(e);
    if (Object.keys(e).length > 0) return;
    aller('ajouter/3');
  };
  const basculerNiveau = (n: Valeur<'niveau'>) => {
    const retire = fiche.niveaux.includes(n);
    modifier({
      niveaux: retire
        ? fiche.niveaux.filter((x) => x !== n)
        : listes.niveau.filter((x) => x === n || fiche.niveaux.includes(x)),
      // Décocher un niveau retire ses séries et filières : la base refuse d'accepter une filière orpheline.
      ...(retire
        ? { formationsVues: sansLesFormationsDuCycle(lireFormationsVues(fiche.formationsVues), n) }
        : {}),
    });
  };

  return (
    <div className="ecran">
      <EnteteEtape etape={2} titre="L'établissement" retour="ajouter/1" type={fiche.type} />
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

        <Champ libelle="Nom de l'établissement" erreur={erreurs.nomEnseigne}>
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

        {fiche.type === 'releve' && <DejaSurNTanova fiche={fiche} modifier={modifier} />}

        <Champ libelle="Sigle" facultatif>
          {(a) => (
            <input
              {...a}
              className="champ"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={20}
              placeholder="Ex. : CSLP"
              value={fiche.sigle ?? ''}
              onChange={(e) => modifier({ sigle: e.target.value })}
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
            <FormationsRapides
              niveaux={fiche.niveaux}
              formations={lireFormationsVues(fiche.formationsVues, fiche.niveaux)}
              surChangement={(liste) => modifier({ formationsVues: liste })}
            />
            <Champ
              libelle="Précisions sur les séries ou filières"
              facultatif
              aide="Ce que les puces ne disent pas : une série rare, une filière qui n'est pas dans la liste."
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
                <p className="mention">
                  Vous ajouterez cette photo dans le bonus («&nbsp;Programmes&nbsp;»), après la
                  rencontre.
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
        {numeroSuspect && (
          <p className="message-attention" role="status">
            Ce numéro a {numeroSuspect.chiffres} chiffres après +242 : un numéro congolais en a 9.
            Relisez-le sur l’enseigne.
          </p>
        )}

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
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const contact = fiche.contact ?? contactVide();
  const modifierContact = (champs: Partial<ContactSaisi>) =>
    modifier({ contact: { ...contact, ...champs } });
  // Les personnes en plus de la direction (ticket #96), chacune avec ses propres champs.
  const autres = fiche.autresPersonnes ?? [];
  const modifierAutre = (id: string, champs: Partial<ContactSaisi>) =>
    modifier({ autresPersonnes: autres.map((p) => (p.id === id ? { ...p, ...champs } : p)) });

  // Le contact de la direction est déjà confirmé, ou déjà parti avec la fiche qu'on corrige : rien à redemander.
  const choixDeLaDirection = !fiche.taches || fiche.taches.direction;

  const choisirDirection = (direction: Valeur<'direction_vue'>) =>
    modifier({ direction, contact: direction === 'absente' ? null : contact });

  const enregistrerLaFiche = useEnregistrer(fiche);
  const valider = (): boolean => {
    const e = erreursEtape3(fiche);
    setErreurs(e);
    return Object.keys(e).length === 0;
  };
  return (
    <EcranEtape3
      fiche={fiche}
      modifier={modifier}
      erreurs={erreurs}
      contact={contact}
      modifierContact={modifierContact}
      autres={autres}
      modifierAutre={modifierAutre}
      choixDeLaDirection={choixDeLaDirection}
      choisirDirection={choisirDirection}
      valider={valider}
      enregistrer={enregistrerLaFiche}
    />
  );
}

function EcranEtape3({
  fiche,
  modifier,
  erreurs,
  contact,
  modifierContact,
  autres,
  modifierAutre,
  choixDeLaDirection,
  choisirDirection,
  valider,
  enregistrer,
}: {
  fiche: FicheLocale;
  modifier: Modifier;
  erreurs: Erreurs;
  contact: ContactSaisi;
  modifierContact: (champs: Partial<ContactSaisi>) => void;
  autres: NonNullable<FicheLocale['autresPersonnes']>;
  modifierAutre: (id: string, champs: Partial<ContactSaisi>) => void;
  choixDeLaDirection: boolean;
  choisirDirection: (d: Valeur<'direction_vue'>) => void;
  valider: () => boolean;
  enregistrer: () => Promise<void>;
}) {
  return (
    <div className="ecran">
      <EnteteEtape etape={3} titre="La rencontre" retour="ajouter/2" type={fiche.type} />
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
            {fiche.type === 'correction' && fiche.taches?.direction && (
              <Bandeau ton="attente" icone="alerte">
                <p>
                  <b>À redonner.</b> Le contact de la direction n’est pas arrivé chez NTanova avec
                  la première fiche. Donnez-le de nouveau : il reste privé.
                </p>
              </Bandeau>
            )}
            <Choix
              legende="Avez-vous parlé à quelqu’un de l’école ?"
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
              <>
                <ChampsContact
                  contact={contact}
                  modifierContact={modifierContact}
                  erreurs={erreurs}
                />
                {autres.map((p, i) => (
                  <div
                    key={p.id}
                    className="pile-serree"
                    role="group"
                    aria-label={`Autre personne ${i + 1}`}
                  >
                    <h3 className="rang">Une autre personne</h3>
                    <ChampsContact
                      contact={p}
                      modifierContact={(champs) => modifierAutre(p.id, champs)}
                      erreurs={erreursDeLaPersonne(erreurs, i)}
                    />
                    <button
                      type="button"
                      className="lien"
                      onClick={() =>
                        modifier({
                          autresPersonnes: retirerUnePersonne(fiche, p.id).autresPersonnes ?? [],
                        })
                      }
                    >
                      Retirer cette personne
                    </button>
                  </div>
                ))}
                {autres.length + 1 < PERSONNES_MAX ? (
                  <div className="pile-serree">
                    <button
                      type="button"
                      className="bouton bouton-secondaire"
                      onClick={() =>
                        modifier({
                          autresPersonnes:
                            ajouterUnePersonne(fiche, crypto.randomUUID()).autresPersonnes ?? [],
                        })
                      }
                    >
                      Ajouter une autre personne
                    </button>
                    <p className="mention">
                      Un secrétariat, un propriétaire, un enseignant… Chacune donne son accord.
                      Notez son numéro devant elle : ne l’envoyez jamais par WhatsApp.
                    </p>
                  </div>
                ) : (
                  <p className="mention">Trois personnes au plus par fiche.</p>
                )}
              </>
            )}

            {fiche.direction === 'absente' && (
              <>
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

        <Champ libelle="Remarque" facultatif>
          {(a) => (
            <textarea
              {...a}
              className="champ"
              rows={2}
              maxLength={300}
              placeholder="Ex. : inscriptions ouvertes"
              value={fiche.remarque ?? ''}
              onChange={(e) => modifier({ remarque: e.target.value })}
            />
          )}
        </Champ>

        <BoutonAbandonner fiche={fiche} />
      </main>
      <PiedEtape>
        <button
          type="button"
          className="bouton bouton-large"
          onClick={() => {
            if (valider()) aller('ajouter/bonus');
          }}
        >
          Suivant : le bonus
          <Icone nom="suivant" />
        </button>
        <EnvoyerSansBonus avant={valider} enregistrer={enregistrer} />
      </PiedEtape>
    </div>
  );
}

/** Les erreurs d'une personne en plus : celles de `personne<rang>.…`, sous le nom du champ. */
function erreursDeLaPersonne(erreurs: Erreurs, rang: number): Erreurs {
  const prefixe = `personne${rang}.`;
  return Object.fromEntries(
    Object.entries(erreurs)
      .filter(([cle]) => cle.startsWith(prefixe))
      .map(([cle, message]) => [cle.slice(prefixe.length), message]),
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

      {contact.fonction === 'autre' && (
        <Champ libelle="Quelle fonction ?" facultatif erreur={erreurs.precision}>
          {(a) => (
            <input
              {...a}
              className="champ"
              type="text"
              autoComplete="off"
              placeholder="Ex. : propriétaire, enseignant"
              value={contact.precision ?? ''}
              onChange={(e) => modifierContact({ precision: e.target.value })}
            />
          )}
        </Champ>
      )}

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
  if (await brouillonDuCompte()) return 'brouillon_existant';
  const profil = await lireMemoire('profil');
  const fiche = {
    ...nouvelleContreVisite(
      crypto.randomUUID(),
      new Date().toISOString(),
      profil?.lotId ?? null,
      ecole,
    ),
    compteId: profil?.id ?? null,
  };
  await base.fiches.put(fiche);
  aller('ajouter/1');
  return 'ok';
}

/**
 * Depuis « Mes fiches » : une correction, qui part comme une nouvelle fiche liée à l'ancienne, avec tout ce que le
 * relais avait saisi. Comme ci-dessus, jamais en écrasant une fiche en cours.
 */
export async function commencerCorrection(
  recu: ReleveRecu,
  autres: readonly ReleveRecu[] = [],
): Promise<'ok' | 'brouillon_existant'> {
  if (await brouillonDuCompte()) return 'brouillon_existant';
  const profil = await lireMemoire('profil');
  const fiche = {
    ...nouvelleCorrection(
      crypto.randomUUID(),
      new Date().toISOString(),
      profil?.lotId ?? null,
      recu,
      autres,
    ),
    compteId: profil?.id ?? null,
  };
  await base.fiches.put(fiche);
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
      a: fiche.type === 'correction' ? 'Contact à redonner' : 'À voir',
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
