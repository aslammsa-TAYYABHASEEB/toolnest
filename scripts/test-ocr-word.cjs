require('./pdf-word-loader.cjs');
const assert=require('node:assert/strict');
const {buildOcrWordPage,finalizeOcrPages,decorativeBand,fitOcrText,recognitionLines}=require('../lib/pdf/ocr-word-layout.ts');
const {lineText}=require('../lib/pdf/word-layout.ts');
const {createWordDocument}=require('../lib/pdf/word-document.ts');
const {Packer}=require('docx');
const {unzipSync,strFromU8}=require('fflate');
let checks=0;
const check=(name,fn)=>{fn();checks++;console.log(name);};
const line=(text,x0,y0,x1=x0+300,extra={})=>({text,x0,y0,x1,y1:y0+12,height:12,confidence:95,words:[],...extra});
const page=lines=>buildOcrWordPage(lines,600,800,600,800);
check('OCR retains native coordinates, uncertain spelling, and clause indentation',()=>{
  const p=page([line('1. Main provision.— Uncertain w0rding.',50,200,550),line('(a) Nested clause',90,220),line('continued unchanged',130,240)]);
  assert.deepEqual(p.blocks.map(b=>b.x),[50,90,130]);
  assert.ok(p.blocks[0].lines[0].spans[0].bold);
  assert.match(p.blocks[0].lines.map(lineText).join(''),/w0rding/);
  assert.equal(p.blocks.filter(b=>b.kind==='table').length,0);
});
check('Repeated margins move to headers; unique title and body survive',()=>{
  const pages=[page([line('UNIQUE TITLE',200,20,400),line('First body',50,200)]),page([line('Official Journal 31',50,20),line('Unique legal sentence',50,50),line('Official Journal 31',50,400)]),page([line('Official Journal 32',50,20),line('Other body',50,200)])];
  finalizeOcrPages(pages);
  assert.equal(pages[0].ocrHeader,undefined);
  assert.deepEqual(pages[1].ocrHeader,['Official Journal 31']);
  assert.deepEqual(pages[1].blocks.map(b=>b.lines.map(lineText).join('')),['Unique legal sentence','Official Journal 31']);
});
check('Native page objects are not altered by OCR finalization',()=>{
  const native={...page([line('Native content',50,20)]),ocr:undefined};
  const before=JSON.stringify(native);finalizeOcrPages([native]);assert.equal(JSON.stringify(native),before);
});
check('Decorative band needs both uncertain central marks and display typography',()=>{
  const marks=[45,65,85].map(y=>line('?!',270,y,330,{confidence:20}));
  const display=line('Decorative title',130,110,470,{height:36,y1:148});
  const body=line('Body text',50,300);
  assert.equal(decorativeBand([display,body],600,800),undefined);
  assert.equal(decorativeBand([...marks,body],600,800),undefined);
  assert.ok(decorativeBand([...marks,display,body],600,800)>148);
});
check('Font fitting respects measured width and does not change text',()=>{
  const p=page([line('Exact wording',50,200,100)]),before=p.blocks[0].lines.map(lineText).join('');
  fitOcrText(p,(t,s)=>t.length*s);
  assert.ok(p.blocks[0].lines[0].size<=5);
  assert.equal(p.blocks[0].lines.map(lineText).join(''),before);
});
check('Regular scanned records still produce a real table',()=>{
  const lines=[0,1,2].map(i=>line(`Item${i} Detail${i} 25`,50,200+i*20,500,{words:[{text:`Item${i}`,x0:50,x1:90,confidence:95},{text:`Detail${i}`,x0:220,x1:270,confidence:95},{text:'25',x0:450,x1:470,confidence:95}]}));
  const p=page(lines),t=p.blocks.find(b=>b.kind==='table');
  assert.ok(t);assert.equal(t.rows.length,3);assert.equal(t.edges.length,4);
});
check('Malformed/empty recognition returns no invented text',()=>{
  assert.deepEqual(recognitionLines({blocks:null}),[]);
  assert.equal(page([]).blocks.length,0);
});
(async()=>{
  const p=page([line('NOTIFICATION',220,120,380),line('(b) Kept clause',100,200)]);
  p.ocrHeader=['Journal 8'];p.ocrFooter=['Print metadata'];
  p.blocks.unshift({kind:'image',x:0,right:100,y:0,bottom:50,data:new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64'))});
  const zip=unzipSync(await Packer.toBuffer(createWordDocument([p]))),xml=strFromU8(zip['word/document.xml']);
  assert.ok(xml.includes('<w:drawing>'));assert.ok(xml.includes('Kept clause'));
  assert.ok(!xml.includes('Journal 8'));assert.ok(Object.keys(zip).some(k=>k.startsWith('word/header')));
  checks++;console.log(`${checks} focused OCR regression checks passed.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
