import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(clientRoot, 'dist', 'index.html');
const modulesRoot = path.resolve(clientRoot, '../node_modules');

const vite = await createServer({
  root: clientRoot,
  configFile: path.join(clientRoot, 'vite.config.js'),
  resolve: {
    alias: [
      {
        find: /^react-router$/,
        replacement: path.join(modulesRoot, 'react-router/dist/development/index.mjs'),
      },
      {
        find: /^react-router\/dom$/,
        replacement: path.join(modulesRoot, 'react-router/dist/development/dom-export.mjs'),
      },
      {
        find: /^react-router-dom$/,
        replacement: path.join(modulesRoot, 'react-router-dom/dist/index.mjs'),
      },
    ],
  },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'warn',
});

try {
  const { default: App } = await vite.ssrLoadModule('/src/App.jsx');
  const { MemoryRouter } = await vite.ssrLoadModule('react-router-dom');
  const markup = renderToString(
    createElement(MemoryRouter, { initialEntries: ['/'] }, createElement(App)),
  );
  const html = await readFile(indexPath, 'utf8');
  const emptyRoot = '<div id="root"></div>';

  if (!html.includes(emptyRoot)) {
    throw new Error('Expected an empty #root in the built index.html');
  }

  await writeFile(indexPath, html.replace(emptyRoot, `<div id="root">${markup}</div>`));
  console.log(`prerendered landing page (${markup.length} bytes)`);
} finally {
  await vite.close();
}
