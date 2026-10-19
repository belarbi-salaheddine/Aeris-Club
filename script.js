/* ============================================================
   AERIS CLUB ORAN 1 · Professional Script
   ============================================================
   Features:
     - Google Sheets integration via Apps Script
     - Live dashboard with Chart.js
     - Exam dates displayed as raw text (no parsing)
     - Form validation + feedback
     - Mobile menu + smooth scroll
     - Active nav link on scroll
     - XSS protection
     - Retry logic for network failures
   Version: 7.0
   Developer: SalahDevDZ
   ============================================================ */

'use strict';

/* ============================================================
   1. CONFIGURATION
   ============================================================ */
const CONFIG = Object.freeze({
  // ⚠️ Replace with your deployed Google Apps Script URL
  webAppUrl: 'https://script.google.com/macros/s/AKfycbxoOCla_kyKJub-U-YwB398oN61QOezCn7_8ifm7YHwkupkuuviDTIseTQjChIOlmYCWg/exec',
  
  // Retry policy for network requests
  retry: {
    maxAttempts: 3,
    delayMs: 800,
  },

  // Social links
  social: {
    instagram: 'https://www.instagram.com/aeris_club/',
    tiktok:    'https://www.tiktok.com/@aeris_club',
    facebook:  'https://www.facebook.com/aerisclub',
  },

  // Developer info
  developer: {
    name: 'SalahDevDZ',
    website: 'https://salahdevdz.great-site.net/',
  },

  // Week days – canonical order
  weekDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],

  // Brand colors for charts (matches styles.css tokens)
  colors: {
    forest:    '#1C6232',
    forestLight: '#2A7A42',
    pine:      '#143A1F',
    ochre:     '#C7A35B',
    slate:     '#6D8594',
    cream:     '#F4F1E4',
    // Chart palette – derived from brand + subtle accents
    palette: [
      '#1C6232', '#2A7A42', '#3B8B54', '#5AA46E',
      '#C7A35B', '#B8924A', '#6D8594', '#8AA0AC',
    ],
  },
});

/* ============================================================
   2. DOM REFERENCES (with null safety)
   ============================================================ */
const $ = (id) => document.getElementById(id);

const DOM = {
  // Navigation
  navbar:            $('navbar'),
  mobileMenuToggle:  $('mobileMenuToggle'),
  navLinks:          $('navLinks'),
  scrollToFormBtn:   $('scrollToForm'),

  // Hero
  heroCtaBtn:        $('heroCtaBtn'),
  exploreBtn:        $('exploreBtn'),

  // Form
  availabilityForm:  $('availabilityForm'),
  formFeedback:      $('formFeedback'),
  submitFormBtn:     $('submitFormBtn'),

  // Dashboard – stats
  totalMembers:      $('totalMembers'),
  specialtyCount:    $('specialtyCount'),
  avgAvailability:   $('avgAvailability'),
  activeOrganizers:  $('activeOrganizers'),

  // Dashboard – charts
  specialtyChart:    $('specialtyChart'),
  availabilityChart: $('availabilityChart'),
  heatmapContainer:  $('heatmapContainer'),
  bestDatesContainer:$('bestDatesContainer'),
};

/* ============================================================
   3. UTILITIES
   ============================================================ */

/**
 * Escape HTML to prevent XSS injection.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * Delay promise for retry logic.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize a string to compare days safely.
 * @param {string} s
 * @returns {string}
 */
function norm(s) {
  return String(s || '').trim().toLowerCase();
}

/* ============================================================
   4. DATA STORE
   ============================================================ */
class AerisDataStore {
  constructor() {
    /** @type {Array<Object>} */
    this.members = [];
    /** @type {boolean} */
    this.isLoading = false;
    /** @type {string|null} */
    this.lastError = null;
  }

