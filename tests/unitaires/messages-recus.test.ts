// « Messages reçus » dans l'administration (refonte, lot 3B2) : les règles de l'écran, comparées à la base quand elles la
// recopient. Ce que la base refuse est éprouvé par pgTAP ; ici, ce que l'écran propose et ce qu'il a le droit de dire.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DECISIONS, REGLAGES } from '../../src/modele/demandes';
import { listes } from '../../src/modele/listes';
import * as mr from '../../src/modele/messages-recus';

const traitement = readFileSync(
  'supabase/migrations/20261124140200_messages_traitement.sql',
  'utf8',
);
const administration = readFileSync(
  'supabase/migrations/20261124150000_messages_administration.sql',
  'utf8',
);

const message = (plus: Partial<mr.MessageOuvert> = {}): mr.MessageOuvert => ({
  reference: 'A-7K4P-2QXM',
  nature: 'absente',
  etat: 'ouverte',
  version: 2,
  recuLe: '2026-11-20T08:00:00Z',
  ouvertLe: '2026-11-20T09:00:00Z',
  limiteLe: null,
  fiche: null,
  decision: null,
  motif: null,
  decideLe: null,
  canal: 'whatsapp',
  reponse: 'a_faire',
  reponduLe: null,
  indesirableDepuis: null,
  closLe: null,
  effaceLe: null,
  suiteDe: null,
  suites: [],
  reorienteDe: null,
  reorienteVers: [],
  versions: [
    {
      revision: 1,
      contenu: { coordonnee: '242060000013', message: 'TEXTE PRIVÉ', nomEcole: '[École]' },
      tardive: false,
      courante: true,
      recueLe: '2026-11-20T08:00:00Z',
    },
  ],
  evenements: [],
  alerte: null,
  retrait: null,
  ...plus,
});
const retrait = (plus: Partial<mr.SuiviRetrait> = {}): mr.SuiviRetrait => ({
  etape: 'verifier',
  issue: null,
  verification: null,
  verificationNote: null,
  verifieLe: null,
  cibles: null,
  cibleEcoleId: null,
  ciblePhotoId: null,
  retireLe: null,
  miseEnLigneLe: null,
  execution: null,
  productionLe: null,
  essaiLe: null,
  constateLe: null,
  ...plus,
});
const resume = (plus: Partial<mr.ResumeMessages> = {}): mr.ResumeMessages => ({
  aTraiter: 0,
  nouveaux: 0,
  enAttente: 0,
  clos: 0,
  retraits: 0,
  retraitsClos: 0,
  indesirables: 0,
  limiteAtteinte: 0,
  plusAncienRetraitLe: null,
  alertesEnAttente: 0,
  alertesEnEchec: 0,
  alertesAbandonnees: 0,
  dernierPassageAlertesLe: null,
  dernierPassagePurgeLe: null,
  enRetardDEffacement: 0,
  plafondAtteintLe: null,
  ...plus,
});

describe('l’adresse', () => {
  it('le lien d’une alerte ouvre le message ; une file a la sienne ; le reste mène à la file de départ', () => {
    expect(mr.lireAdresse([])).toEqual({ file: 'a-traiter', reference: null });
    expect(mr.lireAdresse(['A-7K4P-2QXM'])).toEqual({
      file: 'a-traiter',
      reference: 'A-7K4P-2QXM',
    });
    expect(mr.lireAdresse(['r-2xfg-7mpa'])).toEqual({ file: 'retraits', reference: 'R-2XFG-7MPA' });
    expect(mr.lireAdresse(['C-5TQA-6JKP', 'clos'])).toEqual({
      file: 'clos',
      reference: 'C-5TQA-6JKP',
    });
    expect(mr.lireAdresse(['retraits-clos'])).toEqual({ file: 'retraits-clos', reference: null });
    for (const faux of ['A-7K4P-2QX0', "A-7K4P-2QXM'--", 'X-7K4P-2QXM', '../ecoles']) {
      expect(mr.lireAdresse([faux]).reference, faux).toBeNull();
    }
  });
  it('l’adresse technique reste `demandes`', () => {
    expect(mr.adresseMessage('A-7K4P-2QXM')).toBe('demandes/A-7K4P-2QXM');
    expect(mr.adresseFile('a-traiter')).toBe('demandes');
    for (const f of mr.FILES)
      expect(mr.lireAdresse(mr.adresseFile(f).split('/').slice(1)).file).toBe(f);
  });
});

