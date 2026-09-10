import type { PDFPageProxy } from "pdfjs-dist";
import { buildWordPage, type WordRule, type WordSpan } from "./word-layout";

type Matrix = number[];
const multiply=(a:Matrix,b:Matrix):Matrix=>[
  a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
  a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5],
];
const point=(m:Matrix,x:number,y:number)=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]});
type OperatorList={fnArray:number[];argsArray:unknown[][]};

/** PDF.js 5.x compact paths: ignore clipping and curves; inspect painted rules only. */
export function extractWordRules(ops:OperatorList, codes:Record<string,number>, viewport:Matrix):WordRule[] {
  let ctm:Matrix=[1,0,0,1,0,0]; const stack:Matrix[]=[]; const rules:WordRule[]=[];
  const add=(x0:number,y0:number,x1:number,y1:number)=>{
    const m=multiply(viewport,ctm),a=point(m,x0,y0),b=point(m,x1,y1);
    if(Math.abs(a.x-b.x)<1.5||Math.abs(a.y-b.y)<1.5) rules.push({x0:Math.min(a.x,b.x),y0:Math.min(a.y,b.y),x1:Math.max(a.x,b.x),y1:Math.max(a.y,b.y)});
  };
  for(let i=0;i<ops.fnArray.length && i<200_000 && rules.length<4_000;i++) {
    const code=ops.fnArray[i],args=ops.argsArray[i];
    if(code===codes.save) stack.push([...ctm]);
    else if(code===codes.restore) ctm=stack.pop()??[1,0,0,1,0,0];
    else if(code===codes.transform) ctm=multiply(ctm,args as number[]);
    else if(code===codes.constructPath) {
      const paint=args[0] as number;
      if(paint===codes.endPath) continue;
      const filled=[codes.fill,codes.eoFill,codes.fillStroke,codes.eoFillStroke].includes(paint);
      const stroked=[codes.stroke,codes.closeStroke,codes.fillStroke,codes.eoFillStroke].includes(paint);
      const paths=args[1] as ArrayLike<number>[];
      if(!Array.isArray(paths)) continue;
      for(const path of paths) {
        const p=Array.from(path);
        // Thin filled rectangles are how office PDFs encode underlines/borders.
        if(filled && p.length===13 && p[0]===0 && p[3]===1 && p[6]===1 && p[9]===1 && p[12]===4) {
          const xs=[p[1],p[4],p[7],p[10]],ys=[p[2],p[5],p[8],p[11]];
          const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
          if(y1-y0<=2 && x1-x0>3) add(x0,(y0+y1)/2,x1,(y0+y1)/2);
          if(x1-x0<=2 && y1-y0>3) add((x0+x1)/2,y0,(x0+x1)/2,y1);
        }
        if(!stroked) continue;
        let cursor=0,x=0,y=0,sx=0,sy=0;
        while(cursor<p.length) {
          const op=p[cursor++];
          if(op===0) {x=sx=p[cursor++];y=sy=p[cursor++];}
          else if(op===1) {const nx=p[cursor++],ny=p[cursor++];add(x,y,nx,ny);x=nx;y=ny;}
          else if(op===2) {cursor+=4;x=p[cursor++];y=p[cursor++];}
          else if(op===3) {cursor+=2;x=p[cursor++];y=p[cursor++];}
          else if(op===4) {add(x,y,sx,sy);x=sx;y=sy;}
          else break;
        }
      }
    }
  }
  return rules;
}

export async function extractWordPage(page:PDFPageProxy, textContent?:Awaited<ReturnType<PDFPageProxy['getTextContent']>>) {
  const text=textContent??await page.getTextContent();
  const viewport=page.getViewport({scale:1});
  const pdfjs=await import('pdfjs-dist');
  // Loading operators resolves font names and supplies ruling lines. No rasterization.
  const ops=await page.getOperatorList();
  const rules=extractWordRules(ops,pdfjs.OPS,viewport.transform);
  // Grid borders touch vertical rules; they are not text decoration.
  const underlines=rules.filter(r=>Math.abs(r.y1-r.y0)<1 && !rules.some(v=>
    Math.abs(v.x1-v.x0)<1.5 && v.y1-v.y0>4 && v.x0>=r.x0-2 && v.x0<=r.x1+2 && v.y0<=r.y0+2 && v.y1>=r.y0-2));
  const spans:WordSpan[]=[];
  const fontCache=new Map<string,{font:string;bold:boolean;italic:boolean}>();
  for(const item of text.items) {
    if(!('str' in item) || !item.str.trim()) continue;
    let font=fontCache.get(item.fontName);
    if(!font) {
      let name=text.styles[item.fontName]?.fontFamily??'Arial';
      let bold=false,italic=false;
      try {
        const resolved=page.commonObjs.get(item.fontName);
        name=resolved?.name??name;bold=Boolean(resolved?.bold);italic=Boolean(resolved?.italic);
      } catch { /* Font can be unavailable for malformed/nonstandard PDFs. */ }
      bold ||= /bold|black|heavy|semibold|demi/i.test(name);
      italic ||= /italic|oblique/i.test(name);
      const family=name.replace(/^[A-Z]{6}\+/,'').replace(/[,\-](?:Bold|Italic|Oblique|Regular|Roman|PSMT).*$/i,'');
      font={font:family==='sans-serif'?'Arial':family==='serif'?'Times New Roman':family,bold,italic};
      fontCache.set(item.fontName,font);
    }
    const m=multiply(viewport.transform,item.transform);
    const size=Math.hypot(m[2],m[3])||Math.hypot(m[0],m[1])||12;
    const scale=viewport.scale*(page.userUnit||1);
    const span:WordSpan={text:item.str,x:m[4],y:m[5],width:Math.abs(item.width*scale),size,...font};
    span.underline=underlines.some(r=>r.y0-span.y>=-.5 && r.y0-span.y<size*.3 && r.x0<=span.x+2 && r.x1>=span.x+span.width-2 && r.x1-r.x0<viewport.width*.95);
    spans.push(span);
  }
  return buildWordPage(spans,rules,viewport.width,viewport.height);
}
