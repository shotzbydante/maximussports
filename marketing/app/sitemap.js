const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://maximussports.ai';

const routes = ['', '/features', '/teams', '/about', '/privacy', '/terms'];

export default function sitemap() {
  return routes.map((path) => ({
    url: path ? `${BASE_URL}${path}` : BASE_URL,
    lastModified: new Date(),
    changeFrequency: path === '' ? 'daily' : 'weekly',
    priority: path === '' ? 1 : 0.8,
  }));
}
