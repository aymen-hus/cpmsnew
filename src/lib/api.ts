import axios from 'axios';
import Cookies from 'js-cookie';
import type { Plan } from '../types/plan';
import type { Organization, StrategicObjective, Program, StrategicInitiative, PerformanceMeasure } from '../types/organization';
import type { AuthState } from '../types/user';

// Create a base API instance
export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, */*',
  },
  withCredentials: true,
});

// Add request interceptor to update CSRF token before each request
api.interceptors.request.use(config => {
  const token = Cookies.get('csrftoken');
  if (token) {
    config.headers['X-CSRFToken'] = token;
  }
  return config;
}, error => {
  console.error('Request interceptor error:', error);
  return Promise.reject(error);
});

// Add response interceptor to handle authentication errors
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // Clear cookies and redirect to login
      Cookies.remove('sessionid', { path: '/' });
      Cookies.remove('csrftoken', { path: '/' });
      
      // Redirect after short delay to ensure cookies are cleared
      setTimeout(() => {
        window.location.href = '/login';
      }, 100);
    }
    return Promise.reject(error);
  }
);

// Enhanced CSRF token handling
const ensureCsrfToken = async () => {
  try {
    let token = Cookies.get('csrftoken');
    if (token) return token;
    
    // Try multiple endpoints to get CSRF token
    await Promise.allSettled([
      axios.get('/api/auth/csrf/', { withCredentials: true }),
      axios.get('/api/auth/check/', { withCredentials: true })
    ]);
    
    token = Cookies.get('csrftoken');
    if (!token) throw new Error('CSRF token not found after refresh');
    
    return token;
  } catch (error) {
    console.error('Failed to ensure CSRF token:', error);
    throw error;
  }
};

// Dedicated function to get a CSRF token
export const csrf = async () => {
  return ensureCsrfToken();
};

// Authentication service with enhanced session handling
export const auth = {
  login: async (username: string, password: string) => {
    try {
      await ensureCsrfToken();
      const response = await api.post('/auth/login/', { username, password });
      return { success: true, data: response.data };
    } catch (error: any) {
      console.error('Login error:', error.response?.data || error);
      return { success: false, error: error.response?.data?.detail || 'Login failed' };
    }
  },
  
  logout: async () => {
    try {
      try {
        await ensureCsrfToken();
      } catch (err) {
        console.warn("Failed to refresh CSRF token before logout:", err);
      }
      
      const csrfToken = Cookies.get('csrftoken');
      
      try {
        await axios.post('/api/auth/logout/', {}, {
          headers: {
            'X-CSRFToken': csrfToken || '',
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Accept': 'application/json'
          },
          withCredentials: true
        });
      } catch (err) {
        console.warn("Logout request failed but proceeding anyway:", err);
      }
      
      // Always remove cookies regardless of response
      Cookies.remove('sessionid', { path: '/' });
      Cookies.remove('csrftoken', { path: '/' });
      
      // Force reload to the login page after a brief timeout
      setTimeout(() => {
        window.location.href = '/login';
      }, 100);
      
      return { success: true };
    } catch (error: any) {
      console.error('Logout error:', error);
      Cookies.remove('sessionid', { path: '/' });
      Cookies.remove('csrftoken', { path: '/' });
      setTimeout(() => {
        window.location.href = '/login';
      }, 100);
      return { success: false, error: error.message };
    }
  },
  
  updateProfile: async (data: { first_name?: string; last_name?: string; email?: string }) => {
    try {
      await ensureCsrfToken();
      const response = await api.patch('/auth/profile/', data);
      return { success: true, data: response.data };
    } catch (error: any) {
      console.error('Profile update error:', error);
      return { success: false, error: error.response?.data?.detail || 'Failed to update profile' };
    }
  },
  
  changePassword: async (data: { current_password: string; new_password: string }) => {
    try {
      await ensureCsrfToken();
      const response = await api.post('/auth/password_change/', data);
      return { success: true, data: response.data };
    } catch (error: any) {
      console.error('Password change error:', error);
      return { success: false, error: error.response?.data?.detail || 'Failed to change password' };
    }
  },
  
  checkAuth: async () => {
    try {
      const response = await api.get('/auth/check/');
      return response.data;
    } catch (error) {
      console.error('Auth check error:', error);
      return { isAuthenticated: false };
    }
  },
  
  getCurrentUser: async (retry = true): Promise<AuthState> => {
    try {
      const response = await api.get('/auth/check/');
      return {
        isAuthenticated: response.data.isAuthenticated,
        user: response.data.user,
        userOrganizations: response.data.userOrganizations || []
      };
    } catch (error: any) {
      console.error('Get current user error:', error);
      
      // Retry once if we get a 401 error
      if (error.response?.status === 401 && retry) {
        try {
          await ensureCsrfToken();
          return auth.getCurrentUser(false);
        } catch (refreshError) {
          console.error('CSRF refresh failed:', refreshError);
        }
      }
      
      return { isAuthenticated: false, user: null, userOrganizations: [] };
    }
  },
  
  isAuthenticated: () => {
    return !!Cookies.get('sessionid');
  },
  
  csrf: async () => {
    return csrf();
  }
};

// Session keep-alive function
const SESSION_REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes
let sessionRefreshTimer: NodeJS.Timeout | null = null;

export const startSessionRefresh = () => {
  if (sessionRefreshTimer) clearInterval(sessionRefreshTimer);
  
  sessionRefreshTimer = setInterval(async () => {
    try {
      await auth.getCurrentUser();
    } catch (error) {
      console.log('Session refresh failed', error);
    }
  }, SESSION_REFRESH_INTERVAL);
};

export const stopSessionRefresh = () => {
  if (sessionRefreshTimer) {
    clearInterval(sessionRefreshTimer);
    sessionRefreshTimer = null;
  }
};

// Initiative Feed API
export const initiativeFeeds = {
  getAll: async () => {
    try {
      const response = await api.get('/initiative-feeds/');
      return response;
    } catch (error) {
      console.error('Failed to fetch initiative feeds:', error);
      throw error;
    }
  },
  
  getByObjective: async (objectiveId: string) => {
    try {
      const response = await api.get(`/initiative-feeds/?strategic_objective=${objectiveId}`);
      return response;
    } catch (error) {
      console.error(`Failed to fetch initiative feeds for objective ${objectiveId}:`, error);
      throw error;
    }
  },
  
  getById: async (id: string) => {
    try {
      const response = await api.get(`/initiative-feeds/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch initiative feed ${id}:`, error);
      throw error;
    }
  },
  
  create: async (data: any) => {
    try {
      const response = await api.post('/initiative-feeds/', data);
      return response.data;
    } catch (error) {
      console.error('Failed to create initiative feed:', error);
      throw error;
    }
  },
  
  update: async (id: string, data: any) => {
    try {
      const response = await api.patch(`/initiative-feeds/${id}/`, data);
      return response.data;
    } catch (error) {
      console.error(`Failed to update initiative feed ${id}:`, error);
      throw error;
    }
  },
  
  delete: async (id: string) => {
    try {
      await api.delete(`/initiative-feeds/${id}/`);
      return { success: true };
    } catch (error) {
      console.error(`Failed to delete initiative feed ${id}:`, error);
      throw error;
    }
  }
};

// Locations API
export const locations = {
  getAll: async () => {
    try {
      const timestamp = new Date().getTime();
      const response = await api.get(`/locations/?_=${timestamp}`);
      return response;
    } catch (error) {
      console.error('Failed to fetch locations:', error);
      return { data: [] };
    }
  },

  getById: async (id: string) => {
    try {
      const response = await api.get(`/locations/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch location ${id}:`, error);
      throw error;
    }
  }
};

// Land Transports API
export const landTransports = {
  getAll: async () => {
    try {
      const timestamp = new Date().getTime();
      const response = await api.get('/land-transports/', {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
      return response;
    } catch (error) {
      console.error('Failed to fetch land transports:', error);
      return { data: [] };
    }
  },
  
  getById: async (id: string) => {
    try {
      const response = await api.get(`/land-transports/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch land transport ${id}:`, error);
      throw error;
    }
  }
};

// Air Transports API
export const airTransports = {
  getAll: async () => {
    try {
      const timestamp = new Date().getTime();
      const response = await api.get('/air-transports/', {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
      return response;
    } catch (error) {
      console.error('Failed to fetch air transports:', error);
      return { data: [] };
    }
  },
  
  getById: async (id: string) => {
    try {
      const response = await api.get(`/air-transports/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch air transport ${id}:`, error);
      throw error;
    }
  }
};

// Per Diems API
export const perDiems = {
  getAll: async () => {
    try {
      const timestamp = new Date().getTime();
      const response = await api.get(`/per-diems/?_=${timestamp}`);
      return response;
    } catch (error) {
      console.error('Failed to fetch per diems:', error);
      throw error;
    }
  },
  
  getById: async (id: string) => {
    try {
      const response = await api.get(`/per-diems/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch per diem ${id}:`, error);
      throw error;
    }
  }
};

// Accommodations API
export const accommodations = {
  getAll: async () => {
    try {
      const timestamp = new Date().getTime();
      const response = await api.get(`/accommodations/?_=${timestamp}`);
      return response;
    } catch (error) {
      console.error('Failed to fetch accommodations:', error);
      return { data: [] };
    }
  },
  
  getById: async (id: string) => {
    try {
      const response = await api.get(`/accommodations/${id}/`);
      return response;
    } catch (error) {
      console.error(`Failed to fetch accommodation ${id}:`, error);
      throw error;
    }
  }
};

// Participant Costs API
export const participantCosts = {
  getAll: async () => {
    try {
      const timestamp = new Date().getTime();
      const response = await api.get(`/participant-costs/?_=${timestamp}`);
      return response;
    } catch (error) {
      console.error('Failed to fetch participant costs:', error);
      return { data: [] };
    }
  },
  
  getById: async (id: string) => {
    try {
      const response = await api.get(`/participant-costs/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch participant cost ${id}:`, error);
      throw error;
    }
  }
};

// Session Costs API
export const sessionCosts = {
  getAll: async () => {
    try {
      const timestamp = new Date().getTime();
      const response = await api.get(`/session-costs/?_=${timestamp}`);
      return response;
    } catch (error) {
      console.error('Failed to fetch session costs:', error);
      return { data: [] };
    }
  },
  
  getById: async (id: string) => {
    try {
      const response = await api.get(`/session-costs/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch session cost ${id}:`, error);
      throw error;
    }
  }
};

// Printing Costs API
export const printingCosts = {
  getAll: async () => {
    try {
      const timestamp = new Date().getTime();
      const response = await api.get(`/printing-costs/?_=${timestamp}`);
      return response;
    } catch (error) {
      console.error('Failed to fetch printing costs:', error);
      return { data: [] };
    }
  },
  
  getById: async (id: string) => {
    try {
      const response = await api.get(`/printing-costs/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch printing cost ${id}:`, error);
      throw error;
    }
  }
};

// Supervisor Costs API
export const supervisorCosts = {
  getAll: async () => {
    try {
      const timestamp = new Date().getTime();
      const response = await api.get(`/supervisor-costs/?_=${timestamp}`);
      return response;
    } catch (error) {
      console.error('Failed to fetch supervisor costs:', error);
      return { data: [] };
    }
  },
  
  getById: async (id: string) => {
    try {
      const response = await api.get(`/supervisor-costs/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch supervisor cost ${id}:`, error);
      throw error;
    }
  }
};

// Procurement Items API
export const procurementItems = {
  getAll: async () => {
    try {
      const timestamp = new Date().getTime();
      const response = await api.get(`/procurement-items/?_=${timestamp}`);
      return response;
    } catch (error) {
      console.error('Failed to fetch procurement items:', error);
      return { data: [] };
    }
  },
  
  getById: async (id: string) => {
    try {
      const response = await api.get(`/procurement-items/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch procurement item ${id}:`, error);
      throw error;
    }
  },
  
  getByCategory: async (category: string) => {
    try {
      const response = await api.get(`/procurement-items/?category=${category}`);
      return response;
    } catch (error) {
      console.error(`Failed to fetch procurement items for category ${category}:`, error);
      return { data: [] };
    }
  }
};

// Organizations service
export const organizations = {
  async getAll() {
    try {
      const timestamp = new Date().getTime();
      const response = await api.get(`/organizations/?_=${timestamp}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get organizations:', error);
      throw error;
    }
  },
  
  async getById(id: string) {
    try {
      const response = await api.get(`/organizations/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to get organization ${id}:`, error);
      throw error;
    }
  },
  
  async update(id: string, data: any) {
    try {
      const response = await api.patch(`/organizations/${id}/`, data);
      return response.data;
    } catch (error) {
      console.error(`Failed to update organization ${id}:`, error);
      throw error;
    }
  },
  
  async create(data: any) {
    try {
      const response = await api.post('/organizations/', data);
      return response.data;
    } catch (error) {
      console.error('Failed to create organization:', error);
      throw error;
    }
  },
  
  async delete(id: string) {
    try {
      const response = await api.delete(`/organizations/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to delete organization ${id}:`, error);
      throw error;
    }
  },
  
  async getImplementingOrganizations() {
    try {
      const allOrganizations = await this.getAll();
      
      if (!Array.isArray(allOrganizations)) {
        return [];
      }
      
      return allOrganizations.filter((org: Organization) => {
        return ['EXECUTIVE', 'TEAM_LEAD', 'DESK'].includes(org.type);
      });
    } catch (error) {
      console.error('Failed to get implementing organizations:', error);
      return [];
    }
  }
};

// Strategic objectives service
export const objectives = {
  async getAll() {
    try {
      const response = await api.get('/strategic-objectives/');
      return { data: response.data };
    } catch (error) {
      console.error('Failed to get objectives:', error);
      throw error;
    }
  },
  
  async getById(id: string) {
    try {
      const response = await api.get(`/strategic-objectives/${id}/`);
      return { data: response.data };
    } catch (error) {
      console.error(`Failed to get objective ${id}:`, error);
      throw error;
    }
  },
  
  async create(data: any) {
    try {
      const response = await api.post('/strategic-objectives/', data);
      return { data: response.data };
    } catch (error) {
      console.error('Failed to create objective:', error);
      throw error;
    }
  },
  
  async update(id: string, data: any) {
    try {
      await ensureCsrfToken();
      const response = await api.patch(`/strategic-objectives/${id}/`, data);
      return { data: response.data };
    } catch (error) {
      console.error(`Failed to update objective ${id}:`, error);
      throw error;
    }
  },
  
  async delete(id: string) {
    try {
      const response = await api.delete(`/strategic-objectives/${id}/`);
      return { data: response.data };
    } catch (error) {
      console.error(`Failed to delete objective ${id}:`, error);
      throw error;
    }
  },
  
  async getWeightSummary() {
    try {
      const response = await api.get('/strategic-objectives/weight_summary/');
      return { data: response.data };
    } catch (error) {
      console.error('Failed to get objectives weight summary:', error);
      throw error;
    }
  }
};

// Programs service
export const programs = {
  async getAll() {
    try {
      const response = await api.get('/programs/');
      return response;
    } catch (error) {
      console.error('Failed to get programs:', error);
      throw error;
    }
  },
  
  async getByObjective(objectiveId: string) {
    try {
      const response = await api.get(`/programs/?strategic_objective=${objectiveId}`);
      return response;
    } catch (error) {
      console.error(`Failed to get programs for objective ${objectiveId}:`, error);
      throw error;
    }
  },
  
  async getById(id: string) {
    try {
      const response = await api.get(`/programs/${id}/`);
      return response;
    } catch (error) {
      console.error(`Failed to get program ${id}:`, error);
      throw error;
    }
  },

  async create(data: any) {
    try {
      const response = await api.post('/programs/', data);
      return response;
    } catch (error) {
      console.error('Failed to create program:', error);
      throw error;
    }
  },
  
  async update(id: string, data: any) {
    try {
      const response = await api.patch(`/programs/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Failed to update program ${id}:`, error);
      throw error;
    }
  },
  
  async delete(id: string) {
    try {
      const response = await api.delete(`/programs/${id}/`);
      return response;
    } catch (error) {
      console.error(`Failed to delete program ${id}:`, error);
      throw error;
    }
  }
};

// Strategic Initiatives API
export const initiatives = {
  getAll: async () => {
    try {
      // Production-friendly approach with longer timeout and retry
      const timestamp = new Date().getTime();
      let response;
      
      try {
        // Try standard API call first with extended timeout
        response = await api.get(`/strategic-initiatives/?_=${timestamp}`, {
          timeout: 15000, // 15 second timeout for production
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        });
      } catch (firstError) {
        console.warn('First attempt failed, trying alternative format:', firstError);
        // Try alternative format
        response = await api.get('/strategic-initiatives/', {
          params: { _: timestamp },
          timeout: 10000,
          headers: { 'Cache-Control': 'no-cache' }
        });
      }
      
      return response;
    } catch (error) {
      console.error('Failed to fetch initiatives:', error);
      
      // Always return empty array in case of error to prevent crashes
      console.warn('Returning empty initiatives due to error');
      return { data: [] };
    }
  },
  
  getById: async (id: string) => {
    try {
      const timestamp = new Date().getTime();
      let response;
      
      try {
        response = await api.get(`/strategic-initiatives/${id}/?_=${timestamp}`, {
          timeout: 10000
        });
      } catch (firstError) {
        console.warn(`First attempt failed for initiative ${id}, trying alternative:`, firstError);
        response = await api.get(`/strategic-initiatives/${id}/`, {
          params: { _: timestamp },
          timeout: 8000
        });
      }
      
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch initiative ${id}:`, error);
      console.warn(`Returning null for initiative ${id} due to error`);
      return null;
    }
  },
  
  getByObjective: async (objectiveId: string) => {
    try {
      const timestamp = new Date().getTime();
      
      console.log(`Fetching initiatives for objective ${objectiveId} in production mode`);
      
      let response;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          if (retryCount === 0) {
            // First attempt: standard format with extended timeout
            response = await api.get(`/strategic-initiatives/?objective=${objectiveId}&_=${timestamp}`, {
              timeout: 12000,
              headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
            });
          } else if (retryCount === 1) {
            // Second attempt: alternative parameter format
            response = await api.get('/strategic-initiatives/', {
              params: { 
                objective: objectiveId,
                _: timestamp + retryCount
              },
              timeout: 8000,
              headers: { 'Cache-Control': 'no-cache' }
            });
          } else {
            // Third attempt: simplified call
            response = await api.get(`/strategic-initiatives/`, {
              timeout: 5000,
              params: { objective: objectiveId }
            });
          }
          
          // If we get here, the call succeeded
          console.log(`Successfully fetched initiatives for objective ${objectiveId} on attempt ${retryCount + 1}`);
          break;
          
        } catch (attemptError) {
          retryCount++;
          console.warn(`Attempt ${retryCount} failed for objective ${objectiveId}:`, attemptError);
          
          if (retryCount >= maxRetries) {
            throw attemptError;
          }
          
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
      
      return response;
    } catch (error) {
      console.warn(`Failed to fetch initiatives for objective ${objectiveId} after ${maxRetries} attempts:`, error);
      return { data: [] };
    }
  },
  
  getByProgram: async (programId: string) => {
    try {
      const response = await api.get(`/strategic-initiatives/?program=${programId}`);
      return response;
    } catch (error) {
      console.error(`Failed to fetch initiatives for program ${programId}:`, error);
      throw error;
    }
  },
  
  getBySubProgram: async (subProgramId: string) => {
    try {
      const response = await api.get(`/strategic-initiatives/?subprogram=${subProgramId}`);
      return response;
    } catch (error) {
      console.error(`Failed to fetch initiatives for subprogram ${subProgramId}:`, error);
      throw error;
    }
  },
  
  create: async (data: any) => {
    try {
      const response = await api.post('/strategic-initiatives/', data);
      return response.data;
    } catch (error) {
      console.error('Failed to create initiative:', error);
      throw error;
    }
  },
  
  update: async (id: string, data: any) => {
    try {
      const response = await api.patch(`/strategic-initiatives/${id}/`, data);
      return response.data;
    } catch (error) {
      console.error(`Failed to update initiative ${id}:`, error);
      throw error;
    }
  },
  
  delete: async (id: string) => {
    try {
      await api.delete(`/strategic-initiatives/${id}/`);
      return { success: true };
    } catch (error) {
      console.error(`Failed to delete initiative ${id}:`, error);
      throw error;
    }
  },
  
  getWeightSummary: async (parentId: string, parentType: string) => {
    try {
      const paramName = parentType === 'objective' ? 'objective' : 
                       parentType === 'program' ? 'program' : 
                       'subprogram';
      
      // Try multiple endpoint variations to handle different backend configurations
      let response;
      try {
        response = await api.get(`/strategic-initiatives/weight-summary/?${paramName}=${parentId}`);
      } catch (error1) {
        console.warn('Primary weight-summary endpoint failed, trying alternative:', error1);
        try {
          response = await api.get(`/strategic-initiatives/weight_summary/?${paramName}=${parentId}`);
        } catch (error2) {
          console.warn('Alternative weight-summary endpoint failed, using fallback calculation:', error2);
          // Return fallback data instead of throwing error
          return {
            data: {
              total_initiatives_weight: 0,
              remaining_weight: 100,
              parent_weight: 100,
              is_valid: true
            }
          };
        }
      }
      return response;
    } catch (error) {
      console.error(`Failed to fetch initiative weight summary for ${parentType} ${parentId}:`, error);
      return {
        data: {
          total_initiatives_weight: 0,
          remaining_weight: 100,
          parent_weight: 100,
          is_valid: true
        }
      };
    }
  },
  
  validateInitiativesWeight: async (parentId: string, parentType: string) => {
    try {
      const response = await api.post(`/strategic-initiatives/validate-initiatives-weight/?${parentType}=${parentId}`);
      return response;
    } catch (error) {
      console.error(`Failed to validate initiative weights for ${parentType} ${parentId}:`, error);
      throw error;
    }
  }
};

// Performance measures service
export const performanceMeasures = {
  async getByInitiative(initiativeId: string) {
    try {
      if (!initiativeId) {
        console.warn('No initiative ID provided to performanceMeasures.getByInitiative');
        return { data: [] };
      }
      
      console.log(`Fetching performance measures for initiative ${initiativeId} in production mode`);
      
      const timestamp = new Date().getTime();
      const id = String(initiativeId);
      
      let response;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          if (retryCount === 0) {
            // First attempt: standard format with extended timeout
            response = await api.get(`/performance-measures/?initiative=${id}&_=${timestamp}`, {
              timeout: 12000,
              headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
            });
          } else if (retryCount === 1) {
            // Second attempt: alternative parameter format
            response = await api.get('/performance-measures/', {
              params: { 
                initiative: id,
                initiative_id: id, // Try both parameter names
                _: timestamp + retryCount
              },
              timeout: 8000,
              headers: { 'Cache-Control': 'no-cache' }
            });
          } else {
            // Third attempt: simplified call with different endpoint approach
            response = await api.get(`/performance-measures/`, {
              timeout: 5000,
              params: { initiative: id }
            });
          }
          
          console.log(`Successfully fetched performance measures for initiative ${id} on attempt ${retryCount + 1}`);
          break;
          
        } catch (attemptError) {
          retryCount++;
          console.warn(`Performance measures attempt ${retryCount} failed for initiative ${id}:`, attemptError);
          
          if (retryCount >= maxRetries) {
            throw attemptError;
          }
          
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
      
      if (!response.data) {
        console.warn(`No performance measures data returned for initiative ${id}`);
        return { data: [] };
      }
      
      const data = response.data.results || response.data;
      if (!Array.isArray(data)) {
        console.warn(`Expected array but got for initiative ${id}:`, typeof data);
        return { data: [] };
      }
      
      return response;
    } catch (error) {
      console.warn(`Failed to get performance measures for initiative ${initiativeId} after retries:`, error);
      return { data: [] };
    }
  },
  
  async getById(id: string) {
    try {
      const response = await api.get(`/performance-measures/${id}/`);
      return response;
    } catch (error) {
      console.error(`Failed to get performance measure ${id}:`, error);
      throw error;
    }
  },
  
  async create(data: any) {
    try {
      await ensureCsrfToken();
      
      const submissionData = { ...data };
      if (data.initiative) submissionData.initiative = String(data.initiative);
      
      if (!Array.isArray(submissionData.selected_months)) {
        submissionData.selected_months = submissionData.selected_months ? [submissionData.selected_months] : [];
      }
      
      if (!Array.isArray(submissionData.selected_quarters)) {
        submissionData.selected_quarters = submissionData.selected_quarters ? [submissionData.selected_quarters] : [];
      }
      
      const response = await api.post('/performance-measures/', submissionData);
      return response;
    } catch (error) {
      console.error('Failed to create performance measure:', error);
      throw error;
    }
  },
  
  async update(id: string, data: any) {
    try {
      await ensureCsrfToken();
      
      const submissionData = { ...data };
      if (data.initiative) submissionData.initiative = String(data.initiative);
      
      if (!Array.isArray(submissionData.selected_months)) {
        submissionData.selected_months = submissionData.selected_months ? [submissionData.selected_months] : [];
      }
      
      if (!Array.isArray(submissionData.selected_quarters)) {
        submissionData.selected_quarters = submissionData.selected_quarters ? [submissionData.selected_quarters] : [];
      }
      
      const response = await api.patch(`/performance-measures/${id}/`, submissionData);
      return response;
    } catch (error) {
      console.error(`Failed to update performance measure ${id}:`, error);
      throw error;
    }
  },
  
  async delete(id: string) {
    try {
      const response = await api.delete(`/performance-measures/${id}/`);
      return response;
    } catch (error) {
      console.error(`Failed to delete performance measure ${id}:`, error);
      throw error;
    }
  },
  
  async getWeightSummary(initiativeId: string) {
    try {
      const id = String(initiativeId);
      const response = await api.get(`/performance-measures/weight_summary/?initiative=${id}`);
      return response;
    } catch (error) {
      console.error('Failed to get performance measures weight summary:', error);
      throw error;
    }
  },
  
  async validateMeasuresWeight(initiativeId: string) {
    try {
      await ensureCsrfToken();
      
      const id = String(initiativeId);
      const response = await api.post(`/performance-measures/validate_measures_weight/?initiative=${id}`);
      return response;
    } catch (error) {
      console.error('Failed to validate performance measures weight:', error);
      throw error;
    }
  }
};

// Main activities service
export const mainActivities = {
  async getByInitiative(initiativeId: string) {
    try {
      if (!initiativeId) {
        console.warn('No initiative ID provided to mainActivities.getByInitiative');
        return { data: [] };
      }
      
      console.log(`Fetching main activities for initiative ${initiativeId} in production mode`);
      
      const timestamp = new Date().getTime();
      const id = String(initiativeId);
      
      let response;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          if (retryCount === 0) {
            // First attempt: standard format with extended timeout
            response = await api.get(`/main-activities/?initiative=${id}&_=${timestamp}`, {
              timeout: 12000,
              headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
            });
          } else if (retryCount === 1) {
            // Second attempt: alternative parameter format
            response = await api.get('/main-activities/', {
              params: { 
                initiative: id,
                initiative_id: id, // Try both parameter names
                _: timestamp + retryCount
              },
              timeout: 8000,
              headers: { 'Cache-Control': 'no-cache' }
            });
          } else {
            // Third attempt: simplified call
            response = await api.get(`/main-activities/`, {
              timeout: 5000,
              params: { initiative: id }
            });
          }
          
          console.log(`Successfully fetched main activities for initiative ${id} on attempt ${retryCount + 1}`);
          break;
          
        } catch (attemptError) {
          retryCount++;
          console.warn(`Main activities attempt ${retryCount} failed for initiative ${id}:`, attemptError);
          
          if (retryCount >= maxRetries) {
            throw attemptError;
          }
          
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
      
      if (!response.data) {
        console.warn(`No main activities data returned for initiative ${id}`);
        return { data: [] };
      }
      
      const data = response.data.results || response.data;
      if (!Array.isArray(data)) {
        console.warn(`Expected array but got for initiative ${id}:`, typeof data);
        return { data: [] };
      }
      
      return response;
    } catch (error) {
      console.warn(`Failed to get main activities for initiative ${initiativeId} after retries:`, error);
      return { data: [] };
    }
  },
  
  async getById(id: string) {
    try {
      const response = await api.get(`/main-activities/${id}/`);
      return response;
    } catch (error) {
      console.error(`Failed to get main activity ${id}:`, error);
      throw error;
    }
  },
  
  async create(data: any) {
    try {
      await ensureCsrfToken();
      
      const submissionData = { ...data };
      if (data.initiative) submissionData.initiative = String(data.initiative);
      
      if (!Array.isArray(submissionData.selected_months)) {
        submissionData.selected_months = submissionData.selected_months ? [submissionData.selected_months] : [];
      }
      
      if (!Array.isArray(submissionData.selected_quarters)) {
        submissionData.selected_quarters = submissionData.selected_quarters ? [submissionData.selected_quarters] : [];
      }
      
      const response = await api.post('/main-activities/', submissionData);
      return response;
    } catch (error) {
      console.error('Failed to create main activity:', error);
      throw error;
    }
  },
  
  async update(id: string, data: any) {
    try {
      await ensureCsrfToken();
      
      const submissionData = { ...data };
      if (data.initiative) submissionData.initiative = String(data.initiative);
      
      if (!Array.isArray(submissionData.selected_months)) {
        submissionData.selected_months = submissionData.selected_months ? [submissionData.selected_months] : [];
      }
      
      if (!Array.isArray(submissionData.selected_quarters)) {
        submissionData.selected_quarters = submissionData.selected_quarters ? [submissionData.selected_quarters] : [];
      }
      
      const response = await api.patch(`/main-activities/${id}/`, submissionData);
      return response;
    } catch (error) {
      console.error(`Failed to update main activity ${id}:`, error);
      throw error;
    }
  },
  
  async delete(id: string) {
    try {
      const response = await api.delete(`/main-activities/${id}/`);
      return response;
    } catch (error) {
      console.error(`Failed to delete main activity ${id}:`, error);
      throw error;
    }
  },
  
  async getWeightSummary(initiativeId: string) {
    try {
      const response = await api.get(`/main-activities/weight_summary/?initiative=${initiativeId}`);
      return response;
    } catch (error) {
      console.error('Failed to get main activities weight summary:', error);
      throw error;
    }
  },
  
  async validateActivitiesWeight(initiativeId: string) {
    try {
      await ensureCsrfToken();
      const response = await api.post(`/main-activities/validate_activities_weight/?initiative=${initiativeId}`);
      return response;
    } catch (error) {
      console.error('Failed to validate main activities weight:', error);
      throw error;
    }
  },
  
  async updateBudget(activityId: string, budgetData: any) {
    try {
      await ensureCsrfToken();
      const response = await api.post(`/main-activities/${activityId}/budget/`, budgetData);
      return response;
    } catch (error) {
      console.error(`Failed to update budget for activity ${activityId}:`, error);
      throw error;
    }
  }
};

// Activity budgets service
export const activityBudgets = {
  async getByActivity(activityId: string) {
    try {
      const response = await api.get(`/activity-budgets/?activity=${activityId}`);
      return response;
    } catch (error) {
      console.error(`Failed to get budget for activity ${activityId}:`, error);
      throw error;
    }
  },
  
  async create(data: any) {
    try {
      const response = await api.post('/activity-budgets/', data);
      return response;
    } catch (error) {
      console.error('Failed to create activity budget:', error);
      throw error;
    }
  },
  
  async update(id: string, data: any) {
    try {
      const response = await api.patch(`/activity-budgets/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Failed to update activity budget ${id}:`, error);
      throw error;
    }
  }
};

// Plans service
export const plans = {
  async getAll() {
    try {
      const timestamp = new Date().getTime();
      const response = await api.get(`/plans/?_=${timestamp}`);
      return response;
    } catch (error) {
      console.error('Failed to get plans:', error);
      throw error;
    }
  },
  
  async getById(id: string) {
    try {
      const response = await api.get(`/plans/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to get plan ${id}:`, error);
      throw error;
    }
  },
  
  async create(data: any) {
    try {
      const formattedData = {...data};
      
      if (formattedData.organization) {
        formattedData.organization = Number(formattedData.organization);
      }
      
      if (formattedData.strategic_objective) {
        formattedData.strategic_objective = String(formattedData.strategic_objective);
      }
      
      if (formattedData.from_date) {
        formattedData.from_date = new Date(formattedData.from_date).toISOString().split('T')[0];
      }
      
      if (formattedData.to_date) {
        formattedData.to_date = new Date(formattedData.to_date).toISOString().split('T')[0];
      }
      
      await ensureCsrfToken();
      const response = await api.post(`/plans/`, formattedData);
      return response.data;
    } catch (error) {
      console.error('Failed to create plan:', error);
      throw error;
    }
  },
  
  async update(id: string, data: any) {
    try {
      const response = await api.patch(`/plans/${id}/`, data);
      return response.data;
    } catch (error) {
      console.error(`Failed to update plan ${id}:`, error);
      throw error;
    }
  },
  
  async delete(id: string) {
    try {
      const response = await api.delete(`/plans/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to delete plan ${id}:`, error);
      throw error;
    }
  },
  
  async submitToEvaluator(id: string) {
    try {
      await ensureCsrfToken();
      const response = await api.post(`/plans/${id}/submit/`);
      return response.data;
    } catch (error: any) {
      let errorMessage = "Failed to submit plan for review";
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      throw new Error(errorMessage);
    }
  },
  
  async approvePlan(id: string, feedback: string) {
    try {
      await ensureCsrfToken();
      const response = await api.post(`/plans/${id}/approve/`, { feedback });
      return response;
    } catch (error) {
      console.error(`Failed to approve plan ${id}:`, error);
      throw error;
    }
  },
  
  async rejectPlan(id: string, feedback: string) {
    try {
      await ensureCsrfToken();
      const response = await api.post(`/plans/${id}/reject/`, { feedback });
      return response;
    } catch (error) {
      console.error(`Failed to reject plan ${id}:`, error);
      throw error;
    }
  },
  
  async getPendingReviews() {
    try {
      await ensureCsrfToken();
      const response = await api.get(`/plans/pending_reviews/`);
      return response;
    } catch (error) {
      console.error('Failed to get pending reviews:', error);
      throw error;
    }
  }
};

// Utility export functions
export const processDataForExport = (objectives: any[], language: string = 'en'): any[] => {
  return []; // Placeholder - implement actual export processing
};

export const formatCurrency = (value: any): string => {
  if (!value || value === 'N/A') return '-';
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '-';
  return `$${numValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Start session refresh when module is loaded
if (typeof window !== 'undefined') {
  startSessionRefresh();
}
