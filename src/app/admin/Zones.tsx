/**
 * Les zones et les lots. La géographie va du pays au quartier ; une zone est fermée aux relais tant qu'on ne l'ouvre pas
 * (ouvrir une ville ouvre tout ce qu'elle contient), et un lot se pose sur n'importe quelle ville, n'importe quel
 * arrondissement ou quartier.
 *
 * L'arbre à gauche garde sa place, le volet de la zone choisie défile à droite, comme « À valider » (audit de
 * l'administration, 07/11/2026). Une seconde vue range les zones par étape de la carte. Ouvrir une zone n'est pas annoncer
 * une couverture : le site n'affiche que ce qui est publié.
 */
import { v2 } from '@/ui/v2/classes';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { cheminLisible } from '../../modele/geo-divisions';
import { libelleGenreDivision } from '../../modele/libelles';
import type { DivisionVue, LotVu, PortAdministration, RelaisVu } from '../../modele/ports';
import {
  SEUIL_OUVERTURE_LARGE,
  ancetresDe,
  lignesDeLArbre,
  libelleEtat,
  phraseDuResume,
  resumeDesZones,
  surLaCarte,
  zonesDessous,
  type EtatCarte,
} from '../../modele/zones-admin';
import { libelleDeploiement } from '../../modele/etat-zone';
import { Bandeau } from '@/ui/v2/formulaire';
import { cn } from '@/lib/utils';
import { IconeAjouter, IconeBas, IconeChercher, IconeOuvrir } from '@/ui/shadcn/icones';
import { jour } from '../../ui/composants';
import { Bouton, Dialogue } from '@/ui/v2/admin';
import { aller, useAdresse } from '../commun/adresse';
import { messageErreur } from './ChampPosition';
import { AjouterDivision, NouveauLot } from './ZonesFormulaires';
import { VoletDeZone } from './ZonesVolet';
import { TitreEcran } from './Cadre';

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
  const [lotsOuverts, setLotsOuverts] = useState(false);
  const [, sous] = useAdresse();

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

  const choisie = (divisions ?? []).find((d) => d.id === sous) ?? null;

  // Une zone choisie par son adresse, ou depuis l'autre vue, se montre dans la liste même quand celle-ci défile.
  const idChoisie = choisie?.id;
  const chargee = divisions !== null;
  useEffect(() => {
    if (!idChoisie) return;
    document
      .querySelector('[aria-label="Liste des zones"] [aria-current="true"]')
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
    <div className="flex flex-wrap items-center gap-2">
      <p className={cn(v2.bandeSucces, 'flex-1')} role="status">
        {retour.texte}
      </p>
      {retour.annuler && (
        <button
          type="button"
          className={v2.boutonSecondairePetit}
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

  // La pastille d'une zone (planche) : verte « Relevé en cours », jaune « Déploiement programmé », creuse sinon.
  const pastille = (d: DivisionVue) =>
    !surLaCarte(d)
      ? 'border-2 border-input bg-transparent'
      : d.deploiement === 'actif'
        ? 'bg-primary'
        : 'border-2 border-foreground bg-jaune';
  const retrait = (n: number) => ({ paddingLeft: `${0.5 + n * 1.1}rem` }) as CSSProperties;

  return (
    <>
      <TitreEcran
        titre="Zones"
        retour={choisie ? { libelle: 'Zones', chemin: 'zones' } : null}
        titreHaut={choisie?.nom ?? null}
        regles={
          <>
            <p>
              Où NTanova envoie des relais, et ce que les familles voient sur la carte. Les relais
              peuvent relever partout au Congo-Brazzaville : « ouverte » dit seulement où l’on en
              envoie, jamais où il leur est interdit de relever.
            </p>
            <p>{divisions && phraseDuResume(resumeDesZones(divisions))}</p>
          </>
        }
        actions={
          <span className="max-lg:hidden">
            <Bouton onClick={() => setAjout(true)}>
              <IconeAjouter className="size-5" aria-hidden />
              Ajouter une zone
            </Bouton>
          </span>
        }
      />

      {erreur && (
        <Bandeau ton="erreur" icone="alerte">
          <p>{erreur}</p>
        </Bandeau>
      )}

      {divisions === null && !erreur && (
        <p aria-busy="true" className={v2.doux}>
          Chargement des zones…
        </p>
      )}

      {divisions !== null && (
        <div className="flex items-start gap-5">
          <section
            className={cn(
              'flex w-full flex-col gap-3 lg:sticky lg:top-6 lg:w-[300px] lg:shrink-0',
              choisie && 'max-lg:hidden',
            )}
            aria-label="Liste des zones"
          >
            <div className="flex items-center gap-2">
              <label className="relative flex-1">
                <span className="sr-only">Chercher une zone</span>
                <IconeChercher
                  className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  className={cn(v2.champ, 'h-12 pl-11')}
                  type="search"
                  autoComplete="off"
                  placeholder="Chercher une zone"
                  value={recherche}
                  onChange={(ev) => setRecherche(ev.target.value)}
                />
              </label>
              <button
                type="button"
                aria-label="Ajouter une zone"
                onClick={() => setAjout(true)}
                className={cn(v2.bouton, 'size-12 px-0 lg:hidden')}
              >
                <IconeAjouter className="size-6" aria-hidden />
              </button>
            </div>
            <ul className="m-0 flex max-h-[calc(100dvh-12rem)] list-none flex-col overflow-y-auto rounded-xl border border-border bg-card p-0 max-lg:max-h-none">
              {lignes.map((l) =>
                l.type === 'groupe' ? (
                  <li key={l.id} className="border-t border-border first:border-t-0">
                    <button
                      type="button"
                      style={retrait(l.indent)}
                      aria-expanded={l.ouvert}
                      onClick={() => basculerGroupe(l.id)}
                      className="flex min-h-14 w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent py-2 pr-3 text-left font-sans text-foreground"
                    >
                      <IconeOuvrir
                        className={cn(
                          'size-4 shrink-0 transition-transform',
                          l.ouvert && 'rotate-90',
                        )}
                        aria-hidden
                      />
                      <span className="flex flex-col">
                        <b className="text-[15px]">
                          {l.nombre > 1 ? `${l.nombre} autres zones` : '1 autre zone'}
                        </b>
                        <small className="text-[13px] text-muted-foreground">
                          Aucune école, rien sur la carte
                        </small>
                      </span>
                    </button>
                  </li>
                ) : (
                  <li
                    key={l.zone.id}
                    className="flex items-center border-t border-border first:border-t-0"
                    style={retrait(l.indent)}
                  >
                    {l.dessous > 0 ? (
                      <button
                        type="button"
                        aria-expanded={l.deplie}
                        aria-label={l.deplie ? 'Replier' : 'Déplier'}
                        aria-describedby={`zone-nom-${l.zone.id}`}
                        onClick={() => basculerZone(l.zone.id)}
                        className="flex size-8 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-foreground"
                      >
                        <IconeBas
                          className={cn('size-4 transition-transform', !l.deplie && '-rotate-90')}
                          aria-hidden
                        />
                      </button>
                    ) : (
                      <span className="size-8 shrink-0" aria-hidden="true" />
                    )}
                    <button
                      type="button"
                      aria-current={choisie?.id === l.zone.id ? 'true' : undefined}
                      onClick={() => choisir(l.zone)}
                      className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-2.5 border-0 bg-transparent py-2 pr-3 text-left font-sans text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring aria-[current=true]:bg-succes aria-[current=true]:shadow-[inset_0_0_0_2px_var(--marque)]"
                    >
                      <span
                        className={cn('size-3 shrink-0 rounded-full', pastille(l.zone))}
                        aria-hidden="true"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <b id={`zone-nom-${l.zone.id}`} className="text-[15px]">
                          {l.zone.nom}
                        </b>
                        <small className="text-[13px] leading-snug text-muted-foreground">
                          {libelleGenreDivision[l.zone.genre]}
                          {l.dansGroupe && l.zone.parentId && parId.get(l.zone.parentId)
                            ? ` · ${parId.get(l.zone.parentId)?.nom}`
                            : ''}
                          {surLaCarte(l.zone) ? ` · ${libelleEtat(l.zone.deploiement)}` : ''}
                        </small>
                      </span>
                      <span
                        className={cn(
                          'font-serif text-lg font-bold',
                          l.zone.ecoles === 0 && 'text-muted-foreground',
                        )}
                      >
                        {l.zone.ecoles}
                      </span>
                    </button>
                  </li>
                ),
              )}
              {recherche.trim() !== '' && lignes.length === 0 && (
                <li className="px-4 py-3 text-muted-foreground">Aucune zone ne s’appelle ainsi.</li>
              )}
            </ul>
            {
              <button
                type="button"
                onClick={() => setLotsOuverts(true)}
                className="self-start border-0 bg-transparent p-0 font-sans text-sm text-muted-foreground underline"
              >
                Les lots (secteurs conseillés) · {lots.length}
              </button>
            }
          </section>

          {choisie ? (
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {noeudRetour}
              <VoletDeZone
                zone={choisie}
                divisions={divisions}
                lots={lots}
                ouvertePar={ouvertePar}
                occupee={occupee === choisie.id}
                admin={admin}
                retour={null}
                surEtat={(etat) => void regler(choisie, etat)}
                surOuverture={(ouverte) => demanderOuverture(choisie, ouverte)}
                surFait={surFait}
                surSuppression={setASupprimer}
              />
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col gap-3 max-lg:hidden">
              {noeudRetour}
              <p className="m-0 rounded-xl border border-dashed border-input p-6 text-muted-foreground">
                Choisis une zone : tu y règles ce que voient les familles sur la carte et où NTanova
                envoie des relais.
              </p>
            </div>
          )}
        </div>
      )}

      {lotsOuverts && divisions !== null && (
        <Dialogue
          titre="Les lots"
          variante="tiroir"
          fermer={() => setLotsOuverts(false)}
          entete={<h2>Les lots (secteurs conseillés)</h2>}
        >
          <div className={v2.tableau}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Lot</th>
                  <th scope="col">Zone</th>
                  <th scope="col">Rendu</th>
                  <th scope="col">Relais</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <b>{l.nom}</b>
                      {l.essai && (
                        <span className={v2.mentionBloc}>Entraînement : jamais publié</span>
                      )}
                    </td>
                    <td>{cheminLisible(l.divisionId, divisions)}</td>
                    <td>
                      {l.essai ? (
                        '—'
                      ) : l.renduLe ? (
                        <>
                          Rendu le {jour(l.renduLe)}{' '}
                          <button
                            type="button"
                            className={cn(v2.lien, 'min-h-0 text-sm')}
                            disabled={enCoursLot}
                            onClick={() => void rendre(l, false)}
                          >
                            Remettre en cours
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={v2.boutonSecondairePetit}
                          disabled={enCoursLot}
                          onClick={() => void rendre(l, true)}
                        >
                          Marquer rendu
                        </button>
                      )}
                    </td>
                    <td>{relais.filter((r) => r.lotId === l.id && r.statut === 'actif').length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className={v2.plie}>
            <summary>Créer un lot</summary>
            <NouveauLot
              divisions={divisions}
              estOuverte={(id) => ouvertePar.get(id) != null}
              admin={admin}
              surFait={(texte: string) => {
                setLotsOuverts(false);
                surFait(texte);
              }}
              zoneInitiale={choisie?.id ?? ''}
            />
          </details>
        </Dialogue>
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
          <div className={v2.pileSerree}>
            <p>
              <b>{cheminLisible(aSupprimer.id, divisions)}</b> est vide : elle disparaît de
              l’administration et du site à la prochaine mise à jour. C’est définitif, mais tu peux
              la rajouter avec la même adresse.
            </p>
            {erreurSuppression && (
              <p className={v2.erreur} role="alert">
                {erreurSuppression}
              </p>
            )}
            <div className={v2.ligneChoix}>
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
          <div className={v2.pileSerree}>
            <p>
              Cela ouvre <b>{zonesDessous(aConfirmer, divisions ?? []).length} zones</b>. Tu pourras
              refermer {aConfirmer.nom} d’un coup, ou ouvrir zone par zone à la place.
            </p>
            <div className={v2.ligneChoix}>
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
    </>
  );
}
