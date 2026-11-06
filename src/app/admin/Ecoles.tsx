import { ChampsFiche } from './ChampsFiche';
import { Dialogue } from '../../ui/Dialogue';
import { ActionsSecondaires, BadgePublication, Bouton } from '../../ui/actions';
import { PhotoPublique } from './PhotoPublique';
import { dateLongue } from '../../modele/pointe-noire';
import { EquipementsEcole } from './EquipementsEcole';
import { FraisEcole } from './FraisEcole';
import { ContactPublic } from './ContactPublic';
/**
 * Les écoles et leur cycle de vie (supabase/schema.md, « Le cycle de vie ») :
 * à situer → prête → publiée → retirée (→ publiée). Publier est un geste à part :
 * une école, une zone (ville, arrondissement, quartier), ou un lot.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ecrirePosition, lienGoogleMaps } from '../../modele/coordonnees';
import {
  erreursFormulaireEcole,
  formulaireDe,
  lireChampPosition,
  versCorrection,
  type FormulaireEcole,
} from '../../modele/correction-ecole';
import type { Erreurs } from '../../modele/fiche';
import { cheminLisible } from '../../modele/geo-divisions';
import {
  libelleNiveau,
  libelleOrigine,
  libelleTypeEcole,
  libelleTypeMission,
} from '../../modele/libelles';
import { listes, type Valeur } from '../../modele/listes';
import type {
  DivisionVue,
  ApercuSuppression,
  EcoleVue,
  LotVu,
  PortAdministration,
  RelaisVu,
} from '../../modele/ports';
import { Bandeau, Champ, Choix, jour } from '../../ui/composants';
import { ChampPosition, messageErreur as message } from './ChampPosition';
import { Creation } from './Creation';

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

function LigneEcole({
  e,
  ecoles,
  relais,
  divisions,
  admin,
  surChangement,
}: {
  e: EcoleVue;
  ecoles: EcoleVue[];
  relais: RelaisVu[];
  divisions: DivisionVue[];
  admin: PortAdministration;
  surChangement: (texte: string) => void;
}) {
  const etat = etatDe(e);
  const [declencheur, setDeclencheur] = useState<HTMLElement | null>(null);
  const [operation, setOperation] = useState(false);
  const gestion = useRef<HTMLButtonElement>(null);
  const [relaisId, setRelaisId] = useState(e.confiee?.relaisId ?? relais[0]?.id ?? '');
  const [note, setNote] = useState(e.confiee?.note ?? '');
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
    | 'contact-public'
    | null
  >(null);
  const [motif, setMotif] = useState<Valeur<'motif_retrait'>>('demande_ecole');
  const [noteRetrait, setNoteRetrait] = useState('');
  const [gardee, setGardee] = useState('');
  const [apercu, setApercu] = useState<ApercuSuppression | null>(null);
  const [nomSaisi, setNomSaisi] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

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
  const prenom = relais.find((r) => r.id === relaisId)?.prenom ?? '';

  const ouvrir = (section: NonNullable<typeof mode>, bouton: HTMLElement) => {
    setDeclencheur(bouton.closest('details')?.querySelector('summary') ?? bouton);
    const menu = bouton.closest('details');
    if (menu) menu.open = false;
    setErreur(null);
    setMode(section);
  };
  const sections = [
    ['modifier', 'Informations'],
    ['situer', 'Position'],
    ['contact-public', 'Contact public'],
    ['frais', 'Frais déclarés'],
    ['equipements', 'Équipements'],
    ['photo-publique', 'Photo publique'],
    ['mission', 'Mission'],
  ] as const;
  const confirmation =
    mode === 'retirer' || mode === 'fusionner' || mode === 'corbeille' || mode === 'supprimer';
  const nomCorrespond = comparable(nomSaisi) === comparable(e.nom);

  return (
    <tr>
      <td>
        <b>{e.nom}</b>
        {e.etiquette && <span className="mention admin-sous-ligne">{e.etiquette}</span>}
        <span className="mention admin-sous-ligne">
          {[...new Set([e.quartier, e.division].filter(Boolean))].join(' · ') ||
            (e.divisionId ? 'Quartier inconnu' : 'Division à choisir')}
        </span>
        <span className="mention admin-sous-ligne">
          {libelleTypeEcole[e.typeEcole]} ·{' '}
          {e.niveaux.map((n) => libelleNiveau[n]).join(', ') || 'aucun niveau'}
          {e.formations > 0 && ` · ${e.formations} formation${e.formations > 1 ? 's' : ''}`}
        </span>
        <span className="mention admin-sous-ligne">
          {libelleOrigine[e.origine]}
          {e.declareeLe ? ` le ${dateLongue(e.declareeLe)}` : ''}
          {e.verifieeLe && ` · vérifiée par la direction le ${jour(e.verifieeLe)}`}
        </span>
        {e.position && (
          <span className="mention admin-sous-ligne">
            Position{' '}
            <a href={lienGoogleMaps(e.position)} target="_blank" rel="noopener noreferrer">
              {ecrirePosition(e.position)}
            </a>
          </span>
        )}
        {e.corbeille && (
          <span className="mention admin-sous-ligne">
            À la corbeille depuis le {jour(e.corbeille.le)}
          </span>
        )}
        {e.retrait && (
          <span className="mention admin-sous-ligne">
            {libelleMotifRetrait[e.retrait.motif]}, le {jour(e.retrait.le)}
            {e.retrait.note ? ` : ${e.retrait.note}` : ''}
            {e.retrait.remplaceePar
              ? ` → ${ecoles.find((x) => x.id === e.retrait?.remplaceePar)?.nom ?? 'une autre fiche'}`
              : ''}
          </span>
        )}
      </td>
      <td>
        <BadgePublication etat={etat} />
      </td>
      <td data-colonne="Mission">
        {e.confiee ? (
          <>
            <b>{e.confiee.prenom}</b>
            <span className="mention admin-sous-ligne">{libelleTypeMission[e.confiee.genre]}</span>
            {e.confiee.note && <span className="mention admin-sous-ligne">{e.confiee.note}</span>}
          </>
        ) : (
          <span className="mention">Aucune mission</span>
        )}
      </td>
      <td>
        <div className="admin-actions ecole-actions">
          {(etat === 'prete' || (etat === 'retiree' && !e.retrait?.remplaceePar)) && (
            <Bouton
              enCours={enCours}
              texteEnCours="Publication…"
              onClick={() =>
                void agir(() => admin.publierEcole(e.id), `${e.nom} est publiée. ${EN_LIGNE}`)
              }
            >
              {etat === 'retiree' ? 'Republier' : 'Publier'}
            </Bouton>
          )}
          {etat !== 'retiree' && etat !== 'corbeille' && e.aSituer && (
            <Bouton onClick={(ev) => ouvrir('situer', ev.currentTarget)}>Situer</Bouton>
          )}
          {etat === 'corbeille' && (
            <>
              <Bouton
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
                Supprimer définitivement…
              </Bouton>
            </>
          )}
          {etat !== 'corbeille' && (
            <button
              ref={gestion}
              disabled={enCours}
              type="button"
              className="bouton bouton-secondaire"
              onClick={(ev) =>
                ouvrir(etat === 'retiree' ? 'contact-public' : 'modifier', ev.currentTarget)
              }
            >
              Gérer la fiche
            </button>
          )}
          {/* Le menu « ⋯ » : la mission, le retrait et la fusion quand elles ont un sens, et la corbeille pour toutes les écoles. */}
          {etat !== 'corbeille' && (
            <ActionsSecondaires nom={e.nom}>
              {etat !== 'retiree' && (
                <Bouton variante="discret" onClick={(ev) => ouvrir('mission', ev.currentTarget)}>
                  {e.confiee ? 'Mission en cours…' : 'Confier à un relais'}
                </Bouton>
              )}
              <div className="actions-danger">
                {(etat === 'prete' || etat === 'publiee') && (
                  <>
                    <Bouton variante="danger" onClick={(ev) => ouvrir('retirer', ev.currentTarget)}>
                      Retirer du site
                    </Bouton>
                    <Bouton
                      variante="danger"
                      onClick={(ev) => ouvrir('fusionner', ev.currentTarget)}
                    >
                      Fusionner…
                    </Bouton>
                  </>
                )}
                <Bouton variante="danger" onClick={(ev) => ouvrir('corbeille', ev.currentTarget)}>
                  Mettre à la corbeille…
                </Bouton>
              </div>
            </ActionsSecondaires>
          )}
        </div>
        {mode && (
          <Dialogue
            titre={
              confirmation
                ? `${{ retirer: 'Retirer', fusionner: 'Fusionner', corbeille: 'Mettre à la corbeille', supprimer: 'Supprimer définitivement' }[mode as 'retirer' | 'fusionner' | 'corbeille' | 'supprimer']} ${e.nom}`
                : `Gérer ${e.nom}`
            }
            variante={confirmation ? 'confirmation' : 'tiroir'}
            description={
              mode === 'corbeille'
                ? 'L’école disparaît des listes, du site (après la prochaine mise à jour), des statistiques et des missions. Ses fiches, photos et contacts sont gardés : tu peux la restaurer depuis « Corbeille ».'
                : mode === 'supprimer'
                  ? 'Définitif : on ne revient pas en arrière.'
                  : mode === 'retirer'
                    ? 'Cette école sera retirée du catalogue après la prochaine mise à jour du site. Son historique est conservé.'
                    : mode === 'fusionner'
                      ? 'Cette fiche sera retirée et son ancienne adresse renverra vers l’école choisie. Vérifie qu’il s’agit de la même école.'
                      : undefined
            }
            retourFocus={declencheur}
            occupe={enCours || operation}
            fermer={() => setMode(null)}
            entete={
              <>
                <h2>{e.nom}</h2>
                <div className="rang">
                  <BadgePublication etat={etat} />
                  <span className="mention">{e.division}</span>
                </div>
              </>
            }
          >
            {!confirmation && (
              <nav className="gestion-sections" aria-label="Sections de la fiche">
                {sections
                  .filter(
                    ([cle]) =>
                      etat !== 'retiree' || !['modifier', 'situer', 'mission'].includes(cle),
                  )
                  .map(([cle, libelle]) => (
                    <button
                      key={cle}
                      type="button"
                      className="pastille-choix"
                      disabled={operation || enCours}
                      aria-pressed={mode === cle}
                      onClick={() => {
                        setErreur(null);
                        setMode(cle);
                      }}
                    >
                      {libelle}
                    </button>
                  ))}
              </nav>
            )}
            {mode === 'photo-publique' && (
              <PhotoPublique
                surOccupation={setOperation}
                integre
                ecoleId={e.id}
                nom={e.nom}
                admin={admin}
                fermer={() => setMode(null)}
                surChangement={surChangement}
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
                surChangement={surChangement}
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
                admin={admin}
                fermer={() => setMode(null)}
                surChangement={surChangement}
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
                surChangement={surChangement}
              />
            )}

            {mode === 'retirer' && (
              <form
                className="admin-motif"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  void agir(
                    () => admin.retirerEcole(e.id, motif, noteRetrait.trim() || null),
                    `${e.nom} est retirée du site. Son ancienne adresse dira « n'existe pas ou n'est plus publiée », sans son nom.`,
                  );
                }}
              >
                <label className="champ-groupe">
                  Motif
                  <select
                    className="champ"
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
                <label className="champ-groupe">
                  Note (facultatif)
                  <input
                    className="champ"
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
                className="admin-motif"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  void agir(
                    () => admin.mettreALaCorbeille(e.id, motif, noteRetrait.trim() || null),
                    `${e.nom} est à la corbeille : elle a quitté les listes et, après la prochaine mise à jour, le site. Tu peux la restaurer depuis « Corbeille ».`,
                  );
                }}
              >
                <label className="champ-groupe">
                  Motif
                  <select
                    className="champ"
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
                <label className="champ-groupe">
                  Note (facultatif)
                  <input
                    className="champ"
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
                className="admin-motif"
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
                  <p className="message-attention" role="status">
                    {apercu.bloque}
                  </p>
                ) : (
                  <>
                    <p>
                      La suppression emporte <b>{apercu.fiches}</b> fiche
                      {apercu.fiches > 1 ? 's' : ''}, <b>{apercu.photos}</b> photo
                      {apercu.photos > 1 ? 's' : ''} (fichiers compris), <b>{apercu.contacts}</b>{' '}
                      contact{apercu.contacts > 1 ? 's' : ''}, ses frais, ses équipements et son
                      historique. Seule une trace garde son nom et ces nombres.
                    </p>
                    <label className="champ-groupe">
                      Pour confirmer, écris le nom de l’école : <b>{e.nom}</b>
                      <input
                        className="champ"
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

            {mode === 'fusionner' && (
              <form
                className="admin-motif"
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
                <label className="champ-groupe">
                  C'est la même école que…
                  <select
                    className="champ"
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
                className="admin-motif"
                aria-label={`Mission pour ${e.nom}`}
                onSubmit={(ev) => {
                  ev.preventDefault();
                  if (!relaisId) return;
                  void agir(
                    () => admin.confierEcole(e.id, relaisId, genre, note.trim() || null),
                    `${e.nom} est confiée à ${prenom}.`,
                  );
                }}
              >
                {relais.length === 0 ? (
                  <p className="mention admin-pleine-largeur">
                    Aucun relais actif : active un relais dans l’onglet « Relais » d’abord.
                  </p>
                ) : (
                  <>
                    <Champ libelle="Relais">
                      {(a) => (
                        <select
                          {...a}
                          className="champ"
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
                          className="champ"
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
                      aide="Le relais le lit dans « Mon secteur ». Vouvoie-le."
                    >
                      {(a) => (
                        <input
                          {...a}
                          className="champ"
                          maxLength={500}
                          placeholder="Ex. : le nom sur l’enseigne, le repère…"
                          value={note}
                          onChange={(ev) => setNote(ev.target.value)}
                        />
                      )}
                    </Champ>
                    <div className="admin-actions admin-pleine-largeur">
                      <Bouton type="submit" enCours={enCours} disabled={!relaisId}>
                        {e.confiee ? 'Confier de nouveau' : 'Confier'}
                      </Bouton>
                      {e.confiee && (
                        <button
                          type="button"
                          className="bouton bouton-secondaire"
                          disabled={enCours}
                          onClick={() =>
                            void agir(
                              () => admin.reprendreEcole(e.id),
                              `${e.nom} n'est plus confiée.`,
                            )
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

            {erreur && (
              <p className="message-erreur" role="alert">
                {erreur}
              </p>
            )}
          </Dialogue>
        )}
      </td>
    </tr>
  );
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
      className="admin-motif"
      aria-label={`Modifier ${e.nom}`}
      noValidate
      onSubmit={(ev) => void enregistrer(ev)}
    >
      <ChampsFiche champs={champs} erreurs={erreurs} changer={changer} />
      {rienADire && (
        <p className="mention admin-pleine-largeur" aria-live="polite">
          Rien n’a changé.
        </p>
      )}
      {erreur && (
        <p className="message-erreur admin-pleine-largeur" role="alert">
          {erreur}
        </p>
      )}
      <div className="admin-actions admin-pleine-largeur">
        <Bouton type="submit" enCours={enCours}>
          Enregistrer
        </Bouton>
        <button
          type="button"
          className="bouton bouton-secondaire"
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
  const [erreurChamp, setErreurChamp] = useState<string | undefined>();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    surOccupation(enCours);
    return () => surOccupation(false);
  }, [enCours, surOccupation]);

  const enregistrer = async (ev: { preventDefault: () => void }) => {
    ev.preventDefault();
    setErreur(null);
    const { position, erreur: illisible } = lireChampPosition(texte);
    if (!position) {
      setErreurChamp(illisible ?? 'Colle la position de l’école.');
      return;
    }
    setErreurChamp(undefined);
    setEnCours(true);
    try {
      const ou = await admin.situerEcole(e.id, position, divisionId || null);
      surEnregistre(
        `${e.nom} est située à ${ou}.` +
          (e.publication === 'brouillon'
            ? ' Elle est prête : publie-la quand tu veux.'
            : e.publication === 'publiee'
              ? ' La nouvelle position paraît sur ntanova.com après la prochaine mise à jour du site.'
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
      className="admin-motif"
      aria-label={`Situer ${e.nom}`}
      noValidate
      onSubmit={(ev) => void enregistrer(ev)}
    >
      <ChampPosition valeur={texte} surChange={setTexte} erreur={erreurChamp} />
      <Champ
        libelle="Division"
        facultatif
        aide="Laisse « Détectée d’après la position » : la base cherche l’arrondissement ou la ville. Choisis-la seulement quand aucun contour n’est connu à cet endroit."
      >
        {(a) => (
          <select
            {...a}
            className="champ"
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
      {erreur && (
        <p className="message-erreur admin-pleine-largeur" role="alert">
          {erreur}
        </p>
      )}
      <div className="admin-actions admin-pleine-largeur">
        <Bouton type="submit" enCours={enCours}>
          Enregistrer la position
        </Bouton>
        <button
          type="button"
          className="bouton bouton-secondaire"
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
type FiltreOrigine = 'toutes' | Valeur<'origin_kind'>;

export function Ecoles({ admin }: { admin: PortAdministration }) {
  const [ecoles, setEcoles] = useState<EcoleVue[] | null>(null);
  const [relais, setRelais] = useState<RelaisVu[]>([]);
  const [lots, setLots] = useState<LotVu[]>([]);
  const [divisions, setDivisions] = useState<DivisionVue[]>([]);
  const [lot, setLot] = useState('');
  const [zone, setZone] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [recherche, setRecherche] = useState('');
  const [divisionFiltre, setDivisionFiltre] = useState('');
  const [origine, setOrigine] = useState<FiltreOrigine>('toutes');
  const [erreur, setErreur] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [ajout, setAjout] = useState(false);

  const charger = useCallback(() => {
    Promise.all([admin.ecoles(), admin.relais(), admin.lots(), admin.divisions()])
      .then(([e, r, l, d]) => {
        setEcoles(e);
        setRelais(r.filter((x) => x.statut === 'actif'));
        const vrais = l.filter((x) => !x.essai);
        setLots(vrais);
        setLot((avant) => avant || vrais[0]?.id || '');
        setDivisions(d);
        setErreur(null);
      })
      .catch(() => setErreur('La base ne répond pas. Vérifie le réseau et recharge la page.'));
  }, [admin]);

  useEffect(() => {
    charger();
  }, [charger]);

  const publierEnNombre = async (action: () => Promise<number>, ou: string) => {
    setEnCours(true);
    try {
      const n = await action();
      setAnnonce(
        n === 0
          ? `Aucune école prête à publier dans ${ou}.`
          : `${n} école${n > 1 ? 's' : ''} de ${ou} publiée${n > 1 ? 's' : ''}. ${n > 1 ? EN_LIGNE.replace('Elle paraît', 'Elles paraissent') : EN_LIGNE}`,
      );
      charger();
    } catch (err) {
      setErreur(message(err));
    } finally {
      setEnCours(false);
    }
  };

  const compte = (etat: Etat) => ecoles?.filter((e) => etatDe(e) === etat).length ?? 0;
  const visibles = (ecoles ?? []).filter(
    (e) =>
      // « Toutes » ne montre pas la corbeille : elle a son propre filtre.
      (filtre === 'toutes' ? etatDe(e) !== 'corbeille' : etatDe(e) === filtre) &&
      (origine === 'toutes' || e.origine === origine) &&
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
  const filtres: { valeur: Filtre; libelle: string }[] = [
    { valeur: 'toutes', libelle: 'Toutes' },
    { valeur: 'prete', libelle: `Prêtes · ${compte('prete')}` },
    { valeur: 'publiee', libelle: `Publiées · ${compte('publiee')}` },
    { valeur: 'a_situer', libelle: `À situer · ${compte('a_situer')}` },
    { valeur: 'retiree', libelle: `Retirées · ${compte('retiree')}` },
    { valeur: 'corbeille', libelle: `Corbeille · ${compte('corbeille')}` },
  ];
  // Les zones qui ont des écoles prêtes : une zone se publie avec tout ce qu'elle contient.
  const zonesAvecPretes = divisions
    .map((d) => ({
      d,
      prêtes: (ecoles ?? []).filter(
        (e) =>
          e.publication === 'prete' &&
          e.divisionId !== null &&
          (e.divisionId === d.id ||
            divisions.find((x) => x.id === e.divisionId)?.chemin.startsWith(`${d.chemin}.`)),
      ).length,
    }))
    .filter((z) => z.prêtes > 0);

  return (
    <div className="pile">
      <div className="admin-titre">
        <div>
          <h1 tabIndex={-1} data-retour-liste>
            Écoles
          </h1>
          <p className="texte-doux">
            Prépare les écoles et choisis celles à publier. Les changements paraissent après la
            prochaine mise à jour du site.
          </p>
        </div>
        <div className="filtres" role="group" aria-label="Filtrer par état">
          {filtres.map((f) => (
            <button
              key={f.valeur}
              type="button"
              className="pastille-choix"
              aria-pressed={filtre === f.valeur}
              onClick={() => setFiltre(f.valeur)}
            >
              {f.libelle}
            </button>
          ))}
        </div>
      </div>
      <div className="ecoles-recherche">
        <Champ libelle="Rechercher une école">
          {(a) => (
            <input
              {...a}
              type="search"
              className="champ"
              placeholder="Nom de l’école"
              value={recherche}
              onChange={(ev) => setRecherche(ev.target.value)}
            />
          )}
        </Champ>
        <Champ libelle="Zone">
          {(a) => (
            <select
              {...a}
              className="champ"
              value={divisionFiltre}
              onChange={(ev) => setDivisionFiltre(ev.target.value)}
            >
              <option value="">Toutes les zones</option>
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
      </div>
      <details className="ecoles-origine">
        <summary>
          Filtrer par origine{origine !== 'toutes' ? ` · ${libelleOrigine[origine]}` : ''}
        </summary>
        <Choix
          legende="D'où vient la fiche"
          options={[
            { valeur: 'toutes', libelle: 'Toutes' },
            { valeur: 'field', libelle: libelleOrigine.field },
            { valeur: 'admin', libelle: libelleOrigine.admin },
            { valeur: 'import', libelle: libelleOrigine.import },
            { valeur: 'school', libelle: libelleOrigine.school },
          ]}
          valeurs={[origine]}
          surChoix={(o) => setOrigine(o)}
        />
      </details>

      {ajout ? (
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
      ) : (
        <div className="admin-actions">
          <button type="button" className="bouton" onClick={() => setAjout(true)}>
            Ajouter ou importer des écoles
          </button>
        </div>
      )}

      {compte('prete') > 0 && (
        <section className="carte-blanche pile-serree" aria-label="Publier d'un coup">
          <h2 className="titre-section">Publier d'un coup</h2>
          <div className="admin-actions">
            {zonesAvecPretes.length > 0 && (
              <>
                <select
                  className="champ admin-choix-lot"
                  aria-label="Zone à publier"
                  value={zone}
                  onChange={(ev) => setZone(ev.target.value)}
                >
                  <option value="">Choisir une zone…</option>
                  {zonesAvecPretes.map((z) => (
                    <option key={z.d.id} value={z.d.id}>
                      {cheminLisible(z.d.id, divisions)} ({z.prêtes} prête{z.prêtes > 1 ? 's' : ''})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="bouton bouton-petit"
                  disabled={enCours || !zone}
                  onClick={() =>
                    void publierEnNombre(
                      () => admin.publierDivision(zone),
                      divisions.find((d) => d.id === zone)?.nom ?? 'cette zone',
                    )
                  }
                >
                  Publier cette zone
                </button>
              </>
            )}
            {lots.length > 0 && (
              <>
                <select
                  className="champ admin-choix-lot"
                  aria-label="Lot à publier"
                  value={lot}
                  onChange={(ev) => setLot(ev.target.value)}
                >
                  {lots.map((l) => (
                    <option key={l.id} value={l.id}>
                      Lot {l.nom}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="bouton bouton-secondaire bouton-petit"
                  disabled={enCours || !lot}
                  onClick={() =>
                    void publierEnNombre(
                      () => admin.publierLot(lot),
                      `lot ${lots.find((l) => l.id === lot)?.nom ?? ''}`,
                    )
                  }
                >
                  Publier ce lot
                </button>
              </>
            )}
          </div>
        </section>
      )}

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

      <div className="admin-tableau ecoles-tableau">
        <table>
          <thead>
            <tr>
              <th scope="col">École</th>
              <th scope="col">État</th>
              <th scope="col">Confiée à</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {ecoles === null && !erreur && (
              <tr>
                <td colSpan={4} className="texte-doux" aria-busy="true">
                  Chargement des écoles…
                </td>
              </tr>
            )}
            {ecoles !== null && visibles.length === 0 && (
              <tr>
                <td colSpan={4} className="texte-doux">
                  Aucune école ici.
                </td>
              </tr>
            )}
            {visibles.map((e) => (
              <LigneEcole
                key={e.id}
                e={e}
                ecoles={ecoles ?? []}
                relais={relais}
                divisions={divisions}
                admin={admin}
                surChangement={(texte) => {
                  setAnnonce(texte);
                  charger();
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