describe('l’écran et la base disent la même chose', () => {
  it('les files, les étapes et les natures existent dans la base', () => {
    for (const f of [
      'a_traiter',
      'en_attente',
      'closes',
      'indesirables',
      'retraits',
      'retraits_clos',
      'alertes',
    ]) {
      expect(administration).toContain(`'${f}'`);
    }
    for (const e of mr.ETAPES_RETRAIT) expect(traitement).toContain(`'${e}'`);
  });
  it('chaque valeur d’une liste a son mot', () => {
    const couples: [Record<string, string>, readonly string[]][] = [
      [mr.libelleNature, listes.public_request_kind],
      [mr.libelleSujet, listes.public_request_subject],
      [mr.libelleInformation, listes.public_request_topic],
      [mr.libelleARetirer, listes.public_request_removal],
      [mr.libelleSource, listes.public_request_knowledge],
      [mr.libelleOrigineMessage, listes.public_request_origin],
      [mr.libelleNiveauMessage, listes.public_request_level],
      [mr.libelleDecision, listes.public_request_decision],
      [mr.libelleVerification, listes.public_removal_check],
      [mr.libelleCible, listes.public_removal_target],
      [mr.libelleErreurAlerte, listes.public_notice_error],
    ];
    for (const [mots, valeurs] of couples)
      expect(Object.keys(mots).sort()).toEqual([...valeurs].sort());
  });
  it('chaque événement de la base a sa phrase, sans jamais rendre le mot brut', () => {
    const stockage = readFileSync(
      'supabase/migrations/20261124140000_messages_stockage.sql',
      'utf8',
    );
    const liste = /what text not null check \(what in \(([^)]*)\)/.exec(stockage)![1]!;
    for (const [, quoi] of liste.matchAll(/'(\w+)'/g)) {
      const phrase = mr.phraseEvenement({ quoi: quoi!, detail: null, le: '' });
      expect(phrase, quoi).not.toBe(quoi);
    }
    expect(
      mr.phraseEvenement({ quoi: 'retrait_cible', detail: 'contact_public,photo', le: '' }),
    ).toBe('À retirer : le contact public, une photo');
    expect(mr.phraseEvenement({ quoi: 'nouveau_mot', detail: null, le: '' })).toBe('nouveau_mot');
  });
  it('le motif, la note et l’échéance ont les bornes de la base', () => {
    expect(traitement).toContain(`length(v_note) > ${mr.MOTIF_AU_PLUS}`);
    expect(traitement).toContain(`length(v_note) > ${mr.NOTE_AU_PLUS}`);
    expect(REGLAGES.closeMois).toBe(12);
    expect(mr.effacementSiClos('2026-11-24')).toBe('2027-11-24');
    expect(mr.effacementSiClos('2028-02-29')).toBe('2029-02-28');
    expect(mr.effacementSiClos('2026-12-31')).toBe('2027-12-31');
  });
});

