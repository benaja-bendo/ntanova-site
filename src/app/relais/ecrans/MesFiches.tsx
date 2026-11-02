import { useState } from 'react';
import { enAlerte, explicationDuRejet, peutEtreModifiee } from '../../../modele/envoi';
import type { FicheLocale } from '../../../modele/fiche';
import type { ReleveRecu } from '../../../modele/ports';
import { libelleFonctionCourt, libelleMotif, libelleStatutReleve } from '../../../modele/libelles';
import {
  modifierLaFiche,
  reessayer,
  retirerDuTelephone,
  type IssueDeLAction,
} from '../actions-fiches';
import { base, lireMemoire, useRequete } from '../base-locale';
import { Entete, jour, Navigation } from '../composants';
import { useRelais } from '../contexte';
import { commencerCorrection } from './Ajouter';
import { EtatEnvoi } from './MonLot';

interface Ligne {
  id: string;
  nom: string;
  date: string;
  fiche: { libelle: string; classe: string };
  contact: { libelle: string; classe: string } | null;
  message: string | null;
  repasser: string | null;
  aCorriger: boolean;
  surTelephone: boolean;
  /** Ce que la base a refusé, quand la fiche attend une décision du relais. */
  refus: { titre: string; detail: string } | null;
  /** Les envois ratés de suite, quand il y en a assez pour prévenir le relais. */
  essaisRates: number | null;
  peutReessayer: boolean;
  peutModifier: boolean;
  peutRetirer: boolean;
}

const classeStatut: Record<ReleveRecu['statut'], string> = {
  a_valider: 'etat-attente',
  a_corriger: 'etat-a-corriger',
  accepte: 'etat-verifiee',
  refuse: 'etat-refusee',
};

/** Ce que le relais peut faire d'une fiche qui est encore dans son téléphone. */
function gestesDe(f: FicheLocale | undefined) {
  if (!f) {
    return {
      refus: null,
      essaisRates: null,
      peutReessayer: false,
      peutModifier: false,
      peutRetirer: false,
    };
  }
  return {
    refus: f.etat === 'refusee' && f.rejet ? explicationDuRejet(f.rejet) : null,
    essaisRates: enAlerte(f) ? (f.essais ?? 0) : null,
    peutReessayer: f.etat === 'refusee',
    peutModifier: peutEtreModifiee(f),
    // Une fiche en file dont le relevé est parti est en cours d'envoi : on la laisse finir.
    peutRetirer: f.etat === 'refusee' || (f.etat === 'a_envoyer' && !f.envoyes.releve),
  };
}

function depuisTelephone(f: FicheLocale): Ligne {
  const partie = f.envoyes.releve;
  const contactAttend = !f.envoyes.contact;
  return {
    id: f.id,
    nom: f.nomEnseigne || 'Fiche sans nom',
    date: f.prisLe ?? f.creeeLe,
    fiche:
      f.etat === 'envoyee'
        ? { libelle: 'Envoyée', classe: 'etat-envoye' }
        : f.etat === 'refusee'
          ? { libelle: 'Refusée', classe: 'etat-refusee' }
          : { libelle: partie ? 'Envoi en cours' : 'Sur le téléphone', classe: 'etat-telephone' },
    contact:
      f.direction === 'absente'
        ? { libelle: 'Absente', classe: 'etat-telephone' }
        : contactAttend
          ? { libelle: 'Sur le téléphone', classe: 'etat-telephone' }
          : { libelle: 'Envoyé', classe: 'etat-envoye' },
    message: null,
    repasser: f.direction === 'absente' && f.repasser ? f.repasser : null,
    aCorriger: false,
    surTelephone: f.etat === 'a_envoyer' || f.etat === 'refusee',
    ...gestesDe(f),
  };
}

