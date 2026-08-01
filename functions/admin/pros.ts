/**
 * Gestion des professionnels référencés.
 *
 * Trois interrupteurs distincts, volontairement non fusionnés :
 * — « actif » : la fiche fait partie du réseau ;
 * — « disponible » : le professionnel accepte des demandes en ce moment ;
 * — « adresse vérifiée » : on a la preuve que l'adresse lui appartient.
 * Les trois sont exigés pour recevoir un lead. Les confondre reviendrait à
 * traiter des congés comme une sortie du réseau, et à écrire à une adresse
 * jamais confirmée.
 *
 * La vérification d'adresse a un second rôle : Cloudflare n'expédie un e-mail
 * qu'à une adresse de destination validée dans Email Routing. Ce drapeau doit
 * refléter cette validation ; sans elle l'envoi échouerait de toute façon.
 */

import metiers from '../../src/data/metiers.json';
import villes from '../../src/data/villes.json';
import { echapper, garderAdmin, pageAdmin, reponseHtml, type EnvAdmin } from '../_lib/admin-page';
import { enSlug, listeSlugs, type Professionnel } from '../_lib/routage';

const LONGUEURS = {
  raison_sociale: 160,
  contact_nom: 120,
  email: 160,
  telephone: 30,
  siret: 20,
  communes_libres: 400,
  note_interne: 500
} as const;

const METIERS = (metiers as Array<{ slug: string; nom: string }>).map((m) => ({ slug: m.slug, nom: m.nom }));
const VILLES = (villes as Array<{ slug: string; nom: string }>).map((v) => ({ slug: v.slug, nom: v.nom }));

const NOM_METIER = new Map(METIERS.map((m) => [m.slug, m.nom]));
const NOM_VILLE = new Map(VILLES.map((v) => [v.slug, v.nom]));

function champ(form: FormData, nom: keyof typeof LONGUEURS): string {
  return String(form.get(nom) || '').trim().slice(0, LONGUEURS[nom]);
}

function coche(form: FormData, nom: string): number {
  return form.get(nom) ? 1 : 0;
}

function adresseValide(valeur: string): boolean {
  return /^[^\s@<>",;]+@[^\s@<>",;.]+\.[a-z]{2,}$/i.test(valeur);
}

