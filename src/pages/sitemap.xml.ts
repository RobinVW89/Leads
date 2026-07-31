import type { APIRoute } from 'astro';
import { SITE_CONFIG } from '../config/site';
import { metiersData, villesData } from '../lib/data';

export const prerender = true;

function toUrl(path: string) {
  // Le serveur redirige toute URL sans slash final : on ne déclare que l'URL finale.
  const normalized = path.endsWith('/') ? path : `${path}/`;
  return new URL(normalized, SITE_CONFIG.siteUrl).toString();
}

export const GET: APIRoute = () => {
  const lastmod = new Date().toISOString().slice(0, 10);
  const staticPaths = ['/', '/comment-ca-marche/', '/espace-pro/', '/mentions-legales/', '/politique-confidentialite/'];
  const hubPaths = villesData.filter((ville) => ville.prioritaire).map((ville) => ({ path: `/${ville.slug}/`, priority: '0.9' }));

  // Un métier inactif n'offre pas encore le service : ses pages restent en ligne
  // et accessibles, mais ne sont pas proposées à l'indexation.
  const metiersIndexables = metiersData.filter((metier) => metier.actif);
  const metierPaths = metiersIndexables.map((metier) => `/${metier.slug}/`);
  const localPaths = metiersIndexables.flatMap((metier) => villesData.map((ville) => `/${metier.slug}/${ville.slug}/`));

  const allPaths: Array<{ path: string; priority?: string }> = [
    ...staticPaths.map((path) => ({ path })),
    ...hubPaths,
    ...metierPaths.map((path) => ({ path })),
    ...localPaths.map((path) => ({ path }))
  ];

  const urlset = allPaths
    .map(
      ({ path, priority }) =>
        `<url><loc>${toUrl(path)}</loc><lastmod>${lastmod}</lastmod>${priority ? `<priority>${priority}</priority>` : ''}</url>`
    )
    .join('');

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlset}</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8'
    }
  });
};
