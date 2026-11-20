import { v2 } from '@/ui/v2/classes';
import { cn } from '@/lib/utils';
import { erreursDeclaration } from '../../modele/declaration-ecole';
import { jourDuCongo } from '../../modele/date-declaration';
/**
 * Amorcer le catalogue sans attendre le terrain : ajouter une école à la main (institution, campus, niveaux,
 * formations), ou importer une liste (CSV ou JSON) avec une simulation d'abord. Ces écoles ont pour origine
 * « Ajoutée par NTanova » ou « Importée » : elles ne se comptent jamais comme relevées par un relais, et
 * aucune position n'est jamais inventée (sans position, l'école reste « à situer »).
 */
import { useEffect, useState } from 'react';
import {
  erreursCreation,
  formulaireCreationVide,
  versEntree,
  type FormulaireCreation,
} from '../../modele/creation-ecole';
import type { Erreurs } from '../../modele/fiche';
import { sansCycle } from '../../modele/formations';
import { cheminLisible } from '../../modele/geo-divisions';
import { lirePosition } from '../../modele/coordonnees';
import { distanceEnMots } from '../../modele/deja-sur-ntanova';
import type { EcoleSimilaire } from '../../modele/fiche-admin';
import { lireImportation, type LectureImport } from '../../modele/import-ecoles';
import { libelleNiveau, libelleTypeEcole } from '../../modele/libelles';
import { listes, type Valeur } from '../../modele/listes';
import type {
  DivisionVue,
  DomainePublic,
  PortAdministration,
  RapportImport,
} from '../../modele/ports';
import { ErreurDecision } from '../../modele/ports';
import { Champ, Choix } from '@/ui/v2/formulaire';
import { ChampPosition, messageErreur } from './ChampPosition';
import { Formations } from './Formations';

type Vue = 'une' | 'liste' | 'ecole';

/** « + Un site » (fondateur, 16/11) : le site s'ajoute à cette école ; son nom est repris, non modifiable. */
export interface EcoleDuSite {
  institutionId: string;
  nom: string;
}

function Division({
  valeur,
  divisions,
  surChange,
  aide,
}: {
  valeur: string;
  divisions: DivisionVue[];
  surChange: (v: string) => void;
  aide: string;
}) {
  return (
    <Champ libelle="Division" facultatif aide={aide}>
      {(a) => (
        <select
          {...a}
          className={v2.champ}
          value={valeur}
          onChange={(ev) => surChange(ev.target.value)}
        >
          <option value="">Détectée d’après la position</option>
          {divisions
            .filter((d) => d.niveau >= 2)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {cheminLisible(d.id, divisions)}
              </option>
            ))}
        </select>
      )}
    </Champ>
  );
}

