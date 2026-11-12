/*
 * Perfect Digital - one basket for photo prints, cards, calendars, canvases, posters, mugs and gifts (12 Nov 2026).
 *
 * Every ordering page on order.perfect.digital loads this file. While the basket is switched on, a page sends its
 * order to its own order script "for the basket": the script checks it, prices it and keeps its files, and the order
 * waits there ("held"). The page then adds it here. The basket page (/basket/) takes one payment for everything,
 * made by the product orders script, or the customer pays at the counter if they are in the shop.
 *
 * The basket lives in this browser tab only (sessionStorage), for up to a day: each order's number, its token (the
 * key to that order), what it is, its price and a small picture. Closing the tab forgets it.
 *
 * Switching it on and off: basket/on.json ({"on": true} or {"on": false}). While it is off, every page uses its own
 * checkout, as before. Adding ?basket=try to a page's address switches the basket on in that tab only (for testing),
 * and ?basket=off switches it off again.
 */
(function () {
  'use strict';
  var STORE = 'pd-basket', TRY = 'pd-basket-try', DAY = 20 * 3600 * 1000;
  var SCRIPTS = {
    photo: 'https://script.google.com/macros/s/AKfycbwpuU2um557nX9JraIFr_e7MFnb86ZxMU38bcQsnuRVzdGnL7DKek2btTWBupxdpmGP/exec',
    card: 'https://script.google.com/macros/s/AKfycbxGbrp5kGw9jlJccINtgT7IX4fRJ9HvtkeLAhtswEQjBRUC0Ws8Noar5PGKgs7Hc7ix/exec',
    product: 'https://script.google.com/macros/s/AKfycbyxCY2eEvutIWxJ0TnHwKwI_w9vWxzT71uVRR0zeuAo7dPqon-Dkf4ajdz-ZJuh93DfoQ/exec'
  };
  var root = (document.currentScript && document.currentScript.src) ? new URL('../', document.currentScript.src).href : location.origin + '/';
  var BASKET_URL = root + 'basket/';
  var HOME_URL = root;

  function load() {
    try {
      var v = JSON.parse(sessionStorage.getItem(STORE) || 'null');
      if (!v || v.v !== 1) return { v: 1, parts: [], customer: null, pending: null, previous: null };
      v.parts = (v.parts || []).filter(function (p) { return p && p.orderNo && p.token && Date.now() - (p.added || 0) < DAY; });
      return v;
    } catch (e) { return { v: 1, parts: [], customer: null, pending: null, previous: null }; }
  }
  function save(v) {
    try { sessionStorage.setItem(STORE, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function money(v) { return '£' + Number(v).toFixed(2); }
  // The basket changed: a payment page made for it no longer covers everything in it.
  function outOfDate(v) {
    if (v.pending && v.pending.session) v.previous = v.pending.session;
    v.pending = null;
  }

  // ?basket=try and ?basket=off (testing in one tab), taken out of the address again.
  (function () {
    try {
      var q = new URLSearchParams(location.search), b = q.get('basket');
      if (!b) return;
      if (b === 'try') sessionStorage.setItem(TRY, '1');
      if (b === 'off') sessionStorage.removeItem(TRY);
      q.delete('basket');
      history.replaceState(null, '', location.pathname + (String(q) ? '?' + q : '') + location.hash);
    } catch (e) { /* storage blocked: the basket stays off */ }
  })();

  var switchOn = null;
  function enabled() {
    if (!switchOn) {
      switchOn = new Promise(function (resolve) {
        var usable = false;
        try { sessionStorage.setItem(STORE + '-check', '1'); sessionStorage.removeItem(STORE + '-check'); usable = true; } catch (e) { /* private mode with storage blocked */ }
        if (!usable) return resolve(false);
        var tried = false;
        try { tried = sessionStorage.getItem(TRY) === '1'; } catch (e) { /* no */ }
        if (tried) return resolve(true);
        fetch(root + 'basket/on.json?' + Date.now(), { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : { on: false }; })
          .then(function (j) { resolve(!!(j && j.on === true)); })
          .catch(function () { resolve(false); });
      });
    }
    return switchOn;
  }

  // The order scripts take {fn, arg}; the photo orders script takes {fn, args: [...]}.
  function call(script, fn, arg) {
    var url = SCRIPTS[script];
    if (!url) return Promise.reject(new Error('Unknown order script.'));
    var body = script === 'photo' ? { fn: fn, args: [arg] } : { fn: fn, arg: arg };
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .catch(function () { throw new Error('We could not reach the shop. Please check your connection and try again.'); })
      .then(function (r) {
        if (!r.ok) throw new Error('The shop could not be reached (' + r.status + '). Please try again.');
        return r.json();
      })
      .then(function (j) { if (j.error) throw new Error(j.error); return j.result; });
  }

  // A small picture for the basket list, from a canvas, an image or a data URL (about 7 KB).
  function thumb(src, size) {
    size = size || 120;
    try {
      var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
      if (!w || !h) return '';
      var s = Math.min(1, size / Math.max(w, h)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      var out = c.toDataURL('image/jpeg', 0.72);
      c.width = c.height = 1;
      return out.length < 40000 ? out : '';
    } catch (e) { return ''; }
  }

  var api = {
    SCRIPTS: SCRIPTS, BASKET_URL: BASKET_URL, HOME_URL: HOME_URL,
    enabled: enabled,
    call: call,
    thumb: thumb,
    money: money,
    parts: function () { return load().parts; },
    count: function () { return load().parts.length; },
    total: function () { return Math.round(load().parts.reduce(function (t, p) { return t + Number(p.total || 0) * 100; }, 0)) / 100; },
    // part: { script: 'photo'|'card'|'product', kind, orderNo, token, title, lines: [...], total, readyText, thumb }
    add: function (part) {
      var v = load();
      v.parts = v.parts.filter(function (p) { return p.orderNo !== part.orderNo; });
      part.added = Date.now();
      v.parts.push(part);
      outOfDate(v);
      if (!save(v)) { part.thumb = ''; v.parts[v.parts.length - 1] = part; save(v); }
      api.paint();
    },
    remove: function (orderNo) {
      var v = load();
      v.parts = v.parts.filter(function (p) { return p.orderNo !== orderNo; });
      outOfDate(v);
      save(v);
      api.paint();
    },
    clear: function () { var v = load(); v.parts = []; v.pending = null; v.previous = null; save(v); api.paint(); },
    // The customer's name and number from the first order, so the next page can fill them in.
    customer: function () { return load().customer; },
    rememberCustomer: function (c) {
      if (!c) return;
      var v = load(), was = v.customer || {};
      // A page that doesn't ask for something (the card maker has no email box) keeps what an earlier page was told.
      v.customer = { name: String(c.name || was.name || '').slice(0, 60), phone: String(c.phone || was.phone || '').slice(0, 20),
        email: String(c.email || was.email || '').slice(0, 100), offers: c.offers === true || (c.offers === undefined && was.offers === true) };
      save(v);
    },
    // The payment page made for this basket, so coming back to the basket page finds it again.
    pending: function () { return load().pending; },
    // The payment page made before the basket last changed: the next payment closes it, so it can't be paid as well.
    previous: function () { return load().previous || null; },
    // Done with those payment pages (paid, or covered): the next payment starts afresh.
    forgetPayments: function () { var v = load(); v.pending = null; v.previous = null; save(v); },
    setPending: function (p) { var v = load(); v.pending = p ? Object.assign({ at: Date.now() }, p) : null; save(v); },
    // Fills in name, mobile and email fields that are empty, from the first order in the basket.
    fill: function (ids) {
      var c = load().customer;
      if (!c) return;
      [['name', ids.name], ['phone', ids.phone], ['email', ids.email]].forEach(function (x) {
        var el = x[1] && document.getElementById(x[1]);
        if (el && !el.value && c[x[0]]) el.value = c[x[0]];
      });
      // The offers box is never ticked for the customer, not even from an earlier order: they tick it themselves.
    },
    // The strip at the top of each page while the basket has something in it.
    paint: function () {
      if (/\/basket\/?$/.test(location.pathname) || /\/basket\/index\.html$/.test(location.pathname)) return;
      var n = api.count(), bar = document.getElementById('pd-basket-bar');
      if (!n) { if (bar) bar.hidden = true; return; }
      if (!bar) {
        if (!document.body) return;
        bar = document.createElement('a');
        bar.id = 'pd-basket-bar';
        bar.href = BASKET_URL;
        bar.setAttribute('style', 'display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 12px;margin:8px max(12px, calc((100% - 976px) / 2)) 0;padding:10px 14px;' +
          'border-radius:12px;background:#E3F3E7;color:#0F5A2A;font:600 15px/1.3 Montserrat,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;text-decoration:none');
        bar.innerHTML = '<span data-what></span><span style="white-space:nowrap">Basket and pay &rsaquo;</span>';
        document.body.insertBefore(bar, document.body.firstChild);
      }
      bar.hidden = false;
      bar.querySelector('[data-what]').textContent = 'Your basket: ' + n + (n === 1 ? ' order, ' : ' orders, ') + money(api.total());
      bar.setAttribute('aria-label', 'Your basket: ' + n + (n === 1 ? ' order, ' : ' orders, ') + money(api.total()) + '. Go to your basket and pay.');
    }
  };
  window.PDBasket = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', api.paint);
  else api.paint();
  // Another page in this tab may have changed the basket (the Back button brings pages back as they were).
  window.addEventListener('pageshow', api.paint);
})();
