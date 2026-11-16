/**
 * Les contacts de l'école, sur sa fiche d'administration (fondateur, 16/11/2026 ; planches « Contacts de l'école, privé »,
 * page Fiche d'école du canevas). Toutes les personnes que les relais ont rencontrées sur ce site (fiche d'origine,
 * corrections, contre-visites) et celles que l'administration note elle-même. Privées : jamais publiées, jamais relues
 * par un relais. La carte montre le numéro, « WhatsApp » et « Appeler » ; « Gérer » ouvre la rubrique qui ajoute,
 * corrige et efface (droit d'effacement). Le numéro public de l'école reste à part (« Contact et inscriptions »).
 */
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { v2 } from '@/ui/v2/classes';
import { Bouton } from '@/ui/v2/admin';
import { IconeAjouter, IconeCadenas, IconeMessage, IconeTelephone } from '@/ui/shadcn/icones';
import {
  libellePersonne,
  personneVide,
  provenanceContact,
  versContactASaisir,
  versPersonneSaisie,
  type PersonneSaisie,
} from '../../modele/contacts';
import { lienWhatsApp } from '../../modele/whatsapp';
import type { ContactEcole, PortAdministration } from '../../modele/ports';
import { afficherTelephone } from '../../modele/telephone';
import { messageErreur } from './ChampPosition';
import { FormulairePersonne } from './Personnes';

/** La carte de la fiche : lecture seule, le numéro en grand. */
export function CarteContacts({
  contacts,
  numeroEnseigne,
  gerer,
  figee,
}: {
  contacts: ContactEcole[] | null;
  numeroEnseigne: string | null;
  gerer: () => void;
  figee: boolean;
}) {
  return (
    <section
      className="flex flex-col rounded-xl border-2 border-primary bg-card px-4 pt-4 pb-2"
      aria-label="Contacts de l’école, privé"
    >
      <h2 className="m-0 flex items-center justify-between gap-2 font-sans text-[17px] font-bold">
        <span className="flex items-center gap-1.5">
          <IconeCadenas className="size-4" aria-hidden />
          Contacts de l’école
        </span>
        <button
          type="button"
          onClick={gerer}
          disabled={figee}
          className={cn(v2.lien, 'min-h-10 text-[15px]')}
        >
          Gérer
        </button>
      </h2>
      <p className={cn(v2.mention, 'm-0 pb-1.5')}>
        Pour NTanova seulement · jamais publié, jamais relu par un relais
      </p>
      {contacts === null ? (
        <div className="my-2 h-20 rounded-lg bg-muted" aria-busy="true" />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0" aria-label="Personnes à contacter">
          {contacts.map((c) => (
            <Personne key={c.id} c={c} />
          ))}
          {contacts.length === 0 && (
            <li className="border-t border-border py-3 text-[15px] text-muted-foreground">
              Aucun contact noté pour ce site.
            </li>
          )}
        </ul>
      )}
      {numeroEnseigne && (
        <p className="m-0 border-t border-border py-2.5 text-sm text-muted-foreground">
          Lu sur l’enseigne (public) :{' '}
          <a className="font-bold text-primary" href={`tel:+${numeroEnseigne}`}>
            {afficherTelephone(numeroEnseigne)}
          </a>
        </p>
      )}
      {!figee && (
        <button
          type="button"
          onClick={gerer}
          className={cn(
            v2.lien,
            'min-h-11 w-full gap-1.5 border-t border-border text-[15px] no-underline',
          )}
        >
          <IconeAjouter className="size-4" aria-hidden />
          Ajouter un contact
        </button>
      )}
    </section>
  );
}

function Personne({ c }: { c: ContactEcole }) {
  const whatsapp = c.whatsapp ? lienWhatsApp(c.whatsapp) : null;
  return (
    <li className="flex flex-col gap-1.5 border-t border-border py-3">
      <b className="text-[15px]">{libellePersonne(c)}</b>
      {c.whatsapp ? (
        <>
          <span className="text-xl font-bold tracking-wide tabular-nums">
            {afficherTelephone(c.whatsapp)}
          </span>
          <span className="flex gap-2">
            {whatsapp && (
              <a
                className={cn(v2.bouton, 'h-10 flex-1 text-sm')}
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconeMessage className="size-4" aria-hidden />
                WhatsApp
              </a>
            )}
            <a
              className={cn(v2.boutonSecondairePetit, 'h-10 flex-1 text-sm')}
              href={`tel:+${c.whatsapp}`}
            >
              <IconeTelephone className="size-4" aria-hidden />
              Appeler
            </a>
          </span>
        </>
      ) : (
        <span className="text-sm text-muted-foreground">Pas de numéro (pas d’accord donné).</span>
      )}
      <span className={v2.mention}>{provenanceContact(c)}</span>
      {c.note && <span className="text-sm italic">« {c.note} »</span>}
    </li>
  );
}

type Edition = { mode: 'ajout' } | { mode: 'correction'; contact: ContactEcole } | null;

