/**
 * SwimCoach App
 * Hash-based router + page orchestration.
 */
import { api } from '/js/api.js';
import {
  showToast,
  showLoading,
  hideLoading,
  setActiveNav,
  showPage,
  buildWorkoutCard,
  buildChatPanel,
  buildFeedbackForm,
  showAdaptiveResponse,
  escapeHtml,
} from '/js/components.js';

// ─── App State ───
const state = {
  currentProfile: null,
  profiles: [],
  customizationOptions: null,
  editingProfileId: null, // null = create mode, string = edit mode
  debugLlm: null,
};

// ─── DOM Ready ───
document.addEventListener('DOMContentLoaded', async () => {
  initRouter();
  initProfileForm();
  initGenerateForm();
  initExpandableSections();
  initHistoryPage();
  initDebugPage();

  // Load customization options for generate page
  await loadCustomizationOptions();

  // Load all profiles and restore last selected
  await loadAllProfiles();

  const savedProfileId = localStorage.getItem('swimcoach_profile_id');
  if (savedProfileId) {
    const found = state.profiles.find(p => p._id === savedProfileId);
    if (found) {
      state.currentProfile = found;
      fillProfileForm(found);
      updateProfileDropdown();
      updateProfileList();
    } else {
      try {
        const result = await api.profiles.get(savedProfileId);
        state.currentProfile = result.data;
        state.profiles.push(result.data);
        fillProfileForm(result.data);
        updateProfileDropdown();
        updateProfileList();
      } catch {
        localStorage.removeItem('swimcoach_profile_id');
      }
    }
  }
});

// ─── Router ───

function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

function handleRoute() {
  const hash = window.location.hash.slice(1) || 'profile';
  const [page, ...rest] = hash.split('/');

  switch (page) {
    case 'profile':
      showPage('profile');
      setActiveNav('profile');
      break;

    case 'generate':
      if (!state.currentProfile) {
        showToast(state.profiles.length > 0 ? 'Please select a profile from the dropdown.' : 'Please create a profile first.', 'error');
        navigateTo('profile');
        return;
      }
      showPage('generate');
      setActiveNav('generate');
      prefillGenerateForm();
      break;

    case 'workout':
      if (!state.currentProfile) {
        showToast(state.profiles.length > 0 ? 'Please select a profile from the dropdown.' : 'Please create a profile first.', 'error');
        navigateTo('profile');
        return;
      }
      const workoutId = rest[0];
      if (workoutId) {
        loadWorkoutPage(workoutId);
      } else {
        showToast('No workout ID provided.', 'error');
        navigateTo('generate');
      }
      break;

    case 'history':
      if (!state.currentProfile) {
        showToast(state.profiles.length > 0 ? 'Please select a profile from the dropdown.' : 'Please create a profile first.', 'error');
        navigateTo('profile');
        return;
      }
      showPage('history');
      setActiveNav('history');
      loadHistoryPage();
      break;

    case 'program':
      if (!state.currentProfile) {
        showToast(state.profiles.length > 0 ? 'Please select a profile from the dropdown.' : 'Please create a profile first.', 'error');
        navigateTo('profile');
        return;
      }
      const programId = rest[0];
      if (programId) {
        loadProgramPage(programId);
      } else {
        showToast('No program ID provided.', 'error');
        navigateTo('history');
      }
      break;

    case 'debug':
      showPage('debug');
      setActiveNav('debug');
      loadDebugPage();
      break;

    default:
      navigateTo('profile');
  }
}

function navigateTo(page) {
  window.location.hash = page;
}

// ─── Profile Page ───

function initProfileForm() {
  const form = document.getElementById('profile-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const data = collectProfileFormData();

      if (state.editingProfileId) {
        // Edit mode — PUT
        const result = await api.profiles.update(state.editingProfileId, data);
        state.currentProfile = result.data;
        localStorage.setItem('swimcoach_profile_id', state.currentProfile._id);
        await loadAllProfiles();
        exitEditMode();
        showToast('Profile updated!', 'success');
        navigateTo('generate');
      } else {
        // Create mode — POST
        const result = await api.profiles.create(data);
        state.currentProfile = result.data;
        localStorage.setItem('swimcoach_profile_id', state.currentProfile._id);
        await loadAllProfiles();
        showToast('Profile saved! Let\'s generate your first workout.', 'success');
        navigateTo('generate');
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = state.editingProfileId ? 'Update Profile →' : 'Save Profile & Start Training →';
    }
  });

  // Cancel edit button
  document.getElementById('btn-cancel-edit').addEventListener('click', () => {
    exitEditMode();
    showPage('profile');
  });

  // Add best time button
  document.getElementById('btn-add-best-time').addEventListener('click', () => {
    addBestTimeRow();
  });

  // Add competition date range button
  document.getElementById('btn-add-competition-range').addEventListener('click', () => {
    addCompetitionDateRange();
  });

  // Delete profile button
  document.getElementById('btn-delete-profile').addEventListener('click', async () => {
    if (!state.editingProfileId) return;
    const profile = state.profiles.find(p => p._id === state.editingProfileId);
    const name = profile ? `${profile.firstName} ${profile.lastName}` : 'this profile';
    if (!confirm(`Are you sure you want to delete ${name}? This cannot be undone.`)) return;

    try {
      await api.profiles.delete(state.editingProfileId);
      state.currentProfile = null;
      localStorage.removeItem('swimcoach_profile_id');
      state.editingProfileId = null;
      await loadAllProfiles();
      exitEditMode();
      showToast('Profile deleted.', 'info');
      showPage('profile');
    } catch (err) {
      showToast(`Error deleting profile: ${err.message}`, 'error');
    }
  });
}

