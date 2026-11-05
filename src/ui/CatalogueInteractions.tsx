import { useState } from 'react';
import { ActionsSecondaires, Badge, BadgePublication, Bouton } from './actions';
import { Dialogue } from './Dialogue';
import { Champ } from './composants';

export default function CatalogueInteractions() {
  const [fenetre, setFenetre] = useState<'tiroir' | 'confirmation' | null>(null);
  const [erreur, setErreur] = useState(false);
  const [nom, setNom] = useState('');
  const [annonce, setAnnonce] = useState('');
  return (
    <section className="pile" aria-label="Composants interactifs">
      <h2>Actions et formulaires React</h2>
      <p>
        Tab et Maj + Tab déplacent le focus. Les boutons répondent à Entrée et Espace. Échap ferme
        les fenêtres et rend le focus à leur déclencheur.
      </p>
      <div className="choix-ligne">
        <Bouton onClick={() => setAnnonce('Action terminée.')}>Principal</Bouton>
        <Bouton variante="secondaire">Secondaire</Bouton>
        <Bouton variante="discret">Discret</Bouton>
        <Bouton variante="danger" onClick={() => setFenetre('confirmation')}>
          Action sensible
        </Bouton>
        <Bouton disabled>Désactivé</Bouton>
        <Bouton enCours>Enregistrer</Bouton>
      </div>
      {annonce && <p role="status">{annonce}</p>}
      <form
        className="pile-serree"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          setErreur(!nom.trim());
          if (nom.trim()) setAnnonce('Les informations sont enregistrées.');
        }}
      >
        <Champ
          libelle="Nom de démonstration"
          aide="Laisser vide puis enregistrer pour voir l’erreur."
          erreur={erreur ? 'Indique le nom.' : undefined}
        >
          {(a) => (
            <input
              {...a}
              className="champ"
              value={nom}
              onChange={(ev) => setNom(ev.target.value)}
            />
          )}
        </Champ>
        <div>
          <Bouton type="submit">Enregistrer la démonstration</Bouton>
        </div>
      </form>
      <h2>Publication et preuves</h2>
      <div className="choix-ligne">
        {(['brouillon', 'a_situer', 'prete', 'publiee', 'retiree'] as const).map((etat) => (
          <BadgePublication key={etat} etat={etat} />
        ))}
      </div>
      <div className="choix-ligne">
        <Badge role="terrain">Relevée sur place</Badge>
        <Badge role="photo">Photo contrôlée</Badge>
        <Badge role="direction">Vérifiée par la direction</Badge>
      </div>
      <p className="mention">
        « Publiée » indique le choix de publication. La présence sur le site dépend encore de sa
        mise à jour.
      </p>
      <h2>Fenêtres et actions secondaires</h2>
      <div className="choix-ligne">
        <Bouton variante="secondaire" onClick={() => setFenetre('tiroir')}>
          Gérer l’école fictive
        </Bouton>
        <ActionsSecondaires nom="l’école fictive">
          <Bouton
            variante="discret"
            onClick={() => setAnnonce('Mission de démonstration sélectionnée.')}
          >
            Confier à un relais
          </Bouton>
          <div className="actions-danger">
            <Bouton variante="danger" onClick={() => setFenetre('confirmation')}>
              Retirer l’école fictive
            </Bouton>
          </div>
        </ActionsSecondaires>
      </div>
      {fenetre && (
        <Dialogue
          titre={fenetre === 'tiroir' ? 'Gérer l’école fictive' : 'Confirmer le retrait'}
          variante={fenetre}
          fermer={() => setFenetre(null)}
          entete={
            <>
              <h2>[École fictive]</h2>
              <BadgePublication etat="prete" />
            </>
          }
        >
          {fenetre === 'tiroir' ? (
            <div className="pile">
              <h3>Informations</h3>
              <Champ libelle="Nom de l’école">
                {(a) => <input {...a} className="champ" defaultValue="[École fictive]" />}
              </Champ>
              <p>
                Le panneau prend toute la largeur sur téléphone. Son en-tête reste visible pendant
                le défilement.
              </p>
              <Bouton
                onClick={() => {
                  setFenetre(null);
                  setAnnonce('Démonstration enregistrée.');
                }}
              >
                Enregistrer
              </Bouton>
            </div>
          ) : (
            <div className="pile">
              <p>Cette démonstration ne modifie aucune école.</p>
              <Bouton
                variante="danger"
                onClick={() => {
                  setFenetre(null);
                  setAnnonce('Retrait de démonstration confirmé.');
                }}
              >
                Confirmer le retrait
              </Bouton>
            </div>
          )}
        </Dialogue>
      )}
    </section>
  );
}
