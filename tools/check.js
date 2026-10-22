#!/usr/bin/env node
/* Run the headless checks (js/checks.js) in node, without a browser: node tools/check.js
   Loads the page's own rules file, then runs every check and its proof that it can fail.
   node tools/check.js passable   runs just one check. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
for (const f of ['title', 'lab', 'checks']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), { filename: f + '.js' });
}
const only = process.argv[2];
const out = window.JP.checks.run({ prove: true, only });
for (const r of out.results) {
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}: ${r.stat}${r.ok ? '' : '\n      ' + r.problems.slice(0, 8).join('\n      ')}`);
}
for (const p of out.prove) console.log(`${p.caught ? 'ok  ' : 'FAIL'} broken ${p.name} (${p.why}) is caught by ${p.check}: ${p.first}`);
console.log(`${out.ok ? 'ALL OK' : 'PROBLEMS'} (${out.ms} ms)`);
process.exit(out.ok ? 0 : 1);
