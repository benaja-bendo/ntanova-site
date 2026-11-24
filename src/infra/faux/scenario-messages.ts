/**
 * Les messages des planches « Messages reçus » et « Retraits » (canevas admin, 24/11), pour le scénario « admin » du faux serveur
 * et les parcours. Écoles, personnes, numéros, adresses et références inventés ; jamais en ligne.
 */
import { jourDuCongo } from '../../modele/date-declaration';
import type { Contenu } from '../../modele/demandes';
import type { EvenementMessage } from '../../modele/messages-recus';
import { retraitVide, type EtatDesMessages, type MessageFaux } from './messages';

const PALMIERS = '51000000-0000-4000-8000-000000000001';
const PRESCOLAIRE = '51000000-0000-4000-8000-000000000004';

const ilYA = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const HEURE = 60;
const JOUR = 24 * HEURE;

/** Un message : ce que la planche montre, le reste à sa valeur de départ. */
function message(
  rang: number,
  reference: string,
  nature: MessageFaux['nature'],
  minutes: number,
  contenu: Contenu,
  plus: Partial<MessageFaux> = {},
): MessageFaux {
  const recuLe = ilYA(minutes);
  const canal = (contenu.reponse ?? 'non') as MessageFaux['canal'];
  const ouvert = plus.ouvertLe ?? null;
  const evenements: EvenementMessage[] = [
    { quoi: 'recue', detail: null, le: recuLe },
    ...(ouvert ? [{ quoi: 'ouverte', detail: null, le: ouvert }] : []),
  ];
  return {
    rang,
    reference,
    nature,
    etat: ouvert ? 'ouverte' : 'recue',
    version: ouvert ? 2 : 1,
    recuLe,
    ouvertLe: null,
    limiteLe: null,
    ficheId: typeof contenu.fiche === 'string' ? contenu.fiche : null,
    decision: null,
    motif: null,
    decideLe: null,
    canal,
    reponse: canal === 'non' ? 'non_demandee' : 'a_faire',
    reponduLe: null,
    indesirableDepuis: null,
    closLe: null,
    suiteDe: null,
    reorienteDe: null,
    versions: [{ revision: 1, contenu, tardive: false, courante: true, recueLe: recuLe }],
    evenements,
    alerte: {
      etat: 'envoyee',
      essais: 1,
      prochainEssaiLe: recuLe,
      erreur: null,
      envoyeeLe: recuLe,
    },
    retrait: nature === 'retrait' ? retraitVide() : null,
    ...plus,
  };
}

const alerteEnEchec = (): MessageFaux['alerte'] => ({
  etat: 'a_envoyer',
  essais: 2,
  prochainEssaiLe: ilYA(-10),
  erreur: 'connexion',
  envoyeeLe: null,
});

