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
import { Entete, Navigation } from '../composants';
import { Bandeau, Icone, classeBouton } from '@/ui/v2/formulaire';
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
        <main className="flex flex-1 flex-col gap-4 px-4 py-3.5">
          <p>Cette fiche n’est plus dans votre liste.</p>
          <a
            className={classeBouton({ variant: 'outline', size: 'lg', className: 'w-full' })}
            href="#fiches"
          >
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
      <main className="flex flex-1 flex-col gap-4 px-4 py-3.5">
        <p>
          <b>{recu.nomEnseigne}</b>
          <br />
          <span className="text-muted-foreground">
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
        <a
          className={classeBouton({ variant: 'link', className: 'text-muted-foreground' })}
          href="#fiches"
        >
          Retour à mes fiches
        </a>
      </main>
      <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-border bg-card px-4 pt-2.5 pb-4">
        <button
          type="button"
          className={classeBouton({ size: 'xl', className: 'w-full' })}
          onClick={() => void envoyer()}
        >
          <Icone nom="coche" />
          Envoyer le contact
        </button>
      </div>
    </div>
  );
}
