import { useState } from 'react';
import type { Valeur } from '../../../modele/listes';
import { appartientAuCompte, duBrouillon } from '../../../modele/compte';
import { phraseDuBilan } from '../../../modele/envoi';
import { base, compteConnecte, garder, lireMemoire, useRequete } from '../base-locale';
import { jourDuCongo } from '../../../modele/date-declaration';
import { aller, useEnLigne, useRelais } from '../contexte';
import { heure } from '../composants';
import { cn } from '@/lib/utils';
import { Badge } from '@/ui/shadcn/badge';
import { Button } from '@/ui/shadcn/button';
import { Input } from '@/ui/shadcn/input';
import { Label } from '@/ui/shadcn/label';
import {
  IconeAide,
  IconeAjouter,
  IconeAlerte,
  IconeCadenas,
  IconeChargement,
  IconeFait,
  IconeNuage,
  IconeOuvrir,
} from '@/ui/shadcn/icones';
import { BarreDuBas, PastilleEnLigne, Surtitre } from '../cadre';
import { Bande, Ebauche, EtatVide } from '../etats';
import { Pastille } from '@/ui/v2/choix';
import { BoutonGoogle } from './Connexion';
import { commencerCorrection } from './Ajouter';
import { missionsDeLAccueil, semaineDuRelais } from '../../../modele/accueil-relais';

/**
 * L'état de la file d'envoi, sur l'accueil et dans « Mes fiches ». `calme` : `montrer` (par défaut) dit aussi « Tout est
 * envoyé » ; `cacher` ne dit que ce qui attend ou a échoué (en tête de l'accueil) ; `seul` ne dit que « Tout est envoyé »,
 * quand c'est vrai (en bas de l'accueil, comme sur la planche).
 */
export function EtatEnvoi({ calme = 'montrer' }: { calme?: 'montrer' | 'cacher' | 'seul' } = {}) {
  const { envoi, bilan, synchroniser } = useRelais();
  const enLigne = useEnLigne();
  // Tant que le téléphone n'a pas compté les fiches en attente, on ne dit rien :
  // « Tout est envoyé » ne s'affiche jamais avant d'être vrai.
  // Les fiches de ce compte seulement : celles d'un autre relais, qui s'est servi du téléphone, ne comptent pas ici.
  const duCompte = async (etat: 'a_envoyer' | 'refusee') => {
    const compte = await compteConnecte();
    return (await base.fiches.where('etat').equals(etat).toArray()).filter((f) =>
      appartientAuCompte(f, compte),
    ).length;
  };
  const enAttente = useRequete(() => duCompte('a_envoyer'));
  // Les fiches que la base a refusées : sorties de la file, elles attendent une décision du relais.
  const refusees = useRequete(() => duCompte('refusee'));
  const dernierEnvoi = useRequete(() => lireMemoire('dernierEnvoi'));

  if (envoi === 'reconnecter') {
    if (calme === 'seul') return null;
    return (
      <Bande ton="danger" role="alert" icone={<IconeCadenas />} action={<BoutonGoogle />}>
        <p>
          <b>Votre session a expiré.</b> Reconnectez-vous pour envoyer vos fiches&nbsp;: elles
          restent sur le téléphone.
        </p>
      </Bande>
    );
  }
  if (enAttente === undefined || refusees === undefined) {
    return calme === 'seul' ? null : <div className="h-11" aria-hidden="true" />;
  }
  if (calme === 'seul' && (enAttente > 0 || refusees > 0)) return null;
  const refus =
    refusees > 0 ? (
      <Bande ton="danger" icone={<IconeAlerte />}>
        <p>
          <b>
            {refusees} fiche{refusees > 1 ? 's' : ''} n'{refusees > 1 ? 'ont' : 'a'} pas pu être
            envoyée{refusees > 1 ? 's' : ''}.
          </b>{' '}
          La raison est dans «&nbsp;Mes fiches&nbsp;».
        </p>
      </Bande>
    ) : null;
  if (enAttente > 0) {
    const pluriel = enAttente > 1;
    // Ce que le dernier essai a fait, dit au relais : fiches parties, ou ce qui n'a pas pu partir (ticket #74).
    const phrase = bilan ? phraseDuBilan(bilan, heure(bilan.le)) : null;
    const enCoursDEnvoi = envoi === 'en_cours';
    return (
      <>
        {refus}
        <Bande
          ton={(envoi === 'erreur' && enLigne) || phrase?.ton === 'echec' ? 'danger' : 'attention'}
          icone={<IconeNuage />}
          action={
            enLigne && (
              <Button
                variant="outline"
                size="sm"
                onClick={synchroniser}
                disabled={enCoursDEnvoi}
                aria-busy={enCoursDEnvoi || undefined}
              >
                {enCoursDEnvoi ? 'Envoi…' : 'Envoyer maintenant'}
              </Button>
            )
          }
        >
          <p>
            <b>
              {enAttente} fiche{pluriel ? 's' : ''} attend{pluriel ? 'ent' : ''}{' '}
              {enLigne ? "d'être envoyée" + (pluriel ? 's' : '') : 'le réseau'}.
            </b>{' '}
            {enLigne
              ? envoi === 'erreur' && !phrase
                ? 'Un envoi a échoué ; il sera repris.'
                : ''
              : pluriel
                ? 'Elles partiront seules dès que le téléphone capte.'
                : 'Elle partira seule dès que le téléphone capte.'}
          </p>
          {enLigne && enCoursDEnvoi && (
            <p role="status" className="flex items-center gap-2">
              <IconeChargement className="size-4 animate-spin motion-reduce:animate-none" />
              Envoi en cours…
            </p>
          )}
          {enLigne && !enCoursDEnvoi && phrase && <p role="status">{phrase.texte}</p>}
        </Bande>
      </>
    );
  }
  // Une fiche refusée n'est pas envoyée : « Tout est envoyé » ne s'affiche pas tant qu'il y en a une.
  if (refus) return refus;
  if (calme === 'cacher') return null;
  return (
    <Bande ton="succes" icone={<IconeFait />}>
      <p>
        <b>Tout est envoyé</b>
        {dernierEnvoi ? ` · dernier envoi à ${heure(dernierEnvoi)}` : ''}
      </p>
    </Bande>
  );
}

