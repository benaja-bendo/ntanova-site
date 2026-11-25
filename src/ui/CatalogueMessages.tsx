/** Le catalogue des pièces de « Messages reçus » (refonte, lot 3B2), dans leurs états. Données inventées ; rien n'est lu ni écrit. */
import '@/ui/shadcn/theme.css';
import { useState } from 'react';
import {
  BandeauEchec,
  BlocMessage,
  CarteMessage,
  ChoixDuJour,
  ChoixMultiple,
  ChoixUnique,
  Encart,
  FileVide,
  Journal,
  JOUR_NON_CHOISI,
  LigneMessageEcrite,
  ListeEtapes,
  Pastilles,
  Squelette,
  type JourChoisi,
} from './v2/messages';

const rien = () => undefined;

export default function CatalogueMessages() {
  const [choix, setChoix] = useState<'existe' | 'non_retenue' | null>(null);
  const [cibles, setCibles] = useState<('contact_public' | 'photo')[]>([]);
  const [jour, setJour] = useState<JourChoisi>(JOUR_NON_CHOISI);
  return (
    <section
      aria-label="Messages reçus"
      className="flex max-w-[960px] flex-col gap-5 bg-background p-4 font-sans text-foreground"
    >
      <h2 className="m-0 font-serif text-2xl">Messages reçus (administration, 24/11)</h2>
      <Pastilles
        liste={[
          { ton: 'succes', texte: 'Nouveau' },
          { ton: 'attention', texte: 'Alerte en échec' },
          { ton: 'danger', texte: 'Alerte abandonnée' },
          { ton: 'neutre', texte: 'Réponse : WhatsApp' },
        ]}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <CarteMessage
          href="#demandes/A-7K4P-2QXM"
          courante={false}
          surAppui={rien}
          nature="École absente"
          reference="A-7K4P-2QXM"
          titre="[Complexe scolaire Exemple]"
          precision="Brazzaville · reçu aujourd’hui à 9 h 12"
          pastilles={[{ ton: 'succes', texte: 'Nouveau' }]}
        />
        <CarteMessage
          href="#demandes/A-9HZE-4NBV"
          courante
          surAppui={rien}
          nature="Erreur sur une fiche"
          reference="A-9HZE-4NBV"
          titre="[Un nom d’école extrêmement long qui ne tient pas sur une seule ligne de la carte]"
          precision="Les frais · reçu hier à 18 h 05"
          pastilles={[
            { ton: 'attention', texte: 'Pas encore annoncé' },
            { ton: 'neutre', texte: '2 versions' },
          ]}
        />
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <BlocMessage titre="Ce qui est écrit">
          <LigneMessageEcrite libelle="Message">
            [le message, tel qu’il est écrit]
          </LigneMessageEcrite>
          <LigneMessageEcrite libelle="Nom (facultatif)">[Prénom]</LigneMessageEcrite>
        </BlocMessage>
        <BlocMessage titre="Historique">
          <Journal
            faits={[
              { quand: 'Hier à 18 h 05', quoi: 'Reçu' },
              { quand: 'Aujourd’hui à 9 h 40', quoi: 'Ouvert par toi' },
            ]}
          />
        </BlocMessage>
        <Encart titre="Version 2 affichée, 2 reçues">
          <span>La personne a corrigé son texte avant l’ouverture.</span>
        </Encart>
        <Encart ton="succes" titre="Clos hier à 9 h 15">
          <span>Effacé automatiquement le 24 nov. 2027.</span>
        </Encart>
        <BandeauEchec titre="Ce geste n’est pas confirmé." action={rien} libelleAction="Réessayer">
          Réseau ou serveur. Ta saisie est gardée.
        </BandeauEchec>
        <BandeauEchec
          titre="Ce message a changé entre-temps."
          action={rien}
          libelleAction="Relire le message"
        >
          Rien n’est écrasé et ta saisie est gardée.
        </BandeauEchec>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ChoixUnique
          legende="Décision"
          options={[
            { valeur: 'existe', libelle: 'Elle existe : une fiche est à préparer' },
            { valeur: 'non_retenue', libelle: 'Non retenue' },
          ]}
          valeur={choix}
          surChoix={setChoix}
        />
        <ChoixMultiple
          legende="Que retires-tu ?"
          options={[
            { valeur: 'contact_public', libelle: 'Le contact public' },
            { valeur: 'photo', libelle: 'Une photo' },
          ]}
          valeurs={cibles}
          surChoix={(c) => setCibles((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]))}
        />
        <ChoixDuJour
          legende="Quand la réponse est-elle partie ?"
          aujourdHui="2026-11-24"
          valeur={jour}
          surChoix={setJour}
        />
        <BlocMessage titre="Les six étapes">
          <ListeEtapes
            etapes={[
              { titre: 'Vérifier que la personne est concernée', etat: 'faite', mot: 'Fait' },
              { titre: 'Retirer dans la base', etat: 'courante', mot: 'À faire maintenant' },
              { titre: 'Demander la mise en ligne', etat: 'a_venir', mot: 'À venir' },
              { titre: 'Constater en ligne', etat: 'sans_objet', mot: 'Sans objet' },
            ]}
          />
        </BlocMessage>
        <FileVide titre="Aucun message à traiter.">Les nouveaux arrivent ici.</FileVide>
        <Squelette libelle="Chargement des messages…" />
      </div>
    </section>
  );
}
