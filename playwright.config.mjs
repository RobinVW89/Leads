import { defineConfig, devices } from '@playwright/test';

/**
 * Tests navigateur : consentement et conversion.
 *
 * Ce que ces tests vérifient ne peut pas l'être ailleurs — qu'aucune requête ne
 * part vers Google avant acceptation, et que l'événement de conversion porte
 * bien la provenance. Les règles de reconnaissance des plateformes, elles, sont
 * couvertes par `tests/detection-ia.test.ts`, sans navigateur.
 *
 *   npm run test:navigateur
 */
export default defineConfig({
  testDir: './tests/navigateur',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    // Les tests s'exécutent sous le VRAI domaine de production, résolu vers la
    // machine locale. C'est ce qui permet d'exercer le garde-fou de mesure sans
    // ajouter d'exception « localhost » dans le code du site.
    baseURL: 'http://lesprosdelyonne.com:4321',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--host-resolver-rules=MAP lesprosdelyonne.com 127.0.0.1, MAP www.lesprosdelyonne.com 127.0.0.1, MAP preview.pages.test 127.0.0.1'
          ]
        }
      }
    }
  ],
  // Le serveur doit écouter sur 127.0.0.1 : c'est vers cette adresse que les
  // noms d'hôte de test sont résolus. Un serveur de développement déjà lancé
  // en arrière-plan n'écoute que sur localhost en IPv6 — d'où le port dédié.
  webServer: {
    command: 'npx astro dev --port 4321 --host 127.0.0.1',
    url: 'http://127.0.0.1:4321/',
    reuseExistingServer: true,
    timeout: 120_000
  }
});
