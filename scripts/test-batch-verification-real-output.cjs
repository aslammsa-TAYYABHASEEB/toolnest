// Acceptance of externally generated public PDFs; this script never generates PDFs.
require('./pdf-word-loader.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module');
const canvas=require('@napi-rs/canvas'),{pathToFileURL}=require('node:url');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,ImageData:canvas.ImageData,Path2D:canvas.Path2D});
Promise.try??=(fn,...args)=>Promise.resolve().then(()=>fn(...args));
const {parseCsvSource}=require('../lib/batch-verification/csv-source.ts');
const {extractBatchPdfEvidence}=require('../lib/batch-verification/pdf-evidence.ts');
const {verifyBatch}=require('../lib/batch-verification/verify.ts');
const root=path.resolve(process.argv[2]||'outputs/qa/batch-verification-real');
const config={keyAnchor:'Employee ID:',fields:[{column:1,anchor:'Name:',mode:'exact'},
  {column:2,anchor:'Salary:',mode:'number',number:{decimal:'.',grouping:',',currency:'$',maxFractionDigits:2}},
  {column:3,anchor:'Department:',mode:'exact'}]};
(async()=>{
  const js=await import('pdfjs-dist/legacy/build/pdf.mjs');js.GlobalWorkerOptions.workerSrc=pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  const standardFontDataUrl=path.join(path.dirname(require.resolve('pdfjs-dist/package.json')),'standard_fonts').replaceAll('\\','/')+'/';
  const open=async file=>js.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false,enableScripting:false,standardFontDataUrl}).promise;
  const source=parseCsvSource(fs.readFileSync(path.join(root,'source.csv')),0),report={generators:{},cases:[],observations:{}};
  let pass=0,fail=0;
  for(const generator of ['word','reportlab']){
    const directory=path.join(root,generator);assert.ok(fs.existsSync(directory),'Real generator output unavailable: '+generator);
    for(const id of ['perfect','wrong-value','missing','duplicate','wrong-key','boilerplate','leading-zero']){
      const bytes=fs.readFileSync(path.join(directory,id+'.pdf')),file=new File([bytes],generator+'-'+id+'.pdf',{type:'application/pdf'});
      const pdf=await extractBatchPdfEvidence(file,open),result=verifyBatch(source,pdf,config);
      try{
        if(id==='perfect')assert.equal(result.summary.passedSourceRecords,5);
        if(id==='wrong-value'||id==='boilerplate'){assert.equal(result.pages[0].fields.find(f=>f.column===2).status,'FIELD MISMATCH');assert.equal(result.summary.passedSourceRecords,4)}
        if(id==='missing'){assert.equal(result.rows[4].status,'MISSING OUTPUT RECORD');assert.equal(result.summary.passedSourceRecords,4)}
        if(id==='duplicate'){assert.equal(result.rows[0].status,'DUPLICATE OUTPUT RECORD');assert.equal(result.summary.duplicateOutputInstances,1);assert.equal(result.summary.passedSourceRecords,4)}
        if(id==='wrong-key'||id==='leading-zero'){assert.equal(result.pages[0].status,'UNRESOLVED OUTPUT PAGE');assert.equal(result.summary.unresolvedOutputPages,1);assert.equal(result.summary.passedSourceRecords,4)}
        assert.equal(result.summary.sourceRecordCount,result.summary.passedSourceRecords+result.summary.failedOrReviewSourceRecords+result.summary.missingSourceRecords);
        assert.equal(result.summary.outputPageCount,result.summary.assignedOutputPages+result.summary.unresolvedOutputPages+result.summary.ambiguousPages);
        assert.equal(Buffer.compare(Buffer.from(await file.arrayBuffer()),bytes),0);
        pass++;console.log('PASS:',generator,id);
        report.cases.push({generator,id,pass:true,summary:result.summary});
      }catch(error){fail++;console.log('FAIL:',generator,id,error.message);report.cases.push({generator,id,pass:false,error:error.message,result});}
      if(id==='perfect'){
        report.observations[generator]=pdf.pages.map(page=>({page:page.page,width:page.width,height:page.height,warnings:page.warnings,visibilityReview:page.visibilityReview,
          rawItems:page.rawItems,spans:page.spans,
          fields:result.pages[page.page-1].fields.map(field=>({column:field.column,observed:field.observed,itemCounts:field.evidence.map(e=>e.itemIndices.length),boxes:field.evidence.map(e=>e.boxes)}))}));
        const exactConfig={...config,fields:config.fields.map(f=>({...f,mode:'exact'}))};
        assert.equal(verifyBatch(source,pdf,exactConfig).summary.passedSourceRecords,0,'formatted salary must fail exact-text mode');pass++;
        const doc=await open(file);
        try{for(let n=1;n<=doc.numPages;n++){
          const p=await doc.getPage(n),viewport=p.getViewport({scale:1.5}),surface=canvas.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),ctx=surface.getContext('2d');
          try{await p.render({canvas:surface,canvasContext:ctx,viewport,background:'rgb(255,255,255)'}).promise;
            for(const field of result.pages[n-1].fields)for(const evidence of field.evidence)for(const box of evidence.boxes){
              if(!box.width||!box.height)continue;
              const samples=ctx.getImageData(Math.floor(box.left*surface.width),Math.floor(box.top*surface.height),Math.ceil(box.width*surface.width),Math.ceil(box.height*surface.height)).data;
              assert.ok(Array.from(samples).some((v,i)=>i%4!==3&&v<200),'real field bbox misses text ink');
              ctx.strokeStyle='#d23445';ctx.strokeRect(box.left*surface.width,box.top*surface.height,box.width*surface.width,box.height*surface.height);
            }
            fs.writeFileSync(path.join(directory,'evidence-page-'+n+'.png'),surface.toBuffer('image/png'));
          }finally{surface.width=0;surface.height=0;p.cleanup();}
        }}finally{await doc.loadingTask.destroy()}
        pass++;console.log('PASS:',generator,'exact-mode rejection and rendered evidence alignment on all five pages');
      }
    }
  }
  report.pass=pass;report.fail=fail;fs.writeFileSync(path.join(root,'acceptance-report.json'),JSON.stringify(report,null,2));
  console.log(`RESULT ${pass} PASS / ${fail} FAIL`);if(fail)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1});
