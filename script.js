/* ==========================================================
   moshi shampoo — script.js (ใช้ร่วมกันทุกหน้า)
   - product.html : แสดงการ์ดสินค้า + ตัวกรอง mood
   - order.html   : เติมฟอร์มจาก URL parameter + ส่งคำสั่งซื้อ
   - admin.html   : แสดงรายการสั่งซื้อจาก Google Sheet (CSV)
   แต่ละส่วนจะทำงานเฉพาะเมื่อหน้านั้นมี element ที่ต้องใช้
   ========================================================== */

(function () {
  'use strict';

  var ORDER_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzMxDPJIkmD-D1d-2PEo9_VFaITzHOoknIQPVk32xRilFHATyuRxNpP_x9DlmKChYMNvQ/exec';
  var ORDERS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT68dRlwmuj06nxJiv8g8EflfJoSeKCxELelGMx2DDtHTDaiMlStd6hLj1toqaNwWAqDEKgPk7-4XJx/pub?gid=0&single=true&output=csv';

  /* ---------- helper: สร้าง element ---------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /* ==========================================================
     1) หน้า product.html
     ========================================================== */
  function initProducts() {
    var list = document.getElementById('product-list');
    if (!list) return;

    var bar = document.getElementById('filter-bar');
    var products = [];
    var currentMood = 'all';

    function buildCard(p) {
      var card = el('article', 'product-card mood-' + p.mood);

      var imageWrap = el('div', 'product-card__image');
      var img = el('img');
      img.src = p.image;
      img.alt = p.name + ' ' + p.size;
      img.loading = 'lazy';
      imageWrap.appendChild(img);

      var body = el('div', 'product-card__body');

      var mood = el('div', 'product-card__mood');
      mood.appendChild(el('span', 'mood-dot'));
      mood.appendChild(document.createTextNode(capitalize(p.mood)));

      var name = el('h3', 'product-card__name', p.name);
      var size = el('div', 'product-card__size', p.size);

      var footer = el('div', 'product-card__footer');
      footer.appendChild(el('span', 'price', Number(p.price).toLocaleString('th-TH') + ' บาท'));

      var itemName = p.name + ' ' + p.size;
      var buy = el('a', 'btn btn--accent', 'สั่งซื้อ');
      buy.href = 'order.html?item=' + encodeURIComponent(itemName) +
                 '&price=' + encodeURIComponent(p.price);
      footer.appendChild(buy);

      body.appendChild(mood);
      body.appendChild(name);
      body.appendChild(size);
      body.appendChild(footer);

      card.appendChild(imageWrap);
      card.appendChild(body);
      return card;
    }

    function render() {
      list.innerHTML = '';
      var shown = products.filter(function (p) {
        return currentMood === 'all' || p.mood === currentMood;
      });

      if (shown.length === 0) {
        list.appendChild(el('p', 'muted', 'ไม่พบสินค้าในหมวดนี้'));
        return;
      }
      shown.forEach(function (p) {
        list.appendChild(buildCard(p));
      });
    }

    function updateButtons() {
      if (!bar) return;
      Array.prototype.forEach.call(bar.querySelectorAll('button'), function (btn) {
        var active = btn.getAttribute('data-mood') === currentMood;
        btn.className = active ? 'btn btn--accent' : 'btn';
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    function setMood(mood) {
      currentMood = mood;
      updateButtons();
      render();

      // เก็บ mood ไว้ใน URL เพื่อให้รีเฟรชแล้วยังกรองอยู่
      try {
        var url = new URL(window.location.href);
        if (mood === 'all') {
          url.searchParams.delete('mood');
        } else {
          url.searchParams.set('mood', mood);
        }
        window.history.replaceState(null, '', url);
      } catch (e) { /* ไม่เป็นไร ถ้าอัปเดต URL ไม่ได้ */ }
    }

    function buildFilterBar() {
      if (!bar) return;
      bar.innerHTML = '';

      var moods = [];
      products.forEach(function (p) {
        if (moods.indexOf(p.mood) === -1) moods.push(p.mood);
      });

      var options = [{ value: 'all', label: 'ทั้งหมด' }].concat(
        moods.map(function (m) { return { value: m, label: capitalize(m) }; })
      );

      options.forEach(function (opt) {
        var btn = el('button', 'btn', opt.label);
        btn.type = 'button';
        btn.setAttribute('data-mood', opt.value);
        btn.addEventListener('click', function () { setMood(opt.value); });
        bar.appendChild(btn);
      });
    }

    list.appendChild(el('p', 'muted', 'กำลังโหลดสินค้า...'));

    fetch('products.json')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        products = data;
        buildFilterBar();

        // อ่าน ?mood=xxx จาก URL (ถ้าไม่ตรงกับ mood ที่มี ให้แสดงทั้งหมด)
        var wanted = (new URLSearchParams(window.location.search).get('mood') || '').toLowerCase();
        var valid = products.some(function (p) { return p.mood === wanted; });
        setMood(valid ? wanted : 'all');
      })
      .catch(function (error) {
        console.error(error);
        list.innerHTML = '';
        list.appendChild(el('p', 'muted', 'โหลดข้อมูลสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'));
      });
  }

  /* ==========================================================
     2) หน้า order.html
     ========================================================== */
  function initOrder() {
    var form = document.getElementById('orderForm');
    if (!form) return;

    // เติม items และ total จาก URL parameter ทันทีที่โหลดหน้า
    var params = new URLSearchParams(window.location.search);
    var item = params.get('item');
    var price = params.get('price');

    var itemsInput = document.getElementById('items');
    var totalInput = document.getElementById('total');

    if (item && itemsInput) itemsInput.value = item;
    if (price && totalInput) totalInput.value = price;

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true; // กันกดซ้ำจนได้ออเดอร์ซ้ำ

      var payload = {
        customerName: document.getElementById('customerName').value.trim(),
        contact: document.getElementById('contact').value.trim(),
        items: document.getElementById('items').value.trim(),
        total: document.getElementById('total').value.trim(),
        note: document.getElementById('note').value.trim()
      };

      fetch(ORDER_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      .then(() => { window.location.href = 'thankyou.html'; })
      .catch(error => {
        console.error(error);
        alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      })
      .finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
    });
  }

  /* ==========================================================
     3) หน้า admin.html
     ========================================================== */

  // แปลงข้อความ CSV เป็น array ของแถว (รองรับ "..." , "" และขึ้นบรรทัดใหม่ในช่อง)
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    text = text.replace(/^\uFEFF/, ''); // ตัด BOM ถ้ามี

    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);

      if (inQuotes) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text.charAt(i + 1) === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }

    if (field !== '' || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function initAdmin() {
    var tbody = document.querySelector('#ordersTable tbody');
    if (!tbody) return;

    var COLUMNS = 6; // วันเวลา, ชื่อลูกค้า, เบอร์โทร/Line, รายการสินค้า, จำนวนเงินรวม, หมายเหตุ

    function showMessage(message) {
      tbody.innerHTML = '';
      var tr = el('tr');
      var td = el('td', 'muted', message);
      td.colSpan = COLUMNS;
      td.style.textAlign = 'center';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    showMessage('กำลังโหลดข้อมูล...');

    fetch(ORDERS_CSV_URL, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = parseCSV(text).filter(function (r) {
          return r.some(function (cell) { return cell.trim() !== ''; });
        });

        // ถ้าแถวแรกเป็นหัวตาราง (คอลัมน์ A ไม่มีตัวเลขเลย) ให้ข้ามไป
        if (rows.length > 0 && !/\d/.test(rows[0][0] || '')) rows.shift();

        if (rows.length === 0) {
          showMessage('ยังไม่มีรายการสั่งซื้อ');
          return;
        }

        // แถวใหม่ถูกต่อท้ายชีตเสมอ จึงกลับลำดับให้ล่าสุดขึ้นก่อน
        rows.reverse();

        tbody.innerHTML = '';
        rows.forEach(function (r) {
          var tr = el('tr');
          for (var i = 0; i < COLUMNS; i++) {
            tr.appendChild(el('td', '', r[i] || '')); // textContent กัน HTML แปลกปลอมจากลูกค้า
          }
          tbody.appendChild(tr);
        });
      })
      .catch(function (error) {
        console.error(error);
        showMessage('โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      });
  }

  /* ---------- เริ่มทำงาน ---------- */
  function init() {
    initProducts();
    initOrder();
    initAdmin();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
