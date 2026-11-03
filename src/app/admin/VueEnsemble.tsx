/**
 * La vue d'ensemble de l'administration (ticket #76) : « est-ce que ça avance ? » et « qui attend quoi, depuis combien de
 * temps ? », en dix secondes. Des nombres, jamais un objectif : le fondateur compare à ce qu'il sait.
 *
 * « Relais actif cette semaine » veut dire « a envoyé une fiche cette semaine » : la dernière ouverture de l'application
 * n'est enregistrée nulle part.
 */
import { useEffect, useState } from 'react';
import { ageDe } from '../../modele/age';
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

function jourLisible(jour: string): string {
  // Midi UTC : le jour ne bascule jamais d'un côté ou de l'autre selon le fuseau de l'écran.
  const d = new Date(`${jour}T12:00:00Z`);
  const semaine = d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' });
  return `${semaine} ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function Chiffre({
  titre,
  valeur,
  children,
  attention = false,
}: {
  titre: string;
  valeur: string;
  children?: React.ReactNode;
  attention?: boolean;
}) {
  return (
    <section
      className={`carte-blanche admin-chiffre${attention ? ' admin-chiffre-attention' : ''}`}
      aria-label={titre}
    >
      <h2 className="admin-chiffre-titre">{titre}</h2>
      <p className="admin-chiffre-valeur">{valeur}</p>
      {children}
    </section>
  );
}

export function VueEnsemble({
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

  return (
    <div className="pile">
      <div className="admin-titre">
        <div>
          <h1>Vue d’ensemble</h1>
          <p className="texte-doux">
            Où en est le relevé, en nombres. Aucun objectif n’est affiché : tu compares à ce que tu
            sais.
          </p>
        </div>
      </div>

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
        <>
          <div className="admin-chiffres">
            <Chiffre
              titre="À valider"
              valeur={String(vue.aValider.nombre)}
              attention={vue.aValider.depuisPlusDe24h > 0}
            >
              {plusAncienne ? (
                <p className="mention">La plus ancienne attend {plusAncienne.texte}.</p>
              ) : (
                <p className="mention">Rien n’attend.</p>
              )}
              {vue.aValider.depuisPlusDe24h > 0 && (
                <p className="mention">
                  <b>{vue.aValider.depuisPlusDe24h} depuis plus de 24 h</b>
                </p>
              )}
              <a
                className="lien"
                href="#valider"
                onClick={(e) => {
                  e.preventDefault();
                  aller('valider');
                }}
              >
                Voir la file
              </a>
            </Chiffre>

            <Chiffre titre="Renvoyées aux relais" valeur={String(renvoyees?.nombre ?? 0)}>
              {renvoyees && renvoyees.nombre > 0 && renvoyees.plusAncienne ? (
                <p className="mention">
                  La plus ancienne attend son relais {renvoyees.plusAncienne.texte}.
                </p>
              ) : (
                <p className="mention">Aucune fiche n’attend son relais.</p>
              )}
              {renvoyees && renvoyees.nombre > 0 && (
                <a
                  className="lien"
                  href="#valider"
                  onClick={(e) => {
                    e.preventDefault();
                    aller('valider');
                  }}
                >
                  Voir dans « À valider », filtre « Renvoyées »
                </a>
              )}
            </Chiffre>

            <Chiffre titre="Relevés cette semaine" valeur={String(recusSemaine)}>
              <p className="mention">
                {essaiSemaine > 0
                  ? `Dont ${essaiSemaine} du lot d’essai.`
                  : 'Aucun du lot d’essai.'}
              </p>
            </Chiffre>

            <Chiffre
              titre="Relais qui ont envoyé"
              valeur={`${vue.relais.ontEnvoye7j} sur ${vue.relais.actifs}`}
            >
              <p className="mention">relais actifs, cette semaine.</p>
              {vue.relais.enAttente > 0 && (
                <p className="mention">
                  {vue.relais.enAttente} compte{vue.relais.enAttente > 1 ? 's' : ''} à activer.
                </p>
              )}
            </Chiffre>

            <Chiffre
              titre="Délai de décision"
              valeur={
                vue.decisions.delaiMoyenHeures === null
                  ? '—'
                  : `${String(vue.decisions.delaiMoyenHeures).replace('.', ',')} h`
              }
            >
              <p className="mention">
                En moyenne, sur {vue.decisions.nombre} décision
                {vue.decisions.nombre > 1 ? 's' : ''} des 30 derniers jours.
              </p>
            </Chiffre>

            <Chiffre
              titre="Photo de l’enseigne"
              valeur={`${vue.enseigne.avecPhoto} sur ${vue.enseigne.total}`}
            >
              <p className="mention">nouvelles fiches des 30 derniers jours, arrivées avec elle.</p>
            </Chiffre>

            <Chiffre titre="Contacts confirmés" valeur={String(vue.contacts.confirmesTotal)}>
              <p className="mention">Dont {vue.contacts.confirmes7j} cette semaine.</p>
            </Chiffre>
          </div>

          <section className="pile-serree" aria-label="Relevés reçus par jour">
            <h2>Relevés reçus par jour</h2>
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
            <p className="mention">Les jours sont ceux de Pointe-Noire.</p>
          </section>

          <section className="pile-serree" aria-label="Écoles par zone ouverte">
            <h2>Écoles par zone ouverte</h2>
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
            <p className="mention">
              Les écoles amorcées par NTanova (importées ou ajoutées) ne comptent jamais comme «
              relevées par un relais ».
            </p>
          </section>
        </>
      )}
    </div>
  );
}
