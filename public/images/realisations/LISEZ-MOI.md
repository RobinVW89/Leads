# Photos de réalisations

Un dossier par métier, nommé d'après le slug utilisé dans
`src/data/metiers.json` (`couvreur`, `plombier-chauffagiste`, …).

## Ajouter des photos

1. Déposer les fichiers dans le dossier du métier concerné.
2. Relancer `npm run build` puis déployer.

Les **trois premiers fichiers par ordre alphabétique** sont affichés, sur la
page du métier comme sur ses pages métier × ville. Nommez-les `1-…`, `2-…`,
`3-…` pour maîtriser l'ordre.

Formats acceptés : `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`, `.svg`.

Tant qu'un dossier reste vide, les visuels provisoires
(`placeholder-1.svg` … `placeholder-3.svg`) sont affichés à la place, avec la
mention « visuels provisoires ». Il n'y a donc rien à désactiver : le
remplacement se fait dès qu'un fichier est présent.

## Points de vigilance

- **Droits** : n'utilisez que des photos dont vous avez l'autorisation de
  diffusion, et demandez l'accord écrit du professionnel comme du client pour
  un chantier identifiable.
- **Poids** : ces images sont servies telles quelles, sans redimensionnement.
  Visez moins de 300 Ko par fichier, en 1200 px de large environ.
- **Texte alternatif** : il est généré à partir du métier et de la ville, le
  nom du fichier n'apparaît jamais à l'écran.
