/**
 * Les tiroirs d'un message (refonte publique, lot 3B2) : décider, répondre, clore, rattacher, relire une version. La conséquence
 * se lit près du geste ; rien n'est coché d'avance ; un échec garde la saisie.
 */
import { useEffect, useState } from 'react';
import type { Decision, Nature } from '../../modele/demandes';
import { jourDuCongo } from '../../modele/date-declaration';
import { correspondALaRecherche } from '../../modele/fiche-admin';
import {
  consequenceDeLaDecision,
  coordonneeLisible,
  decisionsProposees,
  demandeUnMotif,
  jourLong,
  jourNotable,
  libelleCanal,
  libelleDecision,
  libelleNature,
  libelleReorientation,
  lienDeReponse,
  lignesEcrites,
  reorientationsPossibles,
  MOTIF_AU_PLUS,
  type MessageOuvert,
  type VersionRecue,
} from '../../modele/messages-recus';
import type { EcoleVue } from '../../modele/ports';
import { cn } from '@/lib/utils';
import { Bouton, Dialogue } from '@/ui/v2/admin';
import { v2 } from '@/ui/v2/classes';
import { Champ, classeBouton } from '@/ui/v2/formulaire';
import {
  BandeauEchec,
  ChoixDuJour,
  ChoixUnique,
  LigneMessageEcrite,
  PastilleMessage,
  Reference,
} from '@/ui/v2/messages';
import { quand } from '../../ui/composants';
import { echeanceSiClos, EchecDuGeste, type ContexteMessage, type Saisie } from './MessageContexte';

function Entete({ titre, m }: { titre: string; m: MessageOuvert }) {
  return (
    <>
      <h2>{titre}</h2>
      <Reference className="text-sm text-muted-foreground">{m.reference}</Reference>
    </>
  );
}

/** « École absente », « Retrait »… : la file d'arrivée d'un choix « vers:… ». */
const versDe = (choix: Saisie['choix']): Nature | null =>
  choix?.startsWith('vers:') ? (choix.slice(5) as Nature) : null;

export function Decider({ c }: { c: ContexteMessage }) {
  const { m, saisie, saisir, admin } = c;
  const { choix, motif } = saisie;
  const vers = versDe(choix);
  const decision = vers === null ? (choix as Decision | null) : null;
  const options = [
    ...decisionsProposees(m)
      .filter((d) => d !== 'indesirable')
      .map((d) => ({ valeur: d as NonNullable<Saisie['choix']>, libelle: libelleDecision[d] })),
    ...reorientationsPossibles(m).map((n) => ({
      valeur: `vers:${n}` as NonNullable<Saisie['choix']>,
      libelle: libelleReorientation[n],
    })),
    ...decisionsProposees(m)
      .filter((d) => d === 'indesirable')
      .map((d) => ({ valeur: d as NonNullable<Saisie['choix']>, libelle: libelleDecision[d] })),
  ];
  const tropLong = [...motif].length > MOTIF_AU_PLUS;
  const enregistrer = () => {
    if (vers !== null) {
      c.agir(
        'decider',
        () => admin.reorienterMessage(m.reference, m.version, vers),
        'Passé dans une autre file : le nouveau message est relié à celui-ci.',
      );
    } else if (decision !== null) {
      c.agir(
        'decider',
        () =>
          admin.deciderMessage(
            m.reference,
            m.version,
            decision,
            demandeUnMotif(decision) ? motif : null,
          ),
        'Décision notée.',
      );
    }
  };
  return (
    <Dialogue
      titre={`Décider : ${libelleNature[m.nature]}`}
      variante="tiroir"
      fermer={c.fermer}
      occupe={c.geste.enCours !== null}
      entete={<Entete titre={`Décider : ${libelleNature[m.nature]}`} m={m} />}
    >
      <EchecDuGeste c={c} quel="decider" />
      <ChoixUnique
        legende="Décision"
        cacherLegende
        options={options}
        valeur={choix}
        surChoix={(v) => saisir({ choix: v })}
      />
      {demandeUnMotif(decision) && (
        <Champ
          libelle="Motif, pour toi"
          facultatif
          aide={`${MOTIF_AU_PLUS} caractères au plus.`}
          erreur={tropLong ? `Trop long : ${[...motif].length} caractères.` : undefined}
        >
          {(a) => (
            <textarea
              {...a}
              className={v2.zone}
              value={motif}
              onChange={(e) => saisir({ motif: e.target.value })}
            />
          )}
        </Champ>
      )}
      <p className="m-0 text-sm text-muted-foreground">
        {vers !== null
          ? 'Un nouveau message, relié à celui-ci, est créé dans la bonne file. Celui-ci reste lisible ici.'
          : consequenceDeLaDecision(m.nature, decision)}
      </p>
      <div className={v2.actions}>
        <Bouton
          enCours={c.geste.enCours === 'decider'}
          disabled={choix === null || tropLong}
          onClick={enregistrer}
        >
          Enregistrer la décision
        </Bouton>
        <Bouton variante="secondaire" onClick={c.fermer} disabled={c.geste.enCours !== null}>
          Annuler
        </Bouton>
      </div>
    </Dialogue>
  );
}

