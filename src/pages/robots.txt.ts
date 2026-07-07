import type { APIRoute } from 'astro';
import { SITE_CONFIG } from '../config/site';

export const prerender = true;

export const GET: APIRoute = () => {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_CONFIG.siteUrl}/sitemap.xml\n`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
};
