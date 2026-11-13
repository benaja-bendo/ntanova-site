/**
 * Ce que NTanova a déjà reçu de la fiche qu'on corrige (ticket #72) : ses photos, relues chez NTanova, et la position
 * envoyée, sur une carte. Le relais qui corrige voit ce qui est bon (il n'a rien à refaire) et ce qui manque (il le
 * reprend), sans deviner.
 *
 * Les rôles des photos arrivées sont dans la fiche (`dejaRecu`), donc lisibles sans réseau ; les images se relisent
 * chez NTanova (`mesPhotos`, adresses d'une heure). Quand elles ne se lisent pas (pas de réseau, règle de la base pas
 * encore appliquée), l'écran dit seulement quels rôles sont arrivés.
 */
import { classeBouton } from '../formulaire';
import { useEffect, useState } from 'react';
import type { FicheLocale } from '../../../modele/fiche';
import type { Point } from '../../../modele/geo';
import { libelleRolePhotoCourt } from '../../../modele/libelles';
import type { PhotoRecue } from '../../../modele/ports';
import { CartePosition } from '../../commun/CartePosition';
import { useRelais } from '../contexte';

type Lecture =
  { etat: 'chargement' } | { etat: 'prete'; photos: PhotoRecue[] } | { etat: 'indisponible' };

/** « 3 novembre », ou rien quand la date n'est pas lisible : un écran de correction ne tombe jamais pour une date. */
const jour = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(date);
};

/** Les photos que NTanova a reçues pour cette fiche, et ce que le relais en fait. */
export function PhotosRecues({ fiche }: { fiche: FicheLocale }) {
  const { adaptateurs } = useRelais();
  const recu = fiche.dejaRecu;
  const releveId = fiche.corrigeReleveId;
  const [lecture, setLecture] = useState<Lecture>({ etat: 'chargement' });
  const nombre = recu?.photos.length ?? 0;

  useEffect(() => {
    if (!releveId || nombre === 0) return;
    let actif = true;
    adaptateurs.relais
      .mesPhotos(releveId)
      .then((photos) => actif && setLecture({ etat: 'prete', photos }))
      .catch(() => actif && setLecture({ etat: 'indisponible' }));
    return () => {
      actif = false;
    };
  }, [adaptateurs, releveId, nombre]);

  if (!recu) return null;
  const enseigneRecue = recu.photos.includes('signboard');
  const aReprendre = fiche.taches?.photo ?? true;

  const consigne = !enseigneRecue
    ? "NTanova n'a reçu aucune photo de l'enseigne : prenez-la maintenant."
    : aReprendre
      ? 'NTanova a cette photo, mais elle est à refaire. Reprenez-la ci-dessous.'
      : "NTanova a déjà la photo de l'enseigne. Reprenez-la seulement si elle est fausse.";

  return (
    <div className="flex flex-col gap-2.5" aria-label="Photos reçues par NTanova">
      {nombre === 0 ? (
        <p
          className="m-0 rounded-md bg-attention px-3 py-2.5 text-sm text-attention-foreground"
          role="status"
        >
          NTanova n'a reçu aucune photo avec cette fiche. Prenez la photo de l'enseigne maintenant.
        </p>
      ) : (
        <>
          <p className="m-0 text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">
            Reçues par NTanova
          </p>
          {lecture.etat === 'prete' && lecture.photos.length > 0 ? (
            <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
              {lecture.photos.map((p) => (
                <li key={p.id} className="flex flex-col gap-1 text-xs font-bold">
                  <img
                    className="aspect-[4/3] w-full rounded-md bg-border object-cover"
                    src={p.url}
                    alt={`Photo reçue : ${libelleRolePhotoCourt[p.role]}`}
                    loading="lazy"
                  />
                  <span>{libelleRolePhotoCourt[p.role]}</span>
                </li>
              ))}
            </ul>
          ) : lecture.etat === 'chargement' ? (
            <p className="m-0 text-[13px] text-muted-foreground" role="status">
              Chargement des photos…
            </p>
          ) : (
            <p className="m-0 text-[13px] text-muted-foreground">
              Photos reçues&nbsp;: {recu.photos.map((r) => libelleRolePhotoCourt[r]).join(', ')}.
              Leur aperçu ne s'affiche pas pour le moment.
            </p>
          )}
          <p
            className={
              enseigneRecue && !aReprendre
                ? 'm-0 text-[13px] text-muted-foreground'
                : 'm-0 rounded-md bg-attention px-3 py-2.5 text-sm'
            }
          >
            {consigne}
          </p>
        </>
      )}
    </div>
  );
}

/** La position que NTanova a reçue, sur une carte. */
export function PositionRecue({ fiche }: { fiche: FicheLocale }) {
  const recu = fiche.dejaRecu;
  if (!recu) return null;
  if (!recu.position) {
    return (
      <p className="m-0 text-[13px] text-muted-foreground">
        NTanova n'a pas reçu de position avec cette fiche.
      </p>
    );
  }
  return (
    <CartePosition
      position={recu.position}
      precisionM={recu.precisionM}
      legende={jour(recu.prisLe) ? `Position envoyée le ${jour(recu.prisLe)}` : 'Position envoyée'}
    />
  );
}

/**
 * La position qu'on vient de prendre, sur une carte, à la demande : la carte coûte une centaine de Ko de tuiles, le
 * relais est sur un réseau mobile.
 */
export function VoirSurLaCarte({
  position,
  precisionM,
  legende,
}: {
  position: Point;
  precisionM: number | null;
  legende: string;
}) {
  const [ouverte, setOuverte] = useState(false);
  return (
    <div className="flex flex-col gap-2.5">
      {ouverte && <CartePosition position={position} precisionM={precisionM} legende={legende} />}
      <button
        type="button"
        className={classeBouton({
          variant: 'ghost',
          size: 'sm',
          className: 'self-start text-primary',
        })}
        aria-expanded={ouverte}
        onClick={() => setOuverte((o) => !o)}
      >
        {ouverte ? 'Cacher la carte' : 'Voir sur la carte'}
      </button>
    </div>
  );
}
