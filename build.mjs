// Builds GamePlay into single-file pages. No dependencies: run `node build.mjs`.
//   dist/playpark.html  the page body published as a claude.ai artifact (the host adds <head>)
//   dist/local.html     the same page in a bare document, used by the end-to-end tests
//   dist/site/          a complete static website: index.html + README.md, ready for any host
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const here = (p) => new URL(p, import.meta.url);
const read = (f) => readFileSync(here('./src/' + f), 'utf8');

// Site settings for the static website. Fill in `contact` (an email address or an https:// link)
// to show a contact button on the Business page.
const SITE = { contact: process.env.GP_CONTACT || '' };

const js = ['core.js', 'kits.js', 'harness.js', 'solana.js', 'app.js'].map((f) => {
  const s = read(f);
  for (const bad of ['</script', '<!--', '<script']) if (s.toLowerCase().includes(bad)) throw new Error(f + ' contains ' + bad);
  return s;
});
const scripts = (config) => (config ? '<script>window.GP_SITE = ' + JSON.stringify(config).replace(/</g, '\\u003c') + ';</script>\n' : '')
  + js.map((s) => '<script>\n' + s + '\n</script>').join('\n');

const template = read('index.html');
// A replacer function keeps `$` sequences in the scripts from being read as replacement patterns.
const page = template.replace('<!--INLINE-SCRIPTS-->', () => scripts(null));
mkdirSync(here('./dist/site/'), { recursive: true });
writeFileSync(here('./dist/playpark.html'), page);

const skeleton = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
writeFileSync(here('./dist/local.html'), skeleton + page + '</body></html>');

// The static website: the same page with a real <head> (description, social card, icon).
const sitePage = template.replace('<!--INLINE-SCRIPTS-->', () => scripts(SITE));
const cut = sitePage.indexOf('<a class="skip"');
if (cut < 0) throw new Error('skip link marker not found');
const desc = 'GamePlay is a free game maker. Make a browser game in minutes, share it with a link, and earn when people play, collect or remix it. No sign-up, works on any phone.';
const icon = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M3 8l5-5h16l5 5v21H3z' fill='#2a3ff5'/><rect x='8' y='8' width='16' height='11' rx='1.5' fill='#fff'/><path d='M9 24.5h14' stroke='#fff' stroke-width='2.4' stroke-dasharray='2 2.2'/></svg>");
const site = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  + '<meta name="description" content="' + desc + '">\n'
  + '<meta name="theme-color" content="#e2e7e4" media="(prefers-color-scheme: light)">\n'
  + '<meta name="theme-color" content="#0d1211" media="(prefers-color-scheme: dark)">\n'
  + '<meta property="og:type" content="website">\n<meta property="og:title" content="GamePlay">\n'
  + '<meta property="og:description" content="' + desc + '">\n'
  + '<meta name="twitter:card" content="summary">\n'
  + '<link rel="icon" href="' + icon + '">\n'
  + '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n'
  + sitePage.slice(0, cut).trim() + '\n</head>\n<body>\n' + sitePage.slice(cut) + '\n</body>\n</html>\n';
writeFileSync(here('./dist/site/index.html'), site);
writeFileSync(here('./dist/site/README.md'), readFileSync(here('./site-README.md'), 'utf8'));

console.log('built', (page.length / 1024).toFixed(1) + ' KB page,', (site.length / 1024).toFixed(1) + ' KB website');
