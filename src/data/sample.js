/**
 * Synthetic demo data. Names, emails and contract IDs are fictional.
 */
(function (root) {
  'use strict';

  var TODAY = '2026-09-29';

  var suppliers = [
    { id: 'S01', name: 'Papelería Andina SAS', domain: 'papeleriaandina.example', emails: ['compras@papeleriaandina.example'],
      contractId: 'CT-2026-014', contractEnd: '2027-03-31', docsRequestedAt: '2026-09-20', docsReceivedAt: null, manualStatus: 'active' },
    { id: 'S02', name: 'Logística del Caribe Ltda', domain: 'logcaribe.example', emails: ['ops@logcaribe.example'],
      contractId: 'CT-2026-021', contractEnd: '2026-10-15', docsRequestedAt: '2026-09-25', docsReceivedAt: null, manualStatus: 'active' },
    { id: 'S03', name: 'TecnoSoluciones Integrales', domain: 'tecnosol.example', emails: ['soporte@tecnosol.example'],
      contractId: 'CT-2025-088', contractEnd: '2026-09-10', docsRequestedAt: '2026-08-20', docsReceivedAt: null, manualStatus: 'active' },
    { id: 'S04', name: 'Café Origen Export', domain: 'cafeorigen.example', emails: ['contratos@cafeorigen.example'],
      contractId: 'CT-2026-031', contractEnd: '2027-06-30', docsRequestedAt: '2026-09-26', docsReceivedAt: null, manualStatus: 'active' },
    { id: 'S05', name: 'Impresiones Ruiz', domain: '', emails: ['impresionesruiz.demo@gmail.com'],
      contractId: 'CT-2026-040', contractEnd: '2027-01-15', docsRequestedAt: '2026-09-15', docsReceivedAt: null, manualStatus: 'active' },
    { id: 'S06', name: 'Nova Seguridad Privada', domain: 'novagrupo.example', emails: ['seguridad@novagrupo.example'],
      contractId: 'CT-2026-044', contractEnd: '2026-12-31', docsRequestedAt: '2026-09-18', docsReceivedAt: null, manualStatus: 'active' },
    { id: 'S07', name: 'Nova Limpieza Industrial', domain: 'novagrupo.example', emails: ['limpieza@novagrupo.example'],
      contractId: 'CT-2026-045', contractEnd: '2027-02-28', docsRequestedAt: '2026-09-18', docsReceivedAt: null, manualStatus: 'at-risk' },
    { id: 'S08', name: 'Mobiliario Bogotá', domain: 'mobibog.example', emails: ['ventas@mobibog.example'],
      contractId: 'CT-2026-050', contractEnd: '2027-04-30', docsRequestedAt: '2026-08-01', docsReceivedAt: '2026-08-05', manualStatus: 'active' },
    { id: 'S09', name: 'Transportes Sabana', domain: 'transabana.example', emails: ['despachos@transabana.example'],
      contractId: 'CT-2026-052', contractEnd: '2026-10-20', docsRequestedAt: null, docsReceivedAt: null, manualStatus: 'expiring' }
  ];

  // `expect` documents the intended outcome; the test suite checks it.
  // `senderVerified: false` simulates an email that failed SPF/DMARC (spoofed).
  var inbox = [
    { id: 'E1', from: 'Compras Papelería Andina <compras@papeleriaandina.example>', subject: 'RE: Documentos contrato CT-2026-014',
      body: 'Buenos días, adjuntamos RUT y cámara de comercio actualizados.', attachments: ['RUT.pdf', 'camara_comercio.pdf'],
      expect: { decision: 'confirmed', tier: 'exact', supplierId: 'S01' } },
    { id: 'E2', from: 'ops@logcaribe.example', subject: 'Envío certificado bancario',
      body: 'Hola, quedo atento a cualquier comentario.', attachments: ['certificado_bancario.pdf'],
      expect: { decision: 'confirmed', tier: 'high', supplierId: 'S02' } },
    { id: 'E3', from: 'Laura Méndez <laura.mendez@cafeorigen.example>', subject: 'Documentos solicitados',
      body: 'Te comparto lo que pidieron desde compras.', attachments: ['poliza.pdf'],
      expect: { decision: 'confirmed', tier: 'medium', supplierId: 'S04' } },
    { id: 'E4', from: 'Facturación <facturacion@novagrupo.example>', subject: 'Adjuntamos cámara de comercio',
      body: 'Cordial saludo, enviamos el documento del grupo.', attachments: ['camara.pdf'],
      expect: { decision: 'review', tier: 'medium', supplierId: null } },
    { id: 'E5', from: 'Impresiones Ruiz <impresiones.ruiz.demo@gmail.com>', subject: 'Documentos Impresiones Ruiz',
      body: 'Escribo desde otro correo, adjunto lo pedido.', attachments: ['rut.pdf'],
      expect: { decision: 'review', tier: 'low', supplierId: 'S05' } },
    { id: 'E6', from: 'juan.perez.demo@hotmail.com', subject: 'Consulta contrato CT-2026-050',
      body: '¿Me confirman la fecha de la próxima entrega?', attachments: [],
      expect: { decision: 'review', tier: 'low', supplierId: 'S08' } },
    { id: 'E7', from: 'Ofertas <news@ofertasmarketing.example>', subject: '¡50% de descuento solo hoy!',
      body: 'No te pierdas nuestras promociones de temporada.', attachments: [],
      expect: { decision: 'unmatched', tier: null, supplierId: null } },
    { id: 'E8', from: 'soporte@tecnosol.example', subject: 'Renovación CT-2025-088',
      body: 'Enviamos propuesta de renovación y documentos vigentes.', attachments: ['propuesta.pdf'],
      expect: { decision: 'confirmed', tier: 'exact', supplierId: 'S03' } },
    { id: 'E9', from: 'Ventas Transportes Sabana <ventas@transabana.example>', subject: 'Tarifas 2027',
      body: 'Compartimos la nueva tabla de tarifas.', attachments: ['tarifas_2027.xlsx'],
      expect: { decision: 'confirmed', tier: 'medium', supplierId: 'S09' } },
    { id: 'E10', from: 'Compras Papelería Andina <compras@papeleriaandina.example>', subject: 'URGENTE: cambio de cuenta bancaria CT-2026-014',
      body: 'Por favor actualicen nuestra cuenta para el próximo pago.', attachments: ['nueva_cuenta.pdf'], senderVerified: false,
      expect: { decision: 'review', tier: 'exact', supplierId: 'S01' } }
  ];

  var api = { TODAY: TODAY, suppliers: suppliers, inbox: inbox };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SampleData = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
