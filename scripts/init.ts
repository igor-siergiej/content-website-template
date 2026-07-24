#!/usr/bin/env bun
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const IGNORE = new Set(['node_modules', '.git', 'build', 'dist', '.tooling', 'bun.lock']);

const slug = process.argv[2];

if (!slug) {
    console.error('Usage: bun run init <app-name>');
    process.exit(1);
}

if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    console.error('App name must be kebab-case (lowercase letters, digits, hyphens).');
    process.exit(1);
}

const title = slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const replace = (content: string) => content.replaceAll('__APP_NAME__', slug).replaceAll('__APP_TITLE__', title);

const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (IGNORE.has(entry.name)) {
            continue;
        }

        const full = join(dir, entry.name);

        if (entry.isDirectory()) {
            await walk(full);
            continue;
        }

        const buffer = await readFile(full);

        if (buffer.includes(0)) {
            continue;
        }

        const text = buffer.toString('utf8');
        const next = replace(text);

        if (next !== text) {
            await writeFile(full, next);
        }
    }
};

await walk(root);

const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
delete pkg.scripts.init;
await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

await rm(join(root, 'scripts'), { recursive: true, force: true });

console.log(`Initialised "${slug}". Next: bun install && git init`);
