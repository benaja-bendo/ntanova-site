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
import { Bouton } from '../../ui/actions';
import { Champ, Choix } from '../../ui/composants';
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

  return (
    <section className="pile-serree" aria-label="Nouvelles de l’école">
      <h3>Nouvelles</h3>
      {liste === null ? (
        <p aria-busy="true">Chargement…</p>
      ) : publiees.length === 0 ? (
        <p className="mention">Aucune nouvelle : la rubrique n’existe pas sur la page.</p>
      ) : (
        <ul className="admin-liste-manques">
          {publiees.map((x) => (
            <li key={x.id}>
              <span>
                <b>{x.titre}</b>
                <span className="mention admin-sous-ligne">
                  {libelleGenreNouvelle[x.genre]} · {dateLongue(x.publieeLe)}
                  {x.fournieParLEcole ? ' · fournie par l’école' : ''}
                </span>
              </span>
              <button
                type="button"
                className="lien lien-danger"
                disabled={enCours}
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
      <form
        className="admin-motif pile-serree"
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
        <Choix
          legende="Genre"
          options={listes.post_kind.map((g) => ({ valeur: g, libelle: libelleGenreNouvelle[g] }))}
          valeurs={[n.genre]}
          surChoix={(g) => setN({ ...n, genre: g })}
        />
        <Champ libelle="Titre" aide={`${n.titre.trim().length} sur 80.`}>
          {(a) => (
            <input
              {...a}
              className="champ"
              maxLength={80}
              value={n.titre}
              onChange={(e) => setN({ ...n, titre: e.target.value })}
            />
          )}
        </Champ>
        <Champ libelle="Texte" aide={`${n.texte.trim().length} sur 400.`}>
          {(a) => (
            <textarea
              {...a}
              className="champ"
              rows={4}
              maxLength={400}
              value={n.texte}
              onChange={(e) => setN({ ...n, texte: e.target.value })}
            />
          )}
        </Champ>
        <label className="case">
          <input
            type="checkbox"
            checked={n.fournieParLEcole}
            onChange={(e) => setN({ ...n, fournieParLEcole: e.target.checked })}
          />
          L’école l’a fournie (« Nouvelle de l’école ») ; sinon « Nouvelle »
        </label>
        <fieldset className="pile-serree">
          <legend>L’accord de l’école (reste privé)</legend>
          <Champ libelle="Qui">
            {(a) => (
              <select
                {...a}
                className="champ"
                value={qui}
                onChange={(e) => setQui(e.target.value as Valeur<'fonction_direction'>)}
              >
                {listes.fonction_direction.map((f) => (
                  <option key={f} value={f}>
                    {libelleFonction[f]}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <Champ libelle="Par">
            {(a) => (
              <select
                {...a}
                className="champ"
                value={canal}
                onChange={(e) => setCanal(e.target.value as typeof canal)}
              >
                {CANAUX.map((c) => (
                  <option key={c.valeur} value={c.valeur}>
                    {c.libelle}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <Champ libelle="Le">
            {(a) => (
              <input
                {...a}
                className="champ"
                type="date"
                value={accordLe}
                onChange={(e) => setAccordLe(e.target.value)}
              />
            )}
          </Champ>
        </fieldset>
        <div className="pile-serree" aria-label="Ce que verra un parent">
          <span className="surtitre-doux">Ce que verra un parent</span>
          <p className="mention">
            {(n.fournieParLEcole ? 'Nouvelle de l’école' : 'Nouvelle') +
              ' · ' +
              dateLongue(n.publieeLe)}
            <br />
            <b>{n.titre || '[Titre]'}</b>
            <br />
            {n.texte || '[Texte]'}
          </p>
        </div>
        <Bouton
          type="submit"
          enCours={enCours}
          disabled={raison !== null}
          aria-describedby="raison-nouvelle"
        >
          Publier sur la fiche
        </Bouton>
        <p className="mention" id="raison-nouvelle" role="status">
          {raison ?? 'Visible à la prochaine mise à jour du site.'}
        </p>
      </form>
      {erreur && (
        <p className="message-erreur" role="alert">
          {erreur}
        </p>
      )}
    </section>
  );
}
