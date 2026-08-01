// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://lesprosdelyonne.com',

	// Le serveur de développement doit accepter les noms d'hôte utilisés par les
	// tests navigateur. Ceux-ci résolvent le domaine de production, et un domaine
	// de prévisualisation, vers la machine locale : c'est ce qui permet de
	// vérifier le garde-fou de mesure d'audience sans dérogation dans le code.
	server: {
		allowedHosts: ['lesprosdelyonne.com', 'www.lesprosdelyonne.com', 'preview.pages.test']
	}
});
