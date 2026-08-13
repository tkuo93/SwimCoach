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
  initLoginButton();

  // Check if user is already authenticated
  await checkAuthStatus();

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

function showPage(pageName) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.add('hidden');
  });

  const targetPage = document.getElementById(`${pageName}-page`);
  if (targetPage) {
    targetPage.classList.remove('hidden');
  }
}

async function checkAuthStatus() {
  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'include' // Include cookies for session-based auth
    });

    if (response.ok) {
      const data = await response.json();
      if (data.authenticated) {
        // User is authenticated, redirect to profile
        navigateTo('profile');
        showToast('Welcome back! Redirecting to your profile.', 'success');
        return;
      }
    }
    // Not authenticated - stay on login page
    return;
  } catch (error) {
    console.error('Auth check failed:', error);
    // If auth check fails, assume not authenticated
    return;
  }
}

function initLoginButton() {
  const googleLoginBtn = document.getElementById('google-login-btn');
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      showLoading('Redirecting to Google...');

      try {
        // Redirect to Google OAuth flow
        window.location.href = '/api/auth/google';
      } catch (err) {
        hideLoading();
        showToast('Failed to initiate Google login', 'error');
      }
    });
  }
}

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