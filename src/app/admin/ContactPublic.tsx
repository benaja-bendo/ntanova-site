import { useEffect, useRef, useState } from 'react';
import {
  jourDuCongo,
  lireAccordContactPublic,
  type ContactPublic as Contact,
} from '../../modele/contact-public';
import { libelleFonction } from '../../modele/libelles';
import { listes } from '../../modele/listes';
import type { PortAdministration } from '../../modele/ports';
import { afficherTelephone } from '../../modele/telephone';
import { Bandeau, jour } from '../../ui/composants';
import { messageErreur } from './ChampPosition';

export function ContactPublic({
  ecoleId,
  nom,
  contact,
  admin,
  surChangement,
  fermer,
}: {
  ecoleId: string;
  nom: string;
  contact: Contact | null;
  admin: PortAdministration;
  surChangement: (texte: string) => void;
  fermer: () => void;
}) {
  const dialogue = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialogue.current!;
    d.showModal();
    return () => d.close();
  }, []);
  const [numero, setNumero] = useState(contact?.numero ?? '');
  const [accordLe, setAccordLe] = useState('');
  const [fonction, setFonction] = useState('');
  const [canal, setCanal] = useState('');
  const [autorise, setAutorise] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const agir = async (retirer: boolean) => {
    const resultat = retirer
      ? { contact: null, erreur: null }
      : lireAccordContactPublic({ numero, accordLe, fonction, canal, autorise });
    if (resultat.erreur) {
      setErreur(resultat.erreur);
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await admin.enregistrerContactPublic(ecoleId, resultat.contact);
      setAutorise(false);
      setNumero(resultat.contact?.numero ?? '');
      setAccordLe('');
      setFonction('');
      setCanal('');
      surChangement(
        retirer
          ? `Le contact communiqué par ${nom} est retiré de la base. Reconstruis le site pour mettre à jour les pages en ligne ; le numéro lu sur l’enseigne reste inchangé.`
          : `Le contact public de ${nom} est enregistré. Reconstruis le site pour publier ce changement.`,
      );
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };
  return (
    <dialog
      ref={dialogue}
      className="dialogue-contact-public"
      aria-label={`Contact public de ${nom}`}
      onClose={fermer}
    >
      <button
        type="button"
        className="bouton bouton-secondaire"
        onClick={() => dialogue.current?.close()}
      >
        Fermer
      </button>
      <form
        className="admin-motif"
        aria-label={`Contact public de ${nom}`}
        onSubmit={(ev) => {
          ev.preventDefault();
          void agir(false);
        }}
      >
        <h3>Contact public de l’école</h3>
        <p>
          Un numéro que la direction autorise explicitement à afficher sur le site. Le contact privé
          reste privé. Cet accord ne donne pas le badge « Confirmée par la direction ».
        </p>
        {contact && (
          <p>
            Enregistré : {afficherTelephone(contact.numero)} · accord du {jour(contact.accordLe)}
          </p>
        )}
        <label className="champ-groupe">
          Numéro public
          <input
            className="champ"
            type="tel"
            autoComplete="off"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
          />
        </label>
        <label className="champ-groupe">
          Date de l’accord de publication
          <input
            className="champ"
            type="date"
            max={jourDuCongo()}
            value={accordLe}
            onChange={(e) => setAccordLe(e.target.value)}
          />
        </label>
        <label className="champ-groupe">
          Fonction de la personne ayant autorisé la publication
          <select className="champ" value={fonction} onChange={(e) => setFonction(e.target.value)}>
            <option value="">Choisir</option>
            {listes.fonction_direction.map((f) => (
              <option key={f} value={f}>
                {libelleFonction[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="champ-groupe">
          Canal de l’accord
          <select className="champ" value={canal} onChange={(e) => setCanal(e.target.value)}>
            <option value="">Choisir</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="appel">Appel</option>
            <option value="sur_place">Sur place</option>
            <option value="autre">Autre</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={autorise}
            onChange={(e) => setAutorise(e.target.checked)}
          />{' '}
          La direction autorise la publication de ce numéro sur le site.
        </label>
        {erreur && (
          <Bandeau ton="erreur" icone="alerte">
            {erreur}
          </Bandeau>
        )}
        <button className="bouton" type="submit" disabled={enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer le contact public'}
        </button>
        {contact && (
          <button
            className="bouton bouton-secondaire admin-bouton-refus"
            type="button"
            disabled={enCours}
            onClick={() => void agir(true)}
          >
            Retirer le contact public
          </button>
        )}
        <p className="mention">
          Ajout, modification et retrait apparaissent après reconstruction du site. Le contact privé
          et le numéro lu sur l’enseigne ne sont pas modifiés ici.
        </p>
        <a
          href="https://github.com/benaja-bendo/ntanova-site/actions/workflows/mise-en-ligne.yml"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ouvrir la mise à jour du site
        </a>
        <p className="mention">
          Choisis essai pour vérifier, puis production pour rendre le changement visible aux
          familles.
        </p>
      </form>
    </dialog>
  );
}
