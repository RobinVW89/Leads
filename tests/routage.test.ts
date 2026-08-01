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

import { construireBrouillon, fuites } from '../functions/_lib/modele-email-pro.ts';
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

describe('brouillon envoyé au professionnel', () => {
  const { sujet, corps } = construireBrouillon(LEAD);

  it('contient tout ce que le professionnel doit recevoir', () => {
    assert.match(corps, /Type de demande : Couvreur/);
    assert.match(corps, /Commune : Monéteau 89470/);
    assert.match(corps, /Tuiles arrachées après la tempête/);
    assert.match(corps, /Camille Durand/);
    assert.match(corps, /06 12 34 56 78/);
    assert.match(corps, /camille\.durand@example\.fr/);
    assert.match(corps, /Date de la demande : samedi 1 août 2026/);
    assert.match(corps, /Les Pros de l'Yonne/);
    assert.match(sujet, /^Nouvelle demande — Couvreur à Monéteau 89470$/);
  });

  it('ne laisse fuiter ni lien d’administration, ni jeton, ni champ interne', () => {
    assert.deepEqual(fuites(sujet, corps), []);
    assert.doesNotMatch(corps, /\/admin/);
    assert.doesNotMatch(corps, /pages\.dev/);
    assert.doesNotMatch(corps, /CF_Authorization/);
    // Aucun identifiant de base : ni la référence du lead, ni un numéro de fiche.
    assert.doesNotMatch(corps, /\b42\b/);
  });
});

describe('garde-fou avant envoi', () => {
  const { sujet, corps } = construireBrouillon(LEAD);

  it('bloque un lien vers l’administration ajouté à la main', () => {
    const trouve = fuites(sujet, `${corps}\nDétail : https://lesprosdelyonne.com/admin/lead/42`);
    assert.equal(trouve.length > 0, true);
    assert.match(trouve.map((f) => f.libelle).join(), /administration/);
  });

  it('bloque un jeton Cloudflare Access collé dans le message', () => {
    const jeton = 'CF_Authorization=eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6InRlc3QifQ.signature';
    const trouve = fuites(sujet, `${corps}\n${jeton}`);
    assert.equal(
      trouve.some((f) => f.libelle.includes('Cloudflare Access')),
      true
    );
  });

  it('bloque la mention d’un autre professionnel', () => {
    const trouve = fuites(sujet, `${corps}\nSinon je le passe à Toitures Martin.`, [
      'Toitures Martin',
      'martin@example.fr'
    ]);
    assert.equal(
      trouve.some((f) => f.libelle.includes('autre professionnel')),
      true
    );
  });

  it('laisse passer un message légitime, y compris reformulé', () => {
    const reecrit = corps.replace('Bonjour,', 'Bonjour Monsieur,');
    assert.deepEqual(fuites(sujet, reecrit, ['Toitures Martin', 'martin@example.fr']), []);
  });
});
