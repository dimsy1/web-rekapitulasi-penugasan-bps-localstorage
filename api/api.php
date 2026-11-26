<?php
/**
 * Router API Dashboard Honor.
 *
 * Semua permintaan mengembalikan JSON. Aksi baca boleh memakai GET,
 * aksi tulis memakai POST + header X-Requested-With: dashboard-honor.
 */

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$aksi = isset($_GET['aksi']) ? (string) $_GET['aksi'] : '';
$metode = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

/** Aksi yang hanya membaca data; sisanya wajib POST + header CSRF. */
const AKSI_BACA = ['sehat', 'sesi', 'bootstrap', 'revisi', 'log', 'template.ambil'];

if ($metode === 'POST') {
    pastikan_csrf();
} elseif (!in_array($aksi, AKSI_BACA, true)) {
    // Tanpa aturan ini, tautan GET dari situs lain bisa mengubah data karena
    // cookie sesi ikut terkirim pada navigasi (SameSite=Lax).
    gagal(405, 'Aksi ini harus dikirim dengan metode POST.');
}

try {
    switch ($aksi) {
        /* ------------------------------------------------------------------
           Diagnostik & autentikasi
           ------------------------------------------------------------------ */
        case 'sehat': {
            $dbSiap = true;
            $pesan = null;
            try {
                db()->query('SELECT 1');
            } catch (Throwable $kesalahan) {
                $dbSiap = false;
                $pesan = $kesalahan->getMessage();
            }
            jawab([
                'ok' => true,
                'php' => PHP_VERSION,
                'db' => $dbSiap,
                'pesan' => $pesan,
                'waktu' => date('c'),
            ]);
        }

        case 'masuk': {
            if ($metode !== 'POST') {
                gagal(405, 'Gunakan POST untuk masuk.');
            }
            $input = masukan_json();
            $username = rapikan_teks($input['username'] ?? '');
            $sandi = (string) ($input['password'] ?? '');

            if ($username === '' || $sandi === '') {
                gagal(400, 'Username dan password wajib diisi.');
            }

            $ip = ip_klien();

            $cek = db()->prepare(
                'SELECT COUNT(*) FROM login_gagal
                  WHERE waktu > (NOW() - INTERVAL 15 MINUTE) AND (ip = ? OR username = ?)'
            );
            $cek->execute([$ip, $username]);
            if ((int) $cek->fetchColumn() >= 8) {
                gagal(429, 'Terlalu banyak percobaan masuk. Coba lagi 15 menit lagi.');
            }

            $stmt = db()->prepare(
                'SELECT id, username, kata_sandi FROM admin WHERE username = ? LIMIT 1'
            );
            $stmt->execute([$username]);
            $baris = $stmt->fetch();

            if ($baris === false || !password_verify($sandi, (string) $baris['kata_sandi'])) {
                $catat = db()->prepare(
                    'INSERT INTO login_gagal (ip, username, waktu) VALUES (?, ?, NOW())'
                );
                $catat->execute([$ip, $username]);
                usleep(300000);
                gagal(401, 'Username atau password salah.');
            }

            db()->prepare('DELETE FROM login_gagal WHERE ip = ? OR username = ?')
                ->execute([$ip, $username]);

            if (random_int(1, 10) === 1) {
                db()->exec('DELETE FROM sesi WHERE kedaluwarsa < NOW()');
            }

            $token = token_acak();
            $jam = max(1, (int) konfig('sesi_jam', 8));
            $detik = $jam * 3600;
            $kedaluwarsa = date('Y-m-d H:i:s', time() + $detik);

            // Kedaluwarsa dihitung oleh MySQL agar selalu sejalan dengan
            // perbandingan `kedaluwarsa > NOW()` di sesi_aktif().
            $simpan = db()->prepare(
                'INSERT INTO sesi (token_hash, admin_id, dibuat_pada, kedaluwarsa, terakhir_dipakai, ip, user_agent)
                 VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? HOUR), NOW(), ?, ?)'
            );
            $simpan->execute([
                hash_token($token),
                (int) $baris['id'],
                $jam,
                $ip,
                substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            ]);

            pasang_cookie_sesi($token, $detik);

            $admin = [
                'id' => (int) $baris['id'],
                'username' => (string) $baris['username'],
            ];
            catat_log($admin, 'masuk');

            jawab([
                'ok' => true,
                'admin' => $admin,
                'kedaluwarsa' => $kedaluwarsa,
            ]);
        }

        case 'keluar': {
            $admin = sesi_aktif();
            $token = (string) ($_COOKIE[COOKIE_SESI] ?? '');
            if (preg_match('/^[a-f0-9]{64}$/', $token)) {
                db()->prepare('DELETE FROM sesi WHERE token_hash = ?')
                    ->execute([hash_token($token)]);
            }
            hapus_cookie_sesi();
            if ($admin !== null) {
                catat_log($admin, 'keluar');
            }
            jawab(['ok' => true]);
        }

        case 'sesi': {
            $admin = sesi_aktif();
            jawab([
                'ok' => true,
                'masuk' => $admin !== null,
                'admin' => $admin,
            ]);
        }

        /* ------------------------------------------------------------------
           Baca data
           ------------------------------------------------------------------ */
        case 'bootstrap': {
            $admin = wajib_masuk();
            $dataset = dataset_lengkap();

            $template = null;
            $stmt = db()->query(
                'SELECT nama, ukuran, disimpan_pada FROM template_ekspor WHERE id = 1'
            );
            $baris = $stmt->fetch();
            if ($baris !== false && $baris['nama'] !== null) {
                $template = [
                    'nama' => (string) $baris['nama'],
                    'bytes' => (int) $baris['ukuran'],
                    'disimpan' => $baris['disimpan_pada'] === null ? null : (string) $baris['disimpan_pada'],
                ];
            } else {
                $bawaan = __DIR__ . '/../data/template-matriks.xlsx';
                if (is_file($bawaan)) {
                    $template = [
                        'nama' => 'template-matriks.xlsx',
                        'bytes' => (int) filesize($bawaan),
                        'disimpan' => null,
                    ];
                }
            }

            jawab([
                'ok' => true,
                'admin' => $admin,
                'revisi' => (int) $dataset['revisi'],
                'dataset' => $dataset,
                'template' => $template,
            ]);
        }

        case 'revisi': {
            wajib_masuk();
            $revisi = (int) db()->query("SELECT nilai FROM meta WHERE kunci = 'revisi'")->fetchColumn();
            jawab(['ok' => true, 'revisi' => $revisi]);
        }

        case 'log': {
            wajib_masuk();
            $batas = isset($_GET['batas']) ? (int) $_GET['batas'] : 100;
            $batas = max(1, min(200, $batas));
            $stmt = db()->prepare(
                'SELECT waktu, admin_nama, aksi, target, ringkasan
                   FROM log ORDER BY id DESC LIMIT ' . $batas
            );
            $stmt->execute();
            jawab(['ok' => true, 'data' => $stmt->fetchAll()]);
        }

        /* ------------------------------------------------------------------
           Penugasan
           ------------------------------------------------------------------ */
        case 'penugasan.buat': {
            $admin = wajib_masuk();
            $input = masukan_json();
            $data = siapkan_data_penugasan($input);
            $pdo = db();

            $pdo->beginTransaction();
            try {
                $petugasId = pastikan_petugas($data);
                $id = simpan_penugasan_baru($petugasId, $data, (int) $admin['id']);
                naikkan_revisi();
                catat_log(
                    $admin,
                    'penugasan.buat',
                    'penugasan#' . $id,
                    sprintf('%s · %s', $data['nama_petugas'], $data['nama_pekerjaan'] !== '' ? $data['nama_pekerjaan'] : 'tanpa pekerjaan')
                );
                $pdo->commit();
            } catch (Throwable $kesalahan) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $kesalahan;
            }

            $dataset = dataset_lengkap();
            jawab([
                'ok' => true,
                'pesan' => 'Penugasan berhasil ditambahkan.',
                'id' => $id,
                'revisi' => (int) $dataset['revisi'],
                'dataset' => $dataset,
            ]);
        }

        case 'penugasan.ubah': {
            $admin = wajib_masuk();
            $input = masukan_json();
            $id = ambil_id($input);
            $lama = ambil_penugasan($id);
            $data = siapkan_data_penugasan($input);
            periksa_versi('penugasan', $id, $input['versi'] ?? null);

            $pdo = db();
            $pdo->beginTransaction();
            try {
                $petugasId = pastikan_petugas($data);
                $stmt = $pdo->prepare(
                    'UPDATE penugasan
                        SET petugas_id = ?, jenis_kegiatan_id = ?, posisi_id = ?,
                            nama_kegiatan_id = ?, bulan = ?, tahun = ?, honor = ?,
                            versi = versi + 1, diperbarui_oleh = ?, diubah_pada = NOW()
                      WHERE id = ?'
                );
                $stmt->execute([
                    $petugasId,
                    $data['jenis_kegiatan_id'],
                    $data['posisi_id'],
                    $data['nama_kegiatan_id'],
                    $data['bulan'],
                    $data['tahun'],
                    $data['honor'],
                    (int) $admin['id'],
                    $id,
                ]);
                naikkan_revisi();
                catat_log($admin, 'penugasan.ubah', 'penugasan#' . $id, $data['nama_pekerjaan']);
                $pdo->commit();
            } catch (Throwable $kesalahan) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $kesalahan;
            }

            $dataset = dataset_lengkap();
            jawab([
                'ok' => true,
                'pesan' => 'Penugasan berhasil diperbarui.',
                'id' => $id,
                'revisi' => (int) $dataset['revisi'],
                'dataset' => $dataset,
            ]);
        }

        case 'penugasan.hapus': {
            $admin = wajib_masuk();
            $input = masukan_json();
            $id = ambil_id($input);
            $lama = ambil_penugasan($id);

            $pdo = db();
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare('DELETE FROM penugasan WHERE id = ?');
                $stmt->execute([$id]);
                if ($stmt->rowCount() === 0) {
                    gagal(404, 'Penugasan tidak ditemukan.');
                }
                naikkan_revisi();
                catat_log($admin, 'penugasan.hapus', 'penugasan#' . $id, (string) ($lama['nama_kegiatan'] ?? ''));
                $pdo->commit();
            } catch (Throwable $kesalahan) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $kesalahan;
            }

            $dataset = dataset_lengkap();
            jawab([
                'ok' => true,
                'pesan' => 'Penugasan berhasil dihapus.',
                'revisi' => (int) $dataset['revisi'],
                'dataset' => $dataset,
            ]);
        }

        /* ------------------------------------------------------------------
           Petugas
           ------------------------------------------------------------------ */
        case 'petugas.buat': {
            $admin = wajib_masuk();
            $input = masukan_json();
            $errors = [];
            $nama = teks_field($input['nama'] ?? '', 'nama', 'Nama petugas', 150, $errors);
            if ($errors) {
                gagal(400, 'Nama petugas belum valid.', $errors);
            }
            if (cari_petugas_nama($nama) !== null) {
                gagal(400, 'Nama petugas sudah ada.', ['nama' => 'Nama petugas sudah ada.']);
            }

            $pdo = db();
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare(
                    'INSERT INTO petugas (nama, urutan, versi, dibuat_pada, diubah_pada)
                     VALUES (?, ?, 1, NOW(), NOW())'
                );
                $stmt->execute([$nama, urutan_petugas_berikutnya()]);
                $id = (int) $pdo->lastInsertId();
                naikkan_revisi();
                catat_log($admin, 'petugas.buat', 'petugas#' . $id, $nama);
                $pdo->commit();
            } catch (Throwable $kesalahan) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $kesalahan;
            }

            $dataset = dataset_lengkap();
            jawab([
                'ok' => true,
                'pesan' => 'Petugas berhasil ditambahkan.',
                'id' => $id,
                'revisi' => (int) $dataset['revisi'],
                'dataset' => $dataset,
            ]);
        }

        case 'petugas.ubah': {
            $admin = wajib_masuk();
            $input = masukan_json();
            $id = ambil_id($input);
            $errors = [];
            $nama = teks_field($input['nama'] ?? '', 'nama', 'Nama petugas', 150, $errors);
            if ($errors) {
                gagal(400, 'Nama petugas belum valid.', $errors);
            }
            $baris = baris_petugas($id);
            periksa_versi('petugas', $id, $input['versi'] ?? null);

            $ada = cari_petugas_nama($nama);
            if ($ada !== null && (int) $ada['id'] !== $id) {
                gagal(400, 'Nama petugas sudah ada.', ['nama' => 'Nama petugas sudah ada.']);
            }

            $pdo = db();
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare(
                    'UPDATE petugas SET nama = ?, versi = versi + 1, diubah_pada = NOW() WHERE id = ?'
                );
                $stmt->execute([$nama, $id]);
                naikkan_revisi();
                catat_log($admin, 'petugas.ubah', 'petugas#' . $id, $baris['nama'] . ' → ' . $nama);
                $pdo->commit();
            } catch (Throwable $kesalahan) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $kesalahan;
            }

            $dataset = dataset_lengkap();
            jawab([
                'ok' => true,
                'pesan' => 'Petugas berhasil diperbarui.',
                'id' => $id,
                'revisi' => (int) $dataset['revisi'],
                'dataset' => $dataset,
            ]);
        }

        case 'petugas.hapus': {
            $admin = wajib_masuk();
            $input = masukan_json();
            $id = ambil_id($input);
            $baris = baris_petugas($id);

            $pdo = db();
            $pdo->beginTransaction();
            try {
                $cek = $pdo->prepare('SELECT COUNT(*) FROM penugasan WHERE petugas_id = ? FOR UPDATE');
                $cek->execute([$id]);
                if ((int) $cek->fetchColumn() > 0) {
                    gagal(409, 'Petugas ini masih punya data penugasan.');
                }
                $pdo->prepare('DELETE FROM petugas WHERE id = ?')->execute([$id]);
                naikkan_revisi();
                catat_log($admin, 'petugas.hapus', 'petugas#' . $id, $baris['nama']);
                $pdo->commit();
            } catch (Throwable $kesalahan) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $kesalahan;
            }

            $dataset = dataset_lengkap();
            jawab([
                'ok' => true,
                'pesan' => 'Petugas berhasil dihapus.',
                'revisi' => (int) $dataset['revisi'],
                'dataset' => $dataset,
            ]);
        }

        /* ------------------------------------------------------------------
           Jenis kegiatan
           ------------------------------------------------------------------ */
        case 'jenis.buat': {
            $admin = wajib_masuk();
            $input = masukan_json();
            $errors = [];
            $nama = teks_field($input['nama'] ?? '', 'nama', 'Nama jenis kegiatan', 100, $errors);
            $tahun = tahun_opsional($input['tahun'] ?? null, $errors);
            if ($tahun === null && !isset($errors['tahun'])) {
                $errors['tahun'] = 'Tahun limit honor wajib diisi.';
            }
            $daftarPosisi = validasi_posisi_payload(
                $input['posisi'] ?? null,
                $tahun ?? TAHUN_MIN,
                true,
                $errors
            );
            if ($errors !== []) {
                gagal(400, 'Data jenis kegiatan belum valid.', $errors);
            }
            if (cari_jenis_nama($nama) !== null) {
                gagal(400, 'Nama jenis kegiatan sudah digunakan.', [
                    'nama' => 'Nama jenis kegiatan sudah digunakan.',
                ]);
            }

            $pdo = db();
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare(
                    'INSERT INTO jenis_kegiatan (nama, urutan, versi, dibuat_pada, diubah_pada)
                     VALUES (?, ?, 1, NOW(), NOW())'
                );
                $stmt->execute([$nama, urutan_jenis_berikutnya()]);
                $id = (int) $pdo->lastInsertId();
                simpan_posisi_jenis($pdo, $id, $daftarPosisi, $tahun);
                naikkan_revisi();
                catat_log(
                    $admin,
                    'jenis.buat',
                    'jenis#' . $id,
                    $nama . ' · ' . count($daftarPosisi) . ' posisi'
                );
                $pdo->commit();
            } catch (Throwable $kesalahan) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $kesalahan;
            }

            $dataset = dataset_lengkap();
            jawab([
                'ok' => true,
                'pesan' => 'Jenis kegiatan berhasil ditambahkan.',
                'id' => $id,
                'revisi' => (int) $dataset['revisi'],
                'dataset' => $dataset,
            ]);
        }

        case 'jenis.ubah': {
            $admin = wajib_masuk();
            $input = masukan_json();
            $id = ambil_id($input);
            $errors = [];
            $nama = teks_field($input['nama'] ?? '', 'nama', 'Nama jenis kegiatan', 100, $errors);
            $baris = baris_jenis($id);
            periksa_versi('jenis_kegiatan', $id, $input['versi'] ?? null);

            $ada = cari_jenis_nama($nama);
            if ($ada !== null && (int) $ada['id'] !== $id) {
                gagal(400, 'Nama jenis kegiatan sudah digunakan.', [
                    'nama' => 'Nama jenis kegiatan sudah digunakan.',
                ]);
            }

            $ubahPosisi = array_key_exists('posisi', $input);
            $tahun = tahun_opsional($input['tahun'] ?? null, $errors);
            $daftarPosisi = [];
            if ($ubahPosisi) {
                if ($tahun === null && !isset($errors['tahun'])) {
                    $errors['tahun'] = 'Tahun limit honor wajib diisi.';
                }
                $daftarPosisi = validasi_posisi_payload(
                    $input['posisi'],
                    $tahun ?? TAHUN_MIN,
                    false,
                    $errors
                );
                $idPosisiMilikJenis = [];
                $cekPosisi = db()->prepare(
                    'SELECT id FROM posisi_petugas WHERE jenis_kegiatan_id = ?'
                );
                $cekPosisi->execute([$id]);
                foreach ($cekPosisi->fetchAll() as $item) {
                    $idPosisiMilikJenis[(int) $item['id']] = true;
                }
                foreach ($daftarPosisi as $item) {
                    if ($item['id'] !== null && !isset($idPosisiMilikJenis[$item['id']])) {
                        $errors['posisi'] = 'Ada posisi yang bukan milik jenis kegiatan ini.';
                    }
                }
            }
            if ($errors !== []) {
                gagal(400, 'Data jenis kegiatan belum valid.', $errors);
            }

            $pdo = db();
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare(
                    'UPDATE jenis_kegiatan SET nama = ?, versi = versi + 1, diubah_pada = NOW() WHERE id = ?'
                );
                $stmt->execute([$nama, $id]);

                $ringkasanPosisi = '';
                if ($ubahPosisi) {
                    $ringkasanPosisi = perbarui_posisi_jenis($pdo, $id, $daftarPosisi, $tahun);
                }

                naikkan_revisi();
                catat_log(
                    $admin,
                    'jenis.ubah',
                    'jenis#' . $id,
                    $baris['nama'] . ' → ' . $nama . $ringkasanPosisi
                );
                $pdo->commit();
            } catch (Throwable $kesalahan) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $kesalahan;
            }

            $dataset = dataset_lengkap();
            jawab([
                'ok' => true,
                'pesan' => 'Jenis kegiatan berhasil diperbarui.',
                'id' => $id,
                'revisi' => (int) $dataset['revisi'],
                'dataset' => $dataset,
            ]);
        }

        case 'jenis.hapus': {
            $admin = wajib_masuk();
            $input = masukan_json();
            $id = ambil_id($input);
            $baris = baris_jenis($id);

            $pdo = db();
            $pdo->beginTransaction();
            try {
                $cek = $pdo->prepare('SELECT COUNT(*) FROM penugasan WHERE jenis_kegiatan_id = ? FOR UPDATE');
                $cek->execute([$id]);
                if ((int) $cek->fetchColumn() > 0) {
                    gagal(409, 'Jenis ini sudah dipakai pada data penugasan.');
                }
                $cekPosisi = $pdo->prepare(
                    'SELECT COUNT(*) FROM penugasan p
                       INNER JOIN posisi_petugas ps ON ps.id = p.posisi_id
                      WHERE ps.jenis_kegiatan_id = ?'
                );
                $cekPosisi->execute([$id]);
                if ((int) $cekPosisi->fetchColumn() > 0) {
                    gagal(409, 'Posisi pada jenis ini masih dipakai data penugasan.');
                }
                $pdo->prepare('DELETE FROM jenis_kegiatan WHERE id = ?')->execute([$id]);
                naikkan_revisi();
                catat_log($admin, 'jenis.hapus', 'jenis#' . $id, $baris['nama']);
                $pdo->commit();
            } catch (Throwable $kesalahan) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $kesalahan;
            }

            $dataset = dataset_lengkap();
            jawab([
                'ok' => true,
                'pesan' => 'Jenis kegiatan berhasil dihapus.',
                'revisi' => (int) $dataset['revisi'],
                'dataset' => $dataset,
            ]);
        }

        /* ------------------------------------------------------------------
           Impor massal (dipakai halaman Data & Excel)
           ------------------------------------------------------------------ */
        case 'impor': {
            $admin = wajib_masuk();
            $input = masukan_json();
            $barisMasuk = $input['penugasan'] ?? [];
            if (!is_array($barisMasuk)) {
                gagal(400, 'Data impor tidak valid.');
            }
            if (count($barisMasuk) > 500) {
                gagal(413, 'Kirim impor maksimal 500 baris per permintaan.');
            }

            $petugasNama = is_array($input['petugas'] ?? null) ? $input['petugas'] : [];
            $jenisNama = is_array($input['jenis'] ?? null) ? $input['jenis'] : [];
            $tahunAnalisis = isset($input['tahunAnalisis']) ? (int) $input['tahunAnalisis'] : 0;

            $pdo = db();
            $jumlahPetugas = 0;
            $jumlahJenis = 0;
            $jumlahPenugasan = 0;
            $dilewati = 0;

            $pdo->beginTransaction();
            try {
                foreach ($petugasNama as $nama) {
                    $nama = rapikan_teks($nama);
                    if ($nama === '') {
                        continue;
                    }
                    if (cari_petugas_nama($nama) === null) {
                        $stmt = $pdo->prepare(
                            'INSERT INTO petugas (nama, urutan, versi, dibuat_pada, diubah_pada)
                             VALUES (?, ?, 1, NOW(), NOW())'
                        );
                        $stmt->execute([mb_substr($nama, 0, 150), urutan_petugas_berikutnya()]);
                        $jumlahPetugas++;
                    }
                }

                foreach ($jenisNama as $nama) {
                    $nama = rapikan_teks($nama);
                    if ($nama === '') {
                        continue;
                    }
                    if (cari_jenis_nama($nama) === null) {
                        $stmt = $pdo->prepare(
                            'INSERT INTO jenis_kegiatan (nama, urutan, versi, dibuat_pada, diubah_pada)
                             VALUES (?, ?, 1, NOW(), NOW())'
                        );
                        $stmt->execute([mb_substr($nama, 0, 100), urutan_jenis_berikutnya()]);
                        $jumlahJenis++;
                    }
                }

                $sisip = $pdo->prepare(
                    'INSERT INTO penugasan
                        (petugas_id, jenis_kegiatan_id, posisi_id, nama_kegiatan_id, bulan, tahun, honor,
                         versi, diperbarui_oleh, dibuat_pada, diubah_pada)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())'
                );

                foreach ($barisMasuk as $baris) {
                    $errors = [];
                    $namaPetugas = teks_field(
                        $baris['nama_petugas'] ?? '',
                        'petugas_id',
                        'Nama petugas',
                        150,
                        $errors
                    );
                    $namaPosisi = teks_opsional(
                        $baris['nama_posisi'] ?? '',
                        'posisi_id',
                        'Posisi petugas',
                        100,
                        $errors
                    );
                    $pekerjaan = teks_opsional(
                        $baris['nama_pekerjaan'] ?? ($baris['nama_kegiatan_nama'] ?? ''),
                        'nama_pekerjaan',
                        'Nama pekerjaan/kegiatan',
                        255,
                        $errors
                    );
                    $bulan = bulat_opsional($baris['bulan'] ?? null, 'bulan', 'Bulan', 1, 12, $errors);
                    $tahun = tahun_opsional($baris['tahun'] ?? null, $errors);
                    $honor = honor_opsional($baris['honor'] ?? null, $errors);

                    $namaJenis = rapikan_teks($baris['nama_jenis'] ?? '');
                    if ($errors !== []) {
                        $dilewati++;
                        continue;
                    }

                    $namaKegiatanId = null;
                    if ($pekerjaan !== '') {
                        $cariKegiatan = $pdo->prepare(
                            'SELECT id FROM nama_kegiatan WHERE LOWER(nama) = LOWER(?) AND aktif = 1'
                        );
                        $cariKegiatan->execute([$pekerjaan]);
                        $namaKegiatanId = $cariKegiatan->fetchColumn();
                        if ($namaKegiatanId === false) {
                            $buatKegiatan = $pdo->prepare(
                                'INSERT INTO nama_kegiatan (nama, urutan, aktif, dibuat_pada, diubah_pada)
                                 VALUES (?, ?, 1, NOW(), NOW())'
                            );
                            $buatKegiatan->execute([$pekerjaan, urutan_nama_kegiatan_berikutnya()]);
                            $namaKegiatanId = (int) $pdo->lastInsertId();
                        } else {
                            $namaKegiatanId = (int) $namaKegiatanId;
                        }
                    }

                    $petugas = cari_petugas_nama($namaPetugas);
                    if ($petugas === null) {
                        $stmt = $pdo->prepare(
                            'INSERT INTO petugas (nama, urutan, versi, dibuat_pada, diubah_pada)
                             VALUES (?, ?, 1, NOW(), NOW())'
                        );
                        $stmt->execute([$namaPetugas, urutan_petugas_berikutnya()]);
                        $petugasId = (int) $pdo->lastInsertId();
                        $jumlahPetugas++;
                    } else {
                        $petugasId = (int) $petugas['id'];
                    }

                    $jenisId = null;
                    if ($namaJenis !== '') {
                        $jenis = cari_jenis_nama($namaJenis);
                        if ($jenis === null) {
                            $stmt = $pdo->prepare(
                                'INSERT INTO jenis_kegiatan (nama, urutan, versi, dibuat_pada, diubah_pada)
                                 VALUES (?, ?, 1, NOW(), NOW())'
                            );
                            $stmt->execute([mb_substr($namaJenis, 0, 100), urutan_jenis_berikutnya()]);
                            $jenisId = (int) $pdo->lastInsertId();
                            $jumlahJenis++;
                        } else {
                            $jenisId = (int) $jenis['id'];
                        }
                    }

                    // Posisi petugas hanya bisa disimpan bila jenis kegiatannya
                    // ada. Posisi baru dibuat otomatis dari nama di file Excel.
                    $posisiId = null;
                    if ($jenisId !== null && $namaPosisi !== '') {
                        $cariPosisi = $pdo->prepare(
                            'SELECT id FROM posisi_petugas
                              WHERE jenis_kegiatan_id = ? AND LOWER(nama) = LOWER(?)
                              LIMIT 1'
                        );
                        $cariPosisi->execute([$jenisId, $namaPosisi]);
                        $posisiId = $cariPosisi->fetchColumn();
                        if ($posisiId === false) {
                            $stmtPosisi = $pdo->prepare(
                                'INSERT INTO posisi_petugas
                                    (jenis_kegiatan_id, nama, urutan, dibuat_pada, diubah_pada)
                                 VALUES (?, ?, ?, NOW(), NOW())'
                            );
                            $stmtPosisi->execute([
                                $jenisId,
                                $namaPosisi,
                                urutan_posisi_berikutnya($jenisId),
                            ]);
                            $posisiId = (int) $pdo->lastInsertId();
                        } else {
                            $posisiId = (int) $posisiId;
                        }
                    }

                    $sisip->execute([
                        $petugasId,
                        $jenisId,
                        $posisiId,
                        $namaKegiatanId,
                        $bulan,
                        $tahun,
                        $honor,
                        (int) $admin['id'],
                    ]);
                    $jumlahPenugasan++;
                }

                if ($tahunAnalisis >= TAHUN_MIN && $tahunAnalisis <= TAHUN_MAKS) {
                    set_meta('tahun_analisis', (string) $tahunAnalisis);
                }
                naikkan_revisi();
                catat_log(
                    $admin,
                    'impor',
                    'penugasan',
                    sprintf(
                        '%d penugasan, %d petugas baru, %d jenis baru, %d dilewati',
                        $jumlahPenugasan,
                        $jumlahPetugas,
                        $jumlahJenis,
                        $dilewati
                    )
                );
                $pdo->commit();
            } catch (Throwable $kesalahan) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $kesalahan;
            }

            jawab([
                'ok' => true,
                'jumlah' => [
                    'petugas' => $jumlahPetugas,
                    'jenis' => $jumlahJenis,
                    'penugasan' => $jumlahPenugasan,
                    'dilewati' => $dilewati,
                ],
            ]);
        }

        /* ------------------------------------------------------------------
           Template Excel (cetakan ekspor)
           ------------------------------------------------------------------ */
        case 'template.simpan': {
            $admin = wajib_masuk();
            $input = masukan_json();
            $errors = [];
            $nama = teks_opsional($input['nama'] ?? 'template.xlsx', 'nama', 'Nama file', 255, $errors);
            if ($errors !== []) {
                gagal(400, 'Nama file template tidak valid.', $errors);
            }
            $base64 = (string) ($input['base64'] ?? '');
            if ($base64 === '') {
                gagal(400, 'Isi file template belum dikirim.');
            }
            $isi = base64_decode($base64, true);
            if ($isi === false) {
                gagal(400, 'File template tidak valid.');
            }
            $batas = (int) konfig('maks_template', 4 * 1024 * 1024);
            if (strlen($isi) > $batas) {
                gagal(413, 'Ukuran file template terlalu besar (maksimal ' . round($batas / 1024 / 1024) . ' MB).');
            }

            $stmt = db()->prepare(
                'INSERT INTO template_ekspor (id, nama, isi, ukuran, disimpan_pada)
                 VALUES (1, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE
                    nama = VALUES(nama), isi = VALUES(isi), ukuran = VALUES(ukuran),
                    disimpan_pada = VALUES(disimpan_pada)'
            );
            $stmt->execute([$nama === '' ? 'template.xlsx' : $nama, $isi, strlen($isi)]);

            catat_log($admin, 'template.simpan', 'template', $nama . ' · ' . strlen($isi) . ' byte');

            jawab([
                'ok' => true,
                'template' => [
                    'nama' => $nama === '' ? 'template.xlsx' : $nama,
                    'bytes' => strlen($isi),
                    'disimpan' => date('Y-m-d H:i:s'),
                ],
            ]);
        }

        case 'template.ambil': {
            wajib_masuk();
            $baris = db()->query(
                'SELECT nama, isi, ukuran, disimpan_pada FROM template_ekspor WHERE id = 1'
            )->fetch();

            if ($baris === false || $baris['isi'] === null) {
                $bawaan = __DIR__ . '/../data/template-matriks.xlsx';
                if (!is_file($bawaan)) {
                    gagal(404, 'Belum ada template tersimpan.');
                }
                $isi = (string) file_get_contents($bawaan);
                jawab([
                    'ok' => true,
                    'template' => [
                        'nama' => 'template-matriks.xlsx',
                        'base64' => base64_encode($isi),
                        'bytes' => strlen($isi),
                        'bawaan' => true,
                    ],
                ]);
            }

            jawab([
                'ok' => true,
                'template' => [
                    'nama' => (string) $baris['nama'],
                    'base64' => base64_encode((string) $baris['isi']),
                    'bytes' => (int) $baris['ukuran'],
                    'disimpan' => (string) $baris['disimpan_pada'],
                    'bawaan' => false,
                ],
            ]);
        }

        /* ------------------------------------------------------------------
           Reset data
           ------------------------------------------------------------------ */
        case 'reset': {
            $admin = wajib_masuk();
            $pdo = db();

            $pdo->beginTransaction();
            try {
                $pdo->exec('DELETE FROM penugasan');
                $pdo->exec('DELETE FROM petugas');
                $pdo->exec('DELETE FROM jenis_kegiatan');
                naikkan_revisi();
                catat_log($admin, 'reset', 'semua', 'Penugasan, petugas, dan jenis dikosongkan');
                $pdo->commit();
            } catch (Throwable $kesalahan) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $kesalahan;
            }

            $dataset = dataset_lengkap();
            jawab([
                'ok' => true,
                'pesan' => 'Data berhasil dikosongkan.',
                'revisi' => (int) $dataset['revisi'],
                'dataset' => $dataset,
            ]);
        }

        default:
            gagal(404, 'Aksi tidak dikenal.');
    }
} catch (PDOException $kesalahan) {
    if ($kesalahan->getCode() === '23000') {
        gagal(400, 'Data bentrok dengan data lain yang sudah tersimpan.');
    }
    error_log('API PDO: ' . $kesalahan->getMessage());
    gagal(500, 'Terjadi kesalahan pada database. Coba lagi beberapa saat.');
} catch (RuntimeException $kesalahan) {
    gagal(503, $kesalahan->getMessage());
} catch (Throwable $kesalahan) {
    error_log('API: ' . $kesalahan->getMessage() . ' @ ' . $kesalahan->getFile() . ':' . $kesalahan->getLine());
    gagal(500, 'Terjadi kesalahan pada server.');
}

