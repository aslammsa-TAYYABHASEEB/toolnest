require('./pdf-word-loader.cjs');
const assert=require('node:assert/strict');
const Module=require('node:module'),path=require('node:path'),canvas=require('@napi-rs/canvas');
const {PDFDocument,PDFName,PDFString,StandardFonts,rgb}=require('pdf-lib');
const {pathToFileURL}=require('node:url');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
globalThis.DOMMatrix=canvas.DOMMatrix;globalThis.ImageData=canvas.ImageData;globalThis.Path2D=canvas.Path2D;
Promise.try??=(callback,...args)=>Promise.resolve().then(()=>callback(...args));
const {inspectPdfPrivacy}=require('../lib/pdf/privacy-inspect.ts');
const {PRIVACY_LIMITS,inspectPdfObjects}=require('../lib/pdf/privacy-objects.ts');

const N=key=>PDFName.of(key);
async function fresh(){const pdf=await PDFDocument.create({updateMetadata:false});pdf.addPage([400,250]);return pdf;}
const page=pdf=>pdf.getPage(0);
const stream=(pdf,bytes,dict)=>pdf.context.register(pdf.context.stream(bytes,dict));
function annotation(pdf,subtype,extra={}){const value=pdf.context.obj({Type:'Annot',Subtype:subtype,Rect:[20,20,130,55],...extra});const ref=pdf.context.register(value);page(pdf).node.addAnnot(ref);return value;}
function image(){const surface=canvas.createCanvas(400,250),ctx=surface.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,400,250);ctx.fillStyle='black';ctx.font='20px Arial';ctx.fillText('SCAN CONTROL',20,40);return surface.toBuffer('image/png');}
async function withImage(pdf){const png=await pdf.embedPng(image());page(pdf).drawImage(png,{x:0,y:0,width:400,height:250});return png;}
const fixtures=[
  ['standard metadata','metadata',async p=>{p.setTitle('Confidential draft');p.setAuthor('Case Worker');p.setCreationDate(new Date('2024-01-01T00:00:00Z'));}],
  ['custom Info metadata','metadata',async p=>{const info=p.context.obj({PrivateCase:PDFString.of('Internal-41')});p.context.trailerInfo.Info=p.context.register(info);}],
  ['XMP','xmp',async p=>{p.catalog.set(N('Metadata'),stream(p,'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF/></x:xmpmeta>',{Type:'Metadata',Subtype:'XML'}));}],
  ['embedded file','attachment',async p=>{await p.attach(new Uint8Array([1,2,3]),'memo.txt',{mimeType:'text/plain'});}],
  ['associated file','attachment',async p=>{const data=stream(p,'related',{Type:'EmbeddedFile'}),spec=p.context.register(p.context.obj({Type:'Filespec',F:PDFString.of('related.txt'),EF:{F:data}}));p.catalog.set(N('AF'),p.context.obj([spec]));}],
  ['file attachment annotation','attachment',async p=>{const data=stream(p,'memo',{Type:'EmbeddedFile',Subtype:'text#2Fplain'});const ef=p.context.obj({F:data});const spec=p.context.register(p.context.obj({Type:'Filespec',F:PDFString.of('note.txt'),EF:ef}));annotation(p,'FileAttachment',{FS:spec});}],
  ['document JavaScript','active-content',async p=>{p.addJavaScript('example','app.alert("fixture")');}],
  ['OpenAction','active-content',async p=>{p.catalog.set(N('OpenAction'),p.context.register(p.context.obj({S:'JavaScript',JS:PDFString.of('noop()')})));}],
  ['Launch action','active-content',async p=>{p.catalog.set(N('OpenAction'),p.context.obj({S:'Launch',F:PDFString.of('external.exe')}));}],
  ['page additional action','active-content',async p=>{page(p).node.set(N('AA'),p.context.obj({O:p.context.obj({S:'JavaScript',JS:PDFString.of('noop()')})}));}],
  ['URI link','external-link',async p=>{annotation(p,'Link',{A:p.context.obj({S:'URI',URI:PDFString.of('https://example.test/private')})});}],
  ['sticky comment','annotation',async p=>{annotation(p,'Text',{Contents:PDFString.of('Review this')});}],
  ['markup','annotation',async p=>{annotation(p,'Highlight',{Contents:PDFString.of('Marked')});}],
  ['filled form','form',async p=>{p.getForm().createTextField('Employee').setText('Private Name');}],
  ['default hidden form value','form',async p=>{const widget=annotation(p,'Widget',{F:2});const field=p.context.register(p.context.obj({FT:'Tx',T:PDFString.of('Secret'),DV:PDFString.of('Default value'),Ff:1,Kids:[widget]}));p.catalog.set(N('AcroForm'),p.context.obj({Fields:[field]}));}],
  ['legitimate OCR text','hidden-text',async p=>{await withImage(p);const f=await p.embedFont(StandardFonts.Helvetica);for(let i=0;i<15;i++)page(p).drawText(`word${i}`,{x:20+(i%5)*70,y:190-Math.floor(i/5)*30,font:f,size:10,opacity:.0001});}],
  ['suspicious invisible text','hidden-text',async p=>{const f=await p.embedFont(StandardFonts.Helvetica);page(p).drawText('private hidden note',{x:40,y:90,font:f,size:12,opacity:.0001});}],
  ['off-page text','hidden-text',async p=>{const f=await p.embedFont(StandardFonts.Helvetica);page(p).drawText('off page',{x:550,y:100,font:f,size:12});}],
  ['visual cover over live text','redaction-risk',async p=>{const f=await p.embedFont(StandardFonts.Helvetica);page(p).drawText('Private ID 1234',{x:40,y:100,font:f,size:16});page(p).drawRectangle({x:38,y:97,width:145,height:24,color:rgb(0,0,0)});}],
  ['optional layer','optional-content',async p=>{const group=p.context.register(p.context.obj({Type:'OCG',Name:PDFString.of('Hidden draft')}));p.catalog.set(N('OCProperties'),p.context.obj({OCGs:[group],D:{OFF:[group]}}));}],
  ['page thumbnail','thumbnail',async p=>{const png=await p.embedPng(image());page(p).node.set(N('Thumb'),png.ref);}],
  ['ordinary clean control',null,async p=>{const f=await p.embedFont(StandardFonts.Helvetica);page(p).drawText('Ordinary public page',{x:40,y:100,font:f,size:16});}],
  ['scanned control','image-metadata',async p=>{await withImage(p);}],
  ['embedded image profile metadata','image-metadata',async p=>{const png=await withImage(p);await p.flush();const data=p.context.lookup(png.ref);data.dict.set(N('Metadata'),stream(p,'<image-profile/>',{Type:'Metadata',Subtype:'XML'}));}],
  ['ToolNest searchable OCR','hidden-text',async p=>{await withImage(p);const f=await p.embedFont(StandardFonts.Helvetica);for(let i=0;i<15;i++)page(p).drawText(`search${i}`,{x:20+(i%5)*70,y:190-Math.floor(i/5)*30,font:f,size:10,opacity:.0001});}],
  ['combined risk','attachment',async p=>{p.setAuthor('Analyst');await p.attach(new Uint8Array([1]),'secret.txt');annotation(p,'Text',{Contents:PDFString.of('Comment')});p.catalog.set(N('OpenAction'),p.context.obj({S:'JavaScript',JS:PDFString.of('noop()')}));}],
];

