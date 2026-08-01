/**
 * Routage d'une demande vers un professionnel unique.
 *
 * Règle centrale : une demande n'est jamais chez deux professionnels en même
 * temps. Cette exclusivité n'est pas confiée à l'interface — un double clic,
 * deux onglets ouverts ou un rechargement suffiraient à la contourner. Elle
 * repose sur `leads.pro_actif_id` et sur une mise à jour conditionnelle
 * (`WHERE pro_actif_id IS NULL`) : la base n'autorise qu'un seul gagnant, et
 * l'e-mail n'est expédié qu'après cette prise. Le bouton grisé n'est qu'un
 * confort ; c'est le `changes === 1` qui fait foi.
 */

import { echapper, garderAdmin, pageAdmin, reponseHtml, type EnvAdmin } from '../../_lib/admin-page';
import { avecEntetesSecurite } from '../../_lib/entetes';
import { construireBrouillon, fuites, type LeadPourPro } from '../../_lib/modele-email-pro';
import { nouveauJeton } from '../../_lib/reponse-pro';
import { chargerRoutage, type Attribution, type Professionnel } from '../../_lib/routage';

type Env = EnvAdmin & {
  NOTIFICATION?: { fetch: (request: Request) => Promise<Response> };
};

type LigneLead = LeadPourPro & {
  id: number;
  created_at: string;
  type: string;
  statut: string;
  pro_actif_id: number | null;
  pro_actif_at: string | null;
};

const SUJET_MAX = 200;
const CORPS_MAX = 12000;
const MOTIF_MAX = 300;

function dateCourte(iso: string | null | undefined): string {
  const brut = String(iso ?? '').trim();
  if (!brut) return '—';
  const d = new Date(brut.includes('T') ? brut : brut.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return brut;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function nomPro(pro: Professionnel): string {
  return pro.contact_nom ? `${pro.raison_sociale} (${pro.contact_nom})` : pro.raison_sociale;
}

/**
 * Ce que le message ne doit jamais contenir des AUTRES professionnels :
 * raison sociale, contact et adresse. La liste est calculée par rapport au
 * destinataire retenu, donc son propre nom reste évidemment autorisé.
 *
 * Les coordonnées du demandeur en sont retirées, et ce n'est pas théorique :
 * un professionnel du réseau peut lui-même déposer une demande, ou partager
 * son adresse avec elle. Son e-mail figure alors légitimement dans le message,
 * et sans ce retrait la transmission serait bloquée à tort.
 */
function empreintesDesAutres(tous: Professionnel[], destinataireId: number, lead: LigneLead): string[] {
  const duDemandeur = new Set(
    [lead.email, lead.telephone, `${lead.prenom || ''} ${lead.nom || ''}`.trim()]
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean)
  );

  return tous
    .filter((p) => p.id !== destinataireId)
    .flatMap((p) => [p.raison_sociale, p.contact_nom || '', p.email])
    .filter((valeur) => valeur && !duDemandeur.has(valeur.trim().toLowerCase()));
}

const MESSAGES: Record<string, { ton: 'ok' | 'alerte'; texte: string }> = {
  envoye: { ton: 'ok', texte: 'Demande transmise au professionnel. Un second envoi est désormais impossible.' },
  refus: { ton: 'ok', texte: 'Refus enregistré. La demande est de nouveau disponible pour le professionnel suivant.' },
  'deja-attribuee': {
    ton: 'alerte',
    texte:
      'Envoi refusé : la demande était déjà attribuée à un professionnel. Aucun second e-mail n’a été expédié.'
  },
  'pro-invalide': {
    ton: 'alerte',
    texte: 'Envoi refusé : ce professionnel n’est pas un candidat valide pour cette demande.'
  },
  'brouillon-vide': { ton: 'alerte', texte: 'Envoi refusé : le sujet et le corps du message sont obligatoires.' },
  liberee: {
    ton: 'ok',
    texte: 'Réservation annulée. Aucun e-mail n’était parti ; la demande est de nouveau attribuable.'
  },
  'envoi-trace': {
    ton: 'alerte',
    texte:
      'Annulation impossible : un e-mail a bien été envoyé à ce professionnel. Enregistrez plutôt son refus.'
  }
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const url = new URL(request.url);

  const acces = await garderAdmin(request, env);
  if (!acces.ok) return acces.reponse;

  const id = Number(Array.isArray(params.id) ? params.id[0] : params.id) || 0;
  if (id <= 0) {
    return avecEntetesSecurite(
      new Response('Demande introuvable.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
      })
    );
  }

  const lead = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first<LigneLead>();
  if (!lead) {
    return avecEntetesSecurite(
      new Response('Demande introuvable.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
      })
    );
  }

  if (request.method === 'POST') {
    const resultat = await traiterAction(request, env, lead, url.origin);
    // Redirection après action : un rafraîchissement ne rejoue jamais un envoi.
    return Response.redirect(`${url.origin}/admin/lead/${id}?fait=${encodeURIComponent(resultat)}`, 303);
  }

  return afficher(env, lead, acces.identite, url);
};