/** La rubrique « Gérer » : ajouter, corriger, effacer, une personne à la fois. */
export function GererContacts({
  admin,
  ecoleId,
  surChangement,
  surOccupation,
}: {
  admin: PortAdministration;
  ecoleId: string;
  surChangement: (texte: string) => void;
  surOccupation: (occupe: boolean) => void;
}) {
  const [contacts, setContacts] = useState<ContactEcole[] | null>(null);
  const [edition, setEdition] = useState<Edition>(null);
  const [aEffacer, setAEffacer] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const relire = async () => setContacts(await admin.contactsDeLEcole(ecoleId));
  useEffect(() => {
    let vivant = true;
    admin
      .contactsDeLEcole(ecoleId)
      .then((l) => vivant && setContacts(l))
      .catch((e: unknown) => vivant && setErreur(messageErreur(e)));
    return () => {
      vivant = false;
    };
  }, [admin, ecoleId]);

  const enregistrer = async (saisie: PersonneSaisie): Promise<void> => {
    setErreur(null);
    surOccupation(true);
    try {
      const contact = versContactASaisir(saisie);
      if (edition?.mode === 'correction') {
        await admin.corrigerContact(edition.contact.id, contact);
        surChangement('Le contact est corrigé.');
      } else {
        await admin.ajouterContactEcole(ecoleId, contact);
        surChangement('Le contact est ajouté.');
      }
      await relire();
      setEdition(null);
    } finally {
      surOccupation(false);
    }
  };

  const effacer = async (c: ContactEcole) => {
    setErreur(null);
    setEnCours(true);
    surOccupation(true);
    try {
      await admin.effacerContact(c.id, null);
      await relire();
      surChangement('Le contact est effacé.');
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
      setAEffacer(null);
      surOccupation(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className={cn(v2.mention, 'm-0')}>
        Les personnes rencontrées par les relais sur ce site, et celles que tu notes toi-même.
        Jamais publiées. Le numéro public de l’école se règle dans « Contact et inscriptions » : il
        exige l’accord daté de la direction.
      </p>
      {erreur && (
        <p className={v2.erreur} role="alert">
          {erreur}
        </p>
      )}
      {contacts === null ? (
        <div className="h-24 rounded-xl bg-muted" aria-busy="true" />
      ) : (
        <ul
          className="m-0 flex list-none flex-col overflow-hidden rounded-xl border border-border bg-card p-0"
          aria-label="Personnes à contacter"
        >
          {contacts.length === 0 && (
            <li className="px-4 py-3 text-[15px] text-muted-foreground">Aucun contact noté.</li>
          )}
          {contacts.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0"
            >
              <span className="flex items-start justify-between gap-2">
                <b>{libellePersonne(c)}</b>
                <span className={v2.pastilleNeutre}>
                  {c.source === 'relais' ? 'Relais' : 'Administration'}
                </span>
              </span>
              <span className="font-bold">
                {c.whatsapp ? afficherTelephone(c.whatsapp) : 'Pas de numéro'}
              </span>
              <span className={v2.mention}>{provenanceContact(c)}</span>
              {c.note && <span className="text-sm italic">« {c.note} »</span>}
              {aEffacer === c.id ? (
                <span className={v2.actions}>
                  <Bouton
                    enCours={enCours}
                    texteEnCours="Suppression…"
                    className={v2.petit}
                    variante="danger"
                    onClick={() => void effacer(c)}
                  >
                    Confirmer : effacer ce contact (droit d’effacement)
                  </Bouton>
                  <button
                    type="button"
                    className={v2.boutonSecondairePetit}
                    onClick={() => setAEffacer(null)}
                  >
                    Annuler
                  </button>
                </span>
              ) : (
                <span className="flex flex-wrap gap-x-4">
                  <button
                    type="button"
                    className={v2.lien}
                    onClick={() => setEdition({ mode: 'correction', contact: c })}
                  >
                    Corriger
                  </button>
                  <button
                    type="button"
                    className={cn(v2.lien, 'text-destructive')}
                    onClick={() => setAEffacer(c.id)}
                  >
                    Effacer (droit d’effacement)
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {edition ? (
        <FormulairePersonne
          key={edition.mode === 'correction' ? edition.contact.id : 'ajout'}
          nom={edition.mode === 'correction' ? 'Corriger le contact' : 'Nouveau contact'}
          depart={
            edition.mode === 'correction' ? versPersonneSaisie(edition.contact) : personneVide()
          }
          enregistrer={enregistrer}
          annuler={() => setEdition(null)}
          surErreur={setErreur}
        />
      ) : (
        <button
          type="button"
          className={cn(v2.boutonSecondairePetit, 'w-fit')}
          onClick={() => setEdition({ mode: 'ajout' })}
          disabled={contacts === null}
        >
          <IconeAjouter className="size-4" aria-hidden />
          Ajouter un contact
        </button>
      )}
    </div>
  );
}
