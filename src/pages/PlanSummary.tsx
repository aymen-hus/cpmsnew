import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { plans, auth, api } from '../lib/api';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { 
  ArrowLeft, 
  FileSpreadsheet, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Loader, 
  Eye, 
  Building2, 
  User, 
  Calendar,
  Target,
  Activity,
  DollarSign,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import PlanReviewForm from '../components/PlanReviewForm';
import PlanReviewTable from '../components/PlanReviewTable';
import { isEvaluator } from '../types/user';
import { exportToExcel, processDataForExport } from '../lib/utils/export';

const PlanSummary: React.FC = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showCompleteTable, setShowCompleteTable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isUserEvaluator, setIsUserEvaluator] = useState(false);
  const [userOrgIds, setUserOrgIds] = useState<number[]>([]);
  const [processedObjectives, setProcessedObjectives] = useState<any[]>([]);
  const [isLoadingComplete, setIsLoadingComplete] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Check if user has evaluator permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        setIsUserEvaluator(isEvaluator(authData.userOrganizations));
        
        // Get user's organization IDs
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          const orgIds = authData.userOrganizations.map(org => org.organization);
          setUserOrgIds(orgIds);
          console.log('User organization IDs:', orgIds);
        }
      } catch (error) {
        console.error('Failed to check permissions:', error);
        setError('Failed to verify your permissions');
      }
    };
    
    checkPermissions();
  }, [navigate]);

  // Enhanced data fetching function like in PlanPreviewModal
  const fetchCompleteObjectiveData = async () => {
    if (!planData) {
      console.log('No plan data available');
      return [];
    }

    try {
      console.log('Fetching complete objective data for plan:', planData.id);
      
      // Get the main strategic objective from the plan
      const mainObjectiveId = planData.strategic_objective;
      if (!mainObjectiveId) {
        console.log('No strategic objective ID in plan data');
        return [];
      }

      // Fetch the main objective with complete data
      const objectiveResponse = await api.get(`/strategic-objectives/${mainObjectiveId}/`);
      const objective = objectiveResponse.data;
      
      if (!objective) {
        console.log('Failed to fetch main objective');
        return [];
      }

      console.log('Fetched main objective:', objective.title);

      // Fetch initiatives for this objective
      const initiativesResponse = await api.get(`/strategic-initiatives/?objective=${mainObjectiveId}`);
      const initiatives = initiativesResponse.data?.results || initiativesResponse.data || [];
      
      console.log(`Found ${initiatives.length} initiatives for objective ${mainObjectiveId}`);

      // Filter initiatives based on user organization
      const filteredInitiatives = initiatives.filter(initiative => 
        initiative.is_default || 
        !initiative.organization || 
        userOrgIds.includes(Number(initiative.organization))
      );

      console.log(`Filtered to ${filteredInitiatives.length} initiatives for user orgs`);

      // For each initiative, fetch performance measures and main activities
      const enrichedInitiatives = await Promise.all(
        filteredInitiatives.map(async (initiative) => {
          try {
            console.log(`Fetching data for initiative ${initiative.id} (${initiative.name})`);
            
            // Fetch performance measures
            const measuresResponse = await api.get(`/performance-measures/?initiative=${initiative.id}`);
            const measures = measuresResponse.data?.results || measuresResponse.data || [];
            
            // Filter measures by organization
            const filteredMeasures = measures.filter(measure =>
              !measure.organization || userOrgIds.includes(Number(measure.organization))
            );

            // Fetch main activities
            const activitiesResponse = await api.get(`/main-activities/?initiative=${initiative.id}`);
            const activities = activitiesResponse.data?.results || activitiesResponse.data || [];
            
            // Filter activities by organization
            const filteredActivities = activities.filter(activity =>
              !activity.organization || userOrgIds.includes(Number(activity.organization))
            );

            console.log(`Initiative ${initiative.id}: ${filteredMeasures.length} measures, ${filteredActivities.length} activities`);

            return {
              ...initiative,
              performance_measures: filteredMeasures,
              main_activities: filteredActivities
            };
          } catch (error) {
            console.error(`Error fetching data for initiative ${initiative.id}:`, error);
            return {
              ...initiative,
              performance_measures: [],
              main_activities: []
            };
          }
        })
      );

      // Add any additional selected objectives if they exist
      const allObjectives = [objective];
      
      // Check if plan has additional selected objectives
      if (planData.selected_objectives && Array.isArray(planData.selected_objectives)) {
        console.log('Plan has additional selected objectives:', planData.selected_objectives.length);
        
        // Fetch each additional objective
        for (const additionalObj of planData.selected_objectives) {
          if (additionalObj.id === mainObjectiveId) continue; // Skip main objective
          
          try {
            const addObjResponse = await api.get(`/strategic-objectives/${additionalObj.id}/`);
            const addObjective = addObjResponse.data;
            
            // Fetch initiatives for this additional objective
            const addInitiativesResponse = await api.get(`/strategic-initiatives/?objective=${additionalObj.id}`);
            const addInitiatives = addInitiativesResponse.data?.results || addInitiativesResponse.data || [];
            
            const addFilteredInitiatives = addInitiatives.filter(init => 
              init.is_default || !init.organization || userOrgIds.includes(Number(init.organization))
            );

            // Process each additional initiative
            const addEnrichedInitiatives = await Promise.all(
              addFilteredInitiatives.map(async (init) => {
                const [measuresResp, activitiesResp] = await Promise.all([
                  api.get(`/performance-measures/?initiative=${init.id}`).catch(() => ({ data: [] })),
                  api.get(`/main-activities/?initiative=${init.id}`).catch(() => ({ data: [] }))
                ]);

                const measures = measuresResp.data?.results || measuresResp.data || [];
                const activities = activitiesResp.data?.results || activitiesResp.data || [];
                
                return {
                  ...init,
                  performance_measures: measures.filter(m => !m.organization || userOrgIds.includes(Number(m.organization))),
                  main_activities: activities.filter(a => !a.organization || userOrgIds.includes(Number(a.organization)))
                };
              })
            );

            allObjectives.push({
              ...addObjective,
              initiatives: addEnrichedInitiatives
            });
          } catch (error) {
            console.error(`Error fetching additional objective ${additionalObj.id}:`, error);
          }
        }
      }

      // Set effective weight and add initiatives to main objective
      const processedObjectives = allObjectives.map(obj => {
        const effectiveWeight = obj.planner_weight !== undefined && obj.planner_weight !== null
          ? obj.planner_weight
          : obj.weight;

        return {
          ...obj,
          effective_weight: effectiveWeight,
          initiatives: obj.id === mainObjectiveId ? enrichedInitiatives : (obj.initiatives || [])
        };
      });

      console.log(`Successfully processed ${processedObjectives.length} objectives with complete data`);
      return processedObjectives;

    } catch (error) {
      console.error('Error in fetchCompleteObjectiveData:', error);
      return [];
    }
  };

  // Fetch plan data
  const { data: planData, isLoading } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => plans.getById(planId!),
    enabled: !!planId,
  });

  // Review mutation
  const reviewMutation = useMutation({
    mutationFn: async (reviewData: { status: 'APPROVED' | 'REJECTED', feedback: string }) => {
      const response = await api.post(`/plans/${planId}/${reviewData.status.toLowerCase()}/`, {
        feedback: reviewData.feedback
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', planId] });
      setShowReviewModal(false);
      setSuccess('Plan review submitted successfully');
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (error: any) => {
      console.error('Review error:', error);
      setError(error.response?.data?.detail || 'Failed to submit review');
    }
  });

  // Handle showing complete table - same as planner preview
  const handleShowCompleteTable = async () => {
    if (!planData) {
      setError('Plan data not available');
      return;
    }
    
    try {
      setShowCompleteTable(true);
      setIsLoadingComplete(true);
      setError(null);
      
      console.log('Loading complete table data for plan:', planData.id);
      
      // Fetch complete objective data like in planner preview
      const objectives = await fetchCompleteObjectiveData();
      
      console.log('Fetched objectives for table:', objectives.length);
      setProcessedObjectives(objectives);
      
    } catch (error) {
      console.error('Error loading complete table data:', error);
      setError('Failed to load plan data');
    } finally {
      setIsLoadingComplete(false);
    }
  };

  // Handle Excel export
  const handleExportToExcel = () => {
    try {
      setExportError(null);
      
      if (!processedObjectives || processedObjectives.length === 0) {
        setExportError('No data available to export. Please load the complete table first.');
        return;
      }
      
      console.log('Exporting to Excel with data:', processedObjectives.length, 'objectives');
      
      const exportData = processDataForExport(processedObjectives, 'en');
      exportToExcel(
        exportData,
        `plan-${planData?.organization_name || 'organization'}-${new Date().toISOString().slice(0, 10)}`,
        'en',
        {
          organization: planData?.organization_name || 'Unknown Organization',
          planner: planData?.planner_name || 'Unknown Planner',
          fromDate: planData?.from_date || '',
          toDate: planData?.to_date || '',
          planType: planData?.type || 'Unknown Type'
        }
      );
      
      setSuccess('Excel file exported successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Export error:', error);
      setExportError('Failed to export Excel file. Please try again.');
    }
  };

  const handleReviewSubmit = async (data: { status: 'APPROVED' | 'REJECTED'; feedback: string }) => {
    try {
      setError(null);
      await reviewMutation.mutateAsync(data);
    } catch (error) {
      console.error('Failed to submit review:', error);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return dateString;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="h-6 w-6 animate-spin mr-2 text-green-600" />
        <span className="text-lg">Loading plan details...</span>
      </div>
    );
  }

  if (!planData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-red-50 rounded-lg border border-red-200">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">Plan Not Found</h3>
          <p className="text-red-600">The requested plan could not be found.</p>
        </div>
      </div>
    );
  }

  // Check if user can review this plan (evaluator for the same organization)
  const canReview = isUserEvaluator && 
                   userOrgIds.includes(Number(planData.organization)) && 
                   planData.status === 'SUBMITTED';

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-5 w-5 mr-1" />
          Back
        </button>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Plan Details</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="flex items-center">
              <Building2 className="h-5 w-5 text-gray-500 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Organization</p>
                <p className="font-medium">{planData.organization_name}</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <User className="h-5 w-5 text-gray-500 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Planner</p>
                <p className="font-medium">{planData.planner_name}</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <Calendar className="h-5 w-5 text-gray-500 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Period</p>
                <p className="font-medium">
                  {formatDate(planData.from_date)} - {formatDate(planData.to_date)}
                </p>
              </div>
            </div>
            
            <div className="flex items-center">
              <Target className="h-5 w-5 text-gray-500 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Plan Type</p>
                <p className="font-medium">{planData.type}</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <Activity className="h-5 w-5 text-gray-500 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  planData.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                  planData.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
                  planData.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {planData.status}
                </span>
              </div>
            </div>
            
            {planData.submitted_at && (
              <div className="flex items-center">
                <Calendar className="h-5 w-5 text-gray-500 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Submitted</p>
                  <p className="font-medium">{formatDate(planData.submitted_at)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleShowCompleteTable}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <Eye className="h-4 w-4 mr-2" />
              Show Complete Table View
            </button>

            {canReview && (
              <button
                onClick={() => setShowReviewModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Review Plan
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error and Success Messages */}
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

      {exportError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
          <AlertCircle className="h-5 w-5 mr-2" />
          {exportError}
        </div>
      )}

      {/* Plan Reviews Section */}
      {planData.reviews && planData.reviews.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Review History</h2>
          <div className="space-y-4">
            {planData.reviews.map((review: any) => (
              <div key={review.id} className={`p-4 rounded-lg border ${
                review.status === 'APPROVED' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    {review.status === 'APPROVED' ? (
                      <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 mr-2" />
                    )}
                    <span className={`font-medium ${
                      review.status === 'APPROVED' ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {review.status}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500">
                    {formatDate(review.reviewed_at)}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{review.feedback}</p>
                {review.evaluator_name && (
                  <p className="text-xs text-gray-500 mt-1">
                    Reviewed by: {review.evaluator_name}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Complete Table Modal */}
      {showCompleteTable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 z-10 bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">Plan Review Table</h2>
              <div className="flex items-center gap-2">
                {/* Excel Export Button */}
                <button
                  onClick={handleExportToExcel}
                  disabled={!processedObjectives || processedObjectives.length === 0}
                  className="flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export Excel
                </button>
                
                {/* Close Button */}
                <button
                  onClick={() => {
                    setShowCompleteTable(false);
                    setProcessedObjectives([]);
                    setExportError(null);
                  }}
                  className="text-gray-400 hover:text-gray-500 focus:outline-none"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {isLoadingComplete ? (
                <div className="flex flex-col items-center justify-center p-12">
                  <Loader className="h-10 w-10 text-blue-600 animate-spin mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Complete Plan Data</h3>
                  <p className="text-gray-600 text-center">
                    Fetching objectives, initiatives, performance measures, and activities...
                  </p>
                </div>
              ) : processedObjectives.length > 0 ? (
                <div>
                  {/* Use PlanReviewTable with same logic as planner preview */}
                  <PlanReviewTable
                    objectives={processedObjectives}
                    onSubmit={async () => {}}
                    isSubmitting={false}
                    organizationName={planData.organization_name || 'Unknown Organization'}
                    plannerName={planData.planner_name || 'Unknown Planner'}
                    fromDate={planData.from_date || ''}
                    toDate={planData.to_date || ''}
                    planType={planData.type || 'Unknown Type'}
                    isPreviewMode={true}
                    userOrgId={Number(planData.organization)}
                    isViewOnly={true}
                  />
                </div>
              ) : (
                <div className="p-8 text-center bg-yellow-50 rounded-lg border border-yellow-200">
                  <Target className="h-10 w-10 text-yellow-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-yellow-800 mb-2">No Complete Data Available</h3>
                  <p className="text-yellow-700 mb-4">
                    Unable to load complete plan data. The plan may not have objectives with complete initiatives, measures, and activities.
                  </p>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={handleShowCompleteTable}
                      className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
                    >
                      <RefreshCw className="h-4 w-4 inline mr-2" />
                      Try Again
                    </button>
                    <button
                      onClick={() => setShowCompleteTable(false)}
                      className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Review Plan: {planData.organization_name}
            </h3>
            
            <PlanReviewForm
              plan={planData}
              onSubmit={handleReviewSubmit}
              onCancel={() => setShowReviewModal(false)}
              isSubmitting={reviewMutation.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanSummary;