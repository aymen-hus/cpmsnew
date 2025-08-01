import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, Calendar, Eye, Building2, CheckCircle, XCircle, AlertCircle, Loader, RefreshCw, BarChart3, PieChart, DollarSign, LayoutGrid } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { plans, organizations, auth, api } from '../lib/api';
import { format } from 'date-fns';
import PlanReviewForm from '../components/PlanReviewForm';
import { isEvaluator } from '../types/user';
import Cookies from 'js-cookie';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

// Set some chart defaults
ChartJS.defaults.color = '#4b5563';
ChartJS.defaults.font.family = 'Inter, sans-serif';

const EvaluatorDashboard: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'pending' | 'analytics'>('analytics');
  const [budgetData, setBudgetData] = useState<any>({
    labels: [],
    datasets: []
  });
  const [planStatusData, setPlanStatusData] = useState<any>({
    labels: [],
    datasets: []
  });
  const [orgSubmissionData, setOrgSubmissionData] = useState<any>({
    labels: [],
    datasets: []
  });

  // Check if user has evaluator permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        if (!isEvaluator(authData.userOrganizations)) {
          setError('You do not have permission to access the evaluator dashboard');
        }
      } catch (error) {
        console.error('Failed to check permissions:', error);
        setError('Failed to verify your permissions');
      }
    };
    
    checkPermissions();
  }, [navigate]);

  // Fetch all organizations to map IDs to names
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

  // Fetch all plans (not just pending) to get statistics
  const { data: allPlansData, isLoading: isLoadingAllPlans } = useQuery({
    queryKey: ['plans', 'all'],
    queryFn: async () => {
      try {
        // For evaluators, we need to get all plans for statistics
        // But we should still respect organization filtering for non-evaluators
        const authData = await auth.getCurrentUser();
        const userRoles = authData.userOrganizations?.map(org => org.role) || [];
        
        let response;
        if (userRoles.includes('EVALUATOR') || userRoles.includes('ADMIN')) {
          // Evaluators and admins can see all plans for statistics
          response = await api.get('/plans/?all=true');
        } else {
          // Others see filtered plans
          response = await api.get('/plans/');
        }
        
        console.log('All plans data for evaluator:', response.data?.length || 0);
        return response.data;
      } catch (error) {
        console.error('Failed to fetch all plans:', error);
        throw error;
      }
    }
  });

  // Fetch pending plans for review
  const { data: pendingPlans, isLoading, refetch } = useQuery({
    queryKey: ['plans', 'pending-reviews'],
    queryFn: async () => {
      console.log('Fetching pending plans for review...');
      try {
        // Ensure CSRF token is fresh
        await auth.getCurrentUser();
        
        const response = await plans.getPendingReviews();
        console.log('Pending plans response:', response);
        
        // Map organization IDs to names if needed
        if (response.data && Array.isArray(response.data)) {
          console.log('Processing plans to ensure organization names are available');
          response.data = response.data.map((plan: any) => {
            if (plan.organization && organizationsMap[plan.organization]) {
              plan.organizationName = organizationsMap[plan.organization];
            }
            return plan;
          });
        }
        
        return response;
      } catch (error) {
        console.error('Error fetching pending reviews:', error);
        throw error;
      }
    },
    retry: 2,
    refetchInterval: 30000, // Refresh every 30 seconds
    refetchOnWindowFocus: true
  });

  // Process plan data for charts whenever allPlansData or pendingPlans changes
  useEffect(() => {
    if (allPlansData && Array.isArray(allPlansData)) {
      // Process data for charts
      processDataForCharts(allPlansData);
    }
  }, [allPlansData, pendingPlans?.data, organizationsMap]);

  // Function to process plan data for charts
  const processDataForCharts = (plansData: any[]) => {
    if (!Array.isArray(plansData) || plansData.length === 0) {
      console.log('No plan data available for charts');
      return;
    }

    // 1. Budget data by organization
    const orgBudgetMap: Record<string, { total: number, funded: number, gap: number }> = {};
    
    // 2. Plan status data
    const statusCounts: Record<string, number> = {
      'DRAFT': 0,
      'SUBMITTED': 0,
      'APPROVED': 0,
      'REJECTED': 0
    };
    
    // Process each plan
    plansData.forEach(plan => {
      // Update status counts
      const status = plan.status || 'DRAFT';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      
      // Process budget data if objectives exist
      if (plan.objectives && Array.isArray(plan.objectives)) {
        let planTotalBudget = 0;
        let planFundedBudget = 0;
        
        // Sum up budgets from all activities in the plan
        plan.objectives.forEach((objective: any) => {
          if (!objective || !Array.isArray(objective.initiatives)) return;
          
          objective.initiatives.forEach((initiative: any) => {
            if (!initiative || !Array.isArray(initiative.main_activities)) return;
            
            initiative.main_activities.forEach((activity: any) => {
              if (!activity || !activity.budget) return;
              
              const budget = activity.budget;
              const estimatedCost = budget.budget_calculation_type === 'WITH_TOOL' 
                ? Number(budget.estimated_cost_with_tool || 0) 
                : Number(budget.estimated_cost_without_tool || 0);
                
              const availableFunding = Number(budget.government_treasury || 0) +
                Number(budget.sdg_funding || 0) +
                Number(budget.partners_funding || 0) +
                Number(budget.other_funding || 0);
                
              planTotalBudget += estimatedCost;
              planFundedBudget += availableFunding;
            });
          });
        });
        
        // Get organization name
        const orgName = plan.organization_name || 
          organizationsMap[plan.organization] || 
          `Organization ${plan.organization}`;
          
        // Add to organization budget map
        if (!orgBudgetMap[orgName]) {
          orgBudgetMap[orgName] = { total: 0, funded: 0, gap: 0 };
        }
        
        orgBudgetMap[orgName].total += planTotalBudget;
        orgBudgetMap[orgName].funded += planFundedBudget;
        orgBudgetMap[orgName].gap += Math.max(0, planTotalBudget - planFundedBudget);
      }
    });
    
    // Prepare budget chart data
    const orgNames = Object.keys(orgBudgetMap);
    const budgetChartData = {
      labels: orgNames,
      datasets: [
        {
          label: 'Total Budget',
          data: orgNames.map(org => orgBudgetMap[org].total),
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        },
        {
          label: 'Funded Amount',
          data: orgNames.map(org => orgBudgetMap[org].funded),
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        },
        {
          label: 'Funding Gap',
          data: orgNames.map(org => orgBudgetMap[org].gap),
          backgroundColor: 'rgba(255, 99, 132, 0.6)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 1
        }
      ]
    };
    
    // Prepare plan status chart data
    const planStatusChartData = {
      labels: ['Draft', 'Submitted', 'Approved', 'Rejected'],
      datasets: [
        {
          data: [
            statusCounts['DRAFT'] || 0,
            statusCounts['SUBMITTED'] || 0,
            statusCounts['APPROVED'] || 0,
            statusCounts['REJECTED'] || 0
          ],
          backgroundColor: [
            'rgba(156, 163, 175, 0.6)', // gray for draft
            'rgba(251, 191, 36, 0.6)', // amber for submitted
            'rgba(52, 211, 153, 0.6)', // green for approved
            'rgba(239, 68, 68, 0.6)'   // red for rejected
          ],
          borderColor: [
            'rgba(156, 163, 175, 1)',
            'rgba(251, 191, 36, 1)',
            'rgba(52, 211, 153, 1)',
            'rgba(239, 68, 68, 1)'
          ],
          borderWidth: 1
        }
      ]
    };
    
    // Calculate organization submission statistics
    const totalOrgs = Object.keys(organizationsMap).length;
    const orgsWithPlans = new Set(plansData.map(plan => plan.organization)).size;
    const orgsWithoutPlans = Math.max(0, totalOrgs - orgsWithPlans);
    
    const orgSubmissionChartData = {
      labels: ['Submitted Plans', 'No Plans'],
      datasets: [
        {
          data: [orgsWithPlans, orgsWithoutPlans],
          backgroundColor: [
            'rgba(59, 130, 246, 0.6)', // blue for submitted
            'rgba(209, 213, 219, 0.6)'  // gray for not submitted
          ],
          borderColor: [
            'rgba(59, 130, 246, 1)',
            'rgba(209, 213, 219, 1)'
          ],
          borderWidth: 1
        }
      ]
    };
    
    // Update state with chart data
    setBudgetData(budgetChartData);
    setPlanStatusData(planStatusChartData);
    setOrgSubmissionData(orgSubmissionChartData);
  };

  // Manual refresh function
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      // Ensure CSRF token is fresh
      await auth.getCurrentUser();
      
      await refetch();
      // Also refetch all plans for updated statistics
      await queryClient.refetchQueries({ queryKey: ['plans', 'all'] });
      
      setSuccess('Plans refreshed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to refresh plans');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Review mutation (approve or reject)
  const reviewMutation = useMutation({
    mutationFn: async (reviewData: { planId: string, status: 'APPROVED' | 'REJECTED', feedback: string }) => {
      try {
        console.log(`Starting review submission for plan ${reviewData.planId} with status: ${reviewData.status}`);
        
        // Ensure fresh authentication and CSRF token
        await auth.getCurrentUser();
        
        // Get fresh CSRF token
        await api.get('/auth/csrf/');
        const csrfToken = Cookies.get('csrftoken');
        console.log(`Using CSRF token: ${csrfToken ? csrfToken.substring(0, 8) + '...' : 'none'}`);
        
        // Prepare the review data
        const reviewPayload = {
          status: reviewData.status,
          feedback: reviewData.feedback || ''
        };
        
        console.log('Review payload:', reviewPayload);
        
        // Add timestamp for cache busting
        const timestamp = new Date().getTime();
        
        // Submit the review using the planReviews API
        if (reviewData.status === 'APPROVED') {
          console.log('Submitting approval...');
          const response = await api.post(`/plans/${reviewData.planId}/approve/?_=${timestamp}`, reviewPayload);
          console.log('Approval response:', response.data);
          return response;
        } else {
          console.log('Submitting rejection...');
          const response = await api.post(`/plans/${reviewData.planId}/reject/?_=${timestamp}`, reviewPayload);
          console.log('Rejection response:', response.data);
          return response;
        }
      } catch (error) {
        console.error('Review submission failed:', error);
        console.error('Error details:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
          config: error.config
        });
        throw error;
      }
    },
    onSuccess: () => {
      console.log('Review submitted successfully, refreshing data...');
      queryClient.invalidateQueries({ queryKey: ['plans', 'pending-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['plans', 'all'] });
      setShowReviewModal(false);
      setSelectedPlan(null);
      setSuccess('Plan review submitted successfully');
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (error: any) => {
      console.error('Review mutation error:', error);
      setError(error.message || 'Failed to submit review');
      setTimeout(() => setError(null), 5000);
    },
  });

  const handleViewPlan = async (plan: any) => {
    if (!plan || !plan.id) {
      setError('Invalid plan data for viewing');
      return;
    }
    
    console.log('Navigating to plan details:', plan.id);
    setError(null);
    
    try {
      // Navigate to plan details
      navigate(`/plans/${plan.id}`);
    } catch (err) {
      console.error('Failed to prefetch plan data:', err);
      setError('Error accessing plan. Please try again.');
    }
  };

  const handleReviewPlan = async (plan: any) => {
    if (!plan || !plan.id) {
      setError('Invalid plan data for review');
      return;
    }
    
    try {
      // Ensure CSRF token is fresh
      await auth.getCurrentUser();
      console.log('Opening review modal for plan:', plan.id);
      setSelectedPlan(plan);
      setShowReviewModal(true);
    } catch (error) {
      console.error('Authentication failed:', error);
      setError('Failed to authenticate. Please try again.');
    }
  };

  const handleReviewSubmit = async (data: { status: 'APPROVED' | 'REJECTED'; feedback: string }) => {
    if (!selectedPlan) return;
    
    try {
      console.log(`Submitting review for plan ${selectedPlan.id} with status: ${data.status}`);
      console.log('Review data:', data);
      
      await reviewMutation.mutateAsync({
        planId: selectedPlan.id,
        status: data.status,
        feedback: data.feedback
      });
    } catch (error) {
      console.error('Failed to submit review:', error);
      
      // Provide more specific error message
      let errorMessage = 'Failed to submit review';
      if (error.response?.status === 403) {
        errorMessage = 'Permission denied. You may not have evaluator permissions.';
      } else if (error.response?.status === 404) {
        errorMessage = 'Plan not found or no longer available for review.';
      } else if (error.response?.status === 400) {
        errorMessage = 'Invalid review data. Please check your input.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
      setTimeout(() => setError(null), 5000);
    }
  };

  // Helper function to safely format dates
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not available';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      console.error('Error formatting date:', e);
      return 'Invalid date';
    }
  };

  // Helper function to get organization name from map or plan
  const getOrganizationName = (plan: any) => {
    if (plan.organizationName) {
      return plan.organizationName;
    }
    
    if (plan.organization_name) {
      return plan.organization_name;
    }
    
    // Try to get organization name from our map
    if (plan.organization && organizationsMap[plan.organization]) {
      return organizationsMap[plan.organization];
    }
    
    return 'Unknown Organization';
  };

  // Calculate summary statistics
  const calculateSummaryStats = () => {
    if (!allPlansData || !Array.isArray(allPlansData)) {
      return {
        totalPlans: 0,
        pendingReviews: 0,
        approvedPlans: 0,
        rejectedPlans: 0,
        totalBudget: 0,
        fundingGap: 0
      };
    }

    const stats = {
      totalPlans: allPlansData.length,
      pendingReviews: 0,
      approvedPlans: 0,
      rejectedPlans: 0,
      totalBudget: 0,
      fundingGap: 0
    };

    allPlansData.forEach(plan => {
      // Count by status
      if (plan.status === 'SUBMITTED') stats.pendingReviews++;
      if (plan.status === 'APPROVED') stats.approvedPlans++;
      if (plan.status === 'REJECTED') stats.rejectedPlans++;

      // Calculate budget totals
      if (plan.objectives && Array.isArray(plan.objectives)) {
        plan.objectives.forEach((objective: any) => {
          if (!objective || !Array.isArray(objective.initiatives)) return;
          
          objective.initiatives.forEach((initiative: any) => {
            if (!initiative || !Array.isArray(initiative.main_activities)) return;
            
            initiative.main_activities.forEach((activity: any) => {
              if (!activity || !activity.budget) return;
              
              const budget = activity.budget;
              const estimatedCost = budget.budget_calculation_type === 'WITH_TOOL' 
                ? Number(budget.estimated_cost_with_tool || 0) 
                : Number(budget.estimated_cost_without_tool || 0);
                
              const availableFunding = Number(budget.government_treasury || 0) +
                Number(budget.sdg_funding || 0) +
                Number(budget.partners_funding || 0) +
                Number(budget.other_funding || 0);
                
              stats.totalBudget += estimatedCost;
              stats.fundingGap += Math.max(0, estimatedCost - availableFunding);
            });
          });
        });
      }
    });

    return stats;
  };

  const summaryStats = calculateSummaryStats();

  if (isLoading && activeTab === 'pending') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="h-6 w-6 animate-spin mr-2 text-green-600" />
        <span className="text-lg">Loading pending plans...</span>
      </div>
    );
  }

  if (isLoadingAllPlans && activeTab === 'analytics') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="h-6 w-6 animate-spin mr-2 text-green-600" />
        <span className="text-lg">Loading analytics data...</span>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Evaluator Dashboard</h1>
        <p className="text-gray-600">Review plans and analyze organizational budget data</p>
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

      {/* Summary Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Total Plans</h3>
            <LayoutGrid className="h-5 w-5 text-blue-500" />
          </div>
          <p className="text-3xl font-semibold text-blue-600">{summaryStats.totalPlans}</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Pending Reviews</h3>
            <Bell className="h-5 w-5 text-amber-500" />
          </div>
          <p className="text-3xl font-semibold text-amber-600">{summaryStats.pendingReviews}</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Total Budget</h3>
            <DollarSign className="h-5 w-5 text-green-500" />
          </div>
          <p className="text-3xl font-semibold text-green-600">${summaryStats.totalBudget.toLocaleString()}</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Funding Gap</h3>
            <AlertCircle className="h-5 w-5 text-red-500" />
          </div>
          <p className="text-3xl font-semibold text-red-600">${summaryStats.fundingGap.toLocaleString()}</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex -mb-px">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'analytics'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Analytics
            </div>
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'pending'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center">
              <Bell className="h-5 w-5 mr-2" />
              Pending Reviews
              {summaryStats.pendingReviews > 0 && (
                <span className="ml-2 bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-xs">
                  {summaryStats.pendingReviews}
                </span>
              )}
            </div>
          </button>
        </nav>
      </div>

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Organization Plan Submission Status */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Organization Plan Submission</h3>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md disabled:opacity-50"
              >
                {isRefreshing ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Refresh Data
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Submission Pie Chart */}
              <div className="bg-gray-50 rounded-lg p-4 col-span-1">
                <h4 className="text-sm font-medium text-gray-700 mb-4 text-center">Submission Status</h4>
                <div className="h-64">
                  {orgSubmissionData.labels.length > 0 ? (
                    <Doughnut 
                      data={orgSubmissionData}
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
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-gray-500">No data available</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Plan Status Pie Chart */}
              <div className="bg-gray-50 rounded-lg p-4 col-span-1">
                <h4 className="text-sm font-medium text-gray-700 mb-4 text-center">Plan Status Distribution</h4>
                <div className="h-64">
                  {planStatusData.labels.length > 0 ? (
                    <Doughnut 
                      data={planStatusData}
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
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-gray-500">No data available</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Summary Cards */}
              <div className="col-span-1 space-y-3">
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium text-gray-500">Organizations with Plans</div>
                      <div className="mt-1 text-2xl font-semibold text-blue-600">
                        {orgSubmissionData.datasets?.[0]?.data?.[0] || 0}
                      </div>
                    </div>
                    <div className="p-3 rounded-full bg-blue-100">
                      <Building2 className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium text-gray-500">Organizations without Plans</div>
                      <div className="mt-1 text-2xl font-semibold text-gray-600">
                        {orgSubmissionData.datasets?.[0]?.data?.[1] || 0}
                      </div>
                    </div>
                    <div className="p-3 rounded-full bg-gray-100">
                      <Building2 className="h-5 w-5 text-gray-500" />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border border-green-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium text-gray-500">Approved Plans</div>
                      <div className="mt-1 text-2xl font-semibold text-green-600">
                        {planStatusData.datasets?.[0]?.data?.[2] || 0}
                      </div>
                    </div>
                    <div className="p-3 rounded-full bg-green-100">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border border-red-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium text-gray-500">Rejected Plans</div>
                      <div className="mt-1 text-2xl font-semibold text-red-600">
                        {planStatusData.datasets?.[0]?.data?.[3] || 0}
                      </div>
                    </div>
                    <div className="p-3 rounded-full bg-red-100">
                      <XCircle className="h-5 w-5 text-red-600" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Budget Analysis Section */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">Budget Analysis by Organization</h3>

            <div className="h-80">
              {budgetData.labels.length > 0 ? (
                <Bar 
                  data={budgetData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      x: {
                        stacked: false,
                        title: {
                          display: true,
                          text: 'Organizations'
                        }
                      },
                      y: {
                        stacked: false,
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
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-gray-500">No budget data available</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-700">Total Budget</h4>
                  <DollarSign className="h-5 w-5 text-blue-500" />
                </div>
                <p className="mt-2 text-2xl font-semibold text-blue-600">
                  ${summaryStats.totalBudget.toLocaleString()}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Total budget across all plans
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-700">Funding Gap</h4>
                  <AlertCircle className="h-5 w-5 text-red-500" />
                </div>
                <p className="mt-2 text-2xl font-semibold text-red-600">
                  ${summaryStats.fundingGap.toLocaleString()}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Additional funding needed
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-700">Funding Rate</h4>
                  <PieChart className="h-5 w-5 text-green-500" />
                </div>
                <p className="mt-2 text-2xl font-semibold text-green-600">
                  {summaryStats.totalBudget 
                    ? Math.round(((summaryStats.totalBudget - summaryStats.fundingGap) / summaryStats.totalBudget) * 100) 
                    : 0}%
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Percentage of budgets funded
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Reviews Tab */}
      {activeTab === 'pending' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="sm:flex sm:items-center">
              <div className="sm:flex-auto">
                <h3 className="text-lg font-medium leading-6 text-gray-900">Pending Reviews</h3>
                <p className="mt-1 text-sm text-gray-500">
                  View all plans submitted for review and their current status.
                </p>
              </div>
              <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
                <div className="flex items-center">
                  <Bell className="h-6 w-6 text-gray-400 mr-2" />
                  <span className="bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {pendingPlans?.data?.length || 0}
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-4 flex justify-end">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center px-4 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md disabled:opacity-50"
              >
                {isRefreshing ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Refresh Plans
              </button>
            </div>

            {!pendingPlans?.data || pendingPlans.data.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No pending plans</h3>
                <p className="text-gray-500 max-w-lg mx-auto">
                  There are no plans waiting for your review. Check back later or refresh to see if any new plans have been submitted.
                </p>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-300 rounded-md disabled:opacity-50"
                >
                  {isRefreshing ? <Loader className="h-4 w-4 mr-2 inline-block animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2 inline-block" />}
                  Check Again
                </button>
              </div>
            ) : (
              <div className="mt-6 overflow-hidden overflow-x-auto border border-gray-200 rounded-lg">
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
                        Submitted Date
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Planning Period
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pendingPlans.data.map((plan: any) => (
                      <tr key={plan.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                            <span className="text-sm font-medium text-gray-900">{getOrganizationName(plan)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {plan.planner_name || 'Unknown Planner'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                            <span className="text-sm text-gray-500">
                              {plan.submitted_at ? formatDate(plan.submitted_at) : 'Not yet submitted'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {plan.from_date && plan.to_date ? 
                            `${formatDate(plan.from_date)} - ${formatDate(plan.to_date)}` :
                            'Date not available'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => handleViewPlan(plan)}
                              className="text-blue-600 hover:text-blue-900 flex items-center"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </button>
                            <button
                              onClick={() => handleReviewPlan(plan)}
                              className="text-green-600 hover:text-green-900 flex items-center"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Review
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && selectedPlan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Review Plan: {getOrganizationName(selectedPlan)}
            </h3>
            
            <PlanReviewForm
              plan={selectedPlan}
              onSubmit={handleReviewSubmit}
              onCancel={() => {
                setShowReviewModal(false);
                setSelectedPlan(null);
              }}
              isSubmitting={reviewMutation.isPending}
            />
          </div>
        </div>
      )}

      <footer className="bg-white border-t border-gray-200 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-sm text-gray-500 mb-2 md:mb-0">
              &copy; {new Date().getFullYear()} Ministry of Health, Ethiopia. All rights reserved.
            </div>
            <div className="text-sm text-gray-500">
              Developed by Ministry of Health, Information Communication Technology EO
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default EvaluatorDashboard;
