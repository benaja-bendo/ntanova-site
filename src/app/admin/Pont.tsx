/**
 * Le pont avec la direction, en un clic : le premier message WhatsApp, déjà écrit, puis les deux gestes
 * qui comptent : confirmer la fonction de la personne (le relais touche alors son bonus de contact) et noter
 * l'accord daté de la direction (le badge « Vérifié »).
 *
 * Le message ne dit que ce qui est vrai aujourd'hui (voir `src/modele/pont-direction.ts`), et le bouton
 * n'existe que si la direction a donné son accord pour être contactée.
 */
import { useState } from 'react';
import { libelleFonction } from '../../modele/libelles';
import { listes, type Valeur } from '../../modele/listes';
import {
  lienPont,
  messageDirection,
  messageHonnete,
  type InfosMessage,
} from '../../modele/pont-direction';
import type { ContactDirection, DetailReleve, PortAdministration } from '../../modele/ports';
import { lienWhatsApp } from '../../modele/whatsapp';
import { Champ, quand } from '../../ui/composants';
import { messageErreur } from './ChampPosition';

type Canal = 'whatsapp' | 'appel' | 'sur_place' | 'autre';
const libelleCanal: Record<Canal, string> = {
  whatsapp: 'Par WhatsApp',
  appel: 'Par appel',
  sur_place: 'Sur place',
  autre: 'Autrement',
};

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function Pont({
  admin,
  detail,
  contact,
  surAnnonce,
}: {
  admin: PortAdministration;
  detail: DetailReleve;
  contact: ContactDirection;
  surAnnonce: (texte: string) => void;
}) {
  const infos: InfosMessage = {
    ecole: detail.campusNom ?? detail.nomEnseigne,
    ville: null,
    enLigne: detail.campusPublie,
  };
  const [texte, setTexte] = useState(() => messageDirection(infos));
  const [envoye, setEnvoye] = useState(false);
  const [fonction, setFonction] = useState<Valeur<'fonction_direction'>>(
    contact.fonction ?? detail.contactFonction ?? 'directeur',
  );
  const [confirmee, setConfirmee] = useState(detail.contactConfirmeLe !== null);
  const [accordLe, setAccordLe] = useState(aujourdhui());
  const [canal, setCanal] = useState<Canal>('whatsapp');
  const [note, setNote] = useState('');
  const [verifiee, setVerifiee] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const honnete = messageHonnete(texte);
  const lien =
    honnete && contact.accord ? lienWhatsApp(contact.whatsapp ?? undefined, texte) : null;
  // Le lien par défaut (message d'origine) sert à vérifier que le numéro est valide, même si le texte a été changé.
  const numeroValide = lienPont(contact, infos) !== null;

  const agir = async (action: () => Promise<unknown>, annonce: string, apres?: () => void) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      apres?.();
      surAnnonce(annonce);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  const noterLeMessage = () => {
    setEnvoye(true);
    if (detail.campusId) void admin.noterMessageEnvoye(detail.campusId).catch(() => undefined);
  };

  const enregistrerAccord = (ev: { preventDefault: () => void }) => {
    ev.preventDefault();
    if (!detail.campusId) return;
    const campusId = detail.campusId;
    void agir(
      () => admin.enregistrerVerification(campusId, accordLe, fonction, canal, note.trim() || null),
      `L’accord de la direction est noté au ${accordLe.split('-').reverse().join('/')} : la fiche portera « Vérifié par la direction » à la prochaine mise à jour du site.`,
      () => setVerifiee(true),
    );
  };

  return (
    <div className="pile-serree" aria-label="Pont avec la direction">
      {!contact.accord || !contact.whatsapp ? (
        <p className="mention">
          La direction n’a pas donné son accord pour être contactée : pas de message à lui écrire.
        </p>
      ) : (
        <>
          <Champ
            libelle="Message à la direction"
            aide="Écrit pour être honnête : rien sur le prix, la gratuité ou l’audience. Tu peux le changer avant d’ouvrir WhatsApp."
          >
            {(a) => (
              <textarea
                {...a}
                className="champ"
                rows={9}
                value={texte}
                onChange={(ev) => setTexte(ev.target.value)}
              />
            )}
          </Champ>
          {!honnete && (
            <p className="message-erreur" role="alert">
              Ce message parle de prix, de gratuité, d’audience ou de la paie du relais : NTanova ne
              peut pas l’affirmer aujourd’hui. Reformule-le.
            </p>
          )}
          <div className="admin-actions">
            {lien && numeroValide ? (
              <a
                className="bouton bouton-petit admin-bouton-accent"
                href={lien}
                target="_blank"
                rel="noopener noreferrer"
                onClick={noterLeMessage}
              >
                Écrire à la direction sur WhatsApp
              </a>
            ) : (
              <span className="mention">Le numéro de WhatsApp n’est pas valide.</span>
            )}
            {envoye && (
              <span className="etiquette etat-verifiee">Premier message noté aujourd’hui</span>
            )}
          </div>
        </>
      )}

      <form
        className="admin-motif"
        aria-label="Fonction et accord de la direction"
        onSubmit={enregistrerAccord}
      >
        <Champ
          libelle="Fonction de la personne qui a répondu"
          aide="La confirmer débloque le bonus de contact du relais (sauf le secrétariat : un secrétariat ne décide pas)."
        >
          {(a) => (
            <select
              {...a}
              className="champ"
              value={fonction}
              onChange={(ev) => setFonction(ev.target.value as Valeur<'fonction_direction'>)}
            >
              {listes.fonction_direction.map((f) => (
                <option key={f} value={f}>
                  {libelleFonction[f]}
                </option>
              ))}
            </select>
          )}
        </Champ>
        <div className="admin-actions admin-pleine-largeur">
          {confirmee ? (
            <span className="etiquette etat-verifiee">Fonction confirmée</span>
          ) : (
            <button
              type="button"
              className="bouton bouton-secondaire bouton-petit"
              disabled={enCours}
              onClick={() =>
                void agir(
                  () => admin.confirmerContact(detail.id, fonction),
                  `Fonction confirmée : ${libelleFonction[fonction]}.`,
                  () => setConfirmee(true),
                )
              }
            >
              Confirmer sa fonction
            </button>
          )}
        </div>

        {detail.campusId ? (
          <>
            <Champ
              libelle="Date de l’accord pour « Vérifié »"
              aide="La date où la direction a répondu « OK » : elle est gardée comme preuve, sans le message."
            >
              {(a) => (
                <input
                  {...a}
                  className="champ"
                  type="date"
                  max={aujourdhui()}
                  value={accordLe}
                  onChange={(ev) => setAccordLe(ev.target.value)}
                  required
                />
              )}
            </Champ>
            <Champ libelle="Comment l’accord a été donné">
              {(a) => (
                <select
                  {...a}
                  className="champ"
                  value={canal}
                  onChange={(ev) => setCanal(ev.target.value as Canal)}
                >
                  {(Object.keys(libelleCanal) as Canal[]).map((c) => (
                    <option key={c} value={c}>
                      {libelleCanal[c]}
                    </option>
                  ))}
                </select>
              )}
            </Champ>
            <Champ libelle="Note" facultatif>
              {(a) => (
                <input
                  {...a}
                  className="champ"
                  type="text"
                  maxLength={500}
                  autoComplete="off"
                  value={note}
                  onChange={(ev) => setNote(ev.target.value)}
                />
              )}
            </Champ>
            <div className="admin-actions admin-pleine-largeur">
              {verifiee ? (
                <span className="etiquette etat-verifiee">Accord noté</span>
              ) : (
                <button
                  type="submit"
                  className="bouton bouton-petit"
                  disabled={enCours || accordLe === ''}
                >
                  Noter l’accord de la direction (badge « Vérifié »)
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="mention admin-pleine-largeur">
            Accepte d’abord la fiche : l’accord de la direction se note sur l’école
            {contact.accordLe
              ? ` (accord pour être contactée donné ${quand(contact.accordLe)})`
              : ''}
            .
          </p>
        )}
        {erreur && (
          <p className="message-erreur admin-pleine-largeur" role="alert">
            {erreur}
          </p>
        )}
      </form>
    </div>
  );
}
