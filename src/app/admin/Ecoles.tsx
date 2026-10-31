/**
 * Les écoles et leur cycle de vie (supabase/schema.md, « Le cycle de vie ») :
 * à situer → prête → publiée → retirée (→ publiée). Publier est un geste à part :
 * une école, tout un arrondissement, ou un lot.
 */
import { useCallback, useEffect, useState } from 'react';
import { listes, type Valeur } from '../../modele/listes';
import {
  ErreurDecision,
  type EcoleVue,
  type LotVu,
  type PortAdministration,
  type RelaisVu,
} from '../../modele/ports';
import { Bandeau, jour } from '../../ui/composants';

export const libelleMotifRetrait: Record<Valeur<'motif_retrait'>, string> = {
  demande_ecole: "À la demande de l'école",
  erreur: 'Erreur dans la fiche',
  fermeture: "L'école a fermé",
  doublon: 'Doublon',
  autre: 'Autre',
};

type Etat = 'a_situer' | 'prete' | 'publiee' | 'retiree' | 'brouillon';

function etatDe(e: EcoleVue): Etat {
  if (e.publication === 'publiee') return 'publiee';
  if (e.publication === 'retiree') return 'retiree';
  if (e.publication === 'prete') return 'prete';
  return e.aSituer ? 'a_situer' : 'brouillon';
}

const libelleEtat: Record<Etat, { texte: string; classe: string }> = {
  a_situer: { texte: 'À situer', classe: 'etat-attente' },
  prete: { texte: 'Prête', classe: 'etat-a-corriger' },
  publiee: { texte: 'Publiée', classe: 'etat-verifiee' },
  retiree: { texte: 'Retirée', classe: 'etat-refusee' },
  brouillon: { texte: 'Brouillon', classe: 'etat-telephone' },
};

const EN_LIGNE =
  'Elle paraît sur ntanova.com après la prochaine mise à jour du site (cette nuit à 2 h).';

const message = (err: unknown) =>
  err instanceof ErreurDecision ? err.message : 'La base ne répond pas. Vérifie le réseau.';

function LigneEcole({
  e,
  ecoles,
  relais,
  admin,
  surChangement,
}: {
  e: EcoleVue;
  ecoles: EcoleVue[];
  relais: RelaisVu[];
  admin: PortAdministration;
  surChangement: (texte: string) => void;
}) {
  const etat = etatDe(e);
  const [relaisId, setRelaisId] = useState(e.confiee?.relaisId ?? relais[0]?.id ?? '');
  const [note, setNote] = useState(e.confiee?.note ?? '');
  const [mode, setMode] = useState<'retirer' | 'fusionner' | null>(null);
  const [motif, setMotif] = useState<Valeur<'motif_retrait'>>('demande_ecole');
  const [noteRetrait, setNoteRetrait] = useState('');
  const [gardee, setGardee] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const agir = async (action: () => Promise<unknown>, texte: string) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      surChangement(texte);
    } catch (err) {
      setErreur(message(err));
    } finally {
      setEnCours(false);
    }
  };

  const autres = ecoles.filter((x) => x.id !== e.id && x.publication !== 'retiree');
  const prenom = relais.find((r) => r.id === relaisId)?.prenom ?? '';

  return (
    <tr>
      <td>
        <b>{e.nom}</b>
        <span className="mention admin-sous-ligne">
          {[...new Set([e.quartier, e.arrondissement].filter(Boolean))].join(' · ') ||
            'Quartier inconnu'}
        </span>
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
        <span className={`etiquette ${libelleEtat[etat].classe}`}>{libelleEtat[etat].texte}</span>
      </td>
      <td>
        {e.confiee ? (
          <>
            <b>{e.confiee.prenom}</b>
            {e.confiee.note && <span className="mention admin-sous-ligne">{e.confiee.note}</span>}
          </>
        ) : (
          '—'
        )}
      </td>
      <td>
        <div className="admin-actions">
          {(etat === 'prete' || (etat === 'retiree' && !e.retrait?.remplaceePar)) && (
            <button
              type="button"
              className="bouton bouton-petit"
              disabled={enCours}
              onClick={() =>
                void agir(() => admin.publierEcole(e.id), `${e.nom} est publiée. ${EN_LIGNE}`)
              }
            >
              {etat === 'retiree' ? 'Republier' : 'Publier'}
            </button>
          )}
          {(etat === 'prete' || etat === 'publiee') && (
            <>
              <button
                type="button"
                className="bouton bouton-secondaire bouton-petit admin-bouton-refus"
                aria-expanded={mode === 'retirer'}
                onClick={() => setMode(mode === 'retirer' ? null : 'retirer')}
              >
                Retirer du site
              </button>
              <button
                type="button"
                className="bouton bouton-secondaire bouton-petit"
                aria-expanded={mode === 'fusionner'}
                onClick={() => setMode(mode === 'fusionner' ? null : 'fusionner')}
              >
                Fusionner…
              </button>
            </>
          )}
          {(etat === 'a_situer' || etat === 'brouillon') &&
            (relais.length === 0 ? (
              <span className="mention">Aucun relais actif</span>
            ) : (
              <>
                <select
                  className="champ admin-choix-lot"
                  aria-label={`Relais pour ${e.nom}`}
                  value={relaisId}
                  onChange={(ev) => setRelaisId(ev.target.value)}
                >
                  {relais.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.prenom || '[sans prénom]'}
                    </option>
                  ))}
                </select>
                <input
                  className="champ admin-note"
                  aria-label={`Ce que le relais doit vérifier pour ${e.nom}`}
                  placeholder="À vérifier : nom, repère…"
                  maxLength={500}
                  value={note}
                  onChange={(ev) => setNote(ev.target.value)}
                />
                <button
                  type="button"
                  className="bouton bouton-petit"
                  disabled={enCours || !relaisId}
                  onClick={() =>
                    void agir(
                      () => admin.confierEcole(e.id, relaisId, note.trim() || null),
                      `${e.nom} est confiée à ${prenom}.`,
                    )
                  }
                >
                  {e.confiee ? 'Confier de nouveau' : 'Confier'}
                </button>
                {e.confiee && (
                  <button
                    type="button"
                    className="bouton bouton-secondaire bouton-petit"
                    disabled={enCours}
                    onClick={() =>
                      void agir(() => admin.reprendreEcole(e.id), `${e.nom} n'est plus confiée.`)
                    }
                  >
                    Reprendre
                  </button>
                )}
              </>
            ))}
        </div>

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
            <button type="submit" className="bouton admin-bouton-refus" disabled={enCours}>
              Retirer {e.nom} du site
            </button>
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
            <button type="submit" className="bouton" disabled={enCours || !gardee}>
              Fusionner (cette fiche est retirée)
            </button>
          </form>
        )}

        {erreur && <p className="message-erreur">{erreur}</p>}
      </td>
    </tr>
  );
}

