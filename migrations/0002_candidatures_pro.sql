-- Candidatures de professionnels souhaitant rejoindre le site.
-- Elles utilisent la table `leads` avec type = 'pro' : même pipeline,
-- même espace d'administration, même durée de conservation.

ALTER TABLE leads ADD COLUMN entreprise TEXT;
ALTER TABLE leads ADD COLUMN siret TEXT;
ALTER TABLE leads ADD COLUMN site_web TEXT;
ALTER TABLE leads ADD COLUMN zone_intervention TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_type ON leads (type);
