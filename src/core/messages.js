/**
 * Supplier Radar — human-readable explanations (ES / EN).
 *
 * The core modules return evidence and reasons as { code, ...params };
 * this module turns them into sentences for sheets, logs and the demo.
 *
 * Runs unchanged in Node, the browser and Google Apps Script (V8).
 */
(function (root) {
  'use strict';

  var TEMPLATES = {
    es: {
      'registered-sender': 'remitente registrado',
      'contract-referenced': 'cita el contrato {contractId}',
      'corporate-domain': 'dominio corporativo @{domain}',
      'contract-unknown-sender': 'cita el contrato {contractId} desde un correo desconocido',
      'name-match': 'el nombre coincide en {percent}%',
      'no-signal': 'sin señal de ningún proveedor',
      'tie': '{count} proveedores empatan con confianza {tier}',
      'weak-evidence': 'solo evidencia débil',
      'contract-ended': 'contrato vencido hace {days} días',
      'no-reply': 'sin documentos tras {days} días',
      'days-left': 'quedan {days} días de contrato',
      'up-to-date': 'al día'
    },
    en: {
      'registered-sender': 'registered sender',
      'contract-referenced': 'references contract {contractId}',
      'corporate-domain': 'corporate domain @{domain}',
      'contract-unknown-sender': 'references contract {contractId} from an unknown address',
      'name-match': 'name matches {percent}%',
      'no-signal': 'no supplier signal',
      'tie': '{count} suppliers tie at {tier} confidence',
      'weak-evidence': 'only weak evidence',
      'contract-ended': 'contract ended {days} days ago',
      'no-reply': 'no documents after {days} days',
      'days-left': '{days} days left on contract',
      'up-to-date': 'up to date'
    }
  };

  function has(lang, code) {
    return !!(TEMPLATES[lang] && TEMPLATES[lang][code]);
  }

  /** One { code, ...params } item as a sentence fragment. */
  function format(item, lang) {
    var template = (TEMPLATES[lang] || TEMPLATES.en)[item.code] || item.code;
    return template.replace(/\{(\w+)\}/g, function (_, key) {
      return item[key] === undefined ? '' : String(item[key]);
    });
  }

  /** Full explanation of a classifier result: reason, then evidence. */
  function explain(result, lang) {
    var parts = [];
    if (result.reason) parts.push(format(result.reason, lang));
    if (result.evidence && result.evidence.length) {
      parts.push(result.evidence.map(function (e) { return format(e, lang); }).join(', '));
    }
    return parts.join(': ');
  }

  var api = { LANGS: Object.keys(TEMPLATES), format: format, explain: explain, has: has };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Messages = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
