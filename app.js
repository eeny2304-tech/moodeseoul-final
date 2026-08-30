let products=[], cart=[], adminToken=localStorage.getItem("moode_admin_token")||"", trackMode="phone", settings={};
let myOrders=[];

const $=id=>document.getElementById(id);
const CATEGORY_LABELS = { mn_belen:"Монголд бэлэн", kr_belen:"Солонгост бэлэн", order:"Захиалгийн бараа" };
const STAGE_NAMES = { registered:"Бүртгэл", transport:"Тээвэр", mongolia:"Монголд", delivery:"Хүргэлт", delivered:"Дууссан" };

async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{"Content-Type":"application/json",...(opts.headers||{}),...(adminToken?{Authorization:"Bearer "+adminToken}:{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Алдаа");return d}
function money(n){return Number(n||0).toLocaleString("mn-MN")+"₮"}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}

async function init(){const s=await api("/api/settings");settings=s;$("brandName").textContent=s.storeName;$("footerName").textContent=s.storeName;$("footerPhone").textContent=s.phone;$("announce").textContent=s.announcement;$("airDays").textContent=s.airCargo;$("groundDays").textContent=s.groundCargo;loadProducts()}

/* ---------------- Storefront products ---------------- */

function productCardHtml(p){
  const sizes = Array.isArray(p.sizes) ? p.sizes : [];
  const hasSizes = sizes.length > 0;
  const totalStock = hasSizes ? sizes.reduce((s,sz)=>s+(Number(sz.qty)||0),0) : Number(p.stock||0);
  const sizeOptions = hasSizes ? sizes.map(sz=>`<option value="${esc(sz.size)}" ${Number(sz.qty)<=0?"disabled":""}>${esc(sz.size)} ${Number(sz.qty)<=0?"(дууссан)":"("+sz.qty+")"}</option>`).join("") : "";
  const catLabel = CATEGORY_LABELS[p.category] || "";

  return `<article class="product">
    <img src="${p.image||'https://placehold.co/600x600?text=MOODE+SEOUL'}">
    <div class="p">
      ${catLabel?`<span class="cat-badge cat-${esc(p.category)}">${catLabel}</span>`:""}
      <h3>${esc(p.name)}</h3>
      <div class="price">${money(p.price)}</div>
      ${hasSizes?`<select class="size-select" id="size-${p.id}">${sizeOptions}</select>`:""}
      <div class="stock">${totalStock>0?"Бэлэн: "+totalStock:"Дууссан"}</div>
      <button ${totalStock<=0?"disabled":""} onclick="addCart(${p.id})">${totalStock<=0?"Дууссан":"Сагсанд нэмэх"}</button>
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
function openCart(){$("cart").classList.remove("hidden");renderCart()} function closeCart(){$("cart").classList.add("hidden")}

function togglePayDetail(){
  $("bankDetail").classList.toggle("hidden");
  $("bankRow").classList.toggle("open");
}

async function submitOrder(){
  if(!cart.length)return alert("Сагс хоосон байна.");
  const phone=$("customerPhone").value.trim();
  if(!phone)return alert("Утасны дугаараа оруулна уу.");
  const total=cart.reduce((s,x)=>s+x.price*x.qty,0);
  try{
    const o=await api("/api/orders",{method:"POST",body:JSON.stringify({customer_phone:phone,customer_name:$("customerName").value,address:$("customerAddress").value,cargo_type:$("cargoType").value,total,items:cart.map(x=>({product_id:x.id,name:x.name,qty:x.qty,price:x.price,size:x.size}))})});
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

function setTrack(mode,btn){trackMode=mode;document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));btn.classList.add("active");$("trackInput").placeholder=mode==="phone"?"Утасны дугаараа оруулна уу":"Шилжүүлэг хийсэн дансны дугаараа оруулна уу"}

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
  const stages=["registered","transport","mongolia","delivery","delivered"];
  const isCancelled = o.status === "cancelled";
  const idx = stages.indexOf(o.status);
  const img = (items[0] && items[0].image) || 'https://placehold.co/400x400?text=MOODE+SEOUL';

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
      const monthlyHtml=(s.monthly||[]).length
        ? s.monthly.map(m=>{const [y,mo]=m.month.split("-");return `<div class="month-row"><span>${mo}/${y}</span><b>${money(m.total)}</b></div>`}).join("")
        : `<p class="muted-note">Мэдээлэл алга байна.</p>`;
      $("adminContent").innerHTML=`<h2>Хяналтын самбар</h2>
        <div class="grid">
          <div class="admin-card"><b>Нийт захиалга</b><h2>${s.orders}</h2></div>
          <div class="admin-card"><b>Идэвхтэй</b><h2>${s.active}</h2></div>
          <div class="admin-card"><b>Хүргэгдсэн</b><h2>${s.delivered}</h2></div>
          <div class="admin-card"><b>Төлөгдсөн</b><h2>${money(s.revenue)}</h2></div>
        </div>
        <h3 class="section-sub">Сарын борлуулалт</h3>
        <div class="admin-card month-list">${monthlyHtml}</div>`;
    }

    if(tab==="products"){
      const ps=await api("/api/admin/products");
      $("adminContent").innerHTML=`<h2>Бараа удирдах</h2>
        <div class="admin-card">
          <div class="admin-row">
            <input id="pn" placeholder="Барааны нэр">
            <input id="pp" type="number" placeholder="Үнэ">
            <select id="pc">
              <option value="mn_belen">Монголд бэлэн</option>
              <option value="kr_belen">Солонгост бэлэн</option>
              <option value="order">Захиалгийн бараа</option>
            </select>
          </div>

          <p class="field-label">Хэмжээ бүрийн тоо ширхэг</p>
          <div id="sizeRows"></div>
          <button type="button" class="file-btn" onclick="addSizeRow()">+ Хэмжээ нэмэх</button>

          <p class="field-label">Хэмжээгүй бол ерөнхий тоо ширхэг</p>
          <input id="pst" type="number" placeholder="Тоо (хэмжээ ашиглаагүй үед)">

          <label class="file-btn">📷 Зураг сонгох (утаснаас)<input type="file" id="pi_file" accept="image/*" onchange="uploadProductImage(this)"></label>
          <input type="hidden" id="pi">
          <div id="pi_preview" class="img-preview"></div>
          <textarea id="pd" placeholder="Тайлбар"></textarea>
          <button class="primary" onclick="addProduct()">Бараа нэмэх</button>
        </div>
        ${ps.map(p=>`<div class="admin-card admin-card-row">
            ${p.image?`<img class="admin-thumb" src="${p.image}">`:`<div class="admin-thumb admin-thumb-empty">MS</div>`}
            <div>
              <b>${esc(p.name)}</b> — ${money(p.price)} — үлдэгдэл ${p.stock}<br>
              <small>${esc(CATEGORY_LABELS[p.category]||p.category||"Ангилалгүй")}</small>
              ${p.sizes && p.sizes.length ? `<br><small>Хэмжээ: ${p.sizes.map(s=>`${esc(s.size)}(${s.qty})`).join(", ")}</small>` : ""}
              <br><button onclick="editProduct(${p.id})">Засах</button> <button onclick="deleteProduct(${p.id})">Устгах</button>
            </div>
          </div>`).join("")}`;
    }

    if(tab==="orders"){
      const os=await api("/api/admin/orders");
      window.__allOrders=os;
      $("adminContent").innerHTML=`<h2>Захиалга удирдах</h2>
        <div class="admin-row">
          <input id="orderSearch" placeholder="Утас, нэр, захиалгын кодоор хайх" oninput="filterOrdersAdmin()">
        </div>
        <label class="file-btn">📥 Excel-ээс импортлох (FB захиалгууд)<input type="file" id="importFile" accept=".xlsx,.xls" onchange="importOrders(this)"></label>
        <p class="muted-note">Excel баганууд: Утас, Нэр, Карго, Бараа, Үнэ</p>
        <div id="ordersAdminList"></div>`;
      renderOrdersAdminList(os);
    }

    if(tab==="customers"){
      const cs=await api("/api/admin/customers");
      window.__allCustomers=cs;
      $("adminContent").innerHTML=`<h2>Хэрэглэгчид</h2>
        <div class="admin-row">
          <input id="custSearch" placeholder="Утас, нэрээр хайх" oninput="filterCustomers()">
        </div>
        <div id="customersList">${cs.length?cs.map(c=>`<div class="admin-card"><b>${esc(c.name||"Нэргүй")}</b><br>${esc(c.phone)}</div>`).join(""):`<p class="muted-note">Хэрэглэгч алга байна.</p>`}</div>`;
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

async function uploadProductImage(input){
  const file=input.files[0]; if(!file) return;
  const fd=new FormData(); fd.append("image",file);
  try{
    const r=await fetch("/api/admin/upload",{method:"POST",headers:{Authorization:"Bearer "+adminToken},body:fd});
    const d=await r.json();
    if(!r.ok) throw Error(d.error||"Зураг оруулахад алдаа гарлаа");
    $("pi").value=d.url;
    $("pi_preview").innerHTML=`<img src="${d.url}">`;
  }catch(e){alert(e.message)}
}

function renderOrdersAdminList(os){
  $("ordersAdminList").innerHTML = os.length ? os.map(o=>`<div class="admin-card">
      <b>${esc(o.order_code)}</b>
      <p>${esc(o.customer_name||"")} · ${esc(o.customer_phone)} · ${money(o.total)} · төлсөн ${money(o.paid)}</p>
      <div class="admin-row">
        <select id="st${o.id}">${["registered","transport","mongolia","delivery","delivered","cancelled"].map(s=>`<option ${o.status===s?"selected":""} value="${s}">${s}</option>`).join("")}</select>
        <input id="paid${o.id}" type="number" value="${o.paid||0}" placeholder="Төлсөн дүн">
        <input id="cargo${o.id}" value="${esc(o.cargo_code||"")}" placeholder="Карго код">
        <input id="addr${o.id}" value="${esc(o.address||"")}" placeholder="Хүргэлтийн хаяг">
      </div>
      <button class="primary" onclick="saveOrder(${o.id})">Шинэчлэх</button>
    </div>`).join("") : `<p class="muted-note">Захиалга алга байна.</p>`;
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

function filterCustomers(){
  const q=$("custSearch").value.trim().toLowerCase();
  const filtered=(window.__allCustomers||[]).filter(c=>
    (c.phone||"").toLowerCase().includes(q) || (c.name||"").toLowerCase().includes(q)
  );
  $("customersList").innerHTML = filtered.length ? filtered.map(c=>`<div class="admin-card"><b>${esc(c.name||"Нэргүй")}</b><br>${esc(c.phone)}</div>`).join("") : `<p class="muted-note">Олдсонгүй.</p>`;
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
  await api("/api/admin/products",{method:"POST",body:JSON.stringify({name:$("pn").value,price:$("pp").value,stock,category:$("pc").value,image:$("pi").value,description:$("pd").value,sizes})});
  adminTab("products");
  loadProducts();
}
async function editProduct(id){
  const p=(await api("/api/admin/products")).find(x=>x.id==id); if(!p)return;
  const name=prompt("Барааны нэр",p.name); if(name===null)return;
  const price=prompt("Үнэ",p.price);
  const stock=prompt("Ерөнхий тоо (зөвхөн хэмжээгүй бол хэрэглэгдэнэ)",p.stock);
  const image=prompt("Зураг URL",p.image||"");
  await api("/api/admin/products/"+id,{method:"PUT",body:JSON.stringify({...p,name,price,stock,image,sizes:p.sizes||[]})});
  adminTab("products"); loadProducts();
}
async function deleteProduct(id){if(!confirm("Устгах уу?"))return;await api("/api/admin/products/"+id,{method:"DELETE"});adminTab("products");loadProducts()}
async function saveOrder(id){await api("/api/admin/orders/"+id,{method:"PUT",body:JSON.stringify({status:$("st"+id).value,paid:$("paid"+id).value,cargo_code:$("cargo"+id).value,address:$("addr"+id).value})});alert("Захиалга шинэчлэгдлээ");adminTab("orders")}
async function saveSettings(){await api("/api/admin/settings",{method:"PUT",body:JSON.stringify({storeName:$("sn").value,phone:$("sphone").value,airCargo:$("air").value,groundCargo:$("ground").value,bankName:$("bank").value,bankAccount:$("acct").value,bankHolder:$("holder").value,instagram:$("ig").value,facebook:$("fb").value,announcement:$("ann").value})});alert("Хадгалагдлаа");init()}

init().catch(console.error);renderCart();
