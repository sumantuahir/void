// ═══════════════════════════
// CATALOG STATE & DYNAMIC LOADING
// ═══════════════════════════
let PRODUCTS = {};
let activeProductTag = "001";
let selectedColor = "";
let selectedSizeVal = "M";

const API_BASE = '';

function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const userJson = sessionStorage.getItem('void_user');
  if (userJson) {
    const user = JSON.parse(userJson);
    headers['X-User-Email'] = user.email;
  }
  return headers;
}

function voidFetch(url, options = {}) {
  options.headers = {
    ...getAuthHeaders(),
    ...(options.headers || {})
  };
  return fetch(url, options);
}

function fetchProducts() {
  return voidFetch(`${API_BASE}/api/products`)
    .then(res => res.json())
    .then(data => {
      PRODUCTS = {};
      data.forEach(p => {
        const hexes = {
          "Bone": "#F0EDE6",
          "Warm Stone": "#C4BFB5",
          "Slate Earth": "#6B6558",
          "Deep Ink": "#2A2825",
          "Void": "#0D0D0B"
        };
        PRODUCTS[p.code] = {
          id: p.id,
          name: p.name,
          tag: `${p.code} · ${p.category}`,
          material: p.desc.split('.')[0],
          price: p.price,
          image: p.images[0] || 'tee.png',
          desc: p.desc,
          colors: p.colors.map(c => ({ name: c, hex: hexes[c] || "#888888" })),
          sizes: p.sizes,
          category: p.category,
          stock: p.stock,
          discount: p.discount || 0,
          featured: p.featured || false
        };
      });
      renderProductGrids();
      updateWishlistUI();
    })
    .catch(err => {
      console.error("Error loading products:", err);
    });
}

function renderProductGrids() {
  const fpGrid = document.getElementById('featured-products-grid');
  const shopGrid = document.getElementById('shop-products-grid');
  
  // 1. Render Featured Products (Home Page)
  if (fpGrid) {
    fpGrid.innerHTML = '';
    const featuredList = Object.keys(PRODUCTS).filter(code => PRODUCTS[code].featured);
    
    // Fallback if none are explicitly featured
    const displayList = featuredList.length > 0 ? featuredList : Object.keys(PRODUCTS).slice(0, 2);
    
    displayList.forEach(code => {
      const p = PRODUCTS[code];
      const card = document.createElement('div');
      card.className = 'pcard reveal visible';
      card.onclick = () => openDrawer(code);
      card.innerHTML = `
        <div class="pcard-visual">
          <img class="pcard-img" src="${p.image}" alt="${p.name}">
          <span class="pcard-tag">${code}</span>
        </div>
        <div class="pcard-info">
          <h3 class="pcard-name">${p.name}</h3>
          <p class="pcard-material">${p.material}</p>
          <button class="pcard-btn" onclick="event.stopPropagation(); openDrawer('${code}')">Explore →</button>
        </div>
      `;
      fpGrid.appendChild(card);
    });
  }

  // 2. Render Shop Grid (Render all categories and dynamically generate filters)
  if (shopGrid) {
    shopGrid.innerHTML = '';
    
    // Track unique categories in loaded products
    const categories = new Set();
    
    Object.keys(PRODUCTS).forEach(code => {
      const p = PRODUCTS[code];
      categories.add(p.category);
      
      const card = document.createElement('div');
      card.className = 'shop-pcard';
      card.setAttribute('data-category', p.category);
      
      let colorsHtml = p.colors.map(c => `
        <div class="colour-dot" style="background:${c.hex};" title="${c.name}"></div>
      `).join('');

      card.innerHTML = `
        <div class="shop-pcard-visual" onclick="openDrawer('${code}')">
          <img class="shop-pcard-img" src="${p.image}" alt="${p.name}">
          <div class="shop-pcard-overlay"></div>
          <span class="shop-pcard-badge">${code} · ${p.category}</span>
        </div>
        <div class="shop-pcard-body">
          <h3 class="shop-pcard-name" onclick="openDrawer('${code}')">${p.name}</h3>
          <p class="shop-pcard-sub">${p.material}<br>Stock: ${p.stock > 0 ? `${p.stock} remaining` : 'Out of stock'}</p>
          <div class="shop-pcard-action">
            <div class="shop-pcard-colours">${colorsHtml}</div>
            <a class="shop-pcard-link" href="#" onclick="openDrawer('${code}'); return false;">Enquire →</a>
          </div>
        </div>
      `;
      shopGrid.appendChild(card);
    });

    // Dynamically build category filter buttons
    const filtersContainer = document.querySelector('.shop-filters');
    if (filtersContainer) {
      let filtersHtml = `<button class="shop-filter active" onclick="filterCategory('All', this)">All</button>`;
      categories.forEach(cat => {
        filtersHtml += `<button class="shop-filter" onclick="filterCategory('${cat}', this)">${cat}</button>`;
      });
      filtersContainer.innerHTML = filtersHtml;
    }
  }
}

// ═══════════════════════════
// SHOPPING CART & COOKIES
// ═══════════════════════════
let cart = JSON.parse(localStorage.getItem('void_cart')) || [];
let appliedCoupon = null;

// Theme toggle removed - Keep unified premium theme

// ═══════════════════════════
// OPTIMIZED CUSTOM CURSOR
// ═══════════════════════════
const cursorDot = document.getElementById('cursor-dot');
const cursorRing = document.getElementById('cursor-ring');
let dotX = 0, dotY = 0;
let ringX = 0, ringY = 0;

document.addEventListener('mousemove', e => {
  dotX = e.clientX;
  dotY = e.clientY;
});

function updateCursorPositions() {
  if (cursorDot) {
    cursorDot.style.transform = `translate3d(${dotX}px, ${dotY}px, 0) translate3d(-50%, -50%, 0)`;
  }
  if (cursorRing) {
    ringX += (dotX - ringX) * 0.18;
    ringY += (dotY - ringY) * 0.18;
    cursorRing.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate3d(-50%, -50%, 0)`;
  }
  requestAnimationFrame(updateCursorPositions);
}
requestAnimationFrame(updateCursorPositions);

document.addEventListener('mouseover', e => {
  const target = e.target.closest('a, button, .pcard, .cswatch, input, textarea, select, [role="button"], .star-select');
  if (target) document.body.classList.add('hovering');
});

document.addEventListener('mouseout', e => {
  const target = e.target.closest('a, button, .pcard, .cswatch, input, textarea, select, [role="button"], .star-select');
  if (target) document.body.classList.remove('hovering');
});

// Theme toggle function removed

// ═══════════════════════════
// VISITOR TRACKING ENGINE
// ═══════════════════════════
function trackVisitor() {
  let sessionId = localStorage.getItem('void_session_id');
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 12).toUpperCase();
    localStorage.setItem('void_session_id', sessionId);
  }
  
  // Get referrer source
  let referrer = document.referrer;
  let source = 'Direct';
  if (referrer) {
    if (referrer.includes('google') || referrer.includes('bing') || referrer.includes('yahoo')) {
      source = 'Search Engine';
    } else if (referrer.includes('instagram') || referrer.includes('facebook') || referrer.includes('twitter') || referrer.includes('t.co')) {
      source = 'Social Media';
    } else {
      source = 'Referrals';
    }
  }

  voidFetch(`${API_BASE}/api/visitors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      traffic_source: source,
      ip: '127.0.0.1' // simulated IP
    })
  }).catch(err => console.error("Error logging visitor:", err));
}

// ═══════════════════════════
// PAGE ROUTING SYSTEM
// ═══════════════════════════
function showPage(pageId) {
  const pages = document.querySelectorAll('.page');
  pages.forEach(page => page.classList.remove('active'));

  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => link.classList.remove('active'));

  const activePage = document.getElementById(`page-${pageId}`);
  if (activePage) activePage.classList.add('active');

  const activeLink = document.getElementById(`nav-link-${pageId}`);
  if (activeLink) activeLink.classList.add('active');

  closeDrawer();
  closeCart();
  closeWishlist();

  if (pageId === 'contact') {
    loadUserTickets();
  } else if (pageId === 'profile') {
    loadUserProfileData();
  }

  // Toggle nav and footer visibility for admin portal
  const isDocAdmin = pageId === 'admin' || pageId === 'admin-login';
  const navEl = document.getElementById('nav');
  const footerEl = document.querySelector('footer');
  if (navEl) navEl.style.display = isDocAdmin ? 'none' : 'flex';
  if (footerEl) footerEl.style.display = isDocAdmin ? 'none' : 'block';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ═══════════════════════════
// SCROLL EFFECTS (NAV & REVEALS)
// ═══════════════════════════
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  if (window.scrollY > 40) nav.classList.add('scrolled');
  else nav.classList.remove('scrolled');
});

const revealElements = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
revealElements.forEach(el => revealObserver.observe(el));

