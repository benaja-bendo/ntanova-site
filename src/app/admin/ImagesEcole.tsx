import { v2 } from '@/ui/v2/classes';
import { useCallback, useEffect, useState } from 'react';
import { placesLibres, type MediaAdmin } from '../../modele/fiche-admin';
import { libelleSujetMedia } from '../../modele/libelles';
import { listes, type Valeur } from '../../modele/listes';
import type { PortAdministration } from '../../modele/ports';
import { Bouton } from '@/ui/v2/admin';
import { Champ } from '@/ui/v2/formulaire';
import { ImageIllisible, preparerImage } from '../commun/image';
import { messageErreur } from './ChampPosition';

const GENRES: { valeur: Valeur<'media_kind'>; libelle: string }[] = [
  { valeur: 'logo', libelle: 'Logo' },
  { valeur: 'cover', libelle: 'Couverture' },
  { valeur: 'gallery', libelle: 'Galerie' },
  // Ticket 205 (A6) : un prospectus ou un document reçu (tarifs), gardé comme preuve ; la base refuse de le publier.
  { valeur: 'document', libelle: 'Prospectus ou document (jamais public)' },
];

/**
 * Les images d'une école (lot D du ticket 165) : son logo (commun à tous ses sites), la couverture du site, douze images de
 * galerie. Un fichier est réduit dans le navigateur avant l'envoi (« Préparation… ») ; une image n'est publique qu'après la
 * case « Sans enfant ni personne reconnaissable ». Un prospectus entre ici comme document (ticket 205), jamais public : la base
 * refuse de le publier.
 */
/** La place que prend une nouvelle image : celle demandée si elle est libre, sinon la galerie, sinon la première libre. */
function placeDuFormulaire(
  libres: Record<Valeur<'media_kind'>, boolean>,
  voulu?: Valeur<'media_kind'> | null,
): Valeur<'media_kind'> {
  if (voulu) return voulu;
  if (libres.gallery) return 'gallery';
  return GENRES.find((g) => libres[g.valeur])?.valeur ?? 'gallery';
}

