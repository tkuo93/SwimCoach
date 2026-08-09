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

function createSelect(className, options, attributes = {}) {
  const select = document.createElement('select');
  select.className = className;
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  });
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'value') {
      select.value = value;
    } else {
      select.setAttribute(key, value);
    }
  });
  return select;
}

function createTd(textContent, className = '') {
  const td = document.createElement('td');
  td.textContent = textContent;
  if (className) td.className = className;
  return td;
}

function createTh(textContent) {
  const th = document.createElement('th');
  th.textContent = textContent;
  return th;
}

// ─── State ───

const state = {
  currentProfile: null,
  allProfiles: [],
  workouts: [],
  currentWorkout: null,
  editingWorkoutId: null,
  conversations: new Map(),
  activeChatWorkoutId: null,
  lastChatMessage: null,
  showLiveCoach: false,
  autoScrollChat: true,
  pendingActionProposal: null,
};

// ─── Router ───

function getHash() {
  return window.location.hash.slice(1) || 'today';
}

function navigateTo(page) {
  const allowed = ['today', 'week', 'history', 'profile', 'generate', 'workout', 'program', 'coach', 'settings', 'debug', 'empty'];
  if (allowed.includes(page)) {
    window.location.hash = page;
  } else {
    console.warn('navigateTo: invalid page', page);
    window.location.hash = 'today';
  }
}

async function handleRoute() {
  const page = getHash();
  const profileId = localStorage.getItem('swimcoach_profile_id');
  const profileData = localStorage.getItem('sc_profile');

  // If no profile selected and not on onboarding pages, redirect to profile
  const onboardingPages = ['profile', 'generate', 'workout', 'program', 'coach', 'settings', 'debug', 'empty'];
  if (!profileId && !onboardingPages.includes(page)) {
    navigateTo('profile');
    return;
  }

  // Load profile data if available
  if (profileId && profileData) {
    try {
      state.currentProfile = JSON.parse(profileData);
    } catch {
      state.currentProfile = null;
    }
  }

  // Update active nav
  setActiveNav(page);

  // Route to appropriate page handler
  switch (page) {
    case 'today':
      await showPage('today', state.currentProfile);
      break;
    case 'week':
      await showPage('week', state.currentProfile);
      break;
    case 'history':
      await showPage('history', state.currentProfile);
      break;
    case 'profile':
      showPage('profile', state.currentProfile);
      break;
    case 'generate':
      showPage('generate', state.currentProfile);
      break;
    case 'workout':
      await showPage('workout', state.currentProfile);
      break;
    case 'program':
      showPage('program', state.currentProfile);
      break;
    case 'coach':
      await showPage('coach', state.currentProfile);
      break;
    case 'settings':
      showPage('settings', state.currentProfile);
      break;
    case 'debug':
      showPage('debug', state.currentProfile);
      break;
    case 'empty':
      showPage('empty', state.currentProfile);
      break;
    default:
      navigateTo('today');
  }
}

// ─── Profile Management ───

async function loadAllProfiles() {
  try {
    const profiles = await api.profiles.list();
    state.allProfiles = profiles;
    const stored = localStorage.getItem('sc_all_profiles');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Merge with server data, preferring server for _id
          const serverIds = new Set(profiles.map(p => p._id));
          const localOnly = parsed.filter(p => !serverIds.has(p._id));
          state.allProfiles = [...profiles, ...localOnly];
        }
      } catch {
        // ignore parse errors
      }
    }
    localStorage.setItem('sc_all_profiles', JSON.stringify(state.allProfiles));
    return state.allProfiles;
  } catch (err) {
    console.error('Failed to load profiles:', err);
    const stored = localStorage.getItem('sc_all_profiles');
    if (stored) {
      try {
        state.allProfiles = JSON.parse(stored);
      } catch {
        state.allProfiles = [];
      }
    }
    return state.allProfiles;
  }
}

function updateProfileDropdown() {
  const select = document.getElementById('profile-select');
  if (!select) return;
  const currentId = localStorage.getItem('swimcoach_profile_id');
  select.innerHTML = '<option value="">Select a profile</option>';
  state.allProfiles.forEach(p => {
    const option = document.createElement('option');
    option.value = p._id;
    option.textContent = p.name || 'Unnamed';
    if (p._id === currentId) option.selected = true;
    select.appendChild(option);
  });
}

