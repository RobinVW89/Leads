/**
 * Contrôle d'origine des requêtes qui modifient quelque chose.
 *
 * L'espace d'administration est protégé par Cloudflare Access, mais Access
 * authentifie une session, il ne dit pas d'où part la requête. Un site tiers
 * peut faire soumettre à votre navigateur un formulaire vers /admin pendant que
 * cette session est ouverte : la requête arrive authentifiée, et l'action
 * s'exécute. C'est une CSRF classique, et elle vise ici des actions qui
 * suppriment une demande ou envoient un e-mail à un professionnel.
 *
 * On ne s'en remet pas à l'attribut SameSite du cookie d'Access : il est fixé
 * par Cloudflare, peut changer, et dépend de la configuration de l'équipe. La
 * seule garantie qui nous appartienne est de vérifier nous-mêmes l'origine.
 *
 * Mode fermé : une origine étrangère, absente ou « null » est refusée. Tous les
 * navigateurs actuels envoient `Origin` sur une requête POST, y compris quand
 * elle est de même origine ; exiger l'en-tête ne casse donc aucun usage normal.
 * La valeur littérale « null » est celle qu'envoie un contexte opaque — page
 * sandboxée, document local, redirection cross-origin — et n'a rien à faire là.
 */

export type VerdictOrigine = { ok: true } | { ok: false; motif: string };

/**
 * `origineDeLaRequete` est l'origine du service tel qu'il a été joint, déduite
 * de l'URL de la requête. La comparer à l'en-tête `Origin` revient à exiger que
 * la page émettrice soit servie par le même hôte que celui qui reçoit.
 */
export function verifierOrigine(methode: string, origine: string | null, origineDeLaRequete: string): VerdictOrigine {
  // Les lectures ne modifient rien : elles ne sont pas concernées.
  if (methode !== 'POST' && methode !== 'PUT' && methode !== 'PATCH' && methode !== 'DELETE') {
    return { ok: true };
  }

  if (origine === null || origine === '') return { ok: false, motif: "en-tête Origin absent" };
  if (origine === 'null') return { ok: false, motif: 'origine opaque' };
  if (origine !== origineDeLaRequete) return { ok: false, motif: 'origine étrangère' };

  return { ok: true };
}

/** Même contrôle, directement sur une requête. */
export function verifierOrigineDe(request: Request): VerdictOrigine {
  return verifierOrigine(request.method, request.headers.get('Origin'), new URL(request.url).origin);
}