describe('les gestes proposés', () => {
  it('décider, puis répondre, puis clore', () => {
    expect(mr.gesteSuivant(message())).toBe('decider');
    expect(mr.gesteSuivant(message({ decision: 'existe' }))).toBe('repondre');
    expect(mr.gesteSuivant(message({ decision: 'existe', reponse: 'impossible' }))).toBe('clore');
    expect(mr.gesteSuivant(message({ decision: 'existe', reponse: 'non_demandee' }))).toBe('clore');
    expect(mr.gesteSuivant(message({ etat: 'close', decision: 'existe' }))).toBe('rouvrir');
    expect(mr.gesteSuivant(message({ etat: 'indesirable' }))).toBe('restaurer');
    expect(mr.gesteSuivant(message({ etat: 'en_attente' }))).toBe('reprendre');
  });
  it('répondre attend la décision et la demande de la personne ; clore, la réponse', () => {
    expect(mr.peutRepondre(message())).toBe(false);
    expect(mr.peutRepondre(message({ decision: 'existe', reponse: 'non_demandee' }))).toBe(false);
    expect(mr.peutRepondre(message({ decision: 'existe' }))).toBe(true);
    expect(mr.peutClore(message({ decision: 'existe' }))).toBe(false);
    expect(mr.peutClore(message({ decision: 'existe', reponse: 'faite' }))).toBe(true);
    expect(
      mr.peutClore(message({ decision: 'existe', reponse: 'faite', etat: 'en_attente' })),
    ).toBe(false);
  });
  it('les décisions sont celles de la nature, et plus aucune une fois passé ailleurs', () => {
    for (const nature of listes.public_request_kind) {
      expect(mr.decisionsProposees(message({ nature }))).toEqual(DECISIONS[nature]);
    }
    expect(mr.decisionsProposees(message({ nature: 'contact', decision: 'a_l_annuaire' }))).toEqual(
      [],
    );
  });
  it('un message passe dans une autre file avant toute décision ; aux retraits seulement si l’on peut répondre', () => {
    const contact = message({ nature: 'contact' });
    expect(mr.reorientationsPossibles(contact)).toEqual(['absente', 'erreur', 'retrait']);
    expect(mr.reorientationsPossibles({ ...contact, canal: 'non' })).toEqual(['absente', 'erreur']);
    expect(mr.reorientationsPossibles({ ...contact, decision: 'traitee' })).toEqual([]);
    expect(mr.reorientationsPossibles({ ...contact, etat: 'en_attente' })).toEqual([]);
    expect(mr.reorientationsPossibles(message({ nature: 'retrait', retrait: retrait() }))).toEqual([
      'erreur',
    ]);
    expect(
      mr.reorientationsPossibles(
        message({ nature: 'retrait', retrait: retrait({ issue: 'concernee' }) }),
      ),
    ).toEqual([]);
  });
  it('un message de Contact ne se rattache pas', () => {
    expect(mr.peutRattacher(message({ nature: 'contact' }))).toBe(false);
    expect(mr.peutRattacher(message({ nature: 'erreur' }))).toBe(true);
    expect(mr.peutRattacher(message({ nature: 'erreur', etat: 'close' }))).toBe(false);
  });
  it('un jour noté est réel, jamais futur, jamais avant le fait', () => {
    expect(mr.jourNotable('2026-11-24', '2026-11-24')).toBe(true);
    expect(mr.jourNotable('2026-11-25', '2026-11-24')).toBe(false);
    expect(mr.jourNotable('', '2026-11-24')).toBe(false);
    expect(mr.jourNotable('2026-02-30', '2026-11-24')).toBe(false);
    expect(mr.jourNotable('2026-11-20', '2026-11-24', '2026-11-21')).toBe(false);
  });
});

describe('répondre : ouvrir n’envoie rien, et ne recopie jamais le message', () => {
  it('WhatsApp : le numéro, la référence, une phrase neutre', () => {
    const lien = mr.lienDeReponse(message())!;
    expect(lien).toBe(
      `https://wa.me/242060000013?text=${encodeURIComponent('Bonjour, ici NTanova, au sujet de votre message A-7K4P-2QXM :')}`,
    );
    expect(decodeURIComponent(lien)).not.toContain('PRIVÉ');
  });
  it('le courrier : un objet avec la référence, jamais un second destinataire', () => {
    const courriel = (coordonnee: string) =>
      mr.lienDeReponse(
        message({
          canal: 'email',
          versions: [
            { ...message().versions[0]!, contenu: { coordonnee, message: 'TEXTE PRIVÉ' } },
          ],
        }),
      );
    const lien = new URL(courriel('p.q@exemple.test')!);
    expect(lien.protocol + lien.pathname).toBe('mailto:p.q@exemple.test');
    expect(lien.searchParams.get('subject')).toBe('NTanova · votre message A-7K4P-2QXM');
    expect([...lien.searchParams.keys()].sort()).toEqual(['body', 'subject']);
    expect(lien.href).not.toContain('PRIV');
    for (const piege of [
      'a@exemple.test,b@exemple.test',
      'a@exemple.test?cc=b@exemple.test',
      'a@exemple.test&bcc=b',
      'sans-arobase',
    ]) {
      expect(courriel(piege), piege).toBeNull();
    }
  });
  it('sans réponse demandée, il n’y a rien à ouvrir', () => {
    expect(mr.lienDeReponse(message({ canal: 'non' }))).toBeNull();
    expect(mr.coordonneeLisible(message({ canal: 'non' }))).toBe('Aucune coordonnée laissée');
  });
});

