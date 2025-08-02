import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { plans, auth, objectives, initiatives, performanceMeasures, mainActivities, api } from '../lib/api';
import axios from 'axios';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { 
  ArrowLeft, 
  Download, 
  FileSpreadsheet, 
  File as FilePdf, 
  AlertCircle, 
  Loader, 
  Building2, 
  Calendar, 
  User, 
  CheckCircle, 
  XCircle, 
  ClipboardCheck, 
  FileType, 
  RefreshCw,
  Info
} from 'lucide-react';
import { format } from 'date-fns';
import { isEvaluator } from '../types/user';
import PlanReviewTable from '../components/PlanReviewTable';

// Production-safe API helper with comprehensive retry logic (copied from PlanReviewTable)
const productionSafeAPI = {
  async fetchWithRetry(apiCall: () => Promise<any>, description: string, maxRetries = 3): Promise<any> {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`${description} - Attempt ${attempt}/${maxRetries}`);
        
        // Set timeout based on attempt (shorter timeouts on later attempts)
        const timeout = Math.max(5000, 15000 - (attempt * 3000));
        
        const result = await Promise.race([
          apiCall(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
          )
        ]);
        
        console.log(`${description} - Success on attempt ${attempt}`);
        return result;
      } catch (error) {
        lastError = error;
        console.warn(`${description} - Attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.log(`${description} - Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    console.warn(`${description} - All attempts failed, returning empty data`);
    throw lastError;
  },

  async getInitiativesForObjective(objectiveId: string): Promise<any[]> {
    try {
      const result = await this.fetchWithRetry(async () => {
        const timestamp = new Date().getTime();
        
        // Try multiple API call strategies
        try {
          // Strategy 1: Standard API call
          return await api.get(`/strategic-initiatives/?objective=${objectiveId}&_=${timestamp}`, {
            timeout: 10000,
            headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
          });
        } catch (error1) {
          console.warn('Strategy 1 failed, trying strategy 2...');
          
          try {
            // Strategy 2: Alternative parameter format
            return await api.get('/strategic-initiatives/', {
              params: { objective: objectiveId, _: timestamp },
              timeout: 8000,
              headers: { 'Cache-Control': 'no-cache' }
            });
          } catch (error2) {
            console.warn('Strategy 2 failed, trying strategy 3...');
            
            // Strategy 3: Direct axios call
            return await axios.get(`/api/strategic-initiatives/`, {
              params: { objective: objectiveId },
              timeout: 5000,
              withCredentials: true
            });
          }
        }
      }, `Fetching initiatives for objective ${objectiveId}`);
      
      const data = result?.data?.results || result?.data || [];
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn(`Failed to fetch initiatives for objective ${objectiveId}:`, error);
      return [];
    }
  },

  async getPerformanceMeasuresForInitiative(initiativeId: string): Promise<any[]> {
    try {
      const result = await this.fetchWithRetry(async () => {
        const timestamp = new Date().getTime();
        
        try {
          // Strategy 1: Standard API call
          return await api.get(`/performance-measures/?initiative=${initiativeId}&_=${timestamp}`, {
            timeout: 10000,
            headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
          });
        } catch (error1) {
          console.warn('Performance measures strategy 1 failed, trying strategy 2...');
          
          try {
            // Strategy 2: Alternative parameter format
            return await api.get('/performance-measures/', {
              params: { initiative: initiativeId, initiative_id: initiativeId, _: timestamp },
              timeout: 8000,
              headers: { 'Cache-Control': 'no-cache' }
            });
          } catch (error2) {
            console.warn('Performance measures strategy 2 failed, trying strategy 3...');
            
            // Strategy 3: Direct axios call
            return await axios.get(`/api/performance-measures/`, {
              params: { initiative: initiativeId },
              timeout: 5000,
              withCredentials: true
            });
          }
        }
      }, `Fetching performance measures for initiative ${initiativeId}`);
      
      const data = result?.data?.results || result?.data || [];
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn(`Failed to fetch performance measures for initiative ${initiativeId}:`, error);
      return [];
    }
  },

  async getMainActivitiesForInitiative(initiativeId: string): Promise<any[]> {
    try {
      const result = await this.fetchWithRetry(async () => {
        const timestamp = new Date().getTime();
        
        try {
          // Strategy 1: Standard API call
          return await api.get(`/main-activities/?initiative=${initiativeId}&_=${timestamp}`, {
            timeout: 10000,
            headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
          });
        } catch (error1) {
          console.warn('Main activities strategy 1 failed, trying strategy 2...');
          
          try {
            // Strategy 2: Alternative parameter format
            return await api.get('/main-activities/', {
              params: { initiative: initiativeId, initiative_id: initiativeId, _: timestamp },
              timeout: 8000,
              headers: { 'Cache-Control': 'no-cache' }
            });
          } catch (error2) {
            console.warn('Main activities strategy 2 failed, trying strategy 3...');
            
            // Strategy 3: Direct axios call
            return await axios.get(`/api/main-activities/`, {
              params: { initiative: initiativeId },
              timeout: 5000,
              withCredentials: true
            });
          }
        }
      }, `Fetching main activities for initiative ${initiativeId}`);
      
      const data = result?.data?.results || result?.data || [];
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn(`Failed to fetch main activities for initiative ${initiativeId}:`, error);
      return [];
    }
  }
};

