import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CHAMPS,
  CODES,
  controler,
  DECISIONS,
  lireIssue,
  nettoyer,
  proposeUnNouvelEnvoi,
  REGLAGES,
  REORIENTATIONS,
  revisionDeLEnvoi,
  type Contenu,
  type Nature,
  type NomDeChamp,
} from '../../src/modele/demandes';
import { listes } from '../../src/modele/listes';

// Les messages reçus (refonte publique, lot 3B1) : le modèle dit les erreurs avant l'envoi, la base les contrôle de nouveau.
// Les deux se comparent ici ; le comportement de la base est éprouvé par pgTAP (`supabase/tests/messages_*.test.sql`).

const stockage = readFileSync('supabase/migrations/20261124140000_messages_stockage.sql', 'utf8');
const envoi = readFileSync('supabase/migrations/20261124140100_messages_envoi.sql', 'utf8');
const traitement = readFileSync(
  'supabase/migrations/20261124140200_messages_traitement.sql',
  'utf8',
);

/** Le nom de chaque champ dans la base, que seul l'adaptateur traduira. */
const DANS_LA_BASE: Record<NomDeChamp, string> = {
  origine: 'origin',
  sujet: 'subject',
  message: 'message',
  nomEcole: 'school_name',
  ville: 'town',
  repere: 'landmark',
  autreChose: 'other_details',
  niveaux: 'levels',
  deLEcole: 'is_from_school',
  fiche: 'campus_id',
  information: 'topic',
  correction: 'correction',
  source: 'knowledge',
  aRetirer: 'removal',
  precision: 'removal_details',
  reponse: 'reply',
  coordonnee: 'contact',
  nomPersonne: 'person_name',
};
const contact = (plus: Contenu = {}): Contenu => ({
  origine: 'direct',
  message: 'Bonjour',
  reponse: 'non',
  ...plus,
});

