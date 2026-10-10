// Runs server/server.mjs with a fake Claude client, for the browser tests: `node test/fake_ai_server.mjs 8766`.
// Every build streams the same small game; GET /__calls lists what the page asked for.
import { createServer } from '../server/server.mjs';

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

const calls = [];
const client = { beta: { messages: { stream(params, options) {
  calls.push({ model: params.model, task: params.messages[0].content.slice(0, 200), system: params.system[0].text.slice(0, 60) });
  return {
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < GAME.length; i += 300) {
        await new Promise((r) => setTimeout(r, 10));
        if (options.signal.aborted) throw new Error('aborted');
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: GAME.slice(i, i + 300) } };
      }
    },
    async finalMessage() { return { model: params.model, stop_reason: 'end_turn', usage: { output_tokens: 1 } }; },
  };
} } } };

const server = createServer({ client, daily: 50 });
const handle = server.listeners('request')[0];
server.removeAllListeners('request');
server.on('request', (req, res) => {
  if (req.url === '/__calls') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(calls)); }
  return handle(req, res);
});
server.listen(Number(process.argv[2]) || 8766, '127.0.0.1', () => console.log('fake AI server ready'));
