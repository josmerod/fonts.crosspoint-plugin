import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const PAYLOAD = new URL('../fonts.crosspoint-plugin/', import.meta.url);

// A family count goes stale as soon as the catalog grows, and the catalog
// grows without a plugin release. (The 128 installed-family limit is a device
// constant, not a count.)
const STALE_FAMILY_COUNT = /\b\d+ (precompiled |font |catalog )+(\.cpfont )?\bfamil(y|ies)\b/i;

async function loadPlugin(globals = {}) {
  let render;
  const context = vm.createContext({
    CrossPoint: {
      registerPlugin(fn) { render = fn; },
    },
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    DataView,
    Map,
    Date,
    Math,
    Array,
    String,
    Number,
    Object,
    Promise,
    encodeURIComponent,
    decodeURIComponent,
    atob,
    btoa,
    setTimeout,
    ...globals,
  });
  const source = await readFile(new URL('plugin.js', PAYLOAD), 'utf8');
  vm.runInContext(source, context, { filename: 'plugin.js' });
  assert.equal(typeof render, 'function', 'plugin.js should register a render function');
  return { render, context };
}

function fakeDocument(ids) {
  const elements = Object.fromEntries(ids.map((id) => [id, {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    // Size checkboxes render checked in the real markup; mirror that here so
    // a test only has to uncheck what it wants to exclude.
    checked: id.startsWith('fx-size-'),
    onclick: null,
    onchange: null,
    oninput: null,
  }]));
  return {
    elements,
    getElementById(id) {
      assert.ok(elements[id], 'unexpected element lookup: ' + id);
      return elements[id];
    },
  };
}

function response({ status = 200, json, body = new ArrayBuffer(0), text = '' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return json; },
    async arrayBuffer() { return body; },
    async text() { return text; },
  };
}

const fam = (name, files, extra = {}) => ({
  name, title: name, description: name + ' desc', license: 'OFL',
  licenseUrl: 'https://raw.githubusercontent.com/example/cp-fonts/main/licenses/' + name + '-OFL.txt',
  styles: ['regular', 'bold'], sizes: files.map((f) => f.pt), files,
  previews: [{ pt: 14, path: `previews/${name}-14.png` }], totalBytes: 3,
  ...extra,
});

const CATALOG = {
  version: 1,
  baseUrl: 'https://github.com/example/releases/download/fonts/',
  rawBase: 'https://raw.githubusercontent.com/example/cp-fonts/main/',
  families: [
    fam('WPCharter', [
      { name: 'WPCharter_6.cpfont', pt: 6, size: 100, crc32: 1 },
      { name: 'WPCharter_14.cpfont', pt: 14, size: 200, crc32: 2 },
    ], { group: 'Reading' }),
    fam('WPIlliterata', [
      { name: 'WPIlliterata_6.cpfont', pt: 6, size: 100, crc32: 3 },
      { name: 'WPIlliterata_14.cpfont', pt: 14, size: 200, crc32: 4 },
    ], { group: 'Interface', license: 'GPL' }),
  ],
};

const IDS = ['fx-status', 'fx-list', 'fx-active', 'fx-set-active', 'fx-search', 'fx-license',
  'fx-catalog-url', 'fx-catalog-save'];
for (const name of ['WPCharter', 'WPIlliterata']) {
  IDS.push('fx-install-' + name, 'fx-remove-' + name, 'fx-size-' + name + '-6', 'fx-size-' + name + '-14',
    'fx-preview-' + name, 'fx-previews-' + name, 'fx-all-' + name, 'fx-none-' + name, 'fx-row-' + name);
}

