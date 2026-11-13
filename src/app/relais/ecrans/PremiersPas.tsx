/**
 * « Tester mon téléphone » (ticket #79) : la position, la photo et la connexion, AVANT la première fiche. Un relais ne
 * découvrait une position refusée ou une photo qui ne part pas que devant l'école, souvent sans réseau.
 *
 * Rien n'est envoyé : ni photo, ni position. La photo de test est allégée, rangée dans la base du téléphone puis relue
 * comme le fera l'envoi (le chemin qui a échoué sur iPhone), puis effacée. Le résultat de chaque test est écrit au
 * journal (`test_*`) : l'administration le lit dans « Santé » avant que le relais soit sur le terrain.
 *
 * Rien n'est obligatoire : le relais peut passer ses premiers pas et commencer une fiche.
 */
import { useState } from 'react';
import { lireErreurPosition } from '../../../modele/aide-position';
import { limiterLeTemps } from '../../../modele/delai';
import { lireLesOctets } from '../../../modele/octets-photo';
import {
  messageDeSupportPremiersPas,
  testsTermines,
  verdictConnexion,
  verdictPhoto,
  verdictPosition,
  type ResultatsTests,
  type Verdict,
} from '../../../modele/premiers-pas';
import { PRECISION_SUFFISANTE_M } from '../../../modele/geo';
import { avecMessage } from '../../../modele/whatsapp';
import { garder, lireMemoire, oublier } from '../base-locale';
import { Bandeau, Entete, Navigation } from '../composants';
import { aller, useRelais } from '../contexte';
import { environnementActuel, etatDeLAutorisation } from '../environnement';
import { journaliser } from '../journal';
import { alleger } from '../photo';
import { mesurerPosition } from '../position';
import { useReprisePosition } from '../reprise-position';
import { AidePosition } from './AidePosition';

type Test = 'position' | 'photo' | 'connexion';

function LeVerdict({ verdict }: { verdict: Verdict }) {
  return (
    <Bandeau ton={verdict.bon ? 'envoye' : 'attente'} icone={verdict.bon ? 'coche' : 'alerte'}>
      <p role="status">{verdict.phrase}</p>
    </Bandeau>
  );
}

