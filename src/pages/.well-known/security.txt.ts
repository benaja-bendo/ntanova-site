// `/.well-known/security.txt` (RFC 9116, 23/11/2026) : voir `src/modele/fichiers-standards.ts`. L'adresse de contact vient de
// `PUBLIC_CONTACT_EMAIL`, jamais du code ; la date d'expiration est recalculée à chaque construction.
import type { APIRoute } from 'astro';
import { PUBLIC_CONTACT_EMAIL } from 'astro:env/client';
import { securityTxt } from '../../modele/fichiers-standards';

export const GET: APIRoute = ({ site }) =>
  new Response(
    securityTxt(String(site ?? 'https://ntanova.com'), PUBLIC_CONTACT_EMAIL, new Date()),
    {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    },
  );