/** Ouvrir la conversation, sans rien envoyer ni noter : la phrase est neutre, le message n'est jamais recopié. */
export function OuvrirLaConversation({ c, plein = true }: { c: ContexteMessage; plein?: boolean }) {
  const { m, saisie, saisir } = c;
  const lien = lienDeReponse(m);
  const surWhatsApp = m.canal === 'whatsapp';
  return (
    <>
      <span className="text-[15px] [overflow-wrap:anywhere]">
        {surWhatsApp ? 'Sur WhatsApp' : 'Par e-mail'} · <b>{coordonneeLisible(m)}</b>
      </span>
      {lien ? (
        <a
          className={cn(classeBouton({ variant: plein ? 'default' : 'outline' }), 'w-fit')}
          href={lien}
          target={surWhatsApp ? '_blank' : undefined}
          rel="noopener noreferrer"
          onClick={() => saisir({ ouvertA: new Date().toISOString() })}
        >
          {surWhatsApp ? 'Ouvrir WhatsApp' : 'Ouvrir le courrier'}
        </a>
      ) : (
        <PastilleMessage ton="danger">Cette coordonnée ne s’ouvre pas</PastilleMessage>
      )}
      <p className="m-0 text-sm text-muted-foreground">
        {surWhatsApp ? 'La conversation s’ouvre' : 'Le courrier s’ouvre'} avec la référence et une
        phrase neutre. L’ouvrir n’envoie rien et ne note rien.
      </p>
      {saisie.ouvertA && (
        <span role="status">
          <PastilleMessage ton="attention">
            {surWhatsApp ? 'WhatsApp' : 'Courrier'} ouvert {quand(saisie.ouvertA)} : pas encore noté
          </PastilleMessage>
        </span>
      )}
    </>
  );
}

