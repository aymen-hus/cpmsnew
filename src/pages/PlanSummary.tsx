import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { plans, auth, api, objectives, initiatives, performanceMeasures, mainActivities } from '../lib/api';
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
  DollarSign
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
  const [allOrganizationObjectives, setAllOrganizationObjectives] = useState<any[]>([]);
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

  // Function to fetch ALL objectives for the organization
  const fetchSelectedObjectives = async (organizationId: number) => {
    try {
      console.log(`=== Fetching SELECTED objectives for plan ${planId} ===`);
      setIsLoadingComplete(true);
      
      // Step 1: Get only the objectives selected for this plan
      console.log('Step 1: Identifying selected objectives for this plan...');
      
      let selectedObjectiveIds: string[] = [];
      
      // Get the main strategic objective
      if (planData?.strategic_objective) {
        const mainObjId = String(planData.strategic_objective);
        selectedObjectiveIds.push(mainObjId);
        console.log('Added main strategic objective:', mainObjId);
      }
      
      // Get ALL additional selected objectives if they exist
      if (planData?.selected_objectives && Array.isArray(planData.selected_objectives)) {
        const additionalIds = planData.selected_objectives
          .filter((obj: any) => obj && (obj.id || obj))
          .map((obj: any) => {
            const id = typeof obj === 'object' ? obj.id : obj;
            return String(id);
          })
          .filter(Boolean); // Remove empty strings
        
        console.log('Additional selected objective IDs:', additionalIds);
        selectedObjectiveIds = [...selectedObjectiveIds, ...additionalIds];
      } else if (planData?.selected_objectives && typeof planData.selected_objectives === 'object') {
        // Handle case where selected_objectives is a single object
        if (planData.selected_objectives.id || planData.selected_objectives) {
          const objId = String(planData.selected_objectives.id || planData.selected_objectives);
          if (objId) selectedObjectiveIds.push(objId);
          console.log('Added single selected objective:', objId);
        }
      }
      
      // Also check if there are selected objectives in the plan data directly
      if (planData?.objectives && Array.isArray(planData.objectives)) {
        const directObjectiveIds = planData.objectives
          .filter((obj: any) => obj && (obj.id || obj))
          .map((obj: any) => {
            const id = typeof obj === 'object' ? obj.id : obj;
            return String(id);
          })
          .filter(Boolean); // Remove empty strings
        
        console.log('Direct objective IDs:', directObjectiveIds);
        selectedObjectiveIds = [...selectedObjectiveIds, ...directObjectiveIds];
      }
      
      // Remove duplicates
      selectedObjectiveIds = [...new Set(selectedObjectiveIds)].filter(Boolean);
      
      console.log('🎯 FINAL selected objective IDs for this plan:', selectedObjectiveIds);
      console.log('📊 Plan data structure for debugging:', {
        plan_id: planId,
        strategic_objective: planData?.strategic_objective,
        selected_objectives_type: typeof planData?.selected_objectives,
        selected_objectives_length: Array.isArray(planData?.selected_objectives) ? planData.selected_objectives.length : 'not array',
        selected_objectives_sample: planData?.selected_objectives,
        objectives_length: Array.isArray(planData?.objectives) ? planData.objectives.length : 'not array'
      });
      
      if (selectedObjectiveIds.length === 0) {
        console.error('❌ No selected objectives found for this plan');
        
        // Fallback: if no selected objectives found, try to use the main strategic_objective
        if (planData?.strategic_objective) {
          const fallbackId = String(planData.strategic_objective);
          console.warn('🔄 Fallback: Using main strategic_objective as selected:', fallbackId);
          selectedObjectiveIds = [fallbackId];
        } else {
          console.error('❌ No fallback available, returning empty array');
          return [];
        }
      }
      
      // Step 2: Fetch only the selected objectives
      console.log(`Step 2: Fetching ${selectedObjectiveIds.length} selected objectives from system...`);
      const objectivesResponse = await objectives.getAll();
      const allObjectives = objectivesResponse?.data || [];
      
      // Filter to only selected objectives
      const selectedObjectives = allObjectives.filter((obj: any) => 
        const objId = String(obj.id);
        const isSelected = selectedObjectiveIds.includes(objId);
        if (isSelected) {
          console.log(`✅ Found selected objective: ${objId} (${obj.title})`);
        }
        return isSelected;
      );
      
      console.log(`🎯 PRODUCTION CHECK: Found ${selectedObjectives.length} selected objectives out of ${allObjectives.length} total objectives`);
      
      if (selectedObjectives.length !== selectedObjectiveIds.length) {
        console.warn('⚠️ MISMATCH: Expected', selectedObjectiveIds.length, 'objectives but found', selectedObjectives.length);
        console.warn('🔍 Looking for IDs:', selectedObjectiveIds);
        console.warn('📋 Available objective IDs in system:', allObjectives.slice(0, 10).map(obj => String(obj.id)));
      }
      
      if (selectedObjectives.length === 0) {
        console.error('❌ PRODUCTION ERROR: No matching objectives found in system for selected IDs:', selectedObjectiveIds);
        console.error('📋 Available objective IDs in system (first 20):', allObjectives.slice(0, 20).map(obj => `${obj.id} (${obj.title})`));
        console.error('🔍 Selected IDs we were looking for:', selectedObjectiveIds);
        console.error('📊 Data type comparison:', {
          selected_sample: selectedObjectiveIds[0],
          available_sample: allObjectives[0]?.id,
          selected_type: typeof selectedObjectiveIds[0],
          available_type: typeof allObjectives[0]?.id
        });
        return [];
      }
      
      // Step 3: Get ALL initiatives from the system
      console.log('Step 3: Fetching ALL initiatives from system...');
      const initiativesResponse = await initiatives.getAll();
      const allInitiatives = initiativesResponse?.data || [];
      console.log(`📊 Found ${allInitiatives.length} total initiatives in system`);
      
      // Step 4: Filter initiatives for this organization and selected objectives
      const orgInitiatives = allInitiatives.filter(initiative => 
        // Check if initiative belongs to organization
        const belongsToOrg = initiative.is_default || 
                           !initiative.organization || 
                           initiative.organization === organizationId;
        
        // Check if initiative belongs to selected objectives
        const belongsToSelectedObjective = initiative.strategic_objective && 
          selectedObjectiveIds.includes(String(initiative.strategic_objective));
        
        const shouldInclude = belongsToOrg && belongsToSelectedObjective;
        
        if (shouldInclude) {
          console.log(`✅ Including initiative: ${initiative.name} (objective: ${initiative.strategic_objective})`);
        }
        
        return shouldInclude;
      );
      console.log(`🎯 PRODUCTION: Filtered to ${orgInitiatives.length} initiatives for organization ${organizationId} and selected objectives`);
      
      // Step 5: Group initiatives by objective
      const objectiveInitiativesMap: Record<string, any[]> = {};
      orgInitiatives.forEach(initiative => {
        const objectiveId = String(initiative.strategic_objective);
        if (objectiveId) {
          if (!objectiveInitiativesMap[objectiveId]) {
            objectiveInitiativesMap[objectiveId] = [];
          }
          objectiveInitiativesMap[objectiveId].push(initiative);
        }
      });
      
      console.log('📊 Initiatives grouped by selected objectives:', Object.keys(objectiveInitiativesMap).length, 'objectives have initiatives');
      
      // Step 6: Process each selected objective
      const enrichedObjectives = [];
      
      for (const objective of selectedObjectives) {
        console.log(`📋 Processing SELECTED objective: ${objective.id} (${objective.title})`);
        
        const objectiveInitiatives = objectiveInitiativesMap[String(objective.id)] || [];
        
        console.log(`  ├── Found ${objectiveInitiatives.length} initiatives for this SELECTED objective`);
        
        // Process initiatives for this objective
        const enrichedInitiatives = [];
        
        for (const initiative of objectiveInitiatives) {
          try {
            console.log(`    ├── Processing initiative: ${initiative.id} (${initiative.name})`);
            
            // Fetch performance measures
            const measuresResponse = await performanceMeasures.getByInitiative(initiative.id);
            const allMeasures = measuresResponse?.data || [];
            const filteredMeasures = allMeasures.filter(measure =>
              !measure.organization || measure.organization === organizationId
            );

            // Fetch main activities
            const activitiesResponse = await mainActivities.getByInitiative(initiative.id);
            const allActivities = activitiesResponse?.data || [];
            const filteredActivities = allActivities.filter(activity =>
              !activity.organization || activity.organization === organizationId
            );

            console.log(`      ├── ${filteredMeasures.length} measures, ${filteredActivities.length} activities`);

            enrichedInitiatives.push({
              ...initiative,
              performance_measures: filteredMeasures,
              main_activities: filteredActivities
            });
            
            // Small delay to prevent server overload
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.error(`    ❌ Error fetching data for initiative ${initiative.id}:`, error);
            // Add initiative with empty data instead of skipping
            enrichedInitiatives.push({
              ...initiative,
              performance_measures: [],
              main_activities: []
            });
          }
        }
        
        // Set effective weight
        const effectiveWeight = objective.planner_weight !== undefined && objective.planner_weight !== null
          ? objective.planner_weight
          : objective.weight;

        enrichedObjectives.push({
          ...objective,
          effective_weight: effectiveWeight,
          initiatives: enrichedInitiatives
        });
        
        console.log(`  ✅ Completed objective ${objective.id}: ${enrichedInitiatives.length} enriched initiatives`);
        
        // Small delay between objectives
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log(`=== ✅ PRODUCTION FINAL RESULT: ${enrichedObjectives.length} SELECTED objectives processed ===`);
      const totalInitiatives = enrichedObjectives.reduce((sum, obj) => sum + (obj.initiatives?.length || 0), 0);
      console.log(`📊 Total initiatives across SELECTED objectives: ${totalInitiatives}`);
      console.log(`🎯 Selected objective titles:`, enrichedObjectives.map(obj => obj.title));
      
      return enrichedObjectives;
    } catch (error) {
      console.error('❌ PRODUCTION Error in fetchSelectedObjectives:', error);
      throw error;
    } finally {
      setIsLoadingComplete(false);
    }
  };

  // Fetch complete table data when requested
  const handleShowCompleteTable = async () => {
    if (!planData?.organization) {
      setError('Plan organization data not available');
      return;
    }
    
    try {
      setShowCompleteTable(true);
      setError(null);
      
      const completeObjectives = await fetchSelectedObjectives(Number(planData.organization));
      setAllOrganizationObjectives(completeObjectives);
    } catch (error) {
      console.error('Error fetching complete data:', error);
      setError('Failed to load selected objectives data');
    }
  };

  // Handle Excel export
  const handleExportToExcel = () => {
    try {
      setExportError(null);
      
      if (!allOrganizationObjectives || allOrganizationObjectives.length === 0) {
        setExportError('No data available to export. Please load the complete table first.');
        return;
      }
      
      console.log('Exporting to Excel with data:', allOrganizationObjectives.length, 'objectives');
      
      const exportData = processDataForExport(allOrganizationObjectives, 'en');
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
              disabled={isLoadingComplete}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              {isLoadingComplete ? (
                <>
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                  Loading Complete Data...
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Show Complete Table View
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
              <h2 className="text-xl font-bold text-gray-900">Complete Organization Data</h2>
              <div className="flex items-center gap-2">
                {/* Excel Export Button */}
                <button
                  onClick={handleExportToExcel}
                  disabled={!allOrganizationObjectives || allOrganizationObjectives.length === 0}
                  className="flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export Excel
                </button>
                
                {/* Close Button */}
                <button
                  onClick={() => {
                    setShowCompleteTable(false);
                    setAllOrganizationObjectives([]);
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
                <div className="p-12 text-center">
                  <Loader className="h-10 w-10 mx-auto text-green-500 animate-spin" />
                  <p className="mt-4 text-gray-600 text-lg">Loading complete organization data...</p>
                  <p className="mt-2 text-sm text-gray-500">
                    Fetching all objectives, initiatives, measures, and activities...
                  </p>
                </div>
              ) : allOrganizationObjectives.length > 0 ? (
                <div>
                  {/* Data Summary */}
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="text-sm font-medium text-blue-800 mb-2">Data Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-blue-600">Organization:</span>
                        <span className="font-medium ml-1">{planData.organization_name}</span>
                      </div>
                      <div>
                        <span className="text-blue-600">Total Objectives:</span>
                        <span className="font-medium ml-1">{allOrganizationObjectives.length}</span>
                      </div>
                      <div>
                        <span className="text-blue-600">Total Initiatives:</span>
                        <span className="font-medium ml-1">
                          {allOrganizationObjectives.reduce((sum, obj) => sum + (obj.initiatives?.length || 0), 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-blue-600">Organization ID:</span>
                        <span className="font-medium ml-1">{planData.organization}</span>
                      </div>
                    </div>
                  </div>

                  {/* Complete Table */}
                  <PlanReviewTable
                    objectives={allOrganizationObjectives}
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
                  <AlertCircle className="h-10 w-10 text-yellow-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-yellow-800 mb-2">No Complete Data Available</h3>
                  <p className="text-yellow-700 mb-4">
                    No objectives with complete data found for this organization.
                  </p>
                  <button
                    onClick={handleShowCompleteTable}
                    className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 transition-colors"
                  >
                    Retry Loading Data
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
              isSubmitting={reviewMutation.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanSummary;