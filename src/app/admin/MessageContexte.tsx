/**
 * Ce que les parties d'un message partagent : la saisie gardée, le geste en cours, l'échec dit là où l'on agissait, et les blocs
 * communs au message et au retrait.
 */
import type { ReactNode } from 'react';
import type { Decision, Nature } from '../../modele/demandes';
import { jourDuCongo } from '../../modele/date-declaration';
import {
  coordonneeLisible,
  effacementSiClos,
  jourLong,
  libelleCanal,
  libelleDecision,
  peutRattacher,
  phraseEvenement,
  type CibleRetrait,
  type MessageOuvert,
  type VerificationRetrait,
} from '../../modele/messages-recus';
import type { PortAdministration } from '../../modele/ports';
import { v2 } from '@/ui/v2/classes';
import {
  BandeauEchec,
  BlocMessage,
  Journal,
  JOUR_NON_CHOISI,
  LigneMessageEcrite,
  type JourChoisi,
} from '@/ui/v2/messages';
import { quand } from '../../ui/composants';
import type { Echec, Geste } from './geste-message';

/** Ce qui se saisit à chaque étape d'un retrait. Rien n'est coché d'avance. */
export interface SaisieRetrait {
  comment: VerificationRetrait | null;
  note: string;
  cibles: CibleRetrait[];
  photoId: string | null;
  execution: string;
  production: JourChoisi;
  essai: JourChoisi;
}

/** Ce qui est choisi et pas encore enregistré : gardé tant que le message est à l'écran, même après un conflit. */
export interface Saisie {
  choix: Decision | `vers:${Nature}` | null;
  motif: string;
  jour: JourChoisi;
  ouvertA: string | null;
  recherche: string;
  retrait: SaisieRetrait;
}
export const SAISIE_VIDE: Saisie = {
  choix: null,
  motif: '',
  jour: JOUR_NON_CHOISI,
  ouvertA: null,
  recherche: '',
  retrait: {
    comment: null,
    note: '',
    cibles: [],
    photoId: null,
    execution: '',
    production: JOUR_NON_CHOISI,
    essai: JOUR_NON_CHOISI,
  },
};

/** Ce que les tiroirs et les étapes reçoivent. */
export interface ContexteMessage {
  admin: PortAdministration;
  m: MessageOuvert;
  saisie: Saisie;
  saisir: (s: Partial<Saisie>) => void;
  geste: Geste;
  /** Fait un geste ; s'il aboutit, le message est relu, `dit` est annoncé (nul quand l'écran le dit déjà) et `puis` s'exécute. */
  agir: (
    quel: string,
    action: () => Promise<unknown>,
    dit: string | null,
    puis?: () => void,
  ) => void;
  /** Relit le message après un conflit : la saisie reste. */
  relire: () => void;
  relecture: boolean;
  fermer: () => void;
}

/** L'échec d'un geste, là où l'on agissait. */
export function EchecDuGeste({
  c,
  quel,
  autre,
}: {
  c: ContexteMessage;
  quel: string;
  autre?: ReactNode;
}) {
  const e = c.geste.echec;
  if (e === null || e.quel !== quel) return null;
  return <BandeauDEchec echec={e} c={c} autre={autre} />;
}
function BandeauDEchec({
  echec,
  c,
  autre,
}: {
  echec: Echec;
  c: ContexteMessage;
  autre?: ReactNode;
}) {
  const aRelire = echec.genre === 'conflit' || echec.genre === 'introuvable';
  return (
    <BandeauEchec
      titre={echec.titre}
      action={aRelire ? c.relire : undefined}
      libelleAction="Relire le message"
      enCours={c.relecture}
      autre={autre}
    >
      {echec.texte}
    </BandeauEchec>
  );
}

export const enPhrase = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function BlocReponse({ m }: { m: MessageOuvert }) {
  const etat =
    m.reponse === 'non_demandee'
      ? null
      : m.reponse === 'faite'
        ? `Notée : partie ${m.reponduLe ? `le ${jourLong(m.reponduLe)}` : ''} par ${m.canal === 'non' ? '' : libelleCanal[m.canal]}`
        : m.reponse === 'impossible'
          ? 'Impossible : la coordonnée ne répond pas'
          : 'À faire, après ta décision';
  return (
    <BlocMessage titre="Réponse demandée">
      {m.canal === 'non' ? (
        <LigneMessageEcrite>Aucune réponse demandée.</LigneMessageEcrite>
      ) : (
        <>
          <LigneMessageEcrite libelle={m.canal === 'whatsapp' ? 'Sur WhatsApp' : 'Par e-mail'}>
            {coordonneeLisible(m)}
          </LigneMessageEcrite>
          <LigneMessageEcrite libelle="Où en est la réponse">{etat}</LigneMessageEcrite>
        </>
      )}
    </BlocMessage>
  );
}

const MOT_PUBLICATION: Record<NonNullable<MessageOuvert['fiche']>['publication'], string> = {
  brouillon: 'pas publiée',
  prete: 'prête, pas publiée',
  publiee: 'publiée',
  retiree: 'retirée',
};

export function BlocFiche({ c, surRattacher }: { c: ContexteMessage; surRattacher: () => void }) {
  const { m } = c;
  return (
    <BlocMessage titre="Fiche de l’annuaire">
      <LigneMessageEcrite>
        {m.fiche ? (
          <>
            <a className="font-bold text-primary" href={`#ecoles/fiche/${m.fiche.id}`}>
              {m.fiche.nom}
            </a>{' '}
            ({MOT_PUBLICATION[m.fiche.publication]})
          </>
        ) : (
          'Aucune fiche rattachée'
        )}
      </LigneMessageEcrite>
      {peutRattacher(m) && (
        <div className="flex flex-wrap gap-x-5">
          <button type="button" className={v2.lien} onClick={surRattacher}>
            {m.fiche ? 'Changer de fiche' : 'Rattacher à une fiche'}
          </button>
          {m.fiche && (
            <button
              type="button"
              className={v2.lien}
              disabled={c.geste.enCours !== null}
              onClick={() =>
                c.agir(
                  'hors-tiroir',
                  () => c.admin.rattacherMessage(m.reference, m.version, null),
                  'Détaché de la fiche.',
                )
              }
            >
              Détacher
            </button>
          )}
        </div>
      )}
    </BlocMessage>
  );
}

export function BlocDecision({ m }: { m: MessageOuvert }) {
  return (
    <BlocMessage titre="Décision">
      <LigneMessageEcrite>
        {m.decision ? libelleDecision[m.decision] : ''}
        {m.decideLe ? ` · ${quand(m.decideLe)}` : ''}
      </LigneMessageEcrite>
      {m.motif && <LigneMessageEcrite libelle="Motif, pour toi">{m.motif}</LigneMessageEcrite>}
    </BlocMessage>
  );
}

export function BlocHistorique({ m }: { m: MessageOuvert }) {
  return (
    <BlocMessage titre="Historique">
      <Journal
        faits={m.evenements.map((e) => ({
          quand: enPhrase(quand(e.le)),
          quoi: phraseEvenement(e),
        }))}
      />
    </BlocMessage>
  );
}

/** Le jour d'aujourd'hui au calendrier de Brazzaville, et l'échéance si l'on clôt maintenant. */
export const echeanceSiClos = () => jourLong(effacementSiClos(jourDuCongo()));