/** Noter la réponse : le jour réel, ou l'impossibilité. Le canal est celui que la personne a choisi. */
export function NoterLaReponse({
  c,
  quel,
  prevenir = false,
}: {
  c: ContexteMessage;
  quel: string;
  prevenir?: boolean;
}) {
  const { m, saisie, saisir, admin } = c;
  const aujourdHui = jourDuCongo();
  const pret = jourNotable(saisie.jour.jour, aujourdHui);
  return (
    <>
      <ChoixDuJour
        legende={prevenir ? 'Quand l’as-tu prévenue ?' : 'Quand la réponse est-elle partie ?'}
        aujourdHui={aujourdHui}
        valeur={saisie.jour}
        surChoix={(jour) => saisir({ jour })}
      />
      <p className="m-0 text-sm text-muted-foreground">
        NTanova garde le canal ({m.canal === 'non' ? '' : libelleCanal[m.canal]}) et le jour, jamais
        les échanges.
      </p>
      <div className={v2.actions}>
        <Bouton
          enCours={c.geste.enCours === quel}
          disabled={!pret || c.geste.enCours !== null}
          onClick={() =>
            c.agir(
              quel,
              () => admin.noterReponse(m.reference, m.version, 'faite', saisie.jour.jour),
              'Réponse notée.',
            )
          }
        >
          {prevenir ? 'Noter : personne prévenue' : 'Noter l’envoi'}
        </Bouton>
        <Bouton
          variante="danger"
          disabled={c.geste.enCours !== null}
          onClick={() =>
            c.agir(
              quel,
              () => admin.noterReponse(m.reference, m.version, 'impossible', null),
              'Noté : réponse impossible.',
            )
          }
        >
          {prevenir ? 'Impossible de la prévenir' : 'Réponse impossible'}
        </Bouton>
      </div>
    </>
  );
}

export function Repondre({ c }: { c: ContexteMessage }) {
  const { m } = c;
  const titre = m.canal === 'whatsapp' ? 'Répondre sur WhatsApp' : 'Répondre par e-mail';
  return (
    <Dialogue
      titre={titre}
      variante="tiroir"
      fermer={c.fermer}
      occupe={c.geste.enCours !== null}
      entete={<Entete titre={titre} m={m} />}
    >
      <EchecDuGeste c={c} quel="repondre" />
      {m.reponse === 'faite' && m.reponduLe && (
        <PastilleMessage ton="neutre">Déjà notée : le {jourLong(m.reponduLe)}</PastilleMessage>
      )}
      <OuvrirLaConversation c={c} plein={!c.saisie.ouvertA && c.saisie.jour.mode === null} />
      <hr className="m-0 border-0 border-t border-border" />
      <NoterLaReponse c={c} quel="repondre" />
    </Dialogue>
  );
}

export function Clore({ c }: { c: ContexteMessage }) {
  const { m, admin } = c;
  return (
    <Dialogue
      titre={`Clore ${m.reference} ?`}
      variante="confirmation"
      libelleFermeture="Annuler"
      fermer={c.fermer}
      occupe={c.geste.enCours !== null}
      entete={
        <h2>
          Clore <span className="whitespace-nowrap">{m.reference} ?</span>
        </h2>
      }
    >
      <EchecDuGeste c={c} quel="clore" />
      <p className="m-0">
        Effacé automatiquement le <b>{echeanceSiClos()}</b>, 12 mois après la clôture : message,
        coordonnée, versions et historique.
      </p>
      <p className="m-0 text-sm text-muted-foreground">
        Tu peux le rouvrir d’ici là : l’échéance est annulée, et repart de la clôture suivante.
      </p>
      <Bouton
        enCours={c.geste.enCours === 'clore'}
        onClick={() => c.agir('clore', () => admin.cloreMessage(m.reference, m.version), null)}
      >
        Clore
      </Bouton>
    </Dialogue>
  );
}

const AU_PLUS = 20;

