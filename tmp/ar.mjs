import fs from 'fs';
const s = JSON.parse(fs.readFileSync('tmp/jiligames-scene-snapshot.json', 'utf8'));
const findByName = (name, from, hits = []) => {
  if (!from) return hits;
  if (from.name === name) hits.push(from);
  for (const c of from.children || []) findByName(name, c, hits);
  return hits;
};
const showScript = (type) => {
  const hits = [];
  const walk = (n) => {
    for (const c of n.components || []) if (c.typeName === type) hits.push({ node: n, comp: c });
    (n.children || []).forEach(walk);
  };
  walk(s.root);
  for (const h of hits.slice(0, 4)) {
    console.log(`\n[${type}] @ ${h.node.path}`);
    console.log(`  pos=${JSON.stringify(h.node.transform?.position)} active=${h.node.active}`);
    for (const r of h.comp.rows || []) console.log(`  ${r.label} = ${String(r.value).slice(0, 130)}`);
  }
};
for (const t of ['RacingManager', 'Mouse', 'ListCulling', 'fastGameBlackBar', 'AutoCustom_ChickenDash', 'App']) showScript(t);
const m = JSON.parse(fs.readFileSync('tmp/jiligames-texture-manifest.json', 'utf8'));
const entries = Object.values(m.manifest || m);
console.log('\n=== manifest entry[0] ===');
console.log(JSON.stringify(entries[0], null, 1).slice(0, 900));
