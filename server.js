const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

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
    bankAccount: "",
    bankHolder: "",
    instagram: "",
    facebook: "",
    announcement: "Солонгосоос бүх төрлийн бараа захиалга 💜"
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
function orderCode() {
  const d = new Date();
  const stamp = d.toISOString().replace(/\D/g, "").slice(0, 12);
  return `MS-${stamp}-${Math.floor(100+Math.random()*900)}`;
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

async function listProducts(admin=false) {
  if (!usePostgres) {
    return loadJson().products.filter(p => admin || p.active !== false).sort((a,b)=>b.id-a.id);
  }
  const q = admin ? "SELECT * FROM products ORDER BY id DESC" : "SELECT * FROM products WHERE active=true ORDER BY id DESC";
  return (await pool.query(q)).rows;
}
async function createProduct(p) {
  if (!usePostgres) {
    const d=loadJson(); const id=(d.products[0]?.id||0)+1;
    const item={id,name:p.name,description:p.description||"",price:Number(p.price)||0,stock:Number(p.stock)||0,category:p.category||"",image:p.image||"",active:p.active!==false};
    d.products.push(item); saveJson(d); return item;
  }
  return (await pool.query(`INSERT INTO products(name,description,price,stock,category,image,active)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [p.name,p.description||"",Number(p.price)||0,Number(p.stock)||0,p.category||"",p.image||"",p.active!==false])).rows[0];
}
async function updateProduct(id,p) {
  if (!usePostgres) {
    const d=loadJson(), i=d.products.findIndex(x=>x.id==id); if(i<0) throw Error("Product not found");
    d.products[i]={...d.products[i],...p,price:Number(p.price??d.products[i].price),stock:Number(p.stock??d.products[i].stock)}; saveJson(d); return d.products[i];
  }
  return (await pool.query(`UPDATE products SET name=$1,description=$2,price=$3,stock=$4,category=$5,image=$6,active=$7 WHERE id=$8 RETURNING *`,
    [p.name,p.description||"",Number(p.price)||0,Number(p.stock)||0,p.category||"",p.image||"",p.active!==false,id])).rows[0];
}
async function deleteProduct(id) {
  if (!usePostgres) { const d=loadJson(); d.products=d.products.filter(x=>x.id!=id); saveJson(d); return; }
  await pool.query("DELETE FROM products WHERE id=$1",[id]);
}

async function createOrder(o) {
  if (!usePostgres) {
    const d=loadJson(), id=(d.orders[0]?.id||0)+1;
    const item={id,order_code:orderCode(),...o,total:Number(o.total),paid:Number(o.paid||0),status:o.status||"registered",created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    d.orders.unshift(item);
    const ci=d.customers.findIndex(c=>c.phone===normalizePhone(o.customer_phone));
    if(ci<0) d.customers.push({id:d.customers.length+1,phone:normalizePhone(o.customer_phone),name:o.customer_name||""});
    saveJson(d); return item;
  }
  const code=orderCode();
  const r=await pool.query(`INSERT INTO orders(order_code,customer_phone,customer_name,items,total,paid,cargo_type,cargo_code,status,address,note)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [code,normalizePhone(o.customer_phone),o.customer_name||"",JSON.stringify(o.items||[]),Number(o.total)||0,Number(o.paid)||0,o.cargo_type||"air",o.cargo_code||"",o.status||"registered",o.address||"",o.note||""]);
  await pool.query(`INSERT INTO customers(phone,name) VALUES($1,$2) ON CONFLICT(phone) DO UPDATE SET name=COALESCE(NULLIF(EXCLUDED.name,''),customers.name)`,
    [normalizePhone(o.customer_phone),o.customer_name||""]);
  return r.rows[0];
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
async function updateOrder(id,p) {
  if(!usePostgres){
    const d=loadJson(), i=d.orders.findIndex(x=>x.id==id); if(i<0) throw Error("Order not found");
    d.orders[i]={...d.orders[i],...p,updated_at:new Date().toISOString()}; saveJson(d); return d.orders[i];
  }
  const current=(await pool.query("SELECT * FROM orders WHERE id=$1",[id])).rows[0];
  if(!current) throw Error("Order not found");
  return (await pool.query(`UPDATE orders SET customer_name=$1,paid=$2,cargo_type=$3,cargo_code=$4,status=$5,address=$6,note=$7,items=$8,total=$9,updated_at=now()
    WHERE id=$10 RETURNING *`,
    [p.customer_name??current.customer_name,Number(p.paid??current.paid),p.cargo_type??current.cargo_type,p.cargo_code??current.cargo_code,p.status??current.status,p.address??current.address,p.note??current.note,JSON.stringify(p.items??current.items),Number(p.total??current.total),id])).rows[0];
}

const upload = multer({ storage: multer.diskStorage({
  destination: (_,__,cb)=>cb(null,UPLOAD_DIR),
  filename: (_,file,cb)=>cb(null, Date.now()+"-"+file.originalname.replace(/[^a-zA-Z0-9._-]/g,""))
})});

app.get("/api/health", (_,res)=>res.json({ok:true, database:usePostgres?"postgres":"local-json"}));
app.get("/api/settings", async (_,res)=>res.json(await getSettings()));
app.get("/api/products", async (_,res)=>res.json(await listProducts(false)));

app.post("/api/auth/admin", async (req,res)=>{
  const phone=normalizePhone(req.body.phone), password=String(req.body.password||"");
  let admin;
  if(usePostgres) admin=(await pool.query("SELECT * FROM admins WHERE phone=$1",[phone])).rows[0];
  else admin=loadJson().admins.find(a=>a.phone===phone);
  if(!admin || !(await bcrypt.compare(password, admin.password_hash || admin.passwordHash))) return res.status(401).json({error:"Утас эсвэл нууц үг буруу"});
  res.json({token:tokenFor({role:"admin",id:admin.id,phone}),admin:{phone,name:admin.name}});
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
app.get("/api/admin/products", auth("admin"), async (_,res)=>res.json(await listProducts(true)));
app.post("/api/admin/products", auth("admin"), async (req,res)=>res.status(201).json(await createProduct(req.body)));
app.put("/api/admin/products/:id", auth("admin"), async (req,res)=>res.json(await updateProduct(req.params.id,req.body)));
app.delete("/api/admin/products/:id", auth("admin"), async (req,res)=>{await deleteProduct(req.params.id);res.json({ok:true});});

app.get("/api/admin/orders", auth("admin"), async (_,res)=>res.json(await allOrders()));
app.put("/api/admin/orders/:id", auth("admin"), async (req,res)=>res.json(await updateOrder(req.params.id,req.body)));
app.get("/api/admin/settings", auth("admin"), async (_,res)=>res.json(await getSettings()));
app.put("/api/admin/settings", auth("admin"), async (req,res)=>res.json(await setSettings(req.body)));

app.get("/api/admin/stats", auth("admin"), async (_,res)=>{
  const orders=await allOrders();
  const products=await listProducts(true);
  const revenue=orders.reduce((s,o)=>s+Number(o.paid||0),0);
  res.json({orders:orders.length,active:orders.filter(o=>!["delivered","cancelled"].includes(o.status)).length,delivered:orders.filter(o=>o.status==="delivered").length,revenue,products:products.length});
});

app.get("/api/admin/odoo-status", auth("admin"), async (_,res)=>{
  res.json({
    enabled: process.env.ODOO_ENABLED === "true",
    configured: !!(process.env.ODOO_URL && process.env.ODOO_DB && process.env.ODOO_USERNAME && process.env.ODOO_PASSWORD),
    message: "Odoo sync is prepared for credentials; exact Odoo model/field mapping can be enabled after the Odoo database details are provided."
  });
});

app.get("*", (_,res)=>res.sendFile(path.join(__dirname,"index.html")));

dbInit().then(()=>app.listen(PORT,()=>console.log(`MOODE SEOUL running on ${PORT}`))).catch(err=>{console.error(err);process.exit(1)});
