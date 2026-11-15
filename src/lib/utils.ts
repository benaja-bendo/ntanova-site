import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Réunit des classes Tailwind ; la dernière l'emporte (`cn('p-2', 'p-4')` donne `p-4`). */
export function cn(...entrees: ClassValue[]) {
  return twMerge(clsx(entrees));
}
