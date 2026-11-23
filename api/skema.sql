-- Skema database Dashboard Honor & Penugasan Petugas.
-- Impor sekali lewat phpMyAdmin (tab Import) pada database InfinityFree.
-- Semua tabel InnoDB + utf8mb4 agar nama Indonesia dan emoji tetap aman.

SET NAMES utf8mb4;
SET time_zone = '+07:00';

CREATE TABLE IF NOT EXISTS admin (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)  NOT NULL,
  kata_sandi    VARCHAR(255) NOT NULL,
  dibuat_pada   DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY unik_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sesi (
  token_hash      CHAR(64)     NOT NULL,
  admin_id        INT UNSIGNED NOT NULL,
  dibuat_pada     DATETIME     NOT NULL,
  kedaluwarsa     DATETIME     NOT NULL,
  terakhir_dipakai DATETIME    NOT NULL,
  ip              VARCHAR(45)  NULL,
  user_agent      VARCHAR(255) NULL,
  PRIMARY KEY (token_hash),
  KEY idx_kedaluwarsa (kedaluwarsa),
  KEY idx_admin (admin_id),
  CONSTRAINT fk_sesi_admin FOREIGN KEY (admin_id) REFERENCES admin (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_gagal (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ip        VARCHAR(45)     NOT NULL,
  username  VARCHAR(50)     NOT NULL,
  waktu     DATETIME        NOT NULL,
  PRIMARY KEY (id),
  KEY idx_ip_waktu (ip, waktu),
  KEY idx_username_waktu (username, waktu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS petugas (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nama        VARCHAR(150) NOT NULL,
  urutan      INT UNSIGNED NOT NULL DEFAULT 0,
  versi       INT UNSIGNED NOT NULL DEFAULT 1,
  dibuat_pada DATETIME     NOT NULL,
  diubah_pada DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY unik_nama (nama),
  KEY idx_urutan (urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS jenis_kegiatan (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nama        VARCHAR(100) NOT NULL,
  urutan      INT UNSIGNED NOT NULL DEFAULT 0,
  versi       INT UNSIGNED NOT NULL DEFAULT 1,
  dibuat_pada DATETIME     NOT NULL,
  diubah_pada DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY unik_nama (nama),
  KEY idx_urutan (urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS nama_kegiatan (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nama        VARCHAR(255) NOT NULL,
  urutan      INT UNSIGNED NOT NULL DEFAULT 0,
  aktif       TINYINT(1) NOT NULL DEFAULT 1,
  dibuat_pada DATETIME NOT NULL,
  diubah_pada DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY unik_nama (nama),
  KEY idx_nama_aktif (aktif, urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS penugasan (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  petugas_id        INT UNSIGNED NOT NULL,
  jenis_kegiatan_id INT UNSIGNED NULL,
  nama_kegiatan_id  INT UNSIGNED NULL,
  bulan             TINYINT UNSIGNED NULL,
  tahun             SMALLINT UNSIGNED NULL,
  honor             BIGINT UNSIGNED NULL,
  versi             INT UNSIGNED NOT NULL DEFAULT 1,
  diperbarui_oleh   INT UNSIGNED NULL,
  dibuat_pada       DATETIME NOT NULL,
  diubah_pada       DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_tahun (tahun),
  KEY idx_petugas (petugas_id),
  KEY idx_jenis (jenis_kegiatan_id),
  KEY idx_nama_kegiatan (nama_kegiatan_id),
  CONSTRAINT fk_penugasan_petugas FOREIGN KEY (petugas_id)
    REFERENCES petugas (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_penugasan_jenis FOREIGN KEY (jenis_kegiatan_id)
    REFERENCES jenis_kegiatan (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_penugasan_nama_kegiatan FOREIGN KEY (nama_kegiatan_id)
    REFERENCES nama_kegiatan (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT cek_bulan CHECK (bulan IS NULL OR bulan BETWEEN 1 AND 12),
  CONSTRAINT cek_tahun CHECK (tahun IS NULL OR tahun >= 2020)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meta (
  kunci VARCHAR(50) NOT NULL,
  nilai TEXT NULL,
  PRIMARY KEY (kunci)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS log (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  waktu      DATETIME     NOT NULL,
  admin_id   INT UNSIGNED NULL,
  admin_nama VARCHAR(100) NULL,
  aksi       VARCHAR(40)  NOT NULL,
  target     VARCHAR(40)  NULL,
  ringkasan  VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY idx_waktu (waktu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS template_ekspor (
  id            TINYINT UNSIGNED NOT NULL DEFAULT 1,
  nama          VARCHAR(255) NULL,
  isi           LONGBLOB NULL,
  ukuran        INT UNSIGNED NULL,
  disimpan_pada DATETIME NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO meta (kunci, nilai) VALUES
  ('skema', '1'),
  ('versi', '3'),
  ('revisi', '0'),
  ('tahun_analisis', YEAR(CURDATE())),
  ('diperbarui', DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i:%s'));
