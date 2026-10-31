import { useCallback, useEffect, useState } from 'react';
import {
  ErreurDecision,
  type LotVu,
  type PortAdministration,
  type RelaisVu,
} from '../../modele/ports';
import { Bandeau, jour } from '../../ui/composants';

const libelleStatut: Record<RelaisVu['statut'], { texte: string; classe: string }> = {
  en_attente: { texte: 'À activer', classe: 'etat-attente' },
  actif: { texte: 'Actif', classe: 'etat-envoye' },
  suspendu: { texte: 'Suspendu', classe: 'etat-refusee' },
};

function LigneRelais({
  r,
  lots,
  admin,
  surChangement,
}: {
  r: RelaisVu;
  lots: LotVu[];
  admin: PortAdministration;
  surChangement: (texte: string) => void;
}) {
  // Un nouveau relais commence par le lot d'essai, le temps de sa formation.
  const parDefaut = r.lotId ?? lots.find((l) => l.essai)?.id ?? lots[0]?.id ?? '';
  const [lot, setLot] = useState(parDefaut);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const nomLot = lots.find((l) => l.id === r.lotId)?.nom ?? '—';

  const agir = async (action: () => Promise<void>, texte: string) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      surChangement(texte);
    } catch (e) {
      setErreur(e instanceof ErreurDecision ? e.message : 'La base ne répond pas.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <tr>
      <td>
        <b>{r.prenom || '[sans prénom]'}</b>
        <span className="mention admin-sous-ligne">Première connexion : {jour(r.creeLe)}</span>
      </td>
      <td>
        <span className={`etiquette ${libelleStatut[r.statut].classe}`}>
          {libelleStatut[r.statut].texte}
        </span>
      </td>
      <td>{nomLot}</td>
      <td>{r.fiches}</td>
      <td>
        <div className="admin-actions">
          <select
            className="champ admin-choix-lot"
            aria-label={`Lot de ${r.prenom}`}
            value={lot}
            onChange={(e) => setLot(e.target.value)}
          >
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom}
              </option>
            ))}
          </select>
          {r.statut === 'actif' ? (
            <>
              <button
                type="button"
                className="bouton bouton-secondaire bouton-petit"
                disabled={enCours || lot === r.lotId}
                onClick={() =>
                  void agir(() => admin.activerRelais(r.id, lot), `${r.prenom} change de lot.`)
                }
              >
                Changer de lot
              </button>
              <button
                type="button"
                className="bouton bouton-secondaire bouton-petit admin-bouton-refus"
                disabled={enCours}
                onClick={() =>
                  void agir(() => admin.suspendreRelais(r.id), `${r.prenom} est suspendu.`)
                }
              >
                Suspendre
              </button>
            </>
          ) : (
            <button
              type="button"
              className="bouton bouton-petit"
              disabled={enCours || !lot}
              onClick={() =>
                void agir(() => admin.activerRelais(r.id, lot), `${r.prenom} est actif.`)
              }
            >
              {r.statut === 'suspendu' ? 'Réactiver' : 'Activer'}
            </button>
          )}
        </div>
        {erreur && <p className="message-erreur">{erreur}</p>}
      </td>
    </tr>
  );
}

export function ListeRelais({ admin }: { admin: PortAdministration }) {
  const [relais, setRelais] = useState<RelaisVu[] | null>(null);
  const [lots, setLots] = useState<LotVu[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);

  const charger = useCallback(() => {
    Promise.all([admin.relais(), admin.lots()])
      .then(([r, l]) => {
        setRelais(r);
        setLots(l);
        setErreur(null);
      })
      .catch(() => setErreur('La base ne répond pas. Vérifie le réseau et recharge la page.'));
  }, [admin]);

  useEffect(() => {
    charger();
  }, [charger]);

  return (
    <div className="pile">
      <div className="admin-titre">
        <div>
          <h1>Relais</h1>
          <p className="texte-doux">
            Un relais apparaît ici après sa première connexion. Avant, ajoute son adresse Gmail
            comme utilisateur de test dans Google Cloud.
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
              <th scope="col">Relais</th>
              <th scope="col">Compte</th>
              <th scope="col">Lot</th>
              <th scope="col">Fiches</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {relais?.map((r) => (
              <LigneRelais
                key={`${r.id}-${r.statut}-${r.lotId ?? ''}`}
                r={r}
                lots={lots}
                admin={admin}
                surChangement={(texte) => {
                  setAnnonce(texte);
                  charger();
                }}
              />
            ))}
            {relais?.length === 0 && (
              <tr>
                <td colSpan={5} className="texte-doux">
                  Aucun relais ne s'est encore connecté.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Les lots</h2>
      <div className="admin-tableau">
        <table>
          <thead>
            <tr>
              <th scope="col">Lot</th>
              <th scope="col">Relais</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => (
              <tr key={l.id}>
                <td>
                  <b>{l.nom}</b>
                </td>
                <td>
                  {relais?.filter((r) => r.lotId === l.id && r.statut === 'actif').length ?? '—'}
                </td>
                <td className="mention">
                  {l.essai
                    ? 'Entraînement : ses fiches ne sont jamais publiées.'
                    : 'Tout l’arrondissement.'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