/* -------------------------------------------------------------------------
   Fungsi bantu khusus aksi
   ------------------------------------------------------------------------- */

function ambil_id(array $input): int
{
    $id = isset($input['id']) ? (int) $input['id'] : (int) ($_GET['id'] ?? 0);
    if ($id <= 0) {
        gagal(400, 'ID data tidak valid.');
    }
    return $id;
}

function ambil_penugasan(int $id): array
{
    $stmt = db()->prepare(
        'SELECT p.id, p.petugas_id, p.jenis_kegiatan_id, p.posisi_id, p.nama_kegiatan_id,
                n.nama AS nama_kegiatan, p.bulan, p.tahun, p.honor, p.versi
           FROM penugasan p LEFT JOIN nama_kegiatan n ON n.id = p.nama_kegiatan_id
          WHERE p.id = ?'
    );
    $stmt->execute([$id]);
    $baris = $stmt->fetch();
    if ($baris === false) {
        gagal(404, 'Penugasan tidak ditemukan.');
    }
    return $baris;
}

/**
 * Validasi daftar posisi dari payload jenis kegiatan.
 *
 * @return array<int,array{id:?int,nama:string,urutan:int,limit_honor:?int}>
 */
function validasi_posisi_payload($daftar, int $tahun, bool $wajib, array &$errors): array
{
    if ($daftar === null) {
        if ($wajib) {
            $errors['posisi'] = 'Tambahkan minimal satu posisi petugas.';
        }
        return [];
    }
    if (!is_array($daftar)) {
        $errors['posisi'] = 'Daftar posisi petugas tidak valid.';
        return [];
    }
    if ($wajib && count($daftar) === 0) {
        $errors['posisi'] = 'Tambahkan minimal satu posisi petugas.';
        return [];
    }

    $hasil = [];
    $namaTerpakai = [];
    foreach (array_values($daftar) as $indeks => $item) {
        if (!is_array($item)) {
            $errors['posisi'] = 'Daftar posisi petugas tidak valid.';
            continue;
        }
        $nama = rapikan_teks($item['nama'] ?? '');
        if ($nama === '') {
            $errors['posisi'] = 'Nama posisi petugas wajib diisi.';
            continue;
        }
        if (mb_strlen($nama) > 100) {
            $errors['posisi'] = 'Nama posisi petugas maksimal 100 karakter.';
            continue;
        }
        $kunci = mb_strtolower($nama);
        if (isset($namaTerpakai[$kunci])) {
            $errors['posisi'] = 'Nama posisi petugas tidak boleh sama dalam satu jenis kegiatan.';
            continue;
        }
        $namaTerpakai[$kunci] = true;

        $id = null;
        if (isset($item['id']) && $item['id'] !== '' && $item['id'] !== null) {
            $id = (int) $item['id'];
            if ($id <= 0) {
                $errors['posisi'] = 'Posisi petugas tidak valid.';
                continue;
            }
        }

        $adaLimit =
            isset($item['limit_honor']) &&
            $item['limit_honor'] !== '' &&
            $item['limit_honor'] !== null;
        $limit = null;
        if ($adaLimit) {
            $limit = bulat_opsional($item['limit_honor'], 'posisi', 'Limit honor', 0, PHP_INT_MAX, $errors);
            if ($limit === null) {
                continue;
            }
        } elseif ($wajib) {
            $errors['posisi'] =
                'Limit honor posisi "' . $nama . '" tahun ' . $tahun . ' wajib diisi.';
            continue;
        }

        $hasil[] = [
            'id' => $id,
            'nama' => $nama,
            'urutan' => $indeks + 1,
            'limit_honor' => $limit,
        ];
    }

    return $hasil;
}

