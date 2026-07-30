/**
 * Vérification de l'identité Cloudflare Access.
 *
 * L'en-tête Cf-Access-Authenticated-User-Email n'est PAS une preuve : Cloudflare
 * Pages ne le transmet pas, et un en-tête se forge trivialement. La seule preuve
 * valable est le JWT Cf-Access-Jwt-Assertion, signé par Cloudflare et vérifiable
 * avec les clés publiques de l'équipe.
 *
 * La vérification s'appuie sur `jose`, qui utilise l'API Web Crypto native du
 * runtime Cloudflare — aucune dépendance Node, aucune cryptographie maison.
 */

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const EQUIPE = 'conseilfiscalauto';
export const ISSUER = `https://${EQUIPE}.cloudflareaccess.com`;
export const URL_CERTS = new URL(`${ISSUER}/cdn-cgi/access/certs`);

/**
 * Balises d'audience des applications Access protégeant /admin.
 * Ce ne sont pas des données confidentielles : ce sont des identifiants publics,
 * et c'est précisément leur contrôle qui empêche un JWT émis pour une autre
 * application de la même équipe d'ouvrir celle-ci.
 */
export const AUD_AUTORISES = [
  // lesprosdelyonne.com/admin — production
  '4c61be1a940820876ba6b0a65182f3804c61868095d56292bef9438484e209ff',
  // *.denys-dgm.pages.dev/admin — prévisualisation
  '8d814dbb0fab73819a2660cc944caacdee55170c1081139cdf0431ba7dc5eb86'
];

/** Liste blanche applicative, appliquée après la validation du JWT. */
export const ADMINS = ['rbn.soyer@gmail.com', 'contact@lesprosdelyonne.com'];

export type ResultatAcces = { ok: true; email: string } | { ok: false; motif: string };

// Le jeu de clés est mis en cache par jose lui-même, y compris la rotation.
let jeuDeCles: JWTVerifyGetKey | null = null;

function clesDistantes(): JWTVerifyGetKey {
  if (!jeuDeCles) {
    jeuDeCles = createRemoteJWKSet(URL_CERTS, { cacheMaxAge: 3_600_000 });
  }
  return jeuDeCles;
}

function motifDepuisErreur(erreur: unknown): string {
  const code = (erreur as { code?: string })?.code || '';
  const claim = (erreur as { claim?: string })?.claim || '';

  switch (code) {
    case 'ERR_JWT_EXPIRED':
      return 'jeton expiré';
    case 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED':
      return 'signature invalide';
    case 'ERR_JWKS_NO_MATCHING_KEY':
      return 'aucune clé publique correspondante';
    case 'ERR_JWKS_TIMEOUT':
      return 'certificats Access injoignables';
    case 'ERR_JWT_CLAIM_VALIDATION_FAILED':
      if (claim === 'iss') return 'émetteur inattendu';
      if (claim === 'aud') return 'audience inattendue';
      if (claim === 'nbf') return 'jeton pas encore valide';
      return `revendication invalide (${claim || 'inconnue'})`;
    case 'ERR_JOSE_ALG_NOT_ALLOWED':
      return 'algorithme non autorisé';
    case 'ERR_JWS_INVALID':
    case 'ERR_JWT_INVALID':
      return 'jeton malformé';
    default:
      // Inclut les échecs réseau de récupération des certificats : sans clés
      // publiques, aucune identité ne peut être prouvée, donc on refuse.
      return 'validation impossible';
  }
}

/**
 * Valide un JWT Access et en extrait l'adresse e-mail.
 * Signature RS256, émetteur, audience et expiration sont tous contrôlés.
 * Le paramètre `resolveurCles` n'existe que pour les tests ; en production,
 * les clés proviennent toujours de l'URL officielle de l'équipe.
 */
export async function validerJeton(
  jeton: string,
  resolveurCles: JWTVerifyGetKey = clesDistantes()
): Promise<ResultatAcces> {
  if (!jeton) {
    return { ok: false, motif: 'aucun jeton Access' };
  }

  try {
    const { payload } = await jwtVerify(jeton, resolveurCles, {
      issuer: ISSUER,
      audience: AUD_AUTORISES,
      algorithms: ['RS256'],
      clockTolerance: 60
    });

    const email = String(payload.email ?? '').trim().toLowerCase();
    if (!email) {
      return { ok: false, motif: 'jeton sans adresse e-mail' };
    }

    return { ok: true, email };
  } catch (erreur) {
    return { ok: false, motif: motifDepuisErreur(erreur) };
  }
}

/** Extrait le jeton de la requête, puis le valide. */
export async function identifierViaAccess(
  request: Request,
  resolveurCles?: JWTVerifyGetKey
): Promise<ResultatAcces> {
  const jeton =
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    (request.headers.get('Cookie') || '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1] ||
    '';

  return validerJeton(jeton, resolveurCles);
}

export function estAdmin(email: string, liste?: string): boolean {
  const autorises = (liste ? liste.split(',') : ADMINS).map((e) => e.trim().toLowerCase()).filter(Boolean);
  return autorises.includes(email.trim().toLowerCase());
}
