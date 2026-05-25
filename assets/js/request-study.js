/**
 * IMO · Modal de solicitação de estudo
 * -------------------------------------
 * Triggers: elements with [data-request-study]
 *   - data-study-id: identificador do estudo (vai no payload Netlify)
 *   - data-study-title: título legível (exibido no modal)
 *   - data-study-file: caminho do PDF a baixar após submit
 *
 * O envio usa o endpoint padrão do Netlify Forms via POST (urlencoded).
 * O form de detecção (hidden, data-netlify) DEVE existir no HTML para o
 * Netlify reconhecer o formulário durante o build.
 */
(function () {
  'use strict';

  var MODAL_ID = 'rs-modal';

  // Os estudos vêm do banco (gerenciados em /area-cliente-admin → aba Estudos).
  // Endpoint público que devolve { studies: [{ slug, title, subtitle, file_url }] }.
  var MATERIALS_URL = '/api/list-materials';
  var _materials = null;        // cache em memória
  var _materialsPromise = null; // evita fetch duplicado

  function loadMaterials() {
    if (_materials) return Promise.resolve(_materials);
    if (_materialsPromise) return _materialsPromise;
    _materialsPromise = fetch(MATERIALS_URL, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { studies: [] }; })
      .then(function (j) { _materials = (j && j.studies) || []; return _materials; })
      .catch(function () { _materials = []; return _materials; });
    return _materialsPromise;
  }

  function toOption(m) {
    return {
      id:    m.slug,
      title: m.title,
      label: m.title + (m.subtitle ? ' (' + m.subtitle + ')' : ''),
      file:  m.file_url
    };
  }

  function ensureModal() {
    if (document.getElementById(MODAL_ID)) return;

    var wrap = document.createElement('div');
    wrap.id = MODAL_ID;
    wrap.className = 'rs-modal';
    wrap.setAttribute('hidden', '');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'rs-modal-title');

    wrap.innerHTML = ''
      + '<div class="rs-overlay" data-rs-close></div>'
      + '<div class="rs-card">'
      +   '<button type="button" class="rs-close" data-rs-close aria-label="Fechar">×</button>'
      +   '<div class="rs-tag">Solicitar estudo</div>'
      +   '<h3 id="rs-modal-title">Receba o estudo no seu e-mail.</h3>'
      +   '<p class="rs-sub">Preencha os dados abaixo. O material é liberado imediatamente para download.</p>'
      +   '<form id="rs-form" name="request-study" method="POST" data-netlify="true" netlify-honeypot="rs-bot-field" novalidate>'
      +     '<input type="hidden" name="form-name" value="request-study">'
      +     '<input type="hidden" name="study-id" id="rs-study-id">'
      +     '<input type="hidden" name="study-title" id="rs-study-title-input">'
      +     '<div id="rs-picker-wrap" hidden>'
      +       '<label class="rs-field">'
      +         '<span class="rs-picker-label" id="rs-picker-label">Qual estudo você quer baixar?</span>'
      +         '<select id="rs-picker" required></select>'
      +       '</label>'
      +     '</div>'
      +     '<p class="rs-honey" style="display:none"><label>Não preencha: <input name="rs-bot-field"></label></p>'
      +     '<label class="rs-field">Nome'
      +       '<input name="nome" type="text" required autocomplete="name">'
      +     '</label>'
      +     '<label class="rs-field">E-mail corporativo'
      +       '<input name="email" type="email" required autocomplete="email">'
      +     '</label>'
      +     '<label class="rs-field">Empresa'
      +       '<input name="empresa" type="text" autocomplete="organization">'
      +     '</label>'
      +     '<button type="submit" class="btn primary rs-submit">Baixar estudo <span class="arr">→</span></button>'
      +     '<p class="rs-feedback" aria-live="polite"></p>'
      +     '<p class="rs-fineprint">Ao enviar, você concorda em receber comunicações da IMO sobre este estudo. Cancele a qualquer momento.</p>'
      +   '</form>'
      + '</div>';

    document.body.appendChild(wrap);
  }

  function applySelection(modal, opt) {
    if (!opt) return;
    modal.dataset.studyFile = opt.file || '';
    modal.querySelector('#rs-study-id').value = opt.id || '';
    modal.querySelector('#rs-study-title-input').value = opt.title || '';
    if (opt.title) {
      modal.querySelector('#rs-modal-title').textContent = 'Receba o estudo "' + opt.title + '".';
    }
  }

  function openModal(trigger) {
    ensureModal();
    var modal = document.getElementById(MODAL_ID);
    var pickerWrap = modal.querySelector('#rs-picker-wrap');
    var pickerSelect = modal.querySelector('#rs-picker');
    var pickerLabel = modal.querySelector('#rs-picker-label');
    var title = modal.querySelector('#rs-modal-title');
    var fb = modal.querySelector('.rs-feedback');
    var btn = modal.querySelector('.rs-submit');

    var isPicker = !!trigger.dataset.studyPicker;
    var slug = trigger.dataset.studyId || '';

    // Estado inicial limpo
    var form = modal.querySelector('#rs-form');
    form.reset();
    fb.textContent = ''; fb.className = 'rs-feedback';
    btn.innerHTML = 'Baixar estudo <span class="arr">→</span>';
    pickerSelect.onchange = null;
    title.textContent = 'Receba o estudo no seu e-mail.';

    if (isPicker) {
      // Modo seletor (hub EVB): opções vêm do banco.
      pickerLabel.textContent = 'Qual estudo você quer baixar?';
      pickerWrap.removeAttribute('hidden');
      pickerSelect.innerHTML = '<option>Carregando…</option>';
      pickerSelect.disabled = true;
      btn.disabled = true;

      loadMaterials().then(function (list) {
        var opts = (list || []).map(toOption);
        if (!opts.length) {
          pickerSelect.innerHTML = '<option>Nenhum estudo disponível</option>';
          fb.textContent = 'Não foi possível carregar os estudos agora. Tente novamente em instantes.';
          fb.className = 'rs-feedback rs-feedback-warn';
          return;
        }
        pickerSelect.innerHTML = '';
        opts.forEach(function (opt, idx) {
          var el = document.createElement('option');
          el.value = String(idx);
          el.textContent = opt.label;
          pickerSelect.appendChild(el);
        });
        pickerSelect.disabled = false;
        pickerSelect.value = '0';
        btn.disabled = false;
        applySelection(modal, opts[0]);
        pickerSelect.onchange = function () {
          applySelection(modal, opts[parseInt(pickerSelect.value, 10) || 0]);
        };
      });
    } else {
      // Modo direto (página de um estudo). Usa os data-attrs como fallback e
      // refina pelo banco (por slug = data-study-id), para refletir o arquivo atual.
      pickerWrap.setAttribute('hidden', '');
      btn.disabled = false;
      applySelection(modal, {
        id:    slug,
        title: trigger.dataset.studyTitle || '',
        file:  trigger.dataset.studyFile || ''
      });
      if (slug) {
        loadMaterials().then(function (list) {
          var m = (list || []).filter(function (x) { return x.slug === slug; })[0];
          if (m && m.file_url) applySelection(modal, toOption(m));
        });
      }
    }

    modal.removeAttribute('hidden');
    document.documentElement.style.overflow = 'hidden';
    setTimeout(function () {
      var f = isPicker ? modal.querySelector('#rs-picker') : modal.querySelector('input[name="nome"]');
      if (f) f.focus();
    }, 80);
  }

  function closeModal() {
    var modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.setAttribute('hidden', '');
    document.documentElement.style.overflow = '';
  }

  function triggerDownload(file) {
    if (!file) return;
    var a = document.createElement('a');
    a.href = file;
    a.setAttribute('download', file.split('/').pop());
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function encodeForm(formData) {
    var params = new URLSearchParams();
    formData.forEach(function (value, key) {
      params.append(key, value);
    });
    return params.toString();
  }

  // ---------------- Event delegation ----------------

  document.addEventListener('click', function (e) {
    // Trigger
    var trigger = e.target.closest('[data-request-study]');
    if (trigger) {
      e.preventDefault();
      openModal(trigger);
      return;
    }
    // Close
    if (e.target.closest('[data-rs-close]')) {
      closeModal();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  document.addEventListener('submit', function (e) {
    if (!e.target || e.target.id !== 'rs-form') return;
    e.preventDefault();

    var form = e.target;
    var modal = document.getElementById(MODAL_ID);
    var file = modal.dataset.studyFile || '';
    var btn = form.querySelector('.rs-submit');
    var feedback = form.querySelector('.rs-feedback');

    btn.disabled = true;
    btn.textContent = 'Enviando...';
    feedback.textContent = '';
    feedback.className = 'rs-feedback';

    var formData = new FormData(form);

    // Registra o lead no banco (fire-and-forget; não bloqueia o download).
    try {
      fetch('/api/register-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodeForm(formData) + '&source=download'
      }).catch(function () {});
    } catch (_) {}

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encodeForm(formData)
    })
      .then(function (resp) {
        if (!resp.ok) throw new Error('netlify_status_' + resp.status);
        triggerDownload(file);
        feedback.textContent = 'Pronto. O estudo está sendo baixado. Verifique sua pasta de Downloads.';
        feedback.className = 'rs-feedback rs-feedback-success';
        btn.textContent = '✓ Download iniciado';
        setTimeout(closeModal, 2400);
      })
      .catch(function (err) {
        console.error('[IMO request-study] erro:', err);
        // Fallback: dispara download direto e exibe link
        triggerDownload(file);
        feedback.textContent = 'Tivemos uma instabilidade no envio dos dados, mas o download foi liberado mesmo assim.';
        feedback.className = 'rs-feedback rs-feedback-warn';
        btn.disabled = false;
        btn.innerHTML = 'Baixar estudo <span class="arr">→</span>';
      });
  });
})();
