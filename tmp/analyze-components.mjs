import fs from 'fs';
const s = JSON.parse(fs.readFileSync('tmp/jiligames-scene-snapshot.json', 'utf8'));

// 1) 枚举所有自定义（非 cc./sp./dragonBones）组件
const customs = new Map(); // typeName -> [{path, rows}]
const walk = (n, cb) => { cb(n); (n.children || []).forEach((c) => walk(c, cb)); };

walk(s.root, (n) => {
  for (const c of n.components || []) {
    if (/^(cc\.|sp\.|dragonBones\.|builtin)/.test(c.typeName)) continue;
    if (!customs.has(c.typeName)) customs.set(c.typeName, []);
    customs.get(c.typeName).push({
      path: n.path,
      pos: n.transform?.position,
      euler: n.transform?.euler,
      rows: c.rows?.map((r) => `${r.label}=${r.value}`).join(' | ').slice(0, 220),
    });
  }
});

console.log('=== 自定义脚本组件清单（类型 × 数量）===');
for (const [t, list] of [...customs.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${t}  ×${list.length}`);
}

console.log('\n=== 关键脚本详情 ===');
const focus = ['roadItem', 'CameraResize', 'ChickenDashAutoSetting', 'Stage', 'Game'];
for (const t of focus) {
  const list = customs.get(t);
  if (!list) continue;
  console.log(`\n[${t}]`);
  list.slice(0, 3).forEach((e) =>
    console.log(`  ${e.path}\n    pos=${JSON.stringify(e.pos)} euler=${JSON.stringify(e.euler)}\n    ${e.rows}`)
  );
}

// 2) 所有含 "Camera"/"Stage"/"Game"/"chicken" 的脚本名
console.log('\n=== 名字含 camera/chicken/dash/game/move/road 的脚本 ===');
for (const [t, list] of customs) {
  if (/camera|chicken|dash|game|move|road|player|car|wheel|block|coin|odds/i.test(t)) {
    console.log(`  ${t} ×${list.length}  e.g. ${list[0].path}`);
  }
}

// 3) Stage / Display / UI / BGLayer 的变换（判断道路走向/旋转）
console.log('\n=== 关键层级变换 ===');
const findByName = (name, from) => {
  if (!from) return null;
  if (from.name === name) return from;
  for (const c of from.children || []) { const r = findByName(name, c); if (r) return r; }
  return null;
};
for (const nm of ['GameLayer', 'Stage', 'Display', 'UI', 'BGLayer', 'TopLayer', 'Common']) {
  const n = findByName(nm, s.root);
  if (n) {
    console.log(`${n.path}  pos=${JSON.stringify(n.transform?.position)} scale=${JSON.stringify(n.transform?.scale)} euler=${JSON.stringify(n.transform?.euler)} children=${(n.children || []).map((c) => c.name).join(',')}`);
  }
}

// 4) BGLayer 内 bg_first / roadItem-001 / roadItem-028 / bg_end 的世界位置推算（局部 y）
console.log('\n=== 路段布局 ===');
for (const nm of ['bg_first', 'roadItem-001', 'roadItem-002', 'roadItem-014', 'roadItem-028', 'bg_end']) {
  const n = findByName(nm, s.root);
  if (n) console.log(`${nm}: pos=${JSON.stringify(n.transform?.position)} size=${(n.components || []).find((c) => c.typeName === 'cc.UITransform')?.rows?.find((r) => r.label === '内容尺寸')?.value}`);
}
