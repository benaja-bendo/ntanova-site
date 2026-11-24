/**
 * L'amorce des six activités de « S'orienter » (refonte publique, lot 2) : quelques lignes, chargées avec la page. Elle montre
 * la première activité, puis charge le script des réponses (`activites.ts`) à l'approche de la carte, au focus ou au premier
 * appui ; un appui donné avant la fin du chargement est rejoué, une seule fois. Si le chargement échoue, la carte revient au
 * renvoi vers les dix domaines. Rien ne quitte le navigateur.
 */
export function amorcer(racine: HTMLElement): void {
  const question = racine.querySelector<HTMLElement>('[data-question]');
  const sansScript = racine.querySelector<HTMLElement>('[data-sans-script]');
  if (!question || !sansScript) return;
  let charge: Promise<boolean> | null = null;
  let pret = false;
  const charger = (): Promise<boolean> =>
    (charge ??= import('./activites')
      .then((m) => {
        m.demarrer(racine);
        pret = true;
        return true;
      })
      .catch(() => {
        delete racine.dataset.script;
        question.hidden = true;
        sansScript.hidden = false;
        return false;
      }));

  // Un appui avant que le script des réponses soit là : il est gardé, puis rejoué quand le script répond.
  const auPremierAppui = (ev: MouseEvent) => {
    const bouton = (ev.target as Element | null)?.closest<HTMLElement>('[data-reponse]');
    if (!bouton || pret) return;
    racine.removeEventListener('click', auPremierAppui);
    racine.setAttribute('aria-busy', 'true');
    void charger().then((ok) => {
      racine.removeAttribute('aria-busy');
      if (ok) bouton.click();
    });
  };
  racine.addEventListener('click', auPremierAppui);
  racine.addEventListener('focusin', () => void charger(), { once: true });

  if ('IntersectionObserver' in window) {
    const observateur = new IntersectionObserver(
      (entrees) => {
        if (!entrees.some((e) => e.isIntersecting)) return;
        observateur.disconnect();
        void charger();
      },
      { rootMargin: '400px 0px' },
    );
    observateur.observe(racine);
  } else void charger();

  question.hidden = false;
  racine.dataset.script = 'pret';
}
