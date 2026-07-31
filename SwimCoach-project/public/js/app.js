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
  buildWorkoutEditForm,
  buildChatPanel,
  buildActionProposal,
  buildFeedbackForm,
  showAdaptiveResponse,
  escapeHtml,
  formatDateInput,
} from '/js/components.js';

// ─── Helper Functions for Safe DOM Creation ───

function createInput(type, className, attributes = {}) {
  const input = document.createElement('input');
  input.type = type;
  input.className = className;
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'value') {
      input.value = value;
    } else {
      input.setAttribute(key, value);
    }
  });
  return input;
}

function createCell(input) {
  const td = document.createElement('td');
  td.appendChild(input);
  return td;
}

function createButton(className, title, textContent, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.title = title;
  btn.textContent = textContent;
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

function createPoolSetRow(idx) {
  const row = document.createElement('tr');
  row.className = 'edit-set-row';
  row.dataset.setIndex = idx;
  row.dataset.setType = 'pool';

  row.appendChild(createCell(createInput('number', 'edit-input edit-reps', { value: 1, min: 1 })));
  row.appendChild(createCell(createInput('number', 'edit-input edit-distance', { value: 100, min: 0 })));
  row.appendChild(createCell(createInput('text', 'edit-input edit-stroke', { value: 'freestyle' })));
  row.appendChild(createCell(createInput('text', 'edit-input edit-sendoff', { placeholder: '2:00' })));
  row.appendChild(createCell(createInput('text', 'edit-input edit-targetpace', { placeholder: '1:35' })));
  row.appendChild(createCell(createInput('text', 'edit-input edit-rest', { placeholder: '25s' })));
  row.appendChild(createCell(createInput('text', 'edit-input edit-focus', { placeholder: 'technique' })));
  row.appendChild(createCell(createInput('text', 'edit-input edit-set-notes', {})));

  const removeTd = document.createElement('td');
  removeTd.appendChild(createButton('btn btn-sm btn-danger btn-remove-set', 'Remove set', '✕', (e) => e.target.closest('tr').remove()));
  row.appendChild(removeTd);

  return row;
}

function createGymSetRow(idx) {
  const row = document.createElement('tr');
  row.className = 'edit-set-row';
  row.dataset.setIndex = idx;
  row.dataset.setType = 'gym';

  row.appendChild(createCell(createInput('text', 'edit-input edit-exercise', { placeholder: 'Exercise name' })));
  row.appendChild(createCell(createInput('number', 'edit-input edit-sets', { value: 3, min: 1 })));
  row.appendChild(createCell(createInput('number', 'edit-input edit-reps', { value: 10, min: 1 })));
  row.appendChild(createCell(createInput('number', 'edit-input edit-weight', { value: 0, min: 0 })));
  row.appendChild(createCell(createInput('number', 'edit-input edit-rest', { value: 60, min: 0 })));
  row.appendChild(createCell(createInput('text', 'edit-input edit-muscle', { placeholder: 'full-body' })));

  const removeTd = document.createElement('td');
  removeTd.appendChild(createButton('btn btn-sm btn-danger btn-remove-set', 'Remove', '✕', (e) => e.target.closest('tr').remove()));
  row.appendChild(removeTd);

  return row;
}

// ─── App State ───
const state = {
  currentProfile: null,
  profiles: [],
  customizationOptions: null,
  editingProfileId: null, // null = create mode, string = edit mode
  debugLlm: null,
  globalLlm: null,
};

// ─── DOM Ready ───
document.addEventListener('DOMContentLoaded', async () => {
  initRouter();
  initProfileForm();
  initGenerateForm();
  initExpandableSections();
  initHistoryPage();
  initSettingsPage();
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
      const workoutIdRaw = rest[0];
      if (workoutIdRaw) {
        const [workoutId, queryString] = workoutIdRaw.split('?');
        const editMode = queryString === 'edit=1';
        loadWorkoutPage(workoutId, editMode);
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

    case 'coach':
      if (!state.currentProfile) {
        showToast(state.profiles.length > 0 ? 'Please select a profile from the dropdown.' : 'Please create a profile first.', 'error');
        navigateTo('profile');
        return;
      }
      showPage('coach');
      setActiveNav('coach');
      await loadCoachPage();
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

    case 'settings':
      showPage('settings');
      setActiveNav('settings');
      loadSettingsPage();
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
        if (window.posthog) {
          posthog.capture('profile_updated', {
            experience_level: data.experienceLevel,
            weekly_pool_sessions: data.trainingSchedule?.weeklyPoolSessions,
            weekly_gym_sessions: data.trainingSchedule?.weeklyGymSessions,
          });
        }
        showToast('Profile updated!', 'success');
        navigateTo('generate');
      } else {
        // Create mode — POST
        const result = await api.profiles.create(data);
        state.currentProfile = result.data;
        localStorage.setItem('swimcoach_profile_id', state.currentProfile._id);
        await loadAllProfiles();
        if (window.posthog) {
          posthog.identify(state.currentProfile._id, {
            experience_level: data.experienceLevel,
          });
          posthog.capture('profile_created', {
            experience_level: data.experienceLevel,
            weekly_pool_sessions: data.trainingSchedule?.weeklyPoolSessions,
            weekly_gym_sessions: data.trainingSchedule?.weeklyGymSessions,
            goal_outcomes: data.goals?.outcomes,
          });
        }
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

  // Collect weight inventory
  const weightInventory = [];
  form.querySelectorAll('.weight-inventory-row').forEach(row => {
    const type = row.querySelector('.weight-type').value;
    const weight = parseFloat(row.querySelector('.weight-value').value);
    const unit = row.querySelector('.weight-unit').value;
    if (type && weight) {
      weightInventory.push({ type, weight, unit });
    }
  });

  // Collect one-rep maxes
  const oneRepMaxes = [];
  form.querySelectorAll('.one-rep-max-row').forEach(row => {
    const exercise = row.querySelector('.orm-exercise').value;
    const weight = parseFloat(row.querySelector('.orm-weight').value);
    const unit = row.querySelector('.orm-unit').value;
    const estimated = row.querySelector('.orm-estimated')?.checked || false;
    if (exercise && weight) {
      oneRepMaxes.push({ exercise, weight, unit, estimated });
    }
  });

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
      weightInventory,
    },
    bestTimes,
    oneRepMaxes,
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

  // Weight inventory (stored under equipment in the backend schema)
  renderWeightInventory(profile.equipment?.weightInventory || []);

  // Day toggles
  renderDayToggles(profile.trainingSchedule?.poolDays || [], profile.trainingSchedule?.gymDays || []);

  // Competition date ranges
  renderCompetitionDates(profile.trainingSchedule?.competitionDates || []);

  // Best times
  renderBestTimes(profile.bestTimes || []);

  // One-Rep Maxes
  renderOneRepMaxes(profile.oneRepMaxes || []);

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

// ─── Weight Inventory UI ───

function renderWeightInventory(items) {
  const container = document.getElementById('weight-inventory-list');
  if (!container) return;
  container.innerHTML = '';
  if (!items.length) return;
  items.forEach(item => addWeightInventoryRow(item));
}

function addWeightInventoryRow(existing = null) {
  const container = document.getElementById('weight-inventory-list');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'weight-inventory-row';
  row.style.cssText = 'display:flex;gap:var(--space-sm);align-items:center;margin-bottom:var(--space-sm);';
  row.innerHTML = `
    <select class="weight-type" required style="width:140px;">
      <option value="">Type…</option>
      <option value="dumbbell" ${existing?.type === 'dumbbell' ? 'selected' : ''}>Dumbbell</option>
      <option value="barbell" ${existing?.type === 'barbell' ? 'selected' : ''}>Barbell</option>
      <option value="plate" ${existing?.type === 'plate' ? 'selected' : ''}>Plate</option>
      <option value="kettlebell" ${existing?.type === 'kettlebell' ? 'selected' : ''}>Kettlebell</option>
    </select>
    <input type="number" class="weight-value" min="0" step="0.5" placeholder="Weight" value="${existing?.weight || ''}" style="width:100px;">
    <select class="weight-unit" style="width:70px;">
      <option value="lbs" ${existing?.unit === 'lbs' || !existing?.unit ? 'selected' : ''}>lbs</option>
      <option value="kg" ${existing?.unit === 'kg' ? 'selected' : ''}>kg</option>
    </select>
    <button type="button" class="btn btn-sm btn-secondary btn-remove-weight" title="Remove">✕</button>
  `;
  row.querySelector('.btn-remove-weight').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

// Wire up the "Add Weight" button (profile form)
document.addEventListener('DOMContentLoaded', () => {
  const addBtn = document.getElementById('btn-add-weight');
  if (addBtn) addBtn.addEventListener('click', () => addWeightInventoryRow());
  const genAddBtn = document.getElementById('btn-gen-add-weight');
  if (genAddBtn) genAddBtn.addEventListener('click', () => addGenWeightInventoryRow());
});

// ─── Generate Form Weight Inventory UI ───

function renderGenWeightInventory(items) {
  const container = document.getElementById('gen-weight-inventory-list');
  if (!container) return;
  container.innerHTML = '';
  if (!items.length) return;
  items.forEach(item => addGenWeightInventoryRow(item));
}

function addGenWeightInventoryRow(existing = null) {
  const container = document.getElementById('gen-weight-inventory-list');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'gen-weight-inventory-row weight-inventory-row';
  row.style.cssText = 'display:flex;gap:var(--space-sm);align-items:center;margin-bottom:var(--space-sm);';
  row.innerHTML = `
    <select class="gen-weight-type" required style="width:140px;">
      <option value="">Type…</option>
      <option value="dumbbell" ${existing?.type === 'dumbbell' ? 'selected' : ''}>Dumbbell</option>
      <option value="barbell" ${existing?.type === 'barbell' ? 'selected' : ''}>Barbell</option>
      <option value="plate" ${existing?.type === 'plate' ? 'selected' : ''}>Plate</option>
      <option value="kettlebell" ${existing?.type === 'kettlebell' ? 'selected' : ''}>Kettlebell</option>
    </select>
    <input type="number" class="gen-weight-value" min="0" step="0.5" placeholder="Weight" value="${existing?.weight || ''}" style="width:100px;">
    <select class="gen-weight-unit" style="width:70px;">
      <option value="lbs" ${existing?.unit === 'lbs' || !existing?.unit ? 'selected' : ''}>lbs</option>
      <option value="kg" ${existing?.unit === 'kg' ? 'selected' : ''}>kg</option>
    </select>
    <button type="button" class="btn btn-sm btn-secondary btn-remove-gen-weight" title="Remove">✕</button>
  `;
  row.querySelector('.btn-remove-gen-weight').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

// ─── Generate Form One-Rep Max UI ───

function renderGenOneRepMaxes(items) {
  const container = document.getElementById('gen-one-rep-max-list');
  if (!container) return;
  container.innerHTML = '';
  if (!items.length) return;
  items.forEach(item => addGenOneRepMaxRow(item));
}

function addGenOneRepMaxRow(existing = null) {
  const container = document.getElementById('gen-one-rep-max-list');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'gen-one-rep-max-row one-rep-max-row';
  row.style.cssText = 'display:flex;gap:var(--space-sm);align-items:center;margin-bottom:var(--space-sm);';

  const exercises = [
    { value: 'squat', label: 'Back Squat' },
    { value: 'clean', label: 'Power Clean' },
    { value: 'strict-overhead-press', label: 'Strict Overhead Press' },
    { value: 'bench-press', label: 'Bench Press' },
    { value: 'deadlift', label: 'Deadlift' },
    { value: 'front-squat', label: 'Front Squat' },
    { value: 'push-press', label: 'Push Press' },
    { value: 'pull-up', label: 'Weighted Pull-up' },
  ];

  row.innerHTML = `
    <select class="gen-orm-exercise" required style="width:200px;">
      <option value="">Exercise…</option>
      ${exercises.map(e => `<option value="${e.value}" ${existing?.exercise === e.value ? 'selected' : ''}>${e.label}</option>`).join('')}
    </select>
    <input type="number" class="gen-orm-weight" min="0" step="0.5" placeholder="Weight" value="${existing?.weight || ''}" style="width:100px;">
    <select class="gen-orm-unit" style="width:70px;">
      <option value="lbs" ${existing?.unit === 'lbs' || !existing?.unit ? 'selected' : ''}>lbs</option>
      <option value="kg" ${existing?.unit === 'kg' ? 'selected' : ''}>kg</option>
    </select>
    <label style="display:flex;align-items:center;gap:4px;font-size:0.85rem;">
      <input type="checkbox" class="gen-orm-estimated" ${existing?.estimated ? 'checked' : ''}> Est.
    </label>
    <button type="button" class="btn btn-sm btn-secondary btn-remove-gen-orm" title="Remove">✕</button>
  `;
  row.querySelector('.btn-remove-gen-orm').addEventListener('click', () => row.remove());
  container.appendChild(row);
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

// ─── One-Rep Max UI ───

function renderOneRepMaxes(items) {
  const container = document.getElementById('one-rep-max-list');
  if (!container) return;
  container.innerHTML = '';
  if (!items.length) return;
  items.forEach(item => addOneRepMaxRow(item));
}

function addOneRepMaxRow(existing = null) {
  const container = document.getElementById('one-rep-max-list');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'one-rep-max-row';
  row.style.cssText = 'display:flex;gap:var(--space-sm);align-items:center;margin-bottom:var(--space-sm);';

  const exercises = [
    { value: 'squat', label: 'Back Squat' },
    { value: 'clean', label: 'Power Clean' },
    { value: 'strict-overhead-press', label: 'Strict Overhead Press' },
    { value: 'bench-press', label: 'Bench Press' },
    { value: 'deadlift', label: 'Deadlift' },
    { value: 'front-squat', label: 'Front Squat' },
    { value: 'push-press', label: 'Push Press' },
    { value: 'pull-up', label: 'Weighted Pull-up' },
  ];

  row.innerHTML = `
    <select class="orm-exercise" required style="width:200px;">
      <option value="">Exercise…</option>
      ${exercises.map(e => `<option value="${e.value}" ${existing?.exercise === e.value ? 'selected' : ''}>${e.label}</option>`).join('')}
    </select>
    <input type="number" class="orm-weight" min="0" step="0.5" placeholder="Weight" value="${existing?.weight || ''}" style="width:100px;">
    <select class="orm-unit" style="width:70px;">
      <option value="lbs" ${existing?.unit === 'lbs' || !existing?.unit ? 'selected' : ''}>lbs</option>
      <option value="kg" ${existing?.unit === 'kg' ? 'selected' : ''}>kg</option>
    </select>
    <label style="display:flex;align-items:center;gap:4px;font-size:0.85rem;">
      <input type="checkbox" class="orm-estimated" ${existing?.estimated ? 'checked' : ''}> Est.
    </label>
    <button type="button" class="btn btn-sm btn-secondary btn-remove-orm" title="Remove">✕</button>
  `;
  row.querySelector('.btn-remove-orm').addEventListener('click', () => row.remove());
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

  // Prefill weight inventory from profile (stored under equipment)
  renderGenWeightInventory(p.equipment?.weightInventory || []);

  // Prefill one-rep maxes from profile
  renderGenOneRepMaxes(p.oneRepMaxes || []);

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

}

async function generateWorkout(form) {
  const btn = form.querySelector('button[type="submit"]');

  const originalText = btn?.textContent || 'Generate Custom Workout →';
  btn && (btn.disabled = true);

  const genData = collectGenerateFormData(form);
  const isProgram = genData.programPeriod && genData.programPeriod !== 'single';

  showLoading(isProgram
    ? `Generating your ${genData.programPeriod} program… This may take a few minutes.`
    : 'Generating your workout… Open Notebook is thinking. This may take 30–60 seconds.');

  try {
    genData.swimmerId = state.currentProfile._id;
    if (state.globalLlm) genData.llmModel = state.globalLlm;

    if (isProgram) {
      // Use program generation endpoint
      const result = await api.workouts.generateProgram(genData);
      hideLoading();
      const generated = result.data.generatedCount;
      const total = result.data.totalSessions;
      if (window.posthog) {
        posthog.capture('program_generated', {
          program_period: genData.programPeriod,
          generated_count: generated,
          total_sessions: total,
          partial: !!result.data.partial,
          workout_type: genData.workoutType,
        });
      }
      if (result.data.partial) {
        const failedSessions = result.data.errors?.map(e => e.dayOfWeek ? `${e.dayOfWeek} (${e.sessionType})` : `session ${e.session}`).join(', ');
        const detail = failedSessions ? ` Missing: ${failedSessions}.` : '';
        showToast(`Program partially generated: ${generated}/${total} workouts created.${detail} Try regenerating the missing ones.`, 'warning');
      } else {
        showToast(`Program generated! ${generated} workouts created. 🎉`, 'success');
      }
      navigateTo('history');
    } else {
      const result = await api.workouts.generate(genData);
      hideLoading();
      if (window.posthog) {
        posthog.capture('workout_generated', {
          workout_type: genData.workoutType,
          session_type: genData.sessionType,
          duration: genData.duration,
          intensity: genData.intensity,
        });
      }
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

  const stroke = fd.get('stroke');
  if (stroke) data.stroke = stroke;

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

  // Collect weight inventory from generate form
  const genWeightInventory = [];
  form.querySelectorAll('.gen-weight-inventory-row').forEach(row => {
    const type = row.querySelector('.gen-weight-type').value;
    const weight = parseFloat(row.querySelector('.gen-weight-value').value);
    const unit = row.querySelector('.gen-weight-unit').value;
    if (type && weight) {
      genWeightInventory.push({ type, weight, unit });
    }
  });
  if (genWeightInventory.length) {
    data.weightInventory = genWeightInventory;
  }

  // Collect one-rep maxes from generate form
  const genOneRepMaxes = [];
  form.querySelectorAll('.gen-one-rep-max-row').forEach(row => {
    const exercise = row.querySelector('.gen-orm-exercise').value;
    const weight = parseFloat(row.querySelector('.gen-orm-weight').value);
    const unit = row.querySelector('.gen-orm-unit').value;
    const estimated = row.querySelector('.gen-orm-estimated')?.checked || false;
    if (exercise && weight) {
      genOneRepMaxes.push({ exercise, weight, unit, estimated });
    }
  });
  if (genOneRepMaxes.length) {
    data.oneRepMaxes = genOneRepMaxes;
  }

  return data;
}

// ─── Workout Page ───

async function loadWorkoutPage(workoutId, editMode = false) {
  showLoading('Loading workout…');
  try {
    const result = await api.workouts.get(workoutId);
    const workout = result.data;

    const container = document.getElementById('workout-content');

    if (editMode) {
      container.innerHTML = buildWorkoutViewWithActions(workout);
      initEditHandler(workout);
      initDeleteHandler(workoutId);
    } else {
      container.innerHTML = buildWorkoutCard(workout);
      container.innerHTML += `
        <div class="workout-actions-bar">
          <button type="button" class="btn btn-secondary btn-back-to-history" data-id="${workoutId}">← Back to History</button>
          <button type="button" class="btn btn-secondary btn-edit-workout-page" data-id="${workoutId}">✏️ Edit</button>
          <button type="button" class="btn btn-danger btn-delete-workout-page" data-id="${workoutId}">🗑 Delete</button>
        </div>`;
      container.innerHTML += buildChatPanel(workoutId);
      container.innerHTML += buildFeedbackForm(workoutId, workout.userFeedback);

      initChatHandler(workoutId);
      initFeedbackHandler(workoutId, workout.userFeedback);

      // Click date badge to open edit mode
      container.querySelector('.badge-date')?.addEventListener('click', () => {
        loadWorkoutPage(workoutId, true);
      });
      container.querySelector('.btn-back-to-history').addEventListener('click', () => {
        navigateTo('history');
      });
      container.querySelector('.btn-edit-workout-page').addEventListener('click', () => {
        loadWorkoutPage(workoutId, true);
      });
      container.querySelector('.btn-delete-workout-page').addEventListener('click', () => {
        if (!confirm('Are you sure you want to delete this workout? This cannot be undone.')) return;
        deleteWorkout(workoutId);
      });
    }

    showPage('workout');
    hideLoading();
  } catch (err) {
    hideLoading();
    showToast(`Error loading workout: ${err.message}`, 'error');
    navigateTo('generate');
  }
}

function buildWorkoutViewWithActions(workout) {
  return buildWorkoutCard(workout) + buildWorkoutEditForm(workout);
}

  // Edit & Delete Handlers

	function initDeleteHandler(workoutId) {
	  const form = document.getElementById(`workout-edit-form-${workoutId}`);
	  if (!form) return;
	  form.addEventListener('click', (e) => {
	    if (e.target.closest('.btn-delete-workout-page')) {
	      e.preventDefault();
	      if (!confirm('Are you sure you want to delete this workout? This cannot be undone.')) return;
	      deleteWorkout(workoutId);
	    }
	  });
	}

	function initEditHandler(workout) {
	  const workoutId = workout._id;
	  const form = document.getElementById(`workout-edit-form-${workoutId}`);
	  if (!form) return;

	  form.querySelector('.btn-save-edit')?.addEventListener('click', async () => {
	    const btn = form.querySelector('.btn-save-edit');
	    btn.disabled = true;
	    btn.textContent = 'Saving…';
	    try {
	      const updateData = collectEditFormData(workoutId, workout);
	      const result = await api.workouts.update(workoutId, updateData);
	      showToast('Workout updated!', 'success');
	      const container = document.getElementById('workout-content');
	      container.innerHTML = buildWorkoutCard(result.data);
	      container.innerHTML += `\n\t\t\t<div class="workout-actions-bar">\n\t\t\t  <button type="button" class="btn btn-secondary btn-edit-workout-page" data-id="${workoutId}">\u270f\ufe0f Edit</button>\n\t\t\t  <button type="button" class="btn btn-danger btn-delete-workout-page" data-id="${workoutId}">\ud83d\uddd1 Delete</button>\n\t\t\t</div>`;
	      container.innerHTML += buildChatPanel(workoutId);
	      container.innerHTML += buildFeedbackForm(workoutId, result.data.userFeedback);
	      initChatHandler(workoutId);
	      initFeedbackHandler(workoutId, result.data.userFeedback);
      // Click date badge to open edit mode
      container.querySelector('.badge-date')?.addEventListener('click', () => {
        loadWorkoutPage(workoutId, true);
      });
	      container.querySelector('.btn-edit-workout-page').addEventListener('click', () => {
	        loadWorkoutPage(workoutId, true);
	      });
	      container.querySelector('.btn-delete-workout-page').addEventListener('click', () => {
	        if (!confirm('Are you sure you want to delete this workout? This cannot be undone.')) return;
	        deleteWorkout(workoutId);
	      });
	    } catch (err) {
	      showToast(`Error saving workout: ${err.message}`, 'error');
	      btn.disabled = false;
	      btn.textContent = '\ud83d\udcbe Save Changes';
	    }
	  });

	  form.querySelector('.btn-cancel-edit')?.addEventListener('click', () => {
	    loadWorkoutPage(workoutId, false);
	  });

	  form.addEventListener('click', (e) => {
	    const removeBtn = e.target.closest('.btn-remove-set');
	    if (removeBtn) {
	      e.preventDefault();
	      removeBtn.closest('tr').remove();
	    }
	  });

        form.querySelector('.btn-add-set[data-pool="true"]')?.addEventListener('click', () => {
          const tbody = document.getElementById(`edit-pool-sets-${workoutId}`);
          const idx = tbody.querySelectorAll('.edit-set-row').length;
          const row = createPoolSetRow(idx);
          tbody.appendChild(row);
        });

	  form.querySelector('.btn-add-set[data-pool="false"]')?.addEventListener('click', () => {
	    const tbody = document.getElementById(`edit-gym-sets-${workoutId}`);
	    const idx = tbody.querySelectorAll('.edit-set-row').length;
	    const row = createGymSetRow(idx);
	    tbody.appendChild(row);
	  });
	}

	function collectEditFormData(workoutId, originalWorkout) {
	  const workoutName = document.getElementById(`edit-name-${workoutId}`).value.trim();
	  const workoutType = document.getElementById(`edit-type-${workoutId}`).value;
	  const duration = parseInt(document.getElementById(`edit-duration-${workoutId}`).value, 10);
	  const intensity = document.getElementById(`edit-intensity-${workoutId}`).value;
	  const dateVal = document.getElementById(`edit-date-${workoutId}`).value;

	  // Only include date in update if user explicitly changed it
	  // Parse as UTC to avoid timezone shifts (input type="date" is treated as local by browser)
	  let date;
	  if (dateVal && originalWorkout) {
	    const originalDateStr = formatDateInput(originalWorkout.date || originalWorkout.createdAt);
	    if (dateVal !== originalDateStr) {
	      // User changed the date - parse as UTC to preserve the selected date
	      const [year, month, day] = dateVal.split('-').map(Number);
	      date = new Date(Date.UTC(year, month - 1, day));
	    }
	  }

	  const poolWarmUpDistance = parseInt(document.getElementById(`edit-pool-wu-dist-${workoutId}`).value, 10) || 0;
	  const poolWarmUpDuration = parseInt(document.getElementById(`edit-pool-wu-dur-${workoutId}`).value, 10) || 0;
	  const poolWarmUpDesc = document.getElementById(`edit-pool-wu-desc-${workoutId}`).value.trim();
	  const poolCoolDownDistance = parseInt(document.getElementById(`edit-pool-cd-dist-${workoutId}`).value, 10) || 0;
	  const poolCoolDownDuration = parseInt(document.getElementById(`edit-pool-cd-dur-${workoutId}`).value, 10) || 0;
	  const poolCoolDownDesc = document.getElementById(`edit-pool-cd-desc-${workoutId}`).value.trim();

	    const poolMainSet = [];
  document.querySelectorAll(`#edit-pool-sets-${workoutId} .edit-set-row`).forEach(function(row) {
    const sendOff = row.querySelector('.edit-sendoff')?.value.trim() || '';
    const targetPace = row.querySelector('.edit-targetpace')?.value.trim() || '';
    const rest = row.querySelector('.edit-rest')?.value.trim() || '';
    poolMainSet.push({
      repetitions: parseInt(row.querySelector('.edit-reps').value, 10) || 1,
      distance: parseInt(row.querySelector('.edit-distance').value, 10) || 0,
      stroke: row.querySelector('.edit-stroke').value.trim() || 'freestyle',
      interval: sendOff,
      intervalDetail: (sendOff || targetPace || rest) ? {
        sendOff: sendOff,
        targetPace: targetPace,
        rest: rest,
        type: 'fixed',
        progression: ''
      } : null,
      focus: row.querySelector('.edit-focus').value.trim(),
      description: row.querySelector('.edit-set-notes').value.trim(),
    });

	  const poolTotalDistance = poolMainSet.reduce(function(sum, s) { return sum + (s.distance * s.repetitions); }, 0)
	    + poolWarmUpDistance + poolCoolDownDistance;

	  const gymWarmUpDuration = parseInt(document.getElementById(`edit-gym-wu-dur-${workoutId}`).value, 10) || 0;
	  const gymWarmUpDesc = document.getElementById(`edit-gym-wu-desc-${workoutId}`).value.trim();
	  const gymCoolDownDuration = parseInt(document.getElementById(`edit-gym-cd-dur-${workoutId}`).value, 10) || 0;
	  const gymCoolDownDesc = document.getElementById(`edit-gym-cd-desc-${workoutId}`).value.trim();

		const gymMainSet = [];
		document.querySelectorAll(`#edit-gym-sets-${workoutId} .edit-set-row`).forEach(function(row) {
		  const weightUnitVal = row.querySelector('.edit-weight-unit')?.value || null;
		  gymMainSet.push({
		    exercise: row.querySelector('.edit-exercise').value.trim(),
		    sets: parseInt(row.querySelector('.edit-sets').value, 10) || 1,
		    repetitions: parseInt(row.querySelector('.edit-reps').value, 10) || 1,
		    weight: parseInt(row.querySelector('.edit-weight').value, 10) || 0,
		    weightUnit: weightUnitVal,
		    restTime: parseInt(row.querySelector('.edit-rest').value, 10) || 0,
		    muscleGroup: row.querySelector('.edit-muscle').value.trim() || 'full-body',
		  });
		});

	  const poolNotesEl = document.getElementById(`edit-pool-notes-${workoutId}`);
  const gymNotesEl = document.getElementById(`edit-gym-notes-${workoutId}`);
  const legacyNotesEl = document.getElementById(`edit-notes-${workoutId}`);
  const poolTrainingNotes = poolNotesEl ? poolNotesEl.value.trim().split('\n').map(function(n) { return n.trim(); }).filter(Boolean) : [];
  const gymTrainingNotes = gymNotesEl ? gymNotesEl.value.trim().split('\n').map(function(n) { return n.trim(); }).filter(Boolean) : [];
  const legacyTrainingNotes = legacyNotesEl && !poolNotesEl && !gymNotesEl
    ? legacyNotesEl.value.trim().split('\n').map(function(n) { return n.trim(); }).filter(Boolean) : [];
	  return {
	    workoutName: workoutName,
	    workoutType: workoutType,
	    duration: duration,
	    intensity: intensity,
	    date: date,
	    poolWorkout: {
	      warmUp: { distance: poolWarmUpDistance, duration: poolWarmUpDuration, description: poolWarmUpDesc },
	      mainSet: poolMainSet,
	      coolDown: { distance: poolCoolDownDistance, duration: poolCoolDownDuration, description: poolCoolDownDesc },
	      totalDistance: poolTotalDistance,
	      trainingNotes: poolTrainingNotes,
	    },
	    gymWorkout: {
	      warmUp: { duration: gymWarmUpDuration, description: gymWarmUpDesc },
	      mainSet: gymMainSet,
	      coolDown: { duration: gymCoolDownDuration, description: gymCoolDownDesc },
	      trainingNotes: gymTrainingNotes,
	    },
	    trainingNotes: legacyTrainingNotes,
	  };
	}

async function deleteWorkout(workoutId) {
  if (!workoutId || !/^[0-9a-fA-F]{24}$/.test(workoutId)) {
    showToast('Invalid workout ID.', 'error');
    return;
  }
  showLoading('Deleting workout…');
  try {
    await api.workouts.delete(workoutId);
    hideLoading();
    if (window.posthog) posthog.capture('workout_deleted', { workout_id: workoutId });
    showToast('Workout deleted.', 'info');
    navigateTo('history');
  } catch (err) {
    hideLoading();
    if (err.message.includes('not found')) {
      showToast('Workout not found — it may have already been deleted.', 'error');
    } else {
      showToast(`Error deleting workout: ${err.message}`, 'error');
    }
  }
}

// ─── Chat Handler ───

// Per-workout chat persistence — uses MongoDB-backed Conversation collection
// instead of localStorage so conversations survive across devices and refreshes.

async function getWorkoutConversation(workoutId) {
  // Try to load an existing conversation for this workout
  const swimmerId = state.currentProfile?._id;
  let res;
  try {
    res = await api.conversations.findForWorkout(workoutId);
  } catch (err) {
    // 404 = no conversation exists yet
    if (err.message.includes('404') || err.message.includes('No conversation')) {
      res = { success: false };
    } else {
      throw err;
    }
  }
  if (res.success) return res.data;
  // No existing conversation — create one tied to this workout
  const created = await api.conversations.create(
    { title: 'Workout chat', contextWorkoutId: workoutId },
  );
  return created.data;
}

async function initChatHandler(workoutId) {
  // Load (or create) the persistent conversation for this workout
  const conversation = await getWorkoutConversation(workoutId);
  const conv = conversation.messages || [];
  // Seed welcome message if fresh
  if (conv.length === 0) {
    const welcomeMsg = {
      role: 'coach',
      text: 'Need a change? Ask for a harder/easier version, swap exercises, adjust the duration, or just ask me anything about your workout.',
    };
    conv.push(welcomeMsg);
    // Save the welcome message to the database (backend chat endpoint doesn't save it)
    await api.conversations.addMessages(conversation._id, [welcomeMsg]);
  }
  renderConversation(workoutId, conv);

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

    const userMsg = { role: 'user', text };
    // Add user message to local conversation
    conv.push(userMsg);
    renderConversation(workoutId, conv);
    if (window.posthog) {
      posthog.capture('coach_message_sent', { message_count: conv.length });
    }
    input.value = '';

    // Show typing indicator
    const typingId = addTypingIndicator(workoutId);

    try {
      const chatBody = {
        message: text,
        messages: conv.map(m => ({ role: m.role, text: m.text })),
      };
      if (state.globalLlm) chatBody.llmModel = state.globalLlm;
      const result = await api.workouts.chat(workoutId, chatBody);

      removeTypingIndicator(typingId);

      const { reply, actions, workout: newWorkout, conversationId } = result.data;

      const coachMsg = { role: 'coach', text: reply };
      // Add coach reply to local conversation
      conv.push(coachMsg);

      // Update conversation ID if backend returned a new one
      if (conversationId) {
        conversation._id = conversationId;
      }

      renderConversation(workoutId, conv);

      // Note: Backend chat endpoint saves both user and coach messages to the database.
      // We don't call addMessages here to avoid duplication.

      // If the agent already applied a regeneration, update the display
      if (newWorkout) {
        // Transfer conversation to the new workout's ID in the background
        const oldConvId = conversation._id;
        const newConversation = await getWorkoutConversation(newWorkout._id);
        await api.conversations.addMessages(
          newConversation._id,
          conv.map(m => ({ role: m.role, text: m.text })),
        );
        // Clean up stale old-workout conversation
        await api.conversations.delete(oldConvId).catch(() => {});

        const container = document.getElementById('workout-content');
        container.innerHTML = buildWorkoutCard(newWorkout);
        container.innerHTML += buildChatPanel(newWorkout._id);
        container.innerHTML += buildFeedbackForm(newWorkout._id, newWorkout.userFeedback);

        initChatHandler(newWorkout._id);
        initFeedbackHandler(newWorkout._id, newWorkout.userFeedback);

        window.history.replaceState(null, '', `#workout/${newWorkout._id}`);
        showToast('Workout updated!', 'success');
      }

      // Show pending proposals (modifyWorkout) for in-workout chat
      if (actions?.length > 0) {
        for (const action of actions) {
          if (action.proposal) {
            // For workout chat, auto-confirm modifications since we're in-context
            if (action.action === 'modifyWorkout') {
              // Show the proposal inline; user can dismiss if they don't want it
              const proposalEl = buildActionProposal(action, 'workout', 0);
              if (proposalEl) {
                const msgContainer = document.getElementById(`chat-messages-${workoutId}`);
                if (msgContainer) {
                  msgContainer.appendChild(proposalEl);
                  msgContainer.scrollTop = msgContainer.scrollHeight;
                  proposalEl.querySelector('.btn-confirm-proposal')?.addEventListener('click', async () => {
                    // Apply modification directly via workout update endpoint
                    try {
                      const update = {};
                      update[action.field] = parseActionValue(action.newValue);
                      update.updatedAt = new Date().toISOString();
                      const result = await api.workouts.update(action.workoutId, update);
                      proposalEl.remove();
                      showToast('Change applied!', 'success');
                      // Update the workout card in-place without reloading the page
                      const updatedWorkout = result.data;
                      const container = document.getElementById('workout-content');
                      // Replace only the workout card, preserving chat panel and feedback form
                      const cardIndex = Array.from(container.children).findIndex(el => el.classList.contains('workout-card'));
                      if (cardIndex !== -1) {
                        const temp = document.createElement('div');
                        temp.innerHTML = buildWorkoutCard(updatedWorkout);
                        container.replaceChild(temp.firstElementChild, container.children[cardIndex]);
                      }
                    } catch (err) {
                      showToast(`Failed: ${err.message}`, 'error');
                    }
                  });
                  proposalEl.querySelector('.btn-dismiss-proposal')?.addEventListener('click', () => {
                    proposalEl.remove();
                  });
                }
              }
            }
          }
        }
      }
    } catch (err) {
      removeTypingIndicator(typingId);
      const errorMsg = { role: 'coach', text: `Sorry, I couldn't process that: ${escapeHtml(err.message)}` };
      conv.push(errorMsg);
      renderConversation(workoutId, conv);
      // Save error message to database (doesn't go through backend chat endpoint)
      try {
        await api.conversations.addMessages(conversation._id, [errorMsg]);
      } catch (e) {
        console.warn('Failed to save error message:', e.message);
      }
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
        quality: fd.get('quality') || undefined,
        accuracy: fd.get('accuracy') || undefined,
        comments: fd.get('comments') || undefined,
      };

      await api.workouts.feedback(workoutId, feedback);
      if (window.posthog) {
        posthog.capture('workout_feedback_submitted', {
          rating: feedback.rating,
          difficulty_perception: feedback.difficultyPerception,
          enjoyment: feedback.enjoyment,
          quality: feedback.quality,
          accuracy: feedback.accuracy,
        });
      }
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
    const result = await api.workouts.list();
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
      const date = new Date(w.date || w.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
      const rating = w.userFeedback?.rating || 0;
      const ratingStars = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : 'Not rated';
      const isProgram = !!w.programId;
      const programBadge = isProgram ? `<span class="history-card-program-badge">Program</span>` : '';
      return `
        <div class="history-card" data-id="${w._id}">
          <div class="history-card-header">
            <div>
              <span class="history-card-name">${escapeHtml(w.workoutName || 'Workout')}</span>
              <span class="history-card-type">${escapeHtml(w.workoutType)}</span>
              ${programBadge}
              <span class="history-card-date">${date}</span>
            </div>
            <span class="history-card-rating">${ratingStars}</span>
          </div>
          <div class="history-card-body">
            <span>${w.poolWorkout?.totalDistance || 0}${w.poolWorkout?.poolUnit === 'yards' ? 'yd' : 'm'} pool</span>
            <span>${w.duration}min</span>
            <span>${escapeHtml(w.intensity || 'moderate')}</span>
          </div>
          <div class="history-card-actions">
            <button type="button" class="btn btn-sm btn-secondary btn-view-workout" data-id="${w._id}">View</button>
            <button type="button" class="btn btn-sm btn-secondary btn-edit-workout" data-id="${w._id}">Edit</button>
            ${isProgram ? `<button type="button" class="btn btn-sm btn-primary btn-view-program" data-program-id="${w.programId}">View Program</button>` : ''}
            <button type="button" class="btn btn-sm btn-danger btn-delete-workout" data-id="${w._id}">Delete</button>
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
    container.querySelectorAll('.btn-delete-workout').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (confirm('Delete this workout? This cannot be undone.')) {
          deleteWorkout(id);
        }
      });
    });

    hideLoading();
  } catch (err) {
    hideLoading();
    container.innerHTML = `<div class="empty-state"><p>Error loading workouts: ${escapeHtml(err.message)}</p></div>`;
  }
}

// ─── Coach Page ───

const coachState = {
  conversations: [],  // [{ _id, title, messages: [{role, text}], updatedAt, contextWorkoutId }]
  activeConversationId: null,
};

async function loadCoachPage() {
  const container = document.getElementById('coach-content');
  if (!container) return;

  // Always clear and rebuild — prevents duplicate panels on re-navigate
  container.innerHTML = '';

  // Layout: sidebar (conversation list) + main (chat)
  const layout = document.createElement('div');
  layout.className = 'coach-layout';

  // Sidebar
  const sidebar = document.createElement('div');
  sidebar.className = 'coach-sidebar';
  sidebar.id = 'coach-sidebar';

  const sidebarHeader = document.createElement('div');
  sidebarHeader.className = 'coach-sidebar-header';
  const newChatBtn = document.createElement('button');
  newChatBtn.className = 'btn btn-primary btn-sm';
  newChatBtn.textContent = '+ New Chat';
  newChatBtn.addEventListener('click', () => startNewCoachConversation());
  sidebarHeader.appendChild(newChatBtn);
  sidebar.appendChild(sidebarHeader);

  const conversationList = document.createElement('div');
  conversationList.className = 'coach-conversation-list';
  conversationList.id = 'coach-conversation-list';
  sidebar.appendChild(conversationList);

  // Main chat area
  const main = document.createElement('div');
  main.className = 'coach-main';
  main.id = 'coach-main';

  layout.appendChild(sidebar);
  layout.appendChild(main);
  container.appendChild(layout);

  // Load conversations from MongoDB (every time page loads to ensure fresh data)
  await loadCoachConversations();

  renderCoachConversationList();

  // Open the active conversation, or the most recent one, or start fresh
  if (coachState.activeConversationId) {
    renderCoachChat(coachState.activeConversationId);
  } else if (coachState.conversations.length > 0) {
    coachState.activeConversationId = coachState.conversations[0]._id;
    renderCoachChat(coachState.activeConversationId);
  } else {
    startNewCoachConversation();
  }
}

async function loadCoachConversations() {
  try {
    const res = await api.conversations.list(true);
    if (res.success) {
      coachState.conversations = res.data;
    } else {
      showToast(`Failed to load conversations: ${res.error || 'Unknown error'}`, 'error');
      coachState.conversations = [];
    }
  } catch (err) {
    showToast(`Failed to load conversations: ${err.message}`, 'error');
    coachState.conversations = [];
  }
}

async function startNewCoachConversation() {
  try {
    const created = await api.conversations.create(
      { title: 'New conversation' },
    );
    coachState.conversations.unshift(created.data);
    coachState.activeConversationId = created.data._id;
    renderCoachConversationList();
    renderCoachChat(created.data._id);
  } catch (err) {
    showToast(`Failed to create conversation: ${err.message}`, 'error');
  }
}

function renderCoachConversationList() {
  const list = document.getElementById('coach-conversation-list');
  if (!list) return;
  list.innerHTML = '';

  for (const conv of coachState.conversations) {
    const convId = conv._id || conv.id;
    const item = document.createElement('div');
    item.className = `coach-conversation-item ${convId === coachState.activeConversationId ? 'active' : ''}`;
    item.dataset.conversationId = convId;

    const title = document.createElement('div');
    title.className = 'coach-conversation-title';
    title.textContent = conv.title;
    item.appendChild(title);

    const time = document.createElement('div');
    time.className = 'coach-conversation-time';
    time.textContent = formatConversationTime(conv.createdAt || conv.updatedAt);
    item.appendChild(time);

    item.addEventListener('click', () => {
      coachState.activeConversationId = convId;
      renderCoachConversationList();
      renderCoachChat(convId);
    });

    list.appendChild(item);
  }
}

function renderCoachChat(conversationId) {
  const main = document.getElementById('coach-main');
  if (!main) return;
  main.innerHTML = '';

  const conv = coachState.conversations.find(c => (c._id || c.id) === conversationId);
  if (!conv) return;

  // Chat messages area
  const messagesDiv = document.createElement('div');
  messagesDiv.className = 'chat-messages coach-chat-messages';
  messagesDiv.id = 'coach-chat-messages';

  // Welcome message if empty
  if (conv.messages.length === 0) {
    const welcome = document.createElement('div');
    welcome.className = 'chat-message coach';
    const p = document.createElement('p');
    p.textContent = "Hey! I'm your personal coach. Ask me about your training, progress, recovery — or just check in. I'll use what I know about you to give you real guidance.";
    welcome.appendChild(p);
    messagesDiv.appendChild(welcome);
  } else {
    // Render existing messages
    for (const msg of conv.messages) {
      const el = document.createElement('div');
      el.className = `chat-message ${msg.role}`;
      const p = document.createElement('p');
      p.textContent = msg.text;
      el.appendChild(p);
      messagesDiv.appendChild(el);
    }
  }

  // Input form
  const form = document.createElement('form');
  form.className = 'chat-input-form';
  form.id = 'coach-chat-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Ask your coach anything…';
  input.id = 'coach-chat-input';
  input.autocomplete = 'off';

  const sendBtn = document.createElement('button');
  sendBtn.type = 'submit';
  sendBtn.className = 'btn btn-primary btn-sm';
  sendBtn.textContent = 'Send';

  form.appendChild(input);
  form.appendChild(sendBtn);

  main.appendChild(messagesDiv);
  main.appendChild(form);

  // Scroll to bottom
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  // Focus input
  input.focus();

  // Submit handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = '';

    // Add user message
    conv.messages.push({ role: 'user', text: message });

    // Update conversation title from first message
    if (conv.messages.filter(m => m.role === 'user').length === 1) {
      conv.title = message.slice(0, 50) + (message.length > 50 ? '…' : '');
      renderCoachConversationList();
    }

    // Render user message
    const userEl = document.createElement('div');
    userEl.className = 'chat-message user';
    const userP = document.createElement('p');
    userP.textContent = message;
    userEl.appendChild(userP);
    messagesDiv.appendChild(userEl);

    // Typing indicator
    const typingEl = document.createElement('div');
    typingEl.className = 'chat-message coach typing';
    typingEl.textContent = '…';
    messagesDiv.appendChild(typingEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    try {
      const llmModel = state.globalLlm || null;
      const result = await api.coach.chat({
        message,
        messages: conv.messages.slice(0, -1).map(m => ({ role: m.role, text: m.text })),
        conversationId: conv._id,
        ...(llmModel && { llmModel }),
      });

      typingEl.remove();

      // Show coach reply
      const coachEl = document.createElement('div');
      coachEl.className = 'chat-message coach';
      const coachP = document.createElement('p');
      coachP.textContent = result.data.reply;
      coachEl.appendChild(coachP);
      messagesDiv.appendChild(coachEl);

      // Store in conversation (in-memory)
      conv.messages.push({ role: 'coach', text: result.data.reply });
      // Update local updatedAt so sidebar shows fresh timestamp
      conv.updatedAt = new Date().toISOString();

      // Update conversation ID if backend returned a new one (e.g., for proposals or new conversation created)
      if (result.data.conversationId && result.data.conversationId !== conv._id) {
        // Find and update the conversation in coachState
        const idx = coachState.conversations.findIndex(c => (c._id || c.id) === conv._id);
        if (idx !== -1) {
          coachState.conversations[idx]._id = result.data.conversationId;
        } else {
          // Conversation not in our state (e.g., backend created new one) - fetch it
          try {
            const fetched = await api.conversations.get(result.data.conversationId);
            if (fetched.success && fetched.data) {
              coachState.conversations.unshift(fetched.data);
            }
          } catch (e) {
            console.warn('Failed to fetch new conversation:', e.message);
          }
        }
        conv._id = result.data.conversationId;
      }

      // Refresh conversation list in case backend created a new conversation
      renderCoachConversationList();

      // Handle action proposals
      if (result.data.actions?.length > 0) {
        for (let i = 0; i < result.data.actions.length; i++) {
          const action = result.data.actions[i];
          if (action.proposal) {
            const proposalEl = buildActionProposal(action, result.data.conversationId || conv._id, i);
            if (proposalEl) {
              messagesDiv.appendChild(proposalEl);
              messagesDiv.scrollTop = messagesDiv.scrollHeight;

              proposalEl.querySelector('.btn-confirm-proposal')?.addEventListener('click', () => confirmCoachAction(result.data.conversationId || conv._id, i));
              proposalEl.querySelector('.btn-dismiss-proposal')?.addEventListener('click', () => dismissCoachAction(result.data.conversationId || conv._id, i, proposalEl));
            }
          }
        }
      }

      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } catch (err) {
      typingEl.remove();
      const errEl = document.createElement('div');
      errEl.className = 'chat-message coach';
      const errP = document.createElement('p');
      errP.textContent = 'Sorry, I had trouble with that. Try again?';
      errEl.appendChild(errP);
      messagesDiv.appendChild(errEl);
      console.error('Coach chat error:', err);
    }

    input.focus();
  });
}

function formatConversationTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function confirmCoachAction(conversationId, actionIndex) {
  const swimmerId = state.currentProfile?._id;
  try {
    showLoading('Applying change…');
    const result = await api.coach.confirm(conversationId, actionIndex);
    hideLoading();

    if (result.data?.applied) {
      showToast('Change applied!', 'success');
      // Remove the proposal from the chat
      const proposal = document.querySelector(`.action-proposal[data-conversation-id="${conversationId}"][data-action-index="${actionIndex}"]`);
      if (proposal) proposal.remove();

      if (result.data.workout) {
        addCoachMessage('✅ Done — your workout has been updated. Check it in History.', 'coach');
      }
    }
  } catch (err) {
    hideLoading();
    showToast(`Failed to apply: ${err.message}`, 'error');
  }
}

function dismissCoachAction(conversationId, actionIndex, proposalEl) {
  const swimmerId = state.currentProfile?._id;
  api.coach.dismiss(conversationId, actionIndex).catch(() => {});
  if (proposalEl) proposalEl.remove();
}

function parseActionValue(val) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null') return null;
  if (!isNaN(val) && val !== '') return Number(val);
  return val;
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
      const date = new Date(w.date || w.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
      const rating = w.userFeedback?.rating || 0;
      const ratingStars = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : 'Not rated';
      const poolDist = w.poolWorkout?.totalDistance || 0;
      const poolUnit = w.poolWorkout?.poolUnit === 'yards' ? 'yd' : 'm';
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
            <span>${poolDist}${poolUnit} pool</span>
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

// ─── Settings Page ───

function initSettingsPage() {
  // Preset change — show/hide custom input
  document.getElementById('settings-llm-preset')?.addEventListener('change', (e) => {
    const customGroup = document.getElementById('settings-llm-custom-group');
    if (customGroup) customGroup.style.display = e.target.value === 'custom' ? '' : 'none';
  });

  // Save button
  document.getElementById('btn-settings-save-llm')?.addEventListener('click', () => {
    const preset = document.getElementById('settings-llm-preset').value;
    const custom = document.getElementById('settings-llm-custom').value.trim();
    const model = preset === 'custom' ? custom : preset;
    if (!model) {
      showToast('Please select or enter a model.', 'error');
      return;
    }
    state.globalLlm = model;
    localStorage.setItem('swimcoach_global_llm', model);
    updateSettingsCurrentHint(model);
    showToast(`Default model set to ${escapeHtml(model)}`, 'success');
  });

  // Reset button
  document.getElementById('btn-settings-clear-llm')?.addEventListener('click', () => {
    state.globalLlm = null;
    localStorage.removeItem('swimcoach_global_llm');
    document.getElementById('settings-llm-preset').value = '';
    document.getElementById('settings-llm-custom').value = '';
    document.getElementById('settings-llm-custom-group').style.display = 'none';
    updateSettingsCurrentHint(null);
    showToast('Reset to server default.', 'success');
  });
}

function loadSettingsPage() {
  const saved = localStorage.getItem('swimcoach_global_llm');
  if (saved) {
    state.globalLlm = saved;
    // Try to match a preset; if not found, set to custom
    const presetSelect = document.getElementById('settings-llm-preset');
    if (presetSelect) {
      const matched = Array.from(presetSelect.options).some(opt => {
        if (opt.value === saved) { presetSelect.value = saved; return true; }
        return false;
      });
      if (!matched) {
        presetSelect.value = 'custom';
        const customInput = document.getElementById('settings-llm-custom');
        if (customInput) customInput.value = saved;
        document.getElementById('settings-llm-custom-group').style.display = '';
      }
    }
    updateSettingsCurrentHint(saved);
  } else {
    updateSettingsCurrentHint(null);
  }
}

function updateSettingsCurrentHint(model) {
  const el = document.getElementById('settings-llm-current');
  if (!el) return;
  // textContent is safe — does not parse HTML. Do NOT refactor to innerHTML.
  el.textContent = model
    ? `Current default: ${model}`
    : 'Current: server default';
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
