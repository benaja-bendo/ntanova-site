/**
 * « Une de mes fiches » (lot F du ticket 165, canevas « Espace relais ») : ce que le relais lit quand il ouvre une de ses
 * fiches. Où elle en est (envoyée, acceptée, en ligne) ; la raison de NTanova en cas de refus ou de correction ; « Voir la
 * page de l'école » quand elle est en ligne ; ce qui vient de son relevé ; ce qui manque encore ; ce qu'elle rapporte. Tout
 * vient de ce que le téléphone garde : l'écran marche hors ligne.
 */
import { appartientAuCompte } from '../../../modele/compte';
import { libelleStatutReleve } from '../../../modele/libelles';
import {
  ceQuiManqueEncore,
  ceQuiVientDuReleve,
  etapesDeLaFiche,
  raisonDeNTanova,
} from '../../../modele/ma-fiche';
import { francs, paieDeLaFiche, vendrediLong } from '../../../modele/paie';
import { base, compteConnecte, lireMemoire, useRequete } from '../base-locale';
import { Entete, Icone, jour, Navigation } from '../composants';
import { commencerCorrection } from './Ajouter';
import { useState } from 'react';

const classeEtape = {
  faite: 'etape-faite',
  en_cours: 'etape-en-cours',
  a_venir: 'etape-a-venir',
  arretee: 'etape-arretee',
} as const;

