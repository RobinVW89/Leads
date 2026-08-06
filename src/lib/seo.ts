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

/**
 * `questions` permet de déclarer exactement ce que la page affiche, FAQ locale
 * comprise. Un FAQPage qui annonce des questions absentes de la page est une
 * cause classique de perte du rich result.
 */
/** FAQPage à partir des seules questions affichées sur la page. */
export function faqPageSchema(questions: Array<{ question: string; reponse: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.reponse
      }
    }))
  };
}

export function faqSchema(metier: Metier, questions?: Array<{ question: string; reponse: string }>) {
  return faqPageSchema(questions ?? metier.questionsFrequentes);
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

/**
 * Identité de l'éditeur.
 *
 * Remplace l'ancien `ProfessionalService`, qui déclarait une adresse postale à
 * Auxerre. Cette adresse n'existe pas : le site est un service de mise en
 * relation, sans établissement recevant du public. Annoncer une implantation
 * locale fictive à Google, c'est prendre le risque d'une pénalité et, surtout,
 * affirmer quelque chose de faux.
 *
 * `Organization` dit ce qui est vrai — qui édite le site, comment le joindre,
 * quel territoire est couvert — sans prétendre à un local commercial.
 */
export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_CONFIG.siteName,
    url: SITE_CONFIG.siteUrl,
    description: SITE_CONFIG.description,
    telephone: SITE_CONFIG.telContact,
    email: SITE_CONFIG.contactEmail,
    logo: new URL('/images/og-lesprosdelyonne.jpg', SITE_CONFIG.siteUrl).toString(),
    areaServed: {
      '@type': 'AdministrativeArea',
      name: 'Yonne (89)'
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      telephone: SITE_CONFIG.telContact,
      email: SITE_CONFIG.contactEmail,
      areaServed: 'FR',
      availableLanguage: 'French'
    }
  };
}

/** Le site lui-même, avec son moteur de recherche interne de métiers. */
export function webSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_CONFIG.siteName,
    url: SITE_CONFIG.siteUrl,
    inLanguage: 'fr-FR',
    publisher: {
      '@type': 'Organization',
      name: SITE_CONFIG.siteName,
      url: SITE_CONFIG.siteUrl
    }
  };
}
