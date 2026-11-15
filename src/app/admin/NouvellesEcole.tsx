import { v2 } from '@/ui/v2/classes';
import { useCallback, useEffect, useState } from 'react';
import { jourDuCongo } from '../../modele/date-declaration';
import {
  raisonDeNePasPublier,
  type NouvelleAdmin,
  type NouvelleASaisir,
} from '../../modele/fiche-admin';
import { libelleFonction, libelleGenreNouvelle } from '../../modele/libelles';
import { listes, type Valeur } from '../../modele/listes';
import { dateLongue } from '../../modele/pointe-noire';
import type { PortAdministration } from '../../modele/ports';
import { Bouton } from '@/ui/v2/admin';
import { cn } from '@/lib/utils';
import { messageErreur } from './ChampPosition';

const CANAUX = [
  { valeur: 'whatsapp', libelle: 'WhatsApp' },
  { valeur: 'appel', libelle: 'Appel' },
  { valeur: 'sur_place', libelle: 'Sur place' },
  { valeur: 'autre', libelle: 'Autre' },
] as const;

/**
 * Les nouvelles d'un site (lot E du ticket 165, planche « Écrire une nouvelle ») : genre, titre (80), texte (400), l'accord daté
 * de l'école (privé) ; l'aperçu de ce que verra un parent. Sans accord, « Publier » reste grisé et la raison est dite à côté.
 */
export function NouvellesEcole({
  ecoleId,
  admin,
  surChangement,
}: {
  ecoleId: string;
  admin: PortAdministration;
  surChangement: (texte: string) => void;
}) {
  const vide = (): NouvelleASaisir => ({
    genre: 'evenement',
    titre: '',
    texte: '',
    publieeLe: jourDuCongo(),
    fournieParLEcole: true,
    accord: null,
  });
  const [liste, setListe] = useState<NouvelleAdmin[] | null>(null);
  const [n, setN] = useState<NouvelleASaisir>(vide);
  const [qui, setQui] = useState<Valeur<'fonction_direction'>>('directeur');
  const [canal, setCanal] = useState<(typeof CANAUX)[number]['valeur']>('whatsapp');
  const [accordLe, setAccordLe] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const lire = useCallback(() => admin.nouvellesDeLEcole(ecoleId), [admin, ecoleId]);
  useEffect(() => {
    let vivant = true;
    void lire()
      .then((x) => vivant && setListe(x))
      .catch((e: unknown) => vivant && setErreur(messageErreur(e)));
    return () => {
      vivant = false;
    };
  }, [lire]);
  const saisie: NouvelleASaisir = { ...n, accord: accordLe ? { qui, canal, le: accordLe } : null };
  const raison = raisonDeNePasPublier(saisie, jourDuCongo());
  const agir = async (action: () => Promise<unknown>, texte: string) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      setListe(await lire());
      surChangement(texte);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };
  const publiees = (liste ?? []).filter((x) => x.etat === 'publiee');

  const champ = cn(v2.champ, 'h-11');
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5"
        aria-label="Une nouvelle"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (raison) return;
          void agir(
            () => admin.publierNouvelle(ecoleId, saisie),
            'Nouvelle publiée. Visible à la prochaine mise à jour du site.',
          ).then(() => {
            setN(vide());
            setAccordLe('');
          });
        }}
      >
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-sm font-bold">Genre</legend>
          <div className="flex flex-wrap gap-2">
            {listes.post_kind.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={n.genre === g}
                onClick={() => setN({ ...n, genre: g })}
                className={v2.puce}
              >
                {libelleGenreNouvelle[g]}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Titre
          <input
            className={champ}
            maxLength={80}
            value={n.titre}
            onChange={(e) => setN({ ...n, titre: e.target.value })}
          />
          <span className="text-[13px] font-normal text-muted-foreground">
            80 caractères au plus.
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Texte
          <textarea
            className={v2.zone}
            rows={4}
            maxLength={400}
            value={n.texte}
            onChange={(e) => setN({ ...n, texte: e.target.value })}
          />
          <span className="text-[13px] font-normal text-muted-foreground">
            {n.texte.trim().length} sur 400.
          </span>
        </label>
        <fieldset className="m-0 flex flex-col gap-2 rounded-lg border-0 bg-muted p-3">
          <legend className="float-left mb-1 p-0 text-[15px] font-bold">L’accord de l’école</legend>
          <div className="clear-both grid gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm font-bold">
              Qui
              <select
                className={champ}
                value={qui}
                onChange={(e) => setQui(e.target.value as Valeur<'fonction_direction'>)}
              >
                {listes.fonction_direction.map((f) => (
                  <option key={f} value={f}>
                    {libelleFonction[f]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Par
              <select
                className={champ}
                value={canal}
                onChange={(e) => setCanal(e.target.value as typeof canal)}
              >
                {CANAUX.map((c) => (
                  <option key={c.valeur} value={c.valeur}>
                    {c.libelle}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Le
              <input
                className={champ}
                type="date"
                value={accordLe}
                onChange={(e) => setAccordLe(e.target.value)}
              />
            </label>
          </div>
          <span className="text-[13px] text-muted-foreground">
            Reste privé. Sans accord, rien ne paraît.
          </span>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <Bouton
            type="submit"
            enCours={enCours}
            disabled={raison !== null}
            aria-describedby="raison-nouvelle"
          >
            Publier sur la fiche
          </Bouton>
          <span className="text-sm text-muted-foreground" id="raison-nouvelle" role="status">
            {raison ?? 'Visible à la prochaine mise à jour du site.'}
          </span>
        </div>
        {erreur && (
          <p className={v2.erreur} role="alert">
            {erreur}
          </p>
        )}
      </form>

      <aside className="flex flex-col gap-4">
        <section className="flex flex-col gap-2" aria-label="Ce que verra un parent">
          <h3 className={v2.surtitre}>Ce que verra un parent</h3>
          <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
            <div className="aspect-[16/9] rounded-md bg-muted" aria-hidden="true" />
            <span className="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
              Nouvelle de l’école · {dateLongue(n.publieeLe)}
            </span>
            <b className="text-[17px]">{n.titre || '[Titre]'}</b>
            <span className="text-[15px] text-muted-foreground">{n.texte || '[Texte]'}</span>
          </div>
        </section>
        <section
          className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
          aria-label="Déjà publiées"
        >
          <h3 className="m-0 font-sans text-[15px] font-bold">Déjà publiées</h3>
          {liste === null ? (
            <p className="m-0 text-sm" aria-busy="true">
              Chargement…
            </p>
          ) : publiees.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">
              Aucune : la rubrique n’existe pas sur la page.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {publiees.map((x) => (
                <li key={x.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1">
                    {x.titre} · {dateLongue(x.publieeLe)}
                  </span>
                  <button
                    type="button"
                    className={cn(v2.lienDanger, 'min-h-0 text-sm no-underline')}
                    disabled={enCours}
                    aria-label={`Retirer ${x.titre}`}
                    onClick={() =>
                      void agir(() => admin.retirerNouvelle(x.id), 'Nouvelle retirée de la page.')
                    }
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
