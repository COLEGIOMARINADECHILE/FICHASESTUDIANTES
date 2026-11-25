'use strict';
// =====================================================================
// APLICACIÓN INSTALABLE (iPhone y Android)
// Android/Chrome/Edge: botón "Instalar aplicación" (aviso nativo del navegador).
// iPhone/iPad (Safari): instrucciones "Compartir → Agregar a pantalla de inicio".
// =====================================================================
Object.assign(app, {
  esStandalone() { return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true; },
  esIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); },
  puedeInstalar() { return !this.esStandalone() && (!!this._installPrompt || this.esIOS()); },
  installBtnHtml(clase = 'side-btn') { return this.puedeInstalar() ? `<button type="button" class="${clase} install-btn" onclick="app.instalarApp()">${ico('smartphone')}Instalar aplicación</button>` : ''; },
  async instalarApp() {
    if (this._installPrompt) {
      this._installPrompt.prompt();
      const r = await this._installPrompt.userChoice.catch(() => null);
      this._installPrompt = null;
      if (r?.outcome === 'accepted') toast('Aplicación instalada: la encontrará en la pantalla de inicio');
      this.renderInstallBtns();
      return;
    }
    // iPhone y iPad: Safari no muestra un aviso, se agrega desde el menú Compartir
    const enSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
    ui.modal({ title: 'Instalar en iPhone o iPad', icon: 'smartphone', size: 'sm', hideOk: true, cancelText: 'Entendido',
      body: `<div class="stack">
        ${enSafari ? '' : `<p class="note">${ico('info')}En iPhone la instalación se hace desde <strong>Safari</strong>. Abra esta página en Safari y siga los pasos.</p>`}
        <ol class="install-steps">
          <li>Toque el botón <strong>Compartir</strong> ${ico('share')} (abajo en iPhone, arriba en iPad).</li>
          <li>Elija <strong>Agregar a pantalla de inicio</strong> ${ico('square-plus')}.</li>
          <li>Confirme con <strong>Agregar</strong>. Aparecerá el ícono del colegio con el nombre <strong>Trayectoria</strong>.</li>
        </ol>
        <p class="muted small">La aplicación se abre a pantalla completa y usa la misma cuenta: los datos siguen protegidos en el servidor del colegio.</p>
      </div>` });
  },
  renderInstallBtns() {
    // Menú lateral
    const acciones = document.querySelector('.who__actions');
    acciones?.querySelector('.install-btn')?.remove();
    if (acciones && this.puedeInstalar()) acciones.insertAdjacentHTML('beforeend', this.installBtnHtml('side-btn'));
    // Pantalla de ingreso
    const form = el('login-form');
    document.querySelector('.login-install')?.remove();
    if (form && this.puedeInstalar()) form.insertAdjacentHTML('afterend', `<div class="login-install">${this.installBtnHtml('btn')}</div>`);
    icons();
  }
});

(() => {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); app._installPrompt = e; app.renderInstallBtns(); });
  window.addEventListener('appinstalled', () => { app._installPrompt = null; app.renderInstallBtns(); });
  const render = app.render;
  app.render = function () { const r = render.apply(this, arguments); this.renderInstallBtns(); return r; };
  if (app.esStandalone()) document.documentElement.classList.add('is-app');
})();
