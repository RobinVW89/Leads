/**
 * Tests des règles de routage et du contenu envoyé au professionnel.
 *
 * Ces deux modules sont purs : ils décident et rédigent, sans toucher ni à la
 * base ni au réseau. Ils sont donc vérifiables ici, hors déploiement — ce qui
 * évite d'avoir à envoyer un e-mail pour contrôler qu'une règle tient.
 *
 * Exécution : npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  construireBrouillon,
  construireCoordonnees,
  fuites,
  masquerEmail,
  masquerNom,
  masquerTelephone
} from '../functions/_lib/modele-email-pro.ts';
import { verifierOrigine } from '../functions/_lib/origine.ts';
import { jetonPlausible, nouveauJeton, VALIDITE_HEURES } from '../functions/_lib/reponse-pro.ts';
import {
  comparerPros,
  enSlug,
  incompatibilite,
  selectionner,
  type Attribution,
  type Professionnel
} from '../functions/_lib/routage.ts';

function pro(partiel: Partial<Professionnel> & { id: number }): Professionnel {
  return {
    created_at: '2026-07-01 10:00:00',
    raison_sociale: `Entreprise ${partiel.id}`,
    contact_nom: null,
    email: `pro${partiel.id}@example.fr`,
    telephone: null,
    siret: null,
    metiers: 'couvreur',
    communes: '',
    priorite: 0,
    actif: 1,
    disponible: 1,
    email_verifie: 1,
    dernier_lead_at: null,
    dernier_lead_id: null,
    note_interne: null,
    ...partiel
  };
}

function attribution(partiel: Partial<Attribution> & { professionnel_id: number; statut: string }): Attribution {
  return {
    id: 1,
    created_at: '2026-07-02 10:00:00',
    lead_id: 1,
    motif: null,
    email_envoye: 0,
    ...partiel
  };
}

const DEMANDE = { metier: 'couvreur', ville: 'Saint-Georges-sur-Baulche', commune: 'Monéteau' };

describe('normalisation', () => {
  it('ramène accents, casse et séparateurs à une forme unique', () => {
    assert.equal(enSlug('Saint-Georges-sur-Baulche'), 'saint-georges-sur-baulche');
    assert.equal(enSlug('  SAINT georges  SUR baulche '), 'saint-georges-sur-baulche');
    assert.equal(enSlug('Monéteau'), 'moneteau');
    assert.equal(enSlug(null), '');
  });
});

describe('compatibilité métier et zone', () => {
  it('accepte un professionnel du bon métier couvrant tout le département', () => {
    assert.equal(incompatibilite(pro({ id: 1, metiers: 'couvreur,isolation', communes: '' }), DEMANDE), null);
  });

  it('refuse un métier non déclaré', () => {
    assert.equal(incompatibilite(pro({ id: 1, metiers: 'electricien' }), DEMANDE), 'metier');
  });

  it('refuse une fiche sans aucun métier plutôt que de tout lui envoyer', () => {
    assert.equal(incompatibilite(pro({ id: 1, metiers: '' }), DEMANDE), 'metier');
  });

  it('accepte quand la zone couvre la commune saisie et non la ville de la page', () => {
    assert.equal(incompatibilite(pro({ id: 1, communes: 'moneteau' }), DEMANDE), null);
  });

  it('accepte quand la zone couvre la ville de la page et non la commune saisie', () => {
    assert.equal(incompatibilite(pro({ id: 1, communes: 'saint-georges-sur-baulche' }), DEMANDE), null);
  });

  it('refuse une commune hors zone', () => {
    assert.equal(incompatibilite(pro({ id: 1, communes: 'sens,joigny' }), DEMANDE), 'zone');
  });
});

describe('ordre de recommandation', () => {
  it('fait passer la priorité la plus élevée devant', () => {
    const liste = [pro({ id: 1, priorite: 0 }), pro({ id: 2, priorite: 5 })].sort(comparerPros);
    assert.deepEqual(liste.map((p) => p.id), [2, 1]);
  });

  it('à priorité égale, sert le professionnel le moins récemment servi', () => {
    const liste = [
      pro({ id: 1, dernier_lead_at: '2026-07-30 09:00:00' }),
      pro({ id: 2, dernier_lead_at: '2026-06-01 09:00:00' }),
      pro({ id: 3, dernier_lead_at: null })
    ].sort(comparerPros);
    assert.deepEqual(liste.map((p) => p.id), [3, 2, 1]);
  });
});

describe('sélection', () => {
  it("écarte l'inactif, l'indisponible et l'adresse non vérifiée en donnant la raison", () => {
    const tous = [
      pro({ id: 1, actif: 0 }),
      pro({ id: 2, disponible: 0 }),
      pro({ id: 3, email_verifie: 0 }),
      pro({ id: 4 })
    ];
    const { recommande, candidats, ecartes } = selectionner(tous, DEMANDE, []);

    assert.equal(recommande?.id, 4);
    assert.equal(candidats.length, 1);
    assert.deepEqual(
      ecartes.map((e) => [e.pro.id, e.motif]),
      [
        [1, 'fiche inactive'],
        [2, 'déclaré indisponible'],
        [3, 'adresse e-mail non vérifiée']
      ]
    );
  });

  it('ne propose plus un professionnel qui a déjà reçu, refusé ou décliné cette demande', () => {
    const tous = [pro({ id: 1 }), pro({ id: 2 }), pro({ id: 3 }), pro({ id: 4 })];
    const historique = [
      attribution({ professionnel_id: 1, statut: 'envoye', email_envoye: 1 }),
      attribution({ professionnel_id: 2, statut: 'refuse' }),
      attribution({ professionnel_id: 3, statut: 'indisponible' })
    ];

    const { recommande, candidats } = selectionner(tous, DEMANDE, historique);
    assert.equal(recommande?.id, 4);
    assert.deepEqual(candidats.map((p) => p.id), [4]);
  });

  it('reproposera un professionnel dont seul l’envoi a échoué', () => {
    const historique = [attribution({ professionnel_id: 1, statut: 'echec', motif: 'service injoignable' })];
    const { recommande } = selectionner([pro({ id: 1 })], DEMANDE, historique);
    assert.equal(recommande?.id, 1);
  });

  it('ne recommande personne quand aucune fiche ne convient', () => {
    const { recommande, candidats } = selectionner([pro({ id: 1, metiers: 'electricien' })], DEMANDE, []);
    assert.equal(recommande, null);
    assert.equal(candidats.length, 0);
  });
});

const LEAD = {
  id: 42,
  metier: 'couvreur',
  metier_nom: 'Couvreur',
  ville: 'Auxerre',
  commune: 'Monéteau',
  code_postal: '89470',
  description: 'Tuiles arrachées après la tempête, environ 6 m² à reprendre.',
  prenom: 'Camille',
  nom: 'Durand',
  telephone: '06 12 34 56 78',
  email: 'camille.durand@example.fr',
  delai_souhaite: 'dès que possible',
  budget: '',
  qualification: '[{"question":"Type de toiture","reponse":"tuiles"}]',
  created_at: '2026-08-01 09:15:00',
  submitted_at: '2026-08-01T09:15:00.000Z'
};

describe('masquage des coordonnées', () => {
  it('réduit le nom au prénom et à une initiale', () => {
    assert.equal(masquerNom('Camille', 'Durand'), 'Camille D.');
    assert.equal(masquerNom('Camille', ''), 'Camille');
    assert.equal(masquerNom('', ''), 'Demandeur');
  });

  it('ne laisse que les deux premiers et deux derniers chiffres du téléphone', () => {
    assert.equal(masquerTelephone('06 12 34 56 78'), '06 •• •• •• 78');
    assert.equal(masquerTelephone('+33 6 12 34 56 78'), '33 •• •• •• 78');
    assert.equal(masquerTelephone('12'), '');
  });

  it("ne laisse qu'une initiale et l'extension de l'adresse", () => {
    assert.equal(masquerEmail('camille.durand@example.fr'), 'c•••@•••.fr');
    assert.equal(masquerEmail('pas-une-adresse'), '');
  });
});

describe('offre envoyée au professionnel', () => {
  const { sujet, corps } = construireBrouillon(LEAD);

  it('décrit le chantier de façon exploitable', () => {
    assert.match(corps, /Type de demande : Couvreur/);
    assert.match(corps, /Commune : Monéteau 89470/);
    assert.match(corps, /Tuiles arrachées après la tempête/);
    assert.match(corps, /Date de la demande : samedi 1 août 2026/);
    assert.match(corps, /Les Pros de l'Yonne/);
    assert.match(sujet, /^Nouvelle demande — Couvreur à Monéteau 89470$/);
  });

  it('annonce que l’acceptation vaut achat, sans jamais citer de montant', () => {
    assert.match(corps, /vaut confirmation de son achat/);
    assert.doesNotMatch(corps, /\d+\s*(€|euros?|EUR)/i);
    assert.doesNotMatch(corps, /(prix|tarif|montant|facture)/i);
  });

  it('ne livre aucune coordonnée en clair', () => {
    assert.doesNotMatch(corps, /Durand/);
    assert.doesNotMatch(corps, /06 12 34 56 78/);
    assert.doesNotMatch(corps, /camille\.durand@example\.fr/);
    assert.match(corps, /Camille D\./);
    assert.match(corps, /06 •• •• •• 78/);
  });

  it('ne laisse fuiter ni lien d’administration, ni jeton, ni champ interne', () => {
    assert.deepEqual(fuites(sujet, corps), []);
    assert.doesNotMatch(corps, /\/admin/);
    assert.doesNotMatch(corps, /pages\.dev/);
    assert.doesNotMatch(corps, /\b42\b/);
  });
});

describe('message de coordonnées, après acceptation', () => {
  const { sujet, corps } = construireCoordonnees(LEAD);

  it('livre enfin le nom et les coordonnées complètes', () => {
    assert.match(corps, /Camille Durand/);
    assert.match(corps, /06 12 34 56 78/);
    assert.match(corps, /camille\.durand@example\.fr/);
    assert.match(sujet, /^Coordonnées du demandeur/);
  });

  it('reste exempt de lien d’administration et de champ interne', () => {
    assert.deepEqual(fuites(sujet, corps), []);
  });
});

describe('garde-fou avant envoi de l’offre', () => {
  const { sujet, corps } = construireBrouillon(LEAD);
  const COORDONNEES = ['camille.durand@example.fr', '06 12 34 56 78', 'Camille Durand'];

  it('bloque un lien vers l’administration ajouté à la main', () => {
    const trouve = fuites(sujet, `${corps}\nDétail : https://lesprosdelyonne.com/admin/lead/42`);
    assert.equal(trouve.length > 0, true);
    assert.match(trouve.map((f) => f.libelle).join(), /administration/);
  });

  it('bloque un jeton Cloudflare Access collé dans le message', () => {
    const jeton = 'CF_Authorization=eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6InRlc3QifQ.signature';
    const trouve = fuites(sujet, `${corps}\n${jeton}`);
    assert.equal(trouve.some((f) => f.libelle.includes('Cloudflare Access')), true);
  });

  it('bloque la mention d’un autre professionnel', () => {
    const trouve = fuites(sujet, `${corps}\nSinon je le passe à Toitures Martin.`, {
      autresPros: ['Toitures Martin', 'martin@example.fr']
    });
    assert.equal(trouve.some((f) => f.libelle.includes('autre professionnel')), true);
  });

  it('bloque le téléphone du demandeur, même reformaté', () => {
    const trouve = fuites(sujet, `${corps}\nIl est joignable au 06.12.34.56.78`, {
      coordonnees: COORDONNEES
    });
    assert.equal(trouve.some((f) => f.libelle.includes('coordonnées du demandeur')), true);
  });

  it('bloque un numéro glissé par le demandeur dans sa propre description', () => {
    const avecNumero = construireBrouillon({
      ...LEAD,
      description: 'Tuiles arrachées, rappelez-moi au 06 12 34 56 78.'
    });
    const trouve = fuites(avecNumero.sujet, avecNumero.corps, { coordonnees: COORDONNEES });
    assert.equal(trouve.some((f) => f.libelle.includes('coordonnées du demandeur')), true);
  });

  it('bloque le nom complet du demandeur', () => {
    const trouve = fuites(sujet, `${corps}\nDemandé par Camille Durand.`, { coordonnees: COORDONNEES });
    assert.equal(trouve.some((f) => f.libelle.includes('coordonnées du demandeur')), true);
  });

  it('laisse passer une offre légitime, y compris reformulée', () => {
    const reecrit = corps.replace('Bonjour,', 'Bonjour Monsieur,');
    assert.deepEqual(
      fuites(reecrit ? sujet : sujet, reecrit, {
        autresPros: ['Toitures Martin', 'martin@example.fr'],
        coordonnees: COORDONNEES
      }),
      []
    );
  });
});

describe('jeton de réponse', () => {
  it('produit une clé longue, urlsafe et jamais deux fois la même', () => {
    const jetons = new Set(Array.from({ length: 200 }, () => nouveauJeton()));
    assert.equal(jetons.size, 200);
    for (const jeton of jetons) {
      assert.match(jeton, /^[A-Za-z0-9_-]{40,48}$/);
      assert.equal(jetonPlausible(jeton), jeton);
    }
  });

  it('rejette une URL bricolée avant toute requête en base', () => {
    assert.equal(jetonPlausible('court'), null);
    assert.equal(jetonPlausible("' OR 1=1 --"), null);
    assert.equal(jetonPlausible('a'.repeat(65)), null);
    assert.equal(jetonPlausible(null), null);
  });
});

describe('contrôle d’origine des actions d’administration', () => {
  const NOTRE = 'https://lesprosdelyonne.com';

  it('laisse passer une action partie de l’administration elle-même', () => {
    assert.deepEqual(verifierOrigine('POST', NOTRE, NOTRE), { ok: true });
  });

  it('refuse un formulaire hébergé sur un autre site', () => {
    const verdict = verifierOrigine('POST', 'https://exemple-malveillant.fr', NOTRE);
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok === false ? verdict.motif : '', /étrangère/);
  });

  it('refuse un en-tête Origin absent', () => {
    assert.equal(verifierOrigine('POST', null, NOTRE).ok, false);
    assert.equal(verifierOrigine('POST', '', NOTRE).ok, false);
  });

  it('refuse une origine opaque « null »', () => {
    const verdict = verifierOrigine('POST', 'null', NOTRE);
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok === false ? verdict.motif : '', /opaque/);
  });

  it('refuse un sous-domaine ou un schéma qui ne correspond pas exactement', () => {
    assert.equal(verifierOrigine('POST', 'https://admin.lesprosdelyonne.com', NOTRE).ok, false);
    assert.equal(verifierOrigine('POST', 'http://lesprosdelyonne.com', NOTRE).ok, false);
    assert.equal(verifierOrigine('POST', 'https://lesprosdelyonne.com.exemple.fr', NOTRE).ok, false);
  });

  it('couvre toutes les méthodes qui modifient, et laisse les lectures tranquilles', () => {
    for (const methode of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal(verifierOrigine(methode, 'https://ailleurs.fr', NOTRE).ok, false, methode);
    }
    for (const methode of ['GET', 'HEAD', 'OPTIONS']) {
      assert.deepEqual(verifierOrigine(methode, null, NOTRE), { ok: true }, methode);
    }
  });

  it('vaut aussi en développement local, où Access n’est pas devant', () => {
    const local = 'http://127.0.0.1:8788';
    assert.deepEqual(verifierOrigine('POST', local, local), { ok: true });
    assert.equal(verifierOrigine('POST', 'https://exemple-malveillant.fr', local).ok, false);
  });
});

describe('validité du lien de réponse', () => {
  it('est de 48 heures', () => {
    assert.equal(VALIDITE_HEURES, 48);
  });
});
