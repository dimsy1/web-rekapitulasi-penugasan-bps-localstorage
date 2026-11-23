<?php
/**
 * Fungsi dasar API: konfigurasi, koneksi PDO, sesi, dan pembantu JSON.
 * File ini tidak boleh diakses langsung (diblokir lewat .htaccess).
 */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
@ini_set('error_log', __DIR__ . '/error.log');

const COOKIE_SESI = 'sesi_honor';
const TAHUN_MIN = 2020;
const TAHUN_MAKS = 65535;

/* -------------------------------------------------------------------------
   Konfigurasi & koneksi
   ------------------------------------------------------------------------- */

function konfig(string $kunci, $bawaan = null)
{
    static $konfig = null;
    if ($konfig === null) {
        $berkas = __DIR__ . '/config.php';
        if (!is_file($berkas)) {
            throw new RuntimeException('api/config.php belum dibuat.');
        }
        $konfig = require $berkas;
        if (!is_array($konfig)) {
            throw new RuntimeException('Isi api/config.php tidak valid.');
        }
    }
    return array_key_exists($kunci, $konfig) ? $konfig[$kunci] : $bawaan;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=utf8mb4',
        (string) konfig('db_host'),
        (string) konfig('db_name')
    );

    try {
        $pdo = new PDO($dsn, (string) konfig('db_user'), (string) konfig('db_pass'), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec("SET time_zone = '+07:00'");
    } catch (Throwable $kesalahan) {
        throw new RuntimeException(
            'Koneksi database gagal. Periksa host, nama database, dan kata sandi di api/config.php.',
            0,
            $kesalahan
        );
    }

    return $pdo;
}

/* -------------------------------------------------------------------------
   Respons JSON
   ------------------------------------------------------------------------- */

