import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const normalize = (source) => String(source).replace(/\r\n/g, '\n');
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Git's canonical blob hash, without requiring a .git checkout (e.g. Netlify). */
export function gitBlobHash(source) {
  const bytes = Buffer.from(normalize(source), 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

/** Apply exact, reviewed source replacements once, without cascading replacements. */
export function replaceEntries(path, source, entries) {
  const text = normalize(source);
  const replacements = new Map();
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || entry.some((x) => typeof x !== 'string')) {
      throw new Error(`${path}: each translation must be a pair of strings`);
    }
    const [from, to] = entry;
    if (!from || !to) throw new Error(`${path}: empty translation key or value`);
    if (replacements.has(from)) throw new Error(`${path}: duplicate translation key: ${from}`);
    if (!text.includes(from)) throw new Error(`${path}: source text changed or missing: ${from}`);
    replacements.set(from, to);
  }
  if (!replacements.size) return text;
  const pattern = [...replacements.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  // The callback is intentional: $&, $1 and ${expressions} are literal text.
  return text.replace(new RegExp(pattern, 'g'), (match) => replacements.get(match));
}

export function readCatalog() {
  return JSON.parse(readFileSync(new URL('./catalog.ru.json', import.meta.url), 'utf8'));
}
export function readLock() {
  return JSON.parse(readFileSync(new URL('./source-lock.json', import.meta.url), 'utf8'));
}

/** Track the entire original application, including future files needing review. */
export function sourcePaths(root) {
  function walk(relative) {
    return readdirSync(join(root, relative), { withFileTypes: true }).flatMap((entry) => {
      const path = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Source symlinks need explicit review: ${path}`);
      return entry.isDirectory() ? walk(path) : [path];
    });
  }
  return ['index.html', ...walk('src')].sort();
}

export function snapshotSources(root) {
  return Object.fromEntries(sourcePaths(root).map((path) => [path, gitBlobHash(readFileSync(join(root, path), 'utf8'))]));
}

/** Fail closed after upstream updates; never silently publish a partly English mirror. */
export function verifyProject(root, catalog = readCatalog(), lock = readLock()) {
  const current = snapshotSources(root);
  const changes = [...new Set([...Object.keys(lock), ...Object.keys(current)])]
    .filter((path) => current[path] !== lock[path]);
  if (changes.length) {
    throw new Error(`Russian translation needs review after source changes:\n${changes.map((p) => `  ${p}`).join('\n')}\nSee README.ru.md; review translations before updating i18n/source-lock.json.`);
  }
  for (const [path, entries] of Object.entries(catalog)) {
    if (!Object.hasOwn(lock, path)) throw new Error(`Unreviewed catalog path: ${path}`);
    replaceEntries(path, readFileSync(join(root, path), 'utf8'), entries);
  }
  return { files: Object.keys(current).length, translations: Object.values(catalog).reduce((n, rows) => n + rows.length, 0) };
}

export function translateSource(path, source, catalog = readCatalog(), lock = readLock()) {
  if (!Object.hasOwn(catalog, path)) return source;
  if (gitBlobHash(source) !== lock[path]) {
    throw new Error(`${path}: source changed; review the Russian translation (README.ru.md)`);
  }
  return replaceEntries(path, source, catalog[path]);
}
