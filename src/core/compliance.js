/**
 * Supplier Radar — compliance status.
 *
 * Every status is derived from dates (contract end, documents requested,
 * documents received). A manually maintained "status" column is deliberately
 * ignored: in practice nobody keeps it up to date, so it carries no signal.
 *
 * Runs unchanged in Node, the browser and Google Apps Script (V8).
 */
(function (root) {
  'use strict';

  var DAY_MS = 24 * 60 * 60 * 1000;
  var DEFAULTS = { expiringWithinDays: 30, replyGraceDays: 7 };
  var STATUSES = ['expired', 'at-risk', 'expiring', 'active'];

  /** Parse 'YYYY-MM-DD' or a Date into a UTC-midnight timestamp (or null). */
  function toDay(value) {
    if (!value) return null;
    if (Object.prototype.toString.call(value) === '[object Date]') {
      return isNaN(value) ? null : Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
    }
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  }

  function daysBetween(from, to) {
    return Math.round((to - from) / DAY_MS);
  }

  /**
   * Status for one supplier on `today`, most urgent first:
   * expired > at-risk (documents requested, no reply) > expiring > active.
   */
  function supplierStatus(supplier, today, options) {
    var opts = Object.assign({}, DEFAULTS, options || {});
    var now = toDay(today);
    var end = toDay(supplier.contractEnd);
    var requested = toDay(supplier.docsRequestedAt);
    var received = toDay(supplier.docsReceivedAt);
    var daysLeft = end === null ? null : daysBetween(now, end);
    var pendingReply = requested !== null && (received === null || received < requested);
    var waitingDays = pendingReply ? daysBetween(requested, now) : 0;

    if (daysLeft !== null && daysLeft < 0) {
      return { status: 'expired', daysLeft: daysLeft, reason: { code: 'contract-ended', days: -daysLeft } };
    }
    if (pendingReply && waitingDays > opts.replyGraceDays) {
      return { status: 'at-risk', daysLeft: daysLeft, reason: { code: 'no-reply', days: waitingDays } };
    }
    if (daysLeft !== null && daysLeft <= opts.expiringWithinDays) {
      return { status: 'expiring', daysLeft: daysLeft, reason: { code: 'days-left', days: daysLeft } };
    }
    return { status: 'active', daysLeft: daysLeft, reason: { code: 'up-to-date' } };
  }

  /** KPIs plus per-supplier rows, sorted most urgent first. */
  function summarize(suppliers, today, options) {
    var counts = { expired: 0, 'at-risk': 0, expiring: 0, active: 0 };
    var rows = (suppliers || []).map(function (s) {
      var result = supplierStatus(s, today, options);
      counts[result.status]++;
      return {
        supplier: s,
        status: result.status,
        daysLeft: result.daysLeft,
        reason: result.reason,
        staleManualStatus: !!s.manualStatus && s.manualStatus !== result.status
      };
    });
    rows.sort(function (a, b) {
      return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) ||
        (a.daysLeft === null ? Infinity : a.daysLeft) - (b.daysLeft === null ? Infinity : b.daysLeft);
    });
    return { total: rows.length, counts: counts, rows: rows };
  }

  var api = { STATUSES: STATUSES, supplierStatus: supplierStatus, summarize: summarize, toDay: toDay };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Compliance = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
