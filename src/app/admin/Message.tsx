/**
 * Un message ouvert (refonte publique, lot 3B2) : ce qui est écrit, ses versions, ses suites, la réponse demandée, la fiche et
 * l'historique ; puis les gestes, un seul en avant. L'ouvrir fige son texte. Un retrait a ses étapes (`RetraitEtapes.tsx`).
 *
 * Chaque geste porte la version lue. S'il n'aboutit pas, la saisie reste ; s'il aboutit, le message est relu dans la base : rien
 * n'est supposé de ce qu'elle a fait.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  adresseFile,
  adresseMessage,
  fileDuMessage,
  gesteSuivant,
  jourLong,
  libelleARetirer,
  libelleErreurAlerte,
  libelleNature,
  libelleOrigineMessage,
  libelleSujet,
  ligneDeGeste,
  lignesEcrites,
  pastillesDuMessage,
  peutClore,
  peutDecider,
  peutRepondre,
  type FileMessages,
  type MessageOuvert,
  type VersionRecue,
} from '../../modele/messages-recus';
import {
  ErreurAcces,
  ErreurIntrouvable,
  ErreurSession,
  type PortAdministration,
} from '../../modele/ports';
import { cn } from '@/lib/utils';
import { Bouton } from '@/ui/v2/admin';
import { v2 } from '@/ui/v2/classes';
import {
  BandeauEchec,
  BlocMessage,
  Encart,
  LigneMessageEcrite,
  Pastilles,
  Reference,
  Squelette,
} from '@/ui/v2/messages';
import { quand } from '../../ui/composants';
import { useGeste } from './geste-message';
import { Clore, Decider, Rattacher, Repondre, VersionAncienne } from './MessageTiroirs';
import {
  BlocDecision,
  BlocFiche,
  BlocHistorique,
  BlocReponse,
  EchecDuGeste,
  SAISIE_VIDE,
  type ContexteMessage,
  type Saisie,
} from './MessageContexte';
import { RetraitEtapes } from './RetraitEtapes';

type Tiroir = 'decider' | 'repondre' | 'clore' | 'rattacher' | { version: VersionRecue };

export function Message({
  admin,
  reference,
  file,
  surChangement,
}: {
  admin: PortAdministration;
  reference: string;
  file: FileMessages;
  surChangement: () => void;
}) {
  const [m, setM] = useState<MessageOuvert | null>(null);
  const [panne, setPanne] = useState<unknown>(null);
  const [relecture, setRelecture] = useState(false);
  const [saisie, setSaisie] = useState<Saisie>(SAISIE_VIDE);
  const [tiroir, setTiroir] = useState<Tiroir | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const geste = useGeste();
  const titre = useRef<HTMLHeadingElement>(null);
  const premier = useRef(true);
  const { oublier } = geste;

  const lire = useCallback(async (): Promise<MessageOuvert> => {
    const lu = await admin.ouvrirMessage(reference);
    setM(lu);
    setPanne(null);
    return lu;
  }, [admin, reference]);

  // L'ouverture : elle fige le texte, une fois. La file relit ses lignes pour ne plus dire « Nouveau ».
  useEffect(() => {
    let abandonne = false;
    admin
      .ouvrirMessage(reference)
      .then((lu) => {
        if (abandonne) return;
        setM(lu);
        surChangement();
      })
      .catch((e: unknown) => {
        if (!abandonne) setPanne(e);
      });
    return () => {
      abandonne = true;
    };
    // `surChangement` change à chaque rendu de la boîte : il ne rouvre rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, reference]);

  // Sur téléphone, la file disparaît : le focus va au titre du message, pas au vide.
  useEffect(() => {
    if (m === null || !premier.current) return;
    premier.current = false;
    const actif = document.activeElement;
    if (!(actif instanceof HTMLElement) || actif === document.body || actif.offsetParent === null) {
      titre.current?.focus({ preventScroll: true });
      scrollTo({ top: 0 });
    }
  }, [m]);

  const relire = () => {
    setRelecture(true);
    lire()
      .then(() => {
        oublier();
        setTiroir(null);
        setAnnonce('Message relu. Ta saisie est gardée : vérifie-la avant d’enregistrer.');
        surChangement();
      })
      .catch((e: unknown) => setPanne(e))
      .finally(() => setRelecture(false));
  };

  if (panne !== null && m === null) {
    return (
      <div className="min-w-0 flex-1">
        <PanneDuMessage
          panne={panne}
          reference={reference}
          file={file}
          reessayer={() => {
            setPanne(null);
            void lire()
              .then(surChangement)
              .catch((e: unknown) => setPanne(e));
          }}
        />
      </div>
    );
  }
  if (m === null) {
    return (
      <div className="min-w-0 flex-1">
        <Squelette libelle={`Ouverture de ${reference}…`} />
      </div>
    );
  }

  const agir = (
    quel: string,
    action: () => Promise<unknown>,
    dit: string | null,
    puis?: () => void,
  ) => {
    setAnnonce(null);
    void geste.faire(quel, action, async () => {
      puis?.();
      setTiroir(null);
      // Rattacher ou relancer une alerte n'enregistre pas l'étape en cours de saisie : elle reste. La photo, elle, était d'une autre fiche.
      setSaisie((avant) =>
        quel === 'hors-tiroir'
          ? avant
          : quel === 'rattacher'
            ? { ...avant, recherche: '', retrait: { ...avant.retrait, photoId: null } }
            : SAISIE_VIDE,
      );
      surChangement();
      // Le geste est écrit. Si la relecture échoue, on le dit à part : ce n'est pas le geste qui a échoué.
      try {
        await lire();
        setAnnonce(dit);
      } catch (e) {
        setPanne(e);
        setAnnonce('Ton geste est enregistré, mais le message ne se relit pas.');
      }
      // Le bouton d'où l'on vient est parfois éteint par le geste : le focus revient au titre, jamais en haut de page.
      setTimeout(() => {
        if (document.activeElement === document.body) titre.current?.focus({ preventScroll: true });
      }, 50);
    });
  };
  const c: ContexteMessage = {
    admin,
    m,
    saisie,
    saisir: (s) => setSaisie((avant) => ({ ...avant, ...s })),
    geste,
    agir,
    relire,
    relecture,
    fermer: () => {
      oublier();
      setTiroir(null);
    },
  };
  const courante = m.versions.find((v) => v.courante);
  const contenu = courante?.contenu ?? {};
  const origine = contenu.origine as keyof typeof libelleOrigineMessage | undefined;
  const titreDuMessage =
    m.nature === 'contact'
      ? typeof contenu.sujet === 'string'
        ? libelleSujet[contenu.sujet as keyof typeof libelleSujet]
        : 'Message sans sujet'
      : m.nature === 'retrait'
        ? `Retirer ${(typeof contenu.aRetirer === 'string' ? libelleARetirer[contenu.aRetirer as keyof typeof libelleARetirer] : 'une information').toLowerCase()}`
        : ((typeof contenu.nomEcole === 'string' ? contenu.nomEcole : null) ??
          m.fiche?.nom ??
          'École non désignée');
  const ecole = m.fiche?.nom ?? (typeof contenu.nomEcole === 'string' ? contenu.nomEcole : null);
  const ouvrir = (t: Tiroir) => {
    oublier();
    setAnnonce(null);
    setTiroir(t);
  };

  return (
    <article aria-labelledby="titre-message" className="flex min-w-0 flex-1 flex-col gap-3">
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Pastilles
            liste={[{ ton: 'neutre', texte: libelleNature[m.nature] }, ...pastillesDuMessage(m)]}
          />
          <Reference className="ml-auto text-sm font-bold text-muted-foreground max-lg:sr-only">
            {m.reference}
          </Reference>
        </div>
        <h2
          id="titre-message"
          ref={titre}
          tabIndex={-1}
          className="m-0 font-serif text-[26px] leading-tight font-bold outline-none [overflow-wrap:anywhere] max-lg:text-[22px]"
        >
          {titreDuMessage}
        </h2>
        <span className="text-sm text-muted-foreground">
          {m.nature === 'retrait' && ecole ? `Fiche ${ecole} · ` : ''}
          Reçu {quand(m.recuLe)}
          {origine && libelleOrigineMessage[origine]
            ? ` · arrivé par ${libelleOrigineMessage[origine]}`
            : ''}
        </span>
      </header>

      {annonce && (
        <p className={v2.bandeSucces} role="status">
          {annonce}
        </p>
      )}
      {panne !== null && (
        <BandeauEchec
          titre="Le message ne se relit pas."
          action={relire}
          libelleAction="Réessayer"
          enCours={relecture}
        >
          Ce qui est à l’écran date d’avant. Un geste fait maintenant ne peut rien écraser.
        </BandeauEchec>
      )}
      <EchecDuGeste c={c} quel="hors-tiroir" />

      <Encarts m={m} file={file} c={c} surVersion={(version) => ouvrir({ version })} />

      {m.nature === 'retrait' && m.retrait ? (
        <RetraitEtapes c={c} retrait={m.retrait} surRattacher={() => ouvrir('rattacher')} />
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <BlocMessage titre="Ce qui est écrit">
            {lignesEcrites(m.nature, contenu).map((l) => (
              <LigneMessageEcrite key={l.libelle} libelle={l.libelle}>
                {l.valeur}
              </LigneMessageEcrite>
            ))}
          </BlocMessage>
          <div className="flex min-w-0 flex-col gap-3">
            <BlocReponse m={m} />
            {m.nature !== 'contact' && <BlocFiche c={c} surRattacher={() => ouvrir('rattacher')} />}
            {m.decision !== null && m.etat !== 'indesirable' && <BlocDecision m={m} />}
            <BlocHistorique m={m} />
          </div>
        </div>
      )}

      <BarreDesGestes c={c} ouvrir={ouvrir} />

      {tiroir === 'decider' && <Decider c={c} />}
      {tiroir === 'repondre' && <Repondre c={c} />}
      {tiroir === 'clore' && <Clore c={c} />}
      {tiroir === 'rattacher' && <Rattacher c={c} />}
      {tiroir !== null && typeof tiroir === 'object' && (
        <VersionAncienne m={m} version={tiroir.version} fermer={() => setTiroir(null)} />
      )}
    </article>
  );
}

function PanneDuMessage({
  panne,
  reference,
  file,
  reessayer,
}: {
  panne: unknown;
  reference: string;
  file: FileMessages;
  reessayer: () => void;
}) {
  if (panne instanceof ErreurIntrouvable) {
    return (
      <BandeauEchec
        titre={`${reference} n’existe pas, ou plus.`}
        autre={
          <a className={v2.lien} href={`#${adresseFile(file)}`}>
            Voir la file
          </a>
        }
      >
        Un message clos est effacé 12 mois après sa clôture, un indésirable après 30 jours.
      </BandeauEchec>
    );
  }
  if (panne instanceof ErreurAcces) {
    return (
      <BandeauEchec titre="Cette page est réservée à l’administration.">
        Aucun message n’est chargé : la base refuse la lecture à ce compte.
      </BandeauEchec>
    );
  }
  if (panne instanceof ErreurSession) {
    return (
      <BandeauEchec
        titre="Ta session est terminée."
        action={() => location.reload()}
        libelleAction="Recharger la page"
      >
        Reconnecte-toi : {reference} s’ouvrira directement.
      </BandeauEchec>
    );
  }
  return (
    <BandeauEchec titre="Ce message ne se charge pas." action={reessayer} libelleAction="Réessayer">
      Réseau ou serveur. Rien n’est perdu : il reste enregistré.
    </BandeauEchec>
  );
}

/** Ce qu'il faut savoir avant de lire : clôture, indésirable, versions, suites, limite, alerte. */
function Encarts({
  m,
  file,
  c,
  surVersion,
}: {
  m: MessageOuvert;
  file: FileMessages;
  c: ContexteMessage;
  surVersion: (v: VersionRecue) => void;
}) {
  const lien = (reference: string) => (
    <a className={v2.lien} href={`#${adresseMessage(reference)}`}>
      <Reference>{reference}</Reference>
    </a>
  );
  const autres = m.versions.filter((v) => !v.courante);
  const courante = m.versions.find((v) => v.courante);
  const alerteEnEchec =
    m.alerte !== null &&
    (m.alerte.etat === 'abandonnee' || (m.alerte.etat !== 'envoyee' && m.alerte.erreur !== null));
  return (
    <>
      {m.etat === 'close' && m.effaceLe && (
        <Encart ton="succes" titre={`Clos ${m.closLe ? quand(m.closLe) : ''}`} role="status">
          <span>
            Effacé automatiquement le {jourLong(m.effaceLe)} : message, coordonnée, versions et
            historique. Tu peux le rouvrir d’ici là.
          </span>
        </Encart>
      )}
      {m.etat === 'indesirable' && m.effaceLe && (
        <Encart titre="Indésirable">
          <span>Effacé automatiquement le {jourLong(m.effaceLe)} si tu ne fais rien.</span>
        </Encart>
      )}
      {m.suiteDe && (
        <Encart titre="Suite d’un autre message" action={lien(m.suiteDe)}>
          <span>Envoyée après son ouverture : le message lu n’a pas changé.</span>
        </Encart>
      )}
      {m.suites.length > 0 && (
        <Encart
          ton="attention"
          titre={m.suites.length > 1 ? `${m.suites.length} suites reçues` : 'Une suite reçue'}
          action={
            <span className="flex flex-wrap gap-x-4">
              {m.suites.map((r) => (
                <span key={r}>{lien(r)}</span>
              ))}
            </span>
          }
        >
          <span>La personne a réécrit après l’ouverture. Ce texte-ci n’a pas changé.</span>
        </Encart>
      )}
      {m.reorienteDe && (
        <Encart titre="Vient d’un autre message" action={lien(m.reorienteDe)}>
          <span>Passé dans cette file ; l’original reste lisible.</span>
        </Encart>
      )}
      {m.reorienteVers.length > 0 && (
        <Encart
          ton="succes"
          titre="Passé dans une autre file"
          action={
            <span className="flex flex-wrap gap-x-4">
              {m.reorienteVers.map((r) => (
                <span key={r}>{lien(r)}</span>
              ))}
            </span>
          }
        >
          <span>Le nouveau message est relié à celui-ci, qui reste lisible ici.</span>
        </Encart>
      )}
      {m.limiteLe && (
        <Encart titre={`Limite d’envois atteinte ${quand(m.limiteLe)}`}>
          <span>
            Son dernier texte n’est pas ici : la personne a vu un refus, son texte gardé, et un
            nouveau message proposé.
          </span>
        </Encart>
      )}
      {courante && autres.length > 0 && (
        <Encart
          titre={`Version ${courante.revision} affichée, ${m.versions.length} reçues`}
          action={
            <span className="flex flex-wrap gap-x-4">
              {autres.map((v) => (
                <button
                  key={v.revision}
                  type="button"
                  className={v2.lien}
                  onClick={() => surVersion(v)}
                >
                  Voir la version {v.revision}
                  {v.tardive ? ', arrivée en retard' : ''}
                </button>
              ))}
            </span>
          }
        >
          <span>
            {autres.some((v) => v.tardive)
              ? 'Une version arrivée en retard est gardée, sans remplacer la plus récente.'
              : 'La personne a corrigé son texte avant l’ouverture : même référence, rien n’est perdu.'}
          </span>
        </Encart>
      )}
      {m.decision === 'existe' && m.etat !== 'close' && (
        <Encart
          ton="succes"
          titre="Prochaine étape : ajouter l’école"
          action={
            <a className={v2.lien} href="#ecoles">
              Ouvrir Écoles
            </a>
          }
        >
          <span>
            Dans Écoles, « Ajouter ». Elle n’y est pas publiée : publier reste un autre geste.
          </span>
        </Encart>
      )}
      {m.decision === 'retenue' && m.etat !== 'close' && (
        <Encart
          ton="succes"
          titre="Prochaine étape : corriger la fiche"
          action={
            <a className={v2.lien} href={m.fiche ? `#ecoles/fiche/${m.fiche.id}` : '#ecoles'}>
              {m.fiche ? 'Ouvrir la fiche dans Écoles' : 'Ouvrir Écoles'}
            </a>
          }
        >
          <span>La correction paraît à la prochaine mise à jour du site.</span>
        </Encart>
      )}
      {alerteEnEchec && m.alerte && (
        <Encart
          ton="attention"
          titre={
            m.alerte.etat === 'abandonnee' ? 'Alerte e-mail abandonnée' : 'Alerte e-mail en échec'
          }
          action={
            <Bouton
              variante="secondaire"
              className="mt-1.5"
              enCours={c.geste.enCours === 'hors-tiroir'}
              texteEnCours="Relance…"
              onClick={() =>
                c.agir(
                  'hors-tiroir',
                  () => c.admin.relancerAlerte(m.reference),
                  'Relance demandée : le prochain passage du service essaie de nouveau.',
                )
              }
            >
              Relancer cette alerte
            </Bouton>
          }
        >
          <span>
            {m.alerte.essais} essai{m.alerte.essais > 1 ? 's' : ''}
            {m.alerte.erreur ? ` : ${libelleErreurAlerte[m.alerte.erreur]}` : ''}. Le message est
            bien ici. Relancer avance le prochain essai ; rien ne part de ce navigateur.
          </span>
        </Encart>
      )}
      {fileDuMessage(m) !== file && file !== 'alertes' && (
        <p className="m-0 text-sm text-muted-foreground">
          Ce message est maintenant dans{' '}
          <a
            className="font-bold text-primary"
            href={`#${adresseMessage(m.reference, fileDuMessage(m))}`}
          >
            {
              {
                'a-traiter': 'À traiter',
                'en-attente': 'En attente',
                clos: 'Clos',
                retraits: 'Retraits',
                'retraits-clos': 'Retraits clos',
                indesirables: 'Indésirables',
                alertes: 'Alertes',
              }[fileDuMessage(m)]
            }
          </a>
          .
        </p>
      )}
    </>
  );
}

