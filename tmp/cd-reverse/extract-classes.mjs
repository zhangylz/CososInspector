import fs from 'fs';
const t = fs.readFileSync('tmp/cd-reverse/index.js', 'utf8');

// 找所有 ccclass 注册名（ccclass("Name") / ccclass('Name')）
const re = /ccclass\(\s*["']([^"']+)["']\s*\)/g;
const marks = [];
let m;
while ((m = re.exec(t))) marks.push({ name: m[1], start: m.index });
console.log('ccclass 总数:', marks.length);

fs.mkdirSync('tmp/cd-reverse/classes', { recursive: true });
const idx = new Map(); // name -> filename
for (let i = 0; i < marks.length; i++) {
  const start = marks[i].start;
  const end = i + 1 < marks.length ? marks[i + 1].start : Math.min(t.length, start + 60000);
  const body = t.slice(start, end);
  const safe = marks[i].name.replace(/[^A-Za-z0-9_-]/g, '_');
  const fn = `${String(i).padStart(3, '0')}_${safe}.js`;
  fs.writeFileSync(`tmp/cd-reverse/classes/${fn}`, body);
  idx.set(marks[i].name, fn);
}

// 保存类名索引
fs.writeFileSync(
  'tmp/cd-reverse/classes/_index.json',
  JSON.stringify([...marks.map((x, i) => ({ i, name: x.name, bytes: (idx.has(x.name) ? 0 : 0) }))], null, 1)
);

// 目标类清单
const focus = marks
  .map((x) => x.name)
  .filter((n) => /chicken|camera|road|game|car|wheel|move|player|dash|block|coin|foot|odds|stage/i.test(n));
console.log('相关类:', focus.join(', '));
console.log('全部类名:', marks.map((x) => x.name).join(', '));
