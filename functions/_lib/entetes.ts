/**
 * En-têtes de sécurité pour les réponses générées par les Pages Functions.
 *
 * Le fichier public/_headers ne s'applique qu'aux fichiers statiques : les
 * réponses produites par une Function doivent porter leurs en-têtes elles-mêmes.
 */

/** Politiques communes à toutes les réponses de Function. */
const COMMUNS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

/**
 * CSP de l'espace d'administration. Il ne charge aucune ressource externe :
 * tout est en ligne dans la réponse. 'unsafe-inline' reste nécessaire pour la
 * feuille de style intégrée et la confirmation de suppression.
 */
const CSP_ADMIN = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'"
].join('; ');

/** CSP des réponses d'API : elles ne rendent jamais de document. */
const CSP_API = ["default-src 'none'", "frame-ancestors 'none'", "base-uri 'none'"].join('; ');

export type ProfilEntetes = 'api' | 'admin';

/** Renvoie une copie de la réponse enrichie des en-têtes de sécurité. */
export function avecEntetesSecurite(reponse: Response, profil: ProfilEntetes = 'api'): Response {
  const entetes = new Headers(reponse.headers);

  for (const [nom, valeur] of Object.entries(COMMUNS)) {
    entetes.set(nom, valeur);
  }
  entetes.set('Content-Security-Policy', profil === 'admin' ? CSP_ADMIN : CSP_API);

  // Ni les demandes ni l'administration ne doivent être mises en cache.
  if (!entetes.has('Cache-Control')) {
    entetes.set('Cache-Control', 'no-store');
  }

  return new Response(reponse.body, {
    status: reponse.status,
    statusText: reponse.statusText,
    headers: entetes
  });
}
