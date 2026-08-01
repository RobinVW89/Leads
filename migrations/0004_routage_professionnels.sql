-- Routage des demandes vers un professionnel unique.
--
-- Principe : une demande n'est transmise qu'à un seul professionnel à la fois.
-- La colonne leads.pro_actif_id matérialise cette exclusivité ; l'envoi est
-- protégé par une mise à jour conditionnelle, ce qui rend un double envoi
-- techniquement impossible même en cas de double clic ou d'onglets multiples.

CREATE TABLE IF NOT EXISTS professionnels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  raison_sociale TEXT NOT NULL,
  contact_nom TEXT,
  email TEXT NOT NULL,
  telephone TEXT,
  siret TEXT,

  -- Slugs de métiers séparés par des virgules, ex : « couvreur,isolation »
  metiers TEXT NOT NULL DEFAULT '',
  -- Slugs de communes séparés par des virgules. Vide = tout le département.
  communes TEXT NOT NULL DEFAULT '',

  -- Départage entre professionnels compatibles : le plus élevé passe devant.
  priorite INTEGER NOT NULL DEFAULT 0,
  actif INTEGER NOT NULL DEFAULT 1,
  note_interne TEXT
);

CREATE INDEX IF NOT EXISTS idx_pros_actif ON professionnels (actif);

-- Historique complet : chaque proposition, envoi et refus est conservé.
CREATE TABLE IF NOT EXISTS attributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  lead_id INTEGER NOT NULL,
  professionnel_id INTEGER NOT NULL,

  -- envoye | refuse | indisponible
  statut TEXT NOT NULL,
  -- Motif d'un refus, ou message d'erreur d'envoi.
  motif TEXT,
  -- 1 si l'e-mail au professionnel est effectivement parti.
  email_envoye INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY (lead_id) REFERENCES leads (id),
  FOREIGN KEY (professionnel_id) REFERENCES professionnels (id)
);

CREATE INDEX IF NOT EXISTS idx_attributions_lead ON attributions (lead_id);
CREATE INDEX IF NOT EXISTS idx_attributions_pro ON attributions (professionnel_id);

-- Professionnel actuellement saisi de la demande. NULL = disponible pour
-- attribution. C'est cette colonne qui garantit l'exclusivité.
ALTER TABLE leads ADD COLUMN pro_actif_id INTEGER;
ALTER TABLE leads ADD COLUMN pro_actif_at TEXT;
