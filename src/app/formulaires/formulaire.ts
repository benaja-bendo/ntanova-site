/**
 * Le script des formulaires publics, Contact et annuaire (refonte, lot 3C) : natif, sans cadre, 10 Ko gzip au plus avec ses imports
 * (`pnpm poids`). Le HTML dit tout ; ce script montre, contrôle avant d'envoyer, envoie, et dit ce que le serveur a répondu, rien
 * de plus. Les règles sont dans `modele/demandes.ts` et `modele/envoi-public.ts`.
 *
 * Ce qui ne s'affaiblit pas : un seul envoi en vol ; aucun renvoi automatique ; « enregistré » seulement avec une référence du
 * serveur ; un refus ou une coupure garde la saisie, la clé et la révision ; rien de ce qui est écrit ne passe dans une adresse, la
 * console ou `localStorage`.
 */
import {
  controler,
  revisionDeLEnvoi,
  type Contenu,
  type Erreurs,
  type Issue,
  type Nature,
} from '../../modele/demandes';
import {
  aReprendre,
  BROUILLON_MS,
  cleDeDemande,
  coordonneeMasquee,
  enAttente,
  estNature,
  lireArrivee,
  lireBrouillon,
  nouveauBrouillon,
  type Brouillon,
  type Enveloppe,
  type FicheConcernee,
  type PortDemandes,
} from '../../modele/envoi-public';
import { cheminFicheConcernee } from '../../modele/liens-demandes';

type Controle = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const estCase = (c: Controle): c is HTMLInputElement => c.type === 'radio' || c.type === 'checkbox';

/** Le stockage de l'onglet, quand le navigateur le permet. Sans lui, l'envoi marche ; la page dit que la saisie n'est pas gardée. */
function stockage(cle: string) {
  const tenter = <T>(geste: () => T): T | null => {
    try {
      return geste();
    } catch {
      return null;
    }
  };
  return {
    lire: () => tenter(() => sessionStorage.getItem(cle)),
    ecrire: (texte: string) => tenter(() => (sessionStorage.setItem(cle, texte), true)) === true,
    effacer: () => void tenter(() => sessionStorage.removeItem(cle)),
  };
}