function dateCourte(iso: string | null | undefined): string {
  const brut = String(iso ?? '').trim();
  if (!brut) return '';
  const d = new Date(brut.includes('T') ? brut : brut.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return brut;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Métiers cochés dans le formulaire, ramenés à des slugs connus. */
function metiersDuFormulaire(form: FormData): string {
  const choisis = form
    .getAll('metiers')
    .map((v) => enSlug(v))
    .filter((slug) => NOM_METIER.has(slug));
  return [...new Set(choisis)].join(',');
}

/**
 * Zones couvertes. « Tout le département » est stocké comme une liste vide :
 * c'est la convention lue par le routage, et elle évite d'avoir à énumérer
 * puis maintenir les 400 communes de l'Yonne.
 */
function communesDuFormulaire(form: FormData): string {
  if (form.get('tout_departement')) return '';

  const cochees = form.getAll('communes').map((v) => enSlug(v));
  const libres = listeSlugs(champ(form, 'communes_libres'));
  return [...new Set([...cochees, ...libres].filter(Boolean))].join(',');
}

type Env = EnvAdmin;

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  const acces = await garderAdmin(request, env);
  if (!acces.ok) return acces.reponse;

  if (request.method === 'POST') {
    const fait = await traiterAction(request, env);
    return Response.redirect(`${url.origin}/admin/pros?fait=${encodeURIComponent(fait)}`, 303);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM professionnels ORDER BY actif DESC, disponible DESC, raison_sociale'
  ).all<Professionnel>();
  const pros = results || [];

  const idEdition = Number(url.searchParams.get('modifier') || 0) || 0;
  const enEdition = pros.find((p) => p.id === idEdition) ?? null;

  const contenu = [
    banniere((url.searchParams.get('fait') || '').slice(0, 200)),
    formulaire(enEdition),
    tableau(pros)
  ].join('');

  return reponseHtml(pageAdmin('Professionnels référencés', contenu, acces.identite, 'pros'));
};

/* ------------------------------------------------------------------------ */
/* Actions                                                                    */
/* ------------------------------------------------------------------------ */

async function traiterAction(request: Request, env: Env): Promise<string> {
  const form = await request.formData();
  const action = String(form.get('action') || '');
  const id = Number(form.get('id') || 0) || 0;

  if (action === 'basculer' && id > 0) {
    const colonne = String(form.get('colonne') || '');
    // Liste blanche : la colonne vient du formulaire et entre dans le SQL.
    if (!['actif', 'disponible', 'email_verifie'].includes(colonne)) return 'inconnu';
    await env.DB.prepare(`UPDATE professionnels SET ${colonne} = CASE ${colonne} WHEN 1 THEN 0 ELSE 1 END WHERE id = ?`)
      .bind(id)
      .run();
    return 'bascule';
  }

  if (action === 'supprimer' && id > 0) {
    // Une fiche citée dans l'historique n'est pas supprimable : l'effacer
    // rendrait illisibles les envois déjà tracés. On la désactive.
    const lien = await env.DB.prepare('SELECT COUNT(*) AS n FROM attributions WHERE professionnel_id = ?')
      .bind(id)
      .first<{ n: number }>();
    if ((lien?.n ?? 0) > 0) return 'suppression-refusee';

    await env.DB.prepare('DELETE FROM professionnels WHERE id = ?').bind(id).run();
    return 'supprime';
  }

  if (action !== 'enregistrer') return 'inconnu';

  const raisonSociale = champ(form, 'raison_sociale');
  const email = champ(form, 'email').toLowerCase();
  if (!raisonSociale) return 'nom-manquant';
  if (!adresseValide(email)) return 'email-invalide';

  const valeurs = [
    raisonSociale,
    champ(form, 'contact_nom') || null,
    email,
    champ(form, 'telephone') || null,
    champ(form, 'siret').replace(/\s+/g, '') || null,
    metiersDuFormulaire(form),
    communesDuFormulaire(form),
    Number(form.get('priorite') || 0) || 0,
    coche(form, 'actif'),
    coche(form, 'disponible'),
    coche(form, 'email_verifie'),
    champ(form, 'note_interne') || null
  ];

  try {
    if (id > 0) {
      await env.DB.prepare(
        `UPDATE professionnels SET raison_sociale = ?, contact_nom = ?, email = ?, telephone = ?, siret = ?,
         metiers = ?, communes = ?, priorite = ?, actif = ?, disponible = ?, email_verifie = ?, note_interne = ?
         WHERE id = ?`
      )
        .bind(...valeurs, id)
        .run();
      return 'modifie';
    }

    await env.DB.prepare(
      `INSERT INTO professionnels (raison_sociale, contact_nom, email, telephone, siret,
       metiers, communes, priorite, actif, disponible, email_verifie, note_interne)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(...valeurs)
      .run();
    return 'cree';
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : '';
    // L'index unique sur l'adresse est la seule contrainte susceptible de
    // sauter ici : un doublon fausserait la rotation et l'historique.
    if (/UNIQUE/i.test(message)) return 'email-en-double';
    return 'erreur';
  }
}

/* ------------------------------------------------------------------------ */
/* Affichage                                                                  */
/* ------------------------------------------------------------------------ */

const MESSAGES: Record<string, { ton: 'ok' | 'alerte'; texte: string }> = {
  cree: { ton: 'ok', texte: 'Professionnel ajouté.' },
  modifie: { ton: 'ok', texte: 'Fiche mise à jour.' },
  bascule: { ton: 'ok', texte: 'Statut mis à jour.' },
  supprime: { ton: 'ok', texte: 'Fiche supprimée.' },
  'suppression-refusee': {
    ton: 'alerte',
    texte:
      'Suppression refusée : ce professionnel figure dans l’historique d’au moins une demande. Désactivez sa fiche pour le retirer du routage sans effacer la trace des envois.'
  },
  'nom-manquant': { ton: 'alerte', texte: 'La raison sociale est obligatoire.' },
  'email-invalide': { ton: 'alerte', texte: 'L’adresse e-mail saisie n’est pas valide.' },
  'email-en-double': { ton: 'alerte', texte: 'Cette adresse e-mail est déjà utilisée par une autre fiche.' },
  erreur: { ton: 'alerte', texte: 'Enregistrement impossible.' }
};

function banniere(fait: string): string {
  const message = MESSAGES[fait];
  if (!message) return '';
  return `<div class="carte ${message.ton === 'ok' ? 'ok' : 'alerte'}">${echapper(message.texte)}</div>`;
}

function cases(nom: string, liste: Array<{ slug: string; nom: string }>, selection: string[]): string {
  return `<div style="display:flex;flex-wrap:wrap;gap:.4rem .9rem;max-height:190px;overflow:auto;border:1.5px solid #d9c8ac;border-radius:8px;padding:.6rem;background:#fff">
    ${liste
      .map(
        (item) =>
          `<label style="font-weight:400;color:#1b2a22;display:flex;gap:.35rem;align-items:center;margin:0;font-size:.88rem">
        <input type="checkbox" name="${nom}" value="${echapper(item.slug)}" style="min-height:auto"${
            selection.includes(item.slug) ? ' checked' : ''
          }> ${echapper(item.nom)}</label>`
      )
      .join('')}
  </div>`;
}

function formulaire(pro: Professionnel | null): string {
  const metiersChoisis = listeSlugs(pro?.metiers);
  const communesChoisies = listeSlugs(pro?.communes);
  const communesConnues = communesChoisies.filter((c) => NOM_VILLE.has(c));
  const communesLibres = communesChoisies.filter((c) => !NOM_VILLE.has(c));
  const toutLeDepartement = pro ? communesChoisies.length === 0 : true;

  const val = (v: unknown) => echapper(v ?? '');
  const cocheSi = (v: number | undefined, defaut: boolean) => ((pro ? v === 1 : defaut) ? ' checked' : '');

  return `<div class="carte">
  <h2>${pro ? `Modifier la fiche n° ${pro.id}` : 'Ajouter un professionnel'}</h2>
  <p class="muted" style="margin:-.4rem 0 1rem">
    Parmi les professionnels compatibles avec une demande, celui de plus forte priorité est
    recommandé en premier. Vous restez libre d’en choisir un autre au moment de transmettre.
  </p>
  <form method="post">
    <input type="hidden" name="action" value="enregistrer">
    ${pro ? `<input type="hidden" name="id" value="${pro.id}">` : ''}

    <div class="grille" style="margin-bottom:.9rem">
      <div><label for="raison_sociale">Entreprise *</label>
        <input id="raison_sociale" name="raison_sociale" style="width:100%" required value="${val(pro?.raison_sociale)}"></div>
      <div><label for="contact_nom">Contact</label>
        <input id="contact_nom" name="contact_nom" style="width:100%" value="${val(pro?.contact_nom)}"></div>
      <div><label for="email">E-mail *</label>
        <input id="email" name="email" type="email" style="width:100%" required value="${val(pro?.email)}"></div>
      <div><label for="telephone">Téléphone</label>
        <input id="telephone" name="telephone" style="width:100%" value="${val(pro?.telephone)}"></div>
      <div><label for="siret">SIRET</label>
        <input id="siret" name="siret" style="width:100%" value="${val(pro?.siret)}"></div>
      <div><label for="priorite">Priorité</label>
        <input id="priorite" name="priorite" type="number" min="0" max="100" style="width:100%" value="${
          pro ? pro.priorite : 0
        }">
        <span class="muted" style="display:block;margin-top:.25rem;font-size:.8rem">
          Ordre de passage, pas une note. À égalité, c’est le moins récemment servi qui passe.
          Laissez 0 partout pour une rotation équitable.
        </span></div>
    </div>

    <div style="margin-bottom:.9rem">
      <label>Métiers couverts</label>
      ${cases('metiers', METIERS, metiersChoisis)}
    </div>

    <div style="margin-bottom:.9rem">
      <label>Zones couvertes</label>
      <label style="font-weight:400;color:#1b2a22;display:flex;gap:.4rem;align-items:center;margin:0 0 .5rem">
        <input type="checkbox" name="tout_departement" style="min-height:auto"${toutLeDepartement ? ' checked' : ''}>
        Tout le département de l’Yonne (ignore les communes cochées)
      </label>
      ${cases('communes', VILLES, communesConnues)}
      <input name="communes_libres" style="width:100%;margin-top:.5rem" placeholder="Autres communes, séparées par des virgules" value="${val(
        communesLibres.join(', ')
      )}">
    </div>

    <div class="grille" style="margin-bottom:.9rem">
      <label style="font-weight:400;color:#1b2a22;display:flex;gap:.4rem;align-items:center">
        <input type="checkbox" name="actif" style="min-height:auto"${cocheSi(pro?.actif, true)}> Actif (fait partie du réseau)</label>
      <label style="font-weight:400;color:#1b2a22;display:flex;gap:.4rem;align-items:center">
        <input type="checkbox" name="disponible" style="min-height:auto"${cocheSi(pro?.disponible, true)}> Disponible en ce moment</label>
      <label style="font-weight:400;color:#1b2a22;display:flex;gap:.4rem;align-items:center">
        <input type="checkbox" name="email_verifie" style="min-height:auto"${cocheSi(pro?.email_verifie, false)}> Adresse e-mail vérifiée</label>
    </div>

    <div style="margin-bottom:.9rem">
      <label for="note_interne">Note interne</label>
      <input id="note_interne" name="note_interne" style="width:100%" value="${val(pro?.note_interne)}">
    </div>

    <div class="actions">
      <button type="submit">${pro ? 'Enregistrer les modifications' : 'Ajouter le professionnel'}</button>
      ${pro ? '<a class="btn mineur" href="/admin/pros">Annuler</a>' : ''}
      <span class="muted">Sans les trois cases actif + disponible + adresse vérifiée, aucune demande ne lui sera proposée.</span>
    </div>
  </form>
</div>`;
}

function libellesMetiers(csv: string): string {
  const slugs = listeSlugs(csv);
  if (slugs.length === 0) return '<span class="ko">aucun</span>';
  return slugs.map((s) => echapper(NOM_METIER.get(s) || s)).join(', ');
}

function libellesCommunes(csv: string): string {
  const slugs = listeSlugs(csv);
  if (slugs.length === 0) return 'tout le département';
  return slugs.map((s) => echapper(NOM_VILLE.get(s) || s)).join(', ');
}

function bouton(pro: Professionnel, colonne: 'actif' | 'disponible' | 'email_verifie', vrai: string, faux: string): string {
  const valeur = pro[colonne];
  return `<form method="post" style="display:inline">
    <input type="hidden" name="action" value="basculer">
    <input type="hidden" name="id" value="${pro.id}">
    <input type="hidden" name="colonne" value="${colonne}">
    <button type="submit" class="danger" style="border-color:${valeur === 1 ? '#bcd8c4' : '#e4b9b8'};color:${
      valeur === 1 ? '#123d2c' : '#97302f'
    }">${valeur === 1 ? echapper(vrai) : echapper(faux)}</button>
  </form>`;
}

function tableau(pros: Professionnel[]): string {
  if (pros.length === 0) {
    return '<div class="tablewrap"><p class="vide">Aucun professionnel référencé. Ajoutez la première fiche ci-dessus.</p></div>';
  }

  const lignes = pros
    .map(
      (p) => `<tr>
  <td><b>${echapper(p.raison_sociale)}</b>${p.contact_nom ? `<br><span class="muted">${echapper(p.contact_nom)}</span>` : ''}${
        p.siret ? `<br><span class="muted">SIRET ${echapper(p.siret)}</span>` : ''
      }</td>
  <td>${echapper(p.email)}<br>${
        p.email_verifie === 1
          ? '<span class="tag t-envoye">vérifiée</span>'
          : '<span class="tag t-refuse">non vérifiée</span>'
      }${p.telephone ? `<br><span class="muted">${echapper(p.telephone)}</span>` : ''}</td>
  <td>${libellesMetiers(p.metiers)}</td>
  <td>${libellesCommunes(p.communes)}</td>
  <td>${p.priorite}</td>
  <td>${
    p.dernier_lead_at
      ? `${echapper(dateCourte(p.dernier_lead_at))}${
          p.dernier_lead_id ? `<br><a href="/admin/lead/${p.dernier_lead_id}">demande n° ${p.dernier_lead_id}</a>` : ''
        }`
      : '<span class="muted">aucun</span>'
  }</td>
  <td>
    ${bouton(p, 'actif', 'actif', 'inactif')}
    ${bouton(p, 'disponible', 'disponible', 'indisponible')}
    ${bouton(p, 'email_verifie', 'adresse vérifiée', 'adresse à vérifier')}
  </td>
  <td>
    <a class="btn mineur" style="min-height:32px;padding:.25rem .6rem" href="/admin/pros?modifier=${p.id}">Modifier</a>
    <form method="post" style="display:inline" onsubmit="return confirm('Supprimer cette fiche ?')">
      <input type="hidden" name="action" value="supprimer"><input type="hidden" name="id" value="${p.id}">
      <button type="submit" class="danger">Supprimer</button>
    </form>
  </td>
</tr>`
    )
    .join('');

  return `<div class="tablewrap"><table>
<thead><tr><th>Entreprise / contact</th><th>E-mail</th><th>Métiers</th><th>Zones couvertes</th><th>Priorité</th><th>Dernier lead reçu</th><th>Statuts</th><th></th></tr></thead>
<tbody>${lignes}</tbody></table></div>`;
}
