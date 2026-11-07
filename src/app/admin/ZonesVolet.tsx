/**
 * Le volet d'une zone : tout ce qu'on règle sur elle, au même endroit. Trois réglages, trois noms (voir
 * `modele/zones-admin.ts`) : « Sur la carte » (ce que voient les familles), « Ouverte aux relais » (où NTanova envoie
 * des relais), et d'où viennent ses fiches.
 */
import type { ReactNode } from 'react';
import {
  ETATS_CARTE,
  SEUIL_OUVERTURE_LARGE,
  etatHerite,
  explicationEtat,
  libelleEtat,
  origineDesFiches,
  phraseDesEcoles,
  surLaCarte,
  zonesDessous,
  type EtatCarte,
} from '../../modele/zones-admin';
import { cheminLisible } from '../../modele/geo-divisions';
import { libelleGenreDivision } from '../../modele/libelles';
import type { DivisionVue, LotVu, PortAdministration } from '../../modele/ports';
import { Icone } from '../../ui/composants';
import { aller } from '../commun/adresse';
import { AjouterDivision, NouveauLot } from './ZonesFormulaires';

const ADRESSE_DE_LA_MISE_A_JOUR =
  'https://github.com/benaja-bendo/ntanova-site/actions/workflows/mise-en-ligne.yml';

/** Ce que les familles voient sur la carte, dessiné avec les couleurs de la carte : un contour, jamais un texte. */
function ApercuDeLaCarte({ etat, avecEcoles }: { etat: EtatCarte; avecEcoles: boolean }) {
  return (
    <svg className="admin-apercu-svg" viewBox="0 0 232 150" aria-hidden="true" focusable="false">
      <defs>
        <pattern
          id="admin-apercu-hachures"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect className="apercu-hachures-fond" width="8" height="8" />
          <line className="apercu-hachures-trait" x1="0" y1="0" x2="0" y2="8" />
        </pattern>
      </defs>
      <rect className="apercu-terre" width="232" height="150" />
      <path className="apercu-eau" d="M150 150 L232 96 L232 150Z" />
      <path className="apercu-parc" d="M0 108 Q40 92 70 112 L60 150 L0 150Z" />
      <path className="apercu-rue" d="M0 60 L232 40 M70 0 L96 150 M150 0 L170 120" />
      {etat && (
        <polygon
          className={`apercu-zone apercu-zone-${etat}`}
          points="56,30 160,20 202,66 182,118 100,128 46,90"
        />
      )}
      {avecEcoles && (
        <g>
          <circle className="apercu-ecole apercu-ecole-m" cx="96" cy="58" r="6" />
          <circle className="apercu-ecole apercu-ecole-p" cx="132" cy="84" r="6" />
          <circle className="apercu-ecole apercu-ecole-c" cx="84" cy="96" r="6" />
        </g>
      )}
    </svg>
  );
}

