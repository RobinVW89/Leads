/**
 * Réception des demandes du formulaire.
 *
 * Ordre volontaire : on enregistre en base AVANT de relayer vers le webhook.
 * Si le relais échoue, la demande n'est pas perdue — elle reste consultable
 * dans /admin avec transmis_webhook = 0.
 */

type Env = {
  DB: D1Database;
  TURNSTILE_SECRET_KEY?: string;
  WEBHOOK_URL?: string;
};

// Doit rester aligné sur SITE_CONFIG.n8nWebhookUrl (src/config/site.ts).
// Surchargeable par une variable d'environnement Pages sans redéploiement.
const WEBHOOK_PAR_DEFAUT = 'https://formspree.io/f/mpqgnvvg';

const CHAMPS_MAX = {
  prenom: 80,
  nom: 80,
  telephone: 30,
  email: 160,
  commune: 120,
  codePostal: 10,
  description: 4000,
  delaiSouhaite: 40,
  budget: 40,
  qualification: 4000,
  metier: 80,
  metier_nom: 120,
  ville: 120,
  page_source: 300,
  type: 20
} as const;

type ChampNom = keyof typeof CHAMPS_MAX;

function texte(valeur: unknown, champ: ChampNom): string {
  if (typeof valeur !== 'string') return '';
  return valeur.trim().slice(0, CHAMPS_MAX[champ]);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

const ACTION_ATTENDUE = 'lead-form';

type ResultatSiteverify = {
  success?: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
};

/**
 * Vérification Turnstile en mode fermé : tout ce qui n'est pas explicitement
 * valide est refusé, y compris une panne du service de vérification.
 */
async function verifierTurnstile(
  token: string,
  secret: string,
  ip: string | null,
  hoteAttendu: string | null
): Promise<{ ok: true } | { ok: false; motif: string }> {
  const corps = new FormData();
  corps.append('secret', secret);
  corps.append('response', token);
  if (ip) corps.append('remoteip', ip);

  let resultat: ResultatSiteverify;
  try {
    const reponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: corps
    });
    if (!reponse.ok) {
      return { ok: false, motif: 'service de vérification indisponible' };
    }
    resultat = (await reponse.json()) as ResultatSiteverify;
  } catch {
    // Mode fermé : une panne ne doit pas ouvrir une porte.
    return { ok: false, motif: 'service de vérification injoignable' };
  }

  if (resultat.success !== true) {
    const codes = resultat['error-codes'] || [];
    // timeout-or-duplicate = jeton expiré ou déjà consommé.
    const motif = codes.includes('timeout-or-duplicate')
      ? 'jeton expiré ou déjà utilisé'
      : codes.length > 0
        ? `jeton refusé (${codes.join(', ')})`
        : 'jeton refusé';
    return { ok: false, motif };
  }

  // L'action doit être celle du formulaire : un jeton obtenu ailleurs est rejeté.
  if (resultat.action && resultat.action !== ACTION_ATTENDUE) {
    return { ok: false, motif: 'action inattendue' };
  }

  // Le jeton doit avoir été résolu sur le domaine qui reçoit la demande.
  // hoteAttendu vaut null en développement local, où les clés de test
  // officielles répondent toujours « example.com ».
  if (hoteAttendu && resultat.hostname && resultat.hostname !== hoteAttendu) {
    return { ok: false, motif: 'domaine inattendu' };
  }

  return { ok: true };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Méthode non autorisée', { status: 405, headers: { Allow: 'POST' } });
  }

  let charge: Record<string, unknown>;
  try {
    charge = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, erreur: 'Corps de requête invalide.' }, 400);
  }

  // --- Anti-spam ---------------------------------------------------------
  // Pot de miel : un bot remplit tous les champs, un humain ne voit pas celui-ci.
  if (typeof charge.website === 'string' && charge.website.trim().length > 0) {
    return json({ ok: true, ignore: true });
  }

  const debut = Number(charge.startedAt || 0);
  if (debut > 0 && Date.now() - debut < 3000) {
    return json({ ok: false, erreur: 'Envoi trop rapide.' }, 429);
  }

  // Mode fermé : hors développement local, l'absence de clé secrète bloque
  // l'endpoint. Aucune demande ne passe sans vérification anti-robot.
  const hote = new URL(request.url).hostname;
  const enLocal = hote === 'localhost' || hote === '127.0.0.1';

  if (!env.TURNSTILE_SECRET_KEY) {
    if (!enLocal) {
      return json(
        { ok: false, erreur: 'Le formulaire est momentanément indisponible. Merci de nous appeler.' },
        503
      );
    }
  } else {
    const token = typeof charge.turnstileToken === 'string' ? charge.turnstileToken.trim() : '';
    if (!token) {
      return json({ ok: false, erreur: 'Vérification anti-robot manquante. Rechargez la page et réessayez.' }, 400);
    }
    const verification = await verifierTurnstile(
      token,
      env.TURNSTILE_SECRET_KEY,
      request.headers.get('CF-Connecting-IP'),
      enLocal ? null : hote
    );
    if (!verification.ok) {
      return json({ ok: false, erreur: `Vérification anti-robot échouée : ${verification.motif}.` }, 403);
    }
  }

  // --- Normalisation -----------------------------------------------------
  const lead = {
    type: texte(charge.type, 'type') || 'lead',
    metier: texte(charge.metier, 'metier'),
    metier_nom: texte(charge.metier_nom, 'metier_nom'),
    ville: texte(charge.ville, 'ville'),
    prenom: texte(charge.prenom, 'prenom'),
    nom: texte(charge.nom, 'nom'),
    telephone: texte(charge.telephone, 'telephone'),
    email: texte(charge.email, 'email'),
    commune: texte(charge.commune, 'commune'),
    codePostal: texte(charge.codePostal, 'codePostal'),
    description: texte(charge.description, 'description'),
    delaiSouhaite: texte(charge.delaiSouhaite, 'delaiSouhaite'),
    budget: texte(charge.budget, 'budget'),
    qualification: texte(charge.qualification, 'qualification'),
    page_source: texte(charge.page_source, 'page_source'),
    submittedAt: typeof charge.submittedAt === 'string' ? charge.submittedAt.slice(0, 40) : new Date().toISOString()
  };

  // Une demande sans aucun moyen de rappel n'a pas d'intérêt.
  if (!lead.email && !lead.telephone) {
    return json({ ok: false, erreur: 'Un email ou un téléphone est nécessaire.' }, 400);
  }

  // --- Écriture en base --------------------------------------------------
  let leadId: number | null = null;
  let erreurBase: string | null = null;

  try {
    const resultat = await env.DB.prepare(
      `INSERT INTO leads (
        submitted_at, type, metier, metier_nom, ville,
        prenom, nom, telephone, email, commune, code_postal,
        description, delai_souhaite, budget, qualification,
        page_source, user_agent, pays
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        lead.submittedAt,
        lead.type,
        lead.metier,
        lead.metier_nom,
        lead.ville,
        lead.prenom,
        lead.nom,
        lead.telephone,
        lead.email,
        lead.commune,
        lead.codePostal,
        lead.description,
        lead.delaiSouhaite,
        lead.budget,
        lead.qualification,
        lead.page_source,
        (request.headers.get('User-Agent') || '').slice(0, 300),
        request.headers.get('CF-IPCountry') || ''
      )
      .run();

    leadId = Number(resultat.meta?.last_row_id ?? 0) || null;
  } catch (error) {
    erreurBase = error instanceof Error ? error.message : 'inconnue';
  }

  // --- Relais vers le webhook (flux e-mail existant) ----------------------
  let transmis = false;
  try {
    const reponse = await fetch(env.WEBHOOK_URL || WEBHOOK_PAR_DEFAUT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead)
    });
    transmis = reponse.ok;
  } catch {
    transmis = false;
  }

  if (leadId && transmis) {
    try {
      await env.DB.prepare('UPDATE leads SET transmis_webhook = 1, statut = ? WHERE id = ?')
        .bind('transmis', leadId)
        .run();
    } catch {
      // Sans gravité : la demande est enregistrée, seul l'indicateur reste à 0.
    }
  }

  // La demande est considérée reçue dès qu'elle est enregistrée OU transmise.
  if (!leadId && !transmis) {
    return json({ ok: false, erreur: erreurBase ? 'Enregistrement impossible.' : 'Transmission impossible.' }, 502);
  }

  return json({ ok: true, enregistre: Boolean(leadId), transmis });
};