export function PremiersPas() {
  const { adaptateurs, synchroniser, lienNTanova } = useRelais();
  const env = environnementActuel();
  const [resultats, setResultats] = useState<ResultatsTests>({});
  const [enCours, setEnCours] = useState<Test | null>(null);
  const [blocage, setBlocage] = useState<
    'refusee' | 'indisponible' | 'trop_longue' | 'absente' | null
  >(null);
  const [erreurPhoto, setErreurPhoto] = useState<string | null>(null);

  const noter = (suite: Partial<ResultatsTests>) => {
    setResultats((avant) => ({ ...avant, ...suite }));
    // Lot H : « Compte » dit le dernier résultat de chaque test (« Mon téléphone est prêt », ou ce qui a échoué).
    void lireMemoire('testsDuTelephone').then((avant) =>
      garder('testsDuTelephone', { ...(avant ?? {}), ...suite }),
    );
    // Le journal part avec la prochaine synchronisation : le résultat se lit chez NTanova.
    synchroniser();
  };

  const testerLaPosition = () => {
    setBlocage(null);
    setEnCours('position');
    // Une mesure plus courte que celle d'une fiche : il s'agit de savoir si le téléphone la donne.
    const { fin } = mesurerPosition(() => {}, undefined, 8_000);
    fin
      .then((m) => {
        noter({ position: { ok: true, precisionM: m.precisionM } });
        void journaliser(
          'premiers-pas',
          m.precisionM <= PRECISION_SUFFISANTE_M
            ? 'test_position_ok'
            : 'test_position_approximative',
          `précision ${Math.round(m.precisionM)} m`,
        );
      })
      .catch((e: unknown) => {
        const code = lireErreurPosition(e instanceof Error ? e.message : undefined);
        setBlocage(code);
        noter({ position: { ok: false, erreur: code } });
        void etatDeLAutorisation().then((etat) =>
          journaliser(
            'premiers-pas',
            `test_position_${code}`,
            `autorisation : ${etat}${env.installee ? ' ; écran d’accueil' : ''}`,
          ),
        );
      })
      .finally(() => setEnCours(null));
  };

  // Le relais règle son téléphone, puis revient : le test se relance tout seul.
  useReprisePosition(blocage !== null && blocage !== 'absente', testerLaPosition);

  const testerLaPhoto = async (fichier: File) => {
    setErreurPhoto(null);
    setEnCours('photo');
    try {
      const photo = await alleger(fichier);
      // Rangée dans la base du téléphone, puis relue : c'est ce que fera l'envoi d'une vraie fiche.
      await garder('testPhoto', photo.blob);
      const rangee = await lireMemoire('testPhoto');
      const octets = rangee ? await lireLesOctets(rangee) : null;
      await oublier('testPhoto');
      const ok = octets !== null;
      noter({ photo: { ok, octets: photo.octets } });
      void journaliser(
        'premiers-pas',
        ok ? 'test_photo_ok' : 'test_photo_illisible',
        `${photo.octets} octets ${photo.mime}`,
      );
    } catch (e) {
      await oublier('testPhoto').catch(() => undefined);
      setErreurPhoto('Cette photo ne peut pas être lue. Reprenez-la, ou choisissez-en une autre.');
      void journaliser('premiers-pas', 'photo_illisible', e);
    } finally {
      setEnCours(null);
    }
  };

  const testerLaConnexion = async () => {
    setEnCours('connexion');
    const enLigne = navigator.onLine;
    let repond = false;
    if (enLigne) {
      const reponse = await limiterLeTemps(
        adaptateurs.relais.monProfil().then(
          () => true,
          () => false,
        ),
        10_000,
        false,
      );
      repond = reponse;
    }
    noter({ connexion: { enLigne, repond } });
    void journaliser(
      'premiers-pas',
      repond ? 'test_connexion_ok' : 'test_connexion_echec',
      enLigne ? 'en ligne' : 'hors ligne',
    );
    setEnCours(null);
  };

  const terminer = async () => {
    await garder('premiersPas', new Date().toISOString());
    aller('missions');
  };

  const p = resultats.position;
  const verdictDeLaPosition = p?.ok ? verdictPosition(p.precisionM) : null;
  const verdictDeLaPhoto = resultats.photo
    ? verdictPhoto({ octets: resultats.photo.octets, relue: resultats.photo.ok })
    : null;
  const verdictDeLaConnexion = resultats.connexion ? verdictConnexion(resultats.connexion) : null;
  const unProbleme =
    [verdictDeLaPosition, verdictDeLaPhoto, verdictDeLaConnexion].some(
      (v) => v !== null && !v.bon,
    ) ||
    (p !== undefined && !p.ok);
  const lien = avecMessage(lienNTanova, messageDeSupportPremiersPas(env, resultats));

  return (
    <div className="ecran">
      <Entete titre="Tester mon téléphone" principal />
      <main className="contenu-relais">
        <p>
          Deux minutes, avant votre première fiche. <b>Rien n’est envoyé</b> : ni photo, ni
          position. Et rien n’est obligatoire.
        </p>

        <section className="carte-blanche pile-serree" aria-label="La position">
          <h2 className="intertitre">1. La position</h2>
          <p className="texte-doux">
            C’est ce qui place l’école sur la carte. Il faut que le téléphone la donne.
          </p>
          <button
            type="button"
            className="bouton bouton-secondaire"
            disabled={enCours !== null}
            onClick={testerLaPosition}
          >
            {enCours === 'position' ? 'Mesure en cours…' : 'Tester la position'}
          </button>
          {blocage && <AidePosition erreur={blocage} surReessayer={testerLaPosition} />}
          {verdictDeLaPosition && <LeVerdict verdict={verdictDeLaPosition} />}
        </section>

        <section className="carte-blanche pile-serree" aria-label="La photo">
          <h2 className="intertitre">2. La photo</h2>
          <p className="texte-doux">
            Prenez n’importe quelle photo. Elle est allégée, rangée dans le téléphone puis relue,
            comme pour une vraie fiche, et effacée aussitôt.
          </p>
          <label className="bouton bouton-secondaire" aria-disabled={enCours !== null}>
            {enCours === 'photo' ? 'Vérification…' : 'Choisir ou prendre une photo'}
            <input
              type="file"
              accept="image/*"
              className="visuellement-cache"
              disabled={enCours !== null}
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                e.target.value = '';
                if (fichier) void testerLaPhoto(fichier);
              }}
            />
          </label>
          {erreurPhoto && (
            <p className="message-attention" role="status">
              {erreurPhoto}
            </p>
          )}
          {verdictDeLaPhoto && <LeVerdict verdict={verdictDeLaPhoto} />}
        </section>

        <section className="carte-blanche pile-serree" aria-label="La connexion">
          <h2 className="intertitre">3. La connexion</h2>
          <p className="texte-doux">
            Sans réseau, vous pouvez relever : les fiches partent quand il revient.
          </p>
          <button
            type="button"
            className="bouton bouton-secondaire"
            disabled={enCours !== null}
            onClick={() => void testerLaConnexion()}
          >
            {enCours === 'connexion' ? 'Vérification…' : 'Tester la connexion'}
          </button>
          {verdictDeLaConnexion && <LeVerdict verdict={verdictDeLaConnexion} />}
        </section>

        <section className="carte-blanche pile-serree" aria-label="L’écran d’accueil">
          <h2 className="intertitre">Un conseil</h2>
          {env.installee ? (
            <p>L’application est sur l’écran d’accueil de votre téléphone. C’est le plus sûr.</p>
          ) : env.systeme === 'ios' ? (
            <p>
              Pour l’avoir toujours sous la main : touchez le bouton « Partager » du navigateur,
              puis « Sur l’écran d’accueil ». C’est facultatif.
            </p>
          ) : env.systeme === 'android' ? (
            <p>
              Pour l’avoir toujours sous la main : ouvrez le menu du navigateur, puis « Installer
              l’application » ou « Ajouter à l’écran d’accueil ». C’est facultatif.
            </p>
          ) : (
            <p>Cette application s’utilise surtout sur un téléphone.</p>
          )}
        </section>

        {unProbleme && lien && (
          <a
            className="bouton bouton-secondaire"
            href={lien}
            target="_blank"
            rel="noopener noreferrer"
          >
            Écrire à NTanova sur WhatsApp
          </a>
        )}

        <button
          type="button"
          className="bouton bouton-large"
          disabled={!testsTermines(resultats)}
          onClick={() => void terminer()}
        >
          J’ai terminé
        </button>
        <button type="button" className="bouton bouton-secondaire" onClick={() => void terminer()}>
          Passer ces tests
        </button>
      </main>
      <Navigation />
    </div>
  );
}
