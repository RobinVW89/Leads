/**
 * Purge des demandes au-delà de la durée de conservation.
 *
 * Durée retenue : 24 mois après réception, conformément à ce qui est annoncé
 * dans la politique de confidentialité du site. La suppression est définitive.
 */

type Env = {
  DB: D1Database;
};

const CONSERVATION_MOIS = 24;

async function purger(env: Env): Promise<{ supprimees: number }> {
  const resultat = await env.DB.prepare(
    `DELETE FROM leads WHERE created_at < datetime('now', ?)`
  )
    .bind(`-${CONSERVATION_MOIS} months`)
    .run();

  return { supprimees: Number(resultat.meta?.changes ?? 0) };
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const { supprimees } = await purger(env);
    console.log(`Purge ${CONSERVATION_MOIS} mois : ${supprimees} demande(s) supprimée(s).`);
  },

  /**
   * Aucune purge déclenchable par requête : ce serait un endpoint destructif
   * sans authentification. Le Worker n'a pas d'URL publique (workers_dev
   * désactivé) et ne s'exécute que sur son déclencheur cron.
   * Pour une purge manuelle : npx wrangler dev --test-scheduled, ou
   * wrangler d1 execute avec la requête DELETE correspondante.
   */
  async fetch(): Promise<Response> {
    return new Response('Ce Worker ne répond qu’à son déclencheur planifié.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
};
