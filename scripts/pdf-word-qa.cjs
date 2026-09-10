/** Local-only QA: no upload, no fixture copying, outputs must stay in ignored work/. */
require('./pdf-word-loader.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const {Packer} = require('docx');
const assert = require('node:assert/strict');
const {unzipSync,strFromU8} = require('fflate');

async function main() {
  const inputs=process.argv.slice(2);
  if(!inputs.length) throw new Error('Usage: node scripts/pdf-word-qa.cjs <local.pdf> [local.pdf...]');
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const {extractWordPage}=require('../lib/pdf/word-extraction.ts');
  const {createWordDocument}=require('../lib/pdf/word-document.ts');
  const {lineText}=require('../lib/pdf/word-layout.ts');
  const out=path.resolve('work/pdf-word-qa');
  await fs.mkdir(out,{recursive:true});
  for(const input of inputs) {
    const start=performance.now();
    const document=await pdfjs.getDocument({data:new Uint8Array(await fs.readFile(input)),useSystemFonts:true}).promise;
    const pages=[];
    let sourceText='';
    try {
      for(let i=1;i<=document.numPages;i++) {
        const pdfPage=await document.getPage(i);
        const text=await pdfPage.getTextContent();
        sourceText+=text.items.filter(item=>'str' in item).map(item=>item.str).join('');
        pages.push(await extractWordPage(pdfPage,text));
        pdfPage.cleanup();
      }
      const buffer=await Packer.toBuffer(createWordDocument(pages));
      const xml=strFromU8(unzipSync(buffer)['word/document.xml']);
      const recoveredText=[...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&')).join('');
      const glyphs=text=>[...text.replace(/\s/g,'')].sort().join('');
      assert.equal(glyphs(recoveredText),glyphs(sourceText),'Source characters must be retained exactly once in the DOCX');
      const stem=path.basename(input,'.pdf');
      await fs.writeFile(path.join(out,`${stem}-improved.docx`),buffer);
      await fs.writeFile(path.join(out,`${stem}-layout.json`),JSON.stringify(pages,null,2));
      console.log(JSON.stringify({file:path.basename(input),ms:Math.round(performance.now()-start),sourceCharacters:sourceText.replace(/\s/g,'').length,charactersRetained:true,docxTables:(xml.match(/<w:tbl>/g)||[]).length,pages:pages.map(p=>({
        paragraphs:p.blocks.filter(b=>b.kind!=='table').length,
        tables:p.blocks.filter(b=>b.kind==='table').map(t=>({rows:t.rows.length,columns:t.edges.length-1,continuation:!!t.continuation,rowKeys:t.rows.map(r=>r[0].map(lineText).join(' '))})),
        readingOrder:p.blocks.map(b=>b.kind==='table'?`table (${b.rows.length} rows)`: `${b.kind}: ${b.lines.map(lineText).join(' ').slice(0,70)}`),
      }))},null,2));
    } finally { await document.destroy(); }
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
