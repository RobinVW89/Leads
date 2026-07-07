import type { APIRoute } from 'astro';
import { SITE_CONFIG } from '../config/site';
import { metiersData, villesData } from '../lib/data';

export const prerender = true;

function toUrl(path: string) {
  return new URL(path, SITE_CONFIG.siteUrl).toString();
}

export const GET: APIRoute = () => {
  const staticPaths = ['/', '/comment-ca-marche', '/mentions-legales', '/politique-confidentialite'];

  const metierPaths = metiersData.map((metier) => `/${metier.slug}/`);
  const localPaths = metiersData.flatMap((metier) => villesData.map((ville) => `/${metier.slug}/${ville.slug}/`));

  const allPaths = [...staticPaths, ...metierPaths, ...localPaths];

  const urlset = allPaths
    .map((path) => `<url><loc>${toUrl(path)}</loc></url>`)
    .join('');

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlset}</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8'
    }
  });
};
