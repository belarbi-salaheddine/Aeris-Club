/* ============================================
   AERIS CLUB ORAN 1 - FINAL FIXED VERSION
   Displays raw exam dates as written by students
   Developed by SalahDevDZ
   Version: 6.0 - May 7, 2026
   ============================================ */

const CONFIG = {
  webAppUrl: 'https://script.google.com/macros/s/AKfycbxoOCla_kyKJub-U-YwB398oN61QOezCn7_8ifm7YHwkupkuuviDTIseTQjChIOlmYCWg/exec',
  social: {
    instagram: 'https://www.instagram.com/aeris_club/',
    tiktok: 'https://www.tiktok.com/@aeris_club',
    facebook: 'https://www.facebook.com/aerisclub',
  },
  developer: {
    name: 'SalahDevDZ',
    website: 'https://salahdevdz.great-site.net/',
  }
};

const DOM = {
  navbar: document.getElementById('navbar'),
  mobileMenuToggle: document.getElementById('mobileMenuToggle'),
  navLinks: document.getElementById('navLinks'),
  availabilityForm: document.getElementById('availabilityForm'),
  formFeedback: document.getElementById('formFeedback'),
  scrollToFormBtn: document.getElementById('scrollToForm'),
  heroCtaBtn: document.getElementById('heroCtaBtn'),
  exploreBtn: document.getElementById('exploreBtn'),
  contactForm: document.getElementById('contactForm'),
  totalMembers: document.getElementById('totalMembers'),
  specialtyCount: document.getElementById('specialtyCount'),
  avgAvailability: document.getElementById('avgAvailability'),
  activeOrganizers: document.getElementById('activeOrganizers'),
  specialtyChart: document.getElementById('specialtyChart'),
  availabilityChart: document.getElementById('availabilityChart'),
  heatmapContainer: document.getElementById('heatmapContainer'),
  bestDatesContainer: document.getElementById('bestDatesContainer'),
};

// ========== DATA STORE ==========
class AerisDataStore {
  constructor() {
    this.members = [];
  }

  async fetchMembers() {
    try {
      const response = await fetch(CONFIG.webAppUrl);
      const data = await response.json();
      
      if (data.success && data.data) {
        this.members = data.data.map(row => {
          const availableDaysStr = row.available_days || row['Available Days'] || row.availableDays || '';
          const availableDays = availableDaysStr ? 
            String(availableDaysStr).split(',').map(d => d.trim()).filter(d => d) : [];
          
          return {
            fullName: row.full_name || row['Full Name'] || row.fullName || '',
            specialty: row.specialty || row['Specialty'] || '',
            academicYear: row.academic_year || row['Academic Year'] || row.academicYear || '',
            role: row.role || row['Role'] || '',
            examDates: row.exam_dates || row['Exam Dates'] || row.examDates || '',
            availableDays: availableDays,
            preferredTime: row.preferred_time || row['Preferred Time'] || row.preferredTime || '',
            volunteering: row.volunteering || row['Volunteering'] || '',
          };
        });
        console.log('✅ Loaded', this.members.length, 'members');
      } else {
        this.members = [];
      }
      return this.members;
    } catch (error) {
      console.error('Fetch error:', error);
      this.members = [];
      return [];
    }
  }

  async addMember(memberData) {
    const formData = new FormData();
    formData.append('fullName', memberData.fullName);
    formData.append('specialty', memberData.specialty);
    formData.append('academicYear', memberData.academicYear);
    formData.append('role', memberData.role);
    formData.append('examDates', memberData.examDates);
    formData.append('availableDays', memberData.availableDays.join(', '));
    formData.append('preferredTime', memberData.preferredTime);
    formData.append('volunteering', memberData.volunteering);
    
    await fetch(CONFIG.webAppUrl, { method: 'POST', body: formData });
    await this.fetchMembers();
  }

  getStatistics() {
    const total = this.members.length;
    const specialties = [...new Set(this.members.map(m => m.specialty).filter(Boolean))];
    const totalDays = this.members.reduce((sum, m) => sum + m.availableDays.length, 0);
    const avgPercent = total > 0 ? Math.round((totalDays / total / 7) * 100) : 0;
    const organizers = this.members.filter(m => 
      m.role && (m.role.includes('Organizer') || m.role.includes('Leader'))
    ).length;
    
    return { total, specialties: specialties.length, avgPercent: Math.min(avgPercent, 100), organizers };
  }

  getSpecialtyDistribution() {
    const dist = {};
    this.members.forEach(m => {
      const s = m.specialty || 'Unknown';
      dist[s] = (dist[s] || 0) + 1;
    });
    return dist;
  }

