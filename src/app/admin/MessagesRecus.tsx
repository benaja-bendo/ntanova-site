/**
 * « Messages reçus » (refonte publique, lot 3B2 ; planches « Messages reçus » et « Retraits » du canevas admin) : la boîte de
 * Contact et de l'annuaire, à ne pas confondre avec « Les familles demandent ». Sur ordinateur, la file et le message côte à
 * côte ; sur téléphone, la file puis le message, avec un retour. L'adresse reste `#demandes/<référence>`, celle des alertes.
 *
 * Lister n'ouvre rien, et rien n'est présélectionné : ouvrir fige le texte. Rien ici ne modifie ni ne publie une école.
 */
import { useEffect, useRef, useState } from 'react';
import type { Nature } from '../../modele/demandes';
import {
  adresseFile,
  adresseMessage,
  dureeDepuis,
  estFileDeRetraits,
  etatDeLaPurge,
  etatDesAlertes,
  jourLong,
  libelleNature,
  lireAdresse,
  naturesDeLaFile,
  pastillesDeLigne,
  precisionDeLigne,
  titreDeLigne,
  titreEtape,
  ETAPES_RETRAIT,
  DELAI_RETRAIT_JOURS,
  type FileMessages,
  type LigneMessage,
  type ResumeMessages,
} from '../../modele/messages-recus';
import { ErreurAcces, ErreurSession, type PortAdministration } from '../../modele/ports';
import { cn } from '@/lib/utils';
import { Bouton } from '@/ui/v2/admin';
import { Bande } from '@/ui/v2/bande';
import { v2 } from '@/ui/v2/classes';
import { Icone } from '@/ui/v2/formulaire';
import { BandeauEchec, CarteMessage, FileVide, Squelette } from '@/ui/v2/messages';
import { quand } from '../../ui/composants';
import { aller, useAdresse } from '../commun/adresse';
import { TitreEcran } from './Cadre';
import { Message } from './Message';
import { Compteur, Onglets, Puce } from './ui';

const PAGE = 30;

const VIDE: Record<FileMessages, [string, string]> = {
  'a-traiter': [
    'Aucun message à traiter.',
    'Les nouveaux arrivent ici. L’alerte par e-mail, une fois activée, ne porte pas leur contenu.',
  ],
  'en-attente': ['Rien en attente.', 'Un message mis en attente reste ici jusqu’à sa reprise.'],
  clos: ['Aucun message clos.', 'Un message clos est effacé 12 mois après sa clôture.'],
  retraits: ['Aucune demande de retrait.', 'Elles arrivent ici, à part des corrections.'],
  'retraits-clos': ['Aucun retrait clos.', 'Un retrait clos est effacé 12 mois après sa clôture.'],
  indesirables: [
    'Aucun indésirable.',
    'Un envoi piégé arrive ici, sans alerte, et s’efface 30 jours après.',
  ],
  alertes: ['Aucune alerte en échec.', 'Une alerte qui ne part pas se verra ici, avec son motif.'],
};

type Lecture =
  { cle: string; lignes: LigneMessage[]; fin: boolean } | { cle: string; erreur: unknown };

/** Ce qu'une lecture en panne dit : jamais « vide », jamais le texte d'une erreur. */
export function texteDePanne(
  e: unknown,
  quoi: string,
): { titre: string; texte: string; rejouable: boolean } {
  if (e instanceof ErreurAcces) {
    return {
      titre: 'Cette page est réservée à l’administration.',
      texte: 'Aucun message n’est chargé : la base refuse la lecture à ce compte.',
      rejouable: false,
    };
  }
  if (e instanceof ErreurSession) {
    return {
      titre: 'Ta session est terminée.',
      texte: 'Recharge la page pour te reconnecter. Rien n’est perdu.',
      rejouable: true,
    };
  }
  return {
    titre: `${quoi} ne se chargent pas.`,
    texte: 'Réseau ou serveur. Rien n’est perdu : ils restent enregistrés.',
    rejouable: true,
  };
}

/** Une ligne courte sous le titre : où en est le message, et quand il est arrivé. */
function precision(l: LigneMessage): string {
  if (l.nature === 'retrait') {
    const rang =
      l.etapeRetrait === null || l.etapeRetrait === 'close'
        ? -1
        : ETAPES_RETRAIT.indexOf(l.etapeRetrait);
    const etape = ETAPES_RETRAIT[rang];
    return etape
      ? `Étape ${rang + 1} sur ${ETAPES_RETRAIT.length} : ${titreEtape[etape]}`
      : l.effaceLe
        ? `Clos · effacé le ${jourLong(l.effaceLe)}`
        : `Reçu ${quand(l.recuLe)}`;
  }
  const debut = precisionDeLigne(l);
  const fin =
    l.effaceLe !== null
      ? `${l.etat === 'close' ? 'clos' : 'reçu'} ${quand(l.closLe ?? l.recuLe)} · effacé le ${jourLong(l.effaceLe)}`
      : `reçu ${quand(l.recuLe)}`;
  return debut ? `${debut} · ${fin}` : fin.charAt(0).toUpperCase() + fin.slice(1);
}

