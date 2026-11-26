<?php
/**
 * Mengosongkan data aplikasi di database.
 *
 * Secara bawaan akun admin dipertahankan agar masih bisa masuk setelah reset.
 * Data master penugasan, petugas, jenis kegiatan, posisi, limit honor, template
 * tersimpan, log, dan semua sesi login ikut dihapus.
 *
 * Pemakaian:
 *   php tools/reset-data.php              # interaktif, konfirmasi dengan mengetik HAPUS
 *   php tools/reset-data.php --ya         # tanpa konfirmasi
 *   php tools/reset-data.php --semua      # hapus juga akun admin dan nama kegiatan
 *   php tools/reset-data.php --lihat      # hanya tampilkan rencana, tidak menghapus
 *
 * Lewat npm (argumen tambahan dipisah `--`):
 *   npm run reset
 *   npm run reset -- --ya
 *   npm run reset -- --semua --ya
 */

declare(strict_types=1);

$root = dirname(__DIR__);
$config = require $root . '/api/config.php';
$host = (string) ($config['db_host'] ?? '127.0.0.1');
$name = (string) ($config['db_name'] ?? 'db_selaras');
$user = (string) ($config['db_user'] ?? 'root');
$pass = (string) ($config['db_pass'] ?? '');

// Urutan penting: penugasan lebih dulu karena posisi/petugas dirujuk dengan
// ON DELETE RESTRICT. Sesi dihapus sebelum admin karena foreign key-nya.
const TABEL_DATA = [
    'penugasan',
    'posisi_limit',
    'posisi_petugas',
    'petugas',
    'jenis_kegiatan',
    'template_ekspor',
    'log',
    'sesi',
    'login_gagal',
];

// Hanya ikut terhapus dengan --semua.
const TABEL_PENUH = ['nama_kegiatan', 'admin'];

// Tabel dengan kolom AUTO_INCREMENT yang perlu dimulai ulang dari 1.
const TABEL_AUTO_INCREMENT = [
    'penugasan',
    'posisi_petugas',
    'petugas',
    'jenis_kegiatan',
    'log',
    'login_gagal',
    'nama_kegiatan',
    'admin',
];

$opsi = array_slice($argv, 1);
$semua = in_array('--semua', $opsi, true);
$tanpaKonfirmasi = in_array('--ya', $opsi, true) || in_array('-y', $opsi, true);
$lihatSaja = in_array('--lihat', $opsi, true) || in_array('--dry-run', $opsi, true);
$bantuan = in_array('--bantuan', $opsi, true) || in_array('-h', $opsi, true) || in_array('--help', $opsi, true);

$dikenal = ['--semua', '--ya', '-y', '--lihat', '--dry-run', '--bantuan', '-h', '--help'];
$tidakDikenal = array_diff($opsi, $dikenal);
if ($tidakDikenal !== []) {
    fwrite(STDERR, 'Opsi tidak dikenal: ' . implode(', ', $tidakDikenal) . "\n");
    fwrite(STDERR, "Jalankan php tools/reset-data.php --bantuan untuk daftar opsi.\n");
    exit(1);
}

if ($bantuan) {
    echo <<<TXT
    Mengosongkan data Dashboard Honor & Penugasan Petugas.

    Pemakaian:
      php tools/reset-data.php [opsi]

    Opsi:
      --ya, -y     Lewati konfirmasi (untuk skrip otomatis)
      --semua      Hapus juga akun admin dan master nama kegiatan
      --lihat      Tampilkan data yang akan dihapus tanpa menghapus
      --bantuan    Tampilkan bantuan ini

    Tanpa --semua, akun admin, tabel meta, dan master nama kegiatan dipertahankan.

    TXT;
    exit(0);
}

function tabelAda(PDO $pdo, string $tabel): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
    );
    $stmt->execute([$tabel]);
    return (int) $stmt->fetchColumn() > 0;
}

function hitungBaris(PDO $pdo, string $tabel): int
{
    return (int) $pdo->query('SELECT COUNT(*) FROM `' . $tabel . '`')->fetchColumn();
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
    fwrite(STDERR, "Pastikan MySQL aktif dan api/config.php memakai user/password yang benar.\n");
    exit(1);
}

