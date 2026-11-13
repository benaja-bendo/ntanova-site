/**
 * L'aide du relais (lot H, planche « Compte › Aide ») : trois sujets, chacun sur sa page, qu'on ouvre depuis l'accueil (le
 * « ? » et « Quoi dire en entrant ») ou depuis « Compte ». Tout est dans l'application : l'aide se lit hors ligne.
 * - `entrer` : la phrase à dire en entrant, et ce qu'on ne fait jamais ;
 * - `regles` : les règles du relais (photos, accord, ce qui ne se publie pas) ;
 * - `paie` : comment le relais est payé.
 */
import { Icone, PastilleReseau } from '../composants';
import { useRelais } from '../contexte';

export type SujetDAide = 'entrer' | 'regles' | 'paie';

const titres: Record<SujetDAide, string> = {
  entrer: 'Quoi dire en entrant',
  regles: 'Les règles du relais',
  paie: 'Comment je suis payé',
};

export function Aide({ sujet }: { sujet: SujetDAide }) {
  const { lienNTanova } = useRelais();
  return (
    <div className="ecran">
      <header className="entete-etape">
        <button
          type="button"
          className="bouton-icone"
          aria-label="Retour"
          onClick={() => (history.length > 1 ? history.back() : (location.hash = '#missions'))}
        >
          <Icone nom="retour" taille={22} />
        </button>
        <span className="entete-etape-titre">Aide</span>
        <PastilleReseau />
      </header>
      <main className="contenu-relais pile-serree">
        <h1 className="titre-ecran" tabIndex={-1}>
          {titres[sujet]}
        </h1>

        {sujet === 'entrer' && (
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
              <b>Jamais&nbsp;:</b> se dire parent, dire que le site est déjà connu, promettre
              quelque chose, photographier un enfant.
            </p>
          </section>
        )}

        {sujet === 'regles' && (
          <section className="carte-blanche pile-serree" aria-label="Les règles">
            <ul className="liste-aide">
              <li>
                <b>Aucun enfant en photo.</b> L’enseigne, le portail, une cour ou une salle vides.
              </li>
              <li>
                <b>Un numéro seulement avec l’accord</b> de la personne, coché sur la fiche. Il
                n’est jamais publié.
              </li>
              <li>
                <b>Les photos de travail ne se publient jamais</b> : prospectus des frais, affiche
                des inscriptions, liste des programmes. Elles servent à NTanova.
              </li>
              <li>
                <b>Rien n’est inventé.</b> Ce que vous n’avez pas vu, vous ne l’écrivez pas : « Je
                ne sais pas » est une bonne réponse.
              </li>
              <li>
                <b>NTanova relit tout</b> avant de publier : votre fiche peut être acceptée,
                renvoyée pour une correction, ou refusée, avec la raison.
              </li>
            </ul>
          </section>
        )}

        {sujet === 'paie' && (
          <section className="carte-blanche pile-serree" aria-label="La paie">
            <ul className="liste-aide">
              <li>
                <b>500 FCFA par fiche acceptée</b> par NTanova. Une fiche en attente ou à corriger
                n’est pas encore comptée.
              </li>
              <li>
                <b>Une mission</b> : le montant écrit sur la mission, quand elle est faite.
              </li>
              <li>Le bonus n’est pas payé pour l’instant.</li>
              <li>
                La paie se compte chaque semaine, jusqu’au vendredi, et part sur votre numéro Mobile
                Money (Compte › Pour recevoir la paie). Le détail est dans « Ma paie ».
              </li>
            </ul>
          </section>
        )}

        {lienNTanova ? (
          <a
            className="bouton bouton-secondaire"
            href={lienNTanova}
            target="_blank"
            rel="noopener noreferrer"
          >
            Une question ? Écrire à NTanova
          </a>
        ) : (
          <p className="texte-doux">
            Une question ? Écrivez à NTanova sur WhatsApp, au numéro donné pendant la formation.
          </p>
        )}
      </main>
    </div>
  );
}
