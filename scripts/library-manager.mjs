import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import ts from 'typescript';

const rootDir = process.cwd();
const referencesPath = resolve(rootDir, 'src/data/references.ts');
const publicDir = resolve(rootDir, 'public');
const port = Number.parseInt(process.env.LIBRARY_MANAGER_PORT ?? '5179', 10);

const keyOrder = [
  'id',
  'title',
  'sourceType',
  'category',
  'src',
  'thumbnailSrc',
  'description',
  'suggestedUse',
  'artist',
  'artistUrl',
  'year',
  'sourceUrl',
  'tags',
  'collections',
  'credit',
  'rights',
];

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

if (process.argv.includes('--check')) {
  const references = await readReferenceRecords();
  console.log(`Read ${references.length} references from src/data/references.ts.`);
  process.exit(0);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `127.0.0.1:${port}`}`);

    if (request.method === 'GET' && url.pathname === '/') {
      send(response, 200, managerHtml, 'text/html; charset=utf-8');
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/references') {
      const references = await readReferenceRecords();
      sendJson(response, {
        references,
        tags: getUniqueValues(references.flatMap((reference) => reference.tags ?? [])),
        collections: getUniqueValues(references.flatMap((reference) => reference.collections ?? [])),
      });
      return;
    }

    if (request.method === 'PUT' && url.pathname === '/api/references') {
      const body = await readJsonBody(request);
      const references = validateReferencesPayload(body);
      await writeReferenceRecords(references);
      sendJson(response, { ok: true, count: references.length });
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/references/')) {
      await servePublicFile(url.pathname, response);
      return;
    }

    send(response, 404, 'Not found', 'text/plain; charset=utf-8');
  } catch (error) {
    console.error(error);
    sendJson(response, { error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Library manager running at http://127.0.0.1:${port}/`);
  console.log('Press Ctrl+C to stop.');
});

async function readReferenceRecords() {
  const source = await readFile(referencesPath, 'utf8');
  const sourceFile = ts.createSourceFile(referencesPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const rawReferences = findRawReferencesArray(sourceFile);

  return rawReferences.elements.map((element) => literalToValue(element));
}

async function writeReferenceRecords(references) {
  const source = await readFile(referencesPath, 'utf8');
  const sourceFile = ts.createSourceFile(referencesPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const rawReferences = findRawReferencesArray(sourceFile);
  const start = rawReferences.getStart(sourceFile);
  const end = rawReferences.getEnd();
  const nextSource = `${source.slice(0, start)}${formatReferenceArray(references)}${source.slice(end)}`;

  await writeFile(referencesPath, nextSource);
}

function findRawReferencesArray(sourceFile) {
  let match = null;

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'rawReferences' &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      match = node.initializer;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (!match) {
    throw new Error('Could not find rawReferences array in src/data/references.ts.');
  }

  return match;
}

function literalToValue(node) {
  if (ts.isObjectLiteralExpression(node)) {
    const value = {};

    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue;

      const name = getPropertyName(property.name);
      value[name] = literalToValue(property.initializer);
    }

    return value;
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element) => literalToValue(element));
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;

  throw new Error(`Unsupported metadata value: ${node.getText()}`);
}

function getPropertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  throw new Error(`Unsupported metadata key: ${name.getText()}`);
}

function formatReferenceArray(references) {
  return `[\n${references.map(formatReference).join('\n')}\n]`;
}

function formatReference(reference) {
  const keys = [
    ...keyOrder.filter((key) => Object.hasOwn(reference, key)),
    ...Object.keys(reference).filter((key) => !keyOrder.includes(key)),
  ];

  return `  {\n${keys
    .filter((key) => reference[key] !== undefined)
    .map((key) => `    ${key}: ${formatValue(reference[key])},`)
    .join('\n')}\n  },`;
}

