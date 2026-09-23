/** Browser-independent layout model. All coordinates are points, top-down. */
export interface WordSpan {
  text: string; x: number; y: number; width: number; size: number;
  font: string; bold: boolean; italic: boolean; underline?: boolean;
}
export interface WordLine {
  spans: WordSpan[]; x: number; right: number; y: number; size: number;
}
export interface WordRule { x0: number; y0: number; x1: number; y1: number }
export interface WordParagraph {
  kind: "paragraph" | "heading" | "signature";
  lines: WordLine[]; x: number; right: number; y: number; bottom: number;
  alignment: "left" | "center" | "right"; firstIndent: number; pitch: number;
  ocrConfidence?:number;
}
export interface WordTableSourceCell {
  sourceText: string;
  x: number; y: number; right: number; bottom: number;
  /** Character-weighted mean of contributing Tesseract word confidences. */
  ocrConfidence?: number;
}
export interface WordTable {
  kind: "table"; x: number; right: number; y: number; bottom: number;
  edges: number[]; rows: WordLine[][][]; rowHeights: number[];
  ruled: boolean; continuation?: boolean;
  /** Optional original OCR geometry; native tables retain geometry in spans. */
  sourceCells?: Array<Array<WordTableSourceCell | null>>;
}
export interface WordImage {kind:"image";x:number;right:number;y:number;bottom:number;data:Uint8Array}
export type WordBlock = WordParagraph | WordTable | WordImage;
export interface WordPage {
  width: number; height: number; left: number; right: number; top: number;
  blocks: WordBlock[];
  ocr?:boolean; ocrHeader?:string[]; ocrFooter?:string[];
}

export const median = (values: number[], fallback = 12) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : fallback;
};

export function clusterWordLines(spans: WordSpan[]): WordLine[] {
  // A strict comparator avoids non-transitive tolerance-based sorting.
  const sorted = spans.filter(s => s.text.trim() && Number.isFinite(s.x + s.y + s.width + s.size))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: WordLine[] = [];
  for (const span of sorted) {
    let line = lines[lines.length - 1];
    if (!line || Math.abs(line.y - span.y) > Math.max(1, Math.min(line.size, span.size) * .3)) {
      line = {spans: [], x: span.x, right: span.x, y: span.y, size: span.size};
      lines.push(line);
    }
    line.spans.push(span);
    line.x = Math.min(line.x, span.x);
    line.right = Math.max(line.right, span.x + span.width);
    line.size = Math.max(line.size, span.size);
  }
  for (const line of lines) line.spans.sort((a, b) => a.x - b.x);
  return lines;
}