/** Ce qui ne va pas, en tête de la boîte : alertes, plafond, silence des tâches. Rien n'est dit « en marche » sans passage. */
function EtatDeLaBoite({
  resume,
  admin,
  surRelance,
}: {
  resume: ResumeMessages;
  admin: PortAdministration;
  surRelance: () => void;
}) {
  const [relance, setRelance] = useState<{ enCours: boolean; texte: string | null }>({
    enCours: false,
    texte: null,
  });
  const maintenant = new Date();
  const alertes = etatDesAlertes(resume, maintenant);
  const purge = etatDeLaPurge(resume, maintenant);
  const enEchec = resume.alertesEnEchec + resume.alertesAbandonnees;

  // Relancer n'ouvre aucun message : la file des alertes se lit en entier, puis chaque alerte avance son prochain essai.
  const relancer = async () => {
    setRelance({ enCours: true, texte: null });
    let faites = 0;
    let ratees = 0;
    try {
      let avant: number | null = null;
      for (;;) {
        const lignes = await admin.messages('alertes', { nombre: 200, avant });
        for (const l of lignes) {
          try {
            await admin.relancerAlerte(l.reference);
            faites += 1;
          } catch {
            ratees += 1;
          }
        }
        if (lignes.length < 200) break;
        avant = lignes.at(-1)!.rang;
      }
      setRelance({
        enCours: false,
        texte:
          `Relance demandée pour ${faites} alerte${faites > 1 ? 's' : ''} : le prochain passage du service essaie de nouveau.` +
          (ratees > 0
            ? ` ${ratees} n’${ratees > 1 ? 'ont' : 'a'} pas pu être relancée${ratees > 1 ? 's' : ''}.`
            : ''),
      });
      surRelance();
    } catch {
      setRelance({
        enCours: false,
        texte: `La relance complète n’est pas confirmée : réseau ou serveur. ${faites} relance${faites > 1 ? 's' : ''} confirmée${faites > 1 ? 's' : ''}. Réessaie pour les autres.`,
      });
    }
  };

  return (
    <>
      {alertes === 'jamais' && (
        <Bande ton="neutre" region="Alertes par e-mail">
          <p>
            <b>Les alertes par e-mail ne sont pas activées.</b> Les messages arrivent ici, et rien
            ne t’est envoyé.
          </p>
        </Bande>
      )}
      {alertes === 'silence' && resume.dernierPassageAlertesLe && (
        <Bande ton="attention" region="Alertes par e-mail" icone={<Icone nom="alerte" />}>
          <p>
            <b>
              Le service d’alerte n’est pas passé depuis{' '}
              {dureeDepuis(resume.dernierPassageAlertesLe, maintenant)}.
            </b>{' '}
            Les messages arrivent toujours ici. Les alertes partiront à sa reprise
            {resume.alertesEnAttente > 0 ? ` : ${resume.alertesEnAttente} attendent.` : '.'}
          </p>
        </Bande>
      )}
      {enEchec > 0 && (
        <Bande
          ton="attention"
          region="Alertes en échec"
          icone={<Icone nom="alerte" />}
          action={
            <>
              <Bouton
                variante="secondaire"
                enCours={relance.enCours}
                texteEnCours="Relance…"
                onClick={() => void relancer()}
              >
                Relancer maintenant
              </Bouton>
              <a className={v2.lien} href={`#${adresseFile('alertes')}`}>
                Voir {enEchec > 1 ? 'ces messages' : 'ce message'}
              </a>
            </>
          }
        >
          <p>
            <b>
              {enEchec} message{enEchec > 1 ? 's' : ''} sans alerte par e-mail
              {resume.alertesAbandonnees > 0
                ? `, dont ${resume.alertesAbandonnees} abandonnée${resume.alertesAbandonnees > 1 ? 's' : ''}`
                : ''}
              .
            </b>{' '}
            {enEchec > 1 ? 'Ils sont' : 'Il est'} bien ici.
            {resume.dernierPassageAlertesLe &&
              ` Dernier passage du service ${quand(resume.dernierPassageAlertesLe)}.`}
          </p>
          <p>Relancer avance le prochain essai ; rien ne part de ce navigateur.</p>
          {relance.texte && <p role="status">{relance.texte}</p>}
        </Bande>
      )}
      {resume.plafondAtteintLe && (
        <Bande ton="attention" region="Plafond du jour" icone={<Icone nom="alerte" />}>
          <p>
            <b>Plafond du jour atteint {quand(resume.plafondAtteintLe)}.</b> Les formulaires
            renvoient vers WhatsApp et gardent le texte écrit. Ils rouvrent à minuit, heure de
            Brazzaville.
          </p>
        </Bande>
      )}
      {(purge === 'silence' || resume.enRetardDEffacement > 0) && (
        <Bande ton="attention" region="Effacement automatique" icone={<Icone nom="alerte" />}>
          <p>
            <b>
              {resume.dernierPassagePurgeLe
                ? `L’effacement automatique n’est pas passé depuis ${dureeDepuis(resume.dernierPassagePurgeLe, maintenant)}.`
                : 'L’effacement automatique n’est jamais passé.'}
            </b>
            {resume.enRetardDEffacement > 0 &&
              ` ${resume.enRetardDEffacement} message${resume.enRetardDEffacement > 1 ? 's ont' : ' a'} dépassé son échéance ; l’effacement reprendra à son prochain passage.`}
          </p>
        </Bande>
      )}
    </>
  );
}

