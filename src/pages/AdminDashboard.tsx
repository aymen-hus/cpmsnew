import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BarChart3, PieChart, DollarSign, Building2, CheckCircle, XCircle, AlertCircle, Loader, RefreshCw, LayoutGrid, TrendingUp, Users, Calendar, Eye } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { plans, organizations, auth, api } from '../lib/api';
import { format } from 'date-fns';
import { isAdmin } from '../types/user';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement } from 'chart.js';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement);

const AdminDashboard: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'overview' | 'budget-analysis' | 'organizations'>('overview');
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);

  // Check if user has admin permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        if (!isAdmin(authData.userOrganizations)) {
          setError('You do not have permission to access the admin dashboard');
        }
      } catch (error) {
        console.error('Failed to check permissions:', error);
        setError('Failed to verify your permissions');
      }
    };
    
    checkPermissions();
  }, [navigate]);

  // Fetch all organizations
  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        const response = await organizations.getAll();
        const orgMap: Record<string, string> = {};
        
        if (response && Array.isArray(response)) {
          response.forEach((org: any) => {
            if (org && org.id) {
              orgMap[org.id] = org.name;
            }
          });
        }
        
        setOrganizationsMap(orgMap);
        console.log('Organizations map created:', orgMap);
      } catch (error) {
        console.error('Failed to fetch organizations:', error);
      }
    };
    
    fetchOrganizations();
  }, []);

  // Fetch all plans for admin analytics
  const { data: allPlansData, isLoading: isLoadingPlans, refetch: refetchPlans, error: plansError } = useQuery({
    queryKey: ['admin-plans', 'all'],
    queryFn: async () => {
      try {
        console.log('Fetching all plans for admin analytics...');
        
        // Enhanced production-safe API call with improved retry logic
        let response;
        let retryCount = 0;
        const maxRetries = 4; // Increased retries for production
        
        while (retryCount < maxRetries) {
          try {
            console.log(`[AdminDashboard] Fetching plans attempt ${retryCount + 1}/${maxRetries}`);
            
            // Progressive timeout increase for production
            const baseTimeout = 15000; // Start with 15s
            const timeout = Math.min(60000, baseTimeout + (retryCount * 15000)); // Max 60s
            
            response = await api.get('/plans/', {
              timeout: timeout,
              headers: { 
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Accept': 'application/json',
                'Connection': 'keep-alive'
              }
            });
            console.log(`[AdminDashboard] Successfully fetched plans on attempt ${retryCount + 1} (timeout: ${timeout}ms)`);
            break;
          } catch (attemptError) {
            retryCount++;
            console.warn(`[AdminDashboard] Plans fetch attempt ${retryCount} failed:`, {
              message: attemptError.message,
              code: attemptError.code,
              timeout: attemptError.timeout
            });
            
            if (retryCount >= maxRetries) {
              throw attemptError;
            }
            
            // Enhanced exponential backoff for production
            const waitTime = Math.min(10000, 2000 * Math.pow(2, retryCount - 1));
            console.log(`[AdminDashboard] Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
        
        const plans = response.data?.results || response.data || [];
        console.log('All plans data for admin:', plans.length);
        
        if (!Array.isArray(plans)) {
          console.error('Expected array but got:', typeof plans);
          return [];
        }
        
        // Map organization names
        plans.forEach((plan: any) => {
          if (plan.organization && organizationsMap[plan.organization]) {
            plan.organizationName = organizationsMap[plan.organization];
          }
        });
        
        // Fetch complete budget data for each plan
        try {
          await fetchCompleteBudgetData(plans);
        } catch (budgetError) {
          console.warn('[AdminDashboard] Budget fetch failed, continuing with basic plan data:', budgetError);
          // Don't throw here - just continue with plans without budget data
        }
        
        return plans;
      } catch (error) {
        console.error('[AdminDashboard] Final error after all retries:', {
          message: error.message,
          code: error.code,
          stack: error.stack
        });
        throw error;
      }
    },
    enabled: Object.keys(organizationsMap).length > 0,
    retry: (failureCount, error) => {
      // Only retry on timeout/network errors, not on auth errors
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        return false;
      }
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(3000 * 2 ** attemptIndex, 30000),
    refetchInterval: 600000, // Refresh every 10 minutes for production
    staleTime: 300000, // Consider data stale after 5 minutes
    cacheTime: 600000 // Keep in cache for 10 minutes
  });

  // Function to fetch complete budget data for plans
  const fetchCompleteBudgetData = async (plans: any[]) => {
    // Filter to only include SUBMITTED or APPROVED plans for budget calculations
    const eligiblePlans = plans.filter(plan => 
      plan.status === 'SUBMITTED' || plan.status === 'APPROVED'
    );
    
    if (!eligiblePlans || eligiblePlans.length === 0) {
      console.log('No eligible plans (SUBMITTED/APPROVED) found for budget calculation');
      return;
    }
    
    setIsLoadingBudgets(true);
    setBudgetError(null);
    
    try {
      console.log(`Fetching complete budget data for ${eligiblePlans.length} eligible plans (SUBMITTED/APPROVED)...`);
      
      // Process plans in smaller batches to avoid overwhelming the server
      const batchSize = 5; // Process 5 plans at a time
      const batches = [];
      for (let i = 0; i < eligiblePlans.length; i += batchSize) {
        batches.push(eligiblePlans.slice(i, i + batchSize));
      }
      
      console.log(`Processing ${eligiblePlans.length} plans in ${batches.length} batches of ${batchSize}`);
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`[AdminDashboard] Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} plans`);
        
        // Process each plan in the current batch
        await Promise.all(batch.map(async (plan, planIndex) => {
        try {
          console.log(`[AdminDashboard] Processing plan ${plan.id} (${batchIndex * batchSize + planIndex + 1}/${eligiblePlans.length})`);
          
          // Fetch objectives with enhanced retry logic
          let objectivesResponse;
          let objectiveRetries = 0;
          const maxObjectiveRetries = 2;
          
          while (objectiveRetries <= maxObjectiveRetries) {
            try {
              objectivesResponse = await api.get('/strategic-objectives/', {
                timeout: 25000 + (objectiveRetries * 10000), // 25s, 35s, 45s
                headers: { 
                  'Accept': 'application/json',
                  'Cache-Control': 'no-cache'
                }
              });
              break;
            } catch (objError) {
              objectiveRetries++;
              if (objectiveRetries > maxObjectiveRetries) {
                throw objError;
              }
              console.warn(`[AdminDashboard] Objectives retry ${objectiveRetries} for plan ${plan.id}`);
              await new Promise(resolve => setTimeout(resolve, 2000 * objectiveRetries));
            }
          }
          
          const allObjectives = objectivesResponse?.data || [];
          
          // Fetch initiatives with retry logic
          let initiativesResponse;
          let initiativeRetries = 0;
          
          while (initiativeRetries <= maxObjectiveRetries) {
            try {
              initiativesResponse = await api.get('/strategic-initiatives/', {
                timeout: 25000 + (initiativeRetries * 10000),
                headers: { 
                  'Accept': 'application/json',
                  'Cache-Control': 'no-cache'
                }
              });
              break;
            } catch (initError) {
              initiativeRetries++;
              if (initiativeRetries > maxObjectiveRetries) {
                throw initError;
              }
              console.warn(`[AdminDashboard] Initiatives retry ${initiativeRetries} for plan ${plan.id}`);
              await new Promise(resolve => setTimeout(resolve, 2000 * initiativeRetries));
            }
          }
          
          const allInitiatives = initiativesResponse?.data || [];
          
          // Filter initiatives for this organization
          const orgInitiatives = allInitiatives.filter(initiative => 
            initiative.is_default || 
            !initiative.organization || 
            initiative.organization === Number(plan.organization)
          );
          
          let planTotalBudget = 0;
          let planGovernmentBudget = 0;
          let planSdgBudget = 0;
          let planPartnersBudget = 0;
          let planOtherBudget = 0;
          
          // For each initiative, fetch main activities and their budgets
          for (const initiative of orgInitiatives) {
            try {
              // Fetch activities with timeout protection
              let activitiesResponse;
              try {
                activitiesResponse = await Promise.race([
                  api.get(`/main-activities/?initiative=${initiative.id}`, {
                    timeout: 20000,
                    headers: { 'Accept': 'application/json' }
                  }),
                  new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Activities timeout')), 25000)
                  )
                ]);
              } catch (timeoutError) {
                console.warn(`[AdminDashboard] Activities timeout for initiative ${initiative.id}, using empty array`);
                activitiesResponse = { data: { results: [] } };
              }
              
              const activities = activitiesResponse?.data?.results || activitiesResponse?.data || [];
              
              // Filter activities for this organization
              const orgActivities = activities.filter(activity =>
                !activity.organization || activity.organization === Number(plan.organization)
              );
              
              for (const activity of orgActivities) {
                if (activity.budget) {
                  const budget = activity.budget;
                  const cost = budget.budget_calculation_type === 'WITH_TOOL' 
                    ? Number(budget.estimated_cost_with_tool || 0)
                    : Number(budget.estimated_cost_without_tool || 0);
                  
                  planTotalBudget += cost;
                  planGovernmentBudget += Number(budget.government_treasury || 0);
                  planSdgBudget += Number(budget.sdg_funding || 0);
                  planPartnersBudget += Number(budget.partners_funding || 0);
                  planOtherBudget += Number(budget.other_funding || 0);
                }
              }
              
              // Small delay to prevent server overload
              await new Promise(resolve => setTimeout(resolve, 500)); // Increased delay for production
            } catch (activityError) {
              console.warn(`[AdminDashboard] Error fetching activities for initiative ${initiative.id}:`, {
                message: activityError.message,
                code: activityError.code
              });
              // Continue with next initiative instead of failing entire batch
            }
          }
          
          // Set budget data on the plan object
          plan.budget_total = planTotalBudget;
          plan.government_total = planGovernmentBudget;
          plan.sdg_total = planSdgBudget;
          plan.partners_total = planPartnersBudget;
          plan.other_total = planOtherBudget;
          plan.funded_total = planGovernmentBudget + planSdgBudget + planPartnersBudget + planOtherBudget;
          plan.funding_gap = Math.max(0, planTotalBudget - plan.funded_total);
          
          console.log(`[AdminDashboard] Plan ${plan.id} budget calculated:`, {
            total: planTotalBudget,
            funded: plan.funded_total,
            gap: plan.funding_gap
          });
          
          // Increased delay between plans for production
          await new Promise(resolve => setTimeout(resolve, 800));
        } catch (planError) {
          console.warn(`[AdminDashboard] Error fetching budget for plan ${plan.id}:`, {
            message: planError.message,
            code: planError.code,
            timeout: planError.timeout
          });
          // Set default values if budget fetch fails
          plan.budget_total = 0;
          plan.funded_total = 0;
          plan.funding_gap = 0;
        }
        }));
        
        // Delay between batches to avoid overwhelming the server
        if (batchIndex < batches.length - 1) {
          console.log(`[AdminDashboard] Waiting before next batch...`);
          await new Promise(resolve => setTimeout(resolve, 3000)); // Increased delay for production
        }
      }
      
      console.log('[AdminDashboard] Completed budget data fetching for all plans');
    } catch (error) {
      console.error('[AdminDashboard] Error fetching budget data:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      setBudgetError(`Failed to load budget data: ${error.message || 'Network timeout'}`);
    } finally {
      setIsLoadingBudgets(false);
    }
  };

  // Manual refresh function
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    setBudgetError(null);
    try {
      console.log('[AdminDashboard] Manual refresh initiated');
      await refetchPlans();
      setSuccess('Data refreshed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('[AdminDashboard] Manual refresh failed:', {
        message: err.message,
        code: err.code
      });
      setError(`Failed to refresh data: ${err.message || 'Please check your connection'}`);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Calculate comprehensive statistics
  const calculateStats = () => {
    if (!allPlansData || !Array.isArray(allPlansData)) {
      return {
        totalPlans: 0,
        draftPlans: 0,
        submittedPlans: 0,
        approvedPlans: 0,
        rejectedPlans: 0,
        totalBudget: 0,
        fundedBudget: 0,
        fundingGap: 0,
        orgStats: {},
        monthlyTrends: {}
      };
    }

    const stats = {
      totalPlans: allPlansData.length,
      draftPlans: 0,
      submittedPlans: 0,
      approvedPlans: 0,
      rejectedPlans: 0,
      eligiblePlansForBudget: 0,
      totalBudget: 0,
      fundedBudget: 0,
      fundingGap: 0,
      orgStats: {} as Record<string, any>,
      monthlyTrends: {} as Record<string, number>
    };

    // Organization-wise statistics
    const orgBudgetMap: Record<string, { total: number, funded: number, gap: number, planCount: number, eligibleCount: number }> = {};

    allPlansData.forEach(plan => {
      // Count by status
      switch (plan.status) {
        case 'DRAFT': stats.draftPlans++; break;
        case 'SUBMITTED': stats.submittedPlans++; break;
        case 'APPROVED': stats.approvedPlans++; break;
        case 'REJECTED': stats.rejectedPlans++; break;
      }

      // Monthly submission trends
      if (plan.submitted_at) {
        const month = format(new Date(plan.submitted_at), 'MMM yyyy');
        stats.monthlyTrends[month] = (stats.monthlyTrends[month] || 0) + 1;
      }

      // Organization statistics
      const orgName = plan.organizationName || 
        organizationsMap[plan.organization] || 
        `Organization ${plan.organization}`;

      if (!orgBudgetMap[orgName]) {
        orgBudgetMap[orgName] = { total: 0, funded: 0, gap: 0, planCount: 0, eligibleCount: 0 };
      }
      
      orgBudgetMap[orgName].planCount++;

      // Only include budget data for SUBMITTED or APPROVED plans
      if (plan.status === 'SUBMITTED' || plan.status === 'APPROVED') {
        stats.eligiblePlansForBudget++;
        orgBudgetMap[orgName].eligibleCount++;
        
        // Use the calculated budget data from fetchCompleteBudgetData
        const planTotalBudget = Number(plan.budget_total || 0);
        const planFundedBudget = Number(plan.funded_total || 0);
        const planFundingGap = Number(plan.funding_gap || 0);

        stats.totalBudget += planTotalBudget;
        stats.fundedBudget += planFundedBudget;
        stats.fundingGap += planFundingGap;

        orgBudgetMap[orgName].total += planTotalBudget;
        orgBudgetMap[orgName].funded += planFundedBudget;
        orgBudgetMap[orgName].gap += planFundingGap;
      }
    });

    stats.orgStats = orgBudgetMap;
    return stats;
  };

  const stats = calculateStats();

  // Prepare chart data
  const statusChartData = {
    labels: ['Draft', 'Submitted', 'Approved', 'Rejected'],
    datasets: [{
      data: [stats.draftPlans, stats.submittedPlans, stats.approvedPlans, stats.rejectedPlans],
      backgroundColor: [
        'rgba(156, 163, 175, 0.6)',
        'rgba(251, 191, 36, 0.6)',
        'rgba(52, 211, 153, 0.6)',
        'rgba(239, 68, 68, 0.6)'
      ],
      borderColor: [
        'rgba(156, 163, 175, 1)',
        'rgba(251, 191, 36, 1)',
        'rgba(52, 211, 153, 1)',
        'rgba(239, 68, 68, 1)'
      ],
      borderWidth: 1
    }]
  };

  // Fix chart data to handle empty organizations
  const orgBudgetChartData = {
    labels: Object.keys(stats.orgStats).filter(orgName => 
      stats.orgStats[orgName].total > 0 || stats.orgStats[orgName].funded > 0
    ),
    datasets: [
      {
        label: 'Total Budget Required',
        data: Object.keys(stats.orgStats)
          .filter(orgName => stats.orgStats[orgName].total > 0 || stats.orgStats[orgName].funded > 0)
          .map(orgName => stats.orgStats[orgName].total),
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      },
      {
        label: 'Available Funding',
        data: Object.keys(stats.orgStats)
          .filter(orgName => stats.orgStats[orgName].total > 0 || stats.orgStats[orgName].funded > 0)
          .map(orgName => stats.orgStats[orgName].funded),
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1
      },
      {
        label: 'Funding Gap',
        data: Object.keys(stats.orgStats)
          .filter(orgName => stats.orgStats[orgName].total > 0 || stats.orgStats[orgName].funded > 0)
          .map(orgName => stats.orgStats[orgName].gap),
        backgroundColor: 'rgba(255, 99, 132, 0.6)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 1
       }
    ]
  };

  // Helper function to safely format dates
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not available';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return 'Invalid date';
    }
  };

  const getOrganizationName = (plan: any) => {
    return plan.organizationName || 
           plan.organization_name || 
           organizationsMap[plan.organization] || 
           'Unknown Organization';
  };

  if (isLoadingPlans) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin mr-2 text-green-600 mx-auto mb-4" />
          <span className="text-lg">Loading admin analytics...</span>
          <p className="text-sm text-gray-500 mt-2">This may take up to 2 minutes in production</p>
          {isLoadingBudgets && (
            <p className="text-sm text-gray-500 mt-1">Calculating budget data...</p>
          )}
          <div className="mt-4 w-64 bg-gray-200 rounded-full h-2 mx-auto">
            <div className="bg-green-600 h-2 rounded-full animate-pulse" style={{ width: '45%' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600">Comprehensive analytics and overview of all plans across all organizations</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
          <AlertCircle className="h-5 w-5 mr-2" />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center text-green-700">
          <CheckCircle className="h-5 w-5 mr-2" />
          {success}
        </div>
      )}

      {/* Production Error Handling */}
      {plansError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center text-red-700">
            <AlertCircle className="h-5 w-5 mr-2" />
            <div>
              <h3 className="font-medium">Failed to load plans data</h3>
              <p className="text-sm mt-1">
                {plansError instanceof Error 
                  ? `${plansError.message}${plansError.code === 'ECONNABORTED' ? ' (Connection timeout - server may be slow)' : ''}`
                  : 'Network timeout occurred - please check your connection'}
              </p>
              <p className="text-xs text-red-600 mt-1">
                Try refreshing the page or contact support if this persists
              </p>
              <button
                onClick={() => refetchPlans()}
                disabled={isLoadingPlans}
                className="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200 disabled:opacity-50 inline-flex items-center"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingPlans ? 'animate-spin' : ''}`} />
                {isLoadingPlans ? 'Retrying...' : 'Retry Loading Plans'}
              </button>
            </div>
          </div>
        </div>
      )}

      {budgetError && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center text-amber-700">
            <AlertCircle className="h-5 w-5 mr-2" />
            <div>
              <h3 className="font-medium">Budget Calculation Issue</h3>
              <p className="text-sm mt-1">{budgetError}</p>
              <p className="text-xs text-amber-600 mt-1">
                Plan data is available but budget calculations may be incomplete
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Total Plans</h3>
            <LayoutGrid className="h-5 w-5 text-blue-500" />
          </div>
          <p className="text-3xl font-semibold text-blue-600">{stats.totalPlans}</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Submitted</h3>
            <Calendar className="h-5 w-5 text-amber-500" />
          </div>
          <p className="text-3xl font-semibold text-amber-600">{stats.submittedPlans}</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Approved</h3>
            <CheckCircle className="h-5 w-5 text-green-500" />
          </div>
          <p className="text-3xl font-semibold text-green-600">{stats.approvedPlans}</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Rejected</h3>
            <XCircle className="h-5 w-5 text-red-500" />
          </div>
          <p className="text-3xl font-semibold text-red-600">{stats.rejectedPlans}</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Total Budget</h3>
            <DollarSign className="h-5 w-5 text-green-500" />
          </div>
          <p className="text-3xl font-semibold text-green-600">
            ${stats.totalBudget.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {isLoadingBudgets ? 'Calculating...' : 'Total across all plans'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Funding Gap</h3>
            <TrendingUp className="h-5 w-5 text-red-500" />
          </div>
          <p className="text-3xl font-semibold text-red-600">
            ${stats.fundingGap.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {isLoadingBudgets ? 'Calculating...' : 'Unfunded amount'}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex -mb-px">
          <button
            onClick={() => setActiveTab('overview')}
            className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'overview'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Overview
            </div>
          </button>
          <button
            onClick={() => setActiveTab('budget-analysis')}
            className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'budget-analysis'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center">
              <DollarSign className="h-5 w-5 mr-2" />
              Budget Analysis
            </div>
          </button>
          <button
            onClick={() => setActiveTab('organizations')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'organizations'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center">
              <Building2 className="h-5 w-5 mr-2" />
              Organizations
            </div>
          </button>
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Plan Status Distribution */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Plan Status Distribution</h3>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="flex items-center px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md disabled:opacity-50"
                >
                  {(isRefreshing || isLoadingBudgets) ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  {isLoadingBudgets ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              <div className="h-64">
                <Doughnut 
                  data={statusChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom',
                      },
                      tooltip: {
                        callbacks: {
                          label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                            const percentage = Math.round((value as number / total) * 100);
                            return `${label}: ${value} (${percentage}%)`;
                          }
                        }
                      }
                    },
                  }}
                />
              </div>
            </div>

            {/* Key Metrics */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Key Metrics</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                  <span className="text-sm font-medium text-blue-700">Approval Rate</span>
                  <span className="text-lg font-semibold text-blue-600">
                    {stats.totalPlans > 0 ? Math.round((stats.approvedPlans / stats.totalPlans) * 100) : 0}%
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                  <span className="text-sm font-medium text-green-700">Funding Rate</span>
                  <span className="text-lg font-semibold text-green-600">
                    {stats.totalBudget > 0 ? Math.round((stats.fundedBudget / stats.totalBudget) * 100) : 0}%
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-amber-50 rounded-lg">
                  <span className="text-sm font-medium text-amber-700">Organizations with Plans</span>
                  <span className="text-lg font-semibold text-amber-600">
                    {Object.keys(stats.orgStats).length}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                  <span className="text-sm font-medium text-purple-700">Average Budget per Plan</span>
                  <span className="text-lg font-semibold text-purple-600">
                    ${stats.eligiblePlansForBudget > 0 && stats.totalBudget > 0 ? 
                      Math.round(stats.totalBudget / stats.eligiblePlansForBudget).toLocaleString() : '0'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* All Plans Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 sm:p-6">
              <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">All Plans Overview</h3>

              {plansError ? (
                <div className="text-center py-12 bg-red-50 rounded-lg border-2 border-dashed border-red-200">
                  <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-red-800 mb-1">Failed to load plans</h3>
                  <p className="text-red-600">Network timeout or server error occurred.</p>
                  <button
                    onClick={() => refetchPlans()}
                    disabled={isLoadingPlans}
                    className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                  >
                    {isLoadingPlans ? 'Retrying...' : 'Retry Loading Plans'}
                  </button>
                </div>
              ) : (!allPlansData || allPlansData.length === 0) ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                  <LayoutGrid className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No plans found</h3>
                  <p className="text-gray-500">No plans have been created yet across all organizations.</p>
                  {!isLoadingBudgets && (
                    <button
                      onClick={() => refetchPlans()}
                      className="mt-4 px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      Check Again
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-hidden overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Organization
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Planner
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Plan Type
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Period
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Submitted
                        </th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {allPlansData.map((plan: any) => (
                        <tr key={plan.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                              <span className="text-sm font-medium text-gray-900">{getOrganizationName(plan)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {plan.planner_name || 'Unknown'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {plan.type || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {plan.from_date && plan.to_date ? 
                              `${formatDate(plan.from_date)} - ${formatDate(plan.to_date)}` :
                              'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              plan.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                              plan.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
                              plan.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {plan.status || 'DRAFT'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(plan.submitted_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => navigate(`/plans/${plan.id}`)}
                              className="text-blue-600 hover:text-blue-900 flex items-center"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Budget Analysis Tab */}
      {activeTab === 'budget-analysis' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">Budget Analysis by Organization</h3>

            {plansError ? (
              <div className="h-80 flex items-center justify-center">
                <div className="text-center">
                  <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
                  <p className="text-red-600">Unable to load budget data due to network issues</p>
                  <button
                    onClick={() => refetchPlans()}
                    disabled={isLoadingPlans}
                    className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                  >
                    {isLoadingPlans ? 'Retrying...' : 'Retry'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-80">
                {Object.keys(stats.orgStats).length > 0 && !isLoadingBudgets ? (
                <Bar 
                  data={orgBudgetChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      x: {
                        title: {
                          display: true,
                          text: 'Organizations'
                        }
                      },
                      y: {
                        title: {
                          display: true,
                          text: 'Amount ($)'
                        },
                        ticks: {
                          callback: function(value) {
                            return '$' + (value as number).toLocaleString();
                          }
                        }
                      }
                    },
                    plugins: {
                      legend: {
                        position: 'top',
                      },
                      tooltip: {
                        callbacks: {
                          label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                              label += ': ';
                            }
                            if (context.parsed.y !== null) {
                              label += '$' + context.parsed.y.toLocaleString();
                            }
                            return label;
                          }
                        }
                      }
                    }
                  }}
                />
                ) : isLoadingBudgets ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
                    <p className="text-gray-500">Loading budget analysis...</p>
                    <p className="text-xs text-gray-400 mt-1">Processing {stats.eligiblePlansForBudget} eligible plans</p>
                  </div>
                </div>
                ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-gray-500">No budget data available</p>
                  <button
                    onClick={() => refetchPlans()}
                    className="ml-4 px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
                  >
                    Reload Data
                  </button>
                </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Organizations Tab */}
      {activeTab === 'organizations' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-6">Organization Performance</h3>

          {plansError ? (
            <div className="text-center py-8">
              <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
              <p className="text-red-600">Unable to load organization data due to network issues</p>
              <button
                onClick={() => refetchPlans()}
                disabled={isLoadingPlans}
                className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
              >
                {isLoadingPlans ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          ) : isLoadingBudgets ? (
            <div className="text-center py-8">
              <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-500">Loading organization budget data...</p>
              <p className="text-xs text-gray-400 mt-1">Processing budget calculations...</p>
            </div>
          ) : Object.keys(stats.orgStats).length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-500">No organization data available</p>
              <button
                onClick={() => refetchPlans()}
                className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Reload Organization Data
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(stats.orgStats).map(([orgName, orgData]: [string, any]) => (
              <div key={orgName} className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">{orgName}</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Plans:</span>
                    <span className="text-sm font-medium">
                      {orgData.planCount} ({orgData.eligibleCount} eligible)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Budget:</span>
                    <span className="text-sm font-medium">
                      ${orgData.total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Funded:</span>
                    <span className="text-sm font-medium text-green-600">
                      ${orgData.funded.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Gap:</span>
                    <span className="text-sm font-medium text-red-600">
                      ${orgData.gap.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-300">
                    <span className="text-sm text-gray-600">Funding Rate:</span>
                    <span className="text-sm font-medium text-blue-600">
                      {orgData.total > 0 ? Math.round((orgData.funded / orgData.total) * 100) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;