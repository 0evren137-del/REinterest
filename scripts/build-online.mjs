import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Explicit allowlist: never publish backups, logs, local settings or browser data.
const files = ['index.html', 'app.js', 'domain.js', 'repository.js', 'exchange.js', 'exchange-config.js', 'expenses.js', 'expenses-view.js', 'expense-entry-form.js', 'expenses-pages.js', 'expenses-layout.css', 'styles.css', 'icon.svg'];
const netlify = process.argv.includes('--netlify');
const destination = new URL(netlify ? '../deploy/netlify/' : '../online-site/dist/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const file of files) await copyFile(new URL('../web/' + file, import.meta.url), new URL(file, destination));
if (netlify) {
  await writeFile(new URL('exchange-config.js', destination), "export const EXCHANGE_ENDPOINT = './api/exchange-rates';\n");
  for (const file of ['_headers', '_redirects']) await copyFile(new URL('../hosting/netlify/' + file, import.meta.url), new URL(file, destination));
}
console.log('Online static files ready: ' + fileURLToPath(destination));
