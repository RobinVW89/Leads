/**
 * Espace interne de consultation des demandes.
 *
 * L'authentification est assurée en amont par Cloudflare Access sur
 * lesprosdelyonne.com/admin (politique « admin »). Cette fonction lit
 * l'identité transmise par Access et l'affiche, sans la vérifier elle-même :
 * la requête ne peut pas arriver ici sans avoir passé Access.
 */

import { estAdmin, identifierViaAccess } from '../_lib/access';
import { avecEntetesSecurite } from '../_lib/entetes';

type Env = {
  DB: D1Database;
  /** Liste blanche des identités autorisées, séparées par des virgules. */
  ADMIN_EMAILS?: string;
};

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
  entreprise: string | null;
  siret: string | null;
  site_web: string | null;
  zone_intervention: string | null;
};

const PAR_PAGE = 50;

function echapper(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

function page(contenu: string, identite: string): string {
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Demandes — Les Pros de l'Yonne</title>
<style>
*{box-sizing:border-box}
body{margin:0;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#1b2a22;background:#fdf9f1}
header{background:#123d2c;color:#fff;padding:1rem 1.4rem;display:flex;flex-wrap:wrap;gap:1rem;align-items:center;justify-content:space-between}
header h1{margin:0;font-size:1.15rem;letter-spacing:-.01em}
header .qui{font-size:.86rem;color:#c9dccf}
main{padding:1.4rem;max-width:1500px;margin:0 auto}
.stats{display:flex;flex-wrap:wrap;gap:.7rem;margin-bottom:1.2rem}
.stat{background:#fff;border:1px solid #e7dcc8;border-radius:12px;padding:.7rem 1rem;min-width:130px}
.stat b{display:block;font-size:1.5rem;line-height:1.2;color:#123d2c}
.stat span{font-size:.82rem;color:#5b6b61}
form.filtres{display:flex;flex-wrap:wrap;gap:.6rem;align-items:flex-end;margin-bottom:1rem;background:#fff;border:1px solid #e7dcc8;border-radius:12px;padding:.9rem}
form.filtres label{font-size:.8rem;font-weight:600;color:#5b6b61;display:block;margin-bottom:.2rem}
input,select{font:inherit;padding:.5rem .6rem;border:1.5px solid #d9c8ac;border-radius:8px;background:#fff;min-height:40px}
button{font:inherit;font-weight:700;padding:.5rem 1rem;border:0;border-radius:8px;background:#c1552b;color:#fff;cursor:pointer;min-height:40px}
button.sec{background:#123d2c}
button.danger{background:#fff;color:#97302f;border:1.5px solid #e4b9b8;font-weight:600;padding:.3rem .6rem;min-height:32px}
a.btn{display:inline-flex;align-items:center;padding:.5rem 1rem;background:#123d2c;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;min-height:40px}
.tablewrap{overflow-x:auto;background:#fff;border:1px solid #e7dcc8;border-radius:12px}
table{border-collapse:collapse;width:100%;font-size:.88rem}
th,td{padding:.6rem .7rem;text-align:left;border-bottom:1px solid #f0e8d8;vertical-align:top}
th{background:#f7efe1;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:#5b6b61;position:sticky;top:0}
tr:hover td{background:#fdfaf4}
.tag{display:inline-block;padding:.12rem .5rem;border-radius:999px;font-size:.76rem;font-weight:700;white-space:nowrap}
.t-nouveau{background:#fdf1d3;color:#6d4a12}
.t-transmis{background:#e4eee6;color:#123d2c}
.t-traite{background:#dbeafe;color:#1e40af}
.t-perdu{background:#f3f4f6;color:#4b5563}
.ko{color:#97302f;font-weight:700}
.desc{max-width:340px;color:#3a4a41}
.qual{max-width:340px;font-size:.82rem;color:#5b6b61}
.vide{padding:3rem 1rem;text-align:center;color:#5b6b61}
.pag{display:flex;gap:.6rem;align-items:center;margin-top:1rem}
@media(max-width:700px){main{padding:.8rem}.desc,.qual{max-width:200px}}
</style></head><body>
<header>
  <h1>Demandes reçues — Les Pros de l'Yonne</h1>
  <span class="qui">${echapper(identite)}</span>
</header>
<main>${contenu}</main>
</body></html>`;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  const estLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  let identite = 'session locale de développement';

  if (!estLocal) {
    // Preuve d'identité : JWT signé par Cloudflare, vérifié cryptographiquement.
    const acces = await identifierViaAccess(request);
    if (!acces.ok) {
      return avecEntetesSecurite(
        new Response(`Accès refusé. Authentification Cloudflare Access requise (${acces.motif}).`, {
          status: 403,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
        })
      );
    }
    if (!estAdmin(acces.email, env.ADMIN_EMAILS)) {
      return avecEntetesSecurite(
        new Response(`Accès refusé. L'identité ${acces.email} n'est pas habilitée sur cet espace.`, {
          status: 403,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
        })
      );
    }
    identite = acces.email;
  }

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
              SUM(CASE WHEN transmis_webhook = 0 THEN 1 ELSE 0 END) AS non_transmis,
              SUM(CASE WHEN created_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS semaine,
              SUM(CASE WHEN type = 'pro' THEN 1 ELSE 0 END) AS pros
       FROM leads`
    ).first<{ total: number; nouveaux: number; non_transmis: number; semaine: number; pros: number }>(),
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
  <div class="stat"><b class="${(stats?.non_transmis ?? 0) > 0 ? 'ko' : ''}">${stats?.non_transmis ?? 0}</b><span>non transmises au webhook</span></div>
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
    return avecEntetesSecurite(
      new Response(
        page(
          filtres + '<div class="tablewrap"><p class="vide">Aucune demande ne correspond. La base est prête et attend le premier envoi.</p></div>',
          identite
        ),
        { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
      ),
      'admin'
    );
  }

  const corps = (lignes.results || [])
    .map((l) => {
      const qual = qualificationLisible(l.qualification);
      return `<tr>
  <td><b>${dateCourte(l.created_at)}</b><br><span class="tag t-${echapper(l.statut)}">${echapper(l.statut)}</span>${
        l.transmis_webhook === 0 ? '<br><span class="ko">non transmis</span>' : ''
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
<thead><tr><th>Reçue le</th><th>Métier / ville</th><th>Contact</th><th>Description</th><th>Qualification</th><th>Délai / budget</th><th>Suivi</th></tr></thead>
<tbody>${corps}</tbody></table></div>${pagination}`;

  return avecEntetesSecurite(new Response(page(filtres + table, identite), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  }), 'admin');
};
