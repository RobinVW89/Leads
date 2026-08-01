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
    baseURL: 'http://localhost:4321',
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Le projet lance son serveur de développement en arrière-plan
  // (voir AGENTS.md). On le réutilise s'il tourne déjà, sinon on le démarre.
  webServer: {
    command: 'npx astro dev --port 4321',
    url: 'http://localhost:4321/',
    reuseExistingServer: true,
    timeout: 120_000
  }
});
