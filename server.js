const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

let XLSX;
try { XLSX = require("xlsx"); } catch (e) { XLSX = null; }

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const DATA_DIR = path.join(__dirname, "data");
// Prefer Railway's mounted volume path so uploads survive redeploys.
const UPLOAD_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "public", "uploads");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOAD_DIR));

// ---- Бараа бүрийн линк: Facebook / Instagram / Messenger дээр хуваалцахад барааны зураг, нэр, үнэ харагдана ----
const SITE_URL = (process.env.SITE_URL || "https://moodeseoul.com").replace(/\/$/, "");
const escAttr = v => String(v ?? "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
async function renderProductPage(req, res, id){
  try{
    const fs = require("fs");
    let html = fs.readFileSync(require("path").join(__dirname, "index.html"), "utf8");
    const p = (await listProducts(false)).find(x => String(x.id) === String(id));
    if(p){
      const price = Number(p.price)||0, old = Number(p.old_price)||0;
      const pct = old>price && price>0 ? Math.round((1-price/old)*100) : 0;
      const money = n => Number(n).toLocaleString("en-US") + "₮";
      const title = `${p.name} — ${money(price)}${pct?` (−${pct}%)`:""} | MOODE SEOUL`;
      const desc = (String(p.description||"").replace(/\s+/g," ").trim().slice(0,160)) || "Солонгосоос шууд захиалга — MOODE SEOUL 🇰🇷✈️🇲🇳";
      let img = p.image || (Array.isArray(p.images) && p.images[0]) || "";
      if(img && !/^https?:/i.test(img)) img = SITE_URL + (img.startsWith("/") ? "" : "/") + img;
      const url = `${SITE_URL}/${String(p.id).padStart(3,"0")}`;
      const set = (prop, val) => { html = html.replace(new RegExp(`(<meta property="${prop}" content=")[^"]*(")`), (m,a,b)=>a+escAttr(val)+b); };
      set("og:title", title); set("og:description", desc); set("og:url", url); set("og:type", "product");
      if(img){ set("og:image", img); html = html.replace(/<meta property="og:image:width"[^>]*>\s*/,"").replace(/<meta property="og:image:height"[^>]*>\s*/,""); }
      html = html.replace(/<title>[^<]*<\/title>/, ()=>`<title>${escAttr(title)}</title>`);
      html = html.replace("</head>", ()=>`<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escAttr(title)}">${img?`<meta name="twitter:image" content="${escAttr(img)}">`:""}<link rel="canonical" href="${escAttr(url)}"></head>`);
    }
    res.set("Cache-Control", "no-cache");
    res.type("html").send(html);
  }catch(e){ res.status(500).send("Server error"); }
}
app.get("/p/:id", (req,res)=>renderProductPage(req,res,req.params.id));
// Богино хаяг: moodeseoul.com/005  (005 = барааны дугаар)
app.get(/^\/(\d{1,6})\/?$/, (req,res)=>renderProductPage(req,res,Number(req.params[0])));
app.get("/", (req,res,next)=> req.query.p ? renderProductPage(req,res,req.query.p) : next());
app.use(express.static(__dirname, { index: "index.html", etag: true, setHeaders(res, p){
  if (/\.(html|js|css|json)$/i.test(p)) res.set("Cache-Control", "no-cache, must-revalidate"); // шинэчлэлт шууд харагдана
}}));

const usePostgres = !!process.env.DATABASE_URL;
const pool = usePostgres ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("railway") || process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false } : false
}) : null;

const jsonFile = path.join(DATA_DIR, "store.json");
const defaultData = {
  settings: {
    storeName: process.env.STORE_NAME || "MOODE SEOUL",
    phone: process.env.STORE_PHONE || "(976) 7288-3815",
    groundCargo: process.env.GROUND_CARGO_DAYS || "12-14 хоног",
    bankName: "Хаан банк",
    bankAccount: "MN050005005071274473",
    bankHolder: "GANBOLD ENKHTSATSRALT",
    krwBankName: "우리",
    krwBankAccount: "1002861393082",
    krwBankHolder: "Ganbold ENKHTSATSRALT",
    krwCargoFee: "4500",
    instagram: "moode_seoul",
    facebook: "Moode Seoul",
    announcement: "Солонгосоос бүх төрлийн бренд бараа захиалга NIKE ADIDAS UNDER ARNOUR💜"
  },
  admins: [],
  products: [],
  orders: [],
  customers: [],
  sales: []
};

function loadJson() {
  if (!fs.existsSync(jsonFile)) fs.writeFileSync(jsonFile, JSON.stringify(defaultData, null, 2));
  return JSON.parse(fs.readFileSync(jsonFile, "utf8"));
}
function saveJson(data) {
  fs.writeFileSync(jsonFile, JSON.stringify(data, null, 2));
}