describe('un retrait', () => {
  const maintenant = new Date('2026-11-24T12:00:00Z');
  const jour = (recuLe: string, plus = {}) =>
    mr.jourDuRetrait({ recuLe, retireLe: null, etapeRetrait: 'verifier', ...plus }, maintenant);

  it('le délai court de la réception et s’arrête au retrait dans la base', () => {
    expect(jour('2026-11-24T11:00:00Z')).toBe(1);
    expect(jour('2026-11-21T13:00:00Z')).toBe(3);
    expect(jour('2026-11-17T12:30:00Z')).toBe(7);
    expect(jour('2026-11-17T11:30:00Z')).toBe(8);
    expect(mr.texteDuDelai(7)).toBe('Jour 7 sur 7');
    expect(mr.texteDuDelai(8)).toContain('dépassé');
    expect(
      jour('2026-11-01T00:00:00Z', { retireLe: '2026-11-02T00:00:00Z', etapeRetrait: 'constater' }),
    ).toBeNull();
    // Impossible à vérifier : il n'y a rien à retirer, le délai ne court plus.
    expect(jour('2026-11-01T00:00:00Z', { etapeRetrait: 'prevenir' })).toBeNull();
  });
  it('les étapes ne s’inventent pas : sans objet quand rien n’est à retirer', () => {
    const e = mr.etapesDuRetrait({
      etat: 'ouverte',
      reponse: 'a_faire',
      decision: 'impossible_a_verifier',
      retrait: retrait({ etape: 'prevenir', issue: 'impossible' }),
    });
    expect(e.map((x) => x.etat)).toEqual([
      'faite',
      'sans_objet',
      'sans_objet',
      'sans_objet',
      'courante',
      'a_venir',
    ]);
    expect(e[0]!.mot).toBe('Impossible à vérifier');
    const clos = mr.etapesDuRetrait({
      etat: 'close',
      reponse: 'impossible',
      decision: 'retiree',
      retrait: retrait({ etape: 'close', issue: 'concernee' }),
    });
    expect(clos.map((x) => x.etat)).toEqual(Array(6).fill('faite'));
    expect(clos[4]!.mot).toBe('Impossible de répondre');
    expect(clos[2]!.mot).toBe('Demandée');
  });
  it('pour la fiche entière, un numéro ne suffit pas', () => {
    expect(mr.verificationsPossibles('fiche')).toEqual(['direction', 'autre']);
    expect(mr.verificationsPossibles('tel')).toContain('numero');
  });
  it('les cibles : la demandée d’abord, aucune perdue ; une fiche, et la photo désignée', () => {
    expect(mr.ciblesDansLOrdre('photo')[0]).toBe('photo');
    for (const d of [null, ...listes.public_request_removal]) {
      expect([...mr.ciblesDansLOrdre(d)].sort()).toEqual([...listes.public_removal_target].sort());
    }
    expect(mr.manquePourCibler([], 'e', null)).not.toBeNull();
    expect(mr.manquePourCibler(['contact_public'], null, null)).not.toBeNull();
    expect(mr.manquePourCibler(['photo'], 'e', null)).not.toBeNull();
    expect(mr.manquePourCibler(['photo'], 'e', 'p')).toBeNull();
    expect(mr.manquePourCibler(['texte'], null, null)).toBeNull();
  });
});

