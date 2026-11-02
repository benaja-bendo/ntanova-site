/**
 * Les composants React partagés par l'espace relais et l'administration.
 * Aucun appel réseau ici ; les couleurs viennent des jetons (composants.css).
 */
import { useId, type ReactNode } from 'react';

const traits = {
  coche: <path d="M3 8.5l3.2 3L13 4.5" />,
  retour: <path d="M10 3L5 8l5 5" />,
  suivant: <path d="M3 8h9.5M8.5 4l4 4-4 4" />,
  plus: <path d="M8 3v10M3 8h10" />,
  carte: (
    <>
      <path d="M2 4.4l4-1.6 4 1.6 4-1.6v8.8l-4 1.6-4-1.6-4 1.6z" />
      <path d="M6 2.8v8.8M10 4.4v8.8" />
    </>
  ),
  fiche: (
    <>
      <rect x="3.2" y="2" width="9.6" height="12" rx="1.6" />
      <path d="M5.6 5.6h4.8M5.6 8.4h4.8M5.6 11.2h2.8" />
    </>
  ),
  nuage: (
    <>
      <path d="M5.2 12.4h-1a2.7 2.7 0 01-.5-5.4 4.2 4.2 0 017.9-1 3.1 3.1 0 01.3 6.4h-1.1" />
      <path d="M8 14V8.8M6.1 10.7L8 8.8l1.9 1.9" />
    </>
  ),
  cadenas: (
    <>
      <rect x="3.2" y="7.2" width="9.6" height="6.8" rx="1.6" />
      <path d="M5.6 7.2v-2a2.4 2.4 0 014.8 0v2" />
    </>
  ),
  oeil: (
    <>
      <path d="M1.2 8S3.6 3.6 8 3.6 14.8 8 14.8 8 12.4 12.4 8 12.4 1.2 8 1.2 8z" />
      <circle cx="8" cy="8" r="2.1" />
    </>
  ),
  horloge: (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 4.8V8l2.2 1.6" />
    </>
  ),
  photo: (
    <>
      <path d="M2.4 5.6h2.4l1.2-1.6h4l1.2 1.6h2.4v7.2H2.4z" />
      <circle cx="8" cy="9.2" r="2.2" />
    </>
  ),
  galerie: (
    <>
      <rect x="2" y="3.2" width="12" height="9.6" rx="1.6" />
      <circle cx="6" cy="6.8" r="1.2" />
      <path d="M2.8 12l3.6-3.6 2.4 2.4 1.6-1.6 2.8 2.8" />
    </>
  ),
  alerte: (
    <>
      <path d="M8 2l6.5 11.5h-13z" />
      <path d="M8 6.5v3M8 11.6v.1" />
    </>
  ),
  horsLigne: (
    <>
      <path d="M2.5 13.5V12M6 13.5v-4M9.5 13.5V7M13 13.5v-9" />
      <path d="M2 2l12 12" />
    </>
  ),
  piece: (
    <>
      <rect x="1.8" y="4.2" width="12.4" height="7.6" rx="1.4" />
      <circle cx="8" cy="8" r="1.8" />
      <path d="M4.2 8h.1M11.7 8h.1" />
    </>
  ),
};

export type NomIcone = keyof typeof traits;

export function Icone({ nom, taille = 20 }: { nom: NomIcone; taille?: number }) {
  return (
    <svg
      className="icone"
      width={taille}
      height={taille}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      {traits[nom]}
    </svg>
  );
}

/** Un choix parmi des pastilles (un seul, ou plusieurs avec `multiple`). */
export function Choix<T extends string>({
  legende,
  options,
  valeurs,
  surChoix,
  colonnes,
  erreur,
}: {
  legende: string;
  options: readonly { valeur: T; libelle: string }[];
  valeurs: readonly T[];
  surChoix: (valeur: T) => void;
  colonnes?: number;
  erreur?: string | undefined;
}) {
  const idErreur = useId();
  return (
    <fieldset className="choix" aria-describedby={erreur ? idErreur : undefined}>
      <legend>{legende}</legend>
      <div
        className={colonnes ? 'choix-grille' : 'choix-ligne'}
        style={
          colonnes ? { gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))` } : undefined
        }
      >
        {options.map((o) => {
          const choisi = valeurs.includes(o.valeur);
          return (
            <button
              key={o.valeur}
              type="button"
              className="pastille-choix"
              aria-pressed={choisi}
              onClick={() => surChoix(o.valeur)}
            >
              {choisi && <Icone nom="coche" taille={14} />}
              {o.libelle}
            </button>
          );
        })}
      </div>
      {erreur && (
        <p className="message-erreur" id={idErreur}>
          {erreur}
        </p>
      )}
    </fieldset>
  );
}

export function Champ({
  libelle,
  facultatif,
  aide,
  erreur,
  children,
}: {
  libelle: string;
  facultatif?: boolean;
  aide?: string | undefined;
  erreur?: string | undefined;
  children: (attributs: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}) {
  const id = useId();
  const idAide = `${id}-aide`;
  return (
    <div className="champ-groupe">
      <label htmlFor={id}>
        {libelle} {facultatif && <span className="facultatif">(facultatif)</span>}
      </label>
      {children({
        id,
        'aria-invalid': Boolean(erreur),
        'aria-describedby': erreur || aide ? idAide : undefined,
      })}
      {erreur ? (
        <p className="message-erreur" id={idAide}>
          {erreur}
        </p>
      ) : (
        aide && (
          <p className="aide" id={idAide}>
            {aide}
          </p>
        )
      )}
    </div>
  );
}

export function Bandeau({
  ton,
  icone,
  children,
}: {
  ton: 'attente' | 'envoye' | 'prive' | 'public' | 'erreur';
  icone: NomIcone;
  children: ReactNode;
}) {
  return (
    <div className={`bandeau bandeau-${ton}`} role={ton === 'erreur' ? 'alert' : undefined}>
      <Icone nom={icone} />
      <div>{children}</div>
    </div>
  );
}

/** 14 h 05, sans coupure */
export function heure(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}\u00a0h\u00a0${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Aujourd'hui, hier, ou 31/10 */
export function jour(iso: string, maintenant = new Date()): string {
  const d = new Date(iso);
  const memeJour = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (memeJour(d, maintenant)) return "Aujourd'hui";
  const hier = new Date(maintenant);
  hier.setDate(hier.getDate() - 1);
  if (memeJour(d, hier)) return 'Hier';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** « aujourd'hui à 14 h 05 », « hier à 9 h 02 », « le 31/10 à 14 h 05 » */
export function quand(iso: string, maintenant = new Date()): string {
  const j = jour(iso, maintenant);
  const date = j === "Aujourd'hui" ? "aujourd'hui" : j === 'Hier' ? 'hier' : `le ${j}`;
  return `${date} à ${heure(iso)}`;
}