/** Une fiche que NTanova a reçue ; `local` est sa copie dans le téléphone, tant qu'elle y reste (photo ou contact). */
function depuisServeur(
  r: ReleveRecu,
  corrigees: Set<string>,
  local: FicheLocale | undefined,
): Ligne {
  const contact = r.contactConfirmeLe
    ? {
        libelle: `Confirmé · ${r.contactFonction ? libelleFonctionCourt[r.contactFonction] : ''}`,
        classe: 'etat-verifiee',
      }
    : r.direction === 'absente'
      ? {
          libelle: `Absente${r.ficheLiaisonRemise ? ' · fiche remise' : ''}`,
          classe: 'etat-attente',
        }
      : r.direction === 'refus'
        ? { libelle: 'Refus', classe: 'etat-refusee' }
        : r.direction === 'vue'
          ? { libelle: 'En attente', classe: 'etat-attente' }
          : null;
  const aCorriger = r.statut === 'a_corriger' && !corrigees.has(r.id);
  // La photo ou le contact refusés : NTanova a la fiche, mais le relais doit voir ce qui n'est pas arrivé.
  const gestes = gestesDe(local?.etat === 'envoyee' ? undefined : local);
  return {
    id: r.id,
    nom: r.nomEnseigne,
    date: r.prisLe,
    fiche:
      r.statut === 'a_corriger' && corrigees.has(r.id)
        ? { libelle: 'Correction envoyée', classe: 'etat-envoye' }
        : { libelle: libelleStatutReleve[r.statut], classe: classeStatut[r.statut] },
    contact,
    message:
      r.statut === 'a_corriger' || r.statut === 'refuse'
        ? (r.messageAuRelais ?? (r.motif ? libelleMotif[r.motif] : null))
        : null,
    repasser: r.direction === 'absente' && r.repasser ? r.repasser : null,
    aCorriger,
    surTelephone: false,
    ...gestes,
  };
}

type Filtre = 'toutes' | 'a_corriger' | 'a_repasser' | 'telephone';

const avisDesGestes: Record<Exclude<IssueDeLAction, 'ok'>, string> = {
  en_cours: "L'envoi de cette fiche est en cours. Réessayez dans un instant.",
  partie: 'Cette fiche vient de partir : NTanova l’a reçue.',
  brouillon_existant:
    'Une autre fiche est déjà en cours. Terminez-la ou abandonnez-la d’abord (« Mon lot », « Reprendre la fiche en cours »).',
};