/* ------------------------------------------------------------------------ */
/* Actions                                                                    */
/* ------------------------------------------------------------------------ */

async function traiterAction(request: Request, env: Env, lead: LigneLead, origine: string): Promise<string> {
  const form = await request.formData();
  const action = String(form.get('action') || '');
  const proId = Number(form.get('pro_id') || 0) || 0;

  if (action === 'liberer') return liberer(env, lead, proId);
  if (action === 'refus') return enregistrerRefus(env, lead, proId, form);
  if (action === 'envoyer') return envoyer(env, lead, proId, form, origine);
  return 'inconnu';
}

/**
 * Annulation d'une réservation restée sans envoi.
 *
 * Le cas est rare mais réel : si l'exécution s'interrompt entre la réservation
 * et le résultat de l'envoi — isolate arrêté, coupure réseau — la demande reste
 * réservée alors qu'aucun e-mail n'est parti. Sans ce bouton elle serait bloquée
 * pour toujours. La libération n'est possible que dans ce cas précis : dès qu'un
 * envoi est tracé, seul un refus peut libérer la demande.
 */
async function liberer(env: Env, lead: LigneLead, proId: number): Promise<string> {
  if (proId <= 0 || lead.pro_actif_id !== proId) return 'pro-invalide';

  const envoiTrace = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM attributions WHERE lead_id = ? AND professionnel_id = ? AND statut = 'envoye'"
  )
    .bind(lead.id, proId)
    .first<{ n: number }>();

  if ((envoiTrace?.n ?? 0) > 0) return 'envoi-trace';

  const liberation = await env.DB.prepare(
    'UPDATE leads SET pro_actif_id = NULL, pro_actif_at = NULL WHERE id = ? AND pro_actif_id = ?'
  )
    .bind(lead.id, proId)
    .run();

  return Number(liberation.meta?.changes ?? 0) === 1 ? 'liberee' : 'deja-attribuee';
}

/**
 * Refus ou indisponibilité : la trace est conservée, et la demande redevient
 * attribuable. La libération est elle aussi conditionnelle — on ne libère que
 * si le professionnel visé est bien celui qui détient la demande.
 */
async function enregistrerRefus(env: Env, lead: LigneLead, proId: number, form: FormData): Promise<string> {
  if (proId <= 0 || lead.pro_actif_id !== proId) return 'pro-invalide';

  const statut = String(form.get('statut') || 'refuse');
  if (statut !== 'refuse' && statut !== 'indisponible') return 'pro-invalide';
  const motif = String(form.get('motif') || '').trim().slice(0, MOTIF_MAX);

  const liberation = await env.DB.prepare(
    "UPDATE leads SET pro_actif_id = NULL, pro_actif_at = NULL, statut = 'nouveau' WHERE id = ? AND pro_actif_id = ?"
  )
    .bind(lead.id, proId)
    .run();

  if (Number(liberation.meta?.changes ?? 0) !== 1) return 'deja-attribuee';

  await env.DB.prepare(
    'INSERT INTO attributions (lead_id, professionnel_id, statut, motif, email_envoye) VALUES (?, ?, ?, ?, 0)'
  )
    .bind(lead.id, proId, statut, motif || null)
    .run();

  return 'refus';
}

/**
 * Coordonnées interdites dans l'offre. Le nom complet, le téléphone et
 * l'adresse ne doivent y figurer sous aucune forme — y compris dans la
 * description écrite par le demandeur, qui y glisse parfois son numéro.
 */
function coordonneesDuDemandeur(lead: LigneLead): string[] {
  const nomComplet = `${lead.prenom || ''} ${lead.nom || ''}`.trim();
  return [lead.email, lead.telephone, nomComplet]
    .map((v) => String(v || '').trim())
    .filter((v) => v.length >= 4);
}

