/**
 * « Santé des envois » (ticket #77) : ce que les téléphones des relais ont signalé, en français, regroupé par relais.
 *
 * Aucun mot de la base ni du navigateur : une phrase par signal, l'appareil, la version de l'application, et le
 * détail brut seulement pour qui veut creuser. La période par défaut est de 7 jours : le bruit d'une nuit de bascule
 * (des téléphones d'avant la mise à jour) sort de la vue sans filtre écrit en dur.
 */
import { useEffect, useState } from 'react';
import type { PortAdministration } from '../../modele/ports';
import {
  debutDePeriode,
  periodeParDefaut,
  periodes,
  regrouper,
  type GroupeJournal,
} from '../../modele/sante';
import { Bandeau, Champ, quand } from '../../ui/composants';

export function Sante({ admin }: { admin: PortAdministration }) {
  const [jours, setJours] = useState<number | null>(periodeParDefaut);
  // Ce qui a été lu, et pour quelle période : tant que la période choisie n'est pas celle de la lecture, on charge.
  const [lecture, setLecture] = useState<{
    jours: number | null;
    groupes: GroupeJournal[];
    lignes: number;
  } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const groupes = lecture !== null && lecture.jours === jours ? lecture.groupes : null;
  const lignes = lecture?.lignes ?? 0;

  useEffect(() => {
    let abandonne = false;
    admin
      .erreursRecentes(debutDePeriode(jours, new Date()))
      .then((journal) => {
        if (abandonne) return;
        setLecture({ jours, groupes: regrouper(journal), lignes: journal.length });
        setErreur(null);
      })
      .catch(() => {
        if (!abandonne) setErreur('La base ne répond pas. Vérifie le réseau et recharge la page.');
      });
    return () => {
      abandonne = true;
    };
  }, [admin, jours]);

  return (
    <div className="pile">
      <div className="admin-titre">
        <div>
          <h1>Santé des envois</h1>
          <p className="texte-doux">
            Ce que les téléphones des relais ont signalé. Une même erreur répétée n’est qu’une
            ligne. Un signal n’est pas forcément une panne : une position refusée se règle dans les
            Réglages du téléphone.
          </p>
        </div>
        <Champ libelle="Période">
          {(a) => (
            <select
              {...a}
              className="champ"
              value={jours === null ? 'tout' : String(jours)}
              onChange={(e) => setJours(e.target.value === 'tout' ? null : Number(e.target.value))}
            >
              {periodes.map((p) => (
                <option key={p.libelle} value={p.jours === null ? 'tout' : String(p.jours)}>
                  {p.libelle}
                </option>
              ))}
            </select>
          )}
        </Champ>
      </div>

      {erreur && (
        <Bandeau ton="erreur" icone="alerte">
          <p>{erreur}</p>
        </Bandeau>
      )}

      <div className="admin-tableau">
        <table>
          <thead>
            <tr>
              <th scope="col">Relais</th>
              <th scope="col">Ce qui s’est passé</th>
              <th scope="col">Appareil</th>
              <th scope="col">Fois</th>
              <th scope="col">Dernière fois</th>
            </tr>
          </thead>
          <tbody>
            {groupes?.map((g) => (
              <tr key={g.cle}>
                <td>
                  <b>{g.relaisPrenom}</b>
                </td>
                <td>
                  {g.explication}
                  <details className="admin-sous-ligne">
                    <summary>Détail technique</summary>
                    <p className="mention">
                      Code : <code>{g.code}</code>
                      {g.versionApp && (
                        <>
                          {' '}
                          · version de l’application : <code>{g.versionApp}</code>
                        </>
                      )}
                      {' · '}première fois {quand(g.premiere)}
                    </p>
                    {g.detail && (
                      <p className="mention">
                        <code>{g.detail}</code>
                      </p>
                    )}
                  </details>
                </td>
                <td>{g.appareil}</td>
                <td>{g.nombre}</td>
                <td>{quand(g.derniere)}</td>
              </tr>
            ))}
            {groupes === null && !erreur && (
              <tr>
                <td colSpan={5} className="texte-doux" aria-busy="true">
                  Chargement du journal…
                </td>
              </tr>
            )}
            {groupes?.length === 0 && (
              <tr>
                <td colSpan={5} className="texte-doux">
                  Aucun signal sur cette période.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {groupes !== null && groupes.length > 0 && (
        <p className="mention">
          {lignes} ligne{lignes > 1 ? 's' : ''} du journal, regroupée{groupes.length > 1 ? 's' : ''}{' '}
          en {groupes.length}.
        </p>
      )}
    </div>
  );
}
