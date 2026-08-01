/**
 * Message adressé au professionnel retenu.
 *
 * Ce fichier est la seule source du contenu envoyé à un professionnel : il est
 * importé par /admin pour construire le brouillon, et par le Worker de
 * notification pour l'expédier. Une seule définition, donc aucune divergence
 * possible entre ce que l'administrateur relit et ce que le professionnel reçoit.
 *
 * Ce que le message contient : la demande et de quoi rappeler le demandeur.
 * Ce qu'il ne contient jamais : lien vers /admin, jeton Cloudflare Access,
 * mention d'un autre professionnel, identifiant de base ou en-tête technique.
 * Cette dernière règle n'est pas seulement documentaire — `fuites()` la
 * vérifie sur le texte réellement envoyé, y compris après modification à la
 * main dans le brouillon.
 */

export const IDENTITE = "Les Pros de l'Yonne";

export type LeadPourPro = {
  metier_nom?: string | null;
  metier?: string | null;
  ville?: string | null;
  commune?: string | null;
  code_postal?: string | null;
  description?: string | null;
  prenom?: string | null;
  nom?: string | null;
  telephone?: string | null;
  email?: string | null;
  delai_souhaite?: string | null;
  budget?: string | null;
  qualification?: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
};

export function echapper(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * L'adresse du demandeur ne devient Reply-To qu'après validation de son
 * format : une valeur fantaisiste rendrait l'en-tête invalide et pourrait
 * faire rejeter le message entier.
 */
export function adresseValide(valeur: unknown): string | null {
  const brut = String(valeur ?? '').trim();
  if (!brut || brut.length > 160) return null;
  if (!/^[^\s@<>",;]+@[^\s@<>",;.]+\.[a-z]{2,}$/i.test(brut)) return null;
  return brut;
}

/** D1 stocke « 2026-08-01 14:32:10 » ; le professionnel lit une date française. */
export function dateLisible(valeur: unknown): string {
  const brut = String(valeur ?? '').trim();
  if (!brut) return '';
  const d = new Date(brut.includes('T') ? brut : brut.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return brut;
  return d.toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris'
  });
}

function qualificationLisible(brut: unknown): Array<{ question: string; reponse: string }> {
  try {
    const items = JSON.parse(String(brut ?? '')) as Array<{ question?: string; reponse?: string }>;
    if (!Array.isArray(items)) return [];
    return items
      .filter((item) => item && item.reponse)
      .map((item) => ({
        question: String(item.question || '').replace(/\s*\(facultatif\)\s*/i, '').trim(),
        reponse: String(item.reponse)
      }));
  } catch {
    return [];
  }
}

function communeComplete(lead: LeadPourPro): string {
  const commune = String(lead.commune || lead.ville || '').trim();
  const cp = String(lead.code_postal || '').trim();
  return [commune, cp].filter(Boolean).join(' ');
}

function nomComplet(lead: LeadPourPro): string {
  return `${lead.prenom || ''} ${lead.nom || ''}`.trim();
}

export type Brouillon = { sujet: string; corps: string };

/**
 * Brouillon proposé à l'administrateur. Il est modifiable : le texte produit
 * ici est une base complète et directement envoyable, pas un gabarit à trous.
 */
export function construireBrouillon(lead: LeadPourPro): Brouillon {
  const typeDemande = String(lead.metier_nom || lead.metier || 'Demande de travaux').trim();
  const commune = communeComplete(lead) || 'commune non précisée';
  const demandeur = nomComplet(lead) || 'Le demandeur';
  const date = dateLisible(lead.submitted_at || lead.created_at);

  const sujet = `Nouvelle demande — ${typeDemande} à ${commune}`;

  const coordonnees: string[] = [];
  if (lead.telephone) coordonnees.push(`Téléphone : ${lead.telephone}`);
  if (lead.email) coordonnees.push(`E-mail : ${lead.email}`);

  const complements: string[] = [];
  if (lead.delai_souhaite) complements.push(`Délai souhaité : ${lead.delai_souhaite}`);
  if (lead.budget) complements.push(`Budget évoqué : ${lead.budget}`);
  for (const q of qualificationLisible(lead.qualification)) {
    complements.push(`${q.question} : ${q.reponse}`);
  }

  const corps = [
    'Bonjour,',
    '',
    `Nous vous transmettons une demande reçue sur ${IDENTITE}. Elle vous est adressée à vous seul : merci de contacter directement le demandeur.`,
    '',
    `Type de demande : ${typeDemande}`,
    `Commune : ${commune}`,
    `Date de la demande : ${date || 'non précisée'}`,
    '',
    'Description :',
    String(lead.description || '').trim() || 'Aucune description fournie.',
    ...(complements.length > 0 ? ['', 'Précisions :', ...complements.map((l) => `- ${l}`)] : []),
    '',
    'Demandeur :',
    demandeur,
    ...coordonnees,
    '',
    'Vous pouvez répondre directement à ce message : votre réponse arrivera au demandeur.',
    '',
    'Bien cordialement,',
    IDENTITE
  ].join('\n');

  return { sujet, corps };
}

