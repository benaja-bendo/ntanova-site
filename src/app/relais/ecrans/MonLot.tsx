import { useState } from 'react';
import type { Valeur } from '../../../modele/listes';
import { appartientAuCompte, duBrouillon } from '../../../modele/compte';
import { phraseDuBilan } from '../../../modele/envoi';
import { base, compteConnecte, lireMemoire, useRequete } from '../base-locale';
import { aller, useEnLigne, useRelais } from '../contexte';
import { Bandeau, Entete, heure, Icone, Navigation } from '../composants';
import { BoutonGoogle } from './Connexion';
import { commencerContreVisite } from './Ajouter';

/** L'état de la file d'envoi, en tête de « Mon secteur » et de « Mes fiches ». */
export function EtatEnvoi() {
  const { envoi, bilan, synchroniser } = useRelais();
  const enLigne = useEnLigne();
  // Tant que le téléphone n'a pas compté les fiches en attente, on ne dit rien :
  // « Tout est envoyé » ne s'affiche jamais avant d'être vrai.
  // Les fiches de ce compte seulement : celles d'un autre relais, qui s'est servi du téléphone, ne comptent pas ici.
  const duCompte = async (etat: 'a_envoyer' | 'refusee') => {
    const compte = await compteConnecte();
    return (await base.fiches.where('etat').equals(etat).toArray()).filter((f) =>
      appartientAuCompte(f, compte),
    ).length;
  };
  const enAttente = useRequete(() => duCompte('a_envoyer'));
  // Les fiches que la base a refusées : sorties de la file, elles attendent une décision du relais.
  const refusees = useRequete(() => duCompte('refusee'));
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
  if (enAttente === undefined || refusees === undefined) {
    return <div className="bandeau-reserve" aria-hidden="true" />;
  }
  const refus =
    refusees > 0 ? (
      <Bandeau ton="erreur" icone="alerte">
        <p>
          <b>
            {refusees} fiche{refusees > 1 ? 's' : ''} n'{refusees > 1 ? 'ont' : 'a'} pas pu être
            envoyée{refusees > 1 ? 's' : ''}.
          </b>{' '}
          La raison est dans «&nbsp;Mes fiches&nbsp;».
        </p>
      </Bandeau>
    ) : null;
  if (enAttente > 0) {
    const pluriel = enAttente > 1;
    // Ce que le dernier essai a fait, dit au relais : fiches parties, ou ce qui n'a pas pu partir (ticket #74).
    const phrase = bilan ? phraseDuBilan(bilan, heure(bilan.le)) : null;
    const enCoursDEnvoi = envoi === 'en_cours';
    return (
      <>
        {refus}
        <Bandeau
          ton={(envoi === 'erreur' && enLigne) || phrase?.ton === 'echec' ? 'erreur' : 'attente'}
          icone="nuage"
        >
          <p>
            <b>
              {enAttente} fiche{pluriel ? 's' : ''} attend{pluriel ? 'ent' : ''}{' '}
              {enLigne ? "d'être envoyée" + (pluriel ? 's' : '') : 'le réseau'}.
            </b>{' '}
            {enLigne
              ? envoi === 'erreur' && !phrase
                ? 'Un envoi a échoué ; il sera repris.'
                : ''
              : pluriel
                ? 'Elles partiront seules dès que le téléphone capte.'
                : 'Elle partira seule dès que le téléphone capte.'}
          </p>
          {enLigne && enCoursDEnvoi && (
            <p className="rang" role="status">
              <span className="roue" aria-hidden="true" />
              Envoi en cours…
            </p>
          )}
          {enLigne && !enCoursDEnvoi && phrase && <p role="status">{phrase.texte}</p>}
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
      </>
    );
  }
  // Une fiche refusée n'est pas envoyée : « Tout est envoyé » ne s'affiche pas tant qu'il y en a une.
  if (refus) return refus;
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
  const zones = useRequete(() => lireMemoire('zones')) ?? [];
  const releves = useRequete(() => lireMemoire('releves')) ?? [];
  // `null` : les premiers pas ne sont pas faits ; `undefined` : la lecture n'est pas finie (la carte ne clignote pas).
  const premiersPas = useRequete(async () => (await lireMemoire('premiersPas')) ?? null);
  const brouillon = useRequete(async () => {
    const compte = await compteConnecte();
    return duBrouillon(await base.fiches.where('etat').equals('brouillon').toArray(), compte);
  });

  return (
    <div className="ecran">
      <Entete titre="Espace relais" />
      <main className="contenu-relais">
        <h1 className="titre-ecran">Bonjour {profil?.prenom || ''}</h1>
        <EtatEnvoi />

        {premiersPas === null && (
          <section className="carte-blanche pile-serree" aria-label="Premiers pas">
            <p className="surtitre-doux">Premiers pas</p>
            <p>
              Avant votre première fiche, deux minutes pour vérifier la position, la photo et la
              connexion de votre téléphone. Rien n’est envoyé, et c’est facultatif.
            </p>
            <button
              type="button"
              className="bouton bouton-secondaire"
              onClick={() => aller('premiers-pas')}
            >
              Tester mon téléphone
            </button>
          </section>
        )}

        <section className="carte-blanche pile-serree" aria-label="Mon secteur">
          <p className="surtitre-doux">
            Mon secteur
            {lot?.aRendreLe ? ` · à rendre le ${lot.aRendreLe.split('-').reverse().join('/')}` : ''}
          </p>
          <span className="intertitre">{lot ? lot.nom : 'Pas de secteur conseillé'}</span>
          <span className="texte-doux">
            {releves.length} fiche{releves.length > 1 ? 's' : ''} reçue
            {releves.length > 1 ? 's' : ''} par NTanova
          </span>
          {lot ? (
            !lot.essai && (
              <span className="texte-doux">
                Ce secteur est un conseil, pas une limite&nbsp;: une école que vous croisez ailleurs
                se relève aussi.
              </span>
            )
          ) : (
            <span className="texte-doux">
              Relevez les écoles là où vous êtes
              {zones.length > 0 ? `. Zones ouvertes : ${zones.join(', ')}` : ''}.
            </span>
          )}
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
            «&nbsp;Bonjour. Nous relevons les écoles du quartier pour un annuaire en ligne destiné
            aux familles. Nous venons de relever votre école, avec ce qui se voit de la rue. Pour
            que sa fiche soit juste et que l'établissement puisse la corriger si besoin, nous
            voulons la faire valider par la direction&nbsp;: à qui pouvons-nous nous
            adresser&nbsp;?&nbsp;»
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
 * Les écoles que NTanova confie au relais : déjà enregistrées, à vérifier, à situer ou à compléter sur place.
 * Une école dont la contre-visite est déjà sur le téléphone n'y figure plus.
 */
const consigne: Record<Valeur<'mission_kind'>, string> = {
  verify:
    'Passez vérifier cette école sur place : le nom écrit, le repère, la photo de l’enseigne.',
  locate: 'Passez la situer : photo, position de l’entrée, et ce qui manque.',
  complete: 'Passez compléter sa fiche : ce qui manque, les séries ou filières, une photo.',
};

function ACompleter() {
  const [avis, setAvis] = useState<string | null>(null);
  const ecoles = useRequete(() => lireMemoire('aCompleter')) ?? [];
  const enCours = useRequete(async () => {
    const compte = await compteConnecte();
    return (await base.fiches.where('type').equals('contre_visite').toArray())
      .filter((f) => appartientAuCompte(f, compte))
      .map((f) => f.doublonPropose?.ecoleId);
  });
  const restantes = ecoles.filter((e) => !enCours?.includes(e.id));
  if (restantes.length === 0) return null;
  return (
    <section className="carte-blanche pile-serree" aria-label="À compléter">
      <p className="surtitre">À compléter · {restantes.length}</p>
      <p className="mention">
        NTanova connaît déjà ces écoles. Passez-les voir : on vous dit pour chacune ce qu’il faut
        faire.
      </p>
      {avis && (
        <p className="message-attention" role="status">
          {avis}
        </p>
      )}
      {restantes.map((e) => (
        <div key={e.id} className="a-completer">
          <div>
            <b>{e.nom}</b>
            {e.etiquette && <span className="mention a-completer-ligne">{e.etiquette}</span>}
            <span className="mention a-completer-ligne">
              {[e.quartier, e.repere].filter(Boolean).join(' · ') || 'Quartier inconnu'}
            </span>
            <span className="mention a-completer-ligne">{consigne[e.genre]}</span>
            {e.note && <span className="mention a-completer-ligne">À vérifier : {e.note}</span>}
          </div>
          <button
            type="button"
            className="bouton bouton-secondaire bouton-petit"
            onClick={() =>
              void commencerContreVisite(e).then((issue) =>
                setAvis(
                  issue === 'ok'
                    ? null
                    : 'Une autre fiche est déjà en cours. Terminez-la ou abandonnez-la d’abord (« Reprendre la fiche en cours »).',
                ),
              )
            }
          >
            Compléter
          </button>
        </div>
      ))}
    </section>
  );
}