  getAvailabilityByDay() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const count = {};
    days.forEach(day => {
      count[day] = this.members.filter(m => 
        m.availableDays.some(d => d.toLowerCase() === day.toLowerCase())
      ).length;
    });
    return count;
  }

  // ✅ الجديد: عرض النص كما هو بدون تحليل
  getExamDatesList() {
    // نجمع كل تواريخ الامتحانات كما كتبها الطلاب
    const examList = [];
    this.members.forEach(m => {
      if (m.examDates && m.examDates.trim() !== '') {
        examList.push({
          student: m.fullName,
          examDates: m.examDates.trim(),
          specialty: m.specialty,
        });
      }
    });
    return examList;
  }

  getBestDates() {
    const dayData = this.getAvailabilityByDay();
    const total = this.members.length || 1;
    return Object.entries(dayData)
      .map(([day, count]) => ({ day, count, percentage: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }
}

const dataStore = new AerisDataStore();
let specialtyChartInstance = null;
let availabilityChartInstance = null;

// ========== DASHBOARD ==========
function updateDashboardStats() {
  const stats = dataStore.getStatistics();
  if (DOM.totalMembers) DOM.totalMembers.textContent = stats.total;
  if (DOM.specialtyCount) DOM.specialtyCount.textContent = stats.specialties;
  if (DOM.avgAvailability) DOM.avgAvailability.textContent = stats.avgPercent + '%';
  if (DOM.activeOrganizers) DOM.activeOrganizers.textContent = stats.organizers;
  
  updateSpecialtyChart();
  updateAvailabilityChart();
  updateHeatmap();
  updateBestDates();
}

function updateSpecialtyChart() {
  if (!DOM.specialtyChart) return;
  const ctx = DOM.specialtyChart.getContext('2d');
  const data = dataStore.getSpecialtyDistribution();
  if (specialtyChartInstance) specialtyChartInstance.destroy();
  
  const labels = Object.keys(data);
  const values = Object.values(data);
  
  if (labels.length === 0) {
    specialtyChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['Empty'], datasets: [{ data: [1], backgroundColor: ['#E2E8F0'] }] },
      options: { plugins: { legend: { display: false } } }
    });
    return;
  }
  
  specialtyChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['#0F9D58', '#10B981', '#34D399', '#6EE7B7', '#D4AF37', '#F0D060', '#3B82F6', '#8B5CF6'],
        borderColor: '#FFF',
        borderWidth: 2,
      }]
    },
    options: {
      plugins: { legend: { position: 'bottom', labels: { padding: 15, usePointStyle: true, font: { size: 11 } } } }
    }
  });
}

