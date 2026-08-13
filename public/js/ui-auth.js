/**
 * SwimCoach UI Authentication Module
 * Handle Google OAuth state and user profile display
 */

const API_BASE = '/api';

// Initialize authentication state
let authState = {
  isAuthenticated: false,
  user: null,
  profile: null,
  loading: true
};

// Authentication API calls
const authApi = {
  // Check if user is currently authenticated
  async checkAuth() {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        authState.isAuthenticated = true;
        authState.user = data.user;
        authState.profile = data.profile;
        authState.loading = false;

        console.log('Authentication check passed:', data);
        return data;
      } else {
        // Check for specific error messages that indicate redirect
        const errorText = await response.text();

        // If we get a 401 or the error suggests not authenticated, continue as not logged in
        if (response.status === 401 || errorText.includes('redirect') || errorText.includes('login')) {
          throw new Error('User not authenticated');
        }

        // For other errors, throw with the status
        throw new Error(`Authentication check failed: ${response.status} ${errorText}`);
      }
    } catch (error) {
      console.log('Authentication check failed (expected for unauthenticated users):', error.message);
      authState.isAuthenticated = false;
      authState.user = null;
      authState.profile = null;
      authState.loading = false;

      // Return consistent structure for both success and failure
      return {
        authenticated: false,
        error: error.message || 'Authentication failed'
      };
    }
  },

  // Redirect to Google OAuth login
  login() {
    // Redirect to the login endpoint which will handle Google OAuth
    window.location.href = `${API_BASE}/auth/google`;  }

  // Logout the current user
  async logout() {
    try {
      const response = await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      // Always clear local state on logout
      authState.isAuthenticated = false;
      authState.user = null;
      authState.profile = null;

      // If successful, redirect to login page
      if (response.ok) {
        window.location.href = `${API_BASE}/auth/login`;
      } else {
        console.error('Logout failed:', await response.text());
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
};

// UI state management functions
const uiAuth = {
  // Update the login button based on authentication state
  updateLoginButton() {
    const loginButton = document.getElementById('login-button');
    if (!loginButton) return;

    if (authState.isAuthenticated && authState.user) {
      // User is logged in - show profile info and logout option
      const displayName = authState.user.displayName || authState.user.email || 'User';
      const profileImage = authState.user.photoURL || '';

      loginButton.innerHTML = `
        <div class="user-profile-dropdown">
          <button class="user-profile-btn" id="user-profile-btn">
            <img src="${profileImage}" alt="Profile" class="user-profile-image" onerror="this.style.display='none'" />
            <span class="user-profile-name">${displayName}</span>
            <i class="arrow-down">▼</i>
          </button>
          <div class="user-dropdown-menu hidden" id="user-dropdown-menu">
            <div class="user-dropdown-header">
              <strong>${displayName}</strong><br>
              <small>${authState.user.email}</small>
            </div>
            <hr>
            <button class="dropdown-item" id="logout-btn">
              <i>🚪</i> Sign Out
            </button>
          </div>
        </div>
      `;

      // Add event listeners for the new UI elements
      const userProfileBtn = document.getElementById('user-profile-btn');
      const logoutBtn = document.getElementById('logout-btn');

      if (userProfileBtn) {
        userProfileBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const menu = document.getElementById('user-dropdown-menu');
          menu.classList.toggle('hidden');
        });
      }

      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
          authApi.logout();
        });
      }

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        const dropdown = document.querySelector('.user-profile-dropdown');
        if (dropdown && !dropdown.contains(e.target)) {
          document.getElementById('user-dropdown-menu')?.classList.add('hidden');
        }
      });

    } else {
      // User is not logged in - show login button
      loginButton.innerHTML = `
        <button class="login-btn" id="login-btn">
          <i>🔐</i> Continue with Google
        </button>
      `;

      const loginBtn = document.getElementById('login-btn');
      if (loginBtn) {
        loginBtn.addEventListener('click', () => {
          authApi.login();
        });
      }
    }
  },

  // Show loading state on login button
  showLoading() {
    const loginButton = document.getElementById('login-button');
    if (loginButton) {
      loginButton.innerHTML = `
        <button class="loading-btn" disabled>
          <span class="spinner"></span>
          Signing in...
        </button>
      `;
    }
  },

  // Show error state on login button
  showError(message) {
    const loginButton = document.getElementById('login-button');
    if (loginButton) {
      loginButton.innerHTML = `
        <button class="error-btn" onclick="authApi.login()">
          <i>⚠️</i> Login failed. Try again
        </button>
      `;
    }
  }
};

// Initialize the authentication system
async function initAuth() {
  // First check if there's a return URL parameter that indicates a redirect happened
  const urlParams = new URLSearchParams(window.location.search);
  const returnUrl = urlParams.get('returnUrl');

  if (returnUrl) {
    // Clean up the URL to prevent loops
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Wait for auth check to complete
  const authResult = await authApi.checkAuth();

  if (authResult.authenticated) {
    // User is authenticated - update UI
    uiAuth.updateLoginButton();

    // If we have a saved profile ID, load the profile
    const savedProfileId = localStorage.getItem('swimcoach_profile_id');
    if (savedProfileId) {
      loadUserProfile(savedProfileId);
    }

    // Hide loading indicator if present
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.classList.add('hidden');
    }
  } else {
    // User is not authenticated - show login button
    uiAuth.updateLoginButton();

    // Hide loading indicator if present
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.classList.add('hidden');
    }
  }
}

// Load user's profile data
async function loadUserProfile(profileId) {
  try {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof fetch === 'undefined') {
      console.error('Cannot load profile - not in browser environment');
      return;
    }

    const response = await fetch(`/api/profiles/${profileId}`);

    if (response.ok) {
      const profile = await response.json();
      authState.profile = profile;

      console.log('Loaded user profile:', profile);

      // Dispatch event for other components to listen to
      window.dispatchEvent(new CustomEvent('auth:profile-loaded', {
        detail: { profile }
      }));
    }
  } catch (error) {
    console.error('Failed to load profile:', error);
  }
}

// Export the auth module for use in other files
export { authApi, uiAuth, initAuth, authState };