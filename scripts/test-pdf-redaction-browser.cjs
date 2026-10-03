// Real desktop Chromium UI regression; no private documents or production test hooks.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const zlib=require('node:zlib');
const {chromium}=require('playwright');
const {PDFDocument,PDFName,PDFString,StandardFonts,degrees}=require('pdf-lib');
const origin=process.env.TOOLNEST_QA_ORIGIN||'http://127.0.0.1:3100',N=PDFName.of;
const output=path.resolve('outputs/qa/pdf-redaction');
async function fixture(signed=false,fractional=false){
  const pdf=await PDFDocument.create({updateMetadata:false}),font=await pdf.embedFont(StandardFonts.Helvetica);
  let logo;
  if(fractional){const c=require('@napi-rs/canvas').createCanvas(238,260),ctx=c.getContext('2d');ctx.strokeStyle='black';ctx.lineWidth=9;ctx.beginPath();ctx.arc(119,128,94,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#3056a8';ctx.beginPath();ctx.moveTo(119,3);ctx.lineTo(212,224);ctx.lineTo(26,224);ctx.closePath();ctx.fill();logo=await pdf.embedPng(c.toBuffer('image/png'));c.width=0;c.height=0;}
  for(let i=0;i<2;i++){const p=pdf.addPage(fractional?[595.44,841.68]:[420,280]);if(!fractional)p.setCropBox(12.25,8.5,400.5,260.25);p.setRotation(degrees(i?90:0));p.drawText('SYNTHETIC PRIVATE 7391',{x:42,y:220,size:14,font});p.drawText('PUBLIC CONTENT REMAINS',{x:42,y:140,size:12,font});if(logo)p.drawImage(logo,{x:92.3,y:704.91,width:78,height:85.4});}
  pdf.setAuthor('Synthetic browser fixture');
  if(signed)pdf.catalog.set(N('SignatureFixture'),pdf.context.register(pdf.context.obj({Type:'Sig',ByteRange:[0,1,2,3]})));
  const bytes=Buffer.from(await pdf.save({useObjectStreams:false,updateFieldAppearances:false}));
  if(logo)assert.ok(pdf.context.lookup(logo.ref).dict.get(N('SMask')),'public fractional fixture must contain a soft mask');
  return bytes;
}
async function upload(page,bytes){await page.locator('#pdf-redaction-file').setInputFiles({name:'synthetic-browser.pdf',mimeType:'application/pdf',buffer:bytes});await page.locator('.redaction-page canvas').waitFor({timeout:30000});await page.waitForFunction(()=>!document.querySelector('.redaction-preview-loading'),{timeout:30000})}
async function draw(page){
  await page.locator('.redaction-page[data-preview-ready="true"]').waitFor();
  await page.locator('.redaction-scroll').scrollIntoViewIfNeeded();
  await page.locator('.redaction-scroll').evaluate(element=>{element.scrollTop=0;element.scrollLeft=0});
  const box=await page.locator('.redaction-page').boundingBox();assert.ok(box);
  await page.mouse.move(box.x+box.width*.05,box.y+box.height*.09);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.8,box.y+box.height*.28,{steps:7});await page.mouse.up();
  await page.locator('.redaction-mark').first().waitFor();
}
async function reviewAndRun(page){await page.getByRole('button',{name:'Review marked areas',exact:true}).click();await page.getByLabel('I understand the copy is image-only and unmarked visible information remains.').check();await page.getByRole('button',{name:'Redact & Verify',exact:true}).click()}
(async()=>{
  fs.mkdirSync(output,{recursive:true});const bytes=await fixture(),errors=[],writes=[],external=[];
  for(const channel of ['chrome','msedge']){
    const browser=await chromium.launch({channel,headless:true});
    try{
      const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2,acceptDownloads:true}),page=await context.newPage();
      page.on('pageerror',e=>errors.push(channel+': '+e.message));
      page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Content Security Policy'))errors.push(channel+': '+m.text())});
      page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.method()+' '+r.url());if(!r.url().startsWith(origin)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url())});
      await page.goto(origin+'/tools/pdf-redaction',{waitUntil:'networkidle'});
      await page.getByRole('heading',{name:'PDF Redaction',exact:true}).waitFor();
      const compressed=zlib.deflateSync(Buffer.from('SYNTHETIC DECODE CONTROL'));
      const decoderCases=[compressed,Buffer.concat([compressed,Buffer.from('SECRET')]),Buffer.concat([compressed,compressed])].map(buffer=>Array.from(buffer));
      const decoded=await page.evaluate(async cases=>{const results=[];for(const data of cases){try{await new Response(new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();results.push(true)}catch{results.push(false)}}return results},decoderCases);
      assert.deepEqual(decoded,[true,false,false],channel+' native decoder must reject trailing bytes and concatenated members');
      console.log('PASS:',channel,'native strict deflate stream consumption');
      assert.equal(await page.getByRole('link',{name:'Download verified copy'}).count(),0);
      await upload(page,bytes);await draw(page);
      const mark=page.getByRole('button',{name:'Marked area 1 on page 1'});await mark.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Alt+ArrowDown');
      const before=await mark.getAttribute('style');await page.getByLabel('Preview zoom').selectOption('1.25');
      await page.waitForFunction(()=>!document.querySelector('.redaction-preview-loading'));
      assert.equal(await mark.getAttribute('style'),before,'zoom must not change stored physical mark');
      const handle=await page.locator('.redaction-mark i').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+8,handle.y+handle.height/2+5,{steps:3});await page.mouse.up();
      const movedBox=await mark.boundingBox();await page.mouse.move(movedBox.x+movedBox.width/2,movedBox.y+movedBox.height/2);await page.mouse.down();await page.mouse.move(movedBox.x+movedBox.width/2+6,movedBox.y+movedBox.height/2+3,{steps:3});await page.mouse.up();
      await page.getByRole('button',{name:'Next page',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.redaction-preview-loading'));await draw(page);
      await page.getByRole('button',{name:'Delete selected mark',exact:true}).click();assert.equal(await page.locator('.redaction-mark').count(),0);
      await page.getByRole('button',{name:'Undo last change',exact:true}).click();assert.equal(await page.locator('.redaction-mark').count(),1);
      await page.screenshot({path:path.join(output,channel+'-marks.png'),fullPage:true});
      await reviewAndRun(page);
      assert.equal(await page.getByRole('link',{name:'Download verified copy'}).count(),0,'download visible before verification');
      await page.getByText('Marked areas removed. The generated PDF passed ToolNest\'s supported redaction checks.',{exact:true}).waitFor({timeout:60000});
      const event=page.waitForEvent('download');await page.getByRole('link',{name:'Download verified copy'}).click();const download=await event;
      const filename=path.join(output,channel+'-verified.pdf');await download.saveAs(filename);assert.equal(await download.failure(),null);
      const final=await PDFDocument.load(fs.readFileSync(filename),{updateMetadata:false});assert.equal(final.getPageCount(),2);assert.equal(final.catalog.get(N('AcroForm')),undefined);
      await page.screenshot({path:path.join(output,channel+'-passed.png'),fullPage:true});
      // A later edit must invalidate the exact verified Blob and revoke its download.
      await page.getByRole('button',{name:'Marked area 1 on page 2'}).focus();await page.keyboard.press('ArrowRight');
      assert.equal(await page.getByRole('link',{name:'Download verified copy'}).count(),0,'stale marks retained download');
      console.log('PASS:',channel,'draw/move/resize/keyboard/undo/pages/zoom/DPR, crop/rotation, verification, download, stale-output invalidation');
      if(channel==='chrome'){
        // Force a real decoder failure after construction through a browser API;
        // production code contains no failure injection or test-specific branch.
        await page.evaluate(()=>{window.savedDecoder=window.DecompressionStream;window.DecompressionStream=class{constructor(){return new TransformStream({transform(_chunk,controller){controller.error(new Error('QA decoder failure'))}})}}});
        await reviewAndRun(page);await page.getByRole('alert').filter({hasText:'No download is available'}).waitFor({timeout:60000});
        assert.equal(await page.getByRole('link',{name:'Download verified copy'}).count(),0);
        await page.evaluate(()=>window.DecompressionStream=window.savedDecoder);console.log('PASS: failed mandatory verification blocks download');
        await reviewAndRun(page);await page.getByRole('button',{name:'Cancel',exact:true}).click();
        await page.getByText('Cancelled. No downloadable copy was created.',{exact:true}).waitFor();
        await page.waitForTimeout(600);assert.equal(await page.getByRole('link',{name:'Download verified copy'}).count(),0);console.log('PASS: cancellation blocks late result/download');
        await page.getByRole('button',{name:'Reset',exact:true}).click();assert.equal(await page.locator('.redaction-page').count(),0);
        await page.locator('#pdf-redaction-file').setInputFiles({name:'synthetic-signed.pdf',mimeType:'application/pdf',buffer:await fixture(true)});
        await page.getByRole('alert').filter({hasText:'Digital signature structure detected'}).waitFor({timeout:30000});assert.equal(await page.getByRole('button',{name:'Redact & Verify',exact:true}).count(),0);
        console.log('PASS: signed input refused, reset/new-file flow');
        await page.getByRole('button',{name:'Reset',exact:true}).click();
        await page.evaluate(()=>localStorage.setItem('toolnest-theme','dark'));await page.reload({waitUntil:'networkidle'});await upload(page,bytes);await draw(page);
        await page.screenshot({path:path.join(output,'chrome-dark.png'),fullPage:true});
        assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
        for(const mobile of [{width:390,ua:null},{width:1024,ua:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/154.0 Mobile Safari/537.36'}]){
          const mobileContext=await browser.newContext({viewport:{width:mobile.width,height:844},...(mobile.ua?{userAgent:mobile.ua,isMobile:true,hasTouch:true}:{})});const m=await mobileContext.newPage();
          await m.goto(origin+'/tools/pdf-redaction',{waitUntil:'networkidle'});await m.getByRole('heading',{name:'Desktop Chrome or Edge required'}).waitFor();
          assert.equal(await m.locator('#pdf-redaction-file').count(),0);assert.equal(await m.getByRole('button',{name:'Redact & Verify'}).count(),0);
          assert.equal(await m.locator('body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
          await m.screenshot({path:path.join(output,`mobile-${mobile.width}.png`),fullPage:true});await mobileContext.close();
        }console.log('PASS: dark mode, narrow mobile and wide mobile-UA refusal, no overflow');
      }
      await page.getByRole('button',{name:'Reset',exact:true}).click();
      await upload(page,await fixture(false,true));await draw(page);await reviewAndRun(page);
      assert.equal(await page.getByRole('link',{name:'Download verified copy'}).count(),0);
      await page.getByText('Marked areas removed. The generated PDF passed ToolNest\'s supported redaction checks.',{exact:true}).waitFor({timeout:60000});
      const fractionalEvent=page.waitForEvent('download');await page.getByRole('link',{name:'Download verified copy'}).click();const fractionalDownload=await fractionalEvent;
      const fractionalPath=path.join(output,channel+'-fractional-verified.pdf');await fractionalDownload.saveAs(fractionalPath);assert.equal(await fractionalDownload.failure(),null);
      const fractionalPdf=await PDFDocument.load(fs.readFileSync(fractionalPath),{updateMetadata:false});assert.equal(fractionalPdf.getPageCount(),2);
      for(const p of fractionalPdf.getPages()){const stream=fractionalPdf.context.lookup(p.node.get(N('Contents')));const program=zlib.inflateSync(stream.getContents()).toString();const operands=program.split('\n')[1].split(' ').slice(0,6);assert.ok(operands.every(n=>/^-?\d+(?:\.\d+)?$/.test(n)),'exponent notation in PDF drawing matrix');}
      console.log('PASS:',channel,'public soft-mask logo, integral raster/fractional page points, exact verification and real download');
      assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'desktop overflow');await context.close();
    }finally{await browser.close()}
  }
  assert.deepEqual(errors,[],'console/hydration/runtime errors');assert.deepEqual(writes,[],'unexpected server write/upload');assert.deepEqual(external,[],'unexpected external request');
  console.log('PASS: production browser workflow, no runtime errors, no server upload or external processing');
})().catch(error=>{console.error(error);process.exitCode=1});