export function VoletDeZone({
  zone,
  divisions,
  lots,
  ouvertePar,
  occupee,
  admin,
  retour,
  surEtat,
  surOuverture,
  surFait,
}: {
  zone: DivisionVue;
  divisions: DivisionVue[];
  lots: LotVu[];
  /** La zone qui ouvre chaque zone aux relais : elle-même, une zone au-dessus d'elle, ou personne. */
  ouvertePar: ReadonlyMap<string, DivisionVue | null>;
  occupee: boolean;
  admin: PortAdministration;
  retour: ReactNode;
  surEtat: (etat: EtatCarte) => void;
  surOuverture: (ouverte: boolean) => void;
  surFait: (texte: string, zoneId?: string) => void;
}) {
  const parent = divisions.find((d) => d.id === zone.parentId);
  const par = ouvertePar.get(zone.id) ?? null;
  const ouverteParUneAutre = par !== null && par.id !== zone.id;
  const ouverte = par !== null;
  const dessous = zonesDessous(zone, divisions);
  const herite = etatHerite(zone, divisions);
  const etat: EtatCarte = zone.deploiement;
  const origine = origineDesFiches(zone);
  const nbFiches = zone.relevees + zone.ajoutees + zone.importees;
  const sesLots = lots.filter(
    (l) => l.divisionId === zone.id || dessous.some((z) => z.id === l.divisionId),
  );
  const estOuverte = (id: string) => ouvertePar.get(id) != null;

  return (
    <div className="admin-volet">
      <section className="admin-volet-carte" aria-label={`${zone.nom} : en bref`}>
        <p className="mention">{parent ? cheminLisible(parent.id, divisions) : 'Tout le pays'}</p>
        <div className="admin-volet-titre">
          <h2>{zone.nom}</h2>
          <span className="etiquette etat-telephone">{libelleGenreDivision[zone.genre]}</span>
        </div>
        <div className="admin-stats">
          <div className="admin-stat">
            <b>{zone.ecoles}</b>
            <span>{zone.ecoles > 1 ? 'écoles' : 'école'}</span>
          </div>
          <div className="admin-stat">
            <b>{zone.publiees}</b>
            <span>{zone.publiees > 1 ? 'publiées sur le site' : 'publiée sur le site'}</span>
          </div>
          <div className="admin-stat admin-stat-origine">
            <span>D’où viennent les fiches</span>
            <span
              className="admin-origine"
              role="img"
              aria-label={`${zone.relevees} relevées par un relais, ${zone.ajoutees} ajoutées par toi, ${zone.importees} importées`}
            >
              <span className="origine-releve" style={{ width: `${origine.relevees}%` }} />
              <span className="origine-ajoutee" style={{ width: `${origine.ajoutees}%` }} />
              <span className="origine-importee" style={{ width: `${origine.importees}%` }} />
            </span>
            <ul className="admin-legende">
              <li>
                <i className="origine-releve" aria-hidden="true" />
                {zone.relevees} {zone.relevees > 1 ? 'relevées' : 'relevée'} par un relais
              </li>
              <li>
                <i className="origine-ajoutee" aria-hidden="true" />
                {zone.ajoutees} {zone.ajoutees > 1 ? 'ajoutées' : 'ajoutée'} par toi
              </li>
              <li>
                <i className="origine-importee" aria-hidden="true" />
                {zone.importees} {zone.importees > 1 ? 'importées' : 'importée'}
              </li>
            </ul>
            {nbFiches === 0 && (
              <span className="mention">Aucune fiche dans cette zone pour l’instant.</span>
            )}
          </div>
        </div>
      </section>

      {retour}

      {surLaCarte(zone) && (
        <section className="admin-volet-carte" aria-label="Sur la carte du site">
          <h3>Ce que les familles voient sur la carte</h3>
          <p className="mention">
            Un seul réglage, trois états. Il ne change rien pour les relais.
          </p>
          <fieldset className="admin-segments" disabled={occupee}>
            <legend className="visuellement-cache">État de {zone.nom} sur la carte</legend>
            {ETATS_CARTE.map((e) => (
              <label
                key={e ?? 'aucun'}
                className={`admin-segment admin-segment-${e ?? 'aucun'}${etat === e ? ' est-actif' : ''}`}
              >
                <input
                  type="radio"
                  name={`etat-${zone.id}`}
                  checked={etat === e}
                  onChange={() => surEtat(e)}
                />
                <span>{libelleEtat(e)}</span>
              </label>
            ))}
          </fieldset>
          <div className="admin-apercu">
            <div className="admin-apercu-carte">
              <ApercuDeLaCarte etat={etat} avecEcoles={zone.ecoles > 0} />
            </div>
            <div className="admin-apercu-texte">
              <p>{explicationEtat[etat ?? 'aucun']}</p>
              {etat === null && herite !== null && (
                <p className="bandeau bandeau-attente">
                  <Icone nom="alerte" taille={18} />
                  <span>
                    Les familles lisent quand même « {libelleEtat(herite)} » sur la page de{' '}
                    {zone.nom} : ce qu’elle contient l’est.
                  </span>
                </p>
              )}
              <p className="admin-horloge">
                <Icone nom="horloge" taille={18} />
                <span>
                  Visible sur ntanova.com après la prochaine mise à jour du site.{' '}
                  <a href={ADRESSE_DE_LA_MISE_A_JOUR} target="_blank" rel="noopener noreferrer">
                    Ouvrir la mise à jour du site
                  </a>
                </span>
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="admin-volet-carte" aria-label="Relais">
        <div className="admin-interrupteur-rang">
          <div>
            <h3>Ouverte aux relais</h3>
            <p className="mention">
              {ouverteParUneAutre
                ? `Ouverte par ${par.nom} : elle l’est avec tout ce que ${par.nom} contient. Ferme ${par.nom} pour la fermer ici.`
                : ouverte
                  ? 'Oui : NTanova envoie des relais ici.'
                  : 'Non : NTanova n’y envoie pas de relais pour l’instant.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            className={`admin-interrupteur${ouverte ? ' est-actif' : ''}`}
            aria-checked={ouverte}
            aria-label={`Ouverte aux relais : ${zone.nom}`}
            disabled={occupee || ouverteParUneAutre}
            onClick={() => surOuverture(!ouverte)}
          />
        </div>
        <p className="mention">
          Les relais peuvent relever partout : ce réglage dit seulement où NTanova en envoie. Ouvrir
          une zone ouvre tout ce qu’elle contient.
        </p>
        {!ouverte && dessous.length >= SEUIL_OUVERTURE_LARGE && (
          <p className="bandeau bandeau-attente">
            <Icone nom="alerte" taille={18} />
            <span>
              Ouvrir {zone.nom} ouvre aussi les {dessous.length} zones qu’elle contient : une
              confirmation te montrera ce qui change avant d’agir.
            </span>
          </p>
        )}
      </section>

      <section className="admin-volet-carte" aria-label="Écoles et lots de la zone">
        <h3>Écoles de cette zone</h3>
        {zone.ecoles > 0 ? (
          <div className="admin-ecoles-rang">
            <progress
              max={zone.ecoles}
              value={zone.publiees}
              aria-label="Écoles publiées sur celles de la zone"
            />
            <span>{phraseDesEcoles(zone)}</span>
            {zone.niveau >= 2 && (
              <a
                className="bouton bouton-secondaire bouton-petit"
                href={`#ecoles/zone/${zone.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  aller(`ecoles/zone/${zone.id}`);
                }}
              >
                Voir les écoles
              </a>
            )}
          </div>
        ) : (
          <p className="texte-doux">
            Aucune école relevée ici pour l’instant. Pour en avoir, un relais doit y relever : les
            relais sont dans l’onglet « Relais ».
          </p>
        )}

        <details
          key={`lots-${zone.id}`}
          className="admin-plie"
          open={sesLots.length > 0 ? true : undefined}
        >
          <summary>Lots ({sesLots.length})</summary>
          {sesLots.length === 0 ? (
            <p className="mention">
              Aucun lot ici. Un lot donne une zone et une échéance à un relais.
            </p>
          ) : (
            <ul className="admin-liste-simple">
              {sesLots.map((l) => (
                <li key={l.id}>
                  <b>{l.nom}</b>
                  {l.essai ? ' · entraînement, fiches jamais publiées' : ' · toute la zone'}
                </li>
              ))}
            </ul>
          )}
        </details>

        {zone.niveau >= 2 && (
          <details key={`nouveau-lot-${zone.id}`} className="admin-plie">
            <summary>Créer un lot ici</summary>
            <NouveauLot
              key={zone.id}
              divisions={divisions}
              estOuverte={estOuverte}
              admin={admin}
              surFait={surFait}
              zoneInitiale={zone.id}
            />
          </details>
        )}

        {zone.niveau <= 3 && (
          <details key={`sous-zone-${zone.id}`} className="admin-plie">
            <summary>Ajouter une sous-zone</summary>
            <AjouterDivision
              key={zone.id}
              divisions={divisions}
              estOuverte={estOuverte}
              admin={admin}
              surFait={surFait}
              parentInitial={zone.id}
            />
          </details>
        )}
      </section>
    </div>
  );
}
