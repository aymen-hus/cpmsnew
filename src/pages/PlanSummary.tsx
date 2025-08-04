import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { plans, auth, initiatives, performanceMeasures, mainActivities } from '../lib/api';
import { ArrowLeft, Loader, AlertCircle, Eye, FileSpreadsheet, Calendar, User, Building2, Target } from 'lucide-react';
import PlanReviewTable from '../components/PlanReviewTable';
import { format } from 'date-fns';

interface StrategicObjective {
  id: number;
  title: string;
  weight?: number;
  planner_weight?: number;
  effective_weight?: number;
  programs?: any[];
  initiatives?: any[];
}

const PlanSummary: React.FC = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const [userOrgId, setUserOrgId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get current user data
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          setUserOrgId(authData.userOrganizations[0].organization);
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        setError('Failed to load user information');
      }
    };
    
    fetchUserData();
  }, [navigate]);

  // Normalize and process plan data to ensure proper structure
  const normalizeAndProcessPlanData = (plan: any) => {
    if (!plan) return plan;
    
    const processedPlan = JSON.parse(JSON.stringify(plan));
    
    try {
      console.log('=== NORMALIZING PLAN DATA ===');
      console.log('Plan ID:', plan.id);
      console.log('Plan organization:', plan.organization);
      console.log('Raw plan objectives:', plan.objectives?.length || 0);
      
      // Ensure all expected arrays exist and are properly formatted
      if (!Array.isArray(processedPlan.objectives)) {
        processedPlan.objectives = processedPlan.objectives 
          ? (Array.isArray(processedPlan.objectives) ? processedPlan.objectives : [processedPlan.objectives])
          : [];
      }

      // Process objectives and ensure planner-specific weights are preserved
      processedPlan.objectives = processedPlan.objectives.map((objective: any) => {
        if (!objective) return objective;
        
        console.log(`Processing objective ${objective.id} (${objective.title}):`, {
          weight: objective.weight,
          planner_weight: objective.planner_weight,
          effective_weight: objective.effective_weight
        });
        
        // PRESERVE THE PLAN-SPECIFIC WEIGHT (this is what the planner selected for THIS plan)
        // Don't overwrite with fresh data - use what was saved with the plan
        console.log(`Preserving plan-specific weight for objective ${objective.id}: ${objective.effective_weight || objective.planner_weight || objective.weight}`);
        
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

          return initiative;
        });

        return objective;
      });

      console.log('Processed plan objectives:', processedPlan.objectives.length);
      return processedPlan;
    } catch (error) {
      console.error('Error normalizing plan data:', error);
      return plan;
    }
  };

  // Comprehensive data fetching function
  const fetchCompleteObjectiveData = async (objectivesList: StrategicObjective[]) => {
    if (!objectivesList || !objectivesList.length) {
      console.log('No objectives provided to fetch data for');
      return [];
    }

    try {
      console.log('=== ENRICHING PLAN-SPECIFIC OBJECTIVES (PRESERVING WEIGHTS) ===');
      console.log(`Processing ${objectivesList.length} objectives:`, objectivesList.map(obj => `${obj.id}: ${obj.title}`));
      
      const enrichedObjectives = await Promise.all(
        objectivesList.map(async (objective) => {
          try {
            console.log(`\n--- Processing Objective: ${objective.title} (ID: ${objective.id}) ---`);
            console.log(`PRESERVING plan-specific weight for ${objective.id}:`, {
              weight: objective.weight,
              planner_weight: objective.planner_weight,
              effective_weight: objective.effective_weight
            });
            
            // CRITICAL: Use the objective data AS-IS from the plan
            // DO NOT fetch fresh objective data as it will overwrite plan-specific weights
            
            // Get ALL initiatives for this objective
            const directInitiativesResponse = await initiatives.getByObjective(objective.id.toString());
            let allObjectiveInitiatives = directInitiativesResponse?.data || [];
            console.log(`Found ${allObjectiveInitiatives.length} initiatives`);
            
            // Also check programs if objective has them
            if (objective.programs && Array.isArray(objective.programs)) {
              console.log(`Checking ${objective.programs.length} programs for additional initiatives`);
              for (const program of objective.programs) {
                try {
                  const programInitiativesResponse = await initiatives.getByProgram(program.id.toString());
                  const programInitiatives = programInitiativesResponse?.data || [];
                  console.log(`Program ${program.id}: ${programInitiatives.length} initiatives`);
                  
                  // Add program initiatives (avoid duplicates)
                  programInitiatives.forEach(programInitiative => {
                    if (!allObjectiveInitiatives.find(existing => existing.id === programInitiative.id)) {
                      allObjectiveInitiatives.push(programInitiative);
                    }
                  });
                } catch (programError) {
                  console.warn(`Error fetching initiatives for program ${program.id}:`, programError);
                }
              }
            }
            
            console.log(`Total initiatives for objective ${objective.id}: ${allObjectiveInitiatives.length}`);

            // Filter initiatives based on organization for this plan
            const filteredInitiatives = allObjectiveInitiatives;
            console.log(`Using ${filteredInitiatives.length} initiatives`);

            // For each initiative, fetch performance measures and main activities
            const enrichedInitiatives = await Promise.all(
              filteredInitiatives.map(async (initiative) => {
                try {
                  console.log(`  Processing initiative: ${initiative.name} (ID: ${initiative.id})`);
                  
                  // Fetch performance measures
                  const measuresResponse = await performanceMeasures.getByInitiative(initiative.id);
                  const allMeasures = measuresResponse?.data || [];
                  console.log(`    Found ${allMeasures.length} performance measures`);

                  // Fetch main activities
                  const activitiesResponse = await mainActivities.getByInitiative(initiative.id);
                  const allActivities = activitiesResponse?.data || [];
                  console.log(`    Found ${allActivities.length} main activities`);

                  // Use measures and activities as-is
                  const filteredMeasures = allMeasures;
                  const filteredActivities = allActivities;
                  
                  console.log(`    Using ${filteredMeasures.length} measures and ${filteredActivities.length} activities`);

                  return {
                    ...initiative,
                    performance_measures: filteredMeasures,
                    main_activities: filteredActivities
                  };
                } catch (error) {
                  console.warn(`Error fetching data for initiative ${initiative.id}:`, error);
                  return {
                    ...initiative,
                    performance_measures: [],
                    main_activities: []
                  };
                }
              })
            );

            // CRITICAL: Return the objective exactly as it came from the plan data
            // This preserves the plan-specific weights that were selected by the planner
            console.log(`Returning objective ${objective.id} with ORIGINAL plan weights preserved`);

            console.log(`Objective ${objective.id} completed: ${enrichedInitiatives.length} enriched initiatives`);

            return {
              ...objective, // Keep ALL original plan-specific data
              initiatives: enrichedInitiatives
            };
          } catch (error) {
            console.warn(`Error processing objective ${objective.id}:`, error);
            return {
              ...objective,
              initiatives: []
            };
          }
        })
      );

      return enrichedObjectives;
    } catch (error) {
      console.error('Error in fetchCompleteObjectiveData:', error);
      return objectivesList;
    }
  };

  // Fetch plan data
  const { data: planData, isLoading, error: planError } = useQuery({
    queryKey: ['plan', planId],
    queryFn: async () => {
      if (!planId) throw new Error('Plan ID is required');
      
      console.log('Fetching plan data for ID:', planId);
      const plan = await plans.getById(planId);
      console.log('Raw plan data received:', plan);
      
      // Normalize and process the plan data
      const processedPlan = normalizeAndProcessPlanData(plan);
      console.log('Processed plan data:', processedPlan);
      
      return processedPlan;
    },
    enabled: !!planId,
    retry: 2
  });

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
        <Loader className="h-6 w-6 animate-spin mr-2 text-blue-600" />
        <span className="text-lg">Loading plan details...</span>
      </div>
    );
  }

  if (planError || error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-red-50 rounded-lg border border-red-200">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Plan</h3>
          <p className="text-red-600">{error || (planError instanceof Error ? planError.message : 'Failed to load plan')}</p>
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

  if (!planData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-yellow-50 rounded-lg border border-yellow-200">
          <Eye className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Plan Not Found</h3>
          <p className="text-yellow-600">The requested plan could not be found.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-4 px-4 py-2 bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200"
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
          className="flex items-center text-gray-600 hover:text-blue-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Dashboard
        </button>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Plan Summary</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center">
              <Building2 className="h-5 w-5 text-gray-500 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Organization</p>
                <p className="font-medium">{planData.organization_name || `Organization ${planData.organization}`}</p>
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
                <p className="text-sm text-gray-500">Status</p>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  planData.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                  planData.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
                  planData.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {planData.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Plan Table */}
      {planData.objectives && planData.objectives.length > 0 ? (
        <PlanReviewTable
          objectives={planData.objectives}
          onSubmit={async () => {}}
          isSubmitting={false}
          organizationName={planData.organization_name || `Organization ${planData.organization}`}
          plannerName={planData.planner_name}
          fromDate={planData.from_date}
          toDate={planData.to_date}
          planType={planData.type}
          isViewOnly={true}
          userOrgId={userOrgId}
        />
      ) : (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 text-center">
          <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Plan Data</h3>
          <p className="text-gray-500">This plan doesn't have any objectives or data to display.</p>
        </div>
      )}
    </div>
  );
};

export default PlanSummary;