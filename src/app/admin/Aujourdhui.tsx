/**
 * « Aujourd'hui » (lot 5 du cahier, planches « Aujourd'hui · téléphone » et « · ordinateur ») : la page d'arrivée de
 * l'administration. D'abord ce qui t'attend (une carte par geste, avec son nombre et où aller), puis les chiffres de la
 * semaine. Le détail d'avant (relevés par jour, écoles par zone, délai de décision, photo de l'enseigne, contacts) reste
 * dans une section repliée : rien ne disparaît. Des nombres, jamais un objectif.
 *
 * « Relais actif » veut dire « a envoyé une fiche cette semaine » : la dernière ouverture de l'application n'est enregistrée
 * nulle part.
 */
import { useEffect, useState } from 'react';
import { ageDe } from '../../modele/age';
import { francs, prochainVendredi, vendrediLong } from '../../modele/paie';
import {
  ErreurDecision,
  type DivisionVue,
  type PortAdministration,
  type VueEnsemble as Vue,
} from '../../modele/ports';
import { resumerLesRenvoyees } from '../../modele/renvoyees';
import { zonesOuvertesRacines } from '../../modele/vue-ensemble';
import { Bandeau } from '../../ui/composants';
import { aller } from '../commun/adresse';
import { IconeAdmin, TitreEcran } from './Cadre';

function jourLisible(jour: string): string {
  // Midi UTC : le jour ne bascule jamais d'un côté ou de l'autre selon le fuseau de l'écran.
  const d = new Date(`${jour}T12:00:00Z`);
  const semaine = d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' });
  return `${semaine} ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Une carte de « Ce qui t'attend » : le nombre, ce qu'il compte, une ligne, et le geste (sur ordinateur, en mots). */
function Attente({
  titre,
  nombre,
  detail,
  geste,
  chemin,
  attention = false,
}: {
  titre: string;
  nombre: number;
  detail: string;
  geste?: string;
  chemin?: string;
  attention?: boolean;
}) {
  const contenu = (
    <>
      <span className={`attente-nombre${nombre === 0 ? ' attente-nombre-nul' : ''}`}>{nombre}</span>
      <span className="attente-texte">
        <b>{titre}</b>
        <span className={attention ? 'attente-detail-attention' : undefined}>{detail}</span>
      </span>
      {chemin && (
        <span className="attente-geste">
          {geste && <span className="attente-geste-mot">{geste}</span>}
          <IconeAdmin nom="suivant" taille={20} />
        </span>
      )}
    </>
  );
  return (
    <li>
      {chemin ? (
        <a
          className="attente"
          href={`#${chemin}`}
          aria-label={`${nombre} ${titre} : ${detail}`}
          onClick={(e) => {
            e.preventDefault();
            aller(chemin);
          }}
        >
          {contenu}
        </a>
      ) : (
        <div className="attente">{contenu}</div>
      )}
    </li>
  );
}

