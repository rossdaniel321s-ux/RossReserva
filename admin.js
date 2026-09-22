/* =========================================================================
   admin.js — Panel de administración del Bufet de Roble
   -------------------------------------------------------------------------
   Este archivo es 100% adicional: no modifica ninguna función ni variable
   de Rm.js, solo las LEE y, cuando el administrador guarda cambios, ACTUALIZA
   las variables `TOTAL_MESAS` y `CAPACIDADES` (las únicas dos que se
   cambiaron de const a let en Rm.js para que esto sea posible) y vuelve a
   llamar a las funciones originales `renderReservas` / `renderMesas` para
   que todo se dibuje de nuevo con la configuración nueva.

   Nada de la lógica de reservas, validaciones, CSV, historial, etc. se
   toca. Todo ese comportamiento sigue siendo exactamente el que ya tenías.
   ========================================================================= */

(function () {
  "use strict";

  /* ---------------- Claves de almacenamiento ---------------- */
  const RM_CONFIG_KEY = "rmAdminConfig";
  const RM_AUTH_KEY = "rmAdminAuth";
  const RM_SESSION_KEY = "rmAdminSesionActiva";

  const RM_USUARIO_POR_DEFECTO = "admin";
  const RM_CLAVE_POR_DEFECTO = "admin123";

  const RM_TOTAL_MESAS_ORIGINAL = TOTAL_MESAS; // valor tal cual venía en Rm.js
  const RM_CAPACIDADES_ORIGINAL = CAPACIDADES.slice();

  // Se capturan ANTES de aplicar cualquier configuración guardada, para poder
  // restaurar el nombre/texto exactamente como venían en tu index.html original.
  const RM_TITLE_ORIGINAL = document.title;
  const RM_H1_ORIGINAL = document.querySelector("header h1")?.textContent.trim() || "";
  const RM_LEAD_ORIGINAL = document.querySelector("header .lead")?.textContent.trim() || "";

  /* ---------------- Utilidades de color (para no tocar Rm.css) ---------------- */

  function rmHexToHsl(hex) {
    let limpio = String(hex || "").replace("#", "");
    if (limpio.length === 3) {
      limpio = limpio
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const r = parseInt(limpio.substring(0, 2), 16) / 255;
    const g = parseInt(limpio.substring(2, 4), 16) / 255;
    const b = parseInt(limpio.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r:
          h = ((g - b) / d) % 6;
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, s * 100, l * 100];
  }

  function rmHslToHex(h, s, l) {
    const sat = s / 100;
    const lig = l / 100;
    const k = (n) => (n + h / 30) % 12;
    const a = sat * Math.min(lig, 1 - lig);
    const f = (n) =>
      lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x) =>
      Math.round(255 * x)
        .toString(16)
        .padStart(2, "0");
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }

  function rmAjustarLuminosidad(hex, delta) {
    try {
      const [h, s, l] = rmHexToHsl(hex);
      const nuevaL = Math.min(95, Math.max(5, l + delta));
      return rmHslToHex(h, s, nuevaL);
    } catch (error) {
      return hex;
    }
  }

  /* ---------------- Hash simple de contraseñas (SubtleCrypto) ---------------- */

  async function rmHashTexto(texto) {
    try {
      const datos = new TextEncoder().encode(texto);
      const buffer = await crypto.subtle.digest("SHA-256", datos);
      return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch (error) {
      // Respaldo muy simple si SubtleCrypto no está disponible (ej. http:// sin TLS)
      let hash = 0;
      for (let i = 0; i < texto.length; i += 1) {
        hash = (hash << 5) - hash + texto.charCodeAt(i);
        hash |= 0;
      }
      return `fallback-${hash}`;
    }
  }

  /* ---------------- Autenticación ---------------- */

  function rmCargarAuth() {
    try {
      const s = localStorage.getItem(RM_AUTH_KEY);
      return s ? JSON.parse(s) : null;
    } catch (error) {
      return null;
    }
  }

  function rmGuardarAuth(auth) {
    try {
      localStorage.setItem(RM_AUTH_KEY, JSON.stringify(auth));
      return true;
    } catch (error) {
      console.error("No se pudo guardar el usuario/contraseña de administración:", error);
      return false;
    }
  }

  async function rmAsegurarAuthInicial() {
    let auth = rmCargarAuth();
    if (!auth) {
      const hash = await rmHashTexto(RM_CLAVE_POR_DEFECTO);
      auth = { usuario: RM_USUARIO_POR_DEFECTO, hash };
      rmGuardarAuth(auth);
    }
    return auth;
  }

  function rmSesionEstaActiva() {
    return sessionStorage.getItem(RM_SESSION_KEY) === "1";
  }

  function rmActivarSesion() {
    sessionStorage.setItem(RM_SESSION_KEY, "1");
  }

  function rmCerrarSesionAdmin() {
    sessionStorage.removeItem(RM_SESSION_KEY);
  }

  /* ---------------- Configuración del sitio ---------------- */

  const RM_CONFIG_DEFECTO = {
    name: null,
    lead: null,
    primaryColor: null,
    accentColor: null,
    logo: null,
    tableImage: null,
    totalMesas: null,
    capacidades: null,
    mesaImages: {},
  };

  function rmCargarConfig() {
    try {
      const s = localStorage.getItem(RM_CONFIG_KEY);
      if (!s) return JSON.parse(JSON.stringify(RM_CONFIG_DEFECTO));
      const parsed = JSON.parse(s);
      return { ...JSON.parse(JSON.stringify(RM_CONFIG_DEFECTO)), ...parsed };
    } catch (error) {
      console.error("No se pudo leer la configuración de administración:", error);
      return JSON.parse(JSON.stringify(RM_CONFIG_DEFECTO));
    }
  }

  function rmGuardarConfig(cfg) {
    try {
      localStorage.setItem(RM_CONFIG_KEY, JSON.stringify(cfg));
      return true;
    } catch (error) {
      console.error("No se pudo guardar la configuración de administración:", error);
      if (typeof showToast === "function") {
        showToast(
          "No se pudo guardar la configuración (almacenamiento lleno o bloqueado).",
          "error",
        );
      }
      return false;
    }
  }

  let rmConfig = rmCargarConfig();

  /* ---------------- Aplicar configuración al sitio existente ---------------- */

  function rmAplicarNombreYTexto(cfg) {
    const h1 = document.querySelector("header h1");
    const lead = document.querySelector("header .lead");
    if (cfg.name) {
      document.title = cfg.name;
      if (h1) h1.textContent = cfg.name;
    }
    if (cfg.lead && lead) {
      lead.textContent = cfg.lead;
    }
  }

  function rmAplicarColores(cfg) {
    if (!cfg.primaryColor && !cfg.accentColor) return;

    const wine = cfg.primaryColor || "#c2521f";
    const gold = cfg.accentColor || "#e08e2d";
    const wineDark = rmAjustarLuminosidad(wine, -12);
    const goldLight = rmAjustarLuminosidad(gold, 18);
    const wineDarkTheme = rmAjustarLuminosidad(wine, 16);
    const goldDarkTheme = rmAjustarLuminosidad(gold, 8);
    const goldLightDarkTheme = rmAjustarLuminosidad(gold, -10);

    let styleEl = document.getElementById("rmAdminColorVars");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "rmAdminColorVars";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      :root {
        --wine: ${wine};
        --wine-dark: ${wineDark};
        --gold: ${gold};
        --gold-light: ${goldLight};
      }
      :root[data-theme="dark"] {
        --wine: ${wineDarkTheme};
        --wine-dark: ${wine};
        --gold: ${goldDarkTheme};
        --gold-light: ${goldLightDarkTheme};
      }
    `;
  }

  function rmAplicarLogo(cfg) {
    const headerTextBlock = document.querySelector("header .header-top > div");
    if (!headerTextBlock) return;

    let logoEl = document.getElementById("rmSiteLogo");

    if (!cfg.logo) {
      if (logoEl) logoEl.remove();
      return;
    }

    if (!logoEl) {
      logoEl = document.createElement("img");
      logoEl.id = "rmSiteLogo";
      headerTextBlock.parentElement.insertBefore(logoEl, headerTextBlock);
    }
    logoEl.src = cfg.logo;
    logoEl.alt = "Logo del restaurante";
  }

  function rmAplicarImagenesMesas() {
    document.querySelectorAll(".tableCard").forEach((card) => {
      const btn = card.querySelector("button[data-table]");
      const img = card.querySelector("img");
      if (!btn || !img) return;
      const mesa = btn.dataset.table;
      if (rmConfig.mesaImages && rmConfig.mesaImages[mesa]) {
        img.src = rmConfig.mesaImages[mesa];
      } else if (rmConfig.tableImage) {
        img.src = rmConfig.tableImage;
      }
    });
  }

  function rmActualizarSelectoresYMax() {
    const tableInput = document.getElementById("table");
    if (tableInput) {
      tableInput.max = TOTAL_MESAS;
      if (Number(tableInput.value) > TOTAL_MESAS) tableInput.value = 1;
    }
    const modalTableInput = document.getElementById("modalTable");
    if (modalTableInput) modalTableInput.max = TOTAL_MESAS;

    const selectMesa = document.getElementById("filterMesaReport");
    if (selectMesa) {
      const valorPrevio = selectMesa.value;
      selectMesa.innerHTML = '<option value="">Todas</option>';
      for (let i = 1; i <= TOTAL_MESAS; i += 1) {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = `Mesa ${i}`;
        selectMesa.appendChild(opt);
      }
      if (valorPrevio && Number(valorPrevio) <= TOTAL_MESAS) {
        selectMesa.value = valorPrevio;
      }
    }

    const selectCap = document.getElementById("filterCapacity");
    if (selectCap) {
      const valorPrevio = selectCap.value;
      const capacidadesUnicas = [...new Set(CAPACIDADES)].sort((a, b) => a - b);
      selectCap.innerHTML =
        '<option value="">Todas las capacidades</option>' +
        capacidadesUnicas
          .map((c) => `<option value="${c}">${c} personas</option>`)
          .join("");
      if (valorPrevio && capacidadesUnicas.includes(Number(valorPrevio))) {
        selectCap.value = valorPrevio;
      }
    }
  }

  function rmAplicarMesas(cfg) {
    if (
      cfg.totalMesas &&
      Array.isArray(cfg.capacidades) &&
      cfg.capacidades.length === cfg.totalMesas
    ) {
      TOTAL_MESAS = cfg.totalMesas;
      CAPACIDADES = cfg.capacidades.slice();
    }
    rmActualizarSelectoresYMax();
  }

  function rmAplicarConfigCompleta() {
    rmAplicarNombreYTexto(rmConfig);
    rmAplicarColores(rmConfig);
    rmAplicarLogo(rmConfig);
    rmAplicarMesas(rmConfig);

    if (typeof renderReservas === "function") {
      renderReservas();
    } else if (typeof renderMesas === "function") {
      renderMesas();
    }
  }

  /* ---------------- Se "engancha" al renderMesas original ----------------
     No se modifica Rm.js: aquí solo se envuelve la función ya existente
     para que, cada vez que el sitio dibuje las mesas (búsqueda, filtros,
     liberar mesa, etc.), también se apliquen las imágenes personalizadas.
  --------------------------------------------------------------------- */
  if (typeof renderMesas === "function" && !renderMesas.__rmEnvuelta) {
    const renderMesasOriginal = renderMesas;
    const renderMesasConImagenes = function (...args) {
      renderMesasOriginal.apply(this, args);
      rmAplicarImagenesMesas();
    };
    renderMesasConImagenes.__rmEnvuelta = true;
    renderMesas = renderMesasConImagenes; // eslint-disable-line no-global-assign
  }

  /* ---------------- Compresión de imágenes subidas ---------------- */

  function rmLeerImagenComoDataURL(file, maxSize) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("No se pudo leer la imagen."));
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------------- Construcción del HTML del panel (inyectado, no toca index.html) ---------------- */

  function rmConstruirHTML() {
    const raiz = document.createElement("div");
    raiz.id = "rmAdminRoot";
    raiz.innerHTML = `
      <button id="rmAdminFab" type="button" title="Administración" aria-label="Administración">⚙️</button>

      <div id="rmLoginModal" class="rm-modal" aria-hidden="true">
        <div class="rm-modal-content">
          <h3>Acceso de administración</h3>
          <form id="rmLoginForm">
            <label>Usuario
              <input type="text" id="rmLoginUser" autocomplete="username" required />
            </label>
            <label>Contraseña
              <input type="password" id="rmLoginPass" autocomplete="current-password" required />
            </label>
            <p id="rmLoginError" class="rm-error"></p>
            <div class="rm-actions">
              <button type="submit" class="btn">Ingresar</button>
              <button type="button" id="rmLoginCancel" class="btn Outline">Cancelar</button>
            </div>
            <p class="rm-hint">Usuario y contraseña por defecto: <strong>admin / admin123</strong> (cámbialos luego en la pestaña Seguridad).</p>
          </form>
        </div>
      </div>

      <div id="rmAdminPanelModal" class="rm-modal" aria-hidden="true">
        <div class="rm-modal-content rm-modal-wide">
          <div class="rm-admin-header">
            <h3>Panel de administración</h3>
            <button type="button" id="rmLogoutBtn" class="btn Outline small">Cerrar sesión</button>
          </div>

          <div class="rm-tabs" role="tablist">
            <button type="button" class="rm-tab active" data-tab="general">General</button>
            <button type="button" class="rm-tab" data-tab="apariencia">Apariencia</button>
            <button type="button" class="rm-tab" data-tab="mesas">Mesas</button>
            <button type="button" class="rm-tab" data-tab="seguridad">Seguridad</button>
          </div>

          <form id="rmAdminForm">
            <div class="rm-tab-panel active" data-panel="general">
              <label>Nombre de la empresa / restaurante
                <input type="text" id="rmName" placeholder="Ej. Bufet de Roble" />
              </label>
              <label>Texto de bienvenida
                <textarea id="rmLead" rows="2" placeholder="Ej. Bienvenido al sistema de reservas..."></textarea>
              </label>
            </div>

            <div class="rm-tab-panel" data-panel="apariencia">
              <div class="rm-color-row">
                <label class="rm-color-field">Color principal
                  <input type="color" id="rmPrimaryColor" />
                </label>
                <label class="rm-color-field">Color dorado / acento
                  <input type="color" id="rmAccentColor" />
                </label>
              </div>

              <label>Logo del restaurante
                <input type="file" id="rmLogoInput" accept="image/*" />
              </label>
              <div class="rm-preview-row">
                <img id="rmLogoPreview" class="rm-preview-img" alt="Vista previa del logo" hidden />
                <button type="button" id="rmLogoRemove" class="btn Outline small" hidden>Quitar logo</button>
              </div>

              <label>Foto general para las mesas (se usa en todas las que no tengan foto propia)
                <input type="file" id="rmTableImageInput" accept="image/*" />
              </label>
              <div class="rm-preview-row">
                <img id="rmTableImagePreview" class="rm-preview-img" alt="Vista previa foto de mesas" hidden />
                <button type="button" id="rmTableImageRemove" class="btn Outline small" hidden>Quitar foto</button>
              </div>
            </div>

            <div class="rm-tab-panel" data-panel="mesas">
              <label>Cantidad de mesas
                <div class="rm-inline-field">
                  <input type="number" id="rmTotalMesas" min="1" max="40" />
                  <button type="button" id="rmUpdateMesasCount" class="btn Outline small">Actualizar cantidad</button>
                </div>
              </label>
              <p class="rm-hint">Por cada mesa puedes definir su capacidad y, si quieres, una foto propia (por ejemplo al agregar mesas nuevas).</p>
              <div id="rmMesasList" class="rm-mesas-list"></div>
            </div>

            <div class="rm-tab-panel" data-panel="seguridad">
              <label>Usuario actual
                <input type="text" id="rmSecUserActual" disabled />
              </label>
              <label>Nueva contraseña (dejar en blanco para no cambiarla)
                <input type="password" id="rmSecPassNueva" autocomplete="new-password" />
              </label>
              <label>Nuevo usuario (opcional)
                <input type="text" id="rmSecUserNuevo" autocomplete="username" />
              </label>
              <label>Contraseña actual (requerida para confirmar cualquier cambio de seguridad)
                <input type="password" id="rmSecPassActual" autocomplete="current-password" />
              </label>
              <p id="rmSecError" class="rm-error"></p>
            </div>

            <div class="rm-actions rm-actions-final">
              <button type="submit" class="btn">Guardar cambios</button>
              <button type="button" id="rmResetDefaults" class="btn Outline">Restablecer valores originales</button>
              <button type="button" id="rmAdminCancel" class="btn Outline">Cerrar</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(raiz);
  }

  function rmInyectarEstilos() {
    const style = document.createElement("style");
    style.id = "rmAdminEstilos";
    style.textContent = `
      #rmAdminFab {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 1500;
        width: 52px;
        height: 52px;
        font-size: 1.4rem;
        line-height: 1;
        color: #fffaf2;
        background: var(--wine, #c2521f);
        border: none;
        border-radius: 50%;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
        cursor: pointer;
        transition: transform 160ms ease, background 160ms ease;
      }
      #rmAdminFab:hover {
        background: var(--wine-dark, #8f3813);
        transform: translateY(-2px) rotate(20deg);
      }

      .rm-modal {
        position: fixed;
        inset: 0;
        z-index: 2500;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(42, 18, 18, 0.72);
        backdrop-filter: blur(4px);
      }
      .rm-modal.open {
        display: flex;
      }
      .rm-modal-content {
        width: min(420px, 100%);
        padding: 28px;
        background: var(--surface, #fffaf3);
        border-top: 4px solid var(--gold, #e08e2d);
        border-radius: 3px;
        box-shadow: 0 24px 60px rgba(35, 13, 15, 0.3);
        color: var(--ink, #3a2818);
        font-family: "Quicksand", "Trebuchet MS", "Segoe UI", sans-serif;
      }
      .rm-modal-content.rm-modal-wide {
        width: min(640px, 100%);
        max-height: 88vh;
        overflow-y: auto;
      }
      .rm-modal-content h3 {
        margin: 0 0 18px;
        color: var(--wine, #c2521f);
        font-family: "Playfair Display", Georgia, serif;
        font-size: 1.4rem;
      }
      .rm-admin-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .rm-admin-header h3 {
        margin: 0;
      }

      #rmAdminForm label,
      #rmLoginForm label {
        display: block;
        margin-bottom: 14px;
        color: var(--muted, #8a6a52);
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      #rmAdminForm input[type="text"],
      #rmAdminForm input[type="password"],
      #rmAdminForm input[type="number"],
      #rmAdminForm textarea,
      #rmLoginForm input {
        width: 100%;
        margin-top: 6px;
        padding: 10px 12px;
        color: var(--ink, #3a2818);
        font: inherit;
        font-size: 0.88rem;
        background: var(--surface-soft, #fdf0e1);
        border: 1px solid var(--line, #f0d8bd);
        border-radius: 2px;
        outline: none;
      }
      #rmAdminForm input[type="file"] {
        display: block;
        width: 100%;
        margin-top: 6px;
        font-size: 0.8rem;
      }
      #rmAdminForm input[disabled] {
        opacity: 0.65;
      }

      .rm-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 14px 0 18px;
        border-bottom: 1px solid var(--line, #f0d8bd);
      }
      .rm-tab {
        padding: 8px 14px;
        font: inherit;
        font-size: 0.78rem;
        font-weight: 700;
        color: var(--muted, #8a6a52);
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        cursor: pointer;
      }
      .rm-tab.active {
        color: var(--wine, #c2521f);
        border-bottom-color: var(--gold, #e08e2d);
      }
      .rm-tab-panel {
        display: none;
      }
      .rm-tab-panel.active {
        display: block;
      }

      .rm-color-row {
        display: flex;
        gap: 16px;
        margin-bottom: 4px;
      }
      .rm-color-field {
        flex: 1;
      }
      .rm-color-field input[type="color"] {
        width: 100%;
        height: 40px;
        margin-top: 6px;
        padding: 3px;
        background: var(--surface-soft, #fdf0e1);
        border: 1px solid var(--line, #f0d8bd);
        border-radius: 2px;
        cursor: pointer;
      }

      .rm-preview-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 4px 0 16px;
      }
      .rm-preview-img {
        max-width: 90px;
        max-height: 60px;
        object-fit: cover;
        border: 1px solid var(--line, #f0d8bd);
        border-radius: 3px;
      }

      .rm-inline-field {
        display: flex;
        gap: 8px;
        margin-top: 6px;
      }
      .rm-inline-field input {
        margin-top: 0;
      }

      .rm-mesas-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
        gap: 10px;
        max-height: 260px;
        margin: 10px 0 6px;
        padding: 12px;
        overflow-y: auto;
        background: var(--surface-soft, #fdf0e1);
        border: 1px solid var(--line, #f0d8bd);
        border-radius: 2px;
      }
      .rm-mesa-row {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px;
        background: var(--surface, #fffaf3);
        border: 1px solid var(--line, #f0d8bd);
        border-radius: 2px;
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--ink, #3a2818);
        text-transform: none;
        letter-spacing: 0;
      }
      .rm-mesa-row .rm-mesa-row-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .rm-mesa-row input[type="number"] {
        width: 60px;
        margin: 0;
        padding: 5px 6px;
        font-size: 0.82rem;
        text-align: center;
      }
      .rm-mesa-row input[type="file"] {
        font-size: 0.68rem;
      }
      .rm-mesa-row img {
        width: 100%;
        height: 46px;
        object-fit: cover;
        border-radius: 2px;
        display: none;
      }
      .rm-mesa-row img.rm-has-img {
        display: block;
      }

      .rm-error {
        min-height: 1em;
        margin: 4px 0 0;
        color: var(--error, #c23a2f);
        font-size: 0.78rem;
        font-weight: 600;
        text-transform: none;
        letter-spacing: 0;
      }
      .rm-hint {
        margin: 0 0 14px;
        color: var(--muted, #8a6a52);
        font-size: 0.72rem;
        font-weight: 500;
        text-transform: none;
        letter-spacing: 0;
      }

      .rm-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }
      .rm-actions-final {
        border-top: 1px solid var(--line, #f0d8bd);
        padding-top: 16px;
      }

      #rmSiteLogo {
        max-height: 56px;
        margin-right: 16px;
        border-radius: 4px;
        object-fit: contain;
        vertical-align: middle;
      }

      @media (max-width: 480px) {
        .rm-color-row {
          flex-direction: column;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------------- Interacciones del panel ---------------- */

  function rmMostrarPestaña(nombre) {
    document.querySelectorAll(".rm-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === nombre);
    });
    document.querySelectorAll(".rm-tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.panel === nombre);
    });
  }

  function rmAbrirLogin() {
    if (rmSesionEstaActiva()) {
      rmAbrirPanel();
      return;
    }
    const modal = document.getElementById("rmLoginModal");
    document.getElementById("rmLoginUser").value = "";
    document.getElementById("rmLoginPass").value = "";
    document.getElementById("rmLoginError").textContent = "";
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.getElementById("rmLoginUser").focus();
  }

  function rmCerrarLogin() {
    const modal = document.getElementById("rmLoginModal");
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  async function rmManejarLogin(event) {
    event.preventDefault();
    const usuario = document.getElementById("rmLoginUser").value.trim();
    const clave = document.getElementById("rmLoginPass").value;
    const auth = await rmAsegurarAuthInicial();
    const hashIngresado = await rmHashTexto(clave);

    if (usuario === auth.usuario && hashIngresado === auth.hash) {
      rmActivarSesion();
      rmCerrarLogin();
      rmAbrirPanel();
    } else {
      document.getElementById("rmLoginError").textContent =
        "Usuario o contraseña incorrectos.";
    }
  }

  function rmRenderListaMesasAdmin(cantidad) {
    const cont = document.getElementById("rmMesasList");
    if (!cont) return;

    const capacidadesActuales =
      Array.isArray(rmConfig.capacidades) && rmConfig.capacidades.length === TOTAL_MESAS
        ? rmConfig.capacidades
        : CAPACIDADES;

    const filas = [];
    for (let i = 1; i <= cantidad; i += 1) {
      const capacidad = capacidadesActuales[i - 1] || 4;
      const imagenGuardada = (rmConfig.mesaImages && rmConfig.mesaImages[i]) || "";
      filas.push(`
        <div class="rm-mesa-row" data-mesa="${i}">
          <div class="rm-mesa-row-top">
            <span>Mesa ${i}</span>
            <input type="number" min="1" max="30" value="${capacidad}" class="rm-mesa-cap" data-mesa="${i}" />
          </div>
          <img class="rm-mesa-img-preview ${imagenGuardada ? "rm-has-img" : ""}" src="${imagenGuardada}" alt="" />
          <input type="file" accept="image/*" class="rm-mesa-img-input" data-mesa="${i}" />
        </div>
      `);
    }
    cont.innerHTML = filas.join("");

    cont.querySelectorAll(".rm-mesa-img-input").forEach((input) => {
      input.addEventListener("change", async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const dataUrl = await rmLeerImagenComoDataURL(file, 300);
        const fila = input.closest(".rm-mesa-row");
        const preview = fila.querySelector(".rm-mesa-img-preview");
        preview.src = dataUrl;
        preview.classList.add("rm-has-img");
        fila.dataset.nuevaImagen = dataUrl;
      });
    });
  }

  function rmActualizarCantidadMesasAdmin() {
    const totalInput = document.getElementById("rmTotalMesas");
    let nuevoTotal = Number(totalInput.value);
    if (!nuevoTotal || nuevoTotal < 1) nuevoTotal = 1;
    if (nuevoTotal > 40) nuevoTotal = 40;
    totalInput.value = nuevoTotal;
    rmRenderListaMesasAdmin(nuevoTotal);
  }

  function rmAbrirPanel() {
    document.getElementById("rmName").value = rmConfig.name || RM_H1_ORIGINAL;
    document.getElementById("rmLead").value = rmConfig.lead || RM_LEAD_ORIGINAL;
    document.getElementById("rmPrimaryColor").value = rmConfig.primaryColor || "#c2521f";
    document.getElementById("rmAccentColor").value = rmConfig.accentColor || "#e08e2d";
    document.getElementById("rmTotalMesas").value = TOTAL_MESAS;

    const logoPreview = document.getElementById("rmLogoPreview");
    const logoRemove = document.getElementById("rmLogoRemove");
    if (rmConfig.logo) {
      logoPreview.src = rmConfig.logo;
      logoPreview.hidden = false;
      logoRemove.hidden = false;
    } else {
      logoPreview.hidden = true;
      logoRemove.hidden = true;
    }

    const tableImgPreview = document.getElementById("rmTableImagePreview");
    const tableImgRemove = document.getElementById("rmTableImageRemove");
    if (rmConfig.tableImage) {
      tableImgPreview.src = rmConfig.tableImage;
      tableImgPreview.hidden = false;
      tableImgRemove.hidden = false;
    } else {
      tableImgPreview.hidden = true;
      tableImgRemove.hidden = true;
    }

    rmRenderListaMesasAdmin(TOTAL_MESAS);

    document.getElementById("rmSecUserActual").value = "";
    rmAsegurarAuthInicial().then((auth) => {
      document.getElementById("rmSecUserActual").value = auth.usuario;
    });
    document.getElementById("rmSecPassNueva").value = "";
    document.getElementById("rmSecUserNuevo").value = "";
    document.getElementById("rmSecPassActual").value = "";
    document.getElementById("rmSecError").textContent = "";

    rmMostrarPestaña("general");

    const modal = document.getElementById("rmAdminPanelModal");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function rmCerrarPanel() {
    const modal = document.getElementById("rmAdminPanelModal");
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function rmLeerMesasDelPanel() {
    const filas = document.querySelectorAll("#rmMesasList .rm-mesa-row");
    const capacidades = [];
    const mesaImages = { ...rmConfig.mesaImages };
    filas.forEach((fila) => {
      const numero = fila.dataset.mesa;
      const inputCap = fila.querySelector(".rm-mesa-cap");
      capacidades.push(Math.max(1, Number(inputCap.value) || 4));
      if (fila.dataset.nuevaImagen) {
        mesaImages[numero] = fila.dataset.nuevaImagen;
      }
    });
    // Elimina imágenes de mesas que ya no existen
    Object.keys(mesaImages).forEach((k) => {
      if (Number(k) > capacidades.length) delete mesaImages[k];
    });
    return { capacidades, mesaImages };
  }

  async function rmGuardarCambiosGenerales() {
    const nombre = document.getElementById("rmName").value.trim();
    const lead = document.getElementById("rmLead").value.trim();
    const primario = document.getElementById("rmPrimaryColor").value;
    const acento = document.getElementById("rmAccentColor").value;
    const { capacidades, mesaImages } = rmLeerMesasDelPanel();
    const nuevoTotal = capacidades.length;

    if (!nombre) {
      if (typeof showToast === "function") {
        showToast("El nombre no puede estar vacío.", "error");
      }
      return false;
    }

    if (nuevoTotal < TOTAL_MESAS && typeof reservas !== "undefined") {
      const mesasEliminadas = [];
      for (let i = nuevoTotal + 1; i <= TOTAL_MESAS; i += 1) mesasEliminadas.push(i);
      const afectadas = reservas.some(
        (r) => mesasEliminadas.includes(Number(r.table)) && r.status !== "cancelada",
      );
      if (afectadas) {
        const ok = await (typeof confirmDialog === "function"
          ? confirmDialog(
              "Algunas mesas que vas a quitar tienen reservas activas. Quedarán en el historial pero la mesa ya no se mostrará. ¿Continuar?",
            )
          : Promise.resolve(window.confirm("Algunas mesas a quitar tienen reservas activas. ¿Continuar?")));
        if (!ok) return false;
      }
    }

    rmConfig = {
      ...rmConfig,
      name: nombre,
      lead,
      primaryColor: primario,
      accentColor: acento,
      totalMesas: nuevoTotal,
      capacidades,
      mesaImages,
    };

    const logoPreview = document.getElementById("rmLogoPreview");
    if (!logoPreview.hidden && logoPreview.src.startsWith("data:")) {
      rmConfig.logo = logoPreview.src;
    }
    const tableImgPreview = document.getElementById("rmTableImagePreview");
    if (!tableImgPreview.hidden && tableImgPreview.src.startsWith("data:")) {
      rmConfig.tableImage = tableImgPreview.src;
    }

    rmGuardarConfig(rmConfig);
    rmAplicarConfigCompleta();
    return true;
  }

  async function rmGuardarCambiosSeguridad() {
    const passNueva = document.getElementById("rmSecPassNueva").value;
    const userNuevo = document.getElementById("rmSecUserNuevo").value.trim();
    const passActual = document.getElementById("rmSecPassActual").value;
    const errorEl = document.getElementById("rmSecError");
    errorEl.textContent = "";

    if (!passNueva && !userNuevo) return true; // nada que cambiar

    const auth = await rmAsegurarAuthInicial();
    const hashActualIngresado = await rmHashTexto(passActual);

    if (hashActualIngresado !== auth.hash) {
      errorEl.textContent = "La contraseña actual no es correcta.";
      rmMostrarPestaña("seguridad");
      return false;
    }

    const nuevoAuth = { usuario: userNuevo || auth.usuario, hash: auth.hash };
    if (passNueva) {
      nuevoAuth.hash = await rmHashTexto(passNueva);
    }
    rmGuardarAuth(nuevoAuth);
    return true;
  }

  async function rmManejarGuardarTodo(event) {
    event.preventDefault();
    const okGeneral = await rmGuardarCambiosGenerales();
    if (!okGeneral) return;
    const okSeguridad = await rmGuardarCambiosSeguridad();
    if (!okSeguridad) return;

    rmCerrarPanel();
    if (typeof showToast === "function") {
      showToast("Configuración del sitio actualizada ✅");
    }
  }

  function rmRestablecerValores() {
    const confirmar = typeof confirmDialog === "function"
      ? confirmDialog("¿Restablecer nombre, colores, logo, fotos y mesas a los valores originales de la web?")
      : Promise.resolve(window.confirm("¿Restablecer todo a los valores originales?"));

    confirmar.then((ok) => {
      if (!ok) return;
      rmConfig = JSON.parse(JSON.stringify(RM_CONFIG_DEFECTO));
      rmGuardarConfig(rmConfig);
      TOTAL_MESAS = RM_TOTAL_MESAS_ORIGINAL;
      CAPACIDADES = RM_CAPACIDADES_ORIGINAL.slice();

      // Restaurar nombre/texto exactamente como estaban en tu index.html original
      document.title = RM_TITLE_ORIGINAL;
      const h1 = document.querySelector("header h1");
      const lead = document.querySelector("header .lead");
      if (h1) h1.textContent = RM_H1_ORIGINAL;
      if (lead) lead.textContent = RM_LEAD_ORIGINAL;

      const styleEl = document.getElementById("rmAdminColorVars");
      if (styleEl) styleEl.remove();
      const logoEl = document.getElementById("rmSiteLogo");
      if (logoEl) logoEl.remove();

      rmActualizarSelectoresYMax();
      if (typeof renderReservas === "function") renderReservas();

      rmAbrirPanel();
      if (typeof showToast === "function") {
        showToast("Valores originales restaurados ✅");
      }
    });
  }

  /* ---------------- Inicialización ---------------- */

  function rmInit() {
    rmInyectarEstilos();
    rmConstruirHTML();
    rmAsegurarAuthInicial();

    // Aplica configuración ya guardada (si el admin ya había hecho cambios antes)
    rmAplicarConfigCompleta();

    document.getElementById("rmAdminFab").addEventListener("click", rmAbrirLogin);
    document.getElementById("rmLoginForm").addEventListener("submit", rmManejarLogin);
    document.getElementById("rmLoginCancel").addEventListener("click", rmCerrarLogin);
    document.getElementById("rmLoginModal").addEventListener("click", (e) => {
      if (e.target.id === "rmLoginModal") rmCerrarLogin();
    });

    document.getElementById("rmAdminForm").addEventListener("submit", rmManejarGuardarTodo);
    document.getElementById("rmAdminCancel").addEventListener("click", rmCerrarPanel);
    document.getElementById("rmLogoutBtn").addEventListener("click", () => {
      rmCerrarSesionAdmin();
      rmCerrarPanel();
    });
    document.getElementById("rmResetDefaults").addEventListener("click", rmRestablecerValores);
    document.getElementById("rmAdminPanelModal").addEventListener("click", (e) => {
      if (e.target.id === "rmAdminPanelModal") rmCerrarPanel();
    });

    document.querySelectorAll(".rm-tab").forEach((btn) => {
      btn.addEventListener("click", () => rmMostrarPestaña(btn.dataset.tab));
    });

    document.getElementById("rmUpdateMesasCount").addEventListener("click", rmActualizarCantidadMesasAdmin);

    document.getElementById("rmLogoInput").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const dataUrl = await rmLeerImagenComoDataURL(file, 240);
      const preview = document.getElementById("rmLogoPreview");
      preview.src = dataUrl;
      preview.hidden = false;
      document.getElementById("rmLogoRemove").hidden = false;
    });
    document.getElementById("rmLogoRemove").addEventListener("click", () => {
      const preview = document.getElementById("rmLogoPreview");
      preview.src = "";
      preview.hidden = true;
      document.getElementById("rmLogoRemove").hidden = true;
      document.getElementById("rmLogoInput").value = "";
      rmConfig.logo = null;
    });

    document.getElementById("rmTableImageInput").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const dataUrl = await rmLeerImagenComoDataURL(file, 400);
      const preview = document.getElementById("rmTableImagePreview");
      preview.src = dataUrl;
      preview.hidden = false;
      document.getElementById("rmTableImageRemove").hidden = false;
    });
    document.getElementById("rmTableImageRemove").addEventListener("click", () => {
      const preview = document.getElementById("rmTableImagePreview");
      preview.src = "";
      preview.hidden = true;
      document.getElementById("rmTableImageRemove").hidden = true;
      document.getElementById("rmTableImageInput").value = "";
      rmConfig.tableImage = null;
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        rmCerrarLogin();
        rmCerrarPanel();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", rmInit);
  } else {
    rmInit();
  }
})();
