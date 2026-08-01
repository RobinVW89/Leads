/**
 * Notification d'une nouvelle demande, par e-mail.
 *
 * Appelé exclusivement par /api/lead via un Service binding : ce Worker n'a
 * aucune URL publique. Il ne reçoit que des données déjà enregistrées en D1,
 * ne journalise jamais de coordonnée, et ne renvoie qu'un état de succès ou
 * un motif d'échec court.
 */

import { adresseValide, echapper, enveloppeHtml, fuites, IDENTITE } from '../../functions/_lib/modele-email-pro';

type Env = {
  EMAIL: { send: (message: unknown) => Promise<unknown> };
  DESTINATAIRE: string;
  EXPEDITEUR: string;
  URL_ADMIN: string;
  /**
   * Liste blanche des destinataires professionnels, séparés par des virgules.
   * Renseignée sur le déploiement de prévisualisation, elle garantit qu'un
   * test ne peut pas écrire à un vrai professionnel. Vide en production :
   * c'est alors la vérification d'adresse de Cloudflare qui borne les envois.
   */
  DESTINATAIRES_PRO_AUTORISES?: string;
};

type Lead = {
  id?: number;
  type?: string;
  metier?: string;
  metier_nom?: string;
  ville?: string;
  prenom?: string;
  nom?: string;
  telephone?: string;
  email?: string;
  commune?: string;
  codePostal?: string;
  description?: string;
  delaiSouhaite?: string;
  budget?: string;
  qualification?: string;
  page_source?: string;
  entreprise?: string;
  siret?: string;
  siteWeb?: string;
  zoneIntervention?: string;
};

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

/**
 * Lien d'administration de la notification interne. Il mène directement à la
 * page de routage de la demande : c'est de là que part la transmission au
 * professionnel, et l'écran d'accueil obligerait à la retrouver à la main.
 * L'accès reste protégé par Cloudflare Access — le lien seul n'ouvre rien.
 */
function lienAdmin(urlAdmin: string, lead: Lead): string {
  const base = urlAdmin.replace(/\/+$/, '');
  return lead.id && lead.type !== 'pro' ? `${base}/lead/${lead.id}` : base;
}