// COMPLETELY REWRITTEN: Organization-specific data fetching
const fetchCompleteData = async (objectivesList: any[], organizationId?: number) => {
  if (!objectivesList || objectivesList.length === 0) {
    console.log('❌ No objectives to process');
    return [];
  }

  console.log(`🚀 PROCESSING ${objectivesList.length} OBJECTIVES FOR ORGANIZATION ${organizationId}`);
  
  const enrichedObjectives = [];

  for (let objIndex = 0; objIndex < objectivesList.length; objIndex++) {
    const objective = objectivesList[objIndex];
    if (!objective) continue;

    try {
      console.log(`\n📋 === PROCESSING OBJECTIVE ${objIndex + 1}/${objectivesList.length} ===`);
      console.log(`🎯 Objective: ${objective.title} (ID: ${objective.id})`);

      // Fetch ALL initiatives for this objective
      console.log(`🔍 Fetching ALL initiatives for objective ${objective.id}...`);
      
      // Wait a bit before each objective to prevent server overload
      if (objIndex > 0) {
        console.log('⏱️ Waiting 500ms before next objective...');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      const objectiveInitiatives = await productionSafeAPI.getInitiativesForObjective(objective.id.toString());
      
      console.log(`✅ Found ${objectiveInitiatives.length} total initiatives for objective ${objective.id}`);
      
      // Filter initiatives by organization - include default AND organization-specific
      const filteredInitiatives = objectiveInitiatives.filter(initiative => {
        // Include default initiatives (available to all)
        if (initiative.is_default) {
          console.log(`  ✅ Including default initiative: ${initiative.name} (ID: ${initiative.id})`);
          return true;
        }
        
        // Include initiatives that belong to this organization
        if (organizationId && initiative.organization === organizationId) {
          console.log(`  ✅ Including org-specific initiative: ${initiative.name} (ID: ${initiative.id}) for org ${organizationId}`);
          return true;
        }
        
        // Include initiatives with no organization (legacy data)
        if (!initiative.organization) {
          console.log(`  ✅ Including legacy initiative: ${initiative.name} (ID: ${initiative.id})`);
          return true;
        }
        
        console.log(`  ❌ Excluding initiative: ${initiative.name} (ID: ${initiative.id}) - org: ${initiative.organization}, plan org: ${organizationId}`);
        return false;
      });
      
      console.log(`🎯 Filtered to ${filteredInitiatives.length} initiatives for organization ${organizationId}`);

      // Process each initiative with proper delays
      const enrichedInitiatives = [];
      
      for (let initIndex = 0; initIndex < filteredInitiatives.length; initIndex++) {
        const initiative = filteredInitiatives[initIndex];
        if (!initiative) continue;

        try {
          console.log(`\n  🎯 === PROCESSING INITIATIVE ${initIndex + 1}/${filteredInitiatives.length} ===`);
          console.log(`  📝 Initiative: ${initiative.name} (ID: ${initiative.id})`);
          
          // Wait between initiatives to prevent server overload
          if (initIndex > 0) {
            console.log('  ⏱️ Waiting 300ms before next initiative...');
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          // Fetch performance measures and main activities with delays
          console.log(`  🔍 Fetching performance measures for initiative ${initiative.id}...`);
          
          const [performanceMeasuresData, mainActivitiesData] = await Promise.allSettled([
            productionSafeAPI.getPerformanceMeasuresForInitiative(initiative.id),
            // Add delay between the two calls
            new Promise(resolve => setTimeout(resolve, 200)).then(() => 
            productionSafeAPI.getMainActivitiesForInitiative(initiative.id)
            )
          ]);

          // Handle results with fallback to empty arrays
          const measures = performanceMeasuresData.status === 'fulfilled' ? performanceMeasuresData.value : [];
          const activities = mainActivitiesData.status === 'fulfilled' ? mainActivitiesData.value : [];
          
          // Filter measures and activities by organization
          const filteredMeasures = measures.filter(measure =>
            !measure.organization || measure.organization === organizationId || measure.is_default
          );
          
          const filteredActivities = activities.filter(activity =>
            !activity.organization || activity.organization === organizationId || activity.is_default
          );

          console.log(`  ✅ Initiative ${initiative.id}: ${filteredMeasures.length} measures, ${filteredActivities.length} activities`);
          console.log(`    📊 Measures: ${filteredMeasures.map(m => m.name).join(', ')}`);
          console.log(`    🎬 Activities: ${filteredActivities.map(a => a.name).join(', ')}`);

          enrichedInitiatives.push({
            ...initiative,
            performance_measures: filteredMeasures,
            main_activities: filteredActivities
          });

          // Longer delay between initiatives to ensure complete loading
          if (initIndex < filteredInitiatives.length - 1) {
            console.log('  ⏱️ Waiting 400ms before next initiative...');
            await new Promise(resolve => setTimeout(resolve, 400));
          }

        } catch (initiativeError) {
          console.error(`  ❌ Error processing initiative ${initiative.id}:`, initiativeError);
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

      console.log(`✅ COMPLETED OBJECTIVE ${objective.id}: ${enrichedInitiatives.length} enriched initiatives`);

      // Longer delay between objectives to ensure complete loading
      if (objIndex < objectivesList.length - 1) {
        console.log('⏱️ Waiting 600ms before next objective...');
        await new Promise(resolve => setTimeout(resolve, 600));
      }

    } catch (objectiveError) {
      console.error(`❌ Error processing objective ${objective.id}:`, objectiveError);
      // Add objective with empty initiatives instead of skipping
      enrichedObjectives.push({
        ...objective,
        effective_weight: objective.weight,
        initiatives: []
      });
    }
  }

  console.log(`\n🎉 === PROCESSING COMPLETE FOR ORGANIZATION ${organizationId} ===`);
  console.log(`✅ Successfully processed ${enrichedObjectives.length} objectives`);
  
  const totalInitiatives = enrichedObjectives.reduce((sum, obj) => sum + (obj.initiatives?.length || 0), 0);
  const totalMeasures = enrichedObjectives.reduce((sum, obj) => 
    sum + (obj.initiatives?.reduce((iSum, init) => iSum + (init.performance_measures?.length || 0), 0) || 0), 0);
  const totalActivities = enrichedObjectives.reduce((sum, obj) => 
    sum + (obj.initiatives?.reduce((iSum, init) => iSum + (init.main_activities?.length || 0), 0) || 0), 0);
  
  console.log(`🏆 FINAL TOTALS: ${totalInitiatives} initiatives, ${totalMeasures} measures, ${totalActivities} activities`);
  
  // Log detailed breakdown for debugging
  enrichedObjectives.forEach((obj, index) => {
    console.log(`\n📊 OBJECTIVE ${index + 1}: ${obj.title}`);
    console.log(`  🎯 Initiatives (${obj.initiatives?.length || 0}):`);
    obj.initiatives?.forEach((init, initIndex) => {
      console.log(`    ${initIndex + 1}. ${init.name} - Measures: ${init.performance_measures?.length || 0}, Activities: ${init.main_activities?.length || 0}`);
    });
  });

  return enrichedObjectives;
};

// Get plan objectives - try multiple sources
const getPlanObjectives = async (planData: any) => {
  console.log('=== GETTING PLAN OBJECTIVES ===');
  console.log('Plan data:', planData);
  
  try {
    // Step 1: Get ALL objectives from the system first
    console.log('=== STEP 1: FETCHING ALL OBJECTIVES ===');
    let allObjectives = [];
    
    try {
      const allObjectivesResponse = await objectives.getAll();
      allObjectives = allObjectivesResponse?.data || [];
      console.log(`✅ Found ${allObjectives.length} total objectives in system`);
      
      if (allObjectives.length === 0) {
        console.warn('⚠️ No objectives found in system');
        return [];
      }
    } catch (error) {
      console.error('❌ Failed to fetch all objectives:', error);
      throw new Error('Failed to fetch objectives from system');
    }
    
    // Step 2: Determine which objectives belong to this plan
    console.log('=== STEP 2: FILTERING PLAN OBJECTIVES ===');
    let planObjectiveIds = [];
    
    if (planData.selected_objectives && Array.isArray(planData.selected_objectives)) {
      // Multi-objective plan
      planObjectiveIds = planData.selected_objectives.map(obj => obj.id || obj);
      console.log(`📋 Multi-objective plan with ${planObjectiveIds.length} objectives:`, planObjectiveIds);
    } else if (planData.strategic_objective) {
      // Single objective plan
      planObjectiveIds = [planData.strategic_objective];
      console.log(`🎯 Single-objective plan with objective:`, planData.strategic_objective);
    } else if (planData.objectives && Array.isArray(planData.objectives)) {
      // Fallback - objectives array in plan data
      planObjectiveIds = planData.objectives.map(obj => obj.id || obj);
      console.log(`📦 Plan has objectives array with ${planObjectiveIds.length} objectives:`, planObjectiveIds);
    } else {
      console.warn('⚠️ No objectives configuration found in plan data');
      // Last resort - try to get all objectives for this organization
      console.log('🔍 Trying to get all objectives for organization:', planData.organization);
      const planObjectives = allObjectives.filter(obj => 
        !obj.organization || obj.organization === planData.organization || obj.is_default
      );
      return await fetchCompleteData(planObjectives, planData.organization);
    }
    
    // Step 3: Get the actual objective objects
    console.log('=== STEP 3: GETTING OBJECTIVE OBJECTS ===');
    const planObjectives = allObjectives.filter(obj => 
      planObjectiveIds.includes(obj.id) || planObjectiveIds.includes(obj.id.toString())
    );
    
    console.log(`✅ Found ${planObjectives.length} plan objectives out of ${planObjectiveIds.length} requested`);
    planObjectives.forEach(obj => {
      console.log(`  📌 Objective ${obj.id}: ${obj.title} (Weight: ${obj.weight}%, Planner: ${obj.planner_weight || 'N/A'}%)`);
    });
    
    if (planObjectives.length === 0) {
      console.warn('❌ No matching objectives found for this plan');
      throw new Error(`No objectives found for plan. Requested IDs: ${planObjectiveIds.join(', ')}`);
    }
    
    // Step 4: Fetch complete data for these objectives
    console.log('=== STEP 4: FETCHING COMPLETE DATA ===');
    return await fetchCompleteData(planObjectives, planData.organization);
    
  } catch (error) {
    console.error('❌ Error in getPlanObjectives:', error);
    throw error;
  }
};

const PlanSummary: React.FC = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  // State
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [isUserEvaluator, setIsUserEvaluator] = useState(false);
  const [userOrgId, setUserOrgId] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [enrichedObjectives, setEnrichedObjectives] = useState<any[]>([]);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [enrichProgress, setEnrichProgress] = useState('');
  const [hasAttemptedEnrichment, setHasAttemptedEnrichment] = useState(false);

  // Fetch current user's role and organization
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const user = await auth.getCurrentUser();
        if (user?.userOrganizations) {
          setIsUserEvaluator(isEvaluator(user.userOrganizations));
          if (user.userOrganizations.length > 0) {
            setUserOrgId(user.userOrganizations[0].organization);
          }
        }
      } catch (error) {
        console.error('Failed to fetch user info:', error);
      }
    };

    fetchUserInfo();
  }, []);

  // Fetch plan data
  const { data: planData, isLoading, error, refetch } = useQuery({
    queryKey: ['plan', planId],
    queryFn: async () => {
      if (!planId) throw new Error('Plan ID is required');
      const response = await plans.getById(planId);
      return response;
    },
    enabled: !!planId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Review plan mutation
  const reviewPlanMutation = useMutation({
    mutationFn: async (data: { status: 'APPROVED' | 'REJECTED', feedback: string }) => {
      if (!planId) throw new Error('Plan ID is required');
      
      if (data.status === 'APPROVED') {
        return plans.approve(planId, data.feedback);
      } else {
        return plans.reject(planId, data.feedback);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['plan', planId] });
      setShowReviewForm(false);
      navigate('/evaluator');
    },
  });

  // Function to handle showing the table view with complete data
  const handleShowTableView = async (forceRefresh = false) => {
    console.log('=== STARTING PLAN DATA FETCH ===');
    console.log('Plan organization:', planData?.organization);
    console.log('Plan organization name:', planData?.organization_name);
    console.log('Plan data structure:', {
      id: planData?.id,
      organization: planData?.organization,
      organization_name: planData?.organization_name,
      selected_objectives: planData?.selected_objectives?.length,
      strategic_objective: planData?.strategic_objective,
      objectives: planData?.objectives?.length
    });
    
    try {
      setIsEnriching(true);
      setEnrichError(null);
      setEnrichProgress('🔍 Getting plan objectives...');
      
      // Add initial delay to ensure all systems are ready
      console.log('⏱️ Initial delay - preparing systems...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setEnrichProgress('📋 Fetching complete data for organization...');
      
      // Get plan-specific objectives and their complete data with organization filtering
      const completeData = await getPlanObjectives(planData);
      
      console.log('🎉 Plan data fetched successfully:', completeData.length, 'objectives');
      
      // Final delay to ensure all data is processed
      console.log('⏱️ Final processing delay...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setEnrichedObjectives(completeData);
      setHasAttemptedEnrichment(true);
      setShowPreview(true);
      
      console.log('✅ Data display ready!');
      
    } catch (error) {
      console.error('❌ Error loading plan data:', error);
      setEnrichError(error instanceof Error ? error.message : 'Failed to load plan data');
      setHasAttemptedEnrichment(true);
    } finally {
      setIsEnriching(false);
    }
  };

  // Handle retry for enrichment
  const handleRetryEnrichment = () => {
    setEnrichError(null);
    handleShowTableView(true); // Force refresh
  };

  // Helper functions
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

  const calculateTotalBudget = () => {
    let total = 0;
    let governmentTotal = 0;
    let sdgTotal = 0;
    let partnersTotal = 0;
    let otherTotal = 0;

    if (!planData?.objectives) {
      return { total, governmentTotal, sdgTotal, partnersTotal, otherTotal };
    }

    try {
      planData.objectives.forEach((objective: any) => {
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

  const handleReviewSubmit = async (data: { status: 'APPROVED' | 'REJECTED'; feedback: string }) => {
    await reviewPlanMutation.mutateAsync(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="h-6 w-6 animate-spin mr-2 text-green-600" />
        <span className="text-lg">Loading plan details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-red-50 border border-red-200 rounded-lg text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800">Failed to load plan</h3>
        <p className="text-red-600 mt-2">{error instanceof Error ? error.message : 'An unknown error occurred'}</p>
        <div className="mt-6 flex justify-center space-x-4">
          <button
            onClick={() => refetch()}
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

  if (!planData) {
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
                planData.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
                planData.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
                planData.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                'bg-red-100 text-red-800'
              }`}>
                {planData.status}
              </div>
              {planData.submitted_at && (
                <span className="text-sm text-gray-500 ml-2">
                  Submitted on {formatDate(planData.submitted_at)}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex space-x-3">
            {/* Show Table View Button */}
            {planData.objectives && planData.objectives.length > 0 && (
              isEnriching ? (
                <div className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-gray-50">
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                  Loading Complete Data...
                </div>
              ) : (
                <button
                  onClick={() => handleShowTableView()}
                  disabled={isEnriching}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Show Complete Table View
                </button>
              )
            )}
            
            {planData.status === 'SUBMITTED' && isUserEvaluator && (
              <button
                onClick={() => setShowReviewForm(true)}
                className="flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
              >
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Review Plan
              </button>
            )}
          </div>
        </div>

        {/* Show enrichment progress */}
        {isEnriching && (
          <div className="mb-6 bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center">
              <Loader className="h-5 w-5 animate-spin text-blue-600 mr-3" />
              <div>
                <p className="text-blue-800 font-medium">Loading Complete Plan Data</p>
                <p className="text-blue-600 text-sm">{enrichProgress}</p>
              </div>
            </div>
          </div>
        )}

        {/* Show enrichment error */}
        {enrichError && (
          <div className="mb-6 bg-red-50 p-4 rounded-lg border border-red-200">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
              <div>
                <p className="text-red-800 font-medium">Failed to Load Complete Data</p>
                <p className="text-red-600 text-sm">{enrichError}</p>
              </div>
            </div>
            <button
              onClick={handleRetryEnrichment}
              className="mt-2 px-3 py-1 bg-white border border-red-300 rounded text-red-700 hover:bg-red-50 text-sm"
            >
              Retry Loading
            </button>
          </div>
        )}

        <div className="space-y-8">
          {/* Organization Information */}
          <div className="border-b border-gray-200 pb-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Organization Information</h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-start">
                <Building2 className="h-5 w-5 text-gray-400 mt-0.5 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Organization Name</p>
                  <p className="font-medium">{planData.organization_name || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-start">
                <User className="h-5 w-5 text-gray-400 mt-0.5 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Planner</p>
                  <p className="font-medium">{planData.planner_name || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-start">
                <FileType className="h-5 w-5 text-gray-400 mt-0.5 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Plan Type</p>
                  <p className="font-medium">{planData.type || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-start">
                <Calendar className="h-5 w-5 text-gray-400 mt-0.5 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Planning Period</p>
                  <p className="font-medium">
                    {formatDate(planData.from_date)} - {formatDate(planData.to_date)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Evaluator Feedback */}
          {planData.reviews && planData.reviews.length > 0 && (
            <div className="border-b border-gray-200 pb-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Evaluator Feedback</h2>
              <div className={`p-4 rounded-lg ${
                planData.status === 'APPROVED' ? 'bg-green-50 border border-green-200' : 
                planData.status === 'REJECTED' ? 'bg-red-50 border border-red-200' : 
                'bg-gray-50 border border-gray-200'
              }`}>
                <div className="flex items-start">
                  {planData.status === 'APPROVED' ? (
                    <CheckCircle className="h-5 w-5 mr-2 text-green-500 mt-0.5" />
                  ) : planData.status === 'REJECTED' ? (
                    <XCircle className="h-5 w-5 mr-2 text-red-500 mt-0.5" />
                  ) : (
                    <div className="h-5 w-5 mr-2" />
                  )}
                  <div>
                    <p className={`font-medium ${
                      planData.status === 'APPROVED' ? 'text-green-700' : 
                      planData.status === 'REJECTED' ? 'text-red-700' : 
                      'text-gray-700'
                    }`}>
                      {planData.status === 'APPROVED' ? 'Plan Approved' : 
                       planData.status === 'REJECTED' ? 'Plan Rejected' :
                       'Pending Review'}
                    </p>
                    {planData.reviews[0]?.feedback && (
                      <p className="mt-1 text-gray-600">
                        {planData.reviews[0].feedback}
                      </p>
                    )}
                    {planData.reviews[0]?.reviewed_at && (
                      <p className="mt-2 text-sm text-gray-500">
                        Reviewed on {formatDate(planData.reviews[0].reviewed_at)} by {planData.reviews[0].evaluator_name || 'Evaluator'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Summary Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <h3 className="text-sm font-medium text-gray-500">Total Objectives</h3>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {planData.objectives?.length || 0}
              </p>
            </div>
            
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <h3 className="text-sm font-medium text-gray-500">Total Initiatives</h3>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {planData.objectives?.reduce((total: number, obj: any) => 
                  total + (obj?.initiatives?.length || 0), 0) || 0}
              </p>
            </div>
            
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <h3 className="text-sm font-medium text-gray-500">Total Activities</h3>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {planData.objectives?.reduce((total: number, obj: any) => 
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

          {/* Strategic Objectives */}
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Strategic Objectives</h2>
            {!planData.objectives?.length ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-500">No strategic objectives found for this plan.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {planData.objectives.map((objective: any, index: number) => (
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

      {/* Table View Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 z-10 bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">Complete Plan Review</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleShowTableView(true)}
                  disabled={isEnriching}
                  className="flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  {isEnriching ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh Data
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-gray-400 hover:text-gray-500 focus:outline-none"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {isEnriching ? (
                <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg border border-gray-200">
                  <Loader className="h-10 w-10 text-blue-600 animate-spin mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Organization-Specific Data</h3>
                  <p className="text-gray-600 text-center mb-4">
                    {enrichProgress}
                    <br />
                    <span className="text-sm text-gray-500">Please wait while we fetch complete data...</span>
                  </p>
                  <div className="w-full max-w-md bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all duration-500 animate-pulse" style={{ width: '70%' }}></div>
                  </div>
                  <p className="text-sm text-gray-500 mt-4">
                    📊 Fetching ALL objectives, initiatives, measures & activities
                    <br />
                    🏢 Organization: {planData?.organization_name || planData?.organization}
                    <br />
                    ⏱️ This may take 10-15 seconds for complete data...
                  </p>
                </div>
              ) : enrichError ? (
                <div className="p-8 bg-red-50 border border-red-200 rounded-lg text-center">
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-red-800 mb-2">Failed to Load Organization Data</h3>
                  <p className="text-red-600 mb-4">{enrichError}</p>
                  <div className="flex justify-center space-x-4">
                    <button
                      onClick={handleRetryEnrichment}
                      className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 flex items-center"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retry Loading
                    </button>
                  </div>
                </div>
              ) : enrichedObjectives.length > 0 ? (
                <PlanReviewTable
                  objectives={enrichedObjectives}
                  onSubmit={async () => {}}
                  isSubmitting={false}
                  organizationName={planData.organization_name || 'N/A'}
                  plannerName={planData.planner_name || 'N/A'}
                  fromDate={planData.from_date || ''}
                  toDate={planData.to_date || ''}
                  planType={planData.type || 'N/A'}
                  isPreviewMode={true}
                  userOrgId={userOrgId}
                  isViewOnly={true}
                  key={`plan-${planData?.id}-${enrichedObjectives.length}`}
                />
              ) : (
                <div className="p-8 bg-yellow-50 rounded-lg border border-yellow-200 text-center">
                  <Info className="h-10 w-10 text-yellow-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-yellow-800 mb-2">No Data for This Plan</h3>
                  <p className="text-yellow-700 mb-4">
                    No data available for this plan. This could be because:
                    • The plan has no objectives assigned
                    • The plan data is incomplete
                    • Network issues preventing data loading
                  </p>
                  <button
                    onClick={handleRetryEnrichment}
                    className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 transition-colors"
                  >
                    <RefreshCw className="h-4 w-4 inline mr-2" /> Try Loading Again
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Review Form Modal */}
      {showReviewForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Review Plan: {planData.organization_name}
            </h3>
            
            <PlanReviewForm
              plan={planData}
              onSubmit={handleReviewSubmit}
              onCancel={() => setShowReviewForm(false)}
              isSubmitting={reviewPlanMutation.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Simple PlanReviewForm component (since we need it for the review functionality)
interface PlanReviewFormProps {
  plan: any;
  onSubmit: (data: { status: 'APPROVED' | 'REJECTED'; feedback: string }) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const PlanReviewForm: React.FC<PlanReviewFormProps> = ({
  plan,
  onSubmit,
  onCancel,
  isSubmitting = false
}) => {
  const [status, setStatus] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      await onSubmit({ status, feedback });
    } catch (error: any) {
      setError(error.message || 'Failed to submit review');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
          <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Review Decision</label>
        <div className="grid grid-cols-2 gap-4">
          <label className="relative flex items-center p-4 border rounded-lg cursor-pointer">
            <input
              type="radio"
              value="APPROVED"
              checked={status === 'APPROVED'}
              onChange={(e) => setStatus(e.target.value as 'APPROVED')}
              className="sr-only"
            />
            <div className={`flex items-center ${status === 'APPROVED' ? 'text-green-600' : 'text-gray-500'}`}>
              <CheckCircle className="h-5 w-5 mr-2" />
              <div>
                <p className="font-medium">Approve</p>
                <p className="text-sm">Accept the plan as is</p>
              </div>
            </div>
            {status === 'APPROVED' && (
              <div className="absolute inset-0 border-2 border-green-500 rounded-lg pointer-events-none" />
            )}
          </label>

          <label className="relative flex items-center p-4 border rounded-lg cursor-pointer">
            <input
              type="radio"
              value="REJECTED"
              checked={status === 'REJECTED'}
              onChange={(e) => setStatus(e.target.value as 'REJECTED')}
              className="sr-only"
            />
            <div className={`flex items-center ${status === 'REJECTED' ? 'text-red-600' : 'text-gray-500'}`}>
              <XCircle className="h-5 w-5 mr-2" />
              <div>
                <p className="font-medium">Reject</p>
                <p className="text-sm">Request changes</p>
              </div>
            </div>
            {status === 'REJECTED' && (
              <div className="absolute inset-0 border-2 border-red-500 rounded-lg pointer-events-none" />
            )}
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Feedback</label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={4}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Enter your feedback..."
          required={status === 'REJECTED'}
        />
      </div>

      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Review'}
        </button>
      </div>
    </form>
  );
};

export default PlanSummary;