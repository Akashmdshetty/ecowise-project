// frontend/auth.js
// Lightweight auth helper for the dashboard
// - Reads token from localStorage (key: ecowise_token)
// - Calls /api/me on server at http://localhost:4000/api
// - Exposes a small window.ECOWISE object and toggles UI elements (sign in/register vs logout)

(function () {
  const API_BASE = "http://localhost:4000/api";
  const TOKEN_KEY = 'ecowise_token';
  const USERNAME_KEY = 'ecowise_username';

  // Expose a small state object for other scripts
  window.ECOWISE = window.ECOWISE || { apiBase: API_BASE, token: null, username: null };

  function getToken(){ return localStorage.getItem(TOKEN_KEY); }
  function setToken(t){ if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); window.ECOWISE.token = t; }
  function setUsername(u){ if (u) localStorage.setItem(USERNAME_KEY, u); else localStorage.removeItem(USERNAME_KEY); window.ECOWISE.username = u; }

  async function fetchMe(token){
    if (!token) return null;
    try {
      const res = await fetch(API_BASE + '/me', { headers: { 'Authorization': 'Bearer ' + token }});
      if (!res.ok) return null;
      const data = await res.json();
      return data.user || null;
    } catch(e) {
      console.error('auth.js fetchMe error', e);
      return null;
    }
  }

  async function init(){
    const token = getToken();
    window.ECOWISE.token = token;
    window.ECOWISE.username = localStorage.getItem(USERNAME_KEY) || null;

    // DOM controls
    const welcomeLine = document.getElementById('welcomeLine');
    const signInLink = document.getElementById('signInLink');
    const registerLink = document.getElementById('registerLink');
    const authLinks = document.getElementById('authLinks');
    const logoutBtn = document.getElementById('logoutBtn');

    function showGuest(){
      if (welcomeLine) welcomeLine.textContent = 'Signed in as Guest — analyze to create an account';
      if (authLinks) authLinks.style.display = '';
      if (logoutBtn) logoutBtn.style.display = 'none';
      window.ECOWISE.username = null;
      setUsername(null);
    }

    function showUser(u){
      if (welcomeLine) welcomeLine.textContent = 'Welcome back, ' + u;
      if (authLinks) authLinks.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = '';
      window.ECOWISE.username = u;
      setUsername(u);
    }

    // setup logout
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        setToken(null);
        setUsername(null);
        // reload to let other scripts update UI and redirect
        window.location.href = 'login.html';
      });
    }

    if (!token) { showGuest(); return; }

    const user = await fetchMe(token);
    if (!user) { 
      // bad token
      setToken(null);
      showGuest();
      return;
    }

    // success
    showUser(user.username);
  }

  // run
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
