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
    // `/cdn-cgi/l/email-protection` n'est pas une page du site : Cloudflare
    // réécrit à la volée les liens `mailto:` sous cette forme pour masquer les
    // adresses aux aspirateurs. L'adresse réelle tient dans le fragment `#…`,
    // que le navigateur ne transmet jamais au serveur — l'URL seule répond
    // donc 404, ce que la Search Console signalait comme page introuvable.
    //
    // On vise ce chemin précis plutôt que tout `/cdn-cgi/` : le script de
    // déchiffrement vit sous le même préfixe, et le bloquer empêcherait Google
    // de rendre correctement les deux pages qui portent une adresse.
    'Disallow: /cdn-cgi/l/email-protection',
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
