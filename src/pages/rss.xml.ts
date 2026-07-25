import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { siteConfig } from '@/config/site';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = await getCollection('posts');

  return rss({
    title: siteConfig.name,
    description: siteConfig.description,
    site: context.site ?? siteConfig.url,
    items: posts
      .sort((a, b) => (b.data.publishDate?.getTime() ?? 0) - (a.data.publishDate?.getTime() ?? 0))
      .map((post) => ({
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.publishDate,
        link: `/posts/${post.id}/`,
      })),
  });
}
