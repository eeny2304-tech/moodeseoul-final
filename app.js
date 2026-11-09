let editingProductId=null, products=[], cart=[], adminToken=localStorage.getItem("moode_admin_token")||"", settings={};

// Keep the cart across page reloads.
const CART_KEY = "moode_cart";
try { cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch(_) { cart = []; }
function saveCart(){
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch(_){}
}
let myOrders=[];
let userToken="", user=null;
try { userToken=localStorage.getItem("moode_user_token")||""; user=JSON.parse(localStorage.getItem("moode_user")||"null"); } catch(_){}

const $=id=>document.getElementById(id);
const CATEGORY_LABELS = { mn_belen:"Монголд бэлэн", kr_belen:"Солонгост бэлэн", order:"Захиалгийн бараа" };
const BRAND_LABELS = { nike:"Nike", adidas:"Adidas", under_armour:"Under Armour", olive_young:"Olive Young" };
const BRAND_KEYS = Object.keys(BRAND_LABELS);
const STAGE_NAMES = { registered:"Бүртгэгдсэн", transport:"Каргонд өгсөн", mongolia:"Монголд буусан", delivered:"Дууссан", cancelled:"Цуцлагдсан" };

async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{"Content-Type":"application/json",...(opts.headers||{}),...(adminToken?{Authorization:"Bearer "+adminToken}:{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Алдаа");return d}
function money(n){return Number(n||0).toLocaleString("mn-MN")+"₮"}
function won(n){return Number(n||0).toLocaleString("mn-MN")+"₩"}
const CARGO_LABELS = {
  ground: "🚚 Express газрын карго 12-14 хоног",
  delivery: "🛵 Монголд хүргэлт (7,000₮)",
  pickup_kr: "🇰🇷 Солонгост хүлээн авна"
};
function cargoLabel(t){ return CARGO_LABELS[t] || CARGO_LABELS.ground; }
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}

async function init(){const s=await api("/api/settings");settings=s;$("brandName").textContent=s.storeName;$("footerName").textContent=s.storeName;$("footerPhone").textContent=s.phone;$("announce").textContent=s.announcement;loadProducts()}

/* ---------------- Storefront products ---------------- */

function salePct(p){ const o=Number(p.old_price)||0, n=Number(p.price)||0; return o>n&&n>0?Math.round((1-n/o)*100):0; }
function priceHtml(p){
  const o=Number(p.old_price)||0;
  return `<b>${money(p.price)}</b>${p.cargo_included?` <span class="cargo-in">(Карго орсон)</span>`:""}${salePct(p)?` <s class="old-price">${money(o)}</s>`:""}`;
}
function productCardHtml(p){
  const sizes = Array.isArray(p.sizes) ? p.sizes : [];
  const hasSizes = sizes.length > 0;
  const totalStock = hasSizes ? sizes.reduce((s,sz)=>s+(Number(sz.qty)||0),0) : Number(p.stock||0);
  const firstOk = hasSizes ? (sizes.find(sz=>Number(sz.qty)>0)||{}).size||"" : "";
  const sizeChips = hasSizes ? `<input type="hidden" id="size-${p.id}" value="${esc(firstOk)}"><div class="size-chips">${sizes.map(sz=>{const out=Number(sz.qty)<=0;return `<button type="button" class="chip ${out?"out":""} ${(!out&&sz.size===firstOk)?"on":""}" ${out?"disabled":""} onclick="pickSize(${p.id},this)" data-size="${esc(sz.size)}">${esc(sz.size)}</button>`}).join("")}</div>` : "";
  const badge = totalStock<=0 ? `<span class="stock-badge out">ДУУСЛАА</span>` : (totalStock<=3 ? `<span class="stock-badge low">Цөөхөн үлдсэн · ${totalStock}</span>` : "");
  const catLabel = CATEGORY_LABELS[p.category] || "";

  const imgs = (Array.isArray(p.images) && p.images.length) ? p.images : (p.image ? [p.image] : []);
  const cover = imgs[0] || 'https://placehold.co/600x600?text=MOODE+SEOUL';
  return `<article class="product">
    <div class="product-media" onclick="openProductModal(${p.id})">
      <img src="${cover}">
      ${imgs.length>1?`<span class="img-count">📷 ${imgs.length}</span>`:""}
      ${salePct(p)?`<span class="sale-badge">−${salePct(p)}%</span>`:""}
      ${badge}
    </div>
    <div class="p">
      ${catLabel?`<span class="cat-badge cat-${esc(p.category)}">${catLabel}</span>`:""}
      <h3 onclick="openProductModal(${p.id})">${esc(p.name)}</h3>
      <div class="price">${priceHtml(p)}</div>
      ${Number(p.price_krw)>0?`<div class="price-krw">${won(p.price_krw)}</div>`:""}
      ${sizeChips}
      <button class="add-btn" ${totalStock<=0?"disabled":""} onclick="addCart(${p.id})">${totalStock<=0?"Дууссан":"Сагсанд нэмэх"}</button>
      <button class="detail-btn" onclick="openProductModal(${p.id})">Дэлгэрэнгүй →</button>
    </div>
  </article>`;
}

function fixAcct(){ if(settings && String(settings.bankAccount||"").replace(/\s/g,"")==="5071274473") settings.bankAccount="MN050005005071274473"; }
async function loadProducts(){
  products=await api("/api/products");
  if(!products.length) $("products").innerHTML=`<div class="admin-card">Одоогоор бараа нэмэгдээгүй байна.</div>`;
  else filterProducts();
  openProductFromUrl();
}

function pickSize(id,btn){
  const inp=$("size-"+id); if(inp) inp.value=btn.dataset.size;
  btn.parentElement.querySelectorAll(".chip").forEach(c=>c.classList.toggle("on",c===btn));
}
function addCart(id){
  const p=products.find(x=>x.id==id); if(!p) return;
  const sizeEl=$("size-"+id);
  const size=sizeEl?sizeEl.value:undefined;
  const existing=cart.find(i=>i.id==id && (i.size||"")===(size||""));
  if(existing){ existing.qty++; } else { cart.push({...p,qty:1,size}); }
  renderCart(); openCart();
}

function renderCart(){
  saveCart();
  setTimeout(()=>{ if(typeof updateCheckoutMode==="function") updateCheckoutMode(); },0);
  $("cartCount").textContent=cart.reduce((s,x)=>s+x.qty,0);
  const thumb=x=>{const im=(Array.isArray(x.images)&&x.images[0])||x.image||"";return im?`<img class="ci-img" src="${im}" alt="">`:`<div class="ci-img ci-ph"></div>`;};
  setTimeout(()=>{ if(typeof renderPayBlock==="function") renderPayBlock(); },0);
  $("cartItems").innerHTML=cart.length
    ? cart.map((x,i)=>`<div class="cart-item">${thumb(x)}<div class="ci-info"><b>${esc(x.name)}</b>${x.size?`<span>Размер: ${esc(x.size)}</span>`:""}<span>${money(x.price)}</span></div><div class="ci-right"><div class="qty"><button type="button" onclick="changeQty(${i},-1)">−</button><span>${x.qty}</span><button type="button" onclick="changeQty(${i},1)">+</button></div><b>${money(x.price*x.qty)}</b><button type="button" class="ci-del" onclick="removeFromCart(${i})">Устгах</button></div></div>`).join("")+`<div class="cart-total"><span>Барааны нийт дүн</span><b>${money(cart.reduce((s,x)=>s+x.price*x.qty,0))}</b></div>`
    : `<p class="cart-empty">Сагс хоосон байна.</p>`;
}
function changeQty(i,d){
  const it=cart[i]; if(!it) return;
  it.qty+=d; if(it.qty<=0) cart.splice(i,1);
  renderCart();
}
function removeFromCart(i){ cart.splice(i,1); renderCart(); }
function openCart(){$("cart").classList.remove("hidden");renderCart();updateCheckoutMode();if(typeof prefillCheckout==="function")prefillCheckout()} function closeCart(){$("cart").classList.add("hidden")}

/* ---------------- Checkout mode by product category ----------------
   mn_belen  → already in Mongolia: direct delivery (7,000₮), no cargo
   kr_belen  → buyer chooses: pick up in Korea (address) or ship to Mongolia (cargo)
   order     → ordered from Korea: cargo flow
------------------------------------------------------------------- */
function cartCategories(){
  return [...new Set(cart.map(x=>x.category).filter(Boolean))];
}

function checkoutMode(){
  const cats = cartCategories();
  if(cats.length && cats.every(c=>c==="mn_belen")) return "mn_direct";
  if(cats.includes("kr_belen") && ($("receiveWhere")?.value === "kr")) return "kr_direct";
  return "cargo";
}

function updateCheckoutMode(){
  if(!$("cart")) return;
  const rw=$("receiveWhere"); if(window.__preferKr && rw && !rw.dataset.touched && rw.value!=="kr") rw.value="kr";
  setTimeout(()=>{ if(typeof renderPayBlock==="function") renderPayBlock(); },0);
  const cats = cartCategories();
  const showChoice = cats.includes("kr_belen") && !cats.every(c=>c==="mn_belen");
  $("receiveChoice").classList.toggle("hidden", !showChoice);

  const mode = checkoutMode();
  const isCargo = mode === "cargo";

  $("cargoBlock").classList.toggle("hidden", !isCargo);
  const cbox=$("cargoBlock").querySelector(".cargo-note");
  if(cbox){
    if(cbox.dataset.std===undefined) cbox.dataset.std=cbox.innerHTML;
    const included=cart.length>0 && cart.every(x=>x.cargo_included);
    cbox.innerHTML = included
      ? `<b>🚗 Express газрын карго</b><p>📅 12-14 хоног (Мягмар, Баасан гаригт каргонд өгнө.)<br>🏠 Гэр хүргэлт + 9,000₮</p>`
      : cbox.dataset.std;
  }

  $("customerAddress").classList.remove("hidden");
  $("deliveryNote").classList.toggle("hidden", mode !== "mn_direct");

  if(mode === "cargo"){
    $("customerAddress").placeholder = "Хүлээн авах хаяг (дүүрэг, хороо, байр, тоот)";
  } else if(mode === "mn_direct"){
    $("customerAddress").placeholder = "Хүлээн авах хаяг (Монгол)";
  } else if(mode === "kr_direct"){
    $("customerAddress").placeholder = "Хүлээн авах хаяг (Солонгос)";
  }
}

function togglePayDetail(){
  $("bankDetail").classList.toggle("hidden");
  $("bankRow").classList.toggle("open");
}
function toggleKrwDetail(){
  $("krwDetail").classList.toggle("hidden");
  $("krwRow").classList.toggle("open");
}

/* ---------------- Product detail modal ---------------- */
let pmImages=[], pmIndex=0;

function openProductModal(id, skipUrl){
  const p=products.find(x=>x.id==id); if(!p) return;
  if(!skipUrl){
    try { history.replaceState(null, "", "?p=" + id); } catch(_){}
  }
  const sizes=Array.isArray(p.sizes)?p.sizes:[];
  const totalStock = sizes.length ? sizes.reduce((a,s)=>a+(Number(s.qty)||0),0) : Number(p.stock||0);
  pmImages = (Array.isArray(p.images)&&p.images.length) ? p.images : (p.image?[p.image]:['https://placehold.co/800x800?text=MOODE+SEOUL']);
  pmIndex = 0;

  $("pmName").textContent = p.name;
  renderPmGallery();

  const catLabel = CATEGORY_LABELS[p.category] || "";
  $("pmBody").innerHTML=`
    ${catLabel?`<span class="cat-badge cat-${esc(p.category)}">${catLabel}</span>`:""}
    <div class="pm-price">
      ${priceHtml(p)}${salePct(p)?` <span class="sale-pill">−${salePct(p)}%</span>`:""}
      ${Number(p.price_krw)>0?`<span class="pm-krw">${won(p.price_krw)}</span>`:""}
    </div>
    ${sizes.length?`
      <h3 class="section-sub">Хэмжээ сонгох</h3>
      <div class="pm-sizes">${sizes.map((sz,i)=>`<button type="button" class="pm-size ${Number(sz.qty)<=0?'is-out':''}" ${Number(sz.qty)<=0?'disabled':''} data-size="${esc(sz.size)}" onclick="pmSelectSize(this)">${esc(sz.size)} · ${Number(sz.qty)>0?sz.qty+' ширхэг':'дууссан'}</button>`).join("")}</div>
    `:`<p class="pm-stock">${totalStock>0?"Бэлэн: "+totalStock+" ширхэг":"Дууссан"}</p>`}
    ${p.description?`<h3 class="section-sub">Тайлбар</h3><p class="pm-desc">${esc(p.description)}</p>`:""}
    <div class="pm-cargo">
      <b>🚚 Express газрын карго</b>
      <p>⏰ 12-14 хоног (Мягмар, Баасан гаригт каргонд өгнө)<br>💰 8,000₮ (1кг) + 9,000₮ (гэр хүргэлт) = 17,000₮<br>Каргоны төлбөр барааны үнээс тусдаа.</p>
      ${p.pickup?`<p class="pm-pickup"><b>📍 Авах цэг:</b> ${esc(p.pickup)}</p>`:""}
    </div>
    <button class="primary" ${totalStock<=0?"disabled":""} onclick="addCartFromModal(${p.id})">${totalStock<=0?"Дууссан":"Сагсанд нэмэх"}</button>
    <button class="share-btn" onclick="shareProduct(${p.id})">🔗 Линк хуваалцах</button>
  `;
  pmSelectedSize = sizes.length ? (sizes.find(s=>Number(s.qty)>0)?.size ?? null) : null;
  // pre-select the first in-stock size so "Сагсанд нэмэх" always works
  if(pmSelectedSize){
    const btn=[...document.querySelectorAll("#pmBody .pm-size")].find(b=>b.dataset.size===String(pmSelectedSize));
    if(btn) btn.classList.add("selected");
  }
  $("productModal").classList.remove("hidden");
}

let pmSelectedSize = null;

function pmSelectSize(btn){
  document.querySelectorAll("#pmBody .pm-size").forEach(b=>b.classList.remove("selected"));
  btn.classList.add("selected");
  pmSelectedSize = btn.dataset.size;
}

function renderPmGallery(){
  $("pmGallery").innerHTML=`
    ${pmImages.length>1?`<button class="pm-nav pm-prev" onclick="pmMove(-1)">‹</button>`:""}
    <img src="${pmImages[pmIndex]}" alt="" onclick="openLightbox(${pmIndex})">
    ${pmImages.length>1?`<button class="pm-nav pm-next" onclick="pmMove(1)">›</button>`:""}
  `;
  $("pmThumbs").innerHTML = pmImages.length>1
    ? pmImages.map((u,i)=>`<img class="pm-thumb ${i===pmIndex?'active':''}" src="${u}" onclick="pmGo(${i})">`).join("")
    : "";
}
function pmMove(step){ pmIndex=(pmIndex+step+pmImages.length)%pmImages.length; renderPmGallery(); }
function pmGo(i){ pmIndex=i; renderPmGallery(); }
function closeProductModal(){
  $("productModal").classList.add("hidden");
  try { history.replaceState(null, "", location.pathname); } catch(_){}
}

function shareProduct(id){
  const p = products.find(x=>x.id==id);
  const url = location.origin + "/?p=" + id;
  const title = p ? p.name : "MOODE SEOUL";
  if(navigator.share){
    navigator.share({ title, text: title + " — MOODE SEOUL", url }).catch(()=>{});
  } else {
    copyAccount({preventDefault(){},stopPropagation(){},target:null}, url);
    alert("Линк хуулагдлаа:\n" + url);
  }
}

// open a product automatically when the page is loaded with ?p=<id>
function openProductFromUrl(){
  const id = new URLSearchParams(location.search).get("p");
  if(!id) return;
  const exists = products.find(x=>String(x.id)===String(id));
  if(exists) openProductModal(Number(id), true);
}

/* ---------------- Fullscreen image lightbox ---------------- */
let lbIndex = 0;

function openLightbox(i){
  lbIndex = i;
  renderLightbox();
  $("lightbox").classList.remove("hidden");
}
function renderLightbox(){
  $("lbImage").src = pmImages[lbIndex];
  $("lbCounter").textContent = pmImages.length>1 ? `${lbIndex+1} / ${pmImages.length}` : "";
  const multi = pmImages.length > 1;
  document.querySelectorAll(".lb-nav").forEach(b=>b.style.display = multi ? "flex" : "none");
}
function lbMove(e, step){
  if(e) e.stopPropagation();
  lbIndex = (lbIndex + step + pmImages.length) % pmImages.length;
  renderLightbox();
  pmIndex = lbIndex;
  renderPmGallery();
}
function closeLightbox(e, force){
  if(!force && e && e.target !== e.currentTarget) return;
  if(e) e.stopPropagation();
  $("lightbox").classList.add("hidden");
}

// swipe support on the lightbox
(function(){
  let startX = null;
  document.addEventListener("touchstart", ev=>{
    const lb = document.getElementById("lightbox");
    if(!lb || lb.classList.contains("hidden")) return;
    startX = ev.touches[0].clientX;
  }, {passive:true});
  document.addEventListener("touchend", ev=>{
    const lb = document.getElementById("lightbox");
    if(!lb || lb.classList.contains("hidden") || startX===null) return;
    const dx = ev.changedTouches[0].clientX - startX;
    if(Math.abs(dx) > 45) lbMove(null, dx < 0 ? 1 : -1);
    startX = null;
  }, {passive:true});
})();

function addCartFromModal(id){
  const p=products.find(x=>x.id==id); if(!p) return;
  const sizes=Array.isArray(p.sizes)?p.sizes:[];
  if(sizes.length && !pmSelectedSize){
    return alert("Хэмжээгээ сонгоно уу.");
  }
  const existing=cart.find(i=>i.id==id && (i.size||"")===(pmSelectedSize||""));
  if(existing){ existing.qty++; } else { cart.push({...p, qty:1, size:pmSelectedSize||undefined}); }
  closeProductModal();
  renderCart();
  openCart();
}

/* ---------------- Footer menu links ---------------- */
function scrollToTop(e){ if(e) e.preventDefault(); window.scrollTo({top:0,behavior:"smooth"}); }
function scrollToMyOrders(e){
  if(e) e.preventDefault();
  document.querySelector(".track").scrollIntoView({behavior:"smooth"});
  setTimeout(()=>$("trackInput").focus(), 400);
}
function scrollToContact(e){ if(e) e.preventDefault(); $("contactBlock").scrollIntoView({behavior:"smooth"}); }
function openFaq(e){ if(e) e.preventDefault(); $("faqModal").classList.remove("hidden"); }
function closeFaq(){ $("faqModal").classList.add("hidden"); }

async function submitOrder(){
  if(!cart.length)return alert("Сагс хоосон байна.");
  const phone=$("customerPhone").value.trim();
  if(!phone)return alert("Утасны дугаараа оруулна уу.");

  const mode = checkoutMode();
  let address = "";
  let cargo_type = "ground";
  let note = "";

  address = $("customerAddress").value.trim();
  if(!address) return alert("Хүлээн авах хаягаа оруулна уу.");
  if(mode === "cargo"){
    cargo_type = "ground";
  } else {
    if(mode === "mn_direct"){
      cargo_type = "delivery";
      note = "Монголд бэлэн — хүргэлт (7,000₮ тусдаа)";
    } else {
      cargo_type = "pickup_kr";
      note = "Солонгост бэлэн — Солонгост хүлээн авна";
    }
  }

  if(!$("receiptUrl").value) return alert("Төлбөр шилжүүлсний баримтын зургийг хавсаргана уу.");
  const total=cart.reduce((s,x)=>s+x.price*x.qty,0);
  try{
    const o=await api("/api/orders",{method:"POST",body:JSON.stringify({customer_phone:phone,customer_name:$("customerName").value,address,cargo_type,note,receipt:$("receiptUrl").value||"",total,items:cart.map(x=>({product_id:x.id,name:x.name,qty:x.qty,price:x.price,size:x.size,image:x.image}))})});
    cart=[];
    saveCart();
    clearReceipt();
    closeCart();
    $("trackInput").value=phone;
    showOrderSuccess(o.order_code);
    trackOrders();
    loadProducts();
  }catch(e){alert(e.message)}
}

function showOrderSuccess(code){
  $("successCode").textContent=code;
  $("orderSuccessModal").classList.remove("hidden");
}
function closeOrderSuccess(){$("orderSuccessModal").classList.add("hidden")}

/* ---------------- Payment receipt upload ---------------- */
async function uploadReceipt(input){
  const file = input.files[0];
  if(!file) return;
  const label = input.closest(".file-btn");
  if(label) label.classList.add("uploading");
  const fd = new FormData();
  fd.append("receipt", file);
  try{
    const r = await fetch("/api/receipt", { method:"POST", body: fd });
    const d = await r.json();
    if(!r.ok) throw Error(d.error || "Хадгалахад алдаа гарлаа");
    $("receiptUrl").value = d.url;
    $("receiptPreview").innerHTML = `<div class="thumb-wrap"><img src="${d.url}"><button type="button" class="thumb-x" onclick="clearReceipt()">×</button></div>`;
  }catch(e){ alert(e.message); }
  finally{ if(label) label.classList.remove("uploading"); }
}
function clearReceipt(){
  $("receiptUrl").value = "";
  $("receiptPreview").innerHTML = "";
  const f = $("receiptFile"); if(f) f.value = "";
}

/* ---------------- Copy account number ---------------- */
function copyAccount(e, value){
  if(e){ e.preventDefault(); e.stopPropagation(); }
  const done = ()=>{
    const btn = e && e.target;
    if(!btn) return;
    const old = btn.textContent;
    btn.textContent = "Хуулсан ✓";
    btn.classList.add("copied");
    setTimeout(()=>{ btn.textContent = old; btn.classList.remove("copied"); }, 1600);
  };
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(value).then(done).catch(()=>fallbackCopy(value, done));
  } else {
    fallbackCopy(value, done);
  }
}
function fallbackCopy(value, done){
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); done(); } catch(_) { alert("Хуулж чадсангүй: " + value); }
  document.body.removeChild(ta);
}

