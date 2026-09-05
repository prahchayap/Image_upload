#!/usr/bin/env node
// Injects data/events.json into index.html between the SEED markers, so the app
// still has full data when opened directly from the file system (file://) or
// offline before the network fetch resolves. Run after updating events.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = join(root, 'data', 'events.json');
const htmlPath = join(root, 'index.html');

const data = readFileSync(dataPath, 'utf8').trim();
JSON.parse(data); // validate

let html = readFileSync(htmlPath, 'utf8');
const START = '/*SEED_START*/', END = '/*SEED_END*/';
const s = html.indexOf(START), e = html.indexOf(END);
if (s === -1 || e === -1) { console.error('SEED markers not found in index.html'); process.exit(1); }

const replacement = START + 'window.__SEED__=' + data + ';' + END;
html = html.slice(0, s) + replacement + html.slice(e + END.length);
writeFileSync(htmlPath, html);
console.log('Injected ' + JSON.parse(data).events.length + ' events into index.html seed.');
