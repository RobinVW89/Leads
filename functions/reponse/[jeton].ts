/**
 * Page de réponse du professionnel — publique, hors Cloudflare Access.
 *
 * Elle est ouverte depuis un e-mail par quelqu'un qui n'a pas de compte. Le
 * jeton de l'URL est la seule autorisation, et il ne vaut que pour une demande,
 * une fois, tant qu'elle lui est attribuée.
 *
 * Le GET ne décide rien. Il affiche le chantier et attend une confirmation par
 * POST. C'est indispensable : les antivirus de messagerie et les aperçus de
 * lien visitent les URL d'un e-mail avant même que le destinataire ne l'ouvre.
 * Si un GET acceptait, un automate achèterait des demandes à sa place.
 *
 * Rien de nominatif n'est affiché avant acceptation : un lien transféré ou
 * retrouvé dans une archive ne doit pas livrer les coordonnées du demandeur.
 */

import { avecEntetesSecurite } from '../_lib/entetes';
import {
  construireCoordonnees,
  dateLisible,
  echapper,
  IDENTITE,
  type LeadPourPro
} from '../_lib/modele-email-pro';
import {
  choixValide,
  enregistrerReponse,
  jetonPlausible,
  ouvrirJeton,
  type Choix,
  type Dossier
} from '../_lib/reponse-pro';

type Env = {
  DB: D1Database;
  NOTIFICATION?: { fetch: (request: Request) => Promise<Response> };
};

const MOTIF_MAX = 300;

/* -------------------------------------------------------------------------- */
/* Gabarit                                                                    */
/* -------------------------------------------------------------------------- */

const STYLE = `
*{box-sizing:border-box}
body{margin:0;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#1b2a22;background:#fdf9f1}
.enveloppe{max-width:600px;margin:0 auto;padding:2rem 1.2rem 3rem}
.marque{font-size:.75rem;letter-spacing:.09em;text-transform:uppercase;color:#5b6b61;margin:0 0 .3rem}
h1{font-size:1.45rem;line-height:1.25;margin:0 0 1.4rem;color:#0c2b1f}
.carte{background:#fff;border:1px solid #e7dcc8;border-radius:14px;padding:1.3rem;margin-bottom:1.2rem}
.carte.ok{border-color:#bcd8c4;background:#f5faf6}
.carte.alerte{border-color:#e4b9b8;background:#fdf5f5}
dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:.5rem 1.1rem}
dt{color:#5b6b61;font-size:.9rem}
dd{margin:0;font-weight:600}
.desc{margin:1.1rem 0 0;padding-top:1.1rem;border-top:1px solid #f0e8d8;white-space:pre-wrap}
.engagement{background:#fdf1d3;border:1px solid #e8d3a0;border-radius:10px;padding:.9rem 1rem;margin:0 0 1.2rem;font-size:.95rem}
button{font:inherit;font-weight:700;font-size:1.02rem;padding:.9rem 1.4rem;border:0;border-radius:10px;cursor:pointer;width:100%;min-height:52px}
button.oui{background:#1c6b45;color:#fff}
button.non{background:#fff;color:#97302f;border:2px solid #e4b9b8}
label{display:block;font-size:.86rem;font-weight:600;color:#5b6b61;margin:0 0 .3rem}
textarea{font:inherit;width:100%;min-height:80px;padding:.6rem;border:1.5px solid #d9c8ac;border-radius:8px;background:#fff}
.duo{display:grid;gap:.7rem;grid-template-columns:1fr 1fr}
@media(max-width:520px){.duo{grid-template-columns:1fr}}
.coord{font-size:1.1rem;line-height:1.9}
.coord a{color:#0c2b1f}
.muted{color:#5b6b61;font-size:.88rem}
.retour{display:inline-block;margin-top:.6rem;color:#5b6b61;font-size:.9rem}
`;

