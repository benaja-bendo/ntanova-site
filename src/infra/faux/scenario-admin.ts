/**
 * Le scénario « admin » du faux serveur : les états que dessinent les planches v2 de l'administration (canevas du
 * fondateur, 13/11), pour que les captures comparées montrent la même chose que la maquette : 15 fiches à traiter dont 2
 * renvoyées, 52 écoles (38 publiées, 9 prêtes, 5 à situer), une école à deux sites, une école au même lieu qu'une autre,
 * cinq relais nommés et dix autres sans envoi. Activé par `?scenario=admin` ; jamais en ligne (le faux serveur ne part
 * pas en production). Noms fictifs, entre crochets quand ils tiennent lieu d'un vrai nom.
 */
import type { ReleveAEnvoyer } from '../../modele/ports';
import type { Valeur } from '../../modele/listes';

const MOI = '00000000-0000-4000-8000-00000000000a';
const LOT = '00000000-0000-4000-8000-0000000000e1';
const TIE_TIE = 'd-pn-tie-tie';
const LOANDJILI = 'd-pn-loandjili';
const MVOU = 'd-pn-mvou-mvou';

const PALMIERS = '51000000-0000-4000-8000-000000000001';
const PALMIERS_2 = '51000000-0000-4000-8000-000000000002';
const MARCHE = '51000000-0000-4000-8000-000000000003';
const PRESCOLAIRE = '51000000-0000-4000-8000-000000000004';
const RITA = '51000000-0000-4000-8000-000000000005';

