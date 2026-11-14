// Test-harness only. Resolves extensionless relative specifiers to `.ts` /
// `index.ts`, which is what Metro and the TypeScript compiler already do.
import { existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HAS_EXTENSION = /\.[cm]?[jt]sx?$/;

export async function resolve(specifier, context, next) {
  const relative = specifier.startsWith('./') || specifier.startsWith('../');
  if (relative && !HAS_EXTENSION.test(specifier)) {
    const parent = context.parentURL ? dirname(fileURLToPath(context.parentURL)) : process.cwd();
    const base = resolvePath(parent, specifier);
    for (const candidate of [`${base}.ts`, resolvePath(base, 'index.ts')]) {
      if (existsSync(candidate)) {
        return next(pathToFileURL(candidate).href, context);
      }
    }
  }
  return next(specifier, context);
}
