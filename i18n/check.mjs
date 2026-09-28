import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readCatalog, snapshotSources, translateSource, verifyProject } from './translate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const flag = process.argv[2];
if (flag && flag !== '--print-lock') {
  console.error('Usage: node i18n/check.mjs [--print-lock]');
  process.exit(1);
}
try {
  if (flag === '--print-lock') {
    // Prints a candidate only. Review the diff; do not blindly accept upstream text.
    console.log(JSON.stringify(snapshotSources(root), null, 2));
  } else {
    const result = verifyProject(root);
    for (const path of Object.keys(readCatalog()).filter((p) => p.endsWith('.js'))) {
      const translated = translateSource(path, readFileSync(join(root, path), 'utf8'));
      const check = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: translated, encoding: 'utf8' });
      if (check.error) throw check.error;
      if (check.status !== 0) throw new Error(`${path}: translated JavaScript is invalid\n${check.stderr}`);
    }
    console.log(`Russian translation OK: ${result.files} reviewed source files, ${result.translations} translations; JavaScript syntax valid.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
