(() => {
  const $ = id => document.getElementById(id);
  if (!$("runPangoPricing") || !$("runPangoListings")) return;
  const BASE = "https://pangobooks.com/api/public";
  const GAP_MS = 7500;
  const RATE_KEY = "bvl-pango-last-request-at";
  const STATE_KEYS = {
    pricing: "bvl-pango-pricing-progress-v1",
    listings: "bvl-pango-listings-progress-v1"
  };
  let running = false, pauseRequested = false, currentKind = null;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = v => v == null || !Number.isFinite(Number(v)) ? "—" : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(v));
  function todayLocal(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
  function dateOnly(v){if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10)}
  function readState(kind){try{const v=JSON.parse(localStorage.getItem(STATE_KEYS[kind])||"null");if(v&&v.processed)return v}catch(e){}return {processed:{},log:[],started_at:null,updated_at:null}}
  function writeState(kind,state){state.updated_at=new Date().toISOString();try{localStorage.setItem(STATE_KEYS[kind],JSON.stringify(state))}catch(e){}}
  function normalizedIsbn(v){return String(v||"").replace(/[^0-9X]/gi,"").toUpperCase()}
  function allIsbns(book){return [...new Set([book.isbn13,book.isbn10,...String(book.all_isbns||"").split(/[;,| ]+/)].map(normalizedIsbn).filter(Boolean))]}
  function getCtx(){const ctx=window.bookValueImportContext;if(!ctx||!ctx.client||!ctx.getBooks)throw Error("Catalog connection is not ready. Reload the page and sign in again.");if(ctx.isAdmin&&!ctx.isAdmin())throw Error("Please sign in to the admin workspace again.");return ctx}
  function renderProgress(kind, override){
    const state=readState(kind),books=(window.bookValueImportContext&&window.bookValueImportContext.getBooks())||[],id=kind==="pricing"?"pangoPricing":"pangoListings";
    const complete=Object.values(state.processed).filter(x=>x&&["complete","no_data","no_isbn"].includes(x.status)).length;
    const errors=Object.values(state.processed).filter(x=>x&&x.status==="error").length;
    const total=books.length||230,bar=$(id+"Progress"),status=$(id+"Status"),log=$(id+"Log");
    if(bar){bar.max=total;bar.value=Math.min(total,complete)}
    if(status)status.textContent=override||(running&&currentKind===kind?"Research is running…":complete+" of "+total+" books checked · "+errors+" errors to retry.");
    if(log){const recent=(state.log||[]).slice(-5).reverse();log.innerHTML=recent.length?recent.map(x=>'<li><span class="research-log-status '+esc(x.kind||"info")+'">'+esc(x.kind==="error"?"!":x.kind==="data"?"✓":x.kind==="empty"?"—":"·")+'</span><span>'+esc(x.text)+'</span></li>').join(""):'<li class="research-log-empty">Results and source links will appear here as the scan runs.</li>'}
  }
  function renderAll(override){renderProgress("pricing",currentKind==="pricing"?override:null);renderProgress("listings",currentKind==="listings"?override:null);$("pausePangoResearch").disabled=!running; $("runPangoPricing").disabled=running;$("runPangoListings").disabled=running}
  function addLog(kind,text,state){state.log=state.log||[];state.log.push({kind,text,at:new Date().toISOString()});state.log=state.log.slice(-20);writeState(currentKind,state)}
  async function requestJson(url){
    let lastError=null;
    for(let attempt=0;attempt<4;attempt++){
      let last=0;try{last=Number(localStorage.getItem(RATE_KEY)||0)}catch(e){}
      const wait=Math.max(0,GAP_MS-(Date.now()-last));
      if(wait)await sleep(wait);
      try{localStorage.setItem(RATE_KEY,String(Date.now()))}catch(e){}
      let res;
      try{res=await fetch(url,{method:"GET",headers:{Accept:"application/json"}})}catch(e){lastError=Error("Network error reaching PangoBooks: "+(e.message||e));if(attempt<3){await sleep(2500);continue}throw lastError}
      if(res.status===404)return {notFound:true,status:404};
      if(res.status===429){
        let body={};try{body=await res.json()}catch(e){}
        const header=Number(res.headers.get("Retry-After")||0),waitSec=header||Number(body.retry_after||body.retry_after_seconds||20);
        if(attempt<3){setGlobalNote("PangoBooks rate limit reached; waiting "+waitSec+" seconds before retrying…");await sleep(Math.max(5,waitSec)*1000);lastError=Error("PangoBooks rate limited");continue}
        throw Error("PangoBooks rate limit persisted after retries. Pause and resume later.");
      }
      if(!res.ok){let body={};try{body=await res.json()}catch(e){}throw Error("PangoBooks returned HTTP "+res.status+(body.message?": "+body.message:""))}
      let body;try{body=await res.json()}catch(e){throw Error("PangoBooks returned invalid JSON")}
      if(body&&body.success===false)throw Error(body.message||body.error||"PangoBooks lookup failed");
      return body;
    }
    throw lastError||Error("PangoBooks lookup failed");
  }
  function setGlobalNote(s){const el=$("pangoResearchNotice");if(el)el.textContent=s}
  async function addEvent(ctx,book,eventType,status,details){
    try{const {error}=await ctx.client.from("research_events").insert({book_id:book.id,event_type:eventType,status,details:JSON.stringify(details).slice(0,7000)});if(error)throw error;return null}
    catch(e){return e&&e.message?e.message:String(e)}
  }
  function existingSaleKey(s){return [s.book_id,dateOnly(s.sold_date)||"",Number(s.sold_price??-1).toFixed(2),String(s.marketplace||"").toLowerCase(),String(s.condition||"").toLowerCase()].join("|")}
  async function researchPricing(ctx,book,state){
    const isbns=allIsbns(book);if(!isbns.length){const detail={reason:"No ISBN stored on catalog record",checked_at:new Date().toISOString()};await addEvent(ctx,book,"pango_isbn_pricing","complete",detail);return {status:"no_isbn",text:book.title+" — skipped (no ISBN)",kind:"empty"}}
    let body=null,usedIsbn=isbns[0],sourceUrl="";
    for(const isbn of isbns.slice(0,2)){
      usedIsbn=isbn;sourceUrl=BASE+"/pricing?isbn="+encodeURIComponent(isbn);
      const result=await requestJson(sourceUrl);
      if(!result.notFound){body=result;break}
    }
    if(!body||!body.data||!body.data.market){
      const detail={isbn:book.isbn13||book.isbn10,requested_isbns:isbns.slice(0,2),reason:"No exact-ISBN PangoBooks sold-price data returned",source_url:sourceUrl,checked_at:new Date().toISOString()};
      await addEvent(ctx,book,"pango_isbn_pricing","complete",detail);
      return {status:"no_data",text:book.title+" — no exact-ISBN sold-price data",kind:"empty"};
    }
    const d=body.data,market=d.market,sales=Array.isArray(d.recent_sales)?d.recent_sales:[],count=Number(market.sales_count||0);
    const dataIsbn=normalizedIsbn(d.isbn),accepted=allIsbns(book);
    if(dataIsbn&&!accepted.includes(dataIsbn)){
      const detail={requested_isbns:isbns.slice(0,2),returned_isbn:d.isbn,reason:"Returned ISBN did not match catalog edition; left data unchanged",source_url:d.urls?.pricing||sourceUrl,checked_at:new Date().toISOString()};
      await addEvent(ctx,book,"pango_isbn_pricing","blocked",detail);
      throw Error("ISBN mismatch returned by PangoBooks; no data saved");
    }
    const pricingUrl=d.urls?.pricing||"https://pangobooks.com/pricing?isbn="+encodeURIComponent(usedIsbn);
    const retrievalDate=todayLocal();
    const median=Number(market.median_price_usd),avg=Number(market.avg_price_usd),min=Number(market.min_price_usd),max=Number(market.max_price_usd);
    const confidence=count>=50?"high":count>=10?"medium":"low";
    const existingCounts=new Map();
    for(const record of (ctx.getSales?ctx.getSales():[])){const k=existingSaleKey(record);existingCounts.set(k,(existingCounts.get(k)||0)+1)}
    if(!window.__bvlPangoSaleCounts)window.__bvlPangoSaleCounts=existingCounts;
    else for(const [k,n] of existingCounts)window.__bvlPangoSaleCounts.set(k,Math.max(window.__bvlPangoSaleCounts.get(k)||0,n));
    let salesAdded=0;const returnedCounts=new Map();
    for(const sale of sales){
      const price=Number(sale.price_usd),soldDate=dateOnly(sale.sold_at),condition=sale.condition||null;
      if(!Number.isFinite(price)||price<0)continue;
      const key=[book.id,soldDate||"",price.toFixed(2),"other",String(condition||"").toLowerCase()].join("|");
      const occurrence=(returnedCounts.get(key)||0)+1;returnedCounts.set(key,occurrence);
      const savedCount=window.__bvlPangoSaleCounts.get(key)||0;
      // Treat identical date/price/condition sales as a multiset so real duplicate transactions are retained, while reruns stay idempotent.
      if(savedCount>=occurrence)continue;
      const notes="PangoBooks public API recent sale; ISBN "+(d.isbn||usedIsbn)+". Market median "+(Number.isFinite(median)?money(median):"unavailable")+" from "+count+" reported sales. Source: "+pricingUrl;
      const {error}=await ctx.client.from("sales_comparables").insert({book_id:book.id,marketplace:"other",sold_date:soldDate,sold_price:price,currency:"USD",listing_url:pricingUrl,condition,confidence,notes});
      if(error)throw Error("Could not save sold comparable for "+book.title+": "+error.message);
      window.__bvlPangoSaleCounts.set(key,savedCount+1);salesAdded++;
    }
    let valuationUpdated=false;
    if(count>=3&&Number.isFinite(median)&&median>=0){
      const method="PangoBooks ISBN sold median (public API)";
      const note="Exact ISBN match to catalog edition. PangoBooks reported "+count+" historical sales; median "+money(median)+", average "+money(Number.isFinite(avg)?avg:null)+", range "+money(Number.isFinite(min)?min:null)+"–"+money(Number.isFinite(max)?max:null)+". Estimated resale value uses the median sold price, not an asking price. Recent sale samples are stored separately. Source: "+pricingUrl+" Checked "+retrievalDate+". Condition and shipping may differ from this copy.";
      const valuations=ctx.getValuations?ctx.getValuations():[];
      const sameDay=valuations.filter(v=>v.book_id===book.id&&v.method===method&&String(v.as_of_date||"").slice(0,10)===retrievalDate).sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")))[0];
      let writeResult;
      if(sameDay)writeResult=await ctx.client.from("valuations").update({estimated_value:median,confidence,as_of_date:retrievalDate,notes:note}).eq("id",sameDay.id);
      else writeResult=await ctx.client.from("valuations").insert({book_id:book.id,estimated_value:median,method,confidence,as_of_date:retrievalDate,notes:note});
      if(writeResult.error)throw Error("Could not save valuation for "+book.title+": "+writeResult.error.message);
      valuationUpdated=true;
    }
    const detail={isbn:d.isbn||usedIsbn,title:d.title||book.title,source:"PangoBooks public API",source_url:pricingUrl,checked_at:new Date().toISOString(),market:{min_price_usd:market.min_price_usd,max_price_usd:market.max_price_usd,avg_price_usd:market.avg_price_usd,median_price_usd:market.median_price_usd,sales_count:count,retail_price_usd:market.retail_price_usd},recent_sale_samples:salesAdded,valuation_updated:valuationUpdated,confidence};
    const auditError=await addEvent(ctx,book,"pango_isbn_pricing","complete",detail);
    return {status:"complete",text:book.title+" — median "+money(median)+" · "+count+" sold comps · "+salesAdded+" new sale records"+(valuationUpdated?" · valuation updated":" · estimate retained")+(auditError?" · audit note failed":""),kind:"data"};
  }
  async function researchListings(ctx,book,state){
    const isbns=allIsbns(book);if(!isbns.length){await addEvent(ctx,book,"pango_active_offers","complete",{reason:"No ISBN stored on catalog record",checked_at:new Date().toISOString()});return {status:"no_isbn",text:book.title+" — skipped (no ISBN)",kind:"empty"}}
    const existing=ctx.getObservations?ctx.getObservations():[];
    const today=todayLocal();
    let result=null,usedIsbn=isbns[0],queryUrl="";
    for(const isbn of isbns.slice(0,2)){
      usedIsbn=isbn;queryUrl=BASE+"/search?q="+encodeURIComponent(isbn)+"&type=books&limit=10";
      const candidate=await requestJson(queryUrl);if(!candidate.notFound&&candidate.data){result=candidate;break}
    }
    if(!result||!result.data){
      const detail={isbn:book.isbn13||book.isbn10,reason:"No ISBN-specific active offer results returned",source_url:queryUrl,checked_at:new Date().toISOString()};
      await addEvent(ctx,book,"pango_active_offers","complete",detail);
      return {status:"no_data",text:book.title+" — no ISBN-matched active offers found",kind:"empty"};
    }
    const d=result.data,hits=Array.isArray(d.hits)?d.hits:[],accepted=isbns.map(normalizedIsbn);
    const exact=hits.filter(hit=>{const id=normalizedIsbn(hit.isbn);return id&&accepted.includes(id)&&Number.isFinite(Number(hit.price_usd))&&Number(hit.price_usd)>=0});
    if(!exact.length){
      await addEvent(ctx,book,"pango_active_offers","complete",{isbn:book.isbn13||book.isbn10,query:usedIsbn,found: d.found,returned_hits:hits.length,exact_isbn_hits:0,reason:"Search results did not include offers with an exact matching ISBN; no price/count recorded",source_url:queryUrl,checked_at:new Date().toISOString()});
      return {status:"no_data",text:book.title+" — search returned no exact-ISBN offers",kind:"empty"};
    }
    const lowest=exact.reduce((best,hit)=>Number(hit.price_usd)<Number(best.price_usd)?hit:best,exact[0]);
    const observedAt=new Date().toISOString();
    const previous=existing.filter(o=>o.book_id===book.id&&o.marketplace==="other"&&o.status==="pango_active_isbn_search"&&String(o.observed_at||"").slice(0,10)===today).sort((a,b)=>String(b.observed_at||"").localeCompare(String(a.observed_at||"")))[0];
    const count=exact.length;
    const note="PangoBooks public API ISBN search. "+count+" exact-ISBN offers returned on the first page (maximum 10); this is the number observed, not guaranteed total marketplace inventory. Lowest returned offer "+money(lowest.price_usd)+(lowest.condition?"; condition "+lowest.condition:"")+". Query returned "+Number(d.found||hits.length)+" search result(s) overall. Source API URL: "+queryUrl;
    const snap={book_id:book.id,marketplace:"other",observed_at:observedAt,lowest_used_price:Number(lowest.price_usd),active_listing_count:count,currency:"USD",search_url:lowest.urls?.book||lowest.urls?.detail||lowest.urls?.title||null,status:"pango_active_isbn_search",edition_match:"Exact ISBN match",notes:note};
    let writeResult;
    if(previous)writeResult=await ctx.client.from("marketplace_snapshots").update(snap).eq("id",previous.id);
    else writeResult=await ctx.client.from("marketplace_snapshots").insert(snap);
    if(writeResult.error)throw Error("Could not save PangoBooks active offers for "+book.title+": "+writeResult.error.message);
    const detail={isbn:book.isbn13||book.isbn10,query_isbn:usedIsbn,source:"PangoBooks public API",source_url:queryUrl,checked_at:observedAt,search_results:Number(d.found||hits.length),exact_isbn_offers_observed:count,lowest_price_usd:Number(lowest.price_usd),lowest_condition:lowest.condition||null,listing_url:lowest.urls?.book||lowest.urls?.detail||null};
    const auditError=await addEvent(ctx,book,"pango_active_offers","complete",detail);
    return {status:"complete",text:book.title+" — "+money(lowest.price_usd)+" low · "+count+" exact-ISBN offer(s) observed"+(count===10?" · page cap reached":"")+(auditError?" · audit note failed":""),kind:"data"};
  }
  async function run(kind){
    if(running)return;
    let ctx;try{ctx=getCtx()}catch(e){setGlobalNote(e.message);return}
    const books=ctx.getBooks()||[];if(!books.length){setGlobalNote("No catalog books loaded yet. Wait for the catalog to finish loading.");return}
    running=true;pauseRequested=false;currentKind=kind;renderAll("Preparing scan…");
    const state=readState(kind);if(!state.started_at)state.started_at=new Date().toISOString();
    const attempted=new Set();let doneSinceRefresh=0,handledThisRun=0,failuresThisRun=0;
    setGlobalNote((kind==="pricing"?"Sold-price research":"Active-listing scan")+" started. This is a free public API and runs at a respectful pace; keep this page open or pause and resume later.");
    try{
      while(!pauseRequested){
        const book=books.find(b=>{const p=state.processed[b.id];return !attempted.has(b.id)&&(!p||!["complete","no_data","no_isbn"].includes(p.status))});
        if(!book)break;
        attempted.add(book.id);
        const isbn=book.isbn13||book.isbn10||"";
        const old=state.processed[book.id];
        renderAll("Researching "+(handledThisRun+1)+" in this session · "+book.title+"…");
        try{
          const result=kind==="pricing"?await researchPricing(ctx,book,state):await researchListings(ctx,book,state);
          state.processed[book.id]={status:result.status,checked_at:new Date().toISOString(),isbn,summary:result.text};
          addLog(result.kind,result.text,state);
        }catch(e){
          state.processed[book.id]={status:"error",checked_at:new Date().toISOString(),isbn,error:e&&e.message?e.message:String(e)};
          addLog("error",book.title+" — "+(e&&e.message?e.message:String(e)),state);failuresThisRun++;
        }
        handledThisRun++;doneSinceRefresh++;writeState(kind,state);renderAll(handledThisRun+" checked in this session; "+failuresThisRun+" errors. "+(pauseRequested?"Pausing…":""));
        if(doneSinceRefresh>=10){try{await ctx.refresh()}catch(e){}doneSinceRefresh=0;renderAll(handledThisRun+" checked in this session; "+failuresThisRun+" errors.");}
      }
    } finally {
      try{await ctx.refresh()}catch(e){}
      running=false;currentKind=null;
      const stateNow=readState(kind),ok=Object.values(stateNow.processed).filter(x=>x&&["complete","no_data","no_isbn"].includes(x.status)).length,err=Object.values(stateNow.processed).filter(x=>x&&x.status==="error").length;
      const msg=pauseRequested?"Paused safely. Progress is saved in this browser; click the same button to resume.":("Scan finished for now: "+ok+" of "+books.length+" resolved, "+err+" errors available to retry. You can resume after reviewing.");
      setGlobalNote(msg);renderAll(msg);
      pauseRequested=false;
    }
  }
  $("runPangoPricing").addEventListener("click",()=>run("pricing"));
  $("runPangoListings").addEventListener("click",()=>run("listings"));
  $("pausePangoResearch").addEventListener("click",()=>{if(!running)return;pauseRequested=true;setGlobalNote("Pause requested. The current lookup will finish, then progress is saved.");renderAll("Pause requested…")});
  window.addEventListener("beforeunload",e=>{if(running){e.preventDefault();e.returnValue=""}});
  function init(){renderProgress("pricing");renderProgress("listings");}
  init();
})();