-- Complète la fiche professionnel : vérification de l'adresse, disponibilité
-- et trace du dernier lead reçu.
--
-- `email_verifie` n'est pas décoratif : seule une adresse vérifiée peut
-- recevoir un lead. Elle double la vérification côté Cloudflare (une adresse
-- de destination doit être validée dans Email Routing pour qu'un Worker
-- puisse lui écrire), et elle rend la règle visible et pilotable dans /admin.
--
-- `disponible` sépare deux notions distinctes : un professionnel « inactif »
-- est sorti du réseau, un professionnel « indisponible » est simplement en
-- congés ou surchargé. Les deux excluent du routage, mais ne se corrigent pas
-- de la même façon.

ALTER TABLE professionnels ADD COLUMN email_verifie INTEGER NOT NULL DEFAULT 0;
ALTER TABLE professionnels ADD COLUMN disponible INTEGER NOT NULL DEFAULT 1;

-- Dernier lead effectivement transmis : sert à l'affichage dans /admin et
-- départage les professionnels de même priorité (le moins servi passe devant).
ALTER TABLE professionnels ADD COLUMN dernier_lead_at TEXT;
ALTER TABLE professionnels ADD COLUMN dernier_lead_id INTEGER;

-- Un même professionnel ne doit pas figurer deux fois : l'adresse est la clé
-- naturelle, et un doublon fausserait la rotation comme l'historique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pros_email ON professionnels (email);

-- Sélection du professionnel recommandé : filtre systématique sur ces trois
-- colonnes, dans cet ordre.
CREATE INDEX IF NOT EXISTS idx_pros_eligibles ON professionnels (actif, disponible, email_verifie);

-- Une attribution ne se lit jamais seule : c'est toujours « l'historique de
-- ce lead », trié du plus récent au plus ancien.
CREATE INDEX IF NOT EXISTS idx_attributions_lead_date ON attributions (lead_id, created_at DESC);
