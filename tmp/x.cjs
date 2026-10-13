(async () => {
  const r = await fetch('https://casino-wbgame.jiligames.com/chickendash10000/src/chunks/bundle.b1c26.js', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const t = await r.text();
  console.log('bundle len:', t.length);
  console.log('System.register modules:', (t.match(/System\.register\(/g) || []).length);
  const counts = {};
  for (const k of ['CameraResize', 'roadItem', 'GameMgr', 'GameCtrl', 'chicken', 'Chicken', 'MineGame', 'isCurrentStage', 'chickenSymbol', 'Camera'])
    counts[k] = (t.match(new RegExp(k, 'g')) || []).length;
  console.log('keyword counts:', JSON.stringify(counts));
})();
