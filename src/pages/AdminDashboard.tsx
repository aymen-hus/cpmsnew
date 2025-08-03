import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart3, 
  DollarSign, 
  Building2, 
  FileText, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  RefreshCw, 
  Loader,
  PieChart,
  Activity,
  Users,
  Calendar,
  Target
} from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { organizations, plans, auth, api } from '../lib/api';
import { format } from 'date-fns';
import { isAdmin } from '../types/user';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

const AdminDashboard: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // State variables
  const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'organizations'>('overview');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [budgetStats, setBudgetStats] = useState({
    totalBudget: 0,
    fundedAmount: 0,
    fundingGap: 0,
    fundingRate: 0,
    orgStats: {} as Record<string, any>
  });
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);

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
  const { data: organizationsData } = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: async () => {
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
      return response;
    },
    staleTime: 300000,
    cacheTime: 600000
  });

  // Fetch all plans
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
        
        // Add organization names to plans
        if (Array.isArray(plans)) {
          plans.forEach((plan: any) => {
            if (plan.organization && organizationsMap[plan.organization]) {
              plan.organizationName = organizationsMap[plan.organization];
            }
          });
        }
        
        console.log(`[AdminDashboard] Fetched ${plans.length} total plans`);
        return plans;
      } catch (error) {
        console.error('[AdminDashboard] Error fetching plans:', error);
        throw error;
      }
    },
    enabled: Object.keys(organizationsMap).length > 0,
    retry: 2,
    retryDelay: 3000,
    staleTime: 60000,
    cacheTime: 300000
  });

  // Calculate statistics with budget data
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
    const orgBudgetMap: Record<string, { 
      total: number, 
      funded: number, 
      gap: number, 
      planCount: number,
      government: number,
      sdg: number,
      partners: number,
      other: number
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

      if (!orgBudgetMap[orgName]) {
        orgBudgetMap[orgName] = { 
          total: 0, 
          funded: 0, 
          gap: 0, 
          planCount: 0,
          government: 0,
          sdg: 0,
          partners: 0,
          other: 0
        };
      }
      
      orgBudgetMap[orgName].planCount++;

      // Add budget data from plan (calculated separately)
      if (plan.budget_total) {
        orgBudgetMap[orgName].total += Number(plan.budget_total || 0);
      }
      if (plan.funded_total) {
        orgBudgetMap[orgName].funded += Number(plan.funded_total || 0);
      }
      if (plan.funding_gap) {
        orgBudgetMap[orgName].gap += Number(plan.funding_gap || 0);
      }
      if (plan.government_budget) {
        orgBudgetMap[orgName].government += Number(plan.government_budget || 0);
      }
      if (plan.sdg_budget) {
        orgBudgetMap[orgName].sdg += Number(plan.sdg_budget || 0);
      }
      if (plan.partners_budget) {
        orgBudgetMap[orgName].partners += Number(plan.partners_budget || 0);
      }
      if (plan.other_budget) {
        orgBudgetMap[orgName].other += Number(plan.other_budget || 0);
      }
    });

    stats.orgStats = orgBudgetMap;
    return stats;
  };

  // Budget calculation function
  const calculateBudgets = async () => {
    if (!allPlansData || !Array.isArray(allPlansData)) {
      console.log('[AdminDashboard] No plans data available for budget calculation');
      return;
    }

    try {
      setIsLoadingBudgets(true);
      setBudgetError(null);
      console.log('[AdminDashboard] Starting budget calculation...');

      // Filter to only submitted/approved plans
      const eligiblePlans = allPlansData.filter(plan => 
        plan.status === 'SUBMITTED' || plan.status === 'APPROVED'
      );

      console.log(`[AdminDashboard] Processing budgets for ${eligiblePlans.length} eligible plans`);

      // Process plans in small batches
      const batchSize = 2;
      const batches = [];
      for (let i = 0; i < eligiblePlans.length; i += batchSize) {
        batches.push(eligiblePlans.slice(i, i + batchSize));
      }

      let totalBudget = 0;
      let totalFunded = 0;
      let totalGovernment = 0;
      let totalSDG = 0;
      let totalPartners = 0;
      let totalOther = 0;

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`[AdminDashboard] Processing batch ${batchIndex + 1}/${batches.length}`);

        await Promise.all(batch.map(async (plan) => {
          try {
            // Fetch main activities for this plan's organization
            const activitiesResponse = await Promise.race([
              api.get(`/main-activities/?organization=${plan.organization}`, {
                timeout: 15000,
                headers: { 'Accept': 'application/json' }
              }),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Activities timeout')), 20000)
              )
            ]);

            const activities = activitiesResponse?.data?.results || activitiesResponse?.data || [];
            
            let planTotalBudget = 0;
            let planGovernmentBudget = 0;
            let planSdgBudget = 0;
            let planPartnersBudget = 0;
            let planOtherBudget = 0;

            // Process each activity's budget
            for (const activity of activities) {
              if (activity.budget) {
                const budget = activity.budget;
                
                // Get estimated cost based on calculation type
                const estimatedCost = budget.budget_calculation_type === 'WITH_TOOL' 
                  ? Number(budget.estimated_cost_with_tool || 0)
                  : Number(budget.estimated_cost_without_tool || 0);

                planTotalBudget += estimatedCost;
                planGovernmentBudget += Number(budget.government_treasury || 0);
                planSdgBudget += Number(budget.sdg_funding || 0);
                planPartnersBudget += Number(budget.partners_funding || 0);
                planOtherBudget += Number(budget.other_funding || 0);
              }
            }

            // Store budget data in plan object
            plan.budget_total = planTotalBudget;
            plan.government_budget = planGovernmentBudget;
            plan.sdg_budget = planSdgBudget;
            plan.partners_budget = planPartnersBudget;
            plan.other_budget = planOtherBudget;
            plan.funded_total = planGovernmentBudget + planSdgBudget + planPartnersBudget + planOtherBudget;
            plan.funding_gap = Math.max(0, planTotalBudget - plan.funded_total);

            // Add to totals
            totalBudget += planTotalBudget;
            totalGovernment += planGovernmentBudget;
            totalSDG += planSdgBudget;
            totalPartners += planPartnersBudget;
            totalOther += planOtherBudget;

            console.log(`[AdminDashboard] Plan ${plan.id} budget: ${planTotalBudget}`);

          } catch (planError) {
            console.warn(`[AdminDashboard] Error calculating budget for plan ${plan.id}:`, planError);
            // Set default values
            plan.budget_total = 0;
            plan.funded_total = 0;
            plan.funding_gap = 0;
            plan.government_budget = 0;
            plan.sdg_budget = 0;
            plan.partners_budget = 0;
            plan.other_budget = 0;
          }
        }));

        // Delay between batches
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      totalFunded = totalGovernment + totalSDG + totalPartners + totalOther;
      const totalGap = Math.max(0, totalBudget - totalFunded);
      const fundingRate = totalBudget > 0 ? (totalFunded / totalBudget) * 100 : 0;

      // Update budget stats
      setBudgetStats({
        totalBudget,
        fundedAmount: totalFunded,
        fundingGap: totalGap,
        fundingRate,
        orgStats: calculateStats().orgStats
      });

      console.log(`[AdminDashboard] Budget calculation complete:`, {
        totalBudget,
        fundedAmount: totalFunded,
        fundingGap: totalGap,
        fundingRate
      });

    } catch (error) {
      console.error('[AdminDashboard] Budget calculation error:', error);
      setBudgetError('Failed to calculate budget data');
    } finally {
      setIsLoadingBudgets(false);
    }
  };

  // Calculate basic stats (without budget data)
  const stats = calculateStats();

  // Trigger budget calculation when plans data loads
  useEffect(() => {
    if (allPlansData && Array.isArray(allPlansData) && allPlansData.length > 0) {
      calculateBudgets();
    }
  }, [allPlansData]);

  // Manual refresh function
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    setBudgetError(null);
    try {
      await refetchPlans();
      setSuccess('Data refreshed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(`Failed to refresh data: ${err.message || 'Please check your connection'}`);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Format currency helper
  const formatCurrency = (value: number): string => {
    if (value === 0) return '0';
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toFixed(0);
  };

  // Format date helper
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return dateString;
    }
  };

  // Prepare chart data
  const planStatusData = {
    labels: ['Draft', 'Submitted', 'Approved', 'Rejected'],
    datasets: [{
      data: [stats.draftPlans, stats.submittedPlans, stats.approvedPlans, stats.rejectedPlans],
      backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444'],
      borderWidth: 1
    }]
  };

  const organizationData = {
    labels: Object.keys(stats.orgStats).slice(0, 10),
    datasets: [{
      label: 'Number of Plans',
      data: Object.values(stats.orgStats).slice(0, 10).map((org: any) => org.planCount),
      backgroundColor: '#3b82f6',
      borderColor: '#1d4ed8',
      borderWidth: 1
    }]
  };

  if (isLoadingPlans) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin text-green-600 mx-auto mb-4" />
          <span className="text-lg">Loading admin analytics...</span>
          <p className="text-sm text-gray-500 mt-2">Loading plans data...</p>
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
            <h1 className="text-2xl font-bold text-gray-900">Admin Analytics Dashboard</h1>
            <p className="text-gray-600">Comprehensive overview of all organizational plans and budgets</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoadingBudgets}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      {/* Error Messages */}
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

      {/* Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Plans</p>
              <p className="text-3xl font-semibold text-blue-600">{stats.totalPlans}</p>
            </div>
            <FileText className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Budget</p>
              <p className="text-3xl font-semibold text-green-600">
                ${formatCurrency(budgetStats.totalBudget)}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-green-600" />
          </div>
          {isLoadingBudgets && (
            <div className="mt-2 text-xs text-gray-500">Calculating...</div>
          )}
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Funded Amount</p>
              <p className="text-3xl font-semibold text-purple-600">
                ${formatCurrency(budgetStats.fundedAmount)}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-purple-600" />
          </div>
          {isLoadingBudgets && (
            <div className="mt-2 text-xs text-gray-500">Calculating...</div>
          )}
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Funding Gap</p>
              <p className="text-3xl font-semibold text-red-600">
                ${formatCurrency(budgetStats.fundingGap)}
              </p>
            </div>
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          {isLoadingBudgets && (
            <div className="mt-2 text-xs text-gray-500">Calculating...</div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
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
              onClick={() => setActiveTab('analysis')}
              className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'analysis'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <PieChart className="h-5 w-5 mr-2" />
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
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Plan Status Overview */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Plan Status Overview</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{stats.draftPlans}</div>
                <div className="text-sm text-yellow-700">Draft Plans</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.submittedPlans}</div>
                <div className="text-sm text-blue-700">Submitted Plans</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{stats.approvedPlans}</div>
                <div className="text-sm text-green-700">Approved Plans</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{stats.rejectedPlans}</div>
                <div className="text-sm text-red-700">Rejected Plans</div>
              </div>
            </div>
          </div>

          {/* Budget Summary */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Budget Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  ${formatCurrency(budgetStats.totalBudget)}
                </div>
                <div className="text-sm text-green-700">Total Budget</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  ${formatCurrency(budgetStats.fundedAmount)}
                </div>
                <div className="text-sm text-purple-700">Funded Amount</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">
                  ${formatCurrency(budgetStats.fundingGap)}
                </div>
                <div className="text-sm text-red-700">Funding Gap</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {budgetStats.fundingRate.toFixed(1)}%
                </div>
                <div className="text-sm text-blue-700">Funding Rate</div>
              </div>
            </div>
            {isLoadingBudgets && (
              <div className="mt-4 text-center text-sm text-gray-500">
                <Loader className="h-4 w-4 animate-spin inline mr-2" />
                Calculating budget data...
              </div>
            )}
          </div>

          {/* Recent Plans Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">All Plans Overview</h3>
              
              {!allPlansData || allPlansData.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>No plans found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Organization
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Planner
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Budget
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Funded
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Gap
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Created
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {allPlansData.map((plan: any) => (
                        <tr key={plan.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                              <span className="text-sm font-medium text-gray-900">
                                {plan.organizationName || `Org ${plan.organization}`}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {plan.planner_name || 'Unknown'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {plan.type}
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
                            ${formatCurrency(plan.budget_total || 0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${formatCurrency(plan.funded_total || 0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${formatCurrency(plan.funding_gap || 0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(plan.created_at)}
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

      {activeTab === 'analysis' && (
        <div className="space-y-6">
          {/* Budget Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Budget</p>
                  <p className="text-2xl font-semibold text-green-600">
                    ${formatCurrency(budgetStats.totalBudget)}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-600" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Funded Amount</p>
                  <p className="text-2xl font-semibold text-purple-600">
                    ${formatCurrency(budgetStats.fundedAmount)}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-purple-600" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Funding Gap</p>
                  <p className="text-2xl font-semibold text-red-600">
                    ${formatCurrency(budgetStats.fundingGap)}
                  </p>
                </div>
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Funding Rate</p>
                  <p className="text-2xl font-semibold text-blue-600">
                    {budgetStats.fundingRate.toFixed(1)}%
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-600" />
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Plan Status Distribution</h3>
              <div style={{ height: '300px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Doughnut 
                  data={planStatusData}
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

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Plans by Organization</h3>
              <div style={{ height: '300px' }}>
                <Bar 
                  data={organizationData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: false
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: {
                          stepSize: 1
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'organizations' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Organization Performance</h3>
            
            {Object.keys(stats.orgStats).length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Building2 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p>No organization data available</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Organization
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Plans
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Budget
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Government
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        SDG
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Partners
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Funded
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Gap
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Success Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(stats.orgStats).map(([orgName, orgData]: [string, any]) => {
                      const successRate = orgData.planCount > 0 
                        ? ((orgData.approvedCount || 0) / orgData.planCount * 100).toFixed(1)
                        : '0';

                      return (
                        <tr key={orgName} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                              <span className="text-sm font-medium text-gray-900">{orgName}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {orgData.planCount}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${formatCurrency(orgData.total || 0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${formatCurrency(orgData.government || 0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${formatCurrency(orgData.sdg || 0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${formatCurrency(orgData.partners || 0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${formatCurrency(orgData.funded || 0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${formatCurrency(orgData.gap || 0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              Number(successRate) >= 80 ? 'bg-green-100 text-green-800' :
                              Number(successRate) >= 60 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {successRate}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;