  /* ---------- FETCH ---------- */
  async fetchMembers() {
    if (this.isLoading) return this.members;
    this.isLoading = true;
    this.lastError = null;

    for (let attempt = 1; attempt <= CONFIG.retry.maxAttempts; attempt++) {
      try {
        const response = await fetch(`${CONFIG.webAppUrl}?t=${Date.now()}`, {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        if (data && data.success && Array.isArray(data.data)) {
          this.members = data.data.map(this._normalizeMember);
          this.isLoading = false;
          return this.members;
        }

        // No data but no error
        this.members = [];
        this.isLoading = false;
        return this.members;
      } catch (err) {
        this.lastError = err.message;
        console.warn(`Fetch attempt ${attempt} failed:`, err.message);
        if (attempt < CONFIG.retry.maxAttempts) {
          await wait(CONFIG.retry.delayMs * attempt);
        }
      }
    }

    // All attempts failed
    this.members = [];
    this.isLoading = false;
    return this.members;
  }

  /**
   * Normalize a raw row from Google Sheets.
   * @param {Object} row
   * @returns {Object}
   */
  _normalizeMember(row) {
    const pick = (...keys) => {
      for (const k of keys) {
        if (row[k] != null && row[k] !== '') return row[k];
      }
      return '';
    };

    const rawDays = pick('available_days', 'Available Days', 'availableDays');
    const availableDays = typeof rawDays === 'string' && rawDays
      ? rawDays.split(',').map((d) => d.trim()).filter(Boolean)
      : Array.isArray(rawDays) ? rawDays : [];

    return {
      fullName:       pick('full_name', 'Full Name', 'fullName'),
      specialty:      pick('specialty', 'Specialty'),
      academicYear:   pick('academic_year', 'Academic Year', 'academicYear'),
      role:           pick('role', 'Role'),
      examDates:      pick('exam_dates', 'Exam Dates', 'examDates'),
      availableDays,
      preferredTime:  pick('preferred_time', 'Preferred Time', 'preferredTime'),
      volunteering:   pick('volunteering', 'Volunteering'),
    };
  }

  /* ---------- ADD ---------- */
  async addMember(memberData) {
    const formData = new FormData();
    formData.append('fullName',      memberData.fullName);
    formData.append('specialty',     memberData.specialty);
    formData.append('academicYear',  memberData.academicYear);
    formData.append('role',          memberData.role);
    formData.append('examDates',     memberData.examDates);
    formData.append('availableDays', memberData.availableDays.join(', '));
    formData.append('preferredTime', memberData.preferredTime);
    formData.append('volunteering',  memberData.volunteering);

    const response = await fetch(CONFIG.webAppUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    // Refresh cache
    await this.fetchMembers();
  }

  /* ---------- STATS ---------- */
  getStatistics() {
    const total = this.members.length;
    const specialties = new Set(
      this.members.map((m) => m.specialty).filter(Boolean)
    );
    const totalDays = this.members.reduce(
      (sum, m) => sum + m.availableDays.length,
      0
    );
    const avgPercent =
      total > 0
        ? Math.min(100, Math.round((totalDays / total / 7) * 100))
        : 0;
    const organizers = this.members.filter(
      (m) => m.role && /organizer|leader/i.test(m.role)
    ).length;

    return {
      total,
      specialties: specialties.size,
      avgPercent,
      organizers,
    };
  }

  getSpecialtyDistribution() {
    const dist = {};
    this.members.forEach((m) => {
      const s = m.specialty || 'Unknown';
      dist[s] = (dist[s] || 0) + 1;
    });
    return dist;
  }

  getAvailabilityByDay() {
    const count = {};
    CONFIG.weekDays.forEach((day) => {
      count[day] = this.members.filter((m) =>
        m.availableDays.some((d) => norm(d) === norm(day))
      ).length;
    });
    return count;
  }

  /**
   * Raw exam dates – displayed exactly as students wrote them.
   * @returns {Array<{student:string, examDates:string, specialty:string}>}
   */
  getExamDatesList() {
    return this.members
      .filter((m) => m.examDates && m.examDates.trim() !== '')
      .map((m) => ({
        student: m.fullName || 'Anonymous',
        examDates: m.examDates.trim(),
        specialty: m.specialty || '—',
      }));
  }

  getBestDates(limit = 3) {
    const dayData = this.getAvailabilityByDay();
    const total = this.members.length || 1;
    return Object.entries(dayData)
      .map(([day, count]) => ({
        day,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}

const dataStore = new AerisDataStore();

/* ============================================================
   5. CHART INSTANCES (cached for destroy/recreate)
   ============================================================ */
let specialtyChartInstance = null;
let availabilityChartInstance = null;

/* ============================================================
   6. DASHBOARD RENDERERS
   ============================================================ */

function updateDashboardStats() {
  const stats = dataStore.getStatistics();

  if (DOM.totalMembers)     DOM.totalMembers.textContent = stats.total;
  if (DOM.specialtyCount)   DOM.specialtyCount.textContent = stats.specialties;
  if (DOM.avgAvailability)  DOM.avgAvailability.textContent = `${stats.avgPercent}%`;
  if (DOM.activeOrganizers) DOM.activeOrganizers.textContent = stats.organizers;

  updateSpecialtyChart();
  updateAvailabilityChart();
  updateHeatmap();
  updateBestDates();
}

/* ---------- SPECIALTY DOUGHNUT ---------- */
function updateSpecialtyChart() {
  if (!DOM.specialtyChart || typeof Chart === 'undefined') return;

  const ctx = DOM.specialtyChart.getContext('2d');
  const data = dataStore.getSpecialtyDistribution();
  const labels = Object.keys(data);
  const values = Object.values(data);

  if (specialtyChartInstance) {
    specialtyChartInstance.destroy();
    specialtyChartInstance = null;
  }

  // Empty state
  if (labels.length === 0) {
    specialtyChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['No data'],
        datasets: [{
          data: [1],
          backgroundColor: [CONFIG.colors.cream],
          borderColor: [CONFIG.colors.slate],
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
    return;
  }

  specialtyChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: CONFIG.colors.palette,
        borderColor: CONFIG.colors.cream,
        borderWidth: 2,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 14,
            usePointStyle: true,
            pointStyle: 'circle',
            font: { size: 11, family: 'Montserrat, sans-serif' },
            color: CONFIG.colors.pine,
          },
        },
        tooltip: {
          backgroundColor: CONFIG.colors.pine,
          titleFont: { family: 'Montserrat, sans-serif' },
          bodyFont:  { family: 'Montserrat, sans-serif' },
          padding: 10,
          cornerRadius: 8,
        },
      },
    },
  });
}

/* ---------- AVAILABILITY BARS ---------- */
function updateAvailabilityChart() {
  if (!DOM.availabilityChart || typeof Chart === 'undefined') return;

  const ctx = DOM.availabilityChart.getContext('2d');
  const data = dataStore.getAvailabilityByDay();

  if (availabilityChartInstance) {
    availabilityChartInstance.destroy();
    availabilityChartInstance = null;
  }

  availabilityChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(data),
      datasets: [{
        label: 'Available students',
        data: Object.values(data),
        backgroundColor: CONFIG.colors.forest,
        hoverBackgroundColor: CONFIG.colors.forestLight,
        borderRadius: 8,
        maxBarThickness: 42,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: CONFIG.colors.pine,
          padding: 10,
          cornerRadius: 8,
          titleFont: { family: 'Montserrat, sans-serif' },
          bodyFont:  { family: 'Montserrat, sans-serif' },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: CONFIG.colors.pine,
            font: { family: 'Montserrat, sans-serif', size: 10 },
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            precision: 0,
            color: CONFIG.colors.pine,
            font: { family: 'Montserrat, sans-serif', size: 10 },
          },
          grid: { color: 'rgba(28, 98, 50, 0.08)' },
        },
      },
    },
  });
}

