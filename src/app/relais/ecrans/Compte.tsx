import { useEffect, useId, useState } from 'react';
import {
  lireNumeroDePaie,
  libelleOperateur,
  OPERATEURS,
  type NumeroDePaie as NumeroDePaieLu,
  type OperateurMobileMoney,
} from '../../../modele/numero-de-paie';
import { bilanDesTests } from '../../../modele/premiers-pas';
import { afficherTelephone } from '../../../modele/telephone';
import { avertissementDeDeconnexion, ceQuiResteSurLeTelephone } from '../../../modele/compte';
import { base, compteConnecte, lireMemoire, useRequete } from '../base-locale';
import { Champ, Choix, Entete, Icone, Navigation } from '../composants';
import { aller, useEnLigne, useRelais } from '../contexte';
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
        <section className="carte-blanche compte-identite" aria-label="Mon compte">
          <span className="compte-rond" aria-hidden="true">
            {((profil?.prenom ?? '').replace(/^[^\p{L}]+/u, '').charAt(0) || '?').toUpperCase()}
          </span>
          <span className="pile-serree">
            {profil?.prenom && <span className="intertitre">{profil.prenom}</span>}
            <span className="texte-doux">Compte Google · {email ?? 'connecté'}</span>
          </span>
        </section>

        <NumeroDePaie />

        <MonTelephone />

        <section className="carte-blanche pile-serree" aria-label="Aide">
          <h2 className="surtitre-doux">Aide</h2>
          <nav className="liste-liens" aria-label="Aide du relais">
            <a href="#aide/entrer">
              <span>
                <b>Quoi dire en entrant</b>
                <span className="texte-doux">la phrase, et ce qu’on ne fait jamais</span>
              </span>
              <Icone nom="suivant" />
            </a>
            <a href="#aide/regles">
              <span>
                <b>Les règles du relais</b>
                <span className="texte-doux">photos, accord, ce qui ne se publie pas</span>
              </span>
              <Icone nom="suivant" />
            </a>
            <a href="#aide/paie">
              <span>
                <b>Comment je suis payé</b>
                <span className="texte-doux">ce qui compte, quand, sur quel numéro</span>
              </span>
              <Icone nom="suivant" />
            </a>
            <a href="/relais/guide/">
              <span>
                <b>Lire le guide du relais</b>
                <span className="texte-doux">tout le guide, en une page</span>
              </span>
              <Icone nom="suivant" />
            </a>
          </nav>
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

/**
 * « Pour recevoir la paie » (lot H) : l'opérateur et le numéro Mobile Money, rangés dans la partie privée de la base. Ils se
 * lisent et se changent seulement avec le réseau : hors ligne, l'écran le dit.
 */
