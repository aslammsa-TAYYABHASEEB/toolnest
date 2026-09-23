require('./pdf-word-loader.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const canvas = require('@napi-rs/canvas');
const tesseract = require('tesseract.js');
const { unzipSync, strFromU8 } = require('fflate');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(id, ...args) { return originalResolve.call(this, id.startsWith('@/') ? path.resolve(id.slice(2)) : id, ...args); };
globalThis.DOMMatrix = canvas.DOMMatrix; globalThis.ImageData = canvas.ImageData; globalThis.Path2D = canvas.Path2D;
Promise.try ??= (callback, ...args) => Promise.resolve().then(() => callback(...args));
globalThis.document = { createElement(name) {
  assert.equal(name, 'canvas'); const value = canvas.createCanvas(1, 1);
  value.toBlob = callback => callback(new Blob([value.toBuffer('image/png')], { type:'image/png' }));
  return value;
} };
// Exercise the real extractPdfTables pipeline in Node with the established
// legacy PDF.js adapter; production still uses the hardened central loader.
const testRenderer = require('../lib/pdf/renderer.ts');
testRenderer.loadPdfRendererDocument = async file => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return await pdfjs.getDocument({ data:new Uint8Array(await file.arrayBuffer()),
    enableScripting:false, isEvalSupported:false, useWorkerFetch:false }).promise;
};
const excel = require('../lib/pdf/to-excel.ts');
const { extractWordPage } = require('../lib/pdf/word-extraction.ts');
const { lineText, markTableContinuations } = require('../lib/pdf/word-layout.ts');
const { buildOcrWordPage, recognitionLines } = require('../lib/pdf/ocr-word-layout.ts');
const { extractVectorGridTables } = require('../lib/pdf/vector-table.ts');
const { extractScannedGridTables } = require('../lib/pdf/scanned-table.ts');
const { rotateCanvas } = require('../lib/pdf/ocr-render.ts');
const output = path.resolve('work/pdf-excel-qa');
fs.mkdirSync(output, { recursive:true });

function assertEvidenceInvariant(result) {
  for (const table of result.tables) {
    assert.ok(table.evidence, table.name + " must retain source evidence");
    assert.equal(table.evidence.length, table.rows.length, table.name + " evidence row count");
    table.rows.forEach((row, rowIndex) => {
      assert.equal(table.evidence[rowIndex].length, row.length, table.name + " evidence columns");
      row.forEach((value, columnIndex) => {
        const evidence = table.evidence[rowIndex][columnIndex];
        if (String(value) !== "") assert.ok(evidence, table.name + " missing evidence at " + rowIndex + "," + columnIndex);
        if (!evidence) return;
        assert.ok(evidence.page >= 1 && evidence.page <= result.pageCount);
        assert.equal(typeof evidence.sourceText, "string");
        const values = [evidence.bbox.left, evidence.bbox.top, evidence.bbox.width, evidence.bbox.height];
        assert.ok(values.every(Number.isFinite), "bbox values must be finite");
        assert.ok(evidence.bbox.left >= 0 && evidence.bbox.top >= 0);
        assert.ok(evidence.bbox.width > 0 && evidence.bbox.height > 0);
        assert.ok(evidence.bbox.left + evidence.bbox.width <= 1 + 1e-6);
        assert.ok(evidence.bbox.top + evidence.bbox.height <= 1 + 1e-6);
        if (evidence.ocrConfidence !== undefined) {
          assert.ok(Number.isFinite(evidence.ocrConfidence));
          assert.ok(evidence.ocrConfidence >= 0 && evidence.ocrConfidence <= 100);
        }
      });
    });
  }
}

function drawGrid(page, font, rows, { x=40, y=520, widths=[70,220,100], rowHeight=42 }={}) {
  const total = widths.reduce((sum, width) => sum + width, 0);
  const xs = [x]; widths.forEach(width => xs.push(xs.at(-1) + width));
  for (let row = 0; row <= rows.length; row++) page.drawLine({ start:{x,y:y-row*rowHeight}, end:{x:x+total,y:y-row*rowHeight}, thickness:1, color:rgb(.2,.25,.3) });
  xs.forEach(edge => page.drawLine({ start:{x:edge,y}, end:{x:edge,y:y-rows.length*rowHeight}, thickness:1, color:rgb(.2,.25,.3) }));
  rows.forEach((cells, row) => cells.forEach((text, column) => { if (text) page.drawText(text, { x:xs[column]+7, y:y-row*rowHeight-26, size:11, font }); }));
}

