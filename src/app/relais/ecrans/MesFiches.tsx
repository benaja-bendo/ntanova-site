import { useState } from 'react';
import { appartientAuCompte } from '../../../modele/compte';
import {
  enAlerte,
  explicationDuRejet,
  peutEtreModifiee,
  phraseDEchecDeLaFiche,
} from '../../../modele/envoi';
import { refusEstPerime } from '../../../modele/renvoyees';
import type { FicheLocale } from '../../../modele/fiche';
import type { ReleveRecu } from '../../../modele/ports';
import { libelleFonctionCourt, libelleMotif, libelleStatutReleve } from '../../../modele/libelles';
import {
  modifierLaFiche,
  reessayer,
  retirerDuTelephone,
  type IssueDeLAction,
} from '../actions-fiches';
import { base, compteConnecte, lireMemoire, useRequete } from '../base-locale';
import { cn } from '@/lib/utils';
import { Badge } from '@/ui/shadcn/badge';
import { Button } from '@/ui/shadcn/button';
import {
  IconeAttente,
  IconeCorriger,
  IconeEnvoi,
  IconeFait,
  IconeRefus,
  IconeTelephone,
} from '@/ui/shadcn/icones';
import { Tabs, TabsList, TabsTrigger } from '@/ui/shadcn/tabs';
import { BarreDuBas, EnTete } from '../cadre';
import { jour } from '../composants';
import { Bande, ChargementEcran, Confirmer, EtatVide } from '../etats';
import { IconeAlerte } from '@/ui/shadcn/icones';

type BadgeVariant = 'neutre' | 'attention' | 'succes' | 'danger';
import { aller, useRelais } from '../contexte';
import { commencerCorrection } from './Ajouter';
import { EtatEnvoi } from './MonLot';

interface Ligne {
  id: string;
  nom: string;
  date: string;
  fiche: { libelle: string; classe: string };
  contact: { libelle: string; classe: string } | null;
  message: string | null;
  repasser: string | null;
  aCorriger: boolean;
  surTelephone: boolean;
  /** Ce que la base a refusé, quand la fiche attend une décision du relais. */
  refus: { titre: string; detail: string } | null;
  /** Les envois ratés de suite, quand il y en a assez pour prévenir le relais. */
  essaisRates: number | null;
  /** Ce qui n'est pas parti au dernier essai faute de connexion, et que l'envoi reprend seul (ticket #74). */
  echec: string | null;
  peutReessayer: boolean;
  peutModifier: boolean;
  peutRetirer: boolean;
  /** La fiche telle que NTanova l'a reçue : de quoi la corriger sans tout ressaisir. */
  recu: ReleveRecu | null;
  /** La direction était absente et son contact n'est pas arrivé : le relais peut l'ajouter. */
  peutAjouterLeContact: boolean;
  /** Lot F : la page de l'école est en ligne. */
  enLigne: boolean;
}

const classeStatut: Record<ReleveRecu['statut'], string> = {
  a_valider: 'etat-attente',
  a_corriger: 'etat-a-corriger',
  accepte: 'etat-verifiee',
  refuse: 'etat-refusee',
};

/** Ce que le relais peut faire d'une fiche qui est encore dans son téléphone. */
function gestesDe(f: FicheLocale | undefined) {
  if (!f) {
    return {
      refus: null,
      essaisRates: null,
      echec: null,
      peutReessayer: false,
      peutModifier: false,
      peutRetirer: false,
    };
  }
  return {
    refus: f.etat === 'refusee' && f.rejet ? explicationDuRejet(f.rejet) : null,
    essaisRates: enAlerte(f) ? (f.essais ?? 0) : null,
    echec: f.etat === 'a_envoyer' ? phraseDEchecDeLaFiche(f) : null,
    peutReessayer: f.etat === 'refusee',
    peutModifier: peutEtreModifiee(f),
    // Une fiche en file dont le relevé est parti est en cours d'envoi : on la laisse finir.
    peutRetirer: f.etat === 'refusee' || (f.etat === 'a_envoyer' && !f.envoyes.releve),
  };
}

