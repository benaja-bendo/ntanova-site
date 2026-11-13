/**
 * Le bonus (lot B du ticket 165, canevas « Espace relais », 12/11) : la fiche est complète, tout ici est en plus. Ce que le relais
 * a vu (« vu » seulement, jamais « absent ») ; la clôture, oui ou non, parce qu'elle se voit de la rue ; cinq photos au plus en
 * plus de l'enseigne, des lieux vides pour la page de l'école, et des photos de travail pour NTanova, jamais publiées. Le bonus
 * ne bloque jamais l'envoi et n'est pas payé.
 */
import { useEffect, useMemo, useState } from 'react';
import { libelleEquipement } from '../../../modele/equipements-ecole';
import {
  avecPhoto,
  peutAjouterPhoto,
  photosFacultatives,
  PHOTOS_FACULTATIVES_MAX,
  ROLES_DE_TRAVAIL,
  ROLES_POUR_LA_PAGE,
  sansPhoto,
  type FicheLocale,
  type PhotoLocale,
} from '../../../modele/fiche';
import { libelleRolePhotoCourt } from '../../../modele/libelles';
import { listes, type Valeur } from '../../../modele/listes';
import { Bouton } from '../../../ui/actions';
import { Dialogue } from '../../../ui/Dialogue';
import { aller } from '../contexte';
import { Choix, EnteteEtape, Icone } from '../composants';
import { journaliser } from '../journal';
import { alleger, PhotoTropLourde } from '../photo';
import { useEnregistrer, type Modifier } from './fiche-en-cours';

/** Les équipements qu'on coche « vu » : tout sauf la clôture (oui ou non) et « autre » (qui demande une précision). */
const VUS = listes.equipment_key.filter((k) => k !== 'cloture' && k !== 'autre');

export function Bonus({ fiche, modifier }: { fiche: FicheLocale; modifier: Modifier }) {
  const enregistrer = useEnregistrer(fiche);
  const [envoi, setEnvoi] = useState(false);
  const vus = fiche.vusSurPlace ?? [];
  const basculer = (k: Valeur<'equipment_key'>) =>
    modifier({ vusSurPlace: vus.includes(k) ? vus.filter((x) => x !== k) : [...vus, k] });
  const cloture = fiche.cloture === 'oui' ? 'oui' : fiche.cloture === 'non' ? 'non' : 'pas_vu';
  return (
    <div className="ecran">
      <EnteteEtape etape={4} titre="Le bonus" retour="ajouter/3" type={fiche.type} />
      <main className="contenu-relais">
        <p className="mention">La fiche est complète. Tout ici est en plus.</p>

        <Choix
          legende="Ce que vous avez vu"
          options={VUS.map((k) => ({ valeur: k, libelle: libelleEquipement[k] }))}
          valeurs={vus}
          surChoix={basculer}
          colonnes={2}
        />
        <Choix
          legende="Clôture"
          options={[
            { valeur: 'oui', libelle: 'Oui' },
            { valeur: 'non', libelle: 'Non' },
            { valeur: 'pas_vu', libelle: 'Pas vu' },
          ]}
          valeurs={[cloture]}
          surChoix={(v) => modifier({ cloture: v === 'pas_vu' ? null : v })}
          colonnes={3}
        />

        <PhotosEnPlus fiche={fiche} modifier={modifier} />
      </main>
      <div className="pied-etape">
        <Bouton
          className="bouton-large"
          enCours={envoi}
          texteEnCours="Enregistrement…"
          onClick={() => {
            setEnvoi(true);
            void enregistrer().finally(() => setEnvoi(false));
          }}
        >
          <Icone nom="coche" />
          Envoyer la fiche
        </Bouton>
      </div>
    </div>
  );
}