function updateProfileList() {
  const container = document.getElementById('profile-list');
  if (!container) return;
  const currentId = localStorage.getItem('swimcoach_profile_id');
  container.innerHTML = '';
  if (state.allProfiles.length === 0) {
    container.innerHTML = '<p class="no-profiles">No profiles yet. Create one to get started.</p>';
    return;
  }
  state.allProfiles.forEach(p => {
    const card = document.createElement('div');
    card.className = 'profile-card' + (p._id === currentId ? ' active' : '');
    card.dataset.id = p._id;
    card.innerHTML = `
      <div class="profile-card-header">
        <strong>${escapeHtml(p.name || 'Unnamed')}</strong>
        ${p._id === currentId ? '<span class="badge">Active</span>' : ''}
      </div>
      <div class="profile-card-details">
        ${p.age ? `Age: ${p.age} • ` : ''}${p.level || 'Level not set'} • ${p.goal || 'Goal not set'}
      </div>
    `;
    card.addEventListener('click', () => setCurrentProfile(p._id));
    container.appendChild(card);
  });
}

async function setCurrentProfile(profileId) {
  const profile = state.allProfiles.find(p => p._id === profileId);
  if (!profile) return;
  state.currentProfile = profile;
  localStorage.setItem('swimcoach_profile_id', profileId);
  localStorage.setItem('sc_profile', JSON.stringify(profile));
  updateProfileDropdown();
  updateProfileList();
  navigateTo('today');
}

// Expose for inline script in index.html
window.loadAllProfiles = loadAllProfiles;
window.updateProfileDropdown = updateProfileDropdown;
window.updateProfileList = updateProfileList;
window.setCurrentProfile = setCurrentProfile;
window.navigateTo = navigateTo;
window.state = state;

// ─── Workout Handling ───

async function loadWorkouts() {
  if (!state.currentProfile) return [];
  try {
    const workouts = await api.workouts.list(state.currentProfile._id);
    state.workouts = workouts;
    return workouts;
  } catch (err) {
    console.error('Failed to load workouts:', err);
    showToast('Failed to load workouts', 'error');
    return [];
  }
}

async function saveWorkout(workoutData) {
  if (!state.currentProfile) return;
  showLoading('Saving workout…');
  try {
    const workout = await api.workouts.create(state.currentProfile._id, workoutData);
    hideLoading();
    showToast('Workout saved!', 'success');
    if (window.posthog && typeof window.posthog.capture === 'function') {
      window.posthog.capture('workout_saved', { workout_id: workout._id });
    }
    navigateTo('history');
    return workout;
  } catch (err) {
    hideLoading();
    showToast(`Error saving workout: ${err.message}`, 'error');
    return null;
  }
}

