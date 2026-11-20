import { GererContacts } from './ContactsEcole';
import { v2 } from '@/ui/v2/classes';
import { cn } from '@/lib/utils';
import { ChampsFiche } from './ChampsFiche';
import { Dialogue } from '@/ui/v2/admin';
import { ActionsSecondaires, BadgePublication, Bouton } from '@/ui/v2/admin';
import { PhotoPublique } from './PhotoPublique';
import { ImagesEcole } from './ImagesEcole';
import { ManquesEcole } from './ManquesEcole';
import { NouvellesEcole } from './NouvellesEcole';
import { AdmissionEcole } from './AdmissionEcole';
import { FormationsSuperieur } from './FormationsSuperieur';
import { EquipementsEcole } from './EquipementsEcole';
import { FraisEcole } from './FraisEcole';
import { PlacesEffectifs } from './PlacesEffectifs';
import { ContactPublic } from './ContactPublic';
import { AgrementEcole } from './AgrementEcole';
import { InscriptionsEcole } from './InscriptionsEcole';
import { MotDirectionEcole } from './MotDirectionEcole';
/**
 * Les écoles et leur cycle de vie (supabase/schema.md, « Le cycle de vie ») :
 * à situer → prête → publiée → retirée (→ publiée). Publier est un geste à part :
 * une école, une zone (ville, arrondissement, quartier), ou un lot.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ecrirePosition } from '../../modele/coordonnees';
import type { SourcePosition } from '../../modele/fiche-admin';
import {
  erreursFormulaireEcole,
  formulaireDe,
  lireChampPosition,
  versCorrection,
  type FormulaireEcole,
} from '../../modele/correction-ecole';
import type { Erreurs } from '../../modele/fiche';
import { cheminLisible } from '../../modele/geo-divisions';
import { libelleNiveau, libelleTypeEcole, libelleTypeMission } from '../../modele/libelles';
import { listes, type Valeur } from '../../modele/listes';
import type {
  DivisionVue,
  ApercuSuppression,
  EcoleVue,
  PortAdministration,
  RelaisVu,
} from '../../modele/ports';
import { Bandeau, Champ } from '@/ui/v2/formulaire';
import { jour } from '../../ui/composants';
import { ChampPosition, messageErreur as message } from './ChampPosition';
import { Creation } from './Creation';
import { aller, useAdresse } from '../commun/adresse';
import { TitreEcran } from './Cadre';
import { Compteur } from './ui';
import { FicheEcole } from './FicheEcole';
import {
  IconeAjouter,
  IconeChercher,
  IconeFermer,
  IconeOeil,
  IconeRetour,
} from '@/ui/shadcn/icones';

export const libelleMotifRetrait: Record<Valeur<'motif_retrait'>, string> = {
  demande_ecole: "À la demande de l'école",
  erreur: 'Erreur dans la fiche',
  fermeture: "L'école a fermé",
  doublon: 'Doublon',
  autre: 'Autre',
};

type Etat = 'a_situer' | 'prete' | 'publiee' | 'retiree' | 'corbeille' | 'brouillon';

function etatDe(e: EcoleVue): Etat {
  if (e.corbeille) return 'corbeille';
  if (e.publication === 'publiee') return 'publiee';
  if (e.publication === 'retiree') return 'retiree';
  if (e.publication === 'prete') return 'prete';
  return e.aSituer ? 'a_situer' : 'brouillon';
}

/** Pour comparer un nom saisi à celui de l'école : sans accent, sans majuscule, sans espace en trop. */
const comparable = (texte: string) =>
  texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('fr');

const EN_LIGNE = 'Elle paraît sur ntanova.com après la prochaine mise à jour du site.';

/** Le nom d'un site, avec son étiquette quand l'école en a plusieurs. */
const nomDuSite = (x: Pick<EcoleVue, 'nom' | 'etiquette'>) =>
  x.etiquette ? `${x.nom} — ${x.etiquette}` : x.nom;

