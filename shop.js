"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const byId = id => document.getElementById(id);
const teas = new Map(products.map(tea => [tea.id, tea]));
const storageKey = "ackerman-tea-cart-v1";
const money = amount => new Intl.NumberFormat("ru-RU").format(amount) + " ₽";
const checkoutFee = 200;
const maxQuantity = 99;
const drawer = byId("drawer");
const receipt = byId("receipt");
const menuDialog = byId("mobile-menu");
const checkoutForm = byId("checkout-form");
let cart = readCart();
let currentProduct = products[0];
let selectedType = "all";
let sortOrder = "default";
let currentView = "home";
let currentRoute = null;
let sectionObserver = null;

function readCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey)) || {};
    return Object.fromEntries(products
      .map(tea => [tea.id, saved[tea.id]])
      .filter(([, count]) => Number.isInteger(count) && count > 0 && count <= maxQuantity));
  } catch {
    return {};
  }
}

function persistCart() {
  try { localStorage.setItem(storageKey, JSON.stringify(cart)); }
  catch { /* The cart still works in this tab when storage is unavailable. */ }
}

function cartItems() {
  return Object.entries(cart).map(([id, count]) => ({ tea: teas.get(id), count }));
}

function subtotal() {
  return cartItems().reduce((sum, { tea, count }) => sum + tea.price * count, 0);
}

function arrow(dark = false) {
  return '<img class="arrow" alt="" src="Assets/' + (dark ? "arrow-light" : "arrow") + '.svg">';
}

function actionLink(text, href, classes = "", showArrow = true) {
  return `<a class="button ${classes}" href="${href}"><span>${text}</span>${showArrow ? arrow(classes.includes("primary")) : ""}</a>`;
}

function productUrl(tea) { return "#product/" + tea.id; }

function productCard(tea, scope) {
  return `<article class="tea-card">
    <img class="card-photo" src="Assets/${tea.image}" width="339" height="339" alt="Упаковка чая «${tea.title}»" loading="lazy">
    <h3><a class="card-link" href="${productUrl(tea)}">${tea.title}</a></h3>
    <small class="card-weight">${tea.weight}</small>
    <p class="flavour">${tea.flavour}</p>
    <div class="card-bottom"><strong>${money(tea.price)}</strong>
      <div class="purchase-slot" data-purchase="${scope}" data-tea="${tea.id}"><button class="button" type="button" data-add="${tea.id}" aria-label="Добавить «${tea.title}» в корзину"><span>В КОРЗИНУ</span><img src="Assets/plus.svg" width="22" height="22" alt=""></button></div>
    </div></article>`;
}

function renderCatalog() {
  const visible = products.filter(tea => selectedType === "all" || tea.id === selectedType);
  if (sortOrder !== "default") {
    visible.sort((a, b) => sortOrder === "asc" ? a.price - b.price : b.price - a.price);
  }
  byId("catalog-grid").innerHTML = visible.map(tea => productCard(tea, "catalog")).join("");
  syncPurchaseControls(byId("catalog-grid"));
  renderOptions("type", [["all", "Все типы"], ...products.map(tea => [tea.id, tea.type])], selectedType);
  renderOptions("price", [["default", "По умолчанию"], ["asc", "Сначала дешевле"], ["desc", "Сначала дороже"]], sortOrder);
}

function renderOptions(group, options, selected) {
  const menu = byId(group + "-menu");
  const toggle = menu.previousElementSibling;
  toggle.classList.toggle("has-value", selected !== options[0][0]);
  const chosen = options.find(([value]) => value === selected)[1];
  toggle.setAttribute("aria-label", toggle.textContent.trim() + ". " + chosen);
  menu.innerHTML = options.map(([value, label]) =>
    `<button type="button" data-filter="${group}" data-value="${value}" aria-pressed="${value === selected}">${label}</button>`
  ).join("");
}

function closeFilters() {
  document.querySelectorAll(".filter-menu").forEach(menu => {
    menu.hidden = true;
    menu.previousElementSibling.setAttribute("aria-expanded", "false");
  });
}

