/**
 * Un retrait, étape par étape (refonte publique, lot 3B2 ; planches « Retraits ») : vérifier, retirer dans la base, demander la
 * mise en ligne, constater sur les deux adresses, prévenir, clore. Une étape ne s'invente pas : la base refuse « retiré » tant
 * que la cible est encore publiée, et rien ici ne lance une mise en ligne.
 */
import { useEffect, useState } from 'react';
import { jourDuCongo } from '../../modele/date-declaration';
import {
  ciblesDansLOrdre,
  coordonneeLisible,
  etapesDuRetrait,
  jourDuRetrait,
  jourLong,
  jourNotable,
  libelleCible,
  libelleVerification,
  lignesEcrites,
  manquePourCibler,
  reorientationsPossibles,
  texteDuDelai,
  titreEtape,
  verificationsPossibles,
  DELAI_RETRAIT_JOURS,
  ETAPES_RETRAIT,
  NOTE_AU_PLUS,
  type SuiviRetrait,
} from '../../modele/messages-recus';
import type { Valeur } from '../../modele/listes';
import { libelleRolePhoto } from '../../modele/libelles';
import { cn } from '@/lib/utils';
import { Bouton, Dialogue } from '@/ui/v2/admin';
import { v2 } from '@/ui/v2/classes';
import { Champ, classeBouton } from '@/ui/v2/formulaire';
import {
  BandeauEchec,
  BlocMessage,
  ChoixDuJour,
  ChoixMultiple,
  ChoixUnique,
  LigneMessageEcrite,
  ListeEtapes,
  PastilleMessage,
} from '@/ui/v2/messages';
import { quand } from '../../ui/composants';
import {
  BlocFiche,
  BlocHistorique,
  BlocReponse,
  echeanceSiClos,
  EchecDuGeste,
  type ContexteMessage,
  type SaisieRetrait,
} from './MessageContexte';
import { NoterLaReponse, OuvrirLaConversation } from './MessageTiroirs';

const AIDE: Record<(typeof ETAPES_RETRAIT)[number], string> = {
  verifier:
    'Aucune pièce d’identité par défaut. Un numéro seulement écrit dans le formulaire ne prouve rien. En cas de doute : mets en attente et demande une précision.',
  retirer:
    'Le retrait se fait dans Écoles. Le journal des effacements garde quoi, quand et par qui, jamais l’information retirée.',
  mettre_en_ligne:
    'La mise en ligne part sur ton ordre. Tant que le site n’est pas reconstruit, l’information reste visible.',
  constater:
    'Les deux adresses gardent chacune leur dernière construction : regarde les deux, chacune à son jour.',
  prevenir: 'Ouvrir WhatsApp ou le courrier n’envoie rien : note le jour une fois parti.',
  clore: 'Le journal des effacements garde la trace d’un retrait, sans l’information.',
};

const QUEL = 'etape';

