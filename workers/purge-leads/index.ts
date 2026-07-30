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

  // Exécution manuelle pour vérifier le comportement sans attendre le cron.
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/purge' && request.method === 'POST') {
      const { supprimees } = await purger(env);
      return Response.json({ ok: true, supprimees, conservation_mois: CONSERVATION_MOIS });
    }

    const aPurger = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM leads WHERE created_at < datetime('now', ?)`
    )
      .bind(`-${CONSERVATION_MOIS} months`)
      .first<{ n: number }>();

    return Response.json({
      role: 'purge des demandes au-delà de la durée de conservation',
      conservation_mois: CONSERVATION_MOIS,
      a_purger_maintenant: aPurger?.n ?? 0,
      declencheur: 'cron quotidien 03:30 UTC'
    });
  }
};
