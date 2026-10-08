// Parse all inline JavaScript in index.html to catch startup-breaking syntax errors.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.ok(scripts.length>0,'Expected script tags in index.html');
let checked=0;
for(const match of scripts){
 if(!match[1].trim())continue;
 new vm.Script(match[1],{filename:'index.html inline script'});
 checked++;
}
assert.ok(checked>0,'Expected at least one inline script');
console.log('PASS: '+checked+' inline script(s) parsed without syntax errors');