// ═══════════════════════════
// FILTER & SEARCH (DEBOUNCED)
// ═══════════════════════════
function filterCategory(category, btnElement) {
  const filters = document.querySelectorAll('.shop-filter');
  filters.forEach(filter => filter.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');

  const cards = document.querySelectorAll('.shop-pcard');
  cards.forEach(card => {
    const cardCat = card.getAttribute('data-category');
    if (category === 'All' || cardCat === category) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}

let searchDebounceTimeout = null;
function handleSearch(query) {
  clearTimeout(searchDebounceTimeout);
  searchDebounceTimeout = setTimeout(() => {
    query = query.toLowerCase().trim();
    const cards = document.querySelectorAll('.shop-pcard');
    cards.forEach(card => {
      const name = card.querySelector('.shop-pcard-name').textContent.toLowerCase();
      const sub = card.querySelector('.shop-pcard-sub').textContent.toLowerCase();
      if (name.includes(query) || sub.includes(query)) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  }, 150); // 150ms debounce eliminates input lag
}

// ═══════════════════════════
// WISHLIST STATE
// ═══════════════════════════
let wishlist = JSON.parse(localStorage.getItem('void_wishlist')) || [];

function toggleWishlist(code) {
  const idx = wishlist.indexOf(code);
  if (idx === -1) {
    wishlist.push(code);
  } else {
    wishlist.splice(idx, 1);
  }
  localStorage.setItem('void_wishlist', JSON.stringify(wishlist));
  updateWishlistUI();
}

function toggleWishlistCurrent() {
  toggleWishlist(activeProductTag);
  updateWishlistButtonLabel();
}

function updateWishlistButtonLabel() {
  const btn = document.getElementById('drawer-wishlist-btn');
  if (btn) {
    if (wishlist.includes(activeProductTag)) {
      btn.textContent = "Remove from Wishlist";
      btn.style.color = "var(--white)";
      btn.style.borderColor = "var(--white)";
    } else {
      btn.textContent = "Add to Wishlist";
      btn.style.color = "var(--sand)";
      btn.style.borderColor = "var(--sand)";
    }
  }
}

function openWishlist() {
  closeDrawer();
  closeCart();
  updateWishlistUI();
  document.getElementById('wishlist-drawer').classList.add('open');
  document.getElementById('wishlist-drawer-overlay').classList.add('open');
}

function closeWishlist() {
  document.getElementById('wishlist-drawer').classList.remove('open');
  document.getElementById('wishlist-drawer-overlay').classList.remove('open');
}

function updateWishlistUI() {
  const container = document.getElementById('wishlist-items-container');
  const navBadge = document.getElementById('wishlist-badge-nav');
  const mobileBadge = document.getElementById('mobile-wishlist-badge');
  
  if (navBadge) navBadge.textContent = wishlist.length;
  if (mobileBadge) mobileBadge.textContent = wishlist.length;
  
  if (!container) return;
  container.innerHTML = '';
  
  if (wishlist.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">∅</div>
        <div class="cart-empty-text">Your wishlist is empty</div>
      </div>
    `;
    return;
  }
  
  wishlist.forEach(code => {
    const product = PRODUCTS[code];
    if (!product) return;
    const div = document.createElement('div');
    div.className = 'cart-item';
    div.innerHTML = `
      <div class="cart-item-details">
        <h4 class="cart-item-name">${product.name}</h4>
        <span class="cart-item-meta">${product.tag}</span>
        <span class="cart-item-price">₹${product.price.toLocaleString('en-IN')}</span>
      </div>
      <div class="cart-item-controls" style="flex-direction:row; gap:10px;">
        <button class="qty-btn" style="width:auto; padding:4px 10px; font-size:8px; text-transform:uppercase;" onclick="openDrawer('${code}'); closeWishlist();">View</button>
        <button class="cart-item-remove" onclick="toggleWishlist('${code}'); updateWishlistUI();">Remove</button>
      </div>
    `;
    container.appendChild(div);
  });
}

// ═══════════════════════════
// PRODUCT DETAIL DRAWER
// ═══════════════════════════
const drawer = document.getElementById('drawer');
const drawerOverlay = document.getElementById('drawer-overlay');

function openDrawer(prodId) {
  const product = PRODUCTS[prodId];
  if (!product) return;

  activeProductTag = prodId;
  selectedColor = product.colors[0].name;
  selectedSizeVal = "M";

  document.getElementById('drawer-tag').textContent = product.tag;
  document.getElementById('drawer-title').innerHTML = product.name.replace("The ", "The <em>") + "</em>";
  document.getElementById('drawer-material').textContent = product.material;
  document.getElementById('drawer-desc').textContent = product.desc;
  
  const drawerImg = document.getElementById('drawer-img');
  if (drawerImg) {
    drawerImg.src = product.image;
    drawerImg.alt = product.name;
  }

  const colorsContainer = document.getElementById('drawer-colours');
  colorsContainer.innerHTML = '';
  product.colors.forEach((color, idx) => {
    const colorBtn = document.createElement('button');
    colorBtn.className = `drawer-colour-btn ${idx === 0 ? 'active' : ''}`;
    colorBtn.style.backgroundColor = color.hex;
    colorBtn.title = color.name;
    colorBtn.onclick = () => {
      document.querySelectorAll('.drawer-colour-btn').forEach(btn => btn.classList.remove('active'));
      colorBtn.classList.add('active');
      selectedColor = color.name;
    };
    colorsContainer.appendChild(colorBtn);
  });

  document.querySelectorAll('.drawer-size-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.textContent === selectedSizeVal) btn.classList.add('active');
  });

  updateWishlistButtonLabel();
  loadProductReviews(prodId);

  if (drawerOverlay && drawer) {
    drawerOverlay.classList.add('open');
    drawer.classList.add('open');
  }
}

function closeDrawer() {
  if (drawerOverlay && drawer) {
    drawerOverlay.classList.remove('open');
    drawer.classList.remove('open');
  }
}

function selectSize(btnElement) {
  document.querySelectorAll('.drawer-size-btn').forEach(btn => btn.classList.remove('active'));
  btnElement.classList.add('active');
  selectedSizeVal = btnElement.textContent;
}

// ═══════════════════════════
// PRODUCT REVIEWS
// ═══════════════════════════
let currentSelectRating = 5;

function setSelectRating(val) {
  currentSelectRating = val;
  document.getElementById('review-rating-val').value = val;
  const stars = document.querySelectorAll('.star-select');
  stars.forEach((star, idx) => {
    if (idx < val) star.classList.add('selected');
    else star.classList.remove('selected');
  });
}

function loadProductReviews(prodId) {
  const container = document.getElementById('reviews-list-container');
  const avgText = document.getElementById('reviews-avg-rating');
  const starsDisplay = document.getElementById('reviews-stars-display');
  const countText = document.getElementById('reviews-count-text');

  if (!container) return;
  container.innerHTML = '<span style="font-size:11px; color:var(--mid);">Loading reviews...</span>';

  voidFetch(`${API_BASE}/api/reviews/${prodId}`)
    .then(res => res.json())
    .then(data => {
      container.innerHTML = '';
      if (data.length === 0) {
        container.innerHTML = '<span style="font-size:11px; color:var(--mid);">No reviews yet. Be the first to share your thoughts!</span>';
        if (avgText) avgText.textContent = '0.0';
        if (starsDisplay) starsDisplay.textContent = '☆☆☆☆☆';
        if (countText) countText.textContent = '(0 reviews)';
        return;
      }

      let total = 0;
      data.forEach(r => {
        total += r.rating;
        const div = document.createElement('div');
        div.className = 'review-item';
        const starStr = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
        div.innerHTML = `
          <div class="review-meta">
            <strong>${r.userName}</strong>
            <span>${new Date(r.date).toLocaleDateString()}</span>
          </div>
          <div class="review-stars">${starStr}</div>
          <p class="review-comment">${r.comment}</p>
        `;
        container.appendChild(div);
      });

      const avg = (total / data.length).toFixed(1);
      if (avgText) avgText.textContent = avg;
      if (countText) countText.textContent = `(${data.length} review${data.length > 1 ? 's' : ''})`;
      
      const starAvgStr = '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg));
      if (starsDisplay) starsDisplay.textContent = starAvgStr;
    })
    .catch(err => {
      console.error(err);
      container.innerHTML = '<span style="font-size:11px; color:#ea4335;">Failed to load reviews.</span>';
    });
}

function handleReviewSubmit(e) {
  e.preventDefault();
  const author = document.getElementById('review-author').value;
  const comment = document.getElementById('review-text').value;
  const rating = parseInt(document.getElementById('review-rating-val').value);

  const reviewRecord = {
    productId: activeProductTag,
    userName: author,
    rating,
    comment,
    date: new Date().toISOString()
  };

  voidFetch(`${API_BASE}/api/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reviewRecord)
  })
  .then(res => {
    if (!res.ok) throw new Error("Failed to submit review");
    document.getElementById('review-form').reset();
    setSelectRating(5);
    loadProductReviews(activeProductTag);
  })
  .catch(err => {
    console.error(err);
    alert('Failed to save review. Please try again.');
  });
}

// ═══════════════════════════
// SHOPPING CART DRAWER
// ═══════════════════════════
const cartDrawer = document.getElementById('cart-drawer');
const cartOverlay = document.getElementById('cart-drawer-overlay');

function openCart() {
  closeDrawer();
  document.getElementById('cart-items-container').style.display = 'block';
  document.getElementById('cart-summary-section').style.display = 'block';
  document.getElementById('checkout-form').style.display = 'none';
  document.getElementById('checkout-success').style.display = 'none';

  updateCartUI();

  if (cartOverlay && cartDrawer) {
    cartOverlay.classList.add('open');
    cartDrawer.classList.add('open');
  }
}

function closeCart() {
  if (cartOverlay && cartDrawer) {
    cartOverlay.classList.remove('open');
    cartDrawer.classList.remove('open');
  }
}

function addToCartCurrent() {
  addToCart(activeProductTag, selectedColor, selectedSizeVal);
}

function addToCart(prodId, color, size) {
  const existingItem = cart.find(item => item.prodId === prodId && item.color === color && item.size === size);
  if (existingItem) {
    existingItem.qty += 1;
  } else {
    cart.push({ prodId, color, size, qty: 1 });
  }
  localStorage.setItem('void_cart', JSON.stringify(cart));
  closeDrawer();
  openCart();
}

function removeFromCart(idx) {
  cart.splice(idx, 1);
  localStorage.setItem('void_cart', JSON.stringify(cart));
  updateCartUI();
}

function updateQuantity(idx, delta) {
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  localStorage.setItem('void_cart', JSON.stringify(cart));
  updateCartUI();
}

function updateCartUI() {
  const itemsContainer = document.getElementById('cart-items-container');
  const badge = document.getElementById('cart-badge-nav');
  const subtotalVal = document.getElementById('cart-subtotal-val');
  const summarySection = document.getElementById('cart-summary-section');

  let totalQty = 0;
  let subtotal = 0;
  itemsContainer.innerHTML = '';

  if (cart.length === 0) {
    itemsContainer.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">∅</div>
        <div class="cart-empty-text">Your cart is empty</div>
      </div>
    `;
    if (summarySection) summarySection.style.display = 'none';
    if (badge) badge.textContent = '0';
    return;
  }

  if (summarySection) summarySection.style.display = 'block';

  cart.forEach((item, idx) => {
    const product = PRODUCTS[item.prodId];
    if (!product) return;

    totalQty += item.qty;
    subtotal += product.price * item.qty;

    const cartItemDiv = document.createElement('div');
    cartItemDiv.className = 'cart-item';
    cartItemDiv.innerHTML = `
      <div class="cart-item-details">
        <h4 class="cart-item-name">${product.name}</h4>
        <span class="cart-item-meta">${item.size} · ${item.color}</span>
        <span class="cart-item-price">₹${product.price.toLocaleString('en-IN')}</span>
      </div>
      <div class="cart-item-controls">
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="updateQuantity(${idx}, -1)">-</button>
          <span class="qty-val">${item.qty}</span>
          <button class="qty-btn" onclick="updateQuantity(${idx}, 1)">+</button>
        </div>
        <button class="cart-item-remove" onclick="removeFromCart(${idx})">Remove</button>
      </div>
    `;
    itemsContainer.appendChild(cartItemDiv);
  });

  if (appliedCoupon) {
    const discountAmount = Math.round(subtotal * (appliedCoupon.discount / 100));
    subtotal = subtotal - discountAmount;
    document.getElementById('discount-row').style.display = 'flex';
    document.getElementById('discount-percent').textContent = appliedCoupon.discount;
    document.getElementById('discount-val').textContent = `-₹${discountAmount.toLocaleString('en-IN')}`;
  } else {
    document.getElementById('discount-row').style.display = 'none';
  }

  if (badge) badge.textContent = totalQty;
  if (subtotalVal) subtotalVal.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
}

// ═══════════════════════════
// COUPON VALIDATION
// ═══════════════════════════
function applyCoupon() {
  const code = document.getElementById('checkout-coupon').value.trim().toUpperCase();
  const feedback = document.getElementById('coupon-feedback');
  if (!code) return;

  voidFetch(`${API_BASE}/api/coupons/${code}`)
    .then(res => {
      if (!res.ok) throw new Error("Coupon code invalid");
      return res.json();
    })
    .then(data => {
      appliedCoupon = data;
      feedback.style.display = 'block';
      feedback.style.color = '#4eb570';
      feedback.textContent = `Discount Code ${data.code} applied: ${data.discount}% OFF!`;
      updateCartUI();
    })
    .catch(err => {
      console.error(err);
      appliedCoupon = null;
      feedback.style.display = 'block';
      feedback.style.color = '#ea4335';
      feedback.textContent = 'Invalid or expired discount coupon.';
      updateCartUI();
    });
}

// ═══════════════════════════
// CHECKOUT & PAYMENT SUCCESS
// ═══════════════════════════
let pendingOrderRecord = null;

function showCheckoutForm() {
  document.getElementById('cart-items-container').style.display = 'none';
  document.getElementById('cart-summary-section').style.display = 'none';
  
  const chForm = document.getElementById('checkout-form');
  chForm.style.display = 'block';
  chForm.reset();
  document.getElementById('coupon-feedback').style.display = 'none';
}

function handleCheckoutSubmit(e) {
  e.preventDefault();
  
  const email = document.getElementById('checkout-email').value;
  const name = document.getElementById('checkout-name').value;
  const address = document.getElementById('checkout-address').value;
  
  let subtotal = 0;
  const orderItems = cart.map(item => {
    const product = PRODUCTS[item.prodId];
    if (product) subtotal += product.price * item.qty;
    return {
      prodId: item.prodId,
      name: product ? product.name : "Unknown",
      price: product ? product.price : 0,
      color: item.color,
      size: item.size,
      qty: item.qty
    };
  });

  let discountAmount = 0;
  if (appliedCoupon) {
    discountAmount = Math.round(subtotal * (appliedCoupon.discount / 100));
  }
  const finalTotal = subtotal - discountAmount;
  const orderId = 'VOID-' + Math.floor(100000 + Math.random() * 900000);

  pendingOrderRecord = {
    id: orderId,
    name,
    email,
    address,
    items: orderItems,
    total: finalTotal,
    paymentId: "",
    date: new Date().toISOString()
  };

  // Launch Razorpay Simulation Overlay Modal
  document.getElementById('rzp-order-id-label').textContent = `Order Reference: ${orderId}`;
  document.getElementById('rzp-amount-label').textContent = `₹${finalTotal.toLocaleString('en-IN')}`;
  
  document.getElementById('razorpay-modal').classList.add('open');
  document.getElementById('razorpay-modal-overlay').classList.add('open');
}

function simulatePaymentSuccess(method) {
  if (!pendingOrderRecord) return;

  const payRef = 'pay_' + Math.random().toString(36).substring(2, 10).toUpperCase();
  pendingOrderRecord.paymentId = `${payRef}_${method.toUpperCase()}`;

  voidFetch(`${API_BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pendingOrderRecord)
  })
  .then(res => {
    if (!res.ok) throw new Error('Order submission failed');
    return res.json();
  })
  .then(data => {
    closeRazorpayModal();
    document.getElementById('checkout-form').style.display = 'none';

    // Clear cart state
    const placedOrder = pendingOrderRecord;
    cart = [];
    appliedCoupon = null;
    localStorage.removeItem('void_cart');
    updateCartUI();

    document.getElementById('checkout-success').style.display = 'block';

    const invoiceWrap = document.getElementById('invoice-download-btn-wrap');
    if (invoiceWrap) {
      invoiceWrap.innerHTML = `
        <button class="cform-submit" onclick="downloadInvoice('${placedOrder.id}')" style="width: auto; padding: 10px 24px;">Download Invoice (TXT)</button>
      `;
    }
    pendingOrderRecord = null;
  })
  .catch(err => {
    console.error(err);
    alert('Failed to place order. Please try again.');
  });
}

function closeRazorpayModal() {
  document.getElementById('razorpay-modal').classList.remove('open');
  document.getElementById('razorpay-modal-overlay').classList.remove('open');
}

// Invoice Generator
function downloadInvoice(orderId) {
  voidFetch(`${API_BASE}/api/admin`, {
    headers: { }
  })
  .then(res => res.json())
  .then(data => {
    const order = data.orders.find(o => o.id === orderId);
    if (!order) {
      alert("Order details could not be loaded.");
      return;
    }
    
    let itemsText = "";
    order.items.forEach(i => {
      itemsText += `${i.name.padEnd(20)} ${i.size}/${i.color.padEnd(12)} ${i.qty}x    ₹${i.price.toLocaleString('en-IN')}\n`;
    });

    const invoiceBody = `
==================================================
                 VOID ESSENTIALS                  
==================================================
Studio: Void Ahmedabad, Gujarat, India
Email: void.essentials.in@gmail.com
--------------------------------------------------
                 INVOICE RECEIPT                  
--------------------------------------------------
Order ID:    ${order.id}
Date:        ${new Date(order.date).toLocaleString()}
Customer:    ${order.name}
Email:       ${order.email}
Address:     ${order.address}
Payment ID:  ${order.paymentId || 'CASH_ON_DELIVERY'}
--------------------------------------------------
Item Description     Size/Color   Qty   Price     
--------------------------------------------------
${itemsText}
--------------------------------------------------
TOTAL AMOUNT PAID:  ₹${order.total.toLocaleString('en-IN')}
==================================================
       Thank you for choosing VOID Essentials     
==================================================
`;
    const blob = new Blob([invoiceBody], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `VOID_INVOICE_${order.id}.txt`;
    link.click();
  })
  .catch(err => {
    console.error(err);
    alert('Error generating invoice document.');
  });
}

// ═══════════════════════════
// WAITLIST & CONTACT FORMS
// ═══════════════════════════
function handleWaitlistSubmit(e) {
  e.preventDefault();
  const emailInput = document.getElementById('waitlist-email');
  if (!emailInput || !emailInput.value) return;

  const waitlistRecord = {
    email: emailInput.value,
    date: new Date().toISOString()
  };

  voidFetch(`${API_BASE}/api/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(waitlistRecord)
  })
  .then(res => {
    if (!res.ok) throw new Error('Waitlist submission failed');
    const form = document.getElementById('waitlist-form');
    const bodyText = document.getElementById('waitlist-body-text');
    const noteText = document.getElementById('waitlist-note-text');
    const successMessage = document.getElementById('waitlist-success');

    form.style.opacity = '0';
    if (bodyText) bodyText.style.opacity = '0';
    if (noteText) noteText.style.opacity = '0';
    
    setTimeout(() => {
      form.style.display = 'none';
      if (bodyText) bodyText.style.display = 'none';
      if (noteText) noteText.style.display = 'none';
      if (successMessage) successMessage.style.display = 'block';
    }, 300);
  })
  .catch(err => {
    console.error(err);
    alert('Failed to join waitlist. Please try again.');
  });
}

function handleContactSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('contact-name').value;
  const email = document.getElementById('contact-email').value;
  const message = document.getElementById('contact-message').value;

  const contactRecord = {
    name,
    email,
    message,
    date: new Date().toISOString()
  };

  voidFetch(`${API_BASE}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contactRecord)
  })
  .then(res => {
    if (!res.ok) throw new Error('Contact submission failed');
    const form = document.getElementById('contact-form');
    const header = document.getElementById('contact-form-header');
    const successMessage = document.getElementById('contact-success');

    form.style.opacity = '0';
    if (header) header.style.opacity = '0';

    setTimeout(() => {
      form.style.display = 'none';
      if (header) header.style.display = 'none';
      if (successMessage) successMessage.style.display = 'block';
    }, 300);
  })
  .catch(err => {
    console.error(err);
    alert('Failed to send message. Please try again.');
  });
}

// ═══════════════════════════
// CUSTOMER TICKETING LOGS
// ═══════════════════════════
function loadUserTickets() {
  const user = JSON.parse(sessionStorage.getItem('void_user'));
  const section = document.getElementById('contact-tickets-section');
  const listContainer = document.getElementById('tickets-list-container');

  if (!user) {
    if (section) section.style.display = 'none';
    return;
  }

  if (section) section.style.display = 'block';
  if (!listContainer) return;

  listContainer.innerHTML = '<span style="font-size:11px; color:var(--mid);">Loading support tickets...</span>';

  voidFetch(`${API_BASE}/api/ticket?user_id=${user.email}`)
    .then(res => res.json())
    .then(tickets => {
      listContainer.innerHTML = '';
      if (tickets.length === 0) {
        listContainer.innerHTML = '<span style="font-size:11px; color:var(--mid);">No support tickets opened yet.</span>';
        return;
      }

      tickets.forEach(t => {
        const div = document.createElement('div');
        div.className = 'ticket-card';
        div.innerHTML = `
          <div class="ticket-header">
            <span class="ticket-subject">${t.subject}</span>
            <span class="ticket-status ${t.status}">${t.status}</span>
          </div>
          <p class="ticket-msg">${t.message}</p>
          ${t.reply ? `<div class="ticket-reply"><strong>Resolution:</strong> ${t.reply}</div>` : ''}
        `;
        listContainer.appendChild(div);
      });
    })
    .catch(err => {
      console.error(err);
      listContainer.innerHTML = '<span style="font-size:11px; color:#ea4335;">Failed to load ticket records.</span>';
    });
}

function loadUserProfileData() {
  const user = JSON.parse(sessionStorage.getItem('void_user'));
  if (!user) {
    showPage('login');
    return;
  }

  // Populate user details
  document.getElementById('profile-name-display').textContent = user.name;
  document.getElementById('profile-email-display').textContent = user.email;
  document.getElementById('profile-role-display').textContent = user.role.toUpperCase();

  const ordersContainer = document.getElementById('profile-orders-list');
  if (!ordersContainer) return;

  ordersContainer.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--mid); padding:24px;">Loading order history...</td></tr>';

  // Fetch tickets for this user too (render inside profile page tickets container)
  const profileTicketsContainer = document.getElementById('profile-tickets-list');
  if (profileTicketsContainer) {
    profileTicketsContainer.innerHTML = '<span style="font-size:11px; color:var(--mid);">Loading support tickets...</span>';
    voidFetch(`${API_BASE}/api/ticket?user_id=${user.email}`)
      .then(res => res.json())
      .then(tickets => {
        profileTicketsContainer.innerHTML = '';
        if (tickets.length === 0) {
          profileTicketsContainer.innerHTML = '<span style="font-size:11px; color:var(--mid);">No support tickets opened yet.</span>';
          return;
        }
        tickets.forEach(t => {
          const div = document.createElement('div');
          div.className = 'ticket-card';
          div.innerHTML = `
            <div class="ticket-header">
              <span class="ticket-subject">${t.subject}</span>
              <span class="ticket-status ${t.status}">${t.status}</span>
            </div>
            <p class="ticket-msg">${t.message}</p>
            ${t.reply ? `<div class="ticket-reply"><strong>Resolution:</strong> ${t.reply}</div>` : ''}
          `;
          profileTicketsContainer.appendChild(div);
        });
      })
      .catch(err => {
        console.error(err);
        profileTicketsContainer.innerHTML = '<span style="font-size:11px; color:#ea4335;">Failed to load ticket records.</span>';
      });
  }

  // Fetch orders
  voidFetch(`${API_BASE}/api/orders/my?user_id=${user.email}`)
    .then(res => {
      if (!res.ok) throw new Error("Failed to load orders");
      return res.json();
    })
    .then(orders => {
      ordersContainer.innerHTML = '';
      if (orders.length === 0) {
        ordersContainer.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--mid); padding:24px;">You have not placed any orders yet.</td></tr>';
        return;
      }

      orders.forEach(order => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #2a2825';
        
        const dateFormatted = new Date(order.date).toLocaleDateString('en-IN', {
          year: 'numeric', month: 'short', day: 'numeric'
        });

        let itemsSummary = '';
        order.items.forEach(it => {
          itemsSummary += `<div>${it.name} (${it.size}/${it.color}) x${it.qty}</div>`;
        });

        tr.innerHTML = `
          <td style="padding:16px 8px; font-family:'Space Mono', monospace; font-size:12px; color:var(--sand);">${order.id}</td>
          <td style="padding:16px 8px; font-size:12px;">${dateFormatted}</td>
          <td style="padding:16px 8px; font-size:12px;">${itemsSummary}</td>
          <td style="padding:16px 8px; font-size:12px; font-family:'Space Mono', monospace; color:var(--white);">₹${order.total.toLocaleString('en-IN')}</td>
          <td style="padding:16px 8px; font-size:12px;"><span class="ticket-status ${order.status}" style="padding:2px 8px; border-radius:3px; font-size:10px; text-transform:uppercase;">${order.status}</span></td>
        `;
        ordersContainer.appendChild(tr);
      });
    })
    .catch(err => {
      console.error(err);
      ordersContainer.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ea4335; padding:24px;">Failed to retrieve order history.</td></tr>';
    });
}