export function RetraitEtapes({
  c,
  retrait,
  surRattacher,
}: {
  c: ContexteMessage;
  retrait: SuiviRetrait;
  surRattacher: () => void;
}) {
  const { m } = c;
  const contenu = m.versions.find((v) => v.courante)?.contenu ?? {};
  const aRetirer = (
    typeof contenu.aRetirer === 'string' ? contenu.aRetirer : null
  ) as Valeur<'public_request_removal'> | null;
  const etapes = etapesDuRetrait({ ...m, retrait });
  const jour = jourDuRetrait(
    { recuLe: m.recuLe, retireLe: retrait.retireLe, etapeRetrait: retrait.etape },
    new Date(),
  );
  const rang = retrait.etape === 'close' ? -1 : ETAPES_RETRAIT.indexOf(retrait.etape);
  const etape = ETAPES_RETRAIT[rang];
  const saisir = (s: Partial<SaisieRetrait>) =>
    c.saisir({ retrait: { ...c.saisie.retrait, ...s } });
  const enAttente = m.etat === 'en_attente';

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <span className="flex flex-wrap gap-1.5">
          {jour !== null && (
            <PastilleMessage ton={jour > DELAI_RETRAIT_JOURS ? 'danger' : 'attention'}>
              {texteDuDelai(jour)}
            </PastilleMessage>
          )}
          {retrait.retireLe && (
            <PastilleMessage ton="succes">
              Retiré de la base {quand(retrait.retireLe)}
            </PastilleMessage>
          )}
          {retrait.retireLe && !retrait.constateLe && m.etat !== 'close' && (
            <PastilleMessage ton="attention">Pas encore constaté en ligne</PastilleMessage>
          )}
          {retrait.constateLe && <PastilleMessage ton="succes">Constaté en ligne</PastilleMessage>}
        </span>
        {etape && (
          <section
            aria-labelledby="titre-etape"
            className="flex flex-col gap-3 rounded-xl border-2 border-primary bg-card px-4 py-3.5"
          >
            <div className="flex flex-col gap-1">
              <span className={v2.surtitre}>
                {enAttente ? 'En attente' : 'À faire maintenant'} · étape {rang + 1} sur{' '}
                {ETAPES_RETRAIT.length}
              </span>
              <h3 id="titre-etape" className="m-0 font-serif text-xl leading-tight font-bold">
                {titreEtape[etape]}
              </h3>
              <p className="m-0 text-sm text-muted-foreground">{AIDE[etape]}</p>
            </div>
            <EchecDuGeste c={c} quel={QUEL} />
            {enAttente ? (
              <p className="m-0">Remets-le à traiter pour reprendre cette étape.</p>
            ) : etape === 'verifier' ? (
              <Verifier c={c} aRetirer={aRetirer} saisir={saisir} />
            ) : etape === 'retirer' ? (
              <Retirer
                key={m.fiche?.id ?? ''}
                c={c}
                retrait={retrait}
                aRetirer={aRetirer}
                saisir={saisir}
                surRattacher={surRattacher}
              />
            ) : etape === 'mettre_en_ligne' ? (
              <MettreEnLigne c={c} saisir={saisir} />
            ) : etape === 'constater' ? (
              <Constater c={c} retrait={retrait} saisir={saisir} />
            ) : etape === 'prevenir' ? (
              <>
                <OuvrirLaConversation c={c} plein={false} />
                <NoterLaReponse c={c} quel={QUEL} prevenir />
              </>
            ) : (
              <>
                <p className="m-0">
                  Effacé automatiquement le <b>{echeanceSiClos()}</b>, 12 mois après la clôture :
                  message, coordonnée et historique.
                </p>
                <Bouton
                  className="self-start"
                  enCours={c.geste.enCours === QUEL}
                  onClick={() =>
                    c.agir(QUEL, () => c.admin.cloreMessage(m.reference, m.version), null)
                  }
                >
                  Clore
                </Bouton>
              </>
            )}
          </section>
        )}
        <BlocMessage titre="Ce qui est demandé">
          {lignesEcrites('retrait', contenu).map((l) => (
            <LigneMessageEcrite key={l.libelle} libelle={l.libelle}>
              {l.valeur}
            </LigneMessageEcrite>
          ))}
          <LigneMessageEcrite libelle="Pour vérifier et prévenir">
            {m.canal === 'whatsapp' ? 'Sur WhatsApp' : 'Par e-mail'} · {coordonneeLisible(m)}
          </LigneMessageEcrite>
        </BlocMessage>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <BlocMessage titre="Les six étapes">
          <ListeEtapes
            etapes={etapes.map((e) => ({ titre: titreEtape[e.etape], etat: e.etat, mot: e.mot }))}
          />
        </BlocMessage>
        {(retrait.verification || retrait.cibles || retrait.miseEnLigneLe) && (
          <BlocMessage titre="Ce qui est noté">
            {retrait.verification && (
              <LigneMessageEcrite libelle="Vérifié">
                {libelleVerification[retrait.verification]}
                {retrait.verificationNote ? ` : ${retrait.verificationNote}` : ''}
              </LigneMessageEcrite>
            )}
            {retrait.cibles && (
              <LigneMessageEcrite libelle="Retiré ou à retirer">
                {retrait.cibles.map((x) => libelleCible[x]).join(', ')}
              </LigneMessageEcrite>
            )}
            {retrait.miseEnLigneLe && (
              <LigneMessageEcrite libelle="Mise en ligne demandée">
                {quand(retrait.miseEnLigneLe)}
                {retrait.execution ? ` · exécution ${retrait.execution}` : ''}
              </LigneMessageEcrite>
            )}
            {retrait.productionLe && retrait.essaiLe && (
              <LigneMessageEcrite libelle="Constaté">
                ntanova.com le {jourLong(retrait.productionLe)}, essai.ntanova.com le{' '}
                {jourLong(retrait.essaiLe)}
              </LigneMessageEcrite>
            )}
          </BlocMessage>
        )}
        <BlocFiche c={c} surRattacher={surRattacher} />
        <BlocReponse m={m} />
        <BlocHistorique m={m} />
      </div>
    </div>
  );
}