export function ImagesEcole({
  ecoleId,
  admin,
  surChangement,
  genreVoulu = null,
}: {
  ecoleId: string;
  admin: PortAdministration;
  surChangement: (texte: string) => void;
  /** 17/11 : « Changer la couverture » ouvre sur Couverture, « Ajouter le logo » sur Logo. */
  genreVoulu?: Valeur<'media_kind'> | null;
}) {
  const [medias, setMedias] = useState<MediaAdmin[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [etape, setEtape] = useState<'repos' | 'preparation' | 'envoi'>('repos');
  const [genre, setGenre] = useState<Valeur<'media_kind'>>(genreVoulu ?? 'gallery');
  const [sujet, setSujet] = useState<Valeur<'media_subject'>>(
    genreVoulu === 'cover' ? 'batiment' : 'cour',
  );
  // 17/11 : plusieurs fichiers d'un coup dans la galerie, chacun sa légende.
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [legendes, setLegendes] = useState<string[]>([]);
  const [controle, setControle] = useState(false);
  // Ticket 205 (A34) : d'où vient l'image (un lien, la page Facebook…), privé.
  const [source, setSource] = useState('');
  // Le champ « Le fichier » se vide en renaissant (un champ de fichier ne se vide pas par sa valeur).
  const [champFichier, setChampFichier] = useState(0);
  const lire = useCallback(() => admin.mediasDeLEcole(ecoleId), [admin, ecoleId]);
  useEffect(() => {
    let vivant = true;
    void lire()
      .then((m) => {
        if (!vivant) return;
        setMedias(m);
        if (!genreVoulu) setGenre(placeDuFormulaire(placesLibres(m)));
      })
      .catch((e: unknown) => vivant && setErreur(messageErreur(e)));
    return () => {
      vivant = false;
    };
  }, [lire, genreVoulu]);

  if (medias === null)
    return erreur ? <p className={v2.erreur}>{erreur}</p> : <p aria-busy="true">Chargement…</p>;
  const libres = placesLibres(medias);
  const relire = async (texte: string) => {
    setMedias(await lire());
    surChangement(texte);
  };
  const agir = async (action: () => Promise<unknown>, texte: string) => {
    setErreur(null);
    try {
      await action();
      await relire(texte);
    } catch (e) {
      setErreur(messageErreur(e));
    }
  };
  const plusieurs = genre === 'gallery';
  const choisir = (liste: File[]) => {
    const gardes = plusieurs ? liste : liste.slice(0, 1);
    setFichiers(gardes);
    setLegendes(gardes.map(() => ''));
  };
  const placesGalerie = 12 - medias.filter((m) => m.genre === 'gallery').length;
  const ajouter = async () => {
    if (fichiers.length === 0) return setErreur('Choisis une image.');
    if (!libres[genre])
      return setErreur(
        genre === 'logo'
          ? 'Cette école a déjà un logo : retire-le d’abord.'
          : genre === 'cover'
            ? 'Ce site a déjà une couverture : retire-la d’abord.'
            : 'Douze images au plus dans la galerie : retires-en une d’abord.',
      );
    if (genre === 'gallery' && fichiers.length > placesGalerie)
      return setErreur(
        `La galerie n’a plus que ${placesGalerie} place${placesGalerie > 1 ? 's' : ''} : choisis moins d’images.`,
      );
    setErreur(null);
    let envoyees = 0;
    try {
      for (const [i, f] of fichiers.entries()) {
        setEtape('preparation');
        const image = await preparerImage(f);
        setEtape('envoi');
        const document = genre === 'document';
        await admin.ajouterMedia(ecoleId, {
          genre,
          sujet: genre === 'logo' ? 'logo' : document ? 'prospectus' : sujet,
          legende: legendes[i]?.trim() || null,
          controle: !document && controle,
          publique: !document && controle,
          image,
          origine: source.trim() || null,
        });
        envoyees += 1;
      }
      const n = envoyees;
      const texte =
        genre === 'document'
          ? 'Document ajouté. Il reste privé.'
          : n > 1
            ? `${n} images ajoutées${controle ? ' et publiées' : ', pas encore publiques'}.`
            : controle
              ? 'Image ajoutée et publiée.'
              : 'Image ajoutée, pas encore publique.';
      // Tout se vide ; la liste quitte une place désormais prise.
      setFichiers([]);
      setLegendes([]);
      setControle(false);
      setSource('');
      setChampFichier((c) => c + 1);
      const m = await lire();
      setMedias(m);
      setGenre(placeDuFormulaire(placesLibres(m)));
      surChangement(texte);
    } catch (e) {
      // Les fichiers pas encore partis restent choisis : on réessaie sans les reprendre.
      if (envoyees > 0) {
        setFichiers(fichiers.slice(envoyees));
        setLegendes(legendes.slice(envoyees));
        setMedias(await lire().catch(() => medias));
      }
      const raison = e instanceof ImageIllisible ? e.message : messageErreur(e);
      setErreur(
        envoyees > 0 ? `${envoyees} envoyée${envoyees > 1 ? 's' : ''}, puis : ${raison}` : raison,
      );
    } finally {
      setEtape('repos');
    }
  };

  return (
    <section className={v2.pileSerree} aria-label="Images de l’école">
      {GENRES.map(({ valeur, libelle }) => {
        const liste = medias.filter((m) => m.genre === valeur);
        return (
          <div key={valeur} className={v2.pileSerree}>
            <h3>
              {valeur === 'document' ? 'Documents, jamais publics' : libelle}
              {valeur === 'gallery' && <span className={v2.mention}> · {liste.length} sur 12</span>}
            </h3>
            {liste.length === 0 ? (
              <p className={v2.mention}>
                {valeur === 'logo'
                  ? 'Pas de logo : la page montre le sigle, ou la lettre du cycle.'
                  : valeur === 'cover'
                    ? 'Pas de couverture : la page montre la bannière dessinée.'
                    : valeur === 'document'
                      ? 'Aucun document.'
                      : 'Pas d’image dans la galerie : la rubrique « Photos » n’existe pas sur la page.'}
              </p>
            ) : (
              <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 [&_img]:aspect-[4/3] [&_img]:w-full [&_img]:rounded-md [&_img]:object-cover">
                {liste.map((m) => (
                  <li key={m.id}>
                    {m.adresse && (
                      <img src={m.adresse} alt={m.legende ?? libelleSujetMedia[m.sujet]} />
                    )}
                    <span>
                      <b>{m.legende ?? libelleSujetMedia[m.sujet]}</b>
                      <span className={v2.mentionBloc}>
                        {m.genre === 'document'
                          ? 'Jamais publique'
                          : m.publique
                            ? 'Publique'
                            : m.controleLe
                              ? 'Contrôlée, pas publique'
                              : 'À contrôler'}
                      </span>
                      {m.origine && <span className={v2.mentionBloc}>Vient de : {m.origine}</span>}
                    </span>
                    <span className={v2.actions}>
                      {/* Ticket 205 (A32) : l'ancienne couverture prend sa place dans la galerie. */}
                      {m.genre === 'gallery' && (
                        <button
                          type="button"
                          className={v2.lien}
                          onClick={() =>
                            void agir(
                              () => admin.mettreEnCouverture(m.id),
                              'Image mise en couverture ; l’ancienne est dans la galerie.',
                            )
                          }
                        >
                          En couverture
                        </button>
                      )}
                      {m.genre !== 'document' && !m.controleLe && (
                        <button
                          type="button"
                          className={v2.lien}
                          onClick={() =>
                            void agir(
                              () => admin.modifierMedia(m.id, { controle: true, publique: true }),
                              'Image contrôlée et publiée.',
                            )
                          }
                        >
                          Sans enfant : publier
                        </button>
                      )}
                      {m.genre !== 'document' && m.controleLe && (
                        <button
                          type="button"
                          className={v2.lien}
                          onClick={() =>
                            void agir(
                              () => admin.modifierMedia(m.id, { publique: !m.publique }),
                              m.publique ? 'Image retirée de la page.' : 'Image publiée.',
                            )
                          }
                        >
                          {m.publique ? 'Ne plus publier' : 'Publier'}
                        </button>
                      )}
                      <button
                        type="button"
                        className={v2.lienDanger}
                        onClick={() => void agir(() => admin.retirerMedia(m.id), 'Image retirée.')}
                      >
                        Retirer
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      <form
        className={v2.motifPile}
        aria-label="Ajouter une image"
        onSubmit={(ev) => {
          ev.preventDefault();
          void ajouter();
        }}
      >
        <h3>Ajouter une image</h3>
        <Champ libelle="C’est">
          {(a) => (
            <select
              {...a}
              className={v2.champ}
              value={genre}
              onChange={(ev) => {
                const g = ev.target.value as Valeur<'media_kind'>;
                setGenre(g);
                if (g !== 'gallery' && fichiers.length > 1) {
                  setFichiers(fichiers.slice(0, 1));
                  setLegendes(legendes.slice(0, 1));
                }
              }}
            >
              {GENRES.map((g) => (
                <option key={g.valeur} value={g.valeur} disabled={!libres[g.valeur]}>
                  {g.libelle}
                  {!libres[g.valeur] ? ' (déjà là)' : ''}
                </option>
              ))}
            </select>
          )}
        </Champ>
        {genre !== 'logo' && genre !== 'document' && (
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
        )}
        <Champ
          libelle="Le fichier"
          aide={
            plusieurs
              ? 'JPEG, PNG ou WebP ; plusieurs d’un coup si tu veux. Chacun est réduit avant l’envoi.'
              : 'JPEG, PNG ou WebP ; il est réduit avant l’envoi.'
          }
        >
          {(a) => (
            <input
              {...a}
              key={champFichier}
              className={v2.champ}
              type="file"
              multiple={plusieurs}
              accept="image/jpeg,image/png,image/webp"
              onChange={(ev) => choisir([...(ev.target.files ?? [])])}
            />
          )}
        </Champ>
        {fichiers.length > 1 ? (
          fichiers.map((f, i) => (
            <Champ key={`${f.name}-${i}`} libelle={`Légende de ${f.name}`} facultatif>
              {(a) => (
                <input
                  {...a}
                  className={v2.champ}
                  maxLength={60}
                  value={legendes[i] ?? ''}
                  onChange={(ev) =>
                    setLegendes(legendes.map((l, j) => (j === i ? ev.target.value : l)))
                  }
                />
              )}
            </Champ>
          ))
        ) : (
          <Champ libelle="Légende" facultatif>
            {(a) => (
              <input
                {...a}
                className={v2.champ}
                maxLength={60}
                value={legendes[0] ?? ''}
                onChange={(ev) => setLegendes([ev.target.value])}
              />
            )}
          </Champ>
        )}
        <Champ libelle="D’où vient l’image ?" facultatif>
          {(a) => (
            <input
              {...a}
              className={v2.champ}
              maxLength={300}
              value={source}
              onChange={(ev) => setSource(ev.target.value)}
            />
          )}
        </Champ>
        {genre !== 'document' && (
          <label className={v2.case}>
            <input
              type="checkbox"
              checked={controle}
              onChange={(ev) => setControle(ev.target.checked)}
            />
            {fichiers.length > 1
              ? 'Sans enfant ni personne reconnaissable, sur aucune : les publier'
              : 'Sans enfant ni personne reconnaissable : la publier'}
          </label>
        )}
        <Bouton
          type="submit"
          enCours={etape !== 'repos'}
          texteEnCours={etape === 'preparation' ? 'Préparation…' : 'Envoi…'}
        >
          {fichiers.length > 1 ? `Ajouter les ${fichiers.length} images` : 'Ajouter l’image'}
        </Bouton>
        <p className={v2.mention}>Visible à la prochaine mise à jour du site.</p>
      </form>
      {erreur && (
        <p className={v2.erreur} role="alert">
          {erreur}
        </p>
      )}
    </section>
  );
}
