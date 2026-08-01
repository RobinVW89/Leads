/**
 * Tests de la reconnaissance des plateformes d'IA.
 *
 * Le module est pur : il reçoit une URL et un référent, il renvoie un verdict.
 * Tout est donc vérifiable ici, sans navigateur ni compte Analytics.
 *
 * Le cas le plus important n'est pas de reconnaître Gemini, mais de ne PAS
 * classer en Gemini le trafic Google ordinaire : la règle Gemini passe en
 * premier, et une correspondance trop large rendrait toute la mesure fausse.
 *
 * Exécution : npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  depuisReferent,
  depuisUtm,
  detecterIA,
  SOURCES_RECONNUES,
  verdictDeSession
} from '../src/lib/detection-ia.ts';

const PAGE = 'https://lesprosdelyonne.com/couvreur/auxerre/';

/** Raccourci : détection à partir du seul référent. */
function parReferent(referent: string) {
  return detecterIA({ url: PAGE, referent });
}

/** Raccourci : détection à partir du seul lien d'arrivée. */
function parLien(requete: string) {
  return detecterIA({ url: `${PAGE}?${requete}`, referent: '' });
}

describe('couverture des plateformes demandées', () => {
  it('reconnaît les dix plateformes attendues', () => {
    assert.deepEqual(SOURCES_RECONNUES, [
      'gemini',
      'chatgpt',
      'claude',
      'perplexity',
      'copilot',
      'mistral',
      'deepseek',
      'grok',
      'meta_ai',
      'you'
    ]);
  });
});

describe('détection par domaine référent', () => {
  const cas: Array<[string, string]> = [
    ['https://gemini.google.com/app', 'gemini'],
    ['https://bard.google.com/chat', 'gemini'],
    ['https://chatgpt.com/c/abc', 'chatgpt'],
    ['https://chat.openai.com/', 'chatgpt'],
    ['https://claude.ai/chat/123', 'claude'],
    ['https://www.perplexity.ai/search?q=couvreur', 'perplexity'],
    ['https://copilot.microsoft.com/chats/1', 'copilot'],
    ['https://chat.mistral.ai/chat', 'mistral'],
    ['https://chat.deepseek.com/a/chat', 'deepseek'],
    ['https://grok.com/chat/1', 'grok'],
    ['https://x.ai/', 'grok'],
    ['https://www.meta.ai/', 'meta_ai'],
    ['https://you.com/search?q=couvreur', 'you']
  ];

  for (const [referent, attendu] of cas) {
    it(`${new URL(referent).hostname} → ${attendu}`, () => {
      assert.deepEqual(parReferent(referent), { source_ia: attendu, methode_attribution: 'referent' });
    });
  }

  it('accepte un sous-domaine de la plateforme', () => {
    assert.equal(parReferent('https://www.perplexity.ai/')?.source_ia, 'perplexity');
  });

  it('ignore un référent vide, absent ou illisible', () => {
    assert.equal(parReferent(''), null);
    assert.equal(parReferent('pas-une-url'), null);
    assert.equal(detecterIA({}), null);
  });
});

describe('le trafic Google ordinaire n’est jamais attribué à Gemini', () => {
  const googleNonIA = [
    'https://www.google.com/',
    'https://www.google.fr/search?q=couvreur+auxerre',
    'https://google.com/',
    'https://news.google.com/',
    'https://www.googleusercontent.com/',
    'https://images.google.fr/'
  ];

  for (const referent of googleNonIA) {
    it(`${new URL(referent).hostname} n’est pas de l’IA`, () => {
      assert.equal(parReferent(referent), null);
    });
  }

  it('seul gemini.google.com compte comme Gemini', () => {
    assert.equal(parReferent('https://gemini.google.com/')?.source_ia, 'gemini');
    assert.equal(parReferent('https://www.google.com/')?.source_ia, undefined);
  });

  it('un AI Overview reste indiscernable d’une recherche, et n’est donc pas compté', () => {
    // Google ne distingue pas ses résumés IA dans le référent : les compter
    // reviendrait à attribuer toute la recherche à Gemini.
    assert.equal(parReferent('https://www.google.com/search?q=couvreur'), null);
  });
});

