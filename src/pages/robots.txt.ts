import type { APIRoute } from 'astro';
import { SITE_CONFIG } from '../config/site';

export const prerender = true;

export const GET: APIRoute = () => {
  // L'espace d'administration et l'API n'ont rien à faire dans un index.
  // Les robots des moteurs, y compris ceux des assistants (OAI-SearchBot,
  // GPTBot, ClaudeBot…), gardent l'accès complet aux pages publiques.
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /merci',
    '',
    `Sitemap: ${SITE_CONFIG.siteUrl}/sitemap.xml`,
    ''
  ].join('\n');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
};
