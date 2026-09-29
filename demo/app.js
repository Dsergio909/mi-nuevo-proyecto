/* Supplier Radar demo — UI only. Every decision comes from src/core. */
(function () {
  'use strict';

  var I18N = {
    es: {
      tagline: '> automatización de proveedores y contratos · humano en el circuito',
      intro: 'Versión pública del sistema que construí en mis prácticas: lee la bandeja de entrada, identifica qué proveedor respondió con niveles de confianza, confirma solo lo seguro y manda lo dudoso a revisión humana. El tablero se calcula únicamente con fechas. Datos 100% sintéticos.',
      simDate: 'Fecha simulada:',
      clockHint: 'Adelanta el tiempo y mira cómo cambian los estados.',
      inbox: 'BANDEJA DE ENTRADA', process: '▶ PROCESAR', reset: '↺ REINICIAR',
      review: 'REVISIÓN HUMANA',
      reviewHint: 'Casos ambiguos: el sistema no adivina, te muestra la evidencia y tú decides.',
      reviewEmpty: 'Nada pendiente. Procesa la bandeja para llenar esta cola.',
      suppliers: 'PROVEEDORES',
      colSupplier: 'Proveedor', colContract: 'Contrato', colStatus: 'Estado', colDays: 'Días', colDocs: 'Documentos',
      colReason: 'Motivo', colManual: 'Estado manual (hoja)',
      howTitle: 'NIVELES DE CONFIANZA',
      tierExact: 'Remitente registrado + número de contrato en el correo → se confirma.',
      tierHigh: 'Remitente registrado → se confirma.',
      tierMedium: 'Dominio corporativo del proveedor (nunca gmail/hotmail) → se confirma si es único; si dos proveedores comparten dominio, va a revisión.',
      tierLow: 'Solo nombre parecido, o número de contrato desde un correo desconocido → siempre revisión humana.',
      footer: 'Datos sintéticos · lógica real en src/core · cubierta por tests',
      kpi: { expired: 'Vencidos', 'at-risk': 'En riesgo', expiring: 'Por vencer (30 días)', active: 'Al día' },
      status: { expired: 'VENCIDO', 'at-risk': 'EN RIESGO', expiring: 'POR VENCER', active: 'AL DÍA' },
      decision: { confirmed: 'CONFIRMADO', review: 'A REVISIÓN', unmatched: 'IGNORADO' },
      assign: 'Asignar a', discard: 'Descartar', stale: 'desactualizado',
      docsReceived: 'recibidos', docsRequested: 'solicitados'
    },
    en: {
      tagline: '> supplier & contract automation · human in the loop',
      intro: 'Public version of the system I built during my internship: it reads the inbox, works out which supplier replied using confidence tiers, confirms only the safe matches and sends anything doubtful to human review. The dashboard is computed from dates alone. 100% synthetic data.',
      simDate: 'Simulated date:',
      clockHint: 'Move time forward and watch the statuses change.',
      inbox: 'INBOX', process: '▶ PROCESS', reset: '↺ RESET',
      review: 'HUMAN REVIEW',
      reviewHint: 'Ambiguous cases: the system does not guess, it shows the evidence and you decide.',
      reviewEmpty: 'Nothing pending. Process the inbox to fill this queue.',
      suppliers: 'SUPPLIERS',
      colSupplier: 'Supplier', colContract: 'Contract', colStatus: 'Status', colDays: 'Days', colDocs: 'Documents',
      colReason: 'Reason', colManual: 'Manual status (sheet)',
      howTitle: 'CONFIDENCE TIERS',
      tierExact: 'Registered sender + contract number in the email → confirmed.',
      tierHigh: 'Registered sender → confirmed.',
      tierMedium: 'Supplier corporate domain (never gmail/hotmail) → confirmed if unique; if two suppliers share the domain, it goes to review.',
      tierLow: 'Only a similar name, or a contract number from an unknown address → always human review.',
      footer: 'Synthetic data · real logic in src/core · covered by tests',
      kpi: { expired: 'Expired', 'at-risk': 'At risk', expiring: 'Expiring (30 days)', active: 'Up to date' },
      status: { expired: 'EXPIRED', 'at-risk': 'AT RISK', expiring: 'EXPIRING', active: 'UP TO DATE' },
      decision: { confirmed: 'CONFIRMED', review: 'TO REVIEW', unmatched: 'IGNORED' },
      assign: 'Assign to', discard: 'Discard', stale: 'stale',
      docsReceived: 'received', docsRequested: 'requested'
    }
  };
  var KPI_COLORS = { expired: 'var(--red)', 'at-risk': 'var(--pink)', expiring: 'var(--amber)', active: 'var(--green)' };
  var DAY_MS = 86400000;
  var FLASH_MS = 1800;

  var lang = /^en/i.test(navigator.language || '') ? 'en' : 'es';
  var state;

  function t(key) { return I18N[lang][key]; }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function reset() {
    state = {
      suppliers: JSON.parse(JSON.stringify(SampleData.suppliers)),
      results: {},
      resolved: {},
      flashUntil: {},
      scanning: null,
      processing: false
    };
    render();
  }

  function today() {
    var base = Compliance.toDay(SampleData.TODAY);
    return new Date(base + Number($('dayOffset').value) * DAY_MS).toISOString().slice(0, 10);
  }

  function supplierById(id) {
    return state.suppliers.filter(function (s) { return s.id === id; })[0];
  }

  function recordDocuments(supplierId) {
    supplierById(supplierId).docsReceivedAt = today();
    state.flashUntil[supplierId] = Date.now() + FLASH_MS;
  }

  // ---------- actions ----------

  function processInbox() {
    if (state.processing) return;
    var run = state;
    run.processing = true;
    var queue = SampleData.inbox.filter(function (m) { return !run.results[m.id]; });
    var delay = reducedMotion() ? 0 : 420;

    (function step() {
      if (state !== run) return; // reset while processing
      var mail = queue.shift();
      run.scanning = mail ? mail.id : null;
      if (!mail) {
        run.processing = false;
        render();
        return;
      }
      render();
      setTimeout(function () {
        if (state !== run) return;
        var result = Classifier.classifyEmail(mail, run.suppliers);
        run.results[mail.id] = result;
        if (result.decision === 'confirmed' && result.documentAttached) recordDocuments(result.supplierId);
        render();
        setTimeout(step, delay / 2);
      }, delay);
    })();
  }

  function resolve(mail, supplierId) {
    state.resolved[mail.id] = supplierId || 'discarded';
    if (supplierId && mail.attachments.length) recordDocuments(supplierId);
    render();
  }

  // ---------- rendering ----------

  function render() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(function (node) {
      node.textContent = t(node.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
    });
    $('today').textContent = today();
    $('process').disabled = state.processing || SampleData.inbox.every(function (m) { return state.results[m.id]; });

    var summary = Compliance.summarize(state.suppliers, today());
    renderKpis(summary);
    renderInbox();
    renderReview();
    renderSuppliers(summary);
  }

  function renderKpis(summary) {
    var box = $('kpis');
    box.textContent = '';
    Compliance.STATUSES.forEach(function (status) {
      var card = el('div', 'kpi');
      card.style.setProperty('--c', KPI_COLORS[status]);
      card.appendChild(el('span', 'n', String(summary.counts[status])));
      card.appendChild(el('span', 'l', t('kpi')[status]));
      box.appendChild(card);
    });
  }

  function mailHeader(item, mail) {
    item.appendChild(el('span', 'from', mail.from));
    item.appendChild(el('span', 'subject', mail.subject));
  }

  function renderInbox() {
    var list = $('inbox');
    list.textContent = '';
    SampleData.inbox.forEach(function (mail) {
      var item = el('li', 'mail' + (state.scanning === mail.id ? ' scanning' : ''));
      mailHeader(item, mail);
      if (mail.attachments.length) item.appendChild(el('span', 'clip', '📎 ' + mail.attachments.join(', ')));

      var result = state.results[mail.id];
      if (result) {
        var row = el('div', 'result');
        row.appendChild(el('span', 'chip ' + result.decision, t('decision')[result.decision]));
        if (result.tier) row.appendChild(el('span', 'chip ' + result.tier, result.tier.toUpperCase()));
        var who = result.supplierId ? supplierById(result.supplierId).name + ' · ' : '';
        row.appendChild(el('span', '', who + Messages.explain(result, lang)));
        item.appendChild(row);
      }
      list.appendChild(item);
    });
  }

  function renderReview() {
    var list = $('review');
    list.textContent = '';
    var pending = SampleData.inbox.filter(function (m) {
      var r = state.results[m.id];
      return r && r.decision === 'review' && !state.resolved[m.id];
    });
    $('reviewCount').textContent = pending.length ? '(' + pending.length + ')' : '';
    if (!pending.length) {
      list.appendChild(el('li', 'empty', t('reviewEmpty')));
      return;
    }
    pending.forEach(function (mail) {
      var result = state.results[mail.id];
      var item = el('li', 'mail');
      mailHeader(item, mail);
      var why = el('div', 'result');
      why.appendChild(el('span', 'chip ' + result.tier, result.tier.toUpperCase()));
      why.appendChild(el('span', '', Messages.explain(result, lang)));
      item.appendChild(why);

      var buttons = el('div', 'buttons');
      result.candidates.forEach(function (c) {
        var b = el('button', 'btn small primary', t('assign') + ' ' + supplierById(c.supplierId).name);
        b.title = c.evidence.map(function (e) { return Messages.format(e, lang); }).join(', ');
        b.addEventListener('click', function () { resolve(mail, c.supplierId); });
        buttons.appendChild(b);
      });
      var discard = el('button', 'btn small', t('discard'));
      discard.addEventListener('click', function () { resolve(mail, null); });
      buttons.appendChild(discard);
      item.appendChild(buttons);
      list.appendChild(item);
    });
  }

  function docsText(s) {
    var requested = Compliance.toDay(s.docsRequestedAt);
    var received = Compliance.toDay(s.docsReceivedAt);
    if (received !== null && (requested === null || received >= requested)) {
      return '✔ ' + t('docsReceived') + ' ' + s.docsReceivedAt;
    }
    return requested !== null ? '⏳ ' + t('docsRequested') + ' ' + s.docsRequestedAt : '—';
  }

  function flash(tr, supplierId) {
    var remaining = (state.flashUntil[supplierId] || 0) - Date.now();
    if (remaining <= 0 || reducedMotion() || !tr.animate) return;
    // Rows are rebuilt on every render, so resume the fade where it was.
    var alpha = (0.25 * remaining / FLASH_MS).toFixed(3);
    tr.animate(
      [{ backgroundColor: 'rgba(57, 255, 136, ' + alpha + ')' }, { backgroundColor: 'rgba(57, 255, 136, 0)' }],
      { duration: remaining, easing: 'linear' }
    );
  }

  function renderSuppliers(summary) {
    var body = $('suppliers');
    body.textContent = '';
    summary.rows.forEach(function (row) {
      var s = row.supplier;
      var tr = el('tr');
      tr.appendChild(el('td', '', s.name));
      tr.appendChild(el('td', 'nowrap', s.contractId));
      var statusCell = el('td');
      statusCell.appendChild(el('span', 'status ' + row.status, t('status')[row.status]));
      tr.appendChild(statusCell);
      tr.appendChild(el('td', 'num', row.daysLeft === null ? '—' : String(row.daysLeft)));
      tr.appendChild(el('td', 'nowrap', docsText(s)));
      tr.appendChild(el('td', '', Messages.format(row.reason, lang)));
      var manual = el('td', row.staleManualStatus ? 'stale' : '');
      if (row.staleManualStatus) {
        manual.appendChild(el('s', '', t('status')[s.manualStatus]));
        manual.appendChild(document.createTextNode(' ⚠ ' + t('stale')));
      } else {
        manual.textContent = t('status')[s.manualStatus] || '—';
      }
      tr.appendChild(manual);
      body.appendChild(tr);
      flash(tr, s.id);
    });
  }

  // ---------- wiring ----------

  $('process').addEventListener('click', processInbox);
  $('reset').addEventListener('click', function () { $('dayOffset').value = 0; reset(); });
  $('dayOffset').addEventListener('input', render);
  document.querySelectorAll('[data-lang]').forEach(function (b) {
    b.addEventListener('click', function () { lang = b.getAttribute('data-lang'); render(); });
  });

  reset();
})();
