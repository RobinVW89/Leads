import { expect, test } from '@playwright/test';

/**
 * Consentement, provenance et conversion, dans un vrai navigateur.
 *
 * Deux précautions valent pour tout ce fichier :
 *
 * 1. Les requêtes vers Google sont interceptées et abandonnées. On vérifie
 *    qu'elles sont tentées au bon moment, sans jamais polluer les statistiques
 *    réelles du site.
 * 2. `/api/lead` est intercepté et répond une réussite feinte. Le test de
 *    conversion ne crée donc aucune demande, ni en base de test ni ailleurs.
 */

const PAGE = '/couvreur/auxerre/';
const HOTES_GOOGLE = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com/;

/** Recense les appels à Google et les empêche de partir. */
async function surveillerGoogle(page) {
  const appels = [];
  await page.route(HOTES_GOOGLE, (route) => {
    appels.push(route.request().url());
    return route.abort();
  });
  return appels;
}

/** Événements poussés dans dataLayer, sous une forme lisible. */
async function evenements(page) {
  return page.evaluate(() => {
    const file = window.dataLayer || [];
    return file
      .map((entree) => Array.from(entree))
      .filter((args) => args[0] === 'event')
      .map((args) => ({ nom: args[1], params: args[2] || {} }));
  });
}

async function accepter(page) {
  await page.getByRole('button', { name: 'Tout accepter' }).click();
}

const CLE_CAPTURE = '__evenements-captures';

/**
 * Conserve les événements malgré la navigation.
 *
 * Un envoi réussi redirige vers /merci, ce qui vide `dataLayer` : lire après
 * coup ne montrerait rien. On recopie donc chaque poussée dans sessionStorage,
 * qui survit à un changement de page sur la même origine. Le code du site
 * n'est pas modifié — seule la file est observée.
 */
async function capturerEvenements(page) {
  await page.evaluate((cle) => {
    sessionStorage.removeItem(cle);
    const file = window.dataLayer;
    if (!file) return;

    const pousserOrigine = file.push.bind(file);
    file.push = function (...entrees) {
      try {
        const deja = JSON.parse(sessionStorage.getItem(cle) || '[]');
        for (const entree of entrees) deja.push(Array.from(entree));
        sessionStorage.setItem(cle, JSON.stringify(deja));
      } catch (e) {
        // Capture impossible : le test échouera, ce qui est le comportement voulu.
      }
      return pousserOrigine(...entrees);
    };
  }, CLE_CAPTURE);
}

/** Événements capturés, y compris ceux émis juste avant une navigation. */
async function evenementsCaptures(page) {
  return page.evaluate((cle) => {
    const brut = sessionStorage.getItem(cle);
    if (!brut) return [];
    return JSON.parse(brut)
      .filter((args) => args[0] === 'event')
      .map((args) => ({ nom: args[1], params: args[2] || {} }));
  }, CLE_CAPTURE);
}

/**
 * Remplit et envoie le formulaire sans jamais appeler l'API réelle.
 * `/api/lead` est intercepté et renvoie la réussite attendue : aucune demande
 * n'est créée, et c'est bien le chemin de succès qui est exercé.
 */
