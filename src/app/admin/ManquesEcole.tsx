import { v2 } from '@/ui/v2/classes';
import { cn } from '@/lib/utils';
import { IconeLieu, IconeMessage } from '@/ui/shadcn/icones';
import { useCallback, useEffect, useState } from 'react';
import {
  etatDuManque,
  libelleSujetDemande,
  messageALEcole,
  tacheDuManque,
  type Manque,
} from '../../modele/fiche-admin';
import { dateCourte } from '../../modele/pointe-noire';
import type { PortAdministration } from '../../modele/ports';
import { lienWhatsApp } from '../../modele/whatsapp';
import { messageErreur } from './ChampPosition';

/**
 * « N choses à compléter » (lot D du ticket 165, canevas « Fiche d'école », bloc en tête de la fiche admin) : ce qui manque au
 * site, qui peut le donner, et où en est sa demande. Cinq états : à faire ; demandé à l'école le [date] (annulable) ; confié
 * à un relais ; une demande précisée (« Frais de la 3e ») ; rien ne manque. « Ouvrir dans WhatsApp » ouvre ton WhatsApp avec
 * le message, rien ne part tout seul ; les manques passent à « demandé à l'école ». « Confier à un relais » ouvre la mission,
 * avec la tâche préremplie.
 */
export function ManquesEcole({
  ecoleId,
  nom,
  numero,
  admin,
  relais = [],
  surChangement,
}: {
  ecoleId: string;
  nom: string;
  /** Le numéro de l'école quand NTanova en a un (contact public) ; sinon WhatsApp demande à qui écrire. */
  numero: string | null;
  admin: PortAdministration;
  /** Les relais actifs, pour confier ce qui manque (planche : « À un relais · 1 mission »). */
  relais?: { id: string; prenom: string }[];
  /** Gardé pour les appels d'avant : la mission se confie maintenant dans cette carte. */
  surConfier?: (tache: string | null) => void;
  surChangement: (texte: string) => void;
}) {
  const [manques, setManques] = useState<Manque[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const lire = useCallback(() => admin.manquesDeLEcole(ecoleId), [admin, ecoleId]);
  useEffect(() => {
    let vivant = true;
    void lire()
      .then((m) => vivant && setManques(m))
      .catch((e: unknown) => vivant && setErreur(messageErreur(e)));
    return () => {
      vivant = false;
    };
  }, [lire]);

  const [pour, setPour] = useState<Record<string, 'ecole' | 'relais'>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [relaisId, setRelaisId] = useState(relais[0]?.id ?? '');
  const [avantLe, setAvantLe] = useState('');
  const [tache, setTache] = useState<string | null>(null);
  const [paie, setPaie] = useState('');

  if (erreur && manques === null) return <p className={v2.erreur}>{erreur}</p>;
  if (manques === null) return <p aria-busy="true">Chargement…</p>;
  if (manques.length === 0)
    return (
      <section className={v2.pileSerree} aria-label="À compléter">
        <p className={v2.bandeSucces}>Fiche complète : rien ne manque.</p>
      </section>
    );

  const cle = (m: Manque, i: number) => `${m.sujet}-${m.demandeId ?? i}`;
  // Planche : chaque manque dit à qui on le demande (l'école ou un relais) ; par défaut, l'école quand elle peut le donner.
  const qui = (m: Manque, i: number) =>
    pour[cle(m, i)] ?? (m.quiPeut.includes('ecole') ? 'ecole' : 'relais');
  const ouverts = manques.map((m, i) => ({ m, i })).filter(({ m }) => !m.demandeLe);
  const aDemander = ouverts.filter(({ m, i }) => qui(m, i) === 'ecole').map(({ m }) => m);
  const aConfier = ouverts.filter(({ m, i }) => qui(m, i) === 'relais').map(({ m }) => m);
  const messageEcrit = message ?? messageALEcole(nom, aDemander);
  const lien =
    lienWhatsApp(numero ?? undefined, messageEcrit) ??
    `https://wa.me/?text=${encodeURIComponent(messageEcrit)}`;
  const tacheEcrite =
    tache ??
    aConfier
      .map((m) => tacheDuManque[m.sujet] ?? m.detail)
      .filter(Boolean)
      .join(' ');
  const agir = async (action: () => Promise<unknown>, texte: string) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      setManques(await lire());
      surChangement(texte);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };
  const carte = 'flex flex-col gap-3 rounded-xl border border-border bg-card p-4';
  const pastilleRonde =
    'flex size-9 shrink-0 items-center justify-center rounded-full bg-attention text-foreground';

  return (
    <section className="flex flex-col gap-4" aria-label="À compléter">
      <p className="m-0 text-sm text-muted-foreground">
        {manques.length} chose{manques.length > 1 ? 's' : ''} à compléter
      </p>
      <ul className="m-0 flex list-none flex-col overflow-hidden rounded-xl border border-border bg-card p-0">
        {manques.map((m, i) => (
          <li
            key={cle(m, i)}
            className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="text-[15px]">{m.detail ?? libelleSujetDemande[m.sujet]}</b>
              {m.demandeLe && (
                <span className="text-[13px] text-muted-foreground">
                  {etatDuManque(m, dateCourte)}
                </span>
              )}
            </span>
            {m.demandeLe ? (
              m.demandeId &&
              m.demandeA === 'ecole' && (
                <button
                  type="button"
                  className={cn(v2.lien, 'min-h-0 text-sm')}
                  disabled={enCours}
                  onClick={() =>
                    void agir(
                      () => admin.fermerDemande(m.demandeId!, 'annulee'),
                      'Demande annulée.',
                    )
                  }
                >
                  Annuler la demande
                </button>
              )
            ) : (
              <span
                className="inline-flex rounded-md bg-muted p-0.5"
                role="group"
                aria-label={`${m.detail ?? libelleSujetDemande[m.sujet]} : à qui le demander ?`}
              >
                {(['ecole', 'relais'] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={!m.quiPeut.includes(q)}
                    aria-pressed={qui(m, i) === q}
                    onClick={() => {
                      setPour((p) => ({ ...p, [cle(m, i)]: q }));
                      setMessage(null);
                      setTache(null);
                    }}
                    className="min-h-8 cursor-pointer rounded-sm border-0 bg-transparent px-2.5 font-sans text-sm font-bold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:bg-card aria-pressed:text-primary-strong aria-pressed:shadow-sm"
                  >
                    {q === 'ecole' ? 'L’école' : 'Un relais'}
                  </button>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>

      {aDemander.length > 0 && (
        <section className={carte} aria-label="À l’école">
          <div className="flex items-center gap-3">
            <span className={cn(pastilleRonde, 'bg-succes')}>
              <IconeMessage className="size-[18px]" aria-hidden />
            </span>
            <span className="flex flex-col">
              <b className="text-[17px]">
                À l’école · {aDemander.length} chose{aDemander.length > 1 ? 's' : ''}
              </b>
              <span className="text-[13px] text-muted-foreground">
                {numero ? `Numéro ${numero}` : 'Pas de numéro : WhatsApp demandera à qui écrire'}
              </span>
            </span>
          </div>
          <textarea
            aria-label="Le message à l’école"
            className={v2.zone}
            rows={4}
            value={messageEcrit}
            onChange={(e) => setMessage(e.target.value)}
          />
          <a
            className={cn(v2.boutonSecondaire, 'w-full')}
            href={lien}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={enCours}
            onClick={() =>
              void agir(
                () =>
                  Promise.all(
                    aDemander.map((m) => admin.demanderALEcole(ecoleId, m.sujet, m.detail)),
                  ),
                `${aDemander.length > 1 ? 'Demandes notées' : 'Demande notée'} : « demandé à l’école ».`,
              )
            }
          >
            <IconeMessage className="size-[18px]" aria-hidden />
            Ouvrir dans WhatsApp
          </a>
          <p className="m-0 text-[13px] text-muted-foreground">
            Rien ne part tout seul. Au retour, ces manques passent à « demandé à l’école » ;
            annulable.
          </p>
        </section>
      )}

      {aConfier.length > 0 && (
        <form
          className={carte}
          aria-label="À un relais"
          onSubmit={(ev) => {
            ev.preventDefault();
            const paieXaf = paie.trim() === '' ? null : Number(paie.replace(/\s/g, ''));
            if (paieXaf !== null && (!Number.isInteger(paieXaf) || paieXaf < 0))
              return setErreur('La paie est un nombre entier de FCFA, ou rien.');
            if (!relaisId) return setErreur('Choisis le relais.');
            const prenom = relais.find((r) => r.id === relaisId)?.prenom ?? 'le relais';
            void agir(
              () =>
                admin.confierEcole(ecoleId, relaisId, 'complete', null, {
                  tache: tacheEcrite.trim() || null,
                  raison: null,
                  avantLe: avantLe || null,
                  paieXaf,
                }),
              `${nom} est confiée à ${prenom}.`,
            );
          }}
        >
          <div className="flex items-center gap-3">
            <span className={pastilleRonde}>
              <IconeLieu className="size-[18px]" aria-hidden />
            </span>
            <span className="flex flex-col">
              <b className="text-[17px]">À un relais · 1 mission</b>
              <span className="text-[13px] text-muted-foreground">
                Il la verra dans « Missions »
              </span>
            </span>
          </div>
          {relais.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">
              Aucun relais actif : active un relais dans « Relais » d’abord.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <label className="flex flex-col gap-1.5 text-sm font-bold">
                  Relais
                  <select
                    className={v2.champ}
                    value={relaisId}
                    onChange={(e) => setRelaisId(e.target.value)}
                  >
                    {relais.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.prenom || '[sans prénom]'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-bold">
                  Avant le
                  <input
                    className={v2.champ}
                    type="date"
                    value={avantLe}
                    onChange={(e) => setAvantLe(e.target.value)}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 rounded-lg bg-muted p-3 text-sm font-bold">
                Ce qu’il devra faire
                <textarea
                  className={cn(v2.zone, 'min-h-16 bg-card font-normal')}
                  rows={2}
                  maxLength={300}
                  value={tacheEcrite}
                  onChange={(e) => setTache(e.target.value)}
                />
              </label>
              <label className="flex items-center gap-3 text-sm">
                <span className="flex-1 text-muted-foreground">
                  Paie de la mission (FCFA). Une mission ouverte par site au plus.
                </span>
                <input
                  className={cn(v2.champ, 'h-10 w-28')}
                  inputMode="numeric"
                  aria-label="Paie de la mission (FCFA)"
                  value={paie}
                  onChange={(e) => setPaie(e.target.value)}
                />
              </label>
              <button type="submit" className={cn(v2.bouton, 'w-full')} disabled={enCours}>
                Confier la mission
              </button>
            </>
          )}
        </form>
      )}

      {erreur && (
        <p className={v2.erreur} role="alert">
          {erreur}
        </p>
      )}
      <p className="m-0 text-[13px] text-muted-foreground">
        Chaque carte a son bouton : on peut faire l’une sans l’autre.
      </p>
    </section>
  );
}
