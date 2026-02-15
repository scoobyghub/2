// ==UserScript==
// @name         TMN 2010 Automation Helper v12.10
// @namespace    http://tampermonkey.net/
// @version      12.10
// @description  v12.10 + Single tab + Flicker fix + UI cleanup + Garage minutes
// @author       You
// @match        *://www.tmn2010.net/login.aspx*
// @match        *://www.tmn2010.net/authenticated/*
// @match        *://www.tmn2010.net/Login.aspx*
// @match        *://www.tmn2010.net/Authenticated/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      api.telegram.org
// @updateURL    https://not.in.use.home.ballz.uk/tmn/autotmn.meta.js
// @downloadURL  https://not.in.use.home.ballz.uk/tmn/autotmn.user.js
// ==/UserScript==

/* AUTO-CONFIRM - Same as working alooo sabzi.txt */
(function () {
    try {
        const script = document.createElement('script');
        script.textContent = `
            window.confirm = function(msg) {
                console.log('[TMN][AUTO-CONFIRM]:', msg);
                return true;
            };
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    } catch (e) {
        console.warn('[TMN] Failed to inject auto-confirm override:', e);
    }
})();

(function () {
  'use strict';

  // ---------------------------
  // Minimal global CSS so host container sits above the page (always on top)
  // ---------------------------
  GM_addStyle(`
    #tmn-automation-host {
      position: fixed !important;
      top: 12px !important;
      right: 12px !important;
      z-index: 2147483647 !important; /* Maximum z-index to ensure always on top */
      pointer-events: auto !important;
    }
  `);

  // ---------------------------

  // ============================================================
  // AUTO-LOGIN CONFIGURATION
  // ============================================================
  const LOGIN_CONFIG = {
  USERNAME: GM_getValue('loginUsername', "username"),
  PASSWORD: GM_getValue('loginPassword', "password"),
  AUTO_SUBMIT_ENABLED: GM_getValue('autoSubmitEnabled', true),
  MAX_LOGIN_ATTEMPTS: 3,
  AUTO_SUBMIT_DELAY: 3000
};

  // ============================================================
  // CHECK IF WE'RE ON DEFAULT PAGE (SESSION REFRESH) - REDIRECT TO LOGIN
  // ============================================================
  const currentPath = window.location.pathname.toLowerCase();
  const currentSearch = window.location.search.toLowerCase();

  if (currentPath.includes("/default.aspx") && currentSearch.includes("show=1")) {
    console.log("[TMN] On Default.aspx?show=1 - waiting 6 seconds then redirecting to login...");
    // Create overlay to show status
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed", top: "10px", right: "10px",
      background: "rgba(0,0,0,0.85)", color: "#fff",
      padding: "12px", borderRadius: "8px",
      fontFamily: "system-ui, sans-serif", fontSize: "14px",
      zIndex: "9999", textAlign: "center",
      minWidth: "250px", border: "2px solid #f59e0b"
    });
    overlay.innerHTML = "🔄 <b>Session Refresh</b><br>Redirecting to login in <span id='tmn-countdown'>6</span>s...";
    document.body.appendChild(overlay);

    let countdown = 6;
    const countdownEl = document.getElementById('tmn-countdown');
    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdownEl) countdownEl.textContent = countdown;
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        window.location.href = 'https://www.tmn2010.net/login.aspx';
      }
    }, 1000);

    return; // Don't run rest of script
  }

  // ============================================================
  // CHECK IF WE'RE ON LOGIN PAGE - HANDLE AUTO-LOGIN FIRST
  // ============================================================
  const isLoginPage = currentPath.includes("/login.aspx");

  if (isLoginPage) {
    // AUTO-LOGIN CODE
    const USERNAME_ID = "ctl00_main_txtUsername";
    const PASSWORD_ID = "ctl00_main_txtPassword";
    const LOGIN_BTN_ID = "ctl00_main_btnLogin";
    const TOKEN_SEL = "textarea[name='g-recaptcha-response'], #g-recaptcha-response";
    const ERROR_SEL = ".TMNErrorFont";

    const LS_LOGIN_ATTEMPTS = "tmnLoginAttempts";
    const LS_LOGIN_PAUSED = "tmnLoginPaused";
    const LS_LAST_TOKEN = "tmnLastTokenUsed";

    let loginAttempts = parseInt(localStorage.getItem(LS_LOGIN_ATTEMPTS) || "0", 10);
    let loginPaused = localStorage.getItem(LS_LOGIN_PAUSED) === "true";
    let lastTokenUsed = localStorage.getItem(LS_LAST_TOKEN) || "";
    let submitTimer = null;
    let countdownTimer = null;
    let loginOverlay = null;

    function log(...args) {
      console.log("[TMN AutoLogin]", ...args);
    }

    function updateLoginOverlay(message) {
      if (!loginOverlay) {
        loginOverlay = document.createElement("div");
        Object.assign(loginOverlay.style, {
          position: "fixed", top: "10px", right: "10px",
          background: "rgba(0,0,0,0.85)", color: "#fff",
          padding: "12px", borderRadius: "8px",
          fontFamily: "system-ui, sans-serif", fontSize: "14px",
          zIndex: "9999", whiteSpace: "pre-line",
          lineHeight: "1.4em", textAlign: "center",
          minWidth: "250px", border: "2px solid #007bff"
        });
        document.body.appendChild(loginOverlay);
      }
      console.log("[TMN AutoLogin]", message);
      loginOverlay.textContent = `TMN AutoLogin v12.10\n${message}`;
    }

    function clearTimers() {
      if (submitTimer) { clearTimeout(submitTimer); submitTimer = null; }
      if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    }

    function resetLoginState() {
      if (loginPaused || loginAttempts >= LOGIN_CONFIG.MAX_LOGIN_ATTEMPTS) {
        log("Resetting login state on login page");
        localStorage.setItem(LS_LOGIN_ATTEMPTS, "0");
        localStorage.setItem(LS_LOGIN_PAUSED, "false");
        loginAttempts = 0;
        loginPaused = false;
      }
    }

    function getCaptchaToken() {
      const element = document.querySelector(TOKEN_SEL);
      return element && typeof element.value === "string" ? element.value.trim() : "";
    }

    function isCaptchaCompleted() {
      const recaptchaResponse = document.querySelector('textarea[name="g-recaptcha-response"]');
      if (recaptchaResponse && recaptchaResponse.value && recaptchaResponse.value.length > 0) {
        return true;
      }
      const loginBtn = document.getElementById(LOGIN_BTN_ID);
      const usernameField = document.getElementById(USERNAME_ID);
      const passwordField = document.getElementById(PASSWORD_ID);
      if (loginBtn && !loginBtn.disabled &&
          usernameField && usernameField.value.length > 0 &&
          passwordField && passwordField.value.length > 0) {
        return true;
      }
      return false;
    }

    function fillCredentials() {
      if (LOGIN_CONFIG.USERNAME === "your_username_here" || LOGIN_CONFIG.PASSWORD === "your_password_here") {
        updateLoginOverlay("⚠️ Please set your USERNAME and PASSWORD\nin the script configuration.");
        return false;
      }
      const usernameField = document.getElementById(USERNAME_ID);
      const passwordField = document.getElementById(PASSWORD_ID);
      if (usernameField && passwordField) {
        usernameField.value = LOGIN_CONFIG.USERNAME;
        passwordField.value = LOGIN_CONFIG.PASSWORD;
        log("Credentials filled successfully");
        return true;
      }
      return false;
    }

    function canAutoLogin() {
      if (LOGIN_CONFIG.USERNAME === "your_username_here" || LOGIN_CONFIG.PASSWORD === "your_password_here") {
        return false;
      }
      if (!LOGIN_CONFIG.AUTO_SUBMIT_ENABLED) {
        updateLoginOverlay("🟢 Credentials filled.\nAuto-submit disabled.\nSolve captcha manually.");
        return false;
      }
      if (loginAttempts >= LOGIN_CONFIG.MAX_LOGIN_ATTEMPTS) {
        if (!loginPaused) {
          loginPaused = true;
          localStorage.setItem(LS_LOGIN_PAUSED, "true");
          updateLoginOverlay("❌ Max attempts reached.\nRefreshing session...");
          // Redirect to Default.aspx to refresh session, then back to login
          setTimeout(() => {
            localStorage.setItem(LS_LOGIN_ATTEMPTS, "0");
            localStorage.setItem(LS_LOGIN_PAUSED, "false");
            window.location.href = 'https://www.tmn2010.net/Default.aspx?show=1';
          }, 2000);
        }
        return false;
      }
      return true;
    }

    function attemptLogin() {
      clearTimers();
      const loginBtn = document.getElementById(LOGIN_BTN_ID);
      const currentToken = getCaptchaToken();
      if (!loginBtn || loginBtn.disabled || !currentToken) {
        updateLoginOverlay("⚠️ Login not ready - waiting...");
        return;
      }
      loginAttempts++;
      localStorage.setItem(LS_LOGIN_ATTEMPTS, loginAttempts.toString());
      lastTokenUsed = currentToken;
      localStorage.setItem(LS_LAST_TOKEN, lastTokenUsed);
      updateLoginOverlay(`🔐 Submitting login ${loginAttempts}/${LOGIN_CONFIG.MAX_LOGIN_ATTEMPTS}...`);
      loginBtn.click();
    }

    function scheduleAutoSubmit(delay = LOGIN_CONFIG.AUTO_SUBMIT_DELAY) {
      clearTimers();
      let secondsLeft = Math.ceil(delay / 1000);
      updateLoginOverlay(`✅ Captcha completed – submitting in ${secondsLeft}s...`);
      countdownTimer = setInterval(() => {
        secondsLeft--;
        if (secondsLeft > 0) {
          updateLoginOverlay(`✅ Captcha completed – submitting in ${secondsLeft}s...`);
        }
      }, 1000);
      submitTimer = setTimeout(() => { attemptLogin(); }, delay);
    }

    function checkLoginPage() {
      const errorElement = document.querySelector(ERROR_SEL);
      if (errorElement) {
        const errorMsg = (errorElement.textContent || "").trim().toLowerCase();
        if (errorMsg.includes("incorrect validation")) {
          clearTimers();
          updateLoginOverlay(`❌ Incorrect Validation (${loginAttempts}/${LOGIN_CONFIG.MAX_LOGIN_ATTEMPTS})\nPlease solve captcha again.`);
          lastTokenUsed = "";
          localStorage.removeItem(LS_LAST_TOKEN);
        } else if (errorMsg.includes("invalid")) {
          updateLoginOverlay(`⚠️ Invalid credentials (${loginAttempts}/${LOGIN_CONFIG.MAX_LOGIN_ATTEMPTS})`);
        }
      }
      if (!canAutoLogin()) { return; }
      const loginBtn = document.getElementById(LOGIN_BTN_ID);
      const captchaCompleted = isCaptchaCompleted();
      const currentToken = getCaptchaToken();
      if (loginBtn && !loginBtn.disabled && captchaCompleted && currentToken && currentToken !== lastTokenUsed) {
        if (!submitTimer) {
          updateLoginOverlay("✅ Captcha completed - auto-submitting...");
          scheduleAutoSubmit(LOGIN_CONFIG.AUTO_SUBMIT_DELAY + Math.floor(Math.random() * 2000));
        }
      } else {
        if (submitTimer && (!captchaCompleted || !currentToken || (loginBtn && loginBtn.disabled))) {
          clearTimers();
          if (!captchaCompleted) {
            updateLoginOverlay("⏳ Waiting for captcha completion...");
          } else if (!currentToken) {
            updateLoginOverlay("⏳ Waiting for captcha token...");
          } else {
            updateLoginOverlay("⏳ Waiting for login button...");
          }
        }
      }
    }

    function initializeAutoLogin() {
      log("TMN AutoLogin initialized");
      resetLoginState();
      const credentialsFilled = fillCredentials();
      if (!credentialsFilled) { return; }
      if (canAutoLogin()) {
        updateLoginOverlay("🟢 Auto-login enabled.\nSolve captcha to continue...");
        const checkInterval = setInterval(checkLoginPage, 1000);
        window.addEventListener('beforeunload', () => {
          clearInterval(checkInterval);
          clearTimers();
        });
      }
    }

    // Initialize auto-login
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeAutoLogin);
    } else {
      setTimeout(initializeAutoLogin, 500);
    }

    // Exit early - don't run main automation on login page
    return;
  }

  // ============================================================
  // RESET LOGIN ATTEMPTS WHEN SUCCESSFULLY AUTHENTICATED
  // ============================================================
  if (currentPath.includes("/authenticated/")) {
    const loginAttempts = parseInt(localStorage.getItem("tmnLoginAttempts") || "0", 10);
    const loginPaused = localStorage.getItem("tmnLoginPaused") === "true";
    if (loginAttempts > 0 || loginPaused) {
      console.log("[TMN] Successfully logged in - resetting login attempts");
      localStorage.setItem("tmnLoginAttempts", "0");
      localStorage.setItem("tmnLoginPaused", "false");
      localStorage.removeItem("tmnLastTokenUsed");
    }
  }

// ============================================================
// CAPTCHA HANDLER FOR AUTHENTICATED PAGES
// ============================================================
if (currentPath.includes("/authenticated/")) {
  function handleAuthenticatedCaptcha() {
    const captchaFrame = document.querySelector('iframe[src*="recaptcha"]');
    const captchaResponse = document.querySelector('textarea[name="g-recaptcha-response"]');

    if (captchaFrame || captchaResponse) {
      const token = captchaResponse?.value?.trim();

      if (token && token.length > 0) {
        // Captcha completed - find and click submit
        const submitBtn = document.querySelector('input[type="submit"], button[type="submit"]') ||
                         document.getElementById('ctl00_main_btnVerify') ||
                         Array.from(document.querySelectorAll('input, button')).find(b =>
                           b.value?.toLowerCase().includes('verify') ||
                           b.textContent?.toLowerCase().includes('verify')
                         );

        if (submitBtn && !submitBtn.disabled) {
          console.log('[TMN] Captcha completed - submitting...');
          setTimeout(() => submitBtn.click(), 1000);
        }
      }
    }
  }

  setInterval(handleAuthenticatedCaptcha, 1000);
}

  // Config + State
  // ---------------------------
  const config = {
    crimeInterval: GM_getValue('crimeInterval', 125),
    gtaInterval: GM_getValue('gtaInterval', 245),
    jailbreakInterval: GM_getValue('jailbreakInterval', 3),
    jailCheckInterval: GM_getValue('jailCheckInterval', 5),
    boozeInterval: GM_getValue('boozeInterval', 120),
    boozeBuyAmount: GM_getValue('boozeBuyAmount', 5),
    boozeSellAmount: GM_getValue('boozeSellAmount', 5),
    healthCheckInterval: GM_getValue('healthCheckInterval', 30),
    garageInterval: GM_getValue('garageInterval', 300),
    minHealthThreshold: GM_getValue('minHealthThreshold', 89),
    targetHealth: GM_getValue('targetHealth', 90)
  };
    // ---------------------------
  // Telegram Configuration
  // ---------------------------
  const telegramConfig = {
    botToken: GM_getValue('telegramBotToken', ''),
    chatId: GM_getValue('telegramChatId', ''),
    enabled: GM_getValue('telegramEnabled', false),
    notifyCaptcha: GM_getValue('notifyCaptcha', true),
    notifyMessages: GM_getValue('notifyMessages', true),
    lastMessageCheck: GM_getValue('lastMessageCheck', 0),
    messageCheckInterval: GM_getValue('messageCheckInterval', 60),
    notifySqlCheck: GM_getValue('notifySqlCheck', true),
    notifyLogout: GM_getValue('notifyLogout', true)
};

  function saveTelegramConfig() {
    GM_setValue('telegramBotToken', telegramConfig.botToken);
    GM_setValue('telegramChatId', telegramConfig.chatId);
    GM_setValue('telegramEnabled', telegramConfig.enabled);
    GM_setValue('notifyCaptcha', telegramConfig.notifyCaptcha);
    GM_setValue('notifyMessages', telegramConfig.notifyMessages);
    GM_setValue('lastMessageCheck', telegramConfig.lastMessageCheck);
    GM_setValue('messageCheckInterval', telegramConfig.messageCheckInterval);
    GM_setValue('notifySqlCheck', telegramConfig.notifySqlCheck);
    GM_setValue('notifyLogout', telegramConfig.notifyLogout);
  }

  // ---------------------------
  // Logout Alert Configuration
  // ---------------------------
  const logoutAlertConfig = {
    tabFlash: GM_getValue('logoutTabFlash', true),
    browserNotify: GM_getValue('logoutBrowserNotify', true)
  };

  function saveLogoutAlertConfig() {
    GM_setValue('logoutTabFlash', logoutAlertConfig.tabFlash);
    GM_setValue('logoutBrowserNotify', logoutAlertConfig.browserNotify);
  }

  // Tab title flash state
  let titleFlashInterval = null;
  const originalTitle = document.title;

  function flashTabTitle() {
    if (titleFlashInterval) return; // Already flashing
    let toggle = false;
    titleFlashInterval = setInterval(() => {
      document.title = toggle ? '🔴 LOGIN NEEDED' : originalTitle;
      toggle = !toggle;
    }, 1000);
  }

  function stopFlashTabTitle() {
    if (titleFlashInterval) {
      clearInterval(titleFlashInterval);
      titleFlashInterval = null;
      document.title = originalTitle;
    }
  }

  function showLogoutBrowserNotification() {
    if (Notification.permission === 'granted') {
      new Notification('TMN2010 Session Expired', {
        body: 'Click to switch to tab and log back in',
        requireInteraction: true,
        icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
      });
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
          new Notification('TMN2010 Session Expired', {
            body: 'Click to switch to tab and log back in',
            requireInteraction: true
          });
        }
      });
    }
  }

  function triggerLogoutAlerts() {
    if (logoutAlertConfig.tabFlash) {
      flashTabTitle();
    }
    if (logoutAlertConfig.browserNotify) {
      showLogoutBrowserNotification();
    }
  }

  let state = {
    autoCrime: GM_getValue('autoCrime', false),
    autoGTA: GM_getValue('autoGTA', false),
    autoJail: GM_getValue('autoJail', false),
    autoBooze: GM_getValue('autoBooze', false),
    autoHealth: GM_getValue('autoHealth', false),
    autoGarage: GM_getValue('autoGarage', false),
    lastCrime: GM_getValue('lastCrime', 0),
    lastGTA: GM_getValue('lastGTA', 0),
    lastJail: GM_getValue('lastJail', 0),
    lastBooze: GM_getValue('lastBooze', 0),
    lastHealth: GM_getValue('lastHealth', 0),
    lastGarage: GM_getValue('lastGarage', 0),
    selectedCrimes: GM_getValue('selectedCrimes', []),
    selectedGTAs: GM_getValue('selectedGTAs', []),
    playerName: GM_getValue('playerName', ''),
    inJail: GM_getValue('inJail', false),
    panelCollapsed: {
      crime: GM_getValue('crimeCollapsed', false),
      gta: GM_getValue('gtaCollapsed', false),
      booze: GM_getValue('boozeCollapsed', false)
    },
    panelMinimized: GM_getValue('panelMinimized', false),
    isPerformingAction: false,
    lastJailCheck: GM_getValue('lastJailCheck', 0),
    currentAction: GM_getValue('currentAction', ''),
    needsRefresh: GM_getValue('needsRefresh', false),
    pendingAction: GM_getValue('pendingAction', ''),
    buyingHealth: GM_getValue('buyingHealth', false)
  };

  let automationPaused = false;

  function saveState() {
    GM_setValue('autoCrime', state.autoCrime);
    GM_setValue('autoGTA', state.autoGTA);
    GM_setValue('autoJail', state.autoJail);
    GM_setValue('autoBooze', state.autoBooze);
    GM_setValue('autoHealth', state.autoHealth);
    GM_setValue('autoGarage', state.autoGarage);
    GM_setValue('lastCrime', state.lastCrime);
    GM_setValue('lastGTA', state.lastGTA);
    GM_setValue('lastJail', state.lastJail);
    GM_setValue('lastBooze', state.lastBooze);
    GM_setValue('lastHealth', state.lastHealth);
    GM_setValue('lastGarage', state.lastGarage);
    GM_setValue('selectedCrimes', state.selectedCrimes);
    GM_setValue('selectedGTAs', state.selectedGTAs);
    GM_setValue('playerName', state.playerName);
    GM_setValue('inJail', state.inJail);
    GM_setValue('crimeCollapsed', state.panelCollapsed.crime);
    GM_setValue('gtaCollapsed', state.panelCollapsed.gta);
    GM_setValue('boozeCollapsed', state.panelCollapsed.booze);
    GM_setValue('panelMinimized', state.panelMinimized);
    GM_setValue('lastJailCheck', state.lastJailCheck);
    GM_setValue('currentAction', state.currentAction);
    GM_setValue('needsRefresh', state.needsRefresh);
    GM_setValue('pendingAction', state.pendingAction);
    GM_setValue('buyingHealth', state.buyingHealth);
  }

  // ---------------------------
  // Tab Manager - Prevents multiple tabs from conflicting
  // Single tab enforcement: Only one tab can run automation at a time
  // ---------------------------
  const LS_TAB_MASTER = "tmnMasterTab";
  const LS_TAB_HEARTBEAT = "tmnTabHeartbeat";
  const LS_SCRIPT_CHECK_ACTIVE = "tmnScriptCheckActive";
  const LS_TAB_LOCK = "tmnTabLock"; // Additional lock for atomic operations

  class TabManager {
    constructor() {
      this.tabId = this.generateTabId();
      this.heartbeatInterval = null;
      this.isMasterTab = false;
      this.HEARTBEAT_INTERVAL = 2000; // 2 seconds - more frequent heartbeat
      this.MASTER_TIMEOUT = 6000; // 6 seconds - faster takeover if master dies
      this.initialized = false;
    }

    generateTabId() {
      return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    checkMasterStatus() {
      const currentMaster = localStorage.getItem(LS_TAB_MASTER);
      const lastHeartbeat = parseInt(localStorage.getItem(LS_TAB_HEARTBEAT) || "0", 10);
      const now = Date.now();

      // Check if we are the current master
      if (currentMaster === this.tabId) {
        this.isMasterTab = true;
        // Update heartbeat
        localStorage.setItem(LS_TAB_HEARTBEAT, now.toString());
        return true;
      }

      // If no master or master hasn't sent heartbeat recently, try to become master
      if (!currentMaster || (now - lastHeartbeat) > this.MASTER_TIMEOUT) {
        // Use lock to prevent race condition when multiple tabs try to become master
        const lock = localStorage.getItem(LS_TAB_LOCK);
        if (!lock || (now - parseInt(lock, 10)) > 1000) {
          localStorage.setItem(LS_TAB_LOCK, now.toString());
          // Double-check after setting lock
          setTimeout(() => {
            const stillNoMaster = !localStorage.getItem(LS_TAB_MASTER) ||
              (Date.now() - parseInt(localStorage.getItem(LS_TAB_HEARTBEAT) || "0", 10)) > this.MASTER_TIMEOUT;
            if (stillNoMaster) {
              this.becomeMaster();
            }
          }, 100);
        }
        return this.isMasterTab;
      }

      // Another tab is master
      this.isMasterTab = false;
      return false;
    }

    becomeMaster() {
      this.isMasterTab = true;
      localStorage.setItem(LS_TAB_MASTER, this.tabId);
      localStorage.setItem(LS_TAB_HEARTBEAT, Date.now().toString());
      console.log(`[TMN] Tab ${this.tabId.substr(0, 12)}... became master`);
      this.startHeartbeat();
    }

    startHeartbeat() {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }

      this.heartbeatInterval = setInterval(() => {
        if (this.isMasterTab) {
          const currentMaster = localStorage.getItem(LS_TAB_MASTER);
          // Verify we're still the master before updating heartbeat
          if (currentMaster === this.tabId) {
            localStorage.setItem(LS_TAB_HEARTBEAT, Date.now().toString());
          } else {
            console.log("[TMN] Lost master status, stopping heartbeat");
            this.stopHeartbeat();
            this.isMasterTab = false;
          }
        }
      }, this.HEARTBEAT_INTERVAL);
    }

    stopHeartbeat() {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
    }

    releaseMaster() {
      if (this.isMasterTab) {
        // Only clear if we're still the master
        const currentMaster = localStorage.getItem(LS_TAB_MASTER);
        if (currentMaster === this.tabId) {
          localStorage.removeItem(LS_TAB_MASTER);
          localStorage.removeItem(LS_TAB_HEARTBEAT);
        }
        this.stopHeartbeat();
        this.isMasterTab = false;
        console.log("[TMN] Released master tab status");
      }
    }

    // Force this tab to become master (used when user explicitly wants this tab active)
    forceMaster() {
      localStorage.setItem(LS_TAB_MASTER, this.tabId);
      localStorage.setItem(LS_TAB_HEARTBEAT, Date.now().toString());
      this.isMasterTab = true;
      this.startHeartbeat();
      console.log(`[TMN] Tab ${this.tabId.substr(0, 12)}... forced to become master`);
    }

    hasActiveMaster() {
      const currentMaster = localStorage.getItem(LS_TAB_MASTER);
      const lastHeartbeat = parseInt(localStorage.getItem(LS_TAB_HEARTBEAT) || "0", 10);
      const now = Date.now();

      return currentMaster &&
        currentMaster !== this.tabId &&
        (now - lastHeartbeat) <= this.MASTER_TIMEOUT;
    }

    getMasterTabId() {
      return localStorage.getItem(LS_TAB_MASTER);
    }
  }

  // Create tab manager instance
  const tabManager = new TabManager();

  // ---------------------------
  // Auto-Resume Script Check Configuration
  // ---------------------------
  const autoResumeConfig = {
    enabled: GM_getValue('autoResumeEnabled', true),
    lastScriptCheckTime: 0
  };

  function saveAutoResumeConfig() {
    GM_setValue('autoResumeEnabled', autoResumeConfig.enabled);
  }

  // ---------------------------
  // Stats Collection Configuration
  // ---------------------------
  const statsCollectionConfig = {
    enabled: GM_getValue('statsCollectionEnabled', true),
    interval: GM_getValue('statsCollectionInterval', 900), // 15 minutes default
    lastCollection: GM_getValue('lastStatsCollection', 0),
    cachedStats: GM_getValue('cachedGameStats', null)
  };

  function saveStatsCollectionConfig() {
    GM_setValue('statsCollectionEnabled', statsCollectionConfig.enabled);
    GM_setValue('statsCollectionInterval', statsCollectionConfig.interval);
    GM_setValue('lastStatsCollection', statsCollectionConfig.lastCollection);
    GM_setValue('cachedGameStats', statsCollectionConfig.cachedStats);
  }

  // ---------------------------
  // Enhanced Reset Function - Clears ALL stored values
  // ---------------------------
  function resetStorage() {
    if (confirm('Are you sure you want to reset ALL settings, timers, and efficiency data? This cannot be undone.')) {
      // Comprehensive list of ALL possible stored values
      const allKeys = [
        // State values
        'autoCrime', 'autoGTA', 'autoJail', 'autoBooze', 'lastCrime', 'lastGTA', 'lastJail', 'lastBooze',
        'selectedCrimes', 'selectedGTAs', 'playerName', 'inJail', 'crimeCollapsed', 'gtaCollapsed',
        'boozeCollapsed', 'panelMinimized', 'lastJailCheck', 'currentAction', 'needsRefresh', 'pendingAction',

        // Config values
        'crimeInterval', 'gtaInterval', 'jailbreakInterval', 'jailCheckInterval', 'boozeInterval',
        'boozeBuyAmount', 'boozeSellAmount',

        // Action tracking
        'actionStartTime',

        // Efficiency tracking
        'efficiencyStartTime', 'efficiencyStartPercent', 'efficiencyStartMoney', 'efficiencyLastPercent', 'efficiencyLastMoney',

        // Auto-Resume Config
        'autoResumeEnabled',

        // Stats Collection Config
        'statsCollectionEnabled', 'statsCollectionInterval', 'lastStatsCollection', 'cachedGameStats',

        // Health threshold config
        'minHealthThreshold', 'targetHealth',

        // Cached display values
        'cachedDtmDisplay', 'cachedOcDisplay', 'cachedTravelDisplay', 'cachedHealthDisplay'
      ];

      // Clear localStorage tab manager keys
      localStorage.removeItem('tmnMasterTab');
      localStorage.removeItem('tmnTabHeartbeat');
      localStorage.removeItem('tmnScriptCheckActive');

      // Clear OC/DTM/Travel timer keys
      localStorage.removeItem('tmnDTMTimerStatus');
      localStorage.removeItem('tmnOCTimerStatus');
      localStorage.removeItem('tmnTravelTimerStatus');

      // Clear each value individually
      allKeys.forEach(key => GM_setValue(key, undefined));

      // Also try to clear any unexpected values by getting all known values and resetting them
      try {
        const knownValues = GM_getValue('knownValues', []);
        knownValues.forEach(key => GM_setValue(key, undefined));
        GM_setValue('knownValues', []);
      } catch (e) {
        console.log('No additional values to clear');
      }

      alert('ALL settings and data have been reset! Refreshing the page...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  }

  // Crime and GTA definitions
  const crimeOptions = [
    { id: 1, name: "Credit card fraud", element: "ctl00_main_btnCrime1" },
    { id: 2, name: "Rob gas station", element: "ctl00_main_btnCrime2" },
    { id: 3, name: "Sell illegal weapons", element: "ctl00_main_btnCrime3" },
    { id: 4, name: "Rob a store", element: "ctl00_main_btnCrime4" },
    { id: 5, name: "Rob a bank", element: "ctl00_main_btnCrime5" }
  ];

  const gtaOptions = [
    { id: 1, name: "Public parking lot", value: "1" },
    { id: 2, name: "Building parking lot", value: "2" },
    { id: 3, name: "Residential place", value: "3" },
    { id: 4, name: "Pick Pocket Keys", value: "4" },
    { id: 5, name: "Car jack from street", value: "5" }
  ];

  // ---------------------------
  // SIMPLIFIED Efficiency Tracking System
  // ---------------------------
  const efficiencyTracker = {
    // Initialize tracking when automation starts
    init() {
      const currentStats = this.parseStatusBar();
      if (currentStats) {
        // Only initialize if we haven't started tracking yet
        if (!GM_getValue('efficiencyStartTime')) {
          GM_setValue('efficiencyStartTime', Date.now());
          GM_setValue('efficiencyStartPercent', currentStats.rankPercent);
          GM_setValue('efficiencyStartMoney', currentStats.money);
          GM_setValue('efficiencyLastPercent', currentStats.rankPercent);
          GM_setValue('efficiencyLastMoney', currentStats.money);
          console.log('Efficiency tracking started:', currentStats.rankPercent.toFixed(2) + '%', '$' + currentStats.money);
        }
        return currentStats;
      }
      return null;
    },

    // Update tracking with current stats
    update() {
      const currentStats = this.parseStatusBar();
      if (currentStats) {
        const lastPercent = GM_getValue('efficiencyLastPercent', currentStats.rankPercent);
        const lastMoney = GM_getValue('efficiencyLastMoney', currentStats.money);

        // Only update if we have valid progress (not a rank-up reset)
        if (currentStats.rankPercent >= lastPercent ||
            (lastPercent > 99 && currentStats.rankPercent < 1)) { // Allow rank-up from 99.99% to 0.00%
          GM_setValue('efficiencyLastPercent', currentStats.rankPercent);
          GM_setValue('efficiencyLastMoney', currentStats.money);
        }

        return currentStats;
      }
      return null;
    },

    // Calculate current efficiency rates
    getEfficiency() {
      const startTime = GM_getValue('efficiencyStartTime');
      const startPercent = GM_getValue('efficiencyStartPercent');
      const startMoney = GM_getValue('efficiencyStartMoney');
      const currentPercent = GM_getValue('efficiencyLastPercent', startPercent);
      const currentMoney = GM_getValue('efficiencyLastMoney', startMoney);

      if (!startTime || startPercent === undefined) {
        return null;
      }

      const timeDiff = (Date.now() - startTime) / (1000 * 60); // minutes
      const timeDiffHours = timeDiff / 60; // hours

      // Calculate total gains
      let percentGain = currentPercent - startPercent;

      // Handle rank-ups (going from high % to low %)
      if (percentGain < -50) { // If we lost more than 50%, it's probably a rank-up
        percentGain = (100 - startPercent) + currentPercent; // Complete old rank + start new rank
      }

      const moneyGain = currentMoney - startMoney;

      // Calculate rates
      const percentPerMin = timeDiff > 0 ? percentGain / timeDiff : 0;
      const percentPerHour = timeDiffHours > 0 ? percentGain / timeDiffHours : 0;
      const moneyPerMin = timeDiff > 0 ? moneyGain / timeDiff : 0;
      const moneyPerHour = timeDiffHours > 0 ? moneyGain / timeDiffHours : 0;

      return {
        // Current rates
        percentPerMin: Math.max(0, percentPerMin),
        percentPerHour: Math.max(0, percentPerHour),
        moneyPerMin: moneyPerMin,
        moneyPerHour: moneyPerHour,

        // Totals since tracking started
        totalPercentGain: parseFloat(percentGain.toFixed(2)),
        totalMoneyGain: moneyGain,
        totalTimeMinutes: parseFloat(timeDiff.toFixed(1)),
        totalTimeHours: parseFloat(timeDiffHours.toFixed(2))
      };
    },

    // Reset efficiency tracking
    reset() {
      const currentStats = this.parseStatusBar();
      if (currentStats) {
        GM_setValue('efficiencyStartTime', Date.now());
        GM_setValue('efficiencyStartPercent', currentStats.rankPercent);
        GM_setValue('efficiencyStartMoney', currentStats.money);
        GM_setValue('efficiencyLastPercent', currentStats.rankPercent);
        GM_setValue('efficiencyLastMoney', currentStats.money);
        return true;
      }
      return false;
    },

    parseStatusBar() {
      const stats = {
        city: '',
        rank: '',
        rankPercent: 0,
        network: '',
        money: 0,
        health: 0,
        fmj: 0,
        jhp: 0,
        credits: 0,
        updateTime: '',
        timestamp: Date.now()
      };

      try {
        // Get city
        const cityEl = document.getElementById('ctl00_userInfo_lblcity');
        if (cityEl) stats.city = cityEl.textContent.trim();

        // Get rank
        const rankEl = document.getElementById('ctl00_userInfo_lblrank');
        if (rankEl) stats.rank = rankEl.textContent.trim();

        // Get rank percentage - FIXED PARSING for decimal values
        const rankPercEl = document.getElementById('ctl00_userInfo_lblRankbarPerc');
        if (rankPercEl) {
          const percText = rankPercEl.textContent.trim();

          // Handle formats like: (69.45%) or (69,45%) or (25%)
          const match = percText.match(/\(([\d]+)[.,]?(\d+)?%\)/);
          if (match) {
            const wholePart = match[1];
            const decimalPart = match[2] || '00'; // Default to 00 if no decimal
            // Properly handle decimal: "69" + "." + "45" = 69.45 (not 6945!)
            stats.rankPercent = parseFloat(wholePart + '.' + decimalPart);
          } else {
            // Fallback: try to extract any number with decimal
            const fallbackMatch = percText.match(/([\d]+[.,][\d]+)%/);
            if (fallbackMatch) {
              stats.rankPercent = parseFloat(fallbackMatch[1].replace(',', '.'));
            }
          }
        }

        // Get money
        const moneyEl = document.getElementById('ctl00_userInfo_lblcash');
        if (moneyEl) {
          const moneyText = moneyEl.textContent.trim().replace(/[$,]/g, '');
          stats.money = parseInt(moneyText) || 0;
        }

        // Get health
        const healthEl = document.getElementById('ctl00_userInfo_lblhealth');
        if (healthEl) {
          const healthText = healthEl.textContent.trim().replace('%', '');
          stats.health = parseInt(healthText) || 0;
        }

        // Get other stats
        const networkEl = document.getElementById('ctl00_userInfo_lblnetwork');
        if (networkEl) stats.network = networkEl.textContent.trim();

        const fmjEl = document.getElementById('ctl00_userInfo_lblfmj');
        if (fmjEl) stats.fmj = parseInt(fmjEl.textContent.trim()) || 0;

        const jhpEl = document.getElementById('ctl00_userInfo_lbljhp');
        if (jhpEl) stats.jhp = parseInt(jhpEl.textContent.trim()) || 0;

        const creditsEl = document.getElementById('ctl00_userInfo_lblcredits');
        if (creditsEl) stats.credits = parseInt(creditsEl.textContent.trim()) || 0;

        const updateTimeEl = document.getElementById('ctl00_userInfo_lblUpdateTime');
        if (updateTimeEl) stats.updateTime = updateTimeEl.textContent.trim();

      } catch (e) {
        console.warn('Error parsing status bar:', e);
        return null;
      }

      return stats;
    }
  };

  // ---------------------------
  // Helper Functions
  // ---------------------------
  let shadowRoot = null;

  function updateStatus(msg) {
    if (shadowRoot) {
      const el = shadowRoot.querySelector("#tmn-status");
      const jailIcon = state.inJail ? "🔒" : "✅";

      const pendingInfo = state.pendingAction ? `<br>Pending: ${state.pendingAction}` : '';
      const fullStatus = `Status: ${escapeHtml(msg)}<br>Player: ${escapeHtml(state.playerName)}<br>Jail: ${jailIcon}${pendingInfo}<br>Last Crime: ${formatTime(state.lastCrime)}<br>Last GTA: ${formatTime(state.lastGTA)}<br>Last Booze: ${formatTime(state.lastBooze)}`;

      if (el) el.innerHTML = fullStatus;
    }
    console.log('[TMN Auto]', msg);
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

// ---------------------------
  // Telegram Functions (COMPLETE)
  // ---------------------------

  function sendTelegramMessage(message) {
    console.log('[Telegram] Attempting to send message...');

    if (!telegramConfig.enabled) {
      console.log('[Telegram] Notifications are disabled in settings');
      return;
    }

    if (!telegramConfig.botToken || !telegramConfig.chatId) {
      console.error('[Telegram] Bot Token or Chat ID is missing!');
      return;
    }

    const url = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;

    GM_xmlhttpRequest({
      method: 'POST',
      url: url,
      headers: {
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        chat_id: telegramConfig.chatId,
        text: message,
        parse_mode: 'HTML'
      }),
      onload: function(response) {
        if (response.status === 200) {
          console.log('[Telegram] âœ“ Message sent successfully!');
        } else {
          console.error('[Telegram] âœ— Failed to send message:', response.status);
          console.error('[Telegram] Response:', response.responseText);
        }
      },
      onerror: function(error) {
        console.error('[Telegram] âœ— Network error:', error);
      }
    });
  }

  function testTelegramConnection() {
    if (!telegramConfig.botToken || !telegramConfig.chatId) {
      alert('Please configure both Bot Token and Chat ID first!');
      return;
    }

    sendTelegramMessage('🎮 <b>TMN 2010 Automation</b>\n\nTelegram notifications are working!\n\nYou will receive alerts for:\n• Script checks (captcha)\n• New messages\n• SQL script checks\n• Logout/timeout\n• Low health alerts');
    alert('Test message sent! Check console (F12) and your Telegram.');
  }

  // Health alert tracking
  let lastHealthAlertTime = 0;
  const HEALTH_ALERT_INTERVAL = 10000; // 10 seconds between alerts

  function checkForLowHealth() {
    if (!telegramConfig.enabled) return false;

    const health = getHealthPercent();
    const now = Date.now();

    // Check if health is below threshold
    if (health < config.minHealthThreshold) {
      // Only send alert every 10 seconds
      if (now - lastHealthAlertTime >= HEALTH_ALERT_INTERVAL) {
        lastHealthAlertTime = now;

        console.log(`[Telegram] Low health detected: ${health}%`);

        sendTelegramMessage(
          '🏥 <b>LOW HEALTH ALERT!</b>\n\n' +
          `Player: ${state.playerName || 'Unknown'}\n` +
          `Current Health: <b>${health}%</b>\n` +
          `Threshold: ${config.minHealthThreshold}%\n` +
          `Time: ${new Date().toLocaleString()}\n\n` +
          (state.autoHealth ?
            '💊 Auto-buy is ON - attempting to restore health' :
            '⚠️ Auto-buy is OFF - scripts may stop!')
        );

        console.log('[Telegram] Low health alert sent');
        return true;
      }
    } else {
      // Reset alert timer when health is OK
      lastHealthAlertTime = 0;
    }

    return false;
  }

  let captchaNotificationSent = false;

  function checkForCaptcha() {
    if (!telegramConfig.enabled || !telegramConfig.notifyCaptcha) {
      return false;
    }

    if (isOnCaptchaPage()) {
      if (!captchaNotificationSent) {
        console.log('[Telegram] Captcha detected! Sending notification...');

        sendTelegramMessage(
          '⚠️ <b>Script Check Required!</b>\n\n' +
          `Player: ${state.playerName || 'Unknown'}\n` +
          `Time: ${new Date().toLocaleString()}\n\n` +
          '🛑 All automation is PAUSED\n' +
          '👉 Please complete the captcha to resume'
        );

        captchaNotificationSent = true;
        console.log('[Telegram] Captcha notification sent');
      }
      return true;
    } else {
      captchaNotificationSent = false;
    }

    return false;
  }

  let lastMessageCount = 0;

  function checkForNewMessages() {
    if (!telegramConfig.enabled || !telegramConfig.notifyMessages) {
      return false;
    }

    const now = Date.now();

    let hasNewMessage = false;
    let messageCount = 0;

    // Method 1: Check the message span element (MOST RELIABLE)
    const msgSpan = document.querySelector('span[id*="imgMessages"]');
    if (msgSpan) {
      const titleAttr = msgSpan.getAttribute('title');
      const classAttr = msgSpan.getAttribute('class');

      // Get count from title attribute
      if (titleAttr && titleAttr !== '0') {
        messageCount = parseInt(titleAttr) || 0;
        if (messageCount > 0) {
          hasNewMessage = true;
          console.log('[Telegram] Detected messages from span title:', messageCount);
        }
      }

      // Also check class for message indicator (message1, message2, etc.)
      if (!hasNewMessage && classAttr) {
        const classMatch = classAttr.match(/message(\d+)/);
        if (classMatch) {
          messageCount = parseInt(classMatch[1]) || 1;
          hasNewMessage = true;
          console.log('[Telegram] Detected messages from span class:', messageCount);
        }
      }
    }

    // Method 2: Check page title for "X new mails"
    if (!hasNewMessage) {
      const pageTitle = document.title;
      const titleMatch = pageTitle.match(/(\d+)\s+new\s+mails?/i);
      if (titleMatch) {
        hasNewMessage = true;
        messageCount = parseInt(titleMatch[1]);
        console.log('[Telegram] Detected messages from page title:', messageCount);
      }
    }

    // Method 3: Check for the new_message_1.gif image
    if (!hasNewMessage) {
      const newMessageImg = document.querySelector('img[src*="new_message_1.gif"]');
      if (newMessageImg) {
        hasNewMessage = true;
        messageCount = 1;
        console.log('[Telegram] Detected new message icon');
      }
    }

    // Only send notification if message count INCREASED (new messages arrived)
    if (hasNewMessage && messageCount > lastMessageCount) {
      // Check cooldown only after confirming new messages
      if (now - telegramConfig.lastMessageCheck < telegramConfig.messageCheckInterval * 1000) {
        console.log('[Telegram] New messages detected but on cooldown');
        return false;
      }

      const newMessageCount = messageCount - lastMessageCount;
      console.log('[Telegram] NEW messages arrived! Previous:', lastMessageCount, 'Current:', messageCount, 'New:', newMessageCount);

      telegramConfig.lastMessageCheck = now;
      saveTelegramConfig();
      lastMessageCount = messageCount;

      const messageText = newMessageCount > 1
        ? `You have ${newMessageCount} new messages!`
        : 'You have a new message!';

      sendTelegramMessage(
        '📬 <b>New Message Alert!</b>\n\n' +
        `Player: ${state.playerName || 'Unknown'}\n` +
        `Time: ${new Date().toLocaleString()}\n` +
        messageText + '\n' +
        `Total unread: ${messageCount}\n\n` +
        '🔗 Check your mailbox at TMN2010'
      );

      console.log('[Telegram] New message notification sent');
      return true;
    } else if (hasNewMessage) {
      // Update count but don't send notification (messages already seen)
      lastMessageCount = messageCount;
    } else {
      // No messages - reset counter
      lastMessageCount = 0;
    }

    return false;
  }

  let sqlCheckNotificationSent = false;

  function checkForSqlScriptCheck() {
    if (!telegramConfig.enabled || !telegramConfig.notifySqlCheck) {
      return false;
    }

    // Method 1: Check for "Important message" div
    const importantMsgDiv = document.querySelector('div.NewGridTitle');
    const hasImportantMessage = importantMsgDiv && importantMsgDiv.textContent.includes('Important message');

    // Method 2: Check page content for SQL script check indicators
    const pageText = document.body.textContent;
    const hasSqlCheck = pageText.includes('SQL Script Check') ||
                        pageText.includes('SQL what your favourite') ||
                        pageText.includes('tell SQL what');

    if ((hasImportantMessage || hasSqlCheck) && !sqlCheckNotificationSent) {
      console.log('[Telegram] SQL Script Check detected! Sending notification...');

      // Try to extract the question
      let question = 'Please answer the admin question';
      const paragraphs = document.querySelectorAll('p, div');
      for (let p of paragraphs) {
        const text = p.textContent;
        if (text.includes('SQL') && text.includes('?')) {
          question = text.trim();
          break;
        }
      }

      sendTelegramMessage(

        '❗ <b>SQL SCRIPT CHECK!</b>\n\n' +
        `Player: ${state.playerName || 'Unknown'}\n` +
        `Time: ${new Date().toLocaleString()}\n\n` +
        '🛑 Admin SQL needs a response!\n' +
        `Question: ${question}\n\n` +
        '👉 Please answer the question to continue'
      );

      sqlCheckNotificationSent = true;
      console.log('[Telegram] SQL script check notification sent');
      return true;
    } else if (!hasImportantMessage && !hasSqlCheck) {
      // Reset flag when no longer on SQL check page
      sqlCheckNotificationSent = false;
    }

    return false;
  }

let logoutNotificationSent = false;

  function checkForLogout() {
    if (!telegramConfig.enabled || !telegramConfig.notifyLogout) {
      return false;
    }

    const currentUrl = window.location.href.toLowerCase();

    // ONLY trigger on actual login page, not authenticated pages
    const isLoginPage = currentUrl.includes('login.aspx');

    // Must be on login.aspx to proceed
    if (!isLoginPage) {
      // Reset flag when on authenticated pages
      if (currentUrl.includes('/authenticated/')) {
        logoutNotificationSent = false;
        // Stop tab flash if we've logged back in
        stopFlashTabTitle();
      }
      return false;
    }

    // Now we're definitely on login.aspx - check if it's auto logout
    const isAutoLogout = currentUrl.includes('act=out') || currentUrl.includes('auto=true');

    // Double-check with login form elements
    const hasLoginForm = document.querySelector('input[name="ctl00$main$txtUsername"]') !== null ||
                         document.querySelector('input[type="password"]') !== null ||
                         document.querySelector('input[value="Login"]') !== null;

    if (hasLoginForm && !logoutNotificationSent) {
      console.log('[Telegram] ACTUAL Logout/Login page detected! Sending notification...');
      console.log('[Telegram] URL:', currentUrl);
      console.log('[Telegram] Is auto logout:', isAutoLogout);

      const logoutType = isAutoLogout ? 'AUTO LOGOUT' : 'LOGOUT';
      const reason = isAutoLogout ?
        'You have been automatically logged out (session timeout)' :
        'You have been logged out';

      sendTelegramMessage(
        `🚪 <b>${logoutType} DETECTED!</b>\n\n` +
        `Player: ${state.playerName || 'Unknown'}\n` +
        `Time: ${new Date().toLocaleString()}\n\n` +
        reason + '\n\n' +
        '🔑 Please log back in to resume automation'
      );

      // Trigger tab flash and browser notifications
      triggerLogoutAlerts();

      logoutNotificationSent = true;
      console.log('[Telegram] Logout notification sent');
      return true;
    }

    return false;
  }

  // END OF TELEGRAM FUNCTIONS

  // ---------------------------
  // Auto-Resume Script Check Functions
  // ---------------------------
  let scriptCheckMonitorActive = false;
  let scriptCheckSubmitAttempted = false;

  function startScriptCheckMonitor() {
    if (!autoResumeConfig.enabled || scriptCheckMonitorActive) return;

    scriptCheckMonitorActive = true;
    scriptCheckSubmitAttempted = false;
    console.log('[TMN] Starting script check monitor for auto-resume...');

    const monitor = setInterval(() => {
      // Check if we're still on script check page
      if (!isOnCaptchaPage()) {
        console.log('[TMN] Script check page cleared - resuming automation');
        clearInterval(monitor);
        scriptCheckMonitorActive = false;
        localStorage.removeItem(LS_SCRIPT_CHECK_ACTIVE);

        // Resume automation
        automationPaused = false;
        updateStatus('Script check completed - automation resumed');
        return;
      }

      // Check if captcha is completed
      const captchaResponse = document.querySelector('textarea[name="g-recaptcha-response"]');
      const token = captchaResponse?.value?.trim();

      if (token && token.length > 0 && !scriptCheckSubmitAttempted) {
        console.log('[TMN] Captcha completed - auto-submitting...');
        scriptCheckSubmitAttempted = true;

        // Find and click submit button
        const submitBtn = document.querySelector('#ctl00_main_MyScriptTest_btnSubmit') ||
                          document.querySelector('#ctl00_main_btnVerify') ||
                          document.querySelector('input[type="submit"], button[type="submit"]') ||
                          Array.from(document.querySelectorAll('input, button')).find(b =>
                            b.value?.toLowerCase().includes('verify') ||
                            b.value?.toLowerCase().includes('submit') ||
                            b.textContent?.toLowerCase().includes('verify') ||
                            b.textContent?.toLowerCase().includes('submit')
                          );

        if (submitBtn && !submitBtn.disabled) {
          setTimeout(() => {
            submitBtn.click();
            console.log('[TMN] Script check form auto-submitted');
          }, 3000 + Math.random() * 2000);
        }
      }
    }, 1500);

    // Timeout after 10 minutes
    setTimeout(() => {
      if (scriptCheckMonitorActive) {
        console.log('[TMN] Script check monitor timeout');
        clearInterval(monitor);
        scriptCheckMonitorActive = false;
      }
    }, 600000);
  }

  // ---------------------------
  // Stats Collection Functions
  // ---------------------------
  const STATS_URL = '/authenticated/statistics.aspx?p=p';

  function shouldCollectStats() {
    if (!statsCollectionConfig.enabled) return false;
    if (state.inJail || state.isPerformingAction || automationPaused) return false;

    const now = Date.now();
    const timeSinceLastCollection = now - statsCollectionConfig.lastCollection;
    return timeSinceLastCollection >= statsCollectionConfig.interval * 1000;
  }

  function parseStatisticsPage() {
    const stats = {
      timestamp: Date.now(),
      crimes: {},
      gta: {},
      booze: {},
      general: {}
    };

    try {
      // Parse crimes statistics
      const crimeTable = document.querySelector('#ctl00_main_gvCrimes');
      if (crimeTable) {
        const rows = crimeTable.querySelectorAll('tr');
        rows.forEach((row, index) => {
          if (index === 0) return; // Skip header
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const crimeName = cells[0]?.textContent?.trim();
            const attempts = parseInt(cells[1]?.textContent?.trim()) || 0;
            const success = parseInt(cells[2]?.textContent?.trim()) || 0;
            if (crimeName) {
              stats.crimes[crimeName] = { attempts, success };
            }
          }
        });
      }

      // Parse GTA statistics
      const gtaTable = document.querySelector('#ctl00_main_gvGTA');
      if (gtaTable) {
        const rows = gtaTable.querySelectorAll('tr');
        rows.forEach((row, index) => {
          if (index === 0) return; // Skip header
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const gtaType = cells[0]?.textContent?.trim();
            const attempts = parseInt(cells[1]?.textContent?.trim()) || 0;
            const success = parseInt(cells[2]?.textContent?.trim()) || 0;
            if (gtaType) {
              stats.gta[gtaType] = { attempts, success };
            }
          }
        });
      }

      // Get general stats from status bar
      const currentStats = efficiencyTracker.parseStatusBar();
      if (currentStats) {
        stats.general = {
          rank: currentStats.rank,
          rankPercent: currentStats.rankPercent,
          money: currentStats.money,
          health: currentStats.health,
          city: currentStats.city,
          fmj: currentStats.fmj,
          jhp: currentStats.jhp,
          credits: currentStats.credits
        };
      }

      console.log('[TMN] Statistics parsed:', stats);
      return stats;
    } catch (e) {
      console.error('[TMN] Error parsing statistics page:', e);
      return null;
    }
  }

  async function collectStatistics() {
    if (!shouldCollectStats()) return false;

    const currentPage = getCurrentPage();

    // If we're on the stats page, parse and save
    if (window.location.pathname.toLowerCase().includes('statistics.aspx') &&
        window.location.search.toLowerCase().includes('p=p')) {
      const stats = parseStatisticsPage();
      if (stats) {
        statsCollectionConfig.cachedStats = stats;
        statsCollectionConfig.lastCollection = Date.now();
        saveStatsCollectionConfig();
        updateStatus('Statistics collected successfully');
        console.log('[TMN] Statistics cached');
        return true;
      }
    }

    return false;
  }

  function getCachedStats() {
    return statsCollectionConfig.cachedStats;
  }

  // ---------------------------
  // DTM & OC Timer System
  // ---------------------------
  const DTM_URL = '/authenticated/organizedcrime.aspx?p=dtm';
  const OC_URL = '/authenticated/organizedcrime.aspx';

  // Fetch DTM timer data from DTM page
  async function fetchDTMTimerData() {
    try {
      const fullURL = `${window.location.origin}${DTM_URL}&_=${Date.now()}`;
      console.log('[TMN] Fetching DTM timer data...');

      const response = await fetch(fullURL, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        credentials: 'same-origin'
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Check for DTM cooldown message
      const msgElement = doc.querySelector('#ctl00_lblMsg');
      if (msgElement) {
        const msgText = msgElement.textContent || "";
        const cooldownMatch = msgText.match(/You cannot do a DTM at this moment, you have to wait (\d+) hours? (\d+) minutes? and (\d+) seconds?/i);

        if (cooldownMatch) {
          const hours = parseInt(cooldownMatch[1], 10) || 0;
          const minutes = parseInt(cooldownMatch[2], 10) || 0;
          const seconds = parseInt(cooldownMatch[3], 10) || 0;
          const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;

          return {
            canDTM: false,
            hours, minutes, seconds, totalSeconds,
            message: msgText.trim(),
            lastUpdate: Date.now()
          };
        }
      }

      // Check if DTM is available
      const dtmStartDiv = doc.querySelector('.NewGridTitle');
      if (dtmStartDiv && dtmStartDiv.textContent.includes('Start a Drugs Transportation Mission')) {
        return {
          canDTM: true,
          hours: 0, minutes: 0, seconds: 0, totalSeconds: 0,
          message: "Available",
          lastUpdate: Date.now()
        };
      }

      return null;
    } catch (err) {
      console.error('[TMN] Error fetching DTM timer:', err);
      return null;
    }
  }

  // Fetch OC timer data from OC page
  async function fetchOCTimerData() {
    try {
      const fullURL = `${window.location.origin}${OC_URL}?_=${Date.now()}`;
      console.log('[TMN] Fetching OC timer data...');

      const response = await fetch(fullURL, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        credentials: 'same-origin'
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Check for OC cooldown message
      const msgElement = doc.querySelector('#ctl00_lblMsg');
      if (msgElement) {
        const msgText = msgElement.textContent || "";
        const cooldownMatch = msgText.match(/You cannot do an Organized Crime at this moment, you have to wait (\d+) hours? (\d+) minutes? and (\d+) seconds?/i);

        if (cooldownMatch) {
          const hours = parseInt(cooldownMatch[1], 10) || 0;
          const minutes = parseInt(cooldownMatch[2], 10) || 0;
          const seconds = parseInt(cooldownMatch[3], 10) || 0;
          const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;

          return {
            canOC: false,
            hours, minutes, seconds, totalSeconds,
            message: msgText.trim(),
            lastUpdate: Date.now()
          };
        }
      }

      // Check if OC is available
      const ocStartDiv = doc.querySelector('.NewGridTitle');
      if (ocStartDiv && ocStartDiv.textContent.includes('Start an Organized Crime')) {
        return {
          canOC: true,
          hours: 0, minutes: 0, seconds: 0, totalSeconds: 0,
          message: "Available",
          lastUpdate: Date.now()
        };
      }

      return null;
    } catch (err) {
      console.error('[TMN] Error fetching OC timer:', err);
      return null;
    }
  }

  // Store timer data with expiry calculation
  function storeDTMTimerData(timerData) {
    if (!timerData) return;
    const dtmTimerStatus = {
      ...timerData,
      fetchTime: Date.now(),
      expiresAt: Date.now() + (timerData.totalSeconds * 1000)
    };
    localStorage.setItem('tmnDTMTimerStatus', JSON.stringify(dtmTimerStatus));
  }

  function storeOCTimerData(timerData) {
    if (!timerData) return;
    const ocTimerStatus = {
      ...timerData,
      fetchTime: Date.now(),
      expiresAt: Date.now() + (timerData.totalSeconds * 1000)
    };
    localStorage.setItem('tmnOCTimerStatus', JSON.stringify(ocTimerStatus));
  }

  // Get current timer status with real-time countdown
  function getDTMTimerStatus() {
    const stored = localStorage.getItem('tmnDTMTimerStatus');
    if (!stored) return null;

    try {
      const timerData = JSON.parse(stored);
      const now = Date.now();
      const remainingMs = Math.max(0, timerData.expiresAt - now);
      const remainingSeconds = Math.floor(remainingMs / 1000);

      if (remainingSeconds <= 0) {
        return { canDTM: true, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, message: "Available" };
      }

      return {
        canDTM: false,
        hours: Math.floor(remainingSeconds / 3600),
        minutes: Math.floor((remainingSeconds % 3600) / 60),
        seconds: remainingSeconds % 60,
        totalSeconds: remainingSeconds
      };
    } catch (e) {
      return null;
    }
  }

  function getOCTimerStatus() {
    const stored = localStorage.getItem('tmnOCTimerStatus');
    if (!stored) return null;

    try {
      const timerData = JSON.parse(stored);
      const now = Date.now();
      const remainingMs = Math.max(0, timerData.expiresAt - now);
      const remainingSeconds = Math.floor(remainingMs / 1000);

      if (remainingSeconds <= 0) {
        return { canOC: true, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, message: "Available" };
      }

      return {
        canOC: false,
        hours: Math.floor(remainingSeconds / 3600),
        minutes: Math.floor((remainingSeconds % 3600) / 60),
        seconds: remainingSeconds % 60,
        totalSeconds: remainingSeconds
      };
    } catch (e) {
      return null;
    }
  }

  // Format timer display with color indicator
  function formatTimerDisplay(timerStatus, readyKey) {
    if (!timerStatus) return { text: "Unknown", color: "gray", ready: false };

    const isReady = timerStatus[readyKey];
    if (isReady || timerStatus.totalSeconds <= 0) {
      return { text: "Available", color: "green", ready: true };
    }

    const { hours, minutes } = timerStatus;
    let text;
    if (hours > 0) {
      text = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    } else if (minutes > 0) {
      text = `${minutes}m`;
    } else {
      text = "< 1m";
    }

    return { text, color: "red", ready: false };
  }

  // Collect both timers
  async function collectOCDTMTimers() {
    if (state.inJail || automationPaused) return;

    try {
      const [dtmData, ocData] = await Promise.all([
        fetchDTMTimerData(),
        fetchOCTimerData()
      ]);

      if (dtmData) storeDTMTimerData(dtmData);
      if (ocData) storeOCTimerData(ocData);

      console.log('[TMN] OC/DTM timers collected');
      updateTimerDisplay();
    } catch (e) {
      console.error('[TMN] Error collecting OC/DTM timers:', e);
    }
  }

  // Timer refresh interval (every 60 seconds for fetching, every 5 seconds for display)
  let timerDisplayInterval = null;
  let timerFetchInterval = null;

  // Cached display values to prevent flickering - only update DOM when values change
  // These persist the last known values so we don't show "..." on every page load
  const cachedDisplayValues = {
    dtm: GM_getValue('cachedDtmDisplay', ''),
    oc: GM_getValue('cachedOcDisplay', ''),
    travel: GM_getValue('cachedTravelDisplay', ''),
    health: GM_getValue('cachedHealthDisplay', '')
  };

  // Cache element references to avoid repeated DOM queries
  let timerElements = {
    dtm: null,
    oc: null,
    travel: null,
    health: null
  };

  // Update timer display in UI - only updates DOM if value changed (prevents flicker)
  function updateTimerDisplay() {
    if (!shadowRoot) return;

    // Cache element references on first call
    if (!timerElements.dtm) {
      timerElements.dtm = shadowRoot.querySelector('#tmn-dtm-timer');
      timerElements.oc = shadowRoot.querySelector('#tmn-oc-timer');
      timerElements.travel = shadowRoot.querySelector('#tmn-travel-timer');
      timerElements.health = shadowRoot.querySelector('#tmn-health-monitor');
    }

    const dtmStatus = getDTMTimerStatus();
    const ocStatus = getOCTimerStatus();
    const travelStatus = getTravelTimerStatus();

    const dtmDisplay = formatTimerDisplay(dtmStatus, 'canDTM');
    const ocDisplay = formatTimerDisplay(ocStatus, 'canOC');
    const travelDisplay = formatTravelTimerDisplay(travelStatus);

    // Only update DOM if value changed to prevent flicker
    const newDtmHtml = `<span style="color:${dtmDisplay.color === 'green' ? '#10b981' : dtmDisplay.color === 'red' ? '#ef4444' : '#9ca3af'};">●</span> ${dtmDisplay.text}`;
    if (timerElements.dtm && cachedDisplayValues.dtm !== newDtmHtml) {
      cachedDisplayValues.dtm = newDtmHtml;
      GM_setValue('cachedDtmDisplay', newDtmHtml);
      timerElements.dtm.innerHTML = newDtmHtml;
    }

    const newOcHtml = `<span style="color:${ocDisplay.color === 'green' ? '#10b981' : ocDisplay.color === 'red' ? '#ef4444' : '#9ca3af'};">●</span> ${ocDisplay.text}`;
    if (timerElements.oc && cachedDisplayValues.oc !== newOcHtml) {
      cachedDisplayValues.oc = newOcHtml;
      GM_setValue('cachedOcDisplay', newOcHtml);
      timerElements.oc.innerHTML = newOcHtml;
    }

    const travelColor = travelDisplay.color === 'green' ? '#10b981' : travelDisplay.color === 'amber' ? '#f59e0b' : travelDisplay.color === 'red' ? '#ef4444' : '#9ca3af';
    const newTravelHtml = `<span style="color:${travelColor};">●</span> ${travelDisplay.text}`;
    if (timerElements.travel && cachedDisplayValues.travel !== newTravelHtml) {
      cachedDisplayValues.travel = newTravelHtml;
      GM_setValue('cachedTravelDisplay', newTravelHtml);
      timerElements.travel.innerHTML = newTravelHtml;
    }

    // Also update health display
    updateHealthDisplay();
  }

  function startTimerUpdates() {
    // Immediately restore cached values to prevent flash of "..."
    if (shadowRoot) {
      const dtmEl = shadowRoot.querySelector('#tmn-dtm-timer');
      const ocEl = shadowRoot.querySelector('#tmn-oc-timer');
      const travelEl = shadowRoot.querySelector('#tmn-travel-timer');
      const healthEl = shadowRoot.querySelector('#tmn-health-monitor');

      if (dtmEl && cachedDisplayValues.dtm) dtmEl.innerHTML = cachedDisplayValues.dtm;
      if (ocEl && cachedDisplayValues.oc) ocEl.innerHTML = cachedDisplayValues.oc;
      if (travelEl && cachedDisplayValues.travel) travelEl.innerHTML = cachedDisplayValues.travel;
      if (healthEl && cachedDisplayValues.health) healthEl.innerHTML = cachedDisplayValues.health;
    }

    // Update display every 5 seconds (not every second - reduces flicker)
    if (!timerDisplayInterval) {
      timerDisplayInterval = setInterval(updateTimerDisplay, 5000);
    }

    // Fetch new data every 60 seconds
    if (!timerFetchInterval) {
      timerFetchInterval = setInterval(() => {
        if (!state.inJail && !automationPaused && !state.isPerformingAction) {
          collectOCDTMTimers();
          fetchTravelTimerData();
        }
      }, 60000); // 60 seconds
    }

    // Initial fetch after a short delay (always fetch to ensure fresh data)
    setTimeout(collectOCDTMTimers, 3000);
    setTimeout(fetchTravelTimerData, 4000);
  }

  // ---------------------------
  // Travel Timer System
  // ---------------------------
  const TRAVEL_COOLDOWN_NORMAL = 45 * 60; // 45 minutes in seconds
  const TRAVEL_COOLDOWN_JET = 20 * 60; // 20 minutes in seconds (private jet)
  const TRAVEL_URL = '/authenticated/travel.aspx';

  async function fetchTravelTimerData() {
    try {
      const fullURL = `${window.location.origin}${TRAVEL_URL}?_=${Date.now()}`;
      console.log('[TMN] Fetching travel timer data from travel page...');

      const response = await fetch(fullURL, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        credentials: 'same-origin'
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const allText = doc.body.textContent || "";
      console.log('[TMN] Searching for travel cooldown on travel page...');

      // Look for "X hours Y minutes and Z seconds before you can travel commercially"
      const cooldownMatch = allText.match(/(\d+)\s*hours?\s*(\d+)\s*minutes?\s*(?:and\s*)?(\d+)?\s*seconds?\s*before you can travel/i);

      if (cooldownMatch) {
        const hours = parseInt(cooldownMatch[1], 10) || 0;
        const minutes = parseInt(cooldownMatch[2], 10) || 0;
        const seconds = parseInt(cooldownMatch[3], 10) || 0;
        const totalSecondsRemaining = (hours * 3600) + (minutes * 60) + seconds;

        // Check if private jet is available
        const jetAvailable = allText.toLowerCase().includes('private jet') &&
                            (allText.toLowerCase().includes('now available') ||
                             allText.toLowerCase().includes('jet travel is now'));

        storeTravelTimerData({
          normalCooldownRemaining: totalSecondsRemaining,
          jetAvailable: jetAvailable,
          canTravelNormal: false,
          lastUpdate: Date.now()
        });

        console.log(`[TMN] Travel timer: ${hours}h ${minutes}m ${seconds}s until commercial, jet: ${jetAvailable ? 'available' : 'not available'}`);
        updateTimerDisplay();
        return;
      }

      // Check if can travel now (no cooldown message found, look for travel options)
      const canTravelNow = allText.toLowerCase().includes('select a destination') ||
                          allText.toLowerCase().includes('where would you like') ||
                          doc.querySelector('select[name*="city"]') !== null ||
                          doc.querySelector('input[value*="Travel"]') !== null;

      if (canTravelNow) {
        storeTravelTimerData({
          normalCooldownRemaining: 0,
          jetAvailable: true,
          canTravelNormal: true,
          lastUpdate: Date.now()
        });
        console.log('[TMN] Travel timer: Can travel now (no cooldown)');
        updateTimerDisplay();
        return;
      }

      console.log('[TMN] Travel status unclear - assuming can travel');
      storeTravelTimerData({
        normalCooldownRemaining: 0,
        jetAvailable: true,
        canTravelNormal: true,
        lastUpdate: Date.now()
      });
      updateTimerDisplay();

    } catch (err) {
      console.error('[TMN] Error fetching travel timer:', err);
    }
  }

  function storeTravelTimerData(timerData) {
    if (!timerData) return;
    const travelTimerStatus = {
      ...timerData,
      fetchTime: Date.now()
    };
    localStorage.setItem('tmnTravelTimerStatus', JSON.stringify(travelTimerStatus));
  }

  function getTravelTimerStatus() {
    const stored = localStorage.getItem('tmnTravelTimerStatus');
    if (!stored) return null;

    try {
      const timerData = JSON.parse(stored);
      const now = Date.now();
      const elapsedSinceCheck = Math.floor((now - timerData.fetchTime) / 1000);

      // Calculate remaining cooldown for plane (subtract elapsed time since we checked)
      const planeCooldownRemaining = Math.max(0, (timerData.normalCooldownRemaining || 0) - elapsedSinceCheck);

      // Calculate jet cooldown: jet is available 20 mins after travel, plane is 45 mins
      // If plane cooldown is X, time since travel = 45*60 - X
      // Jet available when time since travel >= 20*60, i.e. when X <= 25*60 = 1500 seconds
      // Time until jet = max(0, 20*60 - (45*60 - X)) = max(0, X - 25*60)
      const jetCooldownRemaining = Math.max(0, planeCooldownRemaining - (25 * 60));

      return {
        canTravelNormal: planeCooldownRemaining <= 0,
        canTravelJet: jetCooldownRemaining <= 0,
        planeCooldownRemaining: planeCooldownRemaining,
        jetCooldownRemaining: jetCooldownRemaining
      };
    } catch (e) {
      return null;
    }
  }

  function formatTravelTimerDisplay(travelStatus) {
    if (!travelStatus) return { text: "...", color: "gray" };

    // GREEN: Can travel by plane (45+ mins since last travel)
    if (travelStatus.canTravelNormal) {
      return { text: "Plane", color: "green" };
    }

    // AMBER: Can travel by jet (20-45 mins since last travel) - shows time until plane
    if (travelStatus.canTravelJet) {
      const mins = Math.ceil(travelStatus.planeCooldownRemaining / 60);
      return { text: `Jet (${mins}m)`, color: "amber" };
    }

    // RED: Can't travel at all (0-20 mins since last travel) - shows time until jet
    const mins = Math.ceil(travelStatus.jetCooldownRemaining / 60);
    return { text: `${mins}m`, color: "red" };
  }

  // ---------------------------
  // Health Monitor Functions
  // ---------------------------
  function getHealthColor(healthPercent) {
    if (healthPercent >= 100) return '#10b981'; // Green
    if (healthPercent > 60) return '#f59e0b'; // Amber
    return '#ef4444'; // Red
  }

  function updateHealthDisplay() {
    if (!shadowRoot) return;

    // Use cached element reference
    if (!timerElements.health) {
      timerElements.health = shadowRoot.querySelector('#tmn-health-monitor');
    }

    const currentStats = efficiencyTracker.parseStatusBar();

    if (timerElements.health && currentStats) {
      const health = currentStats.health || 0;
      const color = getHealthColor(health);
      const newHealthHtml = `<span style="color:${color};">●</span> ${health}%`;
      // Only update DOM if value changed to prevent flicker
      if (cachedDisplayValues.health !== newHealthHtml) {
        cachedDisplayValues.health = newHealthHtml;
        GM_setValue('cachedHealthDisplay', newHealthHtml);
        timerElements.health.innerHTML = newHealthHtml;
      }
    }
  }

  // Next function should be formatTime()
  function formatTime(timestamp) {
    if (!timestamp) return 'Never';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}m ${secs}s ago`;
  }

  function getCurrentPage() {
    const path = window.location.pathname.toLowerCase();
    const search = window.location.search.toLowerCase();

    if (path.includes('crimes.aspx')) {
      if (search.includes('p=g')) return 'gta';
      if (search.includes('p=b')) return 'booze';
      return 'crimes';
    }
    if (path.includes('jail.aspx')) return 'jail';
    if (path.includes('players.aspx')) return 'players';
    if (path.includes('resetscriptcounter.aspx')) return 'captcha';
    if (path.includes('playerproperty.aspx') && search.includes('p=g')) return 'garage';
    if (path.includes('credits.aspx')) return 'credits';
    return 'other';
  }

  function isOnCaptchaPage() {
    return getCurrentPage() === 'captcha' ||
      document.querySelector('.g-recaptcha') !== null ||
      document.querySelector('#ctl00_main_pnlVerify') !== null ||
      document.title.includes('Script Check') ||
      document.body.textContent.includes('Verify your actions') ||
      document.body.textContent.includes('complete the script test');
  }

  function getPlayerName() {
    if (getCurrentPage() !== 'players') {
      updateStatus("Getting player name...");
      window.location.href = '/authenticated/players.aspx?' + Date.now();
      return;
    }

    const TARGET_RGB = 'rgb(170, 0, 0)';
    const playerLinks = document.querySelectorAll('a[href*="profile.aspx"]');
    for (let link of playerLinks) {
      const computedColor = window.getComputedStyle(link).color;
      const inlineColor = link.style.color.toUpperCase();

      if (computedColor === TARGET_RGB ||
        inlineColor === '#AA0000' ||
        inlineColor === 'RED') {
        state.playerName = link.textContent.trim();
        saveState();
        updateStatus(`Player identified: ${state.playerName}`);
        return;
      }
    }

    const allElements = document.querySelectorAll('*');
    for (let element of allElements) {
      if (window.getComputedStyle(element).color === TARGET_RGB &&
        element.textContent.trim().length > 0 &&
        element.textContent.trim().length < 50) {

        state.playerName = element.textContent.trim();
        saveState();
        updateStatus(`Player identified: ${state.playerName}`);
        return;
      }
    }

    updateStatus("Could not identify player name");
  }

  // COMPLETELY REWRITTEN JAIL DETECTION
  function processJailPage() {
    if (getCurrentPage() !== 'jail') return;

    let inJail = false;

    // Method 1: Check if player name appears in jail table
    if (state.playerName) {
      const jailTable = document.querySelector('#ctl00_main_gvJail');
      if (jailTable) {
        const tableText = jailTable.textContent.toLowerCase();
        if (tableText.includes(state.playerName.toLowerCase())) {
          inJail = true;
          console.log('Jail detection: Player found in jail table');
        }
      }
    }

    // Method 2: Check for "You are in jail" text
    if (!inJail) {
      const pageText = document.body.textContent.toLowerCase();
      if (pageText.includes('you are in jail') || pageText.includes('you have been jailed')) {
        inJail = true;
        console.log('Jail detection: "You are in jail" text found');
      }
    }

    // Method 3: Check for release timer or bail options
    if (!inJail) {
      const releaseElements = document.querySelectorAll('*');
      for (let element of releaseElements) {
        const text = element.textContent.toLowerCase();
        if (text.includes('time remaining') || text.includes('bail amount') || text.includes('post bail')) {
          inJail = true;
          console.log('Jail detection: Release timer or bail options found');
          break;
        }
      }
    }

    // Method 4: Check if we can see jailbreak options but no break out options for ourselves
    if (!inJail) {
      const breakLinks = document.querySelectorAll('a[id*="btnBreak"]');
      const hasClickableBreaks = Array.from(breakLinks).some(link => {
        return !link.hasAttribute('disabled') && link.href && link.href.includes('javascript:');
      });

      // If there are breakable players but we're not seeing our own breakout option, we're probably jailed
      if (breakLinks.length > 0 && !hasClickableBreaks) {
        inJail = true;
        console.log('Jail detection: Break options exist but none for player');
      }
    }

    // Handle state transition
    const wasInJail = state.inJail;
    state.inJail = inJail;

    if (!wasInJail && inJail) {
      // Player just got jailed
      console.log('Player just got jailed!');
      if (state.currentAction && !state.pendingAction) {
        state.pendingAction = state.currentAction;
        updateStatus(`JAILED! Action interrupted: ${state.currentAction}. Will resume after release.`);
      }
      // CRITICAL: Reset action state immediately when jailed
      state.isPerformingAction = false;
      state.currentAction = '';
      state.needsRefresh = true;
      GM_setValue('actionStartTime', 0);
    } else if (wasInJail && !inJail) {
      // Player just got released
      console.log('Player just got released!');
      updateStatus(`Released from jail!${state.pendingAction ? ` Resuming: ${state.pendingAction}` : ''}`);
      state.needsRefresh = true;
    }

    saveState();

    if (state.inJail) {
      updateStatus(`${state.playerName} is IN JAIL - waiting for release${state.pendingAction ? ` (will resume ${state.pendingAction})` : ''}`);
    } else {
      updateStatus(`${state.playerName} is free - ready for actions`);
    }

    return inJail;
  }

  // Enhanced function to check jail state on ANY page
  function checkJailStateOnAnyPage() {
    const currentPage = getCurrentPage();

    // If we're on the jail page, use the full detection
    if (currentPage === 'jail') {
      return processJailPage();
    }

    // On other pages, look for jail indicators
    const pageText = document.body.textContent.toLowerCase();
    if (pageText.includes('you are in jail') || pageText.includes('you have been jailed')) {
      const wasInJail = state.inJail;
      state.inJail = true;

      if (!wasInJail) {
        console.log('Jail detected on non-jail page!');
        if (state.currentAction && !state.pendingAction) {
          state.pendingAction = state.currentAction;
        }
        state.isPerformingAction = false;
        state.currentAction = '';
        state.needsRefresh = true;
        GM_setValue('actionStartTime', 0);
        saveState();
        updateStatus(`JAILED on ${currentPage} page! Navigation interrupted.`);

        // Navigate to jail page to confirm
        setTimeout(() => {
          window.location.href = '/authenticated/jail.aspx?' + Date.now();
        }, 1000);
      }
      return true;
    }

    return state.inJail;
  }

  // ---------------------------
  // Safety Functions
  // ---------------------------
  function checkForNavigationInterruption() {
    if (state.isPerformingAction) {
      const actionStartTime = GM_getValue('actionStartTime', 0);
      const now = Date.now();

      if (now - actionStartTime > 15000) {
        updateStatus(`Resetting stuck action: ${state.currentAction}`);
        state.isPerformingAction = false;
        state.currentAction = '';
        state.needsRefresh = true;
        saveState();
        GM_setValue('actionStartTime', 0);
        return true;
      }
    }
    return false;
  }

  function safeNavigate(url) {
    // CRITICAL: Always check jail state before navigation
    if (state.inJail && !url.includes('jail.aspx')) {
      updateStatus("BLOCKED: Cannot navigate - player is in jail");
      return true;
    }

    if (state.isPerformingAction) {
      updateStatus("Completing current action before navigation...");
      setTimeout(() => {
        state.isPerformingAction = false;
        state.currentAction = '';
        state.needsRefresh = false;
        GM_setValue('actionStartTime', 0);
        saveState();
        window.location.href = url;
      }, 1000);
      return true;
    } else {
      window.location.href = url;
      return false;
    }
  }

  function completePendingAction(actionType) {
    if (state.pendingAction === actionType) {
      state.pendingAction = '';
      saveState();
    }
  }

  // ---------------------------
  // Automation Control Functions
  // ---------------------------
  function pauseAutomation() {
    automationPaused = true;
    updateStatus("Automation PAUSED - Settings modal open");
  }

  function resumeAutomation() {
    automationPaused = false;
    updateStatus("Automation RESUMED");
  }

  // ---------------------------
  // Main Action Functions (WITH JAIL CHECKS)
  // ---------------------------
  function doCrime() {
    // CRITICAL: Check jail state at the start of EVERY action
    if (state.inJail) {
      updateStatus("BLOCKED: Cannot commit crime while in jail");
      state.isPerformingAction = false;
      state.currentAction = '';
      return;
    }

    if (!state.autoCrime || state.isPerformingAction || automationPaused) return;

    const now = Date.now();
    if (now - state.lastCrime < config.crimeInterval * 1000) {
      const remaining = Math.ceil((config.crimeInterval * 1000 - (now - state.lastCrime)) / 1000);
      updateStatus(`Crime cooldown: ${remaining}s remaining`);
      return;
    }

    if (state.needsRefresh || getCurrentPage() !== 'crimes') {
      state.needsRefresh = false;
      saveState();
      updateStatus("Loading crimes page...");
      safeNavigate('/authenticated/crimes.aspx?' + Date.now());
      return;
    }

    state.isPerformingAction = true;
    state.currentAction = 'crime';
    GM_setValue('actionStartTime', now);
    updateStatus("Attempting crime...");

    let availableCrimes = [];

    if (state.selectedCrimes.length > 0) {
      availableCrimes = state.selectedCrimes.map(crimeId => {
        const crime = crimeOptions.find(c => c.id === crimeId);
        if (crime) {
          const btn = document.getElementById(crime.element);
          if (btn && !btn.disabled) {
            return btn;
          }
        }
        return null;
      }).filter(btn => btn !== null);
    } else {
      for (let i = 1; i <= 5; i++) {
        const btn = document.getElementById(`ctl00_main_btnCrime${i}`);
        if (btn && !btn.disabled) {
          availableCrimes.push(btn);
        }
      }
    }

    if (availableCrimes.length === 0) {
      updateStatus("No available crime buttons found");
      state.isPerformingAction = false;
      state.currentAction = '';
      GM_setValue('actionStartTime', 0);
      return;
    }

    const randomBtn = availableCrimes[Math.floor(Math.random() * availableCrimes.length)];
    randomBtn.click();

    state.lastCrime = now;
    state.needsRefresh = true;
    completePendingAction('crime');
    saveState();
    updateStatus("Crime attempted - will refresh page...");

    setTimeout(() => {
      state.isPerformingAction = false;
      state.currentAction = '';
      GM_setValue('actionStartTime', 0);
    }, 3000);
  }

  function doGTA() {
    // CRITICAL: Check jail state at the start of EVERY action
    if (state.inJail) {
      updateStatus("BLOCKED: Cannot do GTA while in jail");
      state.isPerformingAction = false;
      state.currentAction = '';
      return;
    }

    if (!state.autoGTA || state.isPerformingAction || automationPaused) return;

    const now = Date.now();
    if (now - state.lastGTA < config.gtaInterval * 1000) {
      const remaining = Math.ceil((config.gtaInterval * 1000 - (now - state.lastGTA)) / 1000);
      updateStatus(`GTA cooldown: ${remaining}s remaining`);
      return;
    }

    const currentPage = getCurrentPage();
    if (state.needsRefresh || currentPage !== 'gta') {
      state.needsRefresh = false;
      saveState();
      if (currentPage === 'gta') {
        updateStatus("Already on GTA page, proceeding...");
      } else {
        updateStatus("Loading GTA page...");
        safeNavigate('/authenticated/crimes.aspx?p=g&' + Date.now());
        return;
      }
    }

    state.isPerformingAction = true;
    state.currentAction = 'gta';
    GM_setValue('actionStartTime', now);
    updateStatus("Attempting GTA...");

    let availableGTAs = [];
    const radioButtons = document.querySelectorAll('input[name="ctl00$main$carslist"]');

    if (state.selectedGTAs.length > 0) {
      availableGTAs = state.selectedGTAs.map(gtaId => {
        const gta = gtaOptions.find(g => g.id === gtaId);
        if (gta) {
          return Array.from(radioButtons).find(radio => radio.value === gta.value);
        }
        return null;
      }).filter(radio => radio !== null);
    } else {
      availableGTAs = Array.from(radioButtons);
    }

    if (availableGTAs.length === 0) {
      updateStatus("No GTA options found - resetting action state");
      state.isPerformingAction = false;
      state.currentAction = '';
      state.needsRefresh = true;
      GM_setValue('actionStartTime', 0);
      saveState();
      return;
    }

    const randomRadio = availableGTAs[Math.floor(Math.random() * availableGTAs.length)];
    randomRadio.checked = true;

    const stealBtn = document.getElementById('ctl00_main_btnStealACar');
    if (!stealBtn) {
      updateStatus("Steal car button not found - resetting action state");
      state.isPerformingAction = false;
      state.currentAction = '';
      state.needsRefresh = true;
      GM_setValue('actionStartTime', 0);
      saveState();
      return;
    }

    stealBtn.click();

    state.lastGTA = now;
    state.needsRefresh = true;
    completePendingAction('gta');
    saveState();
    updateStatus("GTA attempted - will refresh page...");

    setTimeout(() => {
      state.isPerformingAction = false;
      state.currentAction = '';
      GM_setValue('actionStartTime', 0);
    }, 3000);
  }

  function doBooze() {
    // CRITICAL: Check jail state at the start of EVERY action
    if (state.inJail) {
      updateStatus("BLOCKED: Cannot do booze run while in jail");
      state.isPerformingAction = false;
      state.currentAction = '';
      return;
    }

    if (!state.autoBooze || state.isPerformingAction || automationPaused) return;

    const now = Date.now();
    if (now - state.lastBooze < config.boozeInterval * 1000) {
      const remaining = Math.ceil((config.boozeInterval * 1000 - (now - state.lastBooze)) / 1000);
      updateStatus(`Booze cooldown: ${remaining}s remaining`);
      return;
    }

    if (state.needsRefresh || getCurrentPage() !== 'booze') {
      state.needsRefresh = false;
      saveState();
      updateStatus("Loading booze page...");
      safeNavigate('/authenticated/crimes.aspx?p=b&' + Date.now());
      return;
    }

    state.isPerformingAction = true;
    state.currentAction = 'booze';
    GM_setValue('actionStartTime', now);
    updateStatus("Attempting booze transaction...");

    // First try to sell existing inventory
    const inventoryRows = Array.from(document.querySelectorAll('table tr')).filter(row => {
      const col3 = row.querySelector('td:nth-child(3)');
      if (!col3) return false;
      const inventory = col3.textContent.trim();
      return inventory && inventory !== '0' && !isNaN(inventory);
    });

    if (inventoryRows.length > 0) {
      // Has inventory - sell it using boozeSellAmount
      const row = inventoryRows[0];
      const sellInput = row.querySelector('input[id*="tbAmtSell"]');
      const sellBtn = row.querySelector('input[id*="btnSell"]');
      if (sellInput && sellBtn && !sellBtn.disabled) {
        const currentInventory = parseInt(row.querySelector('td:nth-child(3)').textContent.trim());
        const sellAmount = Math.min(config.boozeSellAmount, currentInventory);
        sellInput.value = sellAmount;
        updateStatus(`Selling ${sellAmount} booze units...`);
        sellBtn.click();

        state.lastBooze = now;
        state.needsRefresh = true;
        completePendingAction('booze');
        saveState();

        setTimeout(() => {
          state.isPerformingAction = false;
          state.currentAction = '';
          GM_setValue('actionStartTime', 0);
        }, 3000);
        return;
      }
    }

    // No inventory - try to buy using boozeBuyAmount
    const buyOptions = [];
    for (let i = 2; i <= 6; i++) {
      const input = document.getElementById(`ctl00_main_gvBooze_ctl0${i}_tbAmtBuy`);
      const btn = document.getElementById(`ctl00_main_gvBooze_ctl0${i}_btnBuy`);
      if (input && btn && !btn.disabled) {
        buyOptions.push({ input, btn, index: i });
      }
    }

    if (buyOptions.length > 0) {
      const choice = buyOptions[Math.floor(Math.random() * buyOptions.length)];
      choice.input.value = config.boozeBuyAmount;
      updateStatus(`Buying ${config.boozeBuyAmount} booze units...`);
      choice.btn.click();

      state.lastBooze = now;
      state.needsRefresh = true;
      completePendingAction('booze');
      saveState();

      setTimeout(() => {
        state.isPerformingAction = false;
        state.currentAction = '';
        GM_setValue('actionStartTime', 0);
      }, 3000);
    } else {
      updateStatus("No booze options available");
      state.isPerformingAction = false;
      state.currentAction = '';
      GM_setValue('actionStartTime', 0);
    }
  }

  function doJailbreak() {
    if (!state.autoJail || state.isPerformingAction || state.inJail || automationPaused) return;

    const now = Date.now();
    if (now - state.lastJail < config.jailbreakInterval * 1000) return;

    if (getCurrentPage() !== 'jail') {
      updateStatus("Navigating to jail page...");
      safeNavigate('/authenticated/jail.aspx?' + Date.now());
      return;
    }

    const breakLinks = document.querySelectorAll('a[id*="btnBreak"]');
    const availableLinks = Array.from(breakLinks).filter(link => {
      return !link.hasAttribute('disabled') && link.href && link.href.includes('javascript:');
    });

    if (availableLinks.length > 0) {
      state.isPerformingAction = true;
      state.currentAction = 'jailbreak';
      GM_setValue('actionStartTime', now);
      const randomLink = availableLinks[Math.floor(Math.random() * availableLinks.length)];
      randomLink.click();
      updateStatus(`Jailbreak attempted (${availableLinks.length} available)`);

      state.lastJail = now;
      saveState();

      setTimeout(() => {
        state.isPerformingAction = false;
        state.currentAction = '';
        GM_setValue('actionStartTime', 0);
        safeNavigate('/authenticated/jail.aspx?' + Date.now());
      }, 2000);
    } else {
      state.lastJail = now;
      saveState();
      updateStatus("No players available to break out");
    }
  }

  // ---------------------------
  // Health Functions
  // ---------------------------
  function getHealthPercent() {
    const healthSpan = document.querySelector('#ctl00_userInfo_lblhealth');
    if (!healthSpan) return 100;
    const healthText = healthSpan.textContent.trim();
    const healthValue = parseInt(healthText.replace('%', ''), 10);
    return isNaN(healthValue) ? 100 : healthValue;
  }

  function getCredits() {
    const creditsSpan = document.querySelector('#ctl00_userInfo_lblcredits');
    if (!creditsSpan) return 0;
    const creditsText = creditsSpan.textContent.trim();
    return parseInt(creditsText.replace(/[,$]/g, ''), 10) || 0;
  }

  function checkAndBuyHealth() {
    if (!state.autoHealth || state.isPerformingAction || automationPaused) return;

    const health = getHealthPercent();
    const credits = getCredits();

    // If health is 100% or close, nothing to do
    if (health >= 100) {
      state.buyingHealth = false;
      saveState();
      return;
    }

    // Calculate how much health we need and how many credits that costs
    // Each 10% health costs 10 credits
    const healthNeeded = 100 - health;
    const purchasesNeeded = Math.ceil(healthNeeded / 10);
    const creditsNeeded = purchasesNeeded * 10;

    // Check if we have enough credits
    if (credits < 10) {
      console.log('[TMN] Not enough credits for health - need at least 10');
      state.autoHealth = false; // Disable auto-health if no credits
      saveState();
      updateStatus("Auto-health disabled - no credits");
      return;
    }

    // If not on credits page, navigate there
    if (!/\/authenticated\/credits\.aspx$/i.test(location.pathname)) {
      state.buyingHealth = true;
      saveState();
      updateStatus(`Health low (${health}%) - navigating to buy health`);
      console.log(`[TMN] Health: ${health}%, navigating to credits page`);
      setTimeout(() => location.href = '/authenticated/credits.aspx', 1500);
      return;
    }

    // On credits page - buy health
    if (state.buyingHealth) {
      const buyBtn = document.querySelector('#ctl00_main_btnBuyHealth');
      if (buyBtn) {
        state.isPerformingAction = true;
        state.currentAction = 'health';
        console.log(`[TMN] Buying health - current: ${health}%`);
        updateStatus(`Buying health (${health}% -> ${Math.min(100, health + 10)}%)`);
        buyBtn.click();

        // After purchase, reload to continue buying if needed
        setTimeout(() => {
          state.isPerformingAction = false;
          state.currentAction = '';
          state.lastHealth = Date.now();
          // Check if we need more health
          if (health + 10 >= 100) {
            state.buyingHealth = false;
            console.log('[TMN] Health purchase complete');
          }
          saveState();
          location.reload();
        }, 1500);
      } else {
        state.buyingHealth = false;
        saveState();
        console.log('[TMN] Buy health button not found');
      }
    }
  }

  // ---------------------------
  // Garage Functions
  // ---------------------------
  // VIP cars - keep these, repair them, don't sell
  function isVIPCar(carName) {
    return /Bentley Arnage|Bentley Continental|Audi RS6 Avant/i.test(carName);
  }

  function doGarage() {
    if (!state.autoGarage || state.isPerformingAction || state.inJail || automationPaused) return;

    const now = Date.now();
    if (now - state.lastGarage < config.garageInterval * 1000) return;

    // Navigate to garage if not there
    if (getCurrentPage() !== 'garage') {
      updateStatus("Navigating to garage...");
      safeNavigate('/authenticated/playerproperty.aspx?p=g&' + Date.now());
      return;
    }

    // On garage page - process cars
    const table = document.getElementById('ctl00_main_gvCars');
    if (!table) {
      updateStatus("No garage table found");
      state.lastGarage = now;
      state.isPerformingAction = false;
      state.currentAction = '';
      GM_setValue('actionStartTime', 0);
      saveState();
      return;
    }

    // Get all car rows (skip header row)
    const rows = Array.from(table.querySelectorAll('tr')).slice(1);
    const carRows = rows.filter(row => row.querySelector('input[type="checkbox"]'));

    if (carRows.length === 0) {
      updateStatus("No cars in garage");
      state.lastGarage = now;
      state.isPerformingAction = false;
      state.currentAction = '';
      GM_setValue('actionStartTime', 0);
      saveState();
      return;
    }

    state.isPerformingAction = true;
    state.currentAction = 'garage';
    GM_setValue('actionStartTime', now);

    // Step 1: Sell all NON-VIP cars
    let carsToSell = 0;
    carRows.forEach(row => {
      const nameCell = row.children[1];
      const carName = nameCell ? nameCell.textContent.trim() : '';
      const checkbox = row.querySelector('input[type="checkbox"]');

      if (checkbox && !isVIPCar(carName)) {
        checkbox.checked = true;
        carsToSell++;
      }
    });

    if (carsToSell > 0) {
      const sellBtn = document.getElementById('ctl00_main_btnSellSelected');
      if (sellBtn) {
        updateStatus(`Selling ${carsToSell} non-VIP cars...`);
        console.log(`[TMN] Selling ${carsToSell} non-VIP cars`);
        sellBtn.click();

        // Reset state and set needsRefresh so script continues after page reload
        setTimeout(() => {
          state.isPerformingAction = false;
          state.currentAction = '';
          state.lastGarage = Date.now();
          state.needsRefresh = true;
          GM_setValue('actionStartTime', 0);
          saveState();
          // Navigate back to crimes page to continue automation instead of reload
          window.location.href = '/authenticated/crimes.aspx?' + Date.now();
        }, 2500);
        return;
      }
    }

    // Step 2: Repair damaged VIP cars (one at a time)
    for (const row of carRows) {
      const nameCell = row.children[1];
      const carName = nameCell ? nameCell.textContent.trim() : '';
      const damageCell = row.children[4];
      const damage = damageCell ? parseInt(damageCell.textContent.trim().replace('%', ''), 10) : 0;
      const checkbox = row.querySelector('input[type="checkbox"]');

      if (checkbox && isVIPCar(carName) && damage > 0) {
        // Uncheck all first
        carRows.forEach(r => {
          const cb = r.querySelector('input[type="checkbox"]');
          if (cb) cb.checked = false;
        });

        checkbox.checked = true;
        const repairBtn = document.getElementById('ctl00_main_btnRepair');
        if (repairBtn) {
          updateStatus(`Repairing VIP car: ${carName} (${damage}% damage)`);
          console.log(`[TMN] Repairing VIP car: ${carName}`);
          repairBtn.click();

          // Reset state and continue automation
          setTimeout(() => {
            state.isPerformingAction = false;
            state.currentAction = '';
            state.needsRefresh = true;
            GM_setValue('actionStartTime', 0);
            saveState();
            // Navigate back to crimes page to continue automation
            window.location.href = '/authenticated/crimes.aspx?' + Date.now();
          }, 2500);
          return;
        }
      }
    }

    // Nothing to do - reset state and continue
    updateStatus("Garage: No actions needed");
    state.isPerformingAction = false;
    state.currentAction = '';
    state.lastGarage = now;
    GM_setValue('actionStartTime', 0);
    saveState();
  }

  // ---------------------------
  // UI: create Shadow DOM + dark themed Bootstrap-based UI (scoped)
  // ---------------------------
  function createScopedUI() {
    if (document.getElementById('tmn-automation-host')) return;

    const host = document.createElement('div');
    host.id = 'tmn-automation-host';
    document.body.appendChild(host);

    shadowRoot = host.attachShadow({ mode: 'open' });

    const linkBootstrap = document.createElement('link');
    linkBootstrap.rel = 'stylesheet';
    linkBootstrap.href = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';
    shadowRoot.appendChild(linkBootstrap);

    const linkIcons = document.createElement('link');
    linkIcons.rel = 'stylesheet';
    linkIcons.href = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css';
    shadowRoot.appendChild(linkIcons);

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .card { font-family: Arial, Helvetica, sans-serif; width: 20rem; }
      .card, .modal-content { background-color: #111827 !important; color: #e5e7eb !important; border: 1px solid #2d3748; }
      .card-header { background: linear-gradient(180deg, #0b1220, #0f1724); border-bottom: 1px solid #1f2937; }
      .btn-outline-secondary { color: #cbd5e1; border-color: #334155; background: transparent; }
      .btn-outline-secondary:hover { background: rgba(255,255,255,0.03); }
      .form-check-input { background-color: #0b1220; border: 1px solid #475569; }
      .form-control { background-color: #0b1220; color: #e5e7eb; border-color: #334155; }
      .form-check-label { color: #e2e8f0; }
      .tmn-compact-input { width: 5.5rem; display: inline-block; margin-left: 8px; }
      .card-footer { background: transparent; border-top: 1px solid #1f2937; color: #9ca3af; min-height: 130px; height: 130px; overflow: hidden; }
      .card-body { min-height: 200px; }
      .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 2147483646; }
      .modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 2147483647; display: none; }
      .modal.show { display: block; }
      .modal-dialog { max-width: 36rem; }
      .form-check.form-switch .form-check-input:checked {
        background-color: #10b981; border-color: #10b981;
      }
      :host(*) { all: unset; }
      .bi-gear::before { content: "⚙" !important; }
      .bi-x::before { content: "×" !important; }
      /* Prevent layout shift on timer updates */
      #tmn-health-monitor, #tmn-travel-timer, #tmn-oc-timer, #tmn-dtm-timer {
        min-width: 70px;
        display: inline-block;
      }
    `;
    shadowRoot.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
          <strong>TMN Auto V12.10</strong>
          <div>
            <button id="tmn-settings-btn" class="btn btn-sm btn-outline-secondary me-1" title="Settings">
              <i class="bi bi-gear"></i>
            </button>
            <button id="tmn-minimize-btn" class="btn btn-sm btn-outline-secondary" title="Minimize">âˆ’</button>
          </div>
        </div>

        <div class="card-body" id="tmn-panel-body">
          <div class="mb-2 d-flex justify-content-between align-items-start">
            <div>
              <div class="form-check form-switch mb-2">
                <input class="form-check-input" type="checkbox" id="tmn-auto-crime">
                <label class="form-check-label" for="tmn-auto-crime">Auto Crime</label>
              </div>
              <div class="form-check form-switch mb-2">
                <input class="form-check-input" type="checkbox" id="tmn-auto-gta">
                <label class="form-check-label" for="tmn-auto-gta">Auto GTA</label>
              </div>
              <div class="form-check form-switch mb-2">
                <input class="form-check-input" type="checkbox" id="tmn-auto-booze">
                <label class="form-check-label" for="tmn-auto-booze">Auto Booze</label>
              </div>
              <div class="form-check form-switch mb-2">
                <input class="form-check-input" type="checkbox" id="tmn-auto-jail">
                <label class="form-check-label" for="tmn-auto-jail">Auto Jailbreak</label>
              </div>
            </div>
            <div class="text-end">
              <div class="form-check form-switch mb-2">
                <input class="form-check-input" type="checkbox" id="tmn-auto-all">
                <label class="form-check-label" for="tmn-auto-all" id="tmn-auto-all-label" style="font-weight: 600;">ALL ON</label>
              </div>
              <div class="form-check form-switch mb-2">
                <input class="form-check-input" type="checkbox" id="tmn-auto-health">
                <label class="form-check-label" for="tmn-auto-health">Auto Health</label>
              </div>
              <div class="form-check form-switch mb-2">
                <input class="form-check-input" type="checkbox" id="tmn-auto-garage">
                <label class="form-check-label" for="tmn-auto-garage">Auto Garage</label>
              </div>
              <div id="tmn-player-badge" style="font-size:0.85rem;color:#9ca3af; margin-top: 5px;">Player: ${state.playerName || 'Unknown'}</div>
            </div>
          </div>

          <!-- Status Grid: Health/Travel, OC/DTM - shows cached values to prevent flash -->
          <div class="mt-2 pt-2" style="border-top: 1px solid #1f2937; font-size: 0.85rem;">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div class="d-flex align-items-center" style="width: 50%;">
                <span style="color:#9ca3af; width: 55px;">Health:</span>
                <span id="tmn-health-monitor" style="font-weight: 500;">${cachedDisplayValues.health || '<span style="color:#9ca3af;">●</span> --'}</span>
              </div>
              <div class="d-flex align-items-center" style="width: 50%;">
                <span style="color:#9ca3af; width: 55px;">Travel:</span>
                <span id="tmn-travel-timer" style="font-weight: 500;">${cachedDisplayValues.travel || '<span style="color:#9ca3af;">●</span> --'}</span>
              </div>
            </div>
            <div class="d-flex justify-content-between align-items-center">
              <div class="d-flex align-items-center" style="width: 50%;">
                <span style="color:#9ca3af; width: 55px;">OC:</span>
                <span id="tmn-oc-timer" style="font-weight: 500;">${cachedDisplayValues.oc || '<span style="color:#9ca3af;">●</span> --'}</span>
              </div>
              <div class="d-flex align-items-center" style="width: 50%;">
                <span style="color:#9ca3af; width: 55px;">DTM:</span>
                <span id="tmn-dtm-timer" style="font-weight: 500;">${cachedDisplayValues.dtm || '<span style="color:#9ca3af;">●</span> --'}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="card-footer small text-muted" id="tmn-status" style="min-height: 130px; height: 130px; overflow: hidden;">Status: Ready<br>&nbsp;<br>&nbsp;<br>&nbsp;<br>&nbsp;<br>&nbsp;</div>
      </div>

      <div id="tmn-settings-modal" class="modal" role="dialog" aria-hidden="true">
        <div class="modal-dialog modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Automation Settings</h5>
              <button id="tmn-modal-close" type="button" class="btn btn-sm btn-outline-secondary" title="Close"><i class="bi bi-x"></i></button>
            </div>
            <div class="modal-body">
              <h6 style="color:#cbd5e1;">Login Settings</h6>
              <div class="mb-3">
              <label class="form-label small">Username:</label>
              <input type="text" id="tmn-login-username" class="form-control form-control-sm mb-2"
              placeholder="Your TMN username" value="${LOGIN_CONFIG.USERNAME}">

              <label class="form-label small">Password:</label>
              <input type="text" id="tmn-login-password" class="form-control form-control-sm mb-2"
              placeholder="Your TMN password" value="${LOGIN_CONFIG.PASSWORD}">

  <div class="form-check form-switch">
    <input class="form-check-input" type="checkbox" id="tmn-auto-submit-enabled">
    <label class="form-check-label" for="tmn-auto-submit-enabled">Auto-submit after captcha</label>
  </div>
</div>

<hr style="border-color:#1f2937">
              <h6 style="color:#cbd5e1;">Crime Options</h6>
              <div id="tmn-crime-options"></div>
              <div class="mb-3 mt-2">
                <label class="form-label">Interval (sec):
                  <input type="number" id="tmn-crime-interval" class="form-control form-control-sm tmn-compact-input" value="${config.crimeInterval}" min="1" max="999">
                </label>
              </div>

              <hr style="border-color:#1f2937">

              <h6 style="color:#cbd5e1;">GTA Options</h6>
              <div id="tmn-gta-options"></div>
              <div class="mb-3 mt-2">
                <label class="form-label">Interval (sec):
                  <input type="number" id="tmn-gta-interval" class="form-control form-control-sm tmn-compact-input" value="${config.gtaInterval}" min="1" max="999">
                </label>
              </div>

              <hr style="border-color:#1f2937">

              <h6 style="color:#cbd5e1;">Booze Options</h6>
              <div class="mb-3">
                <label class="form-label">Interval (sec):
                  <input type="number" id="tmn-booze-interval" class="form-control form-control-sm tmn-compact-input" value="${config.boozeInterval}" min="1" max="999">
                </label>
              </div>
              <div class="mb-3">
                <label class="form-label">Buy Amount:
                  <input type="number" id="tmn-booze-buy-amount" class="form-control form-control-sm tmn-compact-input" value="${config.boozeBuyAmount}" min="1" max="300">
                </label>
              </div>
              <div class="mb-3">
                <label class="form-label">Sell Amount:
                  <input type="number" id="tmn-booze-sell-amount" class="form-control form-control-sm tmn-compact-input" value="${config.boozeSellAmount}" min="1" max="300">
                </label>
              </div>

              <hr style="border-color:#1f2937">

              <h6 style="color:#cbd5e1;">Jailbreak Options</h6>
              <div class="mb-3">
                <label class="form-label">Interval (sec):
                  <input type="number" id="tmn-jail-interval" class="form-control form-control-sm tmn-compact-input" value="${config.jailbreakInterval}" min="1" max="999">
                </label>
              </div>

              <hr style="border-color:#1f2937">

              <h6 style="color:#cbd5e1;">Health Options</h6>
              <div class="mb-3">
                <small class="text-muted d-block mb-2">Automatically buy health when below threshold (uses credits)</small>
                <div class="d-flex justify-content-between mb-2">
                  <div style="width: 48%;">
                    <label class="form-label small">Min Health Threshold (%):</label>
                    <input type="number" id="tmn-min-health" class="form-control form-control-sm" value="${config.minHealthThreshold}" min="1" max="99">
                    <small class="text-muted">Stop scripts & alert when below</small>
                  </div>
                  <div style="width: 48%;">
                    <label class="form-label small">Target Health (%):</label>
                    <input type="number" id="tmn-target-health" class="form-control form-control-sm" value="${config.targetHealth}" min="10" max="100">
                    <small class="text-muted">Buy health until reaching this</small>
                  </div>
                </div>
                <div class="d-flex align-items-center mb-2 p-2" style="background: rgba(0,0,0,0.2); border-radius: 4px;">
                  <span style="color:#9ca3af;">Current Health:</span>
                  <span id="tmn-settings-current-health" class="ms-2" style="font-weight: 500;"><span style="color:#10b981;">●</span> 100%</span>
                </div>
                <div class="mb-2 p-2" style="background: rgba(255,193,7,0.1); border: 1px solid rgba(255,193,7,0.3); border-radius: 4px;">
                  <small style="color: #ffc107;">⚠ When health drops below threshold:</small>
                  <ul class="mb-0 ps-3" style="font-size: 0.75rem; color: #9ca3af;">
                    <li>Telegram alert every 10 seconds (with health %)</li>
                    <li>If auto-buy disabled: ALL scripts will stop</li>
                    <li>If auto-buy enabled: Will use credits to restore health</li>
                  </ul>
                </div>
                <button id="tmn-test-health-alert" class="btn btn-sm btn-outline-warning">Test Health Alert</button>
              </div>

              <hr style="border-color:#1f2937">

              <h6 style="color:#cbd5e1;">Garage Options</h6>
              <div class="mb-3">
                <small class="text-muted d-block mb-2">Auto-sell cars from garage (keeps VIP cars)</small>
                <label class="form-label">Interval (min):
                  <input type="number" id="tmn-garage-interval" class="form-control form-control-sm tmn-compact-input" value="${Math.round(config.garageInterval / 60)}" min="1" max="120">
                </label>
              </div>

              <hr style="border-color:#1f2937">
              <h6 style="color:#cbd5e1;">Telegram Notifications</h6>
              <div class="mb-3">
                <div class="form-check form-switch mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-telegram-enabled">
                  <label class="form-check-label" for="tmn-telegram-enabled">Enable Telegram</label>
                </div>

                <label class="form-label small">Bot Token:</label>
                <input type="text" id="tmn-telegram-token" class="form-control form-control-sm mb-2"
                       placeholder="Get from @BotFather">

                <label class="form-label small">Chat ID:</label>
                <input type="text" id="tmn-telegram-chat" class="form-control form-control-sm mb-2"
                       placeholder="Get from @userinfobot">

                <div class="form-check mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-notify-captcha">
                  <label class="form-check-label" for="tmn-notify-captcha">Notify on Script Check</label>
                </div>

                <div class="form-check mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-notify-messages">
                  <label class="form-check-label" for="tmn-notify-messages">Notify on New Messages</label>
                </div>
                <div class="form-check mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-notify-sql">
                  <label class="form-check-label" for="tmn-notify-sql">Notify on SQL Script Check</label>
                </div>
                <div class="form-check mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-notify-logout">
                  <label class="form-check-label" for="tmn-notify-logout">Notify on Logout/Timeout</label>
                </div>

                <button id="tmn-test-telegram" class="btn btn-sm btn-outline-success">Test Connection</button>
              </div>

              <hr style="border-color:#1f2937">
              <h6 style="color:#cbd5e1;">Efficiency Tracking</h6>
              <div class="mb-3">
                <div class="p-2 mb-2" style="background: rgba(0,0,0,0.2); border-radius: 4px;">
                  <div class="d-flex justify-content-between mb-1">
                    <span style="color:#9ca3af;">Efficiency:</span>
                    <span id="tmn-settings-efficiency" style="font-weight: 500; color: #10b981;">--</span>
                  </div>
                  <div class="d-flex justify-content-between">
                    <span style="color:#9ca3af;">Progress:</span>
                    <span id="tmn-settings-progress" style="font-weight: 500; color: #10b981;">--</span>
                  </div>
                </div>
                <button id="tmn-reset-efficiency" class="btn btn-sm btn-outline-warning me-2">Reset Efficiency Stats</button>
                <button id="tmn-view-stats" class="btn btn-sm btn-outline-info">View Detailed Stats</button>
              </div>

              <hr style="border-color:#1f2937">
              <h6 style="color:#cbd5e1;">Logout/Session Alerts</h6>
              <div class="mb-3">
                <small class="text-muted d-block mb-2">Alert methods when logged out (works even in background tabs)</small>
                <div class="form-check form-switch mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-logout-tab-flash">
                  <label class="form-check-label" for="tmn-logout-tab-flash">Tab Title Flash</label>
                </div>
                <small class="text-muted d-block mb-2">Flashes "🔴 LOGIN NEEDED" in browser tab title</small>
                <div class="form-check form-switch mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-logout-browser-notify">
                  <label class="form-check-label" for="tmn-logout-browser-notify">Browser Notification</label>
                </div>
                <small class="text-muted d-block mb-2">Desktop notification popup (requires permission)</small>
                <button id="tmn-test-logout-alert" class="btn btn-sm btn-outline-info">Test Logout Alert</button>
              </div>

              <hr style="border-color:#1f2937">
              <h6 style="color:#cbd5e1;">Advanced Features</h6>
              <div class="mb-3">
                <div class="form-check form-switch mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-auto-resume-enabled">
                  <label class="form-check-label" for="tmn-auto-resume-enabled">Auto-Resume after Script Check</label>
                </div>
                <small class="text-muted d-block mb-2">Automatically submit captcha and resume automation after script check</small>

                <div class="form-check form-switch mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-stats-collection-enabled">
                  <label class="form-check-label" for="tmn-stats-collection-enabled">Stats Collection</label>
                </div>
                <small class="text-muted d-block mb-2">Periodically collect game statistics from the stats page</small>

                <label class="form-label">Stats Collection Interval (sec):
                  <input type="number" id="tmn-stats-interval" class="form-control form-control-sm tmn-compact-input" value="${statsCollectionConfig.interval}" min="10" max="7200">
                </label>
              </div>

              <hr style="border-color:#1f2937">
              <h6 style="color:#cbd5e1;">Health & Timers</h6>
              <div class="mb-3">
                <small class="text-muted d-block mb-2">Health monitor and activity timers</small>
                <div class="d-flex align-items-center mb-2">
                  <span style="color:#9ca3af; width: 60px;">Health:</span>
                  <span id="tmn-settings-health" style="font-weight: 500;">Loading...</span>
                </div>
                <div class="d-flex align-items-center mb-2">
                  <span style="color:#9ca3af; width: 60px;">OC:</span>
                  <span id="tmn-settings-oc-timer" style="font-weight: 500;">Loading...</span>
                </div>
                <div class="d-flex align-items-center mb-2">
                  <span style="color:#9ca3af; width: 60px;">Travel:</span>
                  <span id="tmn-settings-travel-timer" style="font-weight: 500;">Loading...</span>
                  <small class="text-muted ms-2">(45m normal / 20m jet)</small>
                </div>
                <div class="d-flex align-items-center mb-2">
                  <span style="color:#9ca3af; width: 60px;">DTM:</span>
                  <span id="tmn-settings-dtm-timer" style="font-weight: 500;">Loading...</span>
                </div>
                <button id="tmn-refresh-timers" class="btn btn-sm btn-outline-info">Refresh Timers</button>
              </div>

              <hr style="border-color:#1f2937">
              <h6 style="color:#cbd5e1;">Tab Management</h6>
              <div class="mb-3">
                <small class="text-muted d-block mb-2">Tab Manager prevents multiple tabs from running automation simultaneously</small>
                <div id="tmn-tab-status" class="small text-info">Status: Checking...</div>
              </div>

              <hr style="border-color:#1f2937">

              <div class="d-grid">
                <button id="tmn-reset-btn" class="btn btn-danger">Reset All Settings & Data</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="tmn-modal-backdrop" class="modal-backdrop" style="display:none;"></div>
    `;
    shadowRoot.appendChild(wrapper);

    // Fill crime & gta option lists
    const crimeContainer = shadowRoot.querySelector('#tmn-crime-options');
    crimeContainer.innerHTML = crimeOptions.map(c => `
      <div class="form-check">
        <input class="form-check-input crime-option" type="checkbox" id="crime-${c.id}" value="${c.id}">
        <label class="form-check-label" for="crime-${c.id}">${c.name}</label>
      </div>
    `).join('');

    const gtaContainer = shadowRoot.querySelector('#tmn-gta-options');
    gtaContainer.innerHTML = gtaOptions.map(g => `
      <div class="form-check">
        <input class="form-check-input gta-option" type="checkbox" id="gta-${g.id}" value="${g.id}">
        <label class="form-check-label" for="gta-${g.id}">${g.name}</label>
      </div>
    `).join('');

    // Initialize states in UI
    shadowRoot.querySelector("#tmn-auto-crime").checked = state.autoCrime;
    shadowRoot.querySelector("#tmn-auto-gta").checked = state.autoGTA;
    shadowRoot.querySelector("#tmn-auto-booze").checked = state.autoBooze;
    shadowRoot.querySelector("#tmn-auto-jail").checked = state.autoJail;
    shadowRoot.querySelector("#tmn-auto-health").checked = state.autoHealth;
    shadowRoot.querySelector("#tmn-auto-garage").checked = state.autoGarage;

    // Initialize ALL ON/OFF toggle
    const allToggle = shadowRoot.querySelector("#tmn-auto-all");
    const allLabel = shadowRoot.querySelector("#tmn-auto-all-label");
    allToggle.checked = state.autoCrime && state.autoGTA && state.autoBooze && state.autoJail && state.autoHealth && state.autoGarage;
    allLabel.textContent = allToggle.checked ? 'ALL ON' : 'ALL OFF';
    allLabel.style.color = allToggle.checked ? '#10b981' : '#ef4444';

    shadowRoot.querySelectorAll('.crime-option').forEach(cb => {
      cb.checked = state.selectedCrimes.includes(parseInt(cb.value));
    });
    shadowRoot.querySelectorAll('.gta-option').forEach(cb => {
      cb.checked = state.selectedGTAs.includes(parseInt(cb.value));
    });

    // Hook up event listeners
    shadowRoot.querySelector("#tmn-auto-crime").addEventListener('change', e => {
      state.autoCrime = e.target.checked;
      saveState();
      updateStatus('Auto Crime ' + (state.autoCrime ? 'Enabled' : 'Disabled'));
      updateAllToggleState();

      // Initialize efficiency tracking when automation starts
      if (state.autoCrime || state.autoGTA || state.autoBooze || state.autoJail) {
        efficiencyTracker.init();
      }
    });
    shadowRoot.querySelector("#tmn-auto-gta").addEventListener('change', e => {
      state.autoGTA = e.target.checked;
      saveState();
      updateStatus('Auto GTA ' + (state.autoGTA ? 'Enabled' : 'Disabled'));
      updateAllToggleState();

      // Initialize efficiency tracking when automation starts
      if (state.autoCrime || state.autoGTA || state.autoBooze || state.autoJail) {
        efficiencyTracker.init();
      }
    });
    shadowRoot.querySelector("#tmn-auto-booze").addEventListener('change', e => {
      state.autoBooze = e.target.checked;
      saveState();
      updateStatus('Auto Booze ' + (state.autoBooze ? 'Enabled' : 'Disabled'));
      updateAllToggleState();

      // Initialize efficiency tracking when automation starts
      if (state.autoCrime || state.autoGTA || state.autoBooze || state.autoJail) {
        efficiencyTracker.init();
      }
    });
    shadowRoot.querySelector("#tmn-auto-jail").addEventListener('change', e => {
      state.autoJail = e.target.checked;
      saveState();
      updateStatus('Auto Jailbreak ' + (state.autoJail ? 'Enabled' : 'Disabled'));
      updateAllToggleState();

      // Initialize efficiency tracking when automation starts
      if (state.autoCrime || state.autoGTA || state.autoBooze || state.autoJail) {
        efficiencyTracker.init();
      }
    });
    shadowRoot.querySelector("#tmn-auto-health").addEventListener('change', e => {
      state.autoHealth = e.target.checked;
      saveState();
      updateStatus('Auto Health ' + (state.autoHealth ? 'Enabled' : 'Disabled'));
    });
    shadowRoot.querySelector("#tmn-auto-garage").addEventListener('change', e => {
      state.autoGarage = e.target.checked;
      saveState();
      updateStatus('Auto Garage ' + (state.autoGarage ? 'Enabled' : 'Disabled'));
    });

    // ALL ON/OFF toggle functionality
    shadowRoot.querySelector("#tmn-auto-all").addEventListener('change', e => {
      const allEnabled = e.target.checked;

      state.autoCrime = allEnabled;
      state.autoGTA = allEnabled;
      state.autoBooze = allEnabled;
      state.autoJail = allEnabled;
      state.autoHealth = allEnabled;
      state.autoGarage = allEnabled;

      shadowRoot.querySelector("#tmn-auto-crime").checked = allEnabled;
      shadowRoot.querySelector("#tmn-auto-gta").checked = allEnabled;
      shadowRoot.querySelector("#tmn-auto-booze").checked = allEnabled;
      shadowRoot.querySelector("#tmn-auto-jail").checked = allEnabled;
      shadowRoot.querySelector("#tmn-auto-health").checked = allEnabled;
      shadowRoot.querySelector("#tmn-auto-garage").checked = allEnabled;

      const allLabel = shadowRoot.querySelector("#tmn-auto-all-label");
      allLabel.textContent = allEnabled ? 'ALL ON' : 'ALL OFF';
      allLabel.style.color = allEnabled ? '#10b981' : '#ef4444';

      saveState();
      updateStatus('All automation ' + (allEnabled ? 'Enabled' : 'Disabled'));

      // Initialize efficiency tracking when automation starts
      if (allEnabled) {
        efficiencyTracker.init();
      }
    });

    function updateAllToggleState() {
      const allToggle = shadowRoot.querySelector("#tmn-auto-all");
      const allLabel = shadowRoot.querySelector("#tmn-auto-all-label");
      const allEnabled = state.autoCrime && state.autoGTA && state.autoBooze && state.autoJail && state.autoHealth && state.autoGarage;

      allToggle.checked = allEnabled;
      allLabel.textContent = allEnabled ? 'ALL ON' : 'ALL OFF';
      allLabel.style.color = allEnabled ? '#10b981' : '#ef4444';
    }

    shadowRoot.querySelectorAll('.crime-option').forEach(cb => {
      cb.addEventListener('change', e => {
        const id = parseInt(e.target.value);
        if (e.target.checked) {
          if (!state.selectedCrimes.includes(id)) state.selectedCrimes.push(id);
        } else {
          state.selectedCrimes = state.selectedCrimes.filter(x => x !== id);
        }
        saveState();
      });
    });

    shadowRoot.querySelectorAll('.gta-option').forEach(cb => {
      cb.addEventListener('change', e => {
        const id = parseInt(e.target.value);
        if (e.target.checked) {
          if (!state.selectedGTAs.includes(id)) state.selectedGTAs.push(id);
        } else {
          state.selectedGTAs = state.selectedGTAs.filter(x => x !== id);
        }
        saveState();
      });
    });

    // Interval inputs
    shadowRoot.querySelector('#tmn-crime-interval').addEventListener('change', e => {
      config.crimeInterval = Math.max(1, Math.min(999, parseInt(e.target.value)));
      GM_setValue("crimeInterval", config.crimeInterval);
      e.target.value = config.crimeInterval;
    });
    shadowRoot.querySelector('#tmn-gta-interval').addEventListener('change', e => {
      config.gtaInterval = Math.max(1, Math.min(999, parseInt(e.target.value)));
      GM_setValue("gtaInterval", config.gtaInterval);
      e.target.value = config.gtaInterval;
    });
    shadowRoot.querySelector('#tmn-booze-interval').addEventListener('change', e => {
      config.boozeInterval = Math.max(1, Math.min(999, parseInt(e.target.value)));
      GM_setValue("boozeInterval", config.boozeInterval);
      e.target.value = config.boozeInterval;
    });
    shadowRoot.querySelector('#tmn-booze-buy-amount').addEventListener('change', e => {
      config.boozeBuyAmount = Math.max(1, Math.min(300, parseInt(e.target.value)));
      GM_setValue("boozeBuyAmount", config.boozeBuyAmount);
      e.target.value = config.boozeBuyAmount;
    });
    shadowRoot.querySelector('#tmn-booze-sell-amount').addEventListener('change', e => {
      config.boozeSellAmount = Math.max(1, Math.min(300, parseInt(e.target.value)));
      GM_setValue("boozeSellAmount", config.boozeSellAmount);
      e.target.value = config.boozeSellAmount;
    });
    shadowRoot.querySelector('#tmn-jail-interval').addEventListener('change', e => {
      config.jailbreakInterval = Math.max(1, Math.min(999, parseInt(e.target.value)));
      GM_setValue("jailbreakInterval", config.jailbreakInterval);
      e.target.value = config.jailbreakInterval;
    });

    // Garage interval setting
    shadowRoot.querySelector('#tmn-garage-interval').addEventListener('change', e => {
      const minutes = Math.max(1, Math.min(120, parseInt(e.target.value)));
      config.garageInterval = minutes * 60; // Convert minutes to seconds for internal use
      GM_setValue("garageInterval", config.garageInterval);
      e.target.value = minutes;
    });

    // Health threshold settings
    shadowRoot.querySelector('#tmn-min-health').addEventListener('change', e => {
      config.minHealthThreshold = Math.max(1, Math.min(99, parseInt(e.target.value)));
      GM_setValue("minHealthThreshold", config.minHealthThreshold);
      e.target.value = config.minHealthThreshold;
    });
    shadowRoot.querySelector('#tmn-target-health').addEventListener('change', e => {
      config.targetHealth = Math.max(10, Math.min(100, parseInt(e.target.value)));
      GM_setValue("targetHealth", config.targetHealth);
      e.target.value = config.targetHealth;
    });
    shadowRoot.querySelector('#tmn-test-health-alert').addEventListener('click', () => {
      if (telegramConfig.enabled && telegramConfig.botToken && telegramConfig.chatId) {
        sendTelegramMessage(
          '🧪 <b>TEST Health Alert</b>\n\n' +
          `Player: ${state.playerName || 'Unknown'}\n` +
          `Current Health: ${getHealthPercent()}%\n` +
          `Threshold: ${config.minHealthThreshold}%\n` +
          `Time: ${new Date().toLocaleString()}\n\n` +
          'This is a test alert. If you receive this, health alerts are working!'
        );
        updateStatus('Test health alert sent to Telegram');
      } else {
        alert('Please configure Telegram notifications first (Bot Token and Chat ID required)');
      }
    });

    // Update current health display in settings periodically
    setInterval(() => {
      const healthEl = shadowRoot.querySelector('#tmn-settings-current-health');
      if (healthEl) {
        const health = getHealthPercent();
        const color = health >= 100 ? '#10b981' : health > config.minHealthThreshold ? '#f59e0b' : '#ef4444';
        healthEl.innerHTML = `<span style="color:${color};">●</span> ${health}%`;
      }
    }, 5000);

    // Efficiency tracking controls
    shadowRoot.querySelector('#tmn-reset-efficiency').addEventListener('click', () => {
      if (efficiencyTracker.reset()) {
        updateStatus("Efficiency stats reset - tracking fresh session");
      } else {
        updateStatus("Could not reset efficiency - status bar not available");
      }
    });

    shadowRoot.querySelector('#tmn-view-stats').addEventListener('click', () => {
      showDetailedStats();
    });

    // Reset ALL
    shadowRoot.querySelector('#tmn-reset-btn').addEventListener('click', resetStorage);
    // Telegram Settings Event Listeners
    shadowRoot.querySelector("#tmn-telegram-enabled").checked = telegramConfig.enabled;
    shadowRoot.querySelector("#tmn-telegram-token").value = telegramConfig.botToken;
    shadowRoot.querySelector("#tmn-telegram-chat").value = telegramConfig.chatId;
    shadowRoot.querySelector("#tmn-notify-captcha").checked = telegramConfig.notifyCaptcha;
    shadowRoot.querySelector("#tmn-notify-messages").checked = telegramConfig.notifyMessages;

    shadowRoot.querySelector("#tmn-telegram-enabled").addEventListener('change', e => {
      telegramConfig.enabled = e.target.checked;
      saveTelegramConfig();
      updateStatus('Telegram notifications ' + (telegramConfig.enabled ? 'enabled' : 'disabled'));
    });

    shadowRoot.querySelector("#tmn-telegram-token").addEventListener('input', e => {
      telegramConfig.botToken = e.target.value.trim();
      saveTelegramConfig();
    });

    shadowRoot.querySelector("#tmn-telegram-chat").addEventListener('input', e => {
      telegramConfig.chatId = e.target.value.trim();
      saveTelegramConfig();
    });

    shadowRoot.querySelector("#tmn-notify-captcha").addEventListener('change', e => {
      telegramConfig.notifyCaptcha = e.target.checked;
      saveTelegramConfig();
    });

    shadowRoot.querySelector("#tmn-notify-messages").addEventListener('change', e => {
      telegramConfig.notifyMessages = e.target.checked;
      saveTelegramConfig();
    });
    shadowRoot.querySelector("#tmn-notify-sql").checked = telegramConfig.notifySqlCheck;

    shadowRoot.querySelector("#tmn-notify-sql").addEventListener('change', e => {
      telegramConfig.notifySqlCheck = e.target.checked;
      saveTelegramConfig();
    });

    shadowRoot.querySelector("#tmn-notify-logout").checked = telegramConfig.notifyLogout;

    shadowRoot.querySelector("#tmn-notify-logout").addEventListener('change', e => {
      telegramConfig.notifyLogout = e.target.checked;
      saveTelegramConfig();
   });


    shadowRoot.querySelector("#tmn-test-telegram").addEventListener('click', testTelegramConnection);

    // Login Settings Event Listeners
    shadowRoot.querySelector("#tmn-login-username").addEventListener('input', e => {
      LOGIN_CONFIG.USERNAME = e.target.value.trim();
      GM_setValue('loginUsername', LOGIN_CONFIG.USERNAME);
    });

    shadowRoot.querySelector("#tmn-login-password").addEventListener('input', e => {
  LOGIN_CONFIG.PASSWORD = e.target.value.trim();
  GM_setValue('loginPassword', LOGIN_CONFIG.PASSWORD);
    });

    shadowRoot.querySelector("#tmn-auto-submit-enabled").checked = LOGIN_CONFIG.AUTO_SUBMIT_ENABLED;
    shadowRoot.querySelector("#tmn-auto-submit-enabled").addEventListener('change', e => {
  LOGIN_CONFIG.AUTO_SUBMIT_ENABLED = e.target.checked;
  GM_setValue('autoSubmitEnabled', LOGIN_CONFIG.AUTO_SUBMIT_ENABLED);
});

    // Advanced Features Event Listeners
    shadowRoot.querySelector("#tmn-auto-resume-enabled").checked = autoResumeConfig.enabled;
    shadowRoot.querySelector("#tmn-auto-resume-enabled").addEventListener('change', e => {
      autoResumeConfig.enabled = e.target.checked;
      saveAutoResumeConfig();
      updateStatus('Auto-resume ' + (autoResumeConfig.enabled ? 'enabled' : 'disabled'));
    });

    shadowRoot.querySelector("#tmn-stats-collection-enabled").checked = statsCollectionConfig.enabled;
    shadowRoot.querySelector("#tmn-stats-collection-enabled").addEventListener('change', e => {
      statsCollectionConfig.enabled = e.target.checked;
      saveStatsCollectionConfig();
      updateStatus('Stats collection ' + (statsCollectionConfig.enabled ? 'enabled' : 'disabled'));
    });

    shadowRoot.querySelector("#tmn-stats-interval").addEventListener('change', e => {
      statsCollectionConfig.interval = Math.max(10, Math.min(7200, parseInt(e.target.value)));
      saveStatsCollectionConfig();
      e.target.value = statsCollectionConfig.interval;
    });

    // Logout Alert Settings
    shadowRoot.querySelector("#tmn-logout-tab-flash").checked = logoutAlertConfig.tabFlash;
    shadowRoot.querySelector("#tmn-logout-tab-flash").addEventListener('change', e => {
      logoutAlertConfig.tabFlash = e.target.checked;
      saveLogoutAlertConfig();
      updateStatus('Tab flash ' + (logoutAlertConfig.tabFlash ? 'enabled' : 'disabled'));
    });

    shadowRoot.querySelector("#tmn-logout-browser-notify").checked = logoutAlertConfig.browserNotify;
    shadowRoot.querySelector("#tmn-logout-browser-notify").addEventListener('change', e => {
      logoutAlertConfig.browserNotify = e.target.checked;
      saveLogoutAlertConfig();
      // Request notification permission when enabled
      if (logoutAlertConfig.browserNotify && Notification.permission === 'default') {
        Notification.requestPermission().then(perm => {
          updateStatus('Browser notifications: ' + perm);
        });
      } else {
        updateStatus('Browser notify ' + (logoutAlertConfig.browserNotify ? 'enabled' : 'disabled'));
      }
    });

    shadowRoot.querySelector("#tmn-test-logout-alert").addEventListener('click', () => {
      updateStatus('Testing logout alerts...');
      triggerLogoutAlerts();
      // Stop tab flash after 5 seconds for the test
      setTimeout(() => {
        stopFlashTabTitle();
        updateStatus('Logout alert test complete');
      }, 5000);
    });

    // Timer Refresh Button
    shadowRoot.querySelector('#tmn-refresh-timers').addEventListener('click', async () => {
      const btn = shadowRoot.querySelector('#tmn-refresh-timers');
      btn.textContent = 'Refreshing...';
      btn.disabled = true;

      await collectOCDTMTimers();
      await fetchTravelTimerData();

      // Update settings display
      updateSettingsTimerDisplay();

      btn.textContent = 'Refresh Timers';
      btn.disabled = false;
      updateStatus('Timers refreshed');
    });

    // Function to update settings modal timer displays
    function updateSettingsTimerDisplay() {
      const dtmStatus = getDTMTimerStatus();
      const ocStatus = getOCTimerStatus();
      const travelStatus = getTravelTimerStatus();
      const currentStats = efficiencyTracker.parseStatusBar();

      const dtmDisplay = formatTimerDisplay(dtmStatus, 'canDTM');
      const ocDisplay = formatTimerDisplay(ocStatus, 'canOC');
      const travelDisplay = formatTravelTimerDisplay(travelStatus);

      const settingsDtmEl = shadowRoot.querySelector('#tmn-settings-dtm-timer');
      const settingsOcEl = shadowRoot.querySelector('#tmn-settings-oc-timer');
      const settingsTravelEl = shadowRoot.querySelector('#tmn-settings-travel-timer');
      const settingsHealthEl = shadowRoot.querySelector('#tmn-settings-health');

      if (settingsDtmEl) {
        settingsDtmEl.innerHTML = `<span style="color:${dtmDisplay.color === 'green' ? '#10b981' : dtmDisplay.color === 'red' ? '#ef4444' : '#9ca3af'};">●</span> ${dtmDisplay.text}`;
      }
      if (settingsOcEl) {
        settingsOcEl.innerHTML = `<span style="color:${ocDisplay.color === 'green' ? '#10b981' : ocDisplay.color === 'red' ? '#ef4444' : '#9ca3af'};">●</span> ${ocDisplay.text}`;
      }
      if (settingsTravelEl) {
        const travelColor = travelDisplay.color === 'green' ? '#10b981' : travelDisplay.color === 'amber' ? '#f59e0b' : travelDisplay.color === 'red' ? '#ef4444' : '#9ca3af';
        settingsTravelEl.innerHTML = `<span style="color:${travelColor};">●</span> ${travelDisplay.text}`;
      }
      if (settingsHealthEl && currentStats) {
        const health = currentStats.health || 0;
        const healthColor = getHealthColor(health);
        settingsHealthEl.innerHTML = `<span style="color:${healthColor};">●</span> ${health}%`;
      }

      // Update efficiency display
      const efficiencyEl = shadowRoot.querySelector('#tmn-settings-efficiency');
      const progressEl = shadowRoot.querySelector('#tmn-settings-progress');
      const efficiency = efficiencyTracker.getEfficiency();

      if (efficiencyEl && efficiency) {
        efficiencyEl.textContent = `${efficiency.percentPerHour.toFixed(2)}%/hr | $${Math.round(efficiency.moneyPerHour).toLocaleString()}/hr`;
      } else if (efficiencyEl) {
        efficiencyEl.textContent = '--';
      }

      if (progressEl && efficiency) {
        const hours = Math.floor(efficiency.totalTimeMinutes / 60);
        const mins = Math.floor(efficiency.totalTimeMinutes % 60);
        progressEl.textContent = `+${efficiency.totalPercentGain.toFixed(2)}% in ${hours}h ${mins}m`;
      } else if (progressEl) {
        progressEl.textContent = '--';
      }
    }

    // Update settings timer display periodically
    setInterval(updateSettingsTimerDisplay, 1000);

    // Update tab status display
    const tabStatusEl = shadowRoot.querySelector('#tmn-tab-status');
    if (tabStatusEl) {
      const updateTabStatus = () => {
        if (tabManager.isMasterTab) {
          tabStatusEl.textContent = 'Status: Master Tab (automation active)';
          tabStatusEl.className = 'small text-success';
        } else if (tabManager.hasActiveMaster()) {
          tabStatusEl.textContent = 'Status: Secondary Tab (waiting)';
          tabStatusEl.className = 'small text-warning';
        } else {
          tabStatusEl.textContent = 'Status: No active master tab';
          tabStatusEl.className = 'small text-info';
        }
      };
      updateTabStatus();
      setInterval(updateTabStatus, 5000);
    }

// Minimizer
    // Minimizer
    const minimizeBtn = shadowRoot.querySelector('#tmn-minimize-btn');
    const body = shadowRoot.querySelector('#tmn-panel-body');
    const footer = shadowRoot.querySelector('#tmn-status');

    // Apply saved minimized state on page load
    if (state.panelMinimized) {
      body.style.display = 'none';
      footer.style.display = 'none';
      minimizeBtn.textContent = '+';
    } else {
      body.style.display = 'block';
      footer.style.display = 'block';
      minimizeBtn.textContent = "-";
    }

    minimizeBtn.addEventListener('click', () => {
      state.panelMinimized = !state.panelMinimized;
      if (state.panelMinimized) {
        body.style.display = 'none';
        footer.style.display = 'none';
        minimizeBtn.textContent = '+';
      } else {
        body.style.display = 'block';
        footer.style.display = 'block';
        minimizeBtn.textContent = "-";
      }
      saveState();
    });

    // Settings modal controls
    const settingsBtn = shadowRoot.querySelector('#tmn-settings-btn');
    const modal = shadowRoot.querySelector('#tmn-settings-modal');
    const backdrop = shadowRoot.querySelector('#tmn-modal-backdrop');
    const modalClose = shadowRoot.querySelector('#tmn-modal-close');

    function showModal() {
      pauseAutomation();
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      backdrop.style.display = 'block';
    }
    function hideModal() {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      backdrop.style.display = 'none';
      saveState();
      updatePlayerBadge();
      resumeAutomation();
    }

    settingsBtn.addEventListener('click', showModal);
    modalClose.addEventListener('click', hideModal);
    backdrop.addEventListener('click', hideModal);

    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (modal.classList.contains('show')) hideModal();
      }
    });

    function updatePlayerBadge() {
      const pb = shadowRoot.querySelector('#tmn-player-badge');
      if (pb) pb.innerHTML = `Player: ${state.playerName || 'Unknown'}`;
    }

    shadowRoot.updatePlayerBadge = updatePlayerBadge;
  }

  // ---------------------------
  // Detailed Stats Display
  // ---------------------------
  function showDetailedStats() {
    const efficiency = efficiencyTracker.getEfficiency();
    const currentStats = efficiencyTracker.parseStatusBar();

    let statsHTML = `
      <div class="mb-3">
        <h6>Current Status</h6>
        <div class="small">
          Rank: ${currentStats ? currentStats.rank : 'N/A'} (${currentStats ? currentStats.rankPercent.toFixed(2) : '0.00'}%)<br>
          Money: $${currentStats ? currentStats.money.toLocaleString() : '0'}<br>
          Location: ${currentStats ? currentStats.city : 'N/A'}<br>
          Health: ${currentStats ? currentStats.health : '0'}%
        </div>
      </div>
    `;

    if (efficiency) {
      statsHTML += `
        <div class="mb-3">
          <h6>Efficiency Rates</h6>
          <div class="small">
            <strong>Per Minute:</strong><br>
            Rank: ${efficiency.percentPerMin.toFixed(3)} %/min<br>
            Money: $${Math.round(efficiency.moneyPerMin).toLocaleString()} /min<br><br>

            <strong>Per Hour:</strong><br>
            Rank: ${efficiency.percentPerHour.toFixed(3)} %/hour<br>
            Money: $${Math.round(efficiency.moneyPerHour).toLocaleString()} /hour
          </div>
        </div>

        <div class="mb-3">
          <h6>Total Progress</h6>
          <div class="small">
            Rank Gain: +${efficiency.totalPercentGain.toFixed(2)}%<br>
            Money Gain: +$${efficiency.totalMoneyGain.toLocaleString()}<br>
            Time Tracked: ${efficiency.totalTimeHours.toFixed(2)} hours
          </div>
        </div>
      `;
    } else {
      statsHTML += `<div class="text-warning">Start automation to begin efficiency tracking.</div>`;
    }

    // Create a simple alert with the stats
    alert(`TMN Efficiency Stats:\n\n${statsHTML.replace(/<[^>]*>/g, '\n').replace(/\n+/g, '\n').trim()}`);
  }

  // ---------------------------
  // Main Loop (WITH JAIL CHECKS ON EVERY PAGE)
  // ---------------------------
function mainLoop() {
    // Tab Manager: STRICT single-tab enforcement
    // Always re-check master status to handle tab switches
    const wasMaster = tabManager.isMasterTab;
    tabManager.checkMasterStatus();

    if (!tabManager.isMasterTab) {
      // Not the master tab - do NOT run any automation
      if (wasMaster) {
        console.log('[TMN] Lost master status - stopping automation in this tab');
      }
      updateStatus("⏸ Secondary tab - automation runs in first tab only");
      setTimeout(mainLoop, 3000); // Check less frequently as secondary
      return;
    }

    if (automationPaused) {
      setTimeout(mainLoop, 2000);
      return;
    }

    // Check for Telegram notifications
    checkForCaptcha();
    checkForNewMessages();
    checkForSqlScriptCheck();
    checkForLogout();
    checkForLowHealth();

    // Check for stuck actions before anything else
    checkForNavigationInterruption();

    // Handle script check page with auto-resume
    if (isOnCaptchaPage()) {
      if (autoResumeConfig.enabled) {
        updateStatus("Script Check detected - Auto-resume monitoring...");
        localStorage.setItem(LS_SCRIPT_CHECK_ACTIVE, "true");
        startScriptCheckMonitor();
      } else {
        updateStatus("Script Check detected - All automation PAUSED");
      }
      setTimeout(mainLoop, 2000);
      return;
    } else {
      // Clear script check flag if we're no longer on the page
      if (localStorage.getItem(LS_SCRIPT_CHECK_ACTIVE) === "true") {
        localStorage.removeItem(LS_SCRIPT_CHECK_ACTIVE);
        scriptCheckMonitorActive = false;
        console.log('[TMN] Script check cleared - resuming normal operation');
      }
    }

    // Check if stats collection is needed (low priority - runs between other actions)
    if (shouldCollectStats() && !state.isPerformingAction) {
      collectStatistics();
    }

    if (!state.playerName) {
      getPlayerName();
      setTimeout(mainLoop, 3000);
      return;
    }

    // CRITICAL: Check jail state on EVERY page, not just jail page
    checkJailStateOnAnyPage();

    // Update efficiency tracking (non-blocking)
    try {
      efficiencyTracker.update();
    } catch (e) {
      console.warn('Efficiency tracking error:', e);
    }

    // Check health and buy if needed (high priority - runs before other actions)
    if (state.autoHealth && !state.isPerformingAction) {
      checkAndBuyHealth();
      // If we're buying health, wait for it to complete
      if (state.buyingHealth) {
        setTimeout(mainLoop, 2000);
        return;
      }
    }

    if (!state.isPerformingAction) {
      const currentPage = getCurrentPage();
      const now = Date.now();

      if (!state.autoCrime && !state.autoGTA && !state.autoBooze && !state.autoJail && !state.autoGarage && !state.autoHealth) {
        if (now % 30000 < 2000) {
          updateStatus("Idle - no automation enabled");
        }
        setTimeout(mainLoop, 5000);
        return;
      }

      // Handle jail state properly
      if (state.inJail) {
        // When jailed, only check for release periodically
        if (now - state.lastJailCheck > config.jailCheckInterval * 1000) {
          state.lastJailCheck = now;
          saveState();
          updateStatus("In jail - checking for release...");
          safeNavigate('/authenticated/jail.aspx?' + Date.now());
        } else {
          updateStatus(`IN JAIL - waiting for release${state.pendingAction ? ` (will resume ${state.pendingAction})` : ''}`);
        }
      } else {
        // Player is free - proceed with actions
        const shouldDoCrime = state.autoCrime && (now - state.lastCrime >= config.crimeInterval * 1000);
        const shouldDoGTA = state.autoGTA && (now - state.lastGTA >= config.gtaInterval * 1000);
        const shouldDoBooze = state.autoBooze && (now - state.lastBooze >= config.boozeInterval * 1000);
        const shouldDoJailbreak = state.autoJail && (now - state.lastJail >= config.jailbreakInterval * 1000);
        const shouldDoGarage = state.autoGarage && (now - state.lastGarage >= config.garageInterval * 1000);

        // Check if we have a pending action from being jailed
        if (state.pendingAction) {
          updateStatus(`Resuming pending action: ${state.pendingAction}`);
          if (state.pendingAction === 'crime' && shouldDoCrime) {
            if (currentPage === 'crimes') {
              doCrime();
            } else {
              updateStatus("Navigating to crimes page to resume pending action...");
              safeNavigate('/authenticated/crimes.aspx?' + Date.now());
            }
            return;
          } else if (state.pendingAction === 'gta' && shouldDoGTA) {
            if (currentPage === 'gta') {
              doGTA();
            } else {
              updateStatus("Navigating to GTA page to resume pending action...");
              safeNavigate('/authenticated/crimes.aspx?p=g&' + Date.now());
            }
            return;
          } else if (state.pendingAction === 'booze' && shouldDoBooze) {
            if (currentPage === 'booze') {
              doBooze();
            } else {
              updateStatus("Navigating to booze page to resume pending action...");
              safeNavigate('/authenticated/crimes.aspx?p=b&' + Date.now());
            }
            return;
          } else {
            // Pending action no longer relevant
            state.pendingAction = '';
            saveState();
          }
        }

        // Garage runs on a separate longer interval, doesn't block other actions
        // Only navigate to garage if nothing else is due
        const garageOverdue = state.autoGarage && (now - state.lastGarage >= config.garageInterval * 1000);
        if (garageOverdue && currentPage === 'garage') {
          doGarage();
          // Don't return - let mainLoop continue to schedule next iteration
        }

        // Priority handling for overlapping timers
        if (shouldDoCrime && shouldDoGTA) {
          const crimeReadyTime = state.lastCrime + config.crimeInterval * 1000;
          const gtaReadyTime = state.lastGTA + config.gtaInterval * 1000;

          if (crimeReadyTime <= gtaReadyTime) {
            if (currentPage === 'crimes') {
              doCrime();
            } else {
              updateStatus("Navigating to crimes page (priority)...");
              safeNavigate('/authenticated/crimes.aspx?' + Date.now());
            }
          } else {
            if (currentPage === 'gta') {
              doGTA();
            } else {
              updateStatus("Navigating to GTA page (priority)...");
              safeNavigate('/authenticated/crimes.aspx?p=g&' + Date.now());
            }
          }
        } else if (shouldDoCrime) {
          if (currentPage === 'crimes') {
            doCrime();
          } else {
            updateStatus("Navigating to crimes page...");
            safeNavigate('/authenticated/crimes.aspx?' + Date.now());
          }
        } else if (shouldDoGTA) {
          if (currentPage === 'gta') {
            doGTA();
          } else {
            updateStatus("Navigating to GTA page...");
            safeNavigate('/authenticated/crimes.aspx?p=g&' + Date.now());
          }
        } else if (shouldDoBooze) {
          if (currentPage === 'booze') {
            doBooze();
          } else {
            updateStatus("Navigating to booze page...");
            safeNavigate('/authenticated/crimes.aspx?p=b&' + Date.now());
          }
        } else if (shouldDoJailbreak) {
          if (currentPage === 'jail') {
            doJailbreak();
          } else if (state.autoJail) {
            updateStatus("Navigating to jail page to break others out...");
            safeNavigate('/authenticated/jail.aspx?' + Date.now());
          }
        } else if (shouldDoGarage) {
          // Garage runs at lowest priority - only when nothing else is due
          if (currentPage === 'garage') {
            doGarage();
          } else {
            updateStatus("Navigating to garage (scheduled)...");
            safeNavigate('/authenticated/playerproperty.aspx?p=g&' + Date.now());
          }
        } else {
          const crimeRemaining = Math.ceil((config.crimeInterval * 1000 - (now - state.lastCrime)) / 1000);
          const gtaRemaining = Math.ceil((config.gtaInterval * 1000 - (now - state.lastGTA)) / 1000);
          const boozeRemaining = Math.ceil((config.boozeInterval * 1000 - (now - state.lastBooze)) / 1000);
          const jailRemaining = Math.ceil((config.jailbreakInterval * 1000 - (now - state.lastJail)) / 1000);
          const garageRemainingSec = Math.ceil((config.garageInterval * 1000 - (now - state.lastGarage)) / 1000);
          const garageRemainingMin = Math.ceil(garageRemainingSec / 60);

          if (crimeRemaining > 0 || gtaRemaining > 0 || boozeRemaining > 0 || jailRemaining > 0 || garageRemainingSec > 0) {
            const pendingInfo = state.pendingAction ? `, Pending: ${state.pendingAction}` : '';
            updateStatus(`Crime ${crimeRemaining}s, GTA ${gtaRemaining}s, Booze ${boozeRemaining}s, Jail ${jailRemaining}s, Garage ${garageRemainingMin}m${pendingInfo}`);
          }
        }
      }
    }

    setTimeout(mainLoop, 2000);
  }

  // ---------------------------
  // Initialize
  // ---------------------------
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    // Initialize Tab Manager - check if we should be the master tab
    const isMaster = tabManager.checkMasterStatus();
    if (!isMaster && tabManager.hasActiveMaster()) {
      console.log('[TMN] Another tab is already running automation');
    }

    createScopedUI();

    // Start DTM/OC timer updates
    startTimerUpdates();

    // Show appropriate status based on tab status
    if (tabManager.isMasterTab) {
      updateStatus("TMN Auto v12.10 loaded - Master tab (single tab mode)");
    } else {
      updateStatus("⏸ Secondary tab - close this tab or it will remain inactive");
    }

    // Check jail state immediately on startup
    checkJailStateOnAnyPage();

    // Handle page unload - release master status
    window.addEventListener('beforeunload', () => {
      tabManager.releaseMaster();
    });

    // Cross-tab synchronization for running state
    window.addEventListener('storage', (e) => {
      if (e.key === LS_TAB_MASTER) {
        // Master tab changed - recheck our status
        tabManager.checkMasterStatus();
      }
    });

    setTimeout(() => {
      state.lastJailCheck = 0;
      mainLoop();
    }, 1500);
  }

  init();

})();