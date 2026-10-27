// Development only. A private preview and a fresh browser profile for each run.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const root = fileURLToPath(new URL('../', import.meta.url));

export async function openPreview({ publicFonts = false } = {}) {
  // Checks use demo dashboard data, so they never contact the Worker or need its token.
  const args = ['scripts/preview.py', '--port', '0', '--mock-dashboard'];
  if (publicFonts || process.env.CLEANFRAME_PUBLIC_FONTS === '1') args.push('--public-fonts');
  const server = spawn('python3', args, {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe']
  });
  let browser;
  let diagnostics = '';
  server.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
  try {
    const baseURL = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(Error('Preview startup timed out')), 10000);
      server.once('error', error => { clearTimeout(timeout); reject(error); });
      server.once('exit', code => { clearTimeout(timeout); reject(Error('Preview exited: ' + code + ' ' + diagnostics)); });
      server.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timeout); resolve(match[0]); }
      });
    });
    // CLEANFRAME_CHROMIUM points at an existing Chromium when Playwright's own download is unavailable.
    browser = await chromium.launch({ headless: true, ...(process.env.CLEANFRAME_CHROMIUM ? { executablePath: process.env.CLEANFRAME_CHROMIUM } : {}) });
    return { browser, baseURL, close: async () => {
      try { await browser.close(); }
      finally { server.kill(); await once(server, 'exit'); }
    } };
  } catch (error) {
    server.kill();
    if (browser) await browser.close();
    throw error;
  }
}
