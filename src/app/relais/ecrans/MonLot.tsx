import { base, lireMemoire, useRequete } from '../base-locale';
import { aller, useEnLigne, useRelais } from '../contexte';
import { Bandeau, Entete, heure, Icone, Navigation } from '../composants';
import { BoutonGoogle } from './Connexion';
import { commencerContreVisite } from './Ajouter';

/** L'état de la file d'envoi, en tête de « Mon lot » et de « Mes fiches ». */
export function EtatEnvoi() {
  const { envoi, synchroniser } = useRelais();
  const enLigne = useEnLigne();
  // Tant que le téléphone n'a pas compté les fiches en attente, on ne dit rien :
  // « Tout est envoyé » ne s'affiche jamais avant d'être vrai.
  const enAttente = useRequete(() => base.fiches.where('etat').equals('a_envoyer').count());
  const dernierEnvoi = useRequete(() => lireMemoire('dernierEnvoi'));

  if (envoi === 'reconnecter') {
    return (
      <Bandeau ton="erreur" icone="cadenas">
        <p>
          <b>Votre session a expiré.</b> Reconnectez-vous pour envoyer vos fiches&nbsp;: elles
          restent sur le téléphone.
        </p>
        <BoutonGoogle />
      </Bandeau>
    );
  }
  if (enAttente === undefined) return <div className="bandeau-reserve" aria-hidden="true" />;
  if (enAttente > 0) {
    const pluriel = enAttente > 1;
    return (
      <Bandeau ton={envoi === 'erreur' && enLigne ? 'erreur' : 'attente'} icone="nuage">
        <p>
          <b>
            {enAttente} fiche{pluriel ? 's' : ''} attend{pluriel ? 'ent' : ''}{' '}
            {enLigne ? "d'être envoyée" + (pluriel ? 's' : '') : 'le réseau'}.
          </b>{' '}
          {enLigne
            ? envoi === 'erreur'
              ? 'Un envoi a échoué ; il sera repris.'
              : ''
            : pluriel
              ? 'Elles partiront seules dès que le téléphone capte.'
              : 'Elle partira seule dès que le téléphone capte.'}
        </p>
        {enLigne && (
          <button
            type="button"
            className="bouton bouton-secondaire bouton-petit"
            onClick={synchroniser}
            disabled={envoi === 'en_cours'}
          >
            {envoi === 'en_cours' ? 'Envoi…' : 'Envoyer maintenant'}
          </button>
        )}
      </Bandeau>
    );
  }
  return (
    <Bandeau ton="envoye" icone="coche">
      <p>
        <b>Tout est envoyé.</b> {dernierEnvoi ? `Dernier envoi à ${heure(dernierEnvoi)}.` : ''}
      </p>
    </Bandeau>
  );
}

export function MonLot() {
  const profil = useRequete(() => lireMemoire('profil'));
  const lot = useRequete(() => lireMemoire('lot'));
  const releves = useRequete(() => lireMemoire('releves')) ?? [];
  const brouillon = useRequete(() => lireMemoire('brouillon'));
  const quartier = lot && !lot.essai ? lot.nom : 'Pointe-Noire';

  return (
    <div className="ecran">
      <Entete titre="Espace relais" />
      <main className="contenu-relais">
        <h1 className="titre-ecran">Bonjour {profil?.prenom || ''}</h1>
        <EtatEnvoi />

        <section className="carte-blanche pile-serree" aria-label="Mon lot">
          <p className="surtitre-doux">
            Mon lot
            {lot?.aRendreLe ? ` · à rendre le ${lot.aRendreLe.split('-').reverse().join('/')}` : ''}
          </p>
          <span className="intertitre">{lot ? lot.nom : 'Aucun lot pour le moment'}</span>
          <span className="texte-doux">
            {releves.length} fiche{releves.length > 1 ? 's' : ''} reçue
            {releves.length > 1 ? 's' : ''} par NTanova
          </span>
        </section>

        {lot?.essai && (
          <Bandeau ton="attente" icone="alerte">
            <p>
              <b>Lot d'entraînement.</b> Vos fiches ne seront pas publiées.
            </p>
          </Bandeau>
        )}

        <ACompleter />

        <button type="button" className="bouton bouton-large" onClick={() => aller('ajouter/1')}>
          <Icone nom="plus" />
          {brouillon ? 'Reprendre la fiche en cours' : 'Ajouter une école'}
        </button>

        <section className="carte-blanche pile-serree" aria-label="À dire en entrant">
          <p className="surtitre">À dire en entrant</p>
          <p>
            «&nbsp;Bonjour. Nous recensons les écoles de {quartier} pour un annuaire en ligne qui
            démarre. Nous venons de relever votre école, avec ce qui se voit de la rue. Pour que sa
            fiche soit juste, nous voulons la faire valider par la direction&nbsp;: à qui
            pouvons-nous nous adresser&nbsp;?&nbsp;»
          </p>
          <p className="interdits">
            <b>Jamais&nbsp;:</b> se dire parent, dire que le site est déjà connu, promettre quelque
            chose, photographier un enfant.
          </p>
        </section>
      </main>
      <Navigation />
    </div>
  );
}

/**
 * Les écoles que NTanova confie au relais : connues, mais pas encore situées.
 * Une école dont la contre-visite est déjà sur le téléphone n'y figure plus.
 */
function ACompleter() {
  const ecoles = useRequete(() => lireMemoire('aCompleter')) ?? [];
  const enCours = useRequete(async () =>
    (await base.fiches.where('type').equals('contre_visite').toArray()).map(
      (f) => f.doublonPropose?.ecoleId,
    ),
  );
  const restantes = ecoles.filter((e) => !enCours?.includes(e.id));
  if (restantes.length === 0) return null;
  return (
    <section className="carte-blanche pile-serree" aria-label="À compléter">
      <p className="surtitre">À compléter · {restantes.length}</p>
      <p className="mention">
        NTanova connaît ces écoles sans savoir où elles sont. Passez les relever : photo, position,
        et ce qui manque.
      </p>
      {restantes.map((e) => (
        <div key={e.id} className="a-completer">
          <div>
            <b>{e.nom}</b>
            <span className="mention a-completer-ligne">
              {[e.quartier, e.repere].filter(Boolean).join(' · ') || 'Quartier inconnu'}
            </span>
            {e.note && <span className="mention a-completer-ligne">À vérifier : {e.note}</span>}
          </div>
          <button
            type="button"
            className="bouton bouton-secondaire bouton-petit"
            onClick={() => void commencerContreVisite(e)}
          >
            Compléter
          </button>
        </div>
      ))}
    </section>
  );
}
