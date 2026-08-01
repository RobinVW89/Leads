/**
 * Espace interne de consultation des demandes.
 *
 * L'authentification est assurée en amont par Cloudflare Access sur
 * lesprosdelyonne.com/admin (politique « admin »). Cette fonction lit
 * l'identité transmise par Access et l'affiche, sans la vérifier elle-même :
 * la requête ne peut pas arriver ici sans avoir passé Access.
 */

import { echapper, garderAdmin, pageAdmin, reponseHtml, type EnvAdmin } from '../_lib/admin-page';

type Env = EnvAdmin;

type LigneLead = {
  id: number;
  created_at: string;
  type: string;
  metier: string | null;
  metier_nom: string | null;
  ville: string | null;
  prenom: string | null;
  nom: string | null;
  telephone: string | null;
  email: string | null;
  commune: string | null;
  code_postal: string | null;
  description: string | null;
  delai_souhaite: string | null;
  budget: string | null;
  qualification: string | null;
  page_source: string | null;
  statut: string;
  transmis_webhook: number;
  notifie_email: number;
  notification_erreur: string | null;
  entreprise: string | null;
  siret: string | null;
  site_web: string | null;
  zone_intervention: string | null;
  pro_actif_id: number | null;
};

const PAR_PAGE = 50;

/**
 * Une URL saisie par un candidat ne doit jamais devenir un href tel quel :
 * « javascript:… » exécuterait du code dans l'origine de l'administration,
 * avec la session Access ouverte. Seuls http et https sont acceptés.
 */