function depuisTelephone(f: FicheLocale): Ligne {
  const partie = f.envoyes.releve;
  const contactAttend = !f.envoyes.contact;
  return {
    id: f.id,
    nom: f.nomEnseigne || 'Fiche sans nom',
    date: f.prisLe ?? f.creeeLe,
    fiche:
      f.etat === 'envoyee'
        ? { libelle: 'Envoyée', classe: 'etat-envoye' }
        : f.etat === 'refusee'
          ? { libelle: 'Refusée', classe: 'etat-refusee' }
          : { libelle: libelleDEnvoi(f, partie), classe: 'etat-telephone' },
    contact:
      f.direction === 'absente'
        ? { libelle: 'Absente', classe: 'etat-telephone' }
        : contactAttend
          ? { libelle: 'Sur le téléphone', classe: 'etat-telephone' }
          : { libelle: 'Envoyé', classe: 'etat-envoye' },
    message: null,
    repasser: f.direction === 'absente' && f.repasser ? f.repasser : null,
    aCorriger: false,
    surTelephone: f.etat === 'a_envoyer' || f.etat === 'refusee',
    ...gestesDe(f),
    recu: null,
    peutAjouterLeContact: false,
    enLigne: false,
  };
}

/** Une fiche que NTanova a reçue ; `local` est sa copie dans le téléphone, tant qu'elle y reste (photo ou contact). */
function depuisServeur(
  r: ReleveRecu,
  corrigees: Set<string>,
  local: FicheLocale | undefined,
): Ligne {
  const contact = r.contactConfirmeLe
    ? {
        libelle: `Confirmé · ${r.contactFonction ? libelleFonctionCourt[r.contactFonction] : ''}`,
        classe: 'etat-verifiee',
      }
    : r.direction === 'absente'
      ? r.aContact
        ? { libelle: 'Reçu · à confirmer', classe: 'etat-attente' }
        : {
            libelle: `Absente${r.ficheLiaisonRemise ? ' · fiche remise' : ''}`,
            classe: 'etat-attente',
          }
      : r.direction === 'refus'
        ? { libelle: 'Refus', classe: 'etat-refusee' }
        : r.direction === 'vue'
          ? { libelle: 'En attente', classe: 'etat-attente' }
          : null;
  const aCorriger = r.statut === 'a_corriger' && !corrigees.has(r.id);
  // La photo ou le contact refusés : NTanova a la fiche, mais le relais doit voir ce qui n'est pas arrivé.
  const gestesDuTelephone = gestesDe(local?.etat === 'envoyee' ? undefined : local);
  // NTanova a décidé de cette fiche : le refus gardé dans le téléphone (« la photo n'est plus lisible, prévenez NTanova »)
  // n'a plus lieu d'être, et « Réessayer » ne peut pas redonner une photo perdue (ticket #92).
  const gestes = refusEstPerime(r.statut)
    ? { ...gestesDuTelephone, refus: null, peutReessayer: false }
    : gestesDuTelephone;
  return {
    id: r.id,
    nom: r.nomEnseigne,
    date: r.prisLe,
    fiche:
      r.statut === 'a_corriger' && corrigees.has(r.id)
        ? { libelle: 'Correction envoyée', classe: 'etat-envoye' }
        : { libelle: libelleStatutReleve[r.statut], classe: classeStatut[r.statut] },
    contact,
    message:
      r.statut === 'a_corriger' || r.statut === 'refuse'
        ? (r.messageAuRelais ?? (r.motif ? libelleMotif[r.motif] : null))
        : null,
    repasser: r.direction === 'absente' && r.repasser ? r.repasser : null,
    aCorriger,
    surTelephone: false,
    ...gestes,
    recu: r,
    peutAjouterLeContact: r.direction === 'absente' && !r.aContact && r.statut !== 'refuse',
    enLigne: r.statut === 'accepte' && r.pageEnLigne != null,
  };
}

type Filtre = 'toutes' | 'a_corriger' | 'en_attente' | 'en_ligne';

const avisDesGestes: Record<Exclude<IssueDeLAction, 'ok'>, string> = {
  en_cours: "L'envoi de cette fiche est en cours. Réessayez dans un instant.",
  partie: 'Cette fiche vient de partir : NTanova l’a reçue.',
  brouillon_existant:
    'Une autre fiche est déjà en cours. Terminez-la ou abandonnez-la d’abord (« Reprendre la fiche en cours »).',
};

