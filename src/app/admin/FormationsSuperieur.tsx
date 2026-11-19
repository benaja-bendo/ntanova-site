import { v2 } from '@/ui/v2/classes';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { jourDuCongo } from '../../modele/date-declaration';
import {
  detailsVides,
  erreurDeLaFiche,
  libelleGenrePreuve,
  sansDetail,
  type DetailsFormation,
  type FicheFormation,
  type FormationDuSuperieur,
  type GenrePreuve,
} from '../../modele/fiche-admin';
import {
  libelleDiplome,
  libelleNiveau,
  libelleSelection,
  libelleSerie,
} from '../../modele/libelles';
import { listes, type Valeur } from '../../modele/listes';
import { francs } from '../../modele/paie';
import { dateLongue } from '../../modele/pointe-noire';
import type { DomainePublic, PortAdministration } from '../../modele/ports';
import { Bouton, Dialogue } from '@/ui/v2/admin';
import { Champ } from '@/ui/v2/formulaire';
import { ImageIllisible, preparerImage } from '../commun/image';
import { messageErreur } from './ChampPosition';
import { titreDesFormations } from '../../modele/formations';

/** « 2 ans · Bac · Sur dossier · dossier 15 000 FCFA » : le résumé d'une formation dans la liste. */
function resumeDesDetails(d: DetailsFormation): string {
  if (sansDetail(d)) return 'Aucun détail';
  return [
    d.dureeAnnees !== null
      ? `${d.dureeAnnees.toLocaleString('fr-FR')} an${d.dureeAnnees >= 2 ? 's' : ''}`
      : null,
    d.niveauDemande,
    d.selection ? libelleSelection[d.selection] : null,
    d.fraisDossier !== null ? `dossier ${francs(d.fraisDossier)}` : null,
    d.delivrePar ? `diplôme délivré par ${d.delivrePar}` : null,
    d.ditLe ? `dit le ${dateLongue(d.ditLe)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const nombreOuNul = (v: string): number | null => {
  const t = v.trim().replace(/\s/g, '').replace(',', '.');
  return t === '' ? null : Number(t);
};

/** Les puces du rythme, comme sur la planche. */
const rythmesCourts: Record<Valeur<'study_rhythm'>, string> = {
  jour: 'Jour',
  soir: 'Soir',
  weekend: 'Week-end',
};

/** Lot 2 du site public (15/11) : une série en puce, « A », « F2 », « Autre ». */
const serieCourte = (v: Valeur<'bac_track'>) => (v === 'autre' ? 'Autre' : v.toUpperCase());

/** Sur quoi l'autorisation a été vue (planche : « Vue sur »). */
const vueSur: Record<GenrePreuve, string> = {
  photo: 'Une photo de l’arrêté',
  document_vu: 'Le document, sur place',
  dit_ecole: 'Dit par l’école, sans document',
};

const carte = 'flex flex-col gap-3 rounded-xl border border-border bg-card p-4';
const titreCarte = 'm-0 text-[17px] font-bold';

/**
 * Les formations du supérieur d'un site (lot F du ticket 165) et le tiroir « modifier une formation » (lot 2, planche
 * « Licence en droit des affaires ») : la formation (intitulé, diplôme, domaine, durée, rythme, diplôme délivré par),
 * l'admission et les frais (niveau demandé, sélection, frais de dossier, frais par an, dits par l'école à une date), et
 * l'autorisation de cette formation (référence de l'arrêté, date, sur quoi elle a été vue). Tout part d'un seul geste.
 */
/** Les cycles dont les formations se détaillent ici (le reste se lit en séries, dans « En bref »). */
const CYCLES_A_FORMATIONS = ['superieur', 'technique', 'autre_formation'] as const;

/**
 * 18/11 : ajouter une formation depuis la fiche (une école créée sans formation n'en recevait jamais). L'intitulé seul,
 * dans un cycle que le site enseigne ; le tiroir de la formation s'ouvre ensuite pour tout le reste.
 */
function AjoutFormation({
  ecoleId,
  cycles,
  admin,
  surAjout,
}: {
  ecoleId: string;
  cycles: readonly Valeur<'niveau'>[];
  admin: PortAdministration;
  surAjout: (id: string, titre: string) => void;
}) {
  const [titre, setTitre] = useState('');
  const [cycle, setCycle] = useState<Valeur<'niveau'>>(cycles[0] ?? 'superieur');
  const [erreur, setErreur] = useState<string | undefined>();
  const [enCours, setEnCours] = useState(false);
  if (cycles.length === 0)
    return (
      <p className={v2.mention}>
        Pour ajouter une formation, ajoute d’abord le supérieur, le technique ou une autre formation
        aux niveaux du site (« En bref »).
      </p>
    );
  const ajouter = async () => {
    const t = titre.trim();
    if (!t) return setErreur('Écris l’intitulé de la formation.');
    setEnCours(true);
    setErreur(undefined);
    try {
      const id = await admin.ajouterFormation(ecoleId, cycle, t);
      setTitre('');
      surAjout(id, t);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };
  return (
    <form
      aria-label="Ajouter une formation"
      className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-card p-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        void ajouter();
      }}
    >
      <h4 className={titreCarte}>Ajouter une formation</h4>
      <Champ
        libelle="Intitulé, tel que l’école l’écrit"
        aide="Par exemple « Licence en droit des affaires ». Le diplôme, la durée, les frais et l’autorisation se disent ensuite."
        erreur={erreur}
      >
        {(a) => (
          <input
            {...a}
            className={v2.champ}
            type="text"
            autoComplete="off"
            maxLength={160}
            value={titre}
            onChange={(ev) => {
              setTitre(ev.target.value);
              setErreur(undefined);
            }}
          />
        )}
      </Champ>
      {cycles.length > 1 && (
        <Champ libelle="Cycle">
          {(a) => (
            <select
              {...a}
              className={v2.champ}
              value={cycle}
              onChange={(ev) => setCycle(ev.target.value as Valeur<'niveau'>)}
            >
              {cycles.map((c) => (
                <option key={c} value={c}>
                  {libelleNiveau[c]}
                </option>
              ))}
            </select>
          )}
        </Champ>
      )}
      <button className={cn(v2.bouton, 'self-start')} type="submit" disabled={enCours}>
        {enCours ? 'Ajout…' : 'Ajouter et détailler'}
      </button>
    </form>
  );
}

export function FormationsSuperieur({
  ecoleId,
  nom,
  niveaux = [],
  admin,
  surChangement,
}: {
  ecoleId: string;
  /** Le nom du site, sous le titre du tiroir. */
  nom?: string;
  /** Les niveaux du site : on n'ajoute une formation que dans un cycle qu'il enseigne. */
  niveaux?: readonly Valeur<'niveau'>[];
  admin: PortAdministration;
  surChangement: (texte: string) => void;
}) {
  const cycles = CYCLES_A_FORMATIONS.filter((c) => niveaux.includes(c));
  // Une formation qui vient d'être ajoutée : son tiroir s'ouvre dès que la liste relue la contient.
  const aOuvrir = useRef<string | null>(null);
  const [formations, setFormations] = useState<FormationDuSuperieur[] | null>(null);
  const [domaines, setDomaines] = useState<DomainePublic[]>([]);
  const [ouverte, setOuverte] = useState<FormationDuSuperieur | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vivant = true;
    void admin
      .formationsDeLEcole(ecoleId)
      .then((f) => {
        if (!vivant) return;
        setFormations(f);
        const nouvelle = aOuvrir.current ? f.find((x) => x.id === aOuvrir.current) : undefined;
        aOuvrir.current = null;
        if (nouvelle) setOuverte(nouvelle);
      })
      .catch((e: unknown) => vivant && setErreur(messageErreur(e)));
    return () => {
      vivant = false;
    };
  }, [admin, ecoleId, version]);
  useEffect(() => {
    let vivant = true;
    void admin
      .domaines()
      .then((d) => vivant && setDomaines(d))
      .catch(() => vivant && setDomaines([]));
    return () => {
      vivant = false;
    };
  }, [admin]);

  if (!formations)
    return erreur ? <p className={v2.erreur}>{erreur}</p> : <p aria-busy="true">Chargement…</p>;

  // Sans formation encore notée, le titre suit les cycles du site qui en reçoivent.
  const titre = titreDesFormations(formations.length > 0 ? formations.map((f) => f.cycle) : cycles);
  return (
    <section className={v2.motifPile} aria-label={titre}>
      <h3>{titre}</h3>
      {formations.length === 0 ? (
        <p className={v2.doux}>Aucune formation notée pour ce site.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0 [&>li]:flex [&>li]:flex-col [&>li]:gap-1.5 [&>li]:rounded-lg [&>li]:border [&>li]:border-border [&>li]:p-3 [&_p]:m-0">
          {formations.map((f) => (
            <li key={f.id} className={v2.pileSerree}>
              <b>
                {f.titre}
                <span className={v2.mention}> · {libelleNiveau[f.cycle]}</span>
              </b>
              <p className={v2.mention}>{resumeDesDetails(f.details)}</p>
              {(f.seriesAdmises ?? []).length > 0 && (
                <p className={v2.mention}>
                  Séries admises : {(f.seriesAdmises ?? []).map(serieCourte).join(', ')}
                </p>
              )}
              <p className={v2.mention}>
                {f.autorisation
                  ? `Autorisation : réf. ${f.autorisation.reference}`
                  : 'Autorisation : pas encore vue'}
              </p>
              <button type="button" className={v2.boutonSecondaire} onClick={() => setOuverte(f)}>
                Détail : {f.titre}
              </button>
            </li>
          ))}
        </ul>
      )}
      <AjoutFormation
        ecoleId={ecoleId}
        cycles={cycles}
        admin={admin}
        surAjout={(id, titre) => {
          aOuvrir.current = id;
          setVersion((v) => v + 1);
          surChangement(`Formation ajoutée : ${titre}. Détaille-la ci-dessous.`);
        }}
      />
      {erreur && (
        <p className={v2.erreur} role="alert">
          {erreur}
        </p>
      )}
      <p className={v2.mention}>
        Tout est dit par l’école : la page écrit « d’après l’école, le [date] ».
      </p>
      {ouverte && (
        <TiroirFormation
          key={ouverte.id}
          ecoleId={ecoleId}
          nom={nom}
          formation={ouverte}
          domaines={domaines}
          admin={admin}
          fermer={() => setOuverte(null)}
          surEnregistre={(texte) => {
            setOuverte(null);
            setVersion((v) => v + 1);
            surChangement(texte);
          }}
        />
      )}
    </section>
  );
}

function TiroirFormation({
  ecoleId,
  nom,
  formation: f,
  domaines,
  admin,
  fermer,
  surEnregistre,
}: {
  ecoleId: string;
  nom: string | undefined;
  formation: FormationDuSuperieur;
  domaines: DomainePublic[];
  admin: PortAdministration;
  fermer: () => void;
  surEnregistre: (texte: string) => void;
}) {
  const d = f.details ?? detailsVides();
  const [titre, setTitre] = useState(f.titre);
  const [diplome, setDiplome] = useState<Valeur<'diploma_kind'> | null>(f.diplome ?? null);
  const [domaine, setDomaine] = useState<string | null>(f.domaine ?? null);
  const [rythmes, setRythmes] = useState<Valeur<'study_rhythm'>[]>(f.rythmes ?? []);
  // Lot 2 (15/11) : les séries du bac que la formation admet (supérieur seulement) ; aucune cochée : pas dit.
  const [series, setSeries] = useState<Valeur<'bac_track'>[]>(f.seriesAdmises ?? []);
  const apresLeBac = f.cycle === 'superieur';
  const [duree, setDuree] = useState(d.dureeAnnees?.toLocaleString('fr-FR') ?? '');
  const [delivrePar, setDelivrePar] = useState(d.delivrePar ?? '');
  const [niveau, setNiveau] = useState(d.niveauDemande ?? '');
  const [selection, setSelection] = useState<Valeur<'selection_kind'> | null>(d.selection);
  const [fraisDossier, setFraisDossier] = useState(d.fraisDossier?.toString() ?? '');
  const [fraisAn, setFraisAn] = useState(f.fraisParAn?.toString() ?? '');
  const [ditLe, setDitLe] = useState(d.ditLe ?? jourDuCongo());
  const [reference, setReference] = useState(f.autorisation?.reference ?? '');
  const [leArrete, setLeArrete] = useState(f.autorisation?.le ?? '');
  const [preuve, setPreuve] = useState<GenrePreuve | null>(f.autorisation?.preuve ?? null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const vue = Boolean(reference.trim() || leArrete || preuve);
  const sauver = async () => {
    const dureeAnnees = nombreOuNul(duree);
    const frais = nombreOuNul(fraisDossier);
    const parAn = nombreOuNul(fraisAn);
    if ([dureeAnnees, frais, parAn].some((n) => Number.isNaN(n)))
      return setErreur('La durée et les frais s’écrivent en chiffres.');
    if (vue && !preuve)
      return setErreur('Dis sur quoi l’autorisation a été vue, ou vide la référence.');
    const fiche: FicheFormation = {
      titre: titre.trim(),
      diplome,
      domaine,
      rythmes,
      dureeAnnees,
      niveauDemande: niveau.trim() || null,
      selection,
      fraisDossier: frais,
      delivrePar: delivrePar.trim() || null,
      ditLe: ditLe || null,
      fraisParAn: parAn,
      ...(apresLeBac ? { seriesAdmises: series } : {}),
      autorisation:
        vue && preuve
          ? {
              ...(f.autorisation?.id ? { id: f.autorisation.id } : {}),
              reference: reference.trim(),
              le: leArrete,
              preuve,
            }
          : null,
    };
    if (sansDetail(fiche) && fiche.fraisParAn === null) fiche.ditLe = null;
    const probleme = erreurDeLaFiche(fiche, jourDuCongo());
    if (probleme) return setErreur(probleme);
    setEnCours(true);
    setErreur(null);
    try {
      const autorisationId = await admin.enregistrerFormation(f.id, fiche);
      if (autorisationId && preuve === 'photo' && fichier) {
        const image = await preparerImage(fichier);
        await admin.enregistrerPreuveAgrement(ecoleId, autorisationId, {
          genre: 'photo',
          photoId: null,
          image,
        });
      }
      surEnregistre(`« ${fiche.titre} » enregistrée. Visible à la prochaine mise à jour du site.`);
    } catch (e) {
      setErreur(e instanceof ImageIllisible ? e.message : messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Dialogue titre={f.titre} description={nom} variante="tiroir" fermer={fermer} occupe={enCours}>
      <form
        className="flex flex-col gap-4"
        aria-label={`Détail de ${f.titre}`}
        onSubmit={(ev) => {
          ev.preventDefault();
          void sauver();
        }}
      >
        <fieldset disabled={enCours} className={cn('m-0 border-0 p-0', 'flex flex-col gap-4')}>
          <section className={carte} aria-label="La formation">
            <h4 className={titreCarte}>La formation</h4>
            <Champ libelle="Intitulé">
              {(x) => (
                <input
                  {...x}
                  className={v2.champ}
                  maxLength={160}
                  value={titre}
                  onChange={(e) => setTitre(e.target.value)}
                />
              )}
            </Champ>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]">
              <Champ libelle="Diplôme" facultatif>
                {(x) => (
                  <select
                    {...x}
                    className={v2.champ}
                    value={diplome ?? ''}
                    onChange={(e) =>
                      setDiplome((e.target.value || null) as Valeur<'diploma_kind'> | null)
                    }
                  >
                    <option value="">Pas dit</option>
                    {listes.diploma_kind.map((v) => (
                      <option key={v} value={v}>
                        {libelleDiplome[v]}
                      </option>
                    ))}
                  </select>
                )}
              </Champ>
              <Champ libelle="Domaine" facultatif>
                {(x) => (
                  <select
                    {...x}
                    className={v2.champ}
                    value={domaine ?? ''}
                    onChange={(e) => setDomaine(e.target.value || null)}
                  >
                    <option value="">Pas dit</option>
                    {domaine && !domaines.some((o) => o.slug === domaine) && (
                      <option value={domaine}>{domaine}</option>
                    )}
                    {domaines.map((o) => (
                      <option key={o.slug} value={o.slug}>
                        {o.nom}
                      </option>
                    ))}
                  </select>
                )}
              </Champ>
              <Champ libelle="Durée (ans)" facultatif>
                {(x) => (
                  <input
                    {...x}
                    className={v2.champ}
                    inputMode="decimal"
                    placeholder="ex. 3"
                    value={duree}
                    onChange={(e) => setDuree(e.target.value)}
                  />
                )}
              </Champ>
            </div>
            <div role="group" aria-label="Rythme" className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Rythme</span>
              <div className="flex flex-wrap gap-2">
                {listes.study_rhythm.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={v2.puce}
                    aria-pressed={rythmes.includes(r)}
                    onClick={() =>
                      setRythmes((avant) =>
                        avant.includes(r)
                          ? avant.filter((x) => x !== r)
                          : listes.study_rhythm.filter((x) => x === r || avant.includes(x)),
                      )
                    }
                  >
                    {rythmesCourts[r]}
                  </button>
                ))}
              </div>
            </div>
            <Champ
              libelle="Diplôme délivré par"
              facultatif
              aide="Les mots de l’école, tels quels (l’établissement, une université partenaire, l’État…)."
            >
              {(x) => (
                <input
                  {...x}
                  className={v2.champ}
                  maxLength={120}
                  placeholder="ex. l’université partenaire"
                  value={delivrePar}
                  onChange={(e) => setDelivrePar(e.target.value)}
                />
              )}
            </Champ>
          </section>

          <section className={carte} aria-label="Admission et frais">
            <h4 className={titreCarte}>Admission et frais</h4>
            <div className={v2.deuxColonnes}>
              <Champ libelle="Niveau demandé" facultatif>
                {(x) => (
                  <input
                    {...x}
                    className={v2.champ}
                    maxLength={80}
                    placeholder="ex. Bac, toutes séries"
                    value={niveau}
                    onChange={(e) => setNiveau(e.target.value)}
                  />
                )}
              </Champ>
              <Champ libelle="Sélection" facultatif>
                {(x) => (
                  <select
                    {...x}
                    className={v2.champ}
                    value={selection ?? ''}
                    onChange={(e) =>
                      setSelection((e.target.value || null) as Valeur<'selection_kind'> | null)
                    }
                  >
                    <option value="">Pas dite</option>
                    {listes.selection_kind.map((v) => (
                      <option key={v} value={v}>
                        {libelleSelection[v]}
                      </option>
                    ))}
                  </select>
                )}
              </Champ>
              <Champ libelle="Frais de dossier (FCFA)" facultatif>
                {(x) => (
                  <input
                    {...x}
                    className={v2.champ}
                    inputMode="numeric"
                    placeholder="ex. 15000"
                    value={fraisDossier}
                    onChange={(e) => setFraisDossier(e.target.value)}
                  />
                )}
              </Champ>
              <Champ
                libelle="Frais par an (FCFA)"
                facultatif
                aide="Sur le site avec le OUI de l’école (Frais)."
              >
                {(x) => (
                  <input
                    {...x}
                    className={v2.champ}
                    inputMode="numeric"
                    value={fraisAn}
                    onChange={(e) => setFraisAn(e.target.value)}
                  />
                )}
              </Champ>
            </div>
            {apresLeBac && (
              <div
                role="group"
                aria-label="Séries du bac admises"
                className="flex flex-col gap-1.5"
              >
                <span className="text-sm font-bold">
                  Séries du bac admises{' '}
                  <span className="font-normal text-muted-foreground">(facultatif)</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {listes.bac_track.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={v2.puce}
                      aria-pressed={series.includes(v)}
                      aria-label={libelleSerie[v]}
                      onClick={() =>
                        setSeries((avant) =>
                          avant.includes(v)
                            ? avant.filter((x) => x !== v)
                            : listes.bac_track.filter((x) => x === v || avant.includes(x)),
                        )
                      }
                    >
                      {serieCourte(v)}
                    </button>
                  ))}
                </div>
                <span className="text-[13px] text-muted-foreground">
                  Ce que dit l’école ; aucune cochée : pas dit. Le test d’orientation les lira.
                </span>
              </div>
            )}
            <Champ libelle="Dit par l’école le">
              {(x) => (
                <input
                  {...x}
                  className={cn(v2.champ, 'sm:w-48')}
                  type="date"
                  max={jourDuCongo()}
                  value={ditLe}
                  onChange={(e) => setDitLe(e.target.value)}
                />
              )}
            </Champ>
            <p className={cn(v2.mention, 'm-0')}>
              Qui le dit : l’école, le {ditLe ? dateLongue(ditLe) : '[date]'}. Le calendrier et les
              pièces sont communs au campus (rubrique Admission).
            </p>
          </section>

          <section
            className={cn(carte, !vue && 'border-2 border-destructive')}
            aria-label="L’autorisation de cette formation"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h4 className={titreCarte}>L’autorisation de cette formation</h4>
              {!vue && <span className="text-sm font-bold text-destructive">Pas encore vue</span>}
            </div>
            <div className={v2.deuxColonnes}>
              <Champ libelle="Référence de l’arrêté" facultatif>
                {(x) => (
                  <input
                    {...x}
                    className={v2.champ}
                    maxLength={160}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                )}
              </Champ>
              <Champ libelle="Le" facultatif>
                {(x) => (
                  <input
                    {...x}
                    className={v2.champ}
                    type="date"
                    max={jourDuCongo()}
                    value={leArrete}
                    onChange={(e) => setLeArrete(e.target.value)}
                  />
                )}
              </Champ>
            </div>
            <div role="group" aria-label="Vue sur" className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Vue sur</span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(vueSur) as GenrePreuve[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={v2.puce}
                    aria-pressed={preuve === g}
                    title={libelleGenrePreuve[g]}
                    onClick={() => setPreuve(preuve === g ? null : g)}
                  >
                    {vueSur[g]}
                  </button>
                ))}
              </div>
            </div>
            {preuve === 'photo' && (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input bg-muted p-4 text-sm font-bold">
                {fichier ? `Photo jointe : ${fichier.name}` : 'Joindre la photo de l’arrêté'} ·
                photo de travail, jamais publique
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
            <p className={cn(v2.mention, 'm-0')}>
              Sur la page, on lira : « Autorisation : réf. [n°] · vue sur le document le [date] »,
              ou « pas encore vue par NTanova ». Jamais « reconnue par l’État ».
            </p>
          </section>
        </fieldset>
        {erreur && (
          <p className={v2.erreur} role="alert">
            {erreur}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          <span className={cn(v2.mention, 'mr-auto')}>
            Visible à la prochaine mise à jour du site.
          </span>
          <button type="button" className={v2.boutonSecondaire} disabled={enCours} onClick={fermer}>
            Annuler
          </button>
          <Bouton type="submit" enCours={enCours}>
            Enregistrer
          </Bouton>
        </div>
      </form>
    </Dialogue>
  );
}
