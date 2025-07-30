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
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Function to ensure CSRF token is set before making requests
const ensureCsrfToken = async () => {
  try {
    await csrf();
    return true;
  } catch (error) {
    console.error('Failed to ensure CSRF token:', error);
    return false;
  }
};

// Dedicated function to get a CSRF token
export const csrf = async () => {
  try {
    let token = Cookies.get('csrftoken');
    
    if (!token) {
      console.log('No CSRF token found, fetching a new one...');
      
      // Try the dedicated CSRF endpoint with cache prevention
      const timestamp = new Date().getTime();
      const csrfResponse = await axios.get(`/api/auth/csrf/?_=${timestamp}`, {
        withCredentials: true,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      
      token = Cookies.get('csrftoken');
      
      // If that doesn't work, try the auth/check/ endpoint
      if (!token) {
        console.log('No token from CSRF endpoint, trying auth/check/...');
        await axios.get(`/api/auth/check/?_=${timestamp}`, {
          withCredentials: true,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        
        token = Cookies.get('csrftoken');
      }
      
      // If we got a token from headers, set it as a cookie
      if (!token && csrfResponse?.headers) {
        const headerToken = csrfResponse.headers['x-csrftoken'] || 
                         csrfResponse.headers['X-CSRFToken'];
        if (headerToken) {
          token = headerToken;
          Cookies.set('csrftoken', token, { path: '/' });
        }
      }
    }
    
    return token;
  } catch (error) {
    console.error('Failed to get CSRF token:', error);
    throw error;
  }
};

// Authentication service
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
      console.log('Attempting to logout user...');
      
      // Add timestamp to prevent caching
      const timestamp = new Date().getTime();
      const csrfToken = Cookies.get('csrftoken');
      
      try {
        // Make a direct axios call instead of using the api instance
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
        console.log('Logout request successful');
      } catch (err) {
        console.warn("Logout request failed but proceeding anyway:", err);
      }
      
      console.log('Clearing cookies...');
      
      // Always remove cookies regardless of response
      Cookies.remove('sessionid', { path: '/' });
      Cookies.remove('csrftoken', { path: '/' });
      
      // Force reload to the login page after a brief timeout to ensure cookies are cleared
      console.log('Redirecting to login page');
      setTimeout(() => {
        window.location.href = '/login';
      }, 100);
      
      return { success: true };
    } catch (error: any) {
      console.error('Logout error:', error);
      
      // Even if the API call fails, still clear cookies and redirect
      console.log('Logout failed but still clearing cookies');
      Cookies.remove('sessionid', { path: '/' });
      Cookies.remove('csrftoken', { path: '/' });
      
      // Force reload to the login page after a brief timeout
      console.log('Redirecting to login page');
      setTimeout(() => {
        window.location.href = '/login';
      }, 100);
      
      return { success: false, error: error.message };
    }
  },
  
  // New method for updating user profile
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
  
  // New method for changing password
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
  
  getCurrentUser: async (): Promise<AuthState> => {
    try {
      const response = await api.get('/auth/check/');
      return {
        isAuthenticated: response.data.isAuthenticated,
        user: response.data.user,
        userOrganizations: response.data.userOrganizations || []
      };
    } catch (error) {
      console.error('Get current user error:', error);
      return { isAuthenticated: false, user: null, userOrganizations: [] };
    }
  },
  
  isAuthenticated: () => {
    return !!Cookies.get('sessionid');
  },
  
  // New method specifically for getting a CSRF token
  csrf: async () => {
    return csrf();
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
    console.log('Fetching all locations from API...');
    try {
      // Add timestamp to prevent caching
      const timestamp = new Date().getTime();
      const url = `/locations/?_=${timestamp}`;
      console.log(`Making request to: ${api.defaults.baseURL}${url}`);
      const response = await api.get(`/locations/?_=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (!response || !response.data) {
        console.warn('Empty response received from locations API');
        // Return empty array instead of throwing
        return { data: [] };
      }
      
      console.log('Fetched locations data count:', response.data?.length || 0);
      return response;
    } catch (error) {
      console.error('Failed to fetch locations:', error, error.response?.data || 'No response data');
      console.error('API URL used:', api.defaults.baseURL);
      throw error;
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
    console.log('Fetching all land transports from API...');
    try {
      // Add timestamp to prevent caching
      const timestamp = new Date().getTime();
      console.log(`Making request to: ${api.defaults.baseURL}/land-transports/`);
      const response = await api.get('/land-transports/', {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      console.log('Fetched land transports data count:', response.data?.length || 0);
      if (!response || !response.data) {
        console.warn('Empty response received from land-transports API');
        return { data: [] };
      }
      
      console.log('Fetched land transports data count:', response.data?.length || 0);
      return response; 
    } catch (error) {
      console.error('Failed to fetch land transports:', error, error.response?.data || 'No response data');
      console.error('API URL used:', api.defaults.baseURL);
      // Return empty array instead of throwing
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
    console.log('Fetching all air transports from API...');
    try {
      // Add timestamp to prevent caching
      const timestamp = new Date().getTime();
      console.log(`Making request to: ${api.defaults.baseURL}/air-transports/`);
      const response = await api.get('/air-transports/', {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response || !response.data) {
        console.warn('Empty response received from air-transports API');
        return { data: [] };
      }
      
      console.log('Fetched air transports data count:', response.data?.length || 0);
      return response;
    } catch (error) {
      console.error('Failed to fetch air transports:', error, error.response?.data || 'No response data');
      console.error('API URL used:', api.defaults.baseURL);
      // Return empty array instead of throwing
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
    console.log('Fetching all per diems from API...');
    try {
      // Add timestamp to prevent caching
      const timestamp = new Date().getTime();
      const response = await api.get(`/per-diems/?_=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      console.log('Fetched per-diems data count:', response.data?.length || 0);
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
    console.log('Fetching all accommodations from API');
    try {
      // Add timestamp to prevent caching
      const timestamp = new Date().getTime();
      const response = await api.get(`/accommodations/?_=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      console.log('Fetched accommodations data count:', response.data?.length || 0);
      return response;
    } catch (error) {
      console.error('Failed to fetch accommodations:', error);
      // Return empty data instead of throwing
      return { data: [] };
    }
  },
  
  getById: async (id: string) => {
    try {
      const response = await api.get(`/accommodations/${id}/`);
      return response
    } catch (error) {
      console.error(`Failed to fetch accommodation ${id}:`, error);
      throw error;
    }
  }
};

// Participant Costs API
export const participantCosts = {
  getAll: async () => {
    console.log('Fetching all participant costs from API');
    try {
      // Add timestamp to prevent caching
      const timestamp = new Date().getTime();
      const response = await api.get(`/participant-costs/?_=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      console.log('Fetched participant costs data count:', response.data?.length || 0);
      return response;
    } catch (error) {
      console.error('Failed to fetch participant costs:', error);
      // Return empty data instead of throwing
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
    console.log('Fetching all session costs from API');
    try {
      // Add timestamp to prevent caching
      const timestamp = new Date().getTime();
      const response = await api.get(`/session-costs/?_=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      console.log('Fetched session costs data count:', response.data?.length || 0);
      return response;
    } catch (error) {
      console.error('Failed to fetch session costs:', error);
      // Return empty data instead of throwing
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
    console.log('Fetching all printing costs from API');
    try {
      // Add timestamp to prevent caching
      const timestamp = new Date().getTime();
      const response = await api.get(`/printing-costs/?_=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      console.log('Fetched printing costs data count:', response.data?.length || 0);
      return response;
    } catch (error) {
      console.error('Failed to fetch printing costs:', error);
      // Return empty data instead of throwing
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
    console.log('Fetching all supervisor costs from API');
    try {
      // Add timestamp to prevent caching
      const timestamp = new Date().getTime();
      const response = await api.get(`/supervisor-costs/?_=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      console.log('Fetched supervisor costs data count:', response.data?.length || 0);
      return response;
    } catch (error) {
      console.error('Failed to fetch supervisor costs:', error);
      // Return empty data instead of throwing
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
    console.log('Fetching all procurement items from API');
    try {
      // Add timestamp to prevent caching
      const timestamp = new Date().getTime();
      const response = await api.get(`/procurement-items/?_=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      console.log('Fetched procurement items data count:', response.data?.length || 0);
      return response;
    } catch (error) {
      console.error('Failed to fetch procurement items:', error);
      // Return empty data instead of throwing
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
      const response = await api.get(`/organizations/?_=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
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
      
      if (!allOrganizations) {
        console.error('Empty organizations response');
        return [];
      }
      
      if (!Array.isArray(allOrganizations)) {
        console.error('Organizations response is not an array:', typeof allOrganizations);
        return [];
      }
      
      // Filter organizations by type
      return allOrganizations.filter((org: Organization) => {
        if (!org || !org.type) return false;
        return ['EXECUTIVE', 'TEAM_LEAD', 'DESK'].includes(org.type);
      });
    } catch (error) {
      console.error('Failed to get implementing organizations:', error);
      return [];
    }
  }
};

// Initiative Feeds service
// export const initiativeFeeds = {
//   async getAll() {
//     try {
//       const response = await api.get('/initiative-feeds/');
//       return response;
//     } catch (error) {
//       console.error('Failed to get initiative feeds:', error);
//       throw error;
//     }
//   },
  
//   async getById(id: string) {
//     try {
//       const response = await api.get(`/initiative-feeds/${id}/`);
//       return response;
//     } catch (error) {
//       console.error(`Failed to get initiative feed ${id}:`, error);
//       throw error;
//     }
//   }
// };

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

// Strategic initiatives service
export const initiatives = {
  async getAll() {
    try {
      const response = await api.get('/strategic-initiatives/');
      return response;
    } catch (error) {
      console.error('Failed to get initiatives:', error);
      throw error;
    }
  },
  
  async getByObjective(objectiveId: string) {
    try {
      const response = await api.get(`/strategic-initiatives/?objective=${objectiveId}`);
      return response;
    } catch (error) {
      console.error(`Failed to get initiatives for objective ${objectiveId}:`, error);
      throw error;
    }
  },
  
  async getByProgram(programId: string) {
    try {
      const response = await api.get(`/strategic-initiatives/?program=${programId}`);
      return response;
    } catch (error) {
      console.error(`Failed to get initiatives for program ${programId}:`, error);
      throw error;
    }
  },
  
  async getBySubProgram(subprogramId: string) {
    try {
      const response = await api.get(`/strategic-initiatives/?subprogram=${subprogramId}`);
      return response;
    } catch (error) {
      console.error(`Failed to get initiatives for subprogram ${subprogramId}:`, error);
      throw error;
    }
  },
  
  async getById(id: string) {
    try {
      const response = await api.get(`/strategic-initiatives/${id}/`);
      return response;
    } catch (error) {
      console.error(`Failed to get initiative ${id}:`, error);
      throw error;
    }
  },
  
  async create(data: any) {
    try {
      // Ensure CSRF token is fresh
      await auth.getCurrentUser();
      
      // Format the data properly to avoid type issues
      const formattedData = { ...data };
      
      // Ensure strategic_objective is a string if provided
      if (formattedData.strategic_objective !== null && formattedData.strategic_objective !== undefined) {
        // If it's an object, extract the ID as a string
        if (typeof formattedData.strategic_objective === 'object' && formattedData.strategic_objective !== null) {
          if (formattedData.strategic_objective.id !== undefined) {
            formattedData.strategic_objective = String(formattedData.strategic_objective.id);
          } else {
            console.error("Strategic objective object doesn't have an ID property:", formattedData.strategic_objective);
            throw new Error("Invalid strategic objective object");
          }
        } else {
          // Otherwise ensure it's a string
          formattedData.strategic_objective = String(formattedData.strategic_objective);
        }
      }
      
      // Ensure program is a string if provided
      if (formattedData.program !== null && formattedData.program !== undefined) {
        // If it's an object, extract the ID as a string
        if (typeof formattedData.program === 'object' && formattedData.program !== null) {
          if (formattedData.program.id !== undefined) {
            formattedData.program = String(formattedData.program.id);
          } else {
            console.error("Program object doesn't have an ID property:", formattedData.program);
            throw new Error("Invalid program object");
          }
        } else {
          // Otherwise ensure it's a string
          formattedData.program = String(formattedData.program);
        }
      }
      
      // Ensure organization is a number if provided
      if (formattedData.organization_id) {
        formattedData.organization = Number(formattedData.organization_id);
        delete formattedData.organization_id;
      } else if (formattedData.organization && typeof formattedData.organization !== 'number') {
        formattedData.organization = Number(formattedData.organization);
      }
      
      // Ensure weight is a number
      if (typeof formattedData.weight === 'string') {
        formattedData.weight = Number(formattedData.weight);
      }
      
      // Ensure initiative_feed is a string if provided
      if (formattedData.initiative_feed !== null && formattedData.initiative_feed !== undefined) {
        formattedData.initiative_feed = String(formattedData.initiative_feed);
      }
      
      // Remove any properties that shouldn't be sent to the API
      delete formattedData.initiative_feed_name;
      delete formattedData.strategic_objective_title;
      delete formattedData.program_name;
      delete formattedData.organization_name;
      delete formattedData.performance_measures;
      delete formattedData.main_activities;
      delete formattedData.total_measures_weight;
      delete formattedData.total_activities_weight;
      
      console.log("Creating initiative with formatted data:", formattedData);
      
      const response = await api.post('/strategic-initiatives/', formattedData);
      return response;
    } catch (error) {
      console.error('Failed to create initiative:', error);
      throw error;
    }
  },
  
  async update(id: string, data: any) {
    try {
      // Ensure CSRF token is fresh
      await auth.getCurrentUser();
      
      // Format the data properly to avoid type issues
      const formattedData = { ...data };
      
      // Ensure strategic_objective is a string if provided
      if (formattedData.strategic_objective !== null && formattedData.strategic_objective !== undefined) {
        // If it's an object, extract the ID as a string
        if (typeof formattedData.strategic_objective === 'object' && formattedData.strategic_objective !== null) {
          if (formattedData.strategic_objective.id !== undefined) {
            formattedData.strategic_objective = String(formattedData.strategic_objective.id);
          } else {
            console.error("Strategic objective object doesn't have an ID property:", formattedData.strategic_objective);
            throw new Error("Invalid strategic objective object");
          }
        } else {
          // Otherwise ensure it's a string
          formattedData.strategic_objective = String(formattedData.strategic_objective);
        }
      }
      
      // Ensure program is a string if provided
      if (formattedData.program !== null && formattedData.program !== undefined) {
        // If it's an object, extract the ID as a string
        if (typeof formattedData.program === 'object' && formattedData.program !== null) {
          if (formattedData.program.id !== undefined) {
            formattedData.program = String(formattedData.program.id);
          } else {
            console.error("Program object doesn't have an ID property:", formattedData.program);
            throw new Error("Invalid program object");
          }
        } else {
          // Otherwise ensure it's a string
          formattedData.program = String(formattedData.program);
        }
      }
      
      // Ensure organization is a number if provided
      if (formattedData.organization_id) {
        formattedData.organization = Number(formattedData.organization_id);
        delete formattedData.organization_id;
      } else if (formattedData.organization && typeof formattedData.organization !== 'number') {
        formattedData.organization = Number(formattedData.organization);
      }
      
      // Ensure weight is a number
      if (typeof formattedData.weight === 'string') {
        formattedData.weight = Number(formattedData.weight);
      }
      
      // Ensure initiative_feed is a string if provided
      if (formattedData.initiative_feed !== null && formattedData.initiative_feed !== undefined) {
        formattedData.initiative_feed = String(formattedData.initiative_feed);
      }
      
      // Remove any properties that shouldn't be sent to the API
      delete formattedData.initiative_feed_name;
      delete formattedData.strategic_objective_title;
      delete formattedData.program_name;
      delete formattedData.organization_name;
      delete formattedData.performance_measures;
      delete formattedData.main_activities;
      delete formattedData.total_measures_weight;
      delete formattedData.total_activities_weight;
      
      console.log("Updating initiative with formatted data:", formattedData);
      
      const response = await api.patch(`/strategic-initiatives/${id}/`, formattedData);
      return response;
    } catch (error) {
      console.error(`Failed to update initiative ${id}:`, error);
      throw error;
    }
  },
  
  async delete(id: string) {
    try {
      const response = await api.delete(`/strategic-initiatives/${id}/`);
      return response;
    } catch (error) {
      console.error(`Failed to delete initiative ${id}:`, error);
      throw error;
    }
  },
  
  async getWeightSummary(parentId: string, parentType: 'objective' | 'program' | 'subprogram') {
    try {
      let url = '/strategic-initiatives/weight_summary/?';
      
      if (parentType === 'objective') {
        url += `objective=${parentId}`;
      } else if (parentType === 'program') {
        url += `program=${parentId}`;
      } else if (parentType === 'subprogram') {
        url += `subprogram=${parentId}`;
      }
      
      const response = await api.get(url);
      return response;
    } catch (error) {
      console.error('Failed to get initiatives weight summary:', error);
      throw error;
    }
  },
  
  async validateInitiativesWeight(parentId: string, parentType: 'objective' | 'program' | 'subprogram') {
    try {
      let url = '/strategic-initiatives/validate_initiatives_weight/?';
      
      if (parentType === 'objective') {
        url += `objective=${parentId}`;
      } else if (parentType === 'program') {
        url += `program=${parentId}`;
      } else if (parentType === 'subprogram') {
        url += `subprogram=${parentId}`;
      }
      
      const response = await api.post(url);
      return response;
    } catch (error) {
      console.error('Failed to validate initiatives weight:', error);
      throw error;
    }
  }
};


// Performance measures service
export const performanceMeasures = {
  async getByInitiative(initiativeId: string) {
    try {
      const id = String(initiativeId);
      const response = await api.get(`/performance-measures/?initiative=${id}`);
      return response;
    } catch (error) {
      console.error(`Failed to get performance measures for initiative ${initiativeId}:`, error);
      throw error;
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
      
      // Ensure the initiative field is a string
      if (data.initiative && typeof data.initiative !== 'string') {
        data.initiative = String(data.initiative);
      }
      
      // Create a copy of the data to avoid modifying the original
      const submissionData = { ...data };
      
      // Ensure selected_months and selected_quarters are arrays
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
      
      // Ensure the initiative field is a string
      if (data.initiative && typeof data.initiative !== 'string') {
        data.initiative = String(data.initiative);
      }
      
      // Create a copy of the data to avoid modifying the original
      const submissionData = { ...data };
      
      // Ensure selected_months and selected_quarters are arrays
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
      const timestamp = new Date().getTime();
      const response = await api.post(`/performance-measures/validate_measures_weight/?initiative=${id}&_=${timestamp}`);
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
      const response = await api.get(`/main-activities/?initiative=${initiativeId}`);
      return response;
    } catch (error) {
      console.error(`Failed to get main activities for initiative ${initiativeId}:`, error);
      throw error;
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
      
      // Ensure the initiative field is a string
      if (data.initiative && typeof data.initiative !== 'string') {
        data.initiative = String(data.initiative);
      }
      
      // Create a copy of the data to avoid modifying the original
      const submissionData = { ...data };
      
      // Ensure selected_months and selected_quarters are arrays
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
      
      // Ensure the initiative field is a string
      if (data.initiative && typeof data.initiative !== 'string') {
        data.initiative = String(data.initiative);
      }
      
      // Create a copy of the data to avoid modifying the original
      const submissionData = { ...data };
      
      // Ensure selected_months and selected_quarters are arrays
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
      
      const timestamp = new Date().getTime();
      const response = await api.post(`/main-activities/validate_activities_weight/?initiative=${initiativeId}&_=${timestamp}`);
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
      console.log('Fetching all user plans...');
      const response = api.get(`/plans/?_=${timestamp}&random=${Math.random()}`, { 
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate', 
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Requested-With': 'XMLHttpRequest'
        },
      });
      console.log('Plans response status:', response.status);
      console.log('Plans data:', response.data);
      return response;
    } catch (error) {
      console.error('Failed to get plans:', error);
      throw error;
    }
  },
  
  async getById(id: string) {
    try {
      const timestamp = new Date().getTime();
      console.log(`Fetching plan details for ID: ${id}`);
      const response = await api.get(`/plans/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to get plan ${id}:`, error);
      throw error;
    }
  },
  
  async create(data: any) {
    try {
      // Clone data to avoid modifying original
      const formattedData = {...data};
      
      // Ensure organization is formatted correctly
      if (formattedData.organization && typeof formattedData.organization !== 'number') {
        formattedData.organization = Number(formattedData.organization);
      }
      
      // Ensure strategic_objective is a string
      if (formattedData.strategic_objective && typeof formattedData.strategic_objective !== 'string') {
        formattedData.strategic_objective = String(formattedData.strategic_objective);
      }
      
      // Format dates properly
      if (formattedData.from_date) {
        formattedData.from_date = new Date(formattedData.from_date).toISOString().split('T')[0];
      }
      
      if (formattedData.to_date) {
        formattedData.to_date = new Date(formattedData.to_date).toISOString().split('T')[0];
      }
      
      await ensureCsrfToken();
      
      const timestamp = new Date().getTime();
      const response = await api.post(`/plans/?_=${timestamp}`, formattedData);
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
    if (!id) {
      throw new Error("Cannot submit: Missing plan ID");
    }
    
    try {
      console.log(`Submitting plan ${id} for review`);
      await ensureCsrfToken();
      
      const timestamp = new Date().getTime();
      const response = await api.post(`/plans/${id}/submit/?_=${timestamp}`);
      console.log(`Plan submission response:`, response);
      return response.data;
    } catch (error: any) {
      console.error(`Failed to submit plan ${id}:`, error);
      
      let errorMessage = "Failed to submit plan for review";
      
      if (error.response && error.response.data) {
        if (error.response.data.detail) {
          errorMessage = error.response.data.detail;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      throw new Error(errorMessage);
    }
  },
  
  async approvePlan(id: string, feedback: string) {
    try {
      await ensureCsrfToken();
      
      const timestamp = new Date().getTime();
      const response = await api.post(`/plans/${id}/approve/?_=${timestamp}`, { feedback });
      return response;
    } catch (error) {
      console.error(`Failed to approve plan ${id}:`, error);
      throw error;
    }
  },
  
  async rejectPlan(id: string, feedback: string) {
    try {
      await ensureCsrfToken();
      
      const timestamp = new Date().getTime();
      const response = await api.post(`/plans/${id}/reject/?_=${timestamp}`, { feedback });
      return response;
    } catch (error) {
      console.error(`Failed to reject plan ${id}:`, error);
      throw error;
    }
  },
  
  async getPendingReviews() {
    try {
      await ensureCsrfToken();
      
      const timestamp = new Date().getTime();
      const response = await api.get(`/plans/pending_reviews/?_=${timestamp}`);
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
  
  // Convert to number if it's a string
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  // Check if it's a valid number
  if (isNaN(numValue)) return '-';
  
  // Format with $ and thousand separators
  return `$${numValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};