/** Le dessin d'une ligne (planche « Mes fiches ») : son icône, son badge, sa phrase. */
type Aspect = 'telephone' | 'envoi' | 'corriger' | 'attente' | 'fait' | 'refus';
const iconeDe: Record<Aspect, { Icone: typeof IconeFait; classe: string }> = {
  telephone: { Icone: IconeTelephone, classe: 'text-foreground' },
  envoi: { Icone: IconeEnvoi, classe: 'text-foreground' },
  corriger: { Icone: IconeCorriger, classe: 'text-ambre' },
  attente: { Icone: IconeAttente, classe: 'text-foreground' },
  fait: { Icone: IconeFait, classe: 'text-primary' },
  refus: { Icone: IconeRefus, classe: 'text-destructive' },
};
const badgeDe: Record<string, BadgeVariant> = {
  'etat-telephone': 'neutre',
  'etat-envoye': 'neutre',
  'etat-attente': 'neutre',
  'etat-a-corriger': 'attention',
  'etat-verifiee': 'succes',
  'etat-refusee': 'danger',
};

function aspectDe(l: Ligne): Aspect {
  if (l.aCorriger) return 'corriger';
  if (l.refus || l.fiche.classe === 'etat-refusee') return 'refus';
  if (l.surTelephone) return l.fiche.libelle.startsWith('Envoi') ? 'envoi' : 'telephone';
  if (l.fiche.classe === 'etat-verifiee' || l.enLigne) return 'fait';
  if (l.fiche.classe === 'etat-envoye') return 'envoi';
  return 'attente';
}

/** L'ordre de la planche : ce qui est encore sur le téléphone, puis ce qui attend le relais, puis NTanova, puis le reste. */
function rang(l: Ligne): number {
  const a = aspectDe(l);
  if (a === 'telephone' || a === 'envoi') return 0;
  if (a === 'corriger') return 1;
  if (a === 'attente') return 2;
  if (a === 'fait') return l.enLigne ? 3 : 4;
  return 5;
}

/** La phrase sous le nom : ce que NTanova a dit, sinon ce qui se passe. */
function phraseDe(l: Ligne, payees: ReadonlySet<string> = new Set()): string {
  if (l.message) return `NTanova : « ${l.message} »`;
  if (l.refus) return l.refus.titre;
  if (l.echec) return l.echec;
  if (l.surTelephone)
    return l.fiche.libelle.startsWith('Envoi')
      ? l.fiche.libelle.replace('Envoi ·', 'Envoi en cours ·')
      : 'Partira dès que le téléphone capte';
  if (l.enLigne) return 'Sa page est en ligne';
  if (l.fiche.classe === 'etat-verifiee')
    return payees.has(l.id)
      ? 'Comptée dans la paie de vendredi'
      : `Acceptée · relevée ${quand(l.date)}`;
  if (l.fiche.libelle === 'Correction envoyée') return 'Correction envoyée · NTanova la regarde';
  if (l.fiche.classe === 'etat-envoye') return 'Reçue par NTanova';
  return `Envoyée ${quand(l.date)} · NTanova la regarde`;
}

/** « aujourd'hui », « hier », sinon « le 3 nov. ». */
function quand(date: string): string {
  const j = jour(date);
  return /^(Aujourd|Hier)/.test(j) ? j.charAt(0).toLowerCase() + j.slice(1) : `le ${j}`;
}

/** Le mot du badge, court comme sur la planche. */
function badgeTexteDe(l: Ligne): string {
  if (l.enLigne) return 'En ligne';
  if (l.surTelephone) return l.fiche.libelle.startsWith('Envoi') ? 'Envoi' : 'Sur le téléphone';
  if (l.fiche.classe === 'etat-attente') return 'En attente';
  if (l.fiche.classe === 'etat-verifiee') return 'Acceptée';
  return l.fiche.libelle;
}

