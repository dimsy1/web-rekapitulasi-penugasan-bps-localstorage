import { api } from './api.js';
import { initLayout, toast, labelTahunAktif } from './layout.js';
import { formatAngka, formatRingkas, formatRupiah } from './format.js';
import { DAFTAR_BULAN } from './bulan.js';

const WARNA = [
  '#1267b8',
  '#0f9b8e',
  '#cf8a0a',
  '#7c5cbf',
  '#d95f6a',
  '#3f8f4f',
  '#5b7c99',
  '#b06ab3',
  '#e07b39',
  '#6b8e23',
];

let tahunAktif = new Date().getFullYear();
let chartBulanan = null;
let chartJenis = null;

const el = (id) => document.getElementById(id);

const pusatDonut = {
  id: 'pusatDonut',
  afterDraw(chart) {
    if (chart.config.type !== 'doughnut' || !chart.chartArea) return;
    const data = chart.data.datasets[0]?.data || [];
    const total = data.reduce((jumlah, nilai) => jumlah + (Number(nilai) || 0), 0);
    if (!total) return;

    const { ctx, chartArea } = chart;
    const x = (chartArea.left + chartArea.right) / 2;
    const y = (chartArea.top + chartArea.bottom) / 2;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#7a8ca1';
    ctx.font = '600 9.5px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('TOTAL', x, y - 13);
    ctx.fillStyle = '#172b44';
    ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(formatRupiah(total), x, y + 6);
    ctx.restore();
  },
};

function opsiBatang() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 450 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#08263f',
        titleColor: '#ffffff',
        bodyColor: '#dbe9f7',
        padding: 11,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          title: (items) => `${items[0]?.label || ''} ${tahunAktif}`,
          label: (item) => `Honor: ${formatRupiah(item.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: '#687b92',
          font: { size: 10 },
          maxRotation: 42,
          minRotation: 0,
          autoSkip: false,
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: '#edf2f8', drawTicks: false },
        border: { display: false },
        ticks: {
          color: '#8294a9',
          font: { size: 10 },
          padding: 8,
          callback: (nilai) => formatRingkas(nilai),
        },
      },
    },
  };
}

function buatChartBulanan(nilai) {
  const kanvas = el('chart-bulanan');
  chartBulanan = new Chart(kanvas, {
    type: 'bar',
    data: {
      labels: DAFTAR_BULAN.map((bulan) => bulan.nama),
      datasets: [
        {
          label: 'Honor',
          data: nilai,
          backgroundColor: 'rgba(18, 103, 184, 0.82)',
          hoverBackgroundColor: '#0b4f92',
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 38,
        },
      ],
    },
    options: opsiBatang(),
  });
}

function perbaruiChartBulanan(nilai) {
  if (!chartBulanan) {
    buatChartBulanan(nilai);
    return;
  }
  chartBulanan.data.datasets[0].data = nilai;
  chartBulanan.update();
}

function buatChartJenis(berisi) {
  const kanvas = el('chart-jenis');
  chartJenis = new Chart(kanvas, {
    type: 'doughnut',
    data: {
      labels: berisi.map((item) => item.nama),
      datasets: [
        {
          data: berisi.map((item) => item.total),
          backgroundColor: berisi.map((item) => item.warna),
          borderColor: '#ffffff',
          borderWidth: 2,
          hoverOffset: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '64%',
      animation: { duration: 450 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 12,
            color: '#52667e',
            font: { size: 10.5 },
          },
        },
        tooltip: {
          backgroundColor: '#08263f',
          titleColor: '#ffffff',
          bodyColor: '#dbe9f7',
          padding: 11,
          cornerRadius: 8,
          callbacks: {
            label: (item) => {
              const total = item.dataset.data.reduce((a, b) => a + Number(b || 0), 0);
              const persen = total ? (Number(item.parsed) / total) * 100 : 0;
              return ` ${formatRupiah(item.parsed)} (${persen.toLocaleString('id-ID', {
                maximumFractionDigits: 1,
              })}%)`;
            },
          },
        },
      },
    },
    plugins: [pusatDonut],
  });
}

function perbaruiChartJenis(perJenis) {
  const berisi = perJenis
    .map((item, indeks) => ({ ...item, warna: WARNA[indeks % WARNA.length] }))
    .filter((item) => Number(item.total) > 0);

  const kanvas = el('chart-jenis');
  const kosong = el('chart-jenis-kosong');

  if (berisi.length === 0) {
    if (chartJenis) {
      chartJenis.destroy();
      chartJenis = null;
    }
    kanvas.hidden = true;
    kosong.hidden = false;
    return;
  }

  kanvas.hidden = false;
  kosong.hidden = true;

  if (!chartJenis) {
    buatChartJenis(berisi);
    return;
  }

  chartJenis.data.labels = berisi.map((item) => item.nama);
  chartJenis.data.datasets[0].data = berisi.map((item) => item.total);
  chartJenis.data.datasets[0].backgroundColor = berisi.map((item) => item.warna);
  chartJenis.update();
}

function aturKpiTahun(tahun) {
  const label = labelTahunAktif(tahun);
  el('badge-tahun-bulanan').textContent = `Tahun ${label}`;
  el('badge-tahun-jenis').textContent = `Tahun ${label}`;
  el('catatan-tahun').textContent = label;
  el('kpi-honor-meta').textContent = `Tahun anggaran ${label}`;
  el('kpi-penugasan-meta').textContent = label === '-' ? 'Belum ada penugasan' : `Baris transaksi tahun ${label}`;
  el('kpi-petugas-meta').textContent = label === '-' ? 'Belum ada petugas dengan penugasan' : `Petugas dengan penugasan tahun ${label}`;
}

async function muat(tahun) {
  tahunAktif = Number(tahun);
  aturKpiTahun(tahunAktif);

  try {
    const data = await api.getDashboard(tahunAktif);
    tahunAktif = Number(data.tahun) || tahunAktif;

    el('kpi-honor').textContent = formatRupiah(data.total_honor);
    el('kpi-penugasan').textContent = formatAngka(data.jumlah_penugasan);
    el('kpi-petugas').textContent = formatAngka(data.jumlah_petugas);

    if (!window.Chart) {
      toast('Pustaka grafik Chart.js gagal dimuat. Periksa koneksi internet.', 'error');
      return;
    }

    perbaruiChartBulanan(data.per_bulan.map((baris) => Number(baris.total) || 0));
    perbaruiChartJenis(data.per_jenis);
  } catch (kesalahan) {
    el('kpi-honor').textContent = '—';
    el('kpi-penugasan').textContent = '—';
    el('kpi-petugas').textContent = '—';
    toast(`Gagal memuat dashboard: ${kesalahan.message}`, 'error');
  }
}

const app = await initLayout({
  active: 'dashboard',
  judul: 'Dashboard',
  deskripsi: 'Ringkasan total honor dan penugasan.',
});

tahunAktif = app.tahun;

if (window.Chart) {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = '#687b92';
}

document.addEventListener('tahun-berubah', (event) => {
  muat(event.detail.tahun);
});

await muat(tahunAktif);
