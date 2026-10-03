// Actual production UI acceptance. Inputs are the public Word mail-merge fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{PDFDocument,StandardFonts,rgb}=require('pdf-lib');
const base=process.env.TOOLNEST_BATCH_BASE_URL||'http://localhost:3101';
const root=path.resolve(process.env.TOOLNEST_BATCH_FIXTURES||'outputs/qa/batch-verification-real');
const output=path.resolve('outputs/qa/batch-verification-browser');
const cases=['perfect','wrong-value','missing','duplicate','wrong-key','boilerplate','leading-zero'];
const enc=text=>({name:'public.csv',mimeType:'text/csv',buffer:Buffer.from(text)});
let pass=0;
async function check(name,fn){await fn();pass++;console.log('PASS:',name)}
async function configure(page,csv=path.join(root,'source.csv')){
 await page.locator('#batch-csv').setInputFiles(csv);
 await page.locator('#batch-key-anchor').fill('Employee ID:');
 for(const i of [1,2,3])await page.locator('#batch-select-'+i).check();
 await page.locator('#batch-mode-2').selectOption('number');await page.locator('#batch-currency-2').fill('$');
}
async function result(page,file){await page.locator('#batch-pdf').setInputFiles(file);await page.getByRole('button',{name:'Check batch',exact:true}).click();await page.getByRole('region',{name:'Batch results'}).waitFor({timeout:60000})}
async function summary(page,label,value){assert.equal(await page.locator(`[data-summary="${label}"]`).innerText(),String(value),label)}
async function preview(page,n){await page.locator(`[data-preview-page="${n}"][data-preview-ready="true"]`).waitFor({timeout:30000})}
async function unsupported(){const doc=await PDFDocument.create({updateMetadata:false}),p=doc.addPage([420,300]),surface=require('@napi-rs/canvas').createCanvas(300,200),ctx=surface.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,300,200);ctx.fillStyle='black';ctx.fillText('SCANNED PUBLIC TEXT',20,80);p.drawImage(await doc.embedPng(surface.toBuffer('image/png')),{x:25,y:25,width:300,height:200});return {name:'public-scan.pdf',mimeType:'application/pdf',buffer:Buffer.from(await doc.save())}}
async function ambiguous(){const doc=await PDFDocument.create({updateMetadata:false}),p=doc.addPage([420,300]),font=await doc.embedFont(StandardFonts.Helvetica);for(const [i,text] of ['Employee ID: 0012','Name: Alice Brown','Salary: $62,500.00','Salary: $62,500.00','Department: Finance'].entries())p.drawText(text,{x:30,y:260-i*35,size:12,font});return {name:'public-ambiguous.pdf',mimeType:'application/pdf',buffer:Buffer.from(await doc.save())}}
(async()=>{
 assert.ok(fs.existsSync(path.join(root,'word/perfect.pdf')),'Public Word fixture outputs required; run the real-output acceptance gate first.');
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({channel:process.env.TOOLNEST_BATCH_BROWSER||'chrome',headless:true});
 const errors=[],external=[],uploads=[];
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('request',request=>{if(['http:','https:'].includes(new URL(request.url()).protocol)&&new URL(request.url()).origin!==new URL(base).origin)external.push(request.url());if(request.method()==='POST')uploads.push(request.url())});
  await page.goto(base+'/tools/mail-merge-verifier',{waitUntil:'networkidle'});
  await check('Conservative scope and visibility disclosure before selecting files',async()=>{assert.equal(await page.getByText('PDF text extraction does not prove that every matching value is visibly rendered exactly as expected.',{exact:true}).isVisible(),true);assert.match(await page.locator('.batch-shell').innerText(),/neither file is uploaded/)});
  for(const id of cases){await page.getByRole('button',{name:'Reset',exact:true}).count()&&await page.getByRole('button',{name:'Reset',exact:true}).click();await configure(page);
   await result(page,path.join(root,'word',id+'.pdf'));
   await check('Word '+id+' result counts and truthful row/page evidence',async()=>{
    await summary(page,'Source records',5);await summary(page,'Passed',id==='perfect'?5:4);await summary(page,'Output pages',id==='missing'?4:id==='duplicate'?6:5);
    await summary(page,'Missing output',['missing','wrong-key','leading-zero'].includes(id)?1:0);await summary(page,'Duplicate output instances',id==='duplicate'?1:0);await summary(page,'Unresolved pages',['wrong-key','leading-zero'].includes(id)?1:0);
    const sourceButtons=page.locator('.batch-result-navigation > div').first();
    if(['wrong-key','leading-zero'].includes(id)){assert.match(await sourceButtons.innerText(),/CSV row 2 · 0012 · MISSING OUTPUT RECORD/);assert.equal(await page.locator('[data-preview-ready="true"]').count(),0);await page.getByRole('button',{name:/^Page 1 · UNRESOLVED OUTPUT PAGE/}).click();assert.equal(await page.getByText('No defensible source row is assigned to this output page.',{exact:true}).isVisible(),true);}
    else{await preview(page,1);assert.equal(await page.getByText('Original physical row 2',{exact:true}).isVisible(),true);assert.ok(await page.locator('.batch-highlight.is-key').count()>0);await page.getByRole('combobox',{name:'Evidence field'}).selectOption('2');assert.ok(await page.locator('.batch-highlight.is-field').count()>0);
     if(['wrong-value','boilerplate'].includes(id)){assert.match(await page.locator('.batch-evidence-layout').innerText(),/Finding: FIELD MISMATCH/);assert.match(await page.locator('.batch-evidence-layout').innerText(),/\$6,250\.00/);assert.match(await page.locator('.batch-evidence-layout').innerText(),/expected 62500\.00; observed 6250\.00/)}
     const report=JSON.parse(fs.readFileSync(path.join(root,'acceptance-report.json'),'utf8')),expected=report.observations.word[0].fields.find(f=>f.column===2).boxes[0][0];
     const box=await page.locator('.batch-highlight.is-field').first().evaluate(el=>({left:parseFloat(el.style.left)/100,top:parseFloat(el.style.top)/100,width:parseFloat(el.style.width)/100,height:parseFloat(el.style.height)/100}));
     for(const key of ['left','top','height'])assert.ok(Math.abs(box[key]-expected[key])<.001,'highlight '+key+' differs from extracted Word evidence');
    }
    if(id==='duplicate'){await page.getByRole('button',{name:/^Page 6 · DUPLICATE OUTPUT RECORD/}).click();await preview(page,6);assert.equal(await page.getByText('Original physical row 2',{exact:true}).isVisible(),true)}
    if(id==='missing'){await page.getByRole('button',{name:/^CSV row 6 · EMP-016/}).click();assert.equal(await page.locator('[data-preview-ready="true"]').count(),0);assert.equal(await page.getByText('No assigned output page. No source location is invented.',{exact:true}).isVisible(),true)}
    assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    await page.screenshot({path:path.join(output,id+'.png'),fullPage:true});if(id==='perfect')await page.locator('.batch-evidence-layout').screenshot({path:path.join(output,'evidence-desktop.png')});
   });
  }
  await check('Reset/replacement/config changes clear results and old preview',async()=>{
   await page.getByRole('button',{name:'Reset',exact:true}).click();assert.equal(await page.getByRole('region',{name:'Batch results'}).count(),0);assert.equal(await page.locator('#batch-csv').inputValue(),'');assert.equal(await page.locator('#batch-pdf').count(),0);
   await configure(page);await result(page,path.join(root,'word/perfect.pdf'));await preview(page,1);
   await page.locator('#batch-anchor-1').fill('Different:');assert.equal(await page.getByRole('region',{name:'Batch results'}).count(),0);assert.equal(await page.locator('canvas[aria-label^="Actual PDF"]').count(),0);
   await page.locator('#batch-anchor-1').fill('Name:');await result(page,path.join(root,'word/perfect.pdf'));
   await page.locator('#batch-pdf').setInputFiles(path.join(root,'word/wrong-value.pdf'));assert.equal(await page.getByRole('region',{name:'Batch results'}).count(),0);
   await page.getByRole('button',{name:'Check batch',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.waitForTimeout(1500);assert.equal(await page.getByRole('region',{name:'Batch results'}).count(),0);assert.equal(await page.locator('[data-preview-ready="true"]').count(),0);
   await page.locator('#batch-csv').setInputFiles(enc('ID,Name\n0012,Ada\n'));await page.locator('#batch-key-anchor').waitFor();assert.equal(await page.locator('#batch-pdf').inputValue(),'');assert.equal(await page.getByRole('region',{name:'Batch results'}).count(),0);
  });
  await check('CSV malformed/oversized and numeric configuration fail clearly',async()=>{
   await page.locator('#batch-csv').setInputFiles(enc('ID,N\nA,"bad'));await page.locator('.batch-shell [role="alert"]').waitFor();assert.match(await page.locator('.batch-shell [role="alert"]').innerText(),/Unterminated/);
   await page.locator('#batch-csv').setInputFiles({name:'large.csv',mimeType:'text/csv',buffer:Buffer.alloc(1048577,65)});await page.locator('.batch-shell [role="alert"]').waitFor();assert.match(await page.locator('.batch-shell [role="alert"]').innerText(),/1 MiB/);
   await configure(page);await page.locator('#batch-grouping-2').selectOption('.');assert.equal(await page.getByRole('button',{name:'Check batch',exact:true}).isDisabled(),true);assert.match(await page.locator('.batch-setup-error').innerText(),/Invalid numeric rule/);await page.locator('#batch-grouping-2').selectOption(',');
  });
  await check('Image-only PDF unsupported; ambiguity cannot display PASS',async()=>{
   await page.locator('#batch-pdf').setInputFiles(await unsupported());await page.getByRole('button',{name:'Check batch',exact:true}).click();await page.locator('.batch-shell [role="alert"]').waitFor({timeout:30000});assert.match(await page.locator('.batch-shell [role="alert"]').innerText(),/requires a searchable\/native-text PDF/);assert.equal(await page.getByRole('region',{name:'Batch results'}).count(),0);
   await result(page,await ambiguous());assert.match(await page.locator('.batch-result-navigation').innerText(),/AMBIGUOUS FIELD/);await summary(page,'Passed',0);
  });
  await check('Mobile 390px evidence and setup readable without overflow',async()=>{await page.setViewportSize({width:390,height:844});await preview(page,1);assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});await page.locator('.batch-evidence-layout').screenshot({path:path.join(output,'evidence-mobile.png')})});
  await check('No browser/hydration errors or remote document/network processing',()=>{assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(uploads,[])});
  await context.close();console.log(`RESULT ${pass} PASS / 0 FAIL (${process.env.TOOLNEST_BATCH_BROWSER||'chrome'})`);
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
