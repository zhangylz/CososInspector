const url = 'https://casino-wbgame.jiligames.com/chickendash10000/index.html';
fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } })
  .then(async (r) => {
    console.log('status', r.status);
    const t = await r.text();
    const scripts = [...t.matchAll(/src=["']([^"']+\.js[^"']*)["']/g)].map((m) => m[1]);
    console.log('scripts:', JSON.stringify(scripts.slice(0, 20), null, 1));
    console.log('html len', t.length);
    require('fs').writeFileSync('tmp/game-index.html', t);
  })
  .catch((e) => console.error('FETCH FAIL', e.message));
