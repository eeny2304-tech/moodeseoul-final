<!-- ============================================================
  1) Replace the orderCard() function in app.js with this version.
     (checkmark-circle timeline, no per-stage dates since the
     backend doesn't currently store a timestamp per stage)
============================================================= -->
<script>
function orderCard(o){
  const items=Array.isArray(o.items)?o.items:(typeof o.items==="string"?JSON.parse(o.items):[]);
  const stages=["registered","transport","mongolia","delivery","delivered"];
  const names={registered:"Бүртгэл",transport:"Тээвэр",mongolia:"Монголд",delivery:"Хүргэлт",delivered:"Дууссан"};
  const isCancelled = o.status === "cancelled";
  const idx = stages.indexOf(o.status);
  const img = (items[0] && items[0].image) || 'https://placehold.co/400x400?text=MOODE+SEOUL';

  const stageHtml = isCancelled
    ? `<div class="order-cancelled">Захиалга цуцлагдсан</div>`
    : `<div class="stage-track">${stages.map((s,i)=>`
        <div class="stage ${i<=idx?'done':''} ${i===idx?'current':''}">
          <span class="dot">${i<=idx?'✓':''}</span>
          <span class="label">${names[s]}</span>
        </div>`).join("")}</div>`;

  return `<div class="order-card">
    <div class="order-head">
      <div>
        <span class="order-eyebrow">ЗАХИАЛГЫН ДУГААР</span>
        <b class="order-code">${esc(o.order_code)}</b>
      </div>
      <span class="badge status-${o.status}">${o.status==='delivered'?'✓ ':''}${names[o.status]||o.status}</span>
    </div>

    <div class="order-body">
      <div class="order-thumb"><img src="${img}" alt=""></div>
      <div class="order-meta">
        <p>👤 ${esc(o.customer_name||"")} · ${esc(o.customer_phone)}</p>
        <p>💰 <b>${money(o.total)}</b> · Төлсөн: ${money(o.paid)}</p>
        <p>📦 ${items.map(i=>esc(i.name)+" × "+i.qty).join(", ")}</p>
        <p>${o.cargo_type==="air"?"✈️ Агаар 5-7 хоног":"🚚 Газар 14-16 хоног"} ${o.cargo_code?`· Код: <b>${esc(o.cargo_code)}</b>`:""}</p>
      </div>
    </div>

    ${stageHtml}
  </div>`;
}
</script>

<!-- ============================================================
  2) Replace the existing <section class="info">...</section>
     block in index.html with everything below.
============================================================= -->

<section class="flow">
  <h2 class="flow-title">ЗАХИАЛГА ӨГӨХ ЯВЦ</h2>
  <div class="flow-grid">
    <div class="flow-card">
      <div class="flow-icon">📋</div>
      <b>1. Бараагаа сонгоно</b>
      <p>Солонгос дэлгүүр, сайтнаас сонгоно</p>
    </div>
    <div class="flow-card">
      <div class="flow-icon">🛒</div>
      <b>2. Захиалга илгээнэ</b>
      <p>Барааны линк, размер, тоо хэмжээ илгээнэ</p>
    </div>
    <div class="flow-card">
      <div class="flow-icon">📦</div>
      <b>3. Төлбөрөө баталгаажуулна</b>
      <p>Барааны үнэ + хүргэлт төлбөр төлнө</p>
    </div>
    <div class="flow-card">
      <div class="flow-icon">🚚</div>
      <b>4. Каргонд өгсөн кодоо авна</b>
      <p>Каргонд өгсөн дараа код олгоно</p>
    </div>
    <div class="flow-card">
      <div class="flow-icon">📮</div>
      <b>5. Карго таныг холбож барааг өгнө</b>
      <p>Монголд ирээд карго тантай холбогдоно</p>
    </div>
  </div>
</section>

<section class="pay-grid">
  <div class="pay-methods">
    <h3>ТӨЛБӨРИЙН ТӨРЛҮҮД</h3>
    <div class="pay-row"><span class="pay-ic">🏦</span><div><b>Банкны данс</b><small>Хаан банк, Голомт банк</small></div><span class="arrow">›</span></div>
    <div class="pay-row"><span class="pay-ic">Ⓠ</span><div><b>QPay</b><small>QPay апп-аар төлнө</small></div><span class="arrow">›</span></div>
    <div class="pay-row"><span class="pay-ic">⋯</span><div><b>Бусад</b><small>Гүйлгээний баримт илгээнэ үү</small></div><span class="arrow">›</span></div>
  </div>
  <div class="pay-info">
    <h3>ТӨЛБӨРИЙН МЭДЭЭЛЭЛ</h3>
    <div class="pay-note">
      <span>ℹ️</span>
      <p><b>Анхааруулга</b><br>Барааны төлбөрийг урьдчилж баталгаажуулна. Каргоны төлбөр тусдаа бөгөөд бараагаа авахдаа каргонд төлнө.</p>
    </div>
    <p class="pay-check">✓ Төлбөр хийсэн дараа баримтаа илгээнэ үү</p>
    <p class="pay-check">✓ Захиалга баталгаажсаны дараа цуцлах боломжгүй</p>
  </div>
</section>

<footer class="site-footer">
  <div class="footer-grid">
    <div>
      <b class="footer-logo">MOODE SEOUL</b>
      <p>Солонгосоос Монголдоо итгэлтэй, хурдан, найдвартай.</p>
      <div class="footer-social">
        <a href="#">📷</a><a href="#">🎵</a><a href="#">✈️</a><a href="#">📘</a>
      </div>
    </div>
    <div>
      <b>ЦЭС</b>
      <a href="#">Нүүр</a>
      <a href="#">Миний захиалга</a>
      <a href="#">FAQ</a>
      <a href="#">Холбоо барих</a>
    </div>
    <div>
      <b>ХОЛБОО БАРИХ</b>
      <a href="tel:+9767288-3815">📞 (976) 7288-3815</a>
      <a href="#">✈️ @moodeseoul</a>
      <a href="mailto:moodeseoul@gmail.com">✉️ moodeseoul@gmail.com</a>
    </div>
  </div>
  <div class="footer-bottom">© 2026 MOODE SEOUL. Бүх эрх хуулиар хамгаалагдсан.</div>
</footer>