function handleTicketSubmit(e) {
  e.preventDefault();
  const user = JSON.parse(sessionStorage.getItem('void_user'));
  if (!user) return;

  const subject = document.getElementById('ticket-subject').value;
  const message = document.getElementById('ticket-message').value;

  const ticketRecord = {
    user_id: user.email,
    subject,
    message,
    date: new Date().toISOString()
  };

  voidFetch(`${API_BASE}/api/ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticketRecord)
  })
  .then(res => {
    if (!res.ok) throw new Error("Ticket registration failed");
    document.getElementById('ticket-form').reset();
    loadUserTickets();
  })
  .catch(err => {
    console.error(err);
    alert('Failed to open ticket. Try again.');
  });
}

// ═══════════════════════════
// ADMIN PORTAL & PAGINATION
// ═══════════════════════════
const PAGINATION = {
  orders: { page: 1, limit: 10, data: [] },
  users: { page: 1, limit: 10, data: [] },
  contacts: { page: 1, limit: 10, data: [] },
  waitlist: { page: 1, limit: 10, data: [] },
  tickets: { page: 1, limit: 10, data: [] },
  emails: { page: 1, limit: 10, data: [] }
};

let rawAdminData = null; // Stash to enable offline time filter updates

function changePage(table, direction) {
  const p = PAGINATION[table];
  const maxPage = Math.ceil(p.data.length / p.limit) || 1;
  p.page += direction;
  if (p.page < 1) p.page = 1;
  if (p.page > maxPage) p.page = maxPage;
  
  if (table === 'orders') renderOrdersTable();
  else if (table === 'users') renderUsersTable();
  else if (table === 'contacts') renderContactsTable();
  else if (table === 'waitlist') renderWaitlistTable();
  else if (table === 'tickets') renderTicketsTable();
  else if (table === 'emails') renderEmailsTable();
}

function updatePaginationControls(table) {
  const p = PAGINATION[table];
  const maxPage = Math.ceil(p.data.length / p.limit) || 1;
  
  const prevBtn = document.getElementById(`btn-prev-${table}`);
  const nextBtn = document.getElementById(`btn-next-${table}`);
  const infoSpan = document.getElementById(`pagination-info-${table}`);
  
  if (prevBtn) prevBtn.disabled = p.page === 1;
  if (nextBtn) nextBtn.disabled = p.page === maxPage;
  
  if (infoSpan) {
    const start = p.data.length === 0 ? 0 : (p.page - 1) * p.limit + 1;
    const end = Math.min(p.page * p.limit, p.data.length);
    infoSpan.textContent = `Showing ${start}-${end} of ${p.data.length} records`;
  }
}

function switchAdminTab(tabName) {
  document.querySelectorAll('.sidebar-link').forEach(btn => btn.classList.remove('active'));
  const activeLink = document.getElementById(`side-link-${tabName}`);
  if (activeLink) activeLink.classList.add('active');

  document.querySelectorAll('.admin-portal-tab').forEach(tab => tab.classList.remove('active'));
  const activeTabContent = document.getElementById(`portal-tab-${tabName}`);
  if (activeTabContent) activeTabContent.classList.add('active');

  const titleText = document.getElementById('admin-panel-title-text');
  if (titleText) {
    const titles = {
      overview: "Dashboard Overview",
      orders: "Orders Management",
      users: "User Database Logs",
      contacts: "Customer Query Messages",
      waitlist: "Drop One Waitlist",
      products: "Products Inventory",
      tickets: "Support Tickets Logs",
      emails: "Sent Emails History Log",
      analytics: "System Analytics",
      settings: "System Settings"
    };
    titleText.textContent = titles[tabName] || "Dashboard";
  }
}

function loadAdminData() {
  const userJson = sessionStorage.getItem('void_user');
  let isAuthorized = false;
  if (userJson) {
    const user = JSON.parse(userJson);
    if (['superadmin', 'admin', 'staff'].includes(user.role)) {
      isAuthorized = true;
    }
  }
  const dashboardWrap = document.getElementById('admin-dashboard-wrap');

  if (!isAuthorized) {
    if (dashboardWrap) dashboardWrap.style.display = 'none';
    window.history.pushState({}, '', '/login');
    showPage('login');
    return;
  }

  voidFetch(`${API_BASE}/api/admin`)
  .then(res => {
    if (res.status === 401) {
      sessionStorage.removeItem('void_user');
      sessionStorage.removeItem('void_admin_authorized');
      loadAdminData();
      throw new Error('Unauthorized');
    }
    return res.json();
  })
  .then(data => {
    rawAdminData = data;
    if (dashboardWrap) dashboardWrap.style.display = 'flex';

    // 1. Populate Live stats counters
    const metrics = data.metrics || {};
    document.getElementById('widget-revenue').textContent = `₹${(metrics.totalRevenue || 0).toLocaleString('en-IN')}`;
    document.getElementById('widget-orders-count').textContent = metrics.totalOrders || 0;
    document.getElementById('widget-pending-count').textContent = metrics.pendingOrders || 0;
    document.getElementById('widget-processing-count').textContent = metrics.processingOrders || 0;
    document.getElementById('widget-shipped-count').textContent = metrics.shippedOrders || 0;
    document.getElementById('widget-delivered-count').textContent = metrics.deliveredOrders || 0;
    document.getElementById('widget-cancelled-count').textContent = metrics.cancelledOrders || 0;
    document.getElementById('widget-products-count').textContent = metrics.totalProducts || 0;
    document.getElementById('widget-users-count').textContent = metrics.totalUsers || 0;
    document.getElementById('widget-visitors-count').textContent = metrics.totalVisitors || 0;
    document.getElementById('widget-messages-count').textContent = metrics.contactMessages || 0;
    document.getElementById('widget-wishlist-count').textContent = metrics.wishlistUsers || 0;

    // Sidebar counts updates
    document.getElementById('admin-sidebar-count-orders').textContent = metrics.totalOrders || 0;
    document.getElementById('admin-sidebar-count-contacts').textContent = metrics.contactMessages || 0;
    document.getElementById('admin-sidebar-count-waitlist').textContent = data.waitlist.length;
    document.getElementById('admin-sidebar-count-users').textContent = metrics.totalUsers || 0;
    document.getElementById('admin-sidebar-count-tickets').textContent = data.tickets.length;
    document.getElementById('admin-sidebar-count-emails').textContent = data.sent_emails.length;

    // Stash pagination sets
    PAGINATION.orders.data = data.orders || [];
    PAGINATION.users.data = data.users || [];
    PAGINATION.contacts.data = data.contacts || [];
    PAGINATION.waitlist.data = data.waitlist || [];
    PAGINATION.tickets.data = data.tickets || [];
    PAGINATION.emails.data = data.sent_emails || [];

    // Load form settings variables
    loadSettingsData(data.settings);

    // Initial table renders
    renderOrdersTable();
    renderUsersTable();
    renderContactsTable();
    renderWaitlistTable();
    renderTicketsTable();
    renderEmailsTable();
    
    // Render Products management list
    renderProductsManagementList(data.products);

    // Initial Chart renders
    applyChartFilter('weekly');
    renderAnalyticsCharts(data);
  })
  .catch(err => {
    console.error(err);
  });
}

// ═══════════════════════════
// PAGINATED TABLE RENDERERS
// ═══════════════════════════
function getPaginatedSlice(table) {
  const p = PAGINATION[table];
  const start = (p.page - 1) * p.limit;
  const end = start + p.limit;
  return p.data.slice(start, end);
}

function renderOrdersTable() {
  const body = document.getElementById('admin-table-orders-body');
  if (!body) return;
  body.innerHTML = '';
  
  const slice = getPaginatedSlice('orders');
  if (slice.length === 0) {
    body.innerHTML = '<tr><td colspan="10" class="admin-empty-state">No orders registered.</td></tr>';
  } else {
    slice.forEach(ord => {
      const itemsHtml = ord.items.map(item => `
        <div class="admin-table-item-desc">
          <em>${item.qty}x</em> ${item.name} (${item.size}/${item.color})
        </div>
      `).join('');
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${ord.id}</strong></td>
        <td>${ord.name}</td>
        <td>${ord.email}</td>
        <td>${ord.address}</td>
        <td>${itemsHtml}</td>
        <td>₹${ord.total.toLocaleString('en-IN')}</td>
        <td><span class="stock-badge in-stock">${ord.payment_status || 'paid'}</span></td>
        <td>
          <select class="cform-input" style="padding:4px 8px; font-size:10px; width:auto; margin:0;" onchange="updateOrderStatus('${ord.id}', this.value)">
            <option value="pending" ${ord.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="processing" ${ord.status === 'processing' ? 'selected' : ''}>Processing</option>
            <option value="shipped" ${ord.status === 'shipped' ? 'selected' : ''}>Shipped</option>
            <option value="delivered" ${ord.status === 'delivered' ? 'selected' : ''}>Delivered</option>
            <option value="cancelled" ${ord.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </td>
        <td>${new Date(ord.date).toLocaleString()}</td>
        <td>
          <button class="prod-action-btn" onclick="downloadInvoice('${ord.id}')">Invoice</button>
          <button class="admin-row-delete-btn" onclick="deleteDbRecord('${ord.id}', 'orders')">Delete</button>
        </td>
      `;
      body.appendChild(row);
    });
  }
  updatePaginationControls('orders');
}

