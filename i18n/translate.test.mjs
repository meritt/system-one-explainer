import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gitBlobHash, replaceEntries } from './translate.mjs';

test('replacements are simultaneous, longest-first and literal', () => {
  assert.equal(replaceEntries('example.js', 'A + B; A; $&', [
    ['A', 'B'], ['B', 'C'], ['A + B', '${value}'], ['$&', '$&!'],
  ]), '${value}; B; $&!');
});
test('missing source strings fail rather than publishing a partial translation', () => {
  assert.throws(() => replaceEntries('changed.js', 'new text', [['old text', 'перевод']]), /changed\.js.*old text/s);
});
test('repeated labels are all translated', () => {
  assert.equal(replaceEntries('test.html', '<b>Replay</b><i>Replay</i>', [['Replay', 'Повторить']]), '<b>Повторить</b><i>Повторить</i>');
});
test('duplicate and empty translation keys are rejected', () => {
  assert.throws(() => replaceEntries('x', 'a', [['a', 'б'], ['a', 'в']]), /duplicate/i);
  assert.throws(() => replaceEntries('x', 'a', [['', 'б']]), /empty/i);
});
test('Git blob hashes agree with Git, including empty files', () => {
  assert.equal(gitBlobHash(''), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  assert.equal(gitBlobHash('hello\n'), 'ce013625030ba8dba906f756967f9e9ca394464a');
});
test('Windows checkout newlines do not invalidate the translation review', () => {
  assert.equal(gitBlobHash('hello\r\n'), gitBlobHash('hello\n'));
});

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshotSources, verifyProject, translateSource, readCatalog, readLock } from './translate.mjs';

test('new, changed and removed source files require translation review', () => {
  const root = mkdtempSync(join(tmpdir(), 'system-one-ru-'));
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'index.html'), '<p>Hello</p>');
    writeFileSync(join(root, 'src', 'app.js'), 'export const label = "Hello";');
    const catalog = { 'index.html': [['Hello', 'Привет']] };
    const lock = snapshotSources(root);
    assert.deepEqual(verifyProject(root, catalog, lock), { files: 2, translations: 1 });
    writeFileSync(join(root, 'src', 'added.js'), 'export const message = "New";');
    assert.throws(() => verifyProject(root, catalog, lock), /added\.js/);
    rmSync(join(root, 'src', 'added.js'));
    writeFileSync(join(root, 'index.html'), '<p>Hello again</p>');
    assert.throws(() => verifyProject(root, catalog, lock), /index\.html/);
    writeFileSync(join(root, 'index.html'), '<p>Hello</p>');
    rmSync(join(root, 'src', 'app.js'));
    assert.throws(() => verifyProject(root, catalog, lock), /app\.js/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('individual transforms also reject unreviewed source edits', () => {
  const catalog = { 'app.js': [['"Hello"', '"Привет"']] };
  const source = 'export const text = "Hello";';
  const lock = { 'app.js': gitBlobHash(source) };
  assert.equal(translateSource('app.js', source, catalog, lock), 'export const text = "Привет";');
  assert.throws(() => translateSource('app.js', source + '\n// changed', catalog, lock), /source changed/);
  assert.equal(translateSource('other.js', source, catalog, lock), source);
});

test('catalog paths are locked and JavaScript template placeholders are preserved', () => {
  const catalog = readCatalog();
  const lock = readLock();
  for (const [path, entries] of Object.entries(catalog)) {
    assert.ok(Object.hasOwn(lock, path), path);
    assert.equal(new Set(entries.map(([en]) => en)).size, entries.length, path);
    for (const [en, ru] of entries) {
      assert.ok(en.length && ru.length, path);
      assert.deepEqual((en.match(/\$\{[^}]+\}/g) || []).sort(), (ru.match(/\$\{[^}]+\}/g) || []).sort(), `${path}: ${en}`);
    }
  }
});