/* ---------- EXAM DATES (raw text, no parsing) ---------- */
function updateHeatmap() {
  if (!DOM.heatmapContainer) return;

  const examList = dataStore.getExamDatesList();

  // Empty state
  if (examList.length === 0) {
    DOM.heatmapContainer.innerHTML = `
      <div class="heatmap-empty">
        <i class="fas fa-calendar-times" aria-hidden="true"></i>
        <p>No exam dates submitted yet.</p>
        <small>Submit the form to see exam periods here.</small>
      </div>`;
    return;
  }

  // Render each exam entry as a card
  const cards = examList.map((item, index) => `
    <div class="exam-item" style="--exam-tint: ${0.06 + (index % 3) * 0.03}">
      <div class="exam-icon" aria-hidden="true">
        <i class="fas fa-calendar-alt"></i>
      </div>
      <div class="exam-body">
        <strong class="exam-student">${escapeHTML(item.student)}</strong>
        <span class="exam-date">
          <i class="fas fa-calendar-day" aria-hidden="true"></i>
          ${escapeHTML(item.examDates)}
        </span>
        <small class="exam-specialty">${escapeHTML(item.specialty)}</small>
      </div>
    </div>
  `).join('');

  const summary = `
    <div class="exam-summary">
      <i class="fas fa-info-circle" aria-hidden="true"></i>
      <strong>${examList.length}</strong>
      student${examList.length !== 1 ? 's have' : ' has'} submitted exam dates
    </div>`;

  DOM.heatmapContainer.innerHTML = cards + summary;
}

