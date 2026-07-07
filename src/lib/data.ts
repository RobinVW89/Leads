import metiers from '../data/metiers.json';
import villes from '../data/villes.json';
import parcours from '../data/parcours.json';

export type FaqItem = {
  question: string;
  reponse: string;
};

export type Metier = {
  slug: string;
  nom: string;
  nomPluriel: string;
  description: string;
  prestations: string[];
  fourchettePrix: string;
  questionsFrequentes: FaqItem[];
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
  quartiersOuCommunesProches: string[];
  phraseLocale: string;
};

export const metiersData = metiers as Metier[];
export const villesData = villes as Ville[];
export const parcoursData = parcours as ParcoursMetier[];

export function getMetierBySlug(slug: string): Metier | undefined {
  return metiersData.find((metier) => metier.slug === slug);
}

export function getVilleBySlug(slug: string): Ville | undefined {
  return villesData.find((ville) => ville.slug === slug);
}

export function getParcoursByMetierSlug(metierSlug: string): ParcoursMetier | undefined {
  return parcoursData.find((item) => item.metierSlug === metierSlug);
}