export function Aujourdhui({
  admin,
  surCompte,
  surRelais,
}: {
  admin: PortAdministration;
  surCompte: (n: number) => void;
  surRelais: (n: number) => void;
}) {
  const [vue, setVue] = useState<Vue | null>(null);
  const [zones, setZones] = useState<DivisionVue[]>([]);
  const [renvoyees, setRenvoyees] = useState<ReturnType<typeof resumerLesRenvoyees> | null>(null);
  const [pretes, setPretes] = useState<number | null>(null);
  const [paie, setPaie] = useState<{ relais: number; total: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let abandonne = false;
    Promise.all([admin.vueEnsemble(14), admin.divisions(), admin.relevesDecides()])
      .then(([v, d, decides]) => {
        if (abandonne) return;
        setVue(v);
        setRenvoyees(resumerLesRenvoyees(decides, new Date()));
        setZones(zonesOuvertesRacines(d));
        setErreur(null);
        // Le menu dit combien de fiches attendent, d'où qu'on arrive.
        surCompte(v.aValider.nombre);
        surRelais(v.relais.enAttente);
      })
      .catch((e: unknown) => {
        if (abandonne) return;
        setErreur(
          e instanceof ErreurDecision
            ? e.message
            : 'La base ne répond pas. Vérifie le réseau et recharge la page.',
        );
      });
    // Les deux lectures secondaires ne bloquent jamais la page.
    void admin
      .ecolesPretes()
      .then((n) => !abandonne && setPretes(n))
      .catch(() => undefined);
    void admin
      .apercuPaie(prochainVendredi())
      .then(
        (l) =>
          !abandonne &&
          setPaie({
            relais: l.filter((x) => x.totalXaf > 0).length,
            total: l.reduce((t, x) => t + x.totalXaf, 0),
          }),
      )
      .catch(() => undefined);
    return () => {
      abandonne = true;
    };
  }, [admin, surCompte, surRelais]);

  const semaine = vue?.recusParJour.slice(-7) ?? [];
  const recusSemaine = semaine.reduce((somme, j) => somme + j.total, 0);
  const essaiSemaine = semaine.reduce((somme, j) => somme + j.essai, 0);
  const plusAncienne = vue?.aValider.plusAncienneLe
    ? ageDe(vue.aValider.plusAncienneLe, new Date())
    : null;
  const maximum = Math.max(1, ...(vue?.recusParJour.map((j) => j.total) ?? []));
  const ecoles = zones.reduce((t, z) => t + z.ecoles, 0);
  const publiees = zones.reduce((t, z) => t + z.publiees, 0);

  return (
    <div className="pile">
      <TitreEcran
        titre="Aujourd’hui"
        regles={
          <>
            <p>Ce qui t’attend d’abord, puis les chiffres de la semaine.</p>
            <p>
              Des nombres, jamais un objectif : tu compares à ce que tu sais. Un relais « actif » a
              envoyé une fiche cette semaine ; la dernière ouverture de l’application n’est
              enregistrée nulle part.
            </p>
            <p>
              Les écoles amorcées par NTanova (importées ou ajoutées) ne comptent jamais comme «
              relevées par un relais ». Les jours sont ceux de Pointe-Noire.
            </p>
          </>
        }
      />

      {erreur && (
        <Bandeau ton="erreur" icone="alerte">
          <p>{erreur}</p>
        </Bandeau>
      )}

      {vue === null && !erreur && (
        <p className="texte-doux" aria-busy="true">
          Chargement…
        </p>
      )}

      {vue && (
        <div className="aujourdhui">
          <section className="aujourdhui-attente pile-serree" aria-label="Ce qui t’attend">
            <h2 className="surtitre-doux">Ce qui t’attend</h2>
            <ul className="liste-attente">
              <Attente
                titre={vue.aValider.nombre > 1 ? 'fiches à valider' : 'fiche à valider'}
                nombre={vue.aValider.nombre}
                detail={
                  plusAncienne
                    ? `la plus ancienne attend ${plusAncienne.texte}${vue.aValider.depuisPlusDe24h > 0 ? ` · ${vue.aValider.depuisPlusDe24h} depuis plus de 24 h` : ''}`
                    : 'rien n’attend'
                }
                attention={vue.aValider.depuisPlusDe24h > 0}
                geste="Valider"
                chemin="valider"
              />
              <Attente
                titre={(pretes ?? 0) > 1 ? 'écoles prêtes à publier' : 'école prête à publier'}
                nombre={pretes ?? 0}
                detail={pretes ? 'acceptées, pas encore sur ntanova.com' : 'aucune en attente'}
                geste="Publier"
                chemin="ecoles"
              />
              <Attente
                titre={vue.relais.enAttente > 1 ? 'relais à activer' : 'relais à activer'}
                nombre={vue.relais.enAttente}
                detail={
                  vue.relais.enAttente > 0
                    ? 'à relier à une personne, puis activer'
                    : 'aucun compte en attente'
                }
                geste="Activer"
                chemin="relais"
              />
              <Attente
                titre={
                  (renvoyees?.nombre ?? 0) > 1
                    ? 'fiches renvoyées aux relais'
                    : 'fiche renvoyée aux relais'
                }
                nombre={renvoyees?.nombre ?? 0}
                detail={
                  renvoyees && renvoyees.nombre > 0 && renvoyees.plusAncienne
                    ? `la plus ancienne attend son relais ${renvoyees.plusAncienne.texte}`
                    : 'aucune n’attend son relais'
                }
                geste="Voir"
                {...(renvoyees && renvoyees.nombre > 0 ? { chemin: 'valider' } : {})}
              />
              <Attente
                titre="paie à clôturer"
                nombre={paie?.relais ?? 0}
                detail={
                  paie && paie.total > 0
                    ? `${francs(paie.total)} · ${vendrediLong(prochainVendredi())}`
                    : `rien à payer ${vendrediLong(prochainVendredi())}`
                }
                geste="Payer"
                {...(paie && paie.total > 0 ? { chemin: 'paie' } : {})}
              />
            </ul>
          </section>

          <section className="aujourdhui-semaine pile-serree" aria-label="Cette semaine">
            <h2 className="surtitre-doux">Cette semaine</h2>
            <ul className="liste-semaine">
              <li>
                <span className="semaine-nombre">{recusSemaine}</span>
                <span>
                  <b>relevés reçus</b>
                  {essaiSemaine > 0 && <span> · dont {essaiSemaine} du lot d’essai</span>}
                </span>
              </li>
              <li>
                <span className="semaine-nombre">{vue.relais.ontEnvoye7j}</span>
                <b>relais actifs sur {vue.relais.actifs}</b>
              </li>
              <li>
                <span className="semaine-nombre">{ecoles}</span>
                <b>
                  école{ecoles > 1 ? 's' : ''}, {publiees} publiée{publiees > 1 ? 's' : ''}
                </b>
              </li>
              <li>
                <span className="semaine-nombre">{vue.contacts.confirmes7j}</span>
                <b>
                  contact{vue.contacts.confirmes7j > 1 ? 's' : ''} confirmé
                  {vue.contacts.confirmes7j > 1 ? 's' : ''}
                </b>
              </li>
            </ul>
          </section>

          <details className="aujourdhui-detail section-repliable">
            <summary>Le détail</summary>
            <div className="pile">
              <dl className="admin-champs">
                <dt>Délai de décision</dt>
                <dd>
                  {vue.decisions.delaiMoyenHeures === null
                    ? '—'
                    : `${String(vue.decisions.delaiMoyenHeures).replace('.', ',')} h`}{' '}
                  en moyenne, sur {vue.decisions.nombre} décision
                  {vue.decisions.nombre > 1 ? 's' : ''} des 30 derniers jours
                </dd>
                <dt>Photo de l’enseigne</dt>
                <dd>
                  {vue.enseigne.avecPhoto} sur {vue.enseigne.total} nouvelles fiches des 30 derniers
                  jours
                </dd>
                <dt>Contacts confirmés</dt>
                <dd>{vue.contacts.confirmesTotal} au total</dd>
              </dl>

              <section className="pile-serree" aria-label="Relevés reçus par jour">
                <h3>Relevés reçus par jour</h3>
                <div className="admin-tableau">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Jour</th>
                        <th scope="col">Reçus</th>
                        <th scope="col">Dont lot d’essai</th>
                        <th scope="col">
                          <span className="visuellement-cache">Barre</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...vue.recusParJour].reverse().map((j) => (
                        <tr key={j.jour}>
                          <th scope="row">{jourLisible(j.jour)}</th>
                          <td>{j.total}</td>
                          <td>{j.essai}</td>
                          <td className="admin-barre-cellule" aria-hidden="true">
                            {j.total > 0 && (
                              <span
                                className="admin-barre"
                                style={{ inlineSize: `${(j.total / maximum) * 100}%` }}
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="pile-serree" aria-label="Écoles par zone ouverte">
                <h3>Écoles par zone ouverte</h3>
                <div className="admin-tableau">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Zone</th>
                        <th scope="col">Écoles</th>
                        <th scope="col">Publiées</th>
                        <th scope="col">Relevées par un relais</th>
                        <th scope="col">Ajoutées par NTanova</th>
                        <th scope="col">Importées</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zones.map((z) => (
                        <tr key={z.id}>
                          <th scope="row">{z.nom}</th>
                          <td>{z.ecoles}</td>
                          <td>{z.publiees}</td>
                          <td>{z.relevees}</td>
                          <td>{z.ajoutees}</td>
                          <td>{z.importees}</td>
                        </tr>
                      ))}
                      {zones.length === 0 && (
                        <tr>
                          <td colSpan={6} className="texte-doux">
                            Aucune zone n’est ouverte aux relais.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