function renderUsersTable() {
  const body = document.getElementById('admin-table-users-body');
  if (!body) return;
  body.innerHTML = '';
  
  const slice = getPaginatedSlice('users');
  if (slice.length === 0) {
    body.innerHTML = '<tr><td colspan="8" class="admin-empty-state">No customers registered.</td></tr>';
  } else {
    slice.forEach(u => {
      const isSuspended = u.status === 'suspended';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>USR-${u.id}</strong></td>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>${new Date(u.date).toLocaleDateString()}</td>
        <td>${u.orders_count || 0} orders</td>
        <td>₹${(u.total_spent || 0).toLocaleString('en-IN')}</td>
        <td><span class="ticket-status ${isSuspended ? 'open' : 'resolved'}" style="${isSuspended ? 'background:rgba(234,67,53,0.1); color:#ea4335;' : ''}">${u.status || 'active'}</span></td>
        <td>
          <button class="prod-action-btn" onclick="openUserEditModal(${u.id}, '${u.name}', '${u.email}', '${u.role}')">Edit</button>
          <button class="prod-action-btn" style="${isSuspended ? 'border-color:#4eb570; color:#4eb570;' : 'border-color:#ea4335; color:#ea4335;'}" onclick="toggleUserSuspension(${u.id}, '${u.status}')">
            ${isSuspended ? 'Reactivate' : 'Suspend'}
          </button>
          <button class="admin-row-delete-btn" onclick="deleteDbRecord(${u.id}, 'users')">Delete</button>
        </td>
      `;
      body.appendChild(row);
    });
  }
  updatePaginationControls('users');
}

function renderContactsTable() {
  const body = document.getElementById('admin-table-contacts-body');
  if (!body) return;
  body.innerHTML = '';
  
  const slice = getPaginatedSlice('contacts');
  if (slice.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="admin-empty-state">No enquiries received.</td></tr>';
  } else {
    slice.forEach(msg => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${msg.name}</strong></td>
        <td>${msg.email}</td>
        <td>${msg.subject || 'General'}</td>
        <td>${msg.message}</td>
        <td>${new Date(msg.date).toLocaleString()}</td>
        <td>
          <button class="prod-action-btn" onclick="replyToContact(${msg.id})">Reply</button>
          <button class="admin-row-delete-btn" onclick="deleteDbRecord(${msg.id}, 'contacts')">Delete</button>
        </td>
      `;
      body.appendChild(row);
    });
  }
  updatePaginationControls('contacts');
}