function formatValue(value) {
  if (typeof value === 'string') return `'${escapeString(value)}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';

  if (Array.isArray(value)) {
    return `[${value.map(formatValue).join(', ')}]`;
  }

  if (typeof value === 'object') {
    return `{ ${Object.entries(value)
      .map(([key, entry]) => `${key}: ${formatValue(entry)}`)
      .join(', ')} }`;
  }

  throw new Error(`Unsupported value type: ${typeof value}`);
}

function escapeString(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function validateReferencesPayload(body) {
  if (!body || !Array.isArray(body.references)) {
    throw new Error('Expected a references array.');
  }

  const ids = new Set();

  return body.references.map((reference) => {
    if (!reference || typeof reference !== 'object') {
      throw new Error('Each reference must be an object.');
    }

    if (typeof reference.id !== 'string' || !reference.id.trim()) {
      throw new Error('Each reference needs an id.');
    }

    if (ids.has(reference.id)) {
      throw new Error(`Duplicate reference id: ${reference.id}`);
    }

    ids.add(reference.id);

    return {
      ...reference,
      tags: normalizeList(reference.tags),
      collections: normalizeList(reference.collections),
    };
  });
}

function normalizeList(value) {
  if (!value) return undefined;
  if (!Array.isArray(value)) throw new Error('Tags and collections must be arrays.');

  const seen = new Set();
  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false;

      seen.add(item);
      return true;
    });

  return normalized.length ? normalized : undefined;
}

function getUniqueValues(values) {
  return [...new Set(values)].sort((first, second) => first.localeCompare(second));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function servePublicFile(pathname, response) {
  const publicPath = resolve(publicDir, `.${decodeURIComponent(pathname)}`);

  if (!publicPath.startsWith(`${publicDir}/`)) {
    send(response, 403, 'Forbidden', 'text/plain; charset=utf-8');
    return;
  }

  await stat(publicPath);
  response.writeHead(200, {
    'content-type': mimeTypes.get(extname(publicPath).toLowerCase()) ?? 'application/octet-stream',
  });
  createReadStream(publicPath).pipe(response);
}

function sendJson(response, data, status = 200) {
  send(response, status, JSON.stringify(data), 'application/json; charset=utf-8');
}

function send(response, status, body, contentType) {
  response.writeHead(status, { 'content-type': contentType });
  response.end(body);
}

const managerHtml = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Art Assistant Library Manager</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #050505;
        --panel: #19191b;
        --panel-2: #222225;
        --border: rgb(255 255 255 / 0.1);
        --muted: #aaaab0;
        --text: #f5f5f7;
        --blue: #7ab7ff;
        font-family: "DM Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        color: var(--text);
        background: var(--bg);
      }

      button,
      input {
        font: inherit;
      }

      .manager-shell {
        min-height: 100vh;
      }

      .manager-topbar {
        position: sticky;
        z-index: 2;
        top: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 16px;
        padding: 18px;
        border-bottom: 1px solid var(--border);
        background: rgb(0 0 0 / 0.92);
        backdrop-filter: blur(14px);
      }

      h1 {
        margin: 0;
        font-size: 18px;
        font-weight: 500;
      }

      .manager-topbar p {
        max-width: 58rem;
        margin: 5px 0 0;
        color: var(--muted);
        font-size: 12px;
        font-weight: 500;
        line-height: 1.45;
      }

      .topbar-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .manager-button {
        min-height: 36px;
        padding: 0 12px;
        border: 1px solid var(--border);
        border-radius: 3px;
        color: var(--text);
        background: var(--panel-2);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
      }

      .manager-button[data-variant="primary"] {
        color: #05101d;
        border-color: var(--blue);
        background: var(--blue);
      }

      .manager-button:disabled {
        cursor: default;
        opacity: 0.45;
      }

      .manager-toolbar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(170px, 220px);
        gap: 10px;
        padding: 14px 18px;
        border-bottom: 1px solid var(--border);
        background: #0d0d0e;
      }

      .manager-toolbar input {
        width: 100%;
        min-height: 38px;
        padding: 0 12px;
        border: 1px solid var(--border);
        border-radius: 3px;
        color: var(--text);
        background: var(--panel);
      }

      .manager-status {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        color: var(--muted);
        font-size: 12px;
        font-weight: 500;
      }

      .manager-help {
        display: grid;
        gap: 6px;
        margin: 14px 18px 0;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: 3px;
        color: var(--muted);
        background: rgb(122 183 255 / 0.07);
        font-size: 12px;
        font-weight: 500;
        line-height: 1.45;
      }

      .manager-help strong {
        color: var(--text);
        font-size: 13px;
        font-weight: 500;
      }

      .manager-help code {
        color: #dcecff;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 11px;
      }

      .manager-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 12px;
        padding: 18px;
      }

      .reference-card {
        display: grid;
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: 3px;
        background: var(--panel);
      }

      .reference-card[data-deleted="true"] {
        opacity: 0.42;
      }

      .reference-card img {
        width: 100%;
        aspect-ratio: 4 / 3;
        object-fit: cover;
        background: #101010;
      }

      .reference-body {
        display: grid;
        gap: 10px;
        padding: 12px;
      }

      .reference-title {
        display: grid;
        gap: 3px;
      }

      .reference-title strong {
        overflow: hidden;
        font-size: 14px;
        font-weight: 500;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .reference-title span {
        overflow: hidden;
        color: var(--muted);
        font-size: 12px;
        font-weight: 500;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      label {
        display: grid;
        gap: 5px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      .reference-body input[type="text"] {
        width: 100%;
        min-height: 34px;
        padding: 0 9px;
        border: 1px solid var(--border);
        border-radius: 3px;
        color: var(--text);
        background: #111112;
        font-size: 12px;
        font-weight: 500;
        letter-spacing: 0;
        text-transform: none;
      }

      .delete-row {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #d6d6da;
        font-size: 12px;
        font-weight: 500;
        letter-spacing: 0;
        text-transform: none;
      }

      .delete-row input {
        width: 16px;
        height: 16px;
      }

      .manager-empty {
        padding: 32px 18px;
        color: var(--muted);
        font-size: 13px;
      }

      @media (max-width: 700px) {
        .manager-topbar,
        .manager-toolbar {
          grid-template-columns: 1fr;
        }

        .topbar-actions,
        .manager-status {
          justify-content: flex-start;
        }
      }
    </style>
  </head>
  <body>
    <main class="manager-shell">
      <header class="manager-topbar">
        <div>
          <h1>Art Assistant Library Manager</h1>
          <p>
            Local-only tool for reviewing library images, editing tags or collections, and removing an entry from the
            app metadata. It does not add new image files or generate thumbnails.
          </p>
        </div>
        <div class="topbar-actions">
          <button class="manager-button" id="resetButton" type="button">Reset</button>
          <button class="manager-button" id="saveButton" data-variant="primary" type="button" disabled>Save changes</button>
        </div>
      </header>

      <section class="manager-toolbar">
        <input id="searchInput" type="search" placeholder="Search title, artist, category, tags..." />
        <div class="manager-status" id="statusText">Loading...</div>
      </section>

      <section class="manager-help" aria-label="Library manager instructions">
        <strong>How to use this</strong>
        <span>Edit tags or collections with comma-separated words. Tick remove if you want an image taken out of the library metadata, then click Save changes.</span>
        <span>When you are happy, ask Codex: <code>I updated the library, can you check and commit it?</code> I will review the diff, run the build, commit, and push if you want.</span>
      </section>

      <section class="manager-grid" id="referenceGrid" aria-label="Library references"></section>
      <p class="manager-empty" id="emptyMessage" hidden>No references match that search.</p>
    </main>

    <script>
      const state = {
        references: [],
        query: '',
      };

      const grid = document.querySelector('#referenceGrid');
      const searchInput = document.querySelector('#searchInput');
      const saveButton = document.querySelector('#saveButton');
      const resetButton = document.querySelector('#resetButton');
      const statusText = document.querySelector('#statusText');
      const emptyMessage = document.querySelector('#emptyMessage');

      loadReferences();

      searchInput.addEventListener('input', () => {
        state.query = searchInput.value.trim().toLowerCase();
        render();
      });

      resetButton.addEventListener('click', loadReferences);
      saveButton.addEventListener('click', saveReferences);

      async function loadReferences() {
        setStatus('Loading...');
        const response = await fetch('/api/references');
        const data = await response.json();
        state.references = data.references.map((reference) => ({ ...reference, deleted: false, dirty: false }));
        saveButton.disabled = true;
        render();
      }

      async function saveReferences() {
        try {
          setStatus('Saving...');
          saveButton.disabled = true;

          const references = state.references
            .filter((reference) => !reference.deleted)
            .map(({ deleted, dirty, ...reference }) => reference);

          const response = await fetch('/api/references', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ references }),
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Could not save references.');
          }

          await loadReferences();
          setStatus('Saved. Refresh the app if the library is already open.');
        } catch (error) {
          saveButton.disabled = false;
          setStatus(error instanceof Error ? error.message : 'Could not save references.');
        }
      }

      function render() {
        const visibleReferences = state.references.filter(referenceMatchesQuery);
        grid.innerHTML = visibleReferences.map(renderReferenceCard).join('');
        emptyMessage.hidden = visibleReferences.length > 0;

        grid.querySelectorAll('[data-field]').forEach((input) => {
          input.addEventListener('input', handleTextInput);
        });

        grid.querySelectorAll('[data-delete]').forEach((input) => {
          input.addEventListener('change', handleDeleteInput);
        });

        updateStatus();
      }

      function renderReferenceCard(reference) {
        const id = escapeHtml(reference.id);
        const title = escapeHtml(reference.title);
        const meta = escapeHtml([reference.artist, reference.category].filter(Boolean).join(' · ') || reference.id);
        const thumbnail = escapeHtml(getThumbnailPath(reference.thumbnailSrc || reference.src));
        const tags = escapeHtml((reference.tags || []).join(', '));
        const collections = escapeHtml((reference.collections || []).join(', '));
        const checked = reference.deleted ? 'checked' : '';

        return [
          '<article class="reference-card" data-id="' + id + '" data-deleted="' + reference.deleted + '">',
          '  <img src="' + thumbnail + '" alt="" loading="lazy" />',
          '  <div class="reference-body">',
          '    <div class="reference-title">',
          '      <strong title="' + title + '">' + title + '</strong>',
          '      <span>' + meta + '</span>',
          '    </div>',
          '    <label>',
          '      Tags',
          '      <input data-field="tags" data-id="' + id + '" type="text" value="' + tags + '" />',
          '    </label>',
          '    <label>',
          '      Collections',
          '      <input data-field="collections" data-id="' + id + '" type="text" value="' + collections + '" />',
          '    </label>',
          '    <label class="delete-row">',
          '      <input data-delete data-id="' + id + '" type="checkbox" ' + checked + ' />',
          '      Remove from library metadata',
          '    </label>',
          '  </div>',
          '</article>',
        ].join('');
      }

      function handleTextInput(event) {
        const reference = findReference(event.currentTarget.dataset.id);
        const field = event.currentTarget.dataset.field;
        reference[field] = splitList(event.currentTarget.value);
        reference.dirty = true;
        saveButton.disabled = false;
        updateStatus();
      }

      function handleDeleteInput(event) {
        const reference = findReference(event.currentTarget.dataset.id);
        reference.deleted = event.currentTarget.checked;
        reference.dirty = true;
        saveButton.disabled = false;
        render();
      }

      function findReference(id) {
        const reference = state.references.find((item) => item.id === id);
        if (!reference) throw new Error('Unknown reference: ' + id);
        return reference;
      }

      function referenceMatchesQuery(reference) {
        if (!state.query) return true;

        return [reference.title, reference.artist, reference.category, reference.id, ...(reference.tags || []), ...(reference.collections || [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(state.query);
      }

      function splitList(value) {
        return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
      }

      function updateStatus() {
        const dirtyCount = state.references.filter((reference) => reference.dirty).length;
        const deletedCount = state.references.filter((reference) => reference.deleted).length;
        const totalCount = state.references.length;
        const parts = [totalCount + ' references'];

        if (dirtyCount) parts.push(dirtyCount + ' changed');
        if (deletedCount) parts.push(deletedCount + ' marked for removal');

        setStatus(parts.join(' · '));
      }

      function getThumbnailPath(path) {
        if (!path || /^(https?:|blob:|data:)/.test(path)) return path;

        return path.replace(/^\/references\//, '/references/thumbs/');
      }

      function setStatus(message) {
        statusText.textContent = message;
      }

      function escapeHtml(value) {
        return String(value ?? '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;');
      }
    </script>
  </body>
</html>`;
