// Local, opt-in QA. Private inputs and OCR caches stay in ignored work/.
require('./pdf-word-loader.cjs');
const fs=require('node:fs');
const path=require('node:path');
const {createCanvas}=require('@napi-rs/canvas');
const {createWorker}=require('tesseract.js');
const {Packer}=require('docx');
const out=path.resolve('work/ocr-word-qa');
(async()=>{
  const input=process.argv[2];
  if(!input) throw Error('Usage: node scripts/qa-ocr-word.cjs <scanned.pdf> [--recognize]');
  fs.mkdirSync(out,{recursive:true});
  const stem=path.basename(input,'.pdf');
  const cache=path.join(out,stem+'-ocr.json');
  if(process.argv.includes('--recognize') || !fs.existsSync(cache)) {
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(input)),useSystemFonts:true}).promise;
    const worker=await createWorker('eng',1,{cachePath:out});
    const pages=[];
    try {
      for(let i=1;i<=pdf.numPages;i++) {
        const page=await pdf.getPage(i),base=page.getViewport({scale:1});
        const scale=Math.min(4.2,Math.max(2.8,3000/Math.max(base.width,base.height)));
        const viewport=page.getViewport({scale});
        const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
        await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'}).promise;
        const started=Date.now();
        const {data}=await worker.recognize(canvas.toBuffer('image/png'),{},{blocks:true});
        pages.push({width:base.width,height:base.height,pixelWidth:canvas.width,pixelHeight:canvas.height,data});
        console.log(JSON.stringify({page:i,confidence:data.confidence,ms:Date.now()-started,chars:data.text.length}));
        page.cleanup();
      }
      fs.writeFileSync(cache,JSON.stringify(pages));
    } finally {await worker.terminate();await pdf.destroy();}
  }
  const {recognitionLines,buildOcrWordPage,finalizeOcrPages,decorativeBand,fitOcrText}=require('../lib/pdf/ocr-word-layout.ts');
  const {createWordDocument}=require('../lib/pdf/word-document.ts');
  const cached=JSON.parse(fs.readFileSync(cache));
  const pages=[];
  for(let i=0;i<cached.length;i++) {
    const p=cached[i],lines=recognitionLines(p.data),band=decorativeBand(lines,p.pixelWidth,p.pixelHeight);
    const result=buildOcrWordPage(lines.filter(l=>!band||l.y0>band),p.pixelWidth,p.pixelHeight,p.width,p.height);
    if(band) {
      const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pdf=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(input))}).promise;
      try {
        const page=await pdf.getPage(i+1),canvas=createCanvas(p.pixelWidth,p.pixelHeight);
        await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport:page.getViewport({scale:p.pixelHeight/p.height})}).promise;
        const crop=createCanvas(p.pixelWidth,Math.ceil(band));crop.getContext('2d').drawImage(canvas,0,0);
        result.blocks.unshift({kind:'image',x:0,right:p.width,y:0,bottom:band/p.pixelHeight*p.height,data:new Uint8Array(crop.toBuffer('image/png'))});
        result.left=0;result.right=p.width;result.top=0;
      } finally {await pdf.destroy();}
    }
    const ctx=createCanvas(1,1).getContext('2d');
    fitOcrText(result,(text,size,bold)=>{ctx.font=`${bold?'bold ':''}${size}px Arial`;return ctx.measureText(text).width;});
    pages.push(result);
  }
  finalizeOcrPages(pages);
  const output=path.join(out,stem+'-improved.docx');
  fs.writeFileSync(output,await Packer.toBuffer(createWordDocument(pages)));
  fs.writeFileSync(path.join(out,stem+'-layout.json'),JSON.stringify(pages,null,2));
  console.log(JSON.stringify({output,pages:pages.length,blocks:pages.map(p=>p.blocks.length)}));
})().catch(e=>{console.error(e);process.exitCode=1;});
