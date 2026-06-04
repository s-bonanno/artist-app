import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { cp, mkdtemp } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const rootDir = process.cwd();
const referencesPath = resolve(rootDir, 'src/data/references.ts');
const targetLongEdge = readNumberArg('--target-long-edge', 5000);
const minCurrentLongEdge = readNumberArg('--min-current-long-edge', 0);
const maxCurrentLongEdge = readNumberArg('--max-current-long-edge', Number.POSITIVE_INFINITY);
const limit = readNumberArg('--limit', Number.POSITIVE_INFINITY);
const checkLimit = readNumberArg('--check-limit', Number.POSITIVE_INFINITY);
const delayMs = readNumberArg('--delay-ms', 0);
const maxDownloadMb = readNumberArg('--max-download-mb', Number.POSITIVE_INFINITY);
const shouldApply = process.argv.includes('--apply');
const shouldDownloadOriginal = process.argv.includes('--original');
const includeIds = readListArg('--include');
const skipIds = readListArg('--skip');

const candidates = (await collectCandidates())
  .map((reference) => {
    const currentPath = resolve(rootDir, 'public', reference.src.replace(/^\//, ''));
    return { ...reference, currentPath, current: readImageInfo(currentPath) };
  })
  .filter((reference) => reference.current.longEdge >= minCurrentLongEdge)
  .filter((reference) => reference.current.longEdge <= maxCurrentLongEdge)
  .sort((first, second) => first.current.longEdge - second.current.longEdge);
const tmpRoot = await mkdtemp(join(tmpdir(), 'art-assistant-reference-upgrade-'));
const results = [];
let checkedCount = 0;

for (const reference of candidates) {
  if (results.filter((result) => result.status === 'upgraded').length >= limit) break;
  if (checkedCount >= checkLimit) break;
  if (checkedCount > 0 && delayMs > 0) {
    await sleep(delayMs);
  }

  checkedCount += 1;
  console.log(
    `[${checkedCount}/${Number.isFinite(checkLimit) ? checkLimit : candidates.length}] checking ${reference.id} (${formatImageInfo(reference.current)})`,
  );

  const candidatePath = join(tmpRoot, basename(reference.src));
  const downloadUrl = toCommonsFilePathUrl(reference.sourceUrl, shouldDownloadOriginal ? null : targetLongEdge);
  const curlArgs = [
    '-L',
    '--fail',
    '--retry',
    '3',
    '--retry-delay',
    '2',
    '--retry-all-errors',
    '--user-agent',
    'ArtAssistantLocalDev/1.0',
    '-o',
    candidatePath,
    downloadUrl,
  ];

  if (Number.isFinite(maxDownloadMb)) {
    curlArgs.splice(curlArgs.length - 1, 0, '--max-filesize', String(Math.round(maxDownloadMb * 1024 * 1024)));
  }

  const download = spawnSync(
    'curl',
    curlArgs,
    { stdio: shouldApply ? 'inherit' : 'ignore' },
  );

  if (download.status !== 0) {
    results.push({ ...reference, status: 'download-failed' });
    continue;
  }

  let normalizedPath;
  let candidate;

  try {
    normalizedPath = await capLongEdge(candidatePath);
    candidate = readImageInfo(normalizedPath);
  } catch (error) {
    results.push({ ...reference, status: 'invalid-download' });
    continue;
  }

  if (!isImprovement(reference.current, candidate)) {
    results.push({ ...reference, candidate, status: 'same-or-smaller' });
    continue;
  }

  results.push({ ...reference, candidate, status: 'upgraded' });

  if (shouldApply) {
    await cp(normalizedPath, reference.currentPath);
  }
}

printResults(results);

if (!shouldApply) {
  console.log('\nDry run only. Re-run with --apply to replace files.');
}

function readNumberArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;

  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Expected a positive number after ${name}.`);
  }

  return value;
}

function readListArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return new Set();

  return new Set(
    String(process.argv[index + 1] ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

async function collectCandidates() {
  const source = await readFile(referencesPath, 'utf8');
  const sourceFile = ts.createSourceFile(referencesPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const rawReferences = findRawReferencesArray(sourceFile);

  return rawReferences.elements
    .map((element) => literalToValue(element))
    .filter((reference) => {
      if (!reference?.id || !reference?.src || !reference?.sourceUrl) return false;
      if (includeIds.size > 0 && !includeIds.has(reference.id)) return false;
      if (skipIds.has(reference.id)) return false;
      if (!reference.src.startsWith('/references/commons/')) return false;
      if (!reference.sourceUrl.startsWith('https://commons.wikimedia.org/wiki/File:')) return false;

      return true;
    });
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

function toCommonsFilePathUrl(sourceUrl, width) {
  const url = new URL(sourceUrl);
  const marker = '/wiki/File:';
  const fileName = url.pathname.slice(url.pathname.indexOf(marker) + marker.length);

  return `https://commons.wikimedia.org/wiki/Special:FilePath/${fileName}${width ? `?width=${width}` : ''}`;
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

async function capLongEdge(imagePath) {
  const info = readImageInfo(imagePath);
  if (info.longEdge <= targetLongEdge) return imagePath;

  const cappedPath = imagePath.replace(/(\.[^.]+)$/, `-${targetLongEdge}$1`);
  execFileSync('sips', ['-Z', String(targetLongEdge), imagePath, '--out', cappedPath], { stdio: 'ignore' });
  return cappedPath;
}

function readImageInfo(path) {
  const output = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path], { encoding: 'utf8' });
  const width = Number(output.match(/pixelWidth: (\d+)/)?.[1] ?? 0);
  const height = Number(output.match(/pixelHeight: (\d+)/)?.[1] ?? 0);
  const bytes = statSync(path).size;

  return {
    width,
    height,
    longEdge: Math.max(width, height),
    pixels: width * height,
    mb: bytes / 1024 / 1024,
  };
}

function isImprovement(current, candidate) {
  return candidate.longEdge > current.longEdge && candidate.pixels > current.pixels * 1.05;
}

function printResults(items) {
  const upgraded = items.filter((item) => item.status === 'upgraded');
  const rows = items
    .filter((item) => item.status !== 'below-minimum')
    .map((item) => ({
      id: item.id,
      status: item.status,
      current: formatImageInfo(item.current),
      candidate: item.candidate ? formatImageInfo(item.candidate) : '',
      size: item.candidate ? `${formatMb(item.current.mb)} -> ${formatMb(item.candidate.mb)}` : formatMb(item.current.mb),
    }));

  console.table(rows);
  console.log(`${upgraded.length} upgrade${upgraded.length === 1 ? '' : 's'} found.`);

  if (shouldApply && upgraded.length) {
    writeFileSync(
      join(tmpRoot, 'upgraded.json'),
      JSON.stringify(
        upgraded.map((item) => ({ id: item.id, src: item.src, from: item.current, to: item.candidate })),
        null,
        2,
      ),
    );
    console.log(`Upgrade details written to ${join(tmpRoot, 'upgraded.json')}`);
  }
}

function formatImageInfo(info) {
  return `${info.width}x${info.height}`;
}

function formatMb(mb) {
  return `${mb.toFixed(1)}MB`;
}
