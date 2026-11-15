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
import { ajouterJours, jourDuCongo } from '../../modele/date-declaration';
import { resumerDemandes, type DemandesResumees } from '../../modele/demandes-familles';
import { zonesOuvertesRacines } from '../../modele/vue-ensemble';
import { cn } from '@/lib/utils';
import { Bandeau } from '@/ui/v2/formulaire';
import { cadreTableau, surtitre, tableau } from './ui';
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
      <span
        className={cn(
          'w-12 shrink-0 text-center font-serif text-[30px] leading-none font-bold',
          nombre === 0 ? 'text-muted-foreground' : 'text-primary-strong',
        )}
      >
        {nombre}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="text-[17px]">{titre}</b>
        <span
          className={cn(
            'text-sm',
            attention ? 'font-bold text-destructive' : 'text-muted-foreground',
          )}
        >
          {detail}
        </span>
      </span>
      {chemin && (
        <span className="flex items-center gap-1 text-[15px] font-bold text-primary-strong">
          {geste && <span className="max-lg:sr-only">{geste}</span>}
          <IconeAdmin nom="suivant" taille={20} />
        </span>
      )}
    </>
  );
  const carte =
    'flex min-h-20 items-center gap-4 rounded-lg border border-border bg-card px-4 py-3.5 text-foreground no-underline lg:px-5';
  return (
    <li>
      {chemin ? (
        <a
          className={cn(
            carte,
            'outline-none focus-visible:ring-[3px] focus-visible:ring-ring [@media(hover:hover)]:hover:border-primary',
          )}
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
        <div className={carte}>{contenu}</div>
      )}
    </li>
  );
}

/** Les demandes des familles se lisent sur cette durée, en jours. */
const JOURS_DES_DEMANDES = 30;

/**
 * « Les familles demandent » (lot 2 du site public, 15/11) : les fiches dont des familles ont demandé la vérification, et
 * ce qu'elles ont cherché au test d'orientation sans trouver. Comptées sans nom ni numéro, une par téléphone, sujet et
 * jour : de quoi dire à une direction que des familles cherchent ses frais, et orienter les missions.
 */
