#!/usr/bin/env node
// Run before deploying: node check-syntax.js
// Extracts all <script> blocks from admin.html and validates JS syntax.
// Catches the apostrophe-in-string bugs before they reach production.

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'public', 'admin.html');
const html = fs.readFileSync(file, 'utf8');

const scriptRegex = /<script(?:\s[^>]*)?>([^]*?)<\/script>/gi;
let match;
let index = 0;
let errors = 0;

while ((match = scriptRegex.exec(html)) !== null) {
    index++;
    const code = match[1];
    if (!code.trim()) continue;
    try {
        new Function(code);
        console.log('Script block ' + index + ': OK');
    } catch (e) {
        const approxLine = html.slice(0, match.index).split('\n').length;
        console.error('Script block ' + index + ' (near HTML line ' + approxLine + '): SYNTAX ERROR');
        console.error('  ' + e.message);
        errors++;
    }
}

if (errors > 0) {
    console.error('\n' + errors + ' error(s) found. Fix before deploying.');
    process.exit(1);
} else {
    console.log('\nAll script blocks OK.');
}