/**
 * L'accueil (lot H, planche « Relais · Missions ») : le bouton d'abord, puis ce qui attend le relais (ses fiches renvoyées,
 * les missions de NTanova), sa semaine, et « Quoi dire en entrant ». « Mon secteur » est parti (décision du fondateur du
 * 13/11 : on relève partout au Congo-Brazzaville) ; seul le lot d'entraînement se dit encore.
 */
export function Accueil() {
  const profil = useRequete(() => lireMemoire('profil'));
  const lot = useRequete(() => lireMemoire('lot'));
  // La semaine se compte au moment de la lecture (l'heure ne se lit pas pendant le rendu).
  const lecture = useRequete(async () => {
    const r = await lireMemoire('releves');
    return { releves: r, semaine: semaineDuRelais(r ?? [], Date.now()) };
  });
  const releves = lecture?.releves;
  const ecoles = useRequete(() => lireMemoire('aCompleter'));
  const pasPu = useRequete(async () => (await lireMemoire('missionsPasPu')) ?? []);
  const telephone = useRequete(async () => {
    const compte = await compteConnecte();
    const toutes = await base.fiches.toArray();
    return {
      locales: toutes.filter((f) => appartientAuCompte(f, compte)),
      brouillon: duBrouillon(toutes, compte),
    };
  });
  const [avis, setAvis] = useState<string | null>(null);
  const locales = telephone?.locales;
  const brouillon = telephone?.brouillon;
  // Une école dont la contre-visite est déjà sur le téléphone, ou une mission dite « Je n'ai pas pu », n'attend plus.
  const enCours = new Set(
    (locales ?? []).filter((f) => f.type === 'contre_visite').map((f) => f.doublonPropose?.ecoleId),
  );
  const restantes = (ecoles ?? []).filter(
    (e) => !enCours.has(e.id) && !(pasPu ?? []).some((m) => m.missionId === e.missionId),
  );
  const corrigees = new Set(
    (locales ?? []).map((f) => f.corrigeReleveId).filter((x): x is string => !!x),
  );
  const missions = missionsDeLAccueil(releves ?? [], restantes, corrigees, jourDuCongo());
  const semaine = lecture?.semaine ?? { envoyees: 0, acceptees: 0, enAttente: 0 };
  const lu = lecture !== undefined && ecoles !== undefined;

  return (
    <div className="ecran">
      <header className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-border bg-card py-2 pr-2 pl-4">
        <img src="/favicon.svg" alt="" width={30} height={23} />
        <h1
          className="m-0 min-w-0 flex-1 truncate font-serif text-lg leading-tight font-bold"
          tabIndex={-1}
          data-retour-liste
        >
          Bonjour {profil?.prenom || ''}
        </h1>
        <PastilleEnLigne />
        <a
          href="#aide/entrer"
          aria-label="Aide"
          className="flex size-11 items-center justify-center rounded-md text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          <IconeAide className="size-6" />
        </a>
      </header>
      <main className="flex flex-1 flex-col gap-2.5 p-4">
        <EtatEnvoi calme="cacher" />

        {lot?.essai && (
          <Bande ton="attention" icone={<IconeAlerte />}>
            <p>
              <b>Lot d'entraînement.</b> Vos fiches ne seront pas publiées.
            </p>
          </Bande>
        )}

        <Button size="hero" className="w-full" onClick={() => aller('ajouter/1')}>
          <IconeAjouter className="size-6" />
          {brouillon ? 'Reprendre la fiche en cours' : 'Ajouter une école'}
        </Button>

        <section className="mt-2.5 flex flex-col gap-2" aria-label="Vos missions">
          <div className="flex items-baseline justify-between">
            <Surtitre>Vos missions</Surtitre>
            {lu && (
              <span className="text-[13px] text-muted-foreground">{missions.length} à faire</span>
            )}
          </div>
          {avis && (
            <Bande ton="attention" role="status" icone={<IconeAlerte />}>
              <p>{avis}</p>
            </Bande>
          )}
          {!lu && (
            <>
              <Ebauche className="h-[88px]" />
              <Ebauche className="h-[88px]" />
            </>
          )}
          {lu && missions.length === 0 && (
            <EtatVide titre="Rien n’attend pour l’instant.">
              Ajoutez les écoles que vous croisez, partout au Congo-Brazzaville.
            </EtatVide>
          )}
          {missions.map((m) =>
            m.genre === 'a_corriger' ? (
              <article
                key={`c-${m.id}`}
                className="flex flex-col gap-2 rounded-lg border-2 border-ambre bg-card p-3"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="attention" className="text-xs">
                    {m.etiquette}
                  </Badge>
                  <b className="min-w-0 flex-1 font-serif">{m.nom}</b>
                </div>
                <p className="m-0 text-sm">{m.texte}</p>
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={() => {
                    const recu = (releves ?? []).find((r) => r.id === m.id);
                    if (!recu) return;
                    void commencerCorrection(recu, releves ?? []).then((issue) =>
                      setAvis(
                        issue === 'brouillon_existant'
                          ? 'Une autre fiche est déjà en cours. Terminez-la ou abandonnez-la d’abord (« Reprendre la fiche en cours »).'
                          : null,
                      ),
                    );
                  }}
                >
                  Corriger la fiche
                </Button>
              </article>
            ) : (
              <a
                key={`m-${m.id}`}
                href={`#mission/${m.id}`}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-3 text-foreground no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <Badge
                    variant={m.enRetard || !m.missionId ? 'attention' : 'succes'}
                    className="self-start text-xs"
                  >
                    {m.etiquette}
                  </Badge>
                  <b className="font-serif">{m.nom}</b>
                  <span className="text-[13px] text-muted-foreground">{m.texte}</span>
                </span>
                <IconeOuvrir className="size-5" />
              </a>
            ),
          )}
        </section>

        <section className="mt-2.5 flex flex-col gap-2" aria-label="Cette semaine">
          <Surtitre>Cette semaine</Surtitre>
          {lu ? (
            <a
              href="#fiches"
              className="grid grid-cols-3 gap-2 text-foreground no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              {(
                [
                  [semaine.envoyees, 'envoyées'],
                  [semaine.acceptees, 'acceptées'],
                  [semaine.enAttente, 'en attente'],
                ] as const
              ).map(([n, mot]) => (
                <span key={mot} className="flex flex-col rounded-md bg-muted px-3 py-2.5">
                  <b className="font-serif text-[22px] leading-tight text-primary-strong tabular-nums">
                    {n}
                  </b>
                  <span className="text-[13px]">{mot}</span>
                </span>
              ))}
            </a>
          ) : (
            <Ebauche className="h-[68px]" />
          )}
        </section>

        <EtatEnvoi calme="seul" />
      </main>
      <BarreDuBas />
    </div>
  );
}

