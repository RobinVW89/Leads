/**
 * Déclarations globales du navigateur.
 *
 * `gtag` et `dataLayer` n'existent qu'après acceptation du bandeau : ils sont
 * donc facultatifs, et tout code qui les utilise doit d'abord vérifier leur
 * présence. Les typer ainsi rend cette vérification obligatoire au lieu de la
 * laisser à la vigilance de chacun.
 */
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    turnstile?: { reset: () => void };
  }
}

export {};
