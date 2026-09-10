// Opt-in local integration check of the production conversion entry point.
// Node adapters replace DOM canvas/PDF loading and worker URLs only; OCR,
// orientation selection, layout, headers, images and DOCX packing are real.
require('./pdf-word-loader.cjs');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const canvas=require('@napi-rs/canvas');
const tesseract=require('tesseract.js');
Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,ImageData:canvas.ImageData,Path2D:canvas.Path2D});
globalThis.document={createElement(name){
  if(name!=='canvas') throw Error(`Unexpected DOM dependency: ${name}`);
  const c=canvas.createCanvas(1,1);
  c.toBlob=callback=>callback(new Blob([c.toBuffer('image/png')],{type:'image/png'}));
  return c;
}};
const originalResolve=Module._resolveFilename,originalLoad=Module._load;
Module._resolveFilename=function(id,...args){return originalResolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args);};
Module._load=function(id,...args){
  if(id==='@/lib/pdf/renderer') return {async loadPdfRendererDocument(file){
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
    return pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true}).promise;
  }};
  if(id==='tesseract.js') return {async createWorker(lang,oem,options){
    const worker=await tesseract.createWorker(lang,oem,{logger:options.logger,legacyCore:options.legacyCore,cachePath:path.resolve('work/ocr-word-qa')});
    return {recognize:(image,...args)=>worker.recognize(image.toBuffer('image/png'),...args),detect:image=>worker.detect(image.toBuffer('image/png')),terminate:()=>worker.terminate()};
  }};
  return originalLoad.call(this,id,...args);
};
(async()=>{
  const input=process.argv[2];if(!input) throw Error('Usage: node scripts/qa-ocr-runtime.cjs <scanned.pdf>');
  const {convertPdfToWord}=require('../lib/pdf/to-word.ts');
  const started=Date.now();let stage='';
  const result=await convertPdfToWord(new File([fs.readFileSync(input)],path.basename(input),{type:'application/pdf'}),(current,total,phase)=>{
    const next=`${current}/${total} ${phase}`;if(next!==stage){console.log(next);stage=next;}
  });
  const output=path.resolve('work/ocr-word-qa',path.basename(input,'.pdf')+'-runtime.docx');
  fs.writeFileSync(output,new Uint8Array(await result.blob.arrayBuffer()));
  console.log(JSON.stringify({output,sourcePages:result.pageCount,bytes:result.blob.size,ms:Date.now()-started}));
})().catch(e=>{console.error(e);process.exitCode=1;});
