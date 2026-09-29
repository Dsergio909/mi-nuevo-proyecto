const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyEmail } = require('../src/core/classifier');
const { summarize } = require('../src/core/compliance');
const { explain, format, has, LANGS } = require('../src/core/messages');
const { suppliers, inbox, TODAY } = require('../src/data/sample');

test('explains a confirmed match in both languages', () => {
  const result = classifyEmail(inbox[0], suppliers);
  assert.equal(explain(result, 'es'), 'remitente registrado, cita el contrato CT-2026-014');
  assert.equal(explain(result, 'en'), 'registered sender, references contract CT-2026-014');
});

test('explains review cases with reason and evidence', () => {
  const weak = classifyEmail(inbox.find((m) => m.id === 'E5'), suppliers);
  assert.equal(explain(weak, 'es'), 'solo evidencia débil: el nombre coincide en 100%');
  const tie = classifyEmail(inbox.find((m) => m.id === 'E4'), suppliers);
  assert.equal(explain(tie, 'en'), '2 suppliers tie at medium confidence');
});

test('every code produced on the sample data has a template in every language', () => {
  const items = [];
  for (const email of inbox) {
    const r = classifyEmail(email, suppliers);
    if (r.reason) items.push(r.reason);
    r.candidates.forEach((c) => items.push(...c.evidence));
  }
  for (const offset of [0, 60, 400]) {
    const day = new Date(Date.parse(TODAY) + offset * 864e5).toISOString().slice(0, 10);
    summarize(suppliers, day).rows.forEach((row) => items.push(row.reason));
  }
  for (const lang of LANGS) {
    for (const item of items) assert.ok(has(lang, item.code), `${lang} is missing "${item.code}"`);
  }
});

test('unknown language falls back to English', () => {
  assert.equal(format({ code: 'up-to-date' }, 'fr'), 'up to date');
});