/* ---------- BEST DATES ---------- */
function updateBestDates() {
  if (!DOM.bestDatesContainer) return;

  const dates = dataStore.getBestDates();
  const hasData = dates.length > 0 && dates[0].count > 0;

  if (!hasData) {
    DOM.bestDatesContainer.innerHTML = `
      <div class="best-dates-empty">
        <i class="fas fa-hourglass-half" aria-hidden="true"></i>
        <p>Not enough data yet.</p>
        <small>Submit your availability to see the best dates.</small>
      </div>`;
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  DOM.bestDatesContainer.innerHTML = dates.map((d, i) => `
    <div class="best-date-row">
      <span class="best-date-medal" aria-hidden="true">${medals[i] || '•'}</span>
      <div class="best-date-info">
        <strong>${escapeHTML(d.day)}</strong>
        <small>${d.count} student${d.count !== 1 ? 's' : ''} · ${d.percentage}%</small>
      </div>
    </div>
  `).join('');
}

/* ============================================================
   7. FORM HANDLING
   ============================================================ */

async function handleFormSubmit(event) {
  event.preventDefault();

  // Collect values
  const fullName      = $('fullName')?.value.trim();
  const specialty     = $('specialty')?.value;
  const academicYear  = $('academicYear')?.value;
  const role          = $('role')?.value;
  const examDates     = $('examDates')?.value.trim();
  const preferredTime = $('preferredTime')?.value;
  const volunteering  = $('volunteering')?.value;

  const availableDays = Array.from(
    document.querySelectorAll('input[name="availableDays"]:checked')
  ).map((cb) => cb.value);

  // Validation
  if (!fullName || !specialty || !academicYear || !role ||
      !examDates || availableDays.length === 0 ||
      !preferredTime || !volunteering) {
    showFeedback('Please fill in all required fields.', 'error');
    return;
  }

  // UI: loading state
  const btn = DOM.submitFormBtn;
  const originalHTML = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;
  }

  try {
    await dataStore.addMember({
      fullName, specialty, academicYear, role,
      examDates, availableDays, preferredTime, volunteering,
    });

    showFeedback('Saved successfully! Redirecting to dashboard…', 'success');
    DOM.availabilityForm?.reset();
    document.querySelectorAll('input[name="availableDays"]').forEach(
      (cb) => (cb.checked = false)
    );

    updateDashboardStats();

    setTimeout(() => {
      $('dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 800);
  } catch (err) {
    showFeedback(`Error: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }
  }
}

function showFeedback(message, type = 'success') {
  if (!DOM.formFeedback) return;

  DOM.formFeedback.textContent = message;
  DOM.formFeedback.className = `form-feedback ${type}`;

  clearTimeout(showFeedback._timer);
  showFeedback._timer = setTimeout(() => {
    if (!DOM.formFeedback) return;
    DOM.formFeedback.textContent = '';
    DOM.formFeedback.className = 'form-feedback';
  }, 5000);
}

/* ============================================================
   8. NAVIGATION
   ============================================================ */

function toggleMobileMenu() {
  if (!DOM.navLinks) return;
  const isOpen = DOM.navLinks.classList.toggle('mobile-open');
  if (DOM.mobileMenuToggle) {
    DOM.mobileMenuToggle.setAttribute('aria-expanded', String(isOpen));
    const icon = DOM.mobileMenuToggle.querySelector('i');
    if (icon) icon.className = isOpen ? 'fas fa-times' : 'fas fa-bars';
  }
}

function closeMobileMenu() {
  if (!DOM.navLinks) return;
  DOM.navLinks.classList.remove('mobile-open');
  if (DOM.mobileMenuToggle) {
    DOM.mobileMenuToggle.setAttribute('aria-expanded', 'false');
    const icon = DOM.mobileMenuToggle.querySelector('i');
    if (icon) icon.className = 'fas fa-bars';
  }
}

function updateActiveNavLink() {
  const sections = document.querySelectorAll('section[id]');
  const scrollY = window.scrollY + 120;
  let current = '';

  sections.forEach((section) => {
    if (scrollY >= section.offsetTop &&
        scrollY < section.offsetTop + section.offsetHeight) {
      current = section.id;
    }
  });

  document.querySelectorAll('.nav-links a').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
  });
}

function handleScroll() {
  if (DOM.navbar) {
    DOM.navbar.classList.toggle('scrolled', window.scrollY > 10);
  }
  updateActiveNavLink();
}

function smoothScrollTo(id) {
  const el = $(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   9. INITIALIZATION
   ============================================================ */

function initEvents() {
  // Mobile menu
  DOM.mobileMenuToggle?.addEventListener('click', toggleMobileMenu);

  // Close menu on nav link click
  document.querySelectorAll('.nav-links a').forEach((link) => {
    link.addEventListener('click', closeMobileMenu);
  });

  // Scroll spy + navbar shadow
  window.addEventListener('scroll', handleScroll, { passive: true });

  // Form
  DOM.availabilityForm?.addEventListener('submit', handleFormSubmit);

  // CTA buttons
  DOM.scrollToFormBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    smoothScrollTo('form-section');
  });

  DOM.heroCtaBtn?.addEventListener('click', () => smoothScrollTo('form-section'));
  DOM.exploreBtn?.addEventListener('click', () => smoothScrollTo('dashboard'));

  // Escape key closes menu
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileMenu();
  });

  // Refresh data when tab regains focus (e.g. after form submission elsewhere)
  window.addEventListener('focus', async () => {
    if (document.hidden) return;
    await dataStore.fetchMembers();
    updateDashboardStats();
  });
}

async function init() {
  // Console signature
  console.log(
    '%c🪶 AERIS CLUB ORAN 1%c\n"Free Mind, High Ambition."\nDeveloped by ' +
      CONFIG.developer.name,
    'font-size:16px;font-weight:bold;color:#1C6232;',
    'color:#143A1F;'
  );

  initEvents();

  // Initial data load
  await dataStore.fetchMembers();
  updateDashboardStats();

  console.log(`✅ Ready · ${dataStore.members.length} members loaded`);
}

document.addEventListener('DOMContentLoaded', init);