function renderWaitlistTable() {
  const body = document.getElementById('admin-table-waitlist-body');
  if (!body) return;
  body.innerHTML = '';
  
  const slice = getPaginatedSlice('waitlist');
  if (slice.length === 0) {
    body.innerHTML = '<tr><td colspan="3" class="admin-empty-state">Waitlist database is empty.</td></tr>';
  } else {
    slice.forEach(entry => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${entry.email}</td>
        <td>${new Date(entry.date).toLocaleString()}</td>
        <td><button class="admin-row-delete-btn" onclick="deleteDbRecord(${entry.id}, 'waitlist')">Delete</button></td>
      `;
      body.appendChild(row);
    });
  }
  updatePaginationControls('waitlist');
}

function renderTicketsTable() {
  const body = document.getElementById('admin-table-tickets-body');
  if (!body) return;
  body.innerHTML = '';
  
  const slice = getPaginatedSlice('tickets');
  if (slice.length === 0) {
    body.innerHTML = '<tr><td colspan="8" class="admin-empty-state">No support tickets created.</td></tr>';
  } else {
    slice.forEach(t => {
      const escapedMsg = t.message.replace(/'/g, "\\'").replace(/"/g, '\\"');
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>TCK-${t.id}</strong></td>
        <td>${t.user_id}</td>
        <td>${t.subject}</td>
        <td>${t.message}</td>
        <td><span class="ticket-status ${t.status}">${t.status}</span></td>
        <td>${t.reply ? `<em>${t.reply}</em>` : '<span style="color:var(--sand);">Unresolved</span>'}</td>
        <td>${new Date(t.date).toLocaleString()}</td>
        <td>
          ${t.status === 'open' ? `<button class="prod-action-btn" onclick="openReplyModal(${t.id}, '${escapedMsg}')">Reply</button>` : ''}
          <button class="admin-row-delete-btn" onclick="deleteDbRecord(${t.id}, 'tickets')">Delete</button>
        </td>
      `;
      body.appendChild(row);
    });
  }
  updatePaginationControls('tickets');
}