async function envoyer(env: Env, lead: LigneLead, proId: number, form: FormData, origine: string): Promise<string> {
  // Refus immédiat si la demande est déjà chez quelqu'un. Ce contrôle ne
  // remplace pas la prise conditionnelle plus bas — il n'existe que pour
  // afficher le bon motif ; deux requêtes simultanées passeraient toutes deux
  // ici, et c'est la base qui n'en laisserait qu'une aboutir.
  if (lead.pro_actif_id) return 'deja-attribuee';

  const sujet = String(form.get('sujet') || '').trim().slice(0, SUJET_MAX);
  const corps = String(form.get('corps') || '').trim().slice(0, CORPS_MAX);
  if (!sujet || !corps) return 'brouillon-vide';

  const { selection, tous } = await chargerRoutage(env.DB, lead);
  const destinataire = selection.candidats.find((p) => p.id === proId);
  // Seul un candidat de la liste calculée côté serveur est acceptable : le
  // <select> du formulaire ne fait pas autorité.
  if (!destinataire) return 'pro-invalide';

  const problemes = fuites(sujet, corps, {
    autresPros: empreintesDesAutres(tous, destinataire.id, lead),
    coordonnees: coordonneesDuDemandeur(lead)
  });
  if (problemes.length > 0) {
    const libelles = [...new Set(problemes.map((p) => p.libelle))].join(', ');
    return `fuite:${libelles}`.slice(0, 180);
  }

  // --- Réservation exclusive de la demande ---------------------------------
  // Seul `pro_actif_id` est posé ici : `statut` reste tel quel. Une demande
  // n'est dite « transmise » qu'une fois l'e-mail réellement parti — si l'envoi
  // échoue, ou si l'exécution s'interrompt entre les deux, elle n'aura jamais
  // porté ce statut. La réservation, elle, est indispensable dès maintenant :
  // c'est elle qui interdit un second envoi simultané.
  const prise = await env.DB.prepare(
    "UPDATE leads SET pro_actif_id = ?, pro_actif_at = datetime('now') WHERE id = ? AND pro_actif_id IS NULL"
  )
    .bind(destinataire.id, lead.id)
    .run();

  if (Number(prise.meta?.changes ?? 0) !== 1) return 'deja-attribuee';

  // --- Envoi ---------------------------------------------------------------
  // Le jeton est créé avant l'expédition puisqu'il figure dans le message, et
  // n'est enregistré qu'après : un envoi échoué ne laisse pas de clé valide.
  const jeton = nouveauJeton();
  let erreur: string | null = null;

  if (!env.NOTIFICATION) {
    erreur = 'service de notification non configuré';
  } else {
    try {
      const reponse = await env.NOTIFICATION.fetch(
        new Request('https://notification-lead/envoyer-pro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destinataire: destinataire.email,
            sujet,
            corps,
            // Page publique de réponse : même origine que l'administration, donc
            // la prévisualisation renvoie vers la prévisualisation.
            urlReponse: `${origine}/reponse/${jeton}`
          })
        })
      );
      const json = (await reponse.json()) as { ok?: boolean; erreur?: string };
      if (!reponse.ok || json.ok !== true) {
        erreur = (json.erreur || `statut ${reponse.status}`).slice(0, 180);
      }
    } catch (e) {
      erreur = (e instanceof Error ? e.message : 'service injoignable').slice(0, 180);
    }
  }

  if (erreur) {
    // L'e-mail n'est pas parti : la réservation est annulée, sans quoi un échec
    // technique bloquerait la demande définitivement. `statut` n'a pas été
    // touché, la demande n'a donc jamais été présentée comme transmise.
    await env.DB.prepare(
      'UPDATE leads SET pro_actif_id = NULL, pro_actif_at = NULL WHERE id = ? AND pro_actif_id = ?'
    )
      .bind(lead.id, destinataire.id)
      .run();

    await env.DB.prepare(
      'INSERT INTO attributions (lead_id, professionnel_id, statut, motif, email_envoye) VALUES (?, ?, ?, ?, 0)'
    )
      .bind(lead.id, destinataire.id, 'echec', erreur)
      .run();

    return `echec:${erreur}`.slice(0, 180);
  }

  // L'envoi a abouti : c'est seulement maintenant que la demande devient
  // « transmise », et que la trace d'attribution porteuse du jeton est écrite.
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO attributions (lead_id, professionnel_id, statut, motif, email_envoye, jeton) VALUES (?, ?, ?, NULL, 1, ?)'
    ).bind(lead.id, destinataire.id, 'envoye', jeton),
    env.DB.prepare("UPDATE leads SET statut = 'transmis' WHERE id = ?").bind(lead.id),
    env.DB.prepare(
      "UPDATE professionnels SET dernier_lead_at = datetime('now'), dernier_lead_id = ? WHERE id = ?"
    ).bind(lead.id, destinataire.id)
  ]);

  return 'envoye';
}