describe('l’état des tâches', () => {
  const maintenant = new Date('2026-11-24T12:00:00Z');
  it('jamais passé n’est ni « en marche » ni « en panne »', () => {
    expect(mr.etatDesAlertes(resume(), maintenant)).toBe('jamais');
    expect(mr.etatDeLaPurge(resume(), maintenant)).toBe('jamais');
  });
  it('un silence se voit : 30 minutes pour les alertes, 26 heures pour l’effacement', () => {
    const alertes = (le: string) =>
      mr.etatDesAlertes(resume({ dernierPassageAlertesLe: le }), maintenant);
    expect(alertes('2026-11-24T11:31:00Z')).toBe('passe');
    expect(alertes('2026-11-24T11:29:00Z')).toBe('silence');
    const purge = (le: string) =>
      mr.etatDeLaPurge(resume({ dernierPassagePurgeLe: le }), maintenant);
    expect(purge('2026-11-23T10:01:00Z')).toBe('passe');
    expect(purge('2026-11-23T09:59:00Z')).toBe('silence');
    expect(mr.dureeDepuis('2026-11-24T10:50:00Z', maintenant)).toBe('1 h 10');
    expect(mr.dureeDepuis('2026-11-24T11:20:00Z', maintenant)).toBe('40 min');
    expect(mr.dureeDepuis('2026-11-20T12:00:00Z', maintenant)).toBe('4 jours');
  });
  it('la carte d’Aujourd’hui : des nombres, et un regard seulement quand il le faut', () => {
    expect(mr.resumerPourAujourdhui(resume(), maintenant)).toEqual({
      nombre: 0,
      detail: 'rien n’attend',
      attention: false,
    });
    const r = mr.resumerPourAujourdhui(
      resume({ aTraiter: 4, retraits: 2, plusAncienRetraitLe: '2026-11-21T13:00:00Z' }),
      maintenant,
    );
    expect(r).toEqual({
      nombre: 6,
      detail: '4 à traiter · 2 retraits · retrait : jour 3 sur 7',
      attention: false,
    });
    expect(mr.resumerPourAujourdhui(resume({ alertesAbandonnees: 1 }), maintenant).attention).toBe(
      true,
    );
    expect(
      mr.resumerPourAujourdhui(resume({ plusAncienRetraitLe: '2026-11-01T00:00:00Z' }), maintenant)
        .attention,
    ).toBe(true);
  });
});

describe('ce qui se montre', () => {
  it('un champ vide ne s’affiche pas ; un message passé ailleurs garde tout ce qui a été écrit', () => {
    expect(
      mr.lignesEcrites('contact', { message: 'a', sujet: 'trouver', nomPersonne: '' }),
    ).toEqual([
      { libelle: 'Sujet', valeur: 'Trouver une école ou une formation' },
      { libelle: 'Message', valeur: 'a' },
    ]);
    expect(mr.lignesEcrites('erreur', { message: 'a' })).toEqual([
      { libelle: 'Message', valeur: 'a' },
    ]);
    expect(mr.lignesEcrites('absente', { niveaux: ['M', 'P'], deLEcole: false })).toEqual([
      { libelle: 'Niveaux', valeur: 'Maternelle, Primaire' },
      { libelle: 'Dirige cette école ou y travaille', valeur: 'Non' },
    ]);
  });
  it('l’alerte : pas encore annoncé, en échec, abandonnée, ou rien à dire', () => {
    expect(mr.pastilleAlerte('a_envoyer', null)?.texte).toBe('Pas encore annoncé');
    expect(mr.pastilleAlerte('a_envoyer', 'connexion')?.texte).toBe('Alerte en échec');
    expect(mr.pastilleAlerte('abandonnee', 'delai')?.texte).toBe('Alerte abandonnée');
    expect(mr.pastilleAlerte('envoyee', null)).toBeNull();
    expect(mr.pastilleAlerte(null, null)).toBeNull();
  });
  it('un retrait retiré de la base n’est pas dit constaté avant de l’être', () => {
    const ligne = (etapeRetrait: mr.EtapeRetrait): mr.LigneMessage => ({
      rang: 1,
      reference: 'R-2XFG-7MPA',
      nature: 'retrait',
      etat: 'ouverte',
      version: 1,
      recuLe: '2026-11-20T00:00:00Z',
      ouvert: true,
      sujet: null,
      information: null,
      aRetirer: 'tel',
      nomEcole: null,
      ville: null,
      fiche: null,
      versions: 1,
      suiteDe: null,
      reorienteDe: null,
      decision: null,
      canal: 'email',
      reponse: 'a_faire',
      limiteLe: null,
      alerte: 'envoyee',
      erreurAlerte: null,
      etapeRetrait,
      retireLe: '2026-11-21T00:00:00Z',
      closLe: null,
      effaceLe: null,
    });
    const mots = (e: mr.EtapeRetrait) =>
      mr.pastillesDeLigne(ligne(e), new Date()).map((p) => p.texte);
    expect(mots('mettre_en_ligne')).toEqual(['Pas encore constaté en ligne']);
    expect(mots('constater')).toEqual(['Pas encore constaté en ligne']);
    expect(mots('prevenir')).toEqual(['Constaté en ligne']);
  });
});
