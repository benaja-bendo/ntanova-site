import { useState } from 'react';
import type { FicheLocale } from '../../../modele/fiche';
import type { ReleveRecu } from '../../../modele/ports';
import { libelleFonctionCourt, libelleMotif, libelleStatutReleve } from '../../../modele/libelles';
import { base, lireMemoire, useRequete } from '../base-locale';
import { Entete, jour, Navigation } from '../composants';
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
}

const classeStatut: Record<ReleveRecu['statut'], string> = {
  a_valider: 'etat-attente',
  a_corriger: 'etat-a-corriger',
  accepte: 'etat-verifiee',
  refuse: 'etat-refusee',
};

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
    surTelephone: f.etat === 'a_envoyer',
  };
}

function depuisServeur(r: ReleveRecu, corrigees: Set<string>): Ligne {
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
  };
}

type Filtre = 'toutes' | 'a_corriger' | 'a_repasser' | 'telephone';

export function MesFiches() {
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const locales = useRequete(() => base.fiches.where('etat').notEqual('brouillon').toArray()) ?? [];
  const recus = useRequete(() => lireMemoire('releves')) ?? [];

  const idsRecus = new Set(recus.map((r) => r.id));
  const corrigees = new Set(locales.map((f) => f.corrigeReleveId).filter((id) => id !== null));
  const lignes = [
    ...locales.filter((f) => !idsRecus.has(f.id)).map(depuisTelephone),
    ...recus.map((r) => depuisServeur(r, corrigees)),
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
            {l.repasser && <p className="mention">À repasser&nbsp;: {l.repasser}</p>}
            {l.aCorriger && (
              <button
                type="button"
                className="bouton bouton-petit"
                onClick={() => void commencerCorrection(l.id, l.nom)}
              >
                Corriger la fiche
              </button>
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
