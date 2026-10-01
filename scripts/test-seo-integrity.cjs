const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const origin = 'https://toolnesting.com';
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8');
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };

// Evaluate actual registry/sitemap exports with isolated production configuration.
function loadModule(filename, imports = {}, contactEmail = 'qa@example.test') {
  const exports = {};
  const context = { exports, URL,
    process: { env: { NEXT_PUBLIC_SITE_URL: origin, NEXT_PUBLIC_CONTACT_EMAIL: contactEmail } },
    require: name => { assert.ok(name in imports, 'Unexpected import: ' + name); return imports[name]; },
  };
  vm.runInNewContext(ts.transpileModule(read(filename), { compilerOptions, fileName: filename }).outputText, context);
  return exports;
}

// Inspect metadata without importing interactive tools or executing PDF code.
function metadataFor(filename, siteConfig) {
  const ast = ts.createSourceFile(filename, read(filename), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(['title', 'description', 'homepageTitle', 'homepageDescription', 'metadata']);
  const declarations = ast.statements.filter(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.every(declaration => names.has(declaration.name.getText(ast))));
  const exports = {};
  vm.runInNewContext(ts.transpileModule(declarations.map(node => node.getText(ast)).join('\n'),
    { compilerOptions, fileName: filename }).outputText, { exports, siteConfig, URL });
  assert.ok(exports.metadata, filename + ': explicit metadata declaration required');
  return exports.metadata;
}
function assertIndexable(metadata, filename) {
  if (typeof metadata.robots === 'string') assert.doesNotMatch(metadata.robots, /\bnoindex\b/i, filename);
  else {
    assert.notEqual(metadata.robots?.index, false, filename + ': noindex');
    assert.notEqual(metadata.robots?.googleBot?.index, false, filename + ': Googlebot noindex');
  }
}

const registry = loadModule('lib/site.ts');
const { categories, tools, siteConfig } = registry;
const available = tools.filter(tool => tool.available === true);
const hrefs = Array.from(available, tool => tool.href);
assert.equal(new Set(hrefs).size, available.length, 'Duplicate available tool href');
assert.equal(new Set(Array.from(available, tool => tool.name.toLowerCase())).size, available.length, 'Duplicate available name');
assert.equal(new Set(Array.from(categories, category => category.slug)).size, categories.length, 'Duplicate category');
const titles = new Set(), descriptions = new Set();
assertIndexable(metadataFor('app/layout.tsx', siteConfig), 'app/layout.tsx');
for (const tool of available) {
  assert.match(tool.href ?? '', /^\/tools\/[a-z0-9-]+$/, 'Invalid available href: ' + tool.name);
  assert.ok(categories.some(category => category.slug === tool.category), tool.href + ': invalid category');
  const filename = 'app' + tool.href + '/page.tsx';
  assert.ok(fs.existsSync(path.join(root, filename)), tool.href + ': missing route');
  const metadata = metadataFor(filename, siteConfig);
  assert.equal(typeof metadata.title, 'string', tool.href + ': missing title');
  assert.ok(metadata.title.trim(), tool.href + ': empty title');
  assert.equal(typeof metadata.description, 'string', tool.href + ': missing description');
  assert.ok(metadata.description.trim(), tool.href + ': empty description');
  assert.ok(!titles.has(metadata.title), tool.href + ': duplicate title'); titles.add(metadata.title);
  assert.ok(!descriptions.has(metadata.description), tool.href + ': duplicate description'); descriptions.add(metadata.description);
  assert.ok(metadata.alternates?.canonical, tool.href + ': missing canonical');
  assert.equal(new URL(metadata.alternates.canonical, origin).href, origin + tool.href, tool.href + ': wrong canonical');
  assert.equal(new URL(metadata.openGraph?.url, origin).href, origin + tool.href, tool.href + ': wrong Open Graph URL');
  assert.ok(metadata.openGraph?.title && metadata.openGraph?.description, tool.href + ': incomplete Open Graph');
  assert.ok(metadata.twitter?.card && metadata.twitter?.title && metadata.twitter?.description, tool.href + ': incomplete Twitter');
  assertIndexable(metadata, filename);
  for (const layout of ['app/tools/layout.tsx', 'app' + tool.href + '/layout.tsx']) {
    if (fs.existsSync(path.join(root, layout))) assertIndexable(metadataFor(layout, siteConfig), layout);
  }
  assert.equal(new Set(tool.relatedHrefs ?? []).size, (tool.relatedHrefs ?? []).length, tool.href + ': duplicate related link');
  for (const target of tool.relatedHrefs ?? []) {
    assert.notEqual(target, tool.href, 'Self-related tool');
    assert.ok(hrefs.includes(target), tool.href + ': unavailable related target ' + target);
  }
  assert.equal(registry.getRelatedTools(tool.href).length, (tool.relatedHrefs ?? []).length, tool.href + ': related target filtered out');
}
const routeHrefs = fs.readdirSync(path.join(root, 'app/tools'), { withFileTypes: true })
  .filter(entry => entry.isDirectory() && fs.existsSync(path.join(root, 'app/tools', entry.name, 'page.tsx')))
  .map(entry => '/tools/' + entry.name);
assert.deepEqual([...hrefs].sort(), routeHrefs.sort(), 'Available registry and tool routes disagree');
console.log('PASS: ' + available.length + ' routes, unique metadata, categories, self canonicals, social metadata, indexability and related targets');

for (const contactEmail of ['qa@example.test', '']) {
  const site = loadModule('lib/site.ts', {}, contactEmail), imports = { '@/lib/site': site };
  const entries = loadModule('app/sitemap.ts', imports).default();
  const urls = Array.from(entries, entry => entry.url);
  const expected = ['', '/privacy-policy', '/terms', '/disclaimer', ...(contactEmail ? ['/contact'] : []),
    ...hrefs, ...Array.from(categories, category => '/categories/' + category.slug)].map(route => origin + route);
  assert.equal(new Set(urls).size, urls.length, 'Duplicate sitemap URL');
  assert.deepEqual([...urls].sort(), expected.sort(), 'Sitemap missing/extra indexable routes');
  const robots = loadModule('app/robots.ts', imports).default();
  assert.equal(robots.sitemap, origin + '/sitemap.xml');
  for (const rule of Array.isArray(robots.rules) ? robots.rules : [robots.rules]) {
    if (rule.userAgent === '*' || [].concat(rule.userAgent).includes('Googlebot')) {
      assert.ok(!rule.disallow || [].concat(rule.disallow).every(value => !value), 'Unexpected crawler block');
    }
  }
  console.log('PASS: actual sitemap/robots exports: ' + urls.length + ' URLs, contact ' + (contactEmail ? 'configured' : 'unconfigured'));
}

// Optional post-build check covers actual Next.js metadata and visible schema content.
if (process.argv.includes('--build')) {
  const decode = value => value.replace(/&(?:amp|quot|apos|lt|gt|#x[0-9a-f]+|#\d+);/gi, entity => {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    return named[entity] ?? String.fromCodePoint(entity.startsWith('&#x') ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10));
  });
  const normalize = value => decode(value).replace(/\s+/g, ' ').trim();
  for (const href of hrefs) {
    const html = read('.next/server/app' + href + '.html');
    const tags = html.match(/<(?:meta|link)\b[^>]*>/g) ?? [];
    const attribute = key => tags.find(tag => tag.includes('"' + key + '"'))?.match(/(?:content|href)="([^"]*)"/)?.[1];
    assert.equal(attribute('canonical'), origin + href, href + ': rendered canonical');
    assert.equal(attribute('og:url'), origin + href, href + ': rendered social URL');
    assert.doesNotMatch(attribute('robots') ?? '', /\bnoindex\b/i);
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .flatMap(match => { const json = JSON.parse(match[1]); return json['@graph'] ?? [json]; });
    assert.equal(schemas.filter(schema => schema['@type'] === 'SoftwareApplication').length, 1, href + ': missing/duplicated application schema');
    const visibleText = normalize(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, ' '));
    for (const schema of schemas) {
      if (schema['@type'] === 'SoftwareApplication') assert.equal(schema.url, origin + href);
      if (schema['@type'] === 'FAQPage') for (const question of schema.mainEntity) {
        assert.ok(visibleText.includes(normalize(question.name)), href + ': schema question missing from page');
        assert.ok(visibleText.includes(normalize(question.acceptedAnswer.text)), href + ': schema answer missing from page');
      }
    }
  }
  console.log('PASS: all built tool canonicals, social URLs, indexability, application schema and visible FAQ content');
}
