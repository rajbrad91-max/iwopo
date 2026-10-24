/**
 * 📄 HTML → a real PDF (Raj, 2026-10-24: the delivered contract must be a true PDF, like the reference agreement).
 * Headless Chromium (Playwright, the browser already installed on the server for the site checks), one shared browser,
 * one short-lived page per document. US Letter, the reference's margins, backgrounds and web fonts included.
 */
import { chromium } from 'playwright-core';

let browser = null;
async function getBrowser() {
  if (!browser || !browser.isConnected()) browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  return browser;
}

export async function htmlToPdf(html) {
  const ctx = await (await getBrowser()).newContext();
  try {
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 25_000 });
    await page.evaluate('document.fonts.ready');   // runs in the page: wait until the web fonts are in
    return await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.75in', bottom: '0.8in', left: '0.9in', right: '0.9in' },
    });
  } finally {
    await ctx.close();
  }
}