export function demarrer(racine: HTMLElement, port: PortDemandes): void {
  const un = <T extends HTMLElement = HTMLElement>(nom: string) =>
    racine.querySelector<T>(`[data-${nom}]`);
  const tous = <T extends HTMLElement = HTMLElement>(nom: string) =>
    racine.querySelectorAll<T>(`[data-${nom}]`);
  const form = un<HTMLFormElement>('form');
  const champs = un<HTMLFieldSetElement>('champs');
  const dialogue = un<HTMLDialogElement>('dialogue');
  if (!form || !champs) return;

  const annuaire = racine.dataset.formulaire === 'annuaire';
  const garde = stockage(`ntanova-brouillon-${racine.dataset.formulaire}`);
  const arrivee = lireArrivee(new URLSearchParams(location.search));
  const controles = [...form.querySelectorAll<Controle>('[data-champ]')];
  const piege = un<HTMLInputElement>('piege');

  let b: Brouillon = nouveauBrouillon(arrivee.origine, annuaire ? null : 'contact');
  let enVol = false;
  /** Un brouillon attend un choix, ou une confirmation est affichée : la page ne doit rien écrire par-dessus. */
  let suspendu = false;
  let passeEnCours: Promise<Enveloppe | 'ferme' | null> | null = null;
  /** Une seule préparation par demande : sans réponse, c'est l'envoi qui redemande, pas chaque lettre tapée. */
  const preparees = new Set<string>();

  const montrer = (e: HTMLElement | null, visible: boolean) => {
    if (e) e.hidden = !visible;
  };
  const ecrire = (nom: string, texte: string) =>
    tous(nom).forEach((e) => {
      e.textContent = texte;
    });
  /** Montre chaque élément dont la liste (`data-natures`…) contient la valeur. */
  const selon = (nom: string, cle: string, valeur: string) =>
    tous(nom).forEach((e) => montrer(e, (e.dataset[cle] ?? '').split(' ').includes(valeur)));
  const visible = (e: Element) => e.closest('[hidden]') === null;
  const valeur = (champ: string): string =>
    controles.reduce((trouve, c) => {
      if (c.dataset.champ !== champ || !pourCetteNature(c)) return trouve;
      return estCase(c) ? (c.checked ? c.value : trouve) : c.value;
    }, '');
  /** Le libellé choisi, déjà écrit dans la page. */
  const motChoisi = (champ: string): string => {
    for (const c of controles) {
      if (c.dataset.champ !== champ || !pourCetteNature(c)) continue;
      if (c instanceof HTMLSelectElement && c.value) return c.selectedOptions[0]?.text ?? '';
      if (estCase(c) && c.checked) return c.parentElement?.textContent?.trim() ?? '';
    }
    return '';
  };
  /** Ce champ appartient à la demande de la page : les champs d'une autre nature, cachés, gardent leur texte et ne partent pas. */
  function pourCetteNature(c: Element): boolean {
    for (let e = c.closest<HTMLElement>('[data-natures]'); e;) {
      if (!(e.dataset.natures ?? '').split(' ').includes(b.nature ?? 'aucune')) return false;
      e = e.parentElement?.closest<HTMLElement>('[data-natures]') ?? null;
    }
    return true;
  }

  // La page suit l'état -----------------------------------------------------------------------------

  function rafraichir(): void {
    selon('natures', 'natures', b.nature ?? 'aucune');
    selon('si-reponse', 'siReponse', valeur('reponse'));
    selon('si-sujet', 'siSujet', valeur('sujet'));
    selon('si-info', 'siInfo', valeur('information'));
    const fiche = annuaire && (b.nature === 'erreur' || b.nature === 'retrait') ? b.fiche : null;
    montrer(un('fiche-choisie'), fiche !== null);
    montrer(un('fiche-libre'), fiche === null);
    ecrire('fiche-nom', b.fiche?.nom ?? '');
    ecrire('fiche-lieu', b.fiche?.lieu ?? '');
    tous<HTMLAnchorElement>('retour-fiche').forEach((a) => {
      montrer(a, b.fiche !== null);
      if (b.fiche) {
        a.href = b.fiche.lien;
        a.querySelector('span')!.textContent = `Retour à la fiche ${b.fiche.nom}`;
      }
    });
  }

  function lireChamps(): Contenu {
    const c: Contenu = { origine: b.origine };
    const niveaux: string[] = [];
    for (const e of controles) {
      const champ = e.dataset.champ as string;
      if (champ === 'nature' || !pourCetteNature(e)) continue;
      const si = e.closest<HTMLElement>('[data-si-reponse]')?.dataset.siReponse;
      if (si !== undefined && !si.split(' ').includes(valeur('reponse'))) continue;
      if (estCase(e)) {
        if (!e.checked) continue;
        if (champ === 'niveaux') niveaux.push(e.value);
        else Object.assign(c, { [champ]: champ === 'deLEcole' ? true : e.value });
      } else if (!(champ === 'nomEcole' && b.fiche && b.nature !== 'absente')) {
        Object.assign(c, { [champ]: e.value });
      }
    }
    if (niveaux.length > 0) c.niveaux = niveaux;
    if (b.fiche && (b.nature === 'erreur' || b.nature === 'retrait')) c.fiche = b.fiche.id;
    return c;
  }

  function garder(): void {
    if (suspendu) return;
    b.champs = {};
    for (const c of controles) {
      // La nature n'est pas un texte à reprendre : elle est déjà dans le brouillon.
      if (c.dataset.champ === 'nature') continue;
      const v = estCase(c) ? c.checked : c.value;
      const nom = c.type === 'radio' ? `${c.name}=${c.value}` : c.name;
      if (v !== '' && v !== false) b.champs[nom] = v;
    }
    b.ecritLe = Date.now();
    const gardee = garde.ecrire(JSON.stringify(b));
    montrer(un('note-brouillon'), gardee);
    montrer(un('note-sans-brouillon'), !gardee);
  }

  function remplir(): void {
    for (const c of controles) {
      const v = b.champs[c.type === 'radio' ? `${c.name}=${c.value}` : c.name];
      if (estCase(c)) c.checked = v === true;
      else c.value = typeof v === 'string' ? v : '';
    }
    for (const c of controles) {
      if (c.dataset.champ === 'nature' && estCase(c)) c.checked = c.value === b.nature;
    }
  }

  /** Les champs tels qu'ils sont partis : reprendre une demande non confirmée renvoie exactement le même texte. */
  function remplirDepuis(contenu: Contenu): void {
    for (const c of controles) {
      const champ = c.dataset.champ as keyof Contenu;
      if ((champ as string) === 'nature' || !pourCetteNature(c)) continue;
      const v = contenu[champ];
      if (estCase(c)) {
        c.checked = Array.isArray(v)
          ? v.includes(c.value)
          : champ === 'deLEcole'
            ? v === true
            : v === c.value;
      } else c.value = typeof v === 'string' ? v : '';
    }
  }

  // Les erreurs, sous les champs et en résumé ---------------------------------------------------------

  const groupes = () => [...tous('groupe')].filter((g) => pourCetteNature(g) && visible(g));

  function direErreur(groupe: HTMLElement, texte: string): void {
    const zone = groupe.querySelector<HTMLElement>('[data-erreur]');
    if (!zone) return;
    zone.textContent = texte;
    montrer(zone, texte !== '');
    groupe.querySelectorAll<Controle>('[data-champ]').forEach((c) => {
      if (texte) c.setAttribute('aria-invalid', 'true');
      else c.removeAttribute('aria-invalid');
    });
  }

  function effacerErreurs(): void {
    tous('groupe').forEach((g) => direErreur(g, ''));
    montrer(un('resume'), false);
  }

  function direErreurs(erreurs: Partial<Record<string, string>>): void {
    effacerErreurs();
    const liste = un('resume-liste');
    const resume = un('resume');
    if (!liste || !resume) return;
    liste.textContent = '';
    const restantes = { ...erreurs };
    for (const g of groupes()) {
      const champ = g.dataset.groupe as string;
      const code = restantes[champ];
      if (!code) continue;
      delete restantes[champ];
      const texte = g.dataset[code] ?? g.dataset.format ?? g.dataset.requis ?? 'À corriger.';
      direErreur(g, texte);
      const aller = document.createElement('button');
      aller.type = 'button';
      aller.textContent = `${g.dataset.libelle} : ${texte}`;
      aller.addEventListener('click', () => {
        [...g.querySelectorAll<Controle>('[data-champ]')].find(visible)?.focus();
      });
      const li = document.createElement('li');
      li.append(aller);
      liste.append(li);
    }
    // Une erreur sans champ à l'écran : l'envoi entier.
    if (Object.keys(restantes).length > 0) {
      const li = document.createElement('li');
      li.textContent =
        restantes.demande === 'trop_long'
          ? 'Le texte est trop long pour être envoyé : raccourcissez-le.'
          : 'L’envoi n’a pas été accepté. Votre texte est gardé ici.';
      liste.append(li);
    }
    const n = liste.childElementCount;
    ecrire(
      'resume-titre',
      n === 1
        ? 'Une information manque ou est à corriger :'
        : `${n} informations manquent ou sont à corriger :`,
    );
    montrer(resume, true);
    resume.focus();
  }

  function controlerTout(): { contenu: Contenu; erreurs: Erreurs } | null {
    if (b.nature === null) {
      direErreurs({ nature: 'requis' });
      return null;
    }
    const lu = controler(b.nature, lireChamps());
    if (Object.keys(lu.erreurs).length > 0) {
      direErreurs(lu.erreurs);
      return null;
    }
    effacerErreurs();
    return lu;
  }

  // L'envoi ------------------------------------------------------------------------------------------

  const cleIci = () => cleDeDemande(b.nature as Nature, b.fiche);

  /** L'enveloppe de la demande de la page : la sienne, sinon un laissez-passer neuf. Aucune ligne n'est écrite par cette demande. */
  async function enveloppe(): Promise<Enveloppe | 'ferme' | null> {
    const cle = cleIci();
    const connue = b.enveloppes[cle];
    if (connue) return connue;
    const r = await port.demanderLaissezPasser();
    if (r.genre !== 'accorde') return r.genre === 'ferme' ? 'ferme' : null;
    // Deux demandes simultanées : la première arrivée garde sa clé.
    const e = (b.enveloppes[cle] ??= {
      passe: r.passe,
      fiche: b.fiche,
      dernier: null,
      attente: false,
    });
    garder();
    return e;
  }

  /** Au premier champ rempli : on apprend tôt que les envois sont fermés, avant que la personne n'écrive tout. */
  function preparer(): void {
    if (enVol || suspendu || b.nature === null || b.enveloppes[cleIci()] || passeEnCours) return;
    if (preparees.has(cleIci())) return;
    preparees.add(cleIci());
    passeEnCours = enveloppe();
    void passeEnCours.then((e) => {
      passeEnCours = null;
      if (e === 'ferme' && !enVol && !suspendu) direRefus('ferme', null, false);
    });
  }

  function direRefus(cas: string, deja: string | null, focus = true): void {
    const bloc = un('refus');
    if (!bloc) return;
    let gestes = '';
    tous('cas').forEach((c) => {
      montrer(c, c.dataset.cas === cas);
      if (c.dataset.cas === cas) gestes = c.dataset.gestes ?? '';
    });
    tous('geste').forEach((g) => montrer(g, gestes.split(' ').includes(g.dataset.geste ?? '')));
    montrer(un('refus-enregistree'), deja !== null);
    ecrire('refus-reference', deja ?? '');
    ecrire('copie', '');
    montrer(bloc, true);
    // Une fiche disparue se corrige puis s'envoie ; pour le reste, les gestes du bloc remplacent le bouton.
    montrer(un('envoyer'), cas === 'ecole_inconnue');
    montrer(un('autre'), false);
    if (focus) bloc.focus();
  }

  function oublierRefus(): void {
    montrer(un('refus'), false);
    montrer(un('envoyer'), true);
    montrer(un('autre'), true);
  }

  function occuper(vol: boolean): void {
    enVol = vol;
    champs!.disabled = vol;
    tous<HTMLButtonElement>('effacer').forEach((b) => {
      b.disabled = vol;
    });
    const bouton = un('envoyer');
    bouton?.setAttribute('aria-busy', String(vol));
    montrer(un('envoyer-repos'), !vol);
    montrer(un('envoyer-vol'), vol);
    tous<HTMLButtonElement>('geste').forEach((g) => g.setAttribute('aria-busy', String(vol)));
    ecrire('statut', vol ? 'Envoi en cours, ne fermez pas la page.' : '');
  }

  async function envoyer(): Promise<void> {
    // Un seul envoi en vol : les appuis suivants sont ignorés, le bouton le dit (`aria-busy`).
    if (enVol || suspendu) return;
    const lu = controlerTout();
    if (!lu) return;
    occuper(true);
    let issue: Issue | 'ferme';
    try {
      // Une préparation en cours peut être celle d'une autre nature : seule l'enveloppe de cette demande compte.
      const e = (await passeEnCours) === 'ferme' ? 'ferme' : await enveloppe();
      if (e === 'ferme') issue = 'ferme';
      else if (e === null) issue = { genre: 'non_confirme' };
      else {
        const revision = revisionDeLEnvoi(e.dernier, lu.contenu);
        // Écrit AVANT l'envoi : un onglet rechargé pendant le vol reprend la même clé et la même révision.
        e.dernier = { revision, contenu: lu.contenu };
        e.attente = true;
        garder();
        issue = await port.envoyer({
          passe: e.passe,
          revision,
          nature: b.nature as Nature,
          contenu: lu.contenu,
          piege: piege?.value ?? '',
        });
      }
    } catch {
      issue = { genre: 'non_confirme' };
    }
    occuper(false);
    if (issue === 'ferme') direRefus('ferme', null);
    else if (issue.genre === 'enregistre') confirmer(issue, lu.contenu);
    else if (issue.genre === 'non_confirme') {
      garder();
      direRefus('non_confirme', null);
    } else refuser(issue);
  }

  function refuser(issue: Extract<Issue, { genre: 'refuse' }>): void {
    const e = b.enveloppes[cleIci()];
    // Ce texte n'est pas en base, le serveur l'a dit : plus rien n'est « en attente de confirmation ».
    if (e) e.attente = false;
    const deja = issue.dejaEnregistree;
    if (issue.code === 'refusee') {
      garder();
      oublierRefus();
      direErreurs(issue.erreurs ?? { demande: 'illisible' });
    } else if (issue.code === 'ecole_inconnue') {
      // La fiche n'est plus publiée : on la désigne en texte libre, sous la même clé.
      const avant = cleIci();
      b.fiche = null;
      if (e) {
        delete b.enveloppes[avant];
        b.enveloppes[cleIci()] ??= { ...e, fiche: null };
      }
      garder();
      rafraichir();
      direRefus('ecole_inconnue', deja, false);
      un('fiche-libre')?.querySelector<HTMLElement>('[data-champ]')?.focus();
    } else {
      garder();
      direRefus(issue.code === 'expiree' && deja ? 'expiree_connue' : issue.code, deja);
    }
  }

  function confirmer(issue: Extract<Issue, { genre: 'enregistre' }>, contenu: Contenu): void {
    const suite = issue.precedente !== null;
    const etat = suite
      ? 'suite'
      : issue.code === 'version_ancienne'
        ? 'ancienne'
        : issue.code === 'mise_a_jour'
          ? 'modifie'
          : 'enregistre';
    selon('codes', 'codes', etat);
    ecrire('ok-reference', issue.reference);
    ecrire('ok-precedente', issue.precedente ?? '');
    const canal = contenu.reponse;
    ecrire(
      'ok-reponse',
      canal === 'whatsapp' || canal === 'email'
        ? `Réponse demandée ${canal === 'email' ? 'par e-mail' : 'sur WhatsApp'} : ${coordonneeMasquee(canal, String(contenu.coordonnee))}`
        : 'Vous n’avez pas demandé de réponse.',
    );
    ecrire(
      'ok-concerne',
      annuaire
        ? (b.fiche?.nom ?? [contenu.nomEcole, contenu.ville].filter(Boolean).join(', '))
        : motChoisi('sujet') || 'Non précisé',
    );
    ecrire('ok-retirer', motChoisi('aRetirer'));

    // Effacé après confirmation : cette demande, et elle seule. Un autre texte non confirmé reste, et la page le dit.
    delete b.enveloppes[cleIci()];
    const reste = enAttente(b);
    b.champs = {};
    if (reste) garde.ecrire(JSON.stringify({ ...b, ecritLe: Date.now() }));
    else garde.effacer();
    suspendu = true;
    montrer(un('autre-attente'), reste !== null);
    montrer(form, false);
    montrer(un('autre'), false);
    montrer(un('confirmation'), true);
    un('ok-titre')?.focus();
  }

  /** Un formulaire neuf : aucune clé, aucun texte, aucune fiche. */
  function recommencer(): void {
    // Le serveur peut déjà avoir reçu : garder la clé tant que ce vol n'a pas répondu.
    if (enVol) return;
    garde.effacer();
    b = nouveauBrouillon('direct', annuaire ? null : 'contact');
    suspendu = false;
    form!.reset();
    effacerErreurs();
    oublierRefus();
    montrer(un('confirmation'), false);
    montrer(un('reprise'), false);
    montrer(un('note-sujet'), false);
    montrer(form, true);
    rafraichir();
    controles.find(visible)?.focus();
  }

  /** Reprendre la demande restée sans confirmation, telle qu'elle est partie. */
  function reprendreLAttente(): void {
    const reste = enAttente(b);
    const e = reste && b.enveloppes[reste.cle];
    if (!reste || !e?.dernier) return recommencer();
    suspendu = false;
    b.nature = reste.nature;
    b.fiche = e.fiche;
    form!.reset();
    remplir();
    remplirDepuis(e.dernier.contenu);
    montrer(un('confirmation'), false);
    montrer(form, true);
    rafraichir();
    garder();
    direRefus('non_confirme', null);
  }

  // Les gestes ---------------------------------------------------------------------------------------

  const changerNature = (nature: Nature) => {
    b.nature = nature;
    effacerErreurs();
    oublierRefus();
    rafraichir();
    garder();
    // Revenir à une demande partie sans confirmation : la page le redit, et « Réessayer » porte sa clé.
    if (b.enveloppes[cleIci()]?.attente) direRefus('non_confirme', null, false);
  };

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void envoyer();
  });
  form.addEventListener('input', (ev) => {
    const c = ev.target as Controle;
    if (c.dataset.champ === undefined) return;
    if (c.dataset.champ === 'nature' && estNature(c.value)) changerNature(c.value);
    else {
      if (c.dataset.champ === 'sujet') montrer(un('note-sujet'), false);
      rafraichir();
      garder();
    }
    // L'erreur s'efface dès qu'on corrige ; le résumé, quand il n'en reste aucune.
    const groupe = c.closest<HTMLElement>('[data-groupe]');
    if (groupe) direErreur(groupe, '');
    if (![...tous('erreur')].some(visible)) montrer(un('resume'), false);
    preparer();
  });
  // Le format d'une coordonnée se dit en quittant le champ, jamais pendant la frappe.
  form.addEventListener('focusout', (ev) => {
    const c = ev.target as Controle;
    const groupe = c.closest<HTMLElement>('[data-groupe="coordonnee"]');
    if (!groupe || enVol || c.value.trim() === '' || b.nature === null) return;
    const code = controler(b.nature, lireChamps()).erreurs.coordonnee;
    if (code) direErreur(groupe, groupe.dataset[code] ?? '');
  });
  const auClic = (nom: string, geste: () => void) =>
    tous(nom).forEach((e) => e.addEventListener('click', geste));
  auClic('effacer', recommencer);
  // Un autre lien a mené ici : effacer l'ancien texte ouvre le formulaire que ce lien demandait.
  auClic('abandonner', () => {
    recommencer();
    b.origine = arrivee.origine;
    void arriver();
  });
  auClic('nouvelle', () => {
    if (enAttente(b)) reprendreLAttente();
    else recommencer();
  });
  auClic('reprendre-autre', reprendreLAttente);
  auClic('fiche-changer', () => {
    b.fiche = null;
    oublierRefus();
    rafraichir();
    garder();
    un('fiche-libre')?.querySelector<HTMLElement>('[data-champ]')?.focus();
  });
  auClic('vers-retrait', () => {
    const photo = valeur('information') === 'photo';
    changerNature('retrait');
    for (const c of controles) {
      if (!estCase(c)) continue;
      if (c.dataset.champ === 'nature') c.checked = c.value === 'retrait';
      if (c.dataset.champ === 'aRetirer') c.checked = c.value === (photo ? 'photo' : 'tel');
    }
    rafraichir();
    garder();
    form.querySelector<HTMLElement>('[name="nature"]:checked')?.focus();
  });
  tous('geste').forEach((g) =>
    g.addEventListener('click', () => {
      if (enVol) return;
      if (g.dataset.geste === 'reessayer') void envoyer();
      else if (g.dataset.geste === 'copier') void copier();
      else if (controlerTout()) {
        if (dialogue?.showModal) dialogue.showModal();
        else if (confirm('Envoyer comme un nouveau message ?')) nouveauMessage();
      }
    }),
  );
  auClic('dialogue-non', () => dialogue?.close());
  auClic('dialogue-oui', () => {
    dialogue?.close();
    nouveauMessage();
  });

  /** Une clé neuve, sur ce seul geste ; l'ancienne demande garde ce qu'elle a reçu. */
  function nouveauMessage(): void {
    delete b.enveloppes[cleIci()];
    void envoyer();
  }

  /** Ce qui est écrit, sans la coordonnée ; pour un retrait, l'école et ce qu'il faut retirer seulement. */
  async function copier(): Promise<void> {
    const c = lireChamps();
    const lignes = [
      b.nature === 'absente' || !b.fiche ? c.nomEcole : b.fiche.nom,
      c.ville,
      c.repere,
      ...(b.nature === 'retrait'
        ? [motChoisi('aRetirer')]
        : [c.message, c.correction, c.autreChose]),
    ];
    try {
      await navigator.clipboard.writeText(lignes.filter(Boolean).join('\n'));
      ecrire('copie', 'Texte copié.');
    } catch {
      ecrire('copie', 'Copie impossible ici : sélectionnez votre texte dans le champ.');
    }
  }

  // Au chargement --------------------------------------------------------------------------------------

  async function lireFiche(numero: string): Promise<FicheConcernee | null> {
    try {
      const r = await fetch(cheminFicheConcernee(numero), { credentials: 'omit' });
      if (!r.ok) return null;
      const f = (await r.json()) as FicheConcernee;
      return f.numero === numero ? f : null;
    } catch {
      return null;
    }
  }

  /** Ce que dit l'adresse d'arrivée, pour un formulaire neuf : un choix que la personne vient de faire, et sa fiche. */
  async function arriver(): Promise<void> {
    if (annuaire && arrivee.nature) b.nature = arrivee.nature;
    for (const c of controles) {
      if (c.dataset.champ === 'nature' && estCase(c)) c.checked = c.value === b.nature;
      if (c.dataset.champ === 'sujet' && arrivee.sujet) {
        c.value = arrivee.sujet;
        montrer(un('note-sujet'), true);
      }
    }
    rafraichir();
    if (!annuaire || !arrivee.ecole) return;
    const fiche = await lireFiche(arrivee.ecole);
    // La personne a pu déjà désigner l'école, commencer ou reprendre autre chose.
    if (!fiche || b.fiche || suspendu || b.champs['ecole-concernee']) return;
    b.fiche = fiche;
    rafraichir();
  }

  const gardeLu = garde.lire();
  const garde24h = lireBrouillon(gardeLu, Date.now());
  if (gardeLu !== null && (!garde24h || !aReprendre(garde24h))) garde.effacer();
  // Le stockage refusé se voit avant d'écrire, pas après avoir perdu un texte.
  if (!garde24h && !garde.ecrire('')) {
    montrer(un('note-brouillon'), false);
    montrer(un('note-sans-brouillon'), true);
  } else if (!garde24h) garde.effacer();
  document.addEventListener('visibilitychange', () => {
    const lu = garde.lire();
    if (lu !== null && !lireBrouillon(lu, Date.now())) garde.effacer();
  });
  setTimeout(() => {
    if (!lireBrouillon(garde.lire(), Date.now())) garde.effacer();
  }, BROUILLON_MS + 1000);

  montrer(un('sans-script'), false);
  if (garde24h && aReprendre(garde24h)) {
    suspendu = true;
    montrer(un('reprise'), true);
    montrer(un('reprise-attente'), enAttente(garde24h) !== null);
    auClic('reprendre', () => {
      b = garde24h;
      suspendu = false;
      remplir();
      montrer(un('reprise'), false);
      montrer(form, true);
      montrer(un('autre'), true);
      rafraichir();
      garder();
      const attente = enAttente(b);
      if (attente && b.nature && attente.cle === cleIci()) direRefus('non_confirme', null);
      else if (attente && Object.keys(b.champs).length === 0) reprendreLAttente();
      else controles.find(visible)?.focus();
    });
  } else {
    montrer(form, true);
    montrer(un('autre'), true);
    void arriver();
  }
  racine.dataset.etat = 'pret';
}
