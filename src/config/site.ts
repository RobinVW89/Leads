export const SITE_CONFIG = {
  siteUrl: 'https://lesprosdelyonne.com',
  siteName: 'Travaux & Pros de l\'Yonne',
  tagline: 'Trouvez un artisan de confiance dans l\'Yonne, devis gratuit sous 24 h.',
  description:
    'Réseau local de professionnels vérifiés dans l\'Yonne. Décrivez votre besoin et recevez un rappel rapide d\'un professionnel adapté.',
  n8nWebhookUrl: 'https://formspree.io/f/mpqgnvvg',
  telContact: '07 44 96 36 60',
  telContactHref: '+33744963660',
  contactEmail: 'contact@lesprosdelyonne.com',
  // Clé publique du widget Turnstile : figure dans le HTML, ce n'est pas un secret.
  // La clé secrète correspondante est un secret Pages (TURNSTILE_SECRET_KEY).
  turnstileSiteKey: '0x4AAAAAAECMgELzsW8pYyu0'
} as const;