function quantityControl(id, count, scope) {
  const name = teas.get(id).title;
  return `<div class="qty" data-scope="${scope}" data-id="${id}" role="group" aria-label="Количество чая «${name}»">
    <button type="button" data-step="-1" aria-label="Уменьшить количество — ${name}" ${count <= 0 ? "disabled" : ""}>−</button>
    <output aria-live="polite">${count}</output>
    <button type="button" data-step="1" aria-label="Увеличить количество — ${name}" ${count >= maxQuantity ? "disabled" : ""}>+</button>
  </div>`;
}

function syncPurchaseControls(root = document) {
  root.querySelectorAll("[data-purchase][data-tea]").forEach(slot => {
    const { tea: id, purchase: scope } = slot.dataset;
    const count = cart[id] || 0;
    const stepper = $(".qty", slot);
    if (scope === "detail") {
      const buy = byId("buy-product");
      buy.disabled = count > 0;
      if (!count && stepper.contains(document.activeElement)) buy.focus({ preventScroll: true });
      stepper.inert = !count;
      $("output", stepper).textContent = count;
      $('button[data-step="-1"]', stepper).disabled = !count;
      $('button[data-step="1"]', stepper).disabled = count >= maxQuantity;
      slot.classList.toggle("in-cart", count > 0);
      return;
    }
    slot.classList.toggle("in-cart", count > 0);
    if (!count) {
      if (stepper) {
        const focused = stepper.contains(document.activeElement);
        stepper.remove();
        if (focused) $(".button", slot).focus({ preventScroll: true });
      }
      return;
    }
    if (!stepper) {
      const focused = slot.contains(document.activeElement);
      slot.insertAdjacentHTML("beforeend", quantityControl(id, count, scope));
      if (focused) $('button[data-step="1"]:not(:disabled), button[data-step="-1"]', slot).focus({ preventScroll: true });
    } else {
      $("output", stepper).textContent = count;
      $('button[data-step="1"]', stepper).disabled = count >= maxQuantity;
      stepper.dataset.id = id;
    }
  });
}

function renderProduct(tea) {
  currentProduct = tea;
  const isBlack = tea.id === "black";
  $("[data-product-title]").textContent = tea.title;
  const image = byId("product-image");
  image.src = "Assets/" + tea.detailImage;
  image.alt = "Упаковка чая «" + tea.title + "»";
  byId("product-type").textContent = tea.type.toLocaleUpperCase("ru");
  byId("product-name").textContent = isBlack ? "Утренний\nпорядок" : tea.title;
  byId("product-flavour").textContent = tea.flavour;
  byId("product-price").textContent = money(tea.price);
  byId("product-intro").textContent = tea.intro;
  byId("character-desc").textContent = tea.description;
  const attributes = [["Тип чая", tea.variety], ["Вкусовые ноты", tea.notes], ["Характер", tea.character], ["Вес упаковки", tea.weight]];
  byId("tea-characteristics").innerHTML = attributes.map(([label, value]) =>
    `<div><dt>${label}</dt><dd>${value}</dd></div>`
  ).join("");
  byId("brew-note").textContent = tea.brewNote;
  const labels = ["01. КОЛИЧЕСТВО", "02. ТЕМПЕРАТУРА", "03. ВРЕМЯ"];
  byId("brew-steps").innerHTML = tea.brewing.map(([value, explanation], index) =>
    `<article class="brew-step"><small>${labels[index]}</small><h3>${value}</h3><p>${explanation}</p></article>`
  ).join("");
  byId("related-grid").innerHTML = products.filter(item => item.id !== tea.id).slice(0, 3).map(tea => productCard(tea, "related")).join("");
  const slot = $(".detail-slot");
  if (slot.dataset.tea !== tea.id) {
    $(".qty", slot)?.remove();
    slot.dataset.tea = tea.id;
    slot.insertAdjacentHTML("afterbegin", quantityControl(tea.id, cart[tea.id] || 0, "detail"));
  }
  syncPurchaseControls(byId("product"));
}

