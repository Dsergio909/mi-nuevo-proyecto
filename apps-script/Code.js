/**
 * Supplier Radar — Google Apps Script adapter.
 *
 * Wires the pure logic in src/core (Classifier, Compliance, Messages) to
 * Sheets, Gmail and Drive. Run `npm run build:gas` to copy the core files
 * next to this one, then paste or `clasp push` the folder (see README).
 *
 * Spreadsheet tabs:
 *   Proveedores — you create it, with headers:
 *                 id | name | domain | emails | contractId | contractEnd |
 *                 docsRequestedAt | docsReceivedAt | manualStatus
 *   Registro    — audit log of every classified email (created by the script)
 *   Revisión    — human review queue (created by the script)
 *   Dashboard   — KPIs (created by the script)
 */

var CONFIG = {
  SUPPLIERS_SHEET: 'Proveedores',
  LOG_SHEET: 'Registro',
  REVIEW_SHEET: 'Revisión',
  DASHBOARD_SHEET: 'Dashboard',
  LABEL: 'Supplier Radar',
  INBOX_QUERY: 'in:inbox newer_than:7d -category:promotions -category:social',
  MAX_THREADS: 100,
  DRIVE_FOLDER_PROPERTY: 'DRIVE_FOLDER_ID',
  LANG: 'es',
  DISCARD_WORD: 'descartar',
  REQUEST_SUBJECT: 'Solicitud de documentos — contrato {contractId}',
  REQUEST_BODY:
    'Hola {name},\n\nPara mantener al día el contrato {contractId}, por favor respondan este correo ' +
    'adjuntando RUT, cámara de comercio y certificado bancario vigentes.\n\n¡Gracias!'
};

var LOG_HEADERS = ['Fecha', 'De', 'Asunto', 'Decisión', 'Confianza', 'Proveedor', 'Explicación', 'Enlace', 'ID mensaje'];
var REVIEW_HEADERS = ['Fecha', 'De', 'Asunto', 'Confianza', 'Explicación', 'Candidatos', 'Enlace', 'ID mensaje',
  'Asignar a (id o "descartar")', 'Aplicado'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Supplier Radar')
    .addItem('1. Solicitar documentos pendientes', 'requestDocuments')
    .addItem('2. Procesar bandeja de entrada', 'scanInbox')
    .addItem('3. Aplicar decisiones de revisión', 'applyReviewDecisions')
    .addItem('4. Actualizar dashboard', 'refreshDashboard')
    .addSeparator()
    .addItem('Instalar ejecución automática', 'installTriggers')
    .addToUi();
}

/** Email every supplier that has never been asked for documents. */
function requestDocuments() {
  var table = readSuppliers_();
  table.rows.forEach(function (row) {
    var s = row.supplier;
    if (s.docsRequestedAt || !s.emails.length) return;
    GmailApp.sendEmail(s.emails[0], fill_(CONFIG.REQUEST_SUBJECT, s), fill_(CONFIG.REQUEST_BODY, s));
    table.write(row, 'docsRequestedAt', now_());
  });
}

/**
 * Classify every new inbox message once: confirmed matches file their
 * documents, ambiguous ones go to the review sheet, all are logged.
 */
function scanInbox() {
  var table = readSuppliers_();
  var suppliers = table.rows.map(function (r) { return r.supplier; });
  var log = sheet_(CONFIG.LOG_SHEET, LOG_HEADERS);
  var review = sheet_(CONFIG.REVIEW_SHEET, REVIEW_HEADERS);
  var seen = columnSet_(log, LOG_HEADERS.indexOf('ID mensaje') + 1);
  var me = Session.getEffectiveUser().getEmail().toLowerCase();
  var label = GmailApp.getUserLabelByName(CONFIG.LABEL) || GmailApp.createLabel(CONFIG.LABEL);

  GmailApp.search(CONFIG.INBOX_QUERY, 0, CONFIG.MAX_THREADS).forEach(function (thread) {
    var matched = false;
    thread.getMessages().forEach(function (message) {
      var id = message.getId();
      // Skip what was already logged and our own outgoing requests in the thread.
      if (seen[id] || Classifier.senderEmail(message.getFrom()) === me) return;
      seen[id] = true;

      var result = Classifier.classifyEmail({
        from: message.getFrom(),
        subject: message.getSubject(),
        body: message.getPlainBody().slice(0, 5000),
        attachments: message.getAttachments().map(function (a) { return a.getName(); })
      }, suppliers);
      var explanation = Messages.explain(result, CONFIG.LANG);
      var link = thread.getPermalink();

      log.appendRow([message.getDate(), message.getFrom(), message.getSubject(), result.decision,
        result.tier || '', result.supplierId || '', explanation, link, asText_(id)]);

      if (result.decision === 'confirmed' && result.documentAttached) {
        recordDocuments_(table, result.supplierId, message);
      } else if (result.decision === 'review') {
        var candidates = result.candidates.map(function (c) { return c.supplierId + ' (' + c.tier + ')'; });
        review.appendRow([message.getDate(), message.getFrom(), message.getSubject(), result.tier, explanation,
          candidates.join(', '), link, asText_(id), '', '']);
      }
      matched = matched || result.decision !== 'unmatched';
    });
    if (matched) thread.addLabel(label);
  });
  refreshDashboard();
}