function Verifier({
  c,
  aRetirer,
  saisir,
}: {
  c: ContexteMessage;
  aRetirer: Valeur<'public_request_removal'> | null;
  saisir: (s: Partial<SaisieRetrait>) => void;
}) {
  const { m, admin } = c;
  const { comment, note } = c.saisie.retrait;
  const [confirmer, setConfirmer] = useState(false);
  const tropLong = [...note].length > NOTE_AU_PLUS;
  const pret = comment !== null && (comment !== 'autre' || (note.trim() !== '' && !tropLong));
  const occupe = c.geste.enCours !== null;
  return (
    <>
      <ChoixUnique
        legende="Comment l’as-tu vérifié ?"
        options={verificationsPossibles(aRetirer).map((v) => ({
          valeur: v,
          libelle: libelleVerification[v],
        }))}
        valeur={comment}
        surChoix={(v) => saisir({ comment: v })}
      />
      {aRetirer === 'fiche' && (
        <p className="m-0 text-sm text-muted-foreground">
          Pour la fiche entière, un numéro ne suffit pas : la direction confirme.
        </p>
      )}
      {comment === 'autre' && (
        <Champ
          libelle="Comment, en une ligne"
          aide="Sans donnée personnelle."
          erreur={tropLong ? `${NOTE_AU_PLUS} caractères au plus.` : undefined}
        >
          {(a) => (
            <input
              {...a}
              className={v2.champ}
              value={note}
              onChange={(e) => saisir({ note: e.target.value })}
            />
          )}
        </Champ>
      )}
      <div className={v2.actions}>
        <Bouton
          enCours={c.geste.enCours === QUEL}
          disabled={!pret || occupe}
          onClick={() => {
            if (comment === null) return;
            c.agir(
              QUEL,
              () =>
                admin.verifierRetrait(
                  m.reference,
                  m.version,
                  comment,
                  comment === 'autre' ? note : null,
                ),
              'Vérification notée.',
            );
          }}
        >
          Noter la vérification
        </Bouton>
        <Bouton variante="danger" disabled={occupe} onClick={() => setConfirmer(true)}>
          Impossible à vérifier
        </Bouton>
      </div>
      {reorientationsPossibles(m).includes('erreur') && (
        <button
          type="button"
          className={v2.lien}
          disabled={occupe}
          onClick={() =>
            c.agir(
              QUEL,
              () => admin.reorienterMessage(m.reference, m.version, 'erreur'),
              'Passé en correction : le nouveau message est relié à celui-ci.',
            )
          }
        >
          Ce n’est pas un retrait : en faire une correction
        </button>
      )}
      {confirmer && (
        <Dialogue
          titre="Impossible à vérifier ?"
          variante="confirmation"
          libelleFermeture="Annuler"
          fermer={() => setConfirmer(false)}
          occupe={occupe}
          entete={<h2>Impossible à vérifier ?</h2>}
        >
          <p className="m-0">
            Rien n’est retiré. Il restera à prévenir la personne, ou à noter que c’est impossible,
            puis à clore.
          </p>
          <p className="m-0 text-sm text-muted-foreground">
            Un simple doute ? Mets plutôt en attente et demande une précision.
          </p>
          <Bouton
            variante="danger"
            enCours={c.geste.enCours === QUEL}
            onClick={() => {
              setConfirmer(false);
              c.agir(
                QUEL,
                () => admin.retraitImpossible(m.reference, m.version),
                'Noté : impossible à vérifier. Rien n’est retiré.',
              );
            }}
          >
            Noter : impossible à vérifier
          </Bouton>
        </Dialogue>
      )}
    </>
  );
}

interface PhotoACibler {
  id: string;
  libelle: string;
  adresse: string | null;
}