function renderEmailsTable() {
  const body = document.getElementById('admin-table-emails-body');
  if (!body) return;
  body.innerHTML = '';
  
  const slice = getPaginatedSlice('emails');
  if (slice.length === 0) {
    body.innerHTML = '<tr><td colspan="8" class="admin-empty-state">No emails logged.</td></tr>';
  } else {
    slice.forEach(log => {
      const isFailed = log.status === 'failed';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>MAIL-${log.id}</strong></td>
        <td>${log.recipient}</td>
        <td>${log.subject}</td>
        <td>${log.message.substring(0, 50)}...</td>
        <td><span class="ticket-status ${isFailed ? 'open' : 'resolved'}" style="${isFailed ? 'background:rgba(234,67,53,0.1); color:#ea4335;' : ''}">${log.status}</span></td>
        <td><small style="color:var(--mid); font-size:9px;">${log.error_log || 'N/A'}</small></td>
        <td>${new Date(log.date).toLocaleString()}</td>
        <td><button class="admin-row-delete-btn" onclick="deleteDbRecord(${log.id}, 'sent_emails')">Delete</button></td>
      `;
      body.appendChild(row);
    });
  }
  updatePaginationControls('emails');
}

function renderProductsManagementList(products) {
  const grid = document.getElementById('admin-products-grid');
  if (!grid) return;
  grid.innerHTML = '';
  
  products.forEach(p => {
    const card = document.createElement('div');
    card.className = 'prod-manage-card';
    card.innerHTML = `
      <img src="${p.images[0] || 'tee.png'}" class="prod-manage-img" alt="${p.name}">
      <div class="prod-manage-details">
        <span class="prod-manage-tag">${p.code} · ${p.category} ${p.featured ? '★ Featured' : ''}</span>
        <h3 class="prod-manage-title">${p.name}</h3>
        <p class="prod-manage-material">Stock count: ${p.stock} units</p>
        <p class="prod-manage-price">Price: ₹${p.price.toLocaleString('en-IN')}</p>
        <div class="prod-actions">
          <button class="prod-action-btn" onclick="openProductModal('${p.code}')">Edit</button>
          <button class="prod-action-btn delete" onclick="deleteDbRecord('${p.id}', 'products')">Delete</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ═══════════════════════════
// ADMIN MODALS: EMAIL PORTAL
// ═══════════════════════════
function openEmailModal(recipient, subject = '', body = '') {
  document.getElementById('email-compose-recipient').value = recipient;
  document.getElementById('email-compose-subject').value = subject;
  document.getElementById('email-compose-message').value = body;
  
  document.getElementById('email-modal').classList.add('open');
  document.getElementById('email-modal-overlay').classList.add('open');
}

function replyToContact(msgId) {
  const contact = PAGINATION['contacts'].data.find(c => c.id === msgId);
  if (!contact) return;
  const recipient = contact.email;
  const subject = `Re: ${contact.subject || 'Enquiry from ' + contact.name}`;
  const body = `\n\n\n--- On ${new Date(contact.date).toLocaleString()}, ${contact.name} wrote:\n> ${contact.message.replace(/\n/g, '\n> ')}`;
  openEmailModal(recipient, subject, body);
}

function closeEmailModal() {
  document.getElementById('email-modal').classList.remove('open');
  document.getElementById('email-modal-overlay').classList.remove('open');
}

function handleEmailComposeSubmit(e) {
  e.preventDefault();
  const recipient = document.getElementById('email-compose-recipient').value;
  const subject = document.getElementById('email-compose-subject').value;
  const message = document.getElementById('email-compose-message').value;

  voidFetch(`${API_BASE}/api/email/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient, subject, message })
  })
  .then(res => {
    if (!res.ok) throw new Error("Email dispatch failed");
    return res.json();
  })
  .then(data => {
    closeEmailModal();
    alert(`Email successfully dispatched: ${data.message}`);
    loadAdminData();
  })
  .catch(err => {
    console.error(err);
    alert('Direct email dispatch failed. Checking server logs...');
    loadAdminData();
  });
}

// ═══════════════════════════
// ADMIN MODALS: USER EDIT & SUSPENSION
// ═══════════════════════════
function openUserEditModal(id, name, email, role) {
  document.getElementById('user-edit-id').value = id;
  document.getElementById('user-edit-name').value = name;
  document.getElementById('user-edit-email').value = email;
  document.getElementById('user-edit-role').value = role;

  document.getElementById('user-edit-modal').classList.add('open');
  document.getElementById('user-edit-modal-overlay').classList.add('open');
}

function closeUserEditModal() {
  document.getElementById('user-edit-modal').classList.remove('open');
  document.getElementById('user-edit-modal-overlay').classList.remove('open');
}

function handleUserEditFormSubmit(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById('user-edit-id').value);
  const name = document.getElementById('user-edit-name').value;
  const email = document.getElementById('user-edit-email').value;
  const role = document.getElementById('user-edit-role').value;

  voidFetch(`${API_BASE}/api/users/edit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, name, email, role })
  })
  .then(res => {
    if (!res.ok) throw new Error("Edit details update failed");
    closeUserEditModal();
    loadAdminData();
  })
  .catch(err => {
    console.error(err);
    alert("Failed to edit user profile.");
  });
}

function toggleUserSuspension(id, currentStatus) {
  const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
  if (confirm(`Are you sure you want to change user status to: ${newStatus}?`)) {
    voidFetch(`${API_BASE}/api/users/suspend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id, status: newStatus })
    })
    .then(res => {
      if (!res.ok) throw new Error("Suspension update failed");
      loadAdminData();
    })
    .catch(err => {
      console.error(err);
      alert("Failed to update suspension profile.");
    });
  }
}

// ═══════════════════════════
// ADMIN MODALS: DRAG & DROP FILE UPLOADS
// ═══════════════════════════
let selectedImagesList = [];

function setupDragAndDrop() {
  const dragArea = document.getElementById('image-drag-area');
  const fileInput = document.getElementById('prod-image-file');
  
  if (!dragArea) return;
  
  dragArea.addEventListener('click', () => fileInput.click());
  
  dragArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    dragArea.style.borderColor = 'var(--sand)';
    dragArea.style.background = 'rgba(196,168,130,0.05)';
  });
  
  dragArea.addEventListener('dragleave', () => {
    dragArea.style.borderColor = 'var(--faint)';
    dragArea.style.background = 'rgba(240,237,230,0.02)';
  });
  
  dragArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dragArea.style.borderColor = 'var(--faint)';
    dragArea.style.background = 'rgba(240,237,230,0.02)';
    
    if (e.dataTransfer.files.length > 0) {
      handleImageFiles(e.dataTransfer.files);
    }
  });
}

function handleImageFileSelect(e) {
  if (e.target.files.length > 0) {
    handleImageFiles(e.target.files);
  }
}

function handleImageFiles(files) {
  const previewContainer = document.getElementById('image-previews-container');
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      // preview element
      const div = document.createElement('div');
      div.style.position = 'relative';
      div.style.width = '60px';
      div.style.height = '60px';
      div.style.border = '1px solid var(--faint)';
      
      div.innerHTML = `
        <img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover;">
        <button type="button" onclick="this.parentElement.remove(); removeSelectedImage('${file.name}');" style="position:absolute; top:2px; right:2px; background:rgba(0,0,0,0.7); color:#fff; border-radius:50%; width:16px; height:16px; font-size:10px; display:flex; align-items:center; justify-content:center; border:none; cursor:none;">×</button>
      `;
      previewContainer.appendChild(div);
      selectedImagesList.push({ name: file.name, dataUrl: e.target.result });
      
      // Update hidden input filename
      document.getElementById('prod-form-images').value = selectedImagesList.map(img => img.name).join(',');
    };
    reader.readAsDataURL(file);
  });
}

function removeSelectedImage(name) {
  selectedImagesList = selectedImagesList.filter(img => img.name !== name);
  document.getElementById('prod-form-images').value = selectedImagesList.map(img => img.name).join(',');
}

// ═══════════════════════════
// WEBSITE SETTINGS
// ═══════════════════════════
function loadSettingsData(settings) {
  if (!settings) return;
  document.getElementById('settings-website-name').value = settings.website_name || '';
  document.getElementById('settings-logo-url').value = settings.logo_url || '';
  document.getElementById('settings-contact-email').value = settings.contact_email || '';
  document.getElementById('settings-contact-phone').value = settings.contact_phone || '';
  document.getElementById('settings-social-instagram').value = settings.social_instagram || '';
  
  document.getElementById('settings-smtp-host').value = settings.smtp_host || '';
  document.getElementById('settings-smtp-port').value = settings.smtp_port || '';
  document.getElementById('settings-smtp-user').value = settings.smtp_user || '';
  document.getElementById('settings-smtp-pass').value = settings.smtp_pass || '';
  
  document.getElementById('settings-razorpay-key').value = settings.razorpay_key || '';
  document.getElementById('settings-razorpay-secret').value = settings.razorpay_secret || '';
  
  document.getElementById('settings-seo-title').value = settings.seo_title || '';
  document.getElementById('settings-seo-desc').value = settings.seo_description || '';
}

function handleSettingsFormSubmit(e) {
  e.preventDefault();
  const settingsData = {
    website_name: document.getElementById('settings-website-name').value,
    logo_url: document.getElementById('settings-logo-url').value,
    contact_email: document.getElementById('settings-contact-email').value,
    contact_phone: document.getElementById('settings-contact-phone').value,
    social_instagram: document.getElementById('settings-social-instagram').value,
    
    smtp_host: document.getElementById('settings-smtp-host').value,
    smtp_port: document.getElementById('settings-smtp-port').value,
    smtp_user: document.getElementById('settings-smtp-user').value,
    smtp_pass: document.getElementById('settings-smtp-pass').value,
    
    razorpay_key: document.getElementById('settings-razorpay-key').value,
    razorpay_secret: document.getElementById('settings-razorpay-secret').value,
    
    seo_title: document.getElementById('settings-seo-title').value,
    seo_description: document.getElementById('settings-seo-desc').value
  };

  voidFetch(`${API_BASE}/api/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settingsData)
  })
  .then(res => {
    if (!res.ok) throw new Error("Settings update failed");
    alert("Website configurations updated successfully!");
    loadAdminData();
  })
  .catch(err => {
    console.error(err);
    alert("Failed to save settings variables.");
  });
}

// ═══════════════════════════
// DYNAMIC CHART.JS FILTER CALCULATOR
// ═══════════════════════════
let overviewChartInstance = null;
let sourcesChartInstance = null;
let visitorsChartInstance = null;
let categoryChartInstance = null;
let userRegChartInstance = null;
let revenueTrendChartInstance = null;

