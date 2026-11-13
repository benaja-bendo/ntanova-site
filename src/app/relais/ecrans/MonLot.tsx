import { useState } from 'react';
import type { Valeur } from '../../../modele/listes';
import { appartientAuCompte, duBrouillon } from '../../../modele/compte';
import { phraseDuBilan } from '../../../modele/envoi';
import { base, compteConnecte, garder, lireMemoire, useRequete } from '../base-locale';
import { jourDuCongo } from '../../../modele/date-declaration';
import { aller, useEnLigne, useRelais } from '../contexte';
import { Bandeau, Champ, Choix, heure, Icone, Navigation, PastilleReseau } from '../composants';
import { BoutonGoogle } from './Connexion';
import { commencerCorrection } from './Ajouter';
import { missionsDeLAccueil, semaineDuRelais } from '../../../modele/accueil-relais';

/**
 * L'état de la file d'envoi, sur l'accueil et dans « Mes fiches ». `calme` : `montrer` (par défaut) dit aussi « Tout est
 * envoyé » ; `cacher` ne dit que ce qui attend ou a échoué (en tête de l'accueil) ; `seul` ne dit que « Tout est envoyé »,
 * quand c'est vrai (en bas de l'accueil, comme sur la planche).
 */
export function EtatEnvoi({ calme = 'montrer' }: { calme?: 'montrer' | 'cacher' | 'seul' } = {}) {
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
    if (calme === 'seul') return null;
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
    return calme === 'seul' ? null : <div className="bandeau-reserve" aria-hidden="true" />;
  }
  if (calme === 'seul' && (enAttente > 0 || refusees > 0)) return null;
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
  if (calme === 'cacher') return null;
  return (
    <Bandeau ton="envoye" icone="coche">
      <p>
        <b>Tout est envoyé.</b> {dernierEnvoi ? `Dernier envoi à ${heure(dernierEnvoi)}.` : ''}
      </p>
    </Bandeau>
  );
}

/**
 * L'accueil (lot H, planche « Relais · Missions ») : le bouton d'abord, puis ce qui attend le relais (ses fiches renvoyées,
 * les missions de NTanova), sa semaine, et « Quoi dire en entrant ». « Mon secteur » est parti (décision du fondateur du
 * 13/11 : on relève partout au Congo-Brazzaville) ; seul le lot d'entraînement se dit encore.
 */
export function Accueil() {
  const profil = useRequete(() => lireMemoire('profil'));
  const lot = useRequete(() => lireMemoire('lot'));
  // La semaine se compte au moment de la lecture (l'heure ne se lit pas pendant le rendu).
  const lecture = useRequete(async () => {
    const r = await lireMemoire('releves');
    return { releves: r, semaine: semaineDuRelais(r ?? [], Date.now()) };
  });
  const releves = lecture?.releves;
  const ecoles = useRequete(() => lireMemoire('aCompleter'));
  const pasPu = useRequete(async () => (await lireMemoire('missionsPasPu')) ?? []);
  const telephone = useRequete(async () => {
    const compte = await compteConnecte();
    const toutes = await base.fiches.toArray();
    return {
      locales: toutes.filter((f) => appartientAuCompte(f, compte)),
      brouillon: duBrouillon(toutes, compte),
    };
  });
  const [avis, setAvis] = useState<string | null>(null);
  const locales = telephone?.locales;
  const brouillon = telephone?.brouillon;
  // Une école dont la contre-visite est déjà sur le téléphone, ou une mission dite « Je n'ai pas pu », n'attend plus.
  const enCours = new Set(
    (locales ?? []).filter((f) => f.type === 'contre_visite').map((f) => f.doublonPropose?.ecoleId),
  );
  const restantes = (ecoles ?? []).filter(
    (e) => !enCours.has(e.id) && !(pasPu ?? []).some((m) => m.missionId === e.missionId),
  );
  const corrigees = new Set(
    (locales ?? []).map((f) => f.corrigeReleveId).filter((x): x is string => !!x),
  );
  const missions = missionsDeLAccueil(releves ?? [], restantes, corrigees, jourDuCongo());
  const semaine = lecture?.semaine ?? { envoyees: 0, acceptees: 0, enAttente: 0 };
  const lu = lecture !== undefined && ecoles !== undefined;

  return (
    <div className="ecran">
      <header className="entete-relais entete-accueil">
        <span className="entete-marque">
          <img src="/favicon.svg" alt="" width={30} height={23} />
          <h1 className="entete-titre" tabIndex={-1} data-retour-liste>
            Bonjour {profil?.prenom || ''}
          </h1>
        </span>
        <span className="entete-gestes">
          <PastilleReseau />
          <a className="bouton-icone" href="#aide/entrer" aria-label="Aide">
            <Icone nom="aide" taille={22} />
          </a>
        </span>
      </header>
      <main className="contenu-relais">
        <EtatEnvoi calme="cacher" />

        {lot?.essai && (
          <Bandeau ton="attente" icone="alerte">
            <p>
              <b>Lot d'entraînement.</b> Vos fiches ne seront pas publiées.
            </p>
          </Bandeau>
        )}

        <button type="button" className="bouton bouton-large" onClick={() => aller('ajouter/1')}>
          <Icone nom="plus" />
          {brouillon ? 'Reprendre la fiche en cours' : 'Ajouter une école'}
        </button>

        <section className="pile-serree missions-accueil" aria-label="Vos missions">
          <h2 className="surtitre-ligne">
            <span>Vos missions</span>
            {lu && <span className="texte-doux">{missions.length} à faire</span>}
          </h2>
          {avis && (
            <p className="message-attention" role="status">
              {avis}
            </p>
          )}
          {lu && missions.length === 0 && (
            <p className="carte-blanche texte-doux">
              Rien n’attend pour l’instant. Ajoutez les écoles que vous croisez, partout au
              Congo-Brazzaville.
            </p>
          )}
          {missions.map((m) =>
            m.genre === 'a_corriger' ? (
              <article key={`c-${m.id}`} className="carte-mission carte-a-corriger">
                <p className="rang">
                  <span className="etiquette etat-a-corriger">{m.etiquette}</span>
                  <b className="carte-mission-nom">{m.nom}</b>
                </p>
                <p>{m.texte}</p>
                <button
                  type="button"
                  className="bouton bouton-secondaire bouton-petit"
                  onClick={() => {
                    const recu = (releves ?? []).find((r) => r.id === m.id);
                    if (!recu) return;
                    void commencerCorrection(recu, releves ?? []).then((issue) =>
                      setAvis(
                        issue === 'brouillon_existant'
                          ? 'Une autre fiche est déjà en cours. Terminez-la ou abandonnez-la d’abord (« Reprendre la fiche en cours »).'
                          : null,
                      ),
                    );
                  }}
                >
                  Corriger la fiche
                </button>
              </article>
            ) : (
              <a key={`m-${m.id}`} className="carte-mission" href={`#mission/${m.id}`}>
                <span className="carte-mission-corps">
                  <span className={`etiquette ${m.enRetard ? 'etat-a-corriger' : 'etat-attente'}`}>
                    {m.etiquette}
                  </span>
                  <b className="carte-mission-nom">{m.nom}</b>
                  <span className="texte-doux">{m.texte}</span>
                </span>
                <Icone nom="suivant" />
              </a>
            ),
          )}
        </section>

        {lu && (
          <section className="carte-blanche pile-serree" aria-label="Cette semaine">
            <h2 className="surtitre-doux">Cette semaine</h2>
            <dl className="semaine-relais">
              <div>
                <dt>envoyées</dt>
                <dd>{semaine.envoyees}</dd>
              </div>
              <div>
                <dt>acceptées</dt>
                <dd>{semaine.acceptees}</dd>
              </div>
              <div>
                <dt>en attente</dt>
                <dd>{semaine.enAttente}</dd>
              </div>
            </dl>
          </section>
        )}

        <EtatEnvoi calme="seul" />

        <a className="ligne-aide" href="#aide/entrer">
          <span>
            <b>Quoi dire en entrant</b>
            <span className="texte-doux">la phrase, et ce qu’on ne fait jamais</span>
          </span>
          <Icone nom="suivant" />
        </a>
      </main>
      <Navigation />
    </div>
  );
}

