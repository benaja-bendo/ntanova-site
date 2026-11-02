import { useEffect, useId, useState } from 'react';
import { avertissementDeDeconnexion, ceQuiResteSurLeTelephone } from '../../../modele/compte';
import { base, compteConnecte, lireMemoire, useRequete } from '../base-locale';
import { Entete, Navigation } from '../composants';
import { useEnLigne, useRelais } from '../contexte';
import { journaliser } from '../journal';

/**
 * « Compte » : qui est connecté, comment écrire à NTanova, et se déconnecter sans rien perdre. La déconnexion ne touche
 * à aucune fiche : celles qui n'ont pas été reçues restent sur le téléphone, et l'avertissement dit lesquelles.
 */
export function Compte() {
  const { adaptateurs, surDeconnexion, lienNTanova } = useRelais();
  const enLigne = useEnLigne();
  const idTitre = useId();
  const [email, setEmail] = useState<string | null>(null);
  const [demande, setDemande] = useState(false);
  const [echec, setEchec] = useState(false);
  const profil = useRequete(() => lireMemoire('profil'));
  const reste = useRequete(async () =>
    ceQuiResteSurLeTelephone(await base.fiches.toArray(), await compteConnecte()),
  );

  useEffect(() => {
    void adaptateurs.session.utilisateur().then((u) => setEmail(u?.email ?? null));
  }, [adaptateurs]);

  const deconnecter = async () => {
    setEchec(false);
    try {
      await adaptateurs.session.deconnecter();
      surDeconnexion();
    } catch (erreur) {
      setEchec(true);
      void journaliser('deconnexion', 'echec', erreur);
    }
  };

  return (
    <div className="ecran">
      <Entete titre="Compte" principal />
      <main className="contenu-relais">
        <section className="carte-blanche pile-serree" aria-label="Mon compte">
          <p className="surtitre-doux">Connecté</p>
          {profil?.prenom && <span className="intertitre">{profil.prenom}</span>}
          <span className="texte-doux">{email ?? 'Compte Google'}</span>
        </section>

        <section className="carte-blanche pile-serree" aria-label="Aide">
          <p className="surtitre-doux">Besoin d’aide ?</p>
          <p>Une question, un souci avec l’application ou avec une fiche&nbsp;?</p>
          {lienNTanova ? (
            <a
              className="bouton bouton-secondaire"
              href={lienNTanova}
              target="_blank"
              rel="noopener noreferrer"
            >
              Écrire à NTanova sur WhatsApp
            </a>
          ) : (
            <p className="texte-doux">
              Écrivez à NTanova sur WhatsApp, au numéro donné pendant la formation.
            </p>
          )}
        </section>

        {demande && reste ? (
          <section
            className="carte-blanche pile-serree"
            role="alertdialog"
            aria-labelledby={idTitre}
          >
            <h2 id={idTitre} className="intertitre">
              Se déconnecter ?
            </h2>
            {avertissementDeDeconnexion(reste, enLigne).map((phrase) => (
              <p key={phrase}>{phrase}</p>
            ))}
            <button
              type="button"
              className="bouton bouton-secondaire"
              autoFocus
              onClick={() => setDemande(false)}
            >
              Annuler
            </button>
            <button type="button" className="bouton" onClick={() => void deconnecter()}>
              Me déconnecter quand même
            </button>
            {echec && (
              <p className="message-attention" role="status">
                La déconnexion n’a pas abouti. Vos fiches sont toujours sur le téléphone ;
                réessayez.
              </p>
            )}
          </section>
        ) : (
          <button
            type="button"
            className="bouton bouton-secondaire"
            disabled={!reste}
            onClick={() => setDemande(true)}
          >
            Se déconnecter
          </button>
        )}
      </main>
      <Navigation />
    </div>
  );
}
