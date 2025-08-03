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
  const [dashboardBudgetData, setDashboardBudgetData] = useState<any>({
    totalBudget: 0,
    totalFunded: 0,
    totalGap: 0,
    orgBudgets: {}
  });
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(false);
  const [budgetData, setBudgetData] = useState<any>({
    totalBudget: 0,
    totalFunded: 0,
    totalGap: 0,
    totalGovernment: 0,
    totalSDG: 0,
    totalPartners: 0,
    totalOther: 0,
    orgBudgets: {}
  });
  const [budgetStats, setBudgetStats] = useState({
    totalBudget: 0,
    fundedBudget: 0,
    fundingGap: 0,
    fundingRate: 0,
    orgBudgets: {} as Record<string, any>
  });

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

  // Fetch organizations first (simple, fast call)
  const { data: organizationsData } = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: async () => {
      try {
        console.log('[AdminDashboard] Fetching organizations...');
        const response = await organizations.getAll();
        
        // Create organization map
        const orgMap: Record<string, string> = {};
        if (response && Array.isArray(response)) {
          response.forEach((org: any) => {
            if (org && org.id) {
              orgMap[org.id] = org.name;
            }
          });
        }
        setOrganizationsMap(orgMap);
        console.log('[AdminDashboard] Organizations loaded:', Object.keys(orgMap).length);
        
        return response;
      } catch (error) {
        console.error('[AdminDashboard] Error fetching organizations:', error);
        return [];
      }
    },
    staleTime: 60000, // 1 minute
    cacheTime: 300000 // 5 minutes
  });

  // Fetch budget data for all organizations
  const fetchBudgetData = async () => {
    if (!allPlansData || isLoadingBudgets) return;
    
    setIsLoadingBudgets(true);
    console.log('[AdminDashboard] Starting budget calculation for all organizations...');
    
    try {
      // Filter to only submitted and approved plans
      const eligiblePlans = allPlansData.filter(plan => 
        plan.status === 'SUBMITTED' || plan.status === 'APPROVED'
      );
      
      console.log(`[AdminDashboard] Calculating budgets for ${eligiblePlans.length} eligible plans`);
      
      let totalBudget = 0;
      let totalFunded = 0;
      let totalGovernment = 0;
      let totalSDG = 0;
      let totalPartners = 0;
      let totalOther = 0;
      
      const orgBudgets: Record<string, { 
        total: number; 
        funded: number; 
        gap: number; 
        government: number;
        sdg: number;
        partners: number;
        other: number;
        planCount: number;
      }> = {};
      
      // Process plans in small batches
      const batchSize = 3;
      for (let i = 0; i < eligiblePlans.length; i += batchSize) {
        const batch = eligiblePlans.slice(i, i + batchSize);
        console.log(`[AdminDashboard] Processing budget batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(eligiblePlans.length/batchSize)}`);
        
        await Promise.all(batch.map(async (plan) => {
          try {
            const orgName = plan.organization_name || `Organization ${plan.organization}`;
            
            // Initialize org budget if not exists
            if (!orgBudgets[orgName]) {
              orgBudgets[orgName] = { 
                total: 0, 
                funded: 0, 
                gap: 0,
                government: 0,
                sdg: 0,
                partners: 0,
                other: 0,
                planCount: 0 
              };
            }
            orgBudgets[orgName].planCount++;
            
            // Fetch main activities with budgets for this plan's organization
            try {
              const activitiesResponse = await Promise.race([
                api.get(`/main-activities/`, {
                  params: { organization: plan.organization },
                  timeout: 15000,
                  headers: { 'Accept': 'application/json' }
                }),
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Activities timeout')), 20000)
                )
              ]);
              
              const activities = activitiesResponse?.data?.results || activitiesResponse?.data || [];
              
              // Calculate budget from activities
              let planBudget = 0;
              let planGovernment = 0;
              let planSDG = 0;
              let planPartners = 0;
              let planOther = 0;
              
              for (const activity of activities) {
                if (activity.budget) {
                  const budget = activity.budget;
                  
                  // Get estimated cost based on calculation type
                  const estimatedCost = budget.budget_calculation_type === 'WITH_TOOL' 
                    ? Number(budget.estimated_cost_with_tool || 0)
                    : Number(budget.estimated_cost_without_tool || 0);
                  
                  planBudget += estimatedCost;
                  planGovernment += Number(budget.government_treasury || 0);
                  planSDG += Number(budget.sdg_funding || 0);
                  planPartners += Number(budget.partners_funding || 0);
                  planOther += Number(budget.other_funding || 0);
                }
              }
              
              const planFunded = planGovernment + planSDG + planPartners + planOther;
              const planGap = Math.max(0, planBudget - planFunded);
              
              // Add to totals
              totalBudget += planBudget;
              totalFunded += planFunded;
              totalGovernment += planGovernment;
              totalSDG += planSDG;
              totalPartners += planPartners;
              totalOther += planOther;
              
              // Add to organization totals
              orgBudgets[orgName].total += planBudget;
              orgBudgets[orgName].funded += planFunded;
              orgBudgets[orgName].gap += planGap;
              orgBudgets[orgName].government += planGovernment;
              orgBudgets[orgName].sdg += planSDG;
              orgBudgets[orgName].partners += planPartners;
              orgBudgets[orgName].other += planOther;
              
              console.log(`[AdminDashboard] Plan ${plan.id} budget: $${planBudget}, funded: $${planFunded}, gap: $${planGap}`);
              
            } catch (activityError) {
              console.warn(`[AdminDashboard] Failed to fetch activities for plan ${plan.id}:`, activityError.message);
            }
            
          } catch (planError) {
            console.warn(`[AdminDashboard] Error processing plan ${plan.id}:`, planError.message);
          }
        }));
        
        // Small delay between batches
        if (i + batchSize < eligiblePlans.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      const totalGap = Math.max(0, totalBudget - totalFunded);
      
      setBudgetData({
        totalBudget,
        totalFunded,
        totalGap,
        totalGovernment,
        totalSDG,
        totalPartners,
        totalOther,
        orgBudgets
      });
      
      console.log('[AdminDashboard] Budget calculation completed:', {
        totalBudget,
        totalFunded,
        totalGap,
        organizationsWithBudgets: Object.keys(orgBudgets).length
      });
      
    } catch (error) {
      console.error('[AdminDashboard] Budget calculation failed:', error);
    } finally {
      setIsLoadingBudgets(false);
    }
  };
  
  // Trigger budget calculation when plans data is available
  useEffect(() => {
    if (allPlansData && allPlansData.length > 0 && !isLoadingBudgets) {
      const eligiblePlans = allPlansData.filter(plan => 
        plan.status === 'SUBMITTED' || plan.status === 'APPROVED'
      );
      
      if (eligiblePlans.length > 0) {
        // Start budget calculation in background
        fetchBudgetData();
      }
    }
  }, [allPlansData]);
  // Simplified plans fetch - just get basic plan data first
  const { data: allPlansData, isLoading: isLoadingPlans, refetch: refetchPlans, error: plansError } = useQuery({
    queryKey: ['admin-plans-simple'],
    queryFn: async () => {
      try {
        console.log('[AdminDashboard] Fetching all plans (simplified)...');
        
        // Simple API call with reasonable timeout
        const response = await api.get('/plans/', {
          timeout: 30000,
          headers: { 
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        
        let plans = response.data?.results || response.data || [];
        
        if (!Array.isArray(plans)) {
          console.error('[AdminDashboard] Expected array but got:', typeof plans);
          return [];
        }
        
        console.log(`[AdminDashboard] Fetched ${plans.length} plans successfully`);
        
        // Add organization names to plans
        plans = plans.map(plan => ({
          ...plan,
          organization_name: organizationsMap[plan.organization] || `Organization ${plan.organization}`
        }));
        
        // Trigger budget calculation for submitted/approved plans only
        const eligiblePlans = plans.filter(plan => 
          plan.status === 'SUBMITTED' || plan.status === 'APPROVED'
        );
        
        if (eligiblePlans.length > 0) {
          // Calculate budgets immediately for dashboard display
          calculatePlanBudgets(eligiblePlans);
        }
        
        return plans;
      } catch (error) {
        console.error('[AdminDashboard] Error fetching plans:', {
          message: error.message,
          code: error.code,
          timeout: error.code === 'ECONNABORTED'
        });
        throw error;
      }
    },
    enabled: Object.keys(organizationsMap).length > 0,
    retry: (failureCount, error) => {
      // Only retry on timeout/network errors
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: 3000,
    staleTime: 60000, // 1 minute
    cacheTime: 300000 // 5 minutes
  });

  // Calculate comprehensive statistics - moved after allPlansData definition
  const calculateStats = () => {
    if (!allPlansData || !Array.isArray(allPlansData)) {
      return {
        totalPlans: 0,
        draftPlans: 0,
        submittedPlans: 0,
        approvedPlans: 0,
        rejectedPlans: 0,
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
      orgStats: {} as Record<string, any>,
      monthlyTrends: {} as Record<string, number>
    };

    // Organization-wise statistics
    const orgStatsMap: Record<string, { planCount: number, approved: number, rejected: number, submitted: number, draft: number }> = {};

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

      if (!orgStatsMap[orgName]) {
        orgStatsMap[orgName] = { planCount: 0, approved: 0, rejected: 0, submitted: 0, draft: 0 };
      }
      
      orgStatsMap[orgName].planCount++;
      
      switch (plan.status) {
        case 'DRAFT': orgStatsMap[orgName].draft++; break;
        case 'SUBMITTED': orgStatsMap[orgName].submitted++; break;
        case 'APPROVED': orgStatsMap[orgName].approved++; break;
        case 'REJECTED': orgStatsMap[orgName].rejected++; break;
      }
    });

    stats.orgStats = orgStatsMap;
    return stats;
  };

  const stats = calculateStats();

  // Real budget calculation function that fetches actual budget data
  const calculatePlanBudgets = async (eligiblePlans: any[]) => {
    if (isLoadingBudgets || eligiblePlans.length === 0) return;
    
    setIsLoadingBudgets(true);
    console.log(`[AdminDashboard] Starting budget calculation for ${eligiblePlans.length} eligible plans`);
    
    try {
      let totalBudget = 0;
      let totalFunded = 0;
      const orgBudgets: Record<string, { 
        total: number; 
        funded: number; 
        gap: number; 
        planCount: number;
        government: number;
        sdg: number;
        partners: number;
      }> = {};
      
      // Process plans in small batches to avoid server overload
      const batchSize = 2;
      const batches = [];
      for (let i = 0; i < eligiblePlans.length; i += batchSize) {
        batches.push(eligiblePlans.slice(i, i + batchSize));
      }
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`[AdminDashboard] Processing budget batch ${batchIndex + 1}/${batches.length}`);
        
        // Process each plan in the batch
        await Promise.all(batch.map(async (plan) => {
          try {
            const orgName = plan.organization_name || `Organization ${plan.organization}`;
            
            // Initialize organization budget tracking if not exists
            if (!orgBudgets[orgName]) {
              orgBudgets[orgName] = {
                total: 0, 
                funded: 0, 
                gap: 0, 
                planCount: 0,
                government: 0,
                sdg: 0,
                partners: 0
              };
            }
            orgBudgets[orgName].planCount++;
            
            // Fetch activities for this plan's organization with timeout protection
            try {
              console.log(`[AdminDashboard] Fetching activities for plan ${plan.id} (org: ${orgName})`);
              
              const activitiesResponse = await api.get(`/main-activities/?organization=${plan.organization}`, {
                timeout: 12000,
                headers: { 'Accept': 'application/json' }
              });
              
              const activities = activitiesResponse?.data?.results || activitiesResponse?.data || [];
              console.log(`[AdminDashboard] Found ${activities.length} activities for org ${orgName}`);
              
              let planBudget = 0;
              let planGovernment = 0;
              let planSDG = 0;
              let planPartners = 0;
              let planFunded = 0;
              
              // Process activities to calculate budget
              for (const activity of activities) {
                try {
                  // Get budget for this activity
                  const budgetResponse = await api.get(`/activity-budgets/?activity=${activity.id}`, {
                    timeout: 8000,
                    headers: { 'Accept': 'application/json' }
                  });
                  
                  const budgets = budgetResponse?.data?.results || budgetResponse?.data || [];
                  
                  if (budgets.length > 0) {
                    const budget = budgets[0]; // Get the first (should be only) budget
                    
                    // Calculate required budget (use the calculation type the plan specifies)
                    const requiredBudget = budget.budget_calculation_type === 'WITH_TOOL' 
                      ? Number(budget.estimated_cost_with_tool || 0)
                      : Number(budget.estimated_cost_without_tool || 0);
                    
                    // Get funding amounts
                    const government = Number(budget.government_treasury || 0);
                    const sdg = Number(budget.sdg_funding || 0);
                    const partners = Number(budget.partners_funding || 0);
                    const other = Number(budget.other_funding || 0);
                    const totalActivityFunding = government + sdg + partners + other;
                    
                    // Add to plan totals
                    planBudget += requiredBudget;
                    planGovernment += government;
                    planSDG += sdg;
                    planPartners += partners;
                    planFunded += totalActivityFunding;
                    
                    console.log(`[AdminDashboard] Activity ${activity.id}: Budget=${requiredBudget}, Funded=${totalActivityFunding}`);
                  }
                } catch (budgetError) {
                  console.warn(`[AdminDashboard] Budget fetch failed for activity ${activity.id}:`, budgetError.message);
                  // Continue with other activities
                }
              }
              
              // Add plan totals to organization and grand totals
              totalBudget += planBudget;
              totalFunded += planFunded;
              orgBudgets[orgName].total += planBudget;
              orgBudgets[orgName].funded += planFunded;
              orgBudgets[orgName].government += planGovernment;
              orgBudgets[orgName].sdg += planSDG;
              orgBudgets[orgName].partners += planPartners;
              orgBudgets[orgName].gap = Math.max(0, orgBudgets[orgName].total - orgBudgets[orgName].funded);
              
              console.log(`[AdminDashboard] Plan ${plan.id} totals: Budget=${planBudget}, Funded=${planFunded}`);
              
            } catch (activitiesError) {
              console.warn(`[AdminDashboard] Activities fetch failed for plan ${plan.id}:`, activitiesError.message);
              // Continue with other plans
            }
            
          } catch (planError) {
            console.warn(`[AdminDashboard] Error processing plan ${plan.id}:`, planError.message);
          }
        }));
        
        // Small delay between batches to prevent server overload
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
      
      const totalGap = Math.max(0, totalBudget - totalFunded);
      
      // Update state with calculated budget data
      setBudgetData({
        totalBudget,
        totalFunded,
        totalGap,
        orgBudgets
      });
      
      console.log('[AdminDashboard] Budget calculation completed:', {
        totalBudget,
        totalFunded,
        totalGap,
        organizationsCount: Object.keys(orgBudgets).length
      });
      
    } catch (error) {
      console.error('[AdminDashboard] Budget calculation error:', error);
      // Set default values on error
      setBudgetData({
        totalBudget: 0,
        totalFunded: 0,
        totalGap: 0,
        orgBudgets: {}
      });
    } finally {
      setIsLoadingBudgets(false);
    }
  };

  // Enhanced refresh function that also refreshes budget data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      console.log('[AdminDashboard] Manual refresh initiated');
      await refetchPlans();
      
      // Also refresh budget data if we have plans
      if (allPlansData && allPlansData.length > 0) {
        const eligiblePlans = allPlansData.filter(plan => 
          plan.status === 'SUBMITTED' || plan.status === 'APPROVED'
        );
        if (eligiblePlans.length > 0) {
          calculatePlanBudgets(eligiblePlans);
        }
      }
      
      setSuccess('Data refreshed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('[AdminDashboard] Manual refresh failed:', err);
      setError(`Failed to refresh data: ${err.message || 'Please check your connection'}`);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsRefreshing(false);
    }
  };

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

  // Organization plan count chart
  const orgPlanChartData = {
    labels: Object.keys(stats.orgStats).slice(0, 10), // Top 10 organizations
    datasets: [
      {
        label: 'Total Plans',
        data: Object.keys(stats.orgStats).slice(0, 10).map(orgName => stats.orgStats[orgName].planCount),
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      },
      {
        label: 'Approved Plans',
        data: Object.keys(stats.orgStats).slice(0, 10).map(orgName => stats.orgStats[orgName].approvedCount),
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
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
    return plan.organization_name || 
           organizationsMap[plan.organization] || 
           'Unknown Organization';
  };

  if (isLoadingPlans) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin mr-2 text-green-600 mx-auto mb-4" />
          <span className="text-lg">Loading admin dashboard...</span>
          <p className="text-sm text-gray-500 mt-2">Fetching plans from all organizations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600">Comprehensive overview of all plans across all organizations</p>
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
              <button
                onClick={handleRefresh}
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

      {/* Summary Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Total Plans</h3>
            <LayoutGrid className="h-5 w-5 text-blue-500" />
          </div>
          <p className="text-3xl font-semibold text-blue-600">{stats.totalPlans}</p>
          <p className="text-xs text-gray-500 mt-1">Across all organizations</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Submitted</h3>
            <Calendar className="h-5 w-5 text-amber-500" />
          </div>
          <p className="text-3xl font-semibold text-amber-600">{stats.submittedPlans}</p>
          <p className="text-xs text-gray-500 mt-1">Pending review</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Total Budget</h3>
            <DollarSign className="h-5 w-5 text-green-500" />
          </div>
          <p className="text-3xl font-semibold text-green-600">
            {isLoadingBudgets ? (
              <Loader className="h-6 w-6 animate-spin" />
            ) : (
              `$${(budgetData.totalBudget / 1000000).toFixed(1)}M`
            )}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {isLoadingBudgets ? 'Calculating...' : 'From submitted/approved plans'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Funding Gap</h3>
            <AlertCircle className="h-5 w-5 text-red-500" />
          </div>
          <p className="text-3xl font-semibold text-red-600">
            {isLoadingBudgets ? (
              <Loader className="h-6 w-6 animate-spin" />
            ) : (
              `$${(budgetData.totalGap / 1000000).toFixed(1)}M`
            )}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {isLoadingBudgets ? 'Calculating...' : 'Budget shortfall'}
          </p>
        </div>
      </div>

      {/* Additional Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Approved</h3>
            <CheckCircle className="h-5 w-5 text-green-500" />
          </div>
          <p className="text-3xl font-semibold text-green-600">{stats.approvedPlans}</p>
          <p className="text-xs text-gray-500 mt-1">Successfully approved</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Organizations</h3>
            <Building2 className="h-5 w-5 text-purple-500" />
          </div>
          <p className="text-3xl font-semibold text-purple-600">{Object.keys(stats.orgStats).length}</p>
          <p className="text-xs text-gray-500 mt-1">With plans created</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Funded Amount</h3>
            <DollarSign className="h-5 w-5 text-blue-500" />
          </div>
          <p className="text-3xl font-semibold text-blue-600">
            {isLoadingBudgets ? (
              <Loader className="h-6 w-6 animate-spin" />
            ) : (
              `$${(budgetData.totalFunded / 1000000).toFixed(1)}M`
            )}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {isLoadingBudgets ? 'Calculating...' : 'Total secured funding'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Funding Rate</h3>
            <TrendingUp className="h-5 w-5 text-indigo-500" />
          </div>
          <p className="text-3xl font-semibold text-indigo-600">
            {isLoadingBudgets ? (
              <Loader className="h-6 w-6 animate-spin" />
            ) : (
              `${budgetData.totalBudget > 0 ? Math.round((budgetData.totalFunded / budgetData.totalBudget) * 100) : 0}%`
            )}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {isLoadingBudgets ? 'Calculating...' : 'Budget coverage'}
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
              Plan Analysis
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
                  {isRefreshing ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Refresh
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
                            const percentage = total > 0 ? Math.round((value as number / total) * 100) : 0;
                            return `${label}: ${value} (${percentage}%)`;
                          }
                        }
                      }
                    }
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
                  <span className="text-sm font-medium text-green-700">Submission Rate</span>
                  <span className="text-lg font-semibold text-green-600">
                    {stats.totalPlans > 0 ? Math.round(((stats.submittedPlans + stats.approvedPlans) / stats.totalPlans) * 100) : 0}%
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-amber-50 rounded-lg">
                  <span className="text-sm font-medium text-amber-700">Active Organizations</span>
                  <span className="text-lg font-semibold text-amber-600">
                    {Object.keys(stats.orgStats).length}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                  <span className="text-sm font-medium text-purple-700">Avg Plans per Org</span>
                  <span className="text-lg font-semibold text-purple-600">
                    {Object.keys(stats.orgStats).length > 0 ? 
                      Math.round(stats.totalPlans / Object.keys(stats.orgStats).length) : 0}
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
                    onClick={handleRefresh}
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
                  <button
                    onClick={handleRefresh}
                    className="mt-4 px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    Check Again
                  </button>
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

      {/* Plan Analysis Tab */}
      {activeTab === 'budget-analysis' && (
        <div className="space-y-6">
          {/* Budget Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-gray-500">Government Funding</h3>
                <DollarSign className="h-5 w-5 text-blue-500" />
              </div>
              <p className="text-2xl font-semibold text-blue-600">
                {isLoadingBudgets ? (
                  <Loader className="h-5 w-5 animate-spin" />
                ) : (
                  `$${(budgetData.totalGovernment / 1000000).toFixed(1)}M`
                )}
              </p>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-gray-500">SDG Funding</h3>
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <p className="text-2xl font-semibold text-green-600">
                {isLoadingBudgets ? (
                  <Loader className="h-5 w-5 animate-spin" />
                ) : (
                  `$${(budgetData.totalSDG / 1000000).toFixed(1)}M`
                )}
              </p>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-gray-500">Partners Funding</h3>
                <DollarSign className="h-5 w-5 text-purple-500" />
              </div>
              <p className="text-2xl font-semibold text-purple-600">
                {isLoadingBudgets ? (
                  <Loader className="h-5 w-5 animate-spin" />
                ) : (
                  `$${(budgetData.totalPartners / 1000000).toFixed(1)}M`
                )}
              </p>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-gray-500">Other Funding</h3>
                <DollarSign className="h-5 w-5 text-orange-500" />
              </div>
              <p className="text-2xl font-semibold text-orange-600">
                {isLoadingBudgets ? (
                  <Loader className="h-5 w-5 animate-spin" />
                ) : (
                  `$${(budgetData.totalOther / 1000000).toFixed(1)}M`
                )}
              </p>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">Plan Distribution by Organization</h3>

            {plansError ? (
              <div className="h-80 flex items-center justify-center">
                <div className="text-center">
                  <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
                  <p className="text-red-600">Unable to load plan data due to network issues</p>
                  <button
                    onClick={handleRefresh}
                    disabled={isLoadingPlans}
                    className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                  >
                    {isLoadingPlans ? 'Retrying...' : 'Retry'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-80">
                {Object.keys(stats.orgStats).length > 0 ? (
                <Bar 
                  data={orgPlanChartData}
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
                          text: 'Number of Plans'
                        },
                        ticks: {
                          stepSize: 1
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
                              label += context.parsed.y + ' plans';
                            }
                            return label;
                          }
                        }
                      }
                    }
                  }}
                />
                ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-gray-500">No plan data available</p>
                  <button
                    onClick={handleRefresh}
                    className="ml-4 px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
                  >
                    Reload Data
                  </button>
                </div>
                )}
              </div>
            )}
          </div>
          
          {/* Organization Budget Analysis Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Organization Budget Analysis</h3>
            
            {isLoadingBudgets ? (
              <div className="text-center py-8">
                <Loader className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Calculating organization budgets...</p>
              </div>
            ) : Object.keys(budgetData.orgBudgets).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organization</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plans</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Budget</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Funded</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gap</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Funding Rate</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(budgetData.orgBudgets).map(([orgName, orgData]) => (
                      <tr key={orgName} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{orgName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{orgData.planCount}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${(orgData.total / 1000000).toFixed(1)}M</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">${(orgData.funded / 1000000).toFixed(1)}M</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">${(orgData.gap / 1000000).toFixed(1)}M</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
                          {orgData.total > 0 ? Math.round((orgData.funded / orgData.total) * 100) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <p className="text-gray-500">No budget data available yet</p>
                <button
                  onClick={fetchBudgetData}
                  className="mt-2 px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  Calculate Budgets
                </button>
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
                onClick={handleRefresh}
                disabled={isLoadingPlans}
                className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
              >
                {isLoadingPlans ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          ) : Object.keys(stats.orgStats).length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-500">No organization data available</p>
              <button
                onClick={handleRefresh}
                className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Reload Organization Data
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(stats.orgStats).map(([orgName, orgData]: [string, any]) => {
              const orgBudgetData = budgetData.orgBudgets[orgName] || { 
                total: 0, 
                funded: 0, 
                gap: 0, 
                government: 0,
                sdg: 0,
                partners: 0,
                other: 0,
                planCount: 0 
              };
              
              return (
              <div key={orgName} className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">{orgName}</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Plans:</span>
                    <span className="text-sm font-medium">{orgData.planCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Approved:</span>
                    <span className="text-sm font-medium text-green-600">{orgData.approvedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Submitted:</span>
                    <span className="text-sm font-medium text-yellow-600">{orgData.submittedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Draft:</span>
                    <span className="text-sm font-medium text-gray-600">{orgData.draftCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Rejected:</span>
                    <span className="text-sm font-medium text-red-600">{orgData.rejectedCount}</span>
                  </div>
                  
                  {/* Budget Information */}
                  <div className="pt-2 border-t border-gray-300">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Total Budget:</span>
                      <span className="text-sm font-medium text-blue-600">
                        {isLoadingBudgets ? (
                          <Loader className="h-3 w-3 animate-spin" />
                        ) : (
                          `$${(orgBudgetData.total / 1000000).toFixed(1)}M`
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Funded:</span>
                      <span className="text-sm font-medium text-green-600">
                        {isLoadingBudgets ? (
                          <Loader className="h-3 w-3 animate-spin" />
                        ) : (
                          `$${(orgBudgetData.funded / 1000000).toFixed(1)}M`
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Funding Gap:</span>
                      <span className="text-sm font-medium text-red-600">
                        {isLoadingBudgets ? (
                          <Loader className="h-3 w-3 animate-spin" />
                        ) : (
                          `$${(orgBudgetData.gap / 1000000).toFixed(1)}M`
                        )}
                      </span>
                    </div>
                  </div>
                  
                  {/* Funding Sources Breakdown */}
                  <div className="pt-2 border-t border-gray-300">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Government:</span>
                      <span className="text-sm font-medium text-blue-600">
                        {isLoadingBudgets ? (
                          <Loader className="h-3 w-3 animate-spin" />
                        ) : (
                          `$${(orgBudgetData.government / 1000000).toFixed(1)}M`
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">SDG:</span>
                      <span className="text-sm font-medium text-green-600">
                        {isLoadingBudgets ? (
                          <Loader className="h-3 w-3 animate-spin" />
                        ) : (
                          `$${(orgBudgetData.sdg / 1000000).toFixed(1)}M`
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Partners:</span>
                      <span className="text-sm font-medium text-purple-600">
                        {isLoadingBudgets ? (
                          <Loader className="h-3 w-3 animate-spin" />
                        ) : (
                          `$${(orgBudgetData.partners / 1000000).toFixed(1)}M`
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Other:</span>
                      <span className="text-sm font-medium text-orange-600">
                        {isLoadingBudgets ? (
                          <Loader className="h-3 w-3 animate-spin" />
                        ) : (
                          `$${(orgBudgetData.other / 1000000).toFixed(1)}M`
                        )}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex justify-between pt-2 border-t border-gray-300">
                    <span className="text-sm text-gray-600">Success Rate:</span>
                    <span className="text-sm font-medium text-blue-600">
                      {orgData.planCount > 0 ? Math.round((orgData.approvedCount / orgData.planCount) * 100) : 0}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Funding Rate:</span>
                    <span className="text-sm font-medium text-purple-600">
                      {isLoadingBudgets ? '...' : 
                        orgBudgetData.total > 0 ? 
                          `${Math.round((orgBudgetData.funded / orgBudgetData.total) * 100)}%` : 
                          '0%'
                      }
                    </span>
                  </div>
                </div>
              </div>
              );
            })}
            </div>
          )}
          
          {isLoadingBudgets && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-center">
              <Loader className="h-5 w-5 animate-spin mx-auto mb-2" />
              <p className="text-sm text-blue-700">Calculating budget data in background...</p>
              <p className="text-xs text-blue-600">This won't affect other dashboard functions</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;