/** Apply the supplier ids a person typed in the review sheet. */
function applyReviewDecisions() {
  var table = readSuppliers_();
  var review = sheet_(CONFIG.REVIEW_SHEET, REVIEW_HEADERS);
  var values = review.getDataRange().getValues();
  var col = {
    messageId: REVIEW_HEADERS.indexOf('ID mensaje'),
    assign: REVIEW_HEADERS.length - 2,
    applied: REVIEW_HEADERS.length - 1
  };
  var unknown = [];

  for (var i = 1; i < values.length; i++) {
    var choice = String(values[i][col.assign] || '').trim();
    if (!choice || values[i][col.applied]) continue;

    if (choice.toLowerCase() === CONFIG.DISCARD_WORD) {
      review.getRange(i + 1, col.applied + 1).setValue('descartado ' + formatDate_(now_()));
      continue;
    }
    if (!table.byId[choice]) {
      unknown.push(choice);
      continue;
    }
    var message = GmailApp.getMessageById(values[i][col.messageId]);
    if (message.getAttachments().length) recordDocuments_(table, choice, message);
    review.getRange(i + 1, col.applied + 1).setValue('asignado ' + formatDate_(now_()));
  }

  if (unknown.length) {
    SpreadsheetApp.getActive().toast('Ids de proveedor desconocidos: ' + unknown.join(', '), 'Supplier Radar');
  }
  refreshDashboard();
}

/** Recompute KPIs from dates only and write them to the Dashboard tab. */
function refreshDashboard() {
  var suppliers = readSuppliers_().rows.map(function (r) { return r.supplier; });
  var summary = Compliance.summarize(suppliers, now_());
  var sheet = sheet_(CONFIG.DASHBOARD_SHEET, []);
  sheet.clear();
  [
    ['Actualizado', now_()],
    ['Vencidos', summary.counts.expired],
    ['En riesgo', summary.counts['at-risk']],
    ['Por vencer (30 días)', summary.counts.expiring],
    ['Al día', summary.counts.active],
    [''],
    ['Proveedor', 'Estado', 'Días restantes', 'Motivo', 'Estado manual desactualizado']
  ].forEach(function (row) { sheet.appendRow(row); });
  summary.rows.forEach(function (r) {
    sheet.appendRow([r.supplier.name, r.status, r.daysLeft === null ? '' : r.daysLeft,
      Messages.format(r.reason, CONFIG.LANG), r.staleManualStatus ? 'sí' : '']);
  });
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('scanInbox').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('requestDocuments').timeBased().everyDays(1).atHour(8).create();
}

// ---------- helpers ----------

function now_() {
  return new Date();
}

function readSuppliers_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SUPPLIERS_SHEET);
  if (!sheet) throw new Error('Falta la hoja "' + CONFIG.SUPPLIERS_SHEET + '"');
  var values = sheet.getDataRange().getValues();
  var headers = values.shift().map(function (h) { return String(h).trim(); });
  var col = {};
  headers.forEach(function (h, i) { col[h] = i; });

  var rows = values
    .map(function (v, i) {
      var s = {};
      headers.forEach(function (h, j) { s[h] = v[j] === '' || v[j] === undefined ? null : v[j]; });
      s.id = s.id === null ? '' : String(s.id);
      s.emails = String(s.emails || '').split(/[,;\s]+/).filter(String);
      return { index: i + 2, supplier: s };
    })
    .filter(function (r) { return r.supplier.id; });
  var byId = {};
  rows.forEach(function (r) { byId[r.supplier.id] = r; });

  return {
    rows: rows,
    byId: byId,
    write: function (row, field, value) {
      sheet.getRange(row.index, col[field] + 1).setValue(value);
      row.supplier[field] = value;
    }
  };
}

/** File attachments in Drive and move docsReceivedAt forward (never back). */
function recordDocuments_(table, supplierId, message) {
  var row = table.byId[supplierId];
  saveAttachments_(row.supplier, message.getAttachments());
  var received = message.getDate();
  var current = row.supplier.docsReceivedAt;
  if (!current || new Date(current) < received) table.write(row, 'docsReceivedAt', received);
}

function saveAttachments_(supplier, attachments) {
  var folderId = PropertiesService.getScriptProperties().getProperty(CONFIG.DRIVE_FOLDER_PROPERTY);
  if (!folderId || !attachments.length) return;
  var root = DriveApp.getFolderById(folderId);
  var name = supplier.id + ' — ' + supplier.name;
  var folders = root.getFoldersByName(name);
  var folder = folders.hasNext() ? folders.next() : root.createFolder(name);
  attachments.forEach(function (a) { folder.createFile(a.copyBlob()); });
}

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers.length) sheet.appendRow(headers);
  }
  return sheet;
}

/** Set of the non-empty values in one column, header row excluded. */
function columnSet_(sheet, column) {
  var set = {};
  var last = sheet.getLastRow();
  if (last < 2) return set;
  sheet.getRange(2, column, last - 1, 1).getValues().forEach(function (r) {
    if (r[0]) set[r[0]] = true;
  });
  return set;
}

/** Leading apostrophe stops Sheets from turning ids like "1234e5" into numbers. */
function asText_(value) {
  return "'" + value;
}

function fill_(template, supplier) {
  return template.replace(/\{(\w+)\}/g, function (_, key) { return supplier[key] || ''; });
}

function formatDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}
