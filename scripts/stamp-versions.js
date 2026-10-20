// Cache-busting for GitHub Pages (which serves JS with max-age=600).
// Writes an import map into each HTML page that points every module at
// `?v=<content hash>`, and stamps the entry <script src> and the stylesheet. A changed file gets a
// new URL, so browsers and the CDN never mix old and new modules.
// Usage: node scripts/stamp-versions.js   (run before committing JS changes;
// tests/stamp.test.js fails if a page is out of date)

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const PAGES = ['index.html', 'build.html', 'ma-opportunities.html'];

function jsFiles(dir = 'js') {
  return readdirSync(new URL(dir, ROOT), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? jsFiles(`${dir}/${e.name}`) : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : [],
  );
}

const hash = (path) => createHash('sha256').update(readFileSync(new URL(path, ROOT))).digest('hex').slice(0, 10);

export function stampedPage(html) {
  const files = jsFiles().sort();
  const imports = Object.fromEntries(files.map((f) => [`./${f}`, `./${f}?v=${hash(f)}`]));
  const map = `<!-- importmap:start -->\n  <script type="importmap">${JSON.stringify({ imports })}</script>\n  <!-- importmap:end -->`;
  let out = html.includes('<!-- importmap:start -->')
    ? html.replace(/<!-- importmap:start -->[\s\S]*?<!-- importmap:end -->/, map)
    : html.replace('</head>', `  ${map}\n</head>`);
  out = out.replace(/<script type="module" src="(js\/[^"?]+\.js)(\?v=[^"]*)?"><\/script>/g, (_, src) => `<script type="module" src="${src}?v=${hash(src)}"></script>`);
  out = out.replace(/<link rel="stylesheet" href="(css\/[^"?]+\.css)(\?v=[^"]*)?">/g, (_, href) => `<link rel="stylesheet" href="${href}?v=${hash(href)}">`);
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  for (const page of PAGES) {
    const url = new URL(page, ROOT);
    writeFileSync(url, stampedPage(readFileSync(url, 'utf8')));
  }
  console.log(`Stamped ${PAGES.join(', ')}`);
}