async function nativeFixture() {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica), page = pdf.addPage([470,650]);
  page.drawText('Quarterly stock report', {x:40,y:610,size:16,font});
  drawGrid(page,font,[['Item','Description','Amount'],['1001','Paper','25.50'],['1002','','8'],['1003','Folders','12']],{y:550});
  page.drawText('Prepared for internal review.', {x:40,y:340,size:11,font});
  return pdf.save();
}
async function multiFixture() {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  const first=pdf.addPage([470,650]), second=pdf.addPage([470,650]);
  drawGrid(first,font,[['1','North','10'],['2','South','20'],['3','East','30']],{y:150,rowHeight:45});
  drawGrid(second,font,[['4','West','40'],['5','Central','50'],['6','Other','60']],{y:640,rowHeight:45});
  return pdf.save();
}
async function noTableFixture() {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica), page=pdf.addPage([470,650]);
  ['This is an ordinary narrative document.', 'It has paragraphs but no repeated columns.', 'The extractor should not invent a table.'].forEach((text,index)=>page.drawText(text,{x:45,y:570-index*32,size:12,font}));
  return pdf.save();
}
async function wideMergedFixture() {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let pageNumber = 0; pageNumber < 2; pageNumber++) {
    const page = pdf.addPage([840, 600]), x = 35, top = 500, rowHeight = 34, width = 60;
    for (let row = 0; row <= 6; row++) page.drawLine({start:{x,y:top-row*rowHeight},end:{x:x+12*width,y:top-row*rowHeight},thickness:1});
    for (let col = 0; col <= 12; col++) {
      const edge = x + col*width;
      page.drawLine({start:{x:edge,y:col===0||col===6||col===12?top:top-rowHeight},end:{x:edge,y:top-6*rowHeight},thickness:1});
    }
    page.drawText(pageNumber ? 'DEDUCTIONS' : 'EARNINGS', {x:x+12,y:top-22,size:12,font});
    page.drawText(pageNumber ? 'NET SALARY' : 'GROSS SALARY', {x:x+6*width+12,y:top-22,size:12,font});
    for (let col = 0; col < 12; col++) page.drawText(`H${col+1}`, {x:x+col*width+6,y:top-rowHeight-21,size:10,font});
    for (let row = 2; row < 6; row++) for (let col = 0; col < 12; col++) {
      if (row===3 && col===5) continue;
      const value = row===5&&col===0 ? 'Total' : row===2&&col===1 ? 'Wrapped' : `${(pageNumber+1)*100+row*12+col}`;
      page.drawText(value,{x:x+col*width+6,y:top-row*rowHeight-20,size:9,font});
      if (row===2&&col===1) page.drawText('label',{x:x+col*width+6,y:top-row*rowHeight-29,size:8,font});
    }
  }
  return pdf.save();
}
async function stackedCellFixture() {
  const pdf=await PDFDocument.create(), font=await pdf.embedFont(StandardFonts.Helvetica), page=pdf.addPage([470,650]);
  const x=40, y=540, widths=[70,150,90], rowHeight=42;
  drawGrid(page,font,[['ID','Role','Vacant'],['1','Operator','4'],['2','Technician',''],['Total','','15']],{x,y,widths,rowHeight});
  const edge=x+widths[0]+widths[1], top=y-2*rowHeight;
  page.drawLine({start:{x:edge,y:top-rowHeight/2},end:{x:edge+widths[2],y:top-rowHeight/2},thickness:1});
  page.drawText('3',{x:edge+7,y:top-16,size:11,font});
  page.drawText('8',{x:edge+7,y:top-36,size:11,font});
  return pdf.save();
}
async function numericEvidenceFixture() {
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([470,650]);
  drawGrid(page,font,[['Label','Account','Amount'],['Current','A1','22,960'],['Previous','A2','1,234.50']],{x:40,y:550,widths:[100,100,120],rowHeight:42});
  return pdf.save();
}
async function irregularSpanningFixture() {
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([500,760]);
  const x=[50,140,250,340,450],top=650,rowHeight=36,rows=8;
  for(let row=0;row<=rows;row++) page.drawLine({start:{x:x[0],y:top-row*rowHeight},end:{x:x.at(-1),y:top-row*rowHeight},thickness:1});
  for(const edge of [x[0],x.at(-1)]) page.drawLine({start:{x:edge,y:top},end:{x:edge,y:top-rows*rowHeight},thickness:1});
  const divider=(edge,startRow,endRow)=>page.drawLine({
    start:{x:edge,y:top-startRow*rowHeight},end:{x:edge,y:top-endRow*rowHeight},thickness:1,
  });
  divider(x[1],0,2);
  divider(x[2],0,2);
  divider(x[3],0,2);
  divider(x[3],4,5);
  const text=(value,column,row)=>page.drawText(value,{x:x[column]+6,y:top-row*rowHeight-23,size:10,font});
  ['Item','Period','Rate','Total'].forEach((value,column)=>text(value,column,0));
  ['1000','x','6','6000'].forEach((value,column)=>text(value,column,1));
  text('Subtotal 6000',0,2);
  text('Tax due',0,4);
  text('75',3,4);
  text('Calculation explanation',0,5);
  text('Final statement',0,6);
  page.drawText('Neighboring prose must stay outside the table.',{x:50,y:710,size:11,font});
  page.drawText('Footer prose is not a table row.',{x:50,y:320,size:11,font});
  return pdf.save();
}
async function scannedFixture() {
  const image=canvas.createCanvas(1400,1000), context=image.getContext('2d');
  context.fillStyle='#fff';context.fillRect(0,0,image.width,image.height);context.font='52px Arial';context.fillStyle='#111';
  const xs=[90,390,1050], top=110, rh=190;
  [['ID','Product','Units'],['1','Apples','12'],['2','Oranges',''],['3','Pears','7']].forEach((row,r)=>row.forEach((text,c)=>context.fillText(text,xs[c],top+r*rh+90)));
  fs.writeFileSync(path.join(output,'scanned.png'),image.toBuffer('image/png'));
  const pdf=await PDFDocument.create(), png=await pdf.embedPng(image.toBuffer('image/png')), page=pdf.addPage([700,500]);page.drawImage(png,{x:0,y:0,width:700,height:500});
  return pdf.save();
}
async function verticalFixture() {
  const pdf=await PDFDocument.create(), font=await pdf.embedFont(StandardFonts.Helvetica), page=pdf.addPage([560,650]);
  const xs=[40,160,280,400,520], ys=[560,430,385,340,295];
  ys.forEach(y=>page.drawLine({start:{x:40,y},end:{x:520,y},thickness:1}));
  xs.forEach(x=>page.drawLine({start:{x,y:560},end:{x,y:295},thickness:1}));
  page.drawText('Normal Header',{x:47,y:495,size:10,font});
  page.drawText('Conveyance',{x:208,y:445,size:10,font,rotate:degrees(90)});
  page.drawText('Allowance',{x:222,y:445,size:10,font,rotate:degrees(90)});
  page.drawText('Support',{x:365,y:545,size:10,font,rotate:degrees(270)});
  page.drawText('Allowance',{x:350,y:545,size:10,font,rotate:degrees(270)});
  page.drawText('Three',{x:448,y:445,size:10,font,rotate:degrees(90)});
  page.drawText('Word',{x:462,y:445,size:10,font,rotate:degrees(90)});
  page.drawText('Header',{x:476,y:445,size:10,font,rotate:degrees(90)});
  for(let row=0;row<3;row++) for(let col=0;col<4;col++) page.drawText(String(row*4+col+1),{x:xs[col]+7,y:ys[row+1]-28,size:10,font});
  return pdf.save();
}
async function unlabeledSummaryFixture() {
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([470,650]);
  drawGrid(page,font,[['Label','Due','Drawn'],['Period 1','100','200'],['','',''],['','300','400']],{y:540});
  return pdf.save();
}
const file=(bytes,name)=>new File([bytes],name,{type:'application/pdf'});
(async()=>{
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = require('node:url').pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  async function extractNative(bytes) {
    const document = await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useWorkerFetch:false}).promise, pages=[];
    try {
      for(let number=1;number<=document.numPages;number++){const page=await document.getPage(number);try{pages.push(await extractWordPage(page));}finally{page.cleanup();}}
    } finally { await document.loadingTask.destroy(); }
    markTableContinuations(pages); const tables=[];
    pages.forEach((page,pageIndex)=>page.blocks.forEach(block=>{
      if(block.kind!=='table')return;
      const extracted=excel.wordTableRowsWithEvidence(block,page,pageIndex+1,'native',0);
      const previous=tables.at(-1);
      if(block.continuation&&previous){
        previous.rows.push(...extracted.rows);previous.evidence.push(...extracted.evidence);previous.pageEnd=pageIndex+1;
      } else tables.push({id:'table-'+(tables.length+1),name:'Table '+(tables.length+1),pageStart:pageIndex+1,pageEnd:pageIndex+1,source:'native',method:'layout-table',rows:extracted.rows,evidence:extracted.evidence});
    }));
    return {tables,pageCount:pages.length,scannedPageCount:0};
  }
  const fixtures = { native:await nativeFixture(), multi:await multiFixture(), scanned:await scannedFixture(), none:await noTableFixture(), wide:await wideMergedFixture(), stacked:await stackedCellFixture(), vertical:await verticalFixture(), summary:await unlabeledSummaryFixture(), numeric:await numericEvidenceFixture(), irregular:await irregularSpanningFixture() };
  for(const [name,bytes] of Object.entries(fixtures)) fs.writeFileSync(path.join(output,`${name}.pdf`),bytes);
  const routedMulti=await excel.extractPdfTables(file(fixtures.multi,'multi.pdf'));
  assert.equal(routedMulti.tables.length,1,'real routing must retain one continued table');
  assert.deepEqual([routedMulti.tables[0].pageStart,routedMulti.tables[0].pageEnd],[1,2]);
  assert.equal(routedMulti.tables[0].rows.length,6);
  assert.deepEqual([...new Set(routedMulti.tables[0].evidence.flat().filter(Boolean).map(cell=>cell.page))],[1,2]);
  assert.equal(routedMulti.scannedPageCount,0,'strong sparse native grids must not be misrouted to OCR');
  const irregular=await excel.extractPdfTables(file(fixtures.irregular,'irregular-spanning.pdf'));
  assert.equal(irregular.tables.length,1,'row-local dividers must recover one irregular ruled table');
  assert.equal(irregular.scannedPageCount,0,'native irregular grids must not be routed to OCR');
  const irregularTable=irregular.tables[0];
  assert.equal(irregularTable.method,'vector-grid');
  assert.deepEqual([irregularTable.pageStart,irregularTable.pageEnd],[1,1]);
  assert.equal(irregularTable.rows.length,8);
  assert.equal(irregularTable.rows[0].length,4);
  assert.deepEqual(irregularTable.rows[1],[1000,'x',6,6000]);
  assert.deepEqual(irregularTable.rows[4],['Tax due','','',75]);
  assert.ok(irregularTable.merges.some(merge=>merge.startRow===2&&merge.endRow===2&&merge.startColumn===0&&merge.endColumn===3));
  assert.ok(irregularTable.merges.some(merge=>merge.startRow===4&&merge.endRow===4&&merge.startColumn===0&&merge.endColumn===2));
  assert.ok(irregularTable.merges.some(merge=>merge.startRow===7&&merge.endRow===7&&merge.startColumn===0&&merge.endColumn===3));
  assert.equal(irregularTable.evidence[4][3].sourceText,'75');
  assert.ok(Math.abs(irregularTable.evidence[4][3].bbox.left-340/500)<.01);
  assert.ok(!irregularTable.rows.flat().join(' ').includes('Neighboring prose'));
  assertEvidenceInvariant(irregular);
  const native=await extractNative(fixtures.native);
  assert.equal(native.tables.length,1); assert.equal(native.tables[0].rows.length,4); assert.equal(native.tables[0].rows[0].length,3);
  assert.equal(native.tables[0].rows[2][1],''); assert.equal(native.tables[0].rows[1][2],25.5); assert.equal(native.tables[0].rows[1][0],1001);
  assertEvidenceInvariant(native);
  assert.equal(native.tables[0].evidence[1][1].sourceText,'Paper');
  const nativePaper=native.tables[0].evidence[1][1].bbox;
  assert.ok(nativePaper.left <= 117/470 && nativePaper.left + nativePaper.width >= 145/470);
  const multi=await extractNative(fixtures.multi);
  assert.equal(multi.tables.length,1); assert.equal(multi.tables[0].pageStart,1); assert.equal(multi.tables[0].pageEnd,2); assert.equal(multi.tables[0].rows.length,6);
  assertEvidenceInvariant(multi);
  assert.deepEqual(multi.tables[0].evidence.slice(0,3).flat().filter(Boolean).map(cell=>cell.page).filter((page,index,array)=>array.indexOf(page)===index),[1]);
  assert.deepEqual(multi.tables[0].evidence.slice(3).flat().filter(Boolean).map(cell=>cell.page).filter((page,index,array)=>array.indexOf(page)===index),[2]);
  const none=await extractNative(fixtures.none); assert.equal(none.tables.length,0);
  async function vectorPages(bytes) {
    const document = await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useWorkerFetch:false}).promise, result=[];
    try { for(let number=1;number<=document.numPages;number++){const page=await document.getPage(number);try{result.push(await extractVectorGridTables(page,await page.getTextContent()));}finally{page.cleanup();}} }
    finally { await document.loadingTask.destroy(); }
    return result;
  }
  const vectorNative=await vectorPages(fixtures.native);
  assert.equal(vectorNative[0].length,1); assert.equal(vectorNative[0][0].rows.length,4); assert.equal(vectorNative[0][0].rows[0].length,3);
  assert.equal(vectorNative[0][0].rows[2][1],'');
  const vectorNativeEvidence=excel.vectorTableEvidence(vectorNative[0][0],1);
  const vectorNativeTable={id:'vector-native',name:'Vector native',pageStart:1,pageEnd:1,source:'native',method:'vector-grid',
    rows:vectorNative[0][0].rows.map(row=>row.map(excel.inferExcelCellValue)),evidence:vectorNativeEvidence};
  assertEvidenceInvariant({tables:[vectorNativeTable],pageCount:1});
  assert.equal(vectorNativeEvidence[0][0].sourceText,'Item');
  assert.ok(Math.abs(vectorNativeEvidence[0][0].bbox.left-40/470)<.01);
  assert.ok(Math.abs(vectorNativeEvidence[0][0].bbox.top-100/650)<.01);
  assert.equal(vectorNativeEvidence[2][1],null,'Empty vector cells do not invent evidence');

  const vectorNumeric=(await vectorPages(fixtures.numeric))[0][0];
  const numericEvidence=excel.vectorTableEvidence(vectorNumeric,1);
  const numericRows=vectorNumeric.rows.map(row=>row.map((cell,column)=>
    excel.inferExcelCellValue(cell,vectorNumeric.rows[0][column])));
  assert.equal(numericRows[1][2],22960);
  assert.equal(numericEvidence[1][2].sourceText,'22,960');
  assert.equal(numericRows[2][2],1234.5);
  assert.equal(numericEvidence[2][2].sourceText,'1,234.50');
  assertEvidenceInvariant({tables:[{id:'numeric',name:'Numeric',pageStart:1,pageEnd:1,source:'native',
    method:'vector-grid',rows:numericRows,evidence:numericEvidence}],pageCount:1});

  const vectorNone=await vectorPages(fixtures.none); assert.equal(vectorNone[0].length,0);
  const vectorStacked=await vectorPages(fixtures.stacked), stacked=vectorStacked[0][0];
  assert.equal(stacked.rows.length,5); assert.equal(stacked.rows[2][2],'3'); assert.equal(stacked.rows[3][2],'8');
  assert.ok(stacked.merges.some(merge=>merge.startRow===2&&merge.endRow===3&&merge.startColumn===0));
  const vectorWide=await vectorPages(fixtures.wide);
  const vertical=(await vectorPages(fixtures.vertical))[0][0];
  assert.ok(vertical,'Both 90 and 270 degree headers should remain in the native grid');
  assert.equal(vertical.rows[0][0],'Normal Header');
  assert.equal(vertical.rows[0][1],'Conveyance Allowance');
  assert.equal(vertical.rows[0][2],'Support Allowance');
  assert.equal(vertical.rows[0][3],'Three Word Header');
  const summary=(await vectorPages(fixtures.summary))[0][0];
  assert.equal(summary.rows.length,3,'Only the wholly empty unmerged row should be removed');
  assert.deepEqual(summary.rows[2],['','300','400'],'The unlabeled numeric summary must stay intact');
  assert.equal(vectorWide.length,2);
  for (const [index, pageTables] of vectorWide.entries()) {
    assert.equal(pageTables.length,1); const table=pageTables[0];
    assert.equal(table.rows.length,6); assert.equal(table.rows[0].length,12);
    assert.equal(table.rows[0][0],index?'DEDUCTIONS':'EARNINGS');
    assert.equal(table.rows[0][6],index?'NET SALARY':'GROSS SALARY');
    assert.equal(table.rows[3][5],''); assert.equal(table.rows[5][0],'Total');
    assert.ok(table.rows[2][1].includes('Wrapped')&&table.rows[2][1].includes('label'));
    assert.ok(table.merges.some(merge=>merge.startRow===0&&merge.startColumn===0&&merge.endColumn===5));
    const groupEvidence=table.evidence[0][0];
    assert.ok(groupEvidence);
    assert.ok(Math.abs(groupEvidence.bbox.width-360/840)<.015,'Merged anchor evidence spans all six columns');
    for(let column=1;column<=5;column++) assert.equal(table.evidence[0][column],null,'Merged subordinate evidence is null');
  }
  const wideWorkbook=excel.createExcelWorkbook(vectorWide.map((pageTables,index)=>({id:`wide-${index}`,name:`Payroll ${index+1}`,pageStart:index+1,pageEnd:index+1,source:'native',rows:pageTables[0].rows.map(row=>row.map(excel.inferExcelCellValue)),merges:pageTables[0].merges,headerRows:pageTables[0].headerRows})));
  const wideZip=unzipSync(new Uint8Array(await wideWorkbook.arrayBuffer()));
  const wideSheet=strFromU8(wideZip['xl/worksheets/sheet1.xml']), wideStyles=strFromU8(wideZip['xl/styles.xml']);
  assert.match(wideSheet,/<mergeCell ref="A1:F1"\/>/); assert.match(wideSheet,/ySplit="2"/);
  assert.match(wideSheet,/Wrapped/); assert.match(wideSheet,/Total/); assert.match(wideStyles,/wrapText="1"/);
  const workbook=excel.createExcelWorkbook(native.tables); const xlsxBytes=new Uint8Array(await workbook.arrayBuffer()); fs.writeFileSync(path.join(output,'native-tables.xlsx'),xlsxBytes);
  const zip=unzipSync(xlsxBytes), workbookXml=strFromU8(zip['xl/workbook.xml']), sheetXml=strFromU8(zip['xl/worksheets/sheet1.xml']);
  assert.match(workbookXml,/name="Table 1"/); assert.match(sheetXml,/<v>25.5<\/v>/); assert.match(sheetXml,/Paper/); assert.match(sheetXml,/autoFilter/); assert.match(sheetXml,/state="frozen"/);
  assert.doesNotMatch(sheetXml,/sourceText|ocrConfidence|bbox|pdf-text|ocr-layout/, 'Provenance metadata must not leak into XLSX output');
  const csvBlob=excel.createTableCsv(native.tables[0]), csvBytes=new Uint8Array(await csvBlob.arrayBuffer()), csv=await csvBlob.text(); fs.writeFileSync(path.join(output,'native-table.csv'),csvBytes);
  assert.deepEqual(Array.from(csvBytes.slice(0,3)),[0xEF,0xBB,0xBF]);
  assert.equal(csv,'Item,Description,Amount\r\n1001,Paper,25.5\r\n1002,,8\r\n1003,Folders,12\r\n');
  for(const [source,expected] of [['22,960',22960],['34080',34080],['123.45',123.45],['1,234.50',1234.5],['-2500',-2500],['(2,500)',-2500],['0',0],['198323',198323],['2,569',2569]]) assert.equal(excel.inferExcelCellValue(source),expected);
  for(const source of ['0012','0660010002450009','18/81','245-9','BS-03','12-05-2023','12-05-2023 to 31-05-2023','C=A+B','A0 1246']) assert.equal(excel.inferExcelCellValue(source),source);
  assert.equal(excel.inferExcelCellValue('12345','Bank Account'),'12345');
  const semanticRows=[['Account','Amount','Decimal'],['0660010002450009',22960,1234.5],['',100,200]];
  const semanticTable={id:'semantic',name:'Semantic',pageStart:1,pageEnd:1,source:'native',rows:semanticRows};
  const semanticZip=unzipSync(new Uint8Array(await excel.createExcelWorkbook([semanticTable]).arrayBuffer()));
  const semanticSheet=strFromU8(semanticZip['xl/worksheets/sheet1.xml']),semanticStyles=strFromU8(semanticZip['xl/styles.xml']);
  assert.match(semanticSheet,/<c r="A2" t="inlineStr"><is><t>0660010002450009<\/t><\/is><\/c>/);
  assert.match(semanticSheet,/<c r="B2" s="2"><v>22960<\/v><\/c>/);
  assert.match(semanticSheet,/<c r="C2" s="3"><v>1234.5<\/v><\/c>/);
  assert.match(semanticSheet,/<c r="A3" t="inlineStr"><is><t><\/t><\/is><\/c><c r="B3" s="2"><v>100<\/v><\/c>/);
  assert.match(semanticStyles,/numFmtId="3"/);assert.match(semanticStyles,/#,##0\.##########/);
  const semanticCsv=await excel.createTableCsv(semanticTable).text();
  assert.equal(semanticCsv,'Account,Amount,Decimal\r\n0660010002450009,22960,1234.5\r\n,100,200\r\n');
  assert.equal(await excel.createTableCsv({...semanticTable,rows:[['Label','Value'],['North, East','say "yes"']]}).text(),'Label,Value\r\n"North, East","say ""yes"""\r\n');
  const ruled=canvas.createCanvas(900,500),ruledContext=ruled.getContext('2d');
  ruledContext.fillStyle='white';ruledContext.fillRect(0,0,900,500);
  ruledContext.strokeStyle='black';ruledContext.lineWidth=2;
  for(const x of [30,120,480,850]){ruledContext.beginPath();ruledContext.moveTo(x,50);ruledContext.lineTo(x,410);ruledContext.stroke();}
  for(const y of [50,140,230,320,410]){ruledContext.beginPath();ruledContext.moveTo(30,y);ruledContext.lineTo(850,y);ruledContext.stroke();}
  const word=(text,x,y,confidence=95)=>({text,x0:x,y0:y,x1:x+Math.max(20,text.length*9),y1:y+24,confidence});
  const ocrWordRows=[
    [word('Account',40,90,80),word('ID',96,90,100),word('Date',130,90),word('Amount',490,90)],
    [word('0660010002450009',40,180),word('12-05-2023',130,180),word('22,960',490,180)],
    [word('0002',40,270),word('13052023',130,270),word('1,234.50',490,270)],
    [word('Total',130,360),word('24,194.50',490,360)],
  ];
  const ocrLines=ocrWordRows.map(words=>({text:words.map(word=>word.text).join(' '),
    x0:Math.min(...words.map(word=>word.x0)),y0:Math.min(...words.map(word=>word.y0)),
    x1:Math.max(...words.map(word=>word.x1)),y1:Math.max(...words.map(word=>word.y1)),
    height:24,confidence:words.reduce((sum,word)=>sum+word.confidence,0)/words.length,words}));
  for(const degree of [0,90,180,270]){
    const correction=((360-degree)%360);
    const turned=rotateCanvas(ruled,degree),upright=rotateCanvas(turned,correction);
    const detected=extractScannedGridTables(upright,ocrLines,900,500);
    assert.equal(detected.length,1,'Ruled scanned grid at '+degree+' degrees');
    assert.equal(detected[0].rows.length,4);assert.equal(detected[0].rows[0].length,3);
    assert.equal(detected[0].rows[3][0],'');
    const typed=excel.scannedTableRows(detected[0]);
    assert.equal(typed[1][0],'0660010002450009');assert.equal(typed[1][2],22960);
    assert.equal(typed[2][1],'13052023');assert.equal(typed[2][2],1234.5);
    assert.equal(typed[3][0],'');assert.equal(typed[3][2],24194.5);
    const evidence=excel.scannedTableEvidence(detected[0],1,correction);
    const proofTable={id:'scan-'+degree,name:'Scan '+degree,pageStart:1,pageEnd:1,source:'ocr',
      method:'scanned-grid',rows:typed,evidence};
    assertEvidenceInvariant({tables:[proofTable],pageCount:1});
    assert.equal(evidence[1][2].sourceText,'22,960');
    assert.equal(evidence[2][2].sourceText,'1,234.50');
    assert.equal(evidence[2][2].ocrConfidence,95);
    assert.equal(evidence[0][0].ocrConfidence,(80*7+100*2)/9,
      'OCR confidence is character-weighted across contributing words');
    assert.equal(evidence[0][0].rotation,correction);
    assert.equal(evidence[3][0],null);
    if(turned!==ruled){turned.width=0;turned.height=0;upright.width=0;upright.height=0;}
  }
  const ocrLayoutWordRows=[
    [word('Account',40,90,80),word('ID',96,90,100),word('Date',300,90),word('Amount',650,90)],
    [word('0660010002450009',40,180),word('12-05-2023',300,180),word('22,960',650,180)],
    [word('0002',40,270),word('13052023',300,270),word('1,234.50',650,270)],
    [word('Total',300,360),word('24,194.50',650,360)],
  ];
  const ocrLayoutLines=ocrLayoutWordRows.map(words=>({text:words.map(word=>word.text).join(' '),
    x0:Math.min(...words.map(word=>word.x0)),y0:Math.min(...words.map(word=>word.y0)),
    x1:Math.max(...words.map(word=>word.x1)),y1:Math.max(...words.map(word=>word.y1)),
    height:24,confidence:words.reduce((sum,word)=>sum+word.confidence,0)/words.length,words}));
  const ocrLayoutPage=buildOcrWordPage(ocrLayoutLines,900,500,450,250);
  const ocrLayoutTable=ocrLayoutPage.blocks.find(block=>block.kind==='table');
  assert.ok(ocrLayoutTable,'Synthetic OCR layout table should be detected');
  const ocrLayout=excel.wordTableRowsWithEvidence(ocrLayoutTable,ocrLayoutPage,1,'ocr',90);
  assert.equal(ocrLayout.rows[1][2],22960);
  assert.equal(ocrLayout.evidence[1][2].sourceText,'22,960');
  assert.equal(ocrLayout.evidence[0][0].ocrConfidence,(80*7+100*2)/9);
  assert.equal(ocrLayout.evidence[0][0].rotation,90);
  assertEvidenceInvariant({tables:[{id:'ocr-layout',name:'OCR layout',pageStart:1,pageEnd:1,
    source:'ocr',method:'ocr-layout',rows:ocrLayout.rows,evidence:ocrLayout.evidence}],pageCount:1});
  assert.equal(extractScannedGridTables(canvas.createCanvas(900,500),ocrLines,900,500).length,0);
  if(process.argv.includes('--runtime')) {
    const worker=await tesseract.createWorker('eng',1,{cachePath:path.resolve('work/image-ocr-qa')});
    try {
      const {data}=await worker.recognize(path.join(output,'scanned.png'),{}, {blocks:true,text:true});
      const lines=recognitionLines(data), page=buildOcrWordPage(lines,1400,1000,700,500), table=page.blocks.find(block=>block.kind==='table');
      assert.ok(table,'Real OCR should preserve a regular scanned table'); assert.equal(table.rows.length,4); assert.equal(table.rows[0].length,3);
      assert.match(table.rows[1][1].map(lineText).join(' '),/Apples/i); assert.equal(table.rows[2][2].map(lineText).join(' '),'');
      const realOcr=excel.wordTableRowsWithEvidence(table,page,1,'ocr',0);
      const ocrRows=realOcr.rows;
      const ocrTable={id:'ocr',name:'OCR table',pageStart:1,pageEnd:1,source:'ocr',
        method:'ocr-layout',rows:ocrRows,evidence:realOcr.evidence};
      assertEvidenceInvariant({tables:[ocrTable],pageCount:1});
      const applesEvidence=ocrTable.evidence.flat().find(cell=>cell?.sourceText.match(/Apples/i));
      assert.ok(applesEvidence && applesEvidence.source==='ocr');
      assert.ok(Number.isFinite(applesEvidence.ocrConfidence));
      const ocrZip=unzipSync(new Uint8Array(await excel.createExcelWorkbook([ocrTable]).arrayBuffer()));
      const ocrSheet=strFromU8(ocrZip['xl/worksheets/sheet1.xml']);
      assert.match(ocrSheet,/<v>12<\/v>/);assert.match(ocrSheet,/Apples/);
      assert.equal((await excel.createTableCsv(ocrTable).text()).split('\r\n').length,5);
      console.log('PASS: real OCR reconstructed the scanned table with source geometry and actual confidence.');
    } finally { await worker.terminate(); }
  }
  console.log('PASS: native 3-column table, blank cell, multi-page continuation, no-table fallback, conservative numeric typing, XLSX and CSV exports.');
  console.log('PASS: vector-grid extraction of wide landscape tables, merged group headers, wrapped text, blank cells, total rows, stacked split cells, two-page payroll layout, and merged XLSX export.');
  console.log('PASS: source provenance for vector-grid, native layout, scanned-grid, OCR layout, numeric coercion, merged cells, rotations, and continuation pages.');
  console.log(JSON.stringify({output,nativeRows:native.tables[0].rows,multiPages:[multi.tables[0].pageStart,multi.tables[0].pageEnd],scannedFixture:path.join(output,'scanned.pdf')}));
})().catch(error=>{console.error(error);process.exitCode=1;});