type Filtre = 'toutes' | Etat;

export function Ecoles({ admin }: { admin: PortAdministration }) {
  const [ecoles, setEcoles] = useState<EcoleVue[] | null>(null);
  const [relais, setRelais] = useState<RelaisVu[]>([]);
  const [lots, setLots] = useState<LotVu[]>([]);
  const [arrondissements, setArrondissements] = useState<{ id: number; nom: string }[]>([]);
  const [lot, setLot] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [erreur, setErreur] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(() => {
    Promise.all([admin.ecoles(), admin.relais(), admin.lots(), admin.arrondissements()])
      .then(([e, r, l, a]) => {
        setEcoles(e);
        setRelais(r.filter((x) => x.statut === 'actif'));
        const vrais = l.filter((x) => !x.essai);
        setLots(vrais);
        setLot((avant) => avant || vrais[0]?.id || '');
        setArrondissements(a);
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
  const visibles = (ecoles ?? []).filter((e) => filtre === 'toutes' || etatDe(e) === filtre);
  const filtres: { valeur: Filtre; libelle: string }[] = [
    { valeur: 'toutes', libelle: 'Toutes' },
    { valeur: 'prete', libelle: `Prêtes · ${compte('prete')}` },
    { valeur: 'publiee', libelle: `Publiées · ${compte('publiee')}` },
    { valeur: 'a_situer', libelle: `À situer · ${compte('a_situer')}` },
    { valeur: 'retiree', libelle: `Retirées · ${compte('retiree')}` },
  ];
  const pretesPar = (id: number) =>
    ecoles?.filter((e) => e.arrondissementId === id && e.publication === 'prete').length ?? 0;

  return (
    <div className="pile">
      <div className="admin-titre">
        <div>
          <h1>Écoles</h1>
          <p className="texte-doux">
            Accepter une fiche rend l'école <b>prête</b> ; tu choisis quand la <b>publier</b> : une
            école, tout un arrondissement, ou un lot. Une école à situer attend la contre-visite
            d'un relais.
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

      {compte('prete') > 0 && (
        <section className="carte-blanche pile-serree" aria-label="Publier d'un coup">
          <h2 className="titre-section">Publier d'un coup</h2>
          <div className="admin-actions">
            {arrondissements
              .filter((a) => pretesPar(a.id) > 0)
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="bouton bouton-petit"
                  disabled={enCours}
                  onClick={() =>
                    void publierEnNombre(() => admin.publierArrondissement(a.id), a.nom)
                  }
                >
                  Publier les {pretesPar(a.id)} écoles prêtes de {a.nom}
                </button>
              ))}
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

      <div className="admin-tableau">
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
                key={`${e.id}-${e.confiee?.relaisId ?? ''}-${e.publication}`}
                e={e}
                ecoles={ecoles ?? []}
                relais={relais}
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
