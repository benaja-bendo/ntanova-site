/**
 * « Frais par classe » (planche « Frais, avec le prospectus ») : on recopie ce que dit le prospectus, ligne par ligne. À
 * gauche, le prospectus photographié par un relais (photo de travail, jamais publique) ; à droite, l'année scolaire, la
 * date de déclaration et le tableau des lignes (cycle, classe, montant, période, inscription, « Illisible ? »). Une ligne
 * illisible n'est jamais publiée : « Demander … » l'ajoute à ce qui manque, demandée à l'école. Tailwind et shadcn seulement.
 */
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { v2 } from '@/ui/v2/classes';
import { Bouton } from '@/ui/v2/admin';
import { Bandeau } from '@/ui/v2/formulaire';
import { IconeAjouter, IconeCadenas, IconeFermer, IconeMoins } from '@/ui/shadcn/icones';
import { jourDuCongo } from '../../modele/date-declaration';
import {
  inscriptionLaPlusFrequente,
  lireFraisEcole,
  periodesFrais,
  type FraisEcole as Frais,
} from '../../modele/frais-ecole';
import { libelleNiveau } from '../../modele/libelles';
import type { Valeur } from '../../modele/listes';
import type { PhotoVue, PortAdministration } from '../../modele/ports';
import { jour } from '../../ui/composants';
import { messageErreur } from './ChampPosition';

/** Une ligne du tableau, telle qu'on la tape. `id` : la ligne enregistrée qu'elle modifie. */
interface Ligne {
  cle: string;
  id: string | null;
  cycle: string;
  classe: string;
  montant: string;
  periode: string;
  inscription: string;
  illisible: boolean;
}

const montantEnTexte = (f: Frais) =>
  f.minimum === f.maximum ? String(f.minimum) : `${f.minimum}-${f.maximum}`;

/** « 15000 » ou « 15000-20000 » (une fourchette), espaces permis. */
function lireMontantOuFourchette(t: string): { minimum: string; maximum: string } {
  const [a = '', b = ''] = t.split(/\s*[-–à]\s*/);
  return { minimum: a, maximum: b || a };
}

let suivante = 0;
const nouvelle = (cycle = ''): Ligne => ({
  cle: `n${suivante++}`,
  id: null,
  cycle,
  classe: '',
  montant: '',
  periode: 'mois',
  inscription: '',
  illisible: false,
});

