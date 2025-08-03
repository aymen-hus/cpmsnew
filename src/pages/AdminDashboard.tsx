import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Users, CheckCircle, XCircle, AlertCircle, Loader, RefreshCw, DollarSign, TrendingUp, Building2, FileText, Eye } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { plans, organizations, auth, api } from '../lib/api';
import { format } from 'date-fns';
import { isAdmin } from '../types/user';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

// Chart defaults
ChartJS.defaults.color = '#4b5563';
ChartJS.defaults.font.family = 'Inter, sans-serif';

// Define budget data interface
interface BudgetTotals {
  totalBudget: number;
  totalFunded: number;
  totalGap: number;
  fundingRate: number;
}

interface OrganizationBudgetData {
  totalBudget: number;
  government: number;
  sdg: number;
  partners: number;
  other: number;
  totalFunded: number;
  gap: number;
  fundingRate: number;
}

const AdminDashboard: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // State management
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'organizations'>('overview');
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(false);
  const [budgetCalculations, setBudgetCalculations] = useState<BudgetTotals>({
    totalBudget: 0,
    totalFunded: 0,
    totalGap: 0,
    fundingRate: 0
  });
  const [organizationBudgets, setOrganizationBudgets] = useState<Record<string, OrganizationBudgetData>>({});

  // Check admin permissions
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

  // Fetch organizations
  const { data: organizationsData, isLoading: isLoadingOrgs } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      console.log('[AdminDashboard] Fetching organizations...');
      const response = await organizations.getAll();
      const orgsData = response || [];
      
      // Create organizations map
      const orgMap: Record<string, string> = {};
      if (Array.isArray(orgsData)) {
        orgsData.forEach((org: any) => {
          if (org && org.id) {
            orgMap[org.id] = org.name;
          }
        });
      }
      setOrganizationsMap(orgMap);
      console.log(`[AdminDashboard] Loaded ${orgsData.length} organizations`);
      
      return orgsData;
    },
    staleTime: 300000, // 5 minutes
    cacheTime: 600000  // 10 minutes
  });

  // Fetch all plans with optimized query
  const { data: allPlansData, isLoading: isLoadingPlans, refetch: refetchPlans, error: plansError } = useQuery({
    queryKey: ['admin-plans', 'all'],
    queryFn: async () => {
      try {
        console.log('[AdminDashboard] Fetching all plans...');
        
        const response = await api.get('/plans/', {
          timeout: 30000,
          headers: { 
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Accept': 'application/json'
          }
        });
        
        const plans = response.data?.results || response.data || [];
        console.log(`[AdminDashboard] Fetched ${plans.length} plans`);
        
        // Map organization names to plans
        if (Array.isArray(plans)) {
          plans.forEach((plan: any) => {
            if (plan.organization && organizationsMap[plan.organization]) {
              plan.organizationName = organizationsMap[plan.organization];
            }
          });
        }
        
        return plans;
      } catch (error) {
        console.error('[AdminDashboard] Error fetching plans:', error);
        throw error;
      }
    },
    enabled: Object.keys(organizationsMap).length > 0,
    retry: 2,
    retryDelay: 3000,
    staleTime: 60000, // 1 minute
    cacheTime: 300000 // 5 minutes
  });

  // Background budget calculation
  useEffect(() => {
    const calculateBudgets = async () => {
      if (!allPlansData || !Array.isArray(allPlansData)) return;
      
      setIsLoadingBudgets(true);
      console.log('[AdminDashboard] Starting budget calculations...');
      
      try {
        // Filter to only submitted/approved plans
        const eligiblePlans = allPlansData.filter(plan => 
          plan.status === 'SUBMITTED' || plan.status === 'APPROVED'
        );
        
        console.log(`[AdminDashboard] Processing ${eligiblePlans.length} eligible plans for budget calculation`);
        
        let grandTotalBudget = 0;
        let grandTotalFunded = 0;
        const orgBudgetMap: Record<string, OrganizationBudgetData> = {};
        
        // Process plans in small batches
        const batchSize = 3;
        const batches = [];
        for (let i = 0; i < eligiblePlans.length; i += batchSize) {
          batches.push(eligiblePlans.slice(i, i + batchSize));
        }
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];
          console.log(`[AdminDashboard] Processing batch ${batchIndex + 1}/${batches.length}`);
          
          await Promise.all(batch.map(async (plan) => {
            try {
              // Get activities with budgets for this plan
              const activitiesResponse = await Promise.race([
                api.get(`/main-activities/`, {
                  params: { plan: plan.id },
                  timeout: 15000
                }),
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Activities timeout')), 20000)
                )
              ]);
              
              const activities = activitiesResponse?.data?.results || activitiesResponse?.data || [];
              
              let planTotalBudget = 0;
              let planGovernment = 0;
              let planSdg = 0;
              let planPartners = 0;
              let planOther = 0;
              
              // Calculate budget for activities with budget data
              activities.forEach((activity: any) => {
                if (activity.budget) {
                  const budget = activity.budget;
                  const estimatedCost = budget.budget_calculation_type === 'WITH_TOOL' 
                    ? Number(budget.estimated_cost_with_tool || 0)
                    : Number(budget.estimated_cost_without_tool || 0);
                  
                  planTotalBudget += estimatedCost;
                  planGovernment += Number(budget.government_treasury || 0);
                  planSdg += Number(budget.sdg_funding || 0);
                  planPartners += Number(budget.partners_funding || 0);
                  planOther += Number(budget.other_funding || 0);
                }
              });
              
              const planTotalFunded = planGovernment + planSdg + planPartners + planOther;
              const planGap = Math.max(0, planTotalBudget - planTotalFunded);
              
              // Add to grand totals
              grandTotalBudget += planTotalBudget;
              grandTotalFunded += planTotalFunded;
              
              // Add to organization totals
              const orgName = plan.organizationName || organizationsMap[plan.organization] || `Organization ${plan.organization}`;
              if (!orgBudgetMap[orgName]) {
                orgBudgetMap[orgName] = {
                  totalBudget: 0,
                  government: 0,
                  sdg: 0,
                  partners: 0,
                  other: 0,
                  totalFunded: 0,
                  gap: 0,
                  fundingRate: 0
                };
              }
              
              orgBudgetMap[orgName].totalBudget += planTotalBudget;
              orgBudgetMap[orgName].government += planGovernment;
              orgBudgetMap[orgName].sdg += planSdg;
              orgBudgetMap[orgName].partners += planPartners;
              orgBudgetMap[orgName].other += planOther;
              orgBudgetMap[orgName].totalFunded += planTotalFunded;
              orgBudgetMap[orgName].gap += planGap;
              
              console.log(`[AdminDashboard] Plan ${plan.id} budget: $${planTotalBudget.toLocaleString()}, funded: $${planTotalFunded.toLocaleString()}`);
              
            } catch (error) {
              console.warn(`[AdminDashboard] Error calculating budget for plan ${plan.id}:`, error);
            }
          }));
          
          // Delay between batches
          if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        // Calculate funding rates for organizations
        Object.keys(orgBudgetMap).forEach(orgName => {
          const orgData = orgBudgetMap[orgName];
          orgData.fundingRate = orgData.totalBudget > 0 
            ? (orgData.totalFunded / orgData.totalBudget) * 100 
            : 0;
        });
        
        const grandTotalGap = Math.max(0, grandTotalBudget - grandTotalFunded);
        const grandFundingRate = grandTotalBudget > 0 ? (grandTotalFunded / grandTotalBudget) * 100 : 0;
        
        // Update state
        setBudgetCalculations({
          totalBudget: grandTotalBudget,
          totalFunded: grandTotalFunded,
          totalGap: grandTotalGap,
          fundingRate: grandFundingRate
        });
        
        setOrganizationBudgets(orgBudgetMap);
        
        console.log('[AdminDashboard] Budget calculations completed:', {
          total: grandTotalBudget,
          funded: grandTotalFunded,
          gap: grandTotalGap,
          rate: grandFundingRate,
          organizations: Object.keys(orgBudgetMap).length
        });
        
      } catch (error) {
        console.error('[AdminDashboard] Budget calculation error:', error);
      } finally {
        setIsLoadingBudgets(false);
      }
    };
    
    if (allPlansData && allPlansData.length > 0) {
      calculateBudgets();
    }
  }, [allPlansData, organizationsMap]);

  // Calculate comprehensive statistics
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
    const orgStatsMap: Record<string, { 
      totalPlans: number; 
      approved: number; 
      rejected: number; 
      submitted: number; 
      draft: number;
      successRate: number;
    }> = {};

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
        orgStatsMap[orgName] = { 
          totalPlans: 0, 
          approved: 0, 
          rejected: 0, 
          submitted: 0, 
          draft: 0,
          successRate: 0
        };
      }
      
      orgStatsMap[orgName].totalPlans++;
      
      switch (plan.status) {
        case 'DRAFT': orgStatsMap[orgName].draft++; break;
        case 'SUBMITTED': orgStatsMap[orgName].submitted++; break;
        case 'APPROVED': orgStatsMap[orgName].approved++; break;
        case 'REJECTED': orgStatsMap[orgName].rejected++; break;
      }
    });

    // Calculate success rates
    Object.keys(orgStatsMap).forEach(orgName => {
      const orgData = orgStatsMap[orgName];
      const reviewedPlans = orgData.approved + orgData.rejected;
      orgData.successRate = reviewedPlans > 0 ? (orgData.approved / reviewedPlans) * 100 : 0;
    });

    stats.orgStats = orgStatsMap;
    return stats;
  };

  const stats = calculateStats();

  // Manual refresh function
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      console.log('[AdminDashboard] Manual refresh initiated');
      await refetchPlans();
      setSuccess('Data refreshed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('[AdminDashboard] Manual refresh failed:', err);
      setError(`Failed to refresh data: ${err.message || 'Please check your connection'}`);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Helper function to format currency
  const formatCurrency = (amount: number): string => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}K`;
    } else {
      return `$${amount.toFixed(0)}`;
    }
  };

  // Helper function to format date
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not available';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return 'Invalid date';
    }
  };

  // Prepare chart data
  const planStatusChartData = {
    labels: ['Draft', 'Submitted', 'Approved', 'Rejected'],
    datasets: [{
      data: [stats.draftPlans, stats.submittedPlans, stats.approvedPlans, stats.rejectedPlans],
      backgroundColor: ['#6b7280', '#f59e0b', '#10b981', '#ef4444'],
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };

  const organizationChartData = {
    labels: Object.keys(stats.orgStats).slice(0, 10),
    datasets: [{
      label: 'Total Plans',
      data: Object.values(stats.orgStats).slice(0, 10).map((org: any) => org.totalPlans),
      backgroundColor: '#3b82f6',
    }, {
      label: 'Approved Plans',
      data: Object.values(stats.orgStats).slice(0, 10).map((org: any) => org.approved),
      backgroundColor: '#10b981',
    }]
  };

  // Loading state
  if (isLoadingOrgs || isLoadingPlans) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin text-green-600 mx-auto mb-4" />
          <span className="text-lg">Loading admin analytics...</span>
          <p className="text-sm text-gray-500 mt-2">This may take up to 1 minute in production</p>
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
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600">System-wide analytics and plan management</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 ${isRefreshing ? 'cursor-not-allowed' : ''}`}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      {/* Error and Success Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center text-red-700">
            <AlertCircle className="h-5 w-5 mr-2" />
            <div>
              <h3 className="font-medium">Error</h3>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center text-green-700">
          <CheckCircle className="h-5 w-5 mr-2" />
          {success}
        </div>
      )}

      {plansError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center text-red-700">
            <AlertCircle className="h-5 w-5 mr-2" />
            <div>
              <h3 className="font-medium">Failed to load plans data</h3>
              <p className="text-sm mt-1">
                {plansError instanceof Error 
                  ? `${plansError.message}${plansError.code === 'ECONNABORTED' ? ' (Connection timeout)' : ''}`
                  : 'Network timeout occurred'}
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

      {/* Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Plans</p>
              <p className="text-2xl font-semibold text-blue-600">{stats.totalPlans}</p>
            </div>
            <FileText className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Budget</p>
              <p className="text-2xl font-semibold text-green-600">
                {isLoadingBudgets ? (
                  <Loader className="h-6 w-6 animate-spin" />
                ) : (
                  formatCurrency(budgetCalculations.totalBudget)
                )}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Funded Amount</p>
              <p className="text-2xl font-semibold text-blue-600">
                {isLoadingBudgets ? (
                  <Loader className="h-6 w-6 animate-spin" />
                ) : (
                  formatCurrency(budgetCalculations.totalFunded)
                )}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Funding Gap</p>
              <p className="text-2xl font-semibold text-red-600">
                {isLoadingBudgets ? (
                  <Loader className="h-6 w-6 animate-spin" />
                ) : (
                  formatCurrency(budgetCalculations.totalGap)
                )}
              </p>
            </div>
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'analysis', label: 'Plan Analysis', icon: TrendingUp },
              { id: 'organizations', label: 'Organizations', icon: Building2 }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center">
                  <tab.icon className="h-5 w-5 mr-2" />
                  {tab.label}
                </div>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Approved Plans</p>
                  <p className="text-2xl font-semibold text-green-600">{stats.approvedPlans}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Submitted Plans</p>
                  <p className="text-2xl font-semibold text-yellow-600">{stats.submittedPlans}</p>
                </div>
                <FileText className="h-8 w-8 text-yellow-600" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Funding Rate</p>
                  <p className="text-2xl font-semibold text-purple-600">
                    {isLoadingBudgets ? (
                      <Loader className="h-6 w-6 animate-spin" />
                    ) : (
                      `${budgetCalculations.fundingRate.toFixed(1)}%`
                    )}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-600" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Organizations</p>
                  <p className="text-2xl font-semibold text-indigo-600">{Object.keys(stats.orgStats).length}</p>
                </div>
                <Building2 className="h-8 w-8 text-indigo-600" />
              </div>
            </div>
          </div>

          {/* Plans Overview Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">All Plans Overview</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organization</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Planner</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {allPlansData?.slice(0, 20).map((plan: any) => (
                    <tr key={plan.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {plan.organizationName || organizationsMap[plan.organization] || `Org ${plan.organization}`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {plan.planner_name || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          plan.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                          plan.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
                          plan.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {plan.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {plan.type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {plan.from_date && plan.to_date ? 
                          `${formatDate(plan.from_date)} - ${formatDate(plan.to_date)}` :
                          'Date not available'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
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
          </div>
        </div>
      )}

      {activeTab === 'analysis' && (
        <div className="space-y-6">
          {/* Funding Source Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Government Funding</p>
                  <p className="text-2xl font-semibold text-green-600">
                    {isLoadingBudgets ? (
                      <Loader className="h-6 w-6 animate-spin" />
                    ) : (
                      formatCurrency(Object.values(organizationBudgets).reduce((sum, org) => sum + org.government, 0))
                    )}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-600" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">SDG Funding</p>
                  <p className="text-2xl font-semibold text-blue-600">
                    {isLoadingBudgets ? (
                      <Loader className="h-6 w-6 animate-spin" />
                    ) : (
                      formatCurrency(Object.values(organizationBudgets).reduce((sum, org) => sum + org.sdg, 0))
                    )}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-600" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Partners Funding</p>
                  <p className="text-2xl font-semibold text-purple-600">
                    {isLoadingBudgets ? (
                      <Loader className="h-6 w-6 animate-spin" />
                    ) : (
                      formatCurrency(Object.values(organizationBudgets).reduce((sum, org) => sum + org.partners, 0))
                    )}
                  </p>
                </div>
                <Users className="h-8 w-8 text-purple-600" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Other Funding</p>
                  <p className="text-2xl font-semibold text-indigo-600">
                    {isLoadingBudgets ? (
                      <Loader className="h-6 w-6 animate-spin" />
                    ) : (
                      formatCurrency(Object.values(organizationBudgets).reduce((sum, org) => sum + org.other, 0))
                    )}
                  </p>
                </div>
                <Building2 className="h-8 w-8 text-indigo-600" />
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Plan Status Distribution</h3>
              <div className="h-64">
                <Doughnut 
                  data={planStatusChartData} 
                  options={{ 
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom'
                      }
                    }
                  }} 
                />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Plans by Organization</h3>
              <div className="h-64">
                <Bar 
                  data={organizationChartData} 
                  options={{ 
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom'
                      }
                    },
                    scales: {
                      x: {
                        ticks: {
                          maxRotation: 45
                        }
                      }
                    }
                  }} 
                />
              </div>
            </div>
          </div>

          {/* Organization Budget Analysis */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Organization Budget Analysis</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organization</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Budget</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Funded Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Funding Gap</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Funding Rate</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(organizationBudgets).map(([orgName, budgetData]) => (
                    <tr key={orgName} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {orgName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(budgetData.totalBudget)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(budgetData.totalFunded)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(budgetData.gap)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          budgetData.fundingRate >= 80 ? 'bg-green-100 text-green-800' :
                          budgetData.fundingRate >= 50 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {budgetData.fundingRate.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'organizations' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Organization Performance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organization</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Plans</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approved</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Success Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Budget</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Government</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SDG</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partners</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Funded</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gap</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(stats.orgStats).map(([orgName, orgData]: [string, any]) => {
                  const orgBudget = organizationBudgets[orgName] || {
                    totalBudget: 0,
                    government: 0,
                    sdg: 0,
                    partners: 0,
                    other: 0,
                    totalFunded: 0,
                    gap: 0,
                    fundingRate: 0
                  };
                  
                  return (
                    <tr key={orgName} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {orgName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {orgData.totalPlans}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {orgData.approved}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          orgData.successRate >= 80 ? 'bg-green-100 text-green-800' :
                          orgData.successRate >= 50 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {orgData.successRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {isLoadingBudgets ? (
                          <Loader className="h-4 w-4 animate-spin" />
                        ) : (
                          formatCurrency(orgBudget.totalBudget)
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {isLoadingBudgets ? (
                          <Loader className="h-4 w-4 animate-spin" />
                        ) : (
                          formatCurrency(orgBudget.government)
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {isLoadingBudgets ? (
                          <Loader className="h-4 w-4 animate-spin" />
                        ) : (
                          formatCurrency(orgBudget.sdg)
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {isLoadingBudgets ? (
                          <Loader className="h-4 w-4 animate-spin" />
                        ) : (
                          formatCurrency(orgBudget.partners)
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {isLoadingBudgets ? (
                          <Loader className="h-4 w-4 animate-spin" />
                        ) : (
                          formatCurrency(orgBudget.totalFunded)
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {isLoadingBudgets ? (
                          <Loader className="h-4 w-4 animate-spin" />
                        ) : (
                          <span className={orgBudget.gap > 0 ? 'text-red-600' : 'text-green-600'}>
                            {formatCurrency(orgBudget.gap)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;