function simpan_limit_posisi(PDO $pdo, int $posisiId, int $tahun, int $limit): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO posisi_limit (posisi_id, tahun, limit_honor, diubah_pada)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE limit_honor = VALUES(limit_honor), diubah_pada = VALUES(diubah_pada)'
    );
    $stmt->execute([$posisiId, $tahun, $limit]);
}

function simpan_posisi_jenis(PDO $pdo, int $jenisId, array $daftar, int $tahun): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO posisi_petugas (jenis_kegiatan_id, nama, urutan, dibuat_pada, diubah_pada)
         VALUES (?, ?, ?, NOW(), NOW())'
    );
    foreach ($daftar as $item) {
        $stmt->execute([$jenisId, $item['nama'], $item['urutan']]);
        $posisiId = (int) $pdo->lastInsertId();
        if ($item['limit_honor'] !== null) {
            simpan_limit_posisi($pdo, $posisiId, $tahun, $item['limit_honor']);
        }
    }
}

/**
 * Sinkronkan posisi sebuah jenis dengan payload: ubah yang ada, tambah yang
 * baru, hapus yang tidak dikirim (hanya bila belum dipakai penugasan).
 */
function perbarui_posisi_jenis(PDO $pdo, int $jenisId, array $daftar, int $tahun): string
{
    $stmtLama = $pdo->prepare('SELECT id, nama FROM posisi_petugas WHERE jenis_kegiatan_id = ?');
    $stmtLama->execute([$jenisId]);
    $petaLama = [];
    foreach ($stmtLama->fetchAll() as $baris) {
        $petaLama[(int) $baris['id']] = (string) $baris['nama'];
    }

    $dipertahankan = [];
    foreach ($daftar as $item) {
        if ($item['id'] !== null) {
            $dipertahankan[$item['id']] = true;
        }
    }
    foreach ($petaLama as $posisiId => $namaLama) {
        if (isset($dipertahankan[$posisiId])) {
            continue;
        }
        if (jumlah_pemakaian_posisi($posisiId) > 0) {
            gagal(
                409,
                'Posisi "' . $namaLama . '" sudah dipakai pada data penugasan sehingga tidak dapat dihapus.'
            );
        }
    }

    $ubah = $pdo->prepare(
        'UPDATE posisi_petugas
            SET nama = ?, urutan = ?, diubah_pada = NOW()
          WHERE id = ? AND jenis_kegiatan_id = ?'
    );
    $tambah = $pdo->prepare(
        'INSERT INTO posisi_petugas (jenis_kegiatan_id, nama, urutan, dibuat_pada, diubah_pada)
         VALUES (?, ?, ?, NOW(), NOW())'
    );
    $hapusLimit = $pdo->prepare('DELETE FROM posisi_limit WHERE posisi_id = ? AND tahun = ?');

    foreach ($daftar as $item) {
        if ($item['id'] !== null) {
            $ubah->execute([$item['nama'], $item['urutan'], $item['id'], $jenisId]);
            $posisiId = (int) $item['id'];
        } else {
            $tambah->execute([$jenisId, $item['nama'], $item['urutan']]);
            $posisiId = (int) $pdo->lastInsertId();
        }

        if ($item['limit_honor'] === null) {
            $hapusLimit->execute([$posisiId, $tahun]);
        } else {
            simpan_limit_posisi($pdo, $posisiId, $tahun, $item['limit_honor']);
        }
    }

    $hapusPosisi = $pdo->prepare('DELETE FROM posisi_petugas WHERE id = ?');
    foreach ($petaLama as $posisiId => $namaLama) {
        if (isset($dipertahankan[$posisiId])) {
            continue;
        }
        $hapusPosisi->execute([$posisiId]);
    }

    return ' · ' . count($daftar) . ' posisi';
}

