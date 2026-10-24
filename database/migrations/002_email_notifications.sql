ALTER TABLE notifications
  MODIFY email_status ENUM('not_configured','skipped','queued','sent','failed') NOT NULL DEFAULT 'skipped',
  ADD COLUMN email_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER email_status,
  ADD COLUMN email_error VARCHAR(255) NULL AFTER email_attempts,
  ADD COLUMN email_message_id VARCHAR(100) NULL AFTER email_error,
  ADD COLUMN email_sent_at DATETIME NULL AFTER email_message_id,
  ADD INDEX idx_notif_email (email_status, id);

UPDATE notifications SET email_status = 'skipped'
WHERE type NOT IN ('document_revision','application_revision','selection_published');
