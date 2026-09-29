/**
 * Synthetic demo data. Names, emails and contract IDs are fictional.
 */
(function (root) {
  'use strict';

  var TODAY = '2026-09-29';

  var suppliers = [
    { id: 'S01', name: 'Papelería Andina SAS', domain: 'papeleriaandina.co', emails: ['compras@papeleriaandina.co'],
      contractId: 'CT-2026-014', contractEnd: '2027-03-31', docsRequestedAt: '2026-09-20', docsReceivedAt: null, manualStatus: 'active' },
    { id: 'S02', name: 'Logística del Caribe Ltda', domain: 'logcaribe.com', emails: ['ops@logcaribe.com'],
      contractId: 'CT-2026-021', contractEnd: '2026-10-15', docsRequestedAt: '2026-09-25', docsReceivedAt: null, manualStatus: 'active' },
    { id: 'S03', name: 'TecnoSoluciones Integrales', domain: 'tecnosol.com.co', emails: ['soporte@tecnosol.com.co'],
      contractId: 'CT-2025-088', contractEnd: '2026-09-10', docsRequestedAt: '2026-08-20', docsReceivedAt: null, manualStatus: 'active' },
    { id: 'S04', name: 'Café Origen Export', domain: 'cafeorigen.co', emails: ['contratos@cafeorigen.co'],
      contractId: 'CT-2026-031', contractEnd: '2027-06-30', docsRequestedAt: '2026-09-26', docsReceivedAt: null, manualStatus: 'active' },
    { id: 'S05', name: 'Impresiones Ruiz', domain: '', emails: ['impresionesruiz@gmail.com'],
      contractId: 'CT-2026-040', contractEnd: '2027-01-15', docsRequestedAt: '2026-09-15', docsReceivedAt: null, manualStatus: 'active' },
    { id: 'S06', name: 'Nova Seguridad Privada', domain: 'novagrupo.com', emails: ['seguridad@novagrupo.com'],
      contractId: 'CT-2026-044', contractEnd: '2026-12-31', docsRequestedAt: '2026-09-18', docsReceivedAt: null, manualStatus: 'active' },
    { id: 'S07', name: 'Nova Limpieza Industrial', domain: 'novagrupo.com', emails: ['limpieza@novagrupo.com'],
      contractId: 'CT-2026-045', contractEnd: '2027-02-28', docsRequestedAt: '2026-09-18', docsReceivedAt: null, manualStatus: 'at-risk' },
    { id: 'S08', name: 'Mobiliario Bogotá', domain: 'mobibog.com', emails: ['ventas@mobibog.com'],
      contractId: 'CT-2026-050', contractEnd: '2027-04-30', docsRequestedAt: '2026-08-01', docsReceivedAt: '2026-08-05', manualStatus: 'active' },
    { id: 'S09', name: 'Transportes Sabana', domain: 'transabana.co', emails: ['despachos@transabana.co'],
      contractId: 'CT-2026-052', contractEnd: '2026-10-20', docsRequestedAt: null, docsReceivedAt: null, manualStatus: 'expiring' }
  ];

  // `expect` documents the intended outcome; the test suite checks it.
  var inbox = [
    { id: 'E1', from: 'Compras Papelería Andina <compras@papeleriaandina.co>', subject: 'RE: Documentos contrato CT-2026-014',
      body: 'Buenos días, adjuntamos RUT y cámara de comercio actualizados.', attachments: ['RUT.pdf', 'camara_comercio.pdf'],
      expect: { decision: 'confirmed', tier: 'exact', supplierId: 'S01' } },
    { id: 'E2', from: 'ops@logcaribe.com', subject: 'Envío certificado bancario',
      body: 'Hola, quedo atento a cualquier comentario.', attachments: ['certificado_bancario.pdf'],
      expect: { decision: 'confirmed', tier: 'high', supplierId: 'S02' } },
    { id: 'E3', from: 'Laura Méndez <laura.mendez@cafeorigen.co>', subject: 'Documentos solicitados',
      body: 'Te comparto lo que pidieron desde compras.', attachments: ['poliza.pdf'],
      expect: { decision: 'confirmed', tier: 'medium', supplierId: 'S04' } },
    { id: 'E4', from: 'Facturación <facturacion@novagrupo.com>', subject: 'Adjuntamos cámara de comercio',
      body: 'Cordial saludo, enviamos el documento del grupo.', attachments: ['camara.pdf'],
      expect: { decision: 'review', tier: 'medium', supplierId: null } },
    { id: 'E5', from: 'Impresiones Ruiz <impresiones.ruiz.bog@gmail.com>', subject: 'Documentos Impresiones Ruiz',
      body: 'Escribo desde otro correo, adjunto lo pedido.', attachments: ['rut.pdf'],
      expect: { decision: 'review', tier: 'low', supplierId: 'S05' } },
    { id: 'E6', from: 'juan.perez@hotmail.com', subject: 'Consulta contrato CT-2026-050',
      body: '¿Me confirman la fecha de la próxima entrega?', attachments: [],
      expect: { decision: 'review', tier: 'low', supplierId: 'S08' } },
    { id: 'E7', from: 'Ofertas <news@ofertasmarketing.com>', subject: '¡50% de descuento solo hoy!',
      body: 'No te pierdas nuestras promociones de temporada.', attachments: [],
      expect: { decision: 'unmatched', tier: null, supplierId: null } },
    { id: 'E8', from: 'soporte@tecnosol.com.co', subject: 'Renovación CT-2025-088',
      body: 'Enviamos propuesta de renovación y documentos vigentes.', attachments: ['propuesta.pdf'],
      expect: { decision: 'confirmed', tier: 'exact', supplierId: 'S03' } },
    { id: 'E9', from: 'Ventas Transportes Sabana <ventas@transabana.co>', subject: 'Tarifas 2027',
      body: 'Compartimos la nueva tabla de tarifas.', attachments: ['tarifas_2027.xlsx'],
      expect: { decision: 'confirmed', tier: 'medium', supplierId: 'S09' } }
  ];

  var api = { TODAY: TODAY, suppliers: suppliers, inbox: inbox };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SampleData = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
