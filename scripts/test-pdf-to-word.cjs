require('./pdf-word-loader.cjs');
const assert = require('node:assert/strict');
const {buildWordPage,clusterWordLines,lineText,markTableContinuations} = require('../lib/pdf/word-layout.ts');
const {partitionOcrLinesIntoBlocks} = require('../lib/pdf/table-detection.ts');
const {createWordDocument} = require('../lib/pdf/word-document.ts');
const {Packer} = require('docx');
const {unzipSync,strFromU8} = require('fflate');
const span=(text,x,y,width=100,extra={})=>({text,x,y,width,size:12,font:'Arial',bold:false,italic:false,...extra});
const page=(spans,rules=[])=>buildWordPage(spans,rules,600,800);
const tableCount=p=>p.blocks.filter(b=>b.kind==='table').length;
const cases=[];
function check(name,fn) {fn();cases.push(name);}
check('shuffled fragments and punctuation retain reading order',()=>{
  const lines=clusterWordLines([span('world',91,50,30),span('!',121,50,3),span('Hel',50,50,18),span('lo',68,50,12),span('Next',50,70)]);
  assert.deepEqual(lines.map(lineText),['Hello world!','Next']);
});
check('first-line indents separate narrative paragraphs',()=>{
  const p=page([span('First paragraph starts',100,60,400),span('and continues.',50,80,400),span('Another paragraph starts',100,100,400),span('and ends.',50,120,400)]);
  assert.equal(p.blocks.length,2);assert.equal(p.blocks[0].firstIndent,50);
});
check('prose, headings, parallel blocks, lists and signatures stay out of tables',()=>{
  const examples=[
    [span('Title',240,40,120,{bold:true}),span('A normal sentence across the page.',50,70,450),span('The next sentence is ordinary prose.',50,90,450)],
    [span('Left block',50,70),span('Right block',350,70),span('Left continuation',50,90),span('Right continuation',350,90)],
    [1,2,3,4].flatMap((n,i)=>[span(`${n}.`,50,60+i*20,10),span('Numbered list item',100,60+i*20,150)]),
    [span('Signature',400,650,130,{bold:true}),span('Designation',400,670,130),span('Office',400,690,130)],
  ];
  examples.forEach(s=>assert.equal(tableCount(page(s)),0));
});
check('regular borderless records with wrapped cells',()=>{
  const s=[1,2,3].flatMap((n,i)=>[span(String(n),40,80+i*40,8),span('Detail',120,80+i*40,40),span('Status',350,80+i*40,40),span('wrapped details',120,96+i*40,110)]);
  const t=page(s).blocks.find(b=>b.kind==='table');
  assert.equal(t.rows.length,3);assert.equal(t.edges.length-1,3);assert.equal(t.rows[1][1].length,2);
});
let gridPage;
check('ruled cells retain wrapped lines and post-table prose',()=>{
  const xs=[40,65,140,310,560],ys=[400,500,580];
  const rules=[...ys.map(y=>({x0:40,y0:y,x1:560,y1:y})),...xs.map(x=>({x0:x,y0:400,x1:x,y1:580}))];
  const s=[1,2].flatMap((n,r)=>[span(`${n}.`,44,420+r*100,12),span('123456',70,420+r*100,45),span('Details',145,420+r*100,100),span('Wrapped detail',145,437+r*100,120),span('Action',315,420+r*100,150)]);
  gridPage=page([...s,span('Post-table narrative.',50,630,450)],rules);
  const t=gridPage.blocks[0];assert.equal(t.kind,'table');assert.equal(t.rows.length,2);assert.equal(t.rows[0].length,4);
  assert.equal(t.rows[0][2].length,2);assert.equal(gridPage.blocks[1].kind,'paragraph');
});
check('continuation needs matching geometry, sequence and page edges',()=>{
  const first=structuredClone(gridPage),second=structuredClone(gridPage);
  first.blocks=first.blocks.slice(0,1);first.blocks[0].bottom=790;
  second.blocks[0].y=20;second.blocks[0].rows[0][0][0].spans[0].text='3.';
  markTableContinuations([first,second]);assert.equal(second.blocks[0].continuation,true);
  delete second.blocks[0].continuation;second.blocks[0].rows[0][0][0].spans[0].text='8.';
  markTableContinuations([first,second]);assert.equal(second.blocks[0].continuation,undefined);
});
check('OCR coordinates remain top-down',()=>{
  const lines=[{text:'Second',y0:60,y1:72,words:[{text:'Second',x0:50,x1:100,confidence:95}]},{text:'First',y0:20,y1:32,words:[{text:'First',x0:50,x1:90,confidence:95}]}];
  assert.deepEqual(partitionOcrLinesIntoBlocks(lines).flatMap(b=>b.kind==='prose'?b.lines.map(l=>l.text):[]),['First','Second']);
});
(async()=>{
  const bytes=await Packer.toBuffer(createWordDocument([gridPage]));
  const xml=strFromU8(unzipSync(bytes)['word/document.xml']);
  assert.equal((xml.match(/<w:tbl>/g)||[]).length,1);
  assert.equal((xml.match(/<w:tr>/g)||[]).length,2);
  assert.equal((xml.match(/<w:tc>/g)||[]).length,8);
  assert.ok(xml.indexOf('Post-table narrative.')>xml.indexOf('</w:tbl>'));
  cases.push('DOCX has real rows/cells and narrative outside the table');
  console.log(`${cases.length} PDF-to-Word regression checks passed.\n${cases.join('\n')}`);
})().catch(error=>{console.error(error);process.exitCode=1;});
