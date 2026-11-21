import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));

// Keep the real commands, configs and their helpers, but isolate the probe from
// application diagnostics. All writes stay in a disposable directory in this worktree.
function createToolingProject() {
    const directory = mkdtempSync(join(root, 'tooling-test-'));

    const excluded = {
        '.git': true,
        '.factory': true,
        node_modules: true,
        '.astro': true,
        dist: true,
        'test-results': true,
        'playwright-report': true,
        src: true,
        public: true,
        infra: true,
        e2e: true,
        docs: true,
    };

    for (const entry of readdirSync(root)) {
        if (!Object.hasOwn(excluded, entry) && !entry.startsWith('tooling-test-')) {
            cpSync(join(root, entry), join(directory, entry), { recursive: true });
        }
    }

    symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir');
    mkdirSync(join(directory, 'src/lib'), { recursive: true });

    return directory;
}

interface CommandResult {
    status: number | null;
    output: string;
}

function runCommand(directory: string, command: string) {
    const result = spawnSync('bun', ['run', command], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, NO_COLOR: '1' },
    });

    if (result.error) throw result.error;

    return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

function expectSuccess(result: CommandResult) {
    expect(result.status, result.output).toBe(0);
}

function readProbe(directory: string) {
    return readFileSync(join(directory, 'src/lib/tooling-probe.ts'), 'utf8');
}

function writeProbe(directory: string, source: string) {
    writeFileSync(join(directory, 'src/lib/tooling-probe.ts'), source);
}

describe('contributor tooling commands', () => {
    it('checks shared anti-slop rules and formatting without writing, then fixes to a stable clean check', () => {
        const directory = createToolingProject();

        try {
            writeProbe(directory, "export const author = Reflect.get({ name: 'Ada' }, 'name');\n");
            expectSuccess(runCommand(directory, 'format'));
            const rejectedSource = readProbe(directory);
            const rejected = runCommand(directory, 'lint');

            expect(readProbe(directory)).toBe(rejectedSource);
            expect(rejected.output).toContain('no-reflect-get');
            expect(rejected.status, rejected.output).not.toBe(0);

            // Typed property access is allowed. With only formatting wrong, lint
            // must still fail without silently applying the formatter's changes.
            writeProbe(directory, 'export const author={name:"Ada"}.name;\n');
            const unformattedSource = readProbe(directory);
            const unformatted = runCommand(directory, 'lint');
            expect(readProbe(directory)).toBe(unformattedSource);
            expect(unformatted.status, unformatted.output).not.toBe(0);

            expectSuccess(runCommand(directory, 'format'));
            const formattedSource = readProbe(directory);
            expect(formattedSource).not.toBe(unformattedSource);
            expectSuccess(runCommand(directory, 'lint'));
            expect(readProbe(directory)).toBe(formattedSource);

            // The intentional prefer-const rule remains fixable through lint:fix.
            writeProbe(directory, 'export function getAnswer() {\n    let answer=42;\n\n    return answer;\n}\n');
            expectSuccess(runCommand(directory, 'lint:fix'));
            const fixedSource = readProbe(directory);
            expect(fixedSource).toMatch(/\bconst answer\b/);
            expectSuccess(runCommand(directory, 'lint'));
            expectSuccess(runCommand(directory, 'format'));
            expect(readProbe(directory)).toBe(fixedSource);
            expectSuccess(runCommand(directory, 'lint'));
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    }, 120_000);
});
