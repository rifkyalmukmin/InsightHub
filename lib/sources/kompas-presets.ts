export interface KompasPreset {
  slug: string;
  name: string;
  url: string;
  description: string;
  category: string;
}

/**
 * Kompas.id category URLs suited for crawling current news.
 * Avoid the homepage (/) — it is a static page, not news articles.
 */
export const KOMPAS_PRESETS: KompasPreset[] = [
  {
    slug: 'indeks',
    name: 'Kompas.id — Latest News',
    url: 'https://www.kompas.id/indeks',
    description: 'Daily latest news index',
    category: 'National',
  },
  {
    slug: 'nasional',
    name: 'Kompas.id — National',
    url: 'https://www.kompas.id/kategori/nasional',
    description: 'Indonesian national news',
    category: 'National',
  },
  {
    slug: 'politik-hukum',
    name: 'Kompas.id — Politics & Law',
    url: 'https://www.kompas.id/kategori/politik-hukum',
    description: 'Politics, law, and public policy',
    category: 'Politics',
  },
  {
    slug: 'ekonomi',
    name: 'Kompas.id — Economy & Business',
    url: 'https://www.kompas.id/kategori/ekonomi',
    description: 'Economy, business, and finance',
    category: 'Economy',
  },
  {
    slug: 'internasional',
    name: 'Kompas.id — International',
    url: 'https://www.kompas.id/kategori/internasional',
    description: 'World news and international relations',
    category: 'International',
  },
  {
    slug: 'olahraga',
    name: 'Kompas.id — Sports',
    url: 'https://www.kompas.id/kategori/olahraga',
    description: 'Domestic and international sports',
    category: 'Sports',
  },
  {
    slug: 'sains-teknologi',
    name: 'Kompas.id — Science & Technology',
    url: 'https://www.kompas.id/kategori/sains-teknologi',
    description: 'Science, technology, and innovation',
    category: 'Technology',
  },
  {
    slug: 'kesehatan',
    name: 'Kompas.id — Health',
    url: 'https://www.kompas.id/kategori/kesehatan',
    description: 'Health and medical policy',
    category: 'Health',
  },
  {
    slug: 'pendidikan-kebudayaan',
    name: 'Kompas.id — Education & Culture',
    url: 'https://www.kompas.id/kategori/pendidikan-kebudayaan',
    description: 'Education, culture, and society',
    category: 'Education',
  },
  {
    slug: 'lingkungan',
    name: 'Kompas.id — Environment',
    url: 'https://www.kompas.id/kategori/lingkungan',
    description: 'Environment, disasters, and climate',
    category: 'Environment',
  },
  {
    slug: 'opini',
    name: 'Kompas.id — Opinion',
    url: 'https://www.kompas.id/kategori/opini',
    description: 'Opinion and analysis articles',
    category: 'Opinion',
  },
  {
    slug: 'investigasi',
    name: 'Kompas.id — Investigation',
    url: 'https://www.kompas.id/kategori/investigasi',
    description: 'Journalistic investigation reports',
    category: 'Investigation',
  },
  {
    slug: 'bebas-akses',
    name: 'Kompas.id — Free Access',
    url: 'https://www.kompas.id/kategori/bebas-akses',
    description: 'Free articles without subscription (last 7 days)',
    category: 'Free Access',
  },
];

export function presetToSource(preset: KompasPreset) {
  return {
    name: preset.name,
    // Unique per category — schema @@unique([userId, domain])
    domain: `${preset.slug}.kompas.id`,
    url: preset.url,
    description: preset.description,
    category: preset.category,
  };
}

export function getKompasPreset(slug: string): KompasPreset | undefined {
  return KOMPAS_PRESETS.find((p) => p.slug === slug);
}
