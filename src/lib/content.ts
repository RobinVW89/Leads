import type { Metier, Ville } from './data';

type SectionKey = 'presentation' | 'prestations' | 'tarifs' | 'faq' | 'formulaire';

const introTemplates = [
  (metier: Metier, ville: Ville) =>
    `Vous cherchez un ${metier.nom.toLowerCase()} à ${ville.nom} ? Notre réseau local vous met en relation avec un professionnel adapté à votre besoin et à votre secteur.`,
  (metier: Metier, ville: Ville) =>
    `Pour vos projets de ${metier.nomPluriel.toLowerCase()} à ${ville.nom}, nous facilitons une prise de contact rapide avec un professionnel de proximité dans l'Yonne.`,
  (metier: Metier, ville: Ville) =>
    `À ${ville.nom}, les demandes de ${metier.nom.toLowerCase()} nécessitent souvent une bonne connaissance du terrain local. Notre portail simplifie votre recherche.`
];

export function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getLocalizedIntro(metier: Metier, ville: Ville): string {
  const template = introTemplates[stableHash(`${metier.slug}-${ville.slug}`) % introTemplates.length];
  return template(metier, ville);
}

export function getSectionOrder(metierSlug: string, villeSlug: string): SectionKey[] {
  const baseOrder: SectionKey[] = ['presentation', 'prestations', 'tarifs', 'faq', 'formulaire'];
  const hash = stableHash(`${metierSlug}-${villeSlug}`);

  if (hash % 3 === 0) {
    return ['presentation', 'tarifs', 'prestations', 'faq', 'formulaire'];
  }

  if (hash % 3 === 1) {
    return ['presentation', 'prestations', 'faq', 'tarifs', 'formulaire'];
  }

  return baseOrder;
}
