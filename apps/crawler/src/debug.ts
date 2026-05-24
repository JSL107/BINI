import { chromium } from 'playwright';

const q = process.argv[2] ?? '던전앤파이터 게임';
const headed = process.argv.includes('--headed');

(async () => {
  const browser = await chromium.launch({ headless: !headed });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1366, height: 900 },
  });
  const page = await ctx.newPage();
  const url = 'https://www.google.com/search?udm=2&hl=ko&q=' + encodeURIComponent(q);
  console.log('GOTO', url);
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  console.log('status:', resp?.status());
  console.log('final url:', page.url());
  await page.waitForTimeout(3000);
  const title = await page.title();
  console.log('title:', title);
  // Dump all img srcs
  const srcs: string[] = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img'))
      .map((i) => i.getAttribute('src') ?? i.getAttribute('data-src') ?? '')
      .filter((s) => s && !s.startsWith('data:'));
  });
  console.log(`got ${srcs.length} img srcs. sample 5:`);
  srcs.slice(0, 5).forEach((s) => console.log('  ', s.slice(0, 120)));
  // body snippet
  const bodyLen = (await page.content()).length;
  console.log('html length:', bodyLen);
  // check for sorry/captcha
  const bodyText = await page.locator('body').innerText().catch(() => '');
  if (/unusual|sorry|captcha|robot|automated|비정상|확인/i.test(bodyText)) {
    console.log('!! bot detected. body excerpt:');
    console.log(bodyText.slice(0, 400));
  }
  await browser.close();
})();
