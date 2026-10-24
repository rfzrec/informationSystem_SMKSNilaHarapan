-- Move the school's establishment date into the same source of truth as website branding.
ALTER TABLE school_branding ADD COLUMN established_on DATE NULL AFTER tagline;
UPDATE school_branding SET established_on = '2002-05-21' WHERE id = 1 AND established_on IS NULL;
