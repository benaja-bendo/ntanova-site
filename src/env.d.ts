declare namespace App {
  interface Locals {
    /** Les villes qui ont des fiches, pour le pied de page public (voir src/middleware.ts). */
    villesDuPied?: readonly { nom: string; lien: string }[];
  }
}
