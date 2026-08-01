/**
 * Réponse du professionnel : acceptation ou refus, depuis le lien reçu par
 * e-mail.
 *
 * Le jeton est une clé de capacité. Il ne désigne pas un compte mais une
 * autorisation étroite : répondre à une demande précise, une seule fois, tant
 * qu'elle est effectivement attribuée à son porteur. Cela évite d'avoir à
 * authentifier le professionnel — il n'a pas de compte — sans pour autant
 * ouvrir quoi que ce soit d'autre.
 *
 * Quatre conditions sont vérifiées à chaque ouverture, et redites au moment
 * d'enregistrer : le jeton existe, la réponse n'a pas déjà été donnée, la
 * demande est toujours attribuée à ce professionnel, et le lien n'a pas
 * expiré. La dernière garantit qu'un e-mail retrouvé dans une archive ne
 * réattribue pas une demande vieille de plusieurs mois.
 */

/**
 * Durée de validité du lien de réponse.
 *
 * Une demande de travaux se périme vite : passé deux jours sans réponse, le
 * demandeur a souvent déjà appelé ailleurs, et transmettre ses coordonnées
 * n'aurait plus de sens. Le lien cesse donc d'agir au bout de 48 heures.
 *
 * Conséquence à connaître : la demande reste réservée au professionnel qui n'a
 * pas répondu. C'est depuis /admin qu'on enregistre son absence de réponse pour
 * la proposer au suivant.
 */
export const VALIDITE_HEURES = 48;

/**
 * 256 bits d'aléa, en base64url pour tenir dans une URL sans encodage.
 * `crypto.getRandomValues` est l'aléa cryptographique du runtime Cloudflare.
 */
export function nouveauJeton(): string {
  const octets = crypto.getRandomValues(new Uint8Array(32));
  let binaire = '';
  for (const octet of octets) binaire += String.fromCharCode(octet);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Longueur et alphabet attendus : rejette une URL bricolée avant toute requête. */
export function jetonPlausible(valeur: unknown): string | null {
  const brut = String(valeur ?? '').trim();
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(brut)) return null;
  return brut;
}

export type Dossier = {
  attributionId: number;
  envoyeLe: string;
  leadId: number;
  professionnelId: number;
  raisonSociale: string;
  /** Destinataire du message de coordonnées. Jamais affiché sur la page. */
  emailPro: string;
  /** Ce que la page publique peut montrer : rien de nominatif. */
  typeDemande: string;
  commune: string;
  dateDemande: string;
};

export type EtatJeton =
  | { ok: true; dossier: Dossier }
  | { ok: false; motif: 'inconnu' | 'deja-repondu' | 'plus-attribuee' | 'expire'; reponse?: string; quand?: string };

type LigneJointe = {
  attribution_id: number;
  envoye_le: string;
  repondu_at: string | null;
  lead_id: number;
  professionnel_id: number;
  raison_sociale: string;
  email_pro: string;
  pro_actif_id: number | null;
  metier_nom: string | null;
  metier: string | null;
  commune: string | null;
  ville: string | null;
  code_postal: string | null;
  created_at: string;
  submitted_at: string | null;
  /** Réponse déjà enregistrée pour cet envoi, s'il y en a une. */
  reponse: string | null;
};

