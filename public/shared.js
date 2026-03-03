// ── WWWIII Shared JavaScript ──
// Supabase client, auth state, nav/footer rendering

const SUPABASE_URL = 'SUPABASE_URL_PLACEHOLDER';
const SUPABASE_ANON_KEY = 'SUPABASE_ANON_KEY_PLACEHOLDER';

let _supabase = null;
let _currentUser = null;
let _currentProfile = null;

function getSupabase() {
  if (!_supabase && window.supabase && SUPABASE_URL !== 'SUPABASE_URL_PLACEHOLDER') {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
}

// ── Auth ──
async function getUser() {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data: { user } } = await sb.auth.getUser();
    _currentUser = user;
    return user;
  } catch { return null; }
}

async function getProfile() {
  if (!_currentUser) return null;
  try {
    const { data: { session } } = await getSupabase().auth.getSession();
    if (!session) return null;
    const res = await fetch('/api/auth/profile', {
      headers: { 'Authorization': 'Bearer ' + session.access_token }
    });
    if (res.ok) {
      _currentProfile = await res.json();
      return _currentProfile;
    }
  } catch {}
  return null;
}

async function getAuthToken() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token || null;
}

async function authFetch(url, opts = {}) {
  const token = await getAuthToken();
  if (token) {
    opts.headers = { ...opts.headers, 'Authorization': 'Bearer ' + token };
  }
  return fetch(url, opts);
}

async function signOut() {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
  _currentUser = null;
  _currentProfile = null;
  window.location.href = '/';
}

// ── Wallet ──
const TOKEN_ADDRESS = '0x5201ee6ffb64aeA97Cf887bd6852ca572A15f33a';
const PRESALE_ADDRESS = '0xCD26a62fc178129F4b24759c329e0c1867d4e613';
const SEPOLIA_CHAIN_ID = '0xaa36a7';
let userAccount = null;

async function connectWallet() {
  const btn = document.getElementById('walletBtn');
  if (!window.ethereum) {
    alert('MetaMask not detected. Please install MetaMask to connect your wallet.');
    window.open('https://metamask.io/download/', '_blank');
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    userAccount = accounts[0];
    if (btn) {
      btn.textContent = userAccount.slice(0, 6) + '...' + userAccount.slice(-4);
      btn.classList.add('connected');
    }
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
    } catch (switchErr) {
      if (switchErr.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: SEPOLIA_CHAIN_ID,
            chainName: 'Sepolia Testnet',
            rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            blockExplorerUrls: ['https://sepolia.etherscan.io'],
          }],
        });
      }
    }
  } catch (err) {
    console.error('Wallet connection failed:', err);
  }
}

function initWalletListeners() {
  if (!window.ethereum) return;
  window.ethereum.request({ method: 'eth_accounts' }).then(accounts => {
    if (accounts.length > 0) {
      userAccount = accounts[0];
      const btn = document.getElementById('walletBtn');
      if (btn) {
        btn.textContent = userAccount.slice(0, 6) + '...' + userAccount.slice(-4);
        btn.classList.add('connected');
      }
    }
  });
  window.ethereum.on('accountsChanged', accounts => {
    const btn = document.getElementById('walletBtn');
    if (accounts.length === 0) {
      userAccount = null;
      if (btn) { btn.textContent = 'Connect Wallet'; btn.classList.remove('connected'); }
    } else {
      userAccount = accounts[0];
      if (btn) {
        btn.textContent = userAccount.slice(0, 6) + '...' + userAccount.slice(-4);
        btn.classList.add('connected');
      }
    }
  });
}

// ── Nav ──
function renderNav() {
  const currentPath = window.location.pathname;
  function isActive(path) {
    if (path === '/') return currentPath === '/' || currentPath === '/index.html';
    return currentPath.startsWith(path);
  }

  const links = [
    { href: '/', label: 'Home' },
    { href: '/blog.html', label: 'Blog' },
    { href: '/community.html', label: 'Community' },
    { href: '/store.html', label: 'Store' },
    { href: '/model.html', label: 'Model' },
    { href: '/art.html', label: 'Art' },
    { href: '/nfts.html', label: 'NFTs' },
    { href: '/whitepaper.html', label: 'Whitepaper' },
  ];

  const navEl = document.getElementById('mainNav');
  if (!navEl) return;

  const linksHtml = links.map(l =>
    `<a href="${l.href}" class="${isActive(l.href) ? 'active' : ''}">${l.label}</a>`
  ).join('');

  let rightHtml;
  if (_currentProfile) {
    const avatar = _currentProfile.avatar_url
      ? `<img src="${_currentProfile.avatar_url}" class="nav-avatar" onclick="window.location='/dashboard.html'">`
      : `<button class="join-btn" onclick="window.location='/dashboard.html'">${_currentProfile.display_name?.slice(0,8) || 'Account'}</button>`;
    rightHtml = `
      <button class="wallet-btn" id="walletBtn" onclick="connectWallet()">Connect Wallet</button>
      ${avatar}
    `;
  } else if (_currentUser) {
    rightHtml = `
      <button class="wallet-btn" id="walletBtn" onclick="connectWallet()">Connect Wallet</button>
      <button class="join-btn" onclick="window.location='/dashboard.html'">Account</button>
    `;
  } else {
    rightHtml = `
      <button class="wallet-btn" id="walletBtn" onclick="connectWallet()">Connect Wallet</button>
      <a href="/join.html" class="join-btn">Join</a>
    `;
  }

  navEl.innerHTML = `
    <div class="wrap">
      <a href="/" class="nav-logo"><span>W</span>WW<span>III</span></a>
      <div class="nav-links">${linksHtml}</div>
      <div class="nav-right">${rightHtml}</div>
    </div>
  `;
}

// ── Footer ──
function renderFooter() {
  const footerEl = document.getElementById('mainFooter');
  if (!footerEl) return;
  footerEl.innerHTML = `
    <div class="wrap">
      <div class="f-logo"><span>W</span>WW<span>III</span></div>
      <p>The only* publicly developed and created artificial intelligence.</p>
      <div class="f-links">
        <a href="/">Home</a>
        <a href="/blog.html">Blog</a>
        <a href="/community.html">Community</a>
        <a href="/store.html">Store</a>
        <a href="/model.html">Model</a>
        <a href="/art.html">Art</a>
        <a href="/nfts.html">NFTs</a>
        <a href="/whitepaper.html">Whitepaper</a>
      </div>
    </div>
  `;
}

// ── Toast ──
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ── Time formatting ──
function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  await getUser();
  if (_currentUser) await getProfile();
  renderNav();
  renderFooter();
  initWalletListeners();
});