/** Rattacher : chercher dans toutes les écoles. Cela relie le message à une fiche, et ne la change pas. */
export function Rattacher({ c }: { c: ContexteMessage }) {
  const { m, admin, saisie, saisir } = c;
  const [ecoles, setEcoles] = useState<EcoleVue[] | null>(null);
  const [panne, setPanne] = useState(false);
  const [tour, setTour] = useState(0);
  useEffect(() => {
    let abandonne = false;
    admin
      .ecoles()
      .then((e) => {
        if (abandonne) return;
        setEcoles(e.filter((x) => !x.corbeille));
        setPanne(false);
      })
      .catch(() => !abandonne && setPanne(true));
    return () => {
      abandonne = true;
    };
  }, [admin, tour]);
  const recherche = saisie.recherche.trim();
  const trouvees =
    recherche.length < 2 ? [] : (ecoles ?? []).filter((e) => correspondALaRecherche(e, recherche));
  return (
    <Dialogue
      titre="Rattacher à une fiche"
      variante="tiroir"
      fermer={c.fermer}
      occupe={c.geste.enCours !== null}
      entete={<Entete titre="Rattacher à une fiche" m={m} />}
    >
      <EchecDuGeste c={c} quel="rattacher" />
      <p className="m-0 text-sm text-muted-foreground">
        Rattacher relie le message à une fiche ; cela ne décide rien et ne change pas la fiche.
      </p>
      <Champ libelle="Chercher dans toutes les écoles">
        {(a) => (
          <input
            {...a}
            type="search"
            className={v2.champ}
            value={saisie.recherche}
            onChange={(e) => saisir({ recherche: e.target.value })}
          />
        )}
      </Champ>
      {panne ? (
        <BandeauEchec
          titre="Les écoles ne se chargent pas."
          action={() => setTour((t) => t + 1)}
          libelleAction="Réessayer"
        >
          Réseau ou serveur. Ta recherche est gardée.
        </BandeauEchec>
      ) : (
        <p className="m-0 text-sm text-muted-foreground" role="status">
          {ecoles === null
            ? 'Chargement des écoles…'
            : recherche.length < 2
              ? 'Écris deux lettres au moins.'
              : trouvees.length === 0
                ? 'Aucune école ne correspond.'
                : `${trouvees.length} école${trouvees.length > 1 ? 's' : ''}${trouvees.length > AU_PLUS ? ` ; les ${AU_PLUS} premières` : ''}`}
        </p>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Écoles trouvées">
        {trouvees.slice(0, AU_PLUS).map((e) => (
          <li key={e.id}>
            <button
              type="button"
              disabled={c.geste.enCours !== null}
              onClick={() =>
                c.agir(
                  'rattacher',
                  () => admin.rattacherMessage(m.reference, m.version, e.id),
                  'Rattaché à la fiche, qui n’a pas changé.',
                )
              }
              className="flex min-h-[52px] w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg border border-border bg-card px-3.5 py-2.5 text-left font-sans text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-50 [@media(hover:hover)]:hover:border-primary"
            >
              <b className="text-base [overflow-wrap:anywhere]">
                {e.etiquette ? `${e.nom} — ${e.etiquette}` : e.nom}
              </b>
              <span className="text-sm text-muted-foreground">
                {[
                  e.quartier ?? e.division,
                  {
                    brouillon: 'pas publiée',
                    prete: 'prête, pas publiée',
                    publiee: 'publiée',
                    retiree: 'retirée',
                  }[e.publication],
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialogue>
  );
}

/** Une version qui n'est pas la courante : gardée telle quelle, jamais masquée. */
export function VersionAncienne({
  m,
  version,
  fermer,
}: {
  m: MessageOuvert;
  version: VersionRecue;
  fermer: () => void;
}) {
  const courante = m.versions.find((v) => v.courante);
  return (
    <Dialogue
      titre={`Version ${version.revision}`}
      variante="tiroir"
      fermer={fermer}
      entete={<Entete titre={`Version ${version.revision}`} m={m} />}
    >
      <p className="m-0 text-sm text-muted-foreground">
        {version.tardive
          ? `Arrivée en retard, ${quand(version.recueLe)}, après une version plus récente : gardée, sans la remplacer.`
          : `Reçue ${quand(version.recueLe)}, remplacée par la version ${courante?.revision ?? ''} avant l’ouverture.`}
      </p>
      <div>
        {lignesEcrites(m.nature, version.contenu).map((l) => (
          <LigneMessageEcrite key={l.libelle} libelle={l.libelle}>
            {l.valeur}
          </LigneMessageEcrite>
        ))}
      </div>
      <Bouton variante="secondaire" className="self-start" onClick={fermer}>
        Fermer
      </Bouton>
    </Dialogue>
  );
}
