const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyEmail, nameScore, senderEmail, containsTerm, normalize } = require('../src/core/classifier');
const { suppliers, inbox } = require('../src/data/sample');

for (const email of inbox) {
  test(`${email.id}: ${email.subject}`, () => {
    const result = classifyEmail(email, suppliers);
    assert.equal(result.decision, email.expect.decision, JSON.stringify(result));
    assert.equal(result.tier, email.expect.tier);
    assert.equal(result.supplierId, email.expect.supplierId);
  });
}

test('extracts the address from a display-name sender', () => {
  assert.equal(senderEmail('Laura Méndez <Laura.Mendez@CafeOrigen.Example>'), 'laura.mendez@cafeorigen.example');
});

test('name matching ignores accents, case and company suffixes', () => {
  assert.equal(nameScore('Logística del Caribe Ltda', 'LOGISTICA CARIBE envía documentos'), 1);
  assert.equal(nameScore('Logística del Caribe Ltda', 'caribe'), 0.5);
});

test('contract numbers match as whole tokens only', () => {
  const text = normalize('Consulta sobre el contrato CT-2026-044.');
  assert.equal(containsTerm(text, 'CT-2026-044'), true);
  assert.equal(containsTerm(text, 'CT-2026-04'), false);
  assert.equal(containsTerm(text, ''), false);
});

test('two suppliers registered on the same mailbox go to review', () => {
  const shared = [
    { id: 'A', name: 'Alfa', emails: ['facturas@holding.example'] },
    { id: 'B', name: 'Beta', emails: ['facturas@holding.example'] }
  ];
  const result = classifyEmail({ from: 'facturas@holding.example', subject: 'Docs', body: '' }, shared);
  assert.equal(result.decision, 'review');
  assert.deepEqual(result.reason, { code: 'tie', count: 2, tier: 'high' });
});

test('a public mail domain never counts as a corporate match', () => {
  const gmailSupplier = { id: 'X', name: 'Acme', domain: 'gmail.com', emails: ['acme@gmail.com'] };
  const result = classifyEmail({ from: 'stranger@gmail.com', subject: 'hola', body: '' }, [gmailSupplier]);
  assert.equal(result.decision, 'unmatched');
});

test('a registered sender beats a shared domain, so it is not a tie', () => {
  const result = classifyEmail(
    { from: 'seguridad@novagrupo.example', subject: 'Documentos', body: '', attachments: ['a.pdf'] },
    suppliers
  );
  assert.equal(result.decision, 'confirmed');
  assert.equal(result.supplierId, 'S06');
  assert.equal(result.documentAttached, true);
});

test('a forged sender never auto-confirms, even with exact evidence', () => {
  const email = { from: 'compras@papeleriaandina.example', subject: 'Cambio de cuenta CT-2026-014', body: '', senderVerified: false };
  const result = classifyEmail(email, suppliers);
  assert.equal(result.decision, 'review');
  assert.equal(result.tier, 'exact');
  assert.deepEqual(result.reason, { code: 'unverified-sender' });
});