function collectProfileFormData() {
  const form = document.getElementById('profile-form');
  const fd = new FormData(form);

  // Build pool equipment object
  const poolEquipment = {};
  form.querySelectorAll('input[name="poolEquipment"]').forEach(cb => {
    poolEquipment[cb.value] = cb.checked;
  });

  // Build gym equipment object
  const gymEquipment = {};
  form.querySelectorAll('input[name="gymEquipment"]').forEach(cb => {
    gymEquipment[cb.value] = cb.checked;
  });

  // Collect selected events
  const primaryEvents = [];
  form.querySelectorAll('.event-row').forEach(row => {
    const stroke = row.querySelector('.event-stroke').value;
    const distance = row.querySelector('.event-distance').value;
    if (stroke && distance) {
      primaryEvents.push({ stroke, distance: parseInt(distance, 10) });
    }
  });

  // Collect goal outcomes
  const outcomes = [];
  form.querySelectorAll('input[name="goalOutcome"]:checked').forEach(cb => {
    outcomes.push(cb.value);
  });

  // Collect pool/gym days
  const poolDays = [];
  form.querySelectorAll('#pool-days-toggles .day-toggle.active').forEach(btn => {
    poolDays.push(btn.dataset.day);
  });
  const gymDays = [];
  form.querySelectorAll('#gym-days-toggles .day-toggle.active').forEach(btn => {
    gymDays.push(btn.dataset.day);
  });

  // Collect best times
  const bestTimes = [];
  form.querySelectorAll('.best-time-row').forEach(row => {
    const stroke = row.querySelector('.bt-stroke').value;
    const distance = parseInt(row.querySelector('.bt-distance').value, 10);
    const poolLength = row.querySelector('.bt-pool-length').value;
    const time = row.querySelector('.bt-time').value;
    if (stroke && distance && poolLength && time) {
      bestTimes.push({ stroke, distance, poolLength, time });
    }
  });

  // Collect competition date ranges
  const competitionDates = [];
  form.querySelectorAll('.competition-date-range').forEach(row => {
    const start = row.querySelector('.cdr-start').value;
    const end = row.querySelector('.cdr-end').value;
    const label = row.querySelector('.cdr-label').value || '';
    if (start && end) {
      competitionDates.push({ start, end, label });
    }
  });

  // Build pool length object from open fields
  const poolLengthValue = parseInt(fd.get('poolLengthValue'), 10);
  const poolLengthUnit = fd.get('poolLengthUnit') || 'meters';
  const poolLength = poolLengthValue
    ? { value: poolLengthValue, unit: poolLengthUnit }
    : { value: 25, unit: 'meters' };

  return {
    firstName: fd.get('firstName'),
    lastName: fd.get('lastName'),
    email: fd.get('email'),
    dateOfBirth: fd.get('dateOfBirth'),
    gender: fd.get('gender'),
    experienceLevel: fd.get('experienceLevel') || 'beginner',
    goals: {
      primaryEvents,
      outcomes,
      trainingFocus: Array.from(form.querySelectorAll('input[name="trainingFocus"]:checked')).map(cb => cb.value),
      targetImprovement: fd.get('targetImprovement') || '',
    },
    trainingSchedule: {
      weeklyPoolSessions: parseInt(fd.get('weeklyPoolSessions'), 10) || 3,
      weeklyGymSessions: parseInt(fd.get('weeklyGymSessions'), 10) || 2,
      sessionDuration: parseInt(fd.get('sessionDuration'), 10) || 60,
      poolDays,
      gymDays,
      competitionDates,
    },
    equipment: {
      poolLength,
      poolEquipment,
      gymEquipment,
    },
    bestTimes,
  };
}

function enterEditMode(profileId) {
  state.editingProfileId = profileId;
  const profile = state.profiles.find(p => p._id === profileId);
  if (!profile) return;

  fillProfileForm(profile);
  document.getElementById('edit-mode-banner').classList.remove('hidden');
  document.getElementById('profile-form-subtitle').textContent = 'Update your profile information.';
  document.querySelector('#profile-form button[type="submit"]').textContent = 'Update Profile →';
  const deleteBtn = document.getElementById('btn-delete-profile');
  if (deleteBtn) deleteBtn.classList.remove('hidden');
  window.scrollTo(0, 0);
}

function exitEditMode() {
  state.editingProfileId = null;
  document.getElementById('edit-mode-banner').classList.add('hidden');
  document.getElementById('profile-form-subtitle').textContent = 'Tell us about yourself so we can personalize your workouts.';
  document.querySelector('#profile-form button[type="submit"]').textContent = 'Save Profile & Start Training →';
  const deleteBtn = document.getElementById('btn-delete-profile');
  if (deleteBtn) deleteBtn.classList.add('hidden');
  document.getElementById('profile-form').reset();
  // Re-render dynamic sections
  renderEvents([]);
  renderBestTimes([]);
  renderDayToggles();
  renderCompetitionDates([]);
}

async function loadProfile(id) {
  try {
    showLoading('Loading profile…');
    const result = await api.profiles.get(id);
    state.currentProfile = result.data;
    fillProfileForm(result.data);
    hideLoading();
  } catch (err) {
    hideLoading();
    localStorage.removeItem('swimcoach_profile_id');
    navigateTo('profile');
  }
}

