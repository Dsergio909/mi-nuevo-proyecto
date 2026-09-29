/**
 * Supplier Radar — reply classifier.
 *
 * Decides which supplier (if any) sent an email, using confidence tiers
 * instead of a single yes/no match. Only strong, unambiguous matches are
 * confirmed automatically; everything else goes to a human review queue.
 *
 * Evidence and reasons are returned as codes ({ code, ...params }) so any
 * front end can explain them in its own language (see messages.js).
 *
 * Runs unchanged in Node, the browser and Google Apps Script (V8).
 */
(function (root) {
  'use strict';

  var TIERS = ['exact', 'high', 'medium', 'low'];
  var RANK = { exact: 4, high: 3, medium: 2, low: 1 };
  var AUTO_CONFIRM = { exact: true, high: true, medium: true };
  var NAME_MATCH_THRESHOLD = 0.6;

  var PUBLIC_DOMAINS = [
    'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.es',
    'live.com', 'icloud.com', 'protonmail.com'
  ];
  var STOP_WORDS = ['sas', 'ltda', 'inc', 'the', 'los', 'las', 'del', 'and', 'company', 'grupo'];

  /** Lowercase, strip accents and punctuation (keeps @ . - for addresses and IDs). */
  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9@.\-\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** 'Name <Addr@Example.com>' -> 'addr@example.com'. */
  function senderEmail(from) {
    var match = /<([^>]+)>/.exec(from || '');
    return String(match ? match[1] : from || '').trim().toLowerCase();
  }

  function domainOf(email) {
    var at = email.lastIndexOf('@');
    return at < 0 ? '' : email.slice(at + 1);
  }

  /** True if `term` appears in `text` as a whole token (CT-2026-04 must not match CT-2026-044). */
  function containsTerm(text, term) {
    var needle = normalize(term);
    if (!needle) return false;
    var escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9-])' + escaped + '(?![a-z0-9-])').test(text);
  }

  function tokens(text) {
    return normalize(text)
      .replace(/[.\-@]/g, ' ')
      .split(' ')
      .filter(function (t) { return t.length > 2 && STOP_WORDS.indexOf(t) < 0; });
  }

  /** Share of the supplier's name tokens found in the text (0..1). */
  function nameScore(name, text) {
    var nameTokens = tokens(name);
    if (!nameTokens.length) return 0;
    var textTokens = tokens(text);
    var hits = nameTokens.filter(function (t) { return textTokens.indexOf(t) >= 0; });
    return hits.length / nameTokens.length;
  }

  /** Strongest tier at which `supplier` matches `email`, or null. */
  function scoreSupplier(email, supplier) {
    var from = senderEmail(email.from);
    var text = normalize((email.subject || '') + ' ' + (email.body || ''));
    var registered = (supplier.emails || []).map(senderEmail).indexOf(from) >= 0;
    var mentionsContract = containsTerm(text, supplier.contractId);
    var domain = domainOf(from);
    var contract = { code: 'contract-referenced', contractId: supplier.contractId };

    if (registered && mentionsContract) {
      return { tier: 'exact', evidence: [{ code: 'registered-sender' }, contract] };
    }
    if (registered) {
      return { tier: 'high', evidence: [{ code: 'registered-sender' }] };
    }
    if (domain && PUBLIC_DOMAINS.indexOf(domain) < 0 && normalize(supplier.domain) === domain) {
      return { tier: 'medium', evidence: [{ code: 'corporate-domain', domain: domain }] };
    }
    if (mentionsContract) {
      return { tier: 'low', evidence: [{ code: 'contract-unknown-sender', contractId: supplier.contractId }] };
    }
    var score = nameScore(supplier.name, email.from + ' ' + text);
    if (score >= NAME_MATCH_THRESHOLD) {
      return { tier: 'low', evidence: [{ code: 'name-match', percent: Math.round(score * 100) }] };
    }
    return null;
  }

  /**
   * Classify one email against the supplier list.
   * Set `email.senderVerified = false` when SPF/DMARC failed: the match is
   * then sent to review instead of being confirmed.
   *
   * @returns {{decision: 'confirmed'|'review'|'unmatched', tier: string|null,
   *   supplierId: string|null, reason: object|null, evidence: Array,
   *   candidates: Array, documentAttached: boolean}}
   */
  function classifyEmail(email, suppliers) {
    var candidates = [];
    (suppliers || []).forEach(function (supplier) {
      var result = scoreSupplier(email, supplier);
      if (result) {
        candidates.push({ supplierId: supplier.id, tier: result.tier, evidence: result.evidence });
      }
    });
    candidates.sort(function (a, b) { return RANK[b.tier] - RANK[a.tier]; });

    var result = {
      decision: 'unmatched', tier: null, supplierId: null, reason: { code: 'no-signal' }, evidence: [],
      candidates: candidates,
      documentAttached: !!(email.attachments && email.attachments.length)
    };
    if (!candidates.length) return result;

    var best = candidates[0];
    var tied = candidates.filter(function (c) { return c.tier === best.tier; });
    result.tier = best.tier;

    if (tied.length > 1) {
      result.decision = 'review';
      result.reason = { code: 'tie', count: tied.length, tier: best.tier };
    } else if (!AUTO_CONFIRM[best.tier]) {
      result.decision = 'review';
      result.supplierId = best.supplierId;
      result.reason = { code: 'weak-evidence' };
      result.evidence = best.evidence;
    } else if (email.senderVerified === false) {
      // A forged "From" header must never confirm a supplier (e.g. fake bank-account change).
      result.decision = 'review';
      result.supplierId = best.supplierId;
      result.reason = { code: 'unverified-sender' };
      result.evidence = best.evidence;
    } else {
      result.decision = 'confirmed';
      result.supplierId = best.supplierId;
      result.reason = null;
      result.evidence = best.evidence;
    }
    return result;
  }

  var api = {
    TIERS: TIERS,
    classifyEmail: classifyEmail,
    scoreSupplier: scoreSupplier,
    nameScore: nameScore,
    containsTerm: containsTerm,
    normalize: normalize,
    senderEmail: senderEmail
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Classifier = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