export function FraisEcole({
  ecoleId,
  nom,
  cycles,
  frais,
  admin,
  fermer,
  surOccupation,
  surChangement,
}: {
  ecoleId: string;
  nom: string;
  cycles: Valeur<'niveau'>[];
  frais: Frais[];
  admin: PortAdministration;
  fermer: () => void;
  /** Toujours dans la fiche depuis la refonte v2 ; gardé pour les appels d'avant. */
  integre?: boolean;
  surOccupation?: (occupe: boolean) => void;
  surChangement: (texte: string) => void;
}) {
  const [lignes, setLignes] = useState<Ligne[]>(() =>
    frais.length > 0
      ? frais.map((f) => ({
          cle: f.id,
          id: f.id,
          cycle: f.cycle,
          classe: f.classe ?? '',
          montant: montantEnTexte(f),
          periode: f.periode,
          inscription: f.inscription === null ? '' : String(f.inscription),
          illisible: false,
        }))
      : [nouvelle(cycles[0] ?? '')],
  );
  const [retirees, setRetirees] = useState<string[]>([]);
  const [annee, setAnnee] = useState(frais[0]?.anneeScolaire ?? '');
  const [declaresLe, setDeclaresLe] = useState(frais[0]?.declaresLe ?? jourDuCongo());
  const [note, setNote] = useState(frais[0]?.note ?? '');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [prospectus, setProspectus] = useState<PhotoVue[] | null>(null);
  const [vue, setVue] = useState(0);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    surOccupation?.(enCours);
    return () => surOccupation?.(false);
  }, [enCours, surOccupation]);
  useEffect(() => {
    let vivant = true;
    void admin
      .photosDeTravail(ecoleId)
      .then((p) => vivant && setProspectus(p.filter((x) => x.role === 'brochure')))
      .catch(() => vivant && setProspectus([]));
    return () => {
      vivant = false;
    };
  }, [admin, ecoleId]);
  const photo = prospectus?.[vue] ?? null;

  const changer = (cle: string, champs: Partial<Ligne>) =>
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...champs } : l)));
  const retirer = (l: Ligne) => {
    setLignes((ls) => ls.filter((x) => x.cle !== l.cle));
    if (l.id) setRetirees((r) => [...r, l.id!]);
  };
  const publiables = lignes.filter((l) => !l.illisible);
  const illisibles = lignes.filter((l) => l.illisible);
  const nomDeLigne = (l: Ligne) =>
    l.classe.trim() || (l.cycle ? libelleNiveau[l.cycle as Valeur<'niveau'>] : 'cette ligne');

  const enregistrer = async () => {
    setErreur(null);
    const saisies = publiables.map((l) => {
      const { minimum, maximum } = lireMontantOuFourchette(l.montant);
      return {
        l,
        lu: lireFraisEcole({
          cycle: l.cycle,
          classe: l.classe,
          minimum,
          maximum,
          periode: l.periode,
          precisionPeriode: '',
          inscription: l.inscription,
          anneeScolaire: annee,
          declaresLe,
          note,
          // Planche : enregistrer les lignes recopiées vaut déclaration de l'école (le prospectus en est la preuve).
          declarationConfirmee: true,
          photoPreuve: photo?.id ?? null,
        }),
      };
    });
    const fautive = saisies.find((x) => !x.lu.frais);
    if (fautive) return setErreur(`${nomDeLigne(fautive.l)} : ${fautive.lu.erreur}`);
    setEnCours(true);
    try {
      for (const id of retirees) await admin.retirerFraisEcole(ecoleId, id);
      for (const { l, lu } of saisies) await admin.enregistrerFraisEcole(ecoleId, lu.frais!, l.id);
      setRetirees([]);
      surChangement(
        `${saisies.length} ligne${saisies.length > 1 ? 's' : ''} de frais enregistrée${saisies.length > 1 ? 's' : ''} pour ${nom}. Visible à la prochaine mise à jour du site.`,
      );
      fermer();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  const demander = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      for (const l of illisibles)
        await admin.demanderALEcole(
          ecoleId,
          'frais',
          `Frais ${nomDeLigne(l)}, illisible sur le prospectus`,
        );
      setLignes((ls) => ls.filter((l) => !l.illisible));
      surChangement(
        `${illisibles.map((l) => `« Frais ${nomDeLigne(l)} »`).join(', ')} : demandé à l’école, ajouté à ce qui manque.`,
      );
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  const champ = cn(v2.champ, 'h-10 px-2.5 text-[15px]');
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      {/* Le prospectus. */}
      <section className="flex flex-col gap-2.5" aria-label="Prospectus des frais">
        <h3 className="m-0 flex flex-wrap items-center justify-between gap-2 font-sans text-base font-bold">
          Prospectus des frais
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
            <IconeCadenas className="size-3.5" aria-hidden />
            Photo de travail, jamais publique
          </span>
        </h3>
        {photo?.adresse ? (
          <div
            className="relative overflow-auto rounded-xl bg-foreground p-4"
            style={{ maxHeight: 420 }}
          >
            <img
              src={photo.adresse}
              alt="Le prospectus des frais, pris par un relais"
              className="mx-auto block w-full origin-top rounded-sm"
              style={{ transform: `scale(${zoom})` }}
            />
            <span className="sticky bottom-0 float-right flex gap-1.5">
              <button
                type="button"
                aria-label="Agrandir le prospectus"
                onClick={() => setZoom((z) => Math.min(3, z + 0.5))}
                className="flex size-9 cursor-pointer items-center justify-center rounded-md border-0 bg-card p-0 text-foreground"
              >
                <IconeAjouter className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Réduire le prospectus"
                onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
                className="flex size-9 cursor-pointer items-center justify-center rounded-md border-0 bg-card p-0 text-foreground"
              >
                <IconeMoins className="size-4" aria-hidden />
              </button>
            </span>
          </div>
        ) : (
          <div className="flex aspect-[3/4] items-center justify-center rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            {prospectus === null
              ? 'Chargement…'
              : 'Pas de prospectus photographié : les lignes se publient « dites par l’école », avec leur date.'}
          </div>
        )}
        {photo && (
          <p className="m-0 text-sm text-muted-foreground">
            Prise par un relais{photo.prisLe ? ` le ${jour(photo.prisLe)}` : ''}, dans son relevé.
            {prospectus && prospectus.length > 1 && (
              <>
                {' '}
                <button
                  type="button"
                  className={cn(v2.lien, 'min-h-0 text-sm')}
                  onClick={() => setVue((vue + 1) % prospectus.length)}
                >
                  Photo suivante ({vue + 1} sur {prospectus.length})
                </button>
              </>
            )}
          </p>
        )}
      </section>

      {/* Les lignes. */}
      <section className="flex min-w-0 flex-col gap-4" aria-label={`Frais déclarés de ${nom}`}>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Année scolaire
            <input
              className={cn(champ, 'w-40')}
              maxLength={30}
              placeholder="2026-2027"
              value={annee}
              onChange={(e) => setAnnee(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Déclarés par l’école le
            <input
              className={cn(champ, 'w-44')}
              type="date"
              max={jourDuCongo()}
              value={declaresLe}
              onChange={(e) => setDeclaresLe(e.target.value)}
            />
          </label>
        </div>

        {cycles.length === 0 ? (
          <p className="m-0 text-muted-foreground">
            Renseigne d’abord les niveaux de l’école (« En bref ») pour ajouter des frais.
          </p>
        ) : (
          <div className="flex flex-col gap-3 overflow-x-auto rounded-xl border border-border bg-card p-3">
            <table className="w-full min-w-[720px] border-collapse text-left text-[15px]">
              <thead>
                <tr className="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
                  <th className="px-2 py-2">Cycle</th>
                  <th className="px-2 py-2">Classe (facultatif)</th>
                  <th className="px-2 py-2">Montant</th>
                  <th className="px-2 py-2">Période</th>
                  <th className="px-2 py-2">Inscription</th>
                  <th className="px-2 py-2">Illisible ?</th>
                  <th className="px-2 py-2">
                    <span className="sr-only">Retirer</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr
                    key={l.cle}
                    aria-label={nomDeLigne(l)}
                    className={cn(
                      'border-t border-border',
                      l.illisible && 'shadow-[inset_3px_0_0_var(--erreur)]',
                    )}
                  >
                    <td className="px-2 py-1.5">
                      <select
                        aria-label="Cycle"
                        className={cn(champ, 'w-32')}
                        value={l.cycle}
                        onChange={(e) => changer(l.cle, { cycle: e.target.value })}
                      >
                        <option value="">Choisir</option>
                        {cycles.map((c) => (
                          <option key={c} value={c}>
                            {libelleNiveau[c]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label="Classe"
                        className={champ}
                        maxLength={40}
                        placeholder="toutes"
                        value={l.classe}
                        onChange={(e) => changer(l.cle, { classe: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label="Montant (FCFA)"
                        className={champ}
                        inputMode="numeric"
                        disabled={l.illisible}
                        placeholder={l.illisible ? 'illisible' : 'FCFA'}
                        value={l.illisible ? '' : l.montant}
                        onChange={(e) => changer(l.cle, { montant: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        aria-label="Période"
                        className={cn(champ, 'w-28')}
                        value={l.periode}
                        onChange={(e) => changer(l.cle, { periode: e.target.value })}
                      >
                        {Object.entries(periodesFrais)
                          .filter(([k]) => k !== 'autre')
                          .map(([k, v]) => (
                            <option key={k} value={k}>
                              {v.replace('Par ', '')}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label="Inscription (FCFA)"
                        className={champ}
                        inputMode="numeric"
                        value={l.inscription}
                        onChange={(e) => changer(l.cle, { inscription: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        aria-pressed={l.illisible}
                        onClick={() => changer(l.cle, { illisible: !l.illisible })}
                        className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-input bg-card px-3 font-sans text-sm font-bold text-foreground aria-pressed:border-destructive aria-pressed:bg-danger aria-pressed:text-danger-foreground"
                      >
                        Illisible
                      </button>
                    </td>
                    <td className="px-1 py-1.5">
                      <button
                        type="button"
                        aria-label={`Retirer la ligne ${nomDeLigne(l)}`}
                        onClick={() => retirer(l)}
                        className="flex size-9 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-muted-foreground"
                      >
                        <IconeFermer className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setLignes((ls) => [...ls, nouvelle(cycles[0] ?? '')])}
                className={cn(v2.boutonSecondairePetit, 'border-dashed')}
              >
                + Ajouter une ligne
              </button>
              {lignes.length >= 2 && (
                <button
                  type="button"
                  className={v2.boutonSecondairePetit}
                  onClick={() => {
                    const deja = lignes.find((l) => l.inscription.trim())?.inscription;
                    const m = deja ?? String(inscriptionLaPlusFrequente(frais) ?? '');
                    setLignes((ls) => ls.map((l) => ({ ...l, inscription: m })));
                  }}
                >
                  Même inscription sur toutes les lignes
                </button>
              )}
            </div>
          </div>
        )}

        <label className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3 text-sm font-bold">
          Note (tenue, fournitures…)
          <input
            className={champ}
            maxLength={300}
            placeholder="Tenue : …"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {erreur && (
          <Bandeau ton="erreur" icone="alerte">
            <p>{erreur}</p>
          </Bandeau>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Bouton
            enCours={enCours}
            disabled={publiables.length === 0 && retirees.length === 0}
            onClick={() => void enregistrer()}
          >
            Enregistrer {publiables.length} ligne{publiables.length > 1 ? 's' : ''} publiable
            {publiables.length > 1 ? 's' : ''}
          </Bouton>
          {illisibles.length > 0 && (
            <Bouton variante="secondaire" disabled={enCours} onClick={() => void demander()}>
              Demander {illisibles.map(nomDeLigne).join(', ')}
            </Bouton>
          )}
        </div>
        <p className="m-0 text-sm text-muted-foreground">
          « Illisible » grise le montant : la ligne n’est pas publiée et s’ajoute aux manques.
        </p>
      </section>
    </div>
  );
}