async function updateWorkout(workoutId, workoutData) {
  if (!state.currentProfile) return;
  showLoading('Updating workout…');
  try {
    const workout = await api.workouts.update(state.currentProfile._id, workoutId, workoutData);
    hideLoading();
    showToast('Workout updated!', 'success');
    if (window.posthog && typeof window.posthog.capture === 'function') {
      window.posthog.capture('workout_updated', { workout_id: workoutId });
    }
    navigateTo('history');
    return workout;
  } catch (err) {
    hideLoading();
    showToast(`Error updating workout: ${err.message}`, 'error');
    return null;
  }
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
      const [year, month, day] = dateVal.split("-").map(Number);
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
    const sendOff = row.querySelector(".edit-sendoff")?.value.trim() || "";
    const targetPace = row.querySelector(".edit-targetpace")?.value.trim() || "";
    const rest = row.querySelector(".edit-rest")?.value.trim() || "";
    poolMainSet.push({
      repetitions: parseInt(row.querySelector(".edit-reps").value, 10) || 1,
      distance: parseInt(row.querySelector(".edit-distance").value, 10) || 0,
      stroke: row.querySelector(".edit-stroke").value.trim() || "freestyle",
      interval: sendOff,
      intervalDetail: (sendOff || targetPace || rest) ? {
        sendOff: sendOff,
        targetPace: targetPace,
        rest: rest,
        type: "fixed",
        progression: ""
      } : null,
      focus: row.querySelector(".edit-focus").value.trim(),
      description: row.querySelector(".edit-set-notes").value.trim(),
    });
  });

  const poolTotalDistance = poolMainSet.reduce(function(sum, s) { return sum + (s.distance * s.repetitions); }, 0)
    + poolWarmUpDistance + poolCoolDownDistance;

  const gymWarmUpDuration = parseInt(document.getElementById(`edit-gym-wu-dur-${workoutId}`).value, 10) || 0;
  const gymWarmUpDesc = document.getElementById(`edit-gym-wu-desc-${workoutId}`).value.trim();
  const gymCoolDownDuration = parseInt(document.getElementById(`edit-gym-cd-dur-${workoutId}`).value, 10) || 0;
  const gymCoolDownDesc = document.getElementById(`edit-gym-cd-desc-${workoutId}`).value.trim();

  const gymMainSet = [];
  document.querySelectorAll(`#edit-gym-sets-${workoutId} .edit-set-row`).forEach(function(row) {
    const weightUnitVal = row.querySelector(".edit-weight-unit")?.value || null;
    gymMainSet.push({
      exercise: row.querySelector(".edit-exercise").value.trim(),
      sets: parseInt(row.querySelector(".edit-sets").value, 10) || 1,
      repetitions: parseInt(row.querySelector(".edit-reps").value, 10) || 1,
      weight: parseInt(row.querySelector(".edit-weight").value, 10) || 0,
      weightUnit: weightUnitVal,
      restTime: parseInt(row.querySelector(".edit-rest").value, 10) || 0,
      muscleGroup: row.querySelector(".edit-muscle").value.trim() || "full-body",
    });
  });

  const poolNotesEl = document.getElementById(`edit-pool-notes-${workoutId}`);
  const gymNotesEl = document.getElementById(`edit-gym-notes-${workoutId}`);
  const legacyNotesEl = document.getElementById(`edit-notes-${workoutId}`);
  const poolTrainingNotes = poolNotesEl ? poolNotesEl.value.trim().split("\n").map(function(n) { return n.trim(); }).filter(Boolean) : [];
  const gymTrainingNotes = gymNotesEl ? gymNotesEl.value.trim().split("\n").map(function(n) { return n.trim(); }).filter(Boolean) : [];
  const legacyTrainingNotes = legacyNotesEl && !poolNotesEl && !gymNotesEl
    ? legacyNotesEl.value.trim().split("\n").map(function(n) { return n.trim(); }).filter(Boolean) : [];
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
    if (window.posthog && typeof window.posthog.capture === 'function') {
      window.posthog.capture('workout_deleted', { workout_id: workoutId });
    }
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
  if (!swimmerId || !workoutId) return null;

  const cacheKey = `${swimmerId}:${workoutId}`;
  if (state.conversations.has(cacheKey)) {
    return state.conversations.get(cacheKey);
  }

  try {
    const conversation = await api.conversations.getByWorkout(workoutId);
    if (conversation) {
      state.conversations.set(cacheKey, conversation);
      return conversation;
    }
  } catch (err) {
    console.warn('Could not load conversation:', err);
  }
  return null;
}

async function createWorkoutConversation(workoutId, initialMessage = null) {
  const swimmerId = state.currentProfile?._id;
  if (!swimmerId || !workoutId) return null;

  try {
    const conversation = await api.conversations.create(swimmerId, workoutId, initialMessage);
    const cacheKey = `${swimmerId}:${workoutId}`;
    state.conversations.set(cacheKey, conversation);
    return conversation;
  } catch (err) {
    console.error('Failed to create conversation:', err);
    return null;
  }
}

async function sendChatMessage(workoutId, content, role = 'user') {
  const swimmerId = state.currentProfile?._id;
  if (!swimmerId || !workoutId || !content?.trim()) return null;

  const cacheKey = `${swimmerId}:${workoutId}`;
  let conversation = state.conversations.get(cacheKey);

  if (!conversation) {
    conversation = await createWorkoutConversation(workoutId);
    if (!conversation) return null;
  }

  try {
    const message = await api.conversations.addMessage(conversation._id, role, content.trim());
    conversation.messages.push(message);
    state.conversations.set(cacheKey, conversation);
    return message;
  } catch (err) {
    console.error('Failed to send message:', err);
    showToast('Failed to send message', 'error');
    return null;
  }
}

