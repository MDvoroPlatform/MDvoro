import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const paths = ['/login', '/signup', '/legal/privacy', '/legal/cookies', '/legal/terms', '/legal/copyright', '/legal/dmca'];
  return paths.map((path) => ({ url: `${siteUrl}${path}`, changeFrequency: path.startsWith('/legal/') ? 'monthly' : 'weekly', priority: path === '/login' || path === '/signup' ? 0.8 : 0.4 }));
}
