/**
 * Les deux portes publiques, dans le faux serveur (refonte, lot 3C) : les mêmes règles que la base
 * (`supabase/migrations/20261124140100_messages_envoi.sql`), sur les messages que lit la fausse administration.
 *
 * Réglages d'un parcours, dans le stockage du navigateur (retirer la clé répare) :
 * - `ntanova-faux-envois` : `fermes` (pas de secret d'envoi), `sans-passe` (le laissez-passer ne répond pas), `avant` (coupure
 *   avant réception : rien n'est écrit), `apres` (écrit, puis la réponse se perd), `plafond`, `trop` (limite par connexion),
 *   `illisible` (une réponse que la page ne connaît pas) ;
 * - `ntanova-faux-avance` : l'heure du serveur, en minutes d'avance ;
 * - `ntanova-faux-fiches-retirees` : les identifiants de fiches qui ne sont plus publiées, séparés par des virgules ;
 * - `ntanova-faux-latence` : le délai de réponse.
 */
import {
  controler,
  lireIssue,
  REGLAGES,
  type Contenu,
  type Issue,
  type Nature,
} from '../../modele/demandes';
import type { EnvoiPublic, PortDemandes } from '../../modele/envoi-public';
import {
  ETAT_VIDE,
  nouvelleReference,
  retraitVide,
  type EtatDesMessages,
  type MessageFaux,
} from './messages';

export interface DependancesEnvois {
  garde(): string | null;
  garder(etat: string): void;
  reglage(nom: 'envois' | 'avance' | 'fiches-retirees'): string | null;
  reseau(): Promise<void>;
  maintenant(): number;
}

const empreinte = (c: Contenu) =>
  JSON.stringify(Object.entries(c).sort(([a], [b]) => (a < b ? -1 : 1)));
const sceauDe = (cle: string, emisLe: number) => `sceau-de-${cle}-${emisLe}`;

