/**
 * Domaines autorisés à mesurer l'audience.
 *
 * Le cas qui compte est celui des prévisualisations : elles servent une copie
 * complète du site, et un oubli ici polluerait durablement les statistiques
 * réelles sans que personne ne s'en aperçoive.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analyticsAutorise, DOMAINES_MESURES } from '../src/lib/analytics-hotes.ts';

describe('domaines autorisés à mesurer', () => {
  it('n’autorise que le domaine de production, avec ou sans www', () => {
    assert.deepEqual(DOMAINES_MESURES, ['lesprosdelyonne.com', 'www.lesprosdelyonne.com']);
    assert.equal(analyticsAutorise('lesprosdelyonne.com'), true);
    assert.equal(analyticsAutorise('www.lesprosdelyonne.com'), true);
  });

  it('refuse toutes les prévisualisations pages.dev', () => {
    const previews = [
      'denys-dgm.pages.dev',
      'seo-aio-sens-joigny.denys-dgm.pages.dev',
      'routage-leads.denys-dgm.pages.dev',
      '4bc4ed9.denys-dgm.pages.dev',
      'leads-auxerre.pages.dev',
      'pages.dev'
    ];
    for (const hote of previews) {
      assert.equal(analyticsAutorise(hote), false, hote);
    }
  });

  it('refuse le développement local', () => {
    assert.equal(analyticsAutorise('localhost'), false);
    assert.equal(analyticsAutorise('127.0.0.1'), false);
    assert.equal(analyticsAutorise('0.0.0.0'), false);
  });

  it('refuse un domaine qui imite celui de production', () => {
    const imitations = [
      'lesprosdelyonne.com.exemple.fr',
      'notlesprosdelyonne.com',
      'lesprosdelyonne.com.pages.dev',
      'preprod.lesprosdelyonne.com',
      'lesprosdelyonne.fr'
    ];
    for (const hote of imitations) {
      assert.equal(analyticsAutorise(hote), false, hote);
    }
  });

  it('tolère la casse et un port, mais rien d’autre', () => {
    assert.equal(analyticsAutorise('LesProsDelYonne.com'), true);
    assert.equal(analyticsAutorise('lesprosdelyonne.com:443'), true);
    assert.equal(analyticsAutorise(' lesprosdelyonne.com '), true);
    assert.equal(analyticsAutorise(''), false);
    assert.equal(analyticsAutorise(null), false);
    assert.equal(analyticsAutorise(undefined), false);
  });
});