/* ------------------------------------------------------------------------ */
/* Affichage                                                                  */
/* ------------------------------------------------------------------------ */

function banniere(fait: string): string {
  if (!fait) return '';

  if (fait.startsWith('fuite:')) {
    return `<div class="carte alerte"><b class="ko">Envoi bloqué.</b> Le message contient des éléments interdits : ${echapper(
      fait.slice(6)
    )}. Aucun e-mail n’a été expédié et la demande reste attribuable.</div>`;
  }
  if (fait.startsWith('echec:')) {
    return `<div class="carte alerte"><b class="ko">L’e-mail n’est pas parti.</b> ${echapper(
      fait.slice(6)
    )}. La demande a été libérée : vous pouvez réessayer.</div>`;
  }

  const message = MESSAGES[fait];
  if (!message) return '';
  return `<div class="carte ${message.ton === 'ok' ? 'ok' : 'alerte'}">${echapper(message.texte)}</div>`;
}

function ficheDemande(lead: LigneLead): string {
  const champs: Array<[string, string]> = [
    ['Type de demande', String(lead.metier_nom || lead.metier || '')],
    ['Commune', `${lead.commune || lead.ville || ''} ${lead.code_postal || ''}`.trim()],
    ['Date de la demande', dateCourte(lead.submitted_at || lead.created_at)],
    ['Demandeur', `${lead.prenom || ''} ${lead.nom || ''}`.trim()],
    ['Téléphone', String(lead.telephone || '')],
    ['E-mail', String(lead.email || '')],
    ['Délai souhaité', String(lead.delai_souhaite || '')],
    ['Statut interne', lead.statut]
  ].filter(([, v]) => v.trim().length > 0) as Array<[string, string]>;

  return `<div class="carte">
  <h2>Demande n° ${lead.id}</h2>
  <div class="grille">
    ${champs
      .map(
        ([libelle, valeur]) =>
          `<div><span class="muted">${echapper(libelle)}</span><br><b>${echapper(valeur)}</b></div>`
      )
      .join('')}
  </div>
  ${
    lead.description
      ? `<p class="muted" style="margin:1rem 0 .2rem">Description</p><div style="white-space:pre-wrap">${echapper(
          lead.description
        )}</div>`
      : ''
  }
</div>`;
}

/** Réservation posée mais aucun envoi tracé : l'exécution s'est interrompue. */
function blocReservationIncomplete(lead: LigneLead, pro: Professionnel): string {
  return `<div class="carte alerte">
  <h2>Réservation incomplète</h2>
  <p style="margin:0 0 .6rem">
    La demande a été réservée pour <b>${echapper(nomPro(pro))}</b> le ${echapper(dateCourte(lead.pro_actif_at))},
    mais <b class="ko">aucun e-mail n’a été envoyé</b> : le traitement s’est interrompu en cours de route.
    Elle n’a jamais été marquée comme transmise. Annulez la réservation pour pouvoir la proposer de nouveau.
  </p>
  <form method="post">
    <input type="hidden" name="action" value="liberer">
    <input type="hidden" name="pro_id" value="${pro.id}">
    <button type="submit" class="sec">Annuler la réservation</button>
  </form>
</div>`;
}

