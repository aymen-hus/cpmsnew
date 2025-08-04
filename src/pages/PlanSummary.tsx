-green-800' :
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

  // Simple function to fetch ALL objectives data for the plan
  const fetchAllObjectivesData = async () => {
    try {
      console.log('=== FETCHING COMPLETE PLAN DATA ===');
      console.log('Plan data:', planData);
      
      // Get objective IDs - handle both single and multiple objectives
      let objectiveIds: string[] = [];
      
      if (planData.selected_objectives && planData.selected_objectives.length > 0) {
        // Handle both array of objects and array of IDs
        objectiveIds = planData.selected_objectives.map(obj => {
          if (typeof obj === 'object' && obj.id) {
            return obj.id.toString();
          } else if (typeof obj === 'string' || typeof obj === 'number') {
            return obj.toString();
          }
          return null;
        }).filter(Boolean);
      } else if (planData.strategic_objective) {
        objectiveIds = [planData.strategic_objective.toString()];
      }
      
      console.log('Objective IDs to fetch:', objectiveIds);
      
      if (objectiveIds.length === 0) {
        console.log('No objective IDs found, returning empty array');
        return [];
      }

      // Fetch all objectives from system
      console.log('Fetching all objectives from system...');
      const allObjectivesResponse = await objectives.getAll();
      const allObjectives = allObjectivesResponse?.data || [];
      console.log(`Found ${allObjectives.length} total objectives in system`);
      
      // Filter to get only objectives for this plan
      const planObjectives = allObjectives.filter(obj => 
        objectiveIds.includes(obj.id.toString())
      );
      
      console.log(`Filtered to ${planObjectives.length} objectives for this plan:`, 
        planObjectives.map(obj => `${obj.id}: ${obj.title}`));
      
      if (planObjectives.length === 0) {
        console.warn('No matching objectives found for plan!');
        return [];
      }

      // For each objective, get ALL its data
      console.log('=== FETCHING COMPLETE DATA FOR EACH OBJECTIVE ===');
      const enrichedObjectives = await Promise.all(
        planObjectives.map(async (objective, index) => {
          try {
            console.log(`\n--- Processing Objective ${index + 1}/${planObjectives.length}: ${objective.title} (ID: ${objective.id}) ---`);
            
            // Get ALL initiatives for this objective (no filtering by organization)
            const initiativesResponse = await initiatives.getByObjective(objective.id.toString());
            const objectiveInitiatives = initiativesResponse?.data || [];
            console.log(`Found ${objectiveInitiatives.length} initiatives for objective ${objective.id}`);
            
            if (objectiveInitiatives.length === 0) {
              console.log(`No initiatives found for objective ${objective.id}`);
              return {
                ...objective,
                effective_weight: objective.planner_weight || objective.weight,
                initiatives: []
              };
            }

            // For each initiative, get ALL measures and activities
            console.log('Fetching measures and activities for each initiative...');
            const enrichedInitiatives = await Promise.all(
              objectiveInitiatives.map(async (initiative, initIndex) => {
                try {
                  console.log(`  Initiative ${initIndex + 1}: ${initiative.name} (ID: ${initiative.id})`);
                  
                  // Fetch both measures and activities in parallel
                  const [measuresResponse, activitiesResponse] = await Promise.all([
                    performanceMeasures.getByInitiative(initiative.id),
                    mainActivities.getByInitiative(initiative.id)
                  ]);
                  
                  const measures = measuresResponse?.data || [];
                  const activities = activitiesResponse?.data || [];
                  
                  console.log(`    Found ${measures.length} measures and ${activities.length} activities`);
                  
                  return {
                    ...initiative,
                    performance_measures: measures,
                    main_activities: activities
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
            
            console.log(`Completed objective ${objective.id} with ${enrichedInitiatives.length} enriched initiatives`);
            
            return {
              ...objective,
              effective_weight: objective.planner_weight || objective.weight,
              initiatives: enrichedInitiatives
            };
          } catch (error) {
            console.error(`Error processing objective ${objective.id}:`, error);
            return {
              ...objective,
              effective_weight: objective.weight,
              initiatives: []
            };
          }
        })
      );
      
      console.log('=== FINAL RESULT ===');
      console.log(`Successfully processed ${enrichedObjectives.length} objectives`);
      
      // Log summary of what we got
      enrichedObjectives.forEach((obj, index) => {
        const totalInitiatives = obj.initiatives?.length || 0;
        const totalMeasures = obj.initiatives?.reduce((sum, init) => sum + (init.performance_measures?.length || 0), 0) || 0;
        const totalActivities = obj.initiatives?.reduce((sum, init) => sum + (init.main_activities?.length || 0), 0) || 0;
        console.log(`Objective ${index + 1}: ${obj.title} - ${totalInitiatives} initiatives, ${totalMeasures} measures, ${totalActivities} activities`);
      });
      
      return enrichedObjectives;
    } catch (error) {
      console.error('Error in fetchAllObjectivesData:', error);
      throw error; // Re-throw to show error in UI
    }
  };

  // Handle showing complete table with all objectives data
  const handleShowCompleteTable = async () => {
    try {
      setIsLoadingObjectives(true);
      setError(null);
      console.log('Loading complete objectives data...');
      
      const objectivesData = await fetchAllObjectivesData();
      console.log('Setting plan objectives:', objectivesData);
      setPlanObjectives(objectivesData);
    } catch (error) {
      console.error('Error loading complete objectives data:', error);
      setError('Failed to load complete plan data. Please try again.');
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