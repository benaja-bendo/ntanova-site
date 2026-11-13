import { useCallback, useEffect, useState } from 'react';
import {
  etatDuManque,
  libelleSujetDemande,
  messageALEcole,
  tacheDuManque,
  type Manque,
} from '../../modele/fiche-admin';
import { dateCourte } from '../../modele/pointe-noire';
import type { PortAdministration } from '../../modele/ports';
import { lienWhatsApp } from '../../modele/whatsapp';
import { messageErreur } from './ChampPosition';

/**
 * « N choses à compléter » (lot D du ticket 165, canevas « Fiche d'école », bloc en tête de la fiche admin) : ce qui manque au
 * site, qui peut le donner, et où en est sa demande. Cinq états : à faire ; demandé à l'école le [date] (annulable) ; confié
 * à un relais ; une demande précisée (« Frais de la 3e ») ; rien ne manque. « Ouvrir dans WhatsApp » ouvre ton WhatsApp avec
 * le message, rien ne part tout seul ; les manques passent à « demandé à l'école ». « Confier à un relais » ouvre la mission,
 * avec la tâche préremplie.
 */
export function ManquesEcole({
  ecoleId,
  nom,
  numero,
  admin,
  surConfier,
  surChangement,
}: {
  ecoleId: string;
  nom: string;
  /** Le numéro de l'école quand NTanova en a un (contact public) ; sinon WhatsApp demande à qui écrire. */
  numero: string | null;
  admin: PortAdministration;
  surConfier: (tache: string | null) => void;
  surChangement: (texte: string) => void;
}) {
  const [manques, setManques] = useState<Manque[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const lire = useCallback(() => admin.manquesDeLEcole(ecoleId), [admin, ecoleId]);
  useEffect(() => {
    let vivant = true;
    void lire()
      .then((m) => vivant && setManques(m))
      .catch((e: unknown) => vivant && setErreur(messageErreur(e)));
    return () => {
      vivant = false;
    };
  }, [lire]);

  if (erreur && manques === null) return <p className="message-erreur">{erreur}</p>;
  if (manques === null) return <p aria-busy="true">Chargement…</p>;
  if (manques.length === 0)
    return (
      <section className="pile-serree" aria-label="À compléter">
        <p className="bandeau bandeau-envoye">Fiche complète : rien ne manque.</p>
      </section>
    );

  const aDemander = manques.filter((m) => m.quiPeut.includes('ecole') && !m.demandeLe);
  const lien =
    lienWhatsApp(numero ?? undefined, messageALEcole(nom, aDemander)) ??
    `https://wa.me/?text=${encodeURIComponent(messageALEcole(nom, aDemander))}`;
  const agir = async (action: () => Promise<unknown>, texte: string) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      setManques(await lire());
      surChangement(texte);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section className="pile-serree" aria-label="À compléter">
      <h3>
        {manques.length} chose{manques.length > 1 ? 's' : ''} à compléter
      </h3>
      <ul className="admin-liste-manques">
        {manques.map((m, i) => (
          <li key={`${m.sujet}-${m.demandeId ?? i}`}>
            <span>
              <b>{m.detail ?? libelleSujetDemande[m.sujet]}</b>
              <span className="mention admin-sous-ligne">
                {etatDuManque(m, dateCourte)} · peut le donner&nbsp;:{' '}
                {m.quiPeut.map((q) => (q === 'ecole' ? 'l’école' : 'un relais')).join(' ou ')}
              </span>
            </span>
            <span className="admin-actions">
              {m.demandeId && m.demandeA === 'ecole' && (
                <button
                  type="button"
                  className="lien"
                  disabled={enCours}
                  onClick={() =>
                    void agir(
                      () => admin.fermerDemande(m.demandeId!, 'annulee'),
                      'Demande annulée.',
                    )
                  }
                >
                  Annuler la demande
                </button>
              )}
              {m.quiPeut.includes('relais') && !m.demandeLe && (
                <button
                  type="button"
                  className="lien"
                  onClick={() => surConfier(tacheDuManque[m.sujet] ?? m.detail)}
                >
                  Confier à un relais
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {aDemander.length > 0 && (
        <div className="pile-serree">
          <p className="mention">
            Le message, à relire dans WhatsApp&nbsp;: {messageALEcole(nom, aDemander)}
          </p>
          <a
            className="bouton"
            href={lien}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={enCours}
            onClick={() =>
              void agir(
                () =>
                  Promise.all(
                    aDemander.map((m) => admin.demanderALEcole(ecoleId, m.sujet, m.detail)),
                  ),
                `${aDemander.length > 1 ? 'Demandes notées' : 'Demande notée'} : « demandé à l’école ».`,
              )
            }
          >
            Ouvrir dans WhatsApp
          </a>
          <p className="mention">
            Rien ne part tout seul. Les manques passent à « demandé à l’école » ; annulable.
          </p>
        </div>
      )}
      {erreur && (
        <p className="message-erreur" role="alert">
          {erreur}
        </p>
      )}
      {enCours && (
        <p className="mention" aria-live="polite">
          Enregistrement…
        </p>
      )}
    </section>
  );
}
