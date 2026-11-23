<?php
/** Menyiapkan database dan akun lokal sebelum npm run dev menjalankan server. */

declare(strict_types=1);

$root = dirname(__DIR__);
$config = require $root . '/api/config.php';
$host = (string) ($config['db_host'] ?? '127.0.0.1');
$name = (string) ($config['db_name'] ?? 'db_selaras');
$user = (string) ($config['db_user'] ?? 'root');
$pass = (string) ($config['db_pass'] ?? '');

try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;charset=utf8mb4', $host),
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
    $pdo->exec(
        'CREATE DATABASE IF NOT EXISTS `' . str_replace('`', '``', $name)
        . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
    $pdo->exec('USE `' . str_replace('`', '``', $name) . '`');

    $sql = file_get_contents($root . '/api/skema.sql');
    if ($sql === false) {
        throw new RuntimeException('api/skema.sql tidak ditemukan.');
    }
    $pdo->exec($sql);

    $daftarFile = dirname($root) . '/daftar-nama-kegiatan.txt';
    if (is_file($daftarFile)) {
        $namaKegiatan = file($daftarFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $sisipKegiatan = $pdo->prepare(
            'INSERT IGNORE INTO nama_kegiatan (nama, urutan, aktif, dibuat_pada, diubah_pada)
             VALUES (?, ?, 1, NOW(), NOW())'
        );
        foreach ($namaKegiatan ?: [] as $urutan => $nama) {
            $nama = trim((string) $nama);
            if ($nama !== '') {
                $sisipKegiatan->execute([$nama, $urutan + 1]);
            }
        }
    }

    // Migrasikan database lokal lama dari teks pekerjaan ke ID master.
    if ($pdo->query("SHOW COLUMNS FROM penugasan LIKE 'nama_kegiatan_id'")->fetch() === false) {
        $pdo->exec('ALTER TABLE penugasan ADD COLUMN nama_kegiatan_id INT UNSIGNED NULL AFTER jenis_kegiatan_id');
        $pdo->exec('ALTER TABLE penugasan ADD KEY idx_nama_kegiatan (nama_kegiatan_id)');
    }
    if ($pdo->query("SHOW COLUMNS FROM penugasan LIKE 'nama_pekerjaan'")->fetch() !== false) {
        $pdo->exec(
            'UPDATE penugasan p INNER JOIN nama_kegiatan n ON LOWER(TRIM(p.nama_pekerjaan)) = LOWER(TRIM(n.nama))
             SET p.nama_kegiatan_id = n.id WHERE p.nama_pekerjaan IS NOT NULL AND p.nama_pekerjaan <> ""'
        );
        $pdo->exec('ALTER TABLE penugasan DROP COLUMN nama_pekerjaan');
    }
    $fk = $pdo->query("SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_penugasan_nama_kegiatan'")->fetchColumn();
    if ((int) $fk === 0) {
        $pdo->exec('ALTER TABLE penugasan ADD CONSTRAINT fk_penugasan_nama_kegiatan
            FOREIGN KEY (nama_kegiatan_id) REFERENCES nama_kegiatan (id) ON DELETE SET NULL ON UPDATE CASCADE');
    }

    $jumlah = (int) $pdo->query('SELECT COUNT(*) FROM admin')->fetchColumn();
    if ($jumlah === 0) {
        $stmt = $pdo->prepare(
            'INSERT INTO admin (username, kata_sandi, dibuat_pada) VALUES (?, ?, NOW())'
        );
        $stmt->execute(['admin', password_hash('admin12345', PASSWORD_DEFAULT)]);
        echo "Database db_selaras siap. Akun awal: admin / admin12345\n";
    } else {
        echo "Database db_selaras siap.\n";
    }

    // Kolom nama admin tidak dipakai lagi; identitas cukup username.
    if ($pdo->query("SHOW COLUMNS FROM admin LIKE 'nama'")->fetch() !== false) {
        $pdo->exec('ALTER TABLE admin DROP COLUMN nama');
    }
} catch (Throwable $error) {
    fwrite(STDERR, "Gagal menyiapkan MySQL Laragon: {$error->getMessage()}\n");
    fwrite(STDERR, "Pastikan MySQL Laragon aktif dan api/config.php memakai user/password yang benar.\n");
    exit(1);
}
