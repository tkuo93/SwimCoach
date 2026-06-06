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
  addChatMessage,
  buildFeedbackForm,
  showAdaptiveResponse,
  escapeHtml,
} from '/js/components.js';

// ─── App State ───
const state = {
  currentProfile: null,
  profiles: [],
  customizationOptions: null,
};

// ─── DOM Ready ───
document.addEventListener('DOMContentLoaded', async () => {
  initRouter();
  initProfileForm();
  initGenerateForm();
  initExpandableSections();

  // Load customization options for generate page
  loadCustomizationOptions();

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
      // Saved ID no longer exists — try loading it directly
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
  handleRoute(); // Handle initial route
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
        if (state.profiles.length > 0) {
          showToast('Please select a profile from the dropdown.', 'error');
        } else {
          showToast('Please create a profile first.', 'error');
        }
        navigateTo('profile');
        return;
      }
      showPage('generate');
      setActiveNav('generate');
      prefillGenerateForm();
      break;

    case 'workout':
      if (!state.currentProfile) {
        if (state.profiles.length > 0) {
          showToast('Please select a profile from the dropdown.', 'error');
        } else {
          showToast('Please create a profile first.', 'error');
        }
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
      const result = await api.profiles.create(data);
      state.currentProfile = result.data;
      localStorage.setItem('swimcoach_profile_id', state.currentProfile._id);
      await loadAllProfiles();
      showToast('Profile saved! Let\'s generate your first workout.', 'success');
      navigateTo('generate');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Profile & Start Training →';
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

  // Build preferredTimes from form (simplified: just use one entry if filled)
  const preferredTimes = [];

  return {
    firstName: fd.get('firstName'),
    lastName: fd.get('lastName'),
    email: fd.get('email'),
    dateOfBirth: fd.get('dateOfBirth'),
    gender: fd.get('gender'),
    experienceLevel: fd.get('experienceLevel') || 'beginner',
    goals: {
      primaryEvents: [{
        stroke: fd.get('primaryStroke'),
        distance: parseInt(fd.get('primaryDistance'), 10),
      }],
      trainingFocus: fd.get('trainingFocus') || 'maintenance',
      targetImprovement: fd.get('targetImprovement') || '',
    },
    trainingSchedule: {
      weeklyPoolSessions: parseInt(fd.get('weeklyPoolSessions'), 10) || 3,
      weeklyGymSessions: parseInt(fd.get('weeklyGymSessions'), 10) || 2,
      sessionDuration: parseInt(fd.get('sessionDuration'), 10) || 60,
      preferredTimes,
    },
    equipment: {
      poolLength: parseInt(fd.get('poolLength'), 10) || 25,
      poolEquipment,
      gymEquipment,
    },
  };
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
    // Profile not found — clear and redirect
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

  const event = profile.goals?.primaryEvents?.[0];
  if (event) {
    setVal('primaryStroke', event.stroke);
    setVal('primaryDistance', event.distance);
  }
  setVal('trainingFocus', profile.goals?.trainingFocus);
  setVal('targetImprovement', profile.goals?.targetImprovement);

  setVal('weeklyPoolSessions', profile.trainingSchedule?.weeklyPoolSessions);
  setVal('weeklyGymSessions', profile.trainingSchedule?.weeklyGymSessions);
  setVal('sessionDuration', profile.trainingSchedule?.sessionDuration);
  setVal('poolLength', profile.equipment?.poolLength);

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
}

// ─── Profile Management ───

async function loadAllProfiles() {
  try {
    const result = await api.profiles.list();
    state.profiles = result.data || [];
    console.log('Loaded profiles:', state.profiles.length);
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

  // Handle dropdown change
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

  // Handle switch button
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
    const event = p.goals?.primaryEvents?.[0];
    const detail = event ? `${event.distance}m ${event.stroke}` : p.goals?.trainingFocus || 'No event set';
    return `
      <div class="profile-card ${isActive ? 'active' : ''}" data-id="${p._id}">
        <div class="profile-card-info">
          <span class="profile-card-name">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</span>
          <span class="profile-card-detail">${detail} · ${p.experienceLevel || 'beginner'}</span>
        </div>
        ${isActive ? '<span class="profile-card-badge">Active</span>' : ''}
      </div>
    `;
  }).join('');

  // Click to select profile
  list.querySelectorAll('.profile-card').forEach(card => {
    card.addEventListener('click', () => {
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

  // "Create New Profile" button
  document.getElementById('btn-new-profile').onclick = () => {
    state.currentProfile = null;
    localStorage.removeItem('swimcoach_profile_id');
    document.getElementById('profile-form').reset();
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
  document.getElementById('poolLength-pool').value = p.equipment?.poolLength || '';
  document.getElementById('programPeriod').value = 'single';

  // Pre-check equipment based on profile
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

  // Set workout type from profile training focus if available
  if (p.goals?.trainingFocus) {
    const typeSelect = document.getElementById('workoutType');
    // Only set if it matches one of the option values
    const matchingOption = Array.from(typeSelect.options).find(o => o.value === p.goals.trainingFocus);
    if (matchingOption) typeSelect.value = p.goals.trainingFocus;
  }
}

function initGenerateForm() {
  const form = document.getElementById('generate-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await generateWorkout(form);
  });

  // Quick generate button
  document.getElementById('btn-quick-generate').addEventListener('click', async () => {
    await generateWorkout(null);
  });
}

async function generateWorkout(form) {
  const btn = form
    ? form.querySelector('button[type="submit"]')
    : document.getElementById('btn-quick-generate');

  const originalText = btn?.textContent || '⚡ Quick Generate';
  btn && (btn.disabled = true);

  showLoading('Generating your workout… Open Notebook is thinking. This may take 30–60 seconds.');

  try {
    const body = collectGenerateFormData(form);
    body.swimmerId = state.currentProfile._id;
    const result = await api.workouts.generate(body);
    hideLoading();
    showToast('Workout generated! 🎉', 'success');
    navigateTo(`workout/${result.data._id}`);
  } catch (err) {
    hideLoading();
    showToast(`Generation failed: ${err.message}`, 'error');
  } finally {
    btn && (btn.disabled = false);
    btn && (btn.textContent = originalText);
  }
}

function collectGenerateFormData(form) {
  if (!form) return {}; // Quick generate — use all profile defaults

  const fd = new FormData(form);

  const data = {};

  // Only include non-empty values (profile defaults fill the gaps)
  const workoutType = fd.get('workoutType');
  if (workoutType) data.workoutType = workoutType;

  const duration = fd.get('duration');
  if (duration) data.duration = parseInt(duration, 10);

  const intensity = fd.get('intensity');
  if (intensity) data.intensity = intensity;

  const poolLength = fd.get('poolLength');
  if (poolLength) data.poolLength = parseInt(poolLength, 10);

  const programPeriod = fd.get('programPeriod');
  if (programPeriod) data.programPeriod = programPeriod;

  // Collect checked equipment
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

    // Init chat
    initChatHandler(workoutId);

    // Init feedback
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

function initChatHandler(workoutId) {
  const form = document.getElementById(`chat-form-${workoutId}`);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById(`chat-input-${workoutId}`);
    const text = input.value.trim();
    if (!text) return;

    addChatMessage(workoutId, text, 'user');
    input.value = '';

    showLoading('Coach is thinking…');

    try {
      const result = await api.workouts.regenerate(workoutId, {
        swimmerId: state.currentProfile._id,
        // Pass the chat message as a customization hint
        chatMessage: text,
      });

      hideLoading();

      // Load the new workout
      const newWorkout = result.data;
      const container = document.getElementById('workout-content');
      container.innerHTML = buildWorkoutCard(newWorkout);
      container.innerHTML += buildChatPanel(newWorkout._id);
      container.innerHTML += buildFeedbackForm(newWorkout._id, newWorkout.userFeedback);

      // Preserve chat history and add coach response
      addChatMessage(newWorkout._id, "Here's an updated workout based on your request:", 'coach');

      initChatHandler(newWorkout._id);
      initFeedbackHandler(newWorkout._id, newWorkout.userFeedback);

      // Update URL
      window.history.replaceState(null, '', `#workout/${newWorkout._id}`);

      showToast('Workout updated!', 'success');
    } catch (err) {
      hideLoading();
      addChatMessage(workoutId, `Sorry, I couldn't process that: ${err.message}`, 'coach');
    }
  });
}

// ─── Feedback Handler ───

function initFeedbackHandler(workoutId, existingFeedback) {
  // Star rating
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

  // Form submit
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

      // Show adaptive response
      showAdaptiveResponse(workoutId, feedback);

      // Hide the form after submission
      form.classList.add('hidden');
    } catch (err) {
      showToast(`Error saving feedback: ${err.message}`, 'error');
      btn.disabled = false;
      btn.textContent = 'Submit Feedback';
    }
  });
}