function jawab(array $data, int $kode = 200): void
{
    http_response_code($kode);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function gagal(int $kode, string $pesan, ?array $errors = null): void
{
    $data = ['ok' => false, 'pesan' => $pesan];
    if ($errors !== null && $errors !== []) {
        $data['errors'] = $errors;
    }
    jawab($data, $kode);
}

function masukan_json(): array
{
    $mentah = file_get_contents('php://input');
    if ($mentah === false || trim($mentah) === '') {
        return [];
    }
    $data = json_decode($mentah, true);
    if (!is_array($data)) {
        gagal(400, 'Format permintaan tidak valid.');
    }
    return $data;
}

/* -------------------------------------------------------------------------
   Sesi login (token di database, cookie HttpOnly)
   ------------------------------------------------------------------------- */

function token_acak(): string
{
    return bin2hex(random_bytes(32));
}

function hash_token(string $token): string
{
    return hash('sha256', $token);
}

function ip_klien(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
}

function permintaan_https(): bool
{
    $https = $_SERVER['HTTPS'] ?? '';
    if ($https !== '' && strtolower((string) $https) !== 'off') {
        return true;
    }
    return strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

function pasang_cookie_sesi(string $token, int $detik): void
{
    setcookie(COOKIE_SESI, $token, [
        'expires' => time() + $detik,
        'path' => '/',
        'secure' => permintaan_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function hapus_cookie_sesi(): void
{
    setcookie(COOKIE_SESI, '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => permintaan_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function sesi_aktif(): ?array
{
    static $sudah = false;
    static $hasil = null;
    if ($sudah) {
        return $hasil;
    }
    $sudah = true;

    $token = (string) ($_COOKIE[COOKIE_SESI] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        return null;
    }

    $stmt = db()->prepare(
        'SELECT a.id, a.username
           FROM sesi s
           INNER JOIN admin a ON a.id = s.admin_id
          WHERE s.token_hash = ? AND s.kedaluwarsa > NOW()
          LIMIT 1'
    );
    $stmt->execute([hash_token($token)]);
    $baris = $stmt->fetch();
    if (!$baris) {
        return null;
    }

    $hasil = [
        'id' => (int) $baris['id'],
        'username' => (string) $baris['username'],
    ];
    return $hasil;
}

function wajib_masuk(): array
{
    $admin = sesi_aktif();
    if ($admin === null) {
        gagal(401, 'Sesi berakhir. Silakan masuk kembali.');
    }
    return $admin;
}

function pastikan_csrf(): void
{
    $header = (string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '');
    if ($header !== 'dashboard-honor') {
        gagal(403, 'Permintaan ditolak. Muat ulang halaman lalu coba lagi.');
    }
}

function catat_log(array $admin, string $aksi, ?string $target = null, ?string $ringkasan = null): void
{
    $stmt = db()->prepare(
        'INSERT INTO log (waktu, admin_id, admin_nama, aksi, target, ringkasan)
         VALUES (NOW(), ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $admin['id'] ?? null,
        $admin['username'] ?? null,
        substr($aksi, 0, 40),
        $target === null ? null : substr($target, 0, 40),
        $ringkasan === null ? null : substr($ringkasan, 0, 500),
    ]);
}

/* -------------------------------------------------------------------------
   Meta & revisi
   ------------------------------------------------------------------------- */

function baca_meta(): array
{
    $hasil = [];
    foreach (db()->query('SELECT kunci, nilai FROM meta')->fetchAll() as $baris) {
        $hasil[(string) $baris['kunci']] = $baris['nilai'];
    }
    return $hasil;
}

function set_meta(string $kunci, string $nilai): void
{
    $stmt = db()->prepare(
        'INSERT INTO meta (kunci, nilai) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)'
    );
    $stmt->execute([$kunci, $nilai]);
}

function naikkan_revisi(): void
{
    db()->exec("UPDATE meta SET nilai = CAST(nilai AS UNSIGNED) + 1 WHERE kunci = 'revisi'");
    set_meta('diperbarui', date('Y-m-d\TH:i:s'));
}

/* -------------------------------------------------------------------------
   Dataset
   ------------------------------------------------------------------------- */

function dataset_lengkap(): array
{
    $pdo = db();

    $meta = baca_meta();
    $tahun = isset($meta['tahun_analisis']) && $meta['tahun_analisis'] !== ''
        ? (int) $meta['tahun_analisis']
        : null;

    $petugas = [];
    foreach ($pdo->query('SELECT id, nama, urutan, versi FROM petugas ORDER BY urutan, nama')->fetchAll() as $baris) {
        $petugas[] = [
            'id' => (int) $baris['id'],
            'nama' => (string) $baris['nama'],
            'urutan' => (int) $baris['urutan'],
            'versi' => (int) $baris['versi'],
        ];
    }

    $jenis = [];
    foreach ($pdo->query('SELECT id, nama, urutan, versi FROM jenis_kegiatan ORDER BY urutan, id')->fetchAll() as $baris) {
        $jenis[] = [
            'id' => (int) $baris['id'],
            'nama' => (string) $baris['nama'],
            'urutan' => (int) $baris['urutan'],
            'versi' => (int) $baris['versi'],
        ];
    }

    $namaKegiatan = [];
    $stmtNamaKegiatan = $pdo->query(
        'SELECT id, nama, urutan FROM nama_kegiatan WHERE aktif = 1 ORDER BY urutan, id'
    );
    foreach ($stmtNamaKegiatan->fetchAll() as $baris) {
        $namaKegiatan[] = [
            'id' => (int) $baris['id'],
            'nama' => (string) $baris['nama'],
            'urutan' => (int) $baris['urutan'],
            'kode' => null,
            'tahun' => null,
        ];
    }

    $penugasan = [];
    $sql = 'SELECT p.id, p.petugas_id, p.jenis_kegiatan_id, p.nama_kegiatan_id,
                   n.nama AS nama_kegiatan, p.bulan, p.tahun, p.honor, p.versi
              FROM penugasan p
              LEFT JOIN nama_kegiatan n ON n.id = p.nama_kegiatan_id
             ORDER BY (p.bulan IS NULL), p.bulan, p.id';
    foreach ($pdo->query($sql)->fetchAll() as $baris) {
        $penugasan[] = [
            'id' => (int) $baris['id'],
            'petugas_id' => (int) $baris['petugas_id'],
            'jenis_kegiatan_id' => $baris['jenis_kegiatan_id'] === null ? null : (int) $baris['jenis_kegiatan_id'],
            'nama_kegiatan_id' => $baris['nama_kegiatan_id'] === null ? null : (int) $baris['nama_kegiatan_id'],
            'nama_pekerjaan' => $baris['nama_kegiatan'] === null ? '' : (string) $baris['nama_kegiatan'],
            'bulan' => $baris['bulan'] === null ? null : (int) $baris['bulan'],
            'tahun' => $baris['tahun'] === null ? null : (int) $baris['tahun'],
            'honor' => $baris['honor'] === null ? null : (int) $baris['honor'],
            'versi' => (int) $baris['versi'],
        ];
    }

    return [
        'versi' => 3,
        'tahunAnalisis' => $tahun,
        'diperbarui' => isset($meta['diperbarui']) ? (string) $meta['diperbarui'] : null,
        'revisi' => isset($meta['revisi']) ? (int) $meta['revisi'] : 0,
        'petugas' => $petugas,
        'jenis' => $jenis,
        'namaKegiatan' => $namaKegiatan,
        'penugasan' => $penugasan,
    ];
}

/* -------------------------------------------------------------------------
   Validasi (padanan aturan di public/js/store/validasi.js)
   ------------------------------------------------------------------------- */

function rapikan_teks($nilai): string
{
    $teks = preg_replace('/\s+/u', ' ', (string) ($nilai ?? ''));
    return trim((string) $teks);
}

function teks_field($nilai, string $field, string $label, int $maks, array &$errors): string
{
    $teks = rapikan_teks($nilai);
    if ($teks === '') {
        $errors[$field] = $label . ' wajib diisi.';
        return '';
    }
    if (mb_strlen($teks) > $maks) {
        $errors[$field] = $label . ' maksimal ' . $maks . ' karakter.';
        return '';
    }
    return $teks;
}

function teks_opsional($nilai, string $field, string $label, int $maks, array &$errors): string
{
    $teks = rapikan_teks($nilai);
    if (mb_strlen($teks) > $maks) {
        $errors[$field] = $label . ' maksimal ' . $maks . ' karakter.';
        return '';
    }
    return $teks;
}

function bulat_opsional($nilai, string $field, string $label, int $min, int $maks, array &$errors): ?int
{
    if ($nilai === null || $nilai === '') {
        return null;
    }
    if (is_bool($nilai) || !is_numeric($nilai)) {
        $errors[$field] = $label . ' tidak valid.';
        return null;
    }
    $angka = (float) $nilai;
    if (floor($angka) != $angka) {
        $errors[$field] = $label . ' harus bilangan bulat.';
        return null;
    }
    $angka = (int) $angka;
    if ($angka < $min || $angka > $maks) {
        $errors[$field] = $label . ' harus bernilai ' . $min . '-' . $maks . '.';
        return null;
    }
    return $angka;
}

function honor_opsional($nilai, array &$errors): ?int
{
    if ($nilai === null || $nilai === '') {
        return null;
    }
    if (is_int($nilai)) {
        $angka = $nilai;
    } elseif (is_float($nilai) && floor($nilai) === $nilai) {
        $angka = (int) $nilai;
    } else {
        $bersih = str_replace('.', '', trim((string) $nilai));
        if (!preg_match('/^\d+$/', $bersih)) {
            $errors['honor'] = 'Honor harus berupa angka bulat minimal 0.';
            return null;
        }
        $angka = (int) $bersih;
    }
    if ($angka < 0) {
        $errors['honor'] = 'Honor harus berupa angka bulat minimal 0.';
        return null;
    }
    return $angka;
}

function tahun_opsional($nilai, array &$errors): ?int
{
    return bulat_opsional($nilai, 'tahun', 'Tahun', TAHUN_MIN, TAHUN_MAKS, $errors);
}

function cari_petugas_nama(string $nama): ?array
{
    $stmt = db()->prepare('SELECT id, nama, urutan FROM petugas WHERE nama = ? LIMIT 1');
    $stmt->execute([$nama]);
    $baris = $stmt->fetch();
    return $baris === false ? null : $baris;
}

function cari_jenis_nama(string $nama): ?array
{
    $stmt = db()->prepare('SELECT id, nama, urutan FROM jenis_kegiatan WHERE nama = ? LIMIT 1');
    $stmt->execute([$nama]);
    $baris = $stmt->fetch();
    return $baris === false ? null : $baris;
}

function urutan_petugas_berikutnya(): int
{
    return (int) db()->query('SELECT COALESCE(MAX(urutan), 0) + 1 FROM petugas')->fetchColumn();
}

function urutan_jenis_berikutnya(): int
{
    return (int) db()->query('SELECT COALESCE(MAX(urutan), 0) + 1 FROM jenis_kegiatan')->fetchColumn();
}

function urutan_nama_kegiatan_berikutnya(): int
{
    return (int) db()->query('SELECT COALESCE(MAX(urutan), 0) + 1 FROM nama_kegiatan')->fetchColumn();
}

function baris_petugas(int $id): array
{
    $stmt = db()->prepare('SELECT id, nama, urutan, versi FROM petugas WHERE id = ?');
    $stmt->execute([$id]);
    $baris = $stmt->fetch();
    if ($baris === false) {
        gagal(404, 'Petugas tidak ditemukan.');
    }
    return [
        'id' => (int) $baris['id'],
        'nama' => (string) $baris['nama'],
        'urutan' => (int) $baris['urutan'],
        'versi' => (int) $baris['versi'],
    ];
}

function baris_jenis(int $id): array
{
    $stmt = db()->prepare('SELECT id, nama, urutan, versi FROM jenis_kegiatan WHERE id = ?');
    $stmt->execute([$id]);
    $baris = $stmt->fetch();
    if ($baris === false) {
        gagal(404, 'Jenis kegiatan tidak ditemukan.');
    }
    return [
        'id' => (int) $baris['id'],
        'nama' => (string) $baris['nama'],
        'urutan' => (int) $baris['urutan'],
        'versi' => (int) $baris['versi'],
    ];
}

/** Cek apakah baris belum diubah admin lain sejak dibaca klien. */
function periksa_versi(string $tabel, int $id, $versi): void
{
    if ($versi === null || $versi === '') {
        return;
    }
    $stmt = db()->prepare('SELECT versi FROM ' . $tabel . ' WHERE id = ?');
    $stmt->execute([$id]);
    $sekarang = $stmt->fetchColumn();
    if ($sekarang === false) {
        gagal(404, 'Data tidak ditemukan.');
    }
    if ((int) $sekarang !== (int) $versi) {
        gagal(409, 'Data ini baru saja diubah admin lain. Muat ulang halaman lalu ulangi perubahan Anda.');
    }
}
