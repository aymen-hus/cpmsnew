import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, FileSpreadsheet, File as FilePdf, ArrowLeft, AlertCircle, Loader, Building2, Calendar, User, CheckCircle, XCircle, ClipboardCheck, FileType, RefreshCw } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { plans, organizations, auth, api } from '../lib/api';
import { format } from 'date-fns';
import { exportToExcel, exportToPDF } from '../lib/utils/export';
import PlanReviewForm from '../components/PlanReviewForm';
import PlanReviewTable from '../components/PlanReviewTable';
import { isAdmin, isEvaluator, isPlanner } from '../types/user';
import Cookies from 'js-cookie';
import axios from 'axios';

const PlanSummary: React.FC = () => {
  // All hooks must be called unconditionally at the top level
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { planId } = useParams();

  // State hooks
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userOrganizations, setUserOrganizations] = useState<number[]>([]);
  const [authState, setAuthState] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [organizationName, setOrganizationName] = useState<string>('');
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [processedPlanData, setProcessedPlanData] = useState<any>(null);
  const [showTableView, setShowTableView] = useState(false);

  // Query hooks
  const { data: organizationsData } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      try {
        const response = await organizations.getAll();
        return response || [];
      } catch (error) {
        console.error("Failed to fetch organizations:", error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000
  });

  const { data: planData, isLoading, error, refetch } = useQuery({
    queryKey: ['plan', planId, retryCount],
    queryFn: async () => {
      if (!planId) throw new Error("Plan ID is missing");
      
      try {
        await auth.getCurrentUser();
        const timestamp = new Date().getTime();
        
        try {
          const headers = {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-CSRFToken': Cookies.get('csrftoken') || '',
            'Accept': 'application/json'
          };
          
          const response = await axios.get(`/api/plans/${planId}/?_=${timestamp}`, { 
            headers,
            withCredentials: true,
            timeout: 10000
          });
          
          if (!response.data) throw new Error("No data received");
          return normalizeAndProcessPlanData(response.data);
        } catch (directError) {
          const planResult = await plans.getById(planId);
          if (!planResult) throw new Error("No data received");
          return planResult;
        }
      } catch (error: any) {
        setLoadingError(error.message || "Failed to load plan");
        throw error;
      }
    },
    retry: 2,
    retryDelay: 1000,
    refetchOnWindowFocus: false,
    staleTime: 0,
    enabled: !!authState && !!planId
  });

  const reviewPlanMutation = useMutation({
    mutationFn: async (data: { status: 'APPROVED' | 'REJECTED', feedback: string }) => {
      if (!planId) throw new Error("Plan ID is missing");

      await auth.getCurrentUser();
      await axios.get('/api/auth/csrf/', { withCredentials: true });
      
      const timestamp = new Date().getTime();
      
      if (data.status === 'APPROVED') {
        return api.post(`/plans/${planId}/approve/?_=${timestamp}`, { feedback: data.feedback });
      } else {
        return api.post(`/plans/${planId}/reject/?_=${timestamp}`, { feedback: data.feedback });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans', 'pending-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['plan', planId] });
      setShowReviewForm(false);
      navigate('/evaluator');
    },
    onError: (error: any) => {
      setLoadingError(error.message || 'Failed to submit review');
    }
  });

  // Effect hooks
  useEffect(() => {
    const ensureAuth = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        setAuthState(authData);
        
        if (authData.userOrganizations?.length > 0) {
          setUserRole(authData.userOrganizations[0].role);
          setUserOrganizations(authData.userOrganizations.map(org => org.organization));
        }
        
        const response = await axios.get('/api/auth/csrf/', { withCredentials: true });
        const token = response.headers['x-csrftoken'] || Cookies.get('csrftoken');
        if (token) Cookies.set('csrftoken', token, { path: '/' });
      } catch (error) {
        console.error("Authentication check failed:", error);
            
            // FETCH FRESH OBJECTIVE DATA to get current planner_weight
            let freshObjectiveData = objective;
            try {
              console.log(`Fetching fresh objective data for ${objective.id} to get planner_weight...`);
              const freshObjectiveResponse = await api.get(`/strategic-objectives/${objective.id}/`);
              if (freshObjectiveResponse.data) {
                freshObjectiveData = freshObjectiveResponse.data;
                console.log(`Fresh objective data for ${objective.id}:`, {
                  id: freshObjectiveData.id,
                  title: freshObjectiveData.title,
                  weight: freshObjectiveData.weight,
                  planner_weight: freshObjectiveData.planner_weight
                });
              }
            } catch (fetchError) {
              console.warn(`Failed to fetch fresh objective data for ${objective.id}, using provided data:`, fetchError);
              freshObjectiveData = objective;
            }
      }
            // Use the FRESH objective data with current planner_weight
            const plannerSelectedWeight = freshObjectiveData.planner_weight !== undefined && freshObjectiveData.planner_weight !== null
              ? freshObjectiveData.planner_weight
              : freshObjectiveData.weight;
              
            console.log(`Objective ${objective.id} weight calculation:`, {
              original_weight: freshObjectiveData.weight,
              planner_weight: freshObjectiveData.planner_weight,
              selected_weight: plannerSelectedWeight
            });

  useEffect(() => {
            if (freshObjectiveData.programs && Array.isArray(freshObjectiveData.programs)) {
              console.log(`Checking ${freshObjectiveData.programs.length} programs for additional initiatives`);
              ...freshObjectiveData, // Use fresh data with current planner_weight
      if (organizationsData) {
              id: freshObjectiveData.id,
              title: freshObjectiveData.title,
              description: freshObjectiveData.description,
              weight: freshObjectiveData.weight, // Original system weight
              planner_weight: freshObjectiveData.planner_weight, // Planner's selected weight
              effective_weight: plannerSelectedWeight, // The weight to actually use
            return;
          }
          
          if (planData.organization) {
            const org = Array.isArray(organizationsData) 
              ? organizationsData.find(o => o.id.toString() === planData.organization.toString())
              : organizationsData.data?.find(o => o.id.toString() === planData.organization.toString());
            
            if (org) {
              setOrganizationName(org.name);
              return;
            }
          }
          
          setOrganizationName('Unknown Organization');
        } catch (e) {
          setOrganizationName('Unknown Organization');
        }
      }
    }
  }, [planData, organizationsData]);

  // Helper functions
  const normalizeAndProcessPlanData = (plan: any) => {
    if (!plan) return plan;
    
    const processedPlan = JSON.parse(JSON.stringify(plan));
    
    try {
      // Ensure all expected arrays exist and are properly formatted
      if (!Array.isArray(processedPlan.objectives)) {
        processedPlan.objectives = processedPlan.objectives 
          ? (Array.isArray(processedPlan.objectives) ? processedPlan.objectives : [processedPlan.objectives])
          : [];
      }

      processedPlan.objectives = processedPlan.objectives.map((objective: any) => {
        if (!objective) return objective;
        
        objective.initiatives = Array.isArray(objective.initiatives) 
          ? objective.initiatives 
          : (objective.initiatives ? [objective.initiatives] : []);
        
        objective.initiatives = objective.initiatives.map((initiative: any) => {
          if (!initiative) return initiative;
          
          initiative.performance_measures = Array.isArray(initiative.performance_measures)
            ? initiative.performance_measures
            : (initiative.performance_measures ? [initiative.performance_measures] : []);
          
          initiative.main_activities = Array.isArray(initiative.main_activities)
            ? initiative.main_activities
            : (initiative.main_activities ? [initiative.main_activities] : []);
          
          initiative.main_activities = initiative.main_activities.map((activity: any) => {
            if (!activity) return activity;
            
            activity.selected_months = Array.isArray(activity.selected_months)
              ? activity.selected_months
              : (activity.selected_months ? [activity.selected_months] : []);
            
            activity.selected_quarters = Array.isArray(activity.selected_quarters)
              ? activity.selected_quarters
              : (activity.selected_quarters ? [activity.selected_quarters] : []);
            
            return activity;
          });
          
          return initiative;
        });
        
        return objective;
      });

      processedPlan.reviews = Array.isArray(processedPlan.reviews)
        ? processedPlan.reviews
        : (processedPlan.reviews ? [processedPlan.reviews] : []);
        
    } catch (e) {
      console.error('Error normalizing plan data:', e);
    }
    
    return processedPlan;
  };

  const calculateTotalBudget = () => {
    let total = 0;
    let governmentTotal = 0;
    let sdgTotal = 0;
    let partnersTotal = 0;
    let otherTotal = 0;

    if (!processedPlanData?.objectives) {
      return { total, governmentTotal, sdgTotal, partnersTotal, otherTotal };
    }

    try {
      processedPlanData.objectives.forEach((objective: any) => {
        objective?.initiatives?.forEach((initiative: any) => {
          initiative?.main_activities?.forEach((activity: any) => {
            if (!activity?.budget) return;
            
            const cost = activity.budget.budget_calculation_type === 'WITH_TOOL' 
              ? Number(activity.budget.estimated_cost_with_tool || 0) 
              : Number(activity.budget.estimated_cost_without_tool || 0);
            
            total += cost;
            governmentTotal += Number(activity.budget.government_treasury || 0);
            sdgTotal += Number(activity.budget.sdg_funding || 0);
            partnersTotal += Number(activity.budget.partners_funding || 0);
            otherTotal += Number(activity.budget.other_funding || 0);
          });
        });
      });
    } catch (e) {
      console.error('Error calculating total budget:', e);
    }

    return { total, governmentTotal, sdgTotal, partnersTotal, otherTotal };
  };

  const budgetTotals = calculateTotalBudget();

  const formatDate = (dateString: string | undefined | null) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'PP');
    } catch (e) {
      return 'Invalid date';
    }
  };

  const getPeriodString = (activity: any) => {
    if (!activity) return 'N/A';
    
    try {
      if (activity.selected_quarters?.length > 0) {
        return activity.selected_quarters.join(', ');
      } 
      if (activity.selected_months?.length > 0) {
        return activity.selected_months.join(', ');
      }
    } catch (e) {
      console.error('Error getting period string:', e);
    }
    
    return 'N/A';
  };

  const getPlanTypeDisplay = (type: string) => type || 'N/A';

  // Event handlers
  const handleRetry = async () => {
    setLoadingError(null);
    setRetryCount(prev => prev + 1);
    try {
      await auth.getCurrentUser();
      await refetch();
    } catch (error) {
      setLoadingError("Failed to reload plan");
    }
  };

  const handleRefresh = async () => {
    setLoadingError(null);
    setRetryCount(prev => prev + 1);
    try {
      await auth.getCurrentUser();
      await refetch();
    } catch (error) {
      console.error("Refresh failed:", error);
    }
  };

  const handleApprove = async () => {
    try {
      await auth.getCurrentUser();
      setShowReviewForm(true);
    } catch (error) {
      setLoadingError('Authentication error');
    }
  };

  const handleReviewSubmit = async (data: { status: 'APPROVED' | 'REJECTED'; feedback: string }) => {
    if (!planId) return;
    
    setIsSubmitting(true);
    try {
      await reviewPlanMutation.mutateAsync(data);
    } catch (error: any) {
      setLoadingError(error.message || 'Failed to submit review');
      setIsSubmitting(false);
      setShowReviewForm(false);
    }
  };

  const handleExportExcel = () => {
    if (!processedPlanData?.objectives) return;
    exportToExcel(
      processedPlanData.objectives,
      `plan-${new Date().toISOString().slice(0, 10)}`,
      'en',
      {
        organization: organizationName,
        planner: processedPlanData.planner_name || 'N/A',
        fromDate: processedPlanData.from_date || 'N/A',
        toDate: processedPlanData.to_date || 'N/A',
        planType: processedPlanData.type || 'N/A'
      }
    );
  };

  const handleExportPDF = () => {
    if (!processedPlanData?.objectives) return;
    exportToPDF(
      processedPlanData.objectives,
      `plan-${new Date().toISOString().slice(0, 10)}`,
      'en',
      {
        organization: organizationName,
        planner: processedPlanData.planner_name || 'N/A',
        fromDate: processedPlanData.from_date || 'N/A',
        toDate: processedPlanData.to_date || 'N/A',
        planType: processedPlanData.type || 'N/A'
      }
    );
  };

  // Render conditions
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="h-6 w-6 animate-spin mr-2 text-green-600" />
        <span className="text-lg">Loading plan details...</span>
      </div>
    );
  }

  if (error || loadingError) {
    const errorMessage = loadingError || (error instanceof Error ? error.message : "An unknown error occurred");
    
    return (
      <div className="p-8 bg-red-50 border border-red-200 rounded-lg text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800">Failed to load plan</h3>
        <p className="text-red-600 mt-2">{errorMessage}</p>
        <div className="mt-6 flex justify-center space-x-4">
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-white border border-red-300 rounded-md text-red-700 hover:bg-red-50"
          >
            Try Again
          </button>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!processedPlanData) {
    return (
      <div className="p-8 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
        <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-yellow-800">Plan Not Found</h3>
        <p className="text-yellow-600 mt-2">The requested plan could not be found.</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-6 px-4 py-2 bg-white border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Go Back
        </button>
      </div>
    );
  }

  // Main render
  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-5 w-5 mr-1" />
          Back
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Plan Details</h1>
            <div className="flex items-center mt-1">
              <div className={`px-2 py-1 text-xs rounded ${
                processedPlanData.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
                processedPlanData.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
                processedPlanData.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                'bg-red-100 text-red-800'
              }`}>
                {processedPlanData.status}
              </div>
              {processedPlanData.submitted_at && (
                <span className="text-sm text-gray-500 ml-2">
                  Submitted on {formatDate(processedPlanData.submitted_at)}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex space-x-3">
            {/* <button
              onClick={handleExportExcel}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export Excel
            </button> */}
            
            <button
              onClick={() => setShowTableView(!showTableView)}
              className={`flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium ${
                showTableView 
                  ? 'bg-blue-50 text-blue-700 border-blue-300' 
                  : 'text-gray-700 bg-white hover:bg-gray-50'
              }`}
            >
              <ClipboardCheck className="h-4 w-4 mr-2" />
              {showTableView ? 'Hide Table View' : 'Show Table View'}
            </button>
            
            {processedPlanData.status === 'SUBMITTED' && (
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 flex items-center"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Check Again
              </button>
            )}
            {/* <button
              onClick={handleExportPDF}
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 flex items-center"
            >
              <FilePdf className="h-4 w-4 mr-2" />
              Export PDF
            </button> */}
            
            {processedPlanData.status === 'SUBMITTED' && isEvaluator(authState?.userOrganizations) && (
              <button
                onClick={handleApprove}
                className="flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
              >
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Review Plan
              </button>
            )}
          </div>
        </div>

        {showTableView && processedPlanData.objectives?.length > 0 && (
          <div className="mb-8">
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-medium text-gray-900">Complete Plan Table View</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Detailed view showing all objectives, initiatives, measures, and activities
                </p>
              </div>
              <div className="p-6">
                <PlanReviewTable
                  objectives={processedPlanData.objectives || []}
                  onSubmit={async () => {}}
                  isSubmitting={false}
                  organizationName={organizationName}
                  plannerName={processedPlanData.planner_name || 'N/A'}
                  fromDate={processedPlanData.from_date || ''}
                  toDate={processedPlanData.to_date || ''}
                  planType={processedPlanData.type || 'N/A'}
                  isPreviewMode={true}
                  userOrgId={null}
                  isViewOnly={true}
                />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-8">
          <div className="border-b border-gray-200 pb-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Organization Information</h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-start">
                <Building2 className="h-5 w-5 text-gray-400 mt-0.5 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Organization Name</p>
                  <p className="font-medium">{organizationName}</p>
                </div>
              </div>
              <div className="flex items-start">
                <User className="h-5 w-5 text-gray-400 mt-0.5 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Planner</p>
                  <p className="font-medium">{processedPlanData.planner_name || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-start">
                <FileType className="h-5 w-5 text-gray-400 mt-0.5 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Plan Type</p>
                  <p className="font-medium">{getPlanTypeDisplay(processedPlanData.type)}</p>
                </div>
              </div>
              <div className="flex items-start">
                <Calendar className="h-5 w-5 text-gray-400 mt-0.5 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Planning Period</p>
                  <p className="font-medium">
                    {formatDate(processedPlanData.from_date)} - {formatDate(processedPlanData.to_date)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {processedPlanData.reviews?.length > 0 && (
            <div className="border-b border-gray-200 pb-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Evaluator Feedback</h2>
              <div className={`p-4 rounded-lg ${
                processedPlanData.status === 'APPROVED' ? 'bg-green-50 border border-green-200' : 
                processedPlanData.status === 'REJECTED' ? 'bg-red-50 border border-red-200' : 
                'bg-gray-50 border border-gray-200'
              }`}>
                <div className="flex items-start">
                  {processedPlanData.status === 'APPROVED' ? (
                    <CheckCircle className={`h-5 w-5 mr-2 text-green-500 mt-0.5`} />
                  ) : processedPlanData.status === 'REJECTED' ? (
                    <XCircle className={`h-5 w-5 mr-2 text-red-500 mt-0.5`} />
                  ) : (
                    <div className="h-5 w-5 mr-2" />
                  )}
                  <div>
                    <p className={`font-medium ${
                      processedPlanData.status === 'APPROVED' ? 'text-green-700' : 
                      processedPlanData.status === 'REJECTED' ? 'text-red-700' : 
                      'text-gray-700'
                    }`}>
                      {processedPlanData.status === 'APPROVED' ? 'Plan Approved' : 
                       processedPlanData.status === 'REJECTED' ? 'Plan Rejected' :
                       'Pending Review'}
                    </p>
                    {processedPlanData.reviews[0]?.feedback && (
                      <p className="mt-1 text-gray-600">
                        {processedPlanData.reviews[0].feedback}
                      </p>
                    )}
                    {processedPlanData.reviews[0]?.reviewed_at && (
                      <p className="mt-2 text-sm text-gray-500">
                        Reviewed on {formatDate(processedPlanData.reviews[0].reviewed_at)} by {processedPlanData.reviews[0].evaluator_name || 'Evaluator'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <h3 className="text-sm font-medium text-gray-500">Total Objectives</h3>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {processedPlanData.objectives?.length || 0}
              </p>
            </div>
            
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <h3 className="text-sm font-medium text-gray-500">Total Initiatives</h3>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {processedPlanData.objectives?.reduce((total: number, obj: any) => 
                  total + (obj?.initiatives?.length || 0), 0) || 0}
              </p>
            </div>
            
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <h3 className="text-sm font-medium text-gray-500">Total Activities</h3>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {processedPlanData.objectives?.reduce((total: number, obj: any) => 
                  total + (obj?.initiatives?.reduce((sum: number, init: any) => 
                    sum + (init?.main_activities?.length || 0), 0) || 0), 0) || 0}
              </p>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex flex-col">
                <h3 className="text-sm font-medium text-gray-500">Total Budget</h3>
                <p className="mt-2 text-3xl font-semibold text-green-600">
                  ${budgetTotals.total.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Strategic Objectives</h2>
            {!processedPlanData.objectives?.length ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-500">No strategic objectives found for this plan.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {processedPlanData.objectives.map((objective: any, index: number) => (
                  <div key={objective?.id || `obj-${index}`} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-medium text-gray-900">{objective?.title || 'Untitled Objective'}</h3>
                        <p className="text-sm text-gray-500">{objective?.description || 'No description'}</p>
                      </div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {objective?.weight || 0}%
                      </span>
                    </div>

                    {!objective?.initiatives?.length ? (
                      <div className="ml-4 mt-3 text-sm text-gray-500 italic">No initiatives found for this objective</div>
                    ) : (
                      <div className="ml-4 mt-4 space-y-3">
                        {objective.initiatives.map((initiative: any, initIndex: number) => (
                          <div key={initiative?.id || `init-${initIndex}`} className="border-l-2 border-gray-200 pl-4">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-gray-900">{initiative?.name || 'Untitled Initiative'}</h4>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                Initiative: {initiative?.weight || 0}%
                              </span>
                            </div>
                            <div className="flex items-center text-sm text-gray-600 mt-1 gap-2">
                              {initiative?.organization_name && (
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
                                  Implementor: {initiative.organization_name}
                                </span>
                              )}
                            </div>
                            
                            {initiative?.performance_measures?.length > 0 ? (
                              <div className="mt-3">
                                <h5 className="text-sm font-medium text-gray-700">Performance Measures</h5>
                                <div className="mt-2 space-y-2 pl-2">
                                  {initiative.performance_measures.map((measure: any, measureIndex: number) => (
                                    <div key={measure?.id || `measure-${measureIndex}`} className="text-sm bg-blue-50 p-3 rounded-lg">
                                      <p className="text-gray-900 font-medium">{measure?.name || 'Untitled Measure'}</p>
                                      <div className="flex items-center">
                                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                                          {measure?.weight || 0}%
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 text-xs text-gray-500">
                                        <div>Baseline: {measure?.baseline || 'N/A'}</div>
                                        <div>Annual Target: {measure?.annual_target || 0}</div>
                                        <div>Q1: {measure?.q1_target || 0}</div>
                                        <div>Q2: {measure?.q2_target || 0}</div>
                                        <div>Q3: {measure?.q3_target || 0}</div>
                                        <div>Q4: {measure?.q4_target || 0}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2 text-xs text-gray-500 italic pl-2">No performance measures</div>
                            )}

                            {initiative?.main_activities?.length > 0 ? (
                              <div className="mt-3">
                                <h5 className="text-sm font-medium text-gray-700">Main Activities</h5>
                                <div className="mt-2 space-y-2 pl-2">
                                  {initiative.main_activities.map((activity: any, actIndex: number) => (
                                    <div key={activity?.id || `activity-${actIndex}`} className="text-sm bg-green-50 p-3 rounded-lg">
                                      <p className="text-gray-900 font-medium">{activity?.name || 'Untitled Activity'}</p>
                                      <div className="flex items-center">
                                        <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                                          {activity?.weight || 0}%
                                        </span>
                                      </div>
                                      <div className="mt-2 text-xs">
                                        <p className="text-gray-600">
                                          Period: {getPeriodString(activity)}
                                        </p>
                                        {activity?.budget && (
                                          <div className="mt-1 grid grid-cols-2 gap-2">
                                            <p className="text-gray-600">
                                              Budget: ${(activity.budget.budget_calculation_type === 'WITH_TOOL' 
                                                ? Number(activity.budget.estimated_cost_with_tool || 0) 
                                                : Number(activity.budget.estimated_cost_without_tool || 0)).toLocaleString()}
                                            </p>
                                            <p className="text-gray-600">
                                              Funding: ${(
                                                Number(activity.budget.government_treasury || 0) +
                                                Number(activity.budget.sdg_funding || 0) +
                                                Number(activity.budget.partners_funding || 0) +
                                                Number(activity.budget.other_funding || 0)
                                              ).toLocaleString()}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2 text-xs text-gray-500 italic pl-2">No main activities</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showReviewForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Review Plan: {organizationName}
            </h3>
            
            <PlanReviewForm
              plan={processedPlanData}
              onSubmit={handleReviewSubmit}
              onCancel={() => setShowReviewForm(false)}
              isSubmitting={isSubmitting || reviewPlanMutation.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanSummary;