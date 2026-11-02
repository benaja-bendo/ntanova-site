/**
 * Les décisions de la file d'envoi : que devient une fiche quand la base la refuse, quand l'envoi échoue sans qu'on
 * sache pourquoi, et ce que le relais peut en faire. Des fonctions pures : la file elle-même (`file-envoi.ts`) les
 * appelle, et les tests les essaient sans navigateur.
 *
 * Trois sortes d'échec, trois conduites :
 *   - le réseau ou la session manquent : la fiche reste en file (ce n'est pas traité ici) ;
 *   - la base REFUSE (`ErreurRejet`) : la fiche sort de la file avec la raison exacte ; rien ne sert de la rejouer ;
 *   - une panne dont on ne sait rien : la fiche reste en file, on compte les essais ratés et on prévient le relais
 *     au bout de quelques-uns.
 */
import type { EtapeEnvoi, FicheLocale, Rejet } from './fiche';

/** Combien d'envois ratés de suite avant de dire au relais que quelque chose ne va pas. */
export const ESSAIS_AVANT_ALERTE = 5;

/** Où en est l'envoi : la première étape qui n'est pas partie. */
export function etapeEnCours(fiche: Pick<FicheLocale, 'envoyes'>): EtapeEnvoi {
  if (!fiche.envoyes.releve) return 'releve';
  if (!fiche.envoyes.photo) return 'photo';
  return 'contact';
}

/** Ce qui change sur la fiche quand la base la refuse. Ce qui est déjà parti reste marqué parti. */
export function apresRejet(
  fiche: FicheLocale,
  erreur: { code: string; message: string },
  maintenant: string,
): Partial<FicheLocale> {
  return {
    etat: 'refusee',
    essais: 0,
    rejet: {
      code: erreur.code,
      message: erreur.message,
      etape: etapeEnCours(fiche),
      le: maintenant,
    },
  };
}

/** Ce qui change quand l'envoi échoue sans réponse de la base : la fiche reste en file, l'essai est compté. */
export function apresEchecInattendu(fiche: Pick<FicheLocale, 'essais'>): Partial<FicheLocale> {
  return { essais: (fiche.essais ?? 0) + 1 };
}

/** Les essais ratés de suite sont assez nombreux pour prévenir le relais. */
export function enAlerte(fiche: Pick<FicheLocale, 'essais'>): boolean {
  return (fiche.essais ?? 0) >= ESSAIS_AVANT_ALERTE;
}

/**
 * Une fiche se modifie tant que NTanova n'a pas reçu son relevé : en file ou refusée. Après, un relevé reçu ne
 * change plus (c'est une correction, demandée par NTanova).
 */
export function peutEtreModifiee(fiche: Pick<FicheLocale, 'etat' | 'envoyes'>): boolean {
  return (fiche.etat === 'a_envoyer' || fiche.etat === 'refusee') && !fiche.envoyes.releve;
}

/** Modifier ramène la fiche en brouillon, sans refus ni essais : elle repartira quand le relais la rangera. */
export function pourModifier(): Partial<FicheLocale> {
  return { etat: 'brouillon', rejet: null, essais: 0 };
}

/** Réessayer remet la fiche en file, telle quelle. */
export function pourReessayer(): Partial<FicheLocale> {
  return { etat: 'a_envoyer', rejet: null, essais: 0 };
}

/**
 * Ce que le relais lit d'un refus : une phrase qui dit de quoi il s'agit, et le message de la base tel quel
 * (la base l'écrit en français pour un humain quand elle refuse elle-même).
 */
export function explicationDuRejet(rejet: Rejet): { titre: string; detail: string } {
  const titre =
    rejet.etape === 'photo'
      ? "La photo n'a pas pu être reçue."
      : rejet.etape === 'contact'
        ? "Le contact n'a pas pu être reçu."
        : rejet.code === '42501'
          ? "Votre compte n'a pas le droit d'envoyer."
          : rejet.code === 'P0002'
            ? 'NTanova ne connaît pas cette fiche.'
            : /^(22|23)/.test(rejet.code) || rejet.code === 'P0001'
              ? "La fiche contient une valeur que NTanova n'accepte pas."
              : "NTanova n'a pas pu recevoir cette fiche.";
  return { titre, detail: rejet.message };
}