const MOTIFS: { valeur: Valeur<'mission_blocker'>; libelle: string }[] = [
  { valeur: 'ferme', libelle: 'Fermé' },
  { valeur: 'pas_de_prospectus', libelle: 'Pas de prospectus' },
  { valeur: 'refus', libelle: 'Refus' },
  { valeur: 'autre', libelle: 'Autre' },
];

/**
 * « Je n'ai pas pu » (v2, 13/11 ; planche « une mission ») : une carte repliée ; dépliée, le motif en pastilles, une
 * précision pour « Autre », puis la mission se ferme sans paie. Le geste est gardé sur le téléphone et part avec le
 * prochain envoi : il marche hors ligne.
 */
export function PasPu({ missionId, apres }: { missionId: string; apres?: () => void }) {
  const { synchroniser } = useRelais();
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState<Valeur<'mission_blocker'> | null>(null);
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const fermer = async () => {
    if (!motif) return setErreur('Dites ce qui vous a empêché.');
    if (motif === 'autre' && !note.trim()) return setErreur('Précisez « autre » en quelques mots.');
    const file = (await lireMemoire('missionsPasPu')) ?? [];
    await garder('missionsPasPu', [
      ...file.filter((m) => m.missionId !== missionId),
      { missionId, motif, note: note.trim() || null, le: new Date().toISOString() },
    ]);
    synchroniser();
    apres?.();
  };
  return (
    <section
      className="rounded-lg border border-border bg-card px-3.5 py-3"
      aria-label="Je n’ai pas pu"
    >
      <button
        type="button"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
        className="flex min-h-7 w-full cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left font-sans text-base font-bold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <IconeOuvrir
          className={cn(
            'size-4 transition-transform motion-reduce:transition-none',
            ouvert && 'rotate-90',
          )}
        />
        Je n’ai pas pu
      </button>
      {ouvert && (
        <div className="flex flex-col gap-3 pt-3">
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-[15px]">Qu’est-ce qui vous a empêché&nbsp;?</legend>
            <div className="flex flex-wrap gap-1.5">
              {MOTIFS.map((m) => (
                <Pastille
                  key={m.valeur}
                  choisie={motif === m.valeur}
                  onClick={() => {
                    setMotif(m.valeur);
                    setErreur(null);
                  }}
                >
                  {m.libelle}
                </Pastille>
              ))}
            </div>
          </fieldset>
          {motif === 'autre' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pas-pu-note">En quelques mots</Label>
              <Input
                id="pas-pu-note"
                type="text"
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          )}
          {erreur && (
            <p className="m-0 text-sm font-bold text-destructive" role="alert">
              {erreur}
            </p>
          )}
          <p className="m-0 text-[13px] text-muted-foreground">
            La mission se ferme, sans paie. NTanova lit le motif.
          </p>
          <Button variant="outline" className="self-start" onClick={() => void fermer()}>
            Fermer la mission
          </Button>
        </div>
      )}
    </section>
  );
}
