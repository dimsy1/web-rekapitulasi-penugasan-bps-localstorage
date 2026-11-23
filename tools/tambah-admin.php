<?php
/**
 * Menambah admin baru ke database lokal.
 * Jalankan: npm run admin
 * Atau:     php tools/tambah-admin.php "Nama" username password
 */

declare(strict_types=1);

$root = dirname(__DIR__);
$config = require $root . '/api/config.php';
$host = (string) ($config['db_host'] ?? '127.0.0.1');
$name = (string) ($config['db_name'] ?? 'db_selaras');
$user = (string) ($config['db_user'] ?? 'root');
$pass = (string) ($config['db_pass'] ?? '');

function tanya(string $label): string
{
    echo $label;
    $baris = fgets(STDIN);
    return $baris === false ? '' : trim($baris);
}

try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $host, $name),
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
} catch (Throwable $error) {
    fwrite(STDERR, "Gagal terhubung ke MySQL: {$error->getMessage()}\n");
    fwrite(STDERR, "Pastikan MySQL Laragon aktif.\n");
    exit(1);
}

$username = isset($argv[1]) ? trim((string) $argv[1]) : tanya('Username         : ');
$sandi = isset($argv[2]) ? (string) $argv[2] : tanya('Password (min 8) : ');

if (!preg_match('/^[A-Za-z0-9._-]{3,50}$/', $username)) {
    fwrite(STDERR, "Username 3-50 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.\n");
    exit(1);
}
if (mb_strlen($sandi) < 8) {
    fwrite(STDERR, "Password minimal 8 karakter.\n");
    exit(1);
}

$cek = $pdo->prepare('SELECT COUNT(*) FROM admin WHERE username = ?');
$cek->execute([$username]);
if ((int) $cek->fetchColumn() > 0) {
    fwrite(STDERR, "Username \"{$username}\" sudah dipakai. Pilih username lain.\n");
    exit(1);
}

$stmt = $pdo->prepare(
    'INSERT INTO admin (username, kata_sandi, dibuat_pada) VALUES (?, ?, NOW())'
);
$stmt->execute([$username, password_hash($sandi, PASSWORD_DEFAULT)]);

$jumlah = (int) $pdo->query('SELECT COUNT(*) FROM admin')->fetchColumn();
echo "Admin \"{$username}\" berhasil dibuat. Total admin: {$jumlah}.\n";