export function MessagesRecus({
  admin,
  surCompte,
}: {
  admin: PortAdministration;
  /** Combien attendent (messages et retraits) : le menu le dit, d'où qu'on arrive. */
  surCompte: (n: number) => void;
}) {
  const adresse = useAdresse();
  const { file, reference } = lireAdresse(adresse.slice(1));
  // Le filtre par nature ne vaut que pour la file où il a été choisi.
  const [filtre, setFiltre] = useState<{ file: FileMessages; nature: Nature } | null>(null);
  const nature = filtre?.file === file ? filtre.nature : null;
  const cle = `${file}|${nature ?? ''}`;
  const [tour, setTour] = useState(0);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [suite, setSuite] = useState<{ enCours: boolean; erreur: boolean }>({
    enCours: false,
    erreur: false,
  });
  const [resume, setResume] = useState<ResumeMessages | null>(null);
  const relire = () => setTour((t) => t + 1);

  useEffect(() => {
    let abandonne = false;
    admin
      .messages(file, { nature, nombre: PAGE })
      .then((lignes) => {
        if (!abandonne) setLecture({ cle, lignes, fin: lignes.length < PAGE });
      })
      .catch((erreur: unknown) => {
        if (!abandonne) setLecture({ cle, erreur });
      });
    admin
      .resumeMessages()
      .then((r) => {
        if (abandonne) return;
        setResume(r);
        surCompte(r.aTraiter + r.retraits);
      })
      // Les nombres sont un plus : la file dit elle-même qu'elle ne se lit pas.
      .catch(() => undefined);
    return () => {
      abandonne = true;
    };
  }, [admin, file, nature, cle, tour, surCompte]);

  // Au retour sur l'onglet, ce qui est arrivé entre-temps se voit ; rien ne s'ouvre seul.
  useEffect(() => {
    const actualiser = () => {
      if (document.visibilityState === 'visible') setTour((t) => t + 1);
    };
    document.addEventListener('visibilitychange', actualiser);
    return () => document.removeEventListener('visibilitychange', actualiser);
  }, []);

  const lue = lecture !== null && lecture.cle === cle ? lecture : null;
  const lignes = lue && 'lignes' in lue ? lue.lignes : null;
  const panne = lue && 'erreur' in lue ? lue.erreur : null;

  const lireLaSuite = async () => {
    if (!lue || !('lignes' in lue)) return;
    const derniere = lue.lignes.at(-1);
    if (!derniere) return;
    setSuite({ enCours: true, erreur: false });
    try {
      const plus = await admin.messages(file, { nature, nombre: PAGE, avant: derniere.rang });
      setLecture((l) =>
        l !== null && 'lignes' in l && l.cle === cle
          ? { cle, lignes: [...l.lignes, ...plus], fin: plus.length < PAGE }
          : l,
      );
      setSuite({ enCours: false, erreur: false });
    } catch {
      setSuite({ enCours: false, erreur: true });
    }
  };

  // Au retour du message vers la file (téléphone), le focus revient au titre de l'écran : jamais perdu en haut de page.
  const vuAvant = useRef<string | null>(null);
  const [retour, setRetour] = useState(false);
  useEffect(() => {
    const avant = vuAvant.current;
    vuAvant.current = reference;
    if (avant !== null && reference === null) {
      const titre = document.querySelector<HTMLElement>('[data-retour-liste]');
      titre?.focus({ preventScroll: true });
    }
  }, [reference]);
  if (reference !== null && !retour) setRetour(true);

  const retraits = estFileDeRetraits(file) || (reference?.startsWith('R-') ?? false);
  const natures = naturesDeLaFile(file);
  const p =
    panne !== null
      ? texteDePanne(panne, estFileDeRetraits(file) ? 'Les retraits' : 'Les messages')
      : null;

  const segment = (vers: FileMessages, libelle: string, n: number | undefined, ouvert: boolean) => (
    <a
      href={`#${adresseFile(vers)}`}
      aria-current={ouvert ? 'page' : undefined}
      className={cn(
        'flex min-h-11 flex-1 items-center justify-center rounded-md px-4 text-[15px] font-bold text-foreground no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
        ouvert && 'bg-card shadow-[0_0_0_1px_var(--trait)]',
      )}
    >
      {libelle}
      <Compteur n={n} />
    </a>
  );

  return (
    <>
      <TitreEcran
        titre="Messages reçus"
        focusRetour={retour}
        retour={
          reference
            ? { libelle: retraits ? 'Retraits' : 'Messages reçus', chemin: adresseFile(file) }
            : null
        }
        titreHaut={reference && retraits ? 'Retraits' : null}
        droiteHaut={reference}
        regles={
          <>
            <p>
              Lister n’ouvre rien. <b>Ouvrir fige le texte</b> : ce que la personne envoie ensuite
              devient un autre message, relié.
            </p>
            <p>
              Décider ne crée, ne corrige et ne publie rien. Une école s’ajoute, se corrige et se
              publie dans Écoles.
            </p>
            <p>
              Ouvrir WhatsApp ou le courrier n’envoie rien et ne note rien. Note le jour réel, une
              fois la réponse partie. Les échanges restent hors de NTanova.
            </p>
            <p>
              Un message clos est effacé 12 mois après, avec sa coordonnée, ses versions et son
              historique ; rouvrir annule l’échéance. Un indésirable est effacé après 30 jours.
            </p>
            <p>
              Retrait : aucune pièce d’identité par défaut. Le délai de {DELAI_RETRAIT_JOURS} jours
              court jusqu’au retrait dans la base ; l’information reste visible jusqu’à la mise en
              ligne, que tu demandes toi-même.
            </p>
          </>
        }
      />

      <nav
        aria-label="Files de messages"
        className={cn(
          'flex gap-1 rounded-[10px] bg-muted p-1 lg:w-[360px]',
          reference && 'max-lg:hidden',
        )}
      >
        {segment('a-traiter', 'Messages', resume?.aTraiter, !estFileDeRetraits(file))}
        {segment('retraits', 'Retraits', resume?.retraits, estFileDeRetraits(file))}
      </nav>

      <div className={cn('flex flex-col gap-2.5', reference && 'max-lg:hidden', 'empty:hidden')}>
        {resume && <EtatDeLaBoite resume={resume} admin={admin} surRelance={relire} />}
      </div>

      <div
        className={cn(
          'flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-border max-lg:border-0',
          reference && 'max-lg:hidden',
        )}
      >
        {file === 'indesirables' || file === 'alertes' ? (
          <div className="flex flex-wrap items-center gap-x-5">
            <h2 className={v2.titreSection}>
              {file === 'indesirables' ? 'Indésirables' : 'Alertes en échec'}
            </h2>
            <a className={v2.lien} href={`#${adresseFile('a-traiter')}`}>
              Retour à « À traiter »
            </a>
          </div>
        ) : (
          <Onglets<FileMessages>
            libelle={estFileDeRetraits(file) ? 'État des retraits' : 'État des messages'}
            className="max-lg:w-full lg:border-b-0"
            onglets={
              estFileDeRetraits(file)
                ? [
                    { valeur: 'retraits', libelle: 'À traiter', compte: resume?.retraits ?? null },
                    {
                      valeur: 'retraits-clos',
                      libelle: 'Clos',
                      compte: resume?.retraitsClos ?? null,
                    },
                  ]
                : [
                    { valeur: 'a-traiter', libelle: 'À traiter', compte: resume?.aTraiter ?? null },
                    {
                      valeur: 'en-attente',
                      libelle: 'En attente',
                      compte: resume?.enAttente ?? null,
                    },
                    { valeur: 'clos', libelle: 'Clos', compte: resume?.clos ?? null },
                  ]
            }
            valeur={file}
            changer={(f) => aller(adresseFile(f))}
          />
        )}
        {natures.length > 0 && (
          <div role="group" aria-label="Nature" className="flex flex-wrap gap-1.5 pb-2 lg:ml-auto">
            <Puce className="min-h-11" choisie={nature === null} onClick={() => setFiltre(null)}>
              Tous
            </Puce>
            {natures.map((n) => (
              <Puce
                key={n}
                className="min-h-11"
                choisie={nature === n}
                onClick={() => setFiltre(nature === n ? null : { file, nature: n })}
              >
                {n === 'erreur' ? 'Erreur' : libelleNature[n]}
              </Puce>
            ))}
          </div>
        )}
        {estFileDeRetraits(file) && (
          <p className="m-0 pb-2.5 text-sm text-muted-foreground lg:ml-auto">
            À part des corrections. Délai écrit sur Confidentialité&nbsp;: dans notre base sous{' '}
            {DELAI_RETRAIT_JOURS} jours.
          </p>
        )}
      </div>

      <div className="flex items-start gap-4">
        <div
          className={cn(
            'flex w-full flex-col gap-2 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:w-[268px] lg:shrink-0 lg:overflow-y-auto lg:pb-2',
            reference && 'max-lg:hidden',
          )}
        >
          {p && (
            <BandeauEchec
              titre={p.titre}
              action={
                p.rejouable
                  ? panne instanceof ErreurSession
                    ? () => location.reload()
                    : relire
                  : undefined
              }
              libelleAction={panne instanceof ErreurSession ? 'Recharger la page' : 'Réessayer'}
            >
              {p.texte}
            </BandeauEchec>
          )}
          {lue === null && (
            <Squelette
              libelle={
                estFileDeRetraits(file) ? 'Chargement des retraits…' : 'Chargement des messages…'
              }
            />
          )}
          {lignes !== null && (
            <>
              {lignes.length === 0 ? (
                nature !== null ? (
                  <FileVide titre="Aucun message de cette nature.">
                    Le filtre porte sur toute la file.{' '}
                    <button type="button" className={v2.lien} onClick={() => setFiltre(null)}>
                      Tout voir
                    </button>
                  </FileVide>
                ) : (
                  <FileVide titre={VIDE[file][0]}>{VIDE[file][1]}</FileVide>
                )
              ) : (
                <ul
                  className="m-0 flex list-none flex-col gap-2 p-0"
                  aria-label={estFileDeRetraits(file) ? 'Retraits' : 'Messages'}
                >
                  {lignes.map((l) => (
                    <li key={l.reference}>
                      <CarteMessage
                        href={`#${adresseMessage(l.reference, file)}`}
                        courante={l.reference === reference}
                        surAppui={() => aller(adresseMessage(l.reference, file))}
                        nature={
                          l.nature === 'retrait'
                            ? (precisionDeLigne(l) ?? libelleNature.retrait)
                            : libelleNature[l.nature]
                        }
                        reference={l.reference}
                        titre={titreDeLigne(l)}
                        precision={precision(l)}
                        pastilles={pastillesDeLigne(l, new Date())}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {suite.erreur && (
                <p role="alert" className={v2.erreur}>
                  La suite ne se charge pas. Réessaie.
                </p>
              )}
              {lue && 'lignes' in lue && !lue.fin && (
                <Bouton
                  variante="secondaire"
                  enCours={suite.enCours}
                  texteEnCours="Lecture…"
                  onClick={() => void lireLaSuite()}
                >
                  Voir les suivants
                </Bouton>
              )}
              {!estFileDeRetraits(file) &&
                file !== 'indesirables' &&
                resume !== null &&
                resume.indesirables > 0 && (
                  <a className={v2.lien} href={`#${adresseFile('indesirables')}`}>
                    Indésirables ({resume.indesirables})
                  </a>
                )}
            </>
          )}
        </div>

        {reference ? (
          <Message
            key={reference}
            admin={admin}
            reference={reference}
            file={file}
            surChangement={relire}
          />
        ) : (
          lignes !== null &&
          lignes.length > 0 && (
            <div className="min-w-0 flex-1 max-lg:hidden">
              <FileVide
                titre={estFileDeRetraits(file) ? 'Choisis un retrait.' : 'Choisis un message.'}
              >
                L’ouvrir fige son texte : ce que la personne envoie ensuite devient une suite.
              </FileVide>
            </div>
          )
        )}
      </div>
    </>
  );
}