function lienExterneSur(valeur: unknown): string | null {
  const brut = String(valeur ?? '').trim();
  if (!brut) return null;
  try {
    const url = new URL(brut);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function dateCourte(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function qualificationLisible(brut: string | null): string {
  if (!brut) return '';
  try {
    const items = JSON.parse(brut) as Array<{ question?: string; reponse?: string }>;
    if (!Array.isArray(items)) return '';
    return items
      .filter((item) => item && item.reponse)
      .map((item) => `${(item.question || '').replace(/\s*\(facultatif\)\s*/i, '').trim()} → ${item.reponse}`)
      .join(' · ');
  } catch {
    return '';
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  const acces = await garderAdmin(request, env);
  if (!acces.ok) return acces.reponse;
  const identite = acces.identite;

  // --- Actions -----------------------------------------------------------
  if (request.method === 'POST') {
    const form = await request.formData();
    const action = String(form.get('action') || '');
    const id = Number(form.get('id') || 0);

    if (action === 'supprimer' && id > 0) {
      await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
    } else if (action === 'statut' && id > 0) {
      const statut = String(form.get('statut') || 'nouveau');
      if (['nouveau', 'transmis', 'traite', 'perdu'].includes(statut)) {
        await env.DB.prepare('UPDATE leads SET statut = ? WHERE id = ?').bind(statut, id).run();
      }
    }

    // Redirection pour éviter le renvoi du formulaire au rafraîchissement.
    return Response.redirect(url.origin + url.pathname + url.search, 303);
  }

  // --- Filtres -----------------------------------------------------------
  const fMetier = (url.searchParams.get('metier') || '').slice(0, 80);
  const fVille = (url.searchParams.get('ville') || '').slice(0, 120);
  const fStatut = (url.searchParams.get('statut') || '').slice(0, 20);
  const fType = (url.searchParams.get('type') || '').slice(0, 20);
  const fRecherche = (url.searchParams.get('q') || '').slice(0, 120);
  const pageNum = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);

  const conditions: string[] = [];
  const valeurs: unknown[] = [];

  if (fMetier) {
    conditions.push('metier = ?');
    valeurs.push(fMetier);
  }
  if (fVille) {
    conditions.push('ville = ?');
    valeurs.push(fVille);
  }
  if (fStatut) {
    conditions.push('statut = ?');
    valeurs.push(fStatut);
  }
  if (fType) {
    conditions.push('type = ?');
    valeurs.push(fType);
  }
  if (fRecherche) {
    conditions.push('(nom LIKE ? OR prenom LIKE ? OR email LIKE ? OR telephone LIKE ? OR commune LIKE ?)');
    const motif = `%${fRecherche}%`;
    valeurs.push(motif, motif, motif, motif, motif);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [total, stats, metiers, villes, lignes] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM leads ${where}`)
      .bind(...valeurs)
      .first<{ n: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN statut = 'nouveau' THEN 1 ELSE 0 END) AS nouveaux,
              SUM(CASE WHEN created_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS semaine,
              SUM(CASE WHEN type = 'pro' THEN 1 ELSE 0 END) AS pros,
              SUM(CASE WHEN notifie_email = 0 THEN 1 ELSE 0 END) AS non_notifies
       FROM leads`
    ).first<{ total: number; nouveaux: number; semaine: number; pros: number; non_notifies: number }>(),
    env.DB.prepare('SELECT DISTINCT metier FROM leads WHERE metier <> "" ORDER BY metier').all<{ metier: string }>(),
    env.DB.prepare('SELECT DISTINCT ville FROM leads WHERE ville <> "" ORDER BY ville').all<{ ville: string }>(),
    env.DB.prepare(`SELECT * FROM leads ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...valeurs, PAR_PAGE, (pageNum - 1) * PAR_PAGE)
      .all<LigneLead>()
  ]);

  const nbTotal = total?.n ?? 0;
  const nbPages = Math.max(1, Math.ceil(nbTotal / PAR_PAGE));

  const optionsMetier = (metiers.results || [])
    .map((m) => `<option value="${echapper(m.metier)}"${m.metier === fMetier ? ' selected' : ''}>${echapper(m.metier)}</option>`)
    .join('');
  const optionsVille = (villes.results || [])
    .map((v) => `<option value="${echapper(v.ville)}"${v.ville === fVille ? ' selected' : ''}>${echapper(v.ville)}</option>`)
    .join('');

  const exportUrl = `/admin/export.csv${url.search}`;

  const filtres = `
<div class="stats">
  <div class="stat"><b>${stats?.total ?? 0}</b><span>demandes au total</span></div>
  <div class="stat"><b>${stats?.nouveaux ?? 0}</b><span>à traiter</span></div>
  <div class="stat"><b>${stats?.semaine ?? 0}</b><span>ces 7 derniers jours</span></div>
  <div class="stat"><b>${stats?.pros ?? 0}</b><span>candidatures pro</span></div>
  <div class="stat"><b class="${(stats?.non_notifies ?? 0) > 0 ? 'ko' : ''}">${stats?.non_notifies ?? 0}</b><span>sans notification e-mail</span></div>
</div>
<form class="filtres" method="get">
  <div><label for="f-metier">Métier</label><select id="f-metier" name="metier"><option value="">Tous</option>${optionsMetier}</select></div>
  <div><label for="f-ville">Ville</label><select id="f-ville" name="ville"><option value="">Toutes</option>${optionsVille}</select></div>
  <div><label for="f-statut">Statut</label><select id="f-statut" name="statut">
    <option value="">Tous</option>
    ${['nouveau', 'transmis', 'traite', 'perdu'].map((s) => `<option value="${s}"${s === fStatut ? ' selected' : ''}>${s}</option>`).join('')}
  </select></div>
  <div><label for="f-type">Type</label><select id="f-type" name="type">
    <option value="">Tous</option>
    ${[['lead', 'Demandes'], ['intention', 'Intentions'], ['pro', 'Candidatures pro']].map(([v, l]) => `<option value="${v}"${v === fType ? ' selected' : ''}>${l}</option>`).join('')}
  </select></div>
  <div><label for="f-q">Recherche</label><input id="f-q" name="q" value="${echapper(fRecherche)}" placeholder="nom, email, téléphone…"></div>
  <button type="submit">Filtrer</button>
  <a class="btn" href="/admin">Réinitialiser</a>
  <a class="btn" href="${echapper(exportUrl)}">Exporter en CSV</a>
</form>`;

  if (nbTotal === 0) {
    return reponseHtml(
      pageAdmin(
        'Demandes reçues',
        filtres + '<div class="tablewrap"><p class="vide">Aucune demande ne correspond. La base est prête et attend le premier envoi.</p></div>',
        identite,
        'demandes'
      )
    );
  }

  const corps = (lignes.results || [])
    .map((l) => {
      const qual = qualificationLisible(l.qualification);
      return `<tr>
  <td><b>${dateCourte(l.created_at)}</b><br><span class="tag t-${echapper(l.statut)}">${echapper(l.statut)}</span>${
        l.notifie_email === 1
          ? '<br><span class="tag t-transmis">notification envoyée</span>'
          : `<br><span class="ko">notification NON envoyée</span>${
              l.notification_erreur
                ? `<br><span style="font-size:.76rem;color:#97302f">${echapper(l.notification_erreur)}</span>`
                : ''
            }`
      }</td>
  <td><b>${echapper(l.metier_nom || l.metier)}</b><br><span style="color:#5b6b61">${echapper(l.ville)}</span>${
        l.type === 'intention' ? '<br><span class="tag t-perdu">intention</span>' : ''
      }${
        l.type === 'pro'
          ? `<br><span class="tag t-traite">candidature pro</span><br><b>${echapper(l.entreprise)}</b>${
              l.siret ? `<br><span style="color:#5b6b61">SIRET ${echapper(l.siret)}</span>` : ''
            }${
              lienExterneSur(l.site_web)
                ? `<br><a href="${echapper(lienExterneSur(l.site_web))}" target="_blank" rel="noopener noreferrer">site web</a>`
                : l.site_web
                  ? `<br><span style="color:#97302f">site web non valide : ${echapper(l.site_web)}</span>`
                  : ''
            }`
          : ''
      }</td>
  <td><b>${echapper(l.prenom)} ${echapper(l.nom)}</b><br>
      ${l.telephone ? `<a href="tel:${echapper(l.telephone)}">${echapper(l.telephone)}</a><br>` : ''}
      ${l.email ? `<a href="mailto:${echapper(l.email)}">${echapper(l.email)}</a><br>` : ''}
      <span style="color:#5b6b61">${echapper(l.commune)} ${echapper(l.code_postal)}</span></td>
  <td class="desc">${echapper(l.description)}</td>
  <td class="qual">${echapper(qual)}</td>
  <td>${l.type === 'pro' ? echapper(l.zone_intervention) : `${echapper(l.delai_souhaite)}${l.budget ? `<br>${echapper(l.budget)}` : ''}`}</td>
  <td>${
        l.type === 'lead'
          ? `<a class="btn" style="min-height:32px;padding:.3rem .7rem" href="/admin/lead/${l.id}">${
              l.pro_actif_id ? 'Voir le routage' : 'Router'
            }</a>${
              l.pro_actif_id
                ? '<br><span class="tag t-envoye" style="margin-top:.3rem">attribuée</span>'
                : '<br><span class="tag t-nouveau" style="margin-top:.3rem">à attribuer</span>'
            }`
          : '<span class="muted">—</span>'
      }</td>
  <td>
    <form method="post" style="display:flex;gap:.3rem;margin-bottom:.4rem">
      <input type="hidden" name="action" value="statut"><input type="hidden" name="id" value="${l.id}">
      <select name="statut" style="min-height:32px;padding:.2rem .4rem">
        ${['nouveau', 'transmis', 'traite', 'perdu'].map((s) => `<option value="${s}"${s === l.statut ? ' selected' : ''}>${s}</option>`).join('')}
      </select>
      <button type="submit" class="sec" style="min-height:32px;padding:.25rem .6rem">OK</button>
    </form>
    <form method="post" onsubmit="return confirm('Supprimer définitivement cette demande ? Action irréversible (droit à l\\'effacement).')">
      <input type="hidden" name="action" value="supprimer"><input type="hidden" name="id" value="${l.id}">
      <button type="submit" class="danger">Supprimer</button>
    </form>
  </td>
</tr>`;
    })
    .join('');

  const paramsPage = new URLSearchParams(url.search);
  const lienPage = (n: number) => {
    paramsPage.set('page', String(n));
    return `/admin?${paramsPage.toString()}`;
  };

  const pagination =
    nbPages > 1
      ? `<div class="pag">
      ${pageNum > 1 ? `<a class="btn" href="${lienPage(pageNum - 1)}">Précédent</a>` : ''}
      <span>Page ${pageNum} sur ${nbPages} — ${nbTotal} demande(s)</span>
      ${pageNum < nbPages ? `<a class="btn" href="${lienPage(pageNum + 1)}">Suivant</a>` : ''}
    </div>`
      : `<div class="pag"><span>${nbTotal} demande(s)</span></div>`;

  const table = `<div class="tablewrap"><table>
<thead><tr><th>Reçue le</th><th>Métier / ville</th><th>Contact</th><th>Description</th><th>Qualification</th><th>Délai / budget</th><th>Routage</th><th>Suivi</th></tr></thead>
<tbody>${corps}</tbody></table></div>${pagination}`;

  return reponseHtml(pageAdmin('Demandes reçues', filtres + table, identite, 'demandes'));
};
