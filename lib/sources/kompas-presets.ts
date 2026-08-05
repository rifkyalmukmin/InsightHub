export interface KompasPreset {
  slug: string;
  name: string;
  url: string;
  description: string;
  category: string;
}

/**
 * URL kategori Kompas.id yang cocok untuk crawling berita aktual.
 * Hindari homepage (/) — hanya halaman statis, bukan artikel berita.
 */
export const KOMPAS_PRESETS: KompasPreset[] = [
  {
    slug: 'indeks',
    name: 'Kompas.id — Berita Terbaru',
    url: 'https://www.kompas.id/indeks',
    description: 'Indeks berita terbaru harian',
    category: 'Nasional',
  },
  {
    slug: 'nasional',
    name: 'Kompas.id — Nasional',
    url: 'https://www.kompas.id/kategori/nasional',
    description: 'Berita nasional Indonesia',
    category: 'Nasional',
  },
  {
    slug: 'politik-hukum',
    name: 'Kompas.id — Politik & Hukum',
    url: 'https://www.kompas.id/kategori/politik-hukum',
    description: 'Politik, hukum, dan kebijakan publik',
    category: 'Politik',
  },
  {
    slug: 'ekonomi',
    name: 'Kompas.id — Ekonomi & Bisnis',
    url: 'https://www.kompas.id/kategori/ekonomi',
    description: 'Ekonomi, bisnis, dan keuangan',
    category: 'Ekonomi',
  },
  {
    slug: 'internasional',
    name: 'Kompas.id — Internasional',
    url: 'https://www.kompas.id/kategori/internasional',
    description: 'Berita dunia dan hubungan internasional',
    category: 'Internasional',
  },
  {
    slug: 'olahraga',
    name: 'Kompas.id — Olahraga',
    url: 'https://www.kompas.id/kategori/olahraga',
    description: 'Olahraga domestik dan internasional',
    category: 'Olahraga',
  },
  {
    slug: 'sains-teknologi',
    name: 'Kompas.id — Sains & Teknologi',
    url: 'https://www.kompas.id/kategori/sains-teknologi',
    description: 'Ilmu pengetahuan, teknologi, dan inovasi',
    category: 'Teknologi',
  },
  {
    slug: 'kesehatan',
    name: 'Kompas.id — Kesehatan',
    url: 'https://www.kompas.id/kategori/kesehatan',
    description: 'Kesehatan dan kebijakan medis',
    category: 'Kesehatan',
  },
  {
    slug: 'pendidikan-kebudayaan',
    name: 'Kompas.id — Pendidikan & Kebudayaan',
    url: 'https://www.kompas.id/kategori/pendidikan-kebudayaan',
    description: 'Pendidikan, budaya, dan sosial',
    category: 'Pendidikan',
  },
  {
    slug: 'lingkungan',
    name: 'Kompas.id — Lingkungan',
    url: 'https://www.kompas.id/kategori/lingkungan',
    description: 'Lingkungan, bencana, dan iklim',
    category: 'Lingkungan',
  },
  {
    slug: 'opini',
    name: 'Kompas.id — Opini',
    url: 'https://www.kompas.id/kategori/opini',
    description: 'Artikel opini dan analisis',
    category: 'Opini',
  },
  {
    slug: 'investigasi',
    name: 'Kompas.id — Investigasi',
    url: 'https://www.kompas.id/kategori/investigasi',
    description: 'Laporan investigasi jurnalistik',
    category: 'Investigasi',
  },
  {
    slug: 'bebas-akses',
    name: 'Kompas.id — Bebas Akses',
    url: 'https://www.kompas.id/kategori/bebas-akses',
    description: 'Artikel gratis tanpa langganan (7 hari terakhir)',
    category: 'Bebas Akses',
  },
];

export function presetToSource(preset: KompasPreset) {
  return {
    name: preset.name,
    // Unique per kategori — schema @@unique([userId, domain])
    domain: `${preset.slug}.kompas.id`,
    url: preset.url,
    description: preset.description,
    category: preset.category,
  };
}

export function getKompasPreset(slug: string): KompasPreset | undefined {
  return KOMPAS_PRESETS.find((p) => p.slug === slug);
}