function enDate(valeur: string | null | undefined): Date | null {
  const brut = String(valeur ?? '').trim();
  if (!brut) return null;
  const d = new Date(brut.includes('T') ? brut : brut.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Charge et valide un jeton.
 * Une seule requête : la page publique est ouverte depuis un e-mail, elle doit
 * rester rapide et ne pas multiplier les allers-retours en base.
 */
export async function ouvrirJeton(db: D1Database, jeton: string): Promise<EtatJeton> {
  const ligne = await db
    .prepare(
      `SELECT a.id AS attribution_id, a.created_at AS envoye_le, a.repondu_at,
              a.lead_id, a.professionnel_id,
              p.raison_sociale, p.email AS email_pro,
              l.pro_actif_id, l.metier_nom, l.metier, l.commune, l.ville, l.code_postal,
              l.created_at, l.submitted_at,
              (SELECT r.statut FROM attributions r
                WHERE r.lead_id = a.lead_id AND r.professionnel_id = a.professionnel_id
                  AND r.statut IN ('accepte', 'refuse')
                ORDER BY r.id DESC LIMIT 1) AS reponse
         FROM attributions a
         JOIN professionnels p ON p.id = a.professionnel_id
         JOIN leads l ON l.id = a.lead_id
        WHERE a.jeton = ? AND a.statut = 'envoye'`
    )
    .bind(jeton)
    .first<LigneJointe>();

  if (!ligne) return { ok: false, motif: 'inconnu' };

  if (ligne.repondu_at) {
    return { ok: false, motif: 'deja-repondu', reponse: ligne.reponse || undefined, quand: ligne.repondu_at };
  }

  // La demande a pu être libérée depuis /admin, puis confiée à quelqu'un
  // d'autre : le lien de l'ancien destinataire doit alors cesser d'agir.
  if (ligne.pro_actif_id !== ligne.professionnel_id) return { ok: false, motif: 'plus-attribuee' };

  const envoye = enDate(ligne.envoye_le);
  if (!envoye || Date.now() - envoye.getTime() > VALIDITE_HEURES * 3_600_000) {
    return { ok: false, motif: 'expire' };
  }

  return {
    ok: true,
    dossier: {
      attributionId: ligne.attribution_id,
      envoyeLe: ligne.envoye_le,
      leadId: ligne.lead_id,
      professionnelId: ligne.professionnel_id,
      raisonSociale: ligne.raison_sociale,
      emailPro: ligne.email_pro,
      typeDemande: ligne.metier_nom || ligne.metier || 'Demande de travaux',
      commune: [ligne.commune || ligne.ville || '', ligne.code_postal || ''].filter(Boolean).join(' ').trim(),
      dateDemande: ligne.submitted_at || ligne.created_at
    }
  };
}

export type Choix = 'accepte' | 'refuse';

export function choixValide(valeur: unknown): Choix | null {
  const brut = String(valeur ?? '').trim();
  return brut === 'accepte' || brut === 'refuse' ? brut : null;
}

export type ResultatReponse = { ok: true; choix: Choix } | { ok: false; motif: 'course' };

/**
 * Enregistre la réponse.
 *
 * `repondu_at IS NULL` dans le WHERE est ce qui rend la réponse unique : deux
 * clics simultanés, ou un lien rouvert dans un autre onglet, ne peuvent pas
 * produire deux enregistrements. C'est le même principe que la prise exclusive
 * du lead côté /admin — la base tranche, pas l'interface.
 *
 * Un refus libère la demande, de sorte que le professionnel suivant puisse
 * être proposé sans intervention. Une acceptation la laisse attribuée : elle
 * est chez quelqu'un, et doit y rester.
 */
export async function enregistrerReponse(
  db: D1Database,
  dossier: Dossier,
  choix: Choix,
  motif: string
): Promise<ResultatReponse> {
  const prise = await db
    .prepare("UPDATE attributions SET repondu_at = datetime('now') WHERE id = ? AND repondu_at IS NULL")
    .bind(dossier.attributionId)
    .run();

  if (Number(prise.meta?.changes ?? 0) !== 1) return { ok: false, motif: 'course' };

  const trace = db
    .prepare('INSERT INTO attributions (lead_id, professionnel_id, statut, motif, email_envoye) VALUES (?, ?, ?, ?, 0)')
    .bind(dossier.leadId, dossier.professionnelId, choix, motif.slice(0, 300) || null);

  if (choix === 'accepte') {
    await db.batch([trace]);
    return { ok: true, choix };
  }

  await db.batch([
    trace,
    db
      .prepare(
        "UPDATE leads SET pro_actif_id = NULL, pro_actif_at = NULL, statut = 'nouveau' WHERE id = ? AND pro_actif_id = ?"
      )
      .bind(dossier.leadId, dossier.professionnelId)
  ]);

  return { ok: true, choix };
}
