/**
 * Messages adressés au professionnel retenu.
 *
 * Ce fichier est la seule source de ce qu'un professionnel reçoit : il est
 * importé par /admin pour construire le brouillon, par le Worker pour
 * l'expédier, et par la page de réponse pour la suite. Une seule définition,
 * donc aucune divergence entre ce que l'administrateur relit et ce qui part.
 *
 * Deux messages, et la distinction est le cœur du dispositif :
 *
 * 1. L'OFFRE. Elle décrit le chantier — type, commune, description, date — et
 *    masque le demandeur. Ni son nom complet, ni son téléphone, ni son adresse.
 *    Le Reply-To ne pointe pas sur lui : il pointe sur nous. Le professionnel a
 *    de quoi juger s'il prend le chantier, pas de quoi court-circuiter la mise
 *    en relation.
 * 2. LES COORDONNÉES, envoyées seulement après acceptation. Nom, téléphone,
 *    e-mail, et Reply-To sur l'adresse validée du demandeur.
 *
 * Ce qu'aucun des deux ne contient : lien vers /admin, jeton Cloudflare Access,
 * mention d'un autre professionnel, identifiant ou champ interne. `fuites()`
 * le vérifie sur le texte réellement envoyé, y compris modifié à la main.
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

/* -------------------------------------------------------------------------- */
/* Masquage des coordonnées                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Les formes masquées gardent juste assez de matière pour qu'une offre reste
 * crédible — on voit qu'il y a un vrai demandeur joignable — sans permettre de
 * le contacter. Un masquage total (« coordonnées communiquées ensuite »)
 * donnerait au professionnel l'impression d'une annonce automatique.
 */
export function masquerNom(prenom: unknown, nom: unknown): string {
  const p = String(prenom ?? '').trim();
  const n = String(nom ?? '').trim();
  const initiale = n ? `${n[0].toUpperCase()}.` : '';
  return [p, initiale].filter(Boolean).join(' ') || 'Demandeur';
}

/** Deux premiers et deux derniers chiffres : la forme est reconnaissable, le numéro non. */
export function masquerTelephone(valeur: unknown): string {
  const chiffres = String(valeur ?? '').replace(/\D/g, '');
  if (chiffres.length < 6) return '';
  return `${chiffres.slice(0, 2)} •• •• •• ${chiffres.slice(-2)}`;
}