function applyChartFilter(timeframe) {
  if (!rawAdminData) return;
  const orders = rawAdminData.orders || [];
  const visitors = rawAdminData.visitors || [];
  
  // Calculate date ranges
  const today = new Date();
  let labels = [];
  let revenueDataset = [];
  let visitorsDataset = [];

  if (timeframe === 'daily') {
    // Last 24 hours (grouped by hours)
    labels = ['12 AM', '4 AM', '8 AM', '12 PM', '4 PM', '8 PM'];
    revenueDataset = [0, 2400, 4800, 9600, 2400, 7200];
    visitorsDataset = [2, 10, 15, 30, 25, 40];
  } else if (timeframe === 'weekly') {
    // Last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      labels.push(d.toLocaleDateString('en-IN', { weekday: 'short' }));
      
      const matchDateStr = d.toISOString().split('T')[0];
      const dayOrders = orders.filter(o => o.date.startsWith(matchDateStr) && o.status !== 'cancelled');
      const dayRev = dayOrders.reduce((sum, o) => sum + o.total, 0);
      revenueDataset.push(dayRev);

      const dayVisits = visitors.filter(v => v.date.startsWith(matchDateStr));
      visitorsDataset.push(dayVisits.length);
    }
  } else if (timeframe === 'monthly') {
    // Last 4 weeks
    labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    revenueDataset = [9600, 12000, 14400, 18200];
    visitorsDataset = [80, 110, 150, 200];
  } else if (timeframe === 'yearly') {
    // Last 12 months
    labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    revenueDataset = [0, 0, 0, 0, 0, orders.reduce((sum, o) => sum + o.total, 0), 0, 0, 0, 0, 0, 0];
    visitorsDataset = [0, 0, 0, 0, 0, visitors.length, 0, 0, 0, 0, 0, 0];
  }

  // Draw Overview Tab Chart (combined visitors/activity)
  const ctx = document.getElementById('overviewChart');
  if (ctx) {
    if (overviewChartInstance) overviewChartInstance.destroy();
    overviewChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Sales Revenue (₹)',
            data: revenueDataset,
            borderColor: '#C4A882',
            backgroundColor: 'rgba(196,168,130,0.1)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Visitor Sessions',
            data: visitorsDataset,
            borderColor: '#5A5750',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [5, 5],
            tension: 0.3,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { color: 'var(--white)', font: { size: 9 } } } },
        scales: {
          x: { grid: { color: 'rgba(240,237,230,0.03)' }, ticks: { color: '#5A5750', font: { family: 'Space Mono', size: 8 } } },
          y: { 
            grid: { color: 'rgba(240,237,230,0.03)' }, 
            ticks: { color: '#5A5750', font: { family: 'Space Mono', size: 8 } },
            position: 'left'
          },
          y1: {
            grid: { drawOnChartArea: false },
            ticks: { color: '#5A5750', font: { family: 'Space Mono', size: 8 } },
            position: 'right'
          }
        }
      }
    });
  }
}

// ═══════════════════════════
// ANALYTICS PAGES CHARTS
// ═══════════════════════════
function renderAnalyticsCharts(data) {
  const metrics = data.metrics || {};
  const visitors = data.visitors || [];
  const users = data.users || [];
  const orders = data.orders || [];
  const products = data.products || [];

  // Traffic sources pie chart (Overview Tab side panel)
  const ctxPie = document.getElementById('sourcesPieChart');
  if (ctxPie) {
    if (sourcesChartInstance) sourcesChartInstance.destroy();
    
    const srcMap = metrics.trafficSources || {};
    sourcesChartInstance = new Chart(ctxPie, {
      type: 'pie',
      data: {
        labels: Object.keys(srcMap),
        datasets: [{
          data: Object.values(srcMap),
          backgroundColor: ['#C4A882', '#5A5750', '#8A7055', '#2A2825'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: 'var(--white)', font: { family: 'Space Mono', size: 8 } }
          }
        }
      }
    });
  }

  // 1. Visitors Trend Line Chart
  const ctxVis = document.getElementById('visitorsChart');
  if (ctxVis) {
    const dates = [];
    const counts = [];
    for (let i = 9; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const str = d.toISOString().split('T')[0];
      dates.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
      counts.push(visitors.filter(v => v.date.startsWith(str)).length);
    }

    if (visitorsChartInstance) visitorsChartInstance.destroy();
    visitorsChartInstance = new Chart(ctxVis, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [{
          data: counts,
          borderColor: '#C4A882',
          borderWidth: 2,
          tension: 0.2,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(240,237,230,0.03)' }, ticks: { color: '#5A5750', font: { family: 'Space Mono', size: 8 } } },
          y: { grid: { color: 'rgba(240,237,230,0.03)' }, ticks: { color: '#5A5750', font: { family: 'Space Mono', size: 8 } } }
        }
      }
    });
  }

  // 2. User Reg bar chart
  const ctxReg = document.getElementById('userRegChart');
  if (ctxReg) {
    const dates = [];
    const counts = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const str = d.toISOString().split('T')[0];
      dates.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
      counts.push(users.filter(u => u.date.startsWith(str)).length);
    }

    if (userRegChartInstance) userRegChartInstance.destroy();
    userRegChartInstance = new Chart(ctxReg, {
      type: 'bar',
      data: {
        labels: dates,
        datasets: [{
          data: counts,
          backgroundColor: '#5A5750'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(240,237,230,0.03)' }, ticks: { color: '#5A5750', font: { family: 'Space Mono', size: 8 } } },
          y: { grid: { color: 'rgba(240,237,230,0.03)' }, ticks: { color: '#5A5750', font: { family: 'Space Mono', size: 8 } } }
        }
      }
    });
  }

  // 3. Category doughnut chart
  const ctxCategory = document.getElementById('categoryChart');
  if (ctxCategory) {
    if (categoryChartInstance) categoryChartInstance.destroy();
    const categories = {};
    products.forEach(p => {
      categories[p.category] = (categories[p.category] || 0) + 1;
    });

    categoryChartInstance = new Chart(ctxCategory, {
      type: 'doughnut',
      data: {
        labels: Object.keys(categories),
        datasets: [{
          data: Object.values(categories),
          backgroundColor: ['#C4A882', '#5A5750', '#8A7055', '#2A2825'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#F0EDE6', font: { family: 'Space Mono', size: 8 } }
          }
        }
      }
    });
  }

  // 4. Revenue & Orders Trend
  const ctxRevTrend = document.getElementById('revenueChart');
  if (ctxRevTrend) {
    const dates = [];
    const counts = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const str = d.toISOString().split('T')[0];
      dates.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
      counts.push(orders.filter(o => o.date.startsWith(str)).length);
    }

    if (revenueTrendChartInstance) revenueTrendChartInstance.destroy();
    revenueTrendChartInstance = new Chart(ctxRevTrend, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [{
          data: counts,
          borderColor: '#C4A882',
          borderWidth: 1.5,
          tension: 0.3,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(240,237,230,0.03)' }, ticks: { color: '#5A5750', font: { family: 'Space Mono', size: 8 } } },
          y: { grid: { color: 'rgba(240,237,230,0.03)' }, ticks: { color: '#5A5750', font: { family: 'Space Mono', size: 8 } } }
        }
      }
    });
  }
}

// ═══════════════════════════
// ADMIN MODALS: PRODUCT CRUD
// ═══════════════════════════
function openProductModal(prodId = null) {
  const modal = document.getElementById('product-modal');
  const overlay = document.getElementById('product-modal-overlay');
  const title = document.getElementById('product-modal-title');
  const form = document.getElementById('product-form');
  
  form.reset();
  document.getElementById('prod-form-id').value = '';
  document.getElementById('image-previews-container').innerHTML = '';
  selectedImagesList = [];

  if (prodId) {
    title.textContent = "Edit Product Details";
    const product = PRODUCTS[prodId];
    if (product) {
      document.getElementById('prod-form-id').value = product.id;
      document.getElementById('prod-form-code').value = prodId;
      document.getElementById('prod-form-name').value = product.name;
      document.getElementById('prod-form-price').value = product.price;
      document.getElementById('prod-form-desc').value = product.desc;
      document.getElementById('prod-form-category').value = product.category;
      document.getElementById('prod-form-stock').value = product.stock;
      document.getElementById('prod-form-colors').value = product.colors.map(c => c.name).join(',');
      document.getElementById('prod-form-sizes').value = product.sizes.join(',');
      document.getElementById('prod-form-images').value = product.image;
      document.getElementById('prod-form-featured').checked = product.featured || false;
      document.getElementById('prod-form-discount').value = product.discount || 0;
    }
  } else {
    title.textContent = "Add New Product";
  }

  modal.classList.add('open');
  overlay.classList.add('open');
}

function closeProductModal() {
  document.getElementById('product-modal').classList.remove('open');
  document.getElementById('product-modal-overlay').classList.remove('open');
}

function handleProductFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('prod-form-id').value;
  const code = document.getElementById('prod-form-code').value;
  const name = document.getElementById('prod-form-name').value;
  const price = parseFloat(document.getElementById('prod-form-price').value);
  const desc = document.getElementById('prod-form-desc').value;
  const category = document.getElementById('prod-form-category').value;
  const stock = parseInt(document.getElementById('prod-form-stock').value);
  const colors = document.getElementById('prod-form-colors').value;
  const sizes = document.getElementById('prod-form-sizes').value;
  const images = document.getElementById('prod-form-images').value;
  const featured = document.getElementById('prod-form-featured').checked;
  const discount = parseFloat(document.getElementById('prod-form-discount').value || 0);

  const productData = {
    id,
    code,
    name,
    price,
    desc,
    category,
    stock,
    colors,
    sizes,
    images,
    featured,
    discount,
    uploaded_images: selectedImagesList
  };

  voidFetch(`${API_BASE}/api/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(productData)
  })
  .then(res => {
    if (!res.ok) throw new Error("Failed to save product");
    closeProductModal();
    fetchProducts().then(() => {
      loadAdminData();
    });
  })
  .catch(err => {
    console.error(err);
    alert('Failed to save product details.');
  });
}

// ═══════════════════════════
// ADMIN MODALS: TICKET RESOLVE
// ═══════════════════════════
function openReplyModal(ticketId, message) {
  document.getElementById('reply-ticket-id').value = ticketId;
  document.getElementById('reply-ticket-desc').textContent = `Ticket: "${message}"`;
  document.getElementById('reply-text-input').value = '';

  document.getElementById('reply-modal').classList.add('open');
  document.getElementById('reply-modal-overlay').classList.add('open');
}

function closeReplyModal() {
  document.getElementById('reply-modal').classList.remove('open');
  document.getElementById('reply-modal-overlay').classList.remove('open');
}

function handleTicketReplySubmit(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById('reply-ticket-id').value);
  const reply = document.getElementById('reply-text-input').value;

  voidFetch(`${API_BASE}/api/ticket/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, reply })
  })
  .then(res => {
    if (!res.ok) throw new Error("Ticket reply failed");
    closeReplyModal();
    loadAdminData();
  })
  .catch(err => {
    console.error(err);
    alert('Failed to resolve support ticket.');
  });
}

