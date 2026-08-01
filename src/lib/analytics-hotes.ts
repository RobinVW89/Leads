/**
 * Domaines autorisés à mesurer l'audience.
 *
 * Chaque déploiement de prévisualisation sert une copie complète du site sur
 * `*.pages.dev`. Sans barrière, les essais, les relectures et les tests
 * automatisés viendraient gonfler les statistiques de production : les visites
 * seraient les nôtres, les conversions seraient factices, et les chiffres
 * cesseraient de vouloir dire quelque chose.
 *
 * La liste est donc fermée, et volontairement limitée au domaine réel. Aucune
 * exception pour le développement local : un `npm run dev` ne doit pas
 * davantage écrire dans les statistiques qu'une prévisualisation. Les tests
 * navigateur résolvent le domaine de production vers la machine locale, ce qui
 * leur permet d'exercer exactement le même code sans dérogation dans le code.
 */
const HOTES_AUTORISES = ['lesprosdelyonne.com', 'www.lesprosdelyonne.com'];

export function analyticsAutorise(hote: unknown): boolean {
  const nom = String(hote ?? '')
    .trim()
    .toLowerCase()
    // Un hôte peut arriver avec son port lorsqu'il vient d'un en-tête.
    .replace(/:\d+$/, '');

  return HOTES_AUTORISES.includes(nom);
}

/** Exposée pour les tests et la documentation. */
export const DOMAINES_MESURES = [...HOTES_AUTORISES];
