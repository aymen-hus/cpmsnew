import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Calendar, User, Building2, Eye, CheckCircle, XCircle, AlertCircle, Loader, FileSpreadsheet } from 'lucide-react';
import { format } from 'date-fns';
import { plans, objectives, initiatives, performanceMeasures, mainActivities, auth } from '../lib/api';
import { isAdmin, isEvaluator } from '../types/user';
import PlanReviewTable from '../components/PlanReviewTable';
import PlanReviewForm from '../components/PlanReviewForm';
import { processDataForExport, exportToExcel } from '../lib/utils/export';

const PlanSummary: React.FC = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  
  // State management
  const [planObjectives, setPlanObjectives] = useState<any[]>([]);
  const [isLoadingObjectives, setIsLoadingObjectives] = useState(false);
  const [showCompleteTable, setShowCompleteTable] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [canReview, setCanReview] = useState(false);

  // Fetch plan data
  const { data: planData, isLoading, error: planError } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => plans.getById(planId!),
    enabled: !!planId
  });

  // Check user permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }

        const isAdminUser = isAdmin(authData.userOrganizations);
        const isEvaluatorUser = isEvaluator(authData.userOrganizations);
        
        setUserRole(isAdminUser ? 'admin' : isEvaluatorUser ? 'evaluator' : 'user');
        setCanReview(isEvaluatorUser && planData?.status === 'SUBMITTED');
      } catch (error) {
        console.error('Failed to check permissions:', error);
      }
    };

    if (planData) {
      checkPermissions();
    }
  }, [planData, navigate]);

  // WORKING FUNCTION TO FETCH ALL MULTIPLE OBJECTIVES AND THEIR DATA
  const fetchCompleteDataForPlan = async () => {
    try {
      console.log('=== FETCHING ALL MULTIPLE OBJECTIVES ===');
      console.log('Plan Data:', planData);
      
      // STEP 1: Get ALL objective IDs (handle multiple objectives)
      let objectiveIds: number[] = [];
      
      // First try selected_objectives (for multiple objectives)
      if (planData.selected_objectives && planData.selected_objectives.length > 0) {
        objectiveIds = planData.selected_objectives.map(obj => {
          if (obj && obj.id) return Number(obj.id);
          if (typeof obj === 'number') return obj;
          if (typeof obj === 'string') return Number(obj);
          return null;
        }).filter(id => id !== null && !isNaN(id));
        console.log('Found multiple selected objectives:', objectiveIds);
      }
      
      // Fallback to single strategic_objective
      if (objectiveIds.length === 0 && planData.strategic_objective) {
        objectiveIds = [Number(planData.strategic_objective)];
        console.log('Using single strategic objective:', objectiveIds);
      }
      
      if (objectiveIds.length === 0) {
        console.error('ERROR: No objectives found in plan!');
        return [];
      }

      console.log(`Will fetch ${objectiveIds.length} objectives:`, objectiveIds);

      // STEP 2: Fetch ALL objectives from database
      console.log('=== FETCHING ALL OBJECTIVES FROM DATABASE ===');
      const allObjectivesResponse = await objectives.getAll();
      const systemObjectives = allObjectivesResponse?.data || [];
      console.log(`System has ${systemObjectives.length} total objectives`);
      
      // Filter to get only objectives for this plan
      const planObjectives = systemObjectives.filter(obj => 
        objectiveIds.includes(Number(obj.id))
      );
      
      console.log(`Filtered to ${planObjectives.length} plan objectives:`);
      planObjectives.forEach(obj => console.log(`  - ${obj.id}: ${obj.title}`));
      
      if (planObjectives.length === 0) {
        console.error('ERROR: No matching objectives found!');
        return [];
      }

      // STEP 3: For each objective, fetch ALL initiatives
      console.log('=== FETCHING ALL INITIATIVES FOR ALL OBJECTIVES ===');
      const completeObjectives = [];
      
      for (let i = 0; i < planObjectives.length; i++) {
        const objective = planObjectives[i];
        console.log(`\n--- OBJECTIVE ${i + 1}/${planObjectives.length}: ${objective.title} ---`);
        
        try {
          // Fetch ALL initiatives for this objective
          const initiativesResponse = await initiatives.getByObjective(objective.id.toString());
          const allInitiatives = initiativesResponse?.data || [];
          console.log(`Found ${allInitiatives.length} initiatives for objective ${objective.id}`);
          
          if (allInitiatives.length === 0) {
            console.log('No initiatives found, adding objective with empty initiatives');
            completeObjectives.push({
              ...objective,
              effective_weight: objective.planner_weight || objective.weight,
              initiatives: []
            });
            continue;
          }
          
          // STEP 4: For each initiative, fetch ALL measures and activities
          console.log('=== FETCHING ALL MEASURES AND ACTIVITIES ===');
          const completeInitiatives = [];
          
          for (let j = 0; j < allInitiatives.length; j++) {
            const initiative = allInitiatives[j];
            console.log(`Initiative ${j + 1}/${allInitiatives.length}: ${initiative.name} (ID: ${initiative.id})`);
            
            try {
              // Fetch ALL performance measures
              console.log(`  Fetching performance measures...`);
              const measuresResponse = await performanceMeasures.getByInitiative(initiative.id);
              const measures = measuresResponse?.data || [];
              console.log(`  Found ${measures.length} performance measures`);
              
              // Fetch ALL main activities
              console.log(`  Fetching main activities...`);
              const activitiesResponse = await mainActivities.getByInitiative(initiative.id);
              const activities = activitiesResponse?.data || [];
              console.log(`  Found ${activities.length} main activities`);
              
              // Build complete initiative with ALL data
              const completeInitiative = {
                ...initiative,
                performance_measures: measures,
                main_activities: activities
              };
              
              completeInitiatives.push(completeInitiative);
              console.log(`  Initiative completed: ${measures.length} measures + ${activities.length} activities`);
              
            } catch (initiativeError) {
              console.error(`Error processing initiative ${initiative.id}:`, initiativeError);
              // Add empty initiative on error
              completeInitiatives.push({
                ...initiative,
                performance_measures: [],
                main_activities: []
              });
            }
          }
          
          // Build complete objective
          const completeObjective = {
            ...objective,
            effective_weight: objective.planner_weight || objective.weight,
            initiatives: completeInitiatives
          };
          
          completeObjectives.push(completeObjective);
          console.log(`Objective completed: ${completeInitiatives.length} complete initiatives`);
          
        } catch (objectiveError) {
          console.error(`Error processing objective ${objective.id}:`, objectiveError);
          // Add empty objective on error
          completeObjectives.push({
            ...objective,
            effective_weight: objective.planner_weight || objective.weight,
            initiatives: []
          });
        }
      }
      
      console.log('=== FINAL COMPLETE DATA STRUCTURE ===');
      console.log(`Built ${completeObjectives.length} complete objectives`);
      
      // Log final summary
      let totalInitiatives = 0;
      let totalMeasures = 0; 
      let totalActivities = 0;
      
      completeObjectives.forEach((obj, index) => {
        const objInitiatives = obj.initiatives?.length || 0;
        const objMeasures = obj.initiatives?.reduce((sum, init) => sum + (init.performance_measures?.length || 0), 0) || 0;
        const objActivities = obj.initiatives?.reduce((sum, init) => sum + (init.main_activities?.length || 0), 0) || 0;
        
        totalInitiatives += objInitiatives;
        totalMeasures += objMeasures;
        totalActivities += objActivities;
        
        console.log(`FINAL - Objective ${index + 1}: ${obj.title}`);
        console.log(`  Initiatives: ${objInitiatives}`);
        console.log(`  Measures: ${objMeasures}`);
        console.log(`  Activities: ${objActivities}`);
      });
      
      console.log(`GRAND TOTAL: ${totalInitiatives} initiatives, ${totalMeasures} measures, ${totalActivities} activities`);
      console.log('Data ready for PlanReviewTable display');
      
      return completeObjectives;
      
    } catch (error) {
      console.error('FATAL ERROR in fetchCompleteDataForPlan:', error);
      throw error;
    }
  };

  // Handle showing complete table with all objectives data
  const handleShowCompleteTable = async () => {
    try {
      setIsLoadingObjectives(true);
      setError(null);
      console.log('=== USER CLICKED - STARTING COMPLETE DATA FETCH ===');
      
      const objectivesData = await fetchCompleteDataForPlan();
      console.log('=== SUCCESS - DATA FETCHED ===');
      console.log(`Setting ${objectivesData.length} complete objectives in state`);
      
      setPlanObjectives(objectivesData);
      setShowCompleteTable(true);
      console.log('Modal opened with complete data');
      
    } catch (error) {
      console.error('=== FAILED TO LOAD DATA ===', error);
      setError(`Failed to load plan data: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoadingObjectives(false);
    }
  };

  // Handle Excel export
  const handleExportToExcel = () => {
    if (!planObjectives || planObjectives.length === 0) {
      console.warn('No plan objectives to export');
      setError('No data available to export. Please load the complete plan data first.');
      return;
    }
    
    console.log('Exporting objectives to Excel:', planObjectives.length);
    const exportData = processDataForExport(planObjectives, 'en');
    exportToExcel(
      exportData,
      `plan-${planData.id}-${new Date().toISOString().slice(0, 10)}`,
      'en',
      {
        organization: planData.organization_name || 'Unknown Organization',
        planner: planData.planner_name || 'Unknown Planner',
        fromDate: planData.from_date || '',
        toDate: planData.to_date || '',
        planType: planData.type || 'Unknown Type'
      }
    );
  };

  // Handle plan review submission
  const handleReviewSubmit = async (reviewData: { status: 'APPROVED' | 'REJECTED'; feedback: string }) => {
    try {
      setError(null);
      
      if (reviewData.status === 'APPROVED') {
        await plans.approvePlan(planId!, reviewData.feedback);
      } else {
        await plans.rejectPlan(planId!, reviewData.feedback);
      }
      
      setSuccess('Plan review submitted successfully');
      setShowReviewModal(false);
      
      // Refresh plan data
      window.location.reload();
    } catch (error: any) {
      console.error('Error submitting review:', error);
      setError(error.message || 'Failed to submit review');
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
        <Loader className="h-8 w-8 animate-spin mr-2 text-blue-600" />
        <span className="text-lg">Loading plan details...</span>
      </div>
    );
  }

  if (planError || !planData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-red-50 rounded-lg border border-red-200">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">Plan Not Found</h3>
          <p className="text-red-600">The requested plan could not be found or you don't have permission to view it.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-5 w-5 mr-1" />
          Back to Dashboard
        </button>
        
        <h1 className="text-2xl font-bold text-gray-900">Plan Summary</h1>
        <p className="text-gray-600">View plan details and complete data</p>
      </div>

      {/* Plan Header Info */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
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
              <p className="font-medium">{formatDate(planData.from_date)} - {formatDate(planData.to_date)}</p>
            </div>
          </div>
          
          <div className="flex items-center">
            <div className="mr-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                planData.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                planData.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
                planData.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {planData.status}
              </span>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
            </div>
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

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mt-4">
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
              onSubmit={handleReviewSubmit}
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