import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { plans, auth, objectives, initiatives, performanceMeasures, mainActivities } from '../lib/api';
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
  DollarSign
} from 'lucide-react';
import { format } from 'date-fns';
import PlanReviewForm from '../components/PlanReviewForm';
import PlanReviewTable from '../components/PlanReviewTable';
import { isEvaluator, isAdmin } from '../types/user';
import { exportToExcel, processDataForExport } from '../lib/utils/export';

const PlanSummary: React.FC = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showCompleteTable, setShowCompleteTable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isUserEvaluator, setIsUserEvaluator] = useState(false);
  const [isUserAdmin, setIsUserAdmin] = useState(false);
  const [planObjectives, setPlanObjectives] = useState<any[]>([]);
  const [isLoadingObjectives, setIsLoadingObjectives] = useState(false);

  // Check user permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        setIsUserEvaluator(isEvaluator(authData.userOrganizations));
        setIsUserAdmin(isAdmin(authData.userOrganizations));
      } catch (error) {
        console.error('Failed to check permissions:', error);
        setError('Failed to verify your permissions');
      }
    };
    
    checkPermissions();
  }, [navigate]);

  // Fetch plan data
  const { data: planData, isLoading } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => plans.getById(planId!),
    enabled: !!planId,
  });

  // Fixed simple function to fetch all objectives and their complete data
  const fetchAllObjectivesData = async () => {
    try {
      setIsLoadingObjectives(true);
      setError(null);
      
      console.log('=== FETCHING ALL OBJECTIVES DATA FOR PLAN ===');
      
      // Step 1: Get objective IDs - try multiple sources
      let objectiveIds: string[] = [];
      
      // Method 1: Check selected_objectives array
      if (planData?.selected_objectives && Array.isArray(planData.selected_objectives)) {
        objectiveIds = planData.selected_objectives.map((obj: any) => String(obj.id || obj));
        console.log('Using selected_objectives:', objectiveIds);
      } else if (planData?.strategic_objective) {
        // Method 2: Fallback to single strategic_objective
        objectiveIds = [String(planData.strategic_objective)];
        console.log('Using single strategic_objective:', objectiveIds);
      }
      
      if (objectiveIds.length === 0) {
        console.log('No objectives found for this plan');
        setPlanObjectives([]);
        return;
      }
      
      console.log(`Processing ${objectiveIds.length} objectives`);
      
      // Step 2: Fetch ALL objectives from system
      const objectivesResponse = await objectives.getAll();
      const allObjectives = objectivesResponse?.data || [];
      
      if (!Array.isArray(allObjectives)) {
        console.error('Invalid objectives data');
        setPlanObjectives([]);
        return;
      }
      
      // Step 3: Filter to get only objectives for this plan
      const planObjectivesList = allObjectives.filter((obj: any) => 
        objectiveIds.includes(String(obj.id))
      );
      
      console.log(`Found ${planObjectivesList.length} matching objectives`);
      
      // Step 4: For each objective, get ALL its data
      const enrichedObjectives = [];
      
      for (const objective of planObjectivesList) {
        console.log(`Processing objective: ${objective.title}`);
      
        // Get ALL initiatives for this objective
        const initiativesResponse = await initiatives.getByObjective(objective.id);
        const objectiveInitiatives = initiativesResponse?.data || [];
      
        console.log(`Found ${objectiveInitiatives.length} initiatives`);
        
        // For each initiative, get measures and activities
        const completeInitiatives = [];
        
        for (const initiative of objectiveInitiatives) {
          console.log(`Processing initiative: ${initiative.name}`);
        
          // Get measures and activities in parallel
          const [measuresResponse, activitiesResponse] = await Promise.all([
            performanceMeasures.getByInitiative(initiative.id),
            mainActivities.getByInitiative(initiative.id)
          ]);
        
          const measures = measuresResponse?.data || [];
          const activities = activitiesResponse?.data || [];
          
          console.log(`Initiative ${initiative.name}: ${measures.length} measures, ${activities.length} activities`);
          
          completeInitiatives.push({
            ...initiative,
            performance_measures: measures,
            main_activities: activities
          });
        }
        
        // Add complete objective
        enrichedObjectives.push({
          ...objective,
          effective_weight: objective.planner_weight || objective.weight,
          initiatives: completeInitiatives
        });
        
        console.log(`Completed objective: ${objective.title} with ${completeInitiatives.length} initiatives`);
      }
      
      console.log(`=== COMPLETED: ${enrichedObjectives.length} objectives with complete data ===`);
      
      setPlanObjectives(enrichedObjectives);
      
    } catch (error) {
      console.error('Error fetching objectives data:', error);
      setError('Failed to load plan data. Please try again.');
      setPlanObjectives([]);
    } finally {
      setIsLoadingObjectives(false);
    }
  };

  // Handle showing complete table - simple version
  const handleShowCompleteTable = async () => {
    setShowCompleteTable(true);
    await fetchAllObjectivesData();
  };

  // Handle Excel export - simple version
  const handleExportToExcel = () => {
    try {
      if (!planObjectives || planObjectives.length === 0) {
        setError('No data available to export. Please load the complete table first.');
        return;
      }
      
      const exportData = processDataForExport(planObjectives, 'en');
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
      setError('Failed to export Excel file. Please try again.');
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

  // Check if user can review this plan
  const canReview = isUserEvaluator && planData.status === 'SUBMITTED';

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
              disabled={isLoadingObjectives}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              {isLoadingObjectives ? (
                <>
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Show Complete Plan Data
                </>
              )}
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
              <h2 className="text-xl font-bold text-gray-900">Complete Plan Data</h2>
              <div className="flex items-center gap-2">
                {/* Excel Export Button */}
                <button
                  onClick={handleExportToExcel}
                  disabled={!planObjectives || planObjectives.length === 0}
                  className="flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export Excel
                </button>
                
                {/* Close Button */}
                <button
                  onClick={() => {
                    setShowCompleteTable(false);
                    setPlanObjectives([]);
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
              {isLoadingObjectives ? (
                <div className="p-12 text-center">
                  <Loader className="h-10 w-10 mx-auto text-green-500 animate-spin" />
                  <p className="mt-4 text-gray-600 text-lg">Loading complete plan data...</p>
                  <p className="mt-2 text-sm text-gray-500">
                    Fetching all objectives, initiatives, measures, and activities...
                  </p>
                </div>
              ) : planObjectives.length > 0 ? (
                <div>
                  {/* Data Summary */}
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="text-sm font-medium text-blue-800 mb-2">Plan Data Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-blue-600">Organization:</span>
                        <span className="font-medium ml-1">{planData.organization_name}</span>
                      </div>
                      <div>
                        <span className="text-blue-600">Objectives:</span>
                        <span className="font-medium ml-1">{planObjectives.length}</span>
                      </div>
                      <div>
                        <span className="text-blue-600">Total Initiatives:</span>
                        <span className="font-medium ml-1">
                          {planObjectives.reduce((sum, obj) => sum + (obj.initiatives?.length || 0), 0)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Plan Review Table */}
                  <PlanReviewTable
                    objectives={planObjectives}
                    onSubmit={async () => {}}
                    isSubmitting={false}
                    organizationName={planData.organization_name || 'Unknown Organization'}
                    plannerName={planData.planner_name || 'Unknown Planner'}
                    fromDate={planData.from_date || ''}
                    toDate={planData.to_date || ''}
                    planType={planData.type || 'Unknown Type'}
                    isPreviewMode={true}
                    userOrgId={null}
                    isViewOnly={true}
                  />
                </div>
              ) : (
                <div className="p-8 text-center bg-yellow-50 rounded-lg border border-yellow-200">
                  <AlertCircle className="h-10 w-10 text-yellow-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-yellow-800 mb-2">No Plan Data Available</h3>
                  <p className="text-yellow-700 mb-4">
                    No objectives were found for this plan or there was an error loading the data.
                  </p>
                  <button
                    onClick={handleShowCompleteTable}
                    className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 transition-colors"
                  >
                    Try Loading Again
                  </button>
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
              onSubmit={async () => {}}
              onCancel={() => setShowReviewModal(false)}
              isSubmitting={false}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanSummary;