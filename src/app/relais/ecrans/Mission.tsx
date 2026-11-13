/**
 * Une mission (lot H, planche « Relais · une mission ») : l'école confiée par NTanova, où elle est, ce qu'il faut faire et
 * pourquoi, avant quand, ce qu'elle paie, la phrase à dire en entrant ; puis « Prendre la photo » (la fiche s'ouvre sur la
 * photo et la position, l'école déjà connue) ou « Je n'ai pas pu ». Tout se lit dans le téléphone : la mission s'ouvre
 * hors ligne.
 */
import { useState } from 'react';
import { lienGoogleMaps } from '../../../modele/coordonnees';
import { texteDestineAuRelais } from '../../../modele/consigne';
import { jourDuCongo } from '../../../modele/date-declaration';
import { libelleNiveau } from '../../../modele/libelles';
import type { Valeur } from '../../../modele/listes';
import { francs } from '../../../modele/paie';
import { lireMemoire, useRequete } from '../base-locale';
import { Icone, PastilleReseau } from '../composants';
import { aller } from '../contexte';
import { commencerContreVisite } from './Ajouter';
import { PasPu } from './MonLot';

const consigne: Record<Valeur<'mission_kind'>, string> = {
  verify: 'Vérifier l’école sur place : le nom écrit, le repère, la photo de l’enseigne.',
  locate: 'La situer : la photo de l’enseigne et la position, devant l’entrée.',
  complete: 'Compléter sa fiche : ce qui manque, et une photo.',
};

export const PHRASE_DE_MISSION =
  '« Bonjour, je viens pour NTanova, l’annuaire des écoles. Je passe compléter la fiche de votre école, avec ce qui se voit d’ici. »';

const jourLong = (j: string): string =>
  new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

export function Mission({ ecoleId }: { ecoleId: string }) {
  const ecoles = useRequete(() => lireMemoire('aCompleter'));
  const [avis, setAvis] = useState<string | null>(null);
  if (ecoles === undefined) return <div className="ecran" aria-busy="true" />;
  const e = ecoles.find((x) => x.id === ecoleId);

  return (
    <div className="ecran">
      <header className="entete-etape">
        <button
          type="button"
          className="bouton-icone"
          aria-label="Retour aux missions"
          onClick={() => aller('missions')}
        >
          <Icone nom="retour" taille={22} />
        </button>
        <span className="entete-etape-titre">Une mission</span>
        <PastilleReseau />
      </header>
      <main className="contenu-relais pile-serree">
        {!e ? (
          <>
            <h1 className="titre-ecran" tabIndex={-1}>
              Mission terminée
            </h1>
            <p>
              Cette mission n’est plus sur le téléphone : elle est faite, ou NTanova l’a retirée.
            </p>
            <button type="button" className="bouton" onClick={() => aller('missions')}>
              Retour aux missions
            </button>
          </>
        ) : (
          <>
            <p className="mention">
              Confiée par NTanova
              {e.confieeLe ? ` le ${jourLong(jourDuCongo(new Date(e.confieeLe)))}` : ''}
            </p>
            <section className="carte-blanche pile-serree" aria-label="L’école">
              {e.quartier && <p className="surtitre">{e.quartier}</p>}
              <h1 className="intertitre mission-nom" tabIndex={-1}>
                {e.nom}
              </h1>
              <p className="texte-doux">
                {[
                  e.etiquette,
                  e.niveaux.map((n) => libelleNiveau[n as Valeur<'niveau'>] ?? n).join(', '),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {(e.repere || e.quartier) && (
                <p>
                  {e.repere && <b>{e.repere}</b>}
                  {e.repere && e.quartier ? ' · ' : ''}
                  {e.quartier}
                </p>
              )}
              {e.position && (
                <a
                  className="bouton bouton-secondaire"
                  href={lienGoogleMaps(e.position)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icone nom="carte" />Y aller
                </a>
              )}
            </section>

            <section className="carte-blanche pile-serree" aria-label="Ce qu’il faut faire">
              <h2 className="surtitre-doux">Ce qu’il faut faire</h2>
              <p>
                <b>{e.tache ?? consigne[e.genre]}</b>
              </p>
              {e.raison && <p className="texte-doux">Pourquoi&nbsp;: {e.raison}</p>}
              {texteDestineAuRelais(e.note) && (
                <p className="texte-doux">À vérifier&nbsp;: {texteDestineAuRelais(e.note)}</p>
              )}
              {(e.avantLe || e.paieXaf) && (
                <dl className="mission-chiffres">
                  {e.avantLe && (
                    <div>
                      <dt>Avant le</dt>
                      <dd className={jourDuCongo() > e.avantLe ? 'en-retard' : undefined}>
                        {jourLong(e.avantLe)}
                        {jourDuCongo() > e.avantLe ? ' · en retard' : ''}
                      </dd>
                    </div>
                  )}
                  {e.paieXaf ? (
                    <div>
                      <dt>Paie de la mission</dt>
                      <dd>{francs(e.paieXaf)}</dd>
                    </div>
                  ) : null}
                </dl>
              )}
            </section>

            <section className="carte-blanche pile-serree" aria-label="À dire en entrant">
              <h2 className="surtitre-doux">À dire en entrant</h2>
              <p>{PHRASE_DE_MISSION}</p>
            </section>

            {avis && (
              <p className="message-attention" role="status">
                {avis}
              </p>
            )}
            {e.missionId && <PasPu missionId={e.missionId} apres={() => aller('missions')} />}
            <div className="barre-mission">
              <button
                type="button"
                className="bouton bouton-large"
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
                <Icone nom="photo" />
                Prendre la photo
              </button>
              <p className="mention">
                La fiche s’ouvre sur la photo et la position ; l’école est déjà connue.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
