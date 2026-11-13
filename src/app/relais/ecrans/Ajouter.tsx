import { useEffect, useMemo, useRef, useState } from 'react';
import {
  avecPhoto,
  ajouterUnePersonne,
  basculerCeQuOnVoit,
  ON_Y_VOIT,
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
  libelleFonctionCourt,
  libelleNiveau,
  libelleTypeEcole,
} from '../../../modele/libelles';
import { brouillonDuCompte } from '../actions-fiches';
import { base, lireMemoire } from '../base-locale';
import { aller } from '../contexte';
import { EnteteEtape } from '../composants';
import { Badge } from '@/ui/shadcn/badge';
import { Button } from '@/ui/shadcn/button';
import {
  IconeAlerte,
  IconeCamera,
  IconeAgrandir,
  IconeChargement,
  IconeFait,
  IconeGalerie,
  IconeInfo,
  IconeLieu,
  IconeRepere,
} from '@/ui/shadcn/icones';
import { PiedFixe } from '../cadre';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/ui/shadcn/dialog';
import { DisqueCycle, Segments, TitreAvecAide } from '@/ui/v2/choix';
import { CYCLES } from '../../../modele/carte/cycles';
import { Bande, Confirmer } from '../etats';
import { MiniCarte } from '../mini-carte';
import { Bandeau, Case, Champ, Choix, Erreur, classeBouton, classeChamp } from '@/ui/v2/formulaire';
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
  return <PiedFixe>{children}</PiedFixe>;
}

/**
 * Abandonner la fiche en cours, à chaque étape : elle est effacée du téléphone. Une fiche rouverte pour être
 * modifiée l'est aussi (elle n'a pas encore été reçue par NTanova) ; l'école confiée au relais, elle, revient
 * dans les missions.
 */
function BoutonAbandonner({ fiche }: { fiche: FicheLocale }) {
  const abandonner = async () => {
    await base.fiches.delete(fiche.id);
    aller('missions', true);
  };
  return (
    <Confirmer
      libelle="Abandonner cette fiche"
      titre="Abandonner cette fiche ?"
      description="Ce qui a été saisi sera effacé du téléphone. Cette action est définitive."
      confirmer="Oui, abandonner la fiche"
      enCours="Suppression…"
      surConfirmer={abandonner}
    />
  );
}

