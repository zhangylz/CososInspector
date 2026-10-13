import fs from 'fs';
const s = JSON.parse(fs.readFileSync('tmp/jiligames-scene-snapshot.json', 'utf8'));
const findByName = (name, from, hits = []) => {
  if (!from) return hits;
  if (from.name === name) hits.push(from);
  for (const c of from.children || []) findByName(name, c, hits);
  return hits;
};

const dumpNode = (n, depth = 0, maxDepth = 4) => {
  const t = n.transform || {};
  const comps = (n.components || [])
    .map((c) => `${c.typeName}{${(c.rows || []).map((r) => `${r.label}=${r.value}`).join('; ').slice(0, 150)}}`)
    .join('\n' + '  '.repeat(depth + 1));
  console.log('  '.repeat(depth) + `${n.name} pos=(${t.position?.x},${t.position?.y}) scale=${t.scale?.x} active=${n.active}`);
  if (comps) console.log('  '.repeat(depth + 1) + comps);
  if (depth < maxDepth) (n.children || []).forEach((c) => dumpNode(c, depth + 1, maxDepth));
};

// 1) Character（鸡）
for (const nm of ['Character', 'Bonus_Character']) {
  findByName(nm, s.root).forEach((n) => {
    console.log(`\n===== ${n.path} =====`);
    dumpNode(n, 0, 3);
  });
}

// 2) Controller 层（GameMgr / GameCtrl / RacingManager）
console.log('\n===== Controller 层 =====');
const stage = findByName('Stage', s.root)[0];
const ctrl = (stage.children || []).find((c) => c.name === 'Controller');
if (ctrl) dumpNode(ctrl, 0, 3);
findByName('RacingManager', s.root).forEach((n) => {
  console.log(`\n===== ${n.path} =====`);
  dumpNode(n, 0, 2);
});

// 3) speedDeclare / Wheel / MineGame（速度声明、轮盘、小游戏）
for (const nm of ['speedDeclare', 'Wheel', 'MineGame']) {
  findByName(nm, s.root).slice(0, 1).forEach((n) => {
    console.log(`\n===== ${n.path} =====`);
    dumpNode(n, 0, 2);
  });
}
