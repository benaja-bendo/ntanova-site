import { v2 } from '@/ui/v2/classes';
import { useEffect, useState } from 'react';
import { jourDuCongo } from '../../modele/date-declaration';
import { libelleFonction } from '../../modele/libelles';
import { listes } from '../../modele/listes';
import { LONGUEUR_MAX_MOT, lireMotDirection, type MotDirection } from '../../modele/mot-direction';
import type { PortAdministration } from '../../modele/ports';
import { Dialogue } from '@/ui/v2/admin';
import { dateLongue } from '../../modele/pointe-noire';
import { Bandeau } from '@/ui/v2/formulaire';
import { messageErreur } from './ChampPosition';

/** Le mot de la direction (ticket 148) : une parole de l'école, telle qu'elle l'a remise, avec un accord daté, gardé en privé. */
export function MotDirectionEcole({
  ecoleId,
  nom,
  mot,
  confirmee,
  admin,
  surChangement,
  fermer,
  integre = false,
  surOccupation,
}: {
  ecoleId: string;
  nom: string;
  mot: MotDirection | null;
  confirmee: boolean;
  admin: PortAdministration;
  surChangement: (texte: string) => void;
  fermer: () => void;
  integre?: boolean;
  surOccupation?: (occupe: boolean) => void;
}) {
  const [texte, setTexte] = useState(mot?.texte ?? '');
  // 18/11 : le jour même par défaut (le mot se note le plus souvent le jour où il est remis), ou la date du mot déjà noté.
  const [ditLe, setDitLe] = useState(mot?.ditLe ?? jourDuCongo());
  const [fonction, setFonction] = useState('');
  const [canal, setCanal] = useState('');
  const [accord, setAccord] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    surOccupation?.(enCours);
    return () => surOccupation?.(false);
  }, [enCours, surOccupation]);

  const agir = async (retirer: boolean) => {
    const resultat = retirer
      ? { mot: null, erreur: null }
      : lireMotDirection({ texte, ditLe, fonction, canal, accord });
    if (resultat.erreur) {
      setErreur(resultat.erreur);
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await admin.enregistrerMotDirection(ecoleId, resultat.mot);
      if (retirer) setDitLe(jourDuCongo());
      setFonction('');
      setCanal('');
      setAccord(false);
      if (retirer) setTexte('');
      surChangement(
        `${retirer ? 'Mot de la direction retiré' : 'Mot de la direction enregistré'} pour ${nom}. Visible après la prochaine mise à jour du site.`,
      );
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Dialogue titre={`Mot de la direction de ${nom}`} fermer={fermer} integre={integre}>
      <form
        className={v2.motif}
        aria-label={`Mot de la direction de ${nom}`}
        onSubmit={(ev) => {
          ev.preventDefault();
          void agir(false);
        }}
      >
        <p className="m-0 text-[15px] text-muted-foreground">
          Le texte tel que la direction l’a remis, sans nom de personne. L’accord reste en privé.
        </p>
        {!confirmee && (
          <Bandeau ton="attente" icone="alerte">
            Cette fiche n’est pas confirmée par la direction : le mot ne paraîtra qu’une fois la
            fiche confirmée.
          </Bandeau>
        )}
        {mot && (
          <Bandeau ton="envoye" icone="coche">
            Mot enregistré, daté du {dateLongue(mot.ditLe)}.
          </Bandeau>
        )}
        <div className={v2.groupe}>
          <span className="flex items-baseline justify-between gap-3">
            <label htmlFor={`mot-${ecoleId}`} className="text-sm font-bold">
              Le mot
            </label>
            <span
              className={`text-sm ${texte.trim().length > LONGUEUR_MAX_MOT - 40 ? 'font-bold text-bonus' : 'text-muted-foreground'}`}
              aria-live="polite"
            >
              {texte.trim().length} / {LONGUEUR_MAX_MOT}
            </span>
          </span>
          <textarea
            id={`mot-${ecoleId}`}
            className={`${v2.zone} min-h-40`}
            rows={6}
            maxLength={LONGUEUR_MAX_MOT}
            placeholder="Colle ici le texte remis par la direction."
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
          />
        </div>
        <label className={v2.groupe}>
          Date du mot
          <input
            className={v2.champ}
            type="date"
            max={jourDuCongo()}
            value={ditLe}
            onChange={(e) => setDitLe(e.target.value)}
          />
        </label>
        <fieldset className="m-0 flex min-w-0 flex-col gap-4 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-bold">L’accord de la direction (privé)</legend>
          <label className={v2.groupe}>
            Fonction de la personne qui a donné son accord
            <select
              className={v2.champ}
              value={fonction}
              onChange={(e) => setFonction(e.target.value)}
            >
              <option value="">Choisir</option>
              {listes.fonction_direction.map((f) => (
                <option key={f} value={f}>
                  {libelleFonction[f]}
                </option>
              ))}
            </select>
          </label>
          <label className={v2.groupe}>
            Canal de l’accord
            <select className={v2.champ} value={canal} onChange={(e) => setCanal(e.target.value)}>
              <option value="">Choisir</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="appel">Appel</option>
              <option value="sur_place">Sur place</option>
              <option value="autre">Autre</option>
              <option value="fondateur">Au fondateur</option>
            </select>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
            <input
              type="checkbox"
              className="size-5 shrink-0 accent-primary"
              checked={accord}
              onChange={(e) => setAccord(e.target.checked)}
            />
            La direction accepte la publication de ce mot.
          </label>
        </fieldset>
        {erreur && (
          <Bandeau ton="erreur" icone="alerte">
            {erreur}
          </Bandeau>
        )}
        <div className={v2.actions}>
          <button className={v2.bouton} type="submit" disabled={enCours}>
            {enCours ? 'Enregistrement…' : 'Enregistrer le mot'}
          </button>
          {mot && (
            <button
              className={v2.boutonRefus}
              type="button"
              disabled={enCours}
              onClick={() => void agir(true)}
            >
              Retirer le mot
            </button>
          )}
        </div>
        <p className={v2.mention}>Visible après la prochaine mise à jour du site.</p>
      </form>
    </Dialogue>
  );
}
