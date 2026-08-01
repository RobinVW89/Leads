/**
 * Habillage et contrôle d'accès communs aux pages de l'espace interne.
 *
 * Trois pages partagent désormais /admin (demandes, routage d'une demande,
 * professionnels). Regrouper ici la garde d'accès évite qu'une page ajoutée
 * plus tard oublie de la poser — l'oubli serait silencieux et exposerait des
 * coordonnées.
 */

import { estAdmin, identifierViaAccess } from './access';
import { avecEntetesSecurite } from './entetes';

export type EnvAdmin = {
  DB: D1Database;
  /** Liste blanche des identités autorisées, séparées par des virgules. */
  ADMIN_EMAILS?: string;
};

export function echapper(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function refus(message: string): Response {
  return avecEntetesSecurite(
    new Response(message, {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    })
  );
}

export type Acces = { ok: true; identite: string } | { ok: false; reponse: Response };

/**
 * Identité prouvée par le JWT Cloudflare Access, puis confrontée à la liste
 * blanche applicative. En développement local, Access n'est pas devant : la
 * page reste ouverte, mais l'identité affichée le dit explicitement.
 */
export async function garderAdmin(request: Request, env: EnvAdmin): Promise<Acces> {
  const hote = new URL(request.url).hostname;
  if (hote === 'localhost' || hote === '127.0.0.1') {
    return { ok: true, identite: 'session locale de développement' };
  }

  const acces = await identifierViaAccess(request);
  if (!acces.ok) {
    return { ok: false, reponse: refus(`Accès refusé. Authentification Cloudflare Access requise (${acces.motif}).`) };
  }
  if (!estAdmin(acces.email, env.ADMIN_EMAILS)) {
    return {
      ok: false,
      reponse: refus(`Accès refusé. L'identité ${acces.email} n'est pas habilitée sur cet espace.`)
    };
  }

  return { ok: true, identite: acces.email };
}

/** Feuille de style unique, en ligne : la CSP de /admin interdit tout externe. */
const STYLE = `
*{box-sizing:border-box}
body{margin:0;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#1b2a22;background:#fdf9f1}
header{background:#123d2c;color:#fff;padding:1rem 1.4rem;display:flex;flex-wrap:wrap;gap:1rem;align-items:center;justify-content:space-between}
header h1{margin:0;font-size:1.15rem;letter-spacing:-.01em}
header .qui{font-size:.86rem;color:#c9dccf}
nav.onglets{background:#0d2f22;padding:0 1.4rem;display:flex;gap:.3rem;flex-wrap:wrap}
nav.onglets a{color:#c9dccf;text-decoration:none;padding:.6rem .9rem;font-size:.9rem;font-weight:600;border-bottom:3px solid transparent}
nav.onglets a.actif{color:#fff;border-bottom-color:#c1552b}
main{padding:1.4rem;max-width:1500px;margin:0 auto}
h2{font-size:1.05rem;margin:0 0 .8rem}
.stats{display:flex;flex-wrap:wrap;gap:.7rem;margin-bottom:1.2rem}
.stat{background:#fff;border:1px solid #e7dcc8;border-radius:12px;padding:.7rem 1rem;min-width:130px}
.stat b{display:block;font-size:1.5rem;line-height:1.2;color:#123d2c}
.stat span{font-size:.82rem;color:#5b6b61}
.carte{background:#fff;border:1px solid #e7dcc8;border-radius:12px;padding:1.1rem;margin-bottom:1.1rem}
.carte.alerte{border-color:#e4b9b8;background:#fdf5f5}
.carte.ok{border-color:#bcd8c4;background:#f5faf6}
form.filtres{display:flex;flex-wrap:wrap;gap:.6rem;align-items:flex-end;margin-bottom:1rem;background:#fff;border:1px solid #e7dcc8;border-radius:12px;padding:.9rem}
label{font-size:.8rem;font-weight:600;color:#5b6b61;display:block;margin-bottom:.2rem}
input,select,textarea{font:inherit;padding:.5rem .6rem;border:1.5px solid #d9c8ac;border-radius:8px;background:#fff;min-height:40px;max-width:100%}
textarea{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.86rem;line-height:1.5;width:100%;min-height:340px}
button{font:inherit;font-weight:700;padding:.5rem 1rem;border:0;border-radius:8px;background:#c1552b;color:#fff;cursor:pointer;min-height:40px}
button.sec{background:#123d2c}
button.danger{background:#fff;color:#97302f;border:1.5px solid #e4b9b8;font-weight:600;padding:.3rem .6rem;min-height:32px}
button[disabled]{background:#cfc7b8;cursor:not-allowed}
a.btn{display:inline-flex;align-items:center;padding:.5rem 1rem;background:#123d2c;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;min-height:40px}
a.btn.mineur{background:#fff;color:#123d2c;border:1.5px solid #d9c8ac}
.tablewrap{overflow-x:auto;background:#fff;border:1px solid #e7dcc8;border-radius:12px}
table{border-collapse:collapse;width:100%;font-size:.88rem}
th,td{padding:.6rem .7rem;text-align:left;border-bottom:1px solid #f0e8d8;vertical-align:top}
th{background:#f7efe1;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:#5b6b61;position:sticky;top:0}
tr:hover td{background:#fdfaf4}
.tag{display:inline-block;padding:.12rem .5rem;border-radius:999px;font-size:.76rem;font-weight:700;white-space:nowrap}
.t-nouveau{background:#fdf1d3;color:#6d4a12}
.t-transmis,.t-envoye{background:#e4eee6;color:#123d2c}
.t-traite{background:#dbeafe;color:#1e40af}
.t-perdu,.t-inactif{background:#f3f4f6;color:#4b5563}
.t-refuse,.t-indisponible,.t-echec{background:#fbe4e4;color:#97302f}
.ko{color:#97302f;font-weight:700}
.desc{max-width:340px;color:#3a4a41}
.qual{max-width:340px;font-size:.82rem;color:#5b6b61}
.vide{padding:3rem 1rem;text-align:center;color:#5b6b61}
.pag{display:flex;gap:.6rem;align-items:center;margin-top:1rem}
.muted{color:#5b6b61;font-size:.85rem}
.grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:.7rem}
.actions{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin-top:1rem}
@media(max-width:700px){main{padding:.8rem}.desc,.qual{max-width:200px}}
`;

const ONGLETS: Array<{ href: string; libelle: string; cle: string }> = [
  { href: '/admin', libelle: 'Demandes', cle: 'demandes' },
  { href: '/admin/pros', libelle: 'Professionnels', cle: 'pros' }
];

export function pageAdmin(titre: string, contenu: string, identite: string, ongletActif = 'demandes'): string {
  const onglets = ONGLETS.map(
    (o) => `<a href="${o.href}"${o.cle === ongletActif ? ' class="actif"' : ''}>${echapper(o.libelle)}</a>`
  ).join('');

  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${echapper(titre)} — Les Pros de l'Yonne</title>
<style>${STYLE}</style></head><body>
<header>
  <h1>${echapper(titre)}</h1>
  <span class="qui">${echapper(identite)}</span>
</header>
<nav class="onglets">${onglets}</nav>
<main>${contenu}</main>
</body></html>`;
}

export function reponseHtml(html: string): Response {
  return avecEntetesSecurite(
    new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }),
    'admin'
  );
}