function makeHarness({ configText = '', settingsText = '{"fontPointSize":12,"sdFontFamilyName":"WPCharter"}' } = {}) {
  const document = fakeDocument(IDS);
  const installedFamilies = [{ name: 'WPCharter', sizes: [6], files: [] }];
  const writes = [];
  const downloads = [];
  const deletes = [];
  const uploads = [];
  const mkdirs = [];
  const api = {
    async relay(method, url) {
      assert.equal(method, 'HEAD');
      if (url.includes('github.com/example')) {
        return { status: 302, body: '', headers: [['Location', url.replace('github.com/example', 'objects.example.com')]] };
      }
      return { status: 200, body: '', headers: [] };
    },
    async writeFile(path, dataB64) {
      writes.push({ path, data: Buffer.from(dataB64, 'base64').toString('utf8') });
      return { ok: true, bytes: dataB64.length };
    },
    async fetchToSd(url, dest) {
      downloads.push({ url, dest });
      if (url.includes('github.com/example')) return { status: 502, error: 'download failed' };
      installedFamilies.push({ name: dest.split('/')[2], sizes: [14], files: [] });
      return { status: 200, bytes: 1000, complete: true };
    },
  };
  class FakeFormData {
    constructor() { this.entries = {}; }
    append(k, v, name) { this.entries[k] = { value: v, name }; }
  }
  class FakeBlob { constructor(parts) { this.parts = parts; } }
  async function fetch(url, options = {}) {
    // Any catalog URL (default cp-fonts or the custom one) serves the fixture.
    if (url.startsWith('https://raw.githubusercontent.com/') && url.endsWith('/catalog/fonts.json')) return response({ json: CATALOG });
    if (url === '/mkdir') {
      // Recorded in order alongside downloads so the test can assert that the
      // folder is created before the first font download (an assert here
      // would be swallowed by the plugin's tolerant ensureFamilyDir).
      const form = new URLSearchParams(options.body);
      mkdirs.push({ name: form.get('name'), path: form.get('path'), afterDownloads: downloads.length });
      return response({ status: 400, text: 'Folder already exists' });
    }
    if (url.startsWith('/api/fonts/upload')) {
      uploads.push({ family: options.body.entries.family.value, file: options.body.entries.file.name });
      return response({ json: { ok: true } });
    }
    if (url.startsWith('/api/fonts') && !url.includes('/delete')) return response({ json: { families: installedFamilies, maxFamilies: 128 } });
    if (url.startsWith('/api/fonts/delete')) {
      deletes.push(JSON.parse(options.body).family);
      return response({ json: { ok: true } });
    }
    if (url.startsWith('/download?path=%2F.crosspoint%2Fsettings.json')) return response({ text: settingsText });
    if (url.startsWith('/download?path=%2F.crosspoint%2Ffonts.json')) return response({ text: configText });
    if (url.startsWith('/download?path=%2F.fonts%2F')) {
      return response({ body: new Uint8Array([0x43, 0x50, 0x46, 0x4f, 0x4e, 0x54, 0, 0]).buffer });
    }
    throw new Error('unexpected fetch: ' + url);
  }
  return { document, api, fetch, FormData: FakeFormData, Blob: FakeBlob,
    state: { installedFamilies, writes, downloads, deletes, uploads, mkdirs } };
}

test('manifest follows the Plugin Hub contract', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', PAYLOAD), 'utf8'));
  assert.match(manifest.name, /^[a-z0-9-]+$/);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(['files', 'settings'].includes(manifest.mount));
  for (const file of manifest.files) {
    assert.doesNotMatch(file, /(^\/|\\|\.\.)/);
    await readFile(new URL(file, PAYLOAD)); // every declared runtime file exists
  }
  assert.equal(manifest.compatibility.firmware_family[0], 'crosspoint');
  // The catalog grows without a plugin release, so the description must not
  // count families.
  assert.doesNotMatch(manifest.description, STALE_FAMILY_COUNT);
});

