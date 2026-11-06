/** Le champ historique mêle programme et langues : seuls les noms de langue seuls sont identifiés. */
export function libelleProgramme(programme: string | null): string {
  return /^(français|anglais|lingala|kituba|munukutuba|portugais)$/i.test(programme?.trim() ?? '')
    ? 'Langue d’enseignement'
    : 'Programme et langues';
}
