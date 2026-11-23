<?php
/**
 * Pembuat akun admin. Buka sekali, buat akun, lalu HAPUS file ini dari server.
 *
 * Dilindungi `setup_token` di api/config.php. Jangan biarkan file ini berada
 * di server setelah akun admin selesai dibuat.
 */

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$tokenBenar = (string) konfig('setup_token', '');
$tokenSiap = $tokenBenar !== '' && strpos($tokenBenar, 'GANTI_') !== 0;
// Nilai contoh yang tertulis di README/repo tidak boleh dipakai: siapa pun
// yang membacanya bisa membuat akun admin baru.
$tokenLemah = in_array($tokenBenar, ['lokal-ganti-token', 'ganti-token-ini'], true)
    || strlen($tokenBenar) < 16;

function h($teks): string
{
    return htmlspecialchars((string) $teks, ENT_QUOTES, 'UTF-8');
}

function halaman(string $judul, string $isi, int $kode = 200): void
{
    http_response_code($kode);
    header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex, nofollow');
    header('Cache-Control: no-store');
    echo '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<meta name="robots" content="noindex,nofollow">'
        . '<title>' . h($judul) . '</title>'
        . '<style>body{font-family:system-ui,sans-serif;max-width:520px;margin:40px auto;padding:0 16px;color:#17324d}'
        . 'label{display:block;margin:14px 0 4px;font-weight:600}input{width:100%;padding:10px;border:1px solid #9fb3c8;border-radius:8px;box-sizing:border-box}'
        . 'button{margin-top:20px;padding:11px 18px;border:0;border-radius:8px;background:#1267b8;color:#fff;font-weight:600;cursor:pointer}'
        . '.pesan{padding:12px 14px;border-radius:8px;background:#e6f4ea;border:1px solid #a8d5b5}'
        . '.galat{background:#fdecea;border-color:#e6a5a0}.catatan{color:#5b7189;font-size:14px;margin-top:18px}'
        . '</style></head><body><h1>' . h($judul) . '</h1>' . $isi . '</body></html>';
    exit;
}

if (!$tokenSiap || $tokenLemah) {
    halaman('Belum siap', '<div class="pesan galat">Pembuat akun lewat web dinonaktifkan karena '
        . '<code>setup_token</code> masih kosong atau masih memakai nilai contoh. '
        . 'Untuk lokal, jalankan <code>npm run admin</code> di terminal. '
        . 'Untuk hosting, isi <code>setup_token</code> di <code>api/config.php</code> dengan '
        . 'nilai acak minimal 16 karakter, lalu buka halaman ini lagi.</div>', 503);
}

$tokenDikirim = (string) ($_POST['token'] ?? $_GET['token'] ?? '');
if (!hash_equals($tokenBenar, $tokenDikirim)) {
    halaman('Akses ditolak', '<div class="pesan galat">Token penyiapan tidak cocok.</div>', 403);
}

$pesan = '';
$galat = '';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $username = trim((string) ($_POST['username'] ?? ''));
    $sandi = (string) ($_POST['password'] ?? '');
    $ulang = (string) ($_POST['password2'] ?? '');

    if (!preg_match('/^[A-Za-z0-9._-]{3,50}$/', $username)) {
        $galat = 'Username 3–50 karakter, hanya huruf, angka, titik, garis bawah, atau tanda hubung.';
    } elseif (mb_strlen($sandi) < 8) {
        $galat = 'Password minimal 8 karakter.';
    } elseif ($sandi !== $ulang) {
        $galat = 'Ulangi password dengan nilai yang sama.';
    } else {
        try {
            $cek = db()->prepare('SELECT COUNT(*) FROM admin WHERE username = ?');
            $cek->execute([$username]);
            if ((int) $cek->fetchColumn() > 0) {
                $galat = 'Username tersebut sudah dipakai.';
            } else {
                $stmt = db()->prepare(
                    'INSERT INTO admin (username, kata_sandi, dibuat_pada)
                     VALUES (?, ?, NOW())'
                );
                $stmt->execute([$username, password_hash($sandi, PASSWORD_DEFAULT)]);

                $jumlah = (int) db()->query('SELECT COUNT(*) FROM admin')->fetchColumn();
                $pesan = 'Akun <strong>' . h($username) . '</strong> berhasil dibuat. '
                    . 'Sekarang ada ' . $jumlah . ' akun admin. '
                    . 'Silakan <strong>hapus file api/buat-admin.php</strong> dari server, '
                    . 'lalu masuk lewat halaman login.';
            }
        } catch (Throwable $kesalahan) {
            error_log('buat-admin: ' . $kesalahan->getMessage());
            $galat = 'Gagal membuat akun. Periksa konfigurasi database dan pastikan skema sudah diimpor.';
        }
    }
}

$form = '';
if ($pesan === '') {
    $form = ($galat !== '' ? '<div class="pesan galat">' . h($galat) . '</div>' : '')
        . '<form method="post">'
        . '<input type="hidden" name="token" value="' . h($tokenDikirim) . '">'
        . '<label for="username">Username</label><input id="username" name="username" required maxlength="50" autocapitalize="none">'
        . '<label for="password">Password</label><input id="password" name="password" type="password" required minlength="8" autocomplete="new-password">'
        . '<label for="password2">Ulangi password</label><input id="password2" name="password2" type="password" required minlength="8" autocomplete="new-password">'
        . '<button type="submit">Buat akun admin</button>'
        . '</form>'
        . '<p class="catatan">Setelah akun dibuat, hapus <code>api/buat-admin.php</code> dan kosongkan '
        . '<code>setup_token</code> di <code>api/config.php</code>.</p>';
}

halaman(
    'Buat akun admin',
    ($pesan !== '' ? '<div class="pesan">' . $pesan . '</div>' : '') . $form
);
