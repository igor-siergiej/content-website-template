import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));

function withProject(run: (directory: string) => void) {
    const directory = mkdtempSync(join(root, 'tooling-test-boundaries-'));

    try {
        for (const name of ['package.json', 'oxlint.config.mjs', 'oxfmt.config.mjs', '.gitignore']) {
            copyFileSync(join(root, name), join(directory, name));
        }

        symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir');
        run(directory);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

function put(directory: string, path: string, source: string) {
    const destination = join(directory, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, source);
}

function command(directory: string, name: string) {
    const result = spawnSync('bun', ['run', name], { cwd: directory, encoding: 'utf8', timeout: 60_000 });

    if (result.error) throw result.error;

    return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

function expectClean(directory: string, name: string) {
    const result = command(directory, name);
    expect(result.status, result.output).toBe(0);
}

describe('project tooling boundaries', () => {
    it.each([
        ['prefer-template', 'export const greet = (name: string) => "Hello, " + name;\n'],
        ['one-var', 'export const first = 1, second = 2;\n'],
        ['eqeqeq', 'export const equal = (left: string, right: string) => left == right;\n'],
        ['no-explicit-any', 'export const identity = (value: any) => value;\n'],
    ])('rejects the preserved %s rule without writing', (rule, source) => {
        withProject((directory) => {
            put(directory, 'probe.ts', source);
            const result = command(directory, 'lint');

            expect(result.status, result.output).not.toBe(0);
            expect(result.output).toContain(rule);
            expect(readFileSync(join(directory, 'probe.ts'), 'utf8')).toBe(source);
        });
    });

    it('keeps generated files untouched while fixing supported source', () => {
        withProject((directory) => {
            const ignored = [
                '.astro/generated.ts',
                'dist/generated.ts',
                'test-results/generated.ts',
                'playwright-report/generated.ts',
                '.playwright-mcp/generated.ts',
                '.factory/generated.ts',
                'infra/.terraform/generated.ts',
            ];

            const ignoredSource = 'not valid JavaScript {\n';

            for (const path of ignored) {
                put(directory, path, ignoredSource);
            }

            // Source overrides intentionally allow unused variables and explicit any.
            put(directory, 'src/lib/probe.ts', 'export const identity=(value:any)=>{const unused=1;return value;};\n');
            expectClean(directory, 'lint:fix');
            const fixed = readFileSync(join(directory, 'src/lib/probe.ts'), 'utf8');
            expect(fixed).toContain('const unused = 1;');
            expect(fixed).toContain('value: any');
            expectClean(directory, 'lint');
            expectClean(directory, 'format');
            expectClean(directory, 'format:check');
            expect(readFileSync(join(directory, 'src/lib/probe.ts'), 'utf8')).toBe(fixed);

            for (const path of ignored) {
                expect(readFileSync(join(directory, path), 'utf8'), path).toBe(ignoredSource);
            }
        });
    });

    it('checks Astro frontmatter and formats templates without reordering component imports', () => {
        withProject((directory) => {
            const path = 'src/components/Probe.astro';
            put(directory, path, "---\nconst author = Reflect.get({ name: 'Ada' }, 'name');\n---\n<p>{author}</p>\n");
            const rejected = command(directory, 'lint');
            expect(rejected.status, rejected.output).not.toBe(0);
            expect(rejected.output).toContain('no-reflect-get');

            const source =
                '---\nimport Zebra from "./zebra.astro";\nimport Alpha from "./alpha.astro";\nlet author={name:"Ada"}.name;\n---\n<p>{author}</p><Zebra/><Alpha/>\n';

            put(directory, path, source);
            expectClean(directory, 'lint:fix');
            const fixed = readFileSync(join(directory, path), 'utf8');
            expect(fixed).toContain('const author');
            expect(fixed).not.toBe(source);
            expect(fixed.indexOf('import Zebra')).toBeLessThan(fixed.indexOf('import Alpha'));
            expectClean(directory, 'lint');
            expectClean(directory, 'format');
            expectClean(directory, 'format:check');
            expect(readFileSync(join(directory, path), 'utf8')).toBe(fixed);
        });
    });
});
