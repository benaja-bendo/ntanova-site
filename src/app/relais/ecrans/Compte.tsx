import { useEffect, useState, type ReactNode } from 'react';
import {
  lireNumeroDePaie,
  lireTitulaire,
  libelleOperateur,
  OPERATEURS,
  type NumeroDePaie as NumeroDePaieLu,
  type OperateurMobileMoney,
} from '../../../modele/numero-de-paie';
import { bilanDesTests } from '../../../modele/premiers-pas';
import { afficherTelephone } from '../../../modele/telephone';
import { avertissementDeDeconnexion, ceQuiResteSurLeTelephone } from '../../../modele/compte';
import { base, compteConnecte, lireMemoire, useRequete } from '../base-locale';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/ui/shadcn/alert-dialog';
import { Button } from '@/ui/shadcn/button';
import { Input } from '@/ui/shadcn/input';
import { Label } from '@/ui/shadcn/label';
import {
  IconeAlerte,
  IconeAttente,
  IconeCamera,
  IconeFait,
  IconeLieu,
  IconeOuvrir,
  IconeSignal,
} from '@/ui/shadcn/icones';
import { BarreDuBas, EnTete, LigneLien } from '../cadre';
import { ChoixRectangle, GroupeDeChoix } from '../choix';
import { Bande, Ebauche } from '../etats';
import { aller, useEnLigne, useRelais } from '../contexte';
import { journaliser } from '../journal';

/**
 * « Compte » : qui est connecté, comment écrire à NTanova, et se déconnecter sans rien perdre. La déconnexion ne touche
 * à aucune fiche : celles qui n'ont pas été reçues restent sur le téléphone, et l'avertissement dit lesquelles.
 */