export function MesFiches() {
  const { synchroniser } = useRelais();
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [avis, setAvis] = useState<string | null>(null);
  const locales = useRequete(() => base.fiches.where('etat').notEqual('brouillon').toArray()) ?? [];
  const recus = useRequete(() => lireMemoire('releves')) ?? [];

  const idsRecus = new Set(recus.map((r) => r.id));
  const localesParId = new Map(locales.map((f) => [f.id, f]));
  const corrigees = new Set(locales.map((f) => f.corrigeReleveId).filter((id) => id !== null));
  const lignes = [
    ...locales.filter((f) => !idsRecus.has(f.id)).map(depuisTelephone),
    ...recus.map((r) => depuisServeur(r, corrigees, localesParId.get(r.id))),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const compte = {
    a_corriger: lignes.filter((l) => l.aCorriger).length,
    a_repasser: lignes.filter((l) => l.repasser).length,
    telephone: lignes.filter((l) => l.surTelephone).length,
  };
  const visibles = lignes.filter((l) =>
    filtre === 'a_corriger'
      ? l.aCorriger
      : filtre === 'a_repasser'
        ? l.repasser
        : filtre === 'telephone'
          ? l.surTelephone
          : true,
  );
  const filtres: { valeur: Filtre; libelle: string }[] = [
    { valeur: 'toutes', libelle: 'Toutes' },
    { valeur: 'a_corriger', libelle: `À corriger · ${compte.a_corriger}` },
    { valeur: 'a_repasser', libelle: `À repasser · ${compte.a_repasser}` },
    { valeur: 'telephone', libelle: `Sur le téléphone · ${compte.telephone}` },
  ];

  const apres = (issue: IssueDeLAction) => setAvis(issue === 'ok' ? null : avisDesGestes[issue]);

  const relancer = async (id: string) => {
    const issue = await reessayer(id);
    apres(issue);
    if (issue === 'ok') synchroniser();
  };

  const retirer = async (l: Ligne) => {
    const local = localesParId.get(l.id);
    const dejaChezNTanova = local?.envoyes.releve ?? false;
    const question = dejaChezNTanova
      ? 'Retirer cette fiche du téléphone ? NTanova a déjà reçu la fiche : seuls les éléments encore sur le téléphone (photos, contact) seront effacés.'
      : 'Retirer cette fiche du téléphone ? Elle n’a pas été envoyée : elle sera perdue.';
    if (!confirm(question)) return;
    apres(await retirerDuTelephone(l.id));
  };

  return (
    <div className="ecran">
      <Entete titre="Mes fiches" principal />
      <main className="contenu-relais">
        <EtatEnvoi />
        <div className="filtres" role="group" aria-label="Filtrer les fiches">
          {filtres.map((f) => (
            <button
              key={f.valeur}
              type="button"
              className="pastille-choix"
              aria-pressed={filtre === f.valeur}
              onClick={() => setFiltre(f.valeur)}
            >
              {f.libelle}
            </button>
          ))}
        </div>

        {avis && (
          <p className="message-attention" role="status">
            {avis}
          </p>
        )}

        {visibles.length === 0 && (
          <p className="texte-doux">
            {lignes.length === 0 ? 'Aucune fiche pour le moment.' : 'Aucune fiche ici.'}
          </p>
        )}

        {visibles.map((l) => (
          <article key={l.id} className="carte-blanche fiche-relais">
            <div className="fiche-relais-tete">
              <h2>{l.nom}</h2>
              <span className="mention">{jour(l.date)}</span>
            </div>
            <dl className="fiche-relais-etats">
              <dt>Fiche</dt>
              <dd>
                <span className={`etiquette ${l.fiche.classe}`}>{l.fiche.libelle}</span>
              </dd>
              {l.contact && (
                <>
                  <dt>Contact</dt>
                  <dd>
                    <span className={`etiquette ${l.contact.classe}`}>{l.contact.libelle}</span>
                  </dd>
                </>
              )}
            </dl>
            {l.message && (
              <p className="message-ntanova">
                <b>NTanova&nbsp;:</b> {l.message}
              </p>
            )}
            {l.refus && (
              <p className="message-erreur" role="alert">
                <b>{l.refus.titre}</b> {l.refus.detail}
              </p>
            )}
            {l.essaisRates !== null && (
              <p className="message-attention">
                L'envoi a échoué {l.essaisRates} fois de suite. Prévenez NTanova si cela continue.
              </p>
            )}
            {l.repasser && <p className="mention">À repasser&nbsp;: {l.repasser}</p>}
            {(l.aCorriger || l.peutReessayer || l.peutModifier || l.peutRetirer) && (
              <div className="fiche-relais-actions">
                {l.aCorriger && (
                  <button
                    type="button"
                    className="bouton bouton-petit"
                    onClick={() => void commencerCorrection(l.id, l.nom)}
                  >
                    Corriger la fiche
                  </button>
                )}
                {l.peutReessayer && (
                  <button
                    type="button"
                    className="bouton bouton-petit"
                    onClick={() => void relancer(l.id)}
                  >
                    Réessayer
                  </button>
                )}
                {l.peutModifier && (
                  <button
                    type="button"
                    className="bouton bouton-secondaire bouton-petit"
                    onClick={() => void modifierLaFiche(l.id).then(apres)}
                  >
                    Modifier
                  </button>
                )}
                {l.peutRetirer && (
                  <button
                    type="button"
                    className="lien lien-discret"
                    onClick={() => void retirer(l)}
                  >
                    Retirer du téléphone
                  </button>
                )}
              </div>
            )}
          </article>
        ))}

        <p className="mention">
          Une fois envoyés, les contacts de la direction ne s'affichent plus ici&nbsp;: seul NTanova
          les voit.
        </p>
      </main>
      <Navigation />
    </div>
  );
}
