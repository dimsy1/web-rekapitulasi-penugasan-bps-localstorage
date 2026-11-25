-- =====================================================================
-- Migrasi: Posisi Petugas per Jenis Kegiatan
--
-- Jalankan SEKALI lewat phpMyAdmin (tab SQL atau Import) pada database
-- yang sudah berisi data. File ini aman dijalankan berulang kali.
--
-- Isi migrasi:
--   1. Tabel posisi_petugas  (nama posisi milik satu jenis kegiatan)
--   2. Tabel posisi_limit    (limit honor posisi per tahun)
--   3. Kolom penugasan.posisi_id + index + foreign key
--
-- Data lama tidak diubah: penugasan lama tetap memiliki posisi_id NULL
-- dan akan tampil di subkolom "Tanpa posisi" pada rekap.
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS posisi_petugas (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  jenis_kegiatan_id INT UNSIGNED NOT NULL,
  nama              VARCHAR(100) NOT NULL,
  urutan            INT UNSIGNED NOT NULL DEFAULT 0,
  dibuat_pada       DATETIME     NOT NULL,
  diubah_pada       DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY unik_jenis_nama (jenis_kegiatan_id, nama),
  KEY idx_jenis_urutan (jenis_kegiatan_id, urutan),
  CONSTRAINT fk_posisi_jenis FOREIGN KEY (jenis_kegiatan_id)
    REFERENCES jenis_kegiatan (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS posisi_limit (
  posisi_id    INT UNSIGNED NOT NULL,
  tahun        SMALLINT UNSIGNED NOT NULL,
  limit_honor  BIGINT UNSIGNED NOT NULL,
  diubah_pada  DATETIME     NOT NULL,
  PRIMARY KEY (posisi_id, tahun),
  KEY idx_tahun (tahun),
  CONSTRAINT fk_limit_posisi FOREIGN KEY (posisi_id)
    REFERENCES posisi_petugas (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT cek_limit_tahun CHECK (tahun >= 2020)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tambah kolom posisi_id bila belum ada -------------------------------
SET @ada_kolom := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'penugasan'
     AND COLUMN_NAME = 'posisi_id'
);
SET @sql := IF(
  @ada_kolom = 0,
  'ALTER TABLE penugasan ADD COLUMN posisi_id INT UNSIGNED NULL AFTER jenis_kegiatan_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Tambah index bila belum ada -----------------------------------------
SET @ada_index := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'penugasan'
     AND INDEX_NAME = 'idx_posisi'
);
SET @sql := IF(
  @ada_index = 0,
  'ALTER TABLE penugasan ADD KEY idx_posisi (posisi_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Tambah foreign key bila belum ada -----------------------------------
SET @ada_fk := (
  SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND CONSTRAINT_NAME = 'fk_penugasan_posisi'
);
SET @sql := IF(
  @ada_fk = 0,
  'ALTER TABLE penugasan ADD CONSTRAINT fk_penugasan_posisi FOREIGN KEY (posisi_id) REFERENCES posisi_petugas (id) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Bump versi skema supaya aplikasi mudah memeriksa.
INSERT INTO meta (kunci, nilai) VALUES ('skema_posisi', '1')
  ON DUPLICATE KEY UPDATE nilai = VALUES(nilai);
