-- Réponse du professionnel depuis l'e-mail reçu.
--
-- Le jeton porté par la ligne « envoye » est une clé de capacité : il vaut
-- autorisation d'accepter ou de refuser CETTE demande, et rien d'autre. Il ne
-- donne accès ni à /admin, ni à une autre demande, ni aux autres
-- professionnels. C'est ce qui permet de mettre le lien dans un e-mail sans y
-- faire figurer le moindre identifiant interne.
--
-- 256 bits d'aléa : deviner un jeton n'est pas une menace réaliste, et
-- l'énumération ne mène nulle part.

ALTER TABLE attributions ADD COLUMN jeton TEXT;

-- Horodatage de la réponse. Sa valeur NULL est la condition qui rend une
-- réponse unique : l'enregistrement se fait par un UPDATE conditionnel, donc
-- un double clic ou un lien rouvert ne peut pas produire deux réponses.
ALTER TABLE attributions ADD COLUMN repondu_at TEXT;

-- Recherche par jeton à chaque ouverture du lien, et unicité : deux envois ne
-- doivent jamais partager la même clé.
CREATE UNIQUE INDEX IF NOT EXISTS idx_attributions_jeton ON attributions (jeton);