(async()=>{const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  const open=async file=>pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false}).promise;
  for(const [name,expected,edit] of fixtures){const pdf=await fresh();await edit(pdf);const bytes=await pdf.save({useObjectStreams:false});const source=new File([bytes],`${name}.pdf`,{type:'application/pdf'});
    const before=Buffer.from(await source.arrayBuffer()),result=await inspectPdfPrivacy(source,open),after=Buffer.from(await source.arrayBuffer());
    assert.deepEqual(after,before,`${name}: input changed`);assert.equal(result.pageCount,1);assert.equal(result.coverage.length,12);
    if(expected)assert.ok(result.findings.some(f=>f.category===expected),`${name}: missing ${expected}; found ${result.findings.map(f=>f.category)}`);
    if(name==='ordinary clean control')assert.equal(result.findings.filter(f=>f.concern==='high'||f.concern==='review').length,0,'clean false-positive');
    if(name==='legitimate OCR text'||name==='ToolNest searchable OCR')assert.ok(result.findings.some(f=>f.evidence?.classification==='legitimate OCR/search layer'),'legitimate OCR misclassified');
    if(name==='scanned control')assert.ok(!result.findings.some(f=>f.category==='hidden-text'),'scan falsely flagged as hidden text');
    if(name==='default hidden form value')assert.ok(result.findings.some(f=>f.category==='annotation'&&f.evidence?.hidden===true),'hidden widget flag missed');
    if(name==='embedded image profile metadata')assert.ok(result.findings.some(f=>f.category==='image-metadata'&&f.evidence?.imageStreamsWithMetadataReferences>0),'image metadata reference missed');
    if(name==='visual cover over live text')assert.ok(result.findings.some(f=>f.category==='redaction-risk'&&f.evidence?.overlappedTextItems>0),'cover lacks live text evidence');
    if(name==='legitimate OCR text'||name==='ToolNest searchable OCR')assert.ok(!result.findings.some(f=>f.category==='hidden-text'&&f.concern==='high'),'OCR falsely high-risk');
    if(name==='URI link')assert.ok(!result.findings.some(f=>f.category==='annotation'&&f.title.includes('comment')),'link mislabeled as comment');
    if(name==='URI link')assert.ok(result.findings.some(f=>f.category==='external-link'&&f.page===1),'link page location missed');
    if(name==='combined risk')for(const category of ['metadata','attachment','annotation','active-content'])assert.ok(result.findings.some(f=>f.category===category),`combined missing ${category}`);
    console.log(`PASS: ${name} -> ${result.findings.length} finding(s)`);
  }
  const large=new File([new Uint8Array(PRIVACY_LIMITS.fileBytes+1)],'large.pdf',{type:'application/pdf'});
  await assert.rejects(()=>inspectPdfPrivacy(large,open),/25 MB/);
  const cyclic=await fresh(),loop=cyclic.context.obj({Type:'Example'});loop.set(N('Self'),loop);cyclic.catalog.set(N('Cycle'),loop);
  assert.ok(inspectPdfObjects(cyclic,()=>{})>0,'cycle traversal failed');
  const excessive=await fresh();for(let i=0;i<PRIVACY_LIMITS.objects;i++)excessive.context.register(excessive.context.obj({Index:i}));
  assert.throws(()=>inspectPdfObjects(excessive,()=>{}),/too many objects/i);
  console.log(`PASS: ${fixtures.length} deterministic fixtures, negative controls, input immutability, size/object/cycle limits`);
})().catch(error=>{console.error(error);process.exitCode=1});
