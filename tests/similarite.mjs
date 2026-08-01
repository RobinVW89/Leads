/**
 * Mesure de la similarité du contenu éditorial entre pages métier × ville.
 *
 * Objectif : savoir si deux pages disent réellement des choses différentes, ou
 * si elles ne diffèrent que par un nom de ville. Un score élevé entre deux
 * pages est le symptôme classique du contenu dupliqué à grande échelle.
 *
 * MÉTHODE
 *
 * 1. Extraction. On ne garde que l'intérieur de <main>, dont on retire ce qui
 *    est identique par construction sur toutes les pages et n'a donc rien à
 *    voir avec la qualité rédactionnelle : <nav>, <header>, <footer>, le
 *    formulaire de demande, les scripts, les styles et le bloc des services
 *    liés. Le texte restant est celui que lit un visiteur : titre, chapô,
 *    paragraphes, FAQ.
 * 2. Normalisation. Minuscules, accents conservés, ponctuation supprimée,
 *    espaces réduits. Le nom de la ville est volontairement CONSERVÉ : le
 *    retirer flatterait artificiellement le résultat, alors que c'est
 *    précisément le remplacement de nom qu'on cherche à débusquer.
 * 3. Comparaison. Similarité de Jaccard sur les 5-grammes de mots, méthode
 *    usuelle de détection de quasi-doublons. Deux textes qui ne diffèrent que
 *    par quelques mots partagent presque tous leurs 5-grammes et ressortent
 *    au-dessus de 0,80 ; deux textes réellement distincts descendent sous 0,15.
 *
 * On rapporte trois chiffres, du plus parlant au plus général :
 * — le couple même métier / deux villes, la duplication la plus pénalisante ;
 * — la moyenne de toutes les paires ;
 * — le maximum observé, avec les deux pages en cause.
 *
 *   node tests/similarite.mjs <dossier-de-pages> [autre-dossier-a-comparer]
 */

import { readdirSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

const TAILLE_GRAMME = 5;

/** Retire un élément et son contenu, balises imbriquées de même nom comprises. */
function retirerBloc(html, balise) {
  const ouvrante = new RegExp(`<${balise}\\b`, 'i');
  let sortie = html;

  for (;;) {
    const debut = sortie.search(ouvrante);
    if (debut === -1) return sortie;

    let profondeur = 0;
    let position = debut;
    let fin = -1;
    const jetons = new RegExp(`<${balise}\\b|</${balise}>`, 'gi');
    jetons.lastIndex = debut;

    let jeton;
    while ((jeton = jetons.exec(sortie))) {
      profondeur += jeton[0][1] === '/' ? -1 : 1;
      position = jeton.index + jeton[0].length;
      if (profondeur === 0) {
        fin = position;
        break;
      }
    }

    if (fin === -1) return sortie.slice(0, debut);
    sortie = sortie.slice(0, debut) + ' ' + sortie.slice(fin);
  }
}

/** Contenu éditorial d'une page, débarrassé de tout ce qui est structurel. */
export function contenuPrincipal(html) {
  const bloc = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  let texte = bloc ? bloc[1] : html;

  for (const balise of ['script', 'style', 'nav', 'header', 'footer', 'form']) {
    texte = retirerBloc(texte, balise);
  }
  // Les services liés sont une liste calculée, identique pour un même métier.
  texte = texte.replace(/<section[^>]*class="[^"]*related-services[^"]*"[\s\S]*?<\/section>/gi, ' ');

  return texte
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function grammes(texte) {
  const mots = texte.split(' ').filter(Boolean);
  const jeu = new Set();
  for (let i = 0; i + TAILLE_GRAMME <= mots.length; i += 1) {
    jeu.add(mots.slice(i, i + TAILLE_GRAMME).join(' '));
  }
  return jeu;
}

export function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let commun = 0;
  for (const g of a) if (b.has(g)) commun += 1;
  return commun / (a.size + b.size - commun);
}

function charger(dossier) {
  return readdirSync(dossier)
    .filter((f) => f.endsWith('.html'))
    .map((f) => {
      const [metier, ville] = basename(f, '.html').split('__');
      const texte = contenuPrincipal(readFileSync(`${dossier}/${f}`, 'utf8'));
      return { metier, ville, mots: texte.split(' ').filter(Boolean).length, grammes: grammes(texte) };
    });
}

function analyser(dossier) {
  const pages = charger(dossier);
  const paires = [];

  for (let i = 0; i < pages.length; i += 1) {
    for (let j = i + 1; j < pages.length; j += 1) {
      paires.push({ a: pages[i], b: pages[j], score: jaccard(pages[i].grammes, pages[j].grammes) });
    }
  }

  const memeMetier = paires.filter((p) => p.a.metier === p.b.metier);
  const moyenne = (liste) => (liste.length ? liste.reduce((s, p) => s + p.score, 0) / liste.length : 0);
  const pire = paires.reduce((max, p) => (p.score > max.score ? p : max), paires[0]);

  return {
    pages: pages.length,
    motsMoyens: Math.round(pages.reduce((s, p) => s + p.mots, 0) / pages.length),
    memeMetierDeuxVilles: moyenne(memeMetier),
    toutesPaires: moyenne(paires),
    maximum: pire.score,
    pireCouple: `${pire.a.metier}/${pire.a.ville} ↔ ${pire.b.metier}/${pire.b.ville}`
  };
}

function pourcent(v) {
  return (v * 100).toFixed(1).padStart(5) + ' %';
}

function afficher(titre, r) {
  console.log(`\n${titre}`);
  console.log(`  pages comparées                    ${String(r.pages).padStart(7)}`);
  console.log(`  mots de contenu par page (moyenne) ${String(r.motsMoyens).padStart(7)}`);
  console.log(`  même métier, Sens ↔ Joigny         ${pourcent(r.memeMetierDeuxVilles)}`);
  console.log(`  moyenne de toutes les paires       ${pourcent(r.toutesPaires)}`);
  console.log(`  maximum observé                    ${pourcent(r.maximum)}`);
  console.log(`    → ${r.pireCouple}`);
}

// Le fichier expose aussi ses fonctions à d'autres scripts : la partie ligne
// de commande ne s'exécute que s'il est lancé directement.
const lanceDirectement = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
const [dossierA, dossierB] = lanceDirectement ? process.argv.slice(2) : [];
if (lanceDirectement && !dossierA) {
  console.error('usage : node tests/similarite.mjs <dossier> [dossier-a-comparer]');
  process.exit(1);
}

if (dossierA) {
const avant = analyser(dossierA);
afficher(dossierB ? 'AVANT' : basename(dossierA), avant);

if (dossierB) {
  const apres = analyser(dossierB);
  afficher('APRÈS', apres);

  const ecart = (nom, a, b) => {
    const delta = b - a;
    console.log(`  ${nom.padEnd(34)} ${pourcent(a)} → ${pourcent(b)}   (${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)} pt)`);
  };
  console.log('\nÉVOLUTION');
  ecart('même métier, Sens ↔ Joigny', avant.memeMetierDeuxVilles, apres.memeMetierDeuxVilles);
  ecart('moyenne de toutes les paires', avant.toutesPaires, apres.toutesPaires);
  ecart('maximum observé', avant.maximum, apres.maximum);
}
}