function LigneEcole({
  e,
  ecoles,
  relais,
  divisions,
  admin,
  surChangement,
  pleinEcran = false,
  site = false,
  rangSite = 0,
}: {
  e: EcoleVue;
  /** Une ligne de site, sous le nom de son école (l'école a plusieurs sites). */
  site?: boolean;
  rangSite?: number;
  ecoles: EcoleVue[];
  relais: RelaisVu[];
  divisions: DivisionVue[];
  admin: PortAdministration;
  /** `dejaDit` : le panneau ouvert l'a déjà dit ; la page relit, sans le redire (17/11 : message en double). */
  surChangement: (texte: string, dejaDit?: boolean) => void;
  /** Admin v2 : la fiche de l'école en plein écran (`#ecoles/fiche/<id>`), à la place du tiroir « Gérer ». */
  pleinEcran?: boolean;
}) {
  const etat = etatDe(e);
  // Lot G : l'école voisine au même lieu (même portail), notée depuis « Est-ce une école connue ? ».
  const memeLieu = e.memeLieuQue ? (ecoles.find((x) => x.id === e.memeLieuQue) ?? null) : null;
  const [declencheur, setDeclencheur] = useState<HTMLElement | null>(null);
  const [operation, setOperation] = useState(false);
  const [relaisId, setRelaisId] = useState(e.confiee?.relaisId ?? relais[0]?.id ?? '');
  const [note, setNote] = useState(e.confiee?.note ?? '');
  // v2 (13/11) : ce qu'il faut faire, pourquoi, la date limite et la paie de la mission (fixée par NTanova en la confiant).
  const [tache, setTache] = useState('');
  const [raison, setRaison] = useState('');
  const [avantLe, setAvantLe] = useState('');
  const [paie, setPaie] = useState('');
  const [genre, setGenre] = useState<Valeur<'mission_kind'>>(
    e.confiee?.genre ?? (e.aSituer ? 'locate' : 'verify'),
  );
  const [mode, setMode] = useState<
    | 'retirer'
    | 'corbeille'
    | 'supprimer'
    | 'fusionner'
    | 'modifier'
    | 'situer'
    | 'mission'
    | 'photo-publique'
    | 'equipements'
    | 'frais'
    | 'places'
    | 'contact-public'
    | 'contacts'
    | 'agrement'
    | 'mot-direction'
    | 'completer'
    | 'images'
    | 'rattacher'
    | 'nouvelles'
    | 'admission'
    | 'formations'
    | 'inscriptions'
    | null
  >(null);
  const [motif, setMotif] = useState<Valeur<'motif_retrait'>>('demande_ecole');
  const [noteRetrait, setNoteRetrait] = useState('');
  const [gardee, setGardee] = useState('');
  const [apercu, setApercu] = useState<ApercuSuppression | null>(null);
  const [nomSaisi, setNomSaisi] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  // Le retour d'un enregistrement : le bandeau de la page reste derrière le panneau, il se redit donc dedans, en vue.
  const [retour, setRetour] = useState<string | null>(null);
  const zoneRetour = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (retour) zoneRetour.current?.scrollIntoView({ block: 'nearest' });
  }, [retour]);
  const signaler = (texte: string) => {
    setRetour(texte);
    surChangement(texte, true);
  };
  // 17/11 : « Changer la couverture » et « Ajouter le logo » ouvrent le formulaire des images sur leur place.
  const [genreImages, setGenreImages] = useState<Valeur<'media_kind'> | null>(null);

  const agir = async (action: () => Promise<unknown>, texte: string) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      setMode(null);
      surChangement(texte);
    } catch (err) {
      setErreur(message(err));
    } finally {
      setEnCours(false);
    }
  };

  const autres = ecoles.filter((x) => x.id !== e.id && x.publication !== 'retiree');
  // v2 (13/11) : « C'est un site de… » : une ligne par école (pas par site), jamais celle de ce site.
  const ecolesCibles = [
    ...new Map(
      autres.filter((x) => x.institutionId !== e.institutionId).map((x) => [x.institutionId, x]),
    ).values(),
  ].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const [ecoleCible, setEcoleCible] = useState('');
  const seul = !ecoles.some((x) => x.id !== e.id && x.institutionId === e.institutionId);
  const prenom = relais.find((r) => r.id === relaisId)?.prenom ?? '';

  const ouvrir = (section: NonNullable<typeof mode>, bouton: HTMLElement) => {
    setDeclencheur(bouton.closest('details')?.querySelector('summary') ?? bouton);
    const menu = bouton.closest('details');
    if (menu) menu.open = false;
    setErreur(null);
    setRetour(null);
    setMode(section);
  };
  const confirmation =
    mode === 'retirer' || mode === 'fusionner' || mode === 'corbeille' || mode === 'supprimer';
  const nomCorrespond = comparable(nomSaisi) === comparable(e.nom);

  const contenuGestion = (
    <>
      {retour && !confirmation && (
        <p ref={zoneRetour} className={v2.bandeSucces} role="status">
          {retour}
        </p>
      )}
      {mode === 'completer' && (
        <ManquesEcole
          ecoleId={e.id}
          nom={e.nom}
          numero={e.contactPublic?.numero ?? null}
          admin={admin}
          relais={relais}
          surChangement={signaler}
        />
      )}
      {mode === 'nouvelles' && (
        <NouvellesEcole ecoleId={e.id} admin={admin} surChangement={signaler} />
      )}
      {mode === 'admission' && (
        <AdmissionEcole ecoleId={e.id} admin={admin} surChangement={signaler} />
      )}
      {mode === 'formations' && (
        <FormationsSuperieur
          ecoleId={e.id}
          nom={e.nom}
          niveaux={e.niveaux}
          admin={admin}
          surChangement={signaler}
        />
      )}
      {mode === 'images' && (
        <ImagesEcole
          ecoleId={e.id}
          admin={admin}
          genreVoulu={genreImages}
          surChangement={signaler}
        />
      )}
      {mode === 'photo-publique' && (
        <PhotoPublique
          surOccupation={setOperation}
          integre
          ecoleId={e.id}
          nom={e.nom}
          admin={admin}
          fermer={() => setMode(null)}
          surChangement={signaler}
        />
      )}
      {mode === 'equipements' && (
        <EquipementsEcole
          surOccupation={setOperation}
          integre
          ecoleId={e.id}
          nom={e.nom}
          equipements={e.equipements ?? []}
          admin={admin}
          fermer={() => setMode(null)}
          surChangement={signaler}
        />
      )}
      {mode === 'frais' && (
        <FraisEcole
          surOccupation={setOperation}
          integre
          ecoleId={e.id}
          nom={e.nom}
          cycles={e.niveaux}
          frais={e.frais ?? []}
          fraisDeDossier={e.fraisDeDossier ?? []}
          admin={admin}
          fermer={() => setMode(null)}
          surChangement={signaler}
        />
      )}
      {mode === 'places' && (
        <PlacesEffectifs
          surOccupation={setOperation}
          ecoleId={e.id}
          nom={e.nom}
          cycles={e.niveaux}
          places={e.places ?? []}
          effectifs={e.effectifs ?? []}
          admin={admin}
          surChangement={signaler}
        />
      )}
      {mode === 'contacts' && (
        <GererContacts
          admin={admin}
          ecoleId={e.id}
          surOccupation={setOperation}
          surChangement={signaler}
        />
      )}
      {mode === 'mot-direction' && (
        <MotDirectionEcole
          surOccupation={setOperation}
          integre
          ecoleId={e.id}
          nom={e.nom}
          mot={e.motDirection ?? null}
          confirmee={e.verifieeLe !== null}
          admin={admin}
          fermer={() => setMode(null)}
          surChangement={signaler}
        />
      )}
      {mode === 'contact-public' && (
        <ContactPublic
          surOccupation={setOperation}
          integre
          ecoleId={e.id}
          nom={e.nom}
          contact={e.contactPublic ?? null}
          fermer={() => setMode(null)}
          admin={admin}
          surChangement={signaler}
        />
      )}
      {(mode === 'inscriptions' || mode === 'contact-public') && (
        <InscriptionsEcole
          surOccupation={setOperation}
          integre
          ecoleId={e.id}
          nom={e.nom}
          inscriptions={e.inscriptions ?? []}
          admin={admin}
          fermer={() => setMode(null)}
          surChangement={signaler}
        />
      )}

      {mode === 'retirer' && (
        <form
          className={v2.motif}
          onSubmit={(ev) => {
            ev.preventDefault();
            void agir(
              () => admin.retirerEcole(e.id, motif, noteRetrait.trim() || null),
              `${e.nom} est retirée du site. Son ancienne adresse dira « n'existe pas ou n'est plus publiée », sans son nom.`,
            );
          }}
        >
          <label className={v2.groupe}>
            Motif
            <select
              className={v2.champ}
              value={motif}
              onChange={(ev) => setMotif(ev.target.value as Valeur<'motif_retrait'>)}
            >
              {listes.motif_retrait
                .filter((m) => m !== 'doublon')
                .map((m) => (
                  <option key={m} value={m}>
                    {libelleMotifRetrait[m]}
                  </option>
                ))}
            </select>
          </label>
          <label className={v2.groupe}>
            Note (facultatif)
            <input
              className={v2.champ}
              maxLength={500}
              value={noteRetrait}
              onChange={(ev) => setNoteRetrait(ev.target.value)}
            />
          </label>
          <Bouton type="submit" variante="danger" enCours={enCours} texteEnCours="Retrait…">
            Retirer {e.nom} du site
          </Bouton>
        </form>
      )}

      {mode === 'corbeille' && (
        <form
          className={v2.motif}
          onSubmit={(ev) => {
            ev.preventDefault();
            void agir(
              () => admin.mettreALaCorbeille(e.id, motif, noteRetrait.trim() || null),
              `${e.nom} est à la corbeille : elle a quitté les listes et, après la prochaine mise à jour, le site. Tu peux la restaurer depuis « Corbeille ».`,
            );
          }}
        >
          <label className={v2.groupe}>
            Motif
            <select
              className={v2.champ}
              value={motif}
              onChange={(ev) => setMotif(ev.target.value as Valeur<'motif_retrait'>)}
            >
              {listes.motif_retrait
                .filter((m) => m !== 'doublon')
                .map((m) => (
                  <option key={m} value={m}>
                    {libelleMotifRetrait[m]}
                  </option>
                ))}
            </select>
          </label>
          <label className={v2.groupe}>
            Note (facultatif)
            <input
              className={v2.champ}
              maxLength={500}
              value={noteRetrait}
              onChange={(ev) => setNoteRetrait(ev.target.value)}
            />
          </label>
          <Bouton
            type="submit"
            variante="danger"
            enCours={enCours}
            texteEnCours="Mise à la corbeille…"
          >
            Mettre {e.nom} à la corbeille
          </Bouton>
        </form>
      )}

      {mode === 'supprimer' && (
        <form
          className={v2.motif}
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!apercu || apercu.bloque || !nomCorrespond) return;
            void agir(
              () => admin.supprimerDefinitivement(e.id),
              `${e.nom} est supprimée définitivement, avec ses fiches, ses photos et ses contacts.`,
            );
          }}
        >
          {apercu === null ? (
            <p aria-busy="true">Lecture de ce que la suppression emporterait…</p>
          ) : apercu.bloque ? (
            <p className={v2.attention} role="status">
              {apercu.bloque}
            </p>
          ) : (
            <>
              <p>
                La suppression emporte <b>{apercu.fiches}</b> fiche
                {apercu.fiches > 1 ? 's' : ''}, <b>{apercu.photos}</b> photo
                {apercu.photos > 1 ? 's' : ''} (fichiers compris), <b>{apercu.contacts}</b> contact
                {apercu.contacts > 1 ? 's' : ''}, ses frais, ses équipements, son agrément, son mot
                de la direction, ses dates d’inscription et son historique. Seule une trace garde
                son nom et ces nombres.
              </p>
              <label className={v2.groupe}>
                Pour confirmer, écris le nom de l’école : <b>{e.nom}</b>
                <input
                  className={v2.champ}
                  autoComplete="off"
                  value={nomSaisi}
                  onChange={(ev) => setNomSaisi(ev.target.value)}
                />
              </label>
              <Bouton
                type="submit"
                variante="danger"
                enCours={enCours}
                disabled={!nomCorrespond}
                texteEnCours="Suppression…"
              >
                Supprimer définitivement {e.nom}
              </Bouton>
            </>
          )}
        </form>
      )}

      {mode === 'rattacher' && (
        <form
          className={v2.motifPile}
          aria-label={`Rattacher ${e.nom} à une autre école`}
          onSubmit={(ev) => {
            ev.preventDefault();
            const cible = ecolesCibles.find((x) => x.institutionId === ecoleCible);
            if (!cible) return;
            void agir(
              () =>
                admin
                  .rattacherSite(e.id, cible.institutionId)
                  .then((r) =>
                    r.ancienneSupprimee
                      ? signaler(
                          `Ce site est maintenant un site de ${cible.nom}. L’ancienne école, sans autre site, est supprimée (notée au journal).`,
                        )
                      : undefined,
                  ),
              `Ce site est maintenant un site de ${cible.nom}. Son adresse publique ne change pas.`,
            );
          }}
        >
          <h3>C’est un site de…</h3>
          <Champ libelle="L’école">
            {(a) => (
              <select
                {...a}
                className={v2.champ}
                value={ecoleCible}
                onChange={(ev) => setEcoleCible(ev.target.value)}
              >
                <option value="">Choisir</option>
                {ecolesCibles.map((x) => (
                  <option key={x.institutionId} value={x.institutionId}>
                    {x.nom}
                    {x.division ? ` · ${x.division}` : ''}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <p className={v2.mention}>
            Le site garde son adresse publique.
            {seul
              ? ' Son école actuelle n’a pas d’autre site : ce qui manque à l’école choisie (sigle, année, site web, logo, mot de la direction) lui est donné, puis elle est supprimée.'
              : ' Son école actuelle garde ses autres sites.'}
          </p>
          {erreur && /logo|mot de la direction/.test(erreur) && (
            <div className={v2.bandeAttention} role="alert">
              <p>
                <b>{erreur}</b> Garde celui qui vaut : retire l’autre dans sa fiche, puis reviens
                ici.
              </p>
              <button
                type="button"
                className={v2.boutonSecondaire}
                onClick={() => {
                  setErreur(null);
                  setMode(/logo/.test(erreur) ? 'images' : 'mot-direction');
                }}
              >
                {/logo/.test(erreur) ? 'Voir le logo de ce site' : 'Voir le mot de ce site'}
              </button>
            </div>
          )}
          <Bouton type="submit" enCours={enCours} disabled={!ecoleCible}>
            Rattacher ce site
          </Bouton>
        </form>
      )}

      {mode === 'fusionner' && (
        <form
          className={v2.motif}
          onSubmit={(ev) => {
            ev.preventDefault();
            const cible = autres.find((x) => x.id === gardee);
            if (!cible) return;
            void agir(
              () => admin.fusionnerEcoles(e.id, cible.id),
              `${e.nom} est fusionnée dans ${cible.nom} : son ancienne adresse y renvoie.`,
            );
          }}
        >
          <label className={v2.groupe}>
            C'est la même école que…
            <select
              className={v2.champ}
              value={gardee}
              onChange={(ev) => setGardee(ev.target.value)}
            >
              <option value="">Choisir l'école à garder</option>
              {autres.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nom}
                </option>
              ))}
            </select>
          </label>
          <Bouton
            type="submit"
            variante="danger"
            enCours={enCours}
            disabled={!gardee}
            texteEnCours="Fusion…"
          >
            Fusionner (cette fiche est retirée)
          </Bouton>
        </form>
      )}

      {mode === 'mission' && (
        <form
          className={v2.motif}
          aria-label={`Mission pour ${e.nom}`}
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!relaisId) return;
            const paieXaf = paie.trim() === '' ? null : Number(paie.replace(/\s/g, ''));
            if (paieXaf !== null && (!Number.isInteger(paieXaf) || paieXaf < 0)) {
              setErreur('La paie est un nombre entier de FCFA, ou rien.');
              return;
            }
            void agir(
              () =>
                admin.confierEcole(e.id, relaisId, genre, note.trim() || null, {
                  tache: tache.trim() || null,
                  raison: raison.trim() || null,
                  avantLe: avantLe || null,
                  paieXaf,
                }),
              `${e.nom} est confiée à ${prenom}.`,
            );
          }}
        >
          {relais.length === 0 ? (
            <p className={v2.mentionLarge}>
              Aucun relais actif : active un relais dans l’onglet « Relais » d’abord.
            </p>
          ) : (
            <>
              <Champ libelle="Relais">
                {(a) => (
                  <select
                    {...a}
                    className={v2.champ}
                    value={relaisId}
                    onChange={(ev) => setRelaisId(ev.target.value)}
                  >
                    {relais.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.prenom || '[sans prénom]'}
                      </option>
                    ))}
                  </select>
                )}
              </Champ>
              <Champ libelle="Ce que le relais doit faire">
                {(a) => (
                  <select
                    {...a}
                    className={v2.champ}
                    value={genre}
                    onChange={(ev) => setGenre(ev.target.value as Valeur<'mission_kind'>)}
                  >
                    {listes.mission_kind.map((m) => (
                      <option key={m} value={m}>
                        {libelleTypeMission[m]}
                      </option>
                    ))}
                  </select>
                )}
              </Champ>
              <Champ
                libelle="À vérifier"
                facultatif
                aide="Le relais le lit dans « Mon secteur ». Vouvoie-le, et n’y mets aucune référence interne (ENT-…, ETB-…) : une phrase qui en contient une ne lui est pas montrée."
              >
                {(a) => (
                  <input
                    {...a}
                    className={v2.champ}
                    maxLength={500}
                    placeholder="Ex. : le nom sur l’enseigne, le repère…"
                    value={note}
                    onChange={(ev) => setNote(ev.target.value)}
                  />
                )}
              </Champ>
              <Champ libelle="Ce qu’il devra faire" facultatif aide="Une phrase, vouvoyée.">
                {(a) => (
                  <input
                    {...a}
                    className={v2.champ}
                    maxLength={300}
                    placeholder="Ex. : photographier le prospectus des frais, en entier."
                    value={tache}
                    onChange={(ev) => setTache(ev.target.value)}
                  />
                )}
              </Champ>
              <Champ libelle="Pourquoi" facultatif>
                {(a) => (
                  <input
                    {...a}
                    className={v2.champ}
                    maxLength={300}
                    value={raison}
                    onChange={(ev) => setRaison(ev.target.value)}
                  />
                )}
              </Champ>
              <Champ libelle="Avant le" facultatif>
                {(a) => (
                  <input
                    {...a}
                    className={v2.champ}
                    type="date"
                    value={avantLe}
                    onChange={(ev) => setAvantLe(ev.target.value)}
                  />
                )}
              </Champ>
              <Champ
                libelle="Paie de la mission (FCFA)"
                facultatif
                aide="Payée à la place de la fiche qui la termine."
              >
                {(a) => (
                  <input
                    {...a}
                    className={v2.champ}
                    inputMode="numeric"
                    value={paie}
                    onChange={(ev) => setPaie(ev.target.value)}
                  />
                )}
              </Champ>
              <div className={v2.actionsLarge}>
                <Bouton type="submit" enCours={enCours} disabled={!relaisId}>
                  {e.confiee ? 'Confier de nouveau' : 'Confier'}
                </Bouton>
                {e.confiee && (
                  <button
                    type="button"
                    className={v2.boutonSecondaire}
                    disabled={enCours}
                    onClick={() =>
                      void agir(() => admin.reprendreEcole(e.id), `${e.nom} n'est plus confiée.`)
                    }
                  >
                    Reprendre
                  </button>
                )}
              </div>
            </>
          )}
        </form>
      )}

      {mode === 'situer' && (
        <FormulairePosition
          surOccupation={setOperation}
          e={e}
          divisions={divisions}
          admin={admin}
          surEnregistre={(texte) => {
            setMode(null);
            surChangement(texte);
          }}
          surAnnuler={() => setMode(null)}
        />
      )}

      {mode === 'modifier' && (
        <FormulaireEcole
          surOccupation={setOperation}
          e={e}
          admin={admin}
          surEnregistre={(texte) => {
            setMode(null);
            surChangement(texte);
          }}
          surAnnuler={() => setMode(null)}
        />
      )}
      {(mode === 'agrement' || mode === 'modifier') && (
        <AgrementEcole
          surOccupation={setOperation}
          integre
          ecoleId={e.id}
          nom={e.nom}
          agrements={e.agrements ?? []}
          filieres={e.filieres ?? []}
          admin={admin}
          fermer={() => setMode(null)}
          surChangement={signaler}
        />
      )}

      {erreur && (
        <p className={v2.erreur} role="alert">
          {erreur}
        </p>
      )}
    </>
  );

  // La fiche d'une école en plein écran (planches « Fiche d'école, admin ») : la carte de l'école, ses photos, ses
  // rubriques ; chaque rubrique s'ouvre dans un tiroir (ordinateur) ou un écran plein (téléphone).
  function ficheEnPleinEcran() {
    const sites = ecoles.filter((x) => x.institutionId === e.institutionId);
    const titres: Record<NonNullable<typeof mode>, string> = {
      completer: 'Compléter la fiche',
      modifier: 'En bref',
      situer: 'Position',
      'contact-public': 'Contact et inscriptions',
      contacts: 'Contacts de l’école',
      frais: 'Frais',
      places: 'Places et effectifs',
      inscriptions: 'Inscriptions',
      equipements: 'Sur place',
      agrement: 'Agrément',
      'mot-direction': 'Mot de la direction',
      'photo-publique': 'Photos',
      images: 'Couverture, logo et images',
      nouvelles: 'Nouvelles',
      admission: 'Admission',
      formations: 'Formations',
      mission: 'Confier à un relais',
      retirer: 'Retirer',
      fusionner: 'Fusionner',
      corbeille: 'Mettre à la corbeille',
      supprimer: 'Supprimer définitivement',
      rattacher: 'C’est un site de…',
    };
    const lienPublic = etat === 'publiee' && e.numeroPublic ? `/ecoles/${e.numeroPublic}/` : null;
    const gestes = (
      <>
        {lienPublic && (
          <a
            className={v2.boutonSecondairePetit}
            href={lienPublic}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconeOeil className="size-[18px]" aria-hidden />
            Aperçu
          </a>
        )}
        {etat !== 'corbeille' && (
          <ActionsSecondaires nom={e.nom}>
            {lienPublic && (
              <a href={lienPublic} target="_blank" rel="noopener noreferrer">
                Voir la page publique
              </a>
            )}
            <button type="button" onClick={(ev) => ouvrir('mission', ev.currentTarget)}>
              {e.confiee ? 'Mission en cours…' : 'Confier à un relais'}
            </button>
            {etat !== 'retiree' && (
              <button type="button" onClick={(ev) => ouvrir('rattacher', ev.currentTarget)}>
                C’est un site de…
              </button>
            )}
            {etat !== 'retiree' && (
              <button type="button" onClick={(ev) => ouvrir('fusionner', ev.currentTarget)}>
                Fusionner avec un doublon
              </button>
            )}
            {(etat === 'prete' || etat === 'publiee') && (
              <button type="button" onClick={(ev) => ouvrir('retirer', ev.currentTarget)}>
                Retirer de la publication
              </button>
            )}
            <button
              type="button"
              className="text-destructive!"
              onClick={(ev) => ouvrir('corbeille', ev.currentTarget)}
            >
              Mettre à la corbeille
            </button>
          </ActionsSecondaires>
        )}
      </>
    );
    // Planches : les frais, les nouvelles et les formations du supérieur s'ouvrent en page (le prospectus ou l'aperçu à côté),
    // les autres rubriques en tiroir.
    const enPage =
      mode === 'frais' || mode === 'nouvelles' || mode === 'formations' || mode === 'admission';
    if (enPage)
      return (
        <article aria-label={`${titres[mode]} · ${e.nom}`} className="flex flex-col gap-4">
          <nav
            aria-label="Fil d’Ariane"
            className="flex flex-wrap items-center gap-1.5 text-[15px] max-lg:hidden"
          >
            <a className="font-bold text-primary-strong underline" href="#ecoles">
              Écoles
            </a>
            <span className="text-muted-foreground">›</span>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="cursor-pointer border-0 bg-transparent p-0 font-sans text-[15px] font-bold text-primary-strong underline"
            >
              {e.nom}
              {e.etiquette ? ` · ${e.etiquette}` : ''}
            </button>
            <span className="text-muted-foreground">›</span>
            <span className="text-muted-foreground">{titres[mode]}</span>
          </nav>
          <TitreEcran
            titre={
              mode === 'frais'
                ? 'Frais par classe'
                : mode === 'nouvelles'
                  ? 'Une nouvelle'
                  : titres[mode]
            }
            retour={{ libelle: e.nom, chemin: `ecoles/fiche/${e.id}` }}
            titreHaut={mode === 'frais' ? 'Frais par classe' : titres[mode]}
          />
          {mode === 'frais' && (
            <p className="-mt-2 mb-0 text-[15px] text-muted-foreground">
              Recopie ce que dit le prospectus, ligne par ligne.
            </p>
          )}
          {contenuGestion}
        </article>
      );
    return (
      <article aria-label={`Fiche de ${e.nom}`} className="flex flex-col gap-4">
        <TitreEcran
          titre={e.nom}
          cacherTitre
          retour={{ libelle: 'Écoles', chemin: 'ecoles' }}
          titreHaut="Écoles"
        />
        <div className="flex items-center gap-3 max-lg:hidden">
          <nav aria-label="Fil d’Ariane" className="flex flex-1 items-center gap-1.5 text-[15px]">
            <IconeRetour className="size-4" aria-hidden />
            <a className="font-bold text-primary-strong underline" href="#ecoles">
              Écoles
            </a>
            <span className="text-muted-foreground">›</span>
            <span className="text-muted-foreground">
              {e.nom}
              {e.etiquette ? ` · ${e.etiquette}` : ''}
            </span>
          </nav>
          {gestes}
        </div>
        {/* Panneau ouvert : il dit lui-même le retour ; la fiche le redit une fois le panneau fermé. */}
        {retour && (!mode || confirmation) && (
          <p ref={mode ? undefined : zoneRetour} className={v2.bandeSucces} role="status">
            {retour}
          </p>
        )}
        {erreur && !mode && (
          <p className={v2.erreur} role="alert">
            {erreur}
          </p>
        )}
        <FicheEcole
          e={e}
          sites={sites}
          etat={etat}
          admin={admin}
          memeLieu={memeLieu}
          gestes={gestes}
          ouvrir={(r, genre) => {
            setErreur(null);
            setRetour(null);
            setGenreImages(genre ?? null);
            setMode(r);
          }}
          retirerMemeLieu={() =>
            void agir(
              () => admin.definirMemeLieu(e.id, null),
              `« Même lieu » est retiré de ${e.nom}.`,
            )
          }
          publier={
            etat === 'prete' || (etat === 'retiree' && !e.retrait?.remplaceePar) ? (
              <Bouton
                enCours={enCours}
                texteEnCours="Publication…"
                onClick={() =>
                  void agir(() => admin.publierEcole(e.id), `${e.nom} est publiée. ${EN_LIGNE}`)
                }
              >
                {etat === 'retiree' ? 'Republier' : 'Publier'}
              </Bouton>
            ) : etat === 'a_situer' ? (
              <Bouton onClick={(ev) => ouvrir('situer', ev.currentTarget)}>Situer</Bouton>
            ) : null
          }
        />
        {mode && (
          <Dialogue
            titre={`${titres[mode]} · ${e.nom}`}
            variante={confirmation ? 'confirmation' : 'tiroir'}
            retourFocus={declencheur}
            occupe={enCours || operation}
            fermer={() => setMode(null)}
            entete={
              <>
                <h2>{titres[mode]}</h2>
                <span className="text-sm text-muted-foreground">
                  {e.nom}
                  {e.etiquette ? ` · ${e.etiquette}` : ''}
                </span>
              </>
            }
          >
            {contenuGestion}
          </Dialogue>
        )}
      </article>
    );
  }

  if (pleinEcran) return ficheEnPleinEcran();

  // Une ligne de la liste (planche « Écoles ») : une école d'un seul site, ou un site sous le nom de son école. Le geste
  // de la ligne seulement (Publier, Situer, Restaurer, ouvrir la fiche) : le reste est dans la fiche.
  const geste =
    etat === 'prete' ? (
      <Bouton
        className={v2.petit}
        enCours={enCours}
        texteEnCours="Publication…"
        onClick={() =>
          void agir(() => admin.publierEcole(e.id), `${e.nom} est publiée. ${EN_LIGNE}`)
        }
      >
        Publier
      </Bouton>
    ) : etat === 'a_situer' ? (
      <Bouton
        variante="secondaire"
        className={v2.petit}
        onClick={(ev) => ouvrir('situer', ev.currentTarget)}
      >
        Situer
      </Bouton>
    ) : etat === 'corbeille' ? (
      <span className="flex flex-wrap justify-end gap-2">
        <Bouton
          variante="secondaire"
          className={v2.petit}
          enCours={enCours}
          texteEnCours="Restauration…"
          onClick={() =>
            void agir(
              () => admin.restaurerEcole(e.id),
              `${e.nom} est restaurée. Elle est de nouveau dans les listes ; si elle était publiée, republie-la.`,
            )
          }
        >
          Restaurer
        </Bouton>
        <Bouton
          variante="danger"
          className={v2.petit}
          onClick={(ev) => {
            setApercu(null);
            setNomSaisi('');
            ouvrir('supprimer', ev.currentTarget);
            // Ce que la suppression emporterait, lu avant de demander la confirmation.
            admin
              .apercuSuppression(e.id)
              .then(setApercu)
              .catch((err: unknown) => setErreur(message(err)));
          }}
        >
          Supprimer…
        </Bouton>
      </span>
    ) : (
      <a className={cn(v2.lien, 'min-h-0')} href={`#ecoles/fiche/${e.id}`}>
        Ouvrir la fiche
      </a>
    );
  const ou =
    e.aSituer && etat !== 'corbeille'
      ? 'Pas sur la carte'
      : ([...new Set([e.quartier, e.division].filter(Boolean))][0] ?? '—');
  const cellule = 'px-4 py-3 align-middle max-lg:p-0';
  return (
    <div
      role="row"
      aria-label={site ? `${nomDuSite(e)}` : e.nom}
      className={cn(
        'grid items-center border-t border-border lg:grid-cols-[minmax(0,2.3fr)_1fr_1.4fr_1.1fr_1fr_auto]',
        'max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-x-3 max-lg:gap-y-0.5 max-lg:px-4 max-lg:py-3',
        site && 'lg:bg-background/40',
      )}
    >
      <div role="cell" className={cn(cellule, site && 'lg:pl-9', 'max-lg:col-start-1')}>
        <a
          href={`#ecoles/fiche/${e.id}`}
          className={cn(
            'text-foreground no-underline hover:underline',
            site ? 'text-[15px] font-bold' : 'font-serif text-[17px] font-bold',
          )}
        >
          {site ? (rangSite ? `${e.etiquette ?? `Site ${rangSite}`}` : e.etiquette) : e.nom}
        </a>
        {!site && memeLieu && (
          <span className="block text-[13px] text-muted-foreground">
            Même lieu que {nomDuSite(memeLieu)}
          </span>
        )}
        {e.retrait && etat === 'retiree' && (
          <span className="block text-[13px] text-muted-foreground">
            {libelleMotifRetrait[e.retrait.motif]}, le {jour(e.retrait.le)}
          </span>
        )}
        <span className="block text-[13px] text-muted-foreground lg:hidden">
          {[site ? etendue(e.niveaux) : libelleTypeEcole[e.typeEcole], ou].join(' · ')}
        </span>
      </div>
      <div role="cell" className={cn(cellule, 'max-lg:hidden')}>
        {site ? '' : libelleTypeEcole[e.typeEcole]}
      </div>
      <div role="cell" className={cn(cellule, 'max-lg:hidden')}>
        {etendue(e.niveaux)}
      </div>
      <div
        role="cell"
        className={cn(cellule, 'max-lg:hidden', e.aSituer && 'text-muted-foreground')}
      >
        {ou}
      </div>
      <div role="cell" className={cn(cellule, 'max-lg:hidden')}>
        <BadgePublication etat={etat} />
      </div>
      <div
        role="cell"
        className={cn(
          cellule,
          'text-right max-lg:col-start-2 max-lg:row-span-2 max-lg:row-start-1',
        )}
      >
        {etat === 'publiee' || etat === 'retiree' ? (
          <>
            <span className="lg:hidden">
              <BadgePublication etat={etat} />
            </span>
            <span className="max-lg:hidden">{geste}</span>
          </>
        ) : (
          geste
        )}
        {mode && (
          <Dialogue
            titre={`${{ retirer: 'Retirer', fusionner: 'Fusionner', corbeille: 'Mettre à la corbeille', supprimer: 'Supprimer définitivement', situer: 'Situer' }[mode as 'retirer' | 'fusionner' | 'corbeille' | 'supprimer' | 'situer'] ?? 'Gérer'} ${e.nom}`}
            variante={confirmation ? 'confirmation' : 'tiroir'}
            description={
              mode === 'supprimer' ? 'Définitif : on ne revient pas en arrière.' : undefined
            }
            retourFocus={declencheur}
            occupe={enCours || operation}
            fermer={() => setMode(null)}
            entete={
              <h2>
                {mode === 'situer'
                  ? 'Situer'
                  : mode === 'supprimer'
                    ? 'Supprimer définitivement'
                    : e.nom}
              </h2>
            }
          >
            {contenuGestion}
          </Dialogue>
        )}
      </div>
    </div>
  );
}