const ilYA = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const id = (prefixe: string, n: number) =>
  `${prefixe}-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Une position autour d'un point, à `metres` vers le nord. */
const auNord = (p: { latitude: number; longitude: number }, metres: number) => ({
  latitude: p.latitude + metres / 111_000,
  longitude: p.longitude,
});

const POS_PALMIERS = { latitude: -4.7594, longitude: 11.9029 };
const POS_MARCHE = { latitude: -4.7861, longitude: 11.8652 };

const releve = (
  n: number,
  nomEnseigne: string,
  minutes: number,
  extra: Partial<ReleveAEnvoyer> = {},
): ReleveAEnvoyer => ({
  id: id('61000000', n),
  lotId: LOT,
  type: 'releve',
  corrigeReleveId: null,
  position: { latitude: -4.7861 + n / 900, longitude: 11.8652 + n / 1100 },
  precisionM: 22,
  prisLe: ilYA(minutes),
  reponseDoublon: null,
  doublonDe: null,
  nomEnseigne,
  niveaux: ['primaire'],
  typeEcole: 'privee',
  programme: null,
  programmesVus: null,
  programmesEnPhoto: false,
  formationsVues: [],
  repere: 'face au marché',
  numeroEnseigne: '[numéro saisi]',
  direction: 'vue',
  repasser: null,
  ...extra,
});

type Campus = Record<string, unknown>;
const campus = (cid: string, nom: string, extra: Campus = {}): [string, Campus] => [
  cid,
  {
    id: cid,
    institutionId: cid,
    nom,
    etiquette: null,
    quartier: 'Tié-Tié',
    publication: 'publiee',
    origine: 'field',
    position: { latitude: -4.79, longitude: 11.87 },
    divisionId: TIE_TIE,
    confieeA: null,
    noteMission: null,
    genreMission: 'locate',
    typeEcole: 'privee',
    niveaux: ['primaire'],
    ...extra,
  },
];

/** Un relais de la liste de l'administration, comme `admin.relais()` le rend. */
const relais = (
  n: number,
  prenom: string,
  statut: 'actif' | 'en_attente' | 'suspendu',
  envoyees: number,
  semaine: number,
  extra: { contacts?: number; renvoyees?: number; lente?: number; jamais?: boolean } = {},
) => ({
  id: n === 0 ? MOI : id('62000000', n),
  prenom,
  email: `relais-${n}@exemple.test`,
  statut,
  lotId: statut === 'en_attente' ? null : LOT,
  creeLe: ilYA(statut === 'en_attente' ? 60 * 26 : 60 * 24 * 14),
  activeLe: extra.jamais || statut === 'en_attente' ? null : ilYA(60 * 24 * 13),
  fiches: envoyees,
  compteurs: {
    envoyees,
    aValider: 0,
    aCorriger: extra.renvoyees ?? 0,
    acceptees: envoyees,
    refusees: 0,
    contactsConfirmes: extra.contacts ?? 0,
    envoyeesSemaine: semaine,
    positionLenteSemaine: extra.lente ?? 0,
  },
});

export function etatDesPlanchesAdmin() {
  const POS_FICHE_PALMIERS = auNord(POS_PALMIERS, 1100);
  // À traiter : 15 fiches, les quatre de la planche d'abord (de la plus récente à la plus ancienne dans la liste).
  const aTraiter: [ReleveAEnvoyer, string][] = [
    [releve(1, '[École primaire Exemple]', 52, { position: auNord(POS_MARCHE, 0) }), 'Relais B'],
    [
      releve(2, 'Complexe scolaire Les Palmiers', 60, {
        position: POS_FICHE_PALMIERS,
        niveaux: ['maternelle', 'primaire'],
        reponseDoublon: 'autre_site',
      }),
      'Relais A',
    ],
    [releve(3, '[Institut Exemple]', 24, { niveaux: ['college', 'lycee'] }), 'Relais A'],
    [
      releve(4, '[Collège Exemple]', 120, {
        position: null,
        precisionM: null,
        niveaux: ['college'],
      }),
      'Relais A',
    ],
    ...Array.from({ length: 11 }, (_, k): [ReleveAEnvoyer, string] => [
      releve(5 + k, `[École Exemple ${k + 5}]`, 150 + k * 40, {
        position: { latitude: -4.81 - k / 300, longitude: 11.84 + k / 250 },
      }),
      ['Relais A', 'Relais B', 'Relais C', 'Relais D'][k % 4]!,
    ]),
  ];
  // Une seconde fiche à 93 m de la première : « Une fiche à 93 m ».
  const voisine = releve(20, '[Centre Exemple]', 300, { position: auNord(POS_MARCHE, 93) });
  const renvoyees = [
    releve(21, '[École Exemple 21]', 60 * 30),
    releve(22, '[École Exemple 22]', 60 * 50),
  ];
  const tous = [...aTraiter.map(([r]) => r), voisine, ...renvoyees];
  const relaisDe: Record<string, string> = Object.fromEntries(
    aTraiter.map(([r, nom]) => [r.id, nom]),
  );
  relaisDe[voisine.id] = 'Relais B';
  for (const r of renvoyees) relaisDe[r.id] = 'Relais D';

  const decision = (statut: Valeur<'statut_releve'>, message: string | null = null) => ({
    statut,
    motif: null,
    message,
    ecoleId: null,
    contactConfirmeLe: null,
    contactFonction: null,
    payable: false,
    essaiValideLe: null,
  });

  // 52 écoles : les cinq de la planche, puis 47 de remplissage (36 publiées, 7 prêtes, 4 à situer).
  const remplissage: [string, Campus][] = Array.from({ length: 47 }, (_, k) => {
    const etat = k < 36 ? 'publiee' : k < 43 ? 'prete' : 'a_situer';
    return campus(
      id('52000000', k + 1),
      `[École Exemple ${String.fromCharCode(65 + (k % 26))}${k}]`,
      {
        publication: etat === 'a_situer' ? 'brouillon' : etat,
        position:
          etat === 'a_situer' ? null : { latitude: -4.78 - k / 500, longitude: 11.85 + k / 600 },
        divisionId: etat === 'a_situer' ? null : TIE_TIE,
        niveaux: k % 3 === 0 ? ['maternelle', 'primaire'] : ['primaire'],
        typeEcole: k % 5 === 0 ? 'publique' : 'privee',
      },
    );
  });

  return {
    releves: Object.fromEntries(tous.map((r) => [r.id, r])),
    decisions: Object.fromEntries([
      [voisine.id, decision('accepte')],
      ...renvoyees.map((r) => [r.id, decision('a_corriger', 'La photo de l’enseigne est floue.')]),
    ]),
    photos: Object.fromEntries(
      [...aTraiter.map(([r]) => r), voisine].map((r, k) => [
        id('63000000', k + 1),
        {
          id: id('63000000', k + 1),
          releveId: r.id,
          role: 'signboard',
          mime: 'image/jpeg',
          octets: 182_000,
          publiable: false,
          exemple: true,
        },
      ]),
    ),
    relaisDesReleves: relaisDe,
    campus: Object.fromEntries([
      campus(PALMIERS, 'Complexe scolaire Les Palmiers', {
        etiquette: 'Site 1',
        quartier: 'Loandjili',
        divisionId: LOANDJILI,
        position: POS_PALMIERS,
        niveaux: ['maternelle', 'primaire', 'college'],
        repere: 'face au marché',
        verifieeLe: ilYA(60 * 24 * 3),
      }),
      campus(PALMIERS_2, 'Complexe scolaire Les Palmiers', {
        institutionId: PALMIERS,
        etiquette: 'Site 2',
        quartier: 'Mvou-Mvou',
        divisionId: MVOU,
        publication: 'prete',
        position: { latitude: -4.776, longitude: 11.871 },
        niveaux: ['primaire', 'lycee'],
      }),
      campus(MARCHE, 'École primaire du Marché', {
        quartier: 'Marché',
        publication: 'prete',
        typeEcole: 'publique',
        position: POS_MARCHE,
        memeLieuQue: PRESCOLAIRE,
      }),
      campus(PRESCOLAIRE, 'Centre préscolaire du Marché', {
        quartier: 'Marché',
        position: auNord(POS_MARCHE, 20),
        niveaux: ['maternelle'],
      }),
      campus(RITA, 'Institut Sainte-Rita', {
        publication: 'brouillon',
        typeEcole: 'confessionnelle',
        position: null,
        divisionId: null,
        quartier: null,
        niveaux: ['college', 'lycee'],
      }),
      ...remplissage,
    ]),
    relaisDeLAdmin: [
      relais(0, 'Relais A', 'actif', 31, 10, { contacts: 2 }),
      relais(2, 'Relais B', 'actif', 12, 5, { lente: 5 }),
      relais(3, 'Relais C', 'actif', 9, 4, { contacts: 1 }),
      relais(4, 'Relais D', 'actif', 6, 3, { renvoyees: 2 }),
      relais(5, 'Relais E', 'actif', 0, 0, { jamais: true }),
      relais(6, '[Relais en attente]', 'en_attente', 0, 0),
      ...Array.from({ length: 10 }, (_, k) =>
        relais(10 + k, `[Relais ${k + 6}]`, 'actif', 3 + k, 0),
      ),
    ],
  };
}