function BoutonSuivant({ surClic, occupe = false }: { surClic: () => void; occupe?: boolean }) {
  return (
    <Button
      size="xl"
      className="w-full"
      onClick={surClic}
      disabled={occupe}
      aria-busy={occupe || undefined}
    >
      Suivant
    </Button>
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
        // Lot I : « On y voit » commence sur l'enseigne ; une photo reprise garde ce que le relais avait coché.
        ...(role === 'signboard' ? { onYVoit: ['signboard' as const] } : {}),
      };
      modifier((f) => {
        const avant = role === 'signboard' ? photoEnseigne(f)?.onYVoit : undefined;
        return { photos: avecPhoto(f, avant ? { ...photo, onYVoit: avant } : photo).photos };
      });
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

  const libellePrendre =
    fiche.position || fiche.dejaRecu?.position ? 'Reprendre' : 'Prendre la position';

  return (
    <div className="ecran">
      <EnteteEtape etape={1} titre="Photo et lieu" retour="missions" type={fiche.type} />
      <main className="flex flex-1 flex-col gap-[18px] px-4 py-3.5">
        <EncartTaches fiche={fiche} />

        <section className="flex flex-col gap-2.5" aria-label="La photo de l'école">
          <TitreAvecAide
            titre={
              <>
                La photo de l’école{' '}
                {!photoExigee && (
                  <span className="font-sans text-sm font-normal text-muted-foreground">
                    (facultatif)
                  </span>
                )}
              </>
            }
            libelleAide="Aide : la photo"
            aide={
              <p>
                Cadrez l’enseigne et l’entrée, sans enfant. Le plus sûr&nbsp;: photographiez avec
                l’appareil du téléphone, puis choisissez la photo dans la galerie.
              </p>
            }
          />
          {fiche.dejaRecu ? (
            <PhotosRecues fiche={fiche} />
          ) : (
            !photoExigee &&
            !enseigne && (
              <p className="m-0 text-[13px] text-muted-foreground">
                NTanova a déjà la photo de l’enseigne. Reprenez-la seulement si elle est fausse.
              </p>
            )
          )}
          {enseigne && apercus[enseigne.id] ? (
            <div className="relative h-[170px] overflow-hidden rounded-lg bg-border">
              <img
                src={apercus[enseigne.id]}
                alt="La photo de l'enseigne"
                className="size-full object-cover"
              />
              <span className="absolute bottom-2 left-2 rounded-full bg-card px-2.5 py-0.5 text-[13px] font-bold">
                Votre photo
              </span>
              <label
                className={classeBouton({
                  variant: 'ghost',
                  className: 'absolute right-2 bottom-2 bg-card shadow-sm',
                })}
              >
                <IconeCamera />
                Reprendre
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => void prendrePhoto(e.target.files?.[0], 'signboard')}
                />
              </label>
            </div>
          ) : (
            <div className="flex h-[170px] flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-input bg-muted">
              <IconeGalerie className="size-8 text-muted-foreground" />
              <div className="flex gap-2">
                <label className={classeBouton({ size: 'default' })}>
                  <IconeCamera />
                  Appareil photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => void prendrePhoto(e.target.files?.[0], 'signboard')}
                  />
                </label>
                <label className={classeBouton({ variant: 'outline' })}>
                  Galerie
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => void prendrePhoto(e.target.files?.[0], 'signboard')}
                  />
                </label>
              </div>
            </div>
          )}
          {enseigne && (
            <Choix
              legende="On y voit"
              options={ON_Y_VOIT}
              valeurs={enseigne.onYVoit ?? []}
              surChoix={(cle) => modifier((f) => ({ photos: basculerCeQuOnVoit(f, cle).photos }))}
            />
          )}
          {allegement > 0 && (
            <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <IconeChargement className="size-4 animate-spin motion-reduce:animate-none" />
              Préparation de la photo…
            </p>
          )}
          {(erreurPhoto ?? erreurs.photo) && <Erreur>{erreurPhoto ?? erreurs.photo}</Erreur>}
        </section>

        <section className="flex flex-col gap-2.5" aria-label="La position, devant l'entrée">
          <TitreAvecAide
            titre="La position, devant l’entrée"
            libelleAide="Aide : la position"
            aide={
              <p>
                Placez-vous devant l’entrée, à découvert. La position dit aux familles où est
                l’école sur la carte.
              </p>
            }
          />
          {fiche.dejaRecu && <PositionRecue fiche={fiche} />}
          {erreurPosition ? (
            <AidePosition erreur={erreurPosition} surReessayer={prendrePosition} />
          ) : (
            <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
              {fiche.position && !recherche && (
                <MiniCarte position={fiche.position} libelle="La position prise" />
              )}
              <div className="flex min-h-[64px] items-center gap-3 px-3 py-2.5">
                {recherche ? (
                  <IconeChargement className="size-5 animate-spin text-primary motion-reduce:animate-none" />
                ) : fiche.position ? (
                  <IconeFait className="size-5 text-primary" />
                ) : (
                  <IconeLieu className="size-5 text-muted-foreground" />
                )}
                <span className="flex min-w-0 flex-1 flex-col" aria-live="polite">
                  {recherche ? (
                    <>
                      <b>Recherche de la position…</b>
                      {mesure && (
                        <span className="text-[13px] text-muted-foreground">
                          précision {Math.round(mesure.precisionM)}&nbsp;m
                        </span>
                      )}
                    </>
                  ) : fiche.position && precision !== null ? (
                    <>
                      <b>Position prise</b>
                      <span className="text-[13px] text-muted-foreground">
                        à {Math.round(precision)}&nbsp;m près
                      </span>
                    </>
                  ) : (
                    <span className="text-[15px] text-muted-foreground">
                      {positionAttendue
                        ? 'Pas encore de position.'
                        : 'NTanova connaît déjà la position. Reprenez-la seulement si elle est fausse.'}
                    </span>
                  )}
                </span>
                {!recherche && (
                  <Button
                    variant="quiet"
                    size="sm"
                    aria-label={
                      fiche.position || fiche.dejaRecu?.position
                        ? 'Reprendre la position'
                        : undefined
                    }
                    onClick={prendrePosition}
                  >
                    {libellePrendre}
                  </Button>
                )}
              </div>
            </div>
          )}
          {!recherche && fiche.position && (
            <VoirSurLaCarte
              position={fiche.position}
              precisionM={precision}
              legende="Position prise maintenant"
            />
          )}
          {!recherche &&
            fiche.position &&
            precision !== null &&
            precision > PRECISION_SUFFISANTE_M && (
              <Bande ton="attention" icone={<IconeAlerte />}>
                <p>
                  La précision est faible. Placez-vous devant l’entrée, à découvert, puis reprenez
                  la position.
                </p>
              </Bande>
            )}
          {!recherche && precision !== null && aideDePrecision(precision, environnement) && (
            <Bande ton="attention" icone={<IconeInfo />}>
              <p>{aideDePrecision(precision, environnement)}</p>
            </Bande>
          )}
          {erreurPosition && !fiche.position && (
            <p className="m-0 text-[13px] text-muted-foreground">
              Sans position, vous pouvez continuer&nbsp;: NTanova le verra.
            </p>
          )}
        </section>

        {/* v2 (13/11, canevas) : le repère vient avec le lieu, à l'étape 1 ; les puces remplissent le champ. */}
        <section className="flex flex-col gap-2.5" aria-label="Comment la trouver">
          <TitreAvecAide
            titre="Comment la trouver&nbsp;?"
            libelleAide="Aide : le repère"
            aide={
              <p>
                Un repère que tout le quartier connaît, pour trouver l’entrée sans adresse. Touchez
                un mot, puis complétez.
              </p>
            }
          />
          <Choix
            legende="Repères rapides"
            cacherLegende
            options={REPERES_RAPIDES.map((r) => ({ valeur: r.cle, libelle: r.libelle }))}
            valeurs={REPERES_RAPIDES.filter((r) => repereCoche(fiche.repere, r.phrase)).map(
              (r) => r.cle,
            )}
            surChoix={(cle) => {
              const r = REPERES_RAPIDES.find((x) => x.cle === cle);
              if (r) modifier({ repere: basculerRepere(fiche.repere, r.phrase) });
            }}
          />
          <input
            ref={champRepere}
            aria-label="Comment la trouver ?"
            aria-invalid={!!erreurs.repere}
            className={classeChamp}
            type="text"
            autoComplete="off"
            placeholder="Ex. : face au marché, derrière la pharmacie"
            value={fiche.repere}
            onChange={(e) => modifier({ repere: e.target.value })}
          />
          {erreurs.repere && <Erreur>{erreurs.repere}</Erreur>}
        </section>

        {fiche.type !== 'contre_visite' && fiche.doublonPropose && (
          <Bande ton="attention" region="Doublon possible" icone={<IconeAlerte />}>
            <p>
              <b>Une école est déjà relevée à 40&nbsp;m&nbsp;:</b> {fiche.doublonPropose.nom}.
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
          </Bande>
        )}

        <BoutonAbandonner fiche={fiche} />
      </main>
      <PiedEtape>
        {relanceRepere && repereManquant(fiche.repere) && (
          <Bande
            ton="attention"
            region="Un repère aide"
            icone={<IconeRepere />}
            action={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    champRepere.current?.scrollIntoView({ block: 'center' });
                    champRepere.current?.focus();
                  }}
                >
                  Ajouter un repère
                </Button>
                <Button variant="ghost" size="sm" onClick={() => aller('ajouter/2')}>
                  Continuer sans
                </Button>
              </>
            }
          >
            <p>
              <b>Un repère aide les familles.</b> Même un seul mot (le marché, la pharmacie).
            </p>
          </Bande>
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
      <main className="flex flex-1 flex-col gap-[18px] px-4 py-3.5">
        {fiche.taches && (
          <p className="m-0 text-[13px] text-muted-foreground">
            {fiche.taches.informations
              ? 'Ces informations viennent de la fiche de NTanova. Vérifiez-les sur place et corrigez ce qui est faux.'
              : 'Ces informations viennent de la fiche. Corrigez-les seulement si elles sont fausses.'}
          </p>
        )}

        <Champ libelle="Nom de l'établissement" erreur={erreurs.nomEnseigne}>
          {(a) => (
            <div className="flex gap-2">
              <VignetteEnseigne fiche={fiche} />
              <input
                {...a}
                className={classeChamp}
                type="text"
                autoComplete="off"
                placeholder="Tel qu’il est écrit"
                value={fiche.nomEnseigne}
                onChange={(e) => modifier({ nomEnseigne: e.target.value })}
              />
            </div>
          )}
        </Champ>

        {fiche.type === 'releve' && <DejaSurNTanova fiche={fiche} modifier={modifier} />}

        <Champ libelle="Sigle" facultatif>
          {(a) => (
            <input
              {...a}
              className={classeChamp}
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

        <div className="flex flex-col gap-2">
          <TitreAvecAide
            niveau="b"
            titre="Type"
            libelleAide="Aide : le type"
            aide={
              <p>
                Notez seulement ce qui se voit de la rue. <b>Pas indiqué</b>&nbsp;: rien d'écrit.{' '}
                <b>Autre</b>&nbsp;: c'est écrit mais ça ne rentre pas&nbsp;; dites-le plus bas.
              </p>
            }
          />
          <Choix
            legende="Type"
            cacherLegende
            options={(Object.keys(libelleTypeEcole) as Valeur<'type_ecole'>[]).map((t) => ({
              valeur: t,
              libelle: libelleTypeEcole[t],
            }))}
            valeurs={[fiche.typeEcole]}
            surChoix={(t) => modifier({ typeEcole: t })}
            colonnes={2}
            erreur={erreurs.typeEcole}
          />
        </div>

        <Choix
          legende="Niveaux affichés"
          options={listes.niveau.map((n) => ({ valeur: n, libelle: libelleNiveau[n] }))}
          valeurs={fiche.niveaux}
          surChoix={basculerNiveau}
          colonnes={2}
          erreur={erreurs.niveaux}
          avant={(n) => {
            const l = CYCLES.find((c) => c.cycle === n)?.lettre;
            return l ? <DisqueCycle lettre={l} /> : null;
          }}
        />

        {demandeLesFormations(fiche.niveaux) && (
          <section
            className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3.5"
            aria-label="Séries et formations"
          >
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
                  className={classeChamp}
                  type="text"
                  autoComplete="off"
                  placeholder="Ex. : séries C et D, BTS gestion"
                  value={fiche.programmesVus ?? ''}
                  onChange={(e) => modifier({ programmesVus: e.target.value })}
                />
              )}
            </Champ>
            <label className="flex cursor-pointer items-start gap-3 text-[15px] [&>input]:mt-0.5 [&>input]:size-[22px] [&>input]:shrink-0 [&>input]:accent-[var(--marque)]">
              <input
                type="checkbox"
                checked={fiche.programmesEnPhoto ?? false}
                onChange={(e) => modifier({ programmesEnPhoto: e.target.checked })}
              />
              Je les ai prises en photo (panneau, affiche ou prospectus)
            </label>
            {fiche.programmesEnPhoto &&
              !fiche.photos.some((p) => p.role === 'programs_board' || p.role === 'brochure') && (
                <p className="m-0 text-[13px] text-muted-foreground">
                  Vous ajouterez cette photo dans le bonus («&nbsp;Programmes&nbsp;»), après la
                  rencontre.
                </p>
              )}
          </section>
        )}

        <Champ
          libelle="Programme, langues ou autre mention écrite"
          facultatif
          erreur={erreurs.programme}
        >
          {(a) => (
            <input
              {...a}
              className={classeChamp}
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
              className={classeChamp}
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
          <p
            className="m-0 rounded-md bg-attention px-3 py-2.5 text-sm text-attention-foreground"
            role="status"
          >
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

/** La photo de l'enseigne en vignette, à côté du nom : on recopie le nom en la regardant ; un toucher l'agrandit. */
function VignetteEnseigne({ fiche }: { fiche: FicheLocale }) {
  const photo = photoEnseigne(fiche);
  const adresse = useMemo(() => (photo?.blob ? URL.createObjectURL(photo.blob) : null), [photo]);
  useEffect(() => () => void (adresse && URL.revokeObjectURL(adresse)), [adresse]);
  if (!adresse)
    return (
      <span className="flex size-[52px] shrink-0 items-center justify-center rounded-md bg-border text-muted-foreground">
        <IconeGalerie className="size-5" />
      </span>
    );
  return (
    <Dialog>
      <DialogTrigger
        aria-label="Voir votre photo en grand"
        className="relative size-[52px] shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <img src={adresse} alt="" className="size-full rounded-md object-cover" />
        <span className="absolute -right-1 -bottom-1 flex size-[22px] items-center justify-center rounded-full border border-border bg-card text-foreground">
          <IconeAgrandir className="size-3" />
        </span>
      </DialogTrigger>
      <DialogContent className="p-2">
        <DialogTitle className="sr-only">Votre photo de l’enseigne</DialogTitle>
        <img src={adresse} alt="Votre photo de l’enseigne" className="w-full rounded-md" />
      </DialogContent>
    </Dialog>
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
      <main className="flex flex-1 flex-col gap-[18px] px-4 py-3.5">
        {!choixDeLaDirection && (
          <section
            className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3.5"
            aria-label="Rien à refaire"
          >
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
            <section className="flex flex-col gap-2" aria-label="La rencontre">
              <TitreAvecAide
                titre="Avez-vous parlé à quelqu’un de l’école&nbsp;?"
                libelleAide="Aide : la rencontre"
                aide={
                  <>
                    <p>
                      Cette partie est privée&nbsp;: seul NTanova la voit, et elle s’efface du
                      téléphone une fois envoyée.
                    </p>
                    <p className="mt-2">
                      À dire&nbsp;: «&nbsp;Votre numéro ne sera jamais publié. NTanova vous écrira
                      au sujet de la fiche de l'école, et l'effacera si vous le demandez.&nbsp;»
                    </p>
                  </>
                }
              />
              <Segments
                legende="Avez-vous parlé à quelqu’un de l’école ?"
                options={listes.direction_vue.map((d) => ({
                  valeur: d,
                  libelle: libelleDirection[d],
                }))}
                valeur={fiche.direction}
                surChoix={choisirDirection}
              />
              {erreurs.direction && <Erreur>{erreurs.direction}</Erreur>}
            </section>

            {fiche.direction === 'vue' && (
              <>
                <section
                  aria-label="La personne"
                  className="flex flex-col gap-3.5 rounded-lg border border-border bg-card p-3.5"
                >
                  <ChampsContact
                    contact={contact}
                    modifierContact={modifierContact}
                    erreurs={erreurs}
                  />
                </section>
                {autres.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex flex-col gap-3.5 rounded-lg border border-border bg-card p-3.5"
                    role="group"
                    aria-label={`Autre personne ${i + 1}`}
                  >
                    <h3 className="m-0 font-serif text-lg font-bold">Une autre personne</h3>
                    <ChampsContact
                      contact={p}
                      modifierContact={(champs) => modifierAutre(p.id, champs)}
                      erreurs={erreursDeLaPersonne(erreurs, i)}
                    />
                    <button
                      type="button"
                      className={classeBouton({ variant: 'link' })}
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
                  <div className="flex flex-col gap-2.5">
                    <button
                      type="button"
                      className={classeBouton({
                        variant: 'outline',
                        size: 'lg',
                        className: 'w-full',
                      })}
                      onClick={() =>
                        modifier({
                          autresPersonnes:
                            ajouterUnePersonne(fiche, crypto.randomUUID()).autresPersonnes ?? [],
                        })
                      }
                    >
                      Ajouter une autre personne
                    </button>
                  </div>
                ) : (
                  <p className="m-0 text-[13px] text-muted-foreground">
                    Trois personnes au plus par fiche.
                  </p>
                )}
              </>
            )}

            {fiche.direction === 'absente' && (
              <>
                <p className="m-0 text-[13px] text-muted-foreground">
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
                      className={classeChamp}
                      rows={3}
                      placeholder="Ex. : la direction ne veut pas apparaître"
                      value={contact.note}
                      onChange={(e) => modifierContact({ note: e.target.value })}
                    />
                  )}
                </Champ>
                <p className="m-0 text-[13px] text-muted-foreground">
                  NTanova lit chaque refus avant de publier quoi que ce soit.
                </p>
              </>
            )}
          </>
        )}

        <Champ libelle="Remarque" facultatif>
          {(a) => (
            <input
              {...a}
              className={classeChamp}
              type="text"
              maxLength={300}
              placeholder="Ex. : inscriptions ouvertes jusqu’au 30"
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
          className={classeBouton({ size: 'xl', className: 'w-full' })}
          onClick={() => {
            if (valider()) aller('ajouter/bonus');
          }}
        >
          Suivant : le bonus
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
      <Choix
        legende="Qui ?"
        petites
        options={listes.fonction_direction.map((f) => ({
          valeur: f,
          libelle:
            libelleFonctionCourt[f].charAt(0).toUpperCase() + libelleFonctionCourt[f].slice(1),
        }))}
        valeurs={contact.fonction ? [contact.fonction] : []}
        surChoix={(f) => modifierContact({ fonction: contact.fonction === f ? null : f })}
        erreur={erreurs.fonction}
      />

      {contact.fonction === 'autre' && (
        <Champ libelle="Quelle fonction ?" facultatif erreur={erreurs.precision}>
          {(a) => (
            <input
              {...a}
              className={classeChamp}
              type="text"
              autoComplete="off"
              placeholder="Ex. : propriétaire, enseignant"
              value={contact.precision ?? ''}
              onChange={(e) => modifierContact({ precision: e.target.value })}
            />
          )}
        </Champ>
      )}

      <Champ libelle="Son nom" facultatif erreur={erreurs.nom}>
        {(a) => (
          <input
            {...a}
            className={classeChamp}
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
        aide={contact.accord ? undefined : 'Seulement avec son accord (case ci-dessous).'}
        erreur={erreurs.whatsapp}
      >
        {(a) => (
          <input
            {...a}
            className={classeChamp}
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
      <Case
        checked={contact.accord}
        onChange={(coche) =>
          modifierContact({
            accord: coche,
            accordLe: coche ? new Date().toISOString() : null,
            whatsapp: coche ? contact.whatsapp : '',
          })
        }
      >
        <b>La personne accepte que NTanova lui écrive sur WhatsApp</b>
      </Case>
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
      className="flex flex-col gap-2.5 rounded-lg border-2 border-primary bg-card p-3.5"
      aria-label="À faire sur cette école"
    >
      <p className="m-0 text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">
        À faire sur cette école
      </p>
      <p>
        <b>
          {fiche.type === 'correction' ? 'Corriger' : 'Compléter'}&nbsp;: {fiche.nomEnseigne}.
        </b>{' '}
        {taches.titre}
      </p>
      {taches.consigne && (
        <p className="m-0 rounded-md bg-attention px-3 py-2.5 text-sm">
          <b>NTanova&nbsp;:</b> {taches.consigne}
        </p>
      )}
      <ul className="m-0 flex list-none flex-col p-0">
        {lignes.map((l) => (
          <li
            key={l.nom}
            className="flex items-center justify-between gap-2 border-t border-border py-2 first:border-t-0"
          >
            <span>{l.nom}</span>
            <Badge variant={l.faire ? 'attention' : 'succes'} className="text-xs">
              {l.faire ? l.a : l.fait}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
