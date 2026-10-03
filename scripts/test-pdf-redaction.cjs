// Production redaction contract, deterministic synthetic documents only.
require('./pdf-word-loader.cjs');
const assert = require('node:assert/strict'), path = require('node:path'), Module = require('node:module');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const zlib = require('node:zlib');
const canvas = require('@napi-rs/canvas');
const { PDFDocument, PDFName, PDFString, PDFRawStream, StandardFonts, degrees } = require('pdf-lib');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, ...args) { return resolve.call(this, id.startsWith('@/') ? path.resolve(id.slice(2)) : id, ...args); };
globalThis.DOMMatrix = canvas.DOMMatrix; globalThis.ImageData = canvas.ImageData; globalThis.Path2D = canvas.Path2D;
Promise.try ??= (callback, ...args) => Promise.resolve().then(() => callback(...args));
globalThis.window = { innerWidth: 1440, requestAnimationFrame: callback => setTimeout(callback,0), cancelAnimationFrame: clearTimeout };
Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { userAgent: 'Chrome/154.0', platform: 'Win32', maxTouchPoints: 0 } });
globalThis.document = { createElement: name => { assert.equal(name, 'canvas'); return canvas.createCanvas(1, 1); } };
const loader = require('../lib/pdf/renderer.ts'), privacy = require('../lib/pdf/privacy-inspect.ts');
const { inspectRedactionPdf } = require('../lib/redaction/inspect.ts');
const { runPdfRedaction, redactionResultMatches } = require('../lib/redaction/run.ts');
const { verifyRedactedPdf } = require('../lib/redaction/verify.ts');
const { redactionPoint, outwardPixelRectangle, redactionPageGeometry, assertRedactionDocumentLimits } = require('../lib/redaction/geometry.ts');
const { REDACTION_LIMITS, redactionBrowserSupport } = require('../lib/redaction/types.ts');
const { renderRedactionPage } = require('../lib/redaction/raster.ts');
const { removeUnreachablePdfObjects } = require('../lib/pdf/privacy-objects.ts');
const N = PDFName.of, saveOptions = { useObjectStreams: false, updateFieldAppearances: false };
const file = bytes => new File([Uint8Array.from(bytes)], 'synthetic-redaction.pdf', { type: 'application/pdf' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let count = 0, rendererOptions = [];
function pass(name) { count++; console.log('PASS:', name); }

async function simple(edit, pages = 1, size = [300,240]) {
  const doc = await PDFDocument.create({ updateMetadata:false });
  for(let i=0;i<pages;i++)doc.addPage(size);
  if(edit)await edit(doc);
  return file(await doc.save(saveOptions));
}
async function mainFixture() {
  const doc = await PDFDocument.create({updateMetadata:false}), font = await doc.embedFont(StandardFonts.Helvetica);
  const surface = canvas.createCanvas(500,120), ctx = surface.getContext('2d');
  ctx.fillStyle='white';ctx.fillRect(0,0,500,120);ctx.fillStyle='black';ctx.font='22px Arial';ctx.fillText('PRIVATE SCAN 7391',20,35);ctx.fillText('PUBLIC SCAN REMAINS',20,95);
  const shared = await doc.embedPng(surface.toBuffer('image/png'));surface.width=0;surface.height=0;
  for(const [i,size] of [[300,240],[320.5,250.25],[280.5,230.25],[340,260]].entries()) {
    const p=doc.addPage(size);p.setRotation(degrees([0,90,180,270][i]));p.setCropBox(13.5,9.25,size[0]-20,size[1]-15);
    p.drawText('PRIVATE TEXT 7391',{x:35,y:size[1]-55,size:12,font});
    p.drawText('PUBLIC VISIBLE CONTENT',{x:35,y:size[1]-105,size:10,font});
    p.drawText('HIDDEN SECRET 7391',{x:35,y:110,size:9,font,opacity:0});
    p.drawImage(shared,{x:30,y:20,width:240,height:60});
  }
  doc.setAuthor('PRIVATE METADATA 7391');await doc.attach(Buffer.from('PRIVATE ATTACHMENT'),'synthetic.txt');
  doc.getPage(0).node.addAnnot(doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Text',Rect:[20,20,50,50],Contents:PDFString.of('PRIVATE COMMENT')})));
  return file(await doc.save(saveOptions));
}

// Public synthetic logo/soft-mask edge; reproduces the integral-raster fractional-point case.
async function fractionalLogoFixture() {
  const doc=await PDFDocument.create({updateMetadata:false}),font=await doc.embedFont(StandardFonts.Helvetica);
  const c=canvas.createCanvas(238,260),ctx=c.getContext('2d');
  ctx.strokeStyle='black';ctx.lineWidth=9;ctx.beginPath();ctx.arc(119,128,94,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#3056a8';ctx.beginPath();ctx.moveTo(119,3);ctx.lineTo(212,224);ctx.lineTo(26,224);ctx.closePath();ctx.fill();
  const logo=await doc.embedPng(c.toBuffer('image/png'));c.width=0;c.height=0;
  const p=doc.addPage([595.44,841.68]);p.drawImage(logo,{x:92.3,y:704.91,width:78,height:85.4});
  p.drawText('PUBLIC CONTENT AND LOGO REMAIN',{x:90,y:650,size:14,font});
  p.drawText('SYNTHETIC MARKED VALUE 7391',{x:100,y:528,size:14,font});
  p.drawText('PUBLIC CONTENT BELOW MASK',{x:90,y:470,size:14,font});
  const bytes=await doc.save(saveOptions);
  assert.ok(doc.context.lookup(logo.ref).dict.get(N('SMask')),'fixture must include real transparency');
  return file(bytes);
}

(async()=>{
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  globalThis.navigator={userAgent:'Chrome/154.0',platform:'Win32',maxTouchPoints:0};
  const open=async(f,options={})=>{
    rendererOptions.push(options);
    return pdfjs.getDocument({data:new Uint8Array(await f.arrayBuffer()),enableScripting:false,isEvalSupported:false,useWorkerFetch:false,stopAtErrors:options.stopAtErrors===true,
      standardFontDataUrl:path.join(path.dirname(require.resolve('pdfjs-dist/package.json')),'standard_fonts')+'/'}).promise;
  };
  loader.loadPdfRendererDocument=open;
  assert.deepEqual(REDACTION_LIMITS,{dpi:200,pages:10,pagePixels:4000000,totalPixels:40000000,inputBytes:20*1024*1024,outputBytes:20*1024*1024});pass('exact locked v1 limits');
  const source=await mainFixture(),original=Buffer.from(await source.arrayBuffer()),beforeHash=hash(original);
  const inspection=await inspectRedactionPdf(source),marks=[];
  const sourceDoc=await open(source,{stopAtErrors:true});
  try {for(let i=0;i<4;i++){
    const p=await sourceDoc.getPage(i+1),view=p.getViewport({scale:1}),height=p.view[3]+5.75;
    for(const [j,rect] of [[30,height-62,245,height-35],[30,51,270,81]].entries()){
      const points=[[rect[0],rect[1]],[rect[2],rect[3]]].map(([x,y])=>view.convertToViewportPoint(x,y));
      marks.push({id:`p${i}-${j}`,page:i+1,rect:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]});
    }p.cleanup();
  }}finally{await sourceDoc.loadingTask.destroy()}
  assert.deepEqual(inspection.pages.map(p=>p.rotation),[0,90,180,270]);
  assert.deepEqual(inspection.pages.map(p=>[p.width,p.height]),[[280,225],[235.25,300.5],[260.5,215.25],[245,320]]);
  const result=await runPdfRedaction(source,marks);
  assert.equal(result.verification.status,'passed');assert.equal(result.verification.pageCount,4);
  assert.ok(result.verification.maskedPixels>0&&result.verification.preservedPixels>0);
  assert.equal(hash(Buffer.from(await source.arrayBuffer())),beforeHash,'original changed');
  assert.ok(rendererOptions.every(options=>options.stopAtErrors===true),'strict loader bypassed');
  pass('all four rotations, nonzero crop origins, mixed/fractional geometry, native/scan/hidden source, exact masked and public pixels, source immutability');
  const fractionalSource=await fractionalLogoFixture(),fractionalMarks=[{id:'fractional',page:1,rect:[90,290,520,320]}];
  const fractionalResult=await runPdfRedaction(fractionalSource,fractionalMarks);
  assert.equal(fractionalResult.verification.status,'passed');
  const fractionalPdf=await PDFDocument.load(await fractionalResult.blob.arrayBuffer(),{updateMetadata:false});
  const fractionalContent=zlib.inflateSync(fractionalPdf.context.lookup(fractionalPdf.getPage(0).node.get(N('Contents'))).getContents()).toString();
  const operands=fractionalContent.split('\n')[1].split(' ').slice(0,6);
  assert.equal(operands.length,6);assert.ok(operands.every(n=>/^-?\d+(?:\.\d+)?$/.test(n)),'PDF matrix operands must never use exponent notation');
  assert.deepEqual(operands.map(Number),[1654/(200/72),0,0,2338/(200/72),0,841.68-2338/(200/72)]);
  pass('public soft-mask logo at integral 1654x2338 raster: decimal PDF operands, exact decoded mask/public pixels and exact saved rendering');
  for(const [name,matrix] of [['exponent-form matrix','595.44 0 0 841.6800000000001 0 -1.1368683772161603e-13'],['displaced matrix','595.44 0 0 841.6800000000001 0 -1'],['scaled matrix','594.44 0 0 841.6800000000001 0 0']]) {
    const changed=await PDFDocument.load(await fractionalResult.blob.arrayBuffer(),{updateMetadata:false}),ref=changed.getPage(0).node.get(N('Contents'));
    changed.context.assign(ref,changed.context.flateStream(`q\n${matrix} cm\n/PageImage Do\nQ\n`));
    const v=await verifyRedactedPdf(fractionalSource,new Blob([await changed.save(saveOptions)]),fractionalMarks);
    assert.equal(v.ok,false,name+' must be rejected even though stored image pixels are unchanged');pass(name+' rejected');
  }
  assert.equal(redactionResultMatches(result,source,marks),true);
  assert.equal(redactionResultMatches({...result,blob:new Blob([result.blob])},source,marks),false);
  assert.equal(redactionResultMatches(result,file(original),marks),false);
  assert.equal(redactionResultMatches(result,source,marks.map((m,i)=>i?m:{...m,rect:[m.rect[0]+1,...m.rect.slice(1)]})),false);
  pass('exact Blob receipt, source identity and stale-selection download gating');
  const rect=marks[0].rect,page=inspection.pages[0];
  for(const factor of [.5,1,1.5,2]){
    const box={left:17,top:29,width:page.width*factor,height:page.height*factor};
    const mapped=redactionPoint(17+rect[0]*factor,29+rect[1]*factor,box,page);
    assert.ok(Math.abs(mapped[0]-rect[0])<1e-9&&Math.abs(mapped[1]-rect[1])<1e-9);
  }
  assert.deepEqual(outwardPixelRectangle([1.01,2.01,3.01,4.01]),[2,5,9,12]);pass('CSS zoom/DPR-independent mapping and outward mask rounding');
  const goodBytes=new Uint8Array(await result.blob.arrayBuffer());
  async function rejectMutation(name,edit){
    const doc=await PDFDocument.load(goodBytes,{updateMetadata:false});await edit(doc);
    const output=new Blob([await doc.save(saveOptions)]),verification=await verifyRedactedPdf(source,output,marks);
    assert.equal(verification.ok,false,`${name} contamination accepted`);pass(name+' rejected: '+verification.reason);
  }
  await rejectMutation('hidden text',async d=>{const f=await d.embedFont(StandardFonts.Helvetica);d.getPage(0).drawText('SECRET',{x:30,y:40,font:f,opacity:0})});
  await rejectMutation('hidden operators without resource changes',d=>{const ref=d.getPage(0).node.get(N('Contents')),old=zlib.inflateSync(d.context.lookup(ref).getContents());d.context.assign(ref,d.context.flateStream(Buffer.concat([old,Buffer.from('BT 3 Tr (SECRET) Tj ET\n')])))});
  await rejectMutation('unreachable extra object',d=>d.context.register(PDFString.of('SECRET')));
  await rejectMutation('reachable extra image',d=>{const resources=d.getPage(0).node.Resources().lookup(N('XObject'));resources.set(N('SourceImage'),d.context.register(d.context.flateStream(new Uint8Array([1,2,3]),{Type:'XObject',Subtype:'Image',Width:1,Height:1,ColorSpace:'DeviceRGB',BitsPerComponent:8})))});
  await rejectMutation('unreachable extra image',d=>d.context.register(d.context.flateStream(new Uint8Array([1,2,3]),{Type:'XObject',Subtype:'Image',Width:1,Height:1,ColorSpace:'DeviceRGB',BitsPerComponent:8})));
  await rejectMutation('document metadata',d=>d.setAuthor('SECRET'));
  await rejectMutation('annotation',d=>d.getPage(0).node.addAnnot(d.context.register(d.context.obj({Type:'Annot',Subtype:'Text',Rect:[0,0,20,20],Contents:PDFString.of('SECRET')}))));
  await rejectMutation('image metadata',d=>{const ref=d.getPage(0).node.Resources().lookup(N('XObject')).get(N('PageImage'));d.context.lookup(ref).dict.set(N('Metadata'),d.context.register(d.context.stream('SECRET',{Type:'Metadata',Subtype:'XML'})))});
  await rejectMutation('compressed stream trailing secret',d=>{const ref=d.getPage(0).node.Resources().lookup(N('XObject')).get(N('PageImage')),img=d.context.lookup(ref);d.context.assign(ref,PDFRawStream.of(img.dict.clone(),Buffer.concat([img.getContents(),Buffer.from('SECRET')])))});
  await rejectMutation('concatenated compressed secret member',d=>{const ref=d.getPage(0).node.Resources().lookup(N('XObject')).get(N('PageImage')),img=d.context.lookup(ref);d.context.assign(ref,PDFRawStream.of(img.dict.clone(),Buffer.concat([img.getContents(),zlib.deflateSync(Buffer.from('SECRET'))])))});
  await rejectMutation('altered unmarked public pixel',d=>{const ref=d.getPage(0).node.Resources().lookup(N('XObject')).get(N('PageImage')),img=d.context.lookup(ref),rgb=zlib.inflateSync(img.getContents());rgb[0]^=255;const dict={Type:'XObject',Subtype:'Image',Width:img.dict.get(N('Width')),Height:img.dict.get(N('Height')),ColorSpace:'DeviceRGB',BitsPerComponent:8};d.context.assign(ref,d.context.flateStream(rgb,dict))});
  await rejectMutation('additional decoded image samples',d=>{const ref=d.getPage(0).node.Resources().lookup(N('XObject')).get(N('PageImage')),img=d.context.lookup(ref),rgb=zlib.inflateSync(img.getContents());const dict={Type:'XObject',Subtype:'Image',Width:img.dict.get(N('Width')),Height:img.dict.get(N('Height')),ColorSpace:'DeviceRGB',BitsPerComponent:8};d.context.assign(ref,d.context.flateStream(Buffer.concat([rgb,Buffer.from('SECRET')]),dict))});
  await rejectMutation('wrong geometry',d=>d.getPage(0).setSize(281,225));
  await rejectMutation('wrong page count',d=>{d.removePage(3);removeUnreachablePdfObjects(d)});
  const otherSource=await simple(),otherMarks=[{id:'other',page:1,rect:[10,10,20,20]}],otherResult=await runPdfRedaction(otherSource,otherMarks);
  const wrongCount=await verifyRedactedPdf(source,otherResult.blob,marks);assert.equal(wrongCount.ok,false);assert.match(wrongCount.reason,/page count/);pass('canonical fresh output with wrong page count rejected');
  for(const [name,output] of [['serialized trailing secret',new Blob([result.blob,'SECRET'])],['incremental history',new Blob([result.blob,'\n1 0 obj\n(SECRET)\nendobj\nstartxref\n0\n%%EOF'])]]){
    assert.equal((await verifyRedactedPdf(source,output,marks)).ok,false,name+' accepted');pass(name+' rejected');
  }
  const smaller=marks.map((mark,i)=>i?mark:{...mark,rect:[...mark.rect.slice(0,2),mark.rect[0]+1,mark.rect[3]]});
  const incomplete=await runPdfRedaction(source,smaller);
  assert.equal((await verifyRedactedPdf(source,incomplete.blob,marks)).ok,false);pass('incomplete mask independently rejected');
  const refusals=[
    ['signature',d=>d.catalog.set(N('SignatureFixture'),d.context.register(d.context.obj({Type:'Sig',ByteRange:[0,1,2,3]})))],
    ['AcroForm',d=>d.getForm().createTextField('SyntheticField').setText('EXACT')],
    ['XFA',d=>d.catalog.set(N('AcroForm'),d.context.obj({XFA:PDFString.of('fixture')}))],
    ['orphaned widget',d=>d.context.register(d.context.obj({Type:'Annot',Subtype:'Widget',Rect:[0,0,10,10]}))],
    ['layers',d=>d.catalog.set(N('OCProperties'),d.context.obj({OCGs:[]}))],
    ['encryption',d=>{d.context.trailerInfo.Encrypt=d.context.register(d.context.obj({Filter:'Standard',V:1,R:2,O:PDFString.of('fixture'),U:PDFString.of('fixture'),P:-4}))}],
  ];
  for(const [name,edit] of refusals){await assert.rejects(()=>inspectRedactionPdfFromFixture(edit));pass(name+' refused')}
  async function inspectRedactionPdfFromFixture(edit){return inspectRedactionPdf(await simple(edit))}
  const oldInspect=privacy.inspectPdfPrivacy;
  for(const status of [null,undefined]){
    privacy.inspectPdfPrivacy=async()=>({signed:status,findings:[]});await assert.rejects(()=>inspectRedactionPdf(source),/safety could not be checked/);
  }
  privacy.inspectPdfPrivacy=async()=>{throw new Error('inspection unavailable')};await assert.rejects(()=>inspectRedactionPdf(source),/safety could not be checked/);privacy.inspectPdfPrivacy=oldInspect;pass('unknown and failed safety inspection refused');
  await assert.rejects(()=>inspectRedactionPdf(new File([new Uint8Array(REDACTION_LIMITS.inputBytes+1)],'oversize.pdf')),/20 MiB/);
  await assert.rejects(async()=>inspectRedactionPdf(await simple(undefined,11)),/10 pages/);
  assert.throws(()=>redactionPageGeometry(1,800,800,0),/4 megapixel/);
  assert.throws(()=>assertRedactionDocumentLimits(Array.from({length:10},(_,i)=>({page:i+1,pixelWidth:2001,pixelHeight:2000}))),/40 megapixel/);
  pass('input, page, per-page pixel and total pixel limits');
  await assert.rejects(()=>renderRedactionPage({pageNumber:1,rotate:0,getViewport:({scale})=>({width:300*scale,height:240*scale}),render:()=>({promise:Promise.reject(new Error('synthetic render failure')),cancel(){}})}),/synthetic render failure/);pass('failed page rendering rejects rather than producing an output');
  await assert.rejects(()=>runPdfRedaction(source,[]),/at least one area/);
  await assert.rejects(()=>runPdfRedaction(source,[{id:'bad',page:1,rect:[-1,0,20,20]}]),/invalid/);pass('empty and invalid selections refused');
  for(const phase of ['inspect','render','verify']){
    const abort=new AbortController();await assert.rejects(()=>runPdfRedaction(source,marks,{signal:abort.signal,onProgress:p=>{if(p.phase===phase)abort.abort()}}),/cancelled/);pass('cancellation during '+phase+' blocks result');
  }
  let current=true;await assert.rejects(()=>runPdfRedaction(source,marks,{isCurrent:()=>current,onProgress:p=>{if(p.phase==='verify')current=false}}),/changed/);pass('stale completion blocked');
  const mutable=marks.map(m=>({...m,rect:[...m.rect]}));await assert.rejects(()=>runPdfRedaction(source,mutable,{onProgress:p=>{if(p.phase==='render')mutable[0].rect[0]+=1}}),/changed/);pass('in-flight mark mutation blocked');
  const big=await PDFDocument.create({updateMetadata:false}),rgb=new Uint8Array(1700*2200*3);let seed=1;
  for(let i=0;i<rgb.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;rgb[i]=seed>>>24}
  const image=big.context.register(big.context.flateStream(rgb,{Type:'XObject',Subtype:'Image',Width:1700,Height:2200,ColorSpace:'DeviceRGB',BitsPerComponent:8}));
  for(let i=0;i<3;i++){const p=big.addPage([612,792]);p.node.set(N('Resources'),big.context.obj({XObject:{Noise:image}}));p.node.set(N('Contents'),big.context.register(big.context.flateStream('q\n612 0 0 792 0 0 cm\n/Noise Do\nQ\n')))}
  const largeOutputSource=file(await big.save(saveOptions));assert.ok(largeOutputSource.size<REDACTION_LIMITS.inputBytes);
  await assert.rejects(()=>runPdfRedaction(largeOutputSource,[{id:'one',page:1,rect:[0,0,1,1]}]),/20 MiB output/);pass('real noisy output exceeding 20 MiB refused before download');
  navigator.userAgent='Mozilla/5.0 Android Chrome/154.0 Mobile';assert.equal(redactionBrowserSupport(),false);await assert.rejects(()=>runPdfRedaction(source,marks),/Desktop Chrome or Edge/);navigator.userAgent='Chrome/154.0';
  window.innerWidth=390;assert.equal(redactionBrowserSupport(),false);window.innerWidth=1440;pass('mobile and narrow viewport processing blocked');
  console.log(`PASS: ${count} production redaction checks; original immutable; no private fixtures or disk round-trip`);
})().catch(error=>{console.error(error);process.exitCode=1});
