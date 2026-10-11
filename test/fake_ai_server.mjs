// Runs server/server.mjs with a fake Claude client, for the browser tests: `node test/fake_ai_server.mjs 8766`.
// Every build streams the same small game; GET /__calls lists what the page asked for.
// `node test/fake_ai_server.mjs 8767 chain` also runs payments on a fake Solana devnet (GET /__chain).
import { createServer } from '../server/server.mjs';
import { openGallery } from '../server/gallery.mjs';
import { openChain } from '../server/chain.mjs';
import { fakeRpc } from './fake_rpc.mjs';
import { memoryKv } from '../server/plans.mjs';

const GAME = `<!doctype html>
<html><head><meta charset="utf-8"><title>Block Miner</title>
<meta name="description" content="Tap to drop transaction blocks into a full block before gas runs out.">
<meta name="gameplay-genre" content="Arcade">
<meta name="gameplay-controls" content="Tap or press Space">
<style>html,body{margin:0;height:100%;overflow:hidden;background:#0b0f2a}canvas{display:block}</style></head>
<body><canvas id="c"></canvas>
<scr` + `ipt>
const c=document.getElementById('c'),x=c.getContext('2d');let W,H,state='title',score=0,end=0;
function fit(){W=c.width=innerWidth;H=c.height=innerHeight}addEventListener('resize',fit);fit();
function start(){state='play';score=0;end=performance.now()+2500;SP.score(0)}
c.addEventListener('pointerdown',()=>{if(state!=='play'){start();return}SP.input('drop');score+=5;SP.score(score)});
addEventListener('keydown',e=>{if(e.code==='Space'&&state!=='play')start()});
function loop(now){x.fillStyle='#0b0f2a';x.fillRect(0,0,W,H);
if(state==='play'){score+=1;SP.score(score);if(now>end){state='over';SP.gameOver(score)}}
x.fillStyle='#ffd84d';x.font='24px sans-serif';x.fillText(state==='title'?'BLOCK MINER - tap to start':state==='over'?'GAME OVER '+score:'GAS '+score,20,40);requestAnimationFrame(loop)}
SP.ready();requestAnimationFrame(loop);
</scr` + `ipt></body></html>`;

// A tiny 3D game on SP3D, streamed when the creator picks 3D.
const GAME3D = `<!doctype html>
<html><head><meta charset="utf-8"><title>Cube Dash 3D</title>
<meta name="description" content="Steer a cube down a 3D track.">
<meta name="gameplay-genre" content="Racing">
<meta name="gameplay-controls" content="Tap to start, drag to steer">
</head><body>
<scr` + `ipt>
const g=SP3D.create({background:'#1a2240',fog:{near:20,far:60}});g.camera.y=5;g.camera.z=9;
g.add('plane',{sx:30,sz:200,color:'#2e8b57'});const p=g.add('box',{y:0.5,color:'#ffd84d',shadow:true});
let score=0,state='title';SP.ready();addEventListener('pointerdown',()=>{if(state!=='play'){state='play';score=0}SP.input('tap')});
g.start((dt)=>{p.ry+=dt;if(state==='play'){score++;SP.score(score);if(score>90){state='over';SP.gameOver(score)}}
g.hud.fillStyle='#fff';g.hud.font='20px sans-serif';g.hud.fillText(state==='play'?'SCORE '+score:'CUBE DASH 3D - tap',16,32);window.__frames=(window.__frames||0)+1});
</scr` + `ipt></body></html>`;

// A game that draws the creator's picture 'cat', streamed when the request has pictures.
const GAMEPIC = `<!doctype html>
<html><head><meta charset="utf-8"><title>Cat Catch</title>
<meta name="description" content="Your cat catches falling tokens.">
<meta name="gameplay-genre" content="Arcade">
<meta name="gameplay-controls" content="Tap to start">
<style>html,body{margin:0;height:100%;overflow:hidden;background:#123}canvas{display:block}</style></head>
<body><canvas id="c"></canvas>
<scr` + `ipt>
const c=document.getElementById('c'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;const cat=SP.image('cat');SP.ready();
function loop(){x.fillStyle='#123';x.fillRect(0,0,c.width,c.height);if(cat.complete&&cat.naturalWidth){x.drawImage(cat,40,40,96,96);window.__pic=cat.naturalWidth}requestAnimationFrame(loop)}loop();
</scr` + `ipt></body></html>`;

// A two-player game on SP.room, streamed when the creator asks for multiplayer.
const GAMEMP = `<!doctype html>
<html><head><meta charset="utf-8"><title>Tag Arena</title>
<meta name="description" content="Chase your friends around the arena.">
<meta name="gameplay-genre" content="Party">
<meta name="gameplay-controls" content="Drag to move">
<style>html,body{margin:0;height:100%;overflow:hidden;background:#201030}canvas{display:block}</style></head>
<body><canvas id="c"></canvas>
<scr` + `ipt>
const c=document.getElementById('c'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;SP.ready();
window.__mp={me:SP.room.me,online:SP.room.online,host:SP.room.isHost,players:SP.room.players.length,got:0};
SP.room.on('message',(d,from)=>{window.__mp.got++;window.__mp.last=d});
SP.room.on('join',()=>{window.__mp.players=SP.room.players.length});
SP.room.on('leave',()=>{window.__mp.players=SP.room.players.length});
setInterval(()=>SP.room.send({hi:SP.room.me}),150);
function loop(){x.fillStyle='#201030';x.fillRect(0,0,c.width,c.height);x.fillStyle='#fff';x.font='18px sans-serif';x.fillText('TAG ARENA '+SP.room.players.map(p=>p.name).join(' vs ')+' msgs '+window.__mp.got,16,32);requestAnimationFrame(loop)}loop();
</scr` + `ipt></body></html>`;

