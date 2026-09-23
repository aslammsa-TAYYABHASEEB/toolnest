import type { Page as TesseractPage } from 'tesseract.js';
import {median, lineText, type WordPage, type WordParagraph} from './word-layout';
import {partitionOcrLinesIntoBlocks} from './table-detection';

export interface OcrLayoutLine {
  text:string; x0:number; y0:number; x1:number; y1:number;
  confidence:number; height:number;
  words:{text:string;x0:number;y0:number;x1:number;y1:number;confidence:number}[];
}

/** Retain geometry; LSTM does not supply trustworthy bold/italic font flags. */
export function recognitionLines(data:Pick<TesseractPage,'blocks'>):OcrLayoutLine[] {
  return (data.blocks??[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.map(l=>({
    text:l.text.replace(/\s+/g,' ').trim(),...l.bbox,confidence:l.confidence,
    height:l.rowAttributes?.rowHeight || l.bbox.y1-l.bbox.y0,
    words:l.words.map(w=>({text:w.text.trim(),...w.bbox,confidence:w.confidence})),
  })))).filter(l=>l.text && Number.isFinite(l.x0+l.x1+l.y0+l.y1) && l.x1>l.x0 && l.y1>l.y0)
    .sort((a,b)=>a.y0-b.y0 || a.x0-b.x0);
}

/** A narrow cluster of uncertain marks plus oversized display lettering is a
 * decorative masthead, not legal prose. Preserve the whole band as pixels.
 * No document names, recognized words, or fixture coordinates are used. */
export function decorativeBand(lines:OcrLayoutLine[],width:number,height:number):number | undefined {
  const top=lines.filter(l=>l.y1<height*.23 && l.y0>height*.025);
  const marks=top.filter(l=>l.confidence<65 && l.x1-l.x0<width*.2 && Math.abs((l.x0+l.x1)/2-width/2)<width*.1);
  const typical=median(lines.filter(l=>l.y0>height*.25).map(l=>l.height),30);
  const display=top.find(l=>l.height>typical*2 && l.x1-l.x0>width*.35);
  if(marks.length<3 || !display) return;
  // Include complete nearby caption/date lines; never bisect their glyphs.
  return Math.max(...lines.filter(l=>l.y0<height*.25).map(l=>l.y1))+typical*.5;
}

/** OCR alone uses measured line placement. Native PDF layout is untouched.
 * Individual editable line paragraphs avoid inventing line joins in legal text. */