/** Première lettre conservée, tout le reste — y compris le domaine — masqué. */
export function masquerEmail(valeur: unknown): string {
  const brut = String(valeur ?? '').trim();
  const arobase = brut.indexOf('@');
  if (arobase < 1) return '';
  const point = brut.lastIndexOf('.');
  const extension = point > arobase ? brut.slice(point) : '';
  return `${brut[0]}•••@•••${extension}`;
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

export function communeComplete(lead: LeadPourPro): string {
  const commune = String(lead.commune || lead.ville || '').trim();
  const cp = String(lead.code_postal || '').trim();
  return [commune, cp].filter(Boolean).join(' ');
}

function typeDemande(lead: LeadPourPro): string {
  return String(lead.metier_nom || lead.metier || 'Demande de travaux').trim();
}

export type Brouillon = { sujet: string; corps: string };

/**
 * Offre proposée à l'administrateur, modifiable avant envoi. Elle est complète
 * et directement envoyable — pas un gabarit à trous — et ne contient aucune
 * coordonnée en clair.
 */
export function construireBrouillon(lead: LeadPourPro): Brouillon {
  const type = typeDemande(lead);
  const commune = communeComplete(lead) || 'commune non précisée';
  const date = dateLisible(lead.submitted_at || lead.created_at);

  const sujet = `Nouvelle demande — ${type} à ${commune}`;

  const complements: string[] = [];
  if (lead.delai_souhaite) complements.push(`Délai souhaité : ${lead.delai_souhaite}`);
  if (lead.budget) complements.push(`Budget évoqué : ${lead.budget}`);
  for (const q of qualificationLisible(lead.qualification)) {
    complements.push(`${q.question} : ${q.reponse}`);
  }

  const demandeur: string[] = [masquerNom(lead.prenom, lead.nom)];
  const tel = masquerTelephone(lead.telephone);
  const mail = masquerEmail(lead.email);
  if (tel) demandeur.push(`Téléphone : ${tel}`);
  if (mail) demandeur.push(`E-mail : ${mail}`);

  const corps = [
    'Bonjour,',
    '',
    `Nous vous proposons une demande reçue sur ${IDENTITE}. Elle vous est réservée : tant que vous n'avez pas répondu, elle n'est proposée à personne d'autre.`,
    '',
    `Type de demande : ${type}`,
    `Commune : ${commune}`,
    `Date de la demande : ${date || 'non précisée'}`,
    '',
    'Description :',
    String(lead.description || '').trim() || 'Aucune description fournie.',
    ...(complements.length > 0 ? ['', 'Précisions :', ...complements.map((l) => `- ${l}`)] : []),
    '',
    'Demandeur :',
    ...demandeur,
    '',
    'Accepter cette demande vaut confirmation de son achat, aux conditions convenues avec nous. Elle vous est alors attribuée de façon exclusive et les coordonnées complètes du demandeur vous sont communiquées immédiatement.',
    '',
    'Bien cordialement,',
    IDENTITE
  ].join('\n');

  return { sujet, corps };
}

/**
 * Second message, envoyé une fois la demande acceptée. C'est le seul qui porte
 * les coordonnées en clair, et le seul dont le Reply-To vise le demandeur.
 */
export function construireCoordonnees(lead: LeadPourPro): Brouillon {
  const type = typeDemande(lead);
  const commune = communeComplete(lead) || 'commune non précisée';
  const nom = `${lead.prenom || ''} ${lead.nom || ''}`.trim() || 'Le demandeur';

  const coordonnees: string[] = [nom];
  if (lead.telephone) coordonnees.push(`Téléphone : ${lead.telephone}`);
  if (lead.email) coordonnees.push(`E-mail : ${lead.email}`);

  const corps = [
    'Bonjour,',
    '',
    `Vous avez accepté la demande « ${type} » à ${commune}. Voici les coordonnées du demandeur.`,
    '',
    ...coordonnees,
    '',
    'Description :',
    String(lead.description || '').trim() || 'Aucune description fournie.',
    '',
    'Merci de le contacter rapidement. Vous pouvez aussi répondre directement à ce message : votre réponse lui parviendra.',
    '',
    'Bien cordialement,',
    IDENTITE
  ].join('\n');

  return { sujet: `Coordonnées du demandeur — ${type} à ${commune}`, corps };
}

/* -------------------------------------------------------------------------- */
/* Mise en forme                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Bloc « Accepter / Refuser ».
 *
 * Les deux liens mènent à la même page de confirmation, qui demande de valider
 * par un bouton. C'est délibéré : beaucoup de messageries et d'antivirus
 * visitent les liens d'un e-mail avant que le destinataire ne l'ouvre. Si un
 * simple GET décidait, une demande pourrait être acceptée ou refusée par un
 * automate. Rien n'est enregistré tant qu'un POST n'est pas reçu.
 */
function blocActionHtml(urlReponse: string): string {
  const accepter = `${urlReponse}?choix=accepte`;
  const refuser = `${urlReponse}?choix=refuse`;

  return `<table role="presentation" style="width:100%;margin:22px 0 0;border-collapse:collapse"><tr>
  <td style="padding:0 8px 0 0">
    <a href="${echapper(accepter)}" style="display:block;text-align:center;background:#1c6b45;color:#fff;text-decoration:none;padding:14px 18px;border-radius:10px;font-weight:700;font-size:16px">Accepter la demande</a>
  </td>
  <td style="padding:0 0 0 8px">
    <a href="${echapper(refuser)}" style="display:block;text-align:center;background:#fff;color:#97302f;border:2px solid #e4b9b8;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;font-size:16px">Refuser</a>
  </td>
</tr></table>
<p style="margin:12px 0 0;font-size:13px;color:#5b6b61">
  <b style="color:#1b2a22">Accepter vaut confirmation de l’achat de cette demande</b>, aux conditions
  convenues avec nous. Vous recevez alors immédiatement le nom et les coordonnées du demandeur.
  Sans réponse de votre part, la demande n’est proposée à personne d’autre.
</p>`;
}

function blocActionTexte(urlReponse: string): string {
  return [
    '',
    'Accepter la demande :',
    `${urlReponse}?choix=accepte`,
    '',
    'Refuser :',
    `${urlReponse}?choix=refuse`,
    '',
    'Accepter vaut confirmation de l\'achat de cette demande, aux conditions convenues avec nous.',
    'Vous recevez alors immédiatement le nom et les coordonnées du demandeur.'
  ].join('\n');
}

/**
 * Habillage du message. Le corps reste la source ; l'habillage n'ajoute que
 * l'identité de l'expéditeur et, le cas échéant, les deux boutons de réponse.
 * Aucun autre lien n'est jamais introduit ici.
 */
export function enveloppeHtml(sujet: string, corps: string, urlReponse?: string | null): string {
  const paragraphes = corps
    .split(/\n{2,}/)
    .map((bloc) => `<p style="margin:0 0 14px;white-space:pre-wrap">${echapper(bloc.trim())}</p>`)
    .join('');

  return `<!doctype html><html lang="fr"><body style="margin:0;background:#fdf9f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1b2a22">
<div style="max-width:620px;margin:0 auto;padding:24px">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5b6b61">${echapper(IDENTITE)}</p>
  <h1 style="margin:0 0 20px;font-size:20px;color:#0c2b1f">${echapper(sujet)}</h1>
  <div style="background:#fff;border:1px solid #e7dcc8;border-radius:12px;padding:20px;font-size:15px;line-height:1.6">${paragraphes}</div>
  ${urlReponse ? blocActionHtml(urlReponse) : ''}
  <p style="margin:18px 0 0;font-size:12px;color:#5b6b61">Message envoyé par ${echapper(IDENTITE)}.</p>
</div></body></html>`;
}

/** Version texte, boutons compris. */
export function enveloppeTexte(corps: string, urlReponse?: string | null): string {
  return urlReponse ? `${corps}\n${blocActionTexte(urlReponse)}` : corps;
}

/* -------------------------------------------------------------------------- */
/* Contrôle avant envoi                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Dernier filet.
 *
 * Le brouillon est modifiable, donc rien ne garantit a priori qu'un
 * copier-coller malheureux n'y ait pas introduit une URL d'administration, un
 * jeton ou des coordonnées. Chaque motif correspond à une interdiction
 * explicite ; un seul suffit à bloquer l'envoi.
 */
const MOTIFS_INTERDITS: Array<{ motif: RegExp; libelle: string }> = [
  { motif: /\/admin\b/i, libelle: "lien ou chemin vers l'administration" },
  { motif: /\badmin\.[a-z0-9-]+\.[a-z]{2,}/i, libelle: "sous-domaine d'administration" },
  { motif: /cloudflareaccess\.com/i, libelle: 'domaine Cloudflare Access' },
  { motif: /CF_Authorization|Cf-Access-Jwt-Assertion/i, libelle: 'jeton Cloudflare Access' },
  { motif: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, libelle: 'jeton JWT' },
  { motif: /\bcf-connecting-ip\b|\buser-agent\s*:/i, libelle: 'en-tête technique' },
  { motif: /\bpro_actif_id\b|\bnotification_erreur\b|\blead_id\b/i, libelle: 'champ interne de la base' }
];

export type Fuite = { libelle: string; extrait: string };

export type ControleFuites = {
  /** Raisons sociales, contacts et adresses des professionnels non destinataires. */
  autresPros?: string[];
  /**
   * Coordonnées du demandeur, interdites tant que la demande n'est pas
   * acceptée. Sont concernés le nom complet, le téléphone et l'adresse — y
   * compris s'ils apparaissent dans la description qu'il a lui-même écrite.
   */
  coordonnees?: string[];
};

/** Un numéro reste le même numéro qu'il soit écrit avec des espaces ou des points. */
function chiffresSeuls(valeur: string): string {
  return valeur.replace(/\D/g, '');
}

export function fuites(sujet: string, corps: string, controle: ControleFuites = {}): Fuite[] {
  const texte = `${sujet}\n${corps}`;
  const minuscules = texte.toLowerCase();
  const trouvees: Fuite[] = [];

  for (const { motif, libelle } of MOTIFS_INTERDITS) {
    const trouve = texte.match(motif);
    if (trouve) trouvees.push({ libelle, extrait: trouve[0].slice(0, 60) });
  }

  for (const valeur of controle.autresPros || []) {
    const aiguille = String(valeur || '').trim().toLowerCase();
    // En deçà de 4 caractères, la comparaison produirait des faux positifs.
    if (aiguille.length < 4) continue;
    if (minuscules.includes(aiguille)) {
      trouvees.push({ libelle: "mention d'un autre professionnel", extrait: aiguille.slice(0, 60) });
    }
  }

  const chiffresDuTexte = chiffresSeuls(texte);
  for (const valeur of controle.coordonnees || []) {
    const aiguille = String(valeur || '').trim().toLowerCase();
    if (aiguille.length < 4) continue;

    const numero = chiffresSeuls(aiguille);
    // Un téléphone est comparé chiffre à chiffre : « 06 12 34 56 78 » et
    // « 06.12.34.56.78 » sont le même numéro et doivent tous deux être vus.
    const present =
      numero.length >= 9 ? chiffresDuTexte.includes(numero) : minuscules.includes(aiguille);

    if (present) {
      trouvees.push({ libelle: 'coordonnées du demandeur avant acceptation', extrait: aiguille.slice(0, 60) });
    }
  }

  return trouvees;
}
