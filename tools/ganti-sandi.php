<?php
/**
 * Mengganti kata sandi admin lokal, sekaligus mengakhiri semua sesi admin itu.
 * Jalankan: npm run sandi
 * Atau:     php tools/ganti-sandi.php username passwordbaru
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

$username = isset($argv[1]) ? trim((string) $argv[1]) : tanya('Username            : ');
$sandi = isset($argv[2]) ? (string) $argv[2] : tanya('Password baru (8+)  : ');

if ($username === '') {
    fwrite(STDERR, "Username wajib diisi.\n");
    exit(1);
}
if (mb_strlen($sandi) < 8) {
    fwrite(STDERR, "Password minimal 8 karakter.\n");
    exit(1);
}

$cek = $pdo->prepare('SELECT id FROM admin WHERE username = ?');
$cek->execute([$username]);
$id = $cek->fetchColumn();
if ($id === false) {
    fwrite(STDERR, "Admin \"{$username}\" tidak ditemukan.\n");
    exit(1);
}

$pdo->beginTransaction();
try {
    $pdo->prepare('UPDATE admin SET kata_sandi = ? WHERE id = ?')
        ->execute([password_hash($sandi, PASSWORD_DEFAULT), $id]);
    // Sesi lama tidak boleh tetap berlaku setelah sandi diganti.
    $pdo->prepare('DELETE FROM sesi WHERE admin_id = ?')->execute([$id]);
    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "Gagal mengganti password: {$error->getMessage()}\n");
    exit(1);
}

echo "Password admin \"{$username}\" sudah diganti. Semua sesi lama diakhiri.\n";