/** Les photos en plus, en deux groupes ; un compteur « 2 sur 5 » ; la sixième est refusée avec sa raison. */
function PhotosEnPlus({ fiche, modifier }: { fiche: FicheLocale; modifier: Modifier }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [prepare, setPrepare] = useState(0);
  const autres = photosFacultatives(fiche);
  const apercus = useMemo(
    () =>
      Object.fromEntries(
        autres.flatMap((p) => (p.blob ? [[p.id, URL.createObjectURL(p.blob)] as const] : [])),
      ),
    [autres],
  );
  useEffect(() => () => Object.values(apercus).forEach((u) => URL.revokeObjectURL(u)), [apercus]);

  const ajouter = async (fichier: File | undefined, role: PhotoLocale['role']) => {
    if (!fichier) return;
    setErreur(null);
    if (!peutAjouterPhoto(fiche)) {
      setErreur(
        `Cinq photos au plus en plus de l’enseigne : retirez-en une pour en ajouter une autre.`,
      );
      return;
    }
    setPrepare((n) => n + 1);
    try {
      const a = await alleger(fichier);
      const photo: PhotoLocale = {
        id: crypto.randomUUID(),
        role,
        blob: a.blob,
        mime: a.mime,
        octets: a.octets,
        largeur: a.largeur,
        hauteur: a.hauteur,
        prisLe: new Date().toISOString(),
        envoyee: false,
      };
      modifier((f) => ({ photos: avecPhoto(f, photo).photos }));
    } catch (e) {
      await journaliser(
        'bonus',
        e instanceof PhotoTropLourde ? 'photo_trop_lourde' : 'photo_illisible',
        e,
      );
      setErreur('Cette photo ne peut pas être lue. Reprenez-la, ou choisissez-en une autre.');
    } finally {
      setPrepare((n) => n - 1);
    }
  };

  const groupe = (titre: string, roles: readonly PhotoLocale['role'][], note?: string) => (
    <div className="pile-serree">
      <h3 className="titre-groupe">
        {titre} {note && <span className="mention">{note}</span>}
      </h3>
      <ul className="liste-photos-bonus">
        {roles.map((role) => {
          const prise = autres.find((p) => p.role === role);
          return (
            <li key={role}>
              {prise ? (
                <span className="photo-ajoutee">
                  {apercus[prise.id] && (
                    <img src={apercus[prise.id]} alt={libelleRolePhotoCourt[role]} />
                  )}
                  <span>
                    {libelleRolePhotoCourt[role]} <Icone nom="coche" taille={14} />
                  </span>
                  <button
                    type="button"
                    className="lien lien-discret"
                    aria-label={`Retirer la photo : ${libelleRolePhotoCourt[role]}`}
                    onClick={() => modifier((f) => ({ photos: sansPhoto(f, prise.id).photos }))}
                  >
                    Retirer
                  </button>
                </span>
              ) : (
                <label className="bouton bouton-secondaire bouton-petit">
                  + {libelleRolePhotoCourt[role]}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="cache"
                    aria-label={`Photo : ${libelleRolePhotoCourt[role]}`}
                    disabled={!peutAjouterPhoto(fiche)}
                    onChange={(e) => {
                      void ajouter(e.target.files?.[0], role);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <section className="carte-blanche pile-serree" aria-labelledby="photos-en-plus">
      <h2 id="photos-en-plus" className="titre-section">
        Photos en plus{' '}
        <span className="mention">
          {autres.length} sur {PHOTOS_FACULTATIVES_MAX}
        </span>
      </h2>
      <p className="mention">Aucun enfant sur les photos.</p>
      {groupe('Pour la page de l’école', ROLES_POUR_LA_PAGE)}
      {groupe('Pour NTanova', ROLES_DE_TRAVAIL, '(facultatif, non publiées)')}
      {prepare > 0 && (
        <p className="rang" aria-live="polite">
          <span className="roue" aria-hidden="true" />
          Préparation de la photo…
        </p>
      )}
      {erreur && (
        <p className="message-erreur" role="alert">
          {erreur}
        </p>
      )}
    </section>
  );
}

/**
 * « Envoyer maintenant », depuis l'étape 3 : une fenêtre demande confirmation, « Ajouter le bonus » en bouton principal
 * (canevas : AlertDialog). La fiche est complète : l'envoyer sans bonus est permis.
 */
export function EnvoyerSansBonus({
  avant,
  enregistrer,
}: {
  avant: () => boolean;
  enregistrer: () => Promise<void>;
}) {
  const [ouverte, setOuverte] = useState(false);
  const [enCours, setEnCours] = useState(false);
  return (
    <>
      <button
        type="button"
        className="bouton bouton-secondaire bouton-large"
        aria-haspopup="dialog"
        onClick={() => {
          if (avant()) setOuverte(true);
        }}
      >
        Envoyer maintenant
      </button>
      {ouverte && (
        <Dialogue
          titre="Envoyer sans le bonus ?"
          variante="confirmation"
          description="La fiche est complète. Le bonus prend deux minutes : ce que vous avez vu, et des photos en plus."
          occupe={enCours}
          libelleFermeture="Annuler"
          fermer={() => setOuverte(false)}
          entete={<h2>Envoyer sans le bonus ?</h2>}
        >
          <div className="pile-serree">
            <Bouton onClick={() => aller('ajouter/bonus')}>Ajouter le bonus</Bouton>
            <Bouton
              variante="secondaire"
              enCours={enCours}
              texteEnCours="Enregistrement…"
              onClick={() => {
                setEnCours(true);
                void enregistrer().finally(() => setEnCours(false));
              }}
            >
              Envoyer sans bonus
            </Bouton>
          </div>
        </Dialogue>
      )}
    </>
  );
}
