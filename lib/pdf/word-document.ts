import {Document,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,TableLayoutType,BorderStyle,LineRuleType,SectionType,ImageRun,Header,Footer} from 'docx';
import {markTableContinuations,spanSeparator,type WordLine,type WordPage,type WordParagraph,type WordTable} from './word-layout';

const twips=(points:number)=>Math.max(0,Math.round(points*20));
function runs(lines:WordLine[]):TextRun[] {
  const out:TextRun[]=[];
  lines.forEach((line,j)=>line.spans.forEach((span,i)=>{
    const separator=i?spanSeparator(line.spans[i-1],span):j?' ':'';
    out.push(new TextRun({text:separator+span.text.trim(),font:span.font,size:Math.round(Math.min(144,Math.max(4,span.size))*2),bold:span.bold,italics:span.italic,underline:span.underline?{}:undefined}));
  }));
  return out;
}

function paragraph(block:WordParagraph,page:WordPage,before:number):Paragraph {
  return new Paragraph({
    children:runs(block.lines),alignment:block.alignment,
    run:page.ocr?{size:Math.round(block.lines[0].size*2)}:undefined,
    indent:{left:block.alignment==='right'?0:twips(block.x-page.left),right:block.alignment==='left'?0:twips(page.right-block.right),firstLine:twips(block.firstIndent)},
    spacing:{before:twips(before),after:0,line:twips(page.ocr?block.pitch:block.lines.length===1?block.lines[0].size*1.15:Math.max(block.pitch,block.lines[0].size*1.15)),lineRule:page.ocr?LineRuleType.EXACT:LineRuleType.AT_LEAST},
    keepNext:block.kind==='heading',widowControl:!page.ocr,
  });
}
function table(block:WordTable,page:WordPage):Table {
  const widths=block.edges.slice(1).map((e,c)=>twips(e-block.edges[c]));
  return new Table({
    width:{size:twips(block.right-block.x),type:WidthType.DXA},columnWidths:widths,layout:TableLayoutType.FIXED,
    indent:{size:twips(block.x-page.left),type:WidthType.DXA},
    borders:Object.fromEntries(['top','bottom','left','right','insideHorizontal','insideVertical'].map(k=>[k,{style:block.ruled?BorderStyle.SINGLE:BorderStyle.NONE,size:4,color:'808080'}])),
    rows:block.rows.map((row)=>new TableRow({
      cantSplit:true,
      children:row.map((lines,c)=>new TableCell({
        width:{size:widths[c],type:WidthType.DXA},
        margins:{top:0,bottom:0,left:twips(Math.min(5,(block.edges[c+1]-block.edges[c])*.12)),right:twips(Math.min(5,(block.edges[c+1]-block.edges[c])*.12))},
        children:[new Paragraph({children:runs(lines),spacing:{before:0,after:0,line:twips(Math.max(10,...lines.map(l=>l.size*1.15))),lineRule:LineRuleType.AT_LEAST},widowControl:false})],
      })),
    })),
  });
}

/** Native sections preserve source pages; continuation segments share real column widths. */
export function createWordDocument(pages:WordPage[]):Document {
  markTableContinuations(pages);
  return new Document({
    styles:{default:{document:{run:{font:'Arial',size:24},paragraph:{spacing:{after:0}}}}},
    sections:pages.map((page,pageIndex)=>{
      // Clear inherited OCR margins on a following native page in mixed PDFs.
      const hasOcrMargins=page.ocr || pages.slice(0,pageIndex).some(p=>p.ocr);
      const children:(Paragraph|Table)[]=[];
      let previousBottom=page.top;
      let previousLeading=0;
      page.blocks.forEach((block,i)=>{
        const before=i===0?Math.max(0,block.y-page.top):Math.max(0,block.y-previousBottom-previousLeading);
        if(block.kind==='image') {
          children.push(new Paragraph({run:{size:2},indent:{left:twips(block.x-page.left)},spacing:{before:twips(before),after:0,line:twips(block.bottom-block.y+2),lineRule:LineRuleType.AT_LEAST},children:[new ImageRun({type:'png',data:block.data,transformation:{width:(block.right-block.x)*96/72,height:(block.bottom-block.y)*96/72}})]}));
        } else if(block.kind==='table') {
          if(before>0) children.push(new Paragraph({spacing:{before:0,after:0,line:twips(before),lineRule:LineRuleType.EXACT},children:[]}));
          children.push(table(block,page));
        } else children.push(paragraph(block,page,before));
        previousBottom=block.bottom;
        previousLeading=block.kind==='table'||block.kind==='image'?0:Math.max(0,(page.ocr?block.pitch:block.lines.length===1?block.lines[0].size*1.15:block.pitch)-block.lines[block.lines.length-1].size);
      });
      const marginParagraph=(text:string)=>new Paragraph({children:[new TextRun({text,font:'Arial',size:16})],alignment:'center'});
      const emptyMargin=()=>new Paragraph({run:{size:2},spacing:{line:20,lineRule:LineRuleType.EXACT},children:[]});
      return {headers:hasOcrMargins?{default:new Header({children:page.ocrHeader?.length?page.ocrHeader.map(marginParagraph):[emptyMargin()]})}:undefined,footers:hasOcrMargins?{default:new Footer({children:page.ocrFooter?.length?page.ocrFooter.map(marginParagraph):[emptyMargin()]})}:undefined,properties:{type:SectionType.NEXT_PAGE,page:{size:{width:twips(page.width),height:twips(page.height)},margin:{header:hasOcrMargins?twips(page.ocrHeader?.length?18:0):undefined,footer:hasOcrMargins?twips(page.ocr?12:0):undefined,left:twips(page.left),right:twips(page.width-page.right),top:twips(page.top),bottom:twips(Math.min(24,Math.max(6,page.height-previousBottom-12)))}}},children:children.length?children:[new Paragraph('')]};
    }),
  });
}
