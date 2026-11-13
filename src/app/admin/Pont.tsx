import { v2 } from '@/ui/v2/classes';
import { Bouton } from '@/ui/v2/admin';
/**
 * Le pont avec la direction, en un clic : le premier message WhatsApp, déjà écrit, puis les deux gestes
 * qui comptent : confirmer la fonction de la personne (le relais touche alors son bonus de contact) et noter
 * l'accord daté de la direction (le badge « Vérifié »).
 *
 * Le message ne dit que ce qui est vrai aujourd'hui (voir `src/modele/pont-direction.ts`), et le bouton
 * n'existe que si la direction a donné son accord pour être contactée.
 */
import { useState } from 'react';
import { libellePersonne } from '../../modele/contacts';
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
import { Champ } from '@/ui/v2/formulaire';
import { quand } from '../../ui/composants';
import { messageErreur } from './ChampPosition';

type Canal = 'whatsapp' | 'appel' | 'sur_place' | 'autre';
const libelleCanal: Record<Canal, string> = {
  whatsapp: 'Par WhatsApp',
  appel: 'Par appel',
  sur_place: 'Sur place',
  autre: 'Autrement',
};

const aujourdhui = () => new Date().toISOString().slice(0, 10);

function PontPour({
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
  const [operation, setOperation] = useState<'fonction' | 'accord' | null>(null);
  const enCours = operation !== null;

  const honnete = messageHonnete(texte, [infos.ecole]);
  const lien =
    honnete && contact.accord ? lienWhatsApp(contact.whatsapp ?? undefined, texte) : null;
  // Le lien par défaut (message d'origine) sert à vérifier que le numéro est valide, même si le texte a été changé.
  const numeroValide = lienPont(contact, infos) !== null;

  const agir = async (
    nom: NonNullable<typeof operation>,
    action: () => Promise<unknown>,
    annonce: string,
    apres?: () => void,
  ) => {
    setOperation(nom);
    setErreur(null);
    try {
      await action();
      apres?.();
      surAnnonce(annonce);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOperation(null);
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
      'accord',
      () => admin.enregistrerVerification(campusId, accordLe, fonction, canal, note.trim() || null),
      `L’accord de la direction est noté au ${accordLe.split('-').reverse().join('/')} : la fiche portera « Vérifié par la direction » à la prochaine mise à jour du site.`,
      () => setVerifiee(true),
    );
  };

  return (
    <div className={v2.pileSerree} aria-label="Pont avec la direction">
      {!contact.accord || !contact.whatsapp ? (
        <p className={v2.mention}>
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
                className={v2.champ}
                rows={9}
                value={texte}
                onChange={(ev) => setTexte(ev.target.value)}
              />
            )}
          </Champ>
          {!honnete && (
            <p className={v2.erreur} role="alert">
              Ce message parle de prix, de gratuité, d’audience ou de la paie du relais : NTanova ne
              peut pas l’affirmer aujourd’hui. Reformule-le.
            </p>
          )}
          <div className={v2.actions}>
            {lien && numeroValide ? (
              <a
                className={v2.boutonPetit}
                href={lien}
                target="_blank"
                rel="noopener noreferrer"
                onClick={noterLeMessage}
              >
                Écrire à la direction sur WhatsApp
              </a>
            ) : (
              // Un message à reformuler a déjà son alerte ci-dessus : ici, seulement un numéro qui n'en est pas un.
              !numeroValide && (
                <span className={v2.mention}>Le numéro de WhatsApp n’est pas valide.</span>
              )
            )}
            {envoye && <span className={v2.pastilleSucces}>Premier message noté aujourd’hui</span>}
          </div>
        </>
      )}

      <form aria-label="Fonction et accord de la direction" onSubmit={enregistrerAccord}>
        <fieldset className={v2.motif} disabled={enCours} aria-label="Fonction et accord">
          <Champ
            libelle="Fonction de la personne qui a répondu"
            aide="La confirmer débloque le bonus de contact du relais (sauf le secrétariat : un secrétariat ne décide pas)."
          >
            {(a) => (
              <select
                {...a}
                className={v2.champ}
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
          <div className={v2.actionsLarge}>
            {confirmee ? (
              <span className={v2.pastilleSucces}>Fonction confirmée</span>
            ) : (
              <Bouton
                enCours={operation === 'fonction'}
                texteEnCours="Confirmation…"
                className={v2.petit}
                variante="secondaire"
                disabled={enCours}
                onClick={() =>
                  void agir(
                    'fonction',
                    () => admin.confirmerContact(detail.id, fonction),
                    `Fonction confirmée : ${libelleFonction[fonction]}.`,
                    () => setConfirmee(true),
                  )
                }
              >
                Confirmer sa fonction
              </Bouton>
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
                    className={v2.champ}
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
                    className={v2.champ}
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
                    className={v2.champ}
                    type="text"
                    maxLength={500}
                    autoComplete="off"
                    value={note}
                    onChange={(ev) => setNote(ev.target.value)}
                  />
                )}
              </Champ>
              <div className={v2.actionsLarge}>
                {verifiee ? (
                  <span className={v2.pastilleSucces}>Accord noté</span>
                ) : (
                  <Bouton
                    type="submit"
                    enCours={operation === 'accord'}
                    texteEnCours="Enregistrement…"
                    className={v2.petit}
                    disabled={enCours || accordLe === ''}
                  >
                    Noter l’accord de la direction (badge « Vérifié »)
                  </Bouton>
                )}
              </div>
            </>
          ) : (
            <p className={v2.mentionLarge}>
              Accepte d’abord la fiche : l’accord de la direction se note sur l’école
              {contact.accordLe
                ? ` (accord pour être contactée donné ${quand(contact.accordLe)})`
                : ''}
              .
            </p>
          )}
          {erreur && (
            <p className={v2.erreurLarge} role="alert">
              {erreur}
            </p>
          )}
        </fieldset>
      </form>
    </div>
  );
}

/**
 * Le pont avec une personne de la fiche : celle à qui écrire se choisit quand il y en a plusieurs (ticket #96). Par
 * défaut, la première qui a donné son accord et son numéro.
 */
export function Pont({
  admin,
  detail,
  contacts,
  surAnnonce,
}: {
  admin: PortAdministration;
  detail: DetailReleve;
  contacts: ContactDirection[];
  surAnnonce: (texte: string) => void;
}) {
  const [choisi, setChoisi] = useState<string | null>(null);
  const contact =
    contacts.find((c) => c.id === choisi) ??
    contacts.find((c) => c.accord && c.whatsapp) ??
    contacts[0];
  if (!contact) return null;
  return (
    <div className={v2.pileSerree}>
      {contacts.length > 1 && (
        <Champ libelle="Écrire à">
          {(a) => (
            <select
              {...a}
              className={v2.champ}
              value={contact.id}
              onChange={(ev) => setChoisi(ev.target.value)}
            >
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {libellePersonne(c)}
                </option>
              ))}
            </select>
          )}
        </Champ>
      )}
      {/* Une autre personne, un autre pont : rien ne reste du message ni de la fonction de la précédente. */}
      <PontPour
        key={contact.id}
        admin={admin}
        detail={detail}
        contact={contact}
        surAnnonce={surAnnonce}
      />
    </div>
  );
}
