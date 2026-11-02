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
import { lireImportation, type LectureImport } from '../../modele/import-ecoles';
import { libelleNiveau, libelleTypeEcole } from '../../modele/libelles';
import { listes, type Valeur } from '../../modele/listes';
import type {
  DivisionVue,
  DomainePublic,
  PortAdministration,
  RapportImport,
} from '../../modele/ports';
import { Champ, Choix } from '../../ui/composants';
import { ChampPosition, messageErreur } from './ChampPosition';
import { Formations } from './Formations';

type Vue = 'une' | 'liste';

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
          className="champ"
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
  admin,
  divisions,
  domaines,
  surEnregistre,
  surAnnuler,
}: {
  admin: PortAdministration;
  divisions: DivisionVue[];
  domaines: DomainePublic[];
  surEnregistre: (texte: string) => void;
  surAnnuler: () => void;
}) {
  const [champs, setChamps] = useState<FormulaireCreation>(formulaireCreationVide);
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [existe, setExiste] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const changer = (nouveaux: Partial<FormulaireCreation>) => {
    setChamps((avant) => ({ ...avant, ...nouveaux }));
    setExiste(null);
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

  const enregistrer = async (ev: { preventDefault: () => void }) => {
    ev.preventDefault();
    setErreur(null);
    const trouvees = erreursCreation(champs);
    setErreurs(trouvees);
    if (Object.keys(trouvees).length > 0) return;
    setEnCours(true);
    try {
      const entree = versEntree(champs);
      const resultat = await admin.creerEcole(entree);
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
      className="admin-motif carte-blanche"
      aria-label="Ajouter une école"
      noValidate
      onSubmit={(ev) => void enregistrer(ev)}
    >
      <h2 className="titre-section admin-pleine-largeur">Ajouter une école</h2>
      <Champ libelle="Nom de l’école" erreur={erreurs['nom']}>
        {(a) => (
          <input
            {...a}
            className="champ"
            type="text"
            autoComplete="off"
            value={champs.nom}
            onChange={(ev) => changer({ nom: ev.target.value })}
          />
        )}
      </Champ>
      <Champ libelle="Type d'école" erreur={erreurs['genre']}>
        {(a) => (
          <select
            {...a}
            className="champ"
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
      <Champ
        libelle="Nom de l’implantation"
        facultatif
        erreur={erreurs['etiquette']}
        aide="« Campus de Loandjili » : quand l’école a plusieurs implantations. Ajoute les autres ensuite avec « Nouvelle implantation » en validant un relevé, ou par une importation."
      >
        {(a) => (
          <input
            {...a}
            className="champ"
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
        aide="Sans position, choisis la division où est l’école : elle devient prête à publier. Sans position ni division, elle reste « à situer »."
      />
      <Champ libelle="Quartier, tel qu’on le dit sur place" facultatif erreur={erreurs['quartier']}>
        {(a) => (
          <input
            {...a}
            className="champ"
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
            className="champ"
            type="text"
            autoComplete="off"
            value={champs.repere}
            onChange={(ev) => changer({ repere: ev.target.value })}
          />
        )}
      </Champ>
      <Champ libelle="Numéro sur l'enseigne" facultatif erreur={erreurs['numeroEnseigne']}>
        {(a) => (
          <input
            {...a}
            className="champ"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+242 …"
            value={champs.numeroEnseigne}
            onChange={(ev) => changer({ numeroEnseigne: ev.target.value })}
          />
        )}
      </Champ>
      <Champ libelle="Programme et langues" facultatif erreur={erreurs['programme']}>
        {(a) => (
          <input
            {...a}
            className="champ"
            type="text"
            autoComplete="off"
            value={champs.programme}
            onChange={(ev) => changer({ programme: ev.target.value })}
          />
        )}
      </Champ>
      <div className="admin-pleine-largeur">
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
      {existe && (
        <p className="bandeau bandeau-attente admin-pleine-largeur" role="status">
          {existe}
        </p>
      )}
      {erreur && (
        <p className="message-erreur admin-pleine-largeur" role="alert">
          {erreur}
        </p>
      )}
      <div className="admin-actions admin-pleine-largeur">
        <button type="submit" className="bouton" disabled={enCours}>
          Ajouter l’école
        </button>
        <button type="button" className="bouton bouton-secondaire" onClick={surAnnuler}>
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
  const [simulation, setSimulation] = useState<{
    texte: string;
    lecture: LectureImport;
    rapport: RapportImport | null;
  } | null>(null);
  const lecture = simulation?.texte === texte ? simulation.lecture : null;
  const rapport = simulation?.texte === texte ? simulation.rapport : null;
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const lireFichier = async (fichier: File | undefined) => {
    if (fichier) setTexte(await fichier.text());
  };

  const simuler = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      const lu = lireImportation(texte, { domaines: domaines.map((d) => d.slug) });
      const rapport = lu.entrees.length > 0 ? await admin.importerEcoles(lu.entrees, true) : null;
      setSimulation({ texte, lecture: lu, rapport });
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
    <section className="admin-motif carte-blanche" aria-label="Importer des écoles">
      <h2 className="titre-section admin-pleine-largeur">Importer une liste d’écoles</h2>
      <p className="mention admin-pleine-largeur">
        CSV (séparé par des points-virgules ou des virgules) ou JSON. Une ligne par implantation ;
        des lignes de même référence sont les implantations d’une même école. Les écoles importées
        ne sont jamais publiées d’office, et sans position elles restent « à situer ».
      </p>
      <details className="admin-pleine-largeur">
        <summary>Voir le format et un exemple</summary>
        <p className="mention">
          Colonnes : reference, nom, genre, etiquette, division (chemin ou identifiant), quartier,
          repere, numero, latitude, longitude, programme, cycles (séparés par « | »), formations (
          <code>cycle:titre:domaine:série:diplôme:rythmes</code>, séparées par « | », rythmes
          séparés par « + »). Le JSON suit le même modèle (voir <code>supabase/schema.md</code>).
        </p>
        <pre className="mention">{EXEMPLE_CSV}</pre>
      </details>
      <Champ libelle="Le fichier (ou colle son contenu ci-dessous)" facultatif>
        {(a) => (
          <input
            {...a}
            className="champ"
            type="file"
            accept=".csv,.json,.txt,text/csv,application/json,text/plain"
            onChange={(ev) => void lireFichier(ev.target.files?.[0])}
          />
        )}
      </Champ>
      <div className="admin-pleine-largeur">
        <Champ libelle="Contenu de la liste">
          {(a) => (
            <textarea
              {...a}
              className="champ"
              rows={8}
              spellCheck={false}
              value={texte}
              onChange={(ev) => setTexte(ev.target.value)}
            />
          )}
        </Champ>
      </div>
      <div className="admin-actions admin-pleine-largeur">
        <button
          type="button"
          className="bouton"
          disabled={enCours || texte.trim() === ''}
          onClick={() => void simuler()}
        >
          Vérifier (simulation, rien n’est écrit)
        </button>
        <button type="button" className="bouton bouton-secondaire" onClick={surAnnuler}>
          Annuler
        </button>
      </div>

      {rapport && (
        <p className="bandeau bandeau-public admin-pleine-largeur" role="status">
          Simulation : {rapport.total} école{rapport.total > 1 ? 's' : ''} lue
          {rapport.total > 1 ? 's' : ''} — {rapport.creees} à créer, {rapport.existantes} déjà
          connue{rapport.existantes > 1 ? 's' : ''}, {rapport.erreurs.length} refusée
          {rapport.erreurs.length > 1 ? 's' : ''} par la base.
        </p>
      )}
      {toutesErreurs.length > 0 && (
        <div className="admin-pleine-largeur" role="alert">
          <p className="message-erreur">
            {toutesErreurs.length} ligne{toutesErreurs.length > 1 ? 's' : ''} à corriger (elles ne
            seront pas importées) :
          </p>
          <ul>
            {toutesErreurs.map((e, i) => (
              <li key={`${e.ligne}-${i}`} className="mention">
                Ligne {e.ligne}
                {e.nom ? ` (${e.nom})` : ''} : {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {apteAImporter && (
        <div className="admin-actions admin-pleine-largeur">
          <button type="button" className="bouton" onClick={() => void importer()}>
            Importer {rapport.creees} école{rapport.creees > 1 ? 's' : ''} pour de bon
          </button>
        </div>
      )}
      {erreur && (
        <p className="message-erreur admin-pleine-largeur" role="alert">
          {erreur}
        </p>
      )}
    </section>
  );
}

export function Creation({
  admin,
  divisions,
  surEnregistre,
  surAnnuler,
}: {
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

  return (
    <div className="pile">
      <Choix
        legende="Comment ajouter"
        options={[
          { valeur: 'une', libelle: 'Une école' },
          { valeur: 'liste', libelle: 'Une liste (CSV ou JSON)' },
        ]}
        valeurs={[vue]}
        surChoix={setVue}
      />
      {vue === 'une' ? (
        <FormulaireUne
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
