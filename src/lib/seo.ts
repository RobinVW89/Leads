import { SITE_CONFIG } from '../config/site';
import type { Metier, Ville } from './data';

export function serviceSchema(metier: Metier, ville: Ville, canonicalPath: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `${metier.nom} à ${ville.nom}`,
    serviceType: metier.nom,
    areaServed: {
      '@type': 'City',
      name: ville.nom
    },
    provider: {
      '@type': 'Organization',
      name: SITE_CONFIG.siteName,
      telephone: SITE_CONFIG.telContact,
      url: SITE_CONFIG.siteUrl
    },
    offers: {
      '@type': 'Offer',
      description: 'Mise en relation gratuite avec un professionnel local.'
    },
    url: new URL(canonicalPath, SITE_CONFIG.siteUrl).toString()
  };
}

export function faqSchema(metier: Metier) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: metier.questionsFrequentes.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.reponse
      }
    }))
  };
}

export function breadcrumbSchema(items: Array<{ name: string; url?: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.url ? { item: new URL(item.url, SITE_CONFIG.siteUrl).toString() } : {})
    }))
  };
}

export function collectionPageSchema(name: string, description: string, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url: new URL(url, SITE_CONFIG.siteUrl).toString(),
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_CONFIG.siteName,
      url: SITE_CONFIG.siteUrl
    }
  };
}

export function metierServiceSchema(metier: Metier, canonicalPath: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `${metier.nomSeo ?? metier.nom} dans l'Yonne`,
    serviceType: metier.nom,
    description: metier.description,
    areaServed: {
      '@type': 'AdministrativeArea',
      name: 'Yonne'
    },
    provider: {
      '@type': 'Organization',
      name: SITE_CONFIG.siteName,
      telephone: SITE_CONFIG.telContact,
      url: SITE_CONFIG.siteUrl
    },
    offers: {
      '@type': 'Offer',
      description: 'Mise en relation gratuite avec un professionnel local.'
    },
    url: new URL(canonicalPath, SITE_CONFIG.siteUrl).toString()
  };
}

export function localBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: SITE_CONFIG.siteName,
    url: SITE_CONFIG.siteUrl,
    description: SITE_CONFIG.description,
    telephone: SITE_CONFIG.telContact,
    email: SITE_CONFIG.contactEmail,
    image: new URL('/images/og-lesprosdelyonne.jpg', SITE_CONFIG.siteUrl).toString(),
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Auxerre',
      postalCode: '89000',
      addressRegion: 'Bourgogne-Franche-Comté',
      addressCountry: 'FR'
    },
    areaServed: {
      '@type': 'AdministrativeArea',
      name: "Yonne (89)"
    },
    priceRange: 'Gratuit pour le particulier'
  };
}
