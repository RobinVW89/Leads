/**
 * Middleware global.
 *
 * Unique rôle : empêcher l'indexation des déploiements de prévisualisation.
 * Ils servent une copie complète du site sur *.pages.dev, ce qui créerait du
 * contenu dupliqué face au domaine de production. Les réponses du domaine
 * réel ne sont pas touchées.
 */

const DOMAINE_PRODUCTION = 'lesprosdelyonne.com';

export const onRequest: PagesFunction = async (context) => {
  const reponse = await context.next();
  const hote = new URL(context.request.url).hostname;

  if (hote === DOMAINE_PRODUCTION || hote === 'localhost' || hote === '127.0.0.1') {
    return reponse;
  }

  // Prévisualisation : on marque la réponse comme non indexable.
  const entetes = new Headers(reponse.headers);
  entetes.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(reponse.body, {
    status: reponse.status,
    statusText: reponse.statusText,
    headers: entetes
  });
};
