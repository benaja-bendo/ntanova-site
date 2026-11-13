/**
 * La paie du vendredi soir. La base calcule ce qui est dû (une fiche acceptée, un contact confirmé, l'essai) et
 * ne le compte qu'une fois ; ici on le voit, on clôt la semaine, puis on note chaque paiement Mobile Money fait
 * avec sa référence. NTanova paie des relais : il n'encaisse jamais de frais de scolarité.
 */
import { v2 } from '@/ui/v2/classes';
import { useCallback, useEffect, useState } from 'react';
import { estUnVendredi, francs, prochainVendredi, vendrediLong } from '../../modele/paie';
import type { LignePaie, PaiementVu, PortAdministration, SemainePaie } from '../../modele/ports';
import { afficherTelephone } from '../../modele/telephone';
import { Bandeau, Champ } from '@/ui/v2/formulaire';
import { jour } from '../../ui/composants';
import { messageErreur } from './ChampPosition';
import { TitreEcran } from './Cadre';

type Operateur = 'mtn' | 'airtel' | 'autre';
const libelleOperateur: Record<Operateur, string> = {
  mtn: 'MTN Mobile Money',
  airtel: 'Airtel Money',
  autre: 'Autre',
};

function NumeroMobileMoney({
  admin,
  relaisId,
  surFait,
}: {
  admin: PortAdministration;
  relaisId: string;
  surFait: () => void;
}) {
  const [operateur, setOperateur] = useState<Operateur>('mtn');
  const [numero, setNumero] = useState('');
  const [titulaire, setTitulaire] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const noter = async (ev: { preventDefault: () => void }) => {
    ev.preventDefault();
    setErreur(null);
    try {
      await admin.enregistrerMobileMoney(
        relaisId,
        operateur,
        numero.replace(/[\s.+()-]/g, ''),
        titulaire.trim() || null,
      );
      surFait();
    } catch (e) {
      setErreur(messageErreur(e));
    }
  };
  return (
    <form className={v2.actions} onSubmit={(ev) => void noter(ev)} aria-label="Numéro Mobile Money">
      <select
        className={v2.champ}
        aria-label="Opérateur"
        value={operateur}
        onChange={(ev) => setOperateur(ev.target.value as Operateur)}
      >
        {(Object.keys(libelleOperateur) as Operateur[]).map((o) => (
          <option key={o} value={o}>
            {libelleOperateur[o]}
          </option>
        ))}
      </select>
      <input
        className={v2.zone}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        aria-label="Numéro Mobile Money"
        placeholder="242 06 …"
        value={numero}
        onChange={(ev) => setNumero(ev.target.value)}
      />
      <input
        className={v2.zone}
        type="text"
        autoComplete="off"
        aria-label="Au nom de"
        placeholder="Au nom de [titulaire]"
        value={titulaire}
        onChange={(ev) => setTitulaire(ev.target.value)}
      />
      <button type="submit" className={v2.boutonSecondairePetit} disabled={numero.trim() === ''}>
        Noter le numéro
      </button>
      {erreur && <span className={v2.erreur}>{erreur}</span>}
    </form>
  );
}

