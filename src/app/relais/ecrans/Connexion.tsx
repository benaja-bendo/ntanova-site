import { BoutonGoogle as BoutonCommun } from '../../commun/BoutonGoogle';
import { useRelais } from '../contexte';
import { Icone } from '../composants';
import { journaliser } from '../journal';

/** Le bouton de connexion de l'espace relais. */
export function BoutonGoogle() {
  const { adaptateurs, surConnexion } = useRelais();
  return (
    <BoutonCommun
      session={adaptateurs.session}
      faux={adaptateurs.nom === 'faux'}
      surConnexion={surConnexion}
      surErreur={(code, e) => void journaliser('connexion', code, e)}
      horsLigne="La connexion demande du réseau. Elle se fait une fois ; ensuite, le relevé marche hors ligne."
    />
  );
}

export function Connexion() {
  return (
    <div className="ecran ecran-accueil">
      <main className="accueil">
        <div className="accueil-marque">
          <img src="/favicon.svg" alt="" width={48} height={37} />
          <span>NTanova</span>
        </div>
        <div className="pile-serree">
          <p className="surtitre">Espace relais</p>
          <h1>Relever les écoles de son quartier.</h1>
          <p className="texte-doux">
            Pour les jeunes qui travaillent avec NTanova, à Tié-Tié et à Ngoyo.
          </p>
        </div>
        <BoutonGoogle />
        <p className="mention centre">
          La première connexion demande du réseau. Ensuite, le relevé marche hors ligne.
        </p>
        <div className="carte-blanche rang">
          <Icone nom="cadenas" />
          <p>
            Votre compte est activé par NTanova après la formation.{' '}
            <b>Un compte par personne&nbsp;: ne le prêtez pas.</b>
          </p>
        </div>
      </main>
      <footer className="pied-relais">
        <a href="/">Vous n'êtes pas relais&nbsp;? Aller sur le site</a>
      </footer>
    </div>
  );
}

export function CompteEnAttente({ email, suspendu }: { email: string | null; suspendu: boolean }) {
  const { adaptateurs, synchroniser } = useRelais();
  const changer = async () => {
    await adaptateurs.session.deconnecter();
    location.reload();
  };
  return (
    <div className="ecran ecran-accueil">
      <main className="accueil">
        <div className="accueil-marque">
          <img src="/favicon.svg" alt="" width={48} height={37} />
          <span>NTanova</span>
        </div>
        <div className="pile-serree">
          <p className="surtitre">Espace relais</p>
          <h1>Relever les écoles de son quartier.</h1>
        </div>
        <div className="bandeau bandeau-attente">
          <Icone nom="horloge" taille={22} />
          <div>
            <p className="bandeau-titre">{suspendu ? 'Compte suspendu' : 'Compte en attente'}</p>
            <p>
              {suspendu
                ? 'Écrivez à NTanova sur WhatsApp pour en savoir plus.'
                : "NTanova l'active après votre formation. Nous vous prévenons sur WhatsApp."}
            </p>
          </div>
        </div>
        <button type="button" className="bouton bouton-secondaire" onClick={synchroniser}>
          Vérifier à nouveau
        </button>
        <p className="mention">
          Connecté avec {email ?? 'votre compte Google'}. Ce n'est pas vous&nbsp;?{' '}
          <button type="button" className="lien" onClick={() => void changer()}>
            Changer de compte
          </button>
        </p>
      </main>
    </div>
  );
}

/** Le compte est connu, mais le téléphone n'en a encore rien lu : l'écran ne reste jamais blanc. */
export function Ouverture() {
  return (
    <div className="ecran ecran-accueil" aria-busy="true">
      <main className="accueil">
        <p className="texte-doux centre" role="status">
          Ouverture de votre espace…
        </p>
      </main>
    </div>
  );
}

/**
 * La lecture du compte est refusée et le téléphone n'en garde aucun : sans cet écran, rien ne s'affiche et rien ne
 * se passe. « Réessayer » recharge l'application : un téléphone resté sur une ancienne version relirait, sinon, la
 * même erreur ; rechargé, il prend la version qui l'attend.
 */
export function LectureImpossible() {
  return (
    <div className="ecran ecran-accueil">
      <main className="accueil">
        <h1>Votre espace ne s’ouvre pas</h1>
        <p>
          NTanova n’a pas pu lire votre compte pour le moment. Vos fiches restent sur le téléphone.
          Réessayez&nbsp;; si cela continue, prévenez NTanova.
        </p>
        <button type="button" className="bouton" onClick={() => location.reload()}>
          Réessayer
        </button>
      </main>
    </div>
  );
}

export function PremiereConnexionHorsLigne() {
  return (
    <div className="ecran ecran-accueil">
      <main className="accueil">
        <h1>Pas de réseau</h1>
        <p>
          La première ouverture demande du réseau, pour charger votre secteur et les écoles déjà
          connues. Ensuite, le relevé marche hors ligne.
        </p>
        <button type="button" className="bouton" onClick={() => location.reload()}>
          Réessayer
        </button>
      </main>
    </div>
  );
}
