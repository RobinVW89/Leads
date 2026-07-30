/**
 * Export CSV des demandes, avec les mêmes filtres que la page /admin.
 * Protégé par la même politique Cloudflare Access (chemin /admin).
 */

import { estAdmin, identifierViaAccess } from '../_lib/access';

type Env = {
  DB: D1Database;
  /** Liste blanche des identités autorisées, séparées par des virgules. */
  ADMIN_EMAILS?: string;
};

const COLONNES = [
  'id',
  'created_at',
  'submitted_at',
  'type',
  'statut',
  'transmis_webhook',
  'metier',
  'metier_nom',
  'ville',
  'prenom',
  'nom',
  'telephone',
  'email',
  'commune',
  'code_postal',
  'description',
  'delai_souhaite',
  'budget',
  'qualification',
  'page_source',
  'note_interne'
] as const;

function cellule(valeur: unknown): string {
  const texte = String(valeur ?? '');
  // Neutralise les formules : un CSV ouvert dans Excel exécute =, +, -, @.
  const sur = /^[=+\-@\t\r]/.test(texte) ? `'${texte}` : texte;
  return `"${sur.replace(/"/g, '""')}"`;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // Même garde que /admin : JWT Access vérifié, puis liste blanche.
  const estLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (!estLocal) {
    const acces = await identifierViaAccess(request);
    if (!acces.ok || !estAdmin(acces.email, env.ADMIN_EMAILS)) {
      return new Response('Accès refusé.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }
  }

  const conditions: string[] = [];
  const valeurs: unknown[] = [];

  const fMetier = (url.searchParams.get('metier') || '').slice(0, 80);
  const fVille = (url.searchParams.get('ville') || '').slice(0, 120);
  const fStatut = (url.searchParams.get('statut') || '').slice(0, 20);
  const fRecherche = (url.searchParams.get('q') || '').slice(0, 120);

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
  if (fRecherche) {
    conditions.push('(nom LIKE ? OR prenom LIKE ? OR email LIKE ? OR telephone LIKE ? OR commune LIKE ?)');
    const motif = `%${fRecherche}%`;
    valeurs.push(motif, motif, motif, motif, motif);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const resultat = await env.DB.prepare(`SELECT * FROM leads ${where} ORDER BY created_at DESC LIMIT 10000`)
    .bind(...valeurs)
    .all<Record<string, unknown>>();

  const lignes = [COLONNES.join(';')];
  for (const ligne of resultat.results || []) {
    lignes.push(COLONNES.map((colonne) => cellule(ligne[colonne])).join(';'));
  }

  // BOM UTF-8 : sans lui, Excel massacre les accents.
  const corps = '﻿' + lignes.join('\r\n');
  const horodatage = new Date().toISOString().slice(0, 10);

  return new Response(corps, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="demandes-lesprosdelyonne-${horodatage}.csv"`,
      'Cache-Control': 'no-store'
    }
  });
};