/** Preserve split words/punctuation; replace genuine word gaps with one space. */
export function spanSeparator(previous: WordSpan, next: WordSpan): string {
  if (/\s$/.test(previous.text) || /^\s/.test(next.text)) return " ";
  const gap = next.x - previous.x - previous.width;
  if (gap < Math.min(previous.size, next.size) * .12) return "";
  if (/^[,.;:!?)}\]]/.test(next.text) || /[({\[]$/.test(previous.text)) return "";
  return " ";
}
export function lineText(line: WordLine): string {
  return line.spans.map((s, i) => (i ? spanSeparator(line.spans[i - 1], s) : "") + s.text.trim()).join("");
}

function mergeRules(rules: WordRule[], horizontal: boolean): WordRule[] {
  const candidates = rules.filter(r => horizontal ? Math.abs(r.y1-r.y0)<1.5 && r.x1-r.x0>3 : Math.abs(r.x1-r.x0)<1.5 && r.y1-r.y0>3)
    .sort((a,b) => horizontal ? a.y0-b.y0 || a.x0-b.x0 : a.x0-b.x0 || a.y0-b.y0);
  const bands: WordRule[][] = [];
  for (const rule of candidates) {
    const band = bands[bands.length-1];
    if (band && Math.abs((horizontal ? rule.y0 : rule.x0) - (horizontal ? band[0].y0 : band[0].x0)) < 1.5) band.push(rule);
    else bands.push([rule]);
  }
  return bands.flatMap(band => {
    band.sort((a,b) => horizontal ? a.x0-b.x0 : a.y0-b.y0);
    const merged: WordRule[] = [];
    for (const r of band) {
      const prev = merged[merged.length-1];
      if (prev && (horizontal ? r.x0-prev.x1 : r.y0-prev.y1) < 2) {
        prev.x1=Math.max(prev.x1,r.x1); prev.y1=Math.max(prev.y1,r.y1);
      } else merged.push({...r});
    }
    return merged;
  });
}

/** Closed regular grids only. Partial/merged cells fall back to readable prose. */
function ruledTables(spans: WordSpan[], rules: WordRule[]): {tables: WordTable[]; used: Set<WordSpan>} {
  const horizontal=mergeRules(rules,true), vertical=mergeRules(rules,false);
  const tables: WordTable[]=[]; const used=new Set<WordSpan>();
  // Group horizontal rules by common extent, so separate tables cannot join.
  const groups=new Map<string,WordRule[]>();
  for(const r of horizontal) {
    const key=`${Math.round(r.x0/3)}:${Math.round(r.x1/3)}`;
    const group=groups.get(key)??[]; group.push(r); groups.set(key,group);
  }
  for(const group of groups.values()) {
    group.sort((a,b)=>a.y0-b.y0);
    let active: WordTable | undefined;
    for(let i=0;i<group.length-1;i++) {
      const top=group[i], bottom=group[i+1];
      if(bottom.y0-top.y0<6) continue;
      const edges=vertical.filter(v=>v.y0<=top.y0+2 && v.y1>=bottom.y0-2 && v.x0>=top.x0-2 && v.x0<=top.x1+2).map(v=>v.x0).sort((a,b)=>a-b);
      if(edges.length<3 || edges.length>21 || Math.abs(edges[0]-top.x0)>3 || Math.abs(edges[edges.length-1]-top.x1)>3) { active=undefined; continue; }
      const inside=spans.filter(s=>!used.has(s) && s.y>top.y0 && s.y<=bottom.y0+1 && s.x>=top.x0-1 && s.x+s.width<=top.x1+2);
      const cells: WordSpan[][]=edges.slice(1).map(()=>[]);
      let crossing=false;
      for(const s of inside) {
        const col=edges.findIndex((e,c)=>c<edges.length-1 && s.x>=e-1 && s.x<edges[c+1]-1);
        if(col<0 || s.x+s.width>edges[col+1]+2) {crossing=true;break;}
        cells[col].push(s);
      }
      if(crossing || cells.filter(c=>c.length).length<2) {active=undefined;continue;}
      if(!active || Math.abs(active.bottom-top.y0)>3 || active.edges.length!==edges.length || edges.some((e,c)=>Math.abs(e-active!.edges[c])>3)) {
        active={kind:"table",x:edges[0],right:edges[edges.length-1],y:top.y0,bottom:bottom.y0,edges,rows:[],rowHeights:[],ruled:true};
        tables.push(active);
      }
      active.rows.push(cells.map(clusterWordLines)); active.rowHeights.push(bottom.y0-top.y0); active.bottom=bottom.y0;
      inside.forEach(s=>used.add(s));
    }
  }
  // A single boxed row could be a form/header. Require at least two real rows.
  const accepted=tables.filter(t=>t.rows.length>=2);
  const acceptedSpans=new Set(accepted.flatMap(t=>t.rows.flat(2).flatMap(l=>l.spans)));
  return {tables:accepted,used:acceptedSpans};
}

function segments(line: WordLine): WordLine[] {
  const out: WordLine[]=[];
  for(const span of line.spans) {
    const last=out[out.length-1];
    if(last && span.x-last.right<Math.max(14,line.size*1.5)) {last.spans.push(span);last.right=Math.max(last.right,span.x+span.width);}
    else out.push({...line,spans:[span],x:span.x,right:span.x+span.width});
  }
  return out;
}

/** Borderless tables need repeated column anchors, compact keys, and no crossing text. */
function borderlessTables(lines: WordLine[]): {tables: WordTable[]; used: Set<WordSpan>} {
  const tables: WordTable[]=[]; const used=new Set<WordSpan>();
  const segmented=lines.map(segments);
  for(let start=0;start<lines.length;start++) {
    const ref=segmented[start];
    if(ref.length<2 || ref.length>12) continue;
    const tol=Math.max(4,lines[start].size*.7);
    const anchors=ref.map(s=>s.x);
    const rows: WordLine[][][]=[]; let anchorCount=0, end=start, lastY=lines[start].y;
    for(;end<lines.length;end++) {
      const line=lines[end], parts=segmented[end];
      if(end>start && line.y-lastY>line.size*4) break;
      const cells: WordLine[][]=anchors.map(()=>[]);
      let invalid=false;
      for(const part of parts) {
        const c=anchors.findIndex((x,c)=>part.x>=x-tol && (c===anchors.length-1 || part.right<anchors[c+1]-tol));
        if(c<0) {invalid=true;break;} cells[c].push(part);
      }
      if(invalid) break;
      const populated=cells.filter(c=>c.length).length;
      const key=cells[0].map(lineText).join(' ');
      const isAnchor=populated===anchors.length && cells.every((c,k)=>Math.abs(c[0].x-anchors[k])<tol);
      if(isAnchor) {
        // Lists and parallel prose aren't tabular records. Two columns need
        // compact values, with a numeric value in the second column.
        if(key.length>24 || (anchors.length===2 && (!/\d/.test(cells[1].map(lineText).join(' ')) || cells[1].map(lineText).join(' ').length>24 || /^\(?\d+[.)]$/.test(key)))) break;
        rows.push(cells);anchorCount++;
      } else if(rows.length && !key && anchors.length>=3) {
        cells.forEach((cell,c)=>rows[rows.length-1][c].push(...cell));
      } else break;
      lastY=line.y;
    }
    if(anchorCount<3) continue;
    const tableSpans=rows.flat(2).flatMap(l=>l.spans);
    const right=Math.max(...tableSpans.map(s=>s.x+s.width));
    // Partition gutters midway between maximum text extent and next start.
    const edges=[anchors[0]-3,...anchors.slice(1).map((x,c)=>(x+Math.max(...rows.flatMap(r=>r[c].map(l=>l.right))))/2),right+3];
    const table:WordTable={kind:"table",x:edges[0],right:edges[edges.length-1],y:lines[start].y-lines[start].size,bottom:lastY+3,edges,rows,rowHeights:rows.map(r=>Math.max(...r.flat().map(l=>l.y))-Math.min(...r.flat().map(l=>l.y))+lines[start].size*1.3),ruled:false};
    tables.push(table);tableSpans.forEach(s=>used.add(s)); start=end-1;
  }
  return {tables,used};
}

function proseBlocks(lines: WordLine[], left: number, right: number): WordParagraph[] {
  const blocks: WordParagraph[]=[];
  const width=right-left;
  const bodySize=median(lines.map(l=>l.size));
  const pitches=new Map<number,number>();
  for(let i=1;i<lines.length;i++) {
    const gap=lines[i].y-lines[i-1].y;
    if(gap>bodySize*.7 && gap<bodySize*3) {const k=Math.round(gap*2)/2;pitches.set(k,(pitches.get(k)??0)+1);}
  }
  const pitch=[...pitches].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0]?.[0]??bodySize*1.2;
  const emphasis=(l:WordLine)=>l.spans.filter(s=>s.bold||s.underline).reduce((n,s)=>n+s.text.length,0)/Math.max(1,lineText(l).length)>.6;
  for(let i=0;i<lines.length;i++) {
    const line=lines[i],prev=lines[i-1],next=lines[i+1];
    const gap=prev?line.y-prev.y:Infinity;
    const short=line.right-line.x<width*.68;
    const centered=short && (emphasis(line)||lineText(line).length<48) && Math.abs((line.x+line.right-left-right)/2)<bodySize;
    const rightBlock=short && line.x>left+width*.52;
    const kind:WordParagraph['kind']=rightBlock?'signature':emphasis(line)?'heading':'paragraph';
    const alignment=rightBlock?'right':centered?'center':'left';
    const last=blocks[blocks.length-1];
    const typical=last?.pitch??bodySize*1.25;
    const indented=line.x-left>bodySize*1.3;
    const indentStart=indented && prev && line.x-prev.x>bodySize*1.3 && kind==='paragraph';
    const shortEnd=prev && prev.right-prev.x<width*.75 && /[.!?:]$/.test(lineText(prev));
    const addressLine=short && ((next && Math.abs(line.x-next.x)<bodySize && next.y-line.y<bodySize*1.5) || (prev && prev.right-prev.x<width*.68 && Math.abs(line.x-prev.x)<bodySize && gap<bodySize*1.5));
    const list=/^(?:[•\u2022-]\s|\(?\d{1,3}[.)]\s|\(?[a-zivx]{1,5}[.)]\s)/i.test(lineText(line));
    const newBlock=!last || gap>Math.max(typical*1.4,bodySize*1.7) || kind!==last.kind || alignment!==last.alignment || indentStart || list || addressLine || kind==='signature' || (shortEnd && kind==='paragraph') || Math.abs(line.size-(prev?.size??line.size))>bodySize*.15;
    if(newBlock) {
      const nextGap=next?next.y-line.y:0;
      const localPitch=nextGap>line.size*.8 && nextGap<line.size*2.7 ? nextGap : Math.min(pitch,line.size*1.2);
      blocks.push({kind,alignment,lines:[line],x:line.x,right:line.right,y:line.y-line.size,bottom:line.y,firstIndent:0,pitch:localPitch});
    } else {
      last.lines.push(line);last.x=Math.min(last.x,line.x);last.right=Math.max(last.right,line.right);last.bottom=line.y;
      last.pitch=median(last.lines.slice(1).map((l,j)=>l.y-last.lines[j].y),line.size*1.2);
    }
  }
  for(const block of blocks) {
    if(block.alignment==='left') {
      block.firstIndent=block.lines[0].x-block.x;
      // Single indented narrative lines retain their real left offset.
    }
  }
  return blocks;
}