async function loadCoachConversations() {
  // Placeholder for coach page - loads all conversations for current profile
  if (!state.currentProfile) return [];
  try {
    return await api.conversations.listBySwimmer(state.currentProfile._id);
  } catch (err) {
    console.warn('Could not load coach conversations:', err);
    return [];
  }
}

// ─── Coach Page: Action Proposal & Feedback ───

function showActionProposal(proposal) {
  state.pendingActionProposal = proposal;
  buildActionProposal(proposal);
}

async function submitFeedback(proposalId, feedback) {
  if (!state.pendingActionProposal || state.pendingActionProposal._id !== proposalId) {
    showToast('Invalid proposal', 'error');
    return;
  }
  showLoading('Submitting feedback…');
  try {
    await api.conversations.submitFeedback(proposalId, feedback);
    hideLoading();
    showToast('Feedback submitted', 'success');
    state.pendingActionProposal = null;
    // Refresh coach page
    await showPage('coach', state.currentProfile);
  } catch (err) {
    hideLoading();
    showToast(`Error submitting feedback: ${err.message}`, 'error');
  }
}

// ─── Workout Edit Modal ───

function initEditHandler() {
  document.addEventListener('click', async function(e) {
    const editBtn = e.target.closest('.btn-edit-workout');
    if (!editBtn) return;

    const workoutId = editBtn.dataset.id;
    if (!workoutId) return;

    try {
      const workout = await api.workouts.get(workoutId);
      if (!workout) {
        showToast('Workout not found', 'error');
        return;
      }
      state.editingWorkoutId = workoutId;
      buildWorkoutEditForm(workout);
      const modal = document.getElementById('edit-workout-modal');
      if (modal) modal.style.display = 'flex';
    } catch (err) {
      showToast(`Error loading workout: ${err.message}`, 'error');
    }
  });

  // Close modal on backdrop click
  document.addEventListener('click', function(e) {
    if (e.target.id === 'edit-workout-modal') {
      const modal = document.getElementById('edit-workout-modal');
      if (modal) modal.style.display = 'none';
      state.editingWorkoutId = null;
    }
  });

  // Save edited workout
  document.addEventListener('click', async function(e) {
    if (!e.target.matches('#edit-workout-save')) return;

    const workoutId = state.editingWorkoutId;
    if (!workoutId) return;

    // Find original workout
    const originalWorkout = state.workouts.find(w => w._id === workoutId);
    const workoutData = collectEditFormData(workoutId, originalWorkout);

    if (!workoutData.workoutName) {
      showToast('Please enter a workout name', 'error');
      return;
    }

    await updateWorkout(workoutId, workoutData);
    const modal = document.getElementById('edit-workout-modal');
    if (modal) modal.style.display = 'none';
    state.editingWorkoutId = null;
  });

  // Delete workout from edit modal
  document.addEventListener('click', async function(e) {
    if (!e.target.matches('#edit-workout-delete')) return;

    const workoutId = state.editingWorkoutId;
    if (!workoutId) return;

    if (confirm('Are you sure you want to delete this workout?')) {
      await deleteWorkout(workoutId);
      const modal = document.getElementById('edit-workout-modal');
      if (modal) modal.style.display = 'none';
      state.editingWorkoutId = null;
    }
  });
}

// ─── Auth / Sign Out ───

function signOut() {
  localStorage.removeItem('swimcoach_profile_id');
  localStorage.removeItem('sc_profile');
  localStorage.removeItem('sc_all_profiles');
  state.currentProfile = null;
  state.allProfiles = [];
  state.workouts = [];
  window.location.href = '/api/auth/logout';
}

// ─── Init ───

window.addEventListener('hashchange', handleRoute);
window.addEventListener('load', async () => {
  await loadAllProfiles();
  updateProfileDropdown();
  updateProfileList();
  initEditHandler();
  await handleRoute();
});