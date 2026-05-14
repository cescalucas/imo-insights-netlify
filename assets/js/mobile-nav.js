/**
 * IMO · Mobile navigation toggle
 * -------------------------------
 * Injeta um botão hamburger no header e transforma o <nav class="links">
 * num drawer lateral em viewports <=1080px.
 *
 * Funciona sem alterar o HTML existente: detecta .nav-inner e injeta o botão.
 */
(function () {
  'use strict';

  function init() {
    var navInner = document.querySelector('header.nav .nav-inner');
    if (!navInner) return;

    var linksNav = navInner.querySelector('nav.links');
    if (!linksNav) return;

    // Evita injeção dupla
    if (navInner.querySelector('.nav-toggle')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-toggle';
    btn.setAttribute('aria-label', 'Abrir menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span></span><span></span><span></span>';

    // Insere ao final do nav-inner para ficar à direita
    navInner.appendChild(btn);

    function setOpen(open) {
      document.body.classList.toggle('nav-open', open);
      btn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    btn.addEventListener('click', function () {
      setOpen(!document.body.classList.contains('nav-open'));
    });

    // Fecha ao clicar em link
    Array.prototype.forEach.call(linksNav.querySelectorAll('a'), function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });

    // Fecha ao clicar no overlay (que é gerado via ::before do body)
    document.addEventListener('click', function (e) {
      if (!document.body.classList.contains('nav-open')) return;
      if (e.target === btn || btn.contains(e.target)) return;
      if (linksNav.contains(e.target)) return;
      if (navInner.contains(e.target)) return;
      // Clique fora do nav: fecha
      setOpen(false);
    });

    // Esc fecha
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });

    // Restaura ao redimensionar para desktop
    var mq = window.matchMedia('(min-width: 1081px)');
    function onResize(e) { if (e.matches) setOpen(false); }
    if (mq.addEventListener) mq.addEventListener('change', onResize);
    else if (mq.addListener) mq.addListener(onResize);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
