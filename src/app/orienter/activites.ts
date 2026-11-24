/**
 * Les réponses aux six activités de « S'orienter » (refonte publique, lot 2), chargées par l'amorce à l'approche de la carte.
 * Les règles sont celles de `modele/orientation.ts` ; ce script ne fait que montrer ce que la page a déjà écrit : l'activité
 * en cours, puis les pistes des activités aimées, sans doublon. L'état vit ici, le temps de la page : ni adresse, ni stockage,
 * ni cookie, ni réseau, ni journal. « Recommencer » le remet à zéro.
 */
import {
  ACTIVITES,
  estFini,
  etatDeDepart,
  pistesDesReponses,
  repondre,
  type Reponse,
} from '../../modele/orientation';

const REPONSES: readonly Reponse[] = ['oui', 'peut', 'non'];

export function demarrer(racine: HTMLElement): void {
  const un = <T extends HTMLElement>(selecteur: string) => racine.querySelector<T>(selecteur)!;
  const tous = (selecteur: string) => [...racine.querySelectorAll<HTMLElement>(selecteur)];
  const question = un('[data-question]');
  const resultat = un('[data-resultat]');
  const numero = un('[data-numero]');
  const barre = un('[data-barre]');
  const annonce = un('[data-annonce]');
  const progression = un('[data-progression]');
  const titre = un('[data-titre-resultat]');
  const aucune = un('[data-aucune]');
  const activites = tous('[data-activite]');
  const pistes = tous('[data-piste]');
  const total = activites.length;
  let etat = etatDeDepart();

  const montrer = () => {
    const rang = etat.reponses.length;
    const fini = estFini(etat, total);
    question.hidden = fini;
    resultat.hidden = !fini;
    if (!fini) {
      activites.forEach((a, i) => (a.hidden = i !== rang));
      numero.textContent = String(rang + 1);
      barre.style.width = `${Math.round((rang / total) * 100)}%`;
      return;
    }
    const liste = pistesDesReponses(etat.reponses, ACTIVITES);
    for (const li of pistes) {
      const piste = liste.find((p) => p.activite === Number(li.dataset.piste));
      li.hidden = !piste;
      if (!piste) continue;
      for (const d of li.querySelectorAll<HTMLElement>('[data-domaine]'))
        d.hidden = !piste.domaines.includes(d.dataset.domaine ?? '');
      li.querySelector<HTMLElement>('[data-deja]')!.hidden = piste.domaines.length > 0;
    }
    aucune.hidden = liste.length > 0;
  };

  const annoncer = () => {
    const rang = etat.reponses.length;
    annonce.textContent = estFini(etat, total)
      ? ''
      : `Activité ${rang + 1} sur ${total} : ${activites[rang]?.querySelector('figcaption')?.textContent ?? ''}`;
  };

  racine.addEventListener('click', (ev) => {
    const cible = (ev.target as Element | null)?.closest<HTMLElement>(
      '[data-reponse], [data-recommencer]',
    );
    if (!cible) return;
    if (cible.hasAttribute('data-recommencer')) {
      etat = etatDeDepart();
      montrer();
      annoncer();
      progression.focus();
      return;
    }
    // Le second clic d'un double clic ne répond pas à la question qui vient de paraître.
    if (ev.detail > 1) return;
    const reponse = cible.dataset.reponse as Reponse;
    if (!REPONSES.includes(reponse)) return;
    const suivant = repondre(etat, etat.reponses.length, reponse, performance.now(), total);
    if (suivant === etat) return;
    etat = suivant;
    montrer();
    annoncer();
    if (estFini(etat, total)) titre.focus();
  });

  montrer();
}