const MOTIFS: { valeur: Valeur<'mission_blocker'>; libelle: string }[] = [
  { valeur: 'ferme', libelle: 'Fermé' },
  { valeur: 'pas_de_prospectus', libelle: 'Pas de prospectus' },
  { valeur: 'refus', libelle: 'Refus' },
  { valeur: 'autre', libelle: 'Autre' },
];

/**
 * « Je n'ai pas pu » (v2, 13/11) : le motif, une précision pour « Autre », puis la mission se ferme sans paie. Le geste est
 * gardé sur le téléphone et part avec le prochain envoi : il marche hors ligne.
 */
export function PasPu({ missionId, apres }: { missionId: string; apres?: () => void }) {
  const { synchroniser } = useRelais();
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState<Valeur<'mission_blocker'> | null>(null);
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  if (!ouvert)
    return (
      <button type="button" className="lien lien-discret" onClick={() => setOuvert(true)}>
        Je n’ai pas pu
      </button>
    );
  const fermer = async () => {
    if (!motif) return setErreur('Dites ce qui vous a empêché.');
    if (motif === 'autre' && !note.trim()) return setErreur('Précisez « autre » en quelques mots.');
    const file = (await lireMemoire('missionsPasPu')) ?? [];
    await garder('missionsPasPu', [
      ...file.filter((m) => m.missionId !== missionId),
      { missionId, motif, note: note.trim() || null, le: new Date().toISOString() },
    ]);
    synchroniser();
    apres?.();
  };
  return (
    <section className="pile-serree" aria-label="Je n’ai pas pu">
      <Choix
        legende="Qu’est-ce qui vous a empêché ?"
        options={MOTIFS}
        valeurs={motif ? [motif] : []}
        surChoix={(v) => {
          setMotif(v);
          setErreur(null);
        }}
        colonnes={2}
      />
      {motif === 'autre' && (
        <Champ libelle="En quelques mots">
          {(a) => (
            <input
              {...a}
              className="champ"
              type="text"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Champ>
      )}
      {erreur && (
        <p className="message-erreur" role="alert">
          {erreur}
        </p>
      )}
      <p className="mention">La mission se ferme, sans paie. NTanova lit le motif.</p>
      <div className="ligne-boutons">
        <button type="button" className="bouton bouton-petit" onClick={() => void fermer()}>
          Fermer la mission
        </button>
        <button type="button" className="lien" onClick={() => setOuvert(false)}>
          Annuler
        </button>
      </div>
    </section>
  );
}