function fillProfileForm(profile) {
  const form = document.getElementById('profile-form');
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.value = val;
  };

  setVal('firstName', profile.firstName);
  setVal('lastName', profile.lastName);
  setVal('email', profile.email);
  setVal('dateOfBirth', profile.dateOfBirth?.split('T')[0] || '');
  setVal('gender', profile.gender);
  setVal('experienceLevel', profile.experienceLevel);
  // Training focus (multi-select checkboxes)
  const tf = profile.goals?.trainingFocus || [];
  form.querySelectorAll('input[name="trainingFocus"]').forEach(cb => {
    cb.checked = tf.includes(cb.value);
  });
  setVal('targetImprovement', profile.goals?.targetImprovement);
  setVal('weeklyPoolSessions', profile.trainingSchedule?.weeklyPoolSessions);
  setVal('weeklyGymSessions', profile.trainingSchedule?.weeklyGymSessions);
  setVal('sessionDuration', profile.trainingSchedule?.sessionDuration);

  // Parse pool length into value + unit (handle both old string and new object format)
  const pl = profile.equipment?.poolLength;
  if (pl && typeof pl === 'object') {
    setVal('poolLengthValue', pl.value || '');
    document.getElementById('poolLengthUnit').value = pl.unit || 'meters';
  } else if (typeof pl === 'string') {
    const plMatch = pl.match(/^(\d+)(m|yd|yards|meters)?$/i);
    if (plMatch) {
      setVal('poolLengthValue', plMatch[1]);
      const unit = plMatch[2];
      document.getElementById('poolLengthUnit').value =
        (unit && unit.startsWith('y')) ? 'yards' : 'meters';
    } else {
      setVal('poolLengthValue', '');
      document.getElementById('poolLengthUnit').value = 'meters';
    }
  } else {
    setVal('poolLengthValue', 25);
    document.getElementById('poolLengthUnit').value = 'meters';
  }

  // Render events
  renderEvents(profile.goals?.primaryEvents || []);

  // Goal outcomes
  form.querySelectorAll('input[name="goalOutcome"]').forEach(cb => {
    cb.checked = (profile.goals?.outcomes || []).includes(cb.value);
  });

  // Checkboxes
  if (profile.equipment?.poolEquipment) {
    form.querySelectorAll('input[name="poolEquipment"]').forEach(cb => {
      cb.checked = !!profile.equipment.poolEquipment[cb.value];
    });
  }
  if (profile.equipment?.gymEquipment) {
    form.querySelectorAll('input[name="gymEquipment"]').forEach(cb => {
      cb.checked = !!profile.equipment.gymEquipment[cb.value];
    });
  }

  // Day toggles
  renderDayToggles(profile.trainingSchedule?.poolDays || [], profile.trainingSchedule?.gymDays || []);

  // Competition date ranges
  renderCompetitionDates(profile.trainingSchedule?.competitionDates || []);

  // Best times
  renderBestTimes(profile.bestTimes || []);

  // Show delete button when editing existing profile
  const deleteBtn = document.getElementById('btn-delete-profile');
  if (deleteBtn) {
    deleteBtn.classList.toggle('hidden', !state.editingProfileId);
  }
}

// ─── Events UI ───

function renderEvents(events) {
  const container = document.getElementById('events-container');
  if (!container) return;

  if (!events.length) {
    events = [{ stroke: '', distance: '' }];
  }

  container.innerHTML = events.map((ev, i) => `
    <div class="event-row">
      <select class="event-stroke" required>
        <option value="">Stroke</option>
        ${(state.customizationOptions?.strokes || []).map(s =>
          `<option value="${s.value}" ${ev.stroke === s.value ? 'selected' : ''}>${s.label}</option>`
        ).join('')}
      </select>
      <select class="event-distance" required>
        <option value="">Distance</option>
        ${(state.customizationOptions?.distances || []).map(d =>
          `<option value="${d.value}" ${ev.distance == d.value ? 'selected' : ''}>${d.label}</option>`
        ).join('')}
      </select>
      ${i > 0 ? `<button type="button" class="btn btn-sm btn-secondary btn-remove-event" title="Remove">✕</button>` : ''}
    </div>
  `).join('');

  // Add event button
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-sm btn-secondary';
  addBtn.style.marginTop = 'var(--space-sm)';
  addBtn.textContent = '+ Add Another Event';
  addBtn.addEventListener('click', () => {
    addEventRow();
  });
  container.appendChild(addBtn);

  // Remove event handlers
  container.querySelectorAll('.btn-remove-event').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.event-row').remove());
  });
}

function addEventRow() {
  const container = document.getElementById('events-container');
  const rows = container.querySelectorAll('.event-row');
  const lastRow = rows[rows.length - 1];
  const newRow = document.createElement('div');
  newRow.className = 'event-row';
  newRow.innerHTML = `
    <select class="event-stroke" required>
      <option value="">Stroke</option>
      ${(state.customizationOptions?.strokes || []).map(s =>
        `<option value="${s.value}">${s.label}</option>`
      ).join('')}
    </select>
    <select class="event-distance" required>
      <option value="">Distance</option>
      ${(state.customizationOptions?.distances || []).map(d =>
        `<option value="${d.value}">${d.label}</option>`
      ).join('')}
    </select>
    <button type="button" class="btn btn-sm btn-secondary btn-remove-event" title="Remove">✕</button>
  `;
  container.insertBefore(newRow, container.lastElementChild); // before the "Add" button
  newRow.querySelector('.btn-remove-event').addEventListener('click', () => newRow.remove());
}

// ─── Competition Date Ranges UI ───

function renderCompetitionDates(ranges) {
  const container = document.getElementById('competition-dates-list');
  if (!container) return;
  container.innerHTML = '';

  if (!ranges.length) {
    addCompetitionDateRange();
    return;
  }

  ranges.forEach(r => addCompetitionDateRange(r));
}

function addCompetitionDateRange(existing = null) {
  const container = document.getElementById('competition-dates-list');
  const row = document.createElement('div');
  row.className = 'competition-date-range';
  row.innerHTML = `
    <input type="date" class="cdr-start" value="${existing?.start?.split('T')[0] || ''}">
    <span class="range-sep">to</span>
    <input type="date" class="cdr-end" value="${existing?.end?.split('T')[0] || ''}">
    <input type="text" class="cdr-label" placeholder="Label (optional)" value="${escapeHtml(existing?.label || '')}" style="flex:1; padding: var(--space-xs) var(--space-sm); border: 1px solid var(--gray-200); border-radius: var(--radius-sm); font-size: 0.9rem;">
    <button type="button" class="btn btn-sm btn-secondary btn-remove-range" title="Remove">✕</button>
  `;
  row.querySelector('.btn-remove-range').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

// ─── Day Toggles UI ───

function renderDayToggles(poolDays = [], gymDays = []) {
  const dayLabels = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
    friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
  };
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  const makeToggle = (day, label, isActive) =>
    `<button type="button" class="day-toggle ${isActive ? 'active' : ''}" data-day="${day}">${label}</button>`;

  const poolContainer = document.getElementById('pool-days-toggles');
  const gymContainer = document.getElementById('gym-days-toggles');

  if (poolContainer) {
    poolContainer.innerHTML = days.map(d => makeToggle(d, dayLabels[d], poolDays.includes(d))).join('');
    poolContainer.querySelectorAll('.day-toggle').forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('active'));
    });
  }

  if (gymContainer) {
    gymContainer.innerHTML = days.map(d => makeToggle(d, dayLabels[d], gymDays.includes(d))).join('');
    gymContainer.querySelectorAll('.day-toggle').forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('active'));
    });
  }
}

