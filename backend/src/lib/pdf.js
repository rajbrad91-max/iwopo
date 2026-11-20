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

/**
 * 📄 One of our own pages → a PDF, exactly as it prints (the client's invoice, Raj 2026-11-19). `ready` is a selector
 * the page shows only once its document has loaded, so a page still loading — or one saying "not found" — never
 * becomes the PDF.
 */
export async function pageToPdf(url, ready) {
  const ctx = await (await getBrowser()).newContext();
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.waitForSelector(ready, { timeout: 20_000 });
    await page.waitForFunction('[...document.images].every(i => i.complete)', null, { timeout: 15_000 });   // the logo, in
    await page.evaluate('document.fonts.ready');
    return await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', bottom: '0.6in', left: '0.6in', right: '0.6in' },
    });
  } finally {
    await ctx.close();
  }
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
