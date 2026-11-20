const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

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
}

buildFrontend().catch(error => {
  console.error('No se pudo compilar la interfaz.', error);
  process.exitCode = 1;
});
