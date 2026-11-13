import { useCallback, useEffect, useState } from 'react';
import {
  ErreurDecision,
  type LotVu,
  type PortAdministration,
  type RelaisVu,
} from '../../modele/ports';
import { Bandeau, jour } from '../../ui/composants';
import { TitreEcran } from './Cadre';

const libelleStatut: Record<RelaisVu['statut'], { texte: string; classe: string }> = {
  en_attente: { texte: 'À activer', classe: 'etat-attente' },
  actif: { texte: 'Actif', classe: 'etat-envoye' },
  suspendu: { texte: 'Suspendu', classe: 'etat-refusee' },
};

/** Lot G : ce qui demande un regard — des fiches renvoyées, une position lente cette semaine ; sinon « Aucun ». */
export function signauxDuRelais(r: Pick<RelaisVu, 'compteurs'>): string[] {
  const s: string[] = [];
  const { aCorriger, positionLenteSemaine } = r.compteurs;
  if (aCorriger > 0)
    s.push(`${aCorriger} fiche${aCorriger > 1 ? 's' : ''} renvoyée${aCorriger > 1 ? 's' : ''}`);
  if (positionLenteSemaine > 0) s.push(`Position lente ${positionLenteSemaine} fois`);
  return s;
}

function SignalDuRelais({ r }: { r: RelaisVu }) {
  const s = signauxDuRelais(r);
  if (s.length === 0) return <span className="texte-doux">Aucun</span>;
  return (
    <span className="relais-signaux">
      {s.map((x) => (
        <span key={x} className="etiquette etat-attente">
          {x}
        </span>
      ))}
    </span>
  );
}

/** Lot G : en tête, les comptes à activer et les relais de la semaine ; les autres, repliés en bas de liste. */
export function relaisDeLaSemaine(
  r: Pick<RelaisVu, 'statut' | 'activeLe' | 'compteurs'>,
  maintenant: number = Date.now(),
): boolean {
  if (r.statut === 'en_attente') return true;
  if (r.compteurs.envoyeesSemaine > 0) return true;
  // Un relais activé depuis moins de 7 jours reste en vue : il commence.
  return (
    r.statut === 'actif' &&
    r.activeLe !== null &&
    maintenant - Date.parse(r.activeLe) < 7 * 86_400_000
  );
}

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
  // Un relais sans lot (valeur vide) relève où il se trouve : le lot n'est qu'un secteur conseillé. Un nouveau relais
  // ne commence plus par le lot d'essai (décision du fondateur, 05/11/2026) : ses fiches ne se publieraient jamais, et un
  // relais qu'on sortait de l'essai envoyait encore des fiches « du lot d'essai ». Le lot d'essai reste dans le menu.
  const parDefaut = r.lotId ?? '';
  const [lot, setLot] = useState(parDefaut);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const nomLot = lots.find((l) => l.id === r.lotId)?.nom ?? 'Aucun lot';

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
        {r.email && <span className="mention admin-sous-ligne admin-email">{r.email}</span>}
        <span className="mention admin-sous-ligne">Première connexion : {jour(r.creeLe)}</span>
        <span className="mention admin-sous-ligne">{nomLot}</span>
      </td>
      <td>
        <span className={`etiquette ${libelleStatut[r.statut].classe}`}>
          {libelleStatut[r.statut].texte}
        </span>
      </td>
      <td>
        {r.compteurs.envoyees}
        {r.compteurs.envoyeesSemaine > 0 && (
          <span className="texte-doux"> · {r.compteurs.envoyeesSemaine} cette semaine</span>
        )}
        <span className="mention admin-sous-ligne">
          {r.compteurs.aValider > 0 && `${r.compteurs.aValider} à valider · `}
          {r.compteurs.acceptees} acceptée{r.compteurs.acceptees > 1 ? 's' : ''}
          {r.compteurs.aCorriger > 0 && ` · ${r.compteurs.aCorriger} à corriger`}
          {r.compteurs.refusees > 0 &&
            ` · ${r.compteurs.refusees} refusée${r.compteurs.refusees > 1 ? 's' : ''}`}
        </span>
      </td>
      <td>{r.compteurs.contactsConfirmes}</td>
      <td>
        <SignalDuRelais r={r} />
      </td>
      <td>
        <div className="admin-actions">
          <select
            className="champ admin-choix-lot"
            aria-label={`Lot de ${r.prenom}`}
            value={lot}
            onChange={(e) => setLot(e.target.value)}
          >
            <option value="">Sans lot</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom === l.divisionNom ? l.nom : `${l.nom} — ${l.divisionNom}`}
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
                  void agir(
                    () => admin.activerRelais(r.id, lot || null),
                    `${r.prenom} change de lot.`,
                  )
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
            <>
              <button
                type="button"
                className="bouton bouton-petit"
                disabled={enCours}
                onClick={() =>
                  void agir(() => admin.activerRelais(r.id, lot || null), `${r.prenom} est actif.`)
                }
              >
                {r.statut === 'suspendu' ? 'Réactiver' : 'Activer'}
              </button>
              {/* Un compte inconnu s'écarte : il passe « suspendu », et peut être réactivé plus tard. */}
              {r.statut === 'en_attente' && (
                <button
                  type="button"
                  className="bouton bouton-secondaire bouton-petit admin-bouton-refus"
                  disabled={enCours}
                  onClick={() =>
                    void agir(() => admin.suspendreRelais(r.id), `${r.prenom} est écarté.`)
                  }
                >
                  Écarter
                </button>
              )}
            </>
          )}
        </div>
        {erreur && <p className="message-erreur">{erreur}</p>}
      </td>
    </tr>
  );
}