export function Compte() {
  const { adaptateurs, surDeconnexion, lienNTanova } = useRelais();
  const enLigne = useEnLigne();
  const [email, setEmail] = useState<string | null>(null);
  const [demande, setDemande] = useState(false);
  const [echec, setEchec] = useState(false);
  const profil = useRequete(() => lireMemoire('profil'));
  const reste = useRequete(async () =>
    ceQuiResteSurLeTelephone(await base.fiches.toArray(), await compteConnecte()),
  );

  useEffect(() => {
    void adaptateurs.session.utilisateur().then((u) => setEmail(u?.email ?? null));
  }, [adaptateurs]);

  const deconnecter = async () => {
    setEchec(false);
    try {
      await adaptateurs.session.deconnecter();
      surDeconnexion();
    } catch (erreur) {
      setEchec(true);
      void journaliser('deconnexion', 'echec', erreur);
    }
  };

  const initiale = (
    (profil?.prenom ?? '').replace(/^[^\p{L}]+/u, '').charAt(0) || '?'
  ).toUpperCase();

  return (
    <div className="ecran">
      <EnTete titre="Compte" />
      <main className="flex flex-1 flex-col gap-3.5 p-4">
        <section
          aria-label="Mon compte"
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5"
        >
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-jaune font-bold"
          >
            {initiale}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            {profil?.prenom && <b>{profil.prenom}</b>}
            <span className="truncate text-[13px] text-muted-foreground">
              Compte Google · {email ?? 'connecté'}
            </span>
          </span>
        </section>

        <NumeroDePaie />

        <MonTelephone />

        <section
          aria-labelledby="titre-aide"
          className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
        >
          <h2 id="titre-aide" className="m-0 px-3.5 pt-3 pb-2 font-serif text-lg font-bold">
            Aide
          </h2>
          <nav
            aria-label="Aide du relais"
            className="flex flex-col [&>a]:border-t [&>a]:border-border"
          >
            <LigneLien
              href="#aide/entrer"
              titre="Quoi dire en entrant"
              detail="la phrase, et ce qu’on ne fait jamais"
            />
            <LigneLien
              href="#aide/regles"
              titre="Les règles du relais"
              detail="photos, accord, ce qui ne se publie pas"
            />
            <LigneLien
              href="#aide/paie"
              titre="Comment je suis payé"
              detail="ce qui compte, quand, sur quel numéro"
            />
            {lienNTanova && (
              <a
                href={lienNTanova}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Écrire à NTanova sur WhatsApp"
                className="flex min-h-[72px] items-center gap-3 px-4 py-3 text-foreground no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <b className="text-[17px]">Écrire à NTanova</b>
                  <span className="text-sm text-muted-foreground">
                    un souci avec l’application ou une fiche
                  </span>
                </span>
                <IconeOuvrir className="size-5" />
              </a>
            )}
          </nav>
          {!lienNTanova && (
            <p className="m-0 border-t border-border px-3.5 py-3 text-sm text-muted-foreground">
              Écrivez à NTanova sur WhatsApp, au numéro donné pendant la formation.
            </p>
          )}
        </section>

        <AlertDialog open={demande} onOpenChange={setDemande}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="lg" className="w-full" disabled={!reste}>
              Se déconnecter
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Se déconnecter&nbsp;?</AlertDialogTitle>
              {reste &&
                avertissementDeDeconnexion(reste, enLigne).map((phrase) => (
                  <AlertDialogDescription key={phrase}>{phrase}</AlertDialogDescription>
                ))}
            </AlertDialogHeader>
            {echec && (
              <Bande ton="attention" role="status" icone={<IconeAlerte />}>
                <p>
                  La déconnexion n’a pas abouti. Vos fiches sont toujours sur le téléphone&nbsp;;
                  réessayez.
                </p>
              </Bande>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="outline" size="lg" autoFocus>
                  Annuler
                </Button>
              </AlertDialogCancel>
              <Button
                variant="destructive"
                size="lg"
                onClick={(ev) => {
                  ev.preventDefault();
                  void deconnecter();
                }}
              >
                Me déconnecter quand même
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
      <BarreDuBas />
    </div>
  );
}

/**
 * « Pour recevoir la paie » (lot H) : l'opérateur et le numéro Mobile Money, rangés dans la partie privée de la base. Ils se
 * lisent et se changent seulement avec le réseau : hors ligne, l'écran le dit.
 */
function NumeroDePaie() {
  const { adaptateurs } = useRelais();
  const enLigne = useEnLigne();
  const [lu, setLu] = useState<NumeroDePaieLu | null | undefined>(undefined);
  const [echecLecture, setEchecLecture] = useState(false);
  const [edition, setEdition] = useState(false);
  const [operateur, setOperateur] = useState<OperateurMobileMoney | null>(null);
  const [saisie, setSaisie] = useState('');
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [annonce, setAnnonce] = useState<string | null>(null);

  useEffect(() => {
    if (!enLigne) return;
    let vivant = true;
    adaptateurs.relais
      .monNumeroDePaie()
      .then((n) => {
        if (!vivant) return;
        setLu(n);
        setEchecLecture(false);
      })
      .catch(() => vivant && setEchecLecture(true));
    return () => {
      vivant = false;
    };
  }, [adaptateurs, enLigne]);

  const ouvrir = () => {
    setOperateur(lu?.operateur ?? null);
    setSaisie(lu ? afficherTelephone(lu.numero) : '');
    setNom(lu?.titulaire ?? '');
    setErreur(null);
    setAnnonce(null);
    setEdition(true);
  };
  const enregistrer = async () => {
    const r = lireNumeroDePaie(operateur, saisie);
    if (!r.ok) return setErreur(r.erreur);
    const t = lireTitulaire(nom);
    if (!t.ok) return setErreur(t.erreur);
    setEnCours(true);
    setErreur(null);
    try {
      await adaptateurs.relais.enregistrerMonNumeroDePaie(operateur!, r.numero, t.titulaire);
      setLu({
        operateur: operateur!,
        numero: r.numero,
        titulaire: t.titulaire,
        majLe: new Date().toISOString(),
      });
      setEdition(false);
      setAnnonce('Numéro enregistré. NTanova paiera sur ce numéro.');
    } catch {
      setErreur('Le numéro n’a pas pu être enregistré. Vérifiez le réseau et réessayez.');
    } finally {
      setEnCours(false);
    }
  };

  const ligne = (libelle: string, valeur: ReactNode) => (
    <div className="flex justify-between gap-2.5">
      <dt className="text-muted-foreground">{libelle}</dt>
      <dd className="m-0 text-right font-bold">{valeur}</dd>
    </div>
  );
  return (
    <section
      aria-labelledby="titre-paie"
      className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3.5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="titre-paie" className="m-0 font-serif text-lg font-bold">
          Pour recevoir la paie
        </h2>
        {!edition && enLigne && lu !== undefined && (
          <Button variant="link" className="text-base" onClick={ouvrir}>
            {lu ? 'Modifier' : 'Ajouter'}
          </Button>
        )}
      </div>
      {annonce && (
        <Bande ton="succes" role="status" icone={<IconeFait />}>
          <p>{annonce}</p>
        </Bande>
      )}
      {!enLigne && !edition ? (
        <p className="m-0 text-[15px] text-muted-foreground">
          Votre numéro se lit quand le téléphone capte.
        </p>
      ) : echecLecture ? (
        <Bande ton="attention" icone={<IconeAlerte />}>
          <p>Le numéro n’a pas pu être lu. Réessayez plus tard.</p>
        </Bande>
      ) : lu === undefined ? (
        <div aria-busy="true" aria-label="Lecture" className="flex flex-col gap-2.5">
          <Ebauche className="h-5" />
          <Ebauche className="h-5" />
          <Ebauche className="h-5" />
        </div>
      ) : edition ? (
        <form
          className="flex flex-col gap-3.5"
          noValidate
          onSubmit={(ev) => {
            ev.preventDefault();
            void enregistrer();
          }}
        >
          <GroupeDeChoix legende="Mobile Money">
            {OPERATEURS.map((o) => (
              <ChoixRectangle
                key={o.valeur}
                choisi={operateur === o.valeur}
                onClick={() => {
                  setOperateur(o.valeur);
                  setErreur(null);
                }}
              >
                {o.libelle}
              </ChoixRectangle>
            ))}
          </GroupeDeChoix>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paie-numero">Numéro</Label>
            <Input
              id="paie-numero"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="06 123 45 67"
              value={saisie}
              onChange={(e) => {
                setSaisie(e.target.value);
                setErreur(null);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paie-titulaire">Au nom de</Label>
            <Input
              id="paie-titulaire"
              type="text"
              autoComplete="name"
              autoCapitalize="words"
              placeholder="[Nom du titulaire]"
              aria-describedby="paie-titulaire-aide"
              value={nom}
              onChange={(e) => {
                setNom(e.target.value);
                setErreur(null);
              }}
            />
            <span id="paie-titulaire-aide" className="text-[13px] text-muted-foreground">
              Le nom affiché par MTN ou Airtel&nbsp;: NTanova le vérifie avant d’envoyer.
            </span>
          </div>
          {erreur && (
            <p className="m-0 text-sm font-bold text-destructive" role="alert">
              {erreur}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={enCours || !enLigne} aria-busy={enCours || undefined}>
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEdition(false)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : lu ? (
        <dl className="m-0 flex flex-col gap-2.5 text-base">
          {ligne('Mobile Money', libelleOperateur(lu.operateur))}
          {ligne('Numéro', afficherTelephone(lu.numero))}
          {ligne(
            'Au nom de',
            lu.titulaire ?? <span className="font-normal text-muted-foreground">À ajouter</span>,
          )}
        </dl>
      ) : (
        <p className="m-0 text-[15px]">
          Aucun numéro enregistré. Ajoutez-le pour que NTanova puisse vous payer.
        </p>
      )}
    </section>
  );
}

/**
 * « Mon téléphone est prêt » (lot H) : les trois tests de « Tester mon téléphone » (position, photo, réseau), sur une ligne.
 * Le test de la photo vérifie aussi le stockage : la photo est rangée dans le téléphone puis relue. Si un test a échoué, le
 * titre dit lequel.
 */
function MonTelephone() {
  const tests = useRequete(async () => (await lireMemoire('testsDuTelephone')) ?? null);
  if (tests === undefined) return <Ebauche className="h-[104px]" />;
  const bilan = bilanDesTests(tests);
  const icones = { Position: IconeLieu, Photo: IconeCamera, Réseau: IconeSignal } as const;
  return (
    <section
      aria-labelledby="titre-telephone"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3.5"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full text-blanc',
            bilan.echec ? 'bg-destructive' : tests ? 'bg-primary' : 'bg-muted-foreground',
          )}
        >
          {bilan.echec ? (
            <IconeAlerte className="size-[18px]" />
          ) : tests ? (
            <IconeFait className="size-[18px] [stroke-width:2.8]" />
          ) : (
            <IconeAttente className="size-[18px]" />
          )}
        </span>
        <h2
          id="titre-telephone"
          className={cn(
            'm-0 flex-1 font-serif text-lg font-bold',
            bilan.echec && 'text-destructive',
          )}
        >
          {bilan.titre}
        </h2>
        <Button variant="quiet" size="sm" onClick={() => aller('premiers-pas')}>
          {tests ? 'Refaire' : 'Tester'}
        </Button>
      </div>
      <ul className="m-0 flex list-none justify-between gap-1.5 p-0">
        {bilan.lignes.map((l) => {
          const Icone = icones[l.libelle];
          return (
            <li
              key={l.libelle}
              className={cn(
                'flex items-center gap-1.5 text-[15px] font-bold',
                l.etat === 'bon'
                  ? 'text-primary-strong'
                  : l.etat === 'mauvais'
                    ? 'text-destructive'
                    : 'text-muted-foreground',
              )}
            >
              <Icone className="size-[18px] text-muted-foreground" />
              {l.libelle}
              {l.etat === 'bon' ? (
                <IconeFait className="size-4 [stroke-width:2.8]" aria-label="réussi" />
              ) : l.etat === 'mauvais' ? (
                <IconeAlerte className="size-4" aria-label="échoué" />
              ) : (
                <IconeAttente className="size-4" aria-label="pas testé" />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