export function MesFiches() {
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  // Les fiches de ce compte seulement : celles d'un autre relais, qui s'est servi du téléphone, ne sont pas à lui.
  const locales = useRequete(async () => {
    const compte = await compteConnecte();
    return (await base.fiches.where('etat').notEqual('brouillon').toArray()).filter((f) =>
      appartientAuCompte(f, compte),
    );
  });
  const recusLus = useRequete(() => lireMemoire('releves'));
  const paie = useRequete(async () => (await lireMemoire('paie')) ?? null);
  if (locales === undefined || recusLus === undefined || paie === undefined)
    return <ChargementEcran titre="Mes fiches" />;
  // Les fiches que la paie de vendredi compte déjà (« Comptée dans la paie de vendredi »).
  const payees = new Set(
    (paie?.acquis.lignes ?? []).filter((x) => x.genre === 'fiche').flatMap((x) => x.fiches),
  );
  const recus = recusLus ?? [];

  const idsRecus = new Set(recus.map((r) => r.id));
  const localesParId = new Map(locales.map((f) => [f.id, f]));
  const corrigees = new Set(locales.map((f) => f.corrigeReleveId).filter((id) => id !== null));
  const lignes = [
    ...locales.filter((f) => !idsRecus.has(f.id)).map(depuisTelephone),
    ...recus.map((r) => depuisServeur(r, corrigees, localesParId.get(r.id))),
  ].sort((a, b) => rang(a) - rang(b) || b.date.localeCompare(a.date));

  const enAttente = (l: Ligne) => l.fiche.classe === 'etat-attente' && !l.aCorriger;
  const compte = {
    toutes: lignes.length,
    a_corriger: lignes.filter((l) => l.aCorriger).length,
    en_attente: lignes.filter(enAttente).length,
    en_ligne: lignes.filter((l) => l.enLigne).length,
  };
  const visibles = lignes.filter((l) =>
    filtre === 'a_corriger'
      ? l.aCorriger
      : filtre === 'en_attente'
        ? enAttente(l)
        : filtre === 'en_ligne'
          ? l.enLigne
          : true,
  );
  const filtres: { valeur: Filtre; libelle: string }[] = [
    { valeur: 'toutes', libelle: 'Toutes' },
    { valeur: 'a_corriger', libelle: 'À corriger' },
    { valeur: 'en_attente', libelle: 'En attente' },
    { valeur: 'en_ligne', libelle: 'En ligne' },
  ];

  return (
    <div className="ecran bg-card">
      <EnTete titre="Mes fiches" />
      <Tabs value={filtre} onValueChange={(v) => setFiltre(v as Filtre)} className="gap-0">
        <TabsList aria-label="Filtrer les fiches" className="sticky top-[60px] z-10">
          {filtres.map((f) => (
            <TabsTrigger key={f.valeur} value={f.valeur}>
              {f.libelle}{' '}
              <span className={filtre === f.valeur ? 'text-muted-foreground' : undefined}>
                {compte[f.valeur]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <main className="flex flex-1 flex-col bg-card">
        <div className="px-4 pt-3 empty:hidden">
          <EtatEnvoi calme="cacher" />
        </div>
        {visibles.length === 0 && (
          <div className="p-4">
            <EtatVide
              titre={lignes.length === 0 ? 'Aucune fiche pour le moment.' : 'Aucune fiche ici.'}
            >
              {lignes.length === 0
                ? 'Les écoles que vous ajoutez s’affichent ici, avec ce que NTanova en dit.'
                : null}
            </EtatVide>
          </div>
        )}

        <ul className="m-0 list-none p-0">
          {visibles.map((l) => {
            const aspect = aspectDe(l);
            const { Icone, classe } = iconeDe[aspect];
            return (
              <li
                key={l.id}
                data-fiche={l.nom}
                className={cn(
                  'border-b border-border',
                  aspect === 'corriger' && 'shadow-[inset_3px_0_0_var(--ambre)]',
                )}
              >
                <a
                  href={`#fiches/${l.id}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-2 text-foreground no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <Icone className={cn('size-[22px] shrink-0', classe)} aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <b className="text-base leading-snug">{l.nom}</b>
                    <span
                      className={cn(
                        'text-[13px] leading-snug',
                        aspect === 'corriger' ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {phraseDe(l, payees)}
                    </span>
                  </span>
                  <Badge
                    variant={badgeDe[l.enLigne ? 'etat-verifiee' : l.fiche.classe] ?? 'neutre'}
                    className="px-2 py-0.5 text-xs"
                  >
                    {badgeTexteDe(l)}
                  </Badge>
                </a>
              </li>
            );
          })}
        </ul>
      </main>
      <BarreDuBas />
    </div>
  );
}

/**
 * v2 (13/11) : quand le réseau rame, l'envoi se dit photo par photo (« Envoi · 2 photos sur 6 ») ; une fiche dont rien n'est
 * parti est « Sur le téléphone ».
 */
function libelleDEnvoi(f: FicheLocale, partie: boolean): string {
  if (!partie) return 'Sur le téléphone';
  const photos = f.photos.filter((p) => p.envoyee || p.blob != null);
  const parties = photos.filter((p) => p.envoyee).length;
  return photos.length > 1 && parties < photos.length
    ? `Envoi · ${parties} photo${parties > 1 ? 's' : ''} sur ${photos.length}`
    : 'Envoi en cours';
}

/**
 * Ce que le relais peut faire d'une de ses fiches (planche : les gestes sont dans la fiche, pas dans la liste) : la
 * corriger, ajouter le contact de la direction, réessayer l'envoi, la modifier avant qu'elle parte, la retirer du
 * téléphone. Rien quand il n'y a rien à faire.
 */
export function GestesDeLaFiche({ id }: { id: string }) {
  const { synchroniser } = useRelais();
  const [avis, setAvis] = useState<string | null>(null);
  const lu = useRequete(async () => {
    const compte = await compteConnecte();
    const locales = (await base.fiches.where('etat').notEqual('brouillon').toArray()).filter((f) =>
      appartientAuCompte(f, compte),
    );
    return { locales, recus: (await lireMemoire('releves')) ?? [] };
  });
  if (!lu) return null;
  const { locales, recus } = lu;
  const locale = locales.find((f) => f.id === id);
  const recu = recus.find((r) => r.id === id);
  const corrigees = new Set(locales.map((f) => f.corrigeReleveId).filter((x) => x !== null));
  const l = recu ? depuisServeur(recu, corrigees, locale) : locale ? depuisTelephone(locale) : null;
  if (!l) return null;

  const apres = (issue: IssueDeLAction) => setAvis(issue === 'ok' ? null : avisDesGestes[issue]);
  const corriger = async () => {
    if (!l.recu) return;
    if ((await commencerCorrection(l.recu, recus)) === 'brouillon_existant')
      setAvis(avisDesGestes.brouillon_existant);
  };
  const relancer = async () => {
    const issue = await reessayer(l.id);
    apres(issue);
    if (issue === 'ok') synchroniser();
  };
  const retirer = async () => {
    const issue = await retirerDuTelephone(l.id);
    if (issue !== 'ok') return avisDesGestes[issue];
    setAvis(null);
    aller('fiches');
    return undefined;
  };
  const aDesGestes =
    l.aCorriger || l.peutAjouterLeContact || l.peutReessayer || l.peutModifier || l.peutRetirer;
  const alerte =
    l.refus ??
    (!l.echec && l.essaisRates !== null
      ? {
          titre: 'L’envoi échoue',
          detail: `L'envoi a échoué ${l.essaisRates} fois de suite. Prévenez NTanova si cela continue.`,
        }
      : null);
  if (!aDesGestes && !alerte && !avis) return null;
  return (
    <section aria-label="Que faire" className="flex flex-col gap-2.5">
      {alerte && (
        <Bande ton="danger" role={l.refus ? 'alert' : undefined} icone={<IconeAlerte />}>
          <p>
            <b>{alerte.titre}</b>
          </p>
          <p>{alerte.detail}</p>
        </Bande>
      )}
      {avis && (
        <Bande ton="attention" role="status" icone={<IconeAlerte />}>
          <p>{avis}</p>
        </Bande>
      )}
      {l.aCorriger && (
        <Button size="xl" className="w-full" onClick={() => void corriger()}>
          Corriger la fiche
        </Button>
      )}
      {l.peutReessayer && (
        <Button size="xl" className="w-full" onClick={() => void relancer()}>
          Réessayer l’envoi
        </Button>
      )}
      {l.peutAjouterLeContact && (
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => aller(`contact/${l.id}`)}
        >
          J’ai revu la direction
        </Button>
      )}
      {l.peutModifier && (
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => void modifierLaFiche(l.id).then(apres)}
        >
          Modifier
        </Button>
      )}
      {l.peutRetirer && (
        <Confirmer
          libelle="Retirer du téléphone"
          titre={`Retirer « ${l.nom} » du téléphone ?`}
          description={
            locale?.envoyes.releve
              ? 'NTanova a déjà reçu la fiche : seuls les éléments encore sur le téléphone (photos, contact) seront effacés. La fiche reçue par NTanova est conservée.'
              : 'Cette fiche n’a pas été envoyée. Elle sera effacée du téléphone et sera perdue.'
          }
          confirmer="Oui, retirer du téléphone"
          enCours="Suppression…"
          surConfirmer={retirer}
        />
      )}
    </section>
  );
}
