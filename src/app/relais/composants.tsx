/** Les composants propres à l'espace relais ; les composants partagés sont dans src/ui/. */
import { titreDeLEcran, type FicheLocale } from '../../modele/fiche';
import { Bandeau, Icone } from '../../ui/composants';
import { aller, useEnLigne, useAdresse } from './contexte';

/**
 * Une nouvelle version de l'application est prête. Le relais recharge quand il le décide : la page ne se recharge
 * jamais seule, et ses fiches (gardées dans le téléphone) y survivent.
 */
export function BandeauVersion() {
  return (
    <div className="bandeau-version" role="status">
      <Bandeau ton="attente" icone="nuage">
        <p>
          <b>Nouvelle version prête.</b> Rechargez quand vous le pouvez. Vos fiches restent sur le
          téléphone.
        </p>
        <button
          type="button"
          className="bouton bouton-secondaire bouton-petit"
          onClick={() => location.reload()}
        >
          Recharger
        </button>
      </Bandeau>
    </div>
  );
}

export function PastilleReseau() {
  const enLigne = useEnLigne();
  return enLigne ? (
    <span className="pastille-reseau">
      <span className="point-en-ligne" />
      En ligne
    </span>
  ) : (
    <span className="pastille-reseau hors-ligne">
      <Icone nom="horsLigne" taille={14} />
      Hors ligne
    </span>
  );
}

/** `principal` : le titre est celui de l'écran (h1), comme « Mes fiches ». */
export function Entete({ titre, principal = false }: { titre: string; principal?: boolean }) {
  const Titre = principal ? 'h1' : 'span';
  return (
    <header className="entete-relais">
      <span className="entete-marque">
        <img src="/favicon.svg" alt="" width={30} height={23} />
        <Titre className="entete-titre">{titre}</Titre>
      </span>
      <PastilleReseau />
    </header>
  );
}

export function Navigation() {
  const [ecran = 'lot'] = useAdresse();
  const onglets = [
    { chemin: 'lot', libelle: 'Mon lot', icone: 'carte' as const },
    { chemin: 'fiches', libelle: 'Mes fiches', icone: 'fiche' as const },
    { chemin: 'paie', libelle: 'Ma paie', icone: 'piece' as const },
  ];
  return (
    <nav className="navigation-relais" aria-label="Espace relais">
      {onglets.map((o) => (
        <a
          key={o.chemin}
          href={`#${o.chemin}`}
          aria-current={ecran === o.chemin ? 'page' : undefined}
        >
          <Icone nom={o.icone} taille={22} />
          {o.libelle}
        </a>
      ))}
    </nav>
  );
}

/** L'en-tête des trois étapes d'une fiche : « Ajouter une école », « Corriger une fiche » ou « Compléter une école ». */
export function EnteteEtape({
  etape,
  titre,
  retour,
  type,
}: {
  etape: 1 | 2 | 3;
  titre: string;
  retour: string;
  type: FicheLocale['type'];
}) {
  return (
    <>
      <header className="entete-etape">
        <button
          type="button"
          className="bouton-icone"
          aria-label={etape === 1 ? 'Retour à mon lot' : `Retour à l'étape ${etape - 1}`}
          onClick={() => aller(retour)}
        >
          <Icone nom="retour" taille={22} />
        </button>
        <span className="entete-etape-titre">{titreDeLEcran(type)}</span>
        <span className="entete-etape-compte">{etape}/3</span>
      </header>
      <div className="progression">
        <div className="progression-barres" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= etape ? 'faite' : undefined} />
          ))}
        </div>
        <div className="progression-ligne">
          <h1>{titre}</h1>
          <span className="garde">
            <Icone nom="coche" taille={14} />
            Gardé sur le téléphone
          </span>
        </div>
      </div>
    </>
  );
}

export { Bandeau, Champ, Choix, heure, Icone, jour, type NomIcone } from '../../ui/composants';