/**
 * Validasi payload penugasan. Bentuk hasil sama dengan yang dipakai
 * simpan_penugasan_baru()/UPDATE.
 */
function siapkan_data_penugasan(array $input): array
{
    $errors = [];

    $namaKegiatanId = null;
    if (isset($input['nama_kegiatan_id']) && $input['nama_kegiatan_id'] !== '' && $input['nama_kegiatan_id'] !== null) {
        $idKegiatan = (int) $input['nama_kegiatan_id'];
        $stmt = db()->prepare('SELECT id FROM nama_kegiatan WHERE id = ? AND aktif = 1');
        $stmt->execute([$idKegiatan]);
        if ($idKegiatan <= 0 || $stmt->fetchColumn() === false) {
            $errors['nama_kegiatan_id'] = 'Nama kegiatan tidak ditemukan.';
        } else {
            $namaKegiatanId = $idKegiatan;
        }
    } elseif (isset($input['nama_pekerjaan']) && trim((string) $input['nama_pekerjaan']) !== '') {
        $namaLama = rapikan_teks($input['nama_pekerjaan']);
        $stmt = db()->prepare('SELECT id FROM nama_kegiatan WHERE LOWER(nama) = LOWER(?) AND aktif = 1');
        $stmt->execute([$namaLama]);
        $namaKegiatanId = $stmt->fetchColumn();
        if ($namaKegiatanId === false) {
            $errors['nama_kegiatan_id'] = 'Pilih nama kegiatan dari daftar yang tersedia.';
        } else {
            $namaKegiatanId = (int) $namaKegiatanId;
        }
    }
    $bulan = bulat_opsional($input['bulan'] ?? null, 'bulan', 'Bulan', 1, 12, $errors);
    $tahun = tahun_opsional($input['tahun'] ?? null, $errors);
    $honor = honor_opsional($input['honor'] ?? null, $errors);

    $petugasId = null;
    $namaPetugas = '';
    $pakaiId = isset($input['petugas_id']) && $input['petugas_id'] !== '' && $input['petugas_id'] !== null;

    if ($pakaiId) {
        $id = (int) $input['petugas_id'];
        if ($id <= 0) {
            $errors['petugas_id'] = 'Petugas tidak valid.';
        } else {
            $stmt = db()->prepare('SELECT id, nama FROM petugas WHERE id = ?');
            $stmt->execute([$id]);
            $baris = $stmt->fetch();
            if ($baris === false) {
                $errors['petugas_id'] = 'Petugas tidak ditemukan.';
            } else {
                $petugasId = (int) $baris['id'];
                $namaPetugas = (string) $baris['nama'];
            }
        }
    } else {
        $namaPetugas = teks_field(
            $input['petugas_nama'] ?? '',
            'petugas_id',
            'Nama petugas',
            150,
            $errors
        );
    }

    $jenisId = null;
    if (isset($input['jenis_kegiatan_id']) && $input['jenis_kegiatan_id'] !== '' && $input['jenis_kegiatan_id'] !== null) {
        $idJenis = (int) $input['jenis_kegiatan_id'];
        if ($idJenis <= 0) {
            $errors['jenis_kegiatan_id'] = 'Jenis kegiatan tidak valid.';
        } else {
            $stmt = db()->prepare('SELECT id FROM jenis_kegiatan WHERE id = ?');
            $stmt->execute([$idJenis]);
            if ($stmt->fetchColumn() === false) {
                $errors['jenis_kegiatan_id'] = 'Jenis kegiatan tidak ditemukan.';
            } else {
                $jenisId = $idJenis;
            }
        }
    }

    $posisiId = null;
    $namaPosisi = '';
    $adaPosisi =
        isset($input['posisi_id']) && $input['posisi_id'] !== '' && $input['posisi_id'] !== null;
    if ($adaPosisi) {
        $idPosisi = (int) $input['posisi_id'];
        if ($idPosisi <= 0) {
            $errors['posisi_id'] = 'Posisi petugas tidak valid.';
        } else {
            $stmt = db()->prepare(
                'SELECT id, jenis_kegiatan_id, nama FROM posisi_petugas WHERE id = ?'
            );
            $stmt->execute([$idPosisi]);
            $barisPosisi = $stmt->fetch();
            if ($barisPosisi === false) {
                $errors['posisi_id'] = 'Posisi petugas tidak ditemukan.';
            } elseif ($jenisId === null || (int) $barisPosisi['jenis_kegiatan_id'] !== $jenisId) {
                $errors['posisi_id'] = 'Posisi petugas tidak sesuai dengan jenis kegiatan.';
            } else {
                $posisiId = (int) $barisPosisi['id'];
                $namaPosisi = (string) $barisPosisi['nama'];
            }
        }
    } elseif ($jenisId !== null) {
        $errors['posisi_id'] = 'Posisi petugas wajib dipilih bila jenis kegiatan diisi.';
    }

    if ($errors === [] && $posisiId !== null && $honor !== null && $tahun !== null) {
        $limit = limit_posisi($posisiId, $tahun);
        if ($limit === null) {
            $errors['honor'] =
                'Limit honor posisi ' . $namaPosisi . ' untuk tahun ' . $tahun .
                ' belum diatur. Atur dulu di halaman Daftar Jenis Kegiatan.';
        } elseif ($honor > $limit) {
            $errors['honor'] =
                'Honor melebihi limit posisi ' . $namaPosisi . ' (Rp' .
                number_format($limit, 0, ',', '.') . ') untuk tahun ' . $tahun . '.';
        }
    }

    if ($errors !== []) {
        gagal(400, 'Data penugasan belum valid.', $errors);
    }

    return [
        'petugas_id' => $petugasId,
        'nama_petugas' => $namaPetugas,
        'jenis_kegiatan_id' => $jenisId,
        'posisi_id' => $posisiId,
        'nama_kegiatan_id' => $namaKegiatanId,
        'nama_pekerjaan' => '',
        'bulan' => $bulan,
        'tahun' => $tahun,
        'honor' => $honor,
    ];
}

