/**
 * Les zones et les lots. La géographie va du pays au quartier ; une zone est fermée aux relais tant qu'on ne l'ouvre pas
 * (ouvrir une ville ouvre tout ce qu'elle contient), et un lot se pose sur n'importe quelle ville, n'importe quel
 * arrondissement ou quartier.
 *
 * L'arbre à gauche garde sa place, le volet de la zone choisie défile à droite, comme « À valider » (audit de
 * l'administration, 07/11/2026). Une seconde vue range les zones par étape de la carte. Ouvrir une zone n'est pas annoncer
 * une couverture : le site n'affiche que ce qui est publié.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { cheminLisible } from '../../modele/geo-divisions';
import { libelleGenreDivision } from '../../modele/libelles';
import type { DivisionVue, LotVu, PortAdministration, RelaisVu } from '../../modele/ports';
import {
  SEUIL_OUVERTURE_LARGE,
  ancetresDe,
  groupesDeLArbre,
  lignesDeLArbre,
  libelleEtat,
  phraseDuResume,
  resumeDesZones,
  surLaCarte,
  zonesAReplierPourTout,
  zonesDessous,
  type EtatCarte,
} from '../../modele/zones-admin';
import { libelleDeploiement } from '../../modele/etat-zone';
import { Bandeau, Champ, Icone, jour } from '../../ui/composants';
import { Bouton } from '../../ui/actions';
import { Dialogue } from '../../ui/Dialogue';
import { aller, useAdresse } from '../commun/adresse';
import { messageErreur } from './ChampPosition';
import { VueParEtape } from './ZonesEtapes';
import { AjouterDivision } from './ZonesFormulaires';
import { VoletDeZone } from './ZonesVolet';

/** Le retour d'un geste : dit ce qui s'est passé, et le défait quand c'est possible. */
interface Retour {
  texte: string;
  annuler?: () => Promise<void>;
}