/** « Maternelle à Collège » : du premier au dernier niveau, comme la planche. */
function etendue(niveaux: EcoleVue['niveaux']): string {
  if (niveaux.length === 0) return 'Aucun niveau';
  if (niveaux.length === 1) return libelleNiveau[niveaux[0]!];
  return `${libelleNiveau[niveaux[0]!]} à ${libelleNiveau[niveaux.at(-1)!].toLocaleLowerCase('fr')}`;
}

/**
 * Corriger une fiche sans repasser par le relais : le nom, le type, les niveaux, le programme,
 * le repère et le numéro. Seul ce qui a changé part ; la date de relevé ne bouge pas.
 */
function FormulaireEcole({
  e,
  admin,
  surEnregistre,
  surAnnuler,
  surOccupation,
}: {
  e: EcoleVue;
  admin: PortAdministration;
  surEnregistre: (texte: string) => void;
  surAnnuler: () => void;
  surOccupation: (occupe: boolean) => void;
}) {
  const [champs, setChamps] = useState<FormulaireEcole>(() => formulaireDe(e));
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const [rienADire, setRienADire] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    surOccupation(enCours);
    return () => surOccupation(false);
  }, [enCours, surOccupation]);

  const changer = (nouveaux: Partial<FormulaireEcole>) => {
    setChamps((avant) => ({ ...avant, ...nouveaux }));
    setRienADire(false);
  };
  const enregistrer = async (ev: { preventDefault: () => void }) => {
    ev.preventDefault();
    setErreur(null);
    const trouvees = erreursFormulaireEcole(champs);
    setErreurs(trouvees);
    if (Object.keys(trouvees).length > 0) return;
    const correction = versCorrection(e, champs);
    setRienADire(Object.keys(correction).length === 0);
    if (Object.keys(correction).length === 0) return;
    setEnCours(true);
    try {
      await admin.modifierEcole(e.id, correction);
      surEnregistre(
        `${correction.nom ?? e.nom} est modifiée.` +
          (e.publication === 'publiee'
            ? ' La correction paraît sur ntanova.com après la prochaine mise à jour du site.'
            : ''),
      );
    } catch (err) {
      setErreur(message(err));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form
      className={v2.motif}
      aria-label={`Modifier ${e.nom}`}
      noValidate
      onSubmit={(ev) => void enregistrer(ev)}
    >
      <ChampsFiche champs={champs} erreurs={erreurs} changer={changer} />
      {rienADire && (
        <p className={v2.mentionLarge} aria-live="polite">
          Rien n’a changé.
        </p>
      )}
      {erreur && (
        <p className={v2.erreurLarge} role="alert">
          {erreur}
        </p>
      )}
      <div className={v2.actionsLarge}>
        <Bouton type="submit" enCours={enCours}>
          Enregistrer
        </Bouton>
        <button
          type="button"
          className={v2.boutonSecondaire}
          disabled={enCours}
          onClick={surAnnuler}
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

/** Donner la position d'une école connue : elle passe sur la carte, et devient prête si elle était à situer. */
function FormulairePosition({
  e,
  divisions,
  admin,
  surEnregistre,
  surAnnuler,
  surOccupation,
}: {
  e: EcoleVue;
  divisions: DivisionVue[];
  admin: PortAdministration;
  surEnregistre: (texte: string) => void;
  surAnnuler: () => void;
  surOccupation: (occupe: boolean) => void;
}) {
  const [texte, setTexte] = useState(e.position ? ecrirePosition(e.position) : '');
  const [divisionId, setDivisionId] = useState('');
  // Ticket 201 (A35) : d'où vient la position ; rien de choisi d'avance (vide : pas dit).
  const [source, setSource] = useState<SourcePosition | ''>('');
  // Publiée, elle ne change pas de division (la base refuse : son adresse publique changerait).
  const publiee = e.publication === 'publiee';
  const [erreurChamp, setErreurChamp] = useState<string | undefined>();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  // 17/11 : publiée près d'une limite, sa vraie position peut tomber dans le contour voisin (les contours sont
  // approximatifs). Après le refus de la base, on offre de garder la division de la fiche.
  const [garder, setGarder] = useState(false);
  useEffect(() => {
    surOccupation(enCours);
    return () => surOccupation(false);
  }, [enCours, surOccupation]);

  const enregistrer = async (ev: { preventDefault: () => void }, forcer = false) => {
    ev.preventDefault();
    setErreur(null);
    setGarder(false);
    const { position, erreur: illisible } = lireChampPosition(texte);
    if (!position) {
      setErreurChamp(illisible ?? 'Colle la position de l’école.');
      return;
    }
    setErreurChamp(undefined);
    setEnCours(true);
    try {
      const ou = await admin.situerEcole(
        e.id,
        position,
        (forcer ? e.divisionId : divisionId) || null,
        source || null,
      );
      surEnregistre(
        `${e.nom} est située à ${ou}.` +
          (e.publication === 'brouillon'
            ? ' Elle est prête : publie-la quand tu veux.'
            : e.publication === 'publiee'
              ? ' La nouvelle position paraît sur ntanova.com après la prochaine mise à jour du site.'
              : ''),
      );
    } catch (err) {
      const texteErreur = message(err);
      if (
        publiee &&
        e.divisionId &&
        e.division &&
        /adresse publique changerait/.test(texteErreur)
      ) {
        setGarder(true);
        setErreur(
          `D’après nos contours, ce point est dans un autre arrondissement que ${e.division}. Les contours sont approximatifs : si l’école est bien à ${e.division}, garde ${e.division}. Sinon, retire d’abord la fiche du site.`,
        );
      } else setErreur(texteErreur);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form
      className={v2.motif}
      aria-label={`Situer ${e.nom}`}
      noValidate
      onSubmit={(ev) => void enregistrer(ev)}
    >
      <ChampPosition valeur={texte} surChange={setTexte} erreur={erreurChamp} />
      <Champ libelle="D’où vient cette position ?" facultatif>
        {(a) => (
          <select
            {...a}
            className={v2.champ}
            value={source}
            onChange={(ev) => setSource(ev.target.value as SourcePosition | '')}
          >
            <option value="">Je ne sais pas</option>
            <option value="carte_en_ligne">Une carte en ligne</option>
            <option value="ecole">L’école</option>
            <option value="relais">Un relais</option>
          </select>
        )}
      </Champ>
      {!publiee && (
        <Champ
          libelle="Division"
          facultatif
          aide="Laisse « Détectée d’après la position » : la base cherche l’arrondissement ou la ville. Choisis-la seulement quand aucun contour n’est connu à cet endroit."
        >
          {(a) => (
            <select
              {...a}
              className={v2.champ}
              value={divisionId}
              onChange={(ev) => setDivisionId(ev.target.value)}
            >
              <option value="">Détectée d’après la position</option>
              {divisions
                .filter((d) => d.niveau >= 2)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {cheminLisible(d.id, divisions)}
                  </option>
                ))}
            </select>
          )}
        </Champ>
      )}
      {erreur && (
        <p className={v2.erreurLarge} role="alert">
          {erreur}
        </p>
      )}
      {publiee && (
        <p className={v2.mentionLarge}>
          Elle est publiée : son adresse publique ne change pas, la position doit rester
          {e.division ? ` à ${e.division}` : ' dans sa division'}. La nouvelle position paraît sur
          ntanova.com après la prochaine mise à jour du site.
        </p>
      )}
      <div className={v2.actionsLarge}>
        <Bouton type="submit" enCours={enCours}>
          Enregistrer la position
        </Bouton>
        {garder && e.division && (
          <button
            type="button"
            className={v2.boutonSecondaire}
            disabled={enCours}
            onClick={(ev) => void enregistrer(ev, true)}
          >
            Garder {e.division}
          </button>
        )}
        <button
          type="button"
          className={v2.boutonSecondaire}
          disabled={enCours}
          onClick={surAnnuler}
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

type Filtre = 'toutes' | Etat;

export function Ecoles({ admin }: { admin: PortAdministration }) {
  const [ecoles, setEcoles] = useState<EcoleVue[] | null>(null);
  const [relais, setRelais] = useState<RelaisVu[]>([]);
  const [divisions, setDivisions] = useState<DivisionVue[]>([]);
  // « Voir les écoles » depuis une zone arrive ici avec la zone déjà choisie (#ecoles/zone/<id>) : toutes ses écoles, et
  // une puce qui dit le filtre et l'enlève. Sinon, planche : « À publier » d'abord.
  const [, sousAdresse, zoneDeLAdresse, gesteDeLAdresse] = useAdresse();
  const [divisionFiltre, setDivisionFiltre] = useState(
    sousAdresse === 'zone' ? (zoneDeLAdresse ?? '') : '',
  );
  const [filtre, setFiltre] = useState<Filtre>(divisionFiltre ? 'toutes' : 'prete');
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [ajout, setAjout] = useState(false);
  // 17/11 : le message d'une fiche ne suit pas sur la fiche d'un autre site.
  const [adresseDeLAnnonce, setAdresseDeLAnnonce] = useState(`${sousAdresse}/${zoneDeLAdresse}`);
  if (adresseDeLAnnonce !== `${sousAdresse}/${zoneDeLAdresse}`) {
    setAdresseDeLAnnonce(`${sousAdresse}/${zoneDeLAdresse}`);
    if (sousAdresse === 'fiche') setAnnonce(null);
  }

  const charger = useCallback(() => {
    Promise.all([admin.ecoles(), admin.relais(), admin.divisions()])
      .then(([e, r, d]) => {
        setEcoles(e);
        setRelais(r.filter((x) => x.statut === 'actif'));
        setDivisions(d);
        setErreur(null);
      })
      .catch(() => setErreur('La base ne répond pas. Vérifie le réseau et recharge la page.'));
  }, [admin]);

  useEffect(() => {
    charger();
  }, [charger]);

  const compte = (etat: Etat) => ecoles?.filter((e) => etatDe(e) === etat).length ?? 0;
  const visibles = (ecoles ?? []).filter(
    (e) =>
      // « Toutes » ne montre pas la corbeille : elle a son propre filtre.
      (filtre === 'toutes' ? etatDe(e) !== 'corbeille' : etatDe(e) === filtre) &&
      e.nom
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('fr')
        .includes(
          recherche
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLocaleLowerCase('fr'),
        ) &&
      (!divisionFiltre ||
        e.divisionId === divisionFiltre ||
        divisions
          .find((d) => d.id === e.divisionId)
          ?.chemin.startsWith(`${divisions.find((d) => d.id === divisionFiltre)?.chemin}.`)),
  );
  // Admin v2 : des onglets d'état, « À publier » d'abord ; le nombre en pastille.
  // Les sites d'une même école se suivent, dans l'ordre où l'école paraît d'abord.
  const premierRang = new Map<string, number>();
  visibles.forEach((e, i) => {
    if (!premierRang.has(e.institutionId)) premierRang.set(e.institutionId, i);
  });
  visibles.sort(
    (a, b) => (premierRang.get(a.institutionId) ?? 0) - (premierRang.get(b.institutionId) ?? 0),
  );
  const filtres: { valeur: Filtre; libelle: string; n: number | null }[] = [
    { valeur: 'prete', libelle: 'À publier', n: compte('prete') },
    {
      valeur: 'toutes',
      libelle: 'Toutes',
      n: (ecoles ?? []).filter((e) => etatDe(e) !== 'corbeille').length,
    },
    { valeur: 'a_situer', libelle: 'À situer', n: compte('a_situer') },
    { valeur: 'publiee', libelle: 'Publiées', n: compte('publiee') },
    { valeur: 'retiree', libelle: 'Retirées', n: compte('retiree') },
    { valeur: 'corbeille', libelle: 'Corbeille', n: compte('corbeille') },
  ];

  // Admin v2 : la fiche d'une école, en plein écran (`#ecoles/fiche/<id>`).
  if (sousAdresse === 'fiche') {
    const choisie = (ecoles ?? []).find((x) => x.id === zoneDeLAdresse);
    if (!choisie)
      return ecoles === null ? (
        <p className={v2.doux} aria-busy="true">
          Chargement…
        </p>
      ) : (
        <p>
          Cette école n’est plus dans la liste. <a href="#ecoles">Retour aux écoles</a>
        </p>
      );
    return (
      <div className={v2.pile}>
        {annonce && (
          <p className={v2.bandeSucces} role="status">
            {annonce}
          </p>
        )}
        {/* « + Un site » (16/11) : `#ecoles/fiche/<id>/site` ajoute un site à CETTE école, pas une autre école. */}
        {gesteDeLAdresse === 'site' && (
          <Dialogue
            titre={`Un site de ${choisie.nom}`}
            variante="tiroir"
            fermer={() => aller(`ecoles/fiche/${choisie.id}`)}
            entete={<h2>Un site de {choisie.nom}</h2>}
          >
            <Creation
              admin={admin}
              divisions={divisions}
              site={{ institutionId: choisie.institutionId, nom: choisie.nom }}
              surEnregistre={(texte) => {
                setAnnonce(texte);
                charger();
                aller(`ecoles/fiche/${choisie.id}`, true);
              }}
              surAnnuler={() => aller(`ecoles/fiche/${choisie.id}`)}
            />
          </Dialogue>
        )}
        <LigneEcole
          key={choisie.id}
          pleinEcran
          e={choisie}
          ecoles={ecoles ?? []}
          relais={relais}
          divisions={divisions}
          admin={admin}
          surChangement={(texte, dejaDit) => {
            if (!dejaDit) setAnnonce(texte);
            charger();
          }}
        />
      </div>
    );
  }

  // Planche : une école, puis ses sites dessous ; une école d'un seul site tient sur une ligne.
  // Une école dont un site est « à publier » se montre avec tous ses sites (planche : « Site 1 · Publiée », « Site 2 · Prête »).
  const groupes = [...new Set(visibles.map((e) => e.institutionId))].map((id) => {
    const vus = visibles.filter((e) => e.institutionId === id);
    if (filtre === 'retiree' || filtre === 'corbeille') return vus;
    const tous = (ecoles ?? []).filter((e) => e.institutionId === id && etatDe(e) !== 'corbeille');
    return tous.length > 1 ? tous : vus;
  });
  const pretes = (ecoles ?? []).filter((e) => etatDe(e) === 'prete');
  const publierToutes = async () => {
    setEnCours(true);
    setErreur(null);
    let n = 0;
    try {
      for (const e of pretes) {
        await admin.publierEcole(e.id);
        n++;
      }
      setAnnonce(
        `${n} école${n > 1 ? 's' : ''} publiée${n > 1 ? 's' : ''}. ${n > 1 ? EN_LIGNE.replace('Elle paraît', 'Elles paraissent') : EN_LIGNE}`,
      );
    } catch (err) {
      setErreur(`${n} publiée${n > 1 ? 's' : ''}, puis : ${message(err)}`);
    } finally {
      setEnCours(false);
      charger();
    }
  };
  const ligne = (e: EcoleVue, extra: { site?: boolean; rangSite?: number } = {}) => (
    <LigneEcole
      key={e.id}
      e={e}
      {...extra}
      ecoles={ecoles ?? []}
      relais={relais}
      divisions={divisions}
      admin={admin}
      surChangement={(texte) => {
        setAnnonce(texte);
        charger();
      }}
    />
  );
  const ajouter = (
    <Bouton onClick={() => setAjout(true)}>
      <IconeAjouter className="size-5" aria-hidden />
      Ajouter une école
    </Bouton>
  );

  return (
    <>
      <TitreEcran
        titre="Écoles"
        focusRetour
        actions={<span className="max-lg:hidden">{ajouter}</span>}
        regles={
          <>
            <p>
              Prépare les écoles et choisis celles à publier. Les changements paraissent après la
              prochaine mise à jour du site.
            </p>
            <p>
              Une école, ses sites dessous. « Publier les N d’un coup » publie toutes les écoles
              prêtes.
            </p>
          </>
        }
      />
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 lg:border-b lg:border-border">
        <div
          className="flex gap-5 max-lg:w-full max-lg:border-b max-lg:border-border"
          role="group"
          aria-label="Filtrer par état"
        >
          {filtres
            .filter((f) => ['prete', 'toutes', 'a_situer'].includes(f.valeur))
            .map((f) => (
              <button
                key={f.valeur}
                type="button"
                aria-pressed={filtre === f.valeur}
                onClick={() => setFiltre(f.valeur)}
                className="-mb-px flex min-h-11 cursor-pointer items-center border-0 border-b-[3px] border-transparent bg-transparent px-0 font-sans text-[15px] font-bold whitespace-nowrap text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring aria-pressed:border-primary aria-pressed:text-primary-strong"
              >
                {f.libelle}
                <Compteur n={f.n} />
              </button>
            ))}
        </div>
        <div className="mb-2 flex flex-1 items-center gap-2 lg:ml-auto lg:max-w-[22rem]">
          <label className="relative flex-1">
            <span className="sr-only">Rechercher une école</span>
            <IconeChercher
              className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              className={cn(v2.champ, 'h-12 pl-11')}
              placeholder="Une école, un site, un quartier"
              value={recherche}
              onChange={(ev) => setRecherche(ev.target.value)}
            />
          </label>
          <button
            type="button"
            aria-label="Ajouter une école"
            onClick={() => setAjout(true)}
            className={cn(v2.bouton, 'size-12 px-0 lg:hidden')}
          >
            <IconeAjouter className="size-6" aria-hidden />
          </button>
        </div>
      </div>
      {divisionFiltre && (
        <span className="-mt-2 flex">
          <button
            type="button"
            className={cn(v2.puce, 'border-primary bg-succes text-primary-strong')}
            aria-label={`Enlever le filtre : ${divisions.find((d) => d.id === divisionFiltre)?.nom ?? 'zone'}`}
            onClick={() => {
              setDivisionFiltre('');
              aller('ecoles');
            }}
          >
            {divisions.find((d) => d.id === divisionFiltre)?.nom ?? 'Zone'}
            <IconeFermer className="size-4" aria-hidden />
          </button>
        </span>
      )}

      {erreur && (
        <Bandeau ton="erreur" icone="alerte">
          <p>{erreur}</p>
        </Bandeau>
      )}
      {annonce && (
        <p className={v2.bandeSucces} role="status">
          {annonce}
        </p>
      )}

      <div
        role="table"
        aria-label="Écoles"
        className="overflow-hidden rounded-xl border border-border bg-card max-lg:border-0 max-lg:bg-transparent"
      >
        <div
          role="row"
          className="grid bg-muted text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase lg:grid-cols-[minmax(0,2.3fr)_1fr_1.4fr_1.1fr_1fr_auto] max-lg:hidden"
        >
          {['École et sites', 'Type', 'Niveaux', 'Où', 'État', ''].map((t, i) => (
            <div role="columnheader" key={i} className="px-4 py-3">
              {t || <span className="sr-only">Geste</span>}
            </div>
          ))}
        </div>
        {ecoles === null && !erreur && (
          <p className="m-0 px-4 py-4 text-muted-foreground" aria-busy="true">
            Chargement des écoles…
          </p>
        )}
        {ecoles !== null && visibles.length === 0 && (
          <p className="m-0 px-4 py-4 text-muted-foreground">Aucune école ici.</p>
        )}
        <div className="flex flex-col max-lg:gap-3">
          {groupes.map((sites) => {
            const premiere = sites[0]!;
            if (sites.length === 1)
              return (
                <div
                  key={premiere.id}
                  role="rowgroup"
                  className="max-lg:overflow-hidden max-lg:rounded-xl max-lg:border max-lg:border-border max-lg:bg-card max-lg:[&>[role=row]]:border-t-0"
                >
                  {ligne(premiere)}
                </div>
              );
            const nPretes = sites.filter((x) => etatDe(x) === 'prete').length;
            return (
              <div
                key={premiere.institutionId}
                role="rowgroup"
                aria-label={premiere.nom}
                className="border-t border-border max-lg:overflow-hidden max-lg:rounded-xl max-lg:border max-lg:bg-card"
              >
                <div
                  role="row"
                  className="grid items-center lg:grid-cols-[minmax(0,2.3fr)_1fr_1.4fr_1.1fr_1fr_auto] max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:px-4 max-lg:py-3"
                >
                  <div role="cell" className="px-4 py-3 max-lg:p-0">
                    <a
                      href={`#ecoles/fiche/${premiere.id}`}
                      className="font-serif text-[17px] font-bold text-foreground underline-offset-4 max-lg:underline"
                    >
                      {premiere.nom}
                    </a>
                    <span className="block text-[13px] text-muted-foreground lg:hidden">
                      {libelleTypeEcole[premiere.typeEcole]} · {sites.length} sites
                    </span>
                  </div>
                  <div role="cell" className="px-4 py-3 max-lg:hidden">
                    {libelleTypeEcole[premiere.typeEcole]}
                  </div>
                  <div role="cell" className="px-4 py-3 text-muted-foreground max-lg:hidden">
                    {sites.length} sites
                  </div>
                  <div role="cell" className="max-lg:hidden" />
                  <div role="cell" className="px-4 py-3 max-lg:p-0 max-lg:text-right">
                    {nPretes > 0 && (
                      <span className={v2.pastilleAttention}>{nPretes} à publier</span>
                    )}
                  </div>
                  <div role="cell" className="max-lg:hidden" />
                </div>
                {sites.map((x, i) => ligne(x, { site: true, rangSite: i + 1 }))}
                <div role="row" className="border-t border-border px-4 py-3 lg:pl-9">
                  <button
                    type="button"
                    role="cell"
                    onClick={() => setAjout(true)}
                    className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 font-sans text-[15px] font-bold text-primary-strong"
                  >
                    <IconeAjouter className="size-4" aria-hidden />
                    Ajouter un site à cette école
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {(['retiree', 'corbeille'] as const).map(
            (f) =>
              compte(f) > 0 && (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filtre === f}
                  onClick={() => setFiltre(filtre === f ? 'toutes' : f)}
                  className="mr-3 cursor-pointer border-0 bg-transparent p-0 font-sans text-sm text-muted-foreground underline aria-pressed:font-bold aria-pressed:text-foreground"
                >
                  {f === 'retiree' ? 'Retirées' : 'Corbeille'} · {compte(f)}
                </button>
              ),
          )}
        </span>
        {pretes.length > 1 && (
          <Bouton
            variante="secondaire"
            className="ml-auto h-12 max-lg:w-full"
            enCours={enCours}
            texteEnCours="Publication…"
            onClick={() => void publierToutes()}
          >
            Publier les {pretes.length} d’un coup
          </Bouton>
        )}
      </div>

      {ajout && (
        <Dialogue
          titre="Ajouter une école"
          variante="tiroir"
          fermer={() => setAjout(false)}
          entete={<h2>Ajouter une école</h2>}
        >
          <Creation
            admin={admin}
            divisions={divisions}
            surEnregistre={(texte) => {
              setAjout(false);
              setAnnonce(texte);
              charger();
            }}
            surAnnuler={() => setAjout(false)}
          />
        </Dialogue>
      )}
    </>
  );
}