function FormulaireUne({
  declaration = false,
  site,
  admin,
  divisions,
  domaines,
  surEnregistre,
  surAnnuler,
}: {
  declaration?: boolean;
  site?: EcoleDuSite | undefined;
  admin: PortAdministration;
  divisions: DivisionVue[];
  domaines: DomainePublic[];
  surEnregistre: (texte: string) => void;
  surAnnuler: () => void;
}) {
  // Un site reprend le nom de son école : les contrôles du formulaire le voient, il n'est pas à l'écran.
  const [champs, setChamps] = useState<FormulaireCreation>(() => ({
    ...formulaireCreationVide(),
    nom: site?.nom ?? '',
  }));
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [declareeLe, setDeclareeLe] = useState('');
  const [confirmee, setConfirmee] = useState(false);
  const [existe, setExiste] = useState<string | null>(null);
  // B (16/11) : une école du même nom, déjà connue (même endroit ou ailleurs). Rien ne se crée sans la réponse.
  const [connue, setConnue] = useState<EcoleSimilaire | null>(null);
  const [autreEcole, setAutreEcole] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const changer = (nouveaux: Partial<FormulaireCreation>) => {
    setChamps((avant) => ({ ...avant, ...nouveaux }));
    setExiste(null);
    setConfirmee(false);
    setConnue(null);
    setAutreEcole(false);
  };

  const basculerCycle = (n: Valeur<'niveau'>) =>
    changer(
      champs.cycles.includes(n)
        ? {
            cycles: champs.cycles.filter((x) => x !== n),
            formations: sansCycle(champs.formations, n),
          }
        : { cycles: listes.niveau.filter((x) => x === n || champs.cycles.includes(x)) },
    );

  /**
   * Un site d'une école connue : il se crée, puis se rattache à elle (`attach_campus_to_institution`, la même règle que
   * « C'est un site de… » ; l'école provisoire, sans autre site, disparaît). Le nom du site est obligatoire : il distingue
   * les sites d'une même école, et la base refuse un site du même nom au même endroit.
   */
  const creerUnSite = async (ecole: EcoleDuSite) => {
    if (champs.etiquette.trim() === '') {
      setErreurs({
        etiquette: 'Écris le nom du site (« Campus de Loandjili », « Site Collège »…).',
      });
      return;
    }
    const entree = versEntree({ ...champs, nom: ecole.nom });
    // Une déclaration de l'école garde sa date et sa confirmation, site ou école.
    const resultat = await admin.creerEcole(
      entree,
      declaration ? { declareeLe, confirmee } : undefined,
    );
    if (resultat.statut === 'existe') {
      setExiste(resultat.message ?? 'Ce site est déjà enregistré.');
      return;
    }
    const campusId = resultat.campusIds[0];
    try {
      if (campusId) await admin.rattacherSite(campusId, ecole.institutionId);
    } catch {
      throw new ErreurDecision(
        `Le site est créé, mais pas rattaché à ${ecole.nom} : ouvre sa fiche et choisis « C’est un site de… ».`,
      );
    }
    surEnregistre(`${entree.campus[0]?.etiquette ?? 'Le site'} est ajouté à ${ecole.nom}.`);
  };

  /** « Oui, un site de cette école » : le nom de l'école se lit dans la liste des institutions. */
  const unSiteDe = async (c: EcoleSimilaire) => {
    if (!c.institutionId) return;
    setErreur(null);
    setEnCours(true);
    try {
      const nom =
        (await admin.institutions()).find((i) => i.id === c.institutionId)?.nom ?? champs.nom;
      await creerUnSite({ institutionId: c.institutionId, nom });
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  };

  const enregistrer = async (ev?: { preventDefault: () => void }, sansDemander = autreEcole) => {
    ev?.preventDefault();
    setErreur(null);
    const trouvees = {
      ...erreursCreation(champs),
      ...(declaration ? erreursDeclaration({ declareeLe, confirmee }) : {}),
    };
    setErreurs(trouvees);
    if (Object.keys(trouvees).length > 0) return;
    setEnCours(true);
    try {
      if (site) {
        await creerUnSite(site);
        return;
      }
      // B : la base compare le nom (sans accents, majuscules ni mots génériques) et la distance (`similar_schools`).
      if (!sansDemander) {
        const proches = await admin.ecolesSimilaires(
          champs.nom,
          lirePosition(champs.position),
          null,
        );
        const meme = proches.find(
          (c) =>
            c.genre === 'campus' &&
            c.institutionId !== null &&
            (c.verdict === 'deja_la' || c.verdict === 'autre_site'),
        );
        if (meme) {
          setConnue(meme);
          return;
        }
      }
      const entree = versEntree(champs);
      const resultat = await admin.creerEcole(
        entree,
        declaration ? { declareeLe, confirmee } : undefined,
      );
      if (resultat.statut === 'existe') {
        setExiste(resultat.message ?? 'Cette école est déjà enregistrée.');
        return;
      }
      const sansPlace = entree.campus[0]?.position === null && !entree.campus[0]?.division;
      surEnregistre(
        sansPlace
          ? `${entree.nom} est ajoutée, à situer : donne sa position, ou confie-la à un relais.`
          : `${entree.nom} est ajoutée, prête : publie-la quand tu veux.`,
      );
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form
      className={v2.motifBlanc}
      aria-label={site ? `Ajouter un site à ${site.nom}` : 'Ajouter une école'}
      noValidate
      onSubmit={(ev) => void enregistrer(ev)}
    >
      <h2 className={v2.titreLarge}>{site ? `Un site de ${site.nom}` : 'Ajouter une école'}</h2>
      {declaration && (
        <>
          <p className={v2.mentionLarge}>
            Informations transmises par l’école pour publication. Cela ne confirme pas toute la
            fiche et ne remplace pas un passage sur place. Aucun numéro privé n’est publié ; le
            contact public se renseigne séparément avec son accord.
          </p>
          <Champ libelle="Date de déclaration de l’école" erreur={erreurs.declareeLe}>
            {(a) => (
              <input
                {...a}
                className={v2.champ}
                type="date"
                max={jourDuCongo()}
                value={declareeLe}
                onChange={(ev) => {
                  setDeclareeLe(ev.target.value);
                  setConfirmee(false);
                }}
              />
            )}
          </Champ>
          <div className={v2.large}>
            <label>
              <input
                type="checkbox"
                checked={confirmee}
                onChange={(ev) => setConfirmee(ev.target.checked)}
              />{' '}
              L’école a transmis ces informations pour publication.
            </label>
            {erreurs.confirmee && (
              <p className={v2.erreur} role="alert">
                {erreurs.confirmee}
              </p>
            )}
          </div>
        </>
      )}
      {site ? (
        <p className={v2.mentionLarge}>
          École : <b>{site.nom}</b>. Le nom, le type et le logo sont ceux de l’école ; ce site a sa
          position, ses niveaux et ses formations.
        </p>
      ) : (
        <Champ libelle="Nom de l’école" erreur={erreurs['nom']}>
          {(a) => (
            <input
              {...a}
              className={v2.champ}
              type="text"
              autoComplete="off"
              value={champs.nom}
              onChange={(ev) => changer({ nom: ev.target.value })}
            />
          )}
        </Champ>
      )}
      {!site && (
        <Champ libelle="Type d'école" erreur={erreurs['genre']}>
          {(a) => (
            <select
              {...a}
              className={v2.champ}
              value={champs.genre}
              onChange={(ev) => changer({ genre: ev.target.value as Valeur<'type_ecole'> })}
            >
              {(Object.keys(libelleTypeEcole) as Valeur<'type_ecole'>[]).map((t) => (
                <option key={t} value={t}>
                  {libelleTypeEcole[t]}
                </option>
              ))}
            </select>
          )}
        </Champ>
      )}
      <Champ
        libelle={site ? 'Nom du site' : 'Nom de l’implantation'}
        facultatif={!site}
        erreur={erreurs['etiquette']}
        aide={
          site
            ? '« Campus de Loandjili », « Site Collège » : ce qui distingue ce site des autres.'
            : '« Campus de Loandjili » : quand l’école a plusieurs implantations. Ajoute les autres ensuite avec « + Un site » sur sa fiche.'
        }
      >
        {(a) => (
          <input
            {...a}
            className={v2.champ}
            type="text"
            autoComplete="off"
            maxLength={120}
            value={champs.etiquette}
            onChange={(ev) => changer({ etiquette: ev.target.value })}
          />
        )}
      </Champ>
      <ChampPosition
        valeur={champs.position}
        surChange={(position) => changer({ position })}
        erreur={erreurs['position']}
        facultatif
      />
      <Division
        valeur={champs.division}
        divisions={divisions}
        surChange={(division) => changer({ division })}
        aide="Choisis une division connue, même sans position. La publication reste un geste séparé ; cela ne remplace pas un passage sur place."
      />
      <Champ libelle="Quartier, tel qu’on le dit sur place" facultatif erreur={erreurs['quartier']}>
        {(a) => (
          <input
            {...a}
            className={v2.champ}
            type="text"
            autoComplete="off"
            maxLength={100}
            value={champs.quartier}
            onChange={(ev) => changer({ quartier: ev.target.value })}
          />
        )}
      </Champ>
      <Champ libelle="Repère" facultatif erreur={erreurs['repere']}>
        {(a) => (
          <input
            {...a}
            className={v2.champ}
            type="text"
            autoComplete="off"
            value={champs.repere}
            onChange={(ev) => changer({ repere: ev.target.value })}
          />
        )}
      </Champ>
      {!declaration && (
        <Champ libelle="Numéro sur l'enseigne" facultatif erreur={erreurs['numeroEnseigne']}>
          {(a) => (
            <input
              {...a}
              className={v2.champ}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="+242 …"
              value={champs.numeroEnseigne}
              onChange={(ev) => changer({ numeroEnseigne: ev.target.value })}
            />
          )}
        </Champ>
      )}
      <Champ libelle="Programme et langues" facultatif erreur={erreurs['programme']}>
        {(a) => (
          <input
            {...a}
            className={v2.champ}
            type="text"
            autoComplete="off"
            value={champs.programme}
            onChange={(ev) => changer({ programme: ev.target.value })}
          />
        )}
      </Champ>
      <div className={v2.large}>
        <Choix
          legende="Niveaux"
          options={listes.niveau.map((n) => ({ valeur: n, libelle: libelleNiveau[n] }))}
          valeurs={champs.cycles}
          surChoix={basculerCycle}
          erreur={erreurs['cycles']}
        />
      </div>
      <Formations
        cycles={champs.cycles}
        formations={champs.formations}
        domaines={domaines}
        surChangement={(formations) => changer({ formations })}
        erreur={erreurs['formations']}
      />
      {connue && (
        <section
          className={cn(
            v2.large,
            'flex flex-col gap-3 rounded-xl border-2 border-ambre bg-attention px-5 py-4',
          )}
          aria-label="Est-ce une école connue ?"
        >
          <b className="font-serif text-xl">
            {connue.verdict === 'deja_la'
              ? 'Déjà dans la base ?'
              : 'Un autre site de cette école ?'}
          </b>
          <span>
            « {connue.nom} » existe déjà
            {connue.distanceM !== null ? `, ${distanceEnMots(connue.distanceM)}` : ''}.
          </span>
          <div className="flex flex-wrap gap-2.5" role="group" aria-label="Ta réponse">
            <button
              type="button"
              className={v2.bouton}
              disabled={enCours}
              onClick={() => void unSiteDe(connue)}
            >
              Oui, un site de cette école
            </button>
            <button
              type="button"
              className={v2.boutonSecondaire}
              disabled={enCours}
              onClick={() => {
                setAutreEcole(true);
                setConnue(null);
                void enregistrer(undefined, true);
              }}
            >
              Non, une autre école
            </button>
          </div>
        </section>
      )}
      {existe && (
        <p className={v2.bandeAttention} role="status">
          {existe}
        </p>
      )}
      {erreur && (
        <p className={v2.erreurLarge} role="alert">
          {erreur}
        </p>
      )}
      <div className={v2.actionsLarge}>
        <button type="submit" className={v2.bouton} disabled={enCours || connue !== null}>
          {site ? 'Ajouter le site' : 'Ajouter l’école'}
        </button>
        <button type="button" className={v2.boutonSecondaire} onClick={surAnnuler}>
          Annuler
        </button>
      </div>
    </form>
  );
}

const EXEMPLE_CSV =
  'reference;nom;genre;etiquette;division;quartier;repere;numero;latitude;longitude;programme;cycles;formations\n' +
  'ETB-001;[Lycée Exemple];privee;;congo.pointe_noire.pointe_noire.tie_tie;;[face au marché];;-4.79105;11.925;;lycee|college;lycee:Série C:sciences-technologies:c:bac:jour|lycee:Série G2:gestion:g2:bac:jour+soir';

function Importation({
  admin,
  domaines,
  surEnregistre,
  surAnnuler,
}: {
  admin: PortAdministration;
  domaines: DomainePublic[];
  surEnregistre: (texte: string) => void;
  surAnnuler: () => void;
}) {
  const [texte, setTexte] = useState('');
  // Le résultat de la dernière simulation, avec le texte qu'elle a lu : changer le texte l'écarte, car on ne
  // confirme jamais la simulation d'un autre texte.
  // Ticket 205 (A11) : le jour où l'école a dit le détail des formations, pour toute la liste ; rien d'avance.
  const [ditLe, setDitLe] = useState('');
  const [simulation, setSimulation] = useState<{
    texte: string;
    ditLe: string;
    lecture: LectureImport;
    rapport: RapportImport | null;
  } | null>(null);
  const aJour = simulation?.texte === texte && simulation.ditLe === ditLe;
  const lecture = aJour ? simulation.lecture : null;
  const rapport = aJour ? simulation.rapport : null;
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const lireFichier = async (fichier: File | undefined) => {
    if (fichier) setTexte(await fichier.text());
  };

  const simuler = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      const lu = lireImportation(texte, {
        domaines: domaines.map((d) => d.slug),
        ditLe: ditLe || null,
      });
      const rapport = lu.entrees.length > 0 ? await admin.importerEcoles(lu.entrees, true) : null;
      setSimulation({ texte, ditLe, lecture: lu, rapport });
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  const importer = async () => {
    if (!lecture) return;
    setErreur(null);
    setEnCours(true);
    try {
      const fait = await admin.importerEcoles(lecture.entrees, false);
      surEnregistre(
        `${fait.creees} école${fait.creees > 1 ? 's' : ''} importée${fait.creees > 1 ? 's' : ''}` +
          (fait.existantes > 0
            ? `, ${fait.existantes} déjà connue${fait.existantes > 1 ? 's' : ''}`
            : '') +
          (fait.erreurs.length > 0
            ? `, ${fait.erreurs.length} en erreur (non importée${fait.erreurs.length > 1 ? 's' : ''})`
            : '') +
          '. Elles sont prêtes (avec leur position) ou à situer : rien n’est publié.',
      );
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  // Les erreurs de la base sont rapportées par rang dans la liste envoyée : on les remet au numéro de ligne du fichier.
  const erreursBase = (rapport?.erreurs ?? []).map((e) => ({
    ...e,
    ligne: lecture?.lignes[e.ligne - 1] ?? e.ligne,
  }));
  const toutesErreurs = [...(lecture?.erreurs ?? []), ...erreursBase].sort(
    (a, b) => a.ligne - b.ligne,
  );
  const apteAImporter = rapport !== null && rapport.creees > 0 && !enCours;

  return (
    <section className={v2.motifBlanc} aria-label="Importer des écoles">
      <h2 className={v2.titreLarge}>Importer une liste d’écoles</h2>
      <p className={v2.mentionLarge}>
        CSV (séparé par des points-virgules ou des virgules) ou JSON. Une ligne par implantation ;
        des lignes de même référence sont les implantations d’une même école. Les écoles importées
        ne sont jamais publiées d’office, et sans position elles restent « à situer ».
      </p>
      <details className={v2.large}>
        <summary>Voir le format et un exemple</summary>
        <p className={v2.mention}>
          Colonnes : reference, nom, genre, etiquette, division (chemin ou identifiant), quartier,
          repere, numero, latitude, longitude, programme, cycles (séparés par « | »), formations (
          <code>cycle:titre:domaine:série:diplôme:rythmes</code>, séparées par « | », rythmes
          séparés par « + »). Le JSON suit le même modèle (voir <code>supabase/schema.md</code>) ;
          une formation y dit aussi <code>dureeAnnees</code>, <code>niveauDemande</code> et{' '}
          <code>ditLe</code> (le jour où l’école l’a dit).
        </p>
        <pre className={v2.mention}>{EXEMPLE_CSV}</pre>
      </details>
      <Champ libelle="Le fichier (ou colle son contenu ci-dessous)" facultatif>
        {(a) => (
          <input
            {...a}
            className={v2.champ}
            type="file"
            accept=".csv,.json,.txt,text/csv,application/json,text/plain"
            onChange={(ev) => void lireFichier(ev.target.files?.[0])}
          />
        )}
      </Champ>
      <div className={v2.large}>
        <Champ libelle="Contenu de la liste">
          {(a) => (
            <textarea
              {...a}
              className={v2.zone}
              rows={8}
              spellCheck={false}
              value={texte}
              onChange={(ev) => setTexte(ev.target.value)}
            />
          )}
        </Champ>
      </div>
      <Champ libelle="Détail des formations dit par l’école le" facultatif>
        {(a) => (
          <input
            {...a}
            className={v2.champ}
            type="date"
            max={jourDuCongo()}
            value={ditLe}
            onChange={(ev) => setDitLe(ev.target.value)}
          />
        )}
      </Champ>
      <div className={v2.actionsLarge}>
        <button
          type="button"
          className={v2.bouton}
          disabled={enCours || texte.trim() === ''}
          onClick={() => void simuler()}
        >
          Vérifier (simulation, rien n’est écrit)
        </button>
        <button type="button" className={v2.boutonSecondaire} onClick={surAnnuler}>
          Annuler
        </button>
      </div>

      {rapport && (
        <p className={v2.bandeSucces} role="status">
          Simulation : {rapport.total} école{rapport.total > 1 ? 's' : ''} lue
          {rapport.total > 1 ? 's' : ''} — {rapport.creees} à créer, {rapport.existantes} déjà
          connue{rapport.existantes > 1 ? 's' : ''}, {rapport.erreurs.length} refusée
          {rapport.erreurs.length > 1 ? 's' : ''} par la base.
        </p>
      )}
      {toutesErreurs.length > 0 && (
        <div className={v2.large} role="alert">
          <p className={v2.erreur}>
            {toutesErreurs.length} ligne{toutesErreurs.length > 1 ? 's' : ''} à corriger (elles ne
            seront pas importées) :
          </p>
          <ul>
            {toutesErreurs.map((e, i) => (
              <li key={`${e.ligne}-${i}`} className={v2.mention}>
                Ligne {e.ligne}
                {e.nom ? ` (${e.nom})` : ''} : {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {apteAImporter && (
        <div className={v2.actionsLarge}>
          <button type="button" className={v2.bouton} onClick={() => void importer()}>
            Importer {rapport.creees} école{rapport.creees > 1 ? 's' : ''} pour de bon
          </button>
        </div>
      )}
      {erreur && (
        <p className={v2.erreurLarge} role="alert">
          {erreur}
        </p>
      )}
    </section>
  );
}

export function Creation({
  admin,
  divisions,
  site,
  surEnregistre,
  surAnnuler,
}: {
  site?: EcoleDuSite;
  admin: PortAdministration;
  divisions: DivisionVue[];
  surEnregistre: (texte: string) => void;
  surAnnuler: () => void;
}) {
  const [vue, setVue] = useState<Vue>('une');
  const [domaines, setDomaines] = useState<DomainePublic[]>([]);

  useEffect(() => {
    void admin
      .domaines()
      .then(setDomaines)
      .catch(() => setDomaines([]));
  }, [admin]);

  if (site)
    return (
      <FormulaireUne
        site={site}
        admin={admin}
        divisions={divisions}
        domaines={domaines}
        surEnregistre={surEnregistre}
        surAnnuler={surAnnuler}
      />
    );

  return (
    <div className={v2.pile}>
      <Choix
        legende="Comment ajouter"
        options={[
          { valeur: 'une', libelle: 'Une école' },
          { valeur: 'ecole', libelle: 'Déclaration d’une école' },
          { valeur: 'liste', libelle: 'Une liste (CSV ou JSON)' },
        ]}
        valeurs={[vue]}
        surChoix={setVue}
      />
      {vue !== 'liste' ? (
        <FormulaireUne
          key={vue}
          declaration={vue === 'ecole'}
          admin={admin}
          divisions={divisions}
          domaines={domaines}
          surEnregistre={surEnregistre}
          surAnnuler={surAnnuler}
        />
      ) : (
        <Importation
          admin={admin}
          domaines={domaines}
          surEnregistre={surEnregistre}
          surAnnuler={surAnnuler}
        />
      )}
    </div>
  );
}
