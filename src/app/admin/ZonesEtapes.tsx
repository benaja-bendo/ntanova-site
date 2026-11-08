/**
 * Les zones par étape de la carte : « pas encore couverte », « déploiement programmé », « relevé en cours ». Activer une
 * zone se fait en un bouton sur sa carte : la même chose que le volet de zone, vue de plus haut.
 */
import { useState } from 'react';
import {
  etapesDeLaCarte,
  etatHerite,
  libelleEtat,
  phraseDesEcoles,
  type EtatCarte,
} from '../../modele/zones-admin';
import { libelleGenreDivision } from '../../modele/libelles';
import type { DivisionVue } from '../../modele/ports';

const description: Record<'aucun' | 'programme' | 'actif', string> = {
  aucun: 'Aucun contour sur la carte. Les écoles publiées restent visibles.',
  programme: 'Contour vert et nom seul : la carte n’écrit plus « programmé ».',
  actif: 'Contour vert et nom seul ; la carte s’ouvre de préférence sur sa ville.',
};

interface Geste {
  libelle: string;
  etat: EtatCarte;
  principal: boolean;
}

/** Les deux gestes d'une carte : avancer, ou revenir en arrière. Jamais plus de deux. */
function gestesDe(etat: EtatCarte): Geste[] {
  if (etat === null)
    return [
      { libelle: 'Activer', etat: 'actif', principal: true },
      { libelle: 'Programmer', etat: 'programme', principal: false },
    ];
  if (etat === 'programme')
    return [
      { libelle: 'Activer', etat: 'actif', principal: true },
      { libelle: 'Retirer de la carte', etat: null, principal: false },
    ];
  return [
    { libelle: 'Repasser en programmé', etat: 'programme', principal: false },
    { libelle: 'Retirer de la carte', etat: null, principal: false },
  ];
}

function CarteDeZone({
  zone,
  divisions,
  compacte,
  occupee,
  surEtat,
  surChoix,
}: {
  zone: DivisionVue;
  divisions: DivisionVue[];
  compacte: boolean;
  occupee: boolean;
  surEtat: (zone: DivisionVue, etat: EtatCarte) => void;
  surChoix: (zone: DivisionVue) => void;
}) {
  const parent = divisions.find((d) => d.id === zone.parentId);
  const herite = zone.deploiement === null ? etatHerite(zone, divisions) : null;
  return (
    <li className={`admin-carte-zone${compacte ? ' est-compacte' : ''}`}>
      <div className="admin-carte-zone-tete">
        <button
          type="button"
          className="admin-carte-nom"
          aria-label={`Régler ${zone.nom}`}
          onClick={() => surChoix(zone)}
        >
          <b>{zone.nom}</b>
          <small>
            {libelleGenreDivision[zone.genre]}
            {parent ? ` · ${parent.nom}` : ''}
          </small>
        </button>
        <span className="mention">{phraseDesEcoles(zone)}</span>
      </div>
      {herite && (
        <span className="mention">
          Sur la carte par ce qu’elle contient (« {libelleEtat(herite)} »).
        </span>
      )}
      <div className="admin-actions">
        {gestesDe(zone.deploiement).map((g) => (
          <button
            key={g.libelle}
            type="button"
            className={
              g.principal ? 'bouton bouton-petit' : 'bouton bouton-secondaire bouton-petit'
            }
            aria-label={`${g.libelle} ${zone.nom}`}
            disabled={occupee}
            onClick={() => surEtat(zone, g.etat)}
          >
            {g.libelle}
          </button>
        ))}
      </div>
    </li>
  );
}

export function VueParEtape({
  divisions,
  occupee,
  surEtat,
  surChoix,
}: {
  divisions: DivisionVue[];
  /** L'identifiant de la zone dont un réglage s'enregistre, s'il y en a une. */
  occupee: string | null;
  surEtat: (zone: DivisionVue, etat: EtatCarte) => void;
  surChoix: (zone: DivisionVue) => void;
}) {
  const [voirLesAutres, setVoirLesAutres] = useState(false);
  const etapes = etapesDeLaCarte(divisions);
  return (
    <div className="admin-etapes">
      {etapes.map((e) => {
        const cle = e.etat ?? 'aucun';
        const nombre = e.zones.length + e.autres.length;
        return (
          <section
            key={cle}
            className={`admin-etape admin-etape-${cle}`}
            aria-labelledby={`etape-${cle}`}
          >
            <header className="admin-etape-tete">
              <h3 id={`etape-${cle}`}>{libelleEtat(e.etat)}</h3>
              <span className="admin-nombre">{nombre}</span>
            </header>
            <p className="mention">{description[cle]}</p>
            <ul className="admin-cartes">
              {e.zones.map((z) => (
                <CarteDeZone
                  key={z.id}
                  zone={z}
                  divisions={divisions}
                  compacte={false}
                  occupee={occupee === z.id}
                  surEtat={surEtat}
                  surChoix={surChoix}
                />
              ))}
              {voirLesAutres &&
                e.autres.map((z) => (
                  <CarteDeZone
                    key={z.id}
                    zone={z}
                    divisions={divisions}
                    compacte
                    occupee={occupee === z.id}
                    surEtat={surEtat}
                    surChoix={surChoix}
                  />
                ))}
            </ul>
            {nombre === 0 && <p className="admin-etape-vide">Aucune zone ici.</p>}
            {e.autres.length > 0 && (
              <button
                type="button"
                className="admin-voir-autres"
                aria-expanded={voirLesAutres}
                onClick={() => setVoirLesAutres(!voirLesAutres)}
              >
                {voirLesAutres
                  ? e.autres.length > 1
                    ? `Masquer les ${e.autres.length} zones sans école`
                    : 'Masquer la zone sans école'
                  : e.autres.length > 1
                    ? `Voir les ${e.autres.length} autres zones sans école`
                    : 'Voir l’autre zone sans école'}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
