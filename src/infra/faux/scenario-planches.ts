/**
 * Le scénario « planches » du faux serveur : les états que dessinent les planches v2 du fondateur, pour que les captures
 * comparées montrent la même chose que la maquette (3 missions dont une à corriger, des fiches dans tous les états, une
 * paie avec fiches, mission et semaines payées). Activé par `localStorage['ntanova-faux-scenario'] = 'planches'` avant le
 * premier chargement ; jamais en ligne (le faux serveur ne part pas en production). Noms fictifs entre crochets.
 */
import type { ReleveAEnvoyer } from '../../modele/ports';
import type { Valeur } from '../../modele/listes';
import { prochainVendredi } from '../../modele/paie';

const MOI = '00000000-0000-4000-8000-00000000000a';
const LOT = '00000000-0000-4000-8000-0000000000e1';
const PALMIERS = '50000000-0000-4000-8000-0000000000a1';
const COLLEGE = '50000000-0000-4000-8000-0000000000c2';

const ilYA = (jours: number, heure = 10) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - jours);
  d.setUTCHours(heure, 12, 0, 0);
  return d.toISOString();
};

const jourPlus = (jour: string, n: number) => {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const releve = (
  n: number,
  nomEnseigne: string,
  prisLe: string,
  niveaux: Valeur<'niveau'>[] = ['primaire'],
): ReleveAEnvoyer => ({
  id: `60000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
  lotId: LOT,
  type: 'releve',
  corrigeReleveId: null,
  position: { latitude: -4.8031 + n / 2000, longitude: 11.8792 + n / 2000 },
  precisionM: 8,
  prisLe,
  reponseDoublon: null,
  doublonDe: null,
  nomEnseigne,
  niveaux,
  typeEcole: 'privee',
  programme: null,
  programmesVus: null,
  programmesEnPhoto: false,
  formationsVues: [],
  repere: 'Marché',
  numeroEnseigne: null,
  direction: 'vue',
  repasser: null,
});

type Statut = Valeur<'statut_releve'>;
const decision = (
  statut: Statut,
  extra: { message?: string; ecoleId?: string; payable?: boolean } = {},
) => ({
  statut,
  motif: null,
  message: extra.message ?? null,
  ecoleId: extra.ecoleId ?? null,
  contactConfirmeLe: null,
  contactFonction: null,
  payable: extra.payable ?? statut === 'accepte',
  essaiValideLe: null,
});

export function etatDesPlanches() {
  const vendredi = prochainVendredi();
  const fiches: [ReleveAEnvoyer, ReturnType<typeof decision> | null][] = [
    // Plus de sept jours : « À corriger » et « Refusée » ne comptent pas dans « Cette semaine ».
    [
      releve(1, '[École Exemple]', ilYA(9)),
      decision('a_corriger', { message: 'La photo de l’enseigne est floue.' }),
    ],
    [
      releve(2, '[Centre Exemple]', ilYA(10)),
      decision('refuse', { message: 'Déjà relevée par un autre relais.', payable: false }),
    ],
    // La semaine : 7 envoyées, 5 acceptées, 2 en attente.
    [releve(3, '[Complexe scolaire Exemple]', ilYA(1)), null],
    [releve(4, '[École maternelle Exemple]', ilYA(0, 8), ['maternelle']), null],
    [
      releve(5, 'Complexe scolaire Les Palmiers', ilYA(2), ['primaire', 'college']),
      decision('accepte', { ecoleId: PALMIERS }),
    ],
    [releve(6, '[École primaire Exemple]', ilYA(3)), decision('accepte')],
    [releve(7, '[Collège Exemple 2]', ilYA(3), ['college']), decision('accepte')],
    [releve(8, '[École Exemple 3]', ilYA(4)), decision('accepte')],
    [releve(9, '[Lycée Exemple 4]', ilYA(5), ['lycee']), decision('accepte')],
  ];
  const campus = (
    id: string,
    nom: string,
    extra: Record<string, unknown>,
  ): [string, Record<string, unknown>] => [
    id,
    {
      id,
      institutionId: id,
      nom,
      etiquette: null,
      quartier: 'Tié-Tié',
      publication: 'brouillon',
      origine: 'field',
      position: null,
      divisionId: 'd-pn-tie-tie',
      confieeA: MOI,
      confieeLe: jourPlus(vendredi, -9),
      noteMission: null,
      genreMission: 'locate',
      typeEcole: 'privee',
      niveaux: ['primaire'],
      ...extra,
    },
  ];
  return {
    releves: Object.fromEntries(fiches.map(([r]) => [r.id, r])),
    decisions: Object.fromEntries(fiches.flatMap(([r, d]) => (d ? [[r.id, d]] : []))),
    campus: Object.fromEntries([
      campus(COLLEGE, '[Collège Exemple]', { niveaux: ['college'] }),
      campus(PALMIERS, 'Complexe scolaire Les Palmiers', {
        publication: 'publiee',
        position: { latitude: -4.7594, longitude: 11.9029 },
        quartier: 'Loandjili',
        repere: 'face au marché',
        genreMission: 'complete',
        niveaux: ['maternelle', 'primaire', 'college'],
        detailsMission: {
          tache: 'Photographier le prospectus des frais, en entier.',
          raison: 'la ligne de la 3e était illisible sur la photo d’avant.',
          avantLe: jourPlus(vendredi, 7),
          paieXaf: 1000,
        },
      }),
    ]),
    numeroDePaie: {
      operateur: 'mtn' as const,
      numero: '242060000000',
      titulaire: '[Prénom Nom]',
      majLe: ilYA(20),
    },
    paieMissions: [{ tarifXaf: 1000, nombre: 1 }],
    paie: {
      semaines: [
        {
          id: 's-1',
          vendredi: jourPlus(vendredi, -7),
          lignes: [
            {
              relaisId: MOI,
              prenom: '[Prénom]',
              fiches: 4,
              contacts: 0,
              essais: 0,
              totalXaf: 2000,
            },
          ],
          payes: { [MOI]: { le: jourPlus(vendredi, -7), reference: 'MP-0001' } },
        },
        {
          id: 's-2',
          vendredi: jourPlus(vendredi, -14),
          lignes: [
            {
              relaisId: MOI,
              prenom: '[Prénom]',
              fiches: 0,
              contacts: 0,
              essais: 1,
              totalXaf: 1500,
            },
          ],
          payes: { [MOI]: { le: jourPlus(vendredi, -14), reference: 'MP-0000' } },
        },
      ],
      numeros: { [MOI]: { operateur: 'mtn', numero: '242060000000', titulaire: '[Prénom Nom]' } },
      deja: [],
    },
  };
}
