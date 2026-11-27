/**
 * « À valider » (ticket 236, 27/11) : avant de compléter une fiche, ce qui changerait, valeur par valeur, et ce qu'on garde ;
 * pour un nouveau site, son nom. Rien d'existant n'est remplacé sans un choix.
 */
import { v2 } from '@/ui/v2/classes';
import { Champ } from '@/ui/v2/formulaire';
import {
  sansChoix,
  seraPris,
  type ChampCompare,
  type ChoixDeFiche,
  type Difference,
} from '../../modele/comparaison-fiche';
import type { EcoleVue } from '../../modele/ports';
import { libellesDesSites } from '../../modele/sites-ecole';

const carte =
  'flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-4 text-[15px] [grid-area:compare]';
const titre = 'm-0 font-serif text-xl font-bold [overflow-wrap:anywhere]';
const note = 'text-[13px] text-muted-foreground';

/** Les deux réponses d'une ligne : remplir un vide (pris par défaut) ou remplacer une valeur (gardée par défaut). */
const REMPLIR = [
  ['prendre', 'Ajouter'],
  ['garder', 'Ne pas ajouter'],
] as const;
const REMPLACER = [
  ['garder', 'Garder'],
  ['prendre', 'Remplacer'],
] as const;

export function ComparaisonDeFiche({
  ecole,
  differences,
  choix,
  choisir,
  numeroRetire,
  nomIgnore,
}: {
  ecole: Pick<EcoleVue, 'nom' | 'verifieeLe'>;
  differences: Difference[];
  choix: ChoixDeFiche;
  choisir: (champ: ChampCompare, valeur: 'garder' | 'prendre') => void;
  /** « Le numéro, sur la photo ? » : non. Il ne sera pas repris. */
  numeroRetire: boolean;
  /** Le nom du relevé diffère, mais il vaut pour tous les sites de l'école : il ne se change pas ici. */
  nomIgnore: boolean;
}) {
  return (
    <section className={carte} aria-label="Ce qui change sur la fiche">
      <h3 className={titre}>Compléter la fiche de « {ecole.nom} »</h3>
      <p className="m-0 text-muted-foreground">
        {ecole.verifieeLe
          ? 'Confirmée par la direction : un relevé ne la modifie plus. Seuls le sigle et l’année de création, s’ils manquent, se remplissent.'
          : 'Rien d’existant n’est remplacé sans ton choix.'}
      </p>
      {differences.length === 0 ? (
        <p className="m-0 border-t border-border pt-3">Aucune de ses valeurs ne change.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {differences.map((d) => (
            <li
              key={d.champ}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border py-3 last:pb-0"
            >
              <div className="flex min-w-[14rem] flex-1 flex-col gap-0.5 [overflow-wrap:anywhere]">
                <b>{d.libelle}</b>
                <span className="text-muted-foreground">Aujourd’hui : {d.actuel ?? 'rien'}</span>
                <span>Avec ce relevé : {d.propose}</span>
                {d.champ === 'niveaux' && !d.ajout && (
                  <span className={note}>
                    Un niveau qui porte des formations reste sur la fiche.
                  </span>
                )}
                {d.champ === 'numeroEnseigne' && numeroRetire && (
                  <span className={note}>Pas sur la photo : il ne sera pas repris.</span>
                )}
              </div>
              <div className="flex gap-2" role="group" aria-label={d.libelle}>
                {(d.ajout ? REMPLIR : REMPLACER).map(([valeur, libelle]) => (
                  <button
                    key={valeur}
                    type="button"
                    className={v2.puceCarree}
                    // Un vide à remplir montre sa réponse par défaut ; un remplacement attend un choix.
                    aria-pressed={
                      d.ajout
                        ? (valeur === 'prendre') === seraPris(d, choix)
                        : choix[d.champ] === valeur
                    }
                    onClick={() => choisir(d.champ, valeur)}
                  >
                    {libelle}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {sansChoix(differences, choix) > 0 && (
        <p className={`m-0 ${note}`}>Sans choix, la fiche garde ce qu’elle dit aujourd’hui.</p>
      )}
      {nomIgnore && (
        <p className={`m-0 ${note}`}>
          Le nom vaut pour tous les sites de l’école : il se change dans « Écoles ».
        </p>
      )}
    </section>
  );
}

export function NouveauSite({
  sites,
  nom,
  changer,
}: {
  /** Les sites que l'école a déjà. */
  sites: EcoleVue[];
  nom: string;
  changer: (nom: string) => void;
}) {
  const libelles = libellesDesSites(sites);
  return (
    <section className={carte} aria-label="Le nouveau site">
      <h3 className={titre}>
        Un nouveau site{sites[0] ? ` de « ${sites[0].nom} »` : ' de cette école'}
      </h3>
      <p className="m-0 text-muted-foreground">Le nom et le type restent ceux de l’école.</p>
      <Champ
        libelle="Nom de ce site"
        facultatif
        aide="Par exemple « Annexe ». Sans nom, les listes le distinguent par son quartier ou son repère."
      >
        {(a) => (
          <input
            {...a}
            className={v2.champ}
            type="text"
            autoComplete="off"
            maxLength={120}
            value={nom}
            onChange={(ev) => changer(ev.target.value)}
          />
        )}
      </Champ>
      {sites.length > 0 && (
        <p className={`m-0 ${note} [overflow-wrap:anywhere]`}>
          Déjà là : {sites.map((s) => libelles.get(s.id) ?? s.nom).join(' ; ')}.
        </p>
      )}
    </section>
  );
}