/**
 * Mise en forme du texte relu par l'administrateur. Le corps reste la source :
 * l'habillage n'ajoute que l'identité de l'expéditeur, et surtout aucun lien.
 * Un message sans lien ne peut pas fuiter d'URL d'administration, quelle que
 * soit la façon dont le brouillon a été modifié.
 */
export function enveloppeHtml(sujet: string, corps: string): string {
  const paragraphes = corps
    .split(/\n{2,}/)
    .map(
      (bloc) =>
        `<p style="margin:0 0 14px;white-space:pre-wrap">${echapper(bloc.trim())}</p>`
    )
    .join('');

  return `<!doctype html><html lang="fr"><body style="margin:0;background:#fdf9f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1b2a22">
<div style="max-width:620px;margin:0 auto;padding:24px">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5b6b61">${echapper(IDENTITE)}</p>
  <h1 style="margin:0 0 20px;font-size:20px;color:#0c2b1f">${echapper(sujet)}</h1>
  <div style="background:#fff;border:1px solid #e7dcc8;border-radius:12px;padding:20px;font-size:15px;line-height:1.6">${paragraphes}</div>
  <p style="margin:18px 0 0;font-size:12px;color:#5b6b61">
    Message envoyé par ${echapper(IDENTITE)}. Répondez à ce message pour joindre directement le demandeur.
  </p>
</div></body></html>`;
}

/**
 * Dernier filet avant l'envoi.
 *
 * Le brouillon est modifiable, donc rien ne garantit a priori qu'un
 * copier-coller malheureux n'y ait pas introduit une URL d'administration ou
 * un jeton. Chaque motif ci-dessous correspond à une interdiction explicite du
 * cahier des charges ; un seul suffit à bloquer l'envoi.
 */
const MOTIFS_INTERDITS: Array<{ motif: RegExp; libelle: string }> = [
  { motif: /\/admin\b/i, libelle: "lien ou chemin vers l'administration" },
  { motif: /\badmin\.[a-z0-9-]+\.[a-z]{2,}/i, libelle: "sous-domaine d'administration" },
  { motif: /cloudflareaccess\.com/i, libelle: 'domaine Cloudflare Access' },
  { motif: /CF_Authorization|Cf-Access-Jwt-Assertion/i, libelle: 'jeton Cloudflare Access' },
  { motif: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, libelle: 'jeton JWT' },
  { motif: /\bpages\.dev\b/i, libelle: 'URL de déploiement interne' },
  { motif: /\bcf-connecting-ip\b|\buser-agent\s*:/i, libelle: 'en-tête technique' },
  { motif: /\bpro_actif_id\b|\bnotification_erreur\b|\blead_id\b/i, libelle: 'champ interne de la base' }
];

export type Fuite = { libelle: string; extrait: string };

/**
 * Vérifie le message réellement envoyé.
 * `autresPros` reçoit les raisons sociales et adresses des professionnels
 * autres que le destinataire : leur simple présence dans le texte est une
 * fuite, même si elle est involontaire.
 */
export function fuites(sujet: string, corps: string, autresPros: string[] = []): Fuite[] {
  const texte = `${sujet}\n${corps}`;
  const trouvees: Fuite[] = [];

  for (const { motif, libelle } of MOTIFS_INTERDITS) {
    const trouve = texte.match(motif);
    if (trouve) trouvees.push({ libelle, extrait: trouve[0].slice(0, 60) });
  }

  const minuscules = texte.toLowerCase();
  for (const valeur of autresPros) {
    const aiguille = String(valeur || '').trim().toLowerCase();
    // En deçà de 4 caractères, la comparaison produirait des faux positifs.
    if (aiguille.length < 4) continue;
    if (minuscules.includes(aiguille)) {
      trouvees.push({ libelle: 'mention d\'un autre professionnel', extrait: aiguille.slice(0, 60) });
    }
  }

  return trouvees;
}