function updateAvailabilityChart() {
  if (!DOM.availabilityChart) return;
  const ctx = DOM.availabilityChart.getContext('2d');
  const data = dataStore.getAvailabilityByDay();
  if (availabilityChartInstance) availabilityChartInstance.destroy();
  
  availabilityChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(data),
      datasets: [{ data: Object.values(data), backgroundColor: '#0F9D58', borderRadius: 8 }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

// ✅ عرض النص كما هو بدون تحليل
function updateHeatmap() {
  if (!DOM.heatmapContainer) return;
  
  const examList = dataStore.getExamDatesList();
  
  if (examList.length === 0) {
    DOM.heatmapContainer.innerHTML = `
      <div style="text-align:center;padding:30px;color:#94A3B8;">
        <i class="fas fa-calendar-times" style="font-size:2rem;display:block;margin-bottom:10px;opacity:0.3;"></i>
        <p>No exam dates submitted yet.</p>
        <p style="font-size:0.8rem;">Submit the form to see exam periods here.</p>
      </div>`;
    return;
  }
  
  // عرض كل تاريخ امتحان كما كتبه الطالب
  DOM.heatmapContainer.innerHTML = examList.map((item, index) => `
    <div style="
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 18px;
      margin-bottom: 10px;
      background: rgba(239, 68, 68, ${0.08 + (index % 3) * 0.04});
      border-radius: 14px;
      border-left: 4px solid #EF4444;
      transition: all 0.3s ease;
    " onmouseover="this.style.transform='translateX(5px)';this.style.boxShadow='0 4px 15px rgba(239,68,68,0.15)';"
       onmouseout="this.style.transform='translateX(0)';this.style.boxShadow='none';"
    >
      <div style="
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: #EF4444;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        flex-shrink: 0;
      ">
        <i class="fas fa-calendar-alt"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <strong style="display:block;color:#0F172A;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${escapeHTML(item.student)}
        </strong>
        <span style="color:#EF4444;font-weight:600;font-size:0.9rem;">
          📅 ${escapeHTML(item.examDates)}
        </span>
        <small style="display:block;color:#64748B;font-size:0.75rem;margin-top:2px;">
          ${escapeHTML(item.specialty)}
        </small>
      </div>
    </div>
  `).join('');
  
  // إضافة ملخص سريع
  DOM.heatmapContainer.innerHTML += `
    <div style="
      margin-top: 16px;
      padding: 10px 16px;
      background: rgba(15,157,88,0.08);
      border-radius: 10px;
      font-size: 0.85rem;
      color: #047857;
      text-align: center;
    ">
      <i class="fas fa-info-circle"></i>
      <strong>${examList.length}</strong> student(s) have submitted their exam dates
    </div>
  `;
}

// منع هجمات XSS
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function updateBestDates() {
  if (!DOM.bestDatesContainer) return;
  const dates = dataStore.getBestDates();
  
  if (dates.length === 0 || dates[0].count === 0) {
    DOM.bestDatesContainer.innerHTML = '<p style="text-align:center;color:#94A3B8;padding:30px;">Not enough data</p>';
    return;
  }
  
  const medals = ['🥇', '🥈', '🥉'];
  DOM.bestDatesContainer.innerHTML = dates.map((d, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:12px;background:rgba(15,157,88,0.08);border-radius:10px;margin-bottom:6px;border-left:4px solid #0F9D58;">
      <span style="font-size:1.3rem;">${medals[i]}</span>
      <div><strong>${d.day}</strong><br><small>${d.count} students (${d.percentage}%)</small></div>
    </div>
  `).join('');
}

// ========== FORM ==========
async function handleFormSubmit(e) {
  e.preventDefault();
  
  const fullName = document.getElementById('fullName')?.value.trim();
  const specialty = document.getElementById('specialty')?.value;
  const academicYear = document.getElementById('academicYear')?.value;
  const role = document.getElementById('role')?.value;
  const examDates = document.getElementById('examDates')?.value.trim();
  const preferredTime = document.getElementById('preferredTime')?.value;
  const volunteering = document.getElementById('volunteering')?.value;
  const availableDays = [];
  document.querySelectorAll('input[name="availableDays"]:checked').forEach(cb => availableDays.push(cb.value));
  
  if (!fullName || !specialty || !academicYear || !role || !examDates || availableDays.length === 0 || !preferredTime || !volunteering) {
    showFeedback('❌ Please fill all required fields.', 'error');
    return;
  }
  
  const btn = document.getElementById('submitFormBtn');
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  btn.disabled = true;
  
  try {
    await dataStore.addMember({ fullName, specialty, academicYear, role, examDates, availableDays, preferredTime, volunteering });
    showFeedback('✅ Saved to Google Sheets!', 'success');
    document.getElementById('availabilityForm')?.reset();
    document.querySelectorAll('input[name="availableDays"]').forEach(cb => cb.checked = false);
    updateDashboardStats();
    setTimeout(() => document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth' }), 800);
  } catch (err) {
    showFeedback('❌ Error: ' + err.message, 'error');
  } finally {
    btn.innerHTML = orig;
    btn.disabled = false;
  }
}

function showFeedback(msg, type) {
  if (!DOM.formFeedback) return;
  DOM.formFeedback.textContent = msg;
  DOM.formFeedback.className = 'form-feedback ' + type;
  setTimeout(() => { DOM.formFeedback.textContent = ''; DOM.formFeedback.className = 'form-feedback'; }, 5000);
}

// ========== NAVIGATION ==========
function toggleMobileMenu() {
  DOM.navLinks?.classList.toggle('active');
  const icon = DOM.mobileMenuToggle?.querySelector('i');
  if (icon) icon.className = DOM.navLinks?.classList.contains('active') ? 'fas fa-times' : 'fas fa-bars';
}

function updateActiveNavLink() {
  const sections = document.querySelectorAll('section[id]');
  const scrollY = window.scrollY + 120;
  let current = '';
  sections.forEach(section => {
    if (scrollY >= section.offsetTop && scrollY < section.offsetTop + section.offsetHeight) {
      current = section.getAttribute('id');
    }
  });
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === '#' + current) link.classList.add('active');
  });
}

// ========== EVENTS ==========
function initEvents() {
  DOM.mobileMenuToggle?.addEventListener('click', toggleMobileMenu);
  document.querySelectorAll('.nav-links a').forEach(l => l.addEventListener('click', () => {
    DOM.navLinks?.classList.remove('active');
    const icon = DOM.mobileMenuToggle?.querySelector('i');
    if (icon) icon.className = 'fas fa-bars';
  }));
  
  window.addEventListener('scroll', () => {
    DOM.navbar?.classList.toggle('scrolled', window.scrollY > 50);
    updateActiveNavLink();
  });
  
  DOM.availabilityForm?.addEventListener('submit', handleFormSubmit);
  DOM.scrollToFormBtn?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('form-section')?.scrollIntoView({ behavior: 'smooth' }); });
  DOM.heroCtaBtn?.addEventListener('click', () => document.getElementById('form-section')?.scrollIntoView({ behavior: 'smooth' }));
  DOM.exploreBtn?.addEventListener('click', () => document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth' }));
  DOM.contactForm?.addEventListener('submit', (e) => { e.preventDefault(); alert('📨 Sent! (Demo)'); DOM.contactForm.reset(); });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      DOM.navLinks?.classList.remove('active');
      const icon = DOM.mobileMenuToggle?.querySelector('i');
      if (icon) icon.className = 'fas fa-bars';
    }
  });
  
  window.addEventListener('focus', async () => {
    await dataStore.fetchMembers();
    updateDashboardStats();
  });
}

// ========== INIT ==========
async function init() {
  console.log('🪶 Aeris Club Oran 1');
  console.log('👨‍💻 Developed by', CONFIG.developer.name);
  console.log('💡 "Free Mind, High Ambition."');
  
  initEvents();
  await dataStore.fetchMembers();
  updateDashboardStats();
  
  console.log('✅ Ready! Members:', dataStore.getMembers().length);
}

document.addEventListener('DOMContentLoaded', init);