async function dbInit() {
  if (!usePostgres) {
    const d = loadJson();
    if (!d.admins.length) {
      const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "ChangeMe123!", 10);
      d.admins.push({ id: 1, phone: normalizePhone(process.env.ADMIN_PHONE || "97672883815"), passwordHash, name: "Admin" });
      saveJson(d);
    }
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value text NOT NULL);
    CREATE TABLE IF NOT EXISTS admins (id serial PRIMARY KEY, phone text UNIQUE NOT NULL, password_hash text NOT NULL, name text);
    CREATE TABLE IF NOT EXISTS customers (id serial PRIMARY KEY, phone text UNIQUE NOT NULL, name text, created_at timestamptz DEFAULT now());
    CREATE TABLE IF NOT EXISTS products (
      id serial PRIMARY KEY, name text NOT NULL, description text DEFAULT '', price numeric NOT NULL,
      stock integer DEFAULT 0, category text DEFAULT '', image text DEFAULT '', active boolean DEFAULT true,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id serial PRIMARY KEY, order_code text UNIQUE NOT NULL, customer_phone text NOT NULL, customer_name text DEFAULT '',
      items jsonb NOT NULL, total numeric NOT NULL, paid numeric DEFAULT 0, cargo_type text DEFAULT 'ground',
      cargo_code text DEFAULT '', status text DEFAULT 'registered', address text DEFAULT '', note text DEFAULT '',
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    );
  `);
  // Migrations for columns added after initial launch — safe to re-run.
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash text;`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes jsonb DEFAULT '[]';`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]';`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS price_krw numeric DEFAULT 0;`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS pickup text DEFAULT '';`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS old_price integer DEFAULT 0;`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS cargo_included boolean DEFAULT false;`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_kg numeric DEFAULT 0;`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sales (
    id serial PRIMARY KEY, sold_at date NOT NULL DEFAULT CURRENT_DATE, product_name text NOT NULL, size text DEFAULT '',
    qty integer NOT NULL DEFAULT 1, unit_price numeric NOT NULL DEFAULT 0, customer_name text DEFAULT '', customer_phone text DEFAULT '',
    channel text DEFAULT '', note text DEFAULT '', created_at timestamptz DEFAULT now()
  );`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS gender text DEFAULT '';`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS kind text DEFAULT '';`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS maker text DEFAULT '';`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS featured boolean DEFAULT false;`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS brand text DEFAULT '';`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt text DEFAULT '';`);
  // Images live in the database so they survive redeploys regardless of disk/volume setup.
  await pool.query(`CREATE TABLE IF NOT EXISTS product_images (
    id serial PRIMARY KEY,
    mime text NOT NULL,
    data bytea NOT NULL,
    created_at timestamptz DEFAULT now()
  );`);

  const count = await pool.query("SELECT COUNT(*)::int AS n FROM admins");
  if (!count.rows[0].n) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "ChangeMe123!", 10);
    await pool.query("INSERT INTO admins(phone,password_hash,name) VALUES($1,$2,$3)",
      [normalizePhone(process.env.ADMIN_PHONE || "97672883815"), hash, "Admin"]);
  }
  const defaults = defaultData.settings;
  for (const [k,v] of Object.entries(defaults)) {
    await pool.query("INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING", [k, v]);
  }
}

