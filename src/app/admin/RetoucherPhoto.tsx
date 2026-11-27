/**
 * Retoucher une photo du relais (ticket 236, 27/11), un seul petit outil, jusque-là fait par script : un carré (aperçu en
 * rond) enregistré comme logo ; des zones floutées ou un recadrage avant de publier, en couverture ou dans la galerie, avec
 * sa source, et la photo d'origine retirée du site. Les règles des images ne changent pas : contrôlée avant de paraître,
 * jamais un enfant ni une personne reconnaissable.
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { v2 } from '@/ui/v2/classes';
import { Bouton } from '@/ui/v2/admin';
import { Champ } from '@/ui/v2/formulaire';
import { placesLibres, type MediaAdmin } from '../../modele/fiche-admin';
import { libelleRolePhotoCourt, libelleSujetMedia } from '../../modele/libelles';
import { listes, type Valeur } from '../../modele/listes';
import type { PhotoVue, PortAdministration } from '../../modele/ports';
import {
  carreDuLogo,
  retraitDeLOriginal,
  sourceDeLaRetouche,
  zoneEntre,
  type Point2D,
  type Taille,
  type Zone,
} from '../../modele/retouche';
import { ImageIllisible, preparerImage } from '../commun/image';
import { messageErreur } from './ChampPosition';
import { flouter, imageRetouchee } from './rendu-retouche';

type Destination = 'logo' | 'cover' | 'gallery';

const libelleDestination: Record<Destination, string> = {
  logo: 'Le logo',
  cover: 'La couverture',
  gallery: 'La galerie',
};

/** La place d'un rectangle sur la photo affichée, en pourcentages. */
const place = (z: Zone, image: Taille) => ({
  left: `${(z.x / image.largeur) * 100}%`,
  top: `${(z.y / image.hauteur) * 100}%`,
  width: `${(z.largeur / image.largeur) * 100}%`,
  height: `${(z.hauteur / image.hauteur) * 100}%`,
});

