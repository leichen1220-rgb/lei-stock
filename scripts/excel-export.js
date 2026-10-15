/* Browser export adapter. Only signed-in ledger data is passed in by the app. */
(function(root){
 'use strict';
 const HEADERS=['輸入','代號','股票名稱','股數','總股數','交易別','成交價','手續費＆交易稅','付出\n成本','成交/除權息日','股數x\n成交價','匯費','股息(每股)','實領\n收入','支出\n+收入','每股成本(含收入)','入賬\n時間','狀態','收盤價','累計損益','希望價\n損益','當次獲利','總付出\n成本','每股成本(不含股息)','自我研究','交易\n年','交易\n月','篩選用\n總股數','收入總額','已確認入帳','備註','交易序號','交易 ID','報價日期','實際交易費用','配息股數（記錄）','每股配息（記錄）','實際賣出實收','交易金額依據'];
 const present=v=>v!==null&&v!==undefined&&v!=='';
 const serialDate=value=>value?Math.floor((Date.parse(value+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000):null;
 function ordered(rows){return rows.map((t,i)=>({t,i})).sort((a,b)=>(Number(a.t.sequence_no)>0?Number(a.t.sequence_no):Infinity)-(Number(b.t.sequence_no)>0?Number(b.t.sequence_no):Infinity)||String(a.t.trade_date).localeCompare(String(b.t.trade_date))||a.i-b.i).map(x=>x.t);}
 function buildWorkbook(data,XLSX){
  const wb=XLSX.utils.book_new(),rows=ordered(data.trades),nameMap=new Map(data.tickers.map(t=>[t.ticker,t.display_name])),quotes=new Map(data.quotes.map(q=>[q.ticker,q]));
  const totals=new Map(),last=new Map();rows.forEach((t,i)=>{if(['現股','股票股利'].includes(t.transaction_type))totals.set(t.ticker,(totals.get(t.ticker)||0)+Number(t.quantity||0));last.set(t.ticker,i);});
  const ws=XLSX.utils.aoa_to_sheet([HEADERS]),states=new Map();
  function put(col,r,value,formula,format){if(!present(value)&&!formula)return;const cell={t:typeof value==='number'?'n':typeof value==='boolean'?'b':'s',v:value??''};if(formula)cell.f=formula;if(format)cell.z=format;ws[col+r]=cell;}
  const num='#,##0.##;-#,##0.##',profit='[Red]#,##0.##;[Green]-#,##0.##',day='yyyy-mm-dd';
  rows.forEach((t,i)=>{
   const r=i+2,kind=t.transaction_type,income=['現金股息','借券收入'].includes(kind),q=income?0:Number(t.quantity||0),price=kind==='現股'&&present(t.price)?Number(t.price):null,fee=kind==='現股'&&present(t.trade_fees)?Number(t.trade_fees):null,gross=present(t.dividend_gross)?Number(t.dividend_gross):null,wire=present(t.wire_fee)?Number(t.wire_fee):null;
   const st=states.get(t.ticker)||{quantity:0,paid:0,dividend:0,lending:0,invalid:false};st.quantity+=q;
   let paid=null;
   if(kind==='現股'){
    paid=q>0&&present(t.paid_cost)?Number(t.paid_cost):q<0&&present(t.sale_net_received)?-Number(t.sale_net_received):price!==null&&fee!==null?q*price+fee:null;
    if(paid===null||!Number.isFinite(paid))st.invalid=true;else st.paid+=paid;
   }
   const netDividend=income&&gross!==null?gross-(wire??0):null;if(netDividend!==null){if(kind==='借券收入')st.lending+=netDividend;else st.dividend+=netDividend;}
   states.set(t.ticker,st);const balance=-st.paid+st.dividend+st.lending,isLast=last.get(t.ticker)===i,quote=quotes.get(t.ticker),finalQty=totals.get(t.ticker)||0;
   put('A',r,t.ticker,null,'@');put('B',r,t.ticker,null,'@');put('C',r,nameMap.get(t.ticker)||'');put('D',r,income?null:q,null,num);
   put('E',r,st.quantity,'SUMIF($B$2:B'+r+',B'+r+',$D$2:D'+r+')',num);put('F',r,kind);put('G',r,price,null,num);
   put('H',r,kind==='現股'&&q<0&&present(t.sale_net_received)?fee:paid===null?null:paid-q*(price??0),kind==='現股'&&q<0&&present(t.sale_net_received)?null:'IF(F'+r+'="現股",IF(ISNUMBER(I'+r+'),I'+r+'-K'+r+',""),"")',num);
   put('I',r,paid,null,num);put('J',r,serialDate(t.trade_date),null,day);
   put('K',r,kind==='現股'?q*(price??0):null,'IF(F'+r+'="現股",D'+r+'*G'+r+',"")',num);put('L',r,wire,null,num);
   const rate=kind==='現金股息'?(present(t.dividend_per_share)?Number(t.dividend_per_share):gross!==null?(Number(t.dividend_eligible_shares)>0?gross/Number(t.dividend_eligible_shares):st.quantity>0?gross/st.quantity:null):null):null;
   put('M',r,rate,'IF(F'+r+'="現金股息",IF(ISNUMBER(AK'+r+'),AK'+r+',IF(AJ'+r+'>0,AC'+r+'/AJ'+r+',IF(E'+r+'>0,AC'+r+'/E'+r+',""))),"")','0.######');
   put('N',r,netDividend,'IF(OR(F'+r+'="現金股息",F'+r+'="借券收入"),AC'+r+'-IF(L'+r+'="",0,L'+r+'),"")',num);
   const missing='COUNTIFS($B$2:B'+r+',B'+r+',$F$2:F'+r+',"現股",$I$2:I'+r+',"")>0';
   put('O',r,st.invalid?'待補成本':balance,'IF('+missing+',"待補成本",-SUMIF($B$2:B'+r+',B'+r+',$I$2:I'+r+')+SUMIF($B$2:B'+r+',B'+r+',$N$2:N'+r+'))',num);
   put('P',r,st.quantity>0&&!st.invalid?Math.max(0,-balance/st.quantity):null,'IF(AND(E'+r+'>0,ISNUMBER(O'+r+')),MAX(0,-O'+r+'/E'+r+'),"")',num);
   put('Q',r,serialDate(t.payment_date),null,day);put('R',r,income?(t.payment_confirmed?'已入帳':'待確認'):'');
   put('S',r,isLast&&quote?Number(quote.close_price):null,null,num);
   put('T',r,isLast&&!st.invalid&&(quote||finalQty===0)?(quote?Number(quote.close_price)*finalQty:0)+balance:null,'IF(COUNTIF($B$2:B'+r+',B'+r+')=COUNTIF($B$2:$B$'+(rows.length+1)+',B'+r+'),IF(ISNUMBER(O'+r+'),IF(AB'+r+'=0,O'+r+',IF(ISNUMBER(S'+r+'),S'+r+'*AB'+r+'+O'+r+',"")),""),"")',profit);
   put('W',r,st.invalid?'待補成本':-st.paid,'IF('+missing+',"待補成本",-SUMIF($B$2:B'+r+',B'+r+',$I$2:I'+r+'))',num);
   put('X',r,st.quantity&&!st.invalid?-st.paid/st.quantity:null,'IF(AND(E'+r+'<>0,ISNUMBER(W'+r+')),W'+r+'/E'+r+',"")',num);
   put('Z',r,Number(t.trade_date.slice(0,4)),'YEAR(J'+r+')','0');put('AA',r,Number(t.trade_date.slice(5,7)),'MONTH(J'+r+')','0');
   put('AB',r,finalQty,'SUMIF($B$2:$B$'+(rows.length+1)+',B'+r+',$D$2:$D$'+(rows.length+1)+')',num);
   put('AC',r,gross,null,num);put('AD',r,income?!!t.payment_confirmed:null);put('AE',r,t.note||'');put('AF',r,t.sequence_no??null,null,'0');put('AG',r,t.id||'',null,'@');put('AH',r,isLast&&quote?serialDate(quote.price_date):null,null,day);put('AI',r,fee,null,num);put('AJ',r,kind==='現金股息'?(t.dividend_eligible_shares??null):null,null,num);put('AK',r,kind==='現金股息'?(t.dividend_per_share??null):null,null,'0.######');put('AL',r,kind==='現股'&&q<0?(t.sale_net_received??null):null,null,num);put('AM',r,kind==='現股'?(q>0&&present(t.paid_cost)?'實付記錄':q<0&&present(t.sale_net_received)?'實收記錄':'推算'):'');
  });
  ws['!ref']='A1:AM'+(rows.length+1);ws['!cols']=[8,9,22,10,11,12,11,14,13,14,14,9,12,13,15,18,14,12,12,15,13,13,16,20,20,9,9,14,14,13,28,11,37,14,16,16,16,18,18].map(wch=>({wch}));ws['!rows']=[{hpt:32}];ws['!autofilter']={ref:'A1:AM'+(rows.length+1)};
  XLSX.utils.book_append_sheet(wb,ws,'股票明細');
  const holdings=[...states].filter(([ticker,st])=>st.quantity>0).sort(([a],[b])=>a.localeCompare(b)).map(([ticker,st])=>{const quote=quotes.get(ticker);return {代號:ticker,股票名稱:nameMap.get(ticker)||'',持有股數:st.quantity,含收入成本:st.invalid?'待補成本':Math.max(0,st.paid-st.dividend-st.lending),實際淨投入:st.invalid?'待補成本':st.paid-st.dividend-st.lending,累計淨股息:st.dividend,累計借券淨收入:st.lending,收盤價:quote?.close_price??'',報價日期:quote?.price_date||'',市值:quote?st.quantity*quote.close_price:'',累計損益:quote&&!st.invalid?st.quantity*quote.close_price-st.paid+st.dividend+st.lending:''};});
  function append(name,records,widths){const sheet=XLSX.utils.json_to_sheet(records),keys=Object.keys(records[0]||{});records.forEach((record,r)=>keys.forEach((key,c)=>{let column='',n=c+1;while(n){column=String.fromCharCode(65+(n-1)%26)+column;n=Math.floor((n-1)/26);}const cell=sheet[column+(r+2)];if(!cell)return;if(typeof record[key]==='number')cell.z=key==='累計損益'?profit:num;else if(key.endsWith('日期')&&/^\d{4}-\d{2}-\d{2}$/.test(record[key])){cell.v=serialDate(record[key]);cell.t='n';cell.z=day;}else if(['代號','帳號末四碼'].includes(key))cell.z='@';}));sheet['!cols']=widths.map(wch=>({wch}));if(sheet['!ref'])sheet['!autofilter']={ref:sheet['!ref']};XLSX.utils.book_append_sheet(wb,sheet,name);}
  append('持股總覽',holdings,[10,24,12,16,16,15,18,12,14,16,16]);
  if(data.tradePlans?.length)append('待交易',data.tradePlans.map(p=>({代號:p.ticker,名稱:p.stock_name||nameMap.get(p.ticker)||'',方向:p.direction,目標價:p.target_price,預計股數:p.quantity??'',備註:p.note||'',來源識別:p.source_key,計畫ID:p.id})),[12,24,12,14,14,30,28,38]);
  append('個股代號',data.tickers.map(t=>({代號:t.ticker,名稱:t.display_name})),[12,30]);
  append('ETF 保管銀行',data.banks.map(b=>({代號:b.ticker,名稱:nameMap.get(b.ticker)||'',保管銀行:b.custodian_bank||'',配息頻率:(b.note||'').startsWith('配息頻率：')?b.note.slice(5):'',配息匯款帳戶:b.payout_bank||'',帳號末四碼:b.account_last4||'',備註:b.note||''})),[12,26,18,22,18,14,30]);
  const info=XLSX.utils.aoa_to_sheet([['匯出說明'],['完整交易筆數',rows.length],['主表沿用原檔欄位順序；原匯入交易依序號保留列順序，新交易接在後面，系統保存欄位追加在右側。'],['實付買入與實收賣出優先按記錄金額，缺值才按價格及費用推算；實際實收已扣費用，不再重複扣。'],['成本、總股數、實領收入、年月等欄位有公式；報價是有日期的收盤快照，並非即時行情。'],['已回本每股成本顯示 0；實際負值保留在累計收支與總覽的實際淨投入。'],['借券收入獨立列示，納入累計收支與損益，不增加股數、不混入股息統計；空白匯費依原表暫按 0 計；空白交易成本仍顯示待補成本。'],['待交易計畫另列於「待交易」工作表，不納入成交明細、持股與損益；原檔其他研究、希望價及手填獲利／狀態未重建。'],['X 欄沿用原檔 W/E 的正負號；股票識別以完整代號比對。'],['系統資料完整還原以 ZIP 內的 system_backup.json 為準。']]);info['!cols']=[{wch:110},{wch:16}];XLSX.utils.book_append_sheet(wb,info,'匯出說明');
  return wb;
 }
 function appendXMLRecords(xml,tag,records){let offset=0;const updated=xml.replace(new RegExp('<'+tag+' count="(\\d+)"([^>]*)>([\\s\\S]*?)</'+tag+'>'),(_,count,attrs,body)=>{offset=Number(count);return '<'+tag+' count="'+(offset+records.length)+'"'+attrs+'>'+body+records.join('')+'</'+tag+'>';});if(updated===xml)throw Error('Excel 樣式結構不符');return {xml:updated,offset};}
 async function serializeWorkbook(wb,XLSX,JSZip){
  const zip=await JSZip.loadAsync(XLSX.write(wb,{bookType:'xlsx',type:'array'}));
  let styles=await zip.file('xl/styles.xml').async('string');
  let added=appendXMLRecords(styles,'fonts',['<font><sz val="11"/><name val="Calibri"/><b/></font>']);styles=added.xml;const font=added.offset;
  added=appendXMLRecords(styles,'fills',['<fill><patternFill patternType="solid"><fgColor rgb="FFE8E8E8"/><bgColor indexed="64"/></patternFill></fill>']);styles=added.xml;const fill=added.offset;
  added=appendXMLRecords(styles,'cellXfs',['left','right'].map(align=>'<xf numFmtId="0" fontId="'+font+'" fillId="'+fill+'" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="'+align+'" vertical="center" wrapText="1"/></xf>'));styles=added.xml;zip.file('xl/styles.xml',styles);
  for(let i=0;i<wb.SheetNames.length;i++){
   const path='xl/worksheets/sheet'+(i+1)+'.xml';let xml=await zip.file(path).async('string');
   const pane=i===0?'<pane xSplit="4" ySplit="1" topLeftCell="E2" activePane="bottomRight" state="frozen"/>':'<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>';
   xml=xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/,'<sheetViews><sheetView workbookViewId="0">'+pane+'</sheetView></sheetViews>');
   xml=xml.replace(/<row r="1"[^>]*>[\s\S]*?<\/row>/,row=>row.replace(/<c\b([^>]*\br="([A-Z]+)1"[^>]*)>/g,(_,attrs,col)=>{const numeric=i===0&&['D','E','G','H','I','K','L','M','N','O','P','S','T','U','V','W','X','Z','AA','AB','AC','AF','AI'].includes(col);return '<c'+attrs.replace(/\s+s="\d+"/,'')+' s="'+(added.offset+(numeric?1:0))+'">';}));zip.file(path,xml);
  }
  let workbook=await zip.file('xl/workbook.xml').async('string');workbook=workbook.replace(/<calcPr\b[^>]*\/?\s*>/g,'').replace('</workbook>','<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>');zip.file('xl/workbook.xml',workbook);
  return zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'});
 }
 const api={HEADERS,buildWorkbook,serializeWorkbook};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LeiStockExport=api;
})(typeof window==='undefined'?globalThis:window);
