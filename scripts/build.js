const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');

function copyFile(relativePath) {
  const source = path.join(root, relativePath);
  const destination = path.join(publicDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

async function buildFrontend() {
  await Promise.all([
    esbuild.build({
      absWorkingDir: root,
      entryPoints: ['src/js/app.js'],
      outfile: 'assets/js/app.js',
      minify: true,
      target: 'es2020',
    }),
    esbuild.build({
      absWorkingDir: root,
      entryPoints: ['src/css/app.css'],
      outfile: 'assets/css/app.css',
      minify: true,
    }),
  ]);

  fs.rmSync(publicDir, { recursive: true, force: true });
  fs.mkdirSync(publicDir, { recursive: true });

  for (const file of [
    'index.html',
    'editor-81d32a46c8.html',
    'robots.txt',
    'sw.js',
    'icon-192.png',
    'truco-cartas.png',
  ]) {
    copyFile(file);
  }

  for (const file of [
    'assets/css/app.css',
    'assets/js/app.js',
    'assets/data/app-data.js',
  ]) {
    copyFile(file);
  }
}

buildFrontend().catch(error => {
  console.error('No se pudo compilar la interfaz.', error);
  process.exitCode = 1;
});
