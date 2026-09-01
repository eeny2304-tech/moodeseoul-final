let products=[], cart=[], adminToken=localStorage.getItem("moode_admin_token")||"", settings={};
let myOrders=[];

const $=id=>document.getElementById(id);
const CATEGORY_LABELS = { mn_belen:"Монголд бэлэн", kr_belen:"Солонгост бэлэн", order:"Захиалгийн бараа" };
const STAGE_NAMES = { registered:"Бүртгэгдсэн", transport:"Каргонд өгсөн", mongolia:"Монголд буусан", cancelled:"Цуцлагдсан" };

async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{"Content-Type":"application/json",...(opts.headers||{}),...(adminToken?{Authorization:"Bearer "+adminToken}:{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Алдаа");return d}
function money(n){return Number(n||0).toLocaleString("mn-MN")+"₮"}
function won(n){return Number(n||0).toLocaleString("mn-MN")+"₩"}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}

async function init(){const s=await api("/api/settings");settings=s;$("brandName").textContent=s.storeName;$("footerName").textContent=s.storeName;$("footerPhone").textContent=s.phone;$("announce").textContent=s.announcement;$("airDays").textContent=s.airCargo;$("groundDays").textContent=s.groundCargo;loadProducts()}

/* ---------------- Storefront products ---------------- */

function productCardHtml(p){
  const sizes = Array.isArray(p.sizes) ? p.sizes : [];
  const hasSizes = sizes.length > 0;
  const totalStock = hasSizes ? sizes.reduce((s,sz)=>s+(Number(sz.qty)||0),0) : Number(p.stock||0);
  const sizeOptions = hasSizes ? sizes.map(sz=>`<option value="${esc(sz.size)}" ${Number(sz.qty)<=0?"disabled":""}>${esc(sz.size)} ${Number(sz.qty)<=0?"(дууссан)":"("+sz.qty+")"}</option>`).join("") : "";
  const catLabel = CATEGORY_LABELS[p.category] || "";

  const imgs = (Array.isArray(p.images) && p.images.length) ? p.images : (p.image ? [p.image] : []);
  const cover = imgs[0] || 'https://placehold.co/600x600?text=MOODE+SEOUL';
  return `<article class="product">
    <div class="product-media" onclick="openProductModal(${p.id})">
      <img src="${cover}">
      ${imgs.length>1?`<span class="img-count">📷 ${imgs.length}</span>`:""}
    </div>
    <div class="p">
      ${catLabel?`<span class="cat-badge cat-${esc(p.category)}">${catLabel}</span>`:""}
      <h3 onclick="openProductModal(${p.id})">${esc(p.name)}</h3>
      <div class="price">${money(p.price)}</div>
      ${Number(p.price_krw)>0?`<div class="price-krw">${won(p.price_krw)}</div>`:""}
      ${hasSizes?`<select class="size-select" id="size-${p.id}">${sizeOptions}</select>`:""}
      <div class="stock">${totalStock>0?"Бэлэн: "+totalStock:"Дууссан"}</div>
      <button ${totalStock<=0?"disabled":""} onclick="addCart(${p.id})">${totalStock<=0?"Дууссан":"Сагсанд нэмэх"}</button>
      <button class="detail-btn" onclick="openProductModal(${p.id})">Дэлгэрэнгүй</button>
    </div>
  </article>`;
}

async function loadProducts(){
  products=await api("/api/products");
  $("products").innerHTML = products.length ? products.map(productCardHtml).join("") : `<div class="admin-card">Одоогоор бараа нэмэгдээгүй байна.</div>`;
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
  $("cartCount").textContent=cart.reduce((s,x)=>s+x.qty,0);
  $("cartItems").innerHTML=cart.length
    ? cart.map(x=>`<div class="cart-item"><span>${esc(x.name)}${x.size?` (${esc(x.size)})`:""} × ${x.qty}</span><b>${money(x.price*x.qty)}</b></div>`).join("")+`<h3>Нийт: ${money(cart.reduce((s,x)=>s+x.price*x.qty,0))}</h3>`
    : `<p>Сагс хоосон байна.</p>`;
}
function openCart(){$("cart").classList.remove("hidden");renderCart();updateCargoBranches()} function closeCart(){$("cart").classList.add("hidden")}

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

function openProductModal(id){
  const p=products.find(x=>x.id==id); if(!p) return;
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
      <b>${money(p.price)}</b>
      ${Number(p.price_krw)>0?`<span class="pm-krw">${won(p.price_krw)}</span>`:""}
    </div>
    ${sizes.length?`
      <h3 class="section-sub">Хэмжээ ба үлдэгдэл</h3>
      <div class="pm-sizes">${sizes.map(sz=>`<span class="pm-size ${Number(sz.qty)<=0?'is-out':''}">${esc(sz.size)} · ${Number(sz.qty)>0?sz.qty+' ширхэг':'дууссан'}</span>`).join("")}</div>
    `:`<p class="pm-stock">${totalStock>0?"Бэлэн: "+totalStock+" ширхэг":"Дууссан"}</p>`}
    ${p.description?`<h3 class="section-sub">Тайлбар</h3><p class="pm-desc">${esc(p.description)}</p>`:""}
    <div class="pm-cargo">
      <b>🚚 Каргоны төлбөр тусдаа</b>
      <p>Барааны үнэ болон каргоны төлбөр тусдаа. Бараа Монголд ирсний дараа карго тантай холбогдож, та каргоны төлбөрөө төлөөд бараагаа авна.</p>
      ${p.pickup?`<p class="pm-pickup"><b>📍 Авах цэг:</b> ${esc(p.pickup)}</p>`:""}
    </div>
    <button class="primary" ${totalStock<=0?"disabled":""} onclick="addCartFromModal(${p.id})">${totalStock<=0?"Дууссан":"Сагсанд нэмэх"}</button>
  `;
  $("productModal").classList.remove("hidden");
}

function renderPmGallery(){
  $("pmGallery").innerHTML=`
    ${pmImages.length>1?`<button class="pm-nav pm-prev" onclick="pmMove(-1)">‹</button>`:""}
    <img src="${pmImages[pmIndex]}" alt="">
    ${pmImages.length>1?`<button class="pm-nav pm-next" onclick="pmMove(1)">›</button>`:""}
  `;
  $("pmThumbs").innerHTML = pmImages.length>1
    ? pmImages.map((u,i)=>`<img class="pm-thumb ${i===pmIndex?'active':''}" src="${u}" onclick="pmGo(${i})">`).join("")
    : "";
}
function pmMove(step){ pmIndex=(pmIndex+step+pmImages.length)%pmImages.length; renderPmGallery(); }
function pmGo(i){ pmIndex=i; renderPmGallery(); }
function closeProductModal(){ $("productModal").classList.add("hidden"); }

function addCartFromModal(id){
  closeProductModal();
  addCart(id);
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

const CARGO_BRANCHES = {
  air: [
    {name:"1-р салбар — Баянгол дүүрэг (БГД)", detail:"3,4-р хороолол (Таван-эрдэнэ) хүнсний захын хажууд, 44-р байрны 1 давхарт · 11-360880"},
    {name:"2-р салбар — Сонгинохайрхан дүүрэг (СХД)", detail:"1-р хороолол (Сапоро \"Хаан банк\"-ны баруун талд), Цамбагярав 6-р байрны 1 давхарт · 7018-3765"},
    {name:"3-р салбар — Баянзүрх дүүрэг (БЗД)", detail:"Сансар (Сансарын Түйн дээгүүр \"Алтан жолоо\" группийн урд), 2 давхар байрны 2 давхарт · 11-457186"},
    {name:"4-р салбар — Хан-Уул дүүрэг (ХУД)", detail:"Хоум Плазалийн баруун талд, Төв цэнгэлдэхийн хашааны дотор, урд хийнүүр 9-р павильон · 11-301710"},
    {name:"5-р салбар — Хан-Уул дүүрэг (ХУД)", detail:"Нисэхийн-Сонсголон колонкийн зүүн эргэт иржийн Нисэхийн Удирдах газрын дэргэд МК Төв · 7277-9999"}
  ],
  ground: [
    {name:"Oneway Cargo", detail:"БГД, 3-р эмнэлгийн хойно \"Ачтан\" эмнэлгийн баруун талд, 4 давхар тоосгон байрлагын 1 давхарт · 8601-9921 / 8602-9921"}
  ]
};

function updateCargoBranches(){
  const type=$("cargoType").value;
  const list=CARGO_BRANCHES[type]||[];
  $("cargoBranchSelect").innerHTML=list.map(b=>`<option value="${esc(b.name)} — ${esc(b.detail)}">${esc(b.name)}</option>`).join("");
}

async function submitOrder(){
  if(!cart.length)return alert("Сагс хоосон байна.");
  const phone=$("customerPhone").value.trim();
  if(!phone)return alert("Утасны дугаараа оруулна уу.");
  const total=cart.reduce((s,x)=>s+x.price*x.qty,0);
  const branch=$("cargoBranchSelect").value;
  try{
    const o=await api("/api/orders",{method:"POST",body:JSON.stringify({customer_phone:phone,customer_name:$("customerName").value,address:branch,cargo_type:$("cargoType").value,total,items:cart.map(x=>({product_id:x.id,name:x.name,qty:x.qty,price:x.price,size:x.size,image:x.image}))})});
    cart=[];
    closeCart();
    $("trackInput").value=phone;
    showOrderSuccess(o.order_code);
    trackOrders();
    loadProducts();
  }catch(e){alert(e.message)}
}

function showOrderSuccess(code){
  $("successCode").textContent=code;
  $("successBankName").textContent=settings.bankName||"—";
  $("successBankAccount").textContent=settings.bankAccount||"—";
  $("successBankHolder").textContent=settings.bankHolder||"—";
  $("orderSuccessModal").classList.remove("hidden");
}
function closeOrderSuccess(){$("orderSuccessModal").classList.add("hidden")}

function filterProducts(){
  const q=$("productSearch").value.trim().toLowerCase();
  const filtered = q ? products.filter(p=>(p.name||"").toLowerCase().includes(q)) : products;
  $("products").innerHTML = filtered.length ? filtered.map(productCardHtml).join("") : `<div class="admin-card">Хайлтад тохирох бараа олдсонгүй.</div>`;
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

function orderCard(o,i){
  const items=Array.isArray(o.items)?o.items:(typeof o.items==="string"?JSON.parse(o.items):[]);
  const stages=["registered","transport","mongolia"];
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
        <p>${o.cargo_type==="air"?"✈️ Агаар 5-7 хоног":"🚚 Газар 14-16 хоног"} ${o.cargo_code?`· Код: <b>${esc(o.cargo_code)}</b>`:""}</p>
      </div>
    </div>

    ${stageHtml}
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
      <div><span>Хүргэлт</span><b>${o.cargo_type==="air"?"Агаар 5-7 хоног":"Газар 14-16 хоног"}</b></div>
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

      const counts={registered:0,transport:0,mongolia:0,cancelled:0};
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

      $("adminContent").innerHTML=`<h2>Хяналтын самбар</h2>
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
            <select id="pc">
              <option value="mn_belen">Монголд бэлэн</option>
              <option value="kr_belen">Солонгост бэлэн</option>
              <option value="order">Захиалгийн бараа</option>
            </select>
          </div>
          <input id="ppickup" placeholder="📍 Авах цэг (жиш: Улаанбаатар, Драгон карго)">

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

        <h3 class="section-sub">⚡ Түргэн бүртгэл</h3>
        <p class="muted-note">Spreadsheet-с шууд хуулж тавьж болно — мөр бүр нэг захиалга.</p>
        <div class="bulk-table-wrap">
          <table class="bulk-table" id="bulkTable">
            <thead><tr>
              <th>Утас</th><th>Нэр</th><th>Бараа</th><th>Хэмжээ</th><th>Үнэ</th><th>Карго</th><th>Код</th><th></th>
            </tr></thead>
            <tbody id="bulkTableBody"></tbody>
          </table>
        </div>
        <div class="admin-row">
          <button type="button" class="file-btn" onclick="addBulkRow()">+ Мөр нэмэх</button>
          <button class="primary" onclick="submitBulkOrders()">Бүх мөрийг бүртгэх</button>
        </div>

        <h3 class="section-sub">Эсвэл Excel файлаар</h3>
        <label class="file-btn">📥 Excel-ээс импортлох (FB захиалгууд)<input type="file" id="importFile" accept=".xlsx,.xls" onchange="importOrders(this)"></label>
        <p class="muted-note">Толгой мөр шаардлагагүй. Баганы дараалал: Нэр → Утас → Бараа → Хэмжээ → Үнэ → Карго (Air/Ground). Систем утасны дугаарыг олж, түүнийг тойрсон баганаас автоматаар танина.</p>

        <h3 class="section-sub">Захиалгын жагсаалт</h3>
        <div id="ordersAdminList"></div>`;
      renderOrdersAdminList(os);
      bulkRows=[];
      addBulkRow(); addBulkRow(); addBulkRow();
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
      $("adminContent").innerHTML=`<h2>Дэлгүүрийн тохиргоо</h2><div class="admin-row"><input id="sn" value="${esc(s.storeName)}" placeholder="Нэр"><input id="sphone" value="${esc(s.phone)}" placeholder="Утас"><input id="air" value="${esc(s.airCargo)}" placeholder="Агаар"><input id="ground" value="${esc(s.groundCargo)}" placeholder="Газар"><input id="bank" value="${esc(s.bankName)}" placeholder="Банк"><input id="acct" value="${esc(s.bankAccount)}" placeholder="Данс"><input id="holder" value="${esc(s.bankHolder)}" placeholder="Данс эзэмшигч"><input id="ig" value="${esc(s.instagram)}" placeholder="Instagram"><input id="fb" value="${esc(s.facebook)}" placeholder="Facebook"></div><textarea id="ann">${esc(s.announcement)}</textarea><button class="primary" onclick="saveSettings()">Хадгалах</button><h3>Odoo</h3><p>Railway-ийн Variables хэсэгт ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, ODOO_ENABLED=true тохируулж болно.</p>`;
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
        <small>${esc(CATEGORY_LABELS[p.category]||p.category||"Ангилалгүй")}</small>
        ${p.sizes && p.sizes.length ? `<br><small>Хэмжээ: ${p.sizes.map(s=>`${esc(s.size)}(${s.qty})`).join(", ")}</small>` : ""}
        <br><button onclick="editProduct(${p.id})">Засах</button> <button onclick="deleteProduct(${p.id})">Устгах</button>
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
  const allBranches = window.__allBranches || [...CARGO_BRANCHES.air, ...CARGO_BRANCHES.ground];

  $("orderDetailContent").innerHTML=`
    <p class="success-code">Захиалгын код<br><b>${esc(o.order_code)}</b></p>
    <div class="success-bank">
      <div><span>Огноо</span><b>${esc(created)}</b></div>
      <div><span>Нэр</span><b>${esc(o.customer_name||"—")}</b></div>
      <div><span>Утас</span><b>${esc(o.customer_phone)}</b></div>
      <div><span>Нийт үнэ</span><b>${money(o.total)}</b></div>
      <div><span>Үлдэгдэл</span><b class="${balance>0?'bal-due':''}">${money(balance)}</b></div>
      <div><span>Хүргэлт</span><b>${o.cargo_type==="air"?"Агаар 5-7 хоног":"Газар 14-16 хоног"}</b></div>
      ${o.note?`<div><span>Тэмдэглэл</span><b>${esc(o.note)}</b></div>`:""}
    </div>
    <h3 class="section-sub">Бараанууд</h3>
    ${items.map(it=>`<div class="admin-card"><b>${esc(it.name)}</b>${it.size?` · Хэмжээ: ${esc(it.size)}`:""} · ${it.qty} ширхэг · ${money(it.price)}</div>`).join("")}

    <h3 class="section-sub">Засах</h3>
    <div class="admin-row">
      <select id="mst">${["registered","transport","mongolia","cancelled"].map(s=>`<option ${o.status===s?"selected":""} value="${s}">${STAGE_NAMES[s]||s}</option>`).join("")}</select>
      <input id="mpaid" type="number" value="${o.paid||0}" placeholder="Төлсөн дүн">
    </div>
    <div class="admin-row">
      <input id="mcargo" value="${esc(o.cargo_code||"")}" placeholder="Карго код">
      <select id="maddr">
        <option value="">— Карго салбар сонгох —</option>
        ${allBranches.map(b=>`<option value="${esc(b.name)} — ${esc(b.detail)}" ${o.address && o.address.startsWith(b.name) ? "selected":""}>${esc(b.name)}</option>`).join("")}
      </select>
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
        <option value="air">Агаар</option>
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
    adminTab("orders");
  }catch(e){ alert(e.message); }
}

function renderOrdersAdminList(os){
  window.__allBranches = window.__allBranches || [...CARGO_BRANCHES.air, ...CARGO_BRANCHES.ground];
  $("ordersAdminList").innerHTML = os.length ? `
    <div class="orders-table-wrap">
      <table class="orders-table">
        <thead><tr>
          <th>#</th><th>Код</th><th>Хэрэглэгч</th><th>Дүн</th><th>Төлөв</th><th></th>
        </tr></thead>
        <tbody>
          ${os.map((o,i)=>{
            const balance=Math.max(0,Number(o.total||0)-Number(o.paid||0));
            return `<tr>
              <td>${i+1}</td>
              <td class="ot-code">${esc(o.order_code)}</td>
              <td>${esc(o.customer_name||"—")}<br><small>${esc(o.customer_phone)}</small></td>
              <td>${money(o.total)}${balance>0?`<br><small class="bal-due">үлдэгдэл ${money(balance)}</small>`:`<br><small class="bal-ok">төлөгдсөн</small>`}</td>
              <td><span class="badge status-${o.status}">${STAGE_NAMES[o.status]||o.status}</span></td>
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

function filterOrdersAdmin(){
  const q=$("orderSearch").value.trim().toLowerCase();
  const filtered=(window.__allOrders||[]).filter(o=>
    (o.customer_phone||"").toLowerCase().includes(q) ||
    (o.customer_name||"").toLowerCase().includes(q) ||
    (o.order_code||"").toLowerCase().includes(q)
  );
  renderOrdersAdminList(filtered);
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
    adminTab("orders");
  }catch(e){alert(e.message)}
}

async function addProduct(){
  const sizes = collectSizeRows();
  const stock = sizes.length ? sizes.reduce((s,x)=>s+x.qty,0) : Number($("pst").value)||0;
  await api("/api/admin/products",{method:"POST",body:JSON.stringify({
    name:$("pn").value,
    price:$("pp").value,
    price_krw:$("pkrw").value,
    stock,
    category:$("pc").value,
    image:pendingImages[0]||"",
    images:pendingImages,
    pickup:$("ppickup").value,
    description:$("pd").value,
    sizes
  })});
  pendingImages=[];
  adminTab("products");
  loadProducts();
}
async function editProduct(id){
  const p=(await api("/api/admin/products")).find(x=>x.id==id); if(!p)return;
  const name=prompt("Барааны нэр",p.name); if(name===null)return;
  const price=prompt("Үнэ",p.price);
  const image=prompt("Зураг URL",p.image||"");

  let sizes=p.sizes||[];
  if(sizes.length){
    const newSizes=[];
    for(const s of sizes){
      const qty=prompt(`"${s.size}" хэмжээний шинэ тоо ширхэг`, s.qty);
      if(qty===null) return; // cancelled — abort without saving
      newSizes.push({size:s.size, qty:Number(qty)||0});
    }
    const addMore=confirm("Шинэ хэмжээ нэмэх үү?");
    if(addMore){
      let addingMore=true;
      while(addingMore){
        const sizeName=prompt("Шинэ хэмжээ (жиш: 43)");
        if(!sizeName) break;
        const qty=prompt(`"${sizeName}" хэмжээний тоо ширхэг`,"0");
        newSizes.push({size:sizeName, qty:Number(qty)||0});
        addingMore=confirm("Дахин нэг хэмжээ нэмэх үү?");
      }
    }
    sizes=newSizes;
    await api("/api/admin/products/"+id,{method:"PUT",body:JSON.stringify({...p,name,price,image,sizes})});
  } else {
    const stock=prompt("Тоо ширхэг",p.stock);
    await api("/api/admin/products/"+id,{method:"PUT",body:JSON.stringify({...p,name,price,image,stock,sizes:[]})});
  }
  adminTab("products"); loadProducts();
}
async function deleteProduct(id){if(!confirm("Устгах уу?"))return;await api("/api/admin/products/"+id,{method:"DELETE"});adminTab("products");loadProducts()}
async function saveOrder(id){await api("/api/admin/orders/"+id,{method:"PUT",body:JSON.stringify({status:$("st"+id).value,paid:$("paid"+id).value,cargo_code:$("cargo"+id).value,address:$("addr"+id).value})});alert("Захиалга шинэчлэгдлээ");adminTab("orders")}
async function saveSettings(){await api("/api/admin/settings",{method:"PUT",body:JSON.stringify({storeName:$("sn").value,phone:$("sphone").value,airCargo:$("air").value,groundCargo:$("ground").value,bankName:$("bank").value,bankAccount:$("acct").value,bankHolder:$("holder").value,instagram:$("ig").value,facebook:$("fb").value,announcement:$("ann").value})});alert("Хадгалагдлаа");init()}

init().catch(console.error);renderCart();
