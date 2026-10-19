// Split SQL into statements (dollar-quote/comment/string aware) and run
// each through the Supabase Management API, one HTTP call per statement.
// Usage: node run-statements.mjs <TOKEN> <FILE> [projectRef]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [token, file, refArg] = process.argv.slice(2);
const ref = refArg ?? 'rkpetffnstnmwwaevzmd';
if (!token || !file) {
  console.error('usage: node run-statements.mjs <TOKEN> <FILE> [projectRef]');
  process.exit(1);
}

function splitSql(src) {
  const stmts = [];
  let start = 0, line = 1, startLine = 1;
  let state = 'code', dollarTag = '';
  let hasCode = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '\n') line++;
    switch (state) {
      case 'code':
        if (c === '-' && n === '-') { state = 'lcomment'; i++; }
        else if (c === '/' && n === '*') { state = 'bcomment'; i++; }
        else if (c === "'") { state = 'squote'; hasCode = true; }
        else if (c === '"') { state = 'dquote'; hasCode = true; }
        else if (c === '$') {
          const m = /^\$[A-Za-z_0-9]*\$/.exec(src.slice(i));
          if (m) { state = 'dollar'; dollarTag = m[0]; hasCode = true; i += m[0].length - 1; }
        } else if (c === ';') {
          const text = src.slice(start, i + 1).trim();
          if (text && hasCode) stmts.push({ text, startLine });
          start = i + 1; startLine = line; hasCode = false;
        } else if (!/\s/.test(c)) {
          hasCode = true;
        }
        break;
      case 'lcomment': if (c === '\n') state = 'code'; break;
      case 'bcomment': if (c === '*' && n === '/') { state = 'code'; i++; } break;
      case 'squote': if (c === "'") { if (n === "'") i++; else state = 'code'; } break;
      case 'dquote': if (c === '"') { if (n === '"') i++; else state = 'code'; } break;
      case 'dollar':
        if (c === '$') {
          const m = /^\$[A-Za-z_0-9]*\$/.exec(src.slice(i));
          if (m && m[0].toLowerCase() === dollarTag.toLowerCase()) {
            state = 'code'; i += m[0].length - 1;
          }
        }
        break;
    }
    i++;
  }
  const tail = src.slice(start).trim();
  if (tail && hasCode) stmts.push({ text: tail, startLine });
  if (state !== 'code') console.error(`WARNING: file ends in state=${state} tag=${dollarTag}`);
  return stmts;
}

const src = readFileSync(file, 'utf8');
const stmts = splitSql(src);
console.log(`${file}: ${stmts.length} statements`);

for (let n = 0; n < stmts.length; n++) {
  const s = stmts[n];
  const label = `  [${n + 1}/${stmts.length}] L${s.startLine} ${s.text.slice(0, 60).replace(/\s+/g, ' ')}...`;
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: s.text }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    console.log(label + '  => FAIL');
    console.error(`\nFAILED statement starting at line ${s.startLine}:`);
    console.error(s.text);
    console.error(`\nHTTP ${res.status}: ${body}`);
    process.exit(1);
  }
  console.log(label + '  OK');
}
console.log(`ALL OK: ${file}`);