function blocAttribue(lead: LigneLead, pro: Professionnel, reponse: Attribution | null): string {
  // Trois états bien distincts : en attente de réponse, acceptée, ou attribuée
  // sans que le professionnel ait cliqué (réponse donnée par téléphone).
  const etat = reponse?.statut === 'accepte'
    ? `<p style="margin:0 0 .6rem"><span class="tag t-envoye">acceptée</span> Le professionnel a accepté le ${echapper(
        dateCourte(reponse.created_at)
      )} depuis l’e-mail. Les coordonnées du demandeur lui ont été communiquées.</p>`
    : `<p style="margin:0 0 .6rem"><span class="tag t-nouveau">en attente de réponse</span> Les coordonnées du demandeur restent masquées tant qu’il n’a pas accepté.</p>`;

  return `<div class="carte ok">
  <h2>Demande attribuée</h2>
  ${etat}
  <p style="margin:0 0 .6rem">
    Transmise à <b>${echapper(nomPro(pro))}</b> le ${echapper(dateCourte(lead.pro_actif_at))}.
    Aucun autre professionnel ne peut recevoir cette demande tant qu’elle lui est attribuée.
  </p>
  <form method="post" class="actions">
    <input type="hidden" name="action" value="refus">
    <input type="hidden" name="pro_id" value="${pro.id}">
    <div>
      <label for="statut-refus">Le professionnel</label>
      <select id="statut-refus" name="statut">
        <option value="refuse">refuse la demande</option>
        <option value="indisponible">est indisponible</option>
      </select>
    </div>
    <div style="flex:1;min-width:240px">
      <label for="motif-refus">Motif (facultatif)</label>
      <input id="motif-refus" name="motif" style="width:100%" placeholder="trop loin, agenda complet…">
    </div>
    <button type="submit" class="sec">Enregistrer et proposer le suivant</button>
  </form>
</div>`;
}

function blocEnvoi(lead: LigneLead, candidats: Professionnel[], ecartes: Array<{ pro: Professionnel; motif: string }>): string {
  if (candidats.length === 0) {
    return `<div class="carte alerte">
  <h2>Aucun professionnel disponible</h2>
  <p style="margin:0">
    Aucune fiche active, disponible, à l’adresse vérifiée ne couvre ce métier et cette commune,
    ou toutes ont déjà été sollicitées pour cette demande.
    <a href="/admin/pros">Gérer les professionnels</a>.
  </p>
  ${blocEcartes(ecartes)}
</div>`;
  }

  const recommande = candidats[0];
  const { sujet, corps } = construireBrouillon(lead);

  const options = candidats
    .map(
      (p, index) =>
        `<option value="${p.id}"${index === 0 ? ' selected' : ''}>${echapper(nomPro(p))} — ${echapper(
          p.email
        )}${index === 0 ? ' — recommandé' : ''}</option>`
    )
    .join('');

  return `<div class="carte">
  <h2>Transmettre la demande</h2>
  <p class="muted" style="margin:0 0 .9rem">
    Professionnel recommandé : <b style="color:#123d2c">${echapper(nomPro(recommande))}</b>
    — priorité ${recommande.priorite}, dernier lead ${escapeRien(dateCourte(recommande.dernier_lead_at))}.
    ${candidats.length - 1} autre(s) professionnel(s) compatible(s).
  </p>

  <form method="post" id="form-envoi">
    <input type="hidden" name="action" value="envoyer">

    <div style="margin-bottom:.9rem">
      <label for="pro_id">Professionnel destinataire</label>
      <select id="pro_id" name="pro_id" style="min-width:min(100%,520px)">${options}</select>
    </div>

    <div style="margin-bottom:.9rem">
      <label for="sujet">Sujet de l’e-mail</label>
      <input id="sujet" name="sujet" value="${echapper(sujet)}" maxlength="${SUJET_MAX}" style="width:min(100%,520px)">
    </div>

    <div>
      <label for="corps">Brouillon — modifiable avant envoi</label>
      <textarea id="corps" name="corps" maxlength="${CORPS_MAX}">${echapper(corps)}</textarea>
    </div>

    <p class="muted" style="margin:.5rem 0 0">
      Le professionnel reçoit cette offre avec deux boutons, « Accepter » et « Refuser ».
      Les coordonnées du demandeur y sont masquées et ne lui sont communiquées qu’après acceptation ;
      d’ici là, une réponse à l’e-mail nous revient à nous.
      L’envoi est bloqué si le texte modifié fait apparaître ces coordonnées, un lien d’administration
      ou un autre professionnel.
    </p>

    <div class="actions">
      <button type="submit" id="btn-envoi">Envoyer au professionnel</button>
      <span class="muted">Un seul envoi possible : la demande est ensuite verrouillée jusqu’à sa réponse.</span>
    </div>
  </form>
</div>
${blocEcartes(ecartes)}
<script>
// Confort seulement : le verrou réel est la mise à jour conditionnelle en base,
// qui rejette le second envoi même si ce script ne s'exécute pas.
document.getElementById('form-envoi').addEventListener('submit', function (evenement) {
  var bouton = document.getElementById('btn-envoi');
  if (bouton.disabled) { evenement.preventDefault(); return; }
  bouton.disabled = true;
  bouton.textContent = 'Envoi en cours…';
});
</script>`;
}