let activeBrand = "";
let activeType = "ready";
function selectType(t){ activeType=t; document.querySelectorAll("#typeTabs .type-tab").forEach(b=>b.classList.toggle("active",b.dataset.type===t)); filterProducts(); }
function setType(btn){ activeType=btn.dataset.type; document.querySelectorAll("#typeTabs .type-tab").forEach(b=>b.classList.toggle("active",b===btn)); filterProducts(); }

function setBrand(btn){
  document.querySelectorAll(".brand-tab").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  activeBrand = btn.dataset.brand || "";
  filterProducts();
}

function productSection(title,sub,list,id){
  if(!list.length) return "";
  return `<div class="prod-section"${id?` id="${id}"`:""}><div class="ps-head"><h3>${title}</h3>${sub?`<small>${sub}</small>`:""}</div><div class="grid">${list.map(productCardHtml).join("")}</div></div>`;
}
function filterProducts(){
  const q=($("productSearch")?.value||"").trim().toLowerCase();
  let filtered = products.filter(p=>activeType==="order"?p.category==="order":p.category!=="order");
  if(q) filtered = filtered.filter(p=>(p.name||"").toLowerCase().includes(q));
  if(activeBrand){
    filtered = activeBrand === "other"
      ? filtered.filter(p=>!BRAND_KEYS.includes(p.brand))
      : filtered.filter(p=>p.brand === activeBrand);
  }
  const el=$("products");
  if(!filtered.length){ el.innerHTML=`<div class="admin-card">${(q||activeBrand)?"Хайлтад тохирох бараа олдсонгүй.":(activeType==="order"?"Захиалгаар авах бараа одоогоор алга.":"Бэлэн бараа одоогоор алга.")}</div>`; return; }
  if(q || activeBrand){
    el.innerHTML=`<div class="grid wrap">${filtered.map(productCardHtml).join("")}</div>`;
    return;
  }
  const inStock=p=>(Array.isArray(p.sizes)&&p.sizes.length?p.sizes.reduce((s,z)=>s+(Number(z.qty)||0),0):Number(p.stock||0))>0;
  const by=c=>filtered.filter(p=>p.category===c);
  if(activeType==="order"){
    el.innerHTML=productSection("✈️ Солонгосоос захиалгаар","12-14 хоногт Монголд ирнэ",by("order"))
      || `<div class="admin-card">Захиалгаар авах бараа одоогоор алга.</div>`;
    return;
  }
  const ready=filtered.filter(p=>p.category!=="order");
  el.innerHTML=
    productSection("🔥 Өнөөдрийн онцлох","Хамгийн их үзэлттэй бараа",ready.filter(p=>p.featured&&inStock(p)))+
    productSection("🇲🇳 Монголд бэлэн — шууд аваарай","Хүргэлт 7,000₮",by("mn_belen"))+
    productSection("🇰🇷 Солонгост бэлэн","Солонгост хүлээн авах эсвэл Монголд авах",by("kr_belen"),"sec-kr")+
    productSection("Бусад","",ready.filter(p=>!["mn_belen","kr_belen"].includes(p.category)))
    || `<div class="admin-card">Бэлэн бараа одоогоор алга.</div>`;
}