async function envoyerFormulaire(page, { reponse }) {
  await page.route('**/api/lead', (route) =>
    route.fulfill({
      status: reponse.status,
      contentType: reponse.contentType,
      body: reponse.body
    })
  );

  const message = await page.evaluate(() => {
    const form = document.querySelector('form[id$="-form"], form');
    if (!form) throw new Error('formulaire introuvable');

    const poser = (nom, valeur) => {
      const champ = form.querySelector(`input[name="${nom}"], textarea[name="${nom}"], select[name="${nom}"]`);
      if (champ) {
        champ.value = valeur;
        champ.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    poser('prenom', 'Test');
    poser('nom', 'Navigateur');
    poser('telephone', '0600000000');
    poser('email', 'test@example.invalid');
    poser('commune', 'Auxerre');
    poser('codePostal', '89000');
    poser('description', 'Vérification automatisée du suivi de conversion.');

    // Le parcours de qualification pose des questions à choix unique, toutes
    // obligatoires : sans réponse, le navigateur refuse la validation. On
    // répond au premier choix proposé, quelle que soit la forme du champ.
    for (const champ of form.querySelectorAll('[required]')) {
      if (champ.type === 'radio') {
        const premier = form.querySelector(`input[type="radio"][name="${champ.name}"]`);
        if (premier && !form.querySelector(`input[type="radio"][name="${champ.name}"]:checked`)) {
          premier.checked = true;
          premier.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else if (champ.tagName === 'SELECT' && !champ.value) {
        const option = Array.from(champ.options).find((o) => o.value);
        if (option) {
          champ.value = option.value;
          champ.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }

    const consentement = form.querySelector('[name="consentementDonnees"]');
    if (consentement) consentement.checked = true;

    // Le formulaire refuse un envoi trop rapide : on antidate l'ouverture.
    const depart = form.querySelector('[name="startedAt"]');
    if (depart) depart.value = String(Date.now() - 20000);

    // Un champ resté invalide bloquerait avant l'appel réseau, et le test
    // passerait pour de mauvaises raisons : on le signale explicitement.
    if (!form.reportValidity()) {
      const fautif = form.querySelector(':invalid');
      return 'champ invalide : ' + (fautif ? fautif.name || fautif.id : 'inconnu');
    }

    form.requestSubmit();
    return null;
  });

  if (message) throw new Error(message);
}

test.describe('avant tout consentement', () => {
  test('le bandeau est visible et rien ne part vers Google', async ({ page }) => {
    const appels = await surveillerGoogle(page);
    await page.goto(PAGE);

    await expect(page.locator('#bandeau-cookies')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tout accepter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tout refuser' })).toBeVisible();

    await page.waitForTimeout(1200);
    expect(appels).toEqual([]);
  });

  test('aucune détection, aucun stockage, aucun événement', async ({ page }) => {
    await surveillerGoogle(page);
    await page.goto(`${PAGE}?utm_source=chatgpt`);
    await page.waitForTimeout(800);

    const etat = await page.evaluate(() => ({
      source: sessionStorage.getItem('source-ia'),
      visite: sessionStorage.getItem('visite-ia-mesuree'),
      dataLayer: window.dataLayer ? window.dataLayer.length : 0,
      gtag: typeof window.gtag
    }));

    expect(etat.source).toBeNull();
    expect(etat.visite).toBeNull();
    expect(etat.dataLayer).toBe(0);
    expect(etat.gtag).toBe('undefined');
  });

  test('un refus ne déclenche rien non plus', async ({ page }) => {
    const appels = await surveillerGoogle(page);
    await page.goto(`${PAGE}?utm_source=gemini`);
    await page.getByRole('button', { name: 'Tout refuser' }).click();
    await page.waitForTimeout(800);

    await expect(page.locator('#bandeau-cookies')).toBeHidden();
    expect(appels).toEqual([]);
    expect(await page.evaluate(() => sessionStorage.getItem('source-ia'))).toBeNull();
  });

  test('fermer le bandeau équivaut à refuser', async ({ page }) => {
    const appels = await surveillerGoogle(page);
    await page.goto(`${PAGE}?utm_source=claude`);
    await page.getByRole('button', { name: 'Fermer sans accepter' }).click();
    await page.waitForTimeout(800);

    expect(appels).toEqual([]);
    expect(await page.evaluate(() => sessionStorage.getItem('source-ia'))).toBeNull();
  });
});

test.describe('après acceptation', () => {
  test('Google est chargé et la visite IA est mesurée une seule fois', async ({ page }) => {
    const appels = await surveillerGoogle(page);
    await page.goto(`${PAGE}?utm_source=perplexity`);
    await accepter(page);
    await page.waitForTimeout(800);

    expect(appels.some((url) => url.includes('googletagmanager.com'))).toBe(true);

    const liste = await evenements(page);
    const visites = liste.filter((e) => e.nom === 'visite_ia');
    expect(visites).toHaveLength(1);
    expect(visites[0].params).toEqual({ source_ia: 'perplexity', methode_attribution: 'utm' });

    // Deuxième page de la même session : la source est reprise, sans doublon.
    await page.goto('/couvreur/');
    await page.waitForTimeout(800);
    expect((await evenements(page)).filter((e) => e.nom === 'visite_ia')).toHaveLength(0);
    expect(await page.evaluate(() => sessionStorage.getItem('source-ia'))).toBe('perplexity');
  });

  test('une visite sans IA n’émet pas visite_ia', async ({ page }) => {
    await surveillerGoogle(page);
    await page.goto(PAGE);
    await accepter(page);
    await page.waitForTimeout(800);

    expect((await evenements(page)).filter((e) => e.nom === 'visite_ia')).toEqual([]);
    expect(await page.evaluate(() => sessionStorage.getItem('source-ia'))).toBeNull();
  });

  const plateformes = [
    ['gemini', 'utm_source=gemini'],
    ['chatgpt', 'utm_source=chatgpt.com'],
    ['claude', 'utm_source=claude'],
    ['perplexity', 'utm_campaign=perplexity_avril'],
    ['copilot', 'utm_source=copilot'],
    ['mistral', 'utm_source=lechat'],
    ['deepseek', 'utm_source=deepseek'],
    ['grok', 'utm_source=grok'],
    ['meta_ai', 'utm_source=metaai'],
    ['you', 'ref=you.com']
  ];

  for (const [attendu, requete] of plateformes) {
    test(`${attendu} est reconnu et transmis`, async ({ page }) => {
      await surveillerGoogle(page);
      await page.goto(`${PAGE}?${requete}`);
      await accepter(page);
      await page.waitForTimeout(500);

      const visites = (await evenements(page)).filter((e) => e.nom === 'visite_ia');
      expect(visites).toHaveLength(1);
      expect(visites[0].params.source_ia).toBe(attendu);
      expect(visites[0].params.methode_attribution).toBe('utm');
    });
  }

  test('le trafic Google ordinaire n’est pas attribué à Gemini', async ({ page }) => {
    await surveillerGoogle(page);
    // On simule une arrivée depuis la recherche Google via un référent réel.
    await page.route('https://exemple-recherche.test/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<a id="lien" href="http://lesprosdelyonne.com:4321${PAGE}">aller</a>`
      })
    );

    await page.goto(PAGE);
    await accepter(page);
    await page.evaluate(() => sessionStorage.clear());

    // Un référent Google est posé côté client par une navigation depuis google.com
    // n'étant pas reproductible hors ligne, on vérifie ici la règle appliquée
    // au référent exact reçu par le module.
    const verdict = await page.evaluate(() =>
      import('/src/lib/detection-ia.ts').then((m) => ({
        google: m.detecterIA({ url: location.href, referent: 'https://www.google.com/search?q=couvreur' }),
        gemini: m.detecterIA({ url: location.href, referent: 'https://gemini.google.com/app' })
      }))
    );

    expect(verdict.google).toBeNull();
    expect(verdict.gemini).toEqual({ source_ia: 'gemini', methode_attribution: 'referent' });
  });
});

test.describe('conversion', () => {
  test('generate_lead part avec la source, après un succès JSON confirmé', async ({ page }) => {
    await surveillerGoogle(page);
    await page.goto(`${PAGE}?utm_source=gemini`);
    await accepter(page);
    await capturerEvenements(page);

    await envoyerFormulaire(page, {
      reponse: { status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }
    });

    await page.waitForURL(/\/merci/, { timeout: 10_000 });

    const liste = (await evenementsCaptures(page)).filter((e) => e.nom === 'generate_lead');
    expect(liste).toHaveLength(1);
    expect(liste[0].params).toEqual({ source_ia: 'gemini' });
  });

  test('aucune donnée du formulaire ne figure dans les événements', async ({ page }) => {
    await surveillerGoogle(page);
    await page.goto(`${PAGE}?utm_source=chatgpt`);
    await accepter(page);
    await capturerEvenements(page);

    await envoyerFormulaire(page, {
      reponse: { status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }
    });
    await page.waitForURL(/\/merci/, { timeout: 10_000 });

    const brut = JSON.stringify(await evenementsCaptures(page));

    for (const secret of ['Navigateur', '0600000000', 'test@example.invalid', 'Vérification automatisée']) {
      expect(brut).not.toContain(secret);
    }
  });

  test('un échec applicatif n’émet aucune conversion', async ({ page }) => {
    await surveillerGoogle(page);
    await page.goto(`${PAGE}?utm_source=gemini`);
    await accepter(page);

    // Statut 200 mais { ok: false } : c'est un échec, pas une conversion.
    await envoyerFormulaire(page, {
      reponse: {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, erreur: 'refus simulé' })
      }
    });

    await expect(page.locator('.error')).toBeVisible({ timeout: 10_000 });
    const liste = (await evenements(page)).filter((e) => e.nom === 'generate_lead');
    expect(liste).toEqual([]);
  });

  test('une réponse HTML au lieu du JSON attendu n’est pas une conversion', async ({ page }) => {
    await surveillerGoogle(page);
    await page.goto(`${PAGE}?utm_source=gemini`);
    await accepter(page);

    // Cas réel observé pendant la propagation d'un déploiement : le HTML du
    // site est servi à la place de la Function, avec un statut 200.
    await envoyerFormulaire(page, {
      reponse: { status: 200, contentType: 'text/html', body: '<!doctype html><p>page</p>' }
    });

    await expect(page.locator('.error')).toBeVisible({ timeout: 10_000 });
    expect((await evenements(page)).filter((e) => e.nom === 'generate_lead')).toEqual([]);
  });

  test('sans consentement, un envoi réussi n’émet aucune conversion', async ({ page }) => {
    const appels = await surveillerGoogle(page);
    await page.goto(`${PAGE}?utm_source=gemini`);
    await page.getByRole('button', { name: 'Tout refuser' }).click();

    await envoyerFormulaire(page, {
      reponse: { status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }
    });
    await page.waitForURL(/\/merci/, { timeout: 10_000 });

    expect(appels).toEqual([]);
    expect(await page.evaluate(() => (window.dataLayer || []).length)).toBe(0);
  });
});

/**
 * Le domaine de prévisualisation réel se termine en `.pages.dev`, que Chrome
 * force en HTTPS (HSTS préchargé) et qu'on ne peut donc pas servir en clair
 * depuis un serveur de développement. On utilise ici un hôte en `.test`, TLD
 * réservé : le mécanisme exercé est identique, puisque l'autorisation repose
 * sur une liste fermée de deux domaines et non sur un motif d'exclusion.
 * Le cas littéral `*.pages.dev` est couvert par tests/analytics-hotes.test.ts.
 */
test.describe('garde-fou de domaine', () => {
  test('hors du domaine de production, rien n’est mesuré même après acceptation', async ({ page }) => {
    const appels = await surveillerGoogle(page);

    await page.goto(`http://preview.pages.test:4321${PAGE}?utm_source=gemini`);
    await expect(page.locator('#bandeau-cookies')).toBeVisible();
    await accepter(page);
    await page.waitForTimeout(1000);

    // Le bandeau se comporte normalement — il disparaît, le choix est retenu —
    // mais aucune mesure ne part.
    await expect(page.locator('#bandeau-cookies')).toBeHidden();
    expect(appels).toEqual([]);

    const etat = await page.evaluate(() => ({
      gtag: typeof window.gtag,
      dataLayer: window.dataLayer ? window.dataLayer.length : 0,
      source: sessionStorage.getItem('source-ia'),
      consentement: localStorage.getItem('consentement-mesure-audience')
    }));

    expect(etat.gtag).toBe('undefined');
    expect(etat.dataLayer).toBe(0);
    expect(etat.source).toBeNull();
    expect(etat.consentement).toContain('accepte');
  });

  test('une conversion réussie hors production n’émet rien non plus', async ({ page }) => {
    const appels = await surveillerGoogle(page);
    await page.goto(`http://preview.pages.test:4321${PAGE}?utm_source=chatgpt`);
    await accepter(page);

    await envoyerFormulaire(page, {
      reponse: { status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }
    });
    await page.waitForURL(/\/merci/, { timeout: 10_000 });

    expect(appels).toEqual([]);
    expect(await page.evaluate(() => (window.dataLayer || []).length)).toBe(0);
  });

  test('sur le domaine de production, la mesure fonctionne', async ({ page }) => {
    const appels = await surveillerGoogle(page);
    await page.goto(`http://www.lesprosdelyonne.com:4321${PAGE}?utm_source=gemini`);
    await accepter(page);
    await page.waitForTimeout(800);

    expect(appels.some((url) => url.includes('googletagmanager.com'))).toBe(true);
    const visites = (await evenements(page)).filter((e) => e.nom === 'visite_ia');
    expect(visites).toHaveLength(1);
    expect(visites[0].params.source_ia).toBe('gemini');
  });
});