function escapeRien(valeur: string): string {
  return echapper(valeur === '—' ? 'jamais' : valeur);
}

function blocEcartes(ecartes: Array<{ pro: Professionnel; motif: string }>): string {
  if (ecartes.length === 0) return '';
  return `<div class="carte">
  <h2>Professionnels écartés (${ecartes.length})</h2>
  <div class="tablewrap"><table>
  <thead><tr><th>Professionnel</th><th>Raison</th></tr></thead>
  <tbody>${ecartes
    .map(
      (e) =>
        `<tr><td>${echapper(nomPro(e.pro))}</td><td><span class="tag t-perdu">${echapper(e.motif)}</span></td></tr>`
    )
    .join('')}</tbody></table></div>
</div>`;
}

function blocHistorique(historique: Attribution[], tous: Professionnel[]): string {
  if (historique.length === 0) {
    return '<div class="carte"><h2>Historique</h2><p class="muted" style="margin:0">Aucune sélection ni envoi pour cette demande.</p></div>';
  }

  const parId = new Map(tous.map((p) => [p.id, p]));

  return `<div class="carte">
  <h2>Historique des sélections et envois</h2>
  <div class="tablewrap"><table>
  <thead><tr><th>Date</th><th>Professionnel</th><th>Événement</th><th>E-mail</th><th>Motif</th></tr></thead>
  <tbody>${historique
    .map((a) => {
      const pro = parId.get(a.professionnel_id);
      return `<tr>
      <td>${echapper(dateCourte(a.created_at))}</td>
      <td>${echapper(pro ? nomPro(pro) : `fiche supprimée (n° ${a.professionnel_id})`)}</td>
      <td><span class="tag t-${echapper(a.statut)}">${echapper(a.statut)}</span></td>
      <td>${a.email_envoye === 1 ? 'envoyé' : '<span class="ko">non envoyé</span>'}</td>
      <td>${echapper(a.motif || '')}</td>
    </tr>`;
    })
    .join('')}</tbody></table></div>
</div>`;
}

async function afficher(env: Env, lead: LigneLead, identite: string, url: URL): Promise<Response> {
  const { selection, historique, tous } = await chargerRoutage(env.DB, lead);
  const proActif = lead.pro_actif_id ? tous.find((p) => p.id === lead.pro_actif_id) ?? null : null;

  // Fiche supprimée alors qu'elle détenait la demande : ne surtout pas
  // retomber sur le formulaire d'envoi, la base refuserait l'attribution et
  // l'écran serait trompeur.
  const reponseDuPro =
    historique.find((a) => a.professionnel_id === lead.pro_actif_id && (a.statut === 'accepte' || a.statut === 'refuse')) ??
    null;

  const envoiConfirme = historique.some(
    (a) => a.professionnel_id === lead.pro_actif_id && a.statut === 'envoye'
  );

  const blocRoutage = lead.pro_actif_id
    ? proActif
      ? envoiConfirme
        ? blocAttribue(lead, proActif, reponseDuPro)
        : blocReservationIncomplete(lead, proActif)
      : `<div class="carte alerte"><h2>Demande bloquée</h2><p style="margin:0">Elle est attribuée au professionnel n° ${lead.pro_actif_id}, dont la fiche n’existe plus. Recréez la fiche pour enregistrer un refus et libérer la demande.</p></div>`
    : blocEnvoi(lead, selection.candidats, selection.ecartes);

  const contenu = [
    '<p style="margin:0 0 1rem"><a class="btn mineur" href="/admin">← Toutes les demandes</a></p>',
    banniere((url.searchParams.get('fait') || '').slice(0, 200)),
    ficheDemande(lead),
    blocRoutage,
    blocHistorique(historique, tous)
  ].join('');

  return reponseHtml(pageAdmin(`Demande n° ${lead.id}`, contenu, identite, 'demandes'));
}