async function trackOrders(){
  const phone=$("trackInput").value.trim();
  if(!phone)return alert("Утасны дугаараа оруулна уу.");
  try{
    const data=await api("/api/orders/by-phone?phone="+encodeURIComponent(phone));
    myOrders=data;
    $("ordersSection").classList.remove("hidden");
    $("orders").innerHTML=data.length?data.map((o,i)=>orderCard(o,i)).join(""):`<div class="admin-card">Энэ дугаараар захиалга олдсонгүй.</div>`;
    $("ordersSection").scrollIntoView({behavior:"smooth"});
  }catch(e){alert(e.message)}
}

function trackMsg(o){
  let t="";
  const due=Number(o.total||0)-Number(o.paid||0)>0;
  if(o.status==="registered") t=due?(o.receipt?"🧾 Баримтыг хүлээж авлаа. Төлбөрийг шалгаж байна.":"💳 Төлбөр баталгаажихыг хүлээж байна. Төлбөрөө хийсний дараа баримтаа илгээнэ үү."):"📦 Захиалга баталгаажлаа. Солонгосоос каргонд өгөхөөр бэлтгэж байна.";
  else if(o.status==="transport") t="🚚 Каргонд өгсөн. Монголд ирмэгц карго тантай холбогдоно."+(o.cargo_code?` Каргоны код: ${o.cargo_code}`:"");
  else if(o.status==="mongolia") t="🇲🇳 Бараа Монголд ирлээ. Карго тантай холбогдож хүргэнэ."+(o.cargo_code?` Каргоны код: ${o.cargo_code}`:"");
  else if(o.status==="delivered") t="✅ Хүлээн авсан. Баярлалаа!";
  return t?`<p class="track-msg">${esc(t)}</p>`:"";
}
function orderCard(o,i){
  const items=Array.isArray(o.items)?o.items:(typeof o.items==="string"?JSON.parse(o.items):[]);
  const stages=["registered","transport","mongolia","delivered"];
  const isCancelled = o.status === "cancelled";
  const idx = stages.indexOf(o.status);
  const first = items[0] || {};
  const matched = first.product_id ? products.find(p => p.id == first.product_id) : null;
  const img = first.image || (matched && matched.image) || 'https://placehold.co/400x400?text=MOODE+SEOUL';

  const stageHtml = isCancelled
    ? `<div class="order-cancelled">Захиалга цуцлагдсан</div>`
    : `<div class="stage-track">${stages.map((s,si)=>`
        <div class="stage ${si<=idx?'done':''} ${si===idx?'current':''}">
          <span class="dot">${si<=idx?'✓':''}</span>
          <span class="label">${STAGE_NAMES[s]}</span>
        </div>`).join("")}</div>`;

  return `<div class="order-card" onclick="openOrderDetail(${i})">
    <div class="order-head">
      <div>
        <span class="order-eyebrow">ЗАХИАЛГЫН ДУГААР</span>
        <b class="order-code">${esc(o.order_code)}</b>
      </div>
      <span class="badge status-${o.status}">${o.status==='delivered'?'✓ ':''}${STAGE_NAMES[o.status]||o.status}</span>
    </div>

    <div class="order-body">
      <div class="order-thumb"><img src="${img}" alt=""></div>
      <div class="order-meta">
        <p>👤 ${esc(o.customer_name||"")} · ${esc(o.customer_phone)}</p>
        <p>💰 <b>${money(o.total)}</b> · Төлсөн: ${money(o.paid)}</p>
        <p>📦 ${items.map(it=>esc(it.name)+(it.size?` (${esc(it.size)})`:"")+" × "+it.qty).join(", ")}</p>
        <p>${cargoLabel(o.cargo_type)} ${o.cargo_code?`· Код: <b>${esc(o.cargo_code)}</b>`:""}</p>
      </div>
    </div>

    ${stageHtml}
    ${trackMsg(o)}
    <div class="order-tap-hint">Дэлгэрэнгүй харах →</div>
  </div>`;
}

