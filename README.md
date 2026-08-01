# Travaux & Pros de l'Yonne

Portail statique Astro de mise en relation locale entre particuliers et professionnels de l'Yonne (89).

## Stack

- Astro (site statique)
- Données pilotées par JSON (`src/data/metiers.json`, `src/data/villes.json`, `src/data/parcours.json`)
- Formulaire enregistré dans Cloudflare D1, notification par e-mail via un Worker Cloudflare
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

## Routage d'une demande vers un professionnel

Une demande est transmise à **un seul** professionnel à la fois.

1. À la réception, `/api/lead` enregistre la demande en D1, puis le Worker de
   notification prévient les deux adresses d'administration. Le message contient
   le lien direct vers `/admin/lead/<id>`, protégé par Cloudflare Access.
2. Dans `/admin/lead/<id>` : professionnel recommandé, choix d'un autre
   professionnel compatible, brouillon d'e-mail modifiable, bouton
   « Envoyer au professionnel ».
3. En cas de refus ou d'indisponibilité, la demande est libérée et le
   professionnel suivant est proposé. Tout est conservé dans `attributions`.

### Ce qui rend un deuxième envoi impossible

L'exclusivité ne repose pas sur l'interface. La colonne `leads.pro_actif_id`
n'est prise que par une mise à jour conditionnelle :

```sql
UPDATE leads SET pro_actif_id = ? WHERE id = ? AND pro_actif_id IS NULL
```

L'e-mail n'est expédié qu'après un `changes === 1`. Deux clics, deux onglets ou
deux requêtes simultanées : une seule aboutit. Si l'envoi échoue, la demande est
libérée et l'échec tracé — elle n'est jamais bloquée par un incident technique.

### Ce que reçoit le professionnel

Type de demande, commune, description, nom et coordonnées du demandeur, date de
la demande, identité « Les Pros de l'Yonne », et `Reply-To` sur l'adresse validée
du demandeur.

Jamais : lien vers `/admin`, jeton Cloudflare Access, mention d'un autre
professionnel, donnée technique ou interne. Le brouillon étant modifiable, la
règle est vérifiée sur le texte réellement envoyé — dans `/admin` puis une
seconde fois dans le Worker (`fuites()` dans `functions/_lib/modele-email-pro.ts`).
Un message non conforme n'est pas expédié et la demande reste attribuable.

### Sélection du professionnel recommandé

Sont éligibles les fiches **actives**, **disponibles** et à **adresse vérifiée**,
dont les métiers couvrent celui de la demande et dont les zones couvrent la
commune ou la ville. Une liste de communes vide signifie « tout le département ».
Départage : priorité décroissante, puis le moins récemment servi, puis
l'identifiant. Un professionnel déjà sollicité pour cette demande n'est plus
proposé ; un simple échec d'envoi, lui, autorise une nouvelle tentative.

### Gestion des professionnels

`/admin/pros` : entreprise et contact, adresse e-mail vérifiée, métiers, zones
couvertes, disponible/indisponible, actif/inactif, dernier lead reçu.

L'adresse d'un professionnel doit être **vérifiée dans Cloudflare Email Routing**
pour qu'un Worker puisse lui écrire. La case « adresse e-mail vérifiée » doit
refléter cette validation : sans elle, l'envoi échouerait de toute façon.

## Environnements et tests

| | Production | Prévisualisation |
|---|---|---|
| Base D1 | `lesprosdelyonne-leads` | `lesprosdelyonne-leads-preview` |
| Worker de notification | `notification-lead-lesprosdelyonne` | `notification-lead-preview-lesprosdelyonne` |
| Destinataires professionnels | adresses vérifiées | liste blanche `DESTINATAIRES_PRO_AUTORISES` |

Le Worker de prévisualisation existe pour qu'un test ne puisse pas atteindre un
vrai professionnel : sa variable `DESTINATAIRES_PRO_AUTORISES` limite les
destinataires à des adresses contrôlées, et Cloudflare refuse de son côté toute
destination hors de `allowed_destination_addresses`.

```bash
npm run verifier   # typage Cloudflare + tests unitaires
npm test           # tests des règles de routage et du contenu de l'e-mail

# Déploiement de la prévisualisation (dans cet ordre)
npx wrangler deploy --config workers/notification-lead/wrangler.preview.jsonc
npx wrangler pages deploy --branch routage-leads

# Migrations, base de prévisualisation
npx wrangler d1 execute lesprosdelyonne-leads-preview --remote --file migrations/0005_professionnels_disponibilite.sql
```

Avant une mise en production, il faut redéployer le Worker de notification de
production (il porte désormais la route `/envoyer-pro`) et appliquer les
migrations `0004` et `0005` sur `lesprosdelyonne-leads`.

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
2. Verifier que le metier apparait bien dans l'espace d'administration apres un envoi de test.
3. Relancer `npm run build` puis pousser sur `main`.

Quand `actif: false`, le formulaire est remplace par une capture d'email d'intention envoyee avec `type: "intention"`.

### Ajouter une ville

1. Ajouter un objet dans `src/data/villes.json` avec :
	- `slug`, `nom`, `codePostal`, `population`
	- `quartiersOuCommunesProches` (liste)
	- `phraseLocale`
2. Relancer `npm run build`.

Les pages métier et métier x ville sont générées automatiquement.

## Où changer les destinataires de notification et TEL_CONTACT

Modifier le fichier unique de configuration : `src/config/site.ts`

- Destinataires des notifications : variable `DESTINATAIRE` dans `workers/notification-lead/wrangler.jsonc`
- `telContact` et `telContactHref` : numéro affiché et lien cliquable

## Exemple de payload JSON envoyé à /api/lead

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
	"page_source": "https://lesprosdelyonne.com/plombier-chauffagiste/joigny/",
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
