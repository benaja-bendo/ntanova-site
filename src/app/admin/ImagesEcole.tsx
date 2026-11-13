import { useCallback, useEffect, useState } from 'react';
import { placesLibres, type MediaAdmin } from '../../modele/fiche-admin';
import { libelleSujetMedia } from '../../modele/libelles';
import { listes, type Valeur } from '../../modele/listes';
import type { PortAdministration } from '../../modele/ports';
import { Bouton } from '../../ui/actions';
import { Champ } from '../../ui/composants';
import { ImageIllisible, preparerImage } from '../commun/image';
import { messageErreur } from './ChampPosition';

const GENRES: { valeur: Valeur<'media_kind'>; libelle: string }[] = [
  { valeur: 'logo', libelle: 'Logo' },
  { valeur: 'cover', libelle: 'Couverture' },
  { valeur: 'gallery', libelle: 'Galerie' },
];

/**
 * Les images d'une école (lot D du ticket 165) : son logo (commun à tous ses sites), la couverture du site, douze images de
 * galerie. Un fichier est réduit dans le navigateur avant l'envoi (« Préparation… ») ; une image n'est publique qu'après la
 * case « Sans enfant ni personne reconnaissable ». Le prospectus et les programmes n'entrent jamais ici (la base le refuse).
 */
export function ImagesEcole({
  ecoleId,
  admin,
  surChangement,
}: {
  ecoleId: string;
  admin: PortAdministration;
  surChangement: (texte: string) => void;
}) {
  const [medias, setMedias] = useState<MediaAdmin[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [etape, setEtape] = useState<'repos' | 'preparation' | 'envoi'>('repos');
  const [genre, setGenre] = useState<Valeur<'media_kind'>>('gallery');
  const [sujet, setSujet] = useState<Valeur<'media_subject'>>('cour');
  const [legende, setLegende] = useState('');
  const [controle, setControle] = useState(false);
  const [fichier, setFichier] = useState<File | null>(null);
  const lire = useCallback(() => admin.mediasDeLEcole(ecoleId), [admin, ecoleId]);
  useEffect(() => {
    let vivant = true;
    void lire()
      .then((m) => vivant && setMedias(m))
      .catch((e: unknown) => vivant && setErreur(messageErreur(e)));
    return () => {
      vivant = false;
    };
  }, [lire]);

  if (medias === null)
    return erreur ? (
      <p className="message-erreur">{erreur}</p>
    ) : (
      <p aria-busy="true">Chargement…</p>
    );
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
  const ajouter = async () => {
    if (!fichier) return setErreur('Choisis une image.');
    if (!libres[genre])
      return setErreur(
        genre === 'logo'
          ? 'Cette école a déjà un logo : retire-le d’abord.'
          : genre === 'cover'
            ? 'Ce site a déjà une couverture : retire-la d’abord.'
            : 'Douze images au plus dans la galerie : retires-en une d’abord.',
      );
    setErreur(null);
    setEtape('preparation');
    try {
      const image = await preparerImage(fichier);
      setEtape('envoi');
      await admin.ajouterMedia(ecoleId, {
        genre,
        sujet: genre === 'logo' ? 'logo' : sujet,
        legende: legende.trim() || null,
        controle,
        publique: controle,
        image,
      });
      setFichier(null);
      setLegende('');
      setControle(false);
      await relire(controle ? 'Image ajoutée et publiée.' : 'Image ajoutée, pas encore publique.');
    } catch (e) {
      // Le fichier reste choisi : on réessaie sans le reprendre.
      setErreur(e instanceof ImageIllisible ? e.message : messageErreur(e));
    } finally {
      setEtape('repos');
    }
  };

  return (
    <section className="pile-serree" aria-label="Images de l’école">
      {GENRES.map(({ valeur, libelle }) => {
        const liste = medias.filter((m) => m.genre === valeur);
        return (
          <div key={valeur} className="pile-serree">
            <h3>
              {libelle}
              {valeur === 'gallery' && <span className="mention"> · {liste.length} sur 12</span>}
            </h3>
            {liste.length === 0 ? (
              <p className="mention">
                {valeur === 'logo'
                  ? 'Pas de logo : la page montre le sigle, ou la lettre du cycle.'
                  : valeur === 'cover'
                    ? 'Pas de couverture : la page montre la bannière dessinée.'
                    : 'Pas d’image dans la galerie : la rubrique « Photos » n’existe pas sur la page.'}
              </p>
            ) : (
              <ul className="admin-medias">
                {liste.map((m) => (
                  <li key={m.id}>
                    {m.adresse && (
                      <img src={m.adresse} alt={m.legende ?? libelleSujetMedia[m.sujet]} />
                    )}
                    <span>
                      <b>{m.legende ?? libelleSujetMedia[m.sujet]}</b>
                      <span className="mention admin-sous-ligne">
                        {m.publique
                          ? 'Publique'
                          : m.controleLe
                            ? 'Contrôlée, pas publique'
                            : 'À contrôler'}
                      </span>
                    </span>
                    <span className="admin-actions">
                      {!m.controleLe && (
                        <button
                          type="button"
                          className="lien"
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
                      {m.controleLe && (
                        <button
                          type="button"
                          className="lien"
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
                        className="lien lien-danger"
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
        className="admin-motif pile-serree"
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
              className="champ"
              value={genre}
              onChange={(ev) => setGenre(ev.target.value as Valeur<'media_kind'>)}
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
        {genre !== 'logo' && (
          <Champ libelle="Elle montre">
            {(a) => (
              <select
                {...a}
                className="champ"
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
        <Champ libelle="Le fichier" aide="JPEG, PNG ou WebP ; il est réduit avant l’envoi.">
          {(a) => (
            <input
              {...a}
              className="champ"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(ev) => setFichier(ev.target.files?.[0] ?? null)}
            />
          )}
        </Champ>
        <Champ libelle="Légende" facultatif>
          {(a) => (
            <input
              {...a}
              className="champ"
              maxLength={60}
              value={legende}
              onChange={(ev) => setLegende(ev.target.value)}
            />
          )}
        </Champ>
        <label className="case">
          <input
            type="checkbox"
            checked={controle}
            onChange={(ev) => setControle(ev.target.checked)}
          />
          Sans enfant ni personne reconnaissable : la publier
        </label>
        <Bouton
          type="submit"
          enCours={etape !== 'repos'}
          texteEnCours={etape === 'preparation' ? 'Préparation…' : 'Envoi…'}
        >
          Ajouter l’image
        </Bouton>
        <p className="mention">Visible à la prochaine mise à jour du site.</p>
      </form>
      {erreur && (
        <p className="message-erreur" role="alert">
          {erreur}
        </p>
      )}
    </section>
  );
}