/** Les gestes du message, collés en bas sur téléphone. Un seul est plein : le prochain. */
function BarreDesGestes({ c, ouvrir }: { c: ContexteMessage; ouvrir: (t: Tiroir) => void }) {
  const { m } = c;
  const suivant = gesteSuivant(m);
  const occupe = c.geste.enCours !== null;
  const variante = (g: string) => (suivant === g ? 'principal' : 'secondaire');
  const large = 'max-lg:w-full max-lg:px-2';
  const retrait = m.nature === 'retrait';
  const attente = m.etat === 'ouverte' || m.etat === 'en_attente';
  // Un retrait avance par ses étapes : ici, seulement la mise en attente, la réouverture, ce qui vaut pour tous.
  if (retrait && m.etat === 'ouverte') {
    return (
      <div>
        <button
          type="button"
          className={v2.lien}
          disabled={occupe}
          onClick={() =>
            c.agir(
              'hors-tiroir',
              () => c.admin.mettreEnAttente(m.reference, m.version, true),
              'Mis en attente.',
            )
          }
        >
          Mettre en attente (un doute, une précision demandée)
        </button>
      </div>
    );
  }
  return (
    <div
      role="group"
      aria-label="Traiter ce message"
      className="sticky bottom-16 z-10 -mx-4 flex flex-col gap-2 border-t border-border bg-background px-4 py-3 lg:bottom-0 lg:mx-0 lg:flex-row lg:flex-wrap lg:items-center lg:px-0"
    >
      <p className="m-0 text-sm text-muted-foreground lg:order-2">{ligneDeGeste(m)}</p>
      {m.etat === 'close' ? (
        <Bouton
          className={large}
          enCours={c.geste.enCours === 'hors-tiroir'}
          texteEnCours="Réouverture…"
          onClick={() =>
            c.agir(
              'hors-tiroir',
              () => c.admin.rouvrirMessage(m.reference, m.version),
              'Rouvert : la date d’effacement est annulée.',
            )
          }
        >
          Rouvrir
        </Bouton>
      ) : m.etat === 'indesirable' ? (
        <Bouton
          className={large}
          variante="secondaire"
          enCours={c.geste.enCours === 'hors-tiroir'}
          texteEnCours="Enregistrement…"
          onClick={() =>
            c.agir(
              'hors-tiroir',
              () => c.admin.restaurerMessage(m.reference, m.version),
              'Rendu à sa file.',
            )
          }
        >
          Ce n’est pas indésirable
        </Bouton>
      ) : m.etat === 'en_attente' && (retrait || suivant === 'reprendre') ? (
        <span className="flex flex-wrap gap-2 max-lg:flex-col">
          <Bouton
            className={large}
            enCours={c.geste.enCours === 'hors-tiroir'}
            texteEnCours="Enregistrement…"
            onClick={() =>
              c.agir(
                'hors-tiroir',
                () => c.admin.mettreEnAttente(m.reference, m.version, false),
                'Remis à traiter.',
              )
            }
          >
            Remettre à traiter
          </Bouton>
          {peutRepondre(m) && (
            <Bouton
              className={large}
              variante="secondaire"
              disabled={occupe}
              onClick={() => ouvrir('repondre')}
            >
              Répondre
            </Bouton>
          )}
        </span>
      ) : (
        <>
          <span className="grid grid-cols-3 gap-2 lg:flex">
            <Bouton
              className={large}
              variante={variante('decider')}
              disabled={occupe || !peutDecider(m)}
              onClick={() => ouvrir('decider')}
            >
              Décider
            </Bouton>
            <Bouton
              className={large}
              variante={variante('repondre')}
              disabled={occupe || !peutRepondre(m)}
              onClick={() => ouvrir('repondre')}
            >
              Répondre
            </Bouton>
            <Bouton
              className={large}
              variante={variante('clore')}
              disabled={occupe || !peutClore(m)}
              onClick={() => ouvrir('clore')}
            >
              Clore
            </Bouton>
          </span>
          {attente && (
            <button
              type="button"
              className={cn(v2.lien, 'lg:order-3 lg:ml-auto')}
              disabled={occupe}
              onClick={() =>
                c.agir(
                  'hors-tiroir',
                  () => c.admin.mettreEnAttente(m.reference, m.version, m.etat !== 'en_attente'),
                  m.etat === 'en_attente' ? 'Remis à traiter.' : 'Mis en attente.',
                )
              }
            >
              {m.etat === 'en_attente' ? 'Remettre à traiter' : 'Mettre en attente'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
