import { glob } from 'astro/loaders';
// @ts-ignore
import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
    loader: glob({ pattern: '**/*.{md,mdoc}', base: './src/content/posts' }),
    schema: z.object({
        title: z.string(),
        description: z.string().optional(),
        publishDate: z.coerce.date().optional(),
        coverImage: z.string().optional(),
    }),
});

export const collections = { posts };
