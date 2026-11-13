import { compteDesFiches, factureDeLaPaie, francs, vendrediLong } from '../../../modele/paie';
import type { LigneDeMaPaie } from '../../../modele/ports';
import { lireMemoire, useRequete } from '../base-locale';
import { Entete, jour, Navigation } from '../composants';

/**
 * « Ma paie » : le relais lit sa propre paie, en lecture seule. Ce qui lui est acquis pour le prochain vendredi, les
 * semaines closes (à payer, puis payées avec la référence de l'opération). La base calcule, avec les mêmes règles que
 * l'administration ; ici, rien que de l'affichage. Un acquis n'est pas une promesse : le relais le lit comme tel.
 */
export function MaPaie() {
  const paie = useRequete(async () => (await lireMemoire('paie')) ?? null);
  const releves = useRequete(async () => (await lireMemoire('releves')) ?? []);

  if (paie === undefined || releves === undefined) {
    return <div className="ecran" aria-busy="true" />;
  }

  const compte = compteDesFiches(releves);

  return (
    <div className="ecran">
      <Entete titre="Ma paie" principal />
      <main className="contenu-relais">
        {paie === null ? (
          <p className="texte-doux">La paie s’affiche dès que le téléphone capte.</p>
        ) : (
          <>
            <Acquis ligne={paie.acquis} />

            <section className="carte-blanche pile-serree" aria-label="Mes fiches">
              <p className="surtitre-doux">Mes fiches</p>
              <ul className="liste-taches">
                <li>
                  <span>Envoyées&nbsp;: {compte.envoyees}</span>
                  <span>Acceptées&nbsp;: {compte.acceptees}</span>
                </li>
                <li>
                  <span>En attente&nbsp;: {compte.enAttente}</span>
                  <span>À corriger&nbsp;: {compte.aCorriger}</span>
                  <span>Refusées&nbsp;: {compte.refusees}</span>
                </li>
              </ul>
            </section>

            {!paie.numeroConnu && (
              <p className="message-attention">
                NTanova n’a pas encore votre numéro Mobile Money. Dites-le-lui sur WhatsApp pour
                être payé.
              </p>
            )}

            <section className="carte-blanche pile-serree" aria-label="Semaines closes">
              <p className="surtitre-doux">Semaines closes</p>
              {paie.historique.length === 0 ? (
                <p className="texte-doux">Aucune semaine close pour le moment.</p>
              ) : (
                paie.historique.map((s) => <Semaine key={s.vendredi} ligne={s} />)
              )}
            </section>
          </>
        )}
      </main>
      <Navigation />
    </div>
  );
}

/**
 * Lot F (13/11) : la paie comme une facture claire, une ligne par genre et par tarif (« 2 fiches acceptées · 2 × 500 FCFA ·
 * 1 000 FCFA »), puis le total. Une paie gardée avant la mise à jour n'a pas les tarifs : les quantités seules.
 */
function Facture({ ligne }: { ligne: LigneDeMaPaie }) {
  const lignes = factureDeLaPaie(ligne);
  if (lignes.length === 0) return null;
  return (
    <ul className="facture" aria-label="Le détail">
      {lignes.map((l) => (
        <li key={l.libelle}>
          <span>{l.libelle}</span>
          <span className="facture-sous-total">
            {l.sousTotal !== null ? francs(l.sousTotal) : ''}
          </span>
          {l.calcul && <span className="facture-calcul">{l.calcul}</span>}
        </li>
      ))}
      {lignes.some((l) => l.sousTotal !== null) && (
        <li className="facture-total">
          <b>Total</b>
          <span className="facture-sous-total">{francs(ligne.totalXaf)}</span>
        </li>
      )}
    </ul>
  );
}

function Acquis({ ligne }: { ligne: LigneDeMaPaie }) {
  const detail = factureDeLaPaie(ligne);
  return (
    <section className="carte-blanche pile-serree" aria-label="Acquis">
      <p className="surtitre-doux">
        {ligne.vendredi
          ? `À payer ${vendrediLong(ligne.vendredi)} si rien ne change`
          : 'À payer vendredi si rien ne change'}
      </p>
      <span className="intertitre">{francs(ligne.totalXaf)}</span>
      {detail.length > 0 ? (
        <Facture ligne={ligne} />
      ) : (
        <p className="texte-doux">
          Rien d’acquis pour le moment. Une fiche acceptée par NTanova est payée ; un contact de la
          direction confirmé aussi.
        </p>
      )}
      {ligne.nonPayables > 0 && (
        <p className="message-attention">
          {ligne.nonPayables} fiche{ligne.nonPayables > 1 ? 's' : ''} acceptée
          {ligne.nonPayables > 1 ? 's' : ''} ne rapporte{ligne.nonPayables > 1 ? 'nt' : ''}{' '}
          rien&nbsp;: l’école avait déjà été relevée par un autre relais.
        </p>
      )}
      <p className="mention">
        Ce montant peut changer d’ici vendredi (une fiche refusée, un contact pas encore confirmé).
        Il est fixé quand NTanova clôt la semaine, puis payé en Mobile Money.
      </p>
    </section>
  );
}

function Semaine({ ligne }: { ligne: LigneDeMaPaie }) {
  const detail = factureDeLaPaie(ligne);
  return (
    <div className="pile-serree">
      <div className="fiche-relais-tete">
        <b>{vendrediLong(ligne.vendredi)}</b>
        <span>{francs(ligne.totalXaf)}</span>
      </div>
      {detail.some((d) => d.sousTotal !== null) ? (
        <Facture ligne={ligne} />
      ) : (
        detail.length > 0 && <p className="mention">{detail.map((d) => d.libelle).join(' · ')}</p>
      )}
      {ligne.etat === 'paye' ? (
        <p>
          <span className="etiquette etat-verifiee">Payé</span>{' '}
          <span className="mention">
            {ligne.payeLe ? `le ${jour(ligne.payeLe)}` : ''}
            {ligne.reference ? ` · réf. ${ligne.reference}` : ''}
          </span>
        </p>
      ) : (
        <p>
          <span className="etiquette etat-attente">À payer</span>{' '}
          <span className="mention">NTanova prépare le paiement.</span>
        </p>
      )}
    </div>
  );
}