function itemDetails(tea, count, scope) {
  const detail = scope === "checkout" ? count + " шт." : money(tea.price) + " за шт.";
  return `<div class="item"><a href="${productUrl(tea)}" tabindex="-1" aria-hidden="true"><img src="Assets/${tea.image}" alt="" width="112" height="112"></a>
    <div><a class="item-name" href="${productUrl(tea)}">${tea.title}</a>
      <small class="desktop-only">${tea.type}  ${tea.weight}</small><strong class="desktop-only">${money(tea.price)}</strong>
      <small class="mobile-only">${tea.weight} · ${detail}</small></div></div>`;
}

function lineTotal(tea, count) {
  return `<strong class="line-total mobile-only">${money(tea.price * count)}</strong>`;
}

function emptyCart() {
  return '<div class="empty"><h2>Корзина пуста</h2>' + actionLink("ВЫБРАТЬ ЧАЙ", "#catalog") + '</div>';
}

function stackedItems(scope) {
  return cartItems().map(({ tea, count }) =>
    `<div class="line-item">${itemDetails(tea, count, scope)}${quantityControl(tea.id, count, scope)}${lineTotal(tea, count)}</div>`
  ).join("");
}

function renderDrawer() {
  const count = Object.values(cart).reduce((total, value) => total + value, 0);
  byId("drawer-heading").textContent = "Корзина (" + count + ")";
  byId("drawer-content").innerHTML = count ? `<div class="drawer-items">${stackedItems("drawer")}</div>
    <div class="drawer-total summary-line"><h3>Итого</h3><span>${money(subtotal())}</span></div>
    <div class="drawer-controls">${actionLink("ОФОРМИТЬ ЗАКАЗ", "#checkout", "primary")}
      ${actionLink("ОТКРЫТЬ КОРЗИНУ", "#cart", "secondary", false)}
      <p class="hint">Доставка рассчитывается при оформлении.</p></div>` : emptyCart();
}

function renderCart() {
  const items = cartItems();
  if (!items.length) {
    byId("cart-content").innerHTML = emptyCart();
    return;
  }
  const count = items.reduce((sum, item) => sum + item.count, 0);
  const unit = { one: "упаковка", few: "упаковки", many: "упаковок" }[new Intl.PluralRules("ru").select(count)];
  const packCount = count + " " + unit;
  const rows = items.map(({ tea, count }) => `<div class="cart-row">${itemDetails(tea, count, "cart")}${quantityControl(tea.id, count, "cart")}${lineTotal(tea, count)}
    <button type="button" class="icon-button" data-remove="${tea.id}" aria-label="Удалить «${tea.title}» из корзины"><img src="Assets/close.svg" alt="" width="22" height="22"></button></div>`).join("");
  byId("cart-content").innerHTML = `<div class="cart-columns"><div class="cart-list"><h2 class="desktop-only">Товары в корзине</h2><p class="pack-count mobile-only">${packCount}</p>${rows}
    ${actionLink("Вернуться к покупкам", "#catalog", "return desktop-only")}</div>
    <aside class="cart-summary"><h2>Ваш заказ</h2><div class="summary-line"><span>Итого</span><b>${money(subtotal())}</b></div>
    <p>Стоимость доставки рассчитаем при оформлении.</p>${actionLink("ОФОРМИТЬ ЗАКАЗ", "#checkout", "primary")}
    ${actionLink("ВЕРНУТЬСЯ К ПОКУПКАМ", "#catalog", "secondary mobile-only", false)}
    <span class="hint desktop-only">Нажимая кнопку, вы переходите к оформлению заказа.</span></aside></div>`;
}