function DemandesDesFamilles({ demandes }: { demandes: DemandesResumees }) {
  const ligne = 'flex min-h-12 items-center gap-3 px-4 py-2.5 text-[15px]';
  const separee = 'border-t border-border first:border-t-0';
  const nombre =
    'w-9 shrink-0 text-center font-serif text-[22px] leading-none font-bold text-primary-strong';
  return (
    <section className="flex flex-col gap-2.5 lg:col-span-2" aria-label="Les familles demandent">
      <h2 className={surtitre}>Les familles demandent · {JOURS_DES_DEMANDES} jours</h2>
      {demandes.total === 0 ? (
        <p className="m-0 rounded-lg bg-muted px-4 py-3 text-[15px] text-muted-foreground">
          Aucune demande comptée. Elles viendront de « Demander la vérification » sur une fiche et
          du test d’orientation.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <section
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
            aria-label="Vérifications demandées"
          >
            <h3 className="m-0 border-b border-border bg-muted px-4 py-2.5 font-sans text-sm font-bold">
              Vérifications demandées
            </h3>
            {demandes.verifications.length === 0 ? (
              <p className="m-0 px-4 py-3 text-[15px] text-muted-foreground">Aucune.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {demandes.verifications.slice(0, 5).map((v) => (
                  <li key={v.ecoleId} className={separee}>
                    <a
                      href={`#ecoles/fiche/${v.ecoleId}`}
                      onClick={(e) => {
                        e.preventDefault();
                        aller(`ecoles/fiche/${v.ecoleId}`);
                      }}
                      aria-label={`${v.nom} : ${v.nombre} demande${v.nombre > 1 ? 's' : ''}`}
                      className={cn(
                        ligne,
                        'text-foreground no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring [@media(hover:hover)]:hover:bg-muted',
                      )}
                    >
                      <span className={nombre}>{v.nombre}</span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <b className="truncate">{v.nom}</b>
                        <span className="text-sm text-muted-foreground">
                          depuis le {jourLisible(v.depuis)}
                        </span>
                      </span>
                      <IconeAdmin nom="suivant" taille={18} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
            aria-label="Tests d’orientation sans résultat"
          >
            <h3 className="m-0 border-b border-border bg-muted px-4 py-2.5 font-sans text-sm font-bold">
              Tests d’orientation sans résultat
            </h3>
            {demandes.orientations.length === 0 ? (
              <p className="m-0 px-4 py-3 text-[15px] text-muted-foreground">Aucun.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {demandes.orientations.slice(0, 5).map((o) => (
                  <li key={o.sujet} className={cn(ligne, separee)}>
                    <span className={nombre}>{o.nombre}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <b>{o.sujet}</b>
                      <span className="text-sm text-muted-foreground">
                        depuis le {jourLisible(o.depuis)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

/** Un chiffre de « Cette semaine » : le nombre en serif, ce qu'il compte en gras, sur la bande. */
function Chiffre({ nombre, children }: { nombre: number; children: React.ReactNode }) {
  return (
    <li className="flex min-h-[70px] items-center gap-4 rounded-lg bg-muted px-4 py-3">
      <span className="w-12 shrink-0 font-serif text-[30px] leading-none font-bold text-primary-strong">
        {nombre}
      </span>
      <span className="text-[15px] [&_b]:text-base">{children}</span>
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
  // Lot 2 du site public (15/11) : les demandes des familles des 30 derniers jours, sans nom ni numéro.
  const [demandes, setDemandes] = useState<DemandesResumees | null>(null);
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
    void admin
      .demandesDesFamilles(ajouterJours(jourDuCongo(), -JOURS_DES_DEMANDES))
      .then((d) => !abandonne && setDemandes(resumerDemandes(d)))
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
    <>
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
        <p className="m-0 text-muted-foreground" aria-busy="true">
          Chargement…
        </p>
      )}

      {vue && (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-7">
          <section className="flex flex-col gap-2.5" aria-label="Ce qui t’attend">
            <h2 className={surtitre}>Ce qui t’attend</h2>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
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

          <section className="flex flex-col gap-2.5" aria-label="Cette semaine">
            <h2 className={surtitre}>Cette semaine</h2>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              <Chiffre nombre={recusSemaine}>
                <b>relevés reçus</b>
                {essaiSemaine > 0 && <span> · dont {essaiSemaine} du lot d’essai</span>}
              </Chiffre>
              <Chiffre nombre={vue.relais.ontEnvoye7j}>
                <b>relais actifs sur {vue.relais.actifs}</b>
              </Chiffre>
              <Chiffre nombre={ecoles}>
                <b>
                  école{ecoles > 1 ? 's' : ''}, {publiees} publiée{publiees > 1 ? 's' : ''}
                </b>
              </Chiffre>
              <Chiffre nombre={vue.contacts.confirmes7j}>
                <b>
                  contact{vue.contacts.confirmes7j > 1 ? 's' : ''} confirmé
                  {vue.contacts.confirmes7j > 1 ? 's' : ''}
                </b>
              </Chiffre>
            </ul>
          </section>

          {demandes && <DemandesDesFamilles demandes={demandes} />}

          <details className="group rounded-lg border border-border bg-card lg:col-span-2">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-[15px] font-bold text-primary-strong [&::-webkit-details-marker]:hidden">
              <IconeAdmin
                nom="suivant"
                taille={18}
                className="transition-transform group-open:rotate-90"
              />
              Le détail
            </summary>
            <div className="flex flex-col gap-5 border-t border-border p-4">
              <dl className="m-0 grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-[max-content_1fr] [&_dd]:m-0 [&_dt]:text-muted-foreground">
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

              <section className="flex flex-col gap-2" aria-label="Relevés reçus par jour">
                <h3 className="m-0 font-serif text-lg">Relevés reçus par jour</h3>
                <div className={cadreTableau}>
                  <table className={tableau}>
                    <thead>
                      <tr>
                        <th scope="col">Jour</th>
                        <th scope="col">Reçus</th>
                        <th scope="col">Dont lot d’essai</th>
                        <th scope="col">
                          <span className="sr-only">Barre</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...vue.recusParJour].reverse().map((j) => (
                        <tr key={j.jour}>
                          <th scope="row">{jourLisible(j.jour)}</th>
                          <td>{j.total}</td>
                          <td>{j.essai}</td>
                          <td className="w-2/5" aria-hidden="true">
                            {j.total > 0 && (
                              <span
                                className="block h-2.5 rounded-full bg-primary"
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

              <section className="flex flex-col gap-2" aria-label="Écoles par zone ouverte">
                <h3 className="m-0 font-serif text-lg">Écoles par zone ouverte</h3>
                <div className={cadreTableau}>
                  <table className={tableau}>
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
                          <td colSpan={6} className="text-muted-foreground">
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
    </>
  );
}
