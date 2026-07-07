# Travaux & Pros de l'Yonne

Portail statique Astro de mise en relation locale entre particuliers et professionnels de l'Yonne (89).

## Stack

- Astro (site statique)
- Données pilotées par JSON (`src/data/metiers.json`, `src/data/villes.json`, `src/data/parcours.json`)
- Formulaire JSON envoyé vers webhook n8n
- Compatible Cloudflare Pages

## Installation et build

```bash
npm install
npm run dev
npm run build
```

Le build de production est généré dans `dist/`.

## Déploiement GitHub -> Cloudflare Pages

1. Pousser le dépôt sur GitHub (branche `main`).
2. Dans Cloudflare Pages, créer un nouveau projet et connecter le repo.
3. Paramètres de build :
	- Build command : `npm run build`
	- Build output directory : `dist`
4. Valider : chaque push sur `main` déclenche un déploiement automatique.

## Où modifier les données

- Métiers : `src/data/metiers.json`
- Villes : `src/data/villes.json`
- Parcours : `src/data/parcours.json`

### Ajouter un métier

1. Ajouter un objet dans `src/data/metiers.json` avec :
	- `slug`, `nom`, `nomPluriel`
	- `description`
	- `prestations` (liste)
	- `fourchettePrix`
	- `questionsFrequentes` (liste d'objets `question` + `reponse`)
	- `urgence` (`true`/`false`)
	- `saison` (ex: `toute-annee`)
	- `actif` (`true`/`false`)
2. Relancer `npm run build`.

### Activer un métier "bientot"

1. Mettre `actif: true` dans l'objet du metier dans `src/data/metiers.json`.
2. Verifier dans votre workflow n8n/Formspree la ligne de routage du slug metier (champ `metier`) pour que les leads de ce metier soient bien traites.
3. Relancer `npm run build` puis pousser sur `main`.

Quand `actif: false`, le formulaire est remplace par une capture d'email d'intention envoyee avec `type: "intention"`.

### Ajouter une ville

1. Ajouter un objet dans `src/data/villes.json` avec :
	- `slug`, `nom`, `codePostal`, `population`
	- `quartiersOuCommunesProches` (liste)
	- `phraseLocale`
2. Relancer `npm run build`.

Les pages métier et métier x ville sont générées automatiquement.

## Où changer N8N_WEBHOOK_URL et TEL_CONTACT

Modifier le fichier unique de configuration : `src/config/site.ts`

- `n8nWebhookUrl` : URL du webhook n8n
- `telContact` et `telContactHref` : numéro affiché et lien cliquable

## Exemple de payload JSON envoyé au webhook

```json
{
  "prenom": "Camille",
  "telephone": "06 12 34 56 78",
  "email": "camille@example.fr",
  "commune": "Joigny",
  "description": "Fuite sous évier et besoin de remplacement du siphon.",
  "delaiSouhaite": "des-que-possible",
  "metier": "plombier-chauffagiste",
  "ville": "Joigny",
  "page_source": "https://portail-artisans-yonne.fr/plombier-chauffagiste/joigny/",
  "submittedAt": "2026-07-07T13:45:00.000Z"
}
```

## Pages disponibles

- `/`
- `/:metier/`
- `/:metier/:ville/`
- `/comment-ca-marche`
- `/mentions-legales`
- `/politique-confidentialite`
- `/sitemap.xml`
- `/robots.txt`