const text = (content) => (typeof content === 'string' ? content : content.map((p) => p.text || '').join('\n'));
const calls = [];
const screens = [];
const playtests = [];
const reply = (params, out) => ({ async *[Symbol.asyncIterator]() { yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: out } }; }, async finalMessage() { return { model: params.model, stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 1 } }; } });
const client = { beta: { messages: { stream(params, options = {}) {
  if (params.system[0].text.startsWith('You review browser games')) {
    const content = params.messages[0].content;
    const all = content.map((p) => p.text || '').join('\n');
    screens.push({ model: params.model, images: content.filter((p) => p.type === 'image').length, title: (all.match(/TITLE: (.*)/) || [])[1] });
    const verdict = /BLOCKME/.test(all) ? '{"verdict":"block","reasons":["It shows something not allowed (test)."]}' : '{"verdict":"allow","reasons":[]}';
    return { async *[Symbol.asyncIterator]() { yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: verdict } }; }, async finalMessage() { return { model: params.model, stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 1 } }; } };
  }
  if (params.system[0].text.startsWith('You play-test browser games')) {
    // Play-test review: passes, unless the creator's request says PLAYTESTFIX.
    const content = params.messages[0].content, all = text(content);
    playtests.push({ model: params.model, images: content.filter((p) => p.type === 'image').length, log: all.slice(all.indexOf('RUN LOG')) });
    return reply(params, /PLAYTESTFIX/.test(all) ? '{"verdict":"fix","problems":["The title text is cut off on the right."]}' : '{"verdict":"pass","problems":[]}');
  }
  const content = params.messages[0].content, task = text(content);
  // Changes come back as edit blocks: "glow" recolors the text, and a request with "three things" carries a checklist.
  if (task.includes('Instead of the whole document') && /glow/.test(task)) {
    calls.push({ model: params.model, task: task.slice(0, 200), tail: task.slice(-200), patch: true, pics: [], picBlock: false, images: 0, system: params.system[0].text.slice(0, 60) });
    const three = /three things/.test(task);
    const out = (three ? 'PLAN\n- [ ] glowing text\n- [ ] faster blocks\n- [ ] a boss\nEND PLAN\n' : '') + '<<<<<<< SEARCH\nx.fillStyle=\'#ffd84d\';x.font=\'24px sans-serif\';\n=======\nx.fillStyle=\'#7df9ff\';x.font=\'24px sans-serif\';\n>>>>>>> REPLACE' + (three ? '\nDONE\n- [x] glowing text\n- [x] faster blocks\n- [ ] a boss: no room left\nEND DONE' : '');
    return reply(params, out);
  }
  calls.push({ model: params.model, task: task.slice(0, 200), tail: task.slice(-200), pics: task.match(/- '[a-z0-9_]+': \d+x\d+ px/g) || [], picBlock: task.includes('sp-pictures'), images: Array.isArray(content) ? content.filter((p) => p.type === 'image').length : 0, system: params.system[0].text.slice(0, 60) });
  return {
    async *[Symbol.asyncIterator]() {
      const doc = task.includes('Players: multiplayer') ? GAMEMP : task.includes("CREATOR'S PICTURES") ? GAMEPIC : task.includes('Game type: 3D') ? GAME3D : GAME;
      for (let i = 0; i < doc.length; i += 300) {
        await new Promise((r) => setTimeout(r, 10));
        if (options.signal.aborted) throw new Error('aborted');
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: doc.slice(i, i + 300) } };
      }
    },
    async finalMessage() { return { model: params.model, stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 1 } }; },
  };
} } } };

const gallery = await openGallery({ adminKey: 'owner_' + 'x'.repeat(40) });
const sponsored = ['sponsored', 'sponsored-budget', 'sponsored-partial', 'sponsored-off'].includes(process.argv[3]);
const fake = sponsored || ['chain', 'mainnet'].includes(process.argv[3]) ? fakeRpc() : null;
const chain = fake ? openChain({ cluster: process.argv[3] === 'mainnet' ? 'mainnet-beta' : 'devnet', treasury: 'GPTreasury1111111111111111111111111111111111', rpc: fake.rpc }) : null;
// The persistent marker is a fixture only: no paid API calls or restart durability are involved.
const sponsorOpts = sponsored ? { sponsored: true, kv: Object.assign(memoryKv(), { persistent: true }), daily: 1, dailyEdits: 5, dailyScreens: 12, dailyPlaytests: 12, aiBudgetUsd: process.argv[3] === 'sponsored-budget' ? 0.01 : process.argv[3] === 'sponsored-partial' ? 2 : 400 } : {};
const server = createServer({ client: process.argv[3] === 'sponsored-off' ? null : client, daily: 50, gallery, chain, pro: { price: 1e8, days: 30, daily: 10 }, ...sponsorOpts });
const handle = server.listeners('request')[0];
server.removeAllListeners('request');
server.on('request', (req, res) => {
  if (req.url === '/__calls') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(calls)); }
  if (req.url === '/__playtests') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(playtests)); }
  if (req.url === '/__screens') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(screens)); }
  if (req.url === '/__chain' && fake) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ treasury: chain.site.treasury, balances: Object.fromEntries(fake.balances), sent: [...fake.txs.values()].filter((t) => t.p).length })); }
  return handle(req, res);
});
server.listen(Number(process.argv[2]) || 8766, '127.0.0.1', () => console.log('fake AI server ready'));
