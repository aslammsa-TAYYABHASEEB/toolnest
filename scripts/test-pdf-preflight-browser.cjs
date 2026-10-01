const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {PDFDocument,PDFName,PDFString,StandardFonts}=require('pdf-lib');
const N=value=>PDFName.of(value);
async function fixture(){
  const pdf=await PDFDocument.create({updateMetadata:false}),page=pdf.addPage([420,280]),font=await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('BROWSER PREFLIGHT SEARCHABLE',{x:42,y:220,size:18,font});
  const field=pdf.getForm().createTextField('BrowserField');field.setText('BROWSER-VALUE');field.addToPage(page,{x:42,y:150,width:180,height:24,font});
  pdf.setAuthor('Browser QA Author');pdf.addJavaScript('BrowserFixture','app.alert("fixture")');
  page.node.addAnnot(pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[25,25,125,50],A:{Type:'Action',S:'URI',URI:PDFString.of('https://example.test/keep')}})));
  return Buffer.from(await pdf.save({useObjectStreams:false,updateFieldAppearances:false}));
}
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[],bytes=await fixture();
  try{
    for(const scenario of [{name:'desktop light',width:1440,height:1000,theme:'light'},{name:'desktop dark',width:1440,height:1000,theme:'dark'},{name:'mobile light',width:390,height:844,theme:'light'},{name:'mobile dark',width:390,height:844,theme:'dark'}]){
      const context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height}});
      await context.addInitScript(theme=>localStorage.setItem('toolnest-theme',theme),scenario.theme);
      const page=await context.newPage();
      page.on('pageerror',error=>errors.push(scenario.name+': '+error.message));
      page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('Download the React DevTools'))errors.push(scenario.name+': '+message.text())});
      await page.goto('http://localhost:3100/tools/pdf-preflight',{waitUntil:'networkidle'});
      await page.getByRole('heading',{name:'PDF Preflight',exact:true}).waitFor();
      assert.equal(await page.locator('html').getAttribute('data-theme'),scenario.theme,scenario.name+' theme');
      assert.equal(await page.locator('body').evaluate(element=>element.scrollWidth<=element.clientWidth+1),true,scenario.name+' horizontal overflow');
      assert.equal(await page.getByText('What must this PDF meet?').isVisible(),true);
      assert.equal(await page.getByText('Select once').isVisible(),true);
      for(const copy of ['1 - Requirements','2 - Your PDF','Optional - MB','One PDF - 100 MB maximum'])assert.equal(await page.getByText(copy,{exact:true}).isVisible(),true,'missing exact copy: '+copy);
      if(scenario.name==='desktop light'){
        await page.locator('#pdf-preflight-file').setInputFiles({name:'browser-preflight.pdf',mimeType:'application/pdf',buffer:bytes});
        await page.evaluate(()=>{
          window.preflightCopyObserved=[];
          const record=()=>{window.preflightCopyObserved.push(...Array.from(document.querySelectorAll('.pdf-status p, .preflight-shell button'),element=>element.textContent))};
          new MutationObserver(record).observe(document.querySelector('.preflight-shell'),{subtree:true,childList:true,characterData:true});
        });
        await page.getByRole('button',{name:'Run preflight'}).click();
        await page.getByText('What the selected PDF shows').waitFor({timeout:20000});
        assert.equal(await page.getByText('Requirement checks and safety review are separate.').isVisible(),true);
        for(const copy of ['3 - Before inspection','4 - Plan','5 - Your approval','Automatic options','Page order and dimensions'])assert.equal(await page.getByText(copy,{exact:true}).isVisible(),true,'missing exact copy: '+copy);
        await page.getByText('Page dimensions and rotations',{exact:true}).click();
        assert.equal(await page.getByText('Page 1: 420.0 x 280.0 pt - 0 deg',{exact:true}).isVisible(),true);
        const metadata=page.getByLabel('Remove metadata and XMP');assert.equal(await metadata.isChecked(),false,'metadata must not be selected silently');
        const active=page.getByLabel('Remove JavaScript and dangerous active actions');assert.equal(await active.isChecked(),true,'required active-action fix should be proposed');
        await page.getByRole('button',{name:'Approve changes and create copy'}).click();
        await page.getByText('Actual output reinspection').waitFor({timeout:30000});
        assert.equal(await page.getByRole('link',{name:'Download preflight copy'}).isVisible(),true);
        assert.equal(await page.getByText('JavaScript / Launch actions').isVisible(),true);
        assert.equal(await page.getByText('6 - After verification',{exact:true}).isVisible(),true);
        assert.match(await page.locator('.preflight-after').innerText(),/\d+ before -> 0 after - Verified removed/);
        const observed=await page.evaluate(()=>window.preflightCopyObserved);
        for(const copy of ['Checking requirements and privacy-relevant PDF structures...','Checking PDF...','Applying approved changes, then reinspecting the actual output...','Applying and checking...'])assert.ok(observed.includes(copy),'missing exact progress copy: '+copy);
      }
      assert.equal(await page.locator('body').evaluate(element=>element.scrollWidth<=element.clientWidth+1),true,scenario.name+' overflow after render');
      await context.close();
      console.log('PASS:',scenario.name);
    }
    assert.deepEqual(errors,[],'browser console/page errors');
    console.log('PASS: real browser workflow, responsive layouts, light/dark themes, no horizontal overflow, no runtime errors');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