// ─── Best Times UI ───

function renderBestTimes(times) {
  const container = document.getElementById('best-times-list');
  if (!container) return;
  container.innerHTML = '';

  if (!times.length) {
    addBestTimeRow();
    return;
  }

  times.forEach(t => addBestTimeRow(t));
}

function addBestTimeRow(existing = null) {
  const container = document.getElementById('best-times-list');
  const row = document.createElement('div');
  row.className = 'best-time-row';

  const strokes = state.customizationOptions?.strokes || [];
  const distances = state.customizationOptions?.distances || [];

  row.innerHTML = `
    <select class="bt-stroke" required>
      <option value="">Stroke</option>
      ${strokes.map(s => `<option value="${s.value}" ${existing?.stroke === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
    </select>
    <select class="bt-distance" required>
      <option value="">Distance</option>
      ${distances.map(d => `<option value="${d.value}" ${existing?.distance == d.value ? 'selected' : ''}>${d.label}</option>`).join('')}
    </select>
    <select class="bt-pool-length" required>
      <option value="">Pool</option>
      <option value="scy" ${existing?.poolLength === 'scy' ? 'selected' : ''}>SC Yards</option>
      <option value="scm" ${existing?.poolLength === 'scm' ? 'selected' : ''}>SC Meters</option>
      <option value="lcm" ${existing?.poolLength === 'lcm' ? 'selected' : ''}>LC Meters</option>
    </select>
    <input type="text" class="bt-time" placeholder="MM:ss.hh" value="${existing?.time || ''}" required>
    <button type="button" class="btn btn-sm btn-secondary btn-remove-bt" title="Remove">✕</button>
  `;

  row.querySelector('.btn-remove-bt').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

// ─── Profile Management ───

async function loadAllProfiles() {
  try {
    const result = await api.profiles.list();
    state.profiles = result.data || [];
    updateProfileDropdown();
    updateProfileList();
  } catch (err) {
    console.error('Failed to load profiles:', err);
    state.profiles = [];
    updateProfileDropdown();
    updateProfileList();
  }
}

function updateProfileDropdown() {
  const dropdown = document.getElementById('profile-dropdown');
  const switchBtn = document.getElementById('btn-switch-profile');

  if (state.profiles.length === 0) {
    dropdown.innerHTML = '<option value="">No profiles yet</option>';
    switchBtn.disabled = true;
    return;
  }

  dropdown.innerHTML = state.profiles
    .map(p => {
      const selected = state.currentProfile?._id === p._id ? ' selected' : '';
      return `<option value="${p._id}"${selected}>${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</option>`;
    })
    .join('');

  switchBtn.disabled = false;

  dropdown.onchange = () => {
    const id = dropdown.value;
    if (id) {
      const profile = state.profiles.find(p => p._id === id);
      if (profile) {
        state.currentProfile = profile;
        localStorage.setItem('swimcoach_profile_id', profile._id);
        fillProfileForm(profile);
        updateProfileDropdown();
        updateProfileList();
        showToast(`Switched to ${profile.firstName} ${profile.lastName}`, 'info');
      }
    }
  };

  switchBtn.onclick = () => {
    const id = dropdown.value;
    if (id) {
      const profile = state.profiles.find(p => p._id === id);
      if (profile) {
        state.currentProfile = profile;
        localStorage.setItem('swimcoach_profile_id', profile._id);
        fillProfileForm(profile);
        updateProfileDropdown();
        updateProfileList();
        navigateTo('generate');
      }
    }
  };
}

function updateProfileList() {
  const section = document.getElementById('profile-list-section');
  const list = document.getElementById('profile-list');

  if (state.profiles.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');

  list.innerHTML = state.profiles.map(p => {
    const isActive = state.currentProfile?._id === p._id;
    const events = p.goals?.primaryEvents || [];
    const detail = events.length
      ? events.map(e => `${e.distance}m ${e.stroke}`).join(', ')
      : (Array.isArray(p.goals?.trainingFocus) ? p.goals.trainingFocus.join(', ') : (p.goals?.trainingFocus || 'No focus set'));
    return `
      <div class="profile-card ${isActive ? 'active' : ''}" data-id="${p._id}">
        <div class="profile-card-info">
          <span class="profile-card-name">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</span>
          <span class="profile-card-detail">${detail} · ${p.experienceLevel || 'beginner'}</span>
        </div>
        <div class="profile-card-actions">
          ${isActive ? '<span class="profile-card-badge">Active</span>' : ''}
          <button type="button" class="btn btn-sm btn-secondary btn-edit-profile" data-id="${p._id}">Edit</button>
          <button type="button" class="btn btn-sm btn-danger btn-delete-profile-card" data-id="${p._id}" title="Delete profile">🗑</button>
        </div>
      </div>
    `;
  }).join('');

  // Click to select profile
  list.querySelectorAll('.profile-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-edit-profile')) return; // handled below
      const id = card.dataset.id;
      const profile = state.profiles.find(p => p._id === id);
      if (profile) {
        state.currentProfile = profile;
        localStorage.setItem('swimcoach_profile_id', profile._id);
        fillProfileForm(profile);
        updateProfileDropdown();
        updateProfileList();
        showToast(`Switched to ${profile.firstName} ${profile.lastName}`, 'info');
      }
    });
  });

  // Edit buttons
  list.querySelectorAll('.btn-edit-profile').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      enterEditMode(btn.dataset.id);
    });
  });

  // Delete buttons on profile cards
  list.querySelectorAll('.btn-delete-profile-card').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const profile = state.profiles.find(p => p._id === id);
      const name = profile ? `${profile.firstName} ${profile.lastName}` : 'this profile';
      if (!confirm(`Are you sure you want to delete ${name}? This cannot be undone.`)) return;
      try {
        await api.profiles.delete(id);
        if (state.currentProfile?._id === id) {
          state.currentProfile = null;
          localStorage.removeItem('swimcoach_profile_id');
        }
        await loadAllProfiles();
        showToast('Profile deleted.', 'info');
      } catch (err) {
        showToast(`Error deleting profile: ${err.message}`, 'error');
      }
    });
  });

  // "Create New Profile" button
  document.getElementById('btn-new-profile').onclick = () => {
    state.currentProfile = null;
    localStorage.removeItem('swimcoach_profile_id');
    exitEditMode();
    updateProfileDropdown();
    updateProfileList();
    showPage('profile');
  };
}

// ─── Expandable Sections ───

function initExpandableSections() {
  document.querySelectorAll('.section-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('open');
      const content = toggle.nextElementSibling;
      content.classList.toggle('hidden');
    });
  });
}

// ─── Generate Page ───

async function loadCustomizationOptions() {
  try {
    const result = await api.customization.options();
    state.customizationOptions = result.data;

    // Populate workout type dropdown
    const typeSelect = document.getElementById('workoutType');
    state.customizationOptions.workoutTypes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.value;
      opt.textContent = t.label;
      typeSelect.appendChild(opt);
    });

    // Populate intensity dropdown
    const intensitySelect = document.getElementById('intensity');
    state.customizationOptions.intensities.forEach(i => {
      const opt = document.createElement('option');
      opt.value = i.value;
      opt.textContent = i.label;
      intensitySelect.appendChild(opt);
    });

    // Populate equipment checkboxes
    const poolContainer = document.getElementById('pool-equipment-checkboxes');
    state.customizationOptions.poolEquipment.forEach(e => {
      poolContainer.appendChild(createCheckbox(e.value, e.label, 'genPoolEquipment'));
    });

    const gymContainer = document.getElementById('gym-equipment-checkboxes');
    state.customizationOptions.gymEquipment.forEach(e => {
      gymContainer.appendChild(createCheckbox(e.value, e.label, 'genGymEquipment'));
    });

    // Populate goal outcomes
    const outcomesContainer = document.getElementById('goal-outcomes-container');
    if (outcomesContainer) {
      state.customizationOptions.goalOutcomes.forEach(o => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        label.innerHTML = `<input type="checkbox" name="goalOutcome" value="${o.value}"> ${o.label}`;
        outcomesContainer.appendChild(label);
      });
    }

    // Populate training focus checkboxes (use trainingFocusTypes, not workoutTypes — must match schema enum)
    const tfContainer = document.getElementById('training-focus-container');
    if (tfContainer && state.customizationOptions.trainingFocusTypes) {
      state.customizationOptions.trainingFocusTypes.forEach(t => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        label.innerHTML = `<input type="checkbox" name="trainingFocus" value="${t.value}"> ${t.label}`;
        tfContainer.appendChild(label);
      });
    }

    // Render day toggles
    renderDayToggles();

    // Render events (empty initially)
    renderEvents([]);

    // Render competition dates (empty initially)
    renderCompetitionDates([]);

  } catch (err) {
    console.error('Failed to load customization options:', err);
  }
}

function createCheckbox(value, label, name) {
  const labelEl = document.createElement('label');
  labelEl.className = 'checkbox-label';
  labelEl.innerHTML = `<input type="checkbox" name="${name}" value="${value}"> ${label}`;
  return labelEl;
}

function prefillGenerateForm() {
  if (!state.currentProfile) return;
  const p = state.currentProfile;

  document.getElementById('duration').placeholder = `${p.trainingSchedule?.sessionDuration || 60} (from profile)`;
  // Prefill pool length from profile (handle both old string and new object format)
  const pl = p.equipment?.poolLength;
  if (pl && typeof pl === 'object') {
    document.getElementById('poolLengthValue').value = pl.value || '';
    document.getElementById('poolLengthUnit').value = pl.unit || 'meters';
  } else if (typeof pl === 'string') {
    const plMatch = pl.match(/^(\d+)(m|yd|yards|meters)?$/i);
    if (plMatch) {
      document.getElementById('poolLengthValue').value = plMatch[1];
      const unit = plMatch[2];
      document.getElementById('poolLengthUnit').value =
        (unit && unit.startsWith('y')) ? 'yards' : 'meters';
    }
  }
  document.getElementById('programPeriod').value = 'single';

  const form = document.getElementById('generate-form');
  if (p.equipment?.poolEquipment) {
    form.querySelectorAll('input[name="genPoolEquipment"]').forEach(cb => {
      cb.checked = !!p.equipment.poolEquipment[cb.value];
    });
  }
  if (p.equipment?.gymEquipment) {
    form.querySelectorAll('input[name="genGymEquipment"]').forEach(cb => {
      cb.checked = !!p.equipment.gymEquipment[cb.value];
    });
  }

  if (p.goals?.trainingFocus) {
    const workoutTypeSelect = document.getElementById('workoutType');
    const tf = Array.isArray(p.goals.trainingFocus) ? p.goals.trainingFocus : [p.goals.trainingFocus];
    if (tf.length === 1 && workoutTypeSelect) {
      const matchingOption = Array.from(workoutTypeSelect.options).find(o => o.value === tf[0]);
      if (matchingOption) workoutTypeSelect.value = tf[0];
    }
  }
}

function initGenerateForm() {
  const form = document.getElementById('generate-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await generateWorkout(form);
  });

  document.querySelectorAll('.quick-buttons button').forEach(btn => {
    btn.addEventListener('click', async () => {
      await generateWorkout(null, btn.dataset.sessionType);
    });
  });
}

async function generateWorkout(form, quickSessionType) {
  const btn = form
    ? form.querySelector('button[type="submit"]')
    : document.querySelector(`.quick-buttons button[data-session-type="${quickSessionType}"]`);

  const originalText = btn?.textContent || '⚡ Quick Generate';
  btn && (btn.disabled = true);

  const genData = collectGenerateFormData(form);
  if (quickSessionType) genData.sessionType = quickSessionType;
  const isProgram = genData.programPeriod && genData.programPeriod !== 'single';

  showLoading(isProgram
    ? `Generating your ${genData.programPeriod} program… This may take a few minutes.`
    : 'Generating your workout… Open Notebook is thinking. This may take 30–60 seconds.');

  try {
    genData.swimmerId = state.currentProfile._id;

    if (isProgram) {
      // Use program generation endpoint
      const result = await api.workouts.generateProgram(genData);
      hideLoading();
      const count = result.data.totalSessions;
      showToast(`Program generated! ${count} workouts created. 🎉`, 'success');
      navigateTo('history');
    } else {
      const result = await api.workouts.generate(genData);
      hideLoading();
      showToast('Workout generated! 🎉', 'success');
      navigateTo(`workout/${result.data._id}`);
    }
  } catch (err) {
    hideLoading();
    showToast(`Generation failed: ${err.message}`, 'error');
  } finally {
    btn && (btn.disabled = false);
    btn && (btn.textContent = originalText);
  }
}

function collectGenerateFormData(form) {
  if (!form) return {};

  const fd = new FormData(form);
  const data = {};

  const sessionType = fd.get('sessionType');
  if (sessionType) data.sessionType = sessionType;

  const workoutType = fd.get('workoutType');
  if (workoutType) data.workoutType = workoutType;

  const duration = fd.get('duration');
  if (duration) data.duration = parseInt(duration, 10);

  const intensity = fd.get('intensity');
  if (intensity) data.intensity = intensity;

  const poolLengthValue = fd.get('poolLengthValue');
  const poolLengthUnit = fd.get('poolLengthUnit');
  if (poolLengthValue) {
    data.poolLength = `${poolLengthValue}${poolLengthUnit === 'yards' ? 'yd' : 'm'}`;
  }

  const programPeriod = fd.get('programPeriod');
  if (programPeriod) data.programPeriod = programPeriod;

  const availableEquipment = [];
  form.querySelectorAll('input[name="genPoolEquipment"]:checked').forEach(cb => {
    availableEquipment.push(cb.value);
  });
  form.querySelectorAll('input[name="genGymEquipment"]:checked').forEach(cb => {
    availableEquipment.push(cb.value);
  });
  if (availableEquipment.length) {
    data.availableEquipment = availableEquipment;
  }

  return data;
}

// ─── Workout Page ───

async function loadWorkoutPage(workoutId) {
  showLoading('Loading workout…');
  try {
    const result = await api.workouts.get(workoutId);
    const workout = result.data;

    const container = document.getElementById('workout-content');
    container.innerHTML = buildWorkoutCard(workout);
    container.innerHTML += buildChatPanel(workoutId);
    container.innerHTML += buildFeedbackForm(workoutId, workout.userFeedback);

    initChatHandler(workoutId);
    initFeedbackHandler(workoutId, workout.userFeedback);

    showPage('workout');
    hideLoading();
  } catch (err) {
    hideLoading();
    showToast(`Error loading workout: ${err.message}`, 'error');
    navigateTo('generate');
  }
}

// ─── Chat Handler ───

// Store conversation state per workout
const chatConversations = {};

function getConversation(workoutId) {
  if (!chatConversations[workoutId]) {
    chatConversations[workoutId] = [];
  }
  return chatConversations[workoutId];
}

function initChatHandler(workoutId) {
  // Initialize conversation with the opening coach message if fresh
  const conv = getConversation(workoutId);
  if (conv.length === 0) {
    conv.push({
      role: 'coach',
      text: 'Need a change? Ask for a harder/easier version, swap exercises, adjust the duration, or just ask me anything about your workout.',
    });
    renderConversation(workoutId, conv);
  }

  const form = document.getElementById(`chat-form-${workoutId}`);
  if (!form) return;

  // Remove any existing listener by cloning the form (clean slate on re-init)
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);

  newForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById(`chat-input-${workoutId}`);
    const text = input.value.trim();
    if (!text) return;

    const conv = getConversation(workoutId);

    // Add user message
    conv.push({ role: 'user', text });
    renderConversation(workoutId, conv);
    input.value = '';

    // Show typing indicator
    const typingId = addTypingIndicator(workoutId);

    try {
      const result = await api.workouts.chat(workoutId, {
        message: text,
        messages: conv.map(m => ({ role: m.role, text: m.text })),
      });

      removeTypingIndicator(typingId);

      const { reply, regenerate, workout: newWorkout } = result.data;

      // Add coach reply
      conv.push({ role: 'coach', text: reply });
      renderConversation(workoutId, conv);

      if (regenerate && newWorkout) {
        // Workout was regenerated — update the display
        const container = document.getElementById('workout-content');
        container.innerHTML = buildWorkoutCard(newWorkout);
        container.innerHTML += buildChatPanel(newWorkout._id);
        container.innerHTML += buildFeedbackForm(newWorkout._id, newWorkout.userFeedback);

        // Transfer conversation to new workout ID
        chatConversations[newWorkout._id] = conv;
        delete chatConversations[workoutId];

        initChatHandler(newWorkout._id);
        initFeedbackHandler(newWorkout._id, newWorkout.userFeedback);

        window.history.replaceState(null, '', `#workout/${newWorkout._id}`);
        showToast('Workout updated!', 'success');
      }
    } catch (err) {
      removeTypingIndicator(typingId);
      conv.push({ role: 'coach', text: `Sorry, I couldn't process that: ${err.message}` });
      renderConversation(workoutId, conv);
    }
  });
}