export function RetoucherPhoto({
  photo,
  ecoleId,
  admin,
  medias,
  fermer,
  surChangement,
}: {
  photo: PhotoVue;
  ecoleId: string;
  admin: PortAdministration;
  medias: MediaAdmin[];
  fermer: () => void;
  surChangement: (texte: string) => Promise<void>;
}) {
  const libres = placesLibres(medias);
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [destination, setDestination] = useState<Destination>(libres.cover ? 'cover' : 'gallery');
  const [outil, setOutil] = useState<'flouter' | 'recadrer'>('flouter');
  const [zones, setZones] = useState<Zone[]>([]);
  const [cadre, setCadre] = useState<Zone | null>(null);
  const [logo, setLogo] = useState({ taille: 60, x: 50, y: 50 });
  const [trace, setTrace] = useState<{ depart: Point2D; fin: Point2D } | null>(null);
  const [sujet, setSujet] = useState<Valeur<'media_subject'>>(
    photo.role === 'building' ? 'batiment' : 'enseigne',
  );
  const [legende, setLegende] = useState('');
  const [controle, setControle] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const apercu = useRef<HTMLCanvasElement>(null);
  const rond = useRef<HTMLCanvasElement>(null);
  const estUnLogo = destination === 'logo';

  useEffect(() => {
    let vivant = true;
    // Sans cache : la vignette a pu charger la même adresse sans les en-têtes que la lecture des pixels demande.
    fetch(photo.adresse ?? '', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.blob();
      })
      .then((b) => createImageBitmap(b))
      .then((b) => vivant && setImage(b))
      .catch(() => vivant && setErreur('La photo ne se charge pas : réessaie.'));
    return () => {
      vivant = false;
    };
  }, [photo.adresse]);

  // L'aperçu montre le résultat : les zones floutées, comme dans la version publiée.
  useEffect(() => {
    const toile = apercu.current;
    const contexte = toile?.getContext('2d');
    if (!toile || !contexte || !image) return;
    toile.width = image.width;
    toile.height = image.height;
    contexte.drawImage(image, 0, 0);
    if (!estUnLogo) flouter(contexte, zones);
  }, [image, zones, estUnLogo]);
  useEffect(() => {
    const toile = rond.current;
    const contexte = toile?.getContext('2d');
    if (!toile || !contexte || !image) return;
    const c = carreDuLogo({ largeur: image.width, hauteur: image.height }, logo);
    toile.width = toile.height = 240;
    contexte.drawImage(image, c.x, c.y, c.largeur, c.hauteur, 0, 0, 240, 240);
  }, [image, logo, estUnLogo]);

  const taille = image ? { largeur: image.width, hauteur: image.height } : null;
  const point = (ev: PointerEvent<HTMLDivElement>): Point2D => {
    const r = ev.currentTarget.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * (taille?.largeur ?? 0),
      y: ((ev.clientY - r.top) / r.height) * (taille?.hauteur ?? 0),
    };
  };
  const enTrace = trace && taille ? zoneEntre(trace.depart, trace.fin, taille) : null;

  const enregistrer = async () => {
    if (!image || !taille) return;
    if (!estUnLogo && zones.length === 0 && !cadre)
      return setErreur(
        'Floute une zone ou recadre d’abord : telle quelle, la photo se choisit dans « Photo publique ».',
      );
    const sansElle = medias.filter((m) => m.photoDuReleve !== photo.id);
    const versLaGalerie =
      destination === 'gallery' ||
      (destination === 'cover' && sansElle.some((m) => m.genre === 'cover'));
    if (versLaGalerie && !placesLibres(sansElle).gallery)
      return setErreur('La galerie est pleine : retires-en une image d’abord.');
    setErreur(null);
    setEnCours(true);
    try {
      const prete = await preparerImage(
        await imageRetouchee(image, {
          zones: estUnLogo ? [] : zones,
          cadre: estUnLogo ? carreDuLogo(taille, logo) : cadre,
        }),
      );
      // L'original quitte le site avant que la nouvelle image n'entre : un envoi qui échoue ne le laisse pas en ligne.
      if (!estUnLogo) {
        const retrait = retraitDeLOriginal(photo, await admin.etatPhotoPublique(ecoleId));
        if (retrait.ecrireLeRetrait) await admin.choisirPhotoPublique(ecoleId, null, false);
        if (retrait.retirerLeControle) await admin.marquerPhotoPubliable(photo.id, false);
        for (const m of await admin.mediasDeLEcole(ecoleId))
          if (m.photoDuReleve === photo.id && m.genre !== 'document')
            await admin.retirerMedia(m.id);
      }
      // Une couverture déjà là passe dans la galerie : la nouvelle y entre, puis prend sa place.
      const remplace =
        destination === 'cover' &&
        (await admin.mediasDeLEcole(ecoleId)).some((m) => m.genre === 'cover');
      const id = await admin.ajouterMedia(ecoleId, {
        genre: remplace ? 'gallery' : destination,
        sujet: estUnLogo ? 'logo' : sujet,
        legende: estUnLogo ? null : legende.trim() || null,
        controle,
        publique: controle,
        image: prete,
        origine: sourceDeLaRetouche(destination, photo.prisLe, {
          floutee: zones.length > 0,
          recadree: cadre !== null,
        }),
      });
      if (remplace) await admin.mettreEnCouverture(id);
      const etat = controle ? 'publique à la prochaine mise à jour du site' : 'pas encore publique';
      await surChangement(
        estUnLogo
          ? `Logo enregistré, ${etat}.`
          : `Version retouchée enregistrée, ${etat}. La photo d’origine ne paraîtra plus.`,
      );
      fermer();
    } catch (e) {
      setErreur(e instanceof ImageIllisible ? e.message : messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  const reglage = (cle: 'taille' | 'x' | 'y', libelle: string, min: number) => (
    <label className="flex flex-col gap-1 text-sm font-bold">
      {libelle}
      <input
        type="range"
        min={min}
        max={100}
        value={logo[cle]}
        onChange={(ev) => setLogo((l) => ({ ...l, [cle]: Number(ev.target.value) }))}
        className="h-11 w-full accent-primary"
      />
    </label>
  );

  return (
    <form
      className={v2.motifPile}
      aria-label="Retoucher une photo du relais"
      onSubmit={(ev) => {
        ev.preventDefault();
        void enregistrer();
      }}
    >
      <h3>Retoucher la photo · {libelleRolePhotoCourt[photo.role]}</h3>
      <div className="flex flex-wrap gap-2" role="group" aria-label="En faire">
        {(['cover', 'gallery', 'logo'] as const).map((d) => (
          <button
            key={d}
            type="button"
            className={v2.puceCarree}
            aria-pressed={destination === d}
            disabled={d === 'logo' && !libres.logo}
            onClick={() => {
              setDestination(d);
              setTrace(null);
            }}
          >
            {libelleDestination[d]}
          </button>
        ))}
      </div>
      {!libres.logo && (
        <p className={cn(v2.mention, 'm-0')}>
          L’école a déjà un logo : retire-le pour en faire un autre.
        </p>
      )}
      {!estUnLogo && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="L’outil">
            <button
              type="button"
              className={v2.puceCarree}
              aria-pressed={outil === 'flouter'}
              onClick={() => setOutil('flouter')}
            >
              Flouter une zone
            </button>
            <button
              type="button"
              className={v2.puceCarree}
              aria-pressed={outil === 'recadrer'}
              onClick={() => setOutil('recadrer')}
            >
              Recadrer
            </button>
          </div>
          <p className={cn(v2.mention, 'm-0')}>
            Trace un rectangle sur la photo.{' '}
            {zones.length > 0 &&
              `${zones.length} zone${zones.length > 1 ? 's' : ''} floutée${zones.length > 1 ? 's' : ''}. `}
            {cadre ? 'Photo recadrée.' : ''}
          </p>
        </>
      )}
      {!image && !erreur && <p role="status">Chargement de la photo…</p>}
      {/* La photo et ce qu'on y désigne : les rectangles se placent en pourcentages, la photo suit la largeur. */}
      <div
        className={cn(
          'relative overflow-hidden rounded-md select-none',
          !estUnLogo && 'cursor-crosshair touch-none',
          !image && 'hidden',
        )}
        data-testid="retouche"
        onPointerDown={(ev) => {
          if (estUnLogo || !image) return;
          ev.currentTarget.setPointerCapture(ev.pointerId);
          const p = point(ev);
          setTrace({ depart: p, fin: p });
        }}
        onPointerMove={(ev) => {
          if (trace) setTrace({ depart: trace.depart, fin: point(ev) });
        }}
        onPointerUp={(ev) => {
          if (!trace || !taille) return;
          const zone = zoneEntre(trace.depart, point(ev), taille);
          setTrace(null);
          if (!zone) return;
          if (outil === 'flouter') setZones((z) => [...z, zone]);
          else setCadre(zone);
        }}
        onPointerCancel={() => setTrace(null)}
      >
        <canvas
          ref={apercu}
          className="block h-auto w-full"
          role="img"
          aria-label="Aperçu de la photo à retoucher"
        />
        {taille && estUnLogo && (
          <span
            className="pointer-events-none absolute rounded-sm ring-[9999px] ring-foreground/55"
            style={place(carreDuLogo(taille, logo), taille)}
          >
            <span className="block size-full rounded-full border-2 border-dashed border-card" />
          </span>
        )}
        {taille && !estUnLogo && cadre && (
          <span
            className="pointer-events-none absolute border-2 border-card ring-[9999px] ring-foreground/55"
            style={place(cadre, taille)}
          />
        )}
        {taille && enTrace && (
          <span
            className="pointer-events-none absolute border-2 border-dashed border-primary bg-card/30"
            style={place(enTrace, taille)}
          />
        )}
      </div>
      {estUnLogo ? (
        <div className="flex flex-wrap items-center gap-4">
          <canvas
            ref={rond}
            className="size-24 shrink-0 rounded-full border border-border"
            role="img"
            aria-label="Aperçu du logo dans son rond"
          />
          <div className="flex min-w-[12rem] flex-1 flex-col">
            {reglage('taille', 'Taille du carré', 10)}
            {reglage('x', 'De gauche à droite', 0)}
            {reglage('y', 'De haut en bas', 0)}
          </div>
        </div>
      ) : (
        (zones.length > 0 || cadre) && (
          <div className="flex flex-wrap gap-x-4">
            {zones.length > 0 && (
              <button
                type="button"
                className={v2.lien}
                onClick={() => setZones((z) => z.slice(0, -1))}
              >
                Retirer la dernière zone floutée
              </button>
            )}
            {cadre && (
              <button type="button" className={v2.lien} onClick={() => setCadre(null)}>
                Annuler le recadrage
              </button>
            )}
          </div>
        )
      )}
      {!estUnLogo && (
        <>
          <Champ libelle="Elle montre">
            {(a) => (
              <select
                {...a}
                className={v2.champ}
                value={sujet}
                onChange={(ev) => setSujet(ev.target.value as Valeur<'media_subject'>)}
              >
                {listes.media_subject
                  .filter((x) => x !== 'logo')
                  .map((x) => (
                    <option key={x} value={x}>
                      {libelleSujetMedia[x]}
                    </option>
                  ))}
              </select>
            )}
          </Champ>
          <Champ libelle="Légende" facultatif>
            {(a) => (
              <input
                {...a}
                className={v2.champ}
                maxLength={60}
                value={legende}
                onChange={(ev) => setLegende(ev.target.value)}
              />
            )}
          </Champ>
        </>
      )}
      <label className={v2.case}>
        <input
          type="checkbox"
          checked={controle}
          onChange={(ev) => setControle(ev.target.checked)}
        />
        Sans enfant ni personne reconnaissable, rien à cacher de lisible : la publier
      </label>
      {!estUnLogo && (
        <p className={cn(v2.mention, 'm-0')}>
          La photo d’origine ne paraîtra plus sur le site ; elle reste chez NTanova, privée. La
          version publiée ne garde rien de ce qui est flouté.
        </p>
      )}
      {erreur && (
        <p className={v2.erreurLarge} role="alert">
          {erreur}
        </p>
      )}
      <div className={v2.actionsLarge}>
        <Bouton type="submit" enCours={enCours} texteEnCours="Envoi…" disabled={!image || enCours}>
          {estUnLogo ? 'Enregistrer le logo' : 'Enregistrer la version retouchée'}
        </Bouton>
        <button type="button" className={v2.boutonSecondaire} disabled={enCours} onClick={fermer}>
          Annuler
        </button>
      </div>
    </form>
  );
}
