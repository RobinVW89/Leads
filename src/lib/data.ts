import metiers from '../data/metiers.json';
import villes from '../data/villes.json';
import parcours from '../data/parcours.json';
import localAuxerre from '../data/local-auxerre.json';

export type FaqItem = {
  question: string;
  reponse: string;
};

export type Metier = {
  slug: string;
  nom: string;
  nomSeo?: string;
  nomPluriel: string;
  description: string;
  prestations: string[];
  fourchettePrix: string;
  questionsFrequentes: FaqItem[];
  certifications?: string[];
  urgence: boolean;
  saison: string;
  actif: boolean;
};

export type ParcoursEtape = {
  question: string;
  options: string[];
  facultatif?: boolean;
};

export type ParcoursMetier = {
  metierSlug: string;
  etapes: ParcoursEtape[];
};

export type Ville = {
  slug: string;
  nom: string;
  codePostal: string;
  population: string;
  prioritaire?: boolean;
  quartiersOuCommunesProches: string[];
  phraseLocale: string;
};

export type AuxerreContent = {
  slug: string;
  title: string;
  intro: string;
  localTitle: string;
  localParagraphs: string[];
  localFaqs: FaqItem[];
};

export const metiersData = metiers as Metier[];
export const villesData = villes as Ville[];
export const parcoursData = parcours as ParcoursMetier[];
export const auxerreContentData = localAuxerre as AuxerreContent[];

export function getMetierBySlug(slug: string): Metier | undefined {
  return metiersData.find((metier) => metier.slug === slug);
}

export function getVilleBySlug(slug: string): Ville | undefined {
  return villesData.find((ville) => ville.slug === slug);
}

export function getParcoursByMetierSlug(metierSlug: string): ParcoursMetier | undefined {
  return parcoursData.find((item) => item.metierSlug === metierSlug);
}

export function getAuxerreContentByMetierSlug(metierSlug: string): AuxerreContent | undefined {
  return auxerreContentData.find((item) => item.slug === metierSlug);
}

export function getPriorityCities(): Ville[] {
  const priorityOrder = ['auxerre', 'sens', 'joigny'];
  return [...villesData].sort((left, right) => {
    const leftRank = left.prioritaire ? priorityOrder.indexOf(left.slug) : Number.POSITIVE_INFINITY;
    const rightRank = right.prioritaire ? priorityOrder.indexOf(right.slug) : Number.POSITIVE_INFINITY;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.nom.localeCompare(right.nom, 'fr');
  });
}

export function getAuxerreStyleCityOrder(currentCitySlug?: string): Ville[] {
  const priorityCities = getPriorityCities();
  if (!currentCitySlug) {
    return priorityCities;
  }

  return [
    ...priorityCities.filter((city) => city.slug !== currentCitySlug),
    ...villesData.filter((city) => !city.prioritaire && city.slug !== currentCitySlug).sort((left, right) => left.nom.localeCompare(right.nom, 'fr'))
  ];
}

export function getSeoMetierName(metier: Metier): string {
  return metier.nomSeo ?? metier.nom;
}
