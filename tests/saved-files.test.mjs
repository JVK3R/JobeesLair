// Saved files (0.5.2, app/state/read-json.js SAVED_FILES): every file the app keeps through savedList, loadList or
// saveList is named there with its shape, and what the app writes reads back. 0.5.1 wrote update-prompt.json as a
// record and checked it as a list, so it was set aside as unreadable at every launch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.env.JL_REPO || fileURLToPath(new URL('..', import.meta.url));
const load = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
const { FileSystem } = await import('@ps5-react/core');
const { SAVED_FILES, isRecord } = await load('app/state/read-json.js');
const { loadList, saveList } = await load('app/state/saved.js');

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.(js|jsx)$/.test(entry.name) ? [file] : [];
  });
}

// The names passed to savedList, loadList and saveList: a literal, or a constant of the same file. saved.js passes
// its caller's name through, the one call allowed a name that is neither.
function savedNames() {
  const names = new Map(), unresolved = [];
  for (const file of sources(path.join(repo, 'app'))) {
    const text = readFileSync(file, 'utf8'), where = path.relative(repo, file).replaceAll('\\', '/');
    for (const [call, literal, constant] of text.matchAll(/\b(?:savedList|loadList|saveList)\(\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*))/g)) {
      const name = literal ?? text.match(new RegExp(`\\b${constant}\\s*=\\s*"([^"]+)"`))?.[1];
      if (!name) {
        if (where !== 'app/state/saved.js') unresolved.push(`${where}: ${call}`);
        continue;
      }
      names.set(name, [...(names.get(name) ?? []), where]);
    }
  }
  return { names, unresolved };
}

function memoryFs() {
  const files = new Map();
  Object.assign(FileSystem, {
    exists: (p) => files.has(p),
    readFile: (p) => {
      if (!files.has(p)) throw new Error(`${p}: no such file`);
      return files.get(p);
    },
    writeFile: (p, text) => void files.set(p, text),
    rename: (from, to) => {
      files.set(to, files.get(from));
      files.delete(from);
    },
    mkdir() {}
  });
  return files;
}

test('every file the app saves is named in SAVED_FILES with its shape', () => {
  const { names, unresolved } = savedNames();
  assert.deepEqual(unresolved, [], 'a saved file named by a literal or a constant of its file, so this test can see it');
  for (const name of ['settings.json', 'wishlist.json', 'themes.json', 'update-prompt.json', 'feeds.json']) {
    assert.ok(names.has(name), `${name} found among the saved files`);
  }
  for (const [name, where] of names) {
    assert.ok(SAVED_FILES[name], `${name} (${[...new Set(where)].join(', ')}) has no entry in SAVED_FILES`);
  }
});

test('the update prompt is kept across launches, not set aside as unreadable', () => {
  const files = memoryFs();
  saveList('update-prompt.json', 'update prompt', { version: '0.5.2', ready: '0.5.2' });
  assert.deepEqual(loadList('update-prompt.json', 'update prompt'), { version: '0.5.2', ready: '0.5.2' });
  assert.deepEqual([...files.keys()], ['/download0/JobeesLair/update-prompt.json']);
});

test('each saved file reads back what its shape writes', () => {
  for (const [name, valid] of Object.entries(SAVED_FILES)) {
    const files = memoryFs();
    const value = valid === isRecord ? { kept: true } : ['kept'];
    saveList(name, name, value);
    assert.deepEqual(loadList(name, name), value, name);
    assert.ok(![...files.keys()].some((p) => p.includes('.unreadable-')), `${name} not set aside`);
  }
});