// The reader shows an installed plugin's README.md in a plain paged text
// viewer: there is no Markdown rendering, and the file must fit in RAM.
const README_LIMIT = 16 * 1024;
test('README reads as plain text on the reader', async () => {
  const readme = await readFile(new URL('README.md', PAYLOAD), 'utf8');
  assert.ok(Buffer.byteLength(readme) <= README_LIMIT, 'the reader refuses a README over 16 KB');
  // The reader draws it with the active reading font, which may lack the glyph.
  assert.doesNotMatch(readme, /[^\x00-\x7F]/, 'non-ASCII character');
  // Shown raw on the reader; setext headings, "- " and "1. " lists are not.
  // A hard line break is trailing spaces before a line end, not the CR of a
  // CRLF checkout.
  for (const [markup, what] of [
    [/\*\*/, 'bold'], [/`/, 'code'], [/\]\(https?:\/\//, 'link'], [/^#{1,6}\s/m, 'ATX heading'],
    [/<\/?[a-z][^>]*>/i, 'HTML tag'], [/^\s*\|.*\|\s*$/m, 'table'], [/\S[ \t]{2,}\r?$/m, 'hard line break'],
  ]) {
    assert.doesNotMatch(readme, markup, what + ' markup is shown raw');
  }
  // The web UI hostname is not the same on every device/firmware.
  assert.doesNotMatch(readme, /crosspoint\.local/i, 'device-specific hostname');
  assert.doesNotMatch(readme, STALE_FAMILY_COUNT, 'family count that goes stale');
});

// Plugin Hub converts DETAILS.md with a small Markdown subset (see
// markdown_details_to_html in tools/build_catalog.py of
// crosspoint-reader/crosspoint-plugin-hub) and the reader lays that HTML out
// with its reading engine. Anything outside the subset is shown verbatim.
const DETAILS_SOURCE_LIMIT = 16 * 1024;
const DETAILS_HTML_LIMIT = 24 * 1024;
function hubDetailsHtml(markdown) {
  const inline = (text) => text.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  const output = [];
  let paragraph = [];
  let inList = false;
  const flushParagraph = () => {
    if (paragraph.length) { output.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; }
  };
  const closeList = () => { if (inList) { output.push('</ul>'); inList = false; } };
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (!line) { flushParagraph(); closeList(); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph(); closeList();
      output.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    } else if (line.startsWith('- ')) {
      flushParagraph();
      if (!inList) { output.push('<ul>'); inList = true; }
      output.push(`<li>${inline(line.slice(2))}</li>`);
    } else { closeList(); paragraph.push(line); }
  }
  flushParagraph(); closeList();
  return output.join('\n').trim() + '\n';
}

test('DETAILS renders cleanly through the Plugin Hub converter', async () => {
  const source = await readFile(new URL('DETAILS.md', PAYLOAD), 'utf8');
  assert.ok(Buffer.byteLength(source) <= DETAILS_SOURCE_LIMIT, 'the hub rejects DETAILS.md over 16 KB');
  assert.doesNotMatch(source, /[^\x00-\x7F]/, 'non-ASCII character');

  const html = hubDetailsHtml(source);
  assert.ok(Buffer.byteLength(html) <= DETAILS_HTML_LIMIT, 'the hub rejects rendered details over 24 KB');
  // Links are not in the subset: "[text](url)" would be shown verbatim.
  assert.doesNotMatch(html, /\]\(https?:\/\//, 'Markdown link');
  assert.doesNotMatch(html, /[*`]/, 'unconverted inline markup');
  // A list item must be a single line, or the converter splits it into an
  // item followed by a stray paragraph.
  assert.doesNotMatch(html, /<\/li>\n<p>/, 'list item continued on the next line');
  assert.doesNotMatch(html, /<\/ul>\n<p>[a-z]/, 'paragraph glued to a list');
  assert.doesNotMatch(source, /crosspoint\.local/i, 'device-specific hostname');
  assert.doesNotMatch(source, STALE_FAMILY_COUNT, 'family count that goes stale');
});

test('installs selected sizes, refreshes the registry in place, sets the active family, removes', async () => {
  const h = makeHarness();
  const { render } = await loadPlugin({ document: h.document, fetch: h.fetch, FormData: h.FormData, Blob: h.Blob });
  await render({ innerHTML: '' }, h.api);

  assert.match(h.document.elements['fx-status'].textContent, /2 families available/);
  assert.equal(h.document.elements['fx-active'].value, 'WPCharter');
  assert.equal(h.document.elements['fx-catalog-url'].value, 'https://raw.githubusercontent.com/josmerod/cp-fonts/main/catalog/fonts.json');
  const listHtml = h.document.elements['fx-list'].innerHTML;
  assert.match(listHtml, /<strong>Reading<\/strong> · 1/);
  assert.match(listHtml, /<strong>Interface<\/strong> · 1/);
  assert.match(listHtml, /id="fx-row-WPCharter"/);
  assert.match(listHtml, /Installed 1\/2/);

  // Previews are lazy.
  assert.equal(h.document.elements['fx-previews-WPIlliterata'].innerHTML, '');
  await h.document.elements['fx-preview-WPIlliterata'].onclick();
  assert.match(h.document.elements['fx-previews-WPIlliterata'].innerHTML, /previews\/WPIlliterata-14\.png/);

  // License filter.
  h.document.elements['fx-license'].value = 'GPL';
  await h.document.elements['fx-license'].onchange();
  assert.doesNotMatch(h.document.elements['fx-list'].innerHTML, /fx-install-WPCharter/);
  h.document.elements['fx-license'].value = '';
  await h.document.elements['fx-license'].onchange();

  // Install only the checked size.
  h.document.elements['fx-size-WPIlliterata-6'].checked = false;
  const listBefore = h.document.elements['fx-list'].innerHTML;
  await h.document.elements['fx-install-WPIlliterata'].onclick();
  assert.deepEqual(h.state.mkdirs, [
    { name: '.fonts', path: '/', afterDownloads: 0 },
    { name: 'WPIlliterata', path: '/.fonts', afterDownloads: 0 },
  ]);
  // Direct fetch fails on the redirecting URL; the relay resolves; retry succeeds.
  assert.equal(h.state.downloads.length, 2);
  assert.equal(h.state.downloads[1].url, 'https://objects.example.com/releases/download/fonts/WPIlliterata_14.cpfont');
  assert.equal(h.state.downloads[1].dest, '/.fonts/WPIlliterata/WPIlliterata_14.cpfont');
  assert.deepEqual(h.state.uploads, [{ family: 'WPIlliterata', file: 'WPIlliterata_14.cpfont' }]);
  assert.match(h.document.elements['fx-status'].textContent, /Installed WPIlliterata \(1 sizes?\)/);

  // Row updated in place; the list (and its collapsed groups) is NOT rebuilt.
  assert.equal(h.document.elements['fx-install-WPIlliterata'].textContent, 'Reinstall');
  assert.equal(h.document.elements['fx-install-WPIlliterata'].disabled, false);
  assert.equal(h.document.elements['fx-list'].innerHTML, listBefore);
  assert.match(h.document.elements['fx-row-WPIlliterata'].innerHTML, /Installed 1\/2/);

  // Active family: settings.json rewritten, other keys preserved.
  h.document.elements['fx-active'].value = 'WPIlliterata';
  await h.document.elements['fx-set-active'].onclick();
  const settingsWrite = h.state.writes.find((w) => w.path === '/.crosspoint/settings.json');
  const saved = JSON.parse(settingsWrite.data);
  assert.equal(saved.sdFontFamilyName, 'WPIlliterata');
  assert.equal(saved.fontPointSize, 12);

  await h.document.elements['fx-remove-WPIlliterata'].onclick();
  assert.deepEqual(h.state.deletes, ['WPIlliterata']);
});

test('uses a custom catalog URL saved in /.crosspoint/fonts.json', async () => {
  const custom = 'https://raw.githubusercontent.com/example/cp-fonts/main/catalog/fonts.json';
  const h = makeHarness({ configText: JSON.stringify({ catalogUrl: custom }) });
  const { render } = await loadPlugin({ document: h.document, fetch: h.fetch, FormData: h.FormData, Blob: h.Blob });
  await render({ innerHTML: '' }, h.api);
  assert.equal(h.document.elements['fx-catalog-url'].value, custom);

  // Saving a new URL persists it and reloads the catalog.
  h.document.elements['fx-catalog-url'].value = custom;
  await h.document.elements['fx-catalog-save'].onclick();
  const cfgWrite = h.state.writes.find((w) => w.path === '/.crosspoint/fonts.json');
  assert.equal(JSON.parse(cfgWrite.data).catalogUrl, custom);
  assert.match(h.document.elements['fx-status'].textContent, /2 families available from the saved catalog/);

  // Invalid URL is rejected without writing.
  h.document.elements['fx-catalog-url'].value = 'not-a-url';
  const writesBefore = h.state.writes.length;
  await h.document.elements['fx-catalog-save'].onclick();
  assert.equal(h.state.writes.length, writesBefore);
  assert.match(h.document.elements['fx-status'].textContent, /must start with http/);
});
