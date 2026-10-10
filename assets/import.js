(() => {
  const $ = id => document.getElementById(id);
  if (!$("bulkImportFile")) return;
  let rowsToImport = [];
  const say = (s, kind="") => { $("bulkImportMessage").textContent=s; $("bulkImportMessage").className="importMessage "+kind; };
  const norm = s => String(s ?? "").replace(/^\uFEFF/,"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
  function parse(text) {
    text=text.replace(/^\uFEFF/,"");
    const out=[]; let row=[], cell="", q=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(q){ if(c==='"' && text[i+1]==='"'){cell+='"';i++;} else if(c==='"')q=false; else cell+=c; }
      else if(c==='"')q=true;
      else if(c===","){row.push(cell);cell="";}
      else if(c==="\n"){row.push(cell.replace(/\r$/,""));if(row.some(x=>x.trim()))out.push(row);row=[];cell="";}
      else cell+=c;
    }
    row.push(cell.replace(/\r$/,""));if(row.some(x=>x.trim()))out.push(row);
    if(out.length<2)throw Error("CSV must contain a header and at least one data row.");
    const headers=out.shift().map(norm);
    return out.map((cells,i)=>{const o={rowNumber:i+2};headers.forEach((h,j)=>o[h]=(cells[j]??"").trim());return o;});
  }
  const get=(r,...keys)=>{for(const k of keys){const v=r[norm(k)];if(v!==undefined&&v!=="")return v;}return "";};
  const cleanISBN=s=>String(s||"").replace(/[^0-9X]/gi,"");
  const titleKey=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money=v=>v==null||v===""?"—":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(v));
  function num(v,label,n){if(v==="")return null;const x=Number(String(v).replace(/[$,]/g,""));if(!Number.isFinite(x)||x<0)throw Error("Row "+n+": invalid "+label);return x;}
  function date(v,n){if(!v)return null;const d=new Date(v);if(Number.isNaN(d.getTime()))throw Error("Row "+n+": invalid date");return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:d.toISOString().slice(0,10);}
  function match(r,books){
    const i13=cleanISBN(get(r,"isbn13","isbn_13","isbn")),i10=cleanISBN(get(r,"isbn10","isbn_10"));
    const t=titleKey(get(r,"title","book_title")),a=titleKey(get(r,"author","book_author"));
    let found=[];
    if(i13||i10)found=books.filter(b=>(i13&&(cleanISBN(b.isbn13)===i13||cleanISBN(b.isbn10)===i13))||(i10&&cleanISBN(b.isbn10)===i10));
    if(!found.length&&t)found=books.filter(b=>titleKey(b.title)===t&&(!a||titleKey(b.author)===a));
    return found.length===1?found[0]:null;
  }
  $("bulkImportFile").addEventListener("change", async e=>{
    const file=e.target.files&&e.target.files[0]; if(!file)return;
    $("bulkImportApply").disabled=true; rowsToImport=[]; $("bulkImportPreview").innerHTML=""; $("bulkImportSummary").innerHTML="";
    try {
      say("Reading "+file.name+"…");
      if(!window.bookValueImportContext)throw Error("Catalog context is not ready. Reload the page.");
      const data=parse(await file.text()); const books=window.bookValueImportContext.getBooks();
      rowsToImport=data.map(r=>{
        const book=match(r,books);
        const market=(get(r,"marketplace")||"ebay").toLowerCase();
        return {source:r,book,market,observed:date(get(r,"observed_at","observed_date"),r.rowNumber),
          price:num(get(r,"lowest_used_price","ebay_lowest","amazon_lowest","lowest_price","asking_price"),"asking price",r.rowNumber),
          count:num(get(r,"active_listing_count","listing_count"),"listing count",r.rowNumber),
          estimate:num(get(r,"estimated_value","estimated_current_value"),"estimated value",r.rowNumber),estimateMethod:get(r,"estimated_value_method"),estimateConfidence:(get(r,"estimated_value_confidence")||"medium").toLowerCase(),estimateAsOf:date(get(r,"estimated_value_as_of"),r.rowNumber),
          soldDate:date(get(r,"last_sold_date","sold_date"),r.rowNumber),
          soldPrice:num(get(r,"last_sold_price","sold_price"),"sold price",r.rowNumber),
          url:get(r,"search_url","source_url","url"),notes:get(r,"notes","research_notes"),edition:get(r,"edition_match","edition"),
          condition:get(r,"condition"),currency:(get(r,"currency")||"USD").toUpperCase().slice(0,3),
          soldSource:get(r,"last_sold_source","last_sold_url")};
      });
      const matched=rowsToImport.filter(r=>r.book).length;
      $("bulkImportSummary").textContent=data.length+" CSV rows · "+matched+" matched · "+(data.length-matched)+" unmatched";
      $("bulkImportPreview").innerHTML="<div class='importTableWrap'><table class='importTable'><thead><tr><th>Row</th><th>Title</th><th>Estimated value</th><th>eBay asking</th><th>Match</th></tr></thead><tbody>"+rowsToImport.slice(0,100).map(r=>"<tr><td>"+r.source.rowNumber+"</td><td>"+esc(r.book?r.book.title:get(r.source,"title")||"Untitled")+"</td><td>"+money(r.estimate)+"</td><td>"+money(r.price)+"</td><td>"+(r.book?"Matched":"No match")+"</td></tr>").join("")+"</tbody></table></div>";
      $("bulkImportPreview").classList.remove("hidden");
      $("bulkImportApply").disabled=matched===0;
      say("Preview ready: "+data.length+" rows, "+matched+" matched. Nothing saved yet.",matched?"success":"error");
    } catch(err) { say("CSV preview failed: "+(err&&err.message?err.message:String(err)),"error"); console.error(err); }
  });
  $("bulkImportTemplate").onclick=()=>{
    const csv="isbn13,isbn10,title,author,marketplace,observed_at,lowest_used_price,active_listing_count,search_url,notes,estimated_value,last_sold_date,last_sold_price,last_sold_source,currency\n";
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="book-value-research-template.csv";a.click();URL.revokeObjectURL(a.href);
  };
  $("bulkImportReset").onclick=()=>{$("bulkImportFile").value="";$("bulkImportPreview").innerHTML="";$("bulkImportPreview").classList.add("hidden");$("bulkImportSummary").innerHTML="";$("bulkImportApply").disabled=true;rowsToImport=[];say("Choose a CSV file to begin.");};
  $("bulkImportApply").onclick=async()=>{
    const ctx=window.bookValueImportContext;if(!ctx)return;
    const ready=rowsToImport.filter(r=>r.book);if(!ready.length)return;
    if(!confirm("Append research for "+ready.length+" matched books? Existing records will not be deleted."))return;
    $("bulkImportApply").disabled=true;say("Importing…");let snapshots=0,valuations=0,sales=0,errors=[];
    for(const r of ready){
      const book_id=r.book.id, marketplace=["amazon","ebay","other"].includes(r.market)?r.market:"other";
      if(r.price!==null||r.count!==null){
        const {error}=await ctx.client.from("marketplace_snapshots").insert({book_id,marketplace,observed_at:r.observed||new Date().toISOString(),lowest_used_price:r.price,active_listing_count:r.count,currency:r.currency,search_url:r.url||null,status:"csv_import",edition_match:r.edition||null,notes:r.notes||null});
        if(error)errors.push("row "+r.source.rowNumber+": "+error.message);else snapshots++;
      }
      if(r.estimate!==null){
        const {error}=await ctx.client.from("valuations").insert({book_id,estimated_value:r.estimate,method:r.estimateMethod||"bulk CSV import",confidence:["low","medium","high"].includes(r.estimateConfidence)?r.estimateConfidence:"medium",as_of_date:r.estimateAsOf||r.observed||new Date().toISOString().slice(0,10),notes:r.notes||"Imported from research CSV"});
        if(error)errors.push("row "+r.source.rowNumber+" valuation: "+error.message);else valuations++;
      }
      if(r.soldDate||r.soldPrice!==null){
        const {error}=await ctx.client.from("sales_comparables").insert({book_id,marketplace, sold_date:r.soldDate,sold_price:r.soldPrice,currency:r.currency,listing_url:r.soldSource||r.url||null,edition_match:r.edition||null,condition:r.condition||null,confidence:"medium",notes:r.notes||null});
        if(error)errors.push("row "+r.source.rowNumber+" sale: "+error.message);else sales++;
      }
    }
    await ctx.refresh();
    say("Finished: "+snapshots+" observations, "+valuations+" valuations, "+sales+" sold records. "+errors.length+" errors."+(errors.length?" First error: "+errors[0]:""),errors.length?"error":"success");
  };
})();