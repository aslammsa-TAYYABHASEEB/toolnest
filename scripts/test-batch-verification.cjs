// Isolated public synthetic spike. No routes, OCR, uploads, fixture files or production hooks.
require('./pdf-word-loader.cjs');
const assert=require('node:assert/strict'),Module=require('node:module'),path=require('node:path'),fs=require('node:fs');
const canvas=require('@napi-rs/canvas'),{pathToFileURL}=require('node:url');
const {PDFDocument,StandardFonts,degrees,rgb,PDFName}=require('pdf-lib');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,ImageData:canvas.ImageData,Path2D:canvas.Path2D});
Promise.try??=(fn,...args)=>Promise.resolve().then(()=>fn(...args));
const {parseCsvSource}=require('../lib/batch-verification/csv-source.ts');
const {decimalValue,normalizeText}=require('../lib/batch-verification/normalization.ts');
const {extractBatchPdfEvidence}=require('../lib/batch-verification/pdf-evidence.ts');
const {verifyBatch}=require('../lib/batch-verification/verify.ts');
const enc=new TextEncoder(),source=text=>parseCsvSource(enc.encode(text),0);
const CSV='ID,Name,Salary\nABC-001,Ada,62500\nABC-002,Ben,200\nABC-003,Cara,300\n';
const config={keyAnchor:'ID:',fields:[{column:1,anchor:'Name:',mode:'exact'},{column:2,anchor:'Salary:',mode:'exact'}]};
const currency={...config,fields:[config.fields[0],{column:2,anchor:'Salary:',mode:'number',number:{decimal:'.',grouping:',',currency:'$',maxFractionDigits:2}}]};
let open,tests=0;
async function check(name,fn){await fn();tests++;console.log('PASS:',name)}
async function fixture(records){
  const pdf=await PDFDocument.create({updateMetadata:false}),font=await pdf.embedFont(StandardFonts.Helvetica),splitFont=await pdf.embedFont(StandardFonts.HelveticaBold);
  for(const record of records){
    const p=pdf.addPage([420,300]);if(record.rotate)p.setRotation(degrees(record.rotate));
    const draw=(text,x,y)=>p.drawText(text,{x,y,size:12,font});
    if(record.blank)continue;
    if(record.split){draw('ID: ABC-',30,250);p.drawText('001',{x:31+font.widthOfTextAtSize('ID: ABC-',12),y:250,size:12,font:splitFont})}
    else draw('ID: '+record.id,30,250);
    draw('Name: '+(record.name??'Ada'),30,210);draw('Salary: '+(record.salary??'62500'),30,170);
    if(record.extra)draw(record.extra,30,40);
    if(record.ambiguous)draw('Salary: 999',30,130);
    if(record.offpage)draw('OFFPAGE',-180,90);
    if(record.hidden){p.pushOperators(require('pdf-lib').setTextRenderingMode(3));draw('HIDDEN VALUE',30,90);p.pushOperators(require('pdf-lib').setTextRenderingMode(0));}
    if(record.covered)p.drawRectangle({x:25,y:165,width:250,height:20,color:rgb(0,0,0)});
  }
  return new File([await pdf.save({useObjectStreams:false})],'public-batch.pdf',{type:'application/pdf'});
}
const standard=[{id:'ABC-001',name:'Ada',salary:'62500'},{id:'ABC-002',name:'Ben',salary:'200'},{id:'ABC-003',name:'Cara',salary:'300'}];
async function run(records,src=source(CSV),cfg=config){
  const file=await fixture(records),before=new Uint8Array(await file.arrayBuffer());
  const pdf=await extractBatchPdfEvidence(file,open),result=verifyBatch(src,pdf,cfg);
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()),before);
  const s=result.summary;assert.equal(s.sourceRecordCount,s.passedSourceRecords+s.failedOrReviewSourceRecords+s.missingSourceRecords);
  assert.equal(s.outputPageCount,s.assignedOutputPages+s.unresolvedOutputPages+s.ambiguousPages);
  return {result,pdf,file};
}
(async()=>{
  const js=await import('pdfjs-dist/legacy/build/pdf.mjs');js.GlobalWorkerOptions.workerSrc=pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  open=async file=>js.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false,enableScripting:false}).promise;
  await check('CSV quoted comma, escaped quote, multiline and exact physical lines',()=>{
    const s=source('ID,Name\r\n0012,"Ada, ""A""\r\nPublic"\r\n0020,Ben\r\n');
    assert.equal(s.rows[0].key,'0012');assert.equal(s.rows[0].cells[1],'Ada, "A"\r\nPublic');assert.equal(s.rows[0].physicalRow,2);assert.equal(s.rows[1].physicalRow,4);assert.ok(Object.isFrozen(s.rows[0].cells));
  });
  await check('CSV malformed quoting, row width and invalid UTF-8 fail closed',()=>{
    for(const text of ['ID,N\nA,"bad','ID,N\nA,"x" junk','ID,N\nA,x,y','ID,N\nA,x"'])assert.throws(()=>source(text));
    assert.throws(()=>parseCsvSource(Uint8Array.of(255),0));
  });
  await check('blank/duplicate source keys and NFC/trim collisions rejected',()=>{
    for(const text of ['ID,N\n,x','ID,N\nA,x\nA,y','ID,N\nA,x\n A ,y','ID,N\né,x\ne\u0301,y'])assert.throws(()=>source(text));
  });
  await check('bounded CSV input/cell/record limits',()=>{
    assert.throws(()=>source('ID,N\nA,'+'x'.repeat(4097)));assert.throws(()=>parseCsvSource(new Uint8Array(1048577),0));
    assert.throws(()=>source('ID,N\n'+Array.from({length:201},(_,i)=>i+',x').join('\n')));
  });
  await check('conservative key normalization',()=>{assert.notEqual(normalizeText('0012'),normalizeText('12'));assert.notEqual(normalizeText('ABC-001'),normalizeText('ABC001'));assert.notEqual(normalizeText('A B'),normalizeText('A  B'))});
  await check('decimal-safe explicit rules and malformed/identifier numeric rejection',()=>{
    const r=currency.fields[1].number;assert.equal(decimalValue('$62,500.00',r),6250000n);
    assert.equal(decimalValue('0.10',r)+decimalValue('0.20',r),decimalValue('0.30',r));
    for(const text of ['0012','18/81','245-9','BS-03','12,00,001','1.234','€20','NaN'])assert.equal(decimalValue(text,r),null);
  });
  await check('perfect three-record batch, exact source/page accounting',async()=>{const {result}=await run(standard);assert.equal(result.summary.passedSourceRecords,3);assert.equal(result.summary.outputPageCount,3)});
  await check('missing output record',async()=>{const {result}=await run(standard.slice(0,2));assert.equal(result.rows[2].status,'MISSING OUTPUT RECORD')});
  await check('duplicate output instance blocks source PASS',async()=>{const {result}=await run([...standard,standard[0]]);assert.equal(result.rows[0].status,'DUPLICATE OUTPUT RECORD');assert.equal(result.summary.duplicateOutputInstances,1)});
  await check('key 12 cannot match 312',async()=>{const {result}=await run([{id:'312'}],source('ID,Name,Salary\n12,Ada,62500'));assert.equal(result.summary.unresolvedOutputPages,1);assert.equal(result.summary.passedSourceRecords,0)});
  await check('leading-zero key 0012 cannot match 12',async()=>{const {result}=await run([{id:'12'}],source('ID,Name,Salary\n0012,Ada,62500'));assert.equal(result.summary.unresolvedOutputPages,1)});
  await check('two valid source keys on one page require review',async()=>{const {result}=await run([{...standard[0],extra:'ABC-002'}]);assert.equal(result.summary.ambiguousPages,1);assert.equal(result.rows[0].status,'REVIEW');assert.equal(result.rows[1].status,'REVIEW')});
  await check('split key reconstructed with raw item and multi-box evidence',async()=>{
    const {result,pdf}=await run([{...standard[0],split:true}]);assert.equal(result.rows[0].status,'PASS',JSON.stringify(pdf.pages[0]));
    const key=pdf.pages[0].spans.find(s=>s.text==='ID: ABC-001');assert.ok(key);assert.ok(key.itemIndices.length>=2);assert.equal(key.boxes.length,key.itemIndices.length);
    for(const i of key.itemIndices)assert.equal(pdf.pages[0].items.find(item=>item.index===i).text,pdf.pages[0].rawItems[i].str);
  });
  await check('unrelated expected amount cannot override wrong anchored amount',async()=>{const {result}=await run([{...standard[0],salary:'6250',extra:'Public example 62500'}]);assert.equal(result.pages[0].fields[1].status,'FIELD MISMATCH')});
  await check('wrong numeric amount fails configured currency rule',async()=>{const {result}=await run([{...standard[0],salary:'$6,250.00'}],source(CSV),currency);assert.equal(result.pages[0].fields[1].status,'FIELD MISMATCH')});
  await check('formatted amount passes only explicitly configured rule',async()=>{const {result}=await run([{...standard[0],salary:'$62,500.00'}],source(CSV),currency);assert.equal(result.rows[0].status,'PASS')});
  await check('formatted amount fails exact-text comparison',async()=>{const {result}=await run([{...standard[0],salary:'$62,500.00'}]);assert.equal(result.pages[0].fields[1].status,'FIELD MISMATCH')});
  await check('another record value in selected field context never passes',async()=>{const {result}=await run([{...standard[0],name:'Ben'}]);assert.equal(result.pages[0].fields[0].status,'FIELD MISMATCH')});
  await check('blank page separately counted and unresolved',async()=>{const {result}=await run([...standard,{blank:true}]);assert.equal(result.summary.blankPages,1);assert.equal(result.summary.unresolvedOutputPages,1)});
  await check('repeated key without authoritative anchor requires review',async()=>{const {result}=await run([{...standard[0],extra:'Footer ABC-001'}],source(CSV),{fields:config.fields});assert.equal(result.pages[0].status,'AMBIGUOUS KEY')});
  await check('explicit key anchor disambiguates repeated same-key footer',async()=>{const {result}=await run([{...standard[0],extra:'Footer ABC-001'}]);assert.equal(result.rows[0].status,'PASS')});
  await check('duplicate field anchors are ambiguous, not best-match selected',async()=>{const {result}=await run([{...standard[0],ambiguous:true}]);assert.equal(result.pages[0].fields[1].status,'AMBIGUOUS FIELD')});
  await check('missing anchored field never rescued by boilerplate',async()=>{const {pdf}=await run([standard[0]]);const cfg={fields:[{column:1,anchor:'Recipient:',mode:'exact'}],keyAnchor:'ID:'};assert.equal(verifyBatch(source(CSV),pdf,cfg).pages[0].fields[0].status,'FIELD MISSING')});
  await check('intrinsic rotations preserve assignment and displayed evidence geometry',async()=>{
    for(const rotate of [0,90,180,270]){const {result,pdf,file}=await run([{...standard[0],rotate}]);assert.equal(result.rows[0].status,'PASS');assert.equal(pdf.pages[0].rotation,rotate);
      assert.equal(pdf.pages[0].width,rotate%180?300:420);
      const doc=await open(file),page=await doc.getPage(1),viewport=page.getViewport({scale:2});
      const surface=canvas.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),ctx=surface.getContext('2d');
      try{await page.render({canvas:surface,canvasContext:ctx,viewport,background:'rgb(255,255,255)'}).promise;
        for(const box of pdf.pages[0].items.filter(i=>i.text.trim()).map(i=>i.box)){
          assert.ok(box.left>=0&&box.top>=0&&box.left+box.width<=1&&box.top+box.height<=1);
          const region=ctx.getImageData(Math.floor(box.left*surface.width),Math.floor(box.top*surface.height),Math.max(1,Math.ceil(box.width*surface.width)),Math.max(1,Math.ceil(box.height*surface.height))).data;
          assert.ok(Array.from(region).some((channel,i)=>i%4!==3&&channel<200),'evidence box must intersect actual rendered text ink');
          ctx.strokeStyle='#e14956';ctx.strokeRect(box.left*surface.width,box.top*surface.height,box.width*surface.width,box.height*surface.height);
        }
        const out=path.resolve('outputs/qa/batch-verification');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'evidence-'+rotate+'.png'),surface.toBuffer('image/png'));
      }finally{surface.width=0;surface.height=0;page.cleanup();await doc.loadingTask.destroy();}
    }
  });
  await check('hidden text causes unsupported visibility review',async()=>{const {result}=await run([{...standard[0],hidden:true}]);assert.equal(result.pages[0].status,'UNSUPPORTED VISIBILITY / REVIEW');assert.equal(result.summary.passedSourceRecords,0)});
  await check('off-page text causes unsupported visibility review',async()=>{const {result}=await run([{...standard[0],offpage:true}]);assert.equal(result.pages[0].status,'UNSUPPORTED VISIBILITY / REVIEW')});
  await check('covered field causes unsupported visibility review',async()=>{const {result}=await run([{...standard[0],covered:true}]);assert.equal(result.pages[0].status,'UNSUPPORTED VISIBILITY / REVIEW')});
  await check('unavailable privacy inspection blocks every source PASS',async()=>{const file=await fixture(standard);let calls=0;const pdf=await extractBatchPdfEvidence(file,async f=>{if(++calls===2)throw new Error('inspection unavailable');return open(f)});assert.equal(verifyBatch(source(CSV),pdf,config).summary.passedSourceRecords,0)});
  await check('unknown key is unresolved, not claimed unexpected record',async()=>{const {result}=await run([{id:'PUBLIC-UNKNOWN'}]);assert.equal(result.pages[0].status,'UNRESOLVED OUTPUT PAGE')});
  await check('numeric mode prohibited for selected identifier/key column',async()=>{const {pdf}=await run(standard);assert.throws(()=>verifyBatch(source(CSV),pdf,{fields:[{column:0,anchor:'ID:',mode:'number',number:currency.fields[1].number}]}))});
  await check('identifier headings and duplicate field configuration rejected',async()=>{
    const {pdf}=await run(standard);const s=source('ID,Account,Salary\nABC-001,0012,62500');
    assert.throws(()=>verifyBatch(s,pdf,{fields:[{column:1,anchor:'Account:',mode:'number',number:currency.fields[1].number}]}));
    assert.throws(()=>verifyBatch(source(CSV),pdf,{fields:[config.fields[0],config.fields[0]]}));
  });
  await check('keys never match decimal/code fragments or gain case/punctuation folding',async()=>{
    for(const id of ['12.5','X/12','aBC-001','ABC001']){
      const s=source(id.startsWith('12')||id.startsWith('X/')?'ID,Name,Salary\n12,Ada,62500':CSV);
      const {result}=await run([{id}],s);assert.equal(result.summary.passedSourceRecords,0);assert.equal(result.summary.unresolvedOutputPages,1);
    }
  });
  await check('scan-only page is unresolved, never claimed blank/native verified',async()=>{
    const pdf=await PDFDocument.create(),p=pdf.addPage([200,200]),image=await pdf.embedPng(canvas.createCanvas(10,10).toBuffer('image/png'));
    p.drawImage(image,{x:10,y:10,width:100,height:100});const file=new File([await pdf.save()],'synthetic-scan.pdf',{type:'application/pdf'});
    const result=verifyBatch(source(CSV),await extractBatchPdfEvidence(file,open),config);
    assert.equal(result.summary.passedSourceRecords,0);assert.equal(result.summary.blankPages,0);assert.equal(result.summary.unresolvedOutputPages,1);
  });
  console.log(`PASS: ${tests} synthetic batch checks; FAIL: 0. PASS scope is extracted native text, not a visibility certificate.`);
})().catch(error=>{console.error(error);process.exitCode=1});
