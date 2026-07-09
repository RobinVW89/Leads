import type { Metier, Ville } from './data';

type SectionKey = 'presentation' | 'prestations' | 'tarifs' | 'faq' | 'realisations' | 'formulaire';

type RelatedLink = {
  href: string;
  label: string;
  note: string;
};

const introTemplates = [
  (metier: Metier, ville: Ville) =>
    `Vous cherchez un ${metier.nom.toLowerCase()} à ${ville.nom} ? Notre réseau local vous met en relation avec un professionnel adapté à votre besoin et à votre secteur.`,
  (metier: Metier, ville: Ville) =>
    `Pour vos projets de ${metier.nomPluriel.toLowerCase()} à ${ville.nom}, nous facilitons une prise de contact rapide avec un professionnel de proximité dans l'Yonne.`,
  (metier: Metier, ville: Ville) =>
    `À ${ville.nom}, les demandes de ${metier.nom.toLowerCase()} nécessitent souvent une bonne connaissance du terrain local. Notre portail simplifie votre recherche.`
];

const relatedServices: Record<string, RelatedLink[]> = {
  'estimation-immobiliere': [
    { href: '/courtier-credit-assurance/', label: 'Courtier crédit assurance', note: 'financer votre prochain achat' },
    { href: '/peintre-batiment/', label: 'Peintre en bâtiment', note: 'rafraîchir avant de vendre' }
  ],
  'courtier-credit-assurance': [
    { href: '/estimation-immobiliere/', label: 'Estimation immobilière', note: 'mieux cadrer votre budget' },
    { href: '/isolation/', label: 'Isolation', note: 'financer vos travaux de rénovation énergétique' }
  ],
  'menuisier-portail-fenetre': [
    { href: '/isolation/', label: 'Isolation', note: 'améliorer l’enveloppe thermique du logement' },
    { href: '/veranda-pergola-store/', label: 'Véranda, pergola et store', note: 'prolonger vos espaces de vie' }
  ],
  isolation: [
    { href: '/menuisier-portail-fenetre/', label: 'Menuisier portail fenêtre', note: 'traiter aussi les ouvertures' },
    { href: '/veranda-pergola-store/', label: 'Véranda, pergola et store', note: 'compléter votre rénovation thermique' }
  ],
  'veranda-pergola-store': [
    { href: '/menuisier-portail-fenetre/', label: 'Menuisier portail fenêtre', note: 'sécuriser les ouvertures et fermetures' },
    { href: '/isolation/', label: 'Isolation', note: 'garder un bon confort en toute saison' }
  ],
  'macon-renovation': [
    { href: '/terrassement-assainissement/', label: 'Terrassement assainissement', note: 'préparer le terrain ou les réseaux' },
    { href: '/carreleur-plaquiste/', label: 'Carreleur plaquiste', note: 'enchaîner sur les finitions intérieures' }
  ],
  'plombier-chauffagiste': [
    { href: '/electricien/', label: 'Électricien', note: 'sécuriser l’alimentation des équipements' },
    { href: '/isolation/', label: 'Isolation', note: 'améliorer le rendement du chauffage' }
  ],
  electricien: [
    { href: '/plombier-chauffagiste/', label: 'Plombier chauffagiste', note: 'coordonner les équipements techniques' },
    { href: '/isolation/', label: 'Isolation', note: 'accompagner une rénovation énergétique' }
  ],
  couvreur: [
    { href: '/isolation/', label: 'Isolation', note: 'traiter la performance globale de la toiture' },
    { href: '/menuisier-portail-fenetre/', label: 'Menuisier portail fenêtre', note: 'compléter l’enveloppe extérieure' }
  ],
  'terrassement-assainissement': [
    { href: '/macon-renovation/', label: 'Maçon rénovation', note: 'reprendre les ouvrages de structure' },
    { href: '/carreleur-plaquiste/', label: 'Carreleur plaquiste', note: 'passer aux aménagements intérieurs' }
  ],
  'carreleur-plaquiste': [
    { href: '/peintre-batiment/', label: 'Peintre en bâtiment', note: 'préparer les finitions finales' },
    { href: '/macon-renovation/', label: 'Maçon rénovation', note: 'gérer les supports et reprises' }
  ],
  'peintre-batiment': [
    { href: '/carreleur-plaquiste/', label: 'Carreleur plaquiste', note: 'enchaîner les sols et cloisons' },
    { href: '/estimation-immobiliere/', label: 'Estimation immobilière', note: 'valoriser votre bien avant la vente' }
  ]
};

const realizationCaptions: Record<string, string[]> = {
  'menuisier-portail-fenetre': [
    'Remplacement de fenêtres PVC',
    'Pose d’un portail motorisé',
    'Installation d’une porte de garage sectionnelle'
  ],
  'veranda-pergola-store': [
    'Pergola bioclimatique en aluminium',
    'Store banne motorisé',
    'Véranda sur mesure'
  ],
  isolation: [
    'Isolation de combles perdus',
    'Isolation thermique par l’extérieur',
    'Doublage intérieur des murs'
  ],
  'peintre-batiment': [
    'Rénovation complète d’un séjour',
    'Pose d’un sol PVC décoratif',
    'Petite vitrerie remise en état'
  ],
  'estimation-immobiliere': [
    'Mise en valeur avant vente',
    'Lecture des surfaces et volumes',
    'Analyse de l’état général du bien'
  ],
  'courtier-credit-assurance': [
    'Préparation d’un dossier de financement',
    'Comparaison d’offres bancaires',
    'Optimisation de l’assurance emprunteur'
  ],
  'macon-renovation': [
    'Création d’une ouverture',
    'Reprise de murs et joints',
    'Réalisation d’une dalle béton'
  ],
  'plombier-chauffagiste': [
    'Installation d’une pompe à chaleur',
    'Rénovation d’une salle de bain',
    'Remplacement d’un chauffe-eau'
  ],
  electricien: [
    'Mise en sécurité d’un tableau électrique',
    'Rénovation complète d’une installation',
    'Pose d’un éclairage intérieur'
  ],
  couvreur: [
    'Réfection d’une couverture en tuiles',
    'Travaux de zinguerie',
    'Isolation sous toiture'
  ],
  'terrassement-assainissement': [
    'Terrassement d’un terrain à bâtir',
    'Pose d’un assainissement individuel',
    'Création d’un accès chantier'
  ],
  'carreleur-plaquiste': [
    'Pose de carrelage grand format',
    'Création d’une cloison en placo',
    'Doublage isolant avant finition'
  ]
};

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
  const baseOrder: SectionKey[] = ['presentation', 'prestations', 'tarifs', 'faq', 'realisations', 'formulaire'];
  const hash = stableHash(`${metierSlug}-${villeSlug}`);

  if (hash % 3 === 0) {
    return ['presentation', 'tarifs', 'prestations', 'faq', 'realisations', 'formulaire'];
  }

  if (hash % 3 === 1) {
    return ['presentation', 'prestations', 'faq', 'tarifs', 'realisations', 'formulaire'];
  }

  return baseOrder;
}

export function getRelatedServices(metierSlug: string): RelatedLink[] {
  return relatedServices[metierSlug] ?? [];
}

export function getRealisationCaptions(metierSlug: string, metierNom: string): string[] {
  return realizationCaptions[metierSlug] ?? [`Travaux de ${metierNom.toLowerCase()}`, `Chantier de ${metierNom.toLowerCase()} terminé`, `Détail de finition ${metierNom.toLowerCase()}`];
}
