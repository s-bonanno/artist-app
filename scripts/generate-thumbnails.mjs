import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';

const referencesDir = 'public/references';
const thumbnailsDir = 'public/references/thumbs';
const supportedExtensions = new Set(['.jpg', '.jpeg', '.png']);

function collectImagePaths(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return path === thumbnailsDir ? [] : collectImagePaths(path);
    }

    return supportedExtensions.has(extname(path).toLowerCase()) ? [path] : [];
  });
}

const imagePaths = collectImagePaths(referencesDir);

for (const imagePath of imagePaths) {
  const outputPath = join(thumbnailsDir, relative(referencesDir, imagePath));

  mkdirSync(dirname(outputPath), { recursive: true });
  execFileSync('sips', ['-Z', '900', imagePath, '--out', outputPath], { stdio: 'ignore' });
}

console.log(`Generated ${imagePaths.length} reference thumbnails.`);