function renderCheckout() {
  const hasItems = cartItems().length > 0;
  byId("checkout-grid").hidden = !hasItems;
  byId("checkout-empty").hidden = hasItems;
  if (!hasItems) {
    byId("checkout-empty").innerHTML = emptyCart();
    return;
  }
  const total = subtotal();
  byId("checkout-summary").innerHTML = `<div class="order-title"><h2>Ваш заказ</h2><a href="#cart" class="mobile-only">Изменить</a></div><div>${stackedItems("checkout")}</div><hr>
    <div class="summary-line"><span>Товары</span><span>${money(total)}</span></div>
    <div class="summary-line"><span>Доставка</span><span>${money(checkoutFee)}</span></div><hr>
    <div class="summary-line grand-total"><span>Итого</span><span>${money(total + checkoutFee)}</span></div>
    <button class="button primary" type="submit" form="checkout-form">ОФОРМИТЬ ЗАКАЗ${arrow(true)}</button>
    <p class="hint">Нажимая кнопку, вы соглашаетесь с условиями публичной оферты.</p>`;
}

function updateCartCount() {
  const count = Object.values(cart).reduce((total, value) => total + value, 0);
  document.querySelectorAll("[data-cart-count]").forEach(badge => {
    const changed = badge.textContent !== String(count);
    badge.textContent = count;
    badge.hidden = !count;
    badge.parentElement.setAttribute("aria-label", "Открыть корзину. Товаров: " + count);
    if (changed && count) {
      badge.classList.remove("bump");
      void badge.offsetWidth;
      badge.classList.add("bump");
    }
  });
}

function updateOrderLink() {
  $(".header-order").href = currentView === "home" || !cartItems().length ? "#catalog" : "#checkout";
}

function updateCartSurfaces() {
  syncPurchaseControls();
  updateCartCount();
  updateOrderLink();
  if (currentView === "cart") renderCart();
  if (currentView === "checkout") renderCheckout();
  if (drawer.open) renderDrawer();
}

function updateCart(id, count) {
  if (!teas.has(id)) return;
  if (count <= 0) delete cart[id];
  else cart[id] = Math.min(count, maxQuantity);
  persistCart();
  updateCartSurfaces();
}

function openDrawer() {
  renderDrawer();
  if (!drawer.open) drawer.showModal();
}

function handleRoute() {
  const route = location.hash.slice(1) || "home";
  const [name, productId] = route.split("/");
  const product = name === "product" && teas.get(productId);
  const view = product ? "product" : ["cart", "checkout"].includes(name) ? name : "home";
  const section = view === "home" && ["catalog", "about", "delivery", "brewing"].includes(name) ? byId(name) : null;
  if (drawer.open) drawer.close();
  if (receipt.open) receipt.close();
  if (menuDialog.open) menuDialog.close();
  closeFilters();
  const smooth = currentRoute !== null && currentView === "home" && view === "home"
    && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  currentView = view;
  currentRoute = route;
  document.body.dataset.view = view;
  document.querySelectorAll("[data-page]").forEach(page => { page.hidden = page.id !== view; });
  if (view === "product") renderProduct(product);
  if (view === "cart") renderCart();
  if (view === "checkout") renderCheckout();
  updateOrderLink();
  const titles = { cart: "Корзина", checkout: "Оформление заказа", home: "Чайная лавка" };
  document.title = (product ? product.title : titles[view]) + " — Ackerman Tea";
  if (section) {
    section.scrollIntoView({ behavior: smooth ? "smooth" : "instant" });
    if (sectionObserver && section.classList.contains("is-visible")) {
      section.classList.remove("is-visible");
      // Commit the hidden state before the observer starts the next transition.
      void section.offsetWidth;
      sectionObserver.observe(section);
    }
  } else {
    window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "instant" });
  }
}

function initMotion() {
  const header = $(".header");
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  sectionObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("is-visible");
    sectionObserver.unobserve(entry.target);
  }), { threshold: 0 });
  document.querySelectorAll("#about, #catalog, #brewing, #delivery").forEach(section => {
    section.classList.add("reveal");
    sectionObserver.observe(section);
  });
}

function changeQuantity(button) {
  const control = button.closest(".qty");
  const { id, scope } = control.dataset;
  const step = Number(button.dataset.step);
  updateCart(id, (cart[id] || 0) + step);
  const next = $(`.qty[data-scope="${scope}"][data-id="${id}"] button[data-step="${step}"]:not(:disabled)`);
  if (next) next.focus({ preventScroll: true });
}