function construireMessage(lead: Lead, urlAdmin: string): { sujet: string; html: string; texte: string } {
  const estPro = lead.type === 'pro';
  const lien = lienAdmin(urlAdmin, lead);
  const metier = lead.metier_nom || lead.metier || 'métier non précisé';
  const lieu = lead.ville || lead.commune || "l'Yonne";
  const qualification = qualificationLisible(lead.qualification);

  const sujet = estPro
    ? `Candidature pro — ${lead.entreprise || 'entreprise'} (${metier})`
    : `Nouvelle demande — ${metier} à ${lieu}`;

  const lignes: Array<[string, string]> = [];
  if (estPro) {
    lignes.push(['Entreprise', lead.entreprise || '']);
    lignes.push(['SIRET', lead.siret || '']);
    lignes.push(['Activité', metier]);
    lignes.push(["Zone d'intervention", lead.zoneIntervention || '']);
    lignes.push(['Site web', lead.siteWeb || '']);
  } else {
    lignes.push(['Métier', metier]);
    lignes.push(['Ville', lieu]);
    lignes.push(['Délai souhaité', lead.delaiSouhaite || '']);
    lignes.push(['Budget', lead.budget || '']);
  }
  lignes.push(['Contact', `${lead.prenom || ''} ${lead.nom || ''}`.trim()]);
  lignes.push(['Téléphone', lead.telephone || '']);
  lignes.push(['Email', lead.email || '']);
  if (!estPro) lignes.push(['Commune', `${lead.commune || ''} ${lead.codePostal || ''}`.trim()]);

  const remplies = lignes.filter(([, valeur]) => valeur.trim().length > 0);

  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#fdf9f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1b2a22">
<div style="max-width:640px;margin:0 auto;padding:24px">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5b6b61">
    ${estPro ? 'Candidature professionnelle' : 'Nouvelle demande'}
  </p>
  <h1 style="margin:0 0 20px;font-size:22px;color:#0c2b1f">${echapper(sujet)}</h1>
  <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e7dcc8;border-radius:12px">
    ${remplies
      .map(
        ([libelle, valeur]) =>
          `<tr><td style="padding:10px 14px;border-bottom:1px solid #f0e8d8;color:#5b6b61;width:38%">${echapper(libelle)}</td><td style="padding:10px 14px;border-bottom:1px solid #f0e8d8;font-weight:600">${echapper(valeur)}</td></tr>`
      )
      .join('')}
  </table>
  ${
    lead.description
      ? `<p style="margin:18px 0 6px;color:#5b6b61;font-size:13px">Description</p><div style="background:#fff;border:1px solid #e7dcc8;border-radius:12px;padding:14px;white-space:pre-wrap">${echapper(lead.description)}</div>`
      : ''
  }
  ${
    qualification.length > 0
      ? `<p style="margin:18px 0 6px;color:#5b6b61;font-size:13px">Qualification</p><ul style="margin:0;padding-left:18px">${qualification
          .map((q) => `<li style="margin-bottom:4px">${echapper(q.question)} — <strong>${echapper(q.reponse)}</strong></li>`)
          .join('')}</ul>`
      : ''
  }
  <p style="margin:24px 0 0">
    <a href="${echapper(lien)}" style="display:inline-block;background:#c1552b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700">${
      estPro ? "Ouvrir l'administration" : 'Ouvrir la demande et choisir le professionnel'
    }</a>
  </p>
  <p style="margin:18px 0 0;font-size:12px;color:#5b6b61">
    Demande enregistrée en base avant l'envoi de ce message. Référence ${echapper(lead.id ?? '—')}.
  </p>
</div></body></html>`;

  const texte = [
    sujet,
    '',
    ...remplies.map(([libelle, valeur]) => `${libelle} : ${valeur}`),
    lead.description ? `\nDescription :\n${lead.description}` : '',
    qualification.length > 0 ? `\nQualification :\n${qualification.map((q) => `- ${q.question} : ${q.reponse}`).join('\n')}` : '',
    '',
    `Administration : ${lien}`,
    `Référence : ${lead.id ?? '—'}`
  ]
    .filter((l) => l !== '')
    .join('\n');

  return { sujet, html, texte };
}

/* -------------------------------------------------------------------------- */
/* Envoi au professionnel retenu                                              */
/* -------------------------------------------------------------------------- */

type EnvoiPro = {
  destinataire?: string;
  nomDestinataire?: string;
  sujet?: string;
  corps?: string;
  repondreA?: string | null;
  nomDemandeur?: string;
};

/**
 * Envoi du message relu par l'administrateur au professionnel retenu.
 *
 * Le contenu vient tel quel de /admin : le Worker ne le reconstruit pas, il le
 * contrôle. Deux barrières avant l'expédition, dans cet ordre :
 * 1. la liste blanche de destinataires, quand elle est renseignée — c'est elle
 *    qui rend impossible qu'un test atteigne un vrai professionnel ;
 * 2. la relecture anti-fuite du texte, qui refuse tout lien d'administration,
 *    jeton Access ou donnée interne, y compris introduit à la main.
 * Une seconde vérification côté Worker peut sembler redondante avec /admin :
 * elle ne l'est pas, c'est le dernier point de passage avant le réseau.
 */
async function envoyerAuProfessionnel(charge: EnvoiPro, env: Env): Promise<Response> {
  const destinataire = adresseValide(charge.destinataire);
  const sujet = String(charge.sujet || '').trim().slice(0, 200);
  const corps = String(charge.corps || '').trim().slice(0, 12000);

  if (!destinataire) return Response.json({ ok: false, erreur: 'destinataire invalide' }, { status: 400 });
  if (!sujet || !corps) return Response.json({ ok: false, erreur: 'message vide' }, { status: 400 });

  const autorises = (env.DESTINATAIRES_PRO_AUTORISES || '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);

  if (autorises.length > 0 && !autorises.includes(destinataire.toLowerCase())) {
    return Response.json(
      { ok: false, erreur: 'destinataire hors de la liste autorisée sur cet environnement' },
      { status: 403 }
    );
  }

  const problemes = fuites(sujet, corps);
  if (problemes.length > 0) {
    return Response.json(
      { ok: false, erreur: `contenu interdit : ${problemes.map((p) => p.libelle).join(', ')}`.slice(0, 200) },
      { status: 422 }
    );
  }

  const message: Record<string, unknown> = {
    to: destinataire,
    from: { email: env.EXPEDITEUR, name: IDENTITE },
    subject: sujet,
    html: enveloppeHtml(sujet, corps),
    text: corps
  };

  const repondreA = adresseValide(charge.repondreA);
  if (repondreA) {
    // Le champ « name » est obligatoire et doit être une chaîne :
    // l'omettre fait échouer l'envoi entier.
    message.replyTo = { email: repondreA, name: String(charge.nomDemandeur || '').trim() || repondreA };
  }

  try {
    await env.EMAIL.send(message);
  } catch (erreur) {
    const motif = (erreur as Error)?.message || 'envoi impossible';
    return Response.json({ ok: false, erreur: motif.slice(0, 180) }, { status: 502 });
  }

  return Response.json({ ok: true, replyTo: repondreA !== null });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Méthode non autorisée', { status: 405, headers: { Allow: 'POST' } });
    }

    const chemin = new URL(request.url).pathname;

    if (chemin === '/envoyer-pro') {
      try {
        return await envoyerAuProfessionnel((await request.json()) as EnvoiPro, env);
      } catch {
        return Response.json({ ok: false, erreur: 'charge invalide' }, { status: 400 });
      }
    }

    let lead: Lead;
    try {
      lead = (await request.json()) as Lead;
    } catch {
      return Response.json({ ok: false, erreur: 'charge invalide' }, { status: 400 });
    }

    const { sujet, html, texte } = construireMessage(lead, env.URL_ADMIN);
    const repondreA = adresseValide(lead.email);

    // Plusieurs destinataires : l'API n'accepte qu'une destination par appel,
    // on envoie donc un message par adresse. Un seul succès suffit à
    // considérer la demande notifiée, les échecs restant consignés.
    const destinataires = env.DESTINATAIRE.split(',')
      .map((adresse) => adresse.trim())
      .filter(Boolean);

    if (destinataires.length === 0) {
      return Response.json({ ok: false, erreur: 'aucun destinataire configuré' }, { status: 500 });
    }

    const nomDemandeur = `${lead.prenom || ''} ${lead.nom || ''}`.trim();
    const echecs: string[] = [];
    let reussites = 0;

    for (const destinataire of destinataires) {
      try {
        const message: Record<string, unknown> = {
          to: destinataire,
          from: { email: env.EXPEDITEUR, name: IDENTITE },
          subject: sujet,
          html,
          text: texte
        };
        if (repondreA) {
          // Le champ « name » est obligatoire et doit être une chaîne :
          // l'omettre fait échouer l'envoi entier.
          message.replyTo = { email: repondreA, name: nomDemandeur || repondreA };
        }

        await env.EMAIL.send(message);
        reussites += 1;
      } catch (erreur) {
        // Motif court uniquement : jamais le contenu du message ni les
        // coordonnées du demandeur.
        const motif = (erreur as Error)?.message || 'envoi impossible';
        echecs.push(`${destinataire} : ${motif.slice(0, 90)}`);
      }
    }

    if (reussites === 0) {
      return Response.json({ ok: false, erreur: echecs.join(' | ').slice(0, 200) }, { status: 502 });
    }

    // Succès partiel : la demande est notifiée, mais on signale ce qui a échoué.
    return Response.json({
      ok: true,
      envoyes: reussites,
      total: destinataires.length,
      ...(echecs.length > 0 ? { partiel: echecs.join(' | ').slice(0, 200) } : {})
    });
  }
};
