import metiers from '../data/metiers.json';
import villes from '../data/villes.json';
import parcours from '../data/parcours.json';
import localAuxerre from '../data/local-auxerre.json';
import localSens from '../data/local-sens.json';
import localJoigny from '../data/local-joigny.json';

export type FaqItem = {
  question: string;
  reponse: string;
};

export type ChampOption = {
  value: string;
  label: string;
};

/**
 * Personnalisation de l'étape « votre projet » du formulaire.
 * Absent = comportement par défaut (travaux) pour tous les métiers historiques.
 */
export type FormulaireConfig = {
  intro?: string;
  descriptionLabel?: string;
  descriptionPlaceholder?: string;
  delaiLabel?: string;
  delaiPlaceholder?: string;
  delaiOptions?: ChampOption[];
  budget?: boolean;
  budgetLabel?: string;
  budgetOptions?: ChampOption[];
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
  formulaire?: FormulaireConfig;
};

export const FORMULAIRE_DEFAUT = {
  intro: 'Décrivez vos travaux en 2 minutes. Un professionnel local vous rappelle sous 24 h.',
  descriptionLabel: 'Décrivez votre projet',
  descriptionPlaceholder: 'Ex : 45 m2 de murs à repeindre, support déjà préparé.',
  delaiLabel: 'Délai souhaité',
  delaiPlaceholder: 'Choisir un délai',
  delaiOptions: [
    { value: 'des-que-possible', label: 'Dès que possible' },
    { value: 'sous-1-mois', label: 'Sous 1 mois' },
    { value: 'sous-3-mois', label: 'Sous 3 mois' },
    { value: 'je-me-renseigne', label: 'Je me renseigne' }
  ],
  budget: true,
  budgetLabel: 'Budget (facultatif)',
  budgetOptions: [
    { value: 'moins-de-2000', label: 'Moins de 2 000 EUR' },
    { value: '2000-5000', label: '2 000 à 5 000 EUR' },
    { value: '5000-10000', label: '5 000 à 10 000 EUR' },
    { value: 'plus-de-10000', label: 'Plus de 10 000 EUR' }
  ]
} as const;

export function getFormulaireConfig(metierSlug: string) {
  const metier = metiersData.find((item) => item.slug === metierSlug);
  const perso = metier?.formulaire ?? {};

  return {
    intro: perso.intro ?? FORMULAIRE_DEFAUT.intro,
    descriptionLabel: perso.descriptionLabel ?? FORMULAIRE_DEFAUT.descriptionLabel,
    descriptionPlaceholder: perso.descriptionPlaceholder ?? FORMULAIRE_DEFAUT.descriptionPlaceholder,
    delaiLabel: perso.delaiLabel ?? FORMULAIRE_DEFAUT.delaiLabel,
    delaiPlaceholder: perso.delaiPlaceholder ?? FORMULAIRE_DEFAUT.delaiPlaceholder,
    delaiOptions: perso.delaiOptions ?? [...FORMULAIRE_DEFAUT.delaiOptions],
    budget: perso.budget ?? FORMULAIRE_DEFAUT.budget,
    budgetLabel: perso.budgetLabel ?? FORMULAIRE_DEFAUT.budgetLabel,
    budgetOptions: perso.budgetOptions ?? [...FORMULAIRE_DEFAUT.budgetOptions]
  };
}

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

/**
 * Contenu local, par commune. Une commune absente de cette table sert la page
 * générique : mieux vaut un texte assumé comme départemental qu'un texte
 * pseudo-local obtenu en substituant un nom de ville.
 */
const contenuLocalParVille: Record<string, AuxerreContent[]> = {
  auxerre: localAuxerre as AuxerreContent[],
  sens: localSens as AuxerreContent[],
  joigny: localJoigny as AuxerreContent[]
};

/** Sources officielles citées au bas du bloc local, par commune. */
export type SourceLocale = { libelle: string; url: string };

const sourcesParVille: Record<string, SourceLocale[]> = {
  sens: [
    { libelle: 'Insee — dossier complet, commune de Sens', url: 'https://www.insee.fr/fr/statistiques/2011101?geo=COM-89387' },
    { libelle: 'Géorisques — risques par commune', url: 'https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi' },
    { libelle: 'Service-Public.fr — autorisations d’urbanisme', url: 'https://www.service-public.fr/particuliers/vosdroits/N319' },
    { libelle: 'France Rénov’ — aides à la rénovation', url: 'https://france-renov.gouv.fr/' }
  ],
  joigny: [
    { libelle: 'Insee — dossier complet, commune de Joigny', url: 'https://www.insee.fr/fr/statistiques/2011101?geo=COM-89206' },
    { libelle: 'Géorisques — risques par commune', url: 'https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi' },
    { libelle: 'Service-Public.fr — autorisations d’urbanisme', url: 'https://www.service-public.fr/particuliers/vosdroits/N319' },
    { libelle: 'France Rénov’ — aides à la rénovation', url: 'https://france-renov.gouv.fr/' }
  ]
};

export function getContenuLocal(villeSlug: string, metierSlug: string): AuxerreContent | undefined {
  return contenuLocalParVille[villeSlug]?.find((entry) => entry.slug === metierSlug);
}

export function getSourcesLocales(villeSlug: string): SourceLocale[] {
  return sourcesParVille[villeSlug] ?? [];
}

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