/** Désigner ce qui est à retirer, puis constater que la base ne le publie plus. Le retrait lui-même se fait dans Écoles. */
function Retirer({
  c,
  retrait,
  aRetirer,
  saisir,
  surRattacher,
}: {
  c: ContexteMessage;
  retrait: SuiviRetrait;
  aRetirer: Valeur<'public_request_removal'> | null;
  saisir: (s: Partial<SaisieRetrait>) => void;
  surRattacher: () => void;
}) {
  const { m, admin } = c;
  const s = c.saisie.retrait;
  const ecoleId = m.fiche?.id ?? null;
  const [changer, setChanger] = useState(false);
  const [photos, setPhotos] = useState<PhotoACibler[] | 'panne' | null>(null);
  const [tour, setTour] = useState(0);
  const avecPhoto = s.cibles.includes('photo');
  useEffect(() => {
    if (!avecPhoto || ecoleId === null) return;
    let abandonne = false;
    // Les photos des relais et les images de l'école : les deux peuvent paraître sur la fiche.
    Promise.all([admin.photosEcole(ecoleId), admin.mediasDeLEcole(ecoleId)])
      .then(([p, medias]) => {
        if (abandonne) return;
        setPhotos([
          ...p.map((x) => ({
            id: x.id,
            libelle: libelleRolePhoto[x.role] + (x.publique ? ' · publique' : ''),
            adresse: x.adresse,
          })),
          ...medias
            .filter((x) => x.genre !== 'document')
            .map((x) => ({
              id: x.id,
              libelle:
                (
                  { logo: 'Logo', cover: 'Couverture', gallery: 'Galerie' } as Record<
                    string,
                    string
                  >
                )[x.genre] + (x.publique ? ' · publique' : ''),
              adresse: x.adresse,
            })),
        ]);
      })
      .catch(() => !abandonne && setPhotos('panne'));
    return () => {
      abandonne = true;
    };
  }, [admin, avecPhoto, ecoleId, tour]);

  const occupe = c.geste.enCours !== null;
  const fiche = m.fiche ? (
    <a
      className={cn(classeBouton({ variant: 'outline' }), 'w-fit')}
      href={`#ecoles/fiche/${m.fiche.id}`}
    >
      Ouvrir la fiche dans Écoles
    </a>
  ) : null;

  if (retrait.cibles !== null && !changer) {
    return (
      <>
        <p className="m-0">
          À retirer : <b>{retrait.cibles.map((x) => libelleCible[x].toLowerCase()).join(', ')}</b>
          {m.fiche ? ` · ${m.fiche.nom}` : ''}.
        </p>
        {retrait.cibles.includes('texte') && (
          <p className="m-0 text-sm text-muted-foreground">
            Pour un texte, la base ne peut pas vérifier : noter est ta déclaration, datée.
          </p>
        )}
        <div className={v2.actions}>
          {fiche}
          <Bouton
            enCours={c.geste.enCours === QUEL}
            disabled={occupe}
            onClick={() =>
              c.agir(
                QUEL,
                () => admin.noterRetire(m.reference, m.version),
                'Noté : retiré de la base. Encore visible en ligne jusqu’à la mise en ligne.',
              )
            }
          >
            Noter : retiré de la base
          </Bouton>
        </div>
        <button
          type="button"
          className={v2.lien}
          onClick={() => {
            saisir({ cibles: retrait.cibles ?? [], photoId: retrait.ciblePhotoId });
            setChanger(true);
          }}
        >
          Changer ce qui est à retirer
        </button>
      </>
    );
  }
  const manque = manquePourCibler(s.cibles, ecoleId, s.photoId);
  return (
    <>
      <ChoixMultiple
        legende="Que retires-tu ?"
        options={ciblesDansLOrdre(aRetirer).map((x) => ({ valeur: x, libelle: libelleCible[x] }))}
        valeurs={s.cibles}
        surChoix={(x) =>
          saisir({
            cibles: s.cibles.includes(x) ? s.cibles.filter((y) => y !== x) : [...s.cibles, x],
            ...(x === 'photo' ? { photoId: null } : {}),
          })
        }
      />
      {ecoleId === null && (
        <button type="button" className={v2.lien} onClick={surRattacher}>
          Rattacher la fiche concernée
        </button>
      )}
      {avecPhoto && ecoleId !== null && (
        <>
          {photos === 'panne' ? (
            <BandeauEchec
              titre="Les photos ne se chargent pas."
              action={() => {
                setPhotos(null);
                setTour((t) => t + 1);
              }}
              libelleAction="Réessayer"
            >
              Réseau ou serveur. Tes choix sont gardés.
            </BandeauEchec>
          ) : photos === null ? (
            <p className="m-0 text-sm text-muted-foreground" role="status">
              Chargement des photos…
            </p>
          ) : photos.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">Aucune photo sur cette fiche.</p>
          ) : (
            <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 text-sm font-bold">Quelle photo ?</legend>
              <div className="grid grid-cols-2 gap-2">
                {photos.map((p) => (
                  <label
                    key={p.id}
                    className={cn(
                      'flex cursor-pointer flex-col gap-1.5 rounded-md border bg-card p-2 text-sm focus-within:ring-[3px] focus-within:ring-ring',
                      s.photoId === p.id
                        ? 'border-2 border-primary bg-succes p-[7px]'
                        : 'border-input',
                    )}
                  >
                    {p.adresse ? (
                      <img
                        src={p.adresse}
                        alt=""
                        className="aspect-[4/3] w-full rounded-sm object-cover"
                      />
                    ) : (
                      <span className="flex aspect-[4/3] items-center justify-center rounded-sm bg-muted text-muted-foreground">
                        Image non lue
                      </span>
                    )}
                    <span className="flex min-h-11 items-center gap-2">
                      <input
                        type="radio"
                        name="photo-a-retirer"
                        checked={s.photoId === p.id}
                        onChange={() => saisir({ photoId: p.id })}
                        className="size-[22px] shrink-0 accent-[var(--marque)]"
                      />
                      {p.libelle}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </>
      )}
      <div className={v2.actions}>
        {fiche}
        <Bouton
          enCours={c.geste.enCours === QUEL}
          disabled={manque !== null || occupe}
          onClick={() =>
            c.agir(
              QUEL,
              () =>
                admin.ciblerRetrait(
                  m.reference,
                  m.version,
                  s.cibles,
                  ecoleId,
                  avecPhoto ? s.photoId : null,
                ),
              'Noté. Retire-le maintenant dans Écoles.',
              () => setChanger(false),
            )
          }
        >
          Noter ce qui est à retirer
        </Bouton>
      </div>
      {manque !== null && s.cibles.length > 0 && (
        <p className="m-0 text-sm text-muted-foreground">{manque}</p>
      )}
    </>
  );
}

function MettreEnLigne({
  c,
  saisir,
}: {
  c: ContexteMessage;
  saisir: (s: Partial<SaisieRetrait>) => void;
}) {
  const { m, admin } = c;
  const { execution } = c.saisie.retrait;
  const bon = /^\d{0,20}$/.test(execution.trim());
  return (
    <>
      <p className="m-0">
        Dans GitHub Actions : « Mise en ligne », cible « les deux ». Aucune heure n’est promise à la
        personne.
      </p>
      <p className="m-0 text-sm text-muted-foreground">
        Une recette en cours sur essai serait remplacée : relance-la ensuite.
      </p>
      <Champ
        libelle="Numéro de l’exécution"
        facultatif
        erreur={bon ? undefined : 'Des chiffres seulement, 20 au plus.'}
      >
        {(a) => (
          <input
            {...a}
            inputMode="numeric"
            className={cn(v2.champ, 'max-w-[260px]')}
            value={execution}
            onChange={(e) => saisir({ execution: e.target.value })}
          />
        )}
      </Champ>
      <Bouton
        className="self-start"
        enCours={c.geste.enCours === QUEL}
        disabled={!bon || c.geste.enCours !== null}
        onClick={() =>
          c.agir(
            QUEL,
            () => admin.noterMiseEnLigne(m.reference, m.version, execution || null),
            'Noté : mise en ligne demandée. Reste à constater.',
          )
        }
      >
        Noter : mise en ligne demandée
      </Bouton>
    </>
  );
}

function Constater({
  c,
  retrait,
  saisir,
}: {
  c: ContexteMessage;
  retrait: SuiviRetrait;
  saisir: (s: Partial<SaisieRetrait>) => void;
}) {
  const { m, admin } = c;
  const { production, essai } = c.saisie.retrait;
  const aujourdHui = jourDuCongo();
  const depuis = retrait.miseEnLigneLe ? jourDuCongo(new Date(retrait.miseEnLigneLe)) : aujourdHui;
  const pret =
    jourNotable(production.jour, aujourdHui, depuis) && jourNotable(essai.jour, aujourdHui, depuis);
  return (
    <>
      <p className="m-0 text-sm">
        Sur chaque adresse : la fiche, la liste et les lieux, la recherche, la carte, les photos et
        l’image de partage.
      </p>
      <ChoixDuJour
        legende="ntanova.com : plus visible, constaté"
        aujourdHui={aujourdHui}
        depuis={depuis}
        valeur={production}
        surChoix={(j) => saisir({ production: j })}
      />
      <ChoixDuJour
        legende="essai.ntanova.com : plus visible, constaté"
        aujourdHui={aujourdHui}
        depuis={depuis}
        valeur={essai}
        surChoix={(j) => saisir({ essai: j })}
      />
      <p className="m-0 text-sm text-muted-foreground">
        Moteurs de recherche et aperçus de lien peuvent garder une copie : on ne les présente jamais
        comme effacés.
      </p>
      <Bouton
        className="self-start"
        enCours={c.geste.enCours === QUEL}
        disabled={!pret || c.geste.enCours !== null}
        onClick={() =>
          c.agir(
            QUEL,
            () => admin.noterConstat(m.reference, m.version, production.jour, essai.jour),
            'Noté : constaté en ligne, sur les deux adresses.',
          )
        }
      >
        Noter : constaté en ligne
      </Bouton>
    </>
  );
}
