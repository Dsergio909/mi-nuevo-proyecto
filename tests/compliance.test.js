const test = require('node:test');
const assert = require('node:assert/strict');
const { supplierStatus, summarize } = require('../src/core/compliance');
const { suppliers, TODAY } = require('../src/data/sample');

const base = { contractEnd: '2027-12-31', docsRequestedAt: null, docsReceivedAt: null };

test('expired contract wins over everything else', () => {
  const s = { ...base, contractEnd: '2026-09-01', docsRequestedAt: '2026-08-01' };
  assert.deepEqual(supplierStatus(s, '2026-09-29'), {
    status: 'expired', daysLeft: -28, reason: { code: 'contract-ended', days: 28 }
  });
});

test('accepts Date objects as well as ISO strings', () => {
  const s = { ...base, contractEnd: new Date(2026, 9, 10) };
  assert.equal(supplierStatus(s, new Date(2026, 8, 29, 23, 59)).daysLeft, 11);
});

test('unanswered request becomes at-risk only after the grace period', () => {
  const s = { ...base, docsRequestedAt: '2026-09-22' };
  assert.equal(supplierStatus(s, '2026-09-29').status, 'active');
  assert.equal(supplierStatus(s, '2026-09-30').status, 'at-risk');
});

test('documents received before the latest request do not count', () => {
  const s = { ...base, docsRequestedAt: '2026-09-01', docsReceivedAt: '2026-08-15' };
  assert.equal(supplierStatus(s, '2026-09-29').status, 'at-risk');
  s.docsReceivedAt = '2026-09-03';
  assert.equal(supplierStatus(s, '2026-09-29').status, 'active');
});

test('expiring window is inclusive and configurable', () => {
  const s = { ...base, contractEnd: '2026-10-29' };
  assert.equal(supplierStatus(s, '2026-09-29').status, 'expiring');
  assert.equal(supplierStatus(s, '2026-09-29', { expiringWithinDays: 15 }).status, 'active');
});

test('summary counts, orders by urgency and flags stale manual statuses', () => {
  const summary = summarize(suppliers, TODAY);
  assert.deepEqual(summary.counts, { expired: 1, 'at-risk': 4, expiring: 2, active: 2 });
  assert.equal(summary.rows[0].status, 'expired');
  assert.deepEqual(summary.rows.map((r) => r.status), [...summary.rows.map((r) => r.status)].sort(
    (a, b) => ['expired', 'at-risk', 'expiring', 'active'].indexOf(a) - ['expired', 'at-risk', 'expiring', 'active'].indexOf(b)
  ));
  const stale = summary.rows.filter((r) => r.staleManualStatus).map((r) => r.supplier.id).sort();
  assert.deepEqual(stale, ['S01', 'S02', 'S03', 'S05', 'S06']);
});