export function Zones({ admin }: { admin: PortAdministration }) {
  const [divisions, setDivisions] = useState<DivisionVue[] | null>(null);
  const [lots, setLots] = useState<LotVu[]>([]);
  const [relais, setRelais] = useState<RelaisVu[]>([]);
  const [recherche, setRecherche] = useState('');
  const [groupesOuverts, setGroupesOuverts] = useState<ReadonlySet<string>>(new Set());
  const [repliees, setRepliees] = useState<ReadonlySet<string>>(new Set());
  const [ajout, setAjout] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [retour, setRetour] = useState<Retour | null>(null);
  const [occupee, setOccupee] = useState<string | null>(null);
  const [aConfirmer, setAConfirmer] = useState<DivisionVue | null>(null);
  const [aSupprimer, setASupprimer] = useState<DivisionVue | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [erreurSuppression, setErreurSuppression] = useState<string | null>(null);
  const [enCoursLot, setEnCoursLot] = useState(false);
  const [, sous] = useAdresse();
  const vue = sous === 'etapes' ? 'etapes' : 'arbre';

  const charger = useCallback(() => {
    Promise.all([admin.divisions(), admin.lots(), admin.relais()])
      .then(([d, l, r]) => {
        setDivisions(d);
        setLots(l);
        setRelais(r);
        setErreur(null);
      })
      .catch(() => setErreur('La base ne répond pas. Vérifie le réseau et recharge la page.'));
  }, [admin]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Ouverte : par elle-même ou par une zone au-dessus d'elle.
  const ouvertePar = useMemo(() => {
    const parChemin = new Map((divisions ?? []).map((d) => [d.chemin, d]));
    const resultat = new Map<string, DivisionVue | null>();
    for (const d of divisions ?? []) {
      let trouve: DivisionVue | null = null;
      const morceaux = d.chemin.split('.');
      for (let n = morceaux.length; n >= 1 && !trouve; n--) {
        const x = parChemin.get(morceaux.slice(0, n).join('.'));
        if (x?.ouverte) trouve = x;
      }
      resultat.set(d.id, trouve);
    }
    return resultat;
  }, [divisions]);

  const choisie = vue === 'arbre' ? ((divisions ?? []).find((d) => d.id === sous) ?? null) : null;

  // Une zone choisie par son adresse, ou depuis l'autre vue, se montre dans la liste même quand celle-ci défile.
  const idChoisie = choisie?.id;
  const chargee = divisions !== null;
  useEffect(() => {
    if (!idChoisie) return;
    document
      .querySelector('.admin-arbre [aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [idChoisie, chargee]);

  // Une zone choisie par son adresse, ou qu'on vient d'ajouter, se montre : on rouvre ce qui la contient. Seul le choix
  // compte ici : un rechargement après un geste ne doit pas rouvrir ce qu'on vient de replier.
  const [choixMontre, setChoixMontre] = useState<string | null>(null);
  const choixAMontrer = chargee ? (idChoisie ?? null) : null;
  if (choixAMontrer !== choixMontre) {
    setChoixMontre(choixAMontrer);
    if (choixAMontrer && divisions) {
      const dessus = ancetresDe(choixAMontrer, divisions);
      if (dessus.some((id) => repliees.has(id))) {
        setRepliees(new Set([...repliees].filter((id) => !dessus.includes(id))));
      }
    }
  }

  const choisir = (zone: DivisionVue) => {
    setRetour(null);
    aller(`zones/${zone.id}`);
  };

  /** Un geste sur une zone : il s'enregistre, dit où il en est à côté de la zone, et se défait d'un clic. */
  const agir = async (zoneId: string, action: () => Promise<void>, apres: Retour) => {
    setOccupee(zoneId);
    setErreur(null);
    try {
      await action();
      setRetour(apres);
      charger();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupee(null);
    }
  };

  // Ce que la carte du site dit de la zone : elle ne touche pas à l'ouverture aux relais.
  const regler = (d: DivisionVue, etat: EtatCarte) => {
    const avant = d.deploiement;
    if (avant === etat) return Promise.resolve();
    return agir(d.id, () => admin.etatPublicZone(d.id, etat), {
      texte:
        etat === null
          ? `${d.nom} n’apparaît plus comme zone suivie sur la carte : « Pas encore couverte ». Les relais ne sont pas concernés.`
          : `${d.nom} est sur la carte, réglée « ${libelleDeploiement[etat]} ». Les relais ne sont pas concernés.`,
      annuler: () =>
        agir(d.id, () => admin.etatPublicZone(d.id, avant), {
          texte: `${d.nom} redevient « ${libelleEtat(avant)} » sur la carte.`,
        }),
    });
  };

  const ouvrir = (d: DivisionVue, ouverte: boolean): Promise<void> =>
    agir(d.id, () => admin.ouvrirZone(d.id, ouverte), {
      texte: ouverte
        ? `${d.nom} est ouverte aux relais, avec tout ce qu’elle contient.`
        : `${d.nom} n’est plus ouverte aux relais.`,
      annuler: () => ouvrir(d, !ouverte),
    });

  // Un geste qui touche beaucoup de zones montre d'abord ce qu'il change.
  const demanderOuverture = (d: DivisionVue, ouverte: boolean) => {
    if (ouverte && zonesDessous(d, divisions ?? []).length >= SEUIL_OUVERTURE_LARGE) {
      setAConfirmer(d);
      return;
    }
    void ouvrir(d, ouverte);
  };

  // Un secteur est « rendu » quand l'administration le déclare terminé : c'est ce que compte la mesure, à sa date.
  const rendre = async (l: LotVu, rendu: boolean) => {
    setEnCoursLot(true);
    setErreur(null);
    try {
      await admin.marquerLotRendu(l.id, rendu);
      setRetour({
        texte: rendu
          ? `Le lot « ${l.nom} » est marqué rendu.`
          : `Le lot « ${l.nom} » est remis en cours.`,
      });
      charger();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCoursLot(false);
    }
  };

  // Une zone qu'on vient d'ajouter s'ouvre aussitôt : c'est elle qu'on veut régler ensuite.
  const surFait = (texte: string, zoneId?: string) => {
    setRetour({ texte });
    charger();
    if (zoneId) aller(`zones/${zoneId}`);
  };

  // Supprimer une zone vide (une erreur de saisie) : définitif, donc confirmé ; la base redit tout ce qui s'y oppose.
  const supprimer = async (zone: DivisionVue) => {
    setSuppressionEnCours(true);
    setErreurSuppression(null);
    try {
      await admin.supprimerDivision(zone.id);
      setASupprimer(null);
      surFait(`${zone.nom} est supprimée.`, zone.parentId ?? undefined);
    } catch (e) {
      setErreurSuppression(messageErreur(e));
    } finally {
      setSuppressionEnCours(false);
    }
  };

  const noeudRetour = retour && (
    <div className="admin-retour">
      <p className="bandeau bandeau-envoye" role="status">
        {retour.texte}
      </p>
      {retour.annuler && (
        <button
          type="button"
          className="bouton bouton-secondaire bouton-petit"
          onClick={() => void retour.annuler?.()}
        >
          Annuler
        </button>
      )}
    </div>
  );

  const lignes = lignesDeLArbre(divisions ?? [], {
    groupesOuverts,
    repliees,
    choisie: choisie?.id ?? null,
    requete: recherche,
  });
  const parId = new Map((divisions ?? []).map((d) => [d.id, d]));

  const basculerGroupe = (id: string) =>
    setGroupesOuverts((avant) => {
      const apres = new Set(avant);
      if (apres.has(id)) apres.delete(id);
      else apres.add(id);
      return apres;
    });

  const basculerZone = (id: string) =>
    setRepliees((avant) => {
      const apres = new Set(avant);
      if (apres.has(id)) apres.delete(id);
      else apres.add(id);
      return apres;
    });

  const toutDeplier = () => {
    setRepliees(new Set());
    setGroupesOuverts(new Set(groupesDeLArbre(divisions ?? [])));
  };

  const toutReplier = () => {
    setRepliees(zonesAReplierPourTout(divisions ?? []));
    setGroupesOuverts(new Set());
  };

  const recherchee = recherche.trim() !== '';

  return (
    <div className="pile">
      <div className="admin-titre">
        <div>
          <h1>Zones</h1>
          <p className="texte-doux">
            Où NTanova envoie des relais, et ce que les familles voient sur la carte. Les relais
            peuvent relever partout au Congo-Brazzaville : « ouverte » dit seulement où l’on en
            envoie, jamais où il leur est interdit de relever.
          </p>
        </div>
        <div className="admin-vues" role="group" aria-label="Affichage des zones">
          <a
            className="admin-vue"
            href="#zones"
            aria-current={vue === 'arbre' ? 'true' : undefined}
            onClick={(e) => {
              e.preventDefault();
              aller('zones');
            }}
          >
            Arbre
          </a>
          <a
            className="admin-vue"
            href="#zones/etapes"
            aria-current={vue === 'etapes' ? 'true' : undefined}
            onClick={(e) => {
              e.preventDefault();
              aller('zones/etapes');
            }}
          >
            Par étape
          </a>
        </div>
      </div>

      {erreur && (
        <Bandeau ton="erreur" icone="alerte">
          <p>{erreur}</p>
        </Bandeau>
      )}

      {divisions === null && !erreur && (
        <p aria-busy="true" className="texte-doux">
          Chargement des zones…
        </p>
      )}

      {divisions !== null && vue === 'etapes' && (
        <>
          {noeudRetour}
          <VueParEtape
            divisions={divisions}
            occupee={occupee}
            surEtat={(z, etat) => void regler(z, etat)}
            surChoix={choisir}
          />
        </>
      )}

      {divisions !== null && vue === 'arbre' && (
        <div className={`admin-zones-deux${choisie ? ' avec-selection' : ''}`}>
          <section className="admin-arbre" aria-label="Liste des zones">
            <Champ libelle="Chercher une zone">
              {(a) => (
                <input
                  {...a}
                  className="champ"
                  type="search"
                  autoComplete="off"
                  value={recherche}
                  onChange={(ev) => setRecherche(ev.target.value)}
                />
              )}
            </Champ>
            <div className="admin-arbre-outils">
              <button type="button" className="bouton bouton-petit" onClick={() => setAjout(true)}>
                <Icone nom="plus" taille={16} />
                Ajouter une zone
              </button>
            </div>
            <div className="admin-arbre-entete">
              <p className="mention admin-arbre-resume">
                {phraseDuResume(resumeDesZones(divisions))}
              </p>
              {!recherchee && (
                <div
                  className="admin-arbre-plier"
                  role="group"
                  aria-label="Déplier ou replier l’arbre"
                >
                  <button
                    type="button"
                    className="bouton bouton-secondaire bouton-petit"
                    onClick={toutDeplier}
                  >
                    Tout déplier
                  </button>
                  <button
                    type="button"
                    className="bouton bouton-secondaire bouton-petit"
                    onClick={toutReplier}
                  >
                    Tout replier
                  </button>
                </div>
              )}
            </div>
            <ul className="admin-arbre-liste">
              {lignes.map((l) =>
                l.type === 'groupe' ? (
                  <li key={l.id}>
                    <button
                      type="button"
                      className="admin-zone-groupe"
                      style={{ '--retrait': l.indent } as CSSProperties}
                      aria-expanded={l.ouvert}
                      onClick={() => basculerGroupe(l.id)}
                    >
                      <span
                        className={`admin-chevron${l.ouvert ? ' est-ouvert' : ''}`}
                        aria-hidden="true"
                      >
                        <Icone nom="suivant" taille={14} />
                      </span>
                      <span className="admin-zone-texte">
                        <b>{l.nombre > 1 ? `${l.nombre} autres zones` : '1 autre zone'}</b>
                        <small>Aucune école, rien sur la carte</small>
                      </span>
                    </button>
                  </li>
                ) : (
                  <li
                    key={l.zone.id}
                    className="admin-zone-rang"
                    style={{ '--retrait': l.indent } as CSSProperties}
                  >
                    {l.dessous > 0 ? (
                      <button
                        type="button"
                        className="admin-zone-bascule"
                        aria-expanded={l.deplie}
                        aria-label={l.deplie ? 'Replier' : 'Déplier'}
                        aria-describedby={`zone-nom-${l.zone.id}`}
                        onClick={() => basculerZone(l.zone.id)}
                      >
                        <span
                          className={`admin-chevron${l.deplie ? ' est-ouvert' : ''}`}
                          aria-hidden="true"
                        >
                          <Icone nom="suivant" taille={14} />
                        </span>
                      </button>
                    ) : (
                      <span className="admin-zone-bascule est-vide" aria-hidden="true" />
                    )}
                    <button
                      type="button"
                      className="admin-zone-ligne"
                      aria-current={choisie?.id === l.zone.id ? 'true' : undefined}
                      onClick={() => choisir(l.zone)}
                    >
                      <span
                        className={`admin-pastille-etat admin-pastille-${
                          surLaCarte(l.zone) ? (l.zone.deploiement ?? 'aucun') : 'sans'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="admin-zone-texte">
                        <b id={`zone-nom-${l.zone.id}`}>{l.zone.nom}</b>
                        <small>
                          {libelleGenreDivision[l.zone.genre]}
                          {l.dansGroupe && l.zone.parentId && parId.get(l.zone.parentId)
                            ? ` · ${parId.get(l.zone.parentId)?.nom}`
                            : ''}
                          {surLaCarte(l.zone) ? ` · ${libelleEtat(l.zone.deploiement)}` : ''}
                          {l.dessous > 0 && !l.deplie
                            ? ` · ${l.dessous} ${l.dessous > 1 ? 'zones cachées' : 'zone cachée'}`
                            : ''}
                        </small>
                      </span>
                      <span className={`admin-nombre${l.zone.ecoles === 0 ? ' est-nul' : ''}`}>
                        {l.zone.ecoles}
                      </span>
                    </button>
                  </li>
                ),
              )}
            </ul>
            {recherche.trim() !== '' && lignes.length === 0 && (
              <p className="texte-doux">Aucune zone ne s’appelle ainsi.</p>
            )}
          </section>

          {choisie ? (
            <div className="admin-zone-detail">
              <a
                className="lien admin-retour-liste"
                href="#zones"
                onClick={(e) => {
                  e.preventDefault();
                  setRetour(null);
                  aller('zones');
                }}
              >
                ← Toutes les zones
              </a>
              <VoletDeZone
                zone={choisie}
                divisions={divisions}
                lots={lots}
                ouvertePar={ouvertePar}
                occupee={occupee === choisie.id}
                admin={admin}
                retour={noeudRetour}
                surEtat={(etat) => void regler(choisie, etat)}
                surOuverture={(ouverte) => demanderOuverture(choisie, ouverte)}
                surFait={surFait}
                surSuppression={setASupprimer}
              />
            </div>
          ) : (
            <div className="admin-volet-invite">
              {noeudRetour}
              <p className="texte-doux admin-invite-texte">
                Choisis une zone : tu y règles ce que voient les familles sur la carte et où NTanova
                envoie des relais.
              </p>
            </div>
          )}
        </div>
      )}

      {divisions !== null && (
        <>
          <h2>Les lots</h2>
          <div className="admin-tableau">
            <table>
              <thead>
                <tr>
                  <th scope="col">Lot</th>
                  <th scope="col">Zone</th>
                  <th scope="col">À rendre</th>
                  <th scope="col">Rendu</th>
                  <th scope="col">Relais actifs</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <b>{l.nom}</b>
                    </td>
                    <td>{cheminLisible(l.divisionId, divisions)}</td>
                    <td>{l.aRendreLe ? jour(l.aRendreLe) : '—'}</td>
                    <td>
                      {l.essai ? (
                        '—'
                      ) : l.renduLe ? (
                        <>
                          Rendu le {jour(l.renduLe)}{' '}
                          <button
                            type="button"
                            className="bouton bouton-secondaire bouton-petit"
                            disabled={enCoursLot}
                            onClick={() => void rendre(l, false)}
                          >
                            Remettre en cours
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="bouton bouton-secondaire bouton-petit"
                          disabled={enCoursLot}
                          onClick={() => void rendre(l, true)}
                        >
                          Marquer rendu
                        </button>
                      )}
                    </td>
                    <td>{relais.filter((r) => r.lotId === l.id && r.statut === 'actif').length}</td>
                    <td className="mention">
                      {l.essai
                        ? 'Entraînement : ses fiches ne sont jamais publiées.'
                        : 'Toute la zone.'}
                      {!ouvertePar.get(l.divisionId) &&
                        !l.essai &&
                        ' La zone est fermée : ouvre-la pour que les relais puissent envoyer.'}
                    </td>
                  </tr>
                ))}
                {lots.length === 0 && (
                  <tr>
                    <td colSpan={6} className="texte-doux">
                      Aucun lot.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {ajout && divisions !== null && (
        <Dialogue
          titre="Ajouter une zone"
          variante="tiroir"
          fermer={() => setAjout(false)}
          entete={<h2>Ajouter une zone</h2>}
        >
          <AjouterDivision
            divisions={divisions}
            estOuverte={(id) => ouvertePar.get(id) != null}
            admin={admin}
            parentInitial={choisie && choisie.niveau <= 3 ? choisie.id : ''}
            surFait={(texte, zoneId) => {
              setAjout(false);
              surFait(texte, zoneId);
            }}
          />
        </Dialogue>
      )}

      {aSupprimer && divisions !== null && (
        <Dialogue
          titre={`Supprimer ${aSupprimer.nom} ?`}
          variante="confirmation"
          libelleFermeture="Annuler"
          occupe={suppressionEnCours}
          fermer={() => {
            setASupprimer(null);
            setErreurSuppression(null);
          }}
          description="La suppression est définitive."
          entete={<h2>Supprimer {aSupprimer.nom} ?</h2>}
        >
          <div className="pile-serree">
            <p>
              <b>{cheminLisible(aSupprimer.id, divisions)}</b> est vide : elle disparaît de
              l’administration et du site à la prochaine mise à jour. C’est définitif, mais tu peux
              la rajouter avec la même adresse.
            </p>
            {erreurSuppression && (
              <p className="message-erreur" role="alert">
                {erreurSuppression}
              </p>
            )}
            <div className="choix-ligne">
              <Bouton
                variante="danger"
                disabled={suppressionEnCours}
                onClick={() => void supprimer(aSupprimer)}
              >
                Supprimer définitivement
              </Bouton>
            </div>
          </div>
        </Dialogue>
      )}

      {aConfirmer && (
        <Dialogue
          titre={`Ouvrir ${aConfirmer.nom} aux relais ?`}
          variante="confirmation"
          libelleFermeture="Annuler"
          fermer={() => setAConfirmer(null)}
          description={`${aConfirmer.nom} contient ${zonesDessous(aConfirmer, divisions ?? []).length} autres zones : elles s’ouvrent toutes avec elle.`}
          entete={<h2>Ouvrir {aConfirmer.nom} aux relais ?</h2>}
        >
          <div className="pile-serree">
            <p>
              Cela ouvre <b>{zonesDessous(aConfirmer, divisions ?? []).length} zones</b>. Tu pourras
              refermer {aConfirmer.nom} d’un coup, ou ouvrir zone par zone à la place.
            </p>
            <div className="choix-ligne">
              <Bouton
                onClick={() => {
                  const d = aConfirmer;
                  setAConfirmer(null);
                  void ouvrir(d, true);
                }}
              >
                Ouvrir {zonesDessous(aConfirmer, divisions ?? []).length} zones
              </Bouton>
            </div>
          </div>
        </Dialogue>
      )}
    </div>
  );
}