describe('détection par UTM', () => {
  it('reconnaît une campagne Gemini', () => {
    assert.deepEqual(parLien('utm_source=gemini&utm_medium=ia'), {
      source_ia: 'gemini',
      methode_attribution: 'utm'
    });
  });

  it('reconnaît la plateforme dans n’importe quel paramètre d’origine', () => {
    assert.equal(parLien('utm_source=chatgpt.com')?.source_ia, 'chatgpt');
    assert.equal(parLien('utm_medium=referral&utm_campaign=perplexity_avril')?.source_ia, 'perplexity');
    assert.equal(parLien('ref=claude')?.source_ia, 'claude');
    assert.equal(parLien('source=copilot')?.source_ia, 'copilot');
    assert.equal(parLien('utm_content=deepseek-test')?.source_ia, 'deepseek');
  });

  it('reconnaît Le Chat de Mistral sous ses deux noms', () => {
    assert.equal(parLien('utm_source=mistral')?.source_ia, 'mistral');
    assert.equal(parLien('utm_source=lechat')?.source_ia, 'mistral');
  });

  it('l’UTM prime sur le référent', () => {
    // Un lien balisé Gemini, ouvert depuis une page Perplexity : c'est le
    // balisage volontaire qui fait foi.
    const verdict = detecterIA({
      url: `${PAGE}?utm_source=gemini`,
      referent: 'https://www.perplexity.ai/'
    });
    assert.deepEqual(verdict, { source_ia: 'gemini', methode_attribution: 'utm' });
  });

  it('ignore une URL sans paramètre d’origine', () => {
    assert.equal(depuisUtm(PAGE), null);
    assert.equal(depuisUtm('pas-une-url'), null);
    assert.equal(parLien('page=2'), null);
  });

  it('n’invente pas une plateforme à partir d’un mot quelconque', () => {
    assert.equal(parLien('utm_source=newsletter'), null);
    assert.equal(parLien('utm_source=facebook&utm_medium=cpc'), null);
    assert.equal(parLien('utm_campaign=printemps2026'), null);
  });
});

describe('trafic non-IA', () => {
  const ordinaires = [
    'https://www.bing.com/search?q=couvreur',
    'https://duckduckgo.com/',
    'https://www.facebook.com/',
    'https://fr.wikipedia.org/wiki/Auxerre',
    'https://lesprosdelyonne.com/couvreur/'
  ];

  for (const referent of ordinaires) {
    it(`${new URL(referent).hostname} n’est pas compté`, () => {
      assert.equal(parReferent(referent), null);
    });
  }
});

describe('reprise depuis la session', () => {
  it('accepte une étiquette connue et la marque comme venant de la session', () => {
    assert.deepEqual(verdictDeSession('perplexity'), {
      source_ia: 'perplexity',
      methode_attribution: 'session'
    });
  });

  it('refuse une valeur inconnue ou bricolée', () => {
    assert.equal(verdictDeSession('google'), null);
    assert.equal(verdictDeSession('<script>'), null);
    assert.equal(verdictDeSession(''), null);
    assert.equal(verdictDeSession(null), null);
    assert.equal(verdictDeSession(42), null);
  });
});

describe('aucune donnée personnelle dans le verdict', () => {
  it('ne renvoie que deux étiquettes courtes, jamais l’URL ni le référent', () => {
    const verdict = detecterIA({
      url: `${PAGE}?utm_source=chatgpt&email=camille.durand@example.fr&tel=0612345678`,
      referent: 'https://chatgpt.com/c/une-conversation-privee'
    });

    assert.deepEqual(Object.keys(verdict ?? {}).sort(), ['methode_attribution', 'source_ia']);

    const serialise = JSON.stringify(verdict);
    assert.doesNotMatch(serialise, /camille|example\.fr|0612345678/);
    assert.doesNotMatch(serialise, /une-conversation-privee/);
    assert.doesNotMatch(serialise, /https?:/);
  });

  it('ne récupère jamais la valeur brute d’un paramètre', () => {
    const verdict = depuisUtm(`${PAGE}?utm_source=chatgpt.com%2Fc%2Fsecret`);
    assert.equal(verdict, 'chatgpt');
  });
});
