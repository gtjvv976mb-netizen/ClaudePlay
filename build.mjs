// Builds ClaudePlay into single-file pages. No dependencies: run `node build.mjs`.
//   dist/playpark.html  the page body published as a claude.ai artifact (the host adds <head>)
//   dist/local.html     the same page in a bare document, used by the end-to-end tests
//   dist/site/          a complete static website: index.html + README.md, ready for any host
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const here = (p) => new URL(p, import.meta.url);
const read = (f) => readFileSync(here('./src/' + f), 'utf8');

// Site settings for the static website. Fill in `contact` (an email address or an https:// link)
// to show a contact button on the Business page.
const SITE = { contact: process.env.GP_CONTACT || '', mascot: 'mascot-wave.webp' };

// The mascot: a small still is inlined into the page (so the claude.ai artifact shows it too);
// its animated loop ships next to the website as its own file and loads after the page.
const MASCOT_STILL = 'data:image/webp;base64,' + readFileSync(here('./src/assets/mascot.webp')).toString('base64');
const PLAY_WORLD_STILL = 'data:image/webp;base64,' + readFileSync(here('./src/assets/play-world-v1.webp')).toString('base64');
const WORLD_SKY_STILL = 'data:image/webp;base64,' + readFileSync(here('./src/assets/world-sky-v1.webp')).toString('base64');
const js = ['core.js', 'kits.js', 'harness.js', 'solana.js', 'qr.js', 'world-background.js', 'world-navigation.js', 'app.js'].map((f) => {
  const s = read(f).replace("'MASCOT_STILL'", () => JSON.stringify(MASCOT_STILL));
  for (const bad of ['</script', '<!--', '<script']) if (s.toLowerCase().includes(bad)) throw new Error(f + ' contains ' + bad);
  return s;
});
const scripts = (config) => (config ? '<script>window.GP_SITE = ' + JSON.stringify(config).replace(/</g, '\\u003c') + ';</script>\n' : '')
  + js.map((s) => '<script>\n' + s + '\n</script>').join('\n');

const template = read('index.html').replace('/* WORLD-INTERFACE-CSS */', () => read('world-interface.css'));
// A replacer function keeps `$` sequences in the scripts from being read as replacement patterns.
const page = template.replaceAll('PLAY_WORLD_STILL', PLAY_WORLD_STILL).replaceAll('WORLD_SKY_STILL', WORLD_SKY_STILL).replace('<!--INLINE-SCRIPTS-->', () => scripts(null));
mkdirSync(here('./dist/site/'), { recursive: true });
writeFileSync(here('./dist/playpark.html'), page);

const skeleton = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
writeFileSync(here('./dist/local.html'), skeleton + page + '</body></html>');

// The static website: the same page with a real <head> (description, social card, icon).
const sitePage = template.replaceAll('PLAY_WORLD_STILL', 'play-world-v1.webp').replaceAll('WORLD_SKY_STILL', 'world-sky-v1.webp').replace('<!--INLINE-SCRIPTS-->', () => scripts(SITE));
const cut = sitePage.indexOf('<a class="skip"');
if (cut < 0) throw new Error('skip link marker not found');
const desc = 'ClaudePlay is a free game maker. Make, play and share your own browser games: describe an idea or start with a game kit. Free creation has daily limits and a shared funding cap.';
const icon = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M5 9h22l4 15-4 3-7-6h-8l-7 6-4-3z' fill='#163f9a'/><path d='M7 14h8m-4-4v8' stroke='#fff' stroke-width='2.5'/><path d='M21 13h3v3h-3zm4 4h3v3h-3z' fill='#ffcf67'/></svg>");
const site = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  + '<meta name="description" content="' + desc + '">\n'
  + '<meta name="theme-color" content="#f4f8ff" media="(prefers-color-scheme: light)">\n'
  + '<meta name="theme-color" content="#101d35" media="(prefers-color-scheme: dark)">\n'
  + '<meta property="og:type" content="website">\n<meta property="og:title" content="ClaudePlay">\n'
  + '<meta property="og:description" content="' + desc + '">\n'
  + '<meta name="twitter:card" content="summary">\n'
  + '<link rel="icon" href="' + icon + '">\n'
  + '<link rel="preload" as="image" href="play-world-v1.webp">\n'
  + '<link rel="preload" as="image" href="world-sky-v1.webp">\n'
  + '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n'
  + sitePage.slice(0, cut).trim() + '\n</head>\n<body>\n' + sitePage.slice(cut) + '\n</body>\n</html>\n';
writeFileSync(here('./dist/site/index.html'), site);
writeFileSync(here('./dist/site/README.md'), readFileSync(here('./site-README.md'), 'utf8'));
writeFileSync(here('./dist/site/mascot-wave.webp'), readFileSync(here('./src/assets/mascot-wave.webp')));
writeFileSync(here('./dist/site/play-world-v1.webp'), readFileSync(here('./src/assets/play-world-v1.webp')));
writeFileSync(here('./dist/site/world-sky-v1.webp'), readFileSync(here('./src/assets/world-sky-v1.webp')));

console.log('built', (page.length / 1024).toFixed(1) + ' KB page,', (site.length / 1024).toFixed(1) + ' KB website');
