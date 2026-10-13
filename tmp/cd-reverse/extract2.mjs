import fs from 'fs';
const t = fs.readFileSync('tmp/cd-reverse/index.js', 'utf8');

// cclegacy._RF.push({}, "uuid", "ClassName", ...) 标记类区域
const re = /cclegacy\._RF\.push\(\{\}\s*,\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/g;
const marks = [];
let m;
while ((m = re.exec(t))) marks.push({ uuid: m[1], name: m[2], start: m.index });
console.log('_RF.push 类数:', marks.length);
console.log('类名:', marks.map((x) => x.name).join(', '));

fs.mkdirSync('tmp/cd-reverse/classes', { recursive: true });
for (let i = 0; i < marks.length; i++) {
  const end = i + 1 < marks.length ? marks[i + 1].start : t.length;
  const body = t.slice(marks[i].start, end);
  const safe = marks[i].name.replace(/[^A-Za-z0-9_-]/g, '_');
  fs.writeFileSync(`tmp/cd-reverse/classes/${String(i).padStart(3, '0')}_${safe}.js`, body);
}