export function buildWordPage(spans: WordSpan[], rules: WordRule[], width: number, height: number): WordPage {
  const usable=spans.filter(s=>s.text.trim());
  const lines=clusterWordLines(usable);
  const left=usable.length?Math.max(0,Math.min(...usable.map(s=>s.x))-1):72;
  const right=usable.length?Math.min(width,Math.max(...usable.map(s=>s.x+s.width))+2):width-72;
  const ruled=ruledTables(usable,rules);
  const remaining=usable.filter(s=>!ruled.used.has(s));
  const borderless=borderlessTables(clusterWordLines(remaining));
  const tables=[...ruled.tables,...borderless.tables].sort((a,b)=>a.y-b.y);
  const prose=clusterWordLines(remaining.filter(s=>!borderless.used.has(s)));
  const blocks:WordBlock[]=[];
  let lineIndex=0;
  for(const table of tables) {
    const before:WordLine[]=[];
    while(lineIndex<prose.length && prose[lineIndex].y<table.y) before.push(prose[lineIndex++]);
    blocks.push(...proseBlocks(before,left,right),table);
  }
  blocks.push(...proseBlocks(prose.slice(lineIndex),left,right));
  return {width,height,left:Math.min(left,...tables.map(t=>t.x)),right:Math.max(right,...tables.map(t=>t.right)),top:Math.max(0,(lines[0]?.y??84)-(lines[0]?.size??12)),blocks};
}

/** Mark only adjacent edge-of-page segments with equal geometry and sequential keys. */
export function markTableContinuations(pages: WordPage[]): void {
  for(let i=1;i<pages.length;i++) {
    const prev=pages[i-1],next=pages[i];
    const a=prev.blocks[prev.blocks.length-1],b=next.blocks[0];
    if(a?.kind!=='table'||b?.kind!=='table'||a.edges.length!==b.edges.length||a.bottom<prev.height*.78||b.y>next.height*.18) continue;
    const key=(r:WordLine[][])=>Number.parseInt(r[0].map(lineText).join(''),10);
    if(key(b.rows[0])!==key(a.rows[a.rows.length-1])+1) continue;
    if(a.edges.every((x,c)=>Math.abs(x/prev.width-b.edges[c]/next.width)<.008)) b.continuation=true;
  }
}