export function UneFiche({ releveId }: { releveId: string }) {
  const recus = useRequete(() => lireMemoire('releves'));
  const paie = useRequete(async () => (await lireMemoire('paie')) ?? null);
  // Ses fiches dans le téléphone : celle-ci tant qu'elle n'est pas partie, et une correction qui en serait déjà partie.
  const locales = useRequete(async () => {
    const compte = await compteConnecte();
    return (await base.fiches.where('etat').notEqual('brouillon').toArray()).filter((f) =>
      appartientAuCompte(f, compte),
    );
  });
  const [avis, setAvis] = useState<string | null>(null);

  if (recus === undefined || paie === undefined || locales === undefined)
    return <div className="ecran" aria-busy="true" />;
  const recu = (recus ?? []).find((r) => r.id === releveId);
  const locale = locales.find((f) => f.id === releveId);

  if (!recu) {
    return (
      <div className="ecran">
        <Entete titre="Une de mes fiches" principal />
        <main className="contenu-relais pile-serree">
          {locale ? (
            <>
              <h2 className="intertitre">{locale.nomEnseigne || 'Fiche sans nom'}</h2>
              <p>
                <span className="etiquette etat-telephone">
                  {locale.etat === 'refusee' ? 'Refusée par la base' : 'Sur le téléphone'}
                </span>
              </p>
              <p className="texte-doux">
                NTanova ne l’a pas encore reçue. Elle part dès que le téléphone capte&nbsp;; son
                détail s’affiche ensuite ici.
              </p>
            </>
          ) : (
            <p>Cette fiche n’est plus dans votre liste.</p>
          )}
          <a className="bouton bouton-secondaire" href="#fiches">
            Retour à mes fiches
          </a>
        </main>
        <Navigation />
      </div>
    );
  }

  const etapes = etapesDeLaFiche(recu);
  const raison = raisonDeNTanova(recu);
  const contenu = ceQuiVientDuReleve(recu);
  const manques = recu.statut === 'refuse' ? [] : ceQuiManqueEncore(recu);
  const sesPaies = paie ? paieDeLaFiche(paie, recu.id) : null;
  // Une correction partie du téléphone : la fiche reste « à corriger » chez NTanova jusqu'à sa décision.
  const corrigee = locales.some((f) => f.corrigeReleveId === recu.id);
  const enLigne = recu.statut === 'accepte' && recu.pageEnLigne != null;

  const corriger = async () => {
    if ((await commencerCorrection(recu, recus ?? [])) === 'brouillon_existant')
      setAvis(
        'Une autre fiche est déjà en cours. Terminez-la ou abandonnez-la d’abord (« Mon secteur », « Reprendre la fiche en cours »).',
      );
  };

  return (
    <div className="ecran">
      <Entete titre="Une de mes fiches" principal />
      <main className="contenu-relais pile-serree">
        <a className="lien lien-discret" href="#fiches">
          ← Mes fiches
        </a>
        <div className="fiche-relais-tete">
          <h2 className="intertitre">{recu.nomEnseigne}</h2>
          <span className="mention">{jour(recu.prisLe)}</span>
        </div>

        <ol className="etapes-fiche" aria-label="Où en est la fiche">
          {etapes.map((e) => (
            <li key={e.cle} className={classeEtape[e.etat]}>
              {e.etat === 'faite' && <Icone nom="coche" />}
              <span>{e.libelle}</span>
            </li>
          ))}
        </ol>
        <p className="mention">
          {recu.statut === 'a_valider'
            ? 'NTanova relit votre fiche.'
            : enLigne
              ? 'La page de l’école est en ligne.'
              : recu.statut === 'accepte'
                ? 'Acceptée : NTanova la publiera avec les autres écoles de la zone.'
                : libelleStatutReleve[recu.statut]}
        </p>

        {raison && (
          <p className="message-ntanova">
            <b>NTanova&nbsp;:</b> {raison}
          </p>
        )}
        {avis && (
          <p className="message-attention" role="status">
            {avis}
          </p>
        )}
        {recu.statut === 'a_corriger' && corrigee && (
          <p>
            <span className="etiquette etat-envoye">Correction envoyée</span>
          </p>
        )}
        {recu.statut === 'a_corriger' && !corrigee && (
          <button type="button" className="bouton" onClick={() => void corriger()}>
            Corriger la fiche
          </button>
        )}
        {enLigne && (
          <a
            className="bouton bouton-secondaire"
            href={`/ecoles/${recu.pageEnLigne}/`}
            target="_blank"
            rel="noopener"
          >
            Voir la page de l’école
          </a>
        )}

        <section className="carte-blanche pile-serree" aria-label="Ce qui vient de mon relevé">
          <p className="surtitre-doux">Ce qui vient de mon relevé</p>
          <dl className="fiche-relais-contenu">
            {contenu.map((c) => (
              <div key={c.libelle}>
                <dt>{c.libelle}</dt>
                <dd>{c.valeur}</dd>
              </div>
            ))}
          </dl>
        </section>

        {manques.length > 0 && (
          <section className="carte-blanche pile-serree" aria-label="Ce qui manque encore">
            <p className="surtitre-doux">Ce qui manque encore</p>
            <ul className="liste-manques">
              {manques.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <p className="mention">
              Si vous repassez devant, NTanova pourra vous confier ces éléments en mission.
            </p>
          </section>
        )}

        <section className="carte-blanche pile-serree" aria-label="Ce qu’elle rapporte">
          <p className="surtitre-doux">Ce qu’elle rapporte</p>
          <p>{phraseDeLaPaie(recu.statut, sesPaies, paie === null)}</p>
        </section>
      </main>
      <Navigation />
    </div>
  );
}

function phraseDeLaPaie(
  statut: string,
  p: ReturnType<typeof paieDeLaFiche>,
  paieInconnue: boolean,
): string {
  if (p) {
    const quoi = p.genres.includes('mission') ? 'La mission' : 'Cette fiche';
    if (p.etat === 'paye')
      return `${quoi} : ${francs(p.montantXaf)}, payés${p.payeLe ? ` le ${jour(p.payeLe)}` : ''}.`;
    if (p.etat === 'a_payer')
      return `${quoi} : ${francs(p.montantXaf)}, à payer (semaine du ${vendrediLong(p.vendredi)} close).`;
    return `${quoi} : ${francs(p.montantXaf)}, à payer ${vendrediLong(p.vendredi)} si rien ne change.`;
  }
  if (paieInconnue) return 'La paie s’affiche dès que le téléphone capte.';
  if (statut === 'refuse') return 'Une fiche refusée n’est pas payée.';
  if (statut === 'accepte')
    return 'Elle ne figure dans aucune ligne de paie (lot d’essai, correction, ou école déjà relevée par un autre relais).';
  return 'Elle sera payée si NTanova l’accepte.';
}