function page(titre: string, contenu: string): string {
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${echapper(titre)} — ${echapper(IDENTITE)}</title>
<style>${STYLE}</style></head><body>
<div class="enveloppe">
  <p class="marque">${echapper(IDENTITE)}</p>
  ${contenu}
</div></body></html>`;
}

function reponseHtml(html: string, status = 200): Response {
  return avecEntetesSecurite(
    new Response(html, {
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    }),
    'page'
  );
}

function ficheChantier(dossier: Dossier): string {
  return `<div class="carte">
  <dl>
    <dt>Type de demande</dt><dd>${echapper(dossier.typeDemande)}</dd>
    <dt>Commune</dt><dd>${echapper(dossier.commune || 'non précisée')}</dd>
    <dt>Date de la demande</dt><dd>${echapper(dateLisible(dossier.dateDemande) || 'non précisée')}</dd>
  </dl>
</div>`;
}

/* -------------------------------------------------------------------------- */
/* Écrans                                                                     */
/* -------------------------------------------------------------------------- */

const IMPASSES: Record<string, { titre: string; texte: string }> = {
  inconnu: {
    titre: 'Ce lien n’est pas valide',
    texte:
      'Il a peut-être été tronqué par votre messagerie. Rouvrez-le depuis l’e-mail d’origine, ou répondez simplement à ce message.'
  },
  'deja-repondu': {
    titre: 'Vous avez déjà répondu',
    texte: 'Votre réponse a bien été enregistrée. Ce lien n’a plus d’effet.'
  },
  'plus-attribuee': {
    titre: 'Cette demande ne vous est plus réservée',
    texte:
      'Elle a été confiée à un autre professionnel entre-temps. Aucune action de votre part n’est nécessaire.'
  },
  expire: {
    titre: 'Ce lien a expiré',
    texte: 'Les demandes ne restent réservées que quelques semaines. Contactez-nous si vous êtes toujours intéressé.'
  }
};

function ecranImpasse(motif: string, reponse?: string): string {
  const { titre, texte } = IMPASSES[motif] ?? IMPASSES.inconnu;
  const precision =
    motif === 'deja-repondu' && reponse
      ? `<p class="muted" style="margin:.8rem 0 0">Réponse enregistrée : <b>${
          reponse === 'accepte' ? 'demande acceptée' : 'demande refusée'
        }</b>.</p>`
      : '';

  return page(titre, `<h1>${echapper(titre)}</h1><div class="carte"><p style="margin:0">${echapper(texte)}</p>${precision}</div>`);
}

function ecranChoix(dossier: Dossier, jeton: string, presuppose: Choix | null): string {
  const engagement = `<p class="engagement">
  <b>Accepter cette demande vaut confirmation de son achat</b>, aux conditions convenues avec ${echapper(
    IDENTITE
  )}. Elle vous est alors attribuée de façon exclusive, et les coordonnées du demandeur vous sont communiquées immédiatement.
</p>`;

  // Le choix issu de l'e-mail n'est qu'une présélection : la décision est prise
  // ici, par un envoi de formulaire.
  const refusDeplie = presuppose === 'refuse';

  return page(
    'Répondre à une demande',
    `<h1>Une demande vous est réservée</h1>
${ficheChantier(dossier)}
${engagement}

<form method="post" class="duo" style="margin-bottom:1.2rem">
  <input type="hidden" name="jeton" value="${echapper(jeton)}">
  <input type="hidden" name="choix" value="accepte">
  <button type="submit" class="oui">Accepter et recevoir les coordonnées</button>
</form>

<div class="carte">
  <form method="post">
    <input type="hidden" name="jeton" value="${echapper(jeton)}">
    <input type="hidden" name="choix" value="refuse">
    <label for="motif">Vous préférez décliner ? Dites-nous pourquoi (facultatif)</label>
    <textarea id="motif" name="motif" maxlength="${MOTIF_MAX}" placeholder="trop loin, agenda complet…"${
      refusDeplie ? ' autofocus' : ''
    }></textarea>
    <button type="submit" class="non" style="margin-top:.7rem">Refuser cette demande</button>
    <p class="muted" style="margin:.7rem 0 0">Refuser n’entraîne aucun engagement. La demande sera proposée à un autre professionnel.</p>
  </form>
</div>

<p class="muted">${echapper(dossier.raisonSociale)} — ${echapper(IDENTITE)}</p>`
  );
}

function ecranAccepte(dossier: Dossier, lead: LeadPourPro | null, courrielEnvoye: boolean): string {
  const nom = `${lead?.prenom || ''} ${lead?.nom || ''}`.trim();
  const telephone = String(lead?.telephone || '').trim();
  const courriel = String(lead?.email || '').trim();

  const coordonnees = lead
    ? `<div class="carte ok">
  <p class="marque" style="margin-bottom:.6rem">Coordonnées du demandeur</p>
  <div class="coord">
    <b>${echapper(nom || 'Demandeur')}</b><br>
    ${telephone ? `<a href="tel:${echapper(telephone.replace(/\s/g, ''))}">${echapper(telephone)}</a><br>` : ''}
    ${courriel ? `<a href="mailto:${echapper(courriel)}">${echapper(courriel)}</a>` : ''}
  </div>
  ${lead.description ? `<div class="desc">${echapper(lead.description)}</div>` : ''}
</div>`
    : '<div class="carte alerte"><p style="margin:0">Les coordonnées vous parviennent par e-mail dans un instant.</p></div>';

  return page(
    'Demande acceptée',
    `<h1>Demande acceptée</h1>
<p style="margin:0 0 1.2rem">Elle vous est désormais attribuée. Merci de contacter le demandeur rapidement.</p>
${coordonnees}
${ficheChantier(dossier)}
<p class="muted">${
      courrielEnvoye
        ? 'Ces coordonnées vous ont également été envoyées par e-mail.'
        : 'Conservez cette page : l’envoi de l’e-mail récapitulatif n’a pas abouti.'
    }</p>`
  );
}

function ecranRefuse(dossier: Dossier): string {
  return page(
    'Demande refusée',
    `<h1>Demande refusée</h1>
<div class="carte"><p style="margin:0">C’est noté, merci de nous avoir répondu. Aucun engagement n’a été pris et la demande va être proposée à un autre professionnel.</p></div>
${ficheChantier(dossier)}
<p class="muted">${echapper(dossier.raisonSociale)} — ${echapper(IDENTITE)}</p>`
  );
}

/* -------------------------------------------------------------------------- */
/* Suites de la réponse                                                       */
/* -------------------------------------------------------------------------- */

/** Envoi des coordonnées au professionnel : le seul message qui les porte. */
async function envoyerCoordonnees(env: Env, dossier: Dossier, lead: LeadPourPro): Promise<boolean> {
  if (!env.NOTIFICATION) return false;

  const { sujet, corps } = construireCoordonnees(lead);

  try {
    const reponse = await env.NOTIFICATION.fetch(
      new Request('https://notification-lead/envoyer-coordonnees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinataire: dossier.emailPro,
          sujet,
          corps,
          repondreA: lead.email,
          nomDemandeur: `${lead.prenom || ''} ${lead.nom || ''}`.trim()
        })
      })
    );
    const json = (await reponse.json()) as { ok?: boolean };
    return reponse.ok && json.ok === true;
  } catch {
    return false;
  }
}

/**
 * Prévenir l'administrateur.
 *
 * Sans cela, un refus resterait invisible jusqu'à la prochaine ouverture de
 * /admin, et la demande dormirait — c'est précisément ce que le routage est
 * censé éviter.
 */
async function prevenirAdministrateur(env: Env, dossier: Dossier, choix: Choix, motif: string): Promise<void> {
  if (!env.NOTIFICATION) return;

  const accepte = choix === 'accepte';
  const sujet = accepte
    ? `Demande n° ${dossier.leadId} acceptée par ${dossier.raisonSociale}`
    : `Demande n° ${dossier.leadId} refusée par ${dossier.raisonSociale}`;

  const corps = [
    accepte
      ? `${dossier.raisonSociale} a accepté la demande n° ${dossier.leadId} et reçu les coordonnées du demandeur.`
      : `${dossier.raisonSociale} a refusé la demande n° ${dossier.leadId}. Elle est de nouveau attribuable : le professionnel suivant peut être proposé.`,
    '',
    `Type de demande : ${dossier.typeDemande}`,
    `Commune : ${dossier.commune || 'non précisée'}`,
    ...(motif ? ['', `Motif indiqué : ${motif}`] : [])
  ].join('\n');

  try {
    await env.NOTIFICATION.fetch(
      new Request('https://notification-lead/informer-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sujet, corps, leadId: dossier.leadId })
      })
    );
  } catch {
    // La réponse du professionnel est enregistrée : l'alerte n'est qu'un confort.
  }
}

/* -------------------------------------------------------------------------- */

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  const jeton = jetonPlausible(Array.isArray(params.jeton) ? params.jeton[0] : params.jeton);
  if (!jeton) return reponseHtml(ecranImpasse('inconnu'), 404);

  const etat = await ouvrirJeton(env.DB, jeton);
  if (!etat.ok) {
    return reponseHtml(ecranImpasse(etat.motif, etat.reponse), etat.motif === 'inconnu' ? 404 : 200);
  }

  if (request.method !== 'POST') {
    const presuppose = choixValide(new URL(request.url).searchParams.get('choix'));
    return reponseHtml(ecranChoix(etat.dossier, jeton, presuppose));
  }

  const form = await request.formData();
  const choix = choixValide(form.get('choix'));
  if (!choix) return reponseHtml(ecranChoix(etat.dossier, jeton, null), 400);

  const motif = String(form.get('motif') || '').trim().slice(0, MOTIF_MAX);

  const resultat = await enregistrerReponse(env.DB, etat.dossier, choix, motif);
  if (!resultat.ok) return reponseHtml(ecranImpasse('deja-repondu'));

  if (choix === 'refuse') {
    await prevenirAdministrateur(env, etat.dossier, choix, motif);
    return reponseHtml(ecranRefuse(etat.dossier));
  }

  // Les coordonnées ne sont lues qu'ici : jamais avant l'acceptation.
  const lead = await env.DB.prepare(
    'SELECT prenom, nom, telephone, email, description, metier, metier_nom, commune, ville, code_postal FROM leads WHERE id = ?'
  )
    .bind(etat.dossier.leadId)
    .first<LeadPourPro>();

  const courrielEnvoye = lead ? await envoyerCoordonnees(env, etat.dossier, lead) : false;
  await prevenirAdministrateur(env, etat.dossier, choix, motif);

  return reponseHtml(ecranAccepte(etat.dossier, lead, courrielEnvoye));
};