/**
 * Render the full conversation into the chat messages container.
 */
function renderConversation(workoutId, messages) {
  const container = document.getElementById(`chat-messages-${workoutId}`);
  if (!container) return;
  container.innerHTML = '';
  for (const msg of messages) {
    const el = document.createElement('div');
    el.className = `chat-message ${msg.role}`;
    el.textContent = msg.text;
    container.appendChild(el);
  }
  container.scrollTop = container.scrollTop = container.scrollHeight;
}

/**
 * Add a typing indicator to the chat.
 * Returns the element ID for later removal.
 */
function addTypingIndicator(workoutId) {
  const container = document.getElementById(`chat-messages-${workoutId}`);
  if (!container) return null;
  const el = document.createElement('div');
  el.className = 'chat-message coach typing';
  el.id = `typing-${workoutId}`;
  el.textContent = 'Coach is typing…';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el.id;
}

/**
 * Remove the typing indicator.
 */
function removeTypingIndicator(id) {
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ─── Feedback Handler ───

function initFeedbackHandler(workoutId, existingFeedback) {
  const starContainer = document.getElementById(`star-rating-${workoutId}`);
  const ratingInput = document.getElementById(`rating-input-${workoutId}`);

  if (starContainer) {
    starContainer.querySelectorAll('.star').forEach(star => {
      star.addEventListener('click', () => {
        const val = parseInt(star.dataset.value, 10);
        ratingInput.value = val;
        starContainer.querySelectorAll('.star').forEach((s, i) => {
          s.classList.toggle('active', i < val);
        });
      });
    });
  }

  const form = document.getElementById(`feedback-form-${workoutId}`);
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    try {
      const fd = new FormData(form);
      const rating = parseInt(fd.get('rating'), 10);

      if (!rating) {
        showToast('Please select a star rating.', 'error');
        btn.disabled = false;
        btn.textContent = 'Submit Feedback';
        return;
      }

      const feedback = {
        rating,
        difficultyPerception: fd.get('difficultyPerception') || undefined,
        enjoyment: fd.get('enjoyment') || undefined,
        comments: fd.get('comments') || undefined,
      };

      await api.workouts.feedback(workoutId, feedback);
      showToast('Feedback saved. Thanks!', 'success');
      showAdaptiveResponse(workoutId, feedback);
      form.classList.add('hidden');
    } catch (err) {
      showToast(`Error saving feedback: ${err.message}`, 'error');
      btn.disabled = false;
      btn.textContent = 'Submit Feedback';
    }
  });
}

