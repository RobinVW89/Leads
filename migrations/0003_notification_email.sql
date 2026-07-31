-- Suivi de la notification par e-mail, distincte du relais webhook.
-- 0 = non envoyée, 1 = envoyée. En cas d'échec, le motif est conservé
-- pour être affiché dans /admin : le lead n'est jamais perdu.

ALTER TABLE leads ADD COLUMN notifie_email INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN notification_erreur TEXT;