function NumeroDePaie() {
  const { adaptateurs } = useRelais();
  const enLigne = useEnLigne();
  const [lu, setLu] = useState<NumeroDePaieLu | null | undefined>(undefined);
  const [echecLecture, setEchecLecture] = useState(false);
  const [edition, setEdition] = useState(false);
  const [operateur, setOperateur] = useState<OperateurMobileMoney | null>(null);
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [annonce, setAnnonce] = useState<string | null>(null);

  useEffect(() => {
    if (!enLigne) return;
    let vivant = true;
    adaptateurs.relais
      .monNumeroDePaie()
      .then((n) => {
        if (!vivant) return;
        setLu(n);
        setEchecLecture(false);
      })
      .catch(() => vivant && setEchecLecture(true));
    return () => {
      vivant = false;
    };
  }, [adaptateurs, enLigne]);

  const ouvrir = () => {
    setOperateur(lu?.operateur ?? null);
    setSaisie(lu ? afficherTelephone(lu.numero) : '');
    setErreur(null);
    setAnnonce(null);
    setEdition(true);
  };
  const enregistrer = async () => {
    const r = lireNumeroDePaie(operateur, saisie);
    if (!r.ok) return setErreur(r.erreur);
    setEnCours(true);
    setErreur(null);
    try {
      await adaptateurs.relais.enregistrerMonNumeroDePaie(operateur!, r.numero);
      setLu({ operateur: operateur!, numero: r.numero, majLe: new Date().toISOString() });
      setEdition(false);
      setAnnonce('Numéro enregistré. NTanova paiera sur ce numéro.');
    } catch {
      setErreur('Le numéro n’a pas pu être enregistré. Vérifiez le réseau et réessayez.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section className="carte-blanche pile-serree" aria-label="Pour recevoir la paie">
      <h2 className="surtitre-ligne">
        <span>Pour recevoir la paie</span>
        {!edition && enLigne && lu !== undefined && (
          <button type="button" className="lien" onClick={ouvrir}>
            {lu ? 'Modifier' : 'Ajouter'}
          </button>
        )}
      </h2>
      {annonce && (
        <p className="bandeau bandeau-envoye" role="status">
          {annonce}
        </p>
      )}
      {!enLigne && !edition ? (
        <p className="texte-doux">Votre numéro se lit quand le téléphone capte.</p>
      ) : echecLecture ? (
        <p className="message-attention">Le numéro n’a pas pu être lu. Réessayez plus tard.</p>
      ) : lu === undefined ? (
        <p className="texte-doux" aria-busy="true">
          Lecture…
        </p>
      ) : edition ? (
        <form
          className="pile-serree"
          noValidate
          onSubmit={(ev) => {
            ev.preventDefault();
            void enregistrer();
          }}
        >
          <Choix
            legende="Mobile Money"
            options={OPERATEURS}
            valeurs={operateur ? [operateur] : []}
            surChoix={(v) => {
              setOperateur(v);
              setErreur(null);
            }}
            colonnes={3}
          />
          <Champ libelle="Numéro">
            {(a) => (
              <input
                {...a}
                className="champ"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="06 123 45 67"
                value={saisie}
                onChange={(e) => {
                  setSaisie(e.target.value);
                  setErreur(null);
                }}
              />
            )}
          </Champ>
          {erreur && (
            <p className="message-erreur" role="alert">
              {erreur}
            </p>
          )}
          <div className="ligne-boutons">
            <button type="submit" className="bouton" disabled={enCours || !enLigne}>
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" className="lien" onClick={() => setEdition(false)}>
              Annuler
            </button>
          </div>
        </form>
      ) : lu ? (
        <dl className="paie-numero">
          <div>
            <dt>Mobile Money</dt>
            <dd>{libelleOperateur(lu.operateur)}</dd>
          </div>
          <div>
            <dt>Numéro</dt>
            <dd>{afficherTelephone(lu.numero)}</dd>
          </div>
        </dl>
      ) : (
        <p>Aucun numéro enregistré. Ajoutez-le pour que NTanova puisse vous payer.</p>
      )}
    </section>
  );
}

/**
 * « Mon téléphone est prêt » (lot H) : les trois tests de « Tester mon téléphone » (position, photo, réseau), sur une ligne.
 * Le test de la photo vérifie aussi le stockage : la photo est rangée dans le téléphone puis relue. Si un test a échoué, le
 * titre dit lequel.
 */
function MonTelephone() {
  const tests = useRequete(async () => (await lireMemoire('testsDuTelephone')) ?? null);
  if (tests === undefined) return null;
  const bilan = bilanDesTests(tests);
  return (
    <section className="carte-blanche pile-serree" aria-label="Mon téléphone">
      <h2 className={`surtitre-ligne${bilan.echec ? ' titre-echec' : ''}`}>
        <span>{bilan.titre}</span>
        <button type="button" className="lien" onClick={() => aller('premiers-pas')}>
          {tests ? 'Refaire' : 'Tester'}
        </button>
      </h2>
      <ul className="tests-telephone">
        {bilan.lignes.map((l) => (
          <li key={l.libelle} className={l.etat}>
            <Icone
              nom={l.etat === 'bon' ? 'coche' : l.etat === 'mauvais' ? 'alerte' : 'horloge'}
              taille={16}
            />
            {l.libelle}
          </li>
        ))}
      </ul>
    </section>
  );
}