function normalizePhone(v) {
  return String(v || "").replace(/[^\d+]/g, "").replace(/^00/, "+");
}
// Order codes reset daily: YYYYMMDD001 .. YYYYMMDD100, wrapping back to 001 if exceeded.
function todayStamp() {
  const d = new Date();
  return d.getFullYear() + String(d.getMonth()+1).padStart(2,"0") + String(d.getDate()).padStart(2,"0");
}
async function orderCode() {
  const today = todayStamp();
  let seq = 1;
  if (!usePostgres) {
    const d = loadJson();
    if (d.settings.orderSeqDate === today) {
      seq = (Number(d.settings.orderSeq) || 0) + 1;
      if (seq > 100) seq = 1;
    }
    d.settings.orderSeqDate = today;
    d.settings.orderSeq = seq;
    saveJson(d);
  } else {
    const dateRow = (await pool.query("SELECT value FROM settings WHERE key='orderSeqDate'")).rows[0];
    if (dateRow && dateRow.value === today) {
      const seqRow = (await pool.query("SELECT value FROM settings WHERE key='orderSeq'")).rows[0];
      seq = (Number(seqRow?.value) || 0) + 1;
      if (seq > 100) seq = 1;
    }
    await pool.query("INSERT INTO settings(key,value) VALUES('orderSeqDate',$1) ON CONFLICT(key) DO UPDATE SET value=$1",[today]);
    await pool.query("INSERT INTO settings(key,value) VALUES('orderSeq',$1) ON CONFLICT(key) DO UPDATE SET value=$1",[String(seq)]);
  }
  return today + String(seq).padStart(3, "0");
}
function tokenFor(payload) { return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" }); }

function auth(requiredRole) {
  return (req,res,next) => {
    try {
      const raw = req.headers.authorization || "";
      const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
      const data = jwt.verify(token, JWT_SECRET);
      if (requiredRole && data.role !== requiredRole) return res.status(403).json({error:"Forbidden"});
      req.user = data; next();
    } catch {
      return res.status(401).json({error:"Нэвтрэх шаардлагатай"});
    }
  };
}

async function getSettings() {
  if (!usePostgres) return loadJson().settings;
  const r = await pool.query("SELECT key,value FROM settings");
  return Object.fromEntries(r.rows.map(x => [x.key,x.value]));
}
async function setSettings(obj) {
  if (!usePostgres) {
    const d=loadJson(); d.settings={...d.settings,...obj}; saveJson(d); return d.settings;
  }
  for (const [k,v] of Object.entries(obj)) {
    await pool.query("INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[k,String(v ?? "")]);
  }
  return getSettings();
}

function parseSizes(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") { try { return JSON.parse(raw) || []; } catch { return []; } }
  return [];
}
function totalFromSizes(sizes) {
  return sizes.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
}
function parseImages(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean).slice(0, 6);
  if (typeof raw === "string" && raw.trim()) {
    try { const a = JSON.parse(raw); return Array.isArray(a) ? a.filter(Boolean).slice(0,6) : []; } catch { return []; }
  }
  return [];
}

async function listProducts(admin=false) {
  if (!usePostgres) {
    const list = loadJson().products.filter(p => admin || p.active !== false).sort((a,b)=>b.id-a.id);
    return list.map(p => ({...p, sizes: parseSizes(p.sizes), images: parseImages(p.images)}));
  }
  const q = admin ? "SELECT * FROM products ORDER BY id DESC" : "SELECT * FROM products WHERE active=true ORDER BY id DESC";
  const rows = (await pool.query(q)).rows;
  return rows.map(p => ({...p, sizes: parseSizes(p.sizes), images: parseImages(p.images)}));
}
const GENDERS=["women","men","kids"], KINDS=["pants","sport","tracksuit","shirt","hoodie"], MAKERS=["nike","adidas","under_armour","other"];
function pick(v,list){ v=String(v||""); return list.includes(v)?v:""; }
function cleanOld(o,price){ o=Number(o)||0; price=Number(price)||0; return o>price&&price>0?Math.round(o):0; }
async function createProduct(p) {
  const sizes = parseSizes(p.sizes);
  const images = parseImages(p.images);
  const mainImage = p.image || images[0] || "";
  const stock = sizes.length ? totalFromSizes(sizes) : (Number(p.stock) || 0);
  if (!usePostgres) {
    const d=loadJson(); const id=(d.products[0]?.id||0)+1;
    const item={id,name:p.name,description:p.description||"",price:Number(p.price)||0,price_krw:Number(p.price_krw)||0,stock,category:p.category||"",brand:p.brand||"",image:mainImage,images,pickup:p.pickup||"",old_price:cleanOld(p.old_price,p.price),cargo_included:!!p.cargo_included,featured:!!p.featured,weight_kg:Number(p.weight_kg)||0,gender:pick(p.gender,GENDERS),kind:pick(p.kind,KINDS),maker:pick(p.maker,MAKERS),active:p.active!==false,sizes};
    d.products.push(item); saveJson(d); return item;
  }
  return (await pool.query(`INSERT INTO products(name,description,price,price_krw,stock,category,brand,image,images,pickup,active,sizes,old_price,cargo_included,featured,weight_kg,gender,kind,maker)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [p.name,p.description||"",Number(p.price)||0,Number(p.price_krw)||0,stock,p.category||"",p.brand||"",mainImage,JSON.stringify(images),p.pickup||"",p.active!==false,JSON.stringify(sizes),cleanOld(p.old_price,p.price),!!p.cargo_included,!!p.featured,Number(p.weight_kg)||0,pick(p.gender,GENDERS),pick(p.kind,KINDS),pick(p.maker,MAKERS)])).rows[0];
}
async function updateProduct(id,p) {
  const sizes = parseSizes(p.sizes);
  const images = parseImages(p.images);
  const mainImage = p.image || images[0] || "";
  const stock = sizes.length ? totalFromSizes(sizes) : Number(p.stock)||0;
  if (!usePostgres) {
    const d=loadJson(), i=d.products.findIndex(x=>x.id==id); if(i<0) throw Error("Product not found");
    d.products[i]={...d.products[i],...p,price:Number(p.price??d.products[i].price),price_krw:Number(p.price_krw??d.products[i].price_krw??0),stock,images,image:mainImage,pickup:p.pickup??d.products[i].pickup??"",old_price:cleanOld(p.old_price??d.products[i].old_price??0,p.price??d.products[i].price),cargo_included:!!(p.cargo_included??d.products[i].cargo_included),featured:!!(p.featured??d.products[i].featured),weight_kg:Number(p.weight_kg??d.products[i].weight_kg??0)||0,gender:pick(p.gender??d.products[i].gender,GENDERS),kind:pick(p.kind??d.products[i].kind,KINDS),maker:pick(p.maker??d.products[i].maker,MAKERS),sizes};
    saveJson(d); return d.products[i];
  }
  return (await pool.query(`UPDATE products SET name=$1,description=$2,price=$3,price_krw=$4,stock=$5,category=$6,brand=$7,image=$8,images=$9,pickup=$10,active=$11,sizes=$12,old_price=$13,cargo_included=$14,featured=$15,weight_kg=$16,gender=$17,kind=$18,maker=$19 WHERE id=$20 RETURNING *`,
    [p.name,p.description||"",Number(p.price)||0,Number(p.price_krw)||0,stock,p.category||"",p.brand||"",mainImage,JSON.stringify(images),p.pickup||"",p.active!==false,JSON.stringify(sizes),cleanOld(p.old_price,p.price),!!p.cargo_included,!!p.featured,Number(p.weight_kg)||0,pick(p.gender,GENDERS),pick(p.kind,KINDS),pick(p.maker,MAKERS),id])).rows[0];
}
async function deleteProduct(id) {
  if (!usePostgres) { const d=loadJson(); d.products=d.products.filter(x=>x.id!=id); saveJson(d); return; }
  await pool.query("DELETE FROM products WHERE id=$1",[id]);
}
async function getProductRaw(id) {
  if (!usePostgres) return loadJson().products.find(x => x.id == id);
  return (await pool.query("SELECT * FROM products WHERE id=$1",[id])).rows[0];
}

// sign = -1 to decrement stock (order placed), +1 to restore stock (order cancelled)
async function adjustStock(items, sign) {
  for (const it of items || []) {
    if (!it.product_id) continue;
    const qtyChange = sign * (Number(it.qty) || 1);
    if (!usePostgres) {
      const d = loadJson();
      const p = d.products.find(x => x.id == it.product_id);
      if (!p) continue;
      const sizes = parseSizes(p.sizes);
      if (sizes.length && it.size) {
        const s = sizes.find(sz => String(sz.size) === String(it.size));
        if (s) s.qty = Math.max(0, (Number(s.qty)||0) + qtyChange);
        p.sizes = sizes;
        p.stock = totalFromSizes(sizes);
      } else {
        p.stock = Math.max(0, (Number(p.stock)||0) + qtyChange);
      }
      saveJson(d);
    } else {
      const p = await getProductRaw(it.product_id);
      if (!p) continue;
      const sizes = parseSizes(p.sizes);
      if (sizes.length && it.size) {
        const newSizes = sizes.map(sz => String(sz.size) === String(it.size)
          ? { ...sz, qty: Math.max(0, (Number(sz.qty)||0) + qtyChange) } : sz);
        const newStock = totalFromSizes(newSizes);
        await pool.query("UPDATE products SET sizes=$1, stock=$2 WHERE id=$3",[JSON.stringify(newSizes), newStock, it.product_id]);
      } else {
        const newStock = Math.max(0, (Number(p.stock)||0) + qtyChange);
        await pool.query("UPDATE products SET stock=$1 WHERE id=$2",[newStock, it.product_id]);
      }
    }
  }
}

async function createOrder(o) {
  let created;
  if (!usePostgres) {
    const d=loadJson(), id=(d.orders[0]?.id||0)+1;
    const item={id,order_code:await orderCode(),...o,total:Number(o.total),paid:Number(o.paid||0),status:o.status||"registered",created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    d.orders.unshift(item);
    const ci=d.customers.findIndex(c=>c.phone===normalizePhone(o.customer_phone));
    if(ci<0) d.customers.push({id:d.customers.length+1,phone:normalizePhone(o.customer_phone),name:o.customer_name||""});
    saveJson(d); created = item;
  } else {
    const code=await orderCode();
  const r=await pool.query(`INSERT INTO orders(order_code,customer_phone,customer_name,items,total,paid,cargo_type,cargo_code,status,address,note,receipt)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [code,normalizePhone(o.customer_phone),o.customer_name||"",JSON.stringify(o.items||[]),Number(o.total)||0,Number(o.paid)||0,o.cargo_type||"ground",o.cargo_code||"",o.status||"registered",o.address||"",o.note||"",o.receipt||""]);
    await pool.query(`INSERT INTO customers(phone,name) VALUES($1,$2) ON CONFLICT(phone) DO UPDATE SET name=COALESCE(NULLIF(EXCLUDED.name,''),customers.name)`,
      [normalizePhone(o.customer_phone),o.customer_name||""]);
    created = r.rows[0];
  }
  await adjustStock(o.items, -1);
  return created;
}
async function findOrders(phone) {
  phone=normalizePhone(phone);
  if (!usePostgres) return loadJson().orders.filter(o=>normalizePhone(o.customer_phone)===phone).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  return (await pool.query("SELECT * FROM orders WHERE customer_phone=$1 ORDER BY created_at DESC",[phone])).rows;
}
async function allOrders() {
  if(!usePostgres) return loadJson().orders.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  return (await pool.query("SELECT * FROM orders ORDER BY created_at DESC")).rows;
}
async function getOrderById(id) {
  if (!usePostgres) return loadJson().orders.find(x => x.id == id);
  return (await pool.query("SELECT * FROM orders WHERE id=$1",[id])).rows[0];
}
async function updateOrder(id,p) {
  const current = await getOrderById(id);
  if (!current) throw Error("Order not found");

  const wasCancelled = current.status === "cancelled";
  const willCancel = p.status === "cancelled";
  if (willCancel && !wasCancelled) {
    const items = Array.isArray(current.items) ? current.items : (typeof current.items === "string" ? JSON.parse(current.items) : []);
    await adjustStock(items, +1);
  }

  if(!usePostgres){
    const d=loadJson(), i=d.orders.findIndex(x=>x.id==id); if(i<0) throw Error("Order not found");
    d.orders[i]={...d.orders[i],...p,updated_at:new Date().toISOString()}; saveJson(d); return d.orders[i];
  }
  return (await pool.query(`UPDATE orders SET customer_name=$1,paid=$2,cargo_type=$3,cargo_code=$4,status=$5,address=$6,note=$7,items=$8,total=$9,updated_at=now()
    WHERE id=$10 RETURNING *`,
    [p.customer_name??current.customer_name,Number(p.paid??current.paid),p.cargo_type??current.cargo_type,p.cargo_code??current.cargo_code,p.status??current.status,p.address??current.address,p.note??current.note,JSON.stringify(p.items??current.items),Number(p.total??current.total),id])).rows[0];
}

async function deleteOrder(id) {
  const current = await getOrderById(id);
  if (!current) throw Error("Order not found");
  if (current.status !== "cancelled") {
    const items = Array.isArray(current.items) ? current.items : (typeof current.items === "string" ? JSON.parse(current.items) : []);
    await adjustStock(items, +1);
  }
  if (!usePostgres) {
    const d = loadJson();
    d.orders = d.orders.filter(x => x.id != id);
    saveJson(d);
  } else {
    await pool.query("DELETE FROM orders WHERE id=$1", [id]);
  }
}

// ---- Гараар бүртгэсэн борлуулалт (дэлгүүр, Facebook, Instagram гэх мэт) ----
const SALE_CHANNELS=["store","facebook","instagram","other"];
async function listSales() {
  if (!usePostgres) return (loadJson().sales||[]).slice().sort((a,b)=>String(b.sold_at).localeCompare(String(a.sold_at))||b.id-a.id);
  return (await pool.query("SELECT id,to_char(sold_at,'YYYY-MM-DD') AS sold_at,product_name,size,qty,unit_price,customer_name,customer_phone,channel,note,created_at FROM sales ORDER BY sold_at DESC, id DESC")).rows;
}
async function addSale(b) {
  const name=String(b.product_name||"").trim().slice(0,200); if(!name) throw Error("Барааны нэр хоосон байна");
  const qty=Math.max(1,Math.min(9999,parseInt(b.qty,10)||1)), price=Math.max(0,Number(b.unit_price)||0);
  const d0=String(b.sold_at||"").slice(0,10), sold_at=/^\d{4}-\d{2}-\d{2}$/.test(d0)?d0:new Date().toISOString().slice(0,10);
  const row={product_name:name,size:String(b.size||"").slice(0,40),qty,unit_price:price,sold_at,customer_name:String(b.customer_name||"").slice(0,120),customer_phone:String(b.customer_phone||"").slice(0,40),channel:SALE_CHANNELS.includes(b.channel)?b.channel:"",note:String(b.note||"").slice(0,300)};
  if (!usePostgres) { const d=loadJson(); d.sales=d.sales||[]; const id=(d.sales.reduce((m,x)=>Math.max(m,x.id),0))+1; const item={id,...row,created_at:new Date().toISOString()}; d.sales.push(item); saveJson(d); return item; }
  return (await pool.query("INSERT INTO sales(sold_at,product_name,size,qty,unit_price,customer_name,customer_phone,channel,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,to_char(sold_at,'YYYY-MM-DD') AS sold_at,product_name,size,qty,unit_price,customer_name,customer_phone,channel,note",
    [row.sold_at,row.product_name,row.size,row.qty,row.unit_price,row.customer_name,row.customer_phone,row.channel,row.note])).rows[0];
}
async function deleteSale(id) {
  if (!usePostgres) { const d=loadJson(); d.sales=(d.sales||[]).filter(x=>x.id!=id); saveJson(d); return; }
  await pool.query("DELETE FROM sales WHERE id=$1",[id]);
}
async function listCustomers() {
  if (!usePostgres) return loadJson().customers.slice().reverse().map(({passwordHash,...c})=>c);
  return (await pool.query("SELECT id,phone,name,created_at FROM customers ORDER BY created_at DESC")).rows;
}

// Cancel unpaid orders left in "registered" status for more than 30 minutes, restoring their stock.
async function autoCancelStaleOrders() {
  try {
    const orders = await allOrders();
    const now = Date.now();
    for (const o of orders) {
      if (o.status !== "registered") continue;
      if (Number(o.paid || 0) > 0 || o.receipt) continue;
      const created = new Date(o.created_at).getTime();
      if (isNaN(created)) continue;
      if (now - created > 30 * 60 * 1000) {
        await updateOrder(o.id, {
          status: "cancelled",
          note: (o.note ? o.note + " | " : "") + "Автоматаар цуцлагдсан (30 минутанд төлбөр орсонгүй)"
        });
      }
    }
  } catch (e) {
    console.error("autoCancelStaleOrders error:", e.message);
  }
}

// Images are kept in the database (or the local JSON store), not on disk.
const upload = multer({ storage: multer.memoryStorage(), limits:{ fileSize: 8*1024*1024 } });

async function saveImage(file){
  const mime = file.mimetype || "image/jpeg";
  if (!usePostgres) {
    const d = loadJson();
    d.images = d.images || [];
    const id = (d.images[d.images.length-1]?.id || 0) + 1;
    d.images.push({ id, mime, data: file.buffer.toString("base64") });
    saveJson(d);
    return "/img/" + id;
  }
  const r = await pool.query(
    "INSERT INTO product_images(mime,data) VALUES($1,$2) RETURNING id",
    [mime, file.buffer]
  );
  return "/img/" + r.rows[0].id;
}
const importUpload = multer({ storage: multer.memoryStorage() });

// Serve an image straight from the database.
app.get("/img/:id", async (req,res)=>{
  const id = Number(req.params.id);
  if(!id) return res.status(404).end();
  try{
    if(!usePostgres){
      const d = loadJson();
      const rec = (d.images||[]).find(x=>x.id===id);
      if(!rec) return res.status(404).end();
      res.set("Content-Type", rec.mime);
      res.set("Cache-Control", "public, max-age=31536000, immutable");
      return res.send(Buffer.from(rec.data, "base64"));
    }
    const r = await pool.query("SELECT mime,data FROM product_images WHERE id=$1", [id]);
    if(!r.rows[0]) return res.status(404).end();
    res.set("Content-Type", r.rows[0].mime);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.send(r.rows[0].data);
  }catch(e){
    res.status(500).end();
  }
});

app.get("/api/health", (_,res)=>res.json({ok:true, database:usePostgres?"postgres":"local-json", xlsx: !!XLSX}));
app.get("/api/settings", async (_,res)=>res.json(await getSettings()));
app.get("/api/products", async (_,res)=>res.json(await listProducts(false)));

 app.post("/api/auth/admin", async (req,res)=>{
  const login = String(req.body.phone || "").trim();
  const password = String(req.body.password || "");

  const adminUser = String(process.env.ADMIN_USER || "").trim();
  const adminPassword = String(process.env.ADMIN_PASSWORD || "");

  console.log("[admin-login-debug]", {
    envUserSet: !!adminUser,
    envPassSet: !!adminPassword,
    envUserLen: adminUser.length,
    envPassLen: adminPassword.length,
    inputLoginLen: login.length,
    inputPassLen: password.length,
    loginMatches: login === adminUser,
    passMatches: password === adminPassword
  });

  if (
    adminUser &&
    adminPassword &&
    login === adminUser &&
    password === adminPassword
  ) {
    return res.json({
      token: tokenFor({ role: "admin", id: "env-admin", phone: login }),
      admin: { phone: login, name: "Admin" }
    });
  }

  const phone = normalizePhone(login);
  let admin;

  if (usePostgres) {
    admin = (await pool.query("SELECT * FROM admins WHERE phone=$1", [phone])).rows[0];
  } else {
    admin = loadJson().admins.find(a => a.phone === phone);
  }

  if (!admin || !(await bcrypt.compare(password, admin.password_hash || admin.passwordHash))) {
    return res.status(401).json({ error: "Утас эсвэл нууц үг буруу" });
  }

  res.json({
    token: tokenFor({ role: "admin", id: admin.id, phone }),
    admin: { phone, name: admin.name }
  });
});

app.post("/api/auth/customer", async (req,res)=>{
  const phone=normalizePhone(req.body.phone);
  if(phone.length<8) return res.status(400).json({error:"Утасны дугаар буруу"});
  res.json({token:tokenFor({role:"customer",phone}),phone});
});

// ---------- Customer accounts (phone + password) ----------
const loginAttempts = new Map();
function tooManyAttempts(key){
  const now=Date.now();
  const a=(loginAttempts.get(key)||[]).filter(t=>now-t<15*60*1000);
  loginAttempts.set(key,a);
  return a.length>=8;
}
function noteFailedAttempt(key){ const a=loginAttempts.get(key)||[]; a.push(Date.now()); loginAttempts.set(key,a); }

async function getCustomerAccount(phone){
  if(!usePostgres){
    const c=loadJson().customers.find(x=>x.phone===phone);
    return c?{phone:c.phone,name:c.name||"",hash:c.passwordHash||""}:null;
  }
  const r=await pool.query("SELECT phone,name,password_hash FROM customers WHERE phone=$1",[phone]);
  return r.rows[0]?{phone:r.rows[0].phone,name:r.rows[0].name||"",hash:r.rows[0].password_hash||""}:null;
}
async function saveCustomerAccount(phone,name,hash){
  if(!usePostgres){
    const d=loadJson();
    const i=d.customers.findIndex(x=>x.phone===phone);
    if(i>=0){ d.customers[i].passwordHash=hash; if(name) d.customers[i].name=name; }
    else d.customers.push({id:d.customers.length+1,phone,name,passwordHash:hash});
    saveJson(d); return;
  }
  await pool.query(`INSERT INTO customers(phone,name,password_hash) VALUES($1,$2,$3)
    ON CONFLICT(phone) DO UPDATE SET password_hash=EXCLUDED.password_hash, name=COALESCE(NULLIF(EXCLUDED.name,''),customers.name)`,[phone,name,hash]);
}

app.post("/api/auth/register", async (req,res)=>{
  const phone=normalizePhone(req.body.phone);
  const name=String(req.body.name||"").trim().slice(0,80);
  const password=String(req.body.password||"");
  if(phone.length<8) return res.status(400).json({error:"Утасны дугаараа зөв оруулна уу"});
  if(password.length<6) return res.status(400).json({error:"Нууц үг дор хаяж 6 тэмдэгт байна"});
  const existing=await getCustomerAccount(phone);
  if(existing && existing.hash) return res.status(409).json({error:"Энэ дугаар бүртгэлтэй байна. Нэвтэрнэ үү."});
  await saveCustomerAccount(phone,name,await bcrypt.hash(password,10));
  const acc=await getCustomerAccount(phone);
  res.status(201).json({token:tokenFor({role:"customer",phone,name:acc.name}),phone,name:acc.name});
});

app.post("/api/auth/login", async (req,res)=>{
  const phone=normalizePhone(req.body.phone);
  const password=String(req.body.password||"");
  const key=(req.ip||"")+"|"+phone;
  if(tooManyAttempts(key)) return res.status(429).json({error:"Олон удаа буруу оруулсан байна. 15 минутын дараа дахин оролдоно уу."});
  const acc=phone.length>=8?await getCustomerAccount(phone):null;
  if(!acc || !acc.hash || !(await bcrypt.compare(password,acc.hash))){
    noteFailedAttempt(key);
    return res.status(401).json({error:"Утас эсвэл нууц үг буруу байна"});
  }
  res.json({token:tokenFor({role:"customer",phone,name:acc.name}),phone,name:acc.name});
});

app.get("/api/me", auth("customer"), async (req,res)=>{
  const acc=await getCustomerAccount(req.user.phone);
  res.json({phone:req.user.phone,name:acc?acc.name:"",orders:await findOrders(req.user.phone)});
});

app.get("/api/orders/by-phone", async (req,res)=>{
  const phone=normalizePhone(req.query.phone);
  if(phone.length<8) return res.status(400).json({error:"Утасны дугаар оруулна уу"});
  res.json(await findOrders(phone));
});
// Customers upload a payment receipt image (no admin auth needed).
app.post("/api/receipt", upload.single("receipt"), async (req,res)=>{
  if(!req.file) return res.status(400).json({error:"Зураг сонгоно уу"});
  try { res.json({ url: await saveImage(req.file) }); }
  catch(e){ res.status(500).json({error:"Хадгалахад алдаа: "+e.message}); }
});

app.post("/api/orders", async (req,res)=>{
  const {customer_phone,customer_name,items,total,cargo_type,address,note,receipt}=req.body;
  if(!customer_phone || !Array.isArray(items) || !items.length) return res.status(400).json({error:"Захиалгын мэдээлэл дутуу"});
  const order=await createOrder({customer_phone,customer_name,items,total,cargo_type,address,note,receipt,paid:0});
  res.status(201).json(order);
});

app.post("/api/admin/upload", auth("admin"), upload.single("image"), async (req,res)=>{
  if(!req.file) return res.status(400).json({error:"Файл сонгоно уу"});
  try { res.json({ url: await saveImage(req.file) }); }
  catch(e){ res.status(500).json({error:"Зураг хадгалахад алдаа: "+e.message}); }
});
app.post("/api/admin/upload-many", auth("admin"), upload.array("images", 6), async (req,res)=>{
  if(!req.files || !req.files.length) return res.status(400).json({error:"Файл сонгоно уу"});
  try {
    const urls = [];
    for (const f of req.files) urls.push(await saveImage(f));
    res.json({ urls });
  } catch(e){ res.status(500).json({error:"Зураг хадгалахад алдаа: "+e.message}); }
});
app.get("/api/admin/products", auth("admin"), async (_,res)=>res.json(await listProducts(true)));
app.post("/api/admin/products", auth("admin"), async (req,res)=>res.status(201).json(await createProduct(req.body)));
app.put("/api/admin/products/:id", auth("admin"), async (req,res)=>res.json(await updateProduct(req.params.id,req.body)));
app.delete("/api/admin/products/:id", auth("admin"), async (req,res)=>{await deleteProduct(req.params.id);res.json({ok:true});});

app.get("/api/admin/orders", auth("admin"), async (_,res)=>res.json(await allOrders()));
app.put("/api/admin/orders/:id", auth("admin"), async (req,res)=>res.json(await updateOrder(req.params.id,req.body)));
app.delete("/api/admin/orders/:id", auth("admin"), async (req,res)=>{await deleteOrder(req.params.id); res.json({ok:true});});
app.get("/api/admin/settings", auth("admin"), async (_,res)=>res.json(await getSettings()));
app.put("/api/admin/settings", auth("admin"), async (req,res)=>res.json(await setSettings(req.body)));

app.get("/api/admin/sales", auth("admin"), async (_,res)=>res.json(await listSales()));
app.post("/api/admin/sales", auth("admin"), async (req,res)=>{ try{ res.json(await addSale(req.body||{})); }catch(e){ res.status(400).json({error:e.message}); } });
app.delete("/api/admin/sales/:id", auth("admin"), async (req,res)=>{ await deleteSale(req.params.id); res.json({ok:true}); });
app.get("/api/admin/customers", auth("admin"), async (_,res)=>res.json(await listCustomers()));
// Admin resets a customer's forgotten password: generates a temporary one, shown once to the admin.
app.post("/api/admin/customers/reset-password", auth("admin"), async (req,res)=>{
  const phone=normalizePhone(req.body.phone);
  if(phone.length<8) return res.status(400).json({error:"Утасны дугаар буруу"});
  const acc=await getCustomerAccount(phone);
  if(!acc) return res.status(404).json({error:"Хэрэглэгч олдсонгүй"});
  const temp=String(crypto.randomInt(100000,1000000));
  await saveCustomerAccount(phone,"",await bcrypt.hash(temp,10));
  res.json({phone,password:temp});
});

app.get("/api/admin/stats", auth("admin"), async (_,res)=>{
  const orders=await allOrders();
  const products=await listProducts(true);
  const revenue=orders.reduce((s,o)=>s+Number(o.paid||0),0);

  const monthlyMap = {};
  for (const o of orders) {
    const d = new Date(o.created_at);
    if (isNaN(d)) continue;
    const key = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
    monthlyMap[key] = (monthlyMap[key] || 0) + Number(o.paid || 0);
  }
  const monthly = Object.entries(monthlyMap)
    .sort((a,b) => a[0] < b[0] ? 1 : -1)
    .slice(0, 6)
    .reverse()
    .map(([month, total]) => ({ month, total }));

  res.json({
    orders: orders.length,
    active: orders.filter(o=>o.status!=="cancelled").length,
    delivered: orders.filter(o=>o.status==="mongolia"||o.status==="delivered").length,
    revenue,
    products: products.length,
    monthly
  });
});

// Bulk-create orders typed directly into the admin panel (no spreadsheet needed).
app.post("/api/admin/orders/bulk", auth("admin"), async (req,res)=>{
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({error:"Мөр алга байна"});

  let created = 0, skipped = 0;
  const order_codes = [];
  for (const row of rows) {
    const phone = String(row.phone||"").trim();
    if (!phone) { skipped++; continue; }
    const name = String(row.name||"").trim();
    const productName = String(row.product||"").trim();
    const size = String(row.size||"").trim();
    const price = Number(row.price)||0;
    const cargo_type = "ground";
    const cargo_code = String(row.cargo_code||"").trim();

    const order = await createOrder({
      customer_phone: phone,
      customer_name: name,
      items: [{ name: productName || "Бараа", qty: 1, price, size: size||undefined }],
      total: price,
      cargo_type,
      cargo_code,
      address: "",
      note: "Admin-аас бөөнөөр бүртгэсэн"
    });
    created++;
    order_codes.push(order.order_code);
  }
  res.json({ created, skipped, order_codes });
});

app.post("/api/admin/orders/import", auth("admin"), importUpload.single("file"), async (req,res)=>{
  if (!XLSX) {
    return res.status(500).json({ error: "Серверт 'xlsx' сан суулгаагүй байна. package.json-д \"xlsx\": \"^0.18.5\" нэмээд дахин deploy хийнэ үү." });
  }
  if (!req.file) return res.status(400).json({ error: "Excel файл сонгоно уу" });

  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    // Read as raw rows (no header assumption) — this sheet has no header row and an
    // occasional leading date column, so we locate each row's phone number by pattern
    // and read the surrounding cells positionally: [Name] [Phone] [Product] [Size] [Price] [CargoType]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });

    let imported = 0, skipped = 0;
    const results = [];

    for (const r of rows) {
      const cells = r.map(c => String(c ?? "").trim());
      let phoneIdx = cells.findIndex(c => /^\d{8}$/.test(c));
      if (phoneIdx === -1) phoneIdx = cells.findIndex(c => /^\d{6,9}$/.test(c));
      if (phoneIdx === -1) { skipped++; continue; }

      const phone = cells[phoneIdx];
      let name, productName, size = "", price = 0, cargo_code = "", address = "";

      if (phoneIdx === 0) {
        // Layout: [Phone] [Name] [Product] [...] [Price] [Cargo text] [Cargo code] [Address]
        name = cells[1] || "";
        productName = cells[2] || "";
        const priceIdx = cells.findIndex((c, i) => i > 2 && /^[\d.,]{4,}$/.test(c));
        if (priceIdx !== -1) price = Number(cells[priceIdx].replace(/[^\d.]/g, "")) || 0;
        const cargoIdx = cells.findIndex((c, i) => i > 2 && /kargo|карго|cargo/i.test(c));
        const afterIdx = cargoIdx !== -1 ? cargoIdx : (priceIdx !== -1 ? priceIdx : 2);
        const rest = cells.slice(afterIdx + 1).filter(Boolean);
        if (rest.length && /^\d{3,6}$/.test(rest[0])) { cargo_code = rest.shift(); }
        address = rest.join(" ");
      } else {
        // Layout: [Name] [Phone] [Product] [Size] [Price] [CargoType]
        name = cells[phoneIdx - 1] || "";
        productName = cells[phoneIdx + 1] || "";
        size = cells[phoneIdx + 2] || "";
        price = Number(String(cells[phoneIdx + 3] || "").replace(/[^\d.]/g, "")) || 0;
      }
      const cargo_type = "ground";

      const order = await createOrder({
        customer_phone: phone,
        customer_name: name,
        items: [{ name: productName || "Бараа", qty: 1, price, size: size || undefined }],
        total: price,
        paid: price,
        cargo_type,
        cargo_code,
        address,
        note: "Excel-ээс импортлосон (FB захиалга)"
      });
      imported++;
      results.push(order.order_code);
    }
    res.json({ imported, skipped, order_codes: results });
  } catch (e) {
    res.status(500).json({ error: "Файл унших алдаа: " + e.message });
  }
});

app.get("/api/admin/odoo-status", auth("admin"), async (_,res)=>{
  res.json({
    enabled: process.env.ODOO_ENABLED === "true",
    configured: !!(process.env.ODOO_URL && process.env.ODOO_DB && process.env.ODOO_USERNAME && process.env.ODOO_PASSWORD),
    message: "Odoo sync is prepared for credentials; exact Odoo model/field mapping can be enabled after the Odoo database details are provided."
  });
});

app.get("*", (_,res)=>res.sendFile(path.join(__dirname,"index.html")));

dbInit().then(()=>{
  app.listen(PORT,()=>console.log(`MOODE SEOUL running on ${PORT}`));
  setInterval(autoCancelStaleOrders, 5 * 60 * 1000);
}).catch(err=>{console.error(err);process.exit(1)});