function openOrderDetail(i){
  const o=myOrders[i]; if(!o) return;
  const items=Array.isArray(o.items)?o.items:(typeof o.items==="string"?JSON.parse(o.items):[]);
  $("orderDetailContent").innerHTML=`
    <p class="success-code">Захиалгын код<br><b>${esc(o.order_code)}</b></p>
    <div class="success-bank">
      <div><span>Нэр</span><b>${esc(o.customer_name||"—")}</b></div>
      <div><span>Утас</span><b>${esc(o.customer_phone)}</b></div>
      <div><span>Хаяг</span><b>${esc(o.address||"—")}</b></div>
      <div><span>Нийт үнэ</span><b>${money(o.total)}</b></div>
      <div><span>Төлсөн</span><b>${money(o.paid)}</b></div>
      <div><span>Хүргэлт</span><b>${cargoLabel(o.cargo_type)}</b></div>
      ${o.cargo_code?`<div><span>Карго код</span><b>${esc(o.cargo_code)}</b></div>`:""}
      <div><span>Төлөв</span><b>${STAGE_NAMES[o.status]||o.status}</b></div>
    </div>
    <h3 class="section-sub">Бараанууд</h3>
    ${items.map(it=>`<div class="admin-card"><b>${esc(it.name)}</b>${it.size?` · Хэмжээ: ${esc(it.size)}`:""} · ${it.qty} ширхэг · ${money(it.price)}</div>`).join("")}
  `;
  $("orderDetailModal").classList.remove("hidden");
}
function closeOrderDetail(){$("orderDetailModal").classList.add("hidden")}

/* ---------------- Admin ---------------- */

function openAdmin(){$("adminModal").classList.remove("hidden");if(adminToken){$("adminLogin").classList.add("hidden");$("adminPanel").classList.remove("hidden");adminTab("dashboard")}}
function closeAdmin(){$("adminModal").classList.add("hidden")}
async function adminLogin(){try{const d=await api("/api/auth/admin",{method:"POST",body:JSON.stringify({phone:$("adminPhone").value,password:$("adminPassword").value})});adminToken=d.token;localStorage.setItem("moode_admin_token",adminToken);openAdmin()}catch(e){alert(e.message)}}