/** Pastikan petugas ada; buat baru (di akhir urutan) bila hanya dikirim namanya. */
function pastikan_petugas(array $data): int
{
    if ($data['petugas_id'] !== null) {
        return (int) $data['petugas_id'];
    }

    $ada = cari_petugas_nama($data['nama_petugas']);
    if ($ada !== null) {
        return (int) $ada['id'];
    }

    $stmt = db()->prepare(
        'INSERT INTO petugas (nama, urutan, versi, dibuat_pada, diubah_pada)
         VALUES (?, ?, 1, NOW(), NOW())
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)'
    );
    $stmt->execute([$data['nama_petugas'], urutan_petugas_berikutnya()]);
    return (int) db()->lastInsertId();
}

function simpan_penugasan_baru(int $petugasId, array $data, int $adminId): int
{
    $stmt = db()->prepare(
        'INSERT INTO penugasan
            (petugas_id, jenis_kegiatan_id, posisi_id, nama_kegiatan_id, bulan, tahun, honor,
             versi, diperbarui_oleh, dibuat_pada, diubah_pada)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())'
    );
    $stmt->execute([
        $petugasId,
        $data['jenis_kegiatan_id'],
        $data['posisi_id'],
        $data['nama_kegiatan_id'],
        $data['bulan'],
        $data['tahun'],
        $data['honor'],
        $adminId,
    ]);
    return (int) db()->lastInsertId();
}