export function messagesDesPlanches(): EtatDesMessages {
  const recueErreur = ilYA(5 * HEURE);
  const corrigee = ilYA(5 * HEURE - 12);
  const contenuErreur: Contenu = {
    origine: 'fiche',
    reponse: 'email',
    coordonnee: 'famille@exemple.test',
    fiche: PALMIERS,
    information: 'frais',
    correction: '[la bonne information, écrite par la personne]',
    source: 'document',
  };
  const closLe = ilYA(22 * JOUR);
  return {
    dernierPassageAlertesLe: ilYA(3),
    dernierPassagePurgeLe: ilYA(8 * HEURE),
    plafondAtteintLe: null,
    messages: [
      message(
        1,
        'C-8PLN-3HDS',
        'contact',
        23 * JOUR,
        {
          origine: 'pour-les-ecoles',
          sujet: 'ecole',
          message: '[le message]',
          reponse: 'whatsapp',
          coordonnee: '242060000011',
        },
        {
          ouvertLe: ilYA(22 * JOUR + 60),
          etat: 'close',
          version: 6,
          decision: 'traitee',
          decideLe: ilYA(22 * JOUR + 40),
          reponse: 'faite',
          reponduLe: jourDuCongo(new Date(closLe)),
          closLe,
          evenements: [
            { quoi: 'recue', detail: null, le: ilYA(23 * JOUR) },
            { quoi: 'ouverte', detail: null, le: ilYA(22 * JOUR + 60) },
            { quoi: 'decidee', detail: 'traitee', le: ilYA(22 * JOUR + 40) },
            { quoi: 'reponse_faite', detail: 'whatsapp', le: ilYA(22 * JOUR + 5) },
            { quoi: 'close', detail: null, le: closLe },
          ],
        },
      ),
      message(
        2,
        'R-9BHN-2TSE',
        'retrait',
        20 * JOUR,
        {
          origine: 'confidentialite',
          nomEcole: '[Institut Exemple]',
          aRetirer: 'fiche',
          precision: '[demande de retrait de toute la fiche, sans lien avec l’école]',
          reponse: 'email',
          coordonnee: 'autre@exemple.test',
        },
        {
          ouvertLe: ilYA(19 * JOUR),
          etat: 'close',
          version: 6,
          decision: 'impossible_a_verifier',
          decideLe: ilYA(18 * JOUR + 30),
          reponse: 'faite',
          reponduLe: jourDuCongo(new Date(ilYA(18 * JOUR))),
          closLe: ilYA(18 * JOUR),
          retrait: { ...retraitVide(), issue: 'impossible', verifieLe: ilYA(18 * JOUR + 30) },
        },
      ),
      message(
        3,
        'R-6KDT-4WQZ',
        'retrait',
        6 * JOUR,
        {
          origine: 'fiche',
          fiche: PALMIERS,
          aRetirer: 'autre',
          precision: '[un texte de la fiche nomme une personne]',
          reponse: 'email',
          coordonnee: 'parent@exemple.test',
        },
        {
          ouvertLe: ilYA(5 * JOUR),
          version: 6,
          retrait: {
            ...retraitVide(),
            issue: 'concernee',
            verification: 'direction',
            verifieLe: ilYA(5 * JOUR),
            cibles: ['texte'],
            cibleEcoleId: PALMIERS,
            retireLe: ilYA(5 * JOUR - 30),
            miseEnLigneLe: ilYA(1 * JOUR),
            execution: '451000001',
          },
          evenements: [
            { quoi: 'recue', detail: null, le: ilYA(6 * JOUR) },
            { quoi: 'ouverte', detail: null, le: ilYA(5 * JOUR) },
            { quoi: 'retrait_verifie', detail: 'direction', le: ilYA(5 * JOUR) },
            { quoi: 'retrait_cible', detail: 'texte', le: ilYA(5 * JOUR - 20) },
            { quoi: 'retrait_base', detail: null, le: ilYA(5 * JOUR - 30) },
            { quoi: 'retrait_mise_en_ligne', detail: null, le: ilYA(1 * JOUR) },
          ],
        },
      ),
      message(
        4,
        'A-4RVB-9CEW',
        'erreur',
        5 * JOUR,
        {
          origine: 'fiche',
          fiche: PRESCOLAIRE,
          information: 'ferme',
          correction: '[ce que la personne a écrit]',
          source: 'passage',
          reponse: 'whatsapp',
          coordonnee: '242060000012',
        },
        { ouvertLe: ilYA(4 * JOUR), etat: 'en_attente', version: 3 },
      ),
      message(
        5,
        'C-2GZX-4LWD',
        'contact',
        JOUR + 6 * HEURE,
        { origine: 'direct', message: '[le message]', reponse: 'non' },
        {
          etat: 'indesirable',
          indesirableDepuis: ilYA(JOUR + 6 * HEURE),
          alerte: null,
          evenements: [{ quoi: 'indesirable', detail: null, le: ilYA(JOUR + 6 * HEURE) }],
        },
      ),
      message(6, 'R-2XFG-7MPA', 'retrait', 2 * JOUR + 3 * HEURE, {
        origine: 'fiche',
        fiche: PALMIERS,
        aRetirer: 'tel',
        precision: '[où le numéro paraît et pourquoi le retirer ; la personne ne l’a pas recopié]',
        reponse: 'whatsapp',
        coordonnee: '242060000001',
      }),
      message(
        7,
        'C-5TQA-6JKP',
        'contact',
        2 * JOUR,
        { origine: 'direct', sujet: 'site', message: '[le message]', reponse: 'non' },
        { ouvertLe: ilYA(JOUR) },
      ),
      message(
        8,
        'C-3MWD-8RTA',
        'contact',
        16 * HEURE,
        {
          origine: 'pour-les-ecoles',
          sujet: 'trouver',
          message: '[le message, tel qu’il est écrit : 2 000 caractères au plus]',
          nomPersonne: '[Prénom]',
          reponse: 'email',
          coordonnee: 'prenom@exemple.test',
        },
        {
          ouvertLe: ilYA(3 * HEURE),
          limiteLe: ilYA(90),
          evenements: [
            { quoi: 'recue', detail: null, le: ilYA(16 * HEURE) },
            { quoi: 'ouverte', detail: null, le: ilYA(3 * HEURE) },
            { quoi: 'limite', detail: null, le: ilYA(90) },
          ],
        },
      ),
      message(9, 'A-9HZE-4NBV', 'erreur', 5 * HEURE, contenuErreur, {
        versions: [
          {
            revision: 1,
            contenu: { ...contenuErreur, correction: '[première version du texte, plus courte]' },
            tardive: false,
            courante: false,
            recueLe: recueErreur,
          },
          {
            revision: 2,
            contenu: contenuErreur,
            tardive: false,
            courante: true,
            recueLe: corrigee,
          },
        ],
        version: 2,
        evenements: [
          { quoi: 'recue', detail: null, le: recueErreur },
          { quoi: 'mise_a_jour', detail: null, le: corrigee },
        ],
      }),
      message(
        10,
        'A-7K4P-2QXM',
        'absente',
        2 * HEURE,
        {
          origine: 'ecoles',
          nomEcole: '[Complexe scolaire Exemple]',
          ville: 'Brazzaville',
          repere: 'Mfilou, [repère écrit par la personne]',
          niveaux: ['M', 'P'],
          autreChose: '[horaires, numéro lu sur l’enseigne]',
          deLEcole: true,
          nomPersonne: '[Prénom]',
          reponse: 'whatsapp',
          coordonnee: '242060000013',
        },
        { alerte: alerteEnEchec() },
      ),
    ],
  };
}