async function adminTab(tab){
  document.querySelectorAll(".admin-nav button").forEach(b=>b.classList.remove("active"));
  const btnMap={dashboard:0,products:1,orders:2,customers:3,settings:4};
  const navBtns=document.querySelectorAll(".admin-nav button");
  if(navBtns[btnMap[tab]]) navBtns[btnMap[tab]].classList.add("active");

  try{
    if(tab==="dashboard"){
      const s=await api("/api/admin/stats");
      const os=await api("/api/admin/orders");

      const now=new Date();
      const thisKey=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0");
      const monthKey=d=>{const x=new Date(d); return isNaN(x)?"":x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0");};

      const thisMonthOrders=os.filter(o=>monthKey(o.created_at)===thisKey);
      const thisMonthRevenue=thisMonthOrders.reduce((a,o)=>a+Number(o.paid||0),0);
      const unpaid=os.filter(o=>o.status!=="cancelled").reduce((a,o)=>a+Math.max(0,Number(o.total||0)-Number(o.paid||0)),0);
      const cancelled=os.filter(o=>o.status==="cancelled").length;

      const counts={registered:0,transport:0,mongolia:0,delivered:0,cancelled:0};
      os.forEach(o=>{ if(counts[o.status]!==undefined) counts[o.status]++; });

      const monthly=s.monthly||[];
      const maxVal=Math.max(1,...monthly.map(m=>Number(m.total)||0));
      const chartHtml=monthly.length
        ? `<div class="bar-chart">${monthly.map(m=>{
            const [y,mo]=m.month.split("-");
            const h=Math.round((Number(m.total)||0)/maxVal*100);
            return `<div class="bar-col" title="${money(m.total)}">
              <span class="bar-val">${Math.round((Number(m.total)||0)/1000)}k</span>
              <div class="bar" style="height:${Math.max(4,h)}%"></div>
              <span class="bar-label">${mo}/${String(y).slice(2)}</span>
            </div>`;
          }).join("")}</div>`
        : `<p class="muted-note">Мэдээлэл алга байна.</p>`;

      let lowItems=0;
      try{ const ps=await api("/api/admin/products"); lowItems=ps.filter(p=>{const t=Array.isArray(p.sizes)&&p.sizes.length?p.sizes.reduce((x,z)=>x+(Number(z.qty)||0),0):Number(p.stock||0);return t<=3;}).length; }catch(_){}
      const todayKey=now.toISOString().slice(0,10);
      const newToday=os.filter(o=>String(o.created_at||"").slice(0,10)===todayKey).length;
      const needPay=os.filter(o=>o.status==="registered"&&Number(o.total||0)-Number(o.paid||0)>0).length;
      const needShip=os.filter(o=>o.status==="registered"&&Number(o.total||0)-Number(o.paid||0)<=0).length;
      const arrived=os.filter(o=>o.status==="mongolia").length;

      $("adminContent").innerHTML=`<h2>Хяналтын самбар</h2>
        <h3 class="section-sub">Анхаарах зүйл</h3>
        <div class="todo-grid">
          <button class="todo" onclick="gotoOrders('unpaid')"><span>${needPay}</span>Төлбөр хүлээж буй</button>
          <button class="todo" onclick="gotoOrders('registered')"><span>${needShip}</span>Каргонд өгөх / бүртгэгдсэн</button>
          <button class="todo" onclick="gotoOrders('mongolia')"><span>${arrived}</span>Монголд ирсэн (хүргэх)</button>
          <button class="todo ${lowItems?"warn":""}" onclick="adminTab('products')"><span>${lowItems}</span>Дуусах дөхсөн бараа</button>
          <button class="todo" onclick="gotoOrders('all')"><span>${newToday}</span>Өнөөдрийн шинэ захиалга</button>
        </div>

        <div class="grid">
          <div class="admin-card stat-card"><b>Нийт захиалга</b><h2>${s.orders}</h2></div>
          <div class="admin-card stat-card"><b>Идэвхтэй</b><h2>${s.active}</h2></div>
          <div class="admin-card stat-card"><b>Монголд буусан</b><h2>${s.delivered}</h2></div>
          <div class="admin-card stat-card"><b>Цуцлагдсан</b><h2>${cancelled}</h2></div>
        </div>

        <div class="grid">
          <div class="admin-card stat-card"><b>Нийт орлого</b><h2>${money(s.revenue)}</h2></div>
          <div class="admin-card stat-card"><b>Энэ сар</b><h2>${money(thisMonthRevenue)}</h2><small>${thisMonthOrders.length} захиалга</small></div>
          <div class="admin-card stat-card stat-warn"><b>Төлөгдөөгүй</b><h2>${money(unpaid)}</h2></div>
          <div class="admin-card stat-card"><b>Бараа</b><h2>${s.products}</h2></div>
        </div>

        <h3 class="section-sub">Сарын борлуулалт</h3>
        <div class="admin-card">${chartHtml}</div>

        <h3 class="section-sub">Захиалгын төлөв</h3>
        <div class="admin-card status-list">
          ${Object.entries(counts).map(([k,v])=>`<div class="status-row"><span class="badge status-${k}">${STAGE_NAMES[k]||k}</span><b>${v}</b></div>`).join("")}
        </div>`;
    }

    if(tab==="products"){
      const ps=await api("/api/admin/products");
      $("adminContent").innerHTML=`<h2>Бараа удирдах</h2>
        <div class="admin-card">
          <div class="admin-row">
            <input id="pn" placeholder="Барааны нэр">
            <input id="pp" type="number" placeholder="Үнэ ₮">
            <input id="pkrw" type="number" placeholder="Үнэ ₩ (заавал биш)">
            <input id="pold" type="number" placeholder="Хуучин үнэ ₮ (хямдрал харуулах бол)">
            <select id="pc">
              <option value="mn_belen">Монголд бэлэн</option>
              <option value="kr_belen">Солонгост бэлэн</option>
              <option value="order">Захиалгийн бараа</option>
            </select>
            <select id="pbrand">
              <option value="">Брэнд сонгох</option>
              <option value="nike">Nike</option>
              <option value="adidas">Adidas</option>
              <option value="under_armour">Under Armour</option>
              <option value="olive_young">Olive Young</option>
            </select>
          </div>
          <input id="ppickup" placeholder="📍 Авах цэг (жиш: Улаанбаатар, Драгон карго)">
          <label class="check-row"><input type="checkbox" id="pcargo"> Каргоны төлбөр үнэд орсон ("Карго орсон")</label>
          <label class="check-row"><input type="checkbox" id="pfeat"> 🔥 Өнөөдрийн онцлох хэсэгт харуулах</label>

          <p class="field-label">Хэмжээ бүрийн тоо ширхэг</p>
          <div id="sizeRows"></div>
          <button type="button" class="file-btn" onclick="addSizeRow()">+ Хэмжээ нэмэх</button>

          <p class="field-label">Хэмжээгүй бол ерөнхий тоо ширхэг</p>
          <input id="pst" type="number" placeholder="Тоо (хэмжээ ашиглаагүй үед)">

          <label class="file-btn">📷 Зураг сонгох — 6 хүртэл (утаснаас)<input type="file" id="pi_file" accept="image/*" multiple onchange="uploadProductImages(this)"></label>
          <input type="hidden" id="pi">
          <div id="pi_preview" class="img-preview multi"></div>
          <textarea id="pd" placeholder="Тайлбар"></textarea>
          <button class="primary" onclick="addProduct()">Бараа нэмэх</button>
        </div>

        <h3 class="section-sub">Барааны жагсаалт</h3>
        <div class="admin-row">
          <input id="prodSearch" placeholder="🔍 Нэрээр хайх" oninput="filterAdminProducts()">
          <select id="prodCatFilter" onchange="filterAdminProducts()">
            <option value="">Бүх ангилал</option>
            <option value="mn_belen">Монголд бэлэн</option>
            <option value="kr_belen">Солонгост бэлэн</option>
            <option value="order">Захиалгийн бараа</option>
          </select>
          <select id="prodStockFilter" onchange="filterAdminProducts()">
            <option value="">Бүх үлдэгдэл</option>
            <option value="in">Бэлэн байгаа</option>
            <option value="out">Дууссан</option>
          </select>
        </div>
        <div id="adminProductsList"></div>`;
      window.__allProducts=ps;
      renderAdminProductsList(ps);
    }

    if(tab==="orders"){
      const os=await api("/api/admin/orders");
      window.__allOrders=os;
      $("adminContent").innerHTML=`<h2>Захиалга удирдах</h2>
        <div class="admin-row">
          <input id="orderSearch" placeholder="Утас, нэр, захиалгын кодоор хайх" oninput="filterOrdersAdmin()">
        </div>
        <div id="ordFilterChips" class="filter-chips"></div>

        <div class="admin-row">
          <button class="primary" onclick="openAddOrders()">＋ Захиалга нэмэх</button>
        </div>

        <h3 class="section-sub">Захиалгын жагсаалт</h3>
        <div id="ordersAdminList"></div>`;
      filterOrdersAdmin();
    }

    if(tab==="customers"){
      const cs=await api("/api/admin/customers");
      const sorted=[...cs].sort((a,b)=>(a.phone||"").localeCompare(b.phone||""));
      window.__allCustomers=sorted;
      $("adminContent").innerHTML=`<h2>Хэрэглэгчид</h2>
        <div class="admin-row">
          <input id="custSearch" placeholder="Утас, нэрээр хайх" oninput="filterCustomers()">
        </div>
        <div id="customersList">${renderCustomersTable(sorted)}</div>`;
    }

    if(tab==="settings"){
      const s=await api("/api/admin/settings");
      $("adminContent").innerHTML=`<h2>Дэлгүүрийн тохиргоо</h2><div class="admin-row"><input id="sn" value="${esc(s.storeName)}" placeholder="Нэр"><input id="sphone" value="${esc(s.phone)}" placeholder="Утас"><input id="ground" value="${esc(s.groundCargo)}" placeholder="Газар"><input id="bank" value="${esc(s.bankName)}" placeholder="Банк"><input id="acct" value="${esc(s.bankAccount)}" placeholder="Данс"><input id="holder" value="${esc(s.bankHolder)}" placeholder="Данс эзэмшигч"><input id="ig" value="${esc(s.instagram)}" placeholder="Instagram"><input id="fb" value="${esc(s.facebook)}" placeholder="Facebook"></div><textarea id="ann">${esc(s.announcement)}</textarea><button class="primary" onclick="saveSettings()">Хадгалах</button><h3>Odoo</h3><p>Railway-ийн Variables хэсэгт ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, ODOO_ENABLED=true тохируулж болно.</p>`;
    }
  }catch(e){alert(e.message)}
}

function addSizeRow(size="",qty=""){
  const row=document.createElement("div");
  row.className="admin-row size-row";
  row.innerHTML=`<input placeholder="Хэмжээ (жиш: 40)" class="size-size" value="${esc(size)}"><input type="number" placeholder="Тоо" class="size-qty" value="${esc(qty)}"><button type="button" class="size-remove" onclick="this.parentElement.remove()">✕</button>`;
  $("sizeRows").appendChild(row);
}

function collectSizeRows(){
  return [...document.querySelectorAll("#sizeRows .size-row")]
    .map(r=>({size:r.querySelector(".size-size").value.trim(), qty:Number(r.querySelector(".size-qty").value)||0}))
    .filter(s=>s.size);
}

let pendingImages=[];

async function uploadProductImages(input){
  const files=[...input.files].slice(0,6);
  if(!files.length) return;
  const fd=new FormData();
  files.forEach(f=>fd.append("images",f));
  const btn=input.closest(".file-btn");
  if(btn) btn.classList.add("uploading");
  try{
    const r=await fetch("/api/admin/upload-many",{method:"POST",headers:{Authorization:"Bearer "+adminToken},body:fd});
    const d=await r.json();
    if(!r.ok) throw Error(d.error||"Зураг оруулахад алдаа гарлаа");
    pendingImages=[...pendingImages,...d.urls].slice(0,6);
    renderPendingImages();
  }catch(e){alert(e.message)}
  finally{ if(btn) btn.classList.remove("uploading"); }
}

function renderPendingImages(){
  $("pi").value = pendingImages[0] || "";
  $("pi_preview").innerHTML = pendingImages.map((u,i)=>
    `<div class="thumb-wrap"><img src="${u}"><button type="button" class="thumb-x" onclick="removePendingImage(${i})">×</button>${i===0?'<span class="thumb-main">үндсэн</span>':''}</div>`
  ).join("");
}
function removePendingImage(i){ pendingImages.splice(i,1); renderPendingImages(); }

function renderAdminProductsList(ps){
  const el=$("adminProductsList");
  if(!el) return;
  el.innerHTML = ps.length ? ps.map(p=>{
    const out = Number(p.stock||0) <= 0;
    return `<div class="admin-card admin-card-row ${out?'is-out':''}">
      ${p.image?`<img class="admin-thumb" src="${p.image}">`:`<div class="admin-thumb admin-thumb-empty">MS</div>`}
      <div>
        <b>${esc(p.name)}</b> — ${money(p.price)}
        <span class="stock-pill ${out?'stock-out':'stock-in'}">${out?'Дууссан':'Үлдэгдэл '+p.stock}</span><br>
        <small>${esc(CATEGORY_LABELS[p.category]||p.category||"Ангилалгүй")}${p.brand?" · "+esc(BRAND_LABELS[p.brand]||p.brand):""}</small>
        ${p.sizes && p.sizes.length ? `<br><small>Хэмжээ: ${p.sizes.map(s=>`${esc(s.size)}(${s.qty})`).join(", ")}</small>` : ""}
        <br><span class="tog-row"><button class="tog ${p.featured?"on":""}" onclick="toggleProd(${p.id},'featured')">🔥 Онцлох</button><button class="tog ${p.cargo_included?"on":""}" onclick="toggleProd(${p.id},'cargo_included')">Карго орсон</button><button class="tog ${Number(p.old_price)>0?"on":""}" onclick="setOldPrice(${p.id})">${Number(p.old_price)>0?"Хямдрал −"+salePct(p)+"%":"Хямдрал"}</button></span><br><button onclick="editProduct(${p.id})">Засах</button> <button onclick="duplicateProduct(${p.id})">Хуулах</button> <button onclick="deleteProduct(${p.id})">Устгах</button>
      </div>
    </div>`;
  }).join("") : `<p class="muted-note">Бараа олдсонгүй.</p>`;
}

function filterAdminProducts(){
  const q=($("prodSearch")?.value||"").trim().toLowerCase();
  const cat=$("prodCatFilter")?.value||"";
  const stock=$("prodStockFilter")?.value||"";
  let list=(window.__allProducts||[]);
  if(q) list=list.filter(p=>(p.name||"").toLowerCase().includes(q));
  if(cat) list=list.filter(p=>p.category===cat);
  if(stock==="in") list=list.filter(p=>Number(p.stock||0)>0);
  if(stock==="out") list=list.filter(p=>Number(p.stock||0)<=0);
  renderAdminProductsList(list);
}

function openAdminOrderDetail(id){
  const o=(window.__allOrders||[]).find(x=>x.id==id);
  if(!o) return;
  const items=Array.isArray(o.items)?o.items:(typeof o.items==="string"?JSON.parse(o.items):[]);
  const created=o.created_at?new Date(o.created_at).toLocaleString("mn-MN"):"—";
  const balance=Math.max(0,Number(o.total||0)-Number(o.paid||0));

  $("orderDetailContent").innerHTML=`
    <p class="success-code">Захиалгын код<br><b>${esc(o.order_code)}</b></p>
    <div class="success-bank">
      <div><span>Огноо</span><b>${esc(created)}</b></div>
      <div><span>Нэр</span><b>${esc(o.customer_name||"—")}</b></div>
      <div><span>Утас</span><b>${esc(o.customer_phone)}</b></div>
      <div><span>Нийт үнэ</span><b>${money(o.total)}</b></div>
      <div><span>Үлдэгдэл</span><b class="${balance>0?'bal-due':''}">${money(balance)}</b></div>
      <div><span>Хүргэлт</span><b>${cargoLabel(o.cargo_type)}</b></div>
      ${o.note?`<div><span>Тэмдэглэл</span><b>${esc(o.note)}</b></div>`:""}
    </div>
    <h3 class="section-sub">Бараанууд</h3>
    ${items.map(it=>`<div class="admin-card"><b>${esc(it.name)}</b>${it.size?` · Хэмжээ: ${esc(it.size)}`:""} · ${it.qty} ширхэг · ${money(it.price)}</div>`).join("")}

    ${o.receipt?`<h3 class="section-sub">🧾 Гүйлгээний баримт</h3>
      <a href="${esc(o.receipt)}" target="_blank" rel="noopener"><img class="receipt-img" src="${esc(o.receipt)}" alt="баримт"></a>`:""}

    <h3 class="section-sub">Засах</h3>
    <div class="admin-row">
      <select id="mst">${["registered","transport","mongolia","delivered","cancelled"].map(s=>`<option ${o.status===s?"selected":""} value="${s}">${STAGE_NAMES[s]||s}</option>`).join("")}</select>
      <input id="mpaid" type="number" value="${o.paid||0}" placeholder="Төлсөн дүн">
    </div>
    <div class="admin-row">
      <input id="mcargo" value="${esc(o.cargo_code||"")}" placeholder="Карго код">
      <input id="maddr" value="${esc(o.address||"")}" placeholder="Хүлээн авах хаяг">
    </div>
    <div class="admin-row">
      <button class="primary" onclick="saveOrderFromModal(${o.id})">Шинэчлэх</button>
      <button class="row-x-full" onclick="deleteOrderAdmin(${o.id})">Устгах</button>
    </div>
  `;
  $("orderDetailModal").classList.remove("hidden");
}

async function saveOrderFromModal(id){
  try{
    await api("/api/admin/orders/"+id,{method:"PUT",body:JSON.stringify({
      status:$("mst").value, paid:$("mpaid").value, cargo_code:$("mcargo").value, address:$("maddr").value
    })});
    closeOrderDetail();
    adminTab("orders");
  }catch(e){ alert(e.message); }
}

let bulkRows = [];
let bulkRowSeq = 0;

function openAddOrders(){
  bulkRows=[]; $("bulkTableBody").innerHTML="";
  addBulkRow(); addBulkRow(); addBulkRow();
  $("addOrdersModal").classList.remove("hidden");
}
function closeAddOrders(){ $("addOrdersModal").classList.add("hidden"); }

function addBulkRow(){
  const id = ++bulkRowSeq;
  bulkRows.push(id);
  const tr = document.createElement("tr");
  tr.id = "brow-"+id;
  tr.innerHTML = `
    <td><input class="b-phone" placeholder="9911xxxx"></td>
    <td><input class="b-name" placeholder="Нэр"></td>
    <td><input class="b-product" placeholder="nike tedil"></td>
    <td><input class="b-size" placeholder="40"></td>
    <td><input class="b-price" type="number" placeholder="150000"></td>
    <td>
      <select class="b-cargo">
        <option value="ground">Газар</option>
      </select>
    </td>
    <td><input class="b-code" placeholder="код"></td>
    <td><button type="button" class="row-x" onclick="removeBulkRow(${id})">✕</button></td>
  `;
  $("bulkTableBody").appendChild(tr);
}

function removeBulkRow(id){
  const el = document.getElementById("brow-"+id);
  if (el) el.remove();
  bulkRows = bulkRows.filter(x=>x!==id);
}

async function submitBulkOrders(){
  const trs = [...document.querySelectorAll("#bulkTableBody tr")];
  const rows = trs.map(tr=>({
    phone: tr.querySelector(".b-phone").value.trim(),
    name: tr.querySelector(".b-name").value.trim(),
    product: tr.querySelector(".b-product").value.trim(),
    size: tr.querySelector(".b-size").value.trim(),
    price: tr.querySelector(".b-price").value,
    cargo_type: tr.querySelector(".b-cargo").value,
    cargo_code: tr.querySelector(".b-code").value.trim()
  })).filter(r=>r.phone);

  if (!rows.length) return alert("Дор хаяж нэг мөрөнд утасны дугаар оруулна уу.");

  try{
    const r = await fetch("/api/admin/orders/bulk", {
      method:"POST",
      headers:{"Content-Type":"application/json", Authorization:"Bearer "+adminToken},
      body: JSON.stringify({rows})
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error||"Алдаа гарлаа");
    alert(`Бүртгэгдсэн: ${d.created}, алгассан: ${d.skipped}`);
    closeAddOrders();
    adminTab("orders");
  }catch(e){ alert(e.message); }
}

function renderOrdersAdminList(os){
  window.__sel = window.__sel || new Set();
  window.__shownIds = os.map(o=>o.id);
  const stOpts=(cur)=>["registered","transport","mongolia","delivered","cancelled"].map(s=>`<option value="${s}" ${cur===s?"selected":""}>${STAGE_NAMES[s]}</option>`).join("");
  $("ordersAdminList").innerHTML = os.length ? `
    <div class="bulk-status-bar ${window.__sel.size?'':'hidden'}" id="bulkBar">
      <b id="selCount">${window.__sel.size} сонгосон</b>
      <select id="bulkStatus">${stOpts("transport")}</select>
      <button class="primary" onclick="applyBulkStatus()">Төлөв солих</button>
      <button class="danger" onclick="deleteSelectedOrders()">🗑 Сонгосныг устгах</button>
      <button type="button" onclick="clearSel()">Болих</button>
    </div>
    <div class="orders-table-wrap ord">
      <table class="orders-table ord">
        <thead><tr>
          <th><input type="checkbox" onchange="toggleSelAll(this.checked)"></th><th>#</th><th>Код</th><th>Хэрэглэгч</th><th>Бараа</th><th>Дүн</th><th>Карго код</th><th>Төлөв</th><th></th>
        </tr></thead>
        <tbody>
          ${os.map((o,i)=>{
            const balance=Math.max(0,Number(o.total||0)-Number(o.paid||0));
            return `<tr>
              <td class="ot-sel"><input type="checkbox" class="ord-sel" ${window.__sel.has(o.id)?"checked":""} onchange="toggleSel(${o.id},this.checked)"></td>
              <td class="ot-num">${i+1}</td>
              <td class="ot-code">${esc(o.order_code)}${o.receipt?' <span class="has-receipt" title="Баримттай">🧾</span>':''}</td>
              <td data-l="Хэрэглэгч">${esc(o.customer_name||"—")}<br><small>${esc(o.customer_phone)}</small></td>
              <td data-l="Бараа" class="ot-items"><small>${(Array.isArray(o.items)?o.items:[]).map(it=>esc(it.name)+(it.size?" ("+esc(it.size)+")":"")+" ×"+it.qty).join(", ")||"—"}</small></td>
              <td data-l="Дүн">${money(o.total)}${balance>0&&o.status!=="cancelled"?`<br><small class="bal-due">үлдэгдэл ${money(balance)}</small> <button type="button" class="mini-pay" onclick="markPaid(${o.id})">Төлсөн</button>`:`<br><small class="bal-ok">${o.status==="cancelled"?"":"төлөгдсөн"}</small>`}</td>
              <td data-l="Карго код"><input class="cargo-inp" value="${esc(o.cargo_code||"")}" placeholder="код" onchange="saveCargoCode(${o.id},this)"></td>
              <td data-l="Төлөв"><select class="status-sel status-${o.status}" onchange="setOrderStatus(${o.id},this.value,this)">${stOpts(o.status)}</select></td>
              <td class="ot-actions">
                <button onclick="openAdminOrderDetail(${o.id})">Засах</button>
                <button class="row-x" onclick="deleteOrderAdmin(${o.id})">✕</button>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  ` : `<p class="muted-note">Захиалга алга байна.</p>`;
}

async function deleteOrderAdmin(id){
  if(!confirm("Энэ захиалгыг устгах уу? Буцаах боломжгүй.")) return;
  try{
    await api("/api/admin/orders/"+id,{method:"DELETE"});
    adminTab("orders");
  }catch(e){ alert(e.message); }
}

function setOrdFilter(f){ window.__ordFilter=f; filterOrdersAdmin(); }
function gotoOrders(f){ window.__ordFilter=f||"all"; adminTab("orders"); }
function filterOrdersAdmin(){
  const all=window.__allOrders||[];
  const f=window.__ordFilter||"all";
  const qEl=$("orderSearch");
  const q=(qEl?qEl.value:"").trim().toLowerCase();
  const due=o=>o.status!=="cancelled" && Number(o.total||0)-Number(o.paid||0)>0;
  const match=o=>f==="all"?true:(f==="unpaid"?due(o):o.status===f);
  const chips=[["all","Бүгд",all.length],["unpaid","Төлбөр дутуу",all.filter(due).length]].concat(
    ["registered","transport","mongolia","delivered","cancelled"].map(s=>[s,STAGE_NAMES[s],all.filter(o=>o.status===s).length]));
  const ce=$("ordFilterChips");
  if(ce) ce.innerHTML=chips.map(([k,l,n])=>`<button type="button" class="fchip ${f===k?"on":""}" onclick="setOrdFilter('${k}')">${l} <b>${n}</b></button>`).join("");
  const filtered=all.filter(o=>match(o) && (!q ||
    (o.customer_phone||"").toLowerCase().includes(q) ||
    (o.customer_name||"").toLowerCase().includes(q) ||
    (o.order_code||"").toLowerCase().includes(q) ||
    (o.cargo_code||"").toLowerCase().includes(q)));
  renderOrdersAdminList(filtered);
}
async function markPaid(id){
  const o=(window.__allOrders||[]).find(x=>x.id==id); if(!o) return;
  try{
    await api("/api/admin/orders/"+id,{method:"PUT",body:JSON.stringify({paid:Number(o.total||0)})});
    o.paid=Number(o.total||0); filterOrdersAdmin();
  }catch(e){ alert(e.message); }
}
async function saveCargoCode(id,el){
  const o=(window.__allOrders||[]).find(x=>x.id==id); if(!o) return;
  const v=el.value.trim(); if(v===(o.cargo_code||"")) return;
  try{
    await api("/api/admin/orders/"+id,{method:"PUT",body:JSON.stringify({cargo_code:v})});
    o.cargo_code=v; el.classList.add("saved"); setTimeout(()=>el.classList.remove("saved"),900);
  }catch(e){ alert(e.message); el.value=o.cargo_code||""; }
}

function renderCustomersTable(list){
  if(!list.length) return `<p class="muted-note">Хэрэглэгч алга байна.</p>`;
  return `<div class="orders-table-wrap">
    <table class="orders-table">
      <thead><tr><th>#</th><th>Утасны дугаар</th><th>Нэр</th></tr></thead>
      <tbody>
        ${list.map((c,i)=>`<tr><td>${i+1}</td><td class="ot-code">${esc(c.phone)}</td><td>${esc(c.name||"—")}</td></tr>`).join("")}
      </tbody>
    </table>
  </div>`;
}

function filterCustomers(){
  const q=$("custSearch").value.trim().toLowerCase();
  const filtered=(window.__allCustomers||[]).filter(c=>
    (c.phone||"").toLowerCase().includes(q) || (c.name||"").toLowerCase().includes(q)
  );
  $("customersList").innerHTML = renderCustomersTable(filtered);
}

async function importOrders(input){
  const file=input.files[0]; if(!file) return;
  const fd=new FormData(); fd.append("file",file);
  try{
    const r=await fetch("/api/admin/orders/import",{method:"POST",headers:{Authorization:"Bearer "+adminToken},body:fd});
    const d=await r.json();
    if(!r.ok) throw Error(d.error||"Импорт хийхэд алдаа гарлаа");
    alert(`Импортлогдсон: ${d.imported}, алгассан: ${d.skipped||0}`);
    input.value="";
    closeAddOrders();
    adminTab("orders");
  }catch(e){alert(e.message)}
}

async function addProduct(){
  const sizes = collectSizeRows();
  const stock = sizes.length ? sizes.reduce((s,x)=>s+x.qty,0) : Number($("pst").value)||0;
  const url="/api/admin/products", method="POST";
  if(!$("pn").value.trim()) return alert("Барааны нэр оруулна уу.");
  try{ await api(url,{method,body:JSON.stringify({
    name:$("pn").value,
    price:$("pp").value,
    price_krw:$("pkrw").value,
    stock,
    category:$("pc").value,
    brand:$("pbrand").value,
    image:pendingImages[0]||"",
    images:pendingImages,
    pickup:$("ppickup").value,
    old_price:$("pold").value,
    cargo_included:$("pcargo").checked,
    featured:$("pfeat").checked,
    description:$("pd").value,
    sizes
  })}); }catch(e){ return alert(e.message); }
  pendingImages=[]; editingProductId=null;
  adminTab("products");
  loadProducts();
}
let editImages=[];
function openEditProduct(id){
  const p=(window.__allProducts||[]).find(x=>x.id==id); if(!p) return;
  editingProductId=id;
  const set=(k,v)=>{ $("e_"+k).value=v??""; };
  set("name",p.name); set("price",p.price); set("krw",p.price_krw||""); set("old",Number(p.old_price)>0?p.old_price:"");
  set("cat",p.category||"order"); set("brand",p.brand||""); set("pickup",p.pickup||""); set("desc",p.description||"");
  $("e_cargo").checked=!!p.cargo_included; $("e_feat").checked=!!p.featured;
  $("e_sizes").innerHTML="";
  const sz=Array.isArray(p.sizes)?p.sizes:[];
  sz.forEach(s=>addEditSizeRow(s.size,s.qty));
  set("stock",sz.length?"":(p.stock||""));
  editImages=(Array.isArray(p.images)&&p.images.length?p.images:(p.image?[p.image]:[])).slice(0,6);
  renderEditImages();
  $("e_title").textContent="✏️ "+(p.name||"Бараа засах");
  $("editProductModal").classList.remove("hidden");
}
function closeEditProduct(){ editingProductId=null; $("editProductModal").classList.add("hidden"); }
function addEditSizeRow(size="",qty=""){
  const row=document.createElement("div");
  row.className="admin-row size-row";
  row.innerHTML=`<input placeholder="Хэмжээ" class="size-size" value="${esc(size)}"><input type="number" placeholder="Тоо" class="size-qty" value="${esc(qty)}"><button type="button" class="size-remove" onclick="this.parentElement.remove()">✕</button>`;
  $("e_sizes").appendChild(row);
}
function renderEditImages(){
  $("e_preview").innerHTML=editImages.map((u,i)=>
    `<div class="thumb-wrap"><img src="${u}"><button type="button" class="thumb-x" onclick="editImages.splice(${i},1);renderEditImages()">×</button>${i===0?'<span class="thumb-main">үндсэн</span>':''}</div>`).join("");
}
async function uploadEditImages(input){
  const files=[...input.files].slice(0,6); if(!files.length) return;
  const fd=new FormData(); files.forEach(f=>fd.append("images",f));
  const btn=input.closest(".file-btn"); if(btn) btn.classList.add("uploading");
  try{
    const r=await fetch("/api/admin/upload-many",{method:"POST",headers:{Authorization:"Bearer "+adminToken},body:fd});
    const d=await r.json(); if(!r.ok) throw Error(d.error||"Зураг оруулахад алдаа гарлаа");
    editImages=[...editImages,...d.urls].slice(0,6); renderEditImages();
  }catch(e){alert(e.message)} finally{ if(btn) btn.classList.remove("uploading"); input.value=""; }
}
async function saveEditProduct(){
  if(!editingProductId) return;
  const name=$("e_name").value.trim(); if(!name) return alert("Барааны нэр оруулна уу.");
  const sizes=[...document.querySelectorAll("#e_sizes .size-row")]
    .map(r=>({size:r.querySelector(".size-size").value.trim(),qty:Number(r.querySelector(".size-qty").value)||0})).filter(s=>s.size);
  const stock=sizes.length?sizes.reduce((s,x)=>s+x.qty,0):Number($("e_stock").value)||0;
  const orig=(window.__allProducts||[]).find(x=>x.id==editingProductId)||{};
  try{
    await api("/api/admin/products/"+editingProductId,{method:"PUT",body:JSON.stringify({...orig,
      name,price:$("e_price").value,price_krw:$("e_krw").value,old_price:$("e_old").value,
      category:$("e_cat").value,brand:$("e_brand").value,pickup:$("e_pickup").value,description:$("e_desc").value,
      cargo_included:$("e_cargo").checked,featured:$("e_feat").checked,
      image:editImages[0]||"",images:editImages,sizes,stock})});
  }catch(e){ return alert(e.message); }
  closeEditProduct(); adminTab("products"); loadProducts();
}
function editProduct(id){ openEditProduct(id); }
async function deleteProduct(id){if(!confirm("Устгах уу?"))return;await api("/api/admin/products/"+id,{method:"DELETE"});adminTab("products");loadProducts()}
async function saveOrder(id){await api("/api/admin/orders/"+id,{method:"PUT",body:JSON.stringify({status:$("st"+id).value,paid:$("paid"+id).value,cargo_code:$("cargo"+id).value,address:$("addr"+id).value})});alert("Захиалга шинэчлэгдлээ");adminTab("orders")}
async function saveSettings(){await api("/api/admin/settings",{method:"PUT",body:JSON.stringify({storeName:$("sn").value,phone:$("sphone").value,groundCargo:$("ground").value,bankName:$("bank").value,bankAccount:$("acct").value,bankHolder:$("holder").value,instagram:$("ig").value,facebook:$("fb").value,announcement:$("ann").value})});alert("Хадгалагдлаа");init()}

init().catch(console.error);renderCart();


function toggleSel(id,on){
  window.__sel=window.__sel||new Set();
  on?window.__sel.add(id):window.__sel.delete(id);
  refreshSelBar();
}
function refreshSelBar(){
  const c=$("selCount"); if(c) c.textContent=window.__sel.size+" сонгосон";
  const b=$("bulkBar"); if(b) b.classList.toggle("hidden", !window.__sel.size);
}
function clearSel(){
  window.__sel=new Set();
  document.querySelectorAll(".ord-sel").forEach(cb=>cb.checked=false);
  const all=document.querySelector(".orders-table thead input[type=checkbox]"); if(all) all.checked=false;
  refreshSelBar();
}
async function deleteSelectedOrders(){
  const ids=[...(window.__sel||[])];
  if(!ids.length) return;
  if(!confirm(ids.length+" захиалгыг УСТГАХ уу? Буцаах боломжгүй.")) return;
  try{
    await Promise.all(ids.map(id=>api("/api/admin/orders/"+id,{method:"DELETE"})));
    window.__sel=new Set();
    adminTab("orders");
  }catch(e){ alert(e.message); }
}
function toggleSelAll(on){
  (window.__shownIds||[]).forEach(id=>on?window.__sel.add(id):window.__sel.delete(id));
  document.querySelectorAll(".ord-sel").forEach(cb=>cb.checked=on);
  refreshSelBar();
}
async function setOrderStatus(id,status,el){
  try{
    await api("/api/admin/orders/"+id,{method:"PUT",body:JSON.stringify({status})});
    const o=(window.__allOrders||[]).find(x=>x.id==id); if(o) o.status=status;
    if(el) el.className="status-sel status-"+status;
  }catch(e){ alert(e.message); }
}
async function applyBulkStatus(){
  const ids=[...(window.__sel||[])];
  if(!ids.length) return alert("Захиалга сонгоно уу.");
  const status=$("bulkStatus").value;
  if(!confirm(ids.length+" захиалгыг \""+STAGE_NAMES[status]+"\" болгох уу?")) return;
  try{
    await Promise.all(ids.map(id=>api("/api/admin/orders/"+id,{method:"PUT",body:JSON.stringify({status})})));
    window.__sel=new Set();
    adminTab("orders");
  }catch(e){ alert(e.message); }
}


/* ---------------- Customer login ---------------- */
let authModeNow="login";
function openAuth(){
  $("authModal").classList.remove("hidden");
  refreshAuthUi();
}
function closeAuth(){ $("authModal").classList.add("hidden"); }
function authMode(m){
  authModeNow=m;
  $("tabLogin").classList.toggle("active",m==="login");
  $("tabRegister").classList.toggle("active",m==="register");
  $("authName").classList.toggle("hidden",m!=="register");
  $("authSubmit").textContent=m==="login"?"Нэвтрэх":"Бүртгүүлэх";
  $("authTitle").textContent=m==="login"?"Нэвтрэх":"Бүртгүүлэх";
  $("authPass").autocomplete=m==="login"?"current-password":"new-password";
}
function refreshAuthUi(){
  const on=!!(userToken&&user);
  $("authLoggedOut").classList.toggle("hidden",on);
  $("authLoggedIn").classList.toggle("hidden",!on);
  if(on){
    $("authTitle").textContent="Миний бүртгэл";
    $("authUserName").textContent=user.name||user.phone;
    $("authUserPhone").textContent=user.phone;
  } else authMode(authModeNow);
  const b=$("userBtn"); if(b) b.classList.toggle("logged-in",on);
  const l=$("userBtnLabel"); if(l) l.textContent=on?(user.name||user.phone):"Нэвтрэх";
  const cta=$("loginCta"); if(cta) cta.classList.toggle("hidden",on);
}
async function submitAuth(){
  const phone=$("authPhone").value.trim(), password=$("authPass").value, name=$("authName").value.trim();
  if(!phone||!password) return alert("Утас, нууц үгээ оруулна уу.");
  try{
    const d=await api(authModeNow==="login"?"/api/auth/login":"/api/auth/register",{method:"POST",body:JSON.stringify({phone,password,name})});
    userToken=d.token; user={phone:d.phone,name:d.name||""};
    try{ localStorage.setItem("moode_user_token",userToken); localStorage.setItem("moode_user",JSON.stringify(user)); }catch(_){}
    $("authPass").value="";
    refreshAuthUi();
    closeAuth();
    showMyOrders(true);
  }catch(e){ alert(e.message); }
}
function logoutUser(){
  userToken=""; user=null;
  try{ localStorage.removeItem("moode_user_token"); localStorage.removeItem("moode_user"); }catch(_){}
  myOrders=[]; $("ordersSection").classList.add("hidden");
  refreshAuthUi(); closeAuth();
}
async function showMyOrders(scroll){
  if(!userToken) return;
  try{
    const r=await fetch("/api/me",{headers:{Authorization:"Bearer "+userToken}});
    if(r.status===401){ logoutUser(); return; }
    const d=await r.json();
    if(!r.ok) throw Error(d.error||"Алдаа");
    if(d.name && user && d.name!==user.name){ user.name=d.name; try{localStorage.setItem("moode_user",JSON.stringify(user));}catch(_){} }
    myOrders=d.orders||[];
    $("ordersSection").classList.remove("hidden");
    $("orders").innerHTML=myOrders.length?myOrders.map((o,i)=>orderCard(o,i)).join(""):`<div class="admin-card">Одоогоор захиалга алга байна.</div>`;
    if(scroll) $("ordersSection").scrollIntoView({behavior:"smooth"});
  }catch(e){ if(scroll) alert(e.message); }
}
function prefillCheckout(){
  if(!user) return;
  if($("customerName") && !$("customerName").value) $("customerName").value=user.name||"";
  if($("customerPhone") && !$("customerPhone").value) $("customerPhone").value=user.phone||"";
}
refreshAuthUi(); if(userToken) showMyOrders(false);


async function duplicateProduct(id){
  const p=(window.__allProducts||[]).find(x=>x.id==id); if(!p) return;
  const {id:_i,created_at:_c,...copy}=p;
  copy.name=(p.name||"")+" (хуулбар)";
  try{
    await api("/api/admin/products",{method:"POST",body:JSON.stringify(copy)});
    adminTab("products");
  }catch(e){ alert(e.message); }
}


async function toggleProd(id,key){
  const p=(window.__allProducts||[]).find(x=>x.id==id); if(!p) return;
  try{
    await api("/api/admin/products/"+id,{method:"PUT",body:JSON.stringify({...p,[key]:!p[key]})});
    adminTab("products"); loadProducts();
  }catch(e){ alert(e.message); }
}
async function setOldPrice(id){
  const p=(window.__allProducts||[]).find(x=>x.id==id); if(!p) return;
  const v=prompt("Хуучин үнэ ₮ (одоогийн үнэ "+money(p.price)+"). Хямдралыг арилгах бол 0 оруулна.", p.old_price||"");
  if(v===null) return;
  try{
    await api("/api/admin/products/"+id,{method:"PUT",body:JSON.stringify({...p,old_price:Number(v)||0})});
    adminTab("products"); loadProducts();
  }catch(e){ alert(e.message); }
}

/* ---------------- Payment block in cart ---------------- */
function payAmount(){
  const items=cart.reduce((s,x)=>s+x.price*x.qty,0);
  return items + (typeof checkoutMode==="function" && checkoutMode()==="mn_direct" ? 7000 : 0);
}
function copyBtn(v,label){ return `<button type="button" class="copy-btn" onclick="copyAccount(event,'${esc(String(v))}')">${label||"Хуулах"}</button>`; }
function renderPayBlock(){
  const el=$("payBlock"); if(!el) return;
  if(!cart.length){ el.innerHTML=""; return; }
  const phone=($("customerPhone")?.value||"").trim();
  const memo=`<div class="pay-row memo"><span>Гүйлгээний утга</span><b>${phone?esc(phone):"Таны утасны дугаар"}</b>${phone?copyBtn(phone):""}</div>
    <div class="pay-warn">⚠️ Гүйлгээний утга дээр <b>утасны дугаараа заавал</b> бичнэ үү!</div>`;
  if(checkoutMode()==="kr_direct"){
    const acct="1002861393082";
    const allKrw=cart.every(x=>Number(x.price_krw)>0);
    const krw=cart.reduce((s,x)=>s+(Number(x.price_krw)||0)*x.qty,0)+4500;
    el.innerHTML=`<div class="pay-card">
      <div class="pay-bank">💳 우리 банк (Солонгос данс ₩)</div>
      <div class="pay-row"><span>Данс</span><b class="acct-num">${acct}</b>${copyBtn(acct)}</div>
      <div class="pay-row"><span>Хүлээн авагч</span><b>Ganbold ENKHTSATSRALT</b></div>
      ${allKrw?`<div class="pay-row"><span>Дүн</span><b class="pay-amt">${won(krw)}</b>${copyBtn(krw)}</div>`:""}
      <div class="pay-warn">🚚 Барааны үнэ дээр нэмээд <b>тээврийн 4,500₩</b> нэмж шилжүүлнэ үү${allKrw?" (дүнд орсон)":""}.</div>
      ${memo}
    </div>`;
    return;
  }
  const acct=settings.bankAccount||"";
  el.innerHTML=`<div class="pay-card">
    <div class="pay-bank">${esc(settings.bankName||"Банк")}</div>
    <div class="pay-row"><span>Данс</span><b class="acct-num">${esc(acct||"—")}</b>${acct?copyBtn(acct):""}</div>
    <div class="pay-row"><span>Хүлээн авагч</span><b>${esc(settings.bankHolder||"—")}</b></div>
    <div class="pay-row"><span>Дүн</span><b class="pay-amt">${money(payAmount())}</b>${copyBtn(payAmount())}</div>
    ${memo}
  </div>`;
}

if("serviceWorker" in navigator){ window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{})); }

/* ---------------- Welcome popup ---------------- */
function closeWelcome(){ $("welcomeModal").classList.add("hidden"); }
function welcomeGo(what){
  closeWelcome();
  if(what==="track"){ scrollToMyOrders(); return; }
  if(what==="order"){ const t=$("typeTabs"); t.classList.remove("pulse"); void t.offsetWidth; t.classList.add("pulse"); setTimeout(()=>t.classList.remove("pulse"),2600); }
  if(what==="kr"){ window.__preferKr=true; selectType("ready"); }
  setTimeout(()=>{
    const target = what==="kr" ? ($("sec-kr")||$("typeTabs")) : $("typeTabs");
    target.scrollIntoView({behavior:"smooth",block:"start"});
  },80);
}
(function(){
  try{
    if(new URLSearchParams(location.search).get("p")) return;
    if(sessionStorage.getItem("moode_welcome")) return;
    sessionStorage.setItem("moode_welcome","1");
  }catch(e){}
  window.addEventListener("load",()=>setTimeout(()=>{ const m=$("welcomeModal"); if(m) m.classList.remove("hidden"); },400));
})();
