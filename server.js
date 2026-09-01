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
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(__dirname, { index: "index.html" }));

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
    airCargo: process.env.AIR_CARGO_DAYS || "5-7 хоног",
    groundCargo: process.env.GROUND_CARGO_DAYS || "14-16 хоног",
    bankName: "Хаан банк",
    bankAccount: "5071274473",
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
  customers: []
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
      items jsonb NOT NULL, total numeric NOT NULL, paid numeric DEFAULT 0, cargo_type text DEFAULT 'air',
      cargo_code text DEFAULT '', status text DEFAULT 'registered', address text DEFAULT '', note text DEFAULT '',
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    );
  `);
  // Migrations for columns added after initial launch — safe to re-run.
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes jsonb DEFAULT '[]';`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]';`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS price_krw numeric DEFAULT 0;`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS pickup text DEFAULT '';`);

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
async function createProduct(p) {
  const sizes = parseSizes(p.sizes);
  const images = parseImages(p.images);
  const mainImage = p.image || images[0] || "";
  const stock = sizes.length ? totalFromSizes(sizes) : (Number(p.stock) || 0);
  if (!usePostgres) {
    const d=loadJson(); const id=(d.products[0]?.id||0)+1;
    const item={id,name:p.name,description:p.description||"",price:Number(p.price)||0,price_krw:Number(p.price_krw)||0,stock,category:p.category||"",image:mainImage,images,pickup:p.pickup||"",active:p.active!==false,sizes};
    d.products.push(item); saveJson(d); return item;
  }
  return (await pool.query(`INSERT INTO products(name,description,price,price_krw,stock,category,image,images,pickup,active,sizes)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [p.name,p.description||"",Number(p.price)||0,Number(p.price_krw)||0,stock,p.category||"",mainImage,JSON.stringify(images),p.pickup||"",p.active!==false,JSON.stringify(sizes)])).rows[0];
}
async function updateProduct(id,p) {
  const sizes = parseSizes(p.sizes);
  const images = parseImages(p.images);
  const mainImage = p.image || images[0] || "";
  const stock = sizes.length ? totalFromSizes(sizes) : Number(p.stock)||0;
  if (!usePostgres) {
    const d=loadJson(), i=d.products.findIndex(x=>x.id==id); if(i<0) throw Error("Product not found");
    d.products[i]={...d.products[i],...p,price:Number(p.price??d.products[i].price),price_krw:Number(p.price_krw??d.products[i].price_krw??0),stock,images,image:mainImage,pickup:p.pickup??d.products[i].pickup??"",sizes};
    saveJson(d); return d.products[i];
  }
  return (await pool.query(`UPDATE products SET name=$1,description=$2,price=$3,price_krw=$4,stock=$5,category=$6,image=$7,images=$8,pickup=$9,active=$10,sizes=$11 WHERE id=$12 RETURNING *`,
    [p.name,p.description||"",Number(p.price)||0,Number(p.price_krw)||0,stock,p.category||"",mainImage,JSON.stringify(images),p.pickup||"",p.active!==false,JSON.stringify(sizes),id])).rows[0];
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
    const r=await pool.query(`INSERT INTO orders(order_code,customer_phone,customer_name,items,total,paid,cargo_type,cargo_code,status,address,note)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [code,normalizePhone(o.customer_phone),o.customer_name||"",JSON.stringify(o.items||[]),Number(o.total)||0,Number(o.paid)||0,o.cargo_type||"air",o.cargo_code||"",o.status||"registered",o.address||"",o.note||""]);
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

async function listCustomers() {
  if (!usePostgres) return loadJson().customers.slice().reverse();
  return (await pool.query("SELECT * FROM customers ORDER BY created_at DESC")).rows;
}

// Cancel unpaid orders left in "registered" status for more than 30 minutes, restoring their stock.
async function autoCancelStaleOrders() {
  try {
    const orders = await allOrders();
    const now = Date.now();
    for (const o of orders) {
      if (o.status !== "registered") continue;
      if (Number(o.paid || 0) > 0) continue;
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

const upload = multer({ storage: multer.diskStorage({
  destination: (_,__,cb)=>cb(null,UPLOAD_DIR),
  filename: (_,file,cb)=>cb(null, Date.now()+"-"+file.originalname.replace(/[^a-zA-Z0-9._-]/g,""))
})});
const importUpload = multer({ storage: multer.memoryStorage() });

app.get("/api/health", (_,res)=>res.json({ok:true, database:usePostgres?"postgres":"local-json", xlsx: !!XLSX}));
app.get("/api/debug-admin-env", (req,res)=>{
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  const u = String(process.env.ADMIN_USER || "");
  const p = String(process.env.ADMIN_PASSWORD || "");
  res.json({
    envUserSet: !!u,
    envUserLen: u.length,
    envUserFirst2: u.slice(0,2),
    envPassSet: !!p,
    envPassLen: p.length,
    checkedAt: new Date().toISOString()
  });
});
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

app.get("/api/orders/by-phone", async (req,res)=>{
  const phone=normalizePhone(req.query.phone);
  if(phone.length<8) return res.status(400).json({error:"Утасны дугаар оруулна уу"});
  res.json(await findOrders(phone));
});
app.post("/api/orders", async (req,res)=>{
  const {customer_phone,customer_name,items,total,cargo_type,address,note}=req.body;
  if(!customer_phone || !Array.isArray(items) || !items.length) return res.status(400).json({error:"Захиалгын мэдээлэл дутуу"});
  const order=await createOrder({customer_phone,customer_name,items,total,cargo_type,address,note,paid:0});
  res.status(201).json(order);
});

app.post("/api/admin/upload", auth("admin"), upload.single("image"), (req,res)=>{
  if(!req.file) return res.status(400).json({error:"Файл сонгоно уу"});
  res.json({url:"/uploads/"+req.file.filename});
});
app.post("/api/admin/upload-many", auth("admin"), upload.array("images", 6), (req,res)=>{
  if(!req.files || !req.files.length) return res.status(400).json({error:"Файл сонгоно уу"});
  res.json({urls: req.files.map(f=>"/uploads/"+f.filename)});
});
app.get("/api/admin/products", auth("admin"), async (_,res)=>res.json(await listProducts(true)));
app.post("/api/admin/products", auth("admin"), async (req,res)=>res.status(201).json(await createProduct(req.body)));
app.put("/api/admin/products/:id", auth("admin"), async (req,res)=>res.json(await updateProduct(req.params.id,req.body)));
app.delete("/api/admin/products/:id", auth("admin"), async (req,res)=>{await deleteProduct(req.params.id);res.json({ok:true});});

app.get("/api/admin/orders", auth("admin"), async (_,res)=>res.json(await allOrders()));
app.put("/api/admin/orders/:id", auth("admin"), async (req,res)=>res.json(await updateOrder(req.params.id,req.body)));
app.get("/api/admin/settings", auth("admin"), async (_,res)=>res.json(await getSettings()));
app.put("/api/admin/settings", auth("admin"), async (req,res)=>res.json(await setSettings(req.body)));

app.get("/api/admin/customers", auth("admin"), async (_,res)=>res.json(await listCustomers()));

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
    active: orders.filter(o=>!["delivered","cancelled"].includes(o.status)).length,
    delivered: orders.filter(o=>o.status==="delivered").length,
    revenue,
    products: products.length,
    monthly
  });
});

app.post("/api/admin/orders/import", auth("admin"), importUpload.single("file"), async (req,res)=>{
  if (!XLSX) {
    return res.status(500).json({ error: "Серверт 'xlsx' сан суулгаагүй байна. package.json-д \"xlsx\": \"^0.18.5\" нэмээд дахин deploy хийнэ үү." });
  }
  if (!req.file) return res.status(400).json({ error: "Excel файл сонгоно уу" });

  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const pick = (row, keys) => {
      for (const k of Object.keys(row)) {
        if (keys.includes(k.trim().toLowerCase())) return row[k];
      }
      return "";
    };

    let imported = 0, skipped = 0;
    const results = [];
    for (const row of rows) {
      const phone = String(pick(row, ["утас","phone","утасны дугаар"])).trim();
      const name = String(pick(row, ["нэр","name"])).trim();
      const cargo_code = String(pick(row, ["карго","cargo","карго код"])).trim();
      const productName = String(pick(row, ["бараа","product","барааны нэр"])).trim();
      const price = Number(pick(row, ["үнэ","price","барааны үнэ"])) || 0;

      if (!phone) { skipped++; continue; }

      const order = await createOrder({
        customer_phone: phone,
        customer_name: name,
        items: [{ name: productName || "Бараа", qty: 1, price }],
        total: price,
        cargo_type: "air",
        cargo_code,
        address: "",
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