// ─── History Page ───

function initHistoryPage() {
  // Populate type filter
  const typeFilter = document.getElementById('history-filter-type');
  if (typeFilter && state.customizationOptions) {
    state.customizationOptions.workoutTypes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.value;
      opt.textContent = t.label;
      typeFilter.appendChild(opt);
    });
  }

  // Filter change handlers
  document.getElementById('history-filter-type')?.addEventListener('change', loadHistoryPage);
  document.getElementById('history-filter-period')?.addEventListener('change', loadHistoryPage);
}

async function loadHistoryPage() {
  const container = document.getElementById('history-list');
  if (!container) return;

  showLoading('Loading workouts…');
  try {
    const result = await api.workouts.list(state.currentProfile._id);
    let workouts = result.data || [];

    // Apply type filter
    const typeFilter = document.getElementById('history-filter-type');
    const selectedType = typeFilter?.value;
    if (selectedType) {
      workouts = workouts.filter(w => w.workoutType === selectedType);
    }

    // Apply period filter
    const periodFilter = document.getElementById('history-filter-period');
    const period = periodFilter?.value;
    if (period && period !== 'all') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - parseInt(period, 10));
      workouts = workouts.filter(w => new Date(w.createdAt) >= cutoff);
    }

    if (!workouts.length) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="emoji">🏊</span>
          <h3>No workouts yet</h3>
          <p>Generate your first workout to start tracking progress.</p>
        </div>`;
      hideLoading();
      return;
    }

    container.innerHTML = workouts.map(w => {
      const date = new Date(w.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const rating = w.userFeedback?.rating || 0;
      const ratingStars = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : 'Not rated';
      const isProgram = !!w.programId;
      const programBadge = isProgram ? `<span class="history-card-program-badge">Program</span>` : '';
      return `
        <div class="history-card" data-id="${w._id}">
          <div class="history-card-header">
            <div>
              <span class="history-card-type">${escapeHtml(w.workoutType)}</span>
              ${programBadge}
              <span class="history-card-date">${date}</span>
            </div>
            <span class="history-card-rating">${ratingStars}</span>
          </div>
          <div class="history-card-body">
            <span>${w.poolWorkout?.totalDistance || 0}m pool</span>
            <span>${w.duration}min</span>
            <span>${escapeHtml(w.intensity || 'moderate')}</span>
          </div>
          <div class="history-card-actions">
            <button type="button" class="btn btn-sm btn-secondary btn-view-workout" data-id="${w._id}">View</button>
            <button type="button" class="btn btn-sm btn-secondary btn-edit-workout" data-id="${w._id}">Edit</button>
            ${isProgram ? `<button type="button" class="btn btn-sm btn-primary btn-view-program" data-program-id="${w.programId}">View Program</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Click handlers
    container.querySelectorAll('.btn-view-workout').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(`workout/${btn.dataset.id}`));
    });
    container.querySelectorAll('.btn-edit-workout').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(`workout/${btn.dataset.id}?edit=1`));
    });
    container.querySelectorAll('.btn-view-program').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(`program/${btn.dataset.programId}`));
    });

    hideLoading();
  } catch (err) {
    hideLoading();
    container.innerHTML = `<div class="empty-state"><p>Error loading workouts: ${err.message}</p></div>`;
  }
}

// ─── Program Page ───

async function loadProgramPage(programId) {
  const container = document.getElementById('program-content');
  if (!container) return;

  showLoading('Loading program…');
  try {
    const result = await api.workouts.getProgram(programId);
    const program = result.data;

    // Build program header
    let html = `
      <div class="page-header">
        <h1>Training Program</h1>
        <p class="subtitle">${escapeHtml(program.swimmerName)} — ${program.totalSessions} sessions · ${escapeHtml(program.programPeriod)}</p>
      </div>
      <div class="program-actions">
        <button type="button" id="btn-back-to-history" class="btn btn-secondary">← Back to History</button>
      </div>
      <div class="program-sessions">`;

    // Build each session card
    program.workouts.forEach((w, idx) => {
      const date = new Date(w.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const rating = w.userFeedback?.rating || 0;
      const ratingStars = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : 'Not rated';
      const poolDist = w.poolWorkout?.totalDistance || 0;
      const gymExercises = w.gymWorkout?.mainSet?.length || 0;

      html += `
        <div class="program-session-card">
          <div class="program-session-header">
            <div class="program-session-info">
              <span class="program-session-number">Session ${idx + 1}</span>
              <span class="program-session-type">${escapeHtml(w.workoutType)}</span>
              <span class="program-session-date">${date}</span>
            </div>
            <span class="program-session-rating">${ratingStars}</span>
          </div>
          <div class="program-session-body">
            <span>${poolDist}m pool</span>
            <span>${w.duration}min</span>
            <span>${gymExercises} gym exercises</span>
            <span>${escapeHtml(w.intensity || 'moderate')}</span>
          </div>
          <div class="program-session-actions">
            <button type="button" class="btn btn-sm btn-secondary btn-view-session" data-id="${w._id}">View Workout</button>
            <button type="button" class="btn btn-sm btn-secondary btn-edit-session" data-id="${w._id}">Edit</button>
          </div>
        </div>`;
    });

    html += `</div>`;
    container.innerHTML = html;

    // Wire up buttons
    document.getElementById('btn-back-to-history').addEventListener('click', () => navigateTo('history'));
    container.querySelectorAll('.btn-view-session').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(`workout/${btn.dataset.id}`));
    });
    container.querySelectorAll('.btn-edit-session').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(`workout/${btn.dataset.id}?edit=1`));
    });

    showPage('program');
    hideLoading();
  } catch (err) {
    hideLoading();
    container.innerHTML = `
      <div class="empty-state">
        <span class="emoji">😕</span>
        <h3>Program not found</h3>
        <p>${escapeHtml(err.message)}</p>
        <button type="button" class="btn btn-secondary" onclick="window.location.hash='history'">← Back to History</button>
      </div>`;
    showPage('program');
  }
}

// ─── Debug Page ───

function initDebugPage() {
  // LLM preset change
  document.getElementById('debug-llm-preset')?.addEventListener('change', (e) => {
    const customGroup = document.getElementById('debug-llm-custom-group');
    if (customGroup) customGroup.style.display = e.target.value === 'custom' ? '' : 'none';
  });

  // Set LLM button
  document.getElementById('btn-debug-set-llm')?.addEventListener('click', () => {
    const preset = document.getElementById('debug-llm-preset').value;
    const custom = document.getElementById('debug-llm-custom').value.trim();
    const model = preset === 'custom' ? custom : preset;
    if (!model) {
      showToast('Please select or enter a model.', 'error');
      return;
    }
    state.debugLlm = model;
    localStorage.setItem('swimcoach_debug_llm', model);
    document.getElementById('debug-llm-current').textContent = `Current: ${model}`;
    showToast(`LLM set to ${model}`, 'success');
  });

  // View prompts button
  document.getElementById('btn-debug-prompts')?.addEventListener('click', async () => {
    const profileId = document.getElementById('debug-profile-select').value;
    if (!profileId) {
      showToast('Please select a profile first.', 'error');
      return;
    }
    const workoutType = document.getElementById('debug-workout-type').value;
    const duration = document.getElementById('debug-duration').value;
    const llmModel = state.debugLlm || '';
    showLoading('Building prompts…');
    try {
      const result = await api.debug.prompts(profileId, workoutType, duration, llmModel);
      hideLoading();
      const data = result.data;
      const promptsViewer = document.getElementById('debug-prompts-viewer');
      promptsViewer.innerHTML = `
        <div class="debug-prompt-section">
          <h4>OpenNotebook Insights Prompt</h4>
          <pre class="debug-prompt-content">${escapeHtml(data.insightsPrompt || 'N/A')}</pre>
        </div>
        <div class="debug-prompt-section">
          <h4>Workout Generation Prompt</h4>
          <pre class="debug-prompt-content">${escapeHtml(data.generationPrompt || 'N/A')}</pre>
        </div>
        <div class="debug-prompt-section">
          <h4>Past Feedback Summary</h4>
          <pre class="debug-prompt-content">${escapeHtml(data.feedbackSummary || 'None')}</pre>
        </div>
        <div class="debug-prompt-section">
          <h4>Model</h4>
          <pre class="debug-prompt-content">${escapeHtml(data.modelUsed || 'default')}</pre>
        </div>
      `;
    } catch (err) {
      hideLoading();
      showToast(`Error: ${err.message}`, 'error');
    }
  });

  // Test generate button
  document.getElementById('btn-debug-generate')?.addEventListener('click', async () => {
    const profileId = document.getElementById('debug-profile-select').value;
    if (!profileId) {
      showToast('Please select a profile first.', 'error');
      return;
    }

    const btn = document.getElementById('btn-debug-generate');
    btn.disabled = true;
    btn.textContent = 'Generating…';
    showLoading('Running test generation…');

    try {
      const body = {
        swimmerId: profileId,
        workoutType: document.getElementById('debug-workout-type').value,
        duration: parseInt(document.getElementById('debug-duration').value, 10),
        mode: 'debug',
      };
      if (state.debugLlm) body.llmModel = state.debugLlm;

      const result = await api.workouts.generate(body);
      hideLoading();
      showToast('Test generation complete!', 'success');

      // Show generated workout JSON
      const promptsViewer = document.getElementById('debug-prompts-viewer');
      promptsViewer.innerHTML = `
        <div class="debug-prompt-section">
          <h4>Generated Workout</h4>
          <pre class="debug-prompt-content">${escapeHtml(JSON.stringify(result.data, null, 2))}</pre>
        </div>
      `;

      // Navigate to view the workout
      navigateTo(`workout/${result.data._id}`);
    } catch (err) {
      hideLoading();
      showToast(`Test generation failed: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Test Generate';
    }
  });
}

async function loadDebugPage() {
  // Load profiles into debug selector
  const select = document.getElementById('debug-profile-select');
  if (!select) return;

  try {
    const result = await api.profiles.list();
    const profiles = result.data || [];
    select.innerHTML = profiles.length
      ? profiles.map(p => `<option value="${p._id}">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</option>`).join('')
      : '<option value="">No profiles yet</option>';
  } catch {
    select.innerHTML = '<option value="">Error loading profiles</option>';
  }

  // Restore saved LLM
  const savedLlm = localStorage.getItem('swimcoach_debug_llm');
  if (savedLlm) {
    state.debugLlm = savedLlm;
    const currentEl = document.getElementById('debug-llm-current');
    if (currentEl) currentEl.textContent = `Current: ${savedLlm}`;
  }
}
