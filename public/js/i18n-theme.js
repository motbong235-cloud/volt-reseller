/* VOLT — language (km/en) + theme (light/dark) */
(function () {
  const I18N = {
    en: {
      nav_shop: 'Shop',
      nav_api: 'API',
      nav_reseller: 'Reseller',
      nav_login: 'Login',
      nav_admin: 'Admin',
      hero_title: 'Game top-up supply for resellers',
      hero_lead: 'One wallet. One REST API. Order diamonds and UC from your website or Telegram bot.',
      hero_docs: 'Read the API',
      hero_dash: 'Open dashboard',
      meta_rest: 'REST · Bearer key',
      meta_idem: 'Safe retries via reference',
      meta_refund: 'Failed delivery returned',
      section_features: 'What you get',
      feat1_t: 'Catalog API',
      feat1_d: 'List games and packages at your cost.',
      feat2_t: 'Order + status',
      feat2_d: 'POST an order, poll until success or refund.',
      feat3_t: 'Prepaid wallet',
      feat3_d: 'Balance checked server-side. No payment bypass.',
      section_ep: 'Core endpoints',
      footer: 'VOLT · Wholesale top-up',
      tab_games: 'Games',
      tab_order: 'Order',
      tab_track: 'Track',
      tab_login: 'Telegram',
      tab_api: 'API',
      pick_game: 'Choose a game',
      player_id: 'Player / User ID',
      server_id: 'Server / Zone',
      api_key: 'API key (reseller)',
      btn_order: 'Place order',
      track_order: 'Order ID',
      btn_track: 'Check',
      login_title: 'Sign in',
      login_sub: 'Email + password · secure session',
      reg_title: 'Create account',
      reg_sub: 'Name, email, strong password',
      name: 'Name',
      email: 'Email',
      password: 'Password',
      btn_signin: 'Sign in',
      btn_register: 'Register',
      tab_login_btn: 'Login',
      tab_reg_btn: 'Register',
      pw_hint: 'At least 8 characters, include a letter and a number.',
    },
    km: {
      nav_shop: 'ហាង',
      nav_api: 'API',
      nav_reseller: 'Reseller',
      nav_login: 'ចូល',
      nav_admin: 'Admin',
      hero_title: 'ផ្គត់ផ្គង់ top-up ហ្គេមសម្រាប់ reseller',
      hero_lead: 'Wallet មួយ · API មួយ។ បញ្ជាទិញ diamond / UC ពី website ឬ Telegram bot របស់អ្នក។',
      hero_docs: 'មើល API',
      hero_dash: 'Dashboard',
      meta_rest: 'REST · Bearer key',
      meta_idem: 'ចុចស្ទួនមិនគិតលុយពីរ',
      meta_refund: 'បរាជ័យ → សងលុយវិញ',
      section_features: 'អ្វីដែលអ្នកទទួលបាន',
      feat1_t: 'Catalog API',
      feat1_d: 'បញ្ជីហ្គេម និងកញ្ចប់តម្លៃ wholesale។',
      feat2_t: 'Order + status',
      feat2_d: 'បញ្ជាទិញ រួចតាមដានរហូតជោគជ័យ ឬសងលុយ។',
      feat3_t: 'Prepaid wallet',
      feat3_d: 'ពិនិត្យ balance ផ្នែក server។ មិន bypass ការបង់។',
      section_ep: 'Endpoint សំខាន់',
      footer: 'VOLT · Wholesale top-up',
      tab_games: 'ហ្គេម',
      tab_order: 'បញ្ជាទិញ',
      tab_track: 'តាមដាន',
      tab_login: 'Telegram',
      tab_api: 'API',
      pick_game: 'ជ្រើសហ្គេម',
      player_id: 'Player / User ID',
      server_id: 'Server / Zone',
      api_key: 'API key (reseller)',
      btn_order: 'បញ្ជាទិញ',
      track_order: 'Order ID',
      btn_track: 'ពិនិត្យ',
      login_title: 'ចូលគណនី',
      login_sub: 'Email + password · សុវត្ថិភាព',
      reg_title: 'បង្កើតគណនី',
      reg_sub: 'ឈ្មោះ · email · ពាក្យសម្ងាត់រឹង',
      name: 'ឈ្មោះ',
      email: 'Email',
      password: 'ពាក្យសម្ងាត់',
      btn_signin: 'ចូល',
      btn_register: 'ចុះឈ្មោះ',
      tab_login_btn: 'ចូល',
      tab_reg_btn: 'ចុះឈ្មោះ',
      pw_hint: 'យ៉ាងតិច 8 តួ · មានអក្សរ និងលេខ។',
    },
  };

  function getLang() {
    return localStorage.getItem('volt_lang') === 'en' ? 'en' : 'km';
  }
  function getTheme() {
    return localStorage.getItem('volt_theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('volt_theme', theme);
    document.querySelectorAll('[data-theme-toggle]').forEach((el) => {
      el.textContent = theme === 'dark' ? '☀' : '☾';
      el.setAttribute('title', theme === 'dark' ? 'Light' : 'Dark');
    });
  }

  function applyLang(lang) {
    localStorage.setItem('volt_lang', lang);
    document.documentElement.setAttribute('lang', lang === 'km' ? 'km' : 'en');
    const dict = I18N[lang] || I18N.km;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (dict[key] != null) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key] != null) el.setAttribute('placeholder', dict[key]);
    });
    document.querySelectorAll('[data-lang-toggle]').forEach((el) => {
      el.textContent = lang === 'km' ? 'EN' : 'ខ្មែរ';
    });
  }

  function mountControls() {
    document.querySelectorAll('[data-lang-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyLang(getLang() === 'km' ? 'en' : 'km');
      });
    });
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
      });
    });
  }

  window.VOLT_UI = { I18N, getLang, getTheme, applyLang, applyTheme, mountControls };

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getTheme());
    applyLang(getLang());
    mountControls();
  });
})();
