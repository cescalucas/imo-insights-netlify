/**
 * IMO Insights — toggle "mostrar/ocultar senha"
 * --------------------------------------------------
 * Anexa um botão de olho em todo <input type="password"> da página.
 * Basta incluir <script src="/assets/js/password-toggle.js" defer></script>
 * em qualquer página com campo de senha.
 */
(function () {
  'use strict';

  function eyeSvg(showing) {
    // showing = true → senha visível, mostra ícone de "ocultar" (olho cortado).
    return showing
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M17.94 17.94A10 10 0 0 1 12 20c-7 0-10-8-10-8a17 17 0 0 1 4.06-5.94"/>' +
          '<path d="M9.88 4.24A10 10 0 0 1 12 4c7 0 10 8 10 8a17 17 0 0 1-3.42 4.66"/>' +
          '<path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/>' +
          '<line x1="1" y1="1" x2="23" y2="23"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
          '<circle cx="12" cy="12" r="3"/></svg>';
  }

  function attach(input) {
    var parent = input.parentElement;
    if (!parent) return;

    var cs = window.getComputedStyle(parent);
    if (cs.position === 'static') parent.style.position = 'relative';

    // Reserva espaço pra não sobrepor o texto da senha.
    input.style.paddingRight = '40px';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.tabIndex = -1; // não atrapalha o tab order do formulário
    btn.setAttribute('aria-label', 'Mostrar senha');
    btn.setAttribute('aria-pressed', 'false');
    btn.style.cssText = 'position:absolute;right:10px;top:50%;transform:translateY(-50%);' +
                       'background:transparent;border:0;cursor:pointer;padding:6px;' +
                       'color:#888;line-height:0;opacity:.75;transition:opacity .15s;';
    btn.innerHTML = eyeSvg(false);
    btn.addEventListener('mouseenter', function () { btn.style.opacity = '1'; });
    btn.addEventListener('mouseleave', function () { btn.style.opacity = '.75'; });

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      var nowVisible = !visible;
      btn.setAttribute('aria-pressed', nowVisible ? 'true' : 'false');
      btn.setAttribute('aria-label', nowVisible ? 'Ocultar senha' : 'Mostrar senha');
      btn.innerHTML = eyeSvg(nowVisible);
      try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
    });

    parent.appendChild(btn);
  }

  function init() {
    var inputs = document.querySelectorAll('input[type="password"]');
    inputs.forEach(function (i) {
      if (i.dataset.pwToggleAttached === '1') return;
      i.dataset.pwToggleAttached = '1';
      attach(i);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