export function buildOcrWordPage(lines:OcrLayoutLine[],pixelWidth:number,pixelHeight:number,width:number,height:number):WordPage {
  const sx=width/pixelWidth,sy=height/pixelHeight;
  const usable=lines.filter(l=>!/^[\s|_—–\-~.]+$/.test(l.text));
  const body=usable.filter(l=>l.y0>pixelHeight*.25 && l.y1<pixelHeight*.85 && l.text.length>60);
  const bounds=body.length?body:usable;
  const left=bounds.length?Math.max(0,Math.min(...bounds.map(l=>l.x0))*sx-3):36;
  const right=bounds.length?Math.min(width,Math.max(...bounds.map(l=>l.x1))*sx+5):width-36;
  const bodySize=median(body.map(l=>l.height*sy),10);
  const page:WordPage={width,height,left,right,top:usable.length?Math.max(6,usable[0].y0*sy):36,blocks:[],ocr:true};
  usable.forEach((l,i)=>{
    const x=l.x0*sx,r=l.x1*sx,y=l.y0*sy;
    const closing=x>left+(right-left)*.6 && l.text.length<50;
    const caps=/[A-Z]{3}/.test(l.text) && !/[a-z]/.test(l.text);
    const centered=Math.abs((x+r-left-right)/2)<bodySize*1.6 && r-x<right-left-12 && (caps || (l.text.length<45 && y<height*.6 && x>left+(right-left)*.25));
    const heading=centered && (caps || l.height*sy>bodySize*1.3);
    const size=Math.max(5,Math.min(28,l.height*sy*.94));
    const next=usable[i+1];
    const pitch=next?Math.max(size,Math.min(size*1.3,(next.y0-l.y0)*sy)):size*1.15;
    // Retain Tesseract word boundaries, including clear spaces lost by flat text.
    const words=l.words.filter(w=>w.text);
    const text=words.length?words.map(w=>w.text).join(' '):l.text;
    const block:WordParagraph={kind:heading?'heading':closing?'signature':'paragraph',alignment:centered?'center':'left',ocrConfidence:l.confidence,
      x:centered?left:x,right:centered?right:r,y,bottom:y+size,firstIndent:0,pitch,
      lines:[{x,right:r,y:y+size,size,spans:[{text,x,y:y+size,width:r-x,size,font:'Arial',bold:heading,italic:false}]}]};
    // A numbered lead-in ending at an explicit sentence/dash boundary is a
    // structural heading; emphasize that prefix, never the following clause.
    const prefix=text.match(/^[“"‘]?\d{1,3}\.\s+.{1,110}?(?:[—–]|\.(?=\s|$))/)?.[0];
    if(prefix && !heading) {
      const span=block.lines[0].spans[0],ratio=prefix.length/text.length;
      block.lines[0].spans=[{...span,text:prefix,width:span.width*ratio,bold:true},
        {...span,text:text.slice(prefix.length),x:x+span.width*ratio,width:span.width*(1-ratio)}].filter(s=>s.text);
    }
    page.blocks.push(block);
  });
  // Keep the established conservative OCR table detector. List markers are
  // deliberately excluded as column keys, so nested clauses remain prose.
  const tableInput=usable.map(l=>({...l,words:/^[“"‘]?\(?[a-z\d]{1,3}[.)]\s/i.test(l.text)?[{text:l.text,x0:l.x0,x1:l.x1,confidence:l.confidence}]:l.words}));
  const partitions=partitionOcrLinesIntoBlocks(tableInput);
  for(const part of partitions) {
    if(part.kind==='prose') continue;
    const consumed=part.lines;
    if(!consumed.length) continue;
    const source=part.table,pixelEdges=[...source.columnXs,source.tableRight],edges=pixelEdges.map(x=>x*sx);
    const top=consumed[0].y0*sy,bottom=consumed[consumed.length-1].y1*sy;
    const size=median(consumed.map(l=>(l.y1-l.y0)*sy*.94),10);
    const rowHeight=(bottom-top)/source.rows.length;
    const rows=source.rows.map((cells,r)=>cells.map((text,c)=>[{x:edges[c]+2,right:edges[c+1]-2,y:top+r*rowHeight+size,size,spans:[{text,x:edges[c]+2,y:top+r*rowHeight+size,width:edges[c+1]-edges[c]-4,size,font:'Arial',bold:false,italic:false}]}]));
    const sourceCells=source.rows.map((cells,r)=>cells.map((sourceText,c)=>{
      if(!sourceText) return null;
      const line=consumed[r];
      const words=line.words.filter(word=>{
        const center=(word.x0+word.x1)/2;
        return center>=pixelEdges[c] && center<=pixelEdges[c+1];
      });
      if(!words.length) return null;
      const weight=words.reduce((sum,word)=>sum+Math.max(1,word.text.trim().length),0);
      return {sourceText,x:Math.min(...words.map(word=>word.x0))*sx,
        y:Math.min(...words.map(word=>word.y0??line.y0))*sy,
        right:Math.max(...words.map(word=>word.x1))*sx,
        bottom:Math.max(...words.map(word=>word.y1??line.y1))*sy,
        ocrConfidence:words.reduce((sum,word)=>sum+word.confidence*Math.max(1,word.text.trim().length),0)/weight};
    }));
    page.blocks=page.blocks.filter(b=>b.y<top-.01 || b.y>bottom);
    page.blocks.push({kind:'table',x:edges[0],right:edges[edges.length-1],y:top,bottom,edges,rows,rowHeights:rows.map(()=>rowHeight),ruled:true,sourceCells});
  }
  page.blocks.sort((a,b)=>a.y-b.y);
  return page;
}

/** Fit only OCR text to its measured scan width, using the actual local font.
 * No extra OCR pass or dictionary substitution is required. */
export function fitOcrText(page:WordPage,measure:(text:string,size:number,bold:boolean)=>number):void {
  for(const b of page.blocks) {
    if(b.kind==='table'||b.kind==='image') continue;
    const l=b.lines[0],s=l.spans[0];
    const measured=l.spans.reduce((n,s)=>n+measure(s.text,s.size,s.bold),0);
    const width=l.right-l.x;
    const size=measured>0?Math.max(4,Math.floor(Math.min(s.size,s.size*width/measured*.97)*2)/2):s.size;
    l.spans.forEach(s=>{s.size=size;});
    l.size=size;b.bottom=b.y+size;b.pitch=size*1.15;
  }
}

const marginKey=(s:string)=>s.toLowerCase().replace(/\d+/g,'#').replace(/[^a-z#]/g,'');

/** Repeated margin text moves to real Word headers/footers, not deletion.
 * Unique margin content is retained. Isolated printing-price metadata is a
 * footer only when separated from the body by substantial whitespace. */
export function finalizeOcrPages(pages:WordPage[]):void {
  const occurrences=new Map<string,Set<number>>();
  const candidates=pages.flatMap((p,i)=>!p.ocr?[]:p.blocks.flatMap(b=>{
    if(b.kind==='table'||b.kind==='image') return [];
    const region=b.y<p.height*.09?'header':b.y>p.height*.88?'footer':undefined;
    if(!region) return [];
    const text=b.lines.map(lineText).join(' '),key=region+':'+marginKey(text);
    const seen=occurrences.get(key)??new Set<number>();seen.add(i);occurrences.set(key,seen);
    return [{page:p,block:b,region,key,text}] as const;
  }));
  for(const c of candidates) {
    const isolatedPrice=c.region==='footer' && /^price\s+(?:rs\.?|[$£€])/i.test(c.text) && !c.page.blocks.some(b=>b!==c.block && b.bottom<c.block.y && c.block.y-b.bottom<c.page.height*.08);
    if((occurrences.get(c.key)?.size??0)<2 && !isolatedPrice) continue;
    const list=c.region==='header'?(c.page.ocrHeader??=[]):(c.page.ocrFooter??=[]);
    list.push(c.text);c.page.blocks=c.page.blocks.filter(b=>b!==c.block);
    if(c.region==='header') c.page.blocks=c.page.blocks.filter(b=>b.kind==='table'||b.kind==='image'||!(b.y>=c.block.y && b.y<c.page.height*.09 && (b.ocrConfidence??100)<45 && b.right-b.x>c.page.width*.6 && b.lines.map(lineText).join('').length<30));
  }
  for(const p of pages.filter(p=>p.ocr)) {
    // Empty headers must not consume the first page's masthead space.
    p.top=p.blocks.some(b=>b.kind==='image'&&b.y===0)?0:Math.max(p.ocrHeader?.length?48:6,Math.min(...p.blocks.map(b=>b.y),36));
  }
}