function SemaineOuverte({
  admin,
  semaine,
  surFait,
}: {
  admin: PortAdministration;
  semaine: SemainePaie;
  surFait: (texte: string) => void;
}) {
  const [paiements, setPaiements] = useState<PaiementVu[] | null>(null);
  const [references, setReferences] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const charger = useCallback(() => {
    admin
      .paiementsDeLaSemaine(semaine.id)
      .then(setPaiements)
      .catch((e: unknown) => setErreur(messageErreur(e)));
  }, [admin, semaine.id]);
  useEffect(charger, [charger]);

  const payer = async (p: PaiementVu) => {
    const reference = (references[p.relaisId] ?? '').trim();
    if (reference === '') return;
    setErreur(null);
    try {
      await admin.noterPaye(semaine.id, p.relaisId, reference);
      surFait(`${p.prenom} : ${francs(p.totalXaf)} noté payé (référence ${reference}).`);
      charger();
    } catch (e) {
      setErreur(messageErreur(e));
    }
  };

  return (
    <div className={v2.tableau} aria-label={`Paiements du ${semaine.vendredi}`}>
      <table>
        <thead>
          <tr>
            <th scope="col">Relais</th>
            <th scope="col">Détail</th>
            <th scope="col">À payer</th>
            <th scope="col">Mobile Money</th>
            <th scope="col">Paiement</th>
          </tr>
        </thead>
        <tbody>
          {paiements?.map((p) => (
            <tr key={p.relaisId}>
              <td>
                <b>{p.prenom || '[sans prénom]'}</b>
              </td>
              <td className={v2.mention}>
                {p.fiches} fiche{p.fiches > 1 ? 's' : ''} · {p.contacts} contact
                {p.contacts > 1 ? 's' : ''}
                {p.essais > 0 ? ' · essai' : ''}
              </td>
              <td>
                <b>{francs(p.totalXaf)}</b>
              </td>
              <td>
                {p.numero ? (
                  <>
                    {afficherTelephone(p.numero)}
                    <span className={v2.mentionBloc}>
                      {libelleOperateur[(p.operateur as Operateur | null) ?? 'autre']}
                    </span>
                    <span className={v2.mentionBloc}>
                      {p.titulaire ? (
                        <>
                          Au nom de <b>{p.titulaire}</b>
                        </>
                      ) : (
                        <span className={v2.mention}>Nom du titulaire non donné</span>
                      )}
                    </span>
                  </>
                ) : (
                  <NumeroMobileMoney admin={admin} relaisId={p.relaisId} surFait={charger} />
                )}
              </td>
              <td>
                {p.payeLe ? (
                  <span className={v2.pastilleSucces}>
                    Payé {jour(p.payeLe)} · {p.reference}
                  </span>
                ) : (
                  <div className={v2.actions}>
                    <input
                      className={v2.zone}
                      aria-label={`Référence du paiement de ${p.prenom}`}
                      placeholder="Référence de l’opération"
                      maxLength={80}
                      value={references[p.relaisId] ?? ''}
                      onChange={(ev) =>
                        setReferences({ ...references, [p.relaisId]: ev.target.value })
                      }
                    />
                    <button
                      type="button"
                      className={v2.boutonPetit}
                      disabled={(references[p.relaisId] ?? '').trim() === ''}
                      onClick={() => void payer(p)}
                    >
                      Noter payé
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {paiements === null && !erreur && (
            <tr>
              <td colSpan={5} className={v2.doux} aria-busy="true">
                Chargement…
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {erreur && <p className={v2.erreur}>{erreur}</p>}
    </div>
  );
}

export function Paie({ admin }: { admin: PortAdministration }) {
  const [vendredi, setVendredi] = useState(() => prochainVendredi());
  // Ce qui est dû, avec le vendredi qu'il concerne : changer de vendredi écarte l'ancien calcul.
  const [calcul, setCalcul] = useState<{ vendredi: string; lignes: LignePaie[] } | null>(null);
  const [version, setVersion] = useState(0);
  const apercu = calcul?.vendredi === vendredi ? calcul.lignes : null;
  const [semaines, setSemaines] = useState<SemainePaie[]>([]);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [aCloturer, setACloturer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const chargerSemaines = useCallback(() => {
    admin
      .semainesPaie()
      .then(setSemaines)
      .catch((e: unknown) => setErreur(messageErreur(e)));
  }, [admin]);
  useEffect(chargerSemaines, [chargerSemaines]);

  useEffect(() => {
    if (!estUnVendredi(vendredi)) return;
    let ecarte = false;
    admin
      .apercuPaie(vendredi)
      .then((lignes) => {
        if (!ecarte) {
          setCalcul({ vendredi, lignes });
          setErreur(null);
        }
      })
      .catch((e: unknown) => {
        if (!ecarte) setErreur(messageErreur(e));
      });
    return () => {
      ecarte = true;
    };
  }, [admin, vendredi, version]);
  const voir = () => setVersion((n) => n + 1);

  const total = (apercu ?? []).reduce((n, l) => n + l.totalXaf, 0);

  const cloturer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      const id = await admin.cloturerPaie(vendredi);
      setAnnonce(
        `La semaine du ${vendrediLong(vendredi)} est clôturée : ${francs(total)} à payer. Fais les paiements Mobile Money, puis note-les ci-dessous.`,
      );
      setACloturer(false);
      setOuverte(id);
      chargerSemaines();
      voir();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className={v2.pile}>
      <TitreEcran
        titre="Paie"
        regles={
          <p>
            Le vendredi soir. Une fiche acceptée, un contact confirmé, l’essai d’un nouveau relais :
            la base calcule ce qui est dû et ne le compte qu’une fois. Une fiche acceptée après le
            vendredi attend la semaine suivante.
          </p>
        }
      />

      {erreur && (
        <Bandeau ton="erreur" icone="alerte">
          <p>{erreur}</p>
        </Bandeau>
      )}
      {annonce && (
        <p className={v2.bandeSucces} role="status">
          {annonce}
        </p>
      )}

      <section className={v2.carte} aria-label="Ce qui est dû">
        <h2 className={v2.titreSection}>Ce qui est dû</h2>
        <Champ
          libelle="Jusqu’au vendredi"
          aide={estUnVendredi(vendredi) ? vendrediLong(vendredi) : 'Choisis un vendredi.'}
        >
          {(a) => (
            <input
              {...a}
              className={v2.champ}
              type="date"
              value={vendredi}
              onChange={(ev) => setVendredi(ev.target.value)}
            />
          )}
        </Champ>
        <div className={v2.tableau}>
          <table>
            <thead>
              <tr>
                <th scope="col">Relais</th>
                <th scope="col">Fiches acceptées</th>
                <th scope="col">Contacts confirmés</th>
                <th scope="col">Essai</th>
                <th scope="col">À payer</th>
                <th scope="col">Mobile Money</th>
              </tr>
            </thead>
            <tbody>
              {apercu?.map((l) => (
                <tr key={l.relaisId}>
                  <td>
                    <b>{l.prenom || '[sans prénom]'}</b>
                  </td>
                  <td>{l.fiches}</td>
                  <td>{l.contacts}</td>
                  <td>{l.essais > 0 ? 'oui' : '—'}</td>
                  <td>
                    <b>{francs(l.totalXaf)}</b>
                  </td>
                  <td>
                    {l.numeroConnu ? (
                      'noté'
                    ) : (
                      <NumeroMobileMoney admin={admin} relaisId={l.relaisId} surFait={voir} />
                    )}
                  </td>
                </tr>
              ))}
              {apercu !== null && apercu.length === 0 && (
                <tr>
                  <td colSpan={6} className={v2.doux}>
                    Rien n’est dû jusqu’à ce vendredi.
                  </td>
                </tr>
              )}
              {apercu === null && estUnVendredi(vendredi) && !erreur && (
                <tr>
                  <td colSpan={6} className={v2.doux} aria-busy="true">
                    Calcul…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {apercu !== null && apercu.length > 0 && (
          <div className={v2.actions}>
            <b>Total : {francs(total)}</b>
            {aCloturer ? (
              <>
                <button
                  type="button"
                  className={v2.bouton}
                  disabled={enCours}
                  onClick={() => void cloturer()}
                >
                  Confirmer : clôturer la semaine
                </button>
                <button
                  type="button"
                  className={v2.boutonSecondaire}
                  onClick={() => setACloturer(false)}
                >
                  Annuler
                </button>
              </>
            ) : (
              <button type="button" className={v2.bouton} onClick={() => setACloturer(true)}>
                Clôturer la semaine
              </button>
            )}
          </div>
        )}
      </section>

      <h2>Semaines clôturées</h2>
      <div className={v2.tableau}>
        <table>
          <thead>
            <tr>
              <th scope="col">Vendredi</th>
              <th scope="col">Total</th>
              <th scope="col">Relais</th>
              <th scope="col">Payés</th>
              <th scope="col">Détail</th>
            </tr>
          </thead>
          <tbody>
            {semaines.map((s) => (
              <tr key={s.id}>
                <td>{vendrediLong(s.vendredi)}</td>
                <td>{francs(s.totalXaf)}</td>
                <td>{s.relais}</td>
                <td>
                  {s.payes} / {s.relais}
                </td>
                <td>
                  <button
                    type="button"
                    className={v2.boutonSecondairePetit}
                    aria-expanded={ouverte === s.id}
                    onClick={() => setOuverte(ouverte === s.id ? null : s.id)}
                  >
                    {ouverte === s.id ? 'Masquer' : 'Voir les paiements'}
                  </button>
                </td>
              </tr>
            ))}
            {semaines.length === 0 && (
              <tr>
                <td colSpan={5} className={v2.doux}>
                  Aucune semaine clôturée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {semaines
        .filter((s) => s.id === ouverte)
        .map((s) => (
          <SemaineOuverte
            key={s.id}
            admin={admin}
            semaine={s}
            surFait={(texte) => {
              setAnnonce(texte);
              chargerSemaines();
            }}
          />
        ))}
    </div>
  );
}
