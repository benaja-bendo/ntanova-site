import { useState } from 'react';
import {
  contactVide,
  erreursEtape3,
  nouvelleFiche,
  type ContactSaisi,
  type Erreurs,
} from '../../../modele/fiche';
import { ajouterLeContact } from '../actions-fiches';
import { lireMemoire, useRequete } from '../base-locale';
import { Bandeau, Entete, Icone, Navigation } from '../composants';
import { aller, useRelais } from '../contexte';
import { ChampsContact } from './Ajouter';

/**
 * « J'ai revu la direction » : après « À repasser », le relais ajoute le contact de la direction à la fiche que NTanova
 * a déjà reçue. Rien d'autre n'est renvoyé : le contact part par la file d'envoi, hors ligne aussi, et disparaît du
 * téléphone une fois reçu.
 */
export function ContactSeul({ releveId }: { releveId: string }) {
  const { synchroniser } = useRelais();
  const recus = useRequete(async () => (await lireMemoire('releves')) ?? []);
  const [contact, setContact] = useState<ContactSaisi>(contactVide());
  const [erreurs, setErreurs] = useState<Erreurs>({});

  if (recus === undefined) return <div className="ecran" aria-busy="true" />;
  const recu = recus.find((r) => r.id === releveId);

  if (!recu) {
    return (
      <div className="ecran">
        <Entete titre="La direction" principal />
        <main className="contenu-relais">
          <p>Cette fiche n’est plus dans votre liste.</p>
          <a className="bouton bouton-secondaire" href="#fiches">
            Retour à mes fiches
          </a>
        </main>
        <Navigation />
      </div>
    );
  }

  const modifierContact = (champs: Partial<ContactSaisi>) =>
    setContact((avant) => ({ ...avant, ...champs }));

  const envoyer = async () => {
    // Les mêmes contrôles que l'étape 3/3 quand la direction a été vue.
    const e = erreursEtape3({ ...nouvelleFiche(recu.id, '', null), direction: 'vue', contact });
    setErreurs(e);
    if (Object.keys(e).length > 0) return;
    await ajouterLeContact(recu, contact);
    aller('fiches', true);
    synchroniser();
  };

  return (
    <div className="ecran">
      <Entete titre="La direction" principal />
      <main className="contenu-relais">
        <p>
          <b>{recu.nomEnseigne}</b>
          <br />
          <span className="texte-doux">
            Vous aviez noté que la direction était absente. Vous l’avez revue&nbsp;: ajoutez son
            contact.
          </span>
        </p>
        <Bandeau ton="prive" icone="cadenas">
          <p>
            <b>Privé.</b> Seul NTanova voit cette partie. Elle s’efface du téléphone une fois
            envoyée.
          </p>
        </Bandeau>
        <ChampsContact contact={contact} modifierContact={modifierContact} erreurs={erreurs} />
        <a className="lien lien-discret" href="#fiches">
          Retour à mes fiches
        </a>
      </main>
      <div className="pied-etape">
        <button type="button" className="bouton bouton-large" onClick={() => void envoyer()}>
          <Icone nom="coche" />
          Envoyer le contact
        </button>
      </div>
    </div>
  );
}