document.addEventListener("click", event => {
  const target = event.target;
  const filterButton = target.closest(".filter-toggle");
  if (filterButton) {
    const menu = byId(filterButton.getAttribute("aria-controls"));
    const open = menu.hidden;
    closeFilters();
    menu.hidden = !open;
    filterButton.setAttribute("aria-expanded", String(open));
    return;
  }
  const option = target.closest("[data-filter]");
  if (option) {
    const toggle = option.parentElement.previousElementSibling;
    if (option.dataset.filter === "type") selectedType = option.dataset.value;
    else sortOrder = option.dataset.value;
    renderCatalog();
    closeFilters();
    toggle.focus();
    return;
  }
  if (!target.closest(".filter")) closeFilters();
  if (target.closest("[data-open-cart]")) return openDrawer();
  if (target.closest("[data-close-cart]")) return drawer.close();
  if (target.closest("#open-menu")) {
    menuDialog.showModal();
    byId("open-menu").setAttribute("aria-expanded", "true");
    return;
  }
  if (target.closest("#close-menu")) return menuDialog.close();
  if (target === drawer || target === menuDialog) {
    const rect = target.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return target.close();
  }
  const step = target.closest("[data-step]");
  if (step) return changeQuantity(step);
  const add = target.closest("[data-add], #buy-product");
  if (add) {
    if (add.disabled) return;
    const id = add.dataset.add || currentProduct.id;
    updateCart(id, (cart[id] || 0) + 1);
    return;
  }
  const remove = target.closest("[data-remove]");
  if (remove) return updateCart(remove.dataset.remove, 0);
  const link = target.closest('a[href^="#"]');
  if (link && link.hash.slice(1) === currentRoute && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    handleRoute();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    const openMenu = $(".filter-menu:not([hidden])");
    if (openMenu) {
      openMenu.previousElementSibling.focus();
      closeFilters();
    }
  }
});

menuDialog.addEventListener("close", () => byId("open-menu").setAttribute("aria-expanded", "false"));
const phoneLayout = matchMedia("(max-width: 767px)");
function syncSectionOrder() {
  const catalog = byId("catalog");
  const about = byId("about");
  if (phoneLayout.matches) about.before(catalog);
  else {
    about.after(catalog);
    if (menuDialog.open) menuDialog.close();
  }
}
phoneLayout.addEventListener("change", syncSectionOrder);
syncSectionOrder();

function updateAddressField() {
  const pickup = checkoutForm.elements.delivery.value === "pickup";
  byId("address-label").textContent = pickup ? "Адрес пункта выдачи" : "Адрес";
  checkoutForm.elements.address.placeholder = pickup ? "Улица и дом пункта выдачи" : "Улица, дом, квартира";
}

checkoutForm.addEventListener("change", event => {
  if (event.target.name === "delivery") updateAddressField();
});
checkoutForm.addEventListener("input", event => event.target.setCustomValidity(""));
checkoutForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!cartItems().length) return;
  for (const name of ["name", "city", "address"]) {
    const input = checkoutForm.elements[name];
    if (!input.value.trim()) input.setCustomValidity("Заполните это поле.");
  }
  const phone = checkoutForm.elements.phone;
  const digits = phone.value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15 || !/^[+\d\s()–-]+$/.test(phone.value)) {
    phone.setCustomValidity("Введите номер телефона с кодом города или страны.");
  }
  if (!checkoutForm.reportValidity()) return;
  const payment = checkoutForm.elements.payment.value === "card" ? "картой" : "через СБП";
  byId("receipt-detail").textContent = "Сумма с доставкой — " + money(subtotal() + checkoutFee) + ". Выбранный способ оплаты — " + payment + ".";
  receipt.showModal();
});
window.addEventListener("hashchange", handleRoute);
window.addEventListener("storage", event => {
  if (event.key === storageKey || event.key === null) {
    cart = readCart();
    updateCartSurfaces();
  }
});

renderCatalog();
handleRoute();
updateCartCount();
initMotion();

