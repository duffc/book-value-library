(() => {
  const $ = id => document.getElementById(id);
  if (!$("bulkImportPanel")) return;
  let mappedRows = [], previewReady = false;
  const message = (text, kind="") => { $("bulkImportMessage").textContent = text; $("bulkImportMessage").className = "importMessage " + kind; };
  const normalize = s => String(s ?? "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const aliases = {
    isbn13:["isbn13","isbn_13","isbn"], isbn10:["isbn10","isbn_10"], title:["title","book_title"], author:["author","book_author"],
    marketplace:["marketplace","source","site"], observed_at:["observed_at","price_checked_date","observed_date","date_checked"],
    lowest_used_price:["lowest_used_price","lowest_used_price_ebay","ebay_lowest","amazon_lowest","lowest_price","asking_price"],
    active_listing_count:["active_listing_count","listing_count","active_listings_count","ebay_active_listings_count","amazon_active_listings_count"],
    search_url:["search_url","source_url","ebay_active_listings_isbn","amazon_search_isbn","url"], status:["status","research_status","lookup_status"],
    edition_match:["edition_match","edition"], notes:["notes","notes_edition_match","research_notes"], estimated_value:["estimated_value","estimated_current_value","value_estimate"],
    last_sold_date:["last_sold_date","sold_date"], last_sold_price:["last_sold_price","sold_price"], last_sold_source:["last_sold_source","sold_source","last_sold_url"],
    last_sold_url:["last_sold_url","last_sold_source","sold_source"], currency:["currency"], condition:["condition","copy_condition"], shipping_price:["shipping_price"],
    sold_marketplace:["sold_marketplace","last_sold_marketplace"]
  };
  function parseCSV(text) {
    text=text.replace(/^\uFEFF/,"");const rows=[];let row=[],cell="",quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"')quoted=true;else if(c===","){row.push(cell);cell=""}else if(c==="\n"){row.push(cell.replace(/\r$/,""));if(row.some(v=>v.trim()!==""))rows.push(row);row=[];cell=""}else cell+=c}
    row.push(cell.replace(/\r$/,""));if(row.some(v=>v.trim()!==""))rows.push(row);if(rows.length<2)throw Error("CSV needs a header row and at least one data row.");
    const headers=rows.shift().map(normalize);return rows.map((r,i)=>{const o={_row:i+2};headers.forEach((h,j)=>o[h]=(r[j]??"").trim());return o});
  }
  function get(r,k){for(const a of (aliases[k]||[k]))if(r[a]!==undefined&&r[a]!=="")return r[a];return ""}
  function num(v,label,row,integer=false){if(v==="")return null;const n=Number(String(v).replace(/[$,]/g,""));if(!Number.isFinite(n)||n<0||(integer&&!Number.isInteger(n)))throw Error("Row "+row+": invalid "+label+" (“"+v+"”).");return n}
  function date(v,label,row){if(!v)return null;const d=new Date(v);if(Number.isNaN(d.getTime()))throw Error("Row "+row+": invalid "+label+" (“"+v+"”).");return v.length===10?v:d.toISOString().slice(0,10)}
  function matchBook(r,books){
    const i13=get(r,"isbn13").replace(/[^0-9X]/gi,""),i10=get(r,"isbn10").replace(/[^0-9X]/gi,"");
    const title=get(r,"title").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(),author=get(r,"author").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();let c=[];
    if(i13||i10)c=books.filter(b=>(i13&&[b.isbn13,b.all_isbns].some(x=>String(x||"").replace(/[^0-9X]/gi,"").includes(i13)))||(i10&&[b.isbn10,b.all_isbns].some(x=>String(x||"").replace(/[^0-9X]/gi,"").includes(i10))));
    if(!c.length&&title)c=books.filter(b=>String(b.title||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()===title&&(!author||String(b.author||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()===author));
    return c.length===1?{book:c[0],status:"Matched"}:{book:null,status:c.length>1?"Ambiguous":"No match"};
  }
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money=v=>v==null?"—":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(v);
  function preview(rows){
    const books=window.bookValueImportContext.getBooks();
    mappedRows=rows.map(r=>{const f=matchBook(r,books);return {...r,...f,marketplace:(get(r,"marketplace")||"other").toLowerCase(),observed:date(get(r,"observed_at"),"observation date",r._row),price:num(get(r,"lowest_used_price"),"asking price",r._row),count:num(get(r,"active_listing_count"),"listing count",r._row,true),estimate:num(get(r,"estimated_value"),"estimated value",r._row),soldDate:date(get(r,"last_sold_date"),"sold date",r._row),soldPrice:num(get(r,"last_sold_price"),"sold price",r._row),shipping:num(get(r,"shipping_price"),"shipping price",r._row),url:get(r,"search_url")||"",notes:get(r,"notes")||"",edition:get(r,"edition_match")||"",statusText:get(r,"status")||"csv_import",condition:get(r,"condition")||"",soldSource:get(r,"last_sold_source")||get(r,"last_sold_url")||"",soldMarketplace:(get(r,"sold_marketplace")||get(r,"marketplace")||"other").toLowerCase()})});
    const matched=mappedRows.filter(r=>r.book).length,miss=mappedRows.length-matched;
    $("bulkImportSummary").innerHTML='<span><b>'+mappedRows.length+'</b> CSV rows</span><span><b>'+matched+'</b> matched</span><span><b>'+miss+'</b> unmatched/ambiguous</span>';
    $("bulkImportPreview").innerHTML='<div class="importTableWrap"><table class="importTable"><thead><tr><th>Row</th><th>Book</th><th>Market</th><th>Asking</th><th>Listings</th><th>Estimate</th><th>Sold price/date</th><th>Match</th></tr></thead><tbody>'+mappedRows.slice(0,100).map(r=>'<tr><td>'+r._row+'</td><td>'+esc(r.book?r.book.title:(get(r,"title")||"No title"))+'</td><td>'+esc(r.marketplace)+'</td><td>'+money(r.price)+'</td><td>'+(r.count??"—")+'</td><td>'+money(r.estimate)+'</td><td>'+money(r.soldPrice)+' / '+esc(r.soldDate||"—")+'</td><td class="'+(r.book?"good":"bad")+'">'+r.status+'</td></tr>').join("")+'</tbody></table></div>'+(mappedRows.length>100?'<p>Preview shows first 100 rows; all rows are validated.</p>':"");
    $("bulkImportPreview").classList.remove("hidden");$("bulkImportApply").disabled=!matched;previewReady=true;
  }
  async function loadSelectedCSV(e){const file=e.target.files&&e.target.files[0];if(!file)return;try{previewReady=false;mappedRows=[];$("bulkImportApply").disabled=true;message("Reading "+file.name+"…");if(!window.bookValueImportContext)throw Error("Catalog is still loading. Refresh the page and choose the file again.");const raw=await file.text();const rows=parseCSV(raw);if(!rows.length)throw Error("No data rows found in this CSV.");preview(rows);const matched=mappedRows.filter(r=>r.book).length;message("Preview ready: "+rows.length+" rows, "+matched+" matched. Nothing has been saved yet.",matched?"success":"error");if(!matched)message("CSV loaded, but zero rows matched the catalog. Send me the preview counts; nothing has been saved.","error")}catch(err){message("CSV preview failed: "+(err&&err.message?err.message:String(err)),"error");$("bulkImportApply").disabled=true;console.error("Book Value Library CSV preview error",err)}}\n  $("bulkImportFile").addEventListener("change",loadSelectedCSV);\n  $("bulkImportFile").addEventListener("input",loadSelectedCSV);
  $("bulkImportTemplate").onclick=()=>{const csv="isbn13,isbn10,title,author,marketplace,observed_at,lowest_used_price,active_listing_count,search_url,status,edition_match,notes,estimated_value,last_sold_date,last_sold_price,last_sold_source,sold_marketplace,condition,shipping_price,currency\n";const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download="book-value-research-template.csv";a.click();URL.revokeObjectURL(a.href)};
  $("bulkImportApply").onclick=async()=>{if(!previewReady||!window.bookValueImportContext)return;const {client,refresh}=window.bookValueImportContext,ready=mappedRows.filter(r=>r.book);if(!ready.length)return;if(!confirm("Import "+ready.length+" matched rows? Existing books and history will not be deleted or overwritten; new observations will be appended."))return;$("bulkImportApply").disabled=true;message("Importing…");let snap=0,vals=0,sold=0,failed=[];
    for(const r of ready){const book_id=r.book.id;
      if(r.price!==null||r.count!==null){const market=["amazon","ebay","other"].includes(r.marketplace)?r.marketplace:"other";const {error}=await client.from("marketplace_snapshots").insert({book_id,marketplace:market,observed_at:r.observed||new Date().toISOString(),lowest_used_price:r.price,active_listing_count:r.count,currency:(get(r,"currency")||"USD").toUpperCase().slice(0,3),search_url:r.url||null,status:r.statusText||"csv_import",edition_match:r.edition||null,notes:r.notes||null});if(error){failed.push("row "+r._row+": "+error.message);continue}snap++}
      if(r.estimate!==null){const {error}=await client.from("valuations").insert({book_id,estimated_value:r.estimate,method:"bulk CSV import",confidence:"medium",as_of_date:r.observed||new Date().toISOString().slice(0,10),notes:r.notes||"Imported from research CSV"});if(error)failed.push("row "+r._row+" valuation: "+error.message);else vals++}
      if(r.soldDate||r.soldPrice!==null){const market=["amazon","ebay","other"].includes(r.soldMarketplace)?r.soldMarketplace:"other";const {error}=await client.from("sales_comparables").insert({book_id,marketplace:market,sold_date:r.soldDate,sold_price:r.soldPrice,currency:(get(r,"currency")||"USD").toUpperCase().slice(0,3),listing_url:r.soldSource||r.url||null,edition_match:r.edition||null,condition:r.condition||null,shipping_price:r.shipping,confidence:"medium",notes:r.notes||null});if(error)failed.push("row "+r._row+" sale: "+error.message);else sold++}
    }
    await refresh();message("Finished: "+snap+" observations, "+vals+" valuations, "+sold+" sold records added. "+failed.length+" errors; unmatched rows skipped."+(failed.length?" First error: "+failed[0]:""),failed.length?"error":"success");
  };
  $("bulkImportReset").onclick=()=>{$("bulkImportFile").value="";$("bulkImportPreview").innerHTML="";$("bulkImportPreview").classList.add("hidden");$("bulkImportSummary").innerHTML="";$("bulkImportApply").disabled=true;mappedRows=[];previewReady=false;message("Choose a CSV file to begin.")};
})();