function TableauRelais({
  relais,
  lots,
  admin,
  surChangement,
  vide,
}: {
  relais: RelaisVu[];
  lots: LotVu[];
  admin: PortAdministration;
  surChangement: (id: string, texte: string) => void;
  vide: string | null;
}) {
  return (
    <div className="admin-tableau relais-tableau">
      <table>
        <thead>
          <tr>
            <th scope="col">Relais</th>
            <th scope="col">Compte</th>
            <th scope="col">Fiches envoyées</th>
            <th scope="col">Contacts confirmés</th>
            <th scope="col">Signal</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {relais.map((r) => (
            <LigneRelais
              key={`${r.id}-${r.statut}-${r.lotId ?? ''}`}
              r={r}
              lots={lots}
              admin={admin}
              surChangement={(texte) => surChangement(r.id, texte)}
            />
          ))}
          {vide && (
            <tr>
              <td colSpan={6} className="texte-doux">
                {vide}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ListeRelais({
  admin,
  surCompte,
}: {
  admin: PortAdministration;
  /** Combien de comptes attendent d'être activés : le menu le dit, d'où qu'on arrive. */
  surCompte: (n: number) => void;
}) {
  const [relais, setRelais] = useState<RelaisVu[] | null>(null);
  const [lots, setLots] = useState<LotVu[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);

  // Un relais sur lequel on vient d'agir reste en vue pendant la visite : il ne file pas dans « autres relais ».
  const [touches, setTouches] = useState<ReadonlySet<string>>(new Set());
  const enVue = (relais ?? []).filter((r) => relaisDeLaSemaine(r) || touches.has(r.id));
  const autres = (relais ?? []).filter((r) => !relaisDeLaSemaine(r) && !touches.has(r.id));
  const charger = useCallback(() => {
    Promise.all([admin.relais(), admin.lots()])
      .then(([r, l]) => {
        // Les comptes à activer d'abord : c'est ce qu'on vient faire ici.
        const ordre = { en_attente: 0, actif: 1, suspendu: 2 } as const;
        setRelais([...r].sort((a, b) => ordre[a.statut] - ordre[b.statut]));
        setLots(l);
        setErreur(null);
        surCompte(r.filter((x) => x.statut === 'en_attente').length);
      })
      .catch(() => setErreur('La base ne répond pas. Vérifie le réseau et recharge la page.'));
  }, [admin, surCompte]);

  useEffect(() => {
    charger();
  }, [charger]);

  const surChangement = (id: string, texte: string) => {
    setTouches((avant) => new Set(avant).add(id));
    setAnnonce(texte);
    charger();
  };

  return (
    <div className="pile">
      <TitreEcran
        titre="Relais"
        regles={
          <>
            <p>
              Un relais apparaît ici dès sa première connexion, « à activer », avec l’adresse de son
              compte : relie-la à la personne (son message WhatsApp), puis active-la. « Écarter »
              met de côté un compte que tu ne connais pas. Les lots se gèrent dans l’onglet « Zones
              ».
            </p>
            <p>
              Quelqu’un ne peut pas se connecter ? Tant que l’application Google est en mode « test
              », seules les adresses ajoutées dans Google Cloud (Écran de consentement, Utilisateurs
              de test) peuvent se connecter. Publier l’application lève cette limite.
            </p>
          </>
        }
      />

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

      <TableauRelais
        relais={enVue}
        lots={lots}
        admin={admin}
        surChangement={surChangement}
        vide={
          relais === null && !erreur
            ? 'Chargement des relais…'
            : relais?.length === 0
              ? 'Aucun relais ne s’est encore connecté.'
              : enVue.length === 0
                ? 'Aucun relais n’a envoyé de fiche cette semaine.'
                : null
        }
      />
      {autres.length > 0 && (
        <details className="relais-autres">
          <summary>
            {autres.length} autre{autres.length > 1 ? 's' : ''} relais, sans envoi cette semaine
          </summary>
          <TableauRelais
            relais={autres}
            lots={lots}
            admin={admin}
            surChangement={surChangement}
            vide={null}
          />
        </details>
      )}
      <details className="admin-sous-ligne">
        <summary>Quelqu’un ne peut pas se connecter ?</summary>
        <p className="mention">
          Tant que l’application Google est en mode « test », seules les adresses ajoutées dans
          Google Cloud (Écran de consentement, Utilisateurs de test) peuvent se connecter. Publier
          l’application lève cette limite.
        </p>
      </details>
    </div>
  );
}
