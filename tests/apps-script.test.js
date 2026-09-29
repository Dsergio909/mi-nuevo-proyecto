const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAdapter, createMessage, createThread } = require('./helpers/gas-fakes');
const { suppliers, inbox } = require('../src/data/sample');

const HEADERS = ['id', 'name', 'domain', 'emails', 'contractId', 'contractEnd',
  'docsRequestedAt', 'docsReceivedAt', 'manualStatus'];
const DATE_FIELDS = ['contractEnd', 'docsRequestedAt', 'docsReceivedAt'];
const NOW = new Date('2026-09-29T17:00:00Z');
const ME = 'compras@miempresa.co';
const isDate = (v) => Object.prototype.toString.call(v) === '[object Date]';

// The supplier tab as Sheets returns it: Date objects and '' for empty cells.
function supplierSheet() {
  return [HEADERS, ...suppliers.map((s) => HEADERS.map((h) => {
    if (h === 'emails') return s.emails.join(', ');
    if (DATE_FIELDS.includes(h)) return s[h] ? new Date(`${s[h]}T12:00:00Z`) : '';
    return s[h] || '';
  }))];
}

function inboxThreads() {
  const threads = inbox.map((mail) => createThread(`t-${mail.id}`, [createMessage({
    id: `m-${mail.id}`, from: mail.from, subject: mail.subject, body: mail.body,
    attachments: mail.attachments, date: new Date('2026-09-28T15:00:00Z')
  })]));
  // Our own request plus the supplier's reply in the same thread.
  threads.push(createThread('t-request', [
    createMessage({ id: 'm-request', from: `Compras <${ME}>`, subject: 'Solicitud de documentos — contrato CT-2026-044',
      body: 'Por favor adjunten los documentos del contrato CT-2026-044.', date: new Date('2026-09-18T13:00:00Z') }),
    createMessage({ id: 'm-reply', from: 'seguridad@novagrupo.com', subject: 'RE: Solicitud de documentos — contrato CT-2026-044',
      body: 'Adjuntamos lo solicitado.', attachments: ['rut_nova.pdf'], date: new Date('2026-09-29T14:00:00Z') })
  ]));
  return threads;
}

function setup() {
  const env = loadAdapter({
    sheets: { Proveedores: supplierSheet() },
    threads: inboxThreads(),
    me: ME,
    properties: { DRIVE_FOLDER_ID: 'folder-123' },
    now: NOW
  });
  env.cell = (id, field) => {
    const rows = env.book.Proveedores.data;
    return rows.find((r) => r[0] === id)[HEADERS.indexOf(field)];
  };
  env.folder = (id) => env.driveRoot.folders.find((f) => f.name.startsWith(`${id} — `));
  return env;
}

test('scanInbox logs each message once, files confirmed documents and queues the rest', () => {
  const env = setup();
  env.gas.scanInbox();

  const log = env.book['Registro'].data;
  assert.equal(log.length - 1, 10, 'nine inbox emails + one reply; our own request is skipped');
  assert.ok(!log.some((r) => r[8] === 'm-request'));

  const review = env.book['Revisión'].data.slice(1);
  assert.deepEqual(review.map((r) => r[7]), ['m-E4', 'm-E5', 'm-E6']);
  assert.equal(review[0][4], '2 proveedores empatan con confianza medium');

  for (const id of ['S01', 'S02', 'S03', 'S04', 'S06', 'S09']) {
    assert.ok(isDate(env.cell(id, 'docsReceivedAt')), `${id} should have documents recorded`);
    assert.ok(env.folder(id).files.length > 0, `${id} should have a Drive folder with files`);
  }
  assert.equal(env.cell('S05', 'docsReceivedAt'), '', 'review cases are not recorded automatically');

  const reply = env.gas.GmailApp.getMessageById('m-reply');
  assert.equal(env.cell('S06', 'docsReceivedAt'), reply.getDate());

  const threadLabels = Object.fromEntries(env.gas.GmailApp.search('', 0, 100).map((t) => [t.id, t.labels]));
  assert.deepEqual(threadLabels['t-E1'], ['Supplier Radar']);
  assert.deepEqual(threadLabels['t-E7'], [], 'unmatched newsletters are not labelled');

  env.gas.scanInbox();
  assert.equal(env.book['Registro'].data.length, log.length, 'a second run adds nothing');
  assert.equal(env.book['Revisión'].data.length - 1, 3);
});

test('applyReviewDecisions applies assignments once and reports unknown ids', () => {
  const env = setup();
  env.gas.scanInbox();
  const review = env.book['Revisión'];
  const assignColumn = review.data[0].length - 1; // 1-based index of "Asignar a"
  review.getRange(2, assignColumn).setValue('S07'); // E4: shared domain, a person picks the right company
  review.getRange(3, assignColumn).setValue('descartar'); // E5
  review.getRange(4, assignColumn).setValue('S99'); // E6: typo

  env.gas.applyReviewDecisions();
  env.gas.applyReviewDecisions();

  const applied = review.data.slice(1).map((r) => r[r.length - 1]);
  assert.match(applied[0], /^asignado /);
  assert.match(applied[1], /^descartado /);
  assert.equal(applied[2] || '', '');
  assert.ok(isDate(env.cell('S07', 'docsReceivedAt')));
  assert.deepEqual(env.folder('S07').files, ['camara.pdf'], 'attachments are filed exactly once');
  assert.equal(env.toasts.length, 2);
  assert.match(env.toasts[0], /S99/);
});

test('requestDocuments only emails suppliers that were never asked', () => {
  const env = setup();
  env.gas.requestDocuments();
  env.gas.requestDocuments();

  assert.deepEqual(env.sent.map((m) => m.to), ['despachos@transabana.co']);
  assert.equal(env.sent[0].subject, 'Solicitud de documentos — contrato CT-2026-052');
  assert.match(env.sent[0].body, /^Hola Transportes Sabana,/);
  assert.equal(env.cell('S09', 'docsRequestedAt'), NOW);
});

test('refreshDashboard computes KPIs from dates and flags stale manual statuses', () => {
  const env = setup();
  env.gas.refreshDashboard();

  const rows = env.book['Dashboard'].data;
  const kpi = Object.fromEntries(rows.slice(1, 5));
  assert.deepEqual(kpi, { 'Vencidos': 1, 'En riesgo': 4, 'Por vencer (30 días)': 2, 'Al día': 2 });
  const first = rows[7];
  assert.deepEqual(first, ['TecnoSoluciones Integrales', 'expired', -19, 'contrato vencido hace 19 días', 'sí']);
});