export function creerDemandesFausses(d: DependancesEnvois): PortDemandes {
  const lire = (): EtatDesMessages => ({
    ...structuredClone(ETAT_VIDE),
    ...(JSON.parse(d.garde() ?? '{}') as Partial<EtatDesMessages>),
  });
  const heure = () => d.maintenant() + Number(d.reglage('avance') ?? 0) * 60_000;
  const reglage = () => d.reglage('envois');

  function creer(
    e: EtatDesMessages,
    envoi: EnvoiPublic,
    contenu: Contenu,
    suiteDe: MessageFaux | null,
    piege: boolean,
  ): MessageFaux {
    const le = new Date(heure()).toISOString();
    const canal = contenu.reponse as MessageFaux['canal'];
    const m: MessageFaux = {
      rang: Math.max(0, ...e.messages.map((x) => x.rang)) + 1,
      reference: nouvelleReference(envoi.nature),
      nature: envoi.nature,
      etat: piege ? 'indesirable' : 'recue',
      version: 1,
      recuLe: le,
      ouvertLe: null,
      limiteLe: null,
      ficheId: typeof contenu.fiche === 'string' ? contenu.fiche : null,
      decision: null,
      motif: null,
      decideLe: null,
      canal,
      reponse: canal === 'non' ? 'non_demandee' : 'a_faire',
      reponduLe: null,
      indesirableDepuis: piege ? le : null,
      closLe: null,
      suiteDe: suiteDe?.reference ?? null,
      reorienteDe: null,
      versions: [
        { revision: envoi.revision, contenu, tardive: false, courante: true, recueLe: le },
      ],
      evenements: [{ quoi: piege ? 'indesirable' : 'recue', detail: null, le }],
      alerte: piege
        ? null
        : { etat: 'a_envoyer', essais: 0, prochainEssaiLe: le, erreur: null, envoyeeLe: null },
      retrait: envoi.nature === 'retrait' ? retraitVide() : null,
      envoi: suiteDe
        ? { cle: `${envoi.passe.cle}:suite:${empreinte(contenu)}`, ecritures: 1, suites: 0 }
        : { cle: envoi.passe.cle, ecritures: 1, suites: 0 },
    };
    e.messages.push(m);
    return m;
  }

  /** Le corps de la réponse, sous les noms du modèle ; rien n'est écrit quand il refuse. */
  function recevoir(envoi: EnvoiPublic): Record<string, unknown> {
    const { passe, revision, nature } = envoi;
    const { contenu, erreurs } = controler(nature as Nature, envoi.contenu);
    if (Object.keys(erreurs).length > 0) return { code: 'refusee', erreurs };
    const e = lire();
    const d0 = e.messages.find((m) => m.envoi?.cle === passe.cle);
    const ecrire = () => d.garder(JSON.stringify(e));
    const texte = empreinte(contenu);
    if (d0) {
      if (d0.nature !== nature) return { code: 'cle_deja_utilisee' };
      const courante = d0.versions.find((v) => v.courante);
      if (
        d0.versions.some(
          (v) =>
            empreinte(v.contenu) === texte &&
            (v.revision === revision || v.revision === courante?.revision),
        )
      ) {
        return { code: 'deja_enregistree', reference: d0.reference };
      }
      const suite = e.messages.find((m) => m.envoi?.cle === `${passe.cle}:suite:${texte}`);
      if (suite) {
        return {
          code: 'deja_enregistree',
          reference: suite.reference,
          precedente: d0.reference,
        };
      }
    }
    const deja = d0 ? { reference: d0.reference } : {};
    const age = heure() - passe.emisLe * 1000;
    if (
      passe.sceau !== sceauDe(passe.cle, passe.emisLe) ||
      age < -60_000 ||
      age >= REGLAGES.validiteJours * 86_400_000
    ) {
      return { code: 'expiree', ...deja };
    }
    const retirees = (d.reglage('fiches-retirees') ?? '').split(',');
    if (typeof contenu.fiche === 'string' && retirees.includes(contenu.fiche)) {
      return { code: 'ecole_inconnue', ...deja };
    }
    if (reglage() === 'trop') return { code: 'trop_d_envois', ...deja };
    if (reglage() === 'plafond') return { code: 'plafond', ...deja };

    const piege = envoi.piege.trim() !== '';
    if (!d0) {
      const m = creer(e, envoi, contenu, null, piege);
      ecrire();
      return { code: 'enregistree', reference: m.reference };
    }
    const compte = d0.envoi ?? { cle: passe.cle, ecritures: 1, suites: 0 };
    d0.envoi = compte;
    const courante = d0.versions.find((v) => v.courante)?.revision ?? 0;
    const estSuite =
      (revision > courante && d0.ouvertLe !== null) ||
      d0.versions.some((v) => v.revision === revision);
    const le = new Date(heure()).toISOString();
    if (
      compte.ecritures >= REGLAGES.ecrituresParCle ||
      (estSuite && compte.suites >= REGLAGES.suitesParCle)
    ) {
      if (d0.limiteLe === null) {
        d0.limiteLe = le;
        d0.evenements.push({ quoi: 'limite', detail: null, le });
        ecrire();
      }
      return { code: 'limite_atteinte', reference: d0.reference };
    }
    compte.ecritures += 1;
    if (estSuite) {
      const m = creer(e, envoi, contenu, d0, piege || d0.etat === 'indesirable');
      compte.suites += 1;
      d0.evenements.push({ quoi: 'suite', detail: m.reference, le });
      ecrire();
      return { code: 'suite', reference: m.reference, precedente: d0.reference };
    }
    const plusRecente = revision > courante;
    if (plusRecente) {
      d0.versions = d0.versions.map((v) => ({ ...v, courante: false }));
      d0.ficheId = typeof contenu.fiche === 'string' ? contenu.fiche : null;
      d0.canal = contenu.reponse as MessageFaux['canal'];
      d0.reponse = d0.canal === 'non' ? 'non_demandee' : 'a_faire';
    }
    d0.versions.push({
      revision,
      contenu,
      tardive: !plusRecente,
      courante: plusRecente,
      recueLe: le,
    });
    d0.version += 1;
    const code = plusRecente ? 'mise_a_jour' : 'version_ancienne';
    d0.evenements.push({ quoi: code, detail: null, le });
    ecrire();
    return { code, reference: d0.reference };
  }

  return {
    async demanderLaissezPasser() {
      await d.reseau();
      if (reglage() === 'fermes') return { genre: 'ferme' };
      if (reglage() === 'sans-passe') return { genre: 'non_confirme' };
      const cle = crypto.randomUUID();
      const emisLe = Math.floor(heure() / 1000);
      return { genre: 'accorde', passe: { cle, emisLe, sceau: sceauDe(cle, emisLe) } };
    },
    async envoyer(envoi): Promise<Issue> {
      await d.reseau();
      if (reglage() === 'avant') return { genre: 'non_confirme' };
      const corps = recevoir(envoi);
      if (reglage() === 'apres') return { genre: 'non_confirme' };
      if (reglage() === 'illisible') return lireIssue({ ...corps, code: 'autre_chose' });
      return lireIssue(corps);
    },
  };
}

/** Dans le navigateur : le stockage que lit la fausse administration. */
export const demandesFausses = (): PortDemandes =>
  creerDemandesFausses({
    garde: () => localStorage.getItem('ntanova-faux-messages'),
    garder: (etat) => localStorage.setItem('ntanova-faux-messages', etat),
    reglage: (nom) => localStorage.getItem(`ntanova-faux-${nom}`),
    reseau: () =>
      new Promise((fini) =>
        setTimeout(fini, Number(localStorage.getItem('ntanova-faux-latence') ?? 0)),
      ),
    maintenant: () => Date.now(),
  });
