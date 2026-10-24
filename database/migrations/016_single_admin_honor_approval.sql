-- Konsolidasikan alur honor ke empat role: satu persetujuan oleh Admin.
-- Kolom persetujuan Kepala Sekolah/Yayasan dipertahankan untuk histori lama, bukan lagi sebagai role/workflow aktif.
ALTER TABLE teacher_payroll_periods
  ADD COLUMN admin_approved_by INT UNSIGNED NULL,
  ADD COLUMN admin_approved_at DATETIME NULL;

ALTER TABLE teacher_payroll_periods
  ADD CONSTRAINT fk_payroll_admin_approver FOREIGN KEY (admin_approved_by) REFERENCES users(id) ON DELETE SET NULL;

UPDATE teacher_payroll_periods
SET admin_approved_by = COALESCE(principal_approved_by, foundation_approved_by),
    admin_approved_at = COALESCE(principal_approved_at, foundation_approved_at)
WHERE status IN ('approved','paid') AND admin_approved_by IS NULL;
