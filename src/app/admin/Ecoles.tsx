import { useCallback, useEffect, useState } from 'react';
import {
  ErreurDecision,
  type EcoleVue,
  type PortAdministration,
  type RelaisVu,
} from '../../modele/ports';
import { Bandeau } from '../../ui/composants';

function etat(e: EcoleVue): { texte: string; classe: string } {
  if (e.publication === 'publiee') return { texte: 'Publiée', classe: 'etat-verifiee' };
  if (e.publication === 'retiree') return { texte: 'Retirée', classe: 'etat-refusee' };
  if (e.aSituer) return { texte: 'À situer', classe: 'etat-attente' };
  return { texte: 'Brouillon', classe: 'etat-telephone' };
}

function LigneEcole({
  e,
  relais,
  admin,
  surChangement,
}: {
  e: EcoleVue;
  relais: RelaisVu[];
  admin: PortAdministration;
  surChangement: (texte: string) => void;
}) {
  const [relaisId, setRelaisId] = useState(e.confiee?.relaisId ?? relais[0]?.id ?? '');
  const [note, setNote] = useState(e.confiee?.note ?? '');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const agir = async (action: () => Promise<void>, texte: string) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      surChangement(texte);
    } catch (err) {
      setErreur(err instanceof ErreurDecision ? err.message : 'La base ne répond pas.');
    } finally {
      setEnCours(false);
    }
  };

  const prenom = relais.find((r) => r.id === relaisId)?.prenom ?? '';
  const publiee = e.publication === 'publiee';

  return (
    <tr>
      <td>
        <b>{e.nom}</b>
        <span className="mention admin-sous-ligne">
          {[...new Set([e.quartier, e.arrondissement].filter(Boolean))].join(' · ') ||
            'Quartier inconnu'}
        </span>
      </td>
      <td>
        <span className={`etiquette ${etat(e).classe}`}>{etat(e).texte}</span>
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
        {publiee ? (
          <span className="mention">Relevée sur place</span>
        ) : relais.length === 0 ? (
          <span className="mention">Aucun relais actif</span>
        ) : (
          <div className="admin-actions">
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
          </div>
        )}
        {erreur && <p className="message-erreur">{erreur}</p>}
      </td>
    </tr>
  );
}

export function Ecoles({ admin }: { admin: PortAdministration }) {
  const [ecoles, setEcoles] = useState<EcoleVue[] | null>(null);
  const [relais, setRelais] = useState<RelaisVu[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);

  const charger = useCallback(() => {
    Promise.all([admin.ecoles(), admin.relais()])
      .then(([e, r]) => {
        setEcoles(e);
        setRelais(r.filter((x) => x.statut === 'actif'));
        setErreur(null);
      })
      .catch(() => setErreur('La base ne répond pas. Vérifie le réseau et recharge la page.'));
  }, [admin]);

  useEffect(() => {
    charger();
  }, [charger]);

  const aSituer = ecoles?.filter((e) => e.publication !== 'publiee').length ?? 0;

  return (
    <div className="pile">
      <div className="admin-titre">
        <div>
          <h1>Écoles</h1>
          <p className="texte-doux">
            {ecoles === null
              ? 'Chargement…'
              : `${ecoles.length} école${ecoles.length > 1 ? 's' : ''}, dont ${aSituer} pas encore publiée${aSituer > 1 ? 's' : ''}. Une école à situer n'a pas de position : confie-la à un relais, qui ira la relever sur place.`}
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
            {ecoles?.length === 0 && (
              <tr>
                <td colSpan={4} className="texte-doux">
                  Aucune école pour le moment.
                </td>
              </tr>
            )}
            {ecoles?.map((e) => (
              <LigneEcole
                key={`${e.id}-${e.confiee?.relaisId ?? ''}-${e.publication}`}
                e={e}
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
