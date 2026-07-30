-- Demandes reçues via le formulaire du site.
-- Conservation : 24 mois après la création (purge automatique).

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Horodatage
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,

  -- Nature de la demande
  type TEXT NOT NULL DEFAULT 'lead',           -- 'lead' ou 'intention'
  metier TEXT,
  metier_nom TEXT,
  ville TEXT,

  -- Coordonnées du demandeur
  prenom TEXT,
  nom TEXT,
  telephone TEXT,
  email TEXT,
  commune TEXT,
  code_postal TEXT,

  -- Contenu de la demande
  description TEXT,
  delai_souhaite TEXT,
  budget TEXT,
  qualification TEXT,                          -- JSON : questions/réponses du parcours

  -- Contexte technique
  page_source TEXT,
  user_agent TEXT,
  pays TEXT,

  -- Suivi interne
  statut TEXT NOT NULL DEFAULT 'nouveau',      -- nouveau | transmis | traite | perdu
  transmis_webhook INTEGER NOT NULL DEFAULT 0, -- 1 si le relais Formspree a répondu OK
  note_interne TEXT
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_metier ON leads (metier);
CREATE INDEX IF NOT EXISTS idx_leads_ville ON leads (ville);
CREATE INDEX IF NOT EXISTS idx_leads_statut ON leads (statut);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);