// ═══════════════════════════
// AUTHENTICATION LOGIC & RBAC
// ═══════════════════════════
function updateAuthUI() {
  const user = JSON.parse(sessionStorage.getItem('void_user'));
  const guestLinks = document.getElementById('nav-guest-links');
  const userLinks = document.getElementById('nav-user-links');
  const usernameDisplay = document.getElementById('nav-username-display');
  const adminPanelLink = document.getElementById('nav-link-admin-panel');
  const footerAdminLink = document.getElementById('footer-admin-link');

  const mobileGuest = document.getElementById('mobile-guest-links');
  const mobileUser = document.getElementById('mobile-user-links');
  const mobileUsername = document.getElementById('mobile-username-display');
  const mobileAdmin = document.getElementById('mobile-admin-btn');

  if (user) {
    if (guestLinks) guestLinks.style.display = 'none';
    if (userLinks) userLinks.style.display = 'inline-flex';
    if (usernameDisplay) usernameDisplay.textContent = user.name;
    
    if (mobileGuest) mobileGuest.style.display = 'none';
    if (mobileUser) mobileUser.style.display = 'block';
    if (mobileUsername) mobileUsername.textContent = user.name;

    // Enforce Role-Based displays
    const hasAdminAccess = ['superadmin', 'admin', 'staff'].includes(user.role);
    if (hasAdminAccess) {
      if (adminPanelLink) adminPanelLink.style.display = 'inline-block';
      if (mobileAdmin) mobileAdmin.style.display = 'block';
      if (footerAdminLink) footerAdminLink.style.display = 'inline-block';
      
      const roleText = document.getElementById('admin-profile-role-display');
      if (roleText) roleText.textContent = user.role.toUpperCase() + " ACCESS";
    } else {
      if (adminPanelLink) adminPanelLink.style.display = 'none';
      if (mobileAdmin) mobileAdmin.style.display = 'none';
      if (footerAdminLink) footerAdminLink.style.display = 'none';
    }
  } else {
    if (guestLinks) guestLinks.style.display = 'inline-flex';
    if (userLinks) userLinks.style.display = 'none';
    if (adminPanelLink) adminPanelLink.style.display = 'none';
    
    if (mobileGuest) mobileGuest.style.display = 'block';
    if (mobileUser) mobileUser.style.display = 'none';
    if (mobileAdmin) mobileAdmin.style.display = 'none';
  }
  loadUserTickets();
}

function handleLoginSubmit(e) {
  e.preventDefault();
  const emailInput = document.getElementById('login-email').value;
  const passwordInput = document.getElementById('login-password').value;
  const errorMsg = document.getElementById('login-error-msg');

  voidFetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailInput, password: passwordInput })
  })
  .then(res => {
    if (res.status === 403) {
      alert("Your profile has been suspended by an Administrator.");
      throw new Error("Suspended");
    }
    if (!res.ok) throw new Error('Invalid credentials');
    return res.json();
  })
  .then(data => {
    if (errorMsg) errorMsg.classList.remove('visible');
    sessionStorage.setItem('void_user', JSON.stringify(data.user));
    if (data.token) {
      sessionStorage.setItem('void_token', data.token);
    }
    
    const is_admin = ['superadmin', 'admin', 'staff'].includes(data.user.role);
    if (is_admin) {
      sessionStorage.setItem('void_admin_authorized', 'true');
    }
    
    updateAuthUI();
    document.getElementById('login-form').reset();
    
    if (is_admin) {
      window.history.pushState({}, '', '/admin-dashboard');
      showPage('admin');
      loadAdminData();
    } else {
      showPage('home');
    }
  })
  .catch(err => {
    console.error(err);
    if (errorMsg && err.message !== "Suspended") errorMsg.classList.add('visible');
  });
}

function handleSignUpSubmit(e) {
  e.preventDefault();
  const nameInput = document.getElementById('signup-name').value;
  const emailInput = document.getElementById('signup-email').value;
  const passwordInput = document.getElementById('signup-password').value;
  const errorMsg = document.getElementById('signup-error-msg');

  voidFetch(`${API_BASE}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nameInput,
      email: emailInput,
      password: passwordInput,
      date: new Date().toISOString()
    })
  })
  .then(res => {
    if (!res.ok) throw new Error('Signup failed');
    return res.json();
  })
  .then(data => {
    if (errorMsg) errorMsg.classList.remove('visible');
    sessionStorage.setItem('void_user', JSON.stringify(data.user));
    if (data.token) {
      sessionStorage.setItem('void_token', data.token);
    }
    updateAuthUI();
    document.getElementById('signup-form').reset();
    showPage('home');
  })
  .catch(err => {
    console.error(err);
    if (errorMsg) errorMsg.classList.add('visible');
  });
}

function handleLogout() {
  sessionStorage.removeItem('void_user');
  sessionStorage.removeItem('void_admin_authorized');
  sessionStorage.removeItem('void_token');
  updateAuthUI();
  showPage('home');
}

function attemptAdminLogin() {
  const emailInput = document.getElementById('admin-email');
  const passInput = document.getElementById('admin-password');
  const errBlock = document.getElementById('admin-login-error');
  const successBlock = document.getElementById('admin-login-success');
  if (!emailInput || !passInput) return;

  const email = emailInput.value;
  const password = passInput.value;

  voidFetch(`${API_BASE}/api/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })
  .then(res => {
    if (!res.ok) throw new Error('Invalid email or password.');
    return res.json();
  })
  .then(data => {
    if (!['superadmin', 'admin', 'staff'].includes(data.user.role)) {
      throw new Error('Access denied: Account is not an administrator.');
    }
    
    // Store user session
    sessionStorage.setItem('void_user', JSON.stringify(data.user));
    sessionStorage.setItem('void_admin_authorized', 'true');
    
    if (errBlock) errBlock.classList.remove('visible');
    if (successBlock) successBlock.classList.add('visible');
    
    setTimeout(() => {
      if (successBlock) successBlock.classList.remove('visible');
      
      window.history.pushState({}, '', '/admin-dashboard');
      showPage('admin');
      
      // Load all admin data
      loadAdminData();
    }, 1000);
  })
  .catch(err => {
    console.error(err);
    if (errBlock) {
      errBlock.textContent = err.message || 'Invalid email or password.';
      errBlock.classList.add('visible');
    }
  });
}

function updateOrderStatus(orderId, newStatus) {
  voidFetch(`${API_BASE}/api/orders/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: orderId, status: newStatus })
  })
  .then(res => {
    if (!res.ok) throw new Error("Order status update failed");
    loadAdminData();
  })
  .catch(err => {
    console.error(err);
    alert('Failed to update status.');
  });
}

function deleteDbRecord(recordId, tabName) {
  if (confirm('Are you sure you want to delete this record?')) {
    voidFetch(`${API_BASE}/api/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ table: tabName, id: recordId })
    })
    .then(res => {
      if (!res.ok) throw new Error('Delete failed');
      loadAdminData();
      if (tabName === 'products') fetchProducts();
    })
    .catch(err => {
      console.error(err);
      alert('Failed to delete record.');
    });
  }
}

function clearDbTable(key, tabName) {
  let tableParam = '';
  if (key === 'void_orders') tableParam = 'orders';
  else if (key === 'void_waitlist') tableParam = 'waitlist';
  else if (key === 'void_contact') tableParam = 'contacts';
  else if (key === 'void_users') tableParam = 'users';
  else if (key === 'void_tickets') tableParam = 'tickets';
  else if (key === 'void_emails') tableParam = 'sent_emails';
  else tableParam = tabName;

  if (confirm(`Are you sure you want to purge all records from ${tableParam}?`)) {
    voidFetch(`${API_BASE}/api/clear`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ table: tableParam })
    })
    .then(res => {
      if (!res.ok) throw new Error('Clear table failed');
      loadAdminData();
      if (tableParam === 'products') fetchProducts();
    })
    .catch(err => {
      console.error(err);
      alert('Failed to clear table.');
    });
  }
}

function logoutAdmin() {
  sessionStorage.removeItem('void_user');
  sessionStorage.removeItem('void_admin_authorized');
  window.history.pushState({}, '', '/');
  showPage('home');
}

function toggleMobileMenu() {
  const overlay = document.getElementById('mobile-nav-overlay');
  const drawer = document.getElementById('mobile-nav-drawer');
  if (overlay) overlay.classList.toggle('open');
  if (drawer) drawer.classList.toggle('open');
}

// ═══════════════════════════
// INITIAL LOAD RUNS
// ═══════════════════════════
setupDragAndDrop();
trackVisitor();
fetchProducts().then(() => {
  updateCartUI();
  updateAuthUI();
  handleRouting();
});

window.addEventListener('popstate', handleRouting);

function handleRouting() {
  const path = window.location.pathname;

  if (path === '/admin-login') {
    window.history.replaceState({}, '', '/login');
    showPage('login');
  } else if (path === '/admin-dashboard') {
    if (sessionStorage.getItem('void_admin_authorized') === 'true') {
      showPage('admin');
      loadAdminData();
    } else {
      window.history.replaceState({}, '', '/login');
      showPage('login');
    }
  } else if (path === '/login') {
    showPage('login');
  } else if (path === '/signup') {
    showPage('signup');
  } else {
    if (path === '/' || path === '/index.html') {
      showPage('home');
    }
  }
}
