// frontend/home.js — cleaned, efficient, and robust home page script
// - Uses IntersectionObserver for counters
// - Uses requestAnimationFrame for parallax (throttled)
// - Uses limited particle count and reuses DOM nodes
// - Graceful fallbacks if APIs not available
// - No global leaks (all inside IIFE)

(() => {
  'use strict';
  const API_BASE = window.API_BASE || 'http://localhost:5000';
  console.log('🚀 EcoWise Home script initialized');

  /* ---------- Utilities ---------- */
  const raf = window.requestAnimationFrame.bind(window);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isVisible = el => !!(el && el.offsetParent !== null);

  /* ---------- Counters (IntersectionObserver) ---------- */
  function animateCounter(el, target, duration = 900, suffix = '') {
    let start = null;
    const startVal = 0;
    const endVal = Number(target) || 0;
    if (isNaN(endVal)) { el.textContent = String(target); return; }

    function step(ts) {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const cur = Math.floor(progress * (endVal - startVal) + startVal);
      el.textContent = cur + suffix;
      if (progress < 1) raf(step);
    }
    raf(step);
  }

  function initCounters() {
    const counters = document.querySelectorAll('.stat-item[data-count]');
    if (!counters.length) return;

    // use IntersectionObserver to start when visible
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver((entries, o) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const countAttr = el.getAttribute('data-count');
          const suffix = (typeof countAttr === 'string' && countAttr.includes('T')) ? 'T' : '';
          const numeric = (suffix === 'T') ? parseFloat(countAttr) : parseInt(countAttr);
          animateCounter(el, numeric, 900, suffix);
          o.unobserve(el);
        });
      }, { threshold: 0.4 });
      counters.forEach(c => obs.observe(c));
    } else {
      // fallback: animate immediately
      counters.forEach((c) => {
        const attr = c.getAttribute('data-count');
        const suffix = (attr && attr.includes('T')) ? 'T' : '';
        const numeric = suffix === 'T' ? attr : parseInt(attr || 0);
        animateCounter(c, numeric, 900, suffix);
      });
    }
  }

  /* ---------- Parallax (mouse move -> requestAnimationFrame throttled) ---------- */
  function initParallax() {
    const cards = Array.from(document.querySelectorAll('.card[data-speed]'));
    if (!cards.length) return;

    let mouseX = 0.5, mouseY = 0.5;
    let scheduled = false;

    function onMove(e) {
      mouseX = e.clientX / window.innerWidth;
      mouseY = e.clientY / window.innerHeight;
      if (!scheduled) {
        scheduled = true;
        raf(() => {
          scheduled = false;
          cards.forEach(card => {
            const speed = parseFloat(card.dataset.speed) || 0.03;
            const x = (mouseX - 0.5) * speed * 100;
            const y = (mouseY - 0.5) * speed * 100;
            card.style.transform = `translate(${x}px, ${y}px)`;
          });
        });
      }
    }

    // Use passive listener for performance
    window.addEventListener('mousemove', onMove, { passive: true });
    // Also update on resize (reset transforms)
    window.addEventListener('resize', () => {
      cards.forEach(c => c.style.transform = '');
    }, { passive: true });
  }

  /* ---------- Smooth Scroll helper ---------- */
  function bindSmoothScroll() {
    window.scrollToFeatures = (id = 'features') => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  }

  /* ---------- Demo Modal & Demo Animation ---------- */
  function openDemoModal() {
    const modal = document.getElementById('demoModal');
    if (!modal) return;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    createDemoAnimation();
  }

  function closeDemoModal() {
    const modal = document.getElementById('demoModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    // clear demo content
    const demoVisual = modal.querySelector('.demo-animation');
    if (demoVisual) demoVisual.innerHTML = '';
  }

  function createDemoAnimation() {
    const demoVisual = document.querySelector('.demo-animation');
    if (!demoVisual) return;
    demoVisual.innerHTML = ''; // reset
    const flow = document.createElement('div');
    flow.className = 'demo-flow';
    const steps = [
      { icon: '📸', text: 'Capture Item' },
      { icon: '🤖', text: 'AI Analysis' },
      { icon: '🎯', text: 'Get Recommendations' }
    ];
    steps.forEach((s, i) => {
      const step = document.createElement('div');
      step.className = 'demo-step';
      step.innerHTML = `<div class="demo-icon" aria-hidden="true">${s.icon}</div><p>${s.text}</p>`;
      flow.appendChild(step);
      if (i < steps.length - 1) {
        const arrow = document.createElement('div');
        arrow.className = 'demo-arrow';
        arrow.textContent = '→';
        flow.appendChild(arrow);
      }
    });
    demoVisual.appendChild(flow);
  }

  /* ---------- Typing effect (non-destructive) ---------- */
  function initTypingEffect(selector = '.hero-title', speed = 30) {
    const el = document.querySelector(selector);
    if (!el) return;
    // Preserve markup fragments by working with plain text copy
    const fullText = el.textContent.trim();
    el.textContent = '';
    let idx = 0;
    function type() {
      idx++;
      el.textContent = fullText.slice(0, idx);
      if (idx < fullText.length) setTimeout(type, speed);
    }
    // start after short delay (non-blocking)
    setTimeout(type, 450);
  }

  /* ---------- Particles (lightweight) ---------- */
  function createParticles(max = 8) {
    const container = document.querySelector('.floating-shapes');
    if (!container) return;
    // remove old shapes but keep structural shapes if present
    // create a lightweight set of particles (nodes reused)
    // clear only runtime-inserted particles (class .runtime-particle)
    container.querySelectorAll('.runtime-particle').forEach(n => n.remove());
    // keep a small number to avoid perf hits
    const count = Math.min(max, 8);
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'shape runtime-particle';
      const size = Math.round(Math.random() * 90 + 40);
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.left = `${Math.random() * 100}%`;
      p.style.top = `${Math.random() * 100}%`;
      p.style.opacity = (Math.random() * 0.06 + 0.04).toString();
      p.style.animationDelay = `${Math.random() * 5}s`;
      p.style.background = `linear-gradient(45deg, hsl(${Math.random() * 360},70%,55%), hsl(${Math.random() * 360},70%,55%))`;
      container.appendChild(p);
    }
  }

  /* ---------- Interactive Background (low-cost) ---------- */
  function initInteractiveBackground() {
    // only set CSS variables at low frequency to avoid layout thrash
    let scheduled = false;
    function onMove(e) {
      if (scheduled) return;
      scheduled = true;
      raf(() => {
        scheduled = false;
        const x = (e.clientX / window.innerWidth).toFixed(3);
        const y = (e.clientY / window.innerHeight).toFixed(3);
        document.documentElement.style.setProperty('--mouse-x', x);
        document.documentElement.style.setProperty('--mouse-y', y);
      });
    }
    window.addEventListener('mousemove', onMove, { passive: true });
  }

  /* ---------- Page Animations (entrance) ---------- */
  function initPageAnimations() {
    // subtle staggered reveal for feature cards and steps
    const features = document.querySelectorAll('.feature-card');
    features.forEach((el, i) => {
      el.style.transition = 'transform 0.6s cubic-bezier(.2,.9,.2,1), opacity 0.6s';
      el.style.transform = 'translateY(12px)';
      el.style.opacity = '0';
      setTimeout(() => { el.style.transform = ''; el.style.opacity = '1'; }, 200 + i * 130);
    });

    const steps = document.querySelectorAll('.step');
    steps.forEach((el, i) => {
      el.style.transition = 'transform 0.6s ease, opacity 0.6s ease';
      el.style.transform = 'translateY(16px)';
      el.style.opacity = '0';
      setTimeout(() => { el.style.transform = ''; el.style.opacity = '1'; }, 400 + i * 140);
    });

    // ensure hero-stats visible
    const stats = document.querySelector('.hero-stats');
    if (stats) {
      stats.style.transition = 'opacity 0.6s, transform 0.6s';
      stats.style.opacity = '0';
      stats.style.transform = 'translateY(18px)';
      setTimeout(() => { stats.style.opacity = '1'; stats.style.transform = 'translateY(0)'; }, 850);
    }
  }

  /* ---------- Fallbacks / Emergency fixes ---------- */
  function emergencyCounterFix() {
    const counters = document.querySelectorAll('.stat-item');
    const defaultValues = [1247, 568, '2.5T'];
    counters.forEach((c, i) => {
      if (!c.textContent || c.textContent.trim() === '0') {
        c.textContent = defaultValues[i] || '';
        console.log(`✅ emergencyCounterFix applied to index ${i}`);
      }
    });
  }

  /* ---------- Debug helpers (exposed under window.debugHome) ---------- */
  function debugCounters() {
    const counters = Array.from(document.querySelectorAll('.stat-item'));
    console.log(`🔍 Found ${counters.length} stat items`);
    counters.forEach((c, i) => {
      console.log(i, { text: c.textContent, dataCount: c.dataset.count, visible: isVisible(c) });
    });
  }

  /* ---------- Bootstrapping ---------- */
  function boot() {
    // init features
    initCounters();
    initParallax();
    bindSmoothScroll();
    initTypingEffect('.hero-title', 30);
    createParticles(6);
    initInteractiveBackground();
    initPageAnimations();

    // attach demo modal controls
    const demoBtn = document.getElementById('liveDemoBtn');
    if (demoBtn) demoBtn.addEventListener('click', openDemoModal);
    const demoModal = document.getElementById('demoModal');
    if (demoModal) {
      demoModal.addEventListener('click', (e) => {
        if (e.target === demoModal) closeDemoModal();
      });
      const closeBtns = demoModal.querySelectorAll('.close-modal');
      closeBtns.forEach(b => b.addEventListener('click', closeDemoModal));
    }

    // Tagline options: delegate click to parent for light DOM ops
    const taglineSelector = document.querySelector('.tagline-selector');
    if (taglineSelector) {
      taglineSelector.addEventListener('click', (e) => {
        const opt = e.target.closest('.tagline-option');
        if (opt && opt.dataset.index) {
          const idx = Number(opt.dataset.index);
          // find tagline pieces from DOM text (keeps markup safe)
          const optText = opt.textContent.trim().split(/\s+/);
          // use existing handler on page if present
          if (window.changeTagline) window.changeTagline(idx);
          // update active classes
          taglineSelector.querySelectorAll('.tagline-option').forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
        } else if (e.target.matches('.tagline-toggle')) {
          const opts = document.getElementById('taglineOptions');
          opts.classList.toggle('active');
        }
      });
      // close when clicking outside
      document.addEventListener('click', (ev) => {
        if (!taglineSelector.contains(ev.target)) document.getElementById('taglineOptions')?.classList.remove('active');
      });
    }

    // emergency fixes after load (non-blocking)
    setTimeout(emergencyCounterFix, 3000);
    setTimeout(debugCounters, 1200);
    console.log('🎉 Home boot completed');
  }

  // Boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // expose debug helpers intentionally
  window.debugHome = { debugCounters, emergencyCounterFix, openDemoModal, closeDemoModal };
})();
