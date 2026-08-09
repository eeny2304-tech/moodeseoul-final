# MOODE SEOUL — FINAL

Энэ хувилбар нь өмнө ярьсан үндсэн шаардлагуудыг нэгтгэсэн, Railway дээр ажиллуулахад зориулсан Node/Express сайт.

## Байгаа боломжууд

### Худалдан авагч
- Бэлэн барааны жагсаалт
- Бараа сагсанд нэмэх
- Нэр, утас, хаяг, каргоны төрлөөр захиалга өгөх
- Агаарын карго: 5–7 хоног
- Газрын карго: 14–16 хоног
- Каргоны төлбөр тусдаа гэдгийг харуулах
- Утасны дугаараар захиалгаа хайх
- Захиалгын код, нийт үнэ, төлсөн дүн, төлөв, карго код харах
- Захиалгын түүх
- Гар утсанд тохирсон дизайн

### Admin
- Утас + нууц үгээр admin нэвтрэх
- Бараа нэмэх
- Бараа засах
- Бараа устгах
- Үнэ, үлдэгдэл, зураг, ангилал өөрчлөх
- Бүх захиалга харах
- Захиалгын төлөв өөрчлөх:
  registered → transport → mongolia → delivery → delivered
- Төлсөн дүн өөрчлөх
- Карго код нэмэх
- Хаяг өөрчлөх
- Дэлгүүрийн нэр, утас, announcement, каргоны хугацаа, банк/данс, social холбоос өөрчлөх
- Dashboard статистик
- Odoo тохиргооны хэсэг

## Railway дээр тавих

1. ZIP-ийг задлаад GitHub repository-д бүх файлыг root дээр оруул.
2. Railway → New Project → Deploy from GitHub Repo.
3. PostgreSQL service нэм.
4. Variables:
   - `DATABASE_URL` — Railway PostgreSQL-ээс автоматаар ирнэ.
   - `JWT_SECRET` — урт random утга.
   - `ADMIN_PHONE=97672883815`
   - `ADMIN_PASSWORD=өөрийн шинэ нууц үг`
5. Deploy.
6. Deploy дууссаны дараа `https://таны-domain/` руу ор.
7. Admin хэсэгт дээрх admin утас + нууц үгээр нэвтэр.
8. Admin → Бараа хэсгээс бараагаа нэм.

## ЧУХАЛ: iPhone Files дээрх Error

Таны screenshot дээр `package.json`, `server.js`, `README` файлуудын хажууд `↑ Error` гэж харагдаж байна. Энэ нь кодын syntax error гэсэн үг биш; iCloud Storage Full тул Files app upload/sync хийж чадахгүй байгааг харуулж байна.

ZIP-ийг задлаад шууд iCloud Drive дотор ажиллуулахын оронд:
- ZIP-ийг `On My iPhone` эсвэл компьютерт хадгалж болно.
- GitHub дээр файлуудаа оруулах нь илүү найдвартай.
- Railway нь GitHub repo-оос шууд deploy хийнэ.

## Local ажиллуулах

Node.js 20+:
```bash
npm install
npm start
```

DATABASE_URL байхгүй үед local JSON database ашиглана. Railway production дээр PostgreSQL ашиглана.

## Odoo

Odoo-ийн URL, database, username, password болон яг ямар model/field рүү захиалга/бараа синк хийхийг мэдэхгүй учраас Odoo credentials-ийг кодонд хатуу бичээгүй.

Railway Variables хэсэгт:
```text
ODOO_ENABLED=true
ODOO_URL=https://...
ODOO_DB=...
ODOO_USERNAME=...
ODOO_PASSWORD=...
```
өгөөд дараагийн шатанд танай Odoo-ийн model/field mapping-ийг холбоно.

## Security

Production дээр заавал:
- `JWT_SECRET`-ийг солино.
- `ADMIN_PASSWORD`-ийг солино.
- Odoo password-ийг GitHub кодонд хийхгүй, Railway Variables-д хадгална.