/**
 * Minimal in-memory fakes of the Apps Script services the adapter uses,
 * so apps-script/Code.js can run end-to-end under `node --test`.
 * They model behaviour the adapter relies on, not the full Google APIs.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const SOURCES = [
  'src/core/classifier.js',
  'src/core/compliance.js',
  'src/core/messages.js',
  'apps-script/Code.js'
];

// Like Sheets: a leading apostrophe forces text and is not part of the value.
function cellValue(v) {
  return typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
}

function createSheet(name, rows = []) {
  const data = rows.map((r) => r.map(cellValue));
  const raw = []; // rows exactly as the adapter wrote them, before Sheets' text handling
  const width = () => Math.max(1, ...data.map((r) => r.length));
  const get = (r, c) => {
    const v = (data[r] || [])[c];
    return v === undefined ? '' : v;
  };
  const sheet = {
    name,
    data,
    raw,
    getName: () => name,
    appendRow(row) {
      raw.push(Array.from(row));
      data.push(Array.from(row, cellValue)); // copy into this realm so assertions compare plain arrays
      return sheet;
    },
    getLastRow: () => data.length,
    getDataRange() {
      return {
        getValues: () => (data.length ? data : [[]]).map((_, r) =>
          Array.from({ length: width() }, (__, c) => get(r, c)))
      };
    },
    getRange(row, column, numRows = 1, numColumns = 1) {
      return {
        setValue(value) {
          while (data.length < row) data.push([]);
          data[row - 1][column - 1] = cellValue(value);
        },
        getValues: () => Array.from({ length: numRows }, (_, r) =>
          Array.from({ length: numColumns }, (__, c) => get(row - 1 + r, column - 1 + c)))
      };
    },
    clear() {
      data.length = 0;
    }
  };
  return sheet;
}

function createAttachment(name) {
  return { getName: () => name, copyBlob: () => ({ name }) };
}

function createMessage({ id, from, subject, body = '', date, attachments = [], auth = 'mx.google.com; spf=pass' }) {
  return {
    getHeader: (name) => (name === 'Authentication-Results' ? auth : ''),
    getId: () => id,
    getFrom: () => from,
    getSubject: () => subject,
    getPlainBody: () => body,
    getDate: () => date,
    getAttachments: () => attachments.map(createAttachment)
  };
}

function createThread(id, messages) {
  const thread = {
    id,
    labels: [],
    getMessages: () => messages,
    getPermalink: () => `https://mail.google.com/mail/#all/${id}`,
    addLabel(label) {
      thread.labels.push(label.getName());
      return thread;
    }
  };
  return thread;
}

function createFolder(name) {
  const folder = {
    name,
    files: [],
    folders: [],
    getFoldersByName(n) {
      const found = folder.folders.filter((f) => f.name === n);
      return { hasNext: () => found.length > 0, next: () => found.shift() };
    },
    createFolder(n) {
      const child = createFolder(n);
      folder.folders.push(child);
      return child;
    },
    createFile(blob) {
      folder.files.push(blob.name);
      return blob;
    }
  };
  return folder;
}

/**
 * Build a sandbox with fakes and load the adapter into it.
 * @param {{sheets?: Object<string, Array[]>, threads?: Array, me?: string,
 *   properties?: Object, now?: Date}} options
 */
function loadAdapter({ sheets = {}, threads = [], me = 'compras@miempresa.example', properties = {}, now, lockFree = true } = {}) {
  const book = {};
  Object.keys(sheets).forEach((n) => { book[n] = createSheet(n, sheets[n]); });
  const toasts = [];
  const sent = [];
  const labels = {};
  const driveRoot = createFolder('root');

  const context = {
    console,
    SpreadsheetApp: {
      getActive: () => ({
        getSheetByName: (n) => book[n] || null,
        insertSheet: (n) => (book[n] = createSheet(n)),
        toast: (msg) => toasts.push(msg)
      })
    },
    GmailApp: {
      search: (query, start, max) => threads.slice(start, start + max),
      getUserLabelByName: (n) => labels[n] || null,
      createLabel: (n) => (labels[n] = { getName: () => n }),
      sendEmail: (to, subject, body) => sent.push({ to, subject, body }),
      getMessageById: (id) => threads.flatMap((t) => t.getMessages()).find((m) => m.getId() === id) || null
    },
    DriveApp: { getFolderById: () => driveRoot },
    LockService: { getScriptLock: () => ({ tryLock: () => lockFree, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => properties[k] || null }) },
    Session: {
      getEffectiveUser: () => ({ getEmail: () => me }),
      getScriptTimeZone: () => 'America/Bogota'
    },
    Utilities: { formatDate: (date) => date.toISOString().slice(0, 16).replace('T', ' ') }
  };
  vm.createContext(context);
  SOURCES.forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  });
  if (now) context.now_ = () => now;

  return { gas: context, book, sent, toasts, driveRoot };
}

module.exports = { loadAdapter, createMessage, createThread };