describe('le modèle et la base disent la même chose', () => {
  it('les mêmes champs, pour les mêmes natures, avec les mêmes bornes', () => {
    const lignes = [
      ...envoi.matchAll(
        /\('(\w+)',\s+'\{([^}]*)\}'(?:::text\[\])?,\s+'(\w+)',\s+(null|\d+), '\{([^}]*)\}'/g,
      ),
    ].map(([, nom, natures, , longueur, requis]) => ({
      nom,
      natures: natures!.split(','),
      longueur: longueur === 'null' ? undefined : Number(longueur),
      requis: requis === '' ? [] : requis!.split(','),
    }));
    expect(lignes).toEqual(
      CHAMPS.map((c) => ({
        nom: DANS_LA_BASE[c.nom],
        natures: [...c.natures],
        longueur: c.longueur,
        requis: [...c.requis],
      })),
    );
  });

  it('les mêmes valeurs de départ', () => {
    const defaut = (colonne: string) =>
      new RegExp(`${colonne} (?:interval|integer) not null default '?(\\d+)`).exec(stockage)?.[1];
    expect({
      validiteJours: Number(defaut('pass_validity')),
      indesirableJours: Number(defaut('spam_retention')),
      closeMois: Number(defaut('closed_retention')),
      ecrituresParCle: Number(defaut('key_writes_max')),
      suitesParCle: Number(defaut('key_followups_max')),
      creationsParHeure: Number(defaut('connection_creations_per_hour')),
      ecrituresParHeure: Number(defaut('connection_writes_per_hour')),
      creationsParJour: Number(defaut('daily_creations_max')),
      ecrituresParJour: Number(defaut('daily_writes_max')),
    }).toEqual(REGLAGES);
    // Ce qui rend toute empreinte inutile après la purge.
    expect(REGLAGES.validiteJours).toBeLessThan(REGLAGES.indesirableJours);
  });

  it('les mêmes décisions, et chacune existe dans la liste', () => {
    for (const nature of listes.public_request_kind) {
      const sql = new RegExp(`when '${nature}' then array\\[([^\\]]*)\\]`).exec(traitement)?.[1];
      const valeurs = [...(sql ?? '').matchAll(/'(\w+)'/g)].map((m) => m[1]);
      expect(valeurs, nature).toEqual([...DECISIONS[nature]]);
      for (const d of DECISIONS[nature]) expect(listes.public_request_decision).toContain(d);
    }
  });

  it('les mêmes réorientations', () => {
    expect(traitement).toContain(
      "(d.kind = 'contact' and p_kind in ('absente', 'erreur', 'retrait')) or (d.kind = 'retrait' and p_kind = 'erreur')",
    );
    expect(REORIENTATIONS).toEqual({
      contact: ['absente', 'erreur', 'retrait'],
      absente: [],
      erreur: [],
      retrait: ['erreur'],
    });
  });

  it('chaque code que la base rend est connu, et aucun n’est en trop', () => {
    const rendus = new Set(
      [...envoi.matchAll(/'code', '(\w+)'/g), ...envoi.matchAll(/then '(mise_a_jour)' else/g)].map(
        (m) => m[1] as string,
      ),
    );
    rendus.add('version_ancienne');
    expect([...rendus].sort()).toEqual([...CODES].sort());
  });
});

describe('contrôler une demande avant de l’envoyer', () => {
  it('rien n’est coché d’avance : origine, message et réponse manquent', () => {
    expect(controler('contact', {}).erreurs).toEqual({
      origine: 'requis',
      message: 'requis',
      reponse: 'requis',
    });
  });

  it('un message simple', () => {
    expect(controler('contact', contact({ message: '  Bonjour \r\n' }))).toEqual({
      contenu: contact(),
      erreurs: {},
    });
  });

  it('une longueur se compte en signes, comme dans la base', () => {
    expect(controler('contact', contact({ message: '🙂'.repeat(2000) })).erreurs).toEqual({});
    expect(controler('contact', contact({ message: 'é'.repeat(2001) })).erreurs).toEqual({
      message: 'trop_long',
    });
  });

  it('une réponse WhatsApp part au format de la base', () => {
    const { contenu, erreurs } = controler(
      'contact',
      contact({ reponse: 'whatsapp', coordonnee: '06 123 45 67' }),
    );
    expect(erreurs).toEqual({});
    expect(contenu.coordonnee).toBe('242061234567');
    expect(
      controler('contact', contact({ reponse: 'whatsapp', coordonnee: 'demain' })).erreurs,
    ).toEqual({ coordonnee: 'format' });
    expect(controler('contact', contact({ reponse: 'whatsapp' })).erreurs).toEqual({
      coordonnee: 'requis',
    });
  });

  it('une adresse e-mail, une seule', () => {
    const avec = (coordonnee: string) =>
      controler('contact', contact({ reponse: 'email', coordonnee })).erreurs;
    expect(avec('prenom@exemple.com')).toEqual({});
    expect(avec('prenom@exemple')).toEqual({ coordonnee: 'format' });
    expect(avec('a@exemple.com,b@exemple.com')).toEqual({ coordonnee: 'format' });
  });

  it('une coordonnée sans réponse demandée ne part pas', () => {
    expect(controler('contact', contact({ coordonnee: '06 123 45 67' })).contenu).toEqual(
      contact(),
    );
  });

  it('une école absente : son nom et sa ville ; les niveaux rangés', () => {
    const absente = { origine: 'ecoles', reponse: 'non', nomEcole: '[École]', ville: 'Dolisie' };
    expect(
      controler('absente', { ...absente, niveaux: ['P', 'M', 'P'], deLEcole: true }).contenu,
    ).toEqual({ ...absente, niveaux: ['M', 'P'], deLEcole: true });
    expect(controler('absente', { ...absente, niveaux: ['Z'] }).erreurs).toEqual({
      niveaux: 'hors_liste',
    });
    expect(controler('absente', { origine: 'ecoles', reponse: 'non' }).erreurs).toEqual({
      nomEcole: 'requis',
      ville: 'requis',
    });
  });

  it('une erreur ou un retrait : une fiche connue, ou le nom de l’école', () => {
    const erreur = { origine: 'pied', reponse: 'non', information: 'frais', correction: 'x' };
    expect(controler('erreur', erreur).erreurs).toEqual({ nomEcole: 'requis' });
    expect(
      controler('erreur', { ...erreur, fiche: 'd1200000-0000-4000-8000-000000000001' }).erreurs,
    ).toEqual({});
    expect(controler('erreur', { ...erreur, fiche: '128' }).erreurs).toEqual({ fiche: 'format' });
  });

  it('un retrait a toujours une réponse', () => {
    expect(
      controler('retrait', {
        origine: 'fiche',
        reponse: 'non',
        nomEcole: '[É]',
        aRetirer: 'tel',
      }).erreurs,
    ).toEqual({ reponse: 'requis' });
  });

  it('les champs d’une autre nature ne partent pas', () => {
    expect(
      controler('contact', contact({ correction: 'x', aRetirer: 'tel', ville: 'X' })).contenu,
    ).toEqual(contact());
  });

  it('les signes cachés disparaissent, le texte reste', () => {
    expect(nettoyer('  a\r\nb\u0007\u202Ec\u00A0', false)).toBe('a\nbc');
    expect(nettoyer(' Marie\n  Claire ', true)).toBe('Marie Claire');
    expect(nettoyer(' \n\t\u00A0', false)).toBeNull();
  });
});

describe('la révision d’un envoi', () => {
  const a = contact();
  it('commence à 1', () => {
    expect(revisionDeLEnvoi(null, a)).toBe(1);
  });
  it('reste la même pour le même contenu : double appui, Réessayer', () => {
    expect(revisionDeLEnvoi({ revision: 3, contenu: a }, { ...a })).toBe(3);
    expect(
      revisionDeLEnvoi(
        { revision: 3, contenu: a },
        { reponse: 'non', message: 'Bonjour', origine: 'direct' },
      ),
    ).toBe(3);
  });
  it('change dès que le contenu change, même pour revenir à un ancien texte', () => {
    expect(revisionDeLEnvoi({ revision: 3, contenu: a }, contact({ message: 'autre' }))).toBe(4);
    expect(revisionDeLEnvoi({ revision: 4, contenu: contact({ message: 'autre' }) }, a)).toBe(5);
    expect(revisionDeLEnvoi({ revision: 1, contenu: a }, contact({ sujet: 'site' }))).toBe(2);
  });
});

describe('ce que la page peut dire d’un envoi', () => {
  it('enregistré : seulement avec une référence', () => {
    expect(lireIssue({ code: 'enregistree', reference: 'C-7K4P-2QXM' })).toEqual({
      genre: 'enregistre',
      code: 'enregistree',
      reference: 'C-7K4P-2QXM',
      precedente: null,
    });
    expect(lireIssue({ code: 'enregistree' })).toEqual({ genre: 'non_confirme' });
    expect(lireIssue({ code: 'enregistree', reference: 'bonjour' })).toEqual({
      genre: 'non_confirme',
    });
  });

  it('une suite rend deux références', () => {
    expect(
      lireIssue({ code: 'suite', reference: 'A-9HZE-4NBV', precedente: 'A-7K4P-2QXM' }),
    ).toMatchObject({ reference: 'A-9HZE-4NBV', precedente: 'A-7K4P-2QXM' });
  });

  it('un refus n’est jamais une confirmation, même avec une référence', () => {
    for (const code of CODES) {
      const issue = lireIssue({ code, reference: 'C-7K4P-2QXM' });
      expect(issue.genre, code).toBe(
        ['enregistree', 'deja_enregistree', 'mise_a_jour', 'suite', 'version_ancienne'].includes(
          code,
        )
          ? 'enregistre'
          : 'refuse',
      );
    }
    expect(lireIssue({ code: 'expiree', reference: 'C-7K4P-2QXM' })).toEqual({
      genre: 'refuse',
      code: 'expiree',
      dejaEnregistree: 'C-7K4P-2QXM',
    });
    expect(lireIssue({ code: 'plafond' })).toMatchObject({ dejaEnregistree: null });
  });

  it('le reste n’est pas confirmé : ni « enregistré », ni « pas parti »', () => {
    for (const brut of [null, undefined, '', 'enregistree', 42, [], {}, { code: 'nouveau_code' }]) {
      expect(lireIssue(brut)).toEqual({ genre: 'non_confirme' });
    }
  });

  it('un nouvel envoi ne se propose que là où il faut un laissez-passer neuf', () => {
    expect(proposeUnNouvelEnvoi('expiree')).toBe(true);
    expect(proposeUnNouvelEnvoi('limite_atteinte')).toBe(true);
    expect(proposeUnNouvelEnvoi('cle_deja_utilisee')).toBe(true);
    expect(proposeUnNouvelEnvoi('plafond')).toBe(false);
    expect(proposeUnNouvelEnvoi('refusee')).toBe(false);
  });
});

describe('les natures', () => {
  it('chaque nature a ses décisions et ses réorientations', () => {
    const natures: readonly Nature[] = listes.public_request_kind;
    expect(Object.keys(DECISIONS)).toEqual([...natures]);
    expect(Object.keys(REORIENTATIONS)).toEqual([...natures]);
  });
});