$semuaTabel = array_merge(TABEL_DATA, $semua ? TABEL_PENUH : []);
$akanDihapus = [];
foreach ($semuaTabel as $tabel) {
    if (tabelAda($pdo, $tabel)) {
        $akanDihapus[$tabel] = hitungBaris($pdo, $tabel);
    }
}

$dipertahankan = [];
foreach (array_merge(['meta'], $semua ? [] : TABEL_PENUH) as $tabel) {
    if (tabelAda($pdo, $tabel)) {
        $dipertahankan[$tabel] = hitungBaris($pdo, $tabel);
    }
}

$total = array_sum($akanDihapus);

echo "Database : {$name} ({$host})\n";
echo "Mode     : " . ($semua ? "hapus SEMUA termasuk akun admin\n" : "hapus data operasional, admin dipertahankan\n");
echo "\n";

if ($total === 0) {
    echo "Tidak ada data untuk dihapus. Database sudah kosong.\n";
    exit(0);
}

echo "Data yang akan dihapus:\n";
foreach ($akanDihapus as $tabel => $jumlah) {
    printf("  %-18s %6d baris\n", $tabel, $jumlah);
}
echo "  " . str_repeat('-', 26) . "\n";
printf("  %-18s %6d baris\n", 'total', $total);

if ($dipertahankan !== []) {
    echo "\nDipertahankan:\n";
    foreach ($dipertahankan as $tabel => $jumlah) {
        printf("  %-18s %6d baris\n", $tabel, $jumlah);
    }
}

if ($lihatSaja) {
    echo "\nMode lihat saja: tidak ada yang dihapus.\n";
    exit(0);
}

if ($semua) {
    echo "\nPERINGATAN: semua akun admin ikut dihapus. Setelah ini buat akun baru\n";
    echo "dengan `npm run admin` (atau `php tools/tambah-admin.php`).\n";
}

if (!$tanpaKonfirmasi) {
    echo "\nKetik HAPUS untuk melanjutkan, atau Enter untuk membatalkan: ";
    $jawab = fgets(STDIN);
    if (trim((string) $jawab) !== 'HAPUS') {
        echo "Dibatalkan. Tidak ada data yang dihapus.\n";
        exit(0);
    }
}

$pdo->beginTransaction();
try {
    foreach (array_keys($akanDihapus) as $tabel) {
        $pdo->exec('DELETE FROM `' . $tabel . '`');
    }
    // Beri tahu tab browser yang masih terbuka bahwa data berubah.
    if (tabelAda($pdo, 'meta')) {
        $pdo->exec("UPDATE meta SET nilai = CAST(nilai AS UNSIGNED) + 1 WHERE kunci = 'revisi'");
        $pdo->prepare("UPDATE meta SET nilai = ? WHERE kunci = 'diperbarui'")
            ->execute([date('Y-m-d\TH:i:s')]);
    }
    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "Gagal menghapus data: {$error->getMessage()}\n");
    fwrite(STDERR, "Tidak ada perubahan yang disimpan.\n");
    exit(1);
}

// AUTO_INCREMENT direset di luar transaksi karena ALTER TABLE melakukan commit
// implisit. Kegagalan di sini tidak membatalkan penghapusan data.
foreach (array_keys($akanDihapus) as $tabel) {
    if (!in_array($tabel, TABEL_AUTO_INCREMENT, true)) {
        continue;
    }
    try {
        $pdo->exec('ALTER TABLE `' . $tabel . '` AUTO_INCREMENT = 1');
    } catch (Throwable $error) {
        fwrite(STDERR, "Catatan: AUTO_INCREMENT {$tabel} tidak bisa direset: {$error->getMessage()}\n");
    }
}

echo "\nSelesai. {$total} baris dihapus";
echo $dipertahankan !== [] ? ', data yang dipertahankan tidak berubah' : '';
echo ".\n";
if ($semua) {
    echo "Semua admin terhapus. Buat akun baru: npm run admin\n";
}
