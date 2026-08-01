/**
 * Reconnaissance de la plateforme d'IA à l'origine d'une visite.
 *
 * Logique pure : ni DOM, ni stockage, ni réseau. Elle reçoit une URL et un
 * référent, elle renvoie un verdict. C'est ce qui la rend testable sans
 * navigateur, et c'est aussi ce qui garantit qu'elle ne peut rien émettre
 * toute seule — l'appel n'a lieu qu'après consentement, depuis le bandeau.
 *
 * Deux signaux, dans cet ordre :
 * 1. les UTM, posés délibérément dans le lien — le plus fiable ;
 * 2. le domaine référent, quand la plateforme le transmet.
 *
 * Aucune donnée brute ne ressort d'ici : ni l'URL, ni le référent complet.
 * Seulement une étiquette courte et la méthode qui a permis de la déduire.
 */

/** Étiquettes envoyées à GA4. Volontairement stables et sans espace. */
export type SourceIA =
  | 'gemini'
  | 'chatgpt'
  | 'claude'
  | 'perplexity'
  | 'copilot'
  | 'mistral'
  | 'deepseek'
  | 'grok'
  | 'meta_ai'
  | 'you';

export type MethodeAttribution = 'utm' | 'referent' | 'session';

export type Verdict = { source_ia: SourceIA; methode_attribution: MethodeAttribution };

type Regle = {
  source: SourceIA;
  /** Hôtes référents exacts, ou suffixes de domaine précédés d'un point. */
  hotes: string[];
  /** Fragments cherchés dans les UTM, en minuscules. */
  motifs: string[];
};

/**
 * Les hôtes sont volontairement listés un par un plutôt que devinés par
 * mots-clés : « openai » apparaît aussi dans des articles de blog qui nous
 * lient, et une correspondance approximative gonflerait les chiffres.
 */
const REGLES: Regle[] = [
  {
    source: 'gemini',
    // bard.google.com est l'ancien nom, encore présent dans de vieux partages.
    hotes: ['gemini.google.com', 'bard.google.com'],
    motifs: ['gemini', 'bard.google']
  },
  {
    source: 'chatgpt',
    hotes: ['chatgpt.com', 'chat.openai.com', 'openai.com'],
    motifs: ['chatgpt', 'openai']
  },
  {
    source: 'claude',
    hotes: ['claude.ai', 'anthropic.com'],
    motifs: ['claude', 'anthropic']
  },
  {
    source: 'perplexity',
    hotes: ['perplexity.ai'],
    motifs: ['perplexity']
  },
  {
    source: 'copilot',
    hotes: ['copilot.microsoft.com', 'm365.cloud.microsoft', 'copilot.cloud.microsoft'],
    motifs: ['copilot']
  },
  {
    source: 'mistral',
    hotes: ['chat.mistral.ai', 'mistral.ai'],
    motifs: ['mistral', 'lechat']
  },
  {
    source: 'deepseek',
    hotes: ['chat.deepseek.com', 'deepseek.com'],
    motifs: ['deepseek']
  },
  {
    source: 'grok',
    hotes: ['grok.com', 'x.ai'],
    motifs: ['grok']
  },
  {
    source: 'meta_ai',
    hotes: ['meta.ai', 'ai.meta.com'],
    motifs: ['meta_ai', 'metaai', 'meta.ai']
  },
  {
    source: 'you',
    hotes: ['you.com'],
    motifs: ['you.com', 'youchat']
  }
];

/** Paramètres d'URL susceptibles de porter l'origine de la visite. */
const PARAMS_ORIGINE = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'ref', 'source'];

function hoteDe(valeur: string): string | null {
  const brut = String(valeur || '').trim();
  if (!brut) return null;
  try {
    return new URL(brut).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Correspondance stricte : l'hôte lui-même, ou l'un de ses sous-domaines. */
function hoteCorrespond(hote: string, attendu: string): boolean {
  return hote === attendu || hote.endsWith('.' + attendu);
}

/**
 * Garde-fou Gemini.
 *
 * Une visite venant de `www.google.com` est une visite de recherche, pas de
 * Gemini — y compris lorsqu'elle passe par un AI Overview, que Google ne
 * distingue pas dans le référent. Tout domaine Google autre que Gemini ou Bard
 * est donc explicitement neutralisé, avant même l'examen des règles.
 *
 * Sans cette barrière, la règle Gemini, qui vient en premier, capterait tout le
 * trafic Google et rendrait la mesure inexploitable.
 */
function estGoogleNonGemini(hote: string): boolean {
  if (!hoteCorrespond(hote, 'google.com') && !/(^|\.)google\.[a-z.]+$/.test(hote) && !hoteCorrespond(hote, 'googleusercontent.com')) {
    return false;
  }
  return !(hoteCorrespond(hote, 'gemini.google.com') || hoteCorrespond(hote, 'bard.google.com'));
}

/** Cherche une plateforme dans les paramètres d'origine de l'URL. */
export function depuisUtm(url: string): SourceIA | null {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return null;
  }

  const valeurs = PARAMS_ORIGINE.map((nom) => (params.get(nom) || '').toLowerCase()).filter(Boolean);
  if (valeurs.length === 0) return null;

  const assemble = valeurs.join(' ');

  for (const regle of REGLES) {
    if (regle.motifs.some((motif) => assemble.includes(motif))) return regle.source;
  }
  return null;
}

/** Cherche une plateforme dans le domaine référent. */
export function depuisReferent(referent: string): SourceIA | null {
  const hote = hoteDe(referent);
  if (!hote) return null;

  // Le trafic Google non-Gemini n'est jamais de l'IA identifiable.
  if (estGoogleNonGemini(hote)) return null;

  for (const regle of REGLES) {
    if (regle.hotes.some((attendu) => hoteCorrespond(hote, attendu))) return regle.source;
  }
  return null;
}

/**
 * Verdict complet pour une arrivée sur le site.
 * L'UTM prime : il est posé volontairement, alors que le référent peut être
 * tronqué ou absent selon la plateforme et la politique de referrer.
 */
export function detecterIA(entree: { url?: string; referent?: string }): Verdict | null {
  const parUtm = depuisUtm(entree.url || '');
  if (parUtm) return { source_ia: parUtm, methode_attribution: 'utm' };

  const parReferent = depuisReferent(entree.referent || '');
  if (parReferent) return { source_ia: parReferent, methode_attribution: 'referent' };

  return null;
}

/** Étiquette relue depuis la session : on ne la croit que si on la connaît. */
export function verdictDeSession(valeur: unknown): Verdict | null {
  const brut = String(valeur ?? '').trim();
  if (!brut) return null;
  if (!REGLES.some((regle) => regle.source === brut)) return null;
  return { source_ia: brut as SourceIA, methode_attribution: 'session' };
}

/** Liste des plateformes reconnues, utile aux tests et à la documentation. */
export const SOURCES_RECONNUES: SourceIA[] = REGLES.map((regle) => regle.source);
