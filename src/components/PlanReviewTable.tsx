import React, { useState, useEffect } from 'react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { BarChart3, Target, Activity, DollarSign, Calendar, User, Building2, FileType, CheckCircle, AlertCircle, Info, Loader, FileSpreadsheet, Download } from 'lucide-react';
import { StrategicObjective } from '../types/organization';
import { PlanType } from '../types/plan';
import { formatCurrency, processDataForExport, exportToExcel, exportToPDF } from '../lib/utils/export';
import { initiatives, performanceMeasures, mainActivities, auth, api } from '../lib/api';
import axios from 'axios';
import Cookies from 'js-cookie';

interface PlanReviewTableProps {
  objectives: StrategicObjective[];
  onSubmit: () => Promise<void>;
  isSubmitting: boolean;
  organizationName: string;
  plannerName: string;
  fromDate: string;
  toDate: string;
  planType: PlanType;
  isPreviewMode?: boolean;
  userOrgId?: number | null;
  isViewOnly?: boolean;
}

const PlanReviewTable: React.FC<PlanReviewTableProps> = ({
  objectives,
  onSubmit,
  isSubmitting,
  organizationName,
  plannerName,
  fromDate,
  toDate,
  planType,
  isPreviewMode = false,
  userOrgId = null,
  isViewOnly = false
}) => {
  const { t } = useLanguage();
  const [processedObjectives, setProcessedObjectives] = useState<StrategicObjective[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserOrgId, setCurrentUserOrgId] = useState<number | null>(userOrgId);
  const [retryCount, setRetryCount] = useState(0);
  const [maxRetries] = useState(3);

  // Fetch current user's organization ID if not provided
  useEffect(() => {
    const fetchUserData = async () => {
      if (currentUserOrgId !== null) return;
      
      try {
        const authData = await auth.getCurrentUser();
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          setCurrentUserOrgId(authData.userOrganizations[0].organization);
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
      }
    };
    
    fetchUserData();
  }, [currentUserOrgId]);

  // Simple and robust API call function for production
  const fetchDataRobust = async (url: string, description: string, timeout = 8000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      // Ensure fresh auth
      await auth.getCurrentUser();
      
      // Get fresh CSRF token
      const csrfToken = Cookies.get('csrftoken');
      
      const response = await axios.get(url, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken || '',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        withCredentials: true,
        timeout: timeout - 1000 // Axios timeout slightly less than abort timeout
      });
      
      clearTimeout(timeoutId);
      
      if (response.data) {
        console.log(`✅ Successfully fetched ${description}:`, response.data.length || 'data received');
        return Array.isArray(response.data) ? response.data : (response.data.results || []);
      }
      
      return [];
    } catch (error) {
      clearTimeout(timeoutId);
      console.warn(`⚠️ Failed to fetch ${description}:`, error.message);
      return [];
    }
  };

  // Enhanced data fetching with better error handling for production
  const fetchInitiativeData = async (initiative: any) => {
    if (!initiative?.id) {
      console.warn('Invalid initiative data:', initiative);
      return {
        ...initiative,
        performance_measures: [],
        main_activities: []
      };
    }
    
    console.log(`🔄 Fetching data for initiative ${initiative.id}`);
    
    try {
      // Fetch performance measures with multiple strategies
      let performanceMeasuresData = [];
      try {
        // Strategy 1: Direct API call
        performanceMeasuresData = await fetchDataRobust(
          `/api/performance-measures/?initiative=${initiative.id}&_=${Date.now()}`,
          `performance measures for initiative ${initiative.id}`
        );
        
        // Strategy 2: If no data, try alternative format
        if (performanceMeasuresData.length === 0) {
          performanceMeasuresData = await fetchDataRobust(
            `/api/performance-measures/?initiative_id=${initiative.id}&_=${Date.now()}`,
            `performance measures (alt format) for initiative ${initiative.id}`
          );
        }
        
        // Strategy 3: Use the API service as fallback
        if (performanceMeasuresData.length === 0) {
          try {
            const response = await performanceMeasures.getByInitiative(initiative.id);
            performanceMeasuresData = response?.data || [];
          } catch (serviceError) {
            console.warn(`API service failed for performance measures ${initiative.id}:`, serviceError.message);
          }
        }
      } catch (error) {
        console.warn(`All performance measures strategies failed for initiative ${initiative.id}:`, error.message);
        performanceMeasuresData = [];
      }
      
      // Fetch main activities with multiple strategies
      let mainActivitiesData = [];
      try {
        // Strategy 1: Direct API call
        mainActivitiesData = await fetchDataRobust(
          `/api/main-activities/?initiative=${initiative.id}&_=${Date.now()}`,
          `main activities for initiative ${initiative.id}`
        );
        
        // Strategy 2: If no data, try alternative format
        if (mainActivitiesData.length === 0) {
          mainActivitiesData = await fetchDataRobust(
            `/api/main-activities/?initiative_id=${initiative.id}&_=${Date.now()}`,
            `main activities (alt format) for initiative ${initiative.id}`
          );
        }
        
        // Strategy 3: Use the API service as fallback
        if (mainActivitiesData.length === 0) {
          try {
            const response = await mainActivities.getByInitiative(initiative.id);
            mainActivitiesData = response?.data || [];
          } catch (serviceError) {
            console.warn(`API service failed for main activities ${initiative.id}:`, serviceError.message);
          }
        }
      } catch (error) {
        console.warn(`All main activities strategies failed for initiative ${initiative.id}:`, error.message);
        mainActivitiesData = [];
      }
      
      // Filter data by organization if needed (more permissive in production)
      const filteredMeasures = currentUserOrgId ? 
        performanceMeasuresData.filter(measure => 
          !measure.organization || measure.organization === currentUserOrgId
        ) : performanceMeasuresData;
        
      const filteredActivities = currentUserOrgId ?
        mainActivitiesData.filter(activity => 
          !activity.organization || activity.organization === currentUserOrgId
        ) : mainActivitiesData;
      
      console.log(`✅ Initiative ${initiative.id} data fetched:`, {
        measures: filteredMeasures.length,
        activities: filteredActivities.length
      });
      
      return {
        ...initiative,
        performance_measures: filteredMeasures,
        main_activities: filteredActivities
      };
      
    } catch (error) {
      console.error(`❌ Failed to fetch data for initiative ${initiative.id}:`, error);
      return {
        ...initiative,
        performance_measures: [],
        main_activities: []
      };
    }
  };

  // Process all objectives data
  const processObjectivesData = async (objectivesList: any[]) => {
    if (!Array.isArray(objectivesList) || objectivesList.length === 0) {
      console.warn('No objectives to process');
      return [];
    }

    console.log(`🔄 Processing ${objectivesList.length} objectives...`);
    
    const processedObjectives = [];
    
    for (const objective of objectivesList) {
      if (!objective) {
        console.warn('Skipping null/undefined objective');
        continue;
      }
      
      console.log(`📋 Processing objective: ${objective.title} (ID: ${objective.id})`);
      
      const processedInitiatives = [];
      
      if (objective.initiatives && Array.isArray(objective.initiatives)) {
        console.log(`  📌 Processing ${objective.initiatives.length} initiatives for objective ${objective.id}`);
        
        for (const initiative of objective.initiatives) {
          if (!initiative) {
            console.warn('  Skipping null/undefined initiative');
            continue;
          }
          
          console.log(`    🎯 Processing initiative: ${initiative.name} (ID: ${initiative.id})`);
          
          try {
            const enrichedInitiative = await fetchInitiativeData(initiative);
            processedInitiatives.push(enrichedInitiative);
            
            // Small delay between initiatives to prevent overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.error(`    ❌ Failed to process initiative ${initiative.id}:`, error);
            processedInitiatives.push({
              ...initiative,
              performance_measures: [],
              main_activities: []
            });
          }
        }
      } else {
        console.log(`  📌 No initiatives found for objective ${objective.id}`);
      }
      
      processedObjectives.push({
        ...objective,
        initiatives: processedInitiatives
      });
    }
    
    console.log(`✅ Finished processing all objectives. Total: ${processedObjectives.length}`);
    return processedObjectives;
  };

  // Comprehensive data fetching function
  const fetchCompleteObjectiveData = async (objectivesList: StrategicObjective[]) => {
    if (!objectivesList || !Array.isArray(objectivesList) || objectivesList.length === 0) {
      console.log('PlanReviewTable: No objectives to process');
      return [];
    }

    try {
      console.log('PlanReviewTable: Fetching complete data for objectives:', objectivesList.length);
      
      const enrichedObjectives = await Promise.all(
        objectivesList.map(async (objective) => {
          try {
            // Fetch ALL initiatives for this objective using multiple approaches
            console.log(`PlanReviewTable: Fetching ALL initiatives for objective ${objective.id} (${objective.title})`);
            
            // Method 1: Direct objective initiatives
            let directInitiativesResponse;
            try {
              // Add cache busting for production
              const timestamp = new Date().getTime();
              directInitiativesResponse = await initiatives.getByObjective(objective.id.toString());
            } catch (directError) {
              console.warn(`PlanReviewTable: Failed to fetch direct initiatives for objective ${objective.id}:`, directError);
              directInitiativesResponse = { data: [] };
            }
            
            let allObjectiveInitiatives = directInitiativesResponse?.data || [];
            console.log(`PlanReviewTable: Found ${allObjectiveInitiatives.length} direct initiatives for objective ${objective.id}`);
            
            // Method 2: Get all initiatives and filter by strategic_objective
            try {
              // Add cache busting and timeout for production
              const allInitiativesResponse = await Promise.race([
                initiatives.getAll(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
              ]);
              const allInitiatives = allInitiativesResponse?.data || [];
              
              // Filter initiatives that belong to this objective (either directly or through programs)
              const objectiveRelatedInitiatives = allInitiatives.filter(initiative => {
                // Direct objective relationship
                if (initiative.strategic_objective && 
                    initiative.strategic_objective.toString() === objective.id.toString()) {
                  return true;
                }
                
                // Program relationship - check if initiative's program belongs to this objective
                if (initiative.program && objective.programs && Array.isArray(objective.programs)) {
                  return objective.programs.some(program => 
                    program.id.toString() === initiative.program.toString()
                  );
                }
                
                return false;
              });
              
              console.log(`PlanReviewTable: Found ${objectiveRelatedInitiatives.length} related initiatives from all initiatives for objective ${objective.id}`);
              
              // Merge with direct initiatives, avoiding duplicates
              objectiveRelatedInitiatives.forEach(relatedInitiative => {
                if (!allObjectiveInitiatives.find(existing => existing.id === relatedInitiative.id)) {
                  allObjectiveInitiatives.push(relatedInitiative);
                }
              });
              
            } catch (allInitiativesError) {
              console.error('PlanReviewTable: Error fetching all initiatives:', allInitiativesError);
            }
            
            // Method 3: Also check if the objective has programs and fetch initiatives for those programs
            if (objective.programs && Array.isArray(objective.programs)) {
              for (const program of objective.programs) {
                try {
                  console.log(`PlanReviewTable: Fetching initiatives for program ${program.id} under objective ${objective.id}`);
                  // Add timeout for production
                  const programInitiativesResponse = await Promise.race([
                    initiatives.getByProgram(program.id.toString()),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                  ]);
                  const programInitiatives = programInitiativesResponse?.data || [];
                  console.log(`PlanReviewTable: Found ${programInitiatives.length} initiatives for program ${program.id}`);
                  
                  // Add program initiatives to the list, avoiding duplicates
                  programInitiatives.forEach(programInitiative => {
                    if (!allObjectiveInitiatives.find(existing => existing.id === programInitiative.id)) {
                      allObjectiveInitiatives.push(programInitiative);
                    }
                  });
                } catch (programError) {
                  console.error(`PlanReviewTable: Error fetching initiatives for program ${program.id}:`, programError);
                }
              }
            }
            
            console.log(`PlanReviewTable: TOTAL initiatives found for objective ${objective.id}: ${allObjectiveInitiatives.length}`);

            // Filter initiatives based on user organization
            const filteredInitiatives = allObjectiveInitiatives.filter(initiative => {
              // In production, be more permissive with filtering
              if (!initiative) return false;
              
              // Always include default initiatives
              if (initiative.is_default) return true;
              
              // Include initiatives with no organization (legacy data)
              if (!initiative.organization) return true;
              
              // Include initiatives belonging to current user's organization
              if (currentUserOrgId && initiative.organization === currentUserOrgId) return true;
              
              // In production, also include if we can't determine organization (be permissive)
              return !currentUserOrgId;
            });
            
            console.log(`PlanReviewTable: Filtered initiatives for user org ${currentUserOrgId}: ${filteredInitiatives.length} out of ${allObjectiveInitiatives.length}`);

            // For each initiative, fetch performance measures and main activities
            const enrichedInitiatives = await Promise.all(
              filteredInitiatives.map(async (initiative) => {
                try {
                  console.log(`PlanReviewTable: Fetching data for initiative ${initiative.id} (${initiative.name})`);
                  
                  // Fetch performance measures with multiple fallback strategies
                  let measuresResponse = { data: [] };
                  try {
                    // Strategy 1: Direct API call with timeout
                    measuresResponse = await Promise.race([
                      performanceMeasures.getByInitiative(initiative.id),
                      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                    ]);
                  } catch (measuresError) {
                    console.warn(`PlanReviewTable: Strategy 1 failed for initiative ${initiative.id}:`, measuresError);
                    
                    // Strategy 2: Try with different parameter format
                    try {
                      const response = await Promise.race([
                        api.get(`/performance-measures/`, { params: { initiative: initiative.id } }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
                      ]);
                      measuresResponse = { data: response.data?.results || response.data || [] };
                    } catch (fallbackError) {
                      console.warn(`PlanReviewTable: Strategy 2 failed for initiative ${initiative.id}:`, fallbackError);
                      
                      // Strategy 3: Try direct endpoint
                      try {
                        const directResponse = await Promise.race([
                          api.get(`/performance-measures/?initiative_id=${initiative.id}`),
                          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
                        ]);
                        measuresResponse = { data: directResponse.data?.results || directResponse.data || [] };
                      } catch (directError) {
                        console.warn(`PlanReviewTable: All strategies failed for initiative ${initiative.id}, using empty data`);
                        measuresResponse = { data: [] };
                      }
                    }
                  }
                  
                  const allMeasures = measuresResponse?.data || [];
                  console.log(`PlanReviewTable: Found ${allMeasures.length} measures for initiative ${initiative.id}`);
                  
                  // Filter measures by organization
                  const filteredMeasures = allMeasures.filter(measure => {
                    if (!measure) return false;
                    // In production, be more permissive
                    return !measure.organization || !currentUserOrgId || measure.organization === currentUserOrgId;
                  });

                  // Fetch main activities with multiple fallback strategies
                  let activitiesResponse = { data: [] };
                  try {
                    // Strategy 1: Direct API call with timeout
                    activitiesResponse = await Promise.race([
                      mainActivities.getByInitiative(initiative.id),
                      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                    ]);
                  } catch (activitiesError) {
                    console.warn(`PlanReviewTable: Strategy 1 failed for activities initiative ${initiative.id}:`, activitiesError);
                    
                    // Strategy 2: Try with different parameter format
                    try {
                      const response = await Promise.race([
                        api.get(`/main-activities/`, { params: { initiative: initiative.id } }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
                      ]);
                      activitiesResponse = { data: response.data?.results || response.data || [] };
                    } catch (fallbackError) {
                      console.warn(`PlanReviewTable: Strategy 2 failed for activities initiative ${initiative.id}:`, fallbackError);
                      
                      // Strategy 3: Try direct endpoint
                      try {
                        const directResponse = await Promise.race([
                          api.get(`/main-activities/?initiative_id=${initiative.id}`),
                          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
                        ]);
                        activitiesResponse = { data: directResponse.data?.results || directResponse.data || [] };
                      } catch (directError) {
                        console.warn(`PlanReviewTable: All strategies failed for activities initiative ${initiative.id}, using empty data`);
                        activitiesResponse = { data: [] };
                      }
                    }
                  }
                  
                  const allActivities = activitiesResponse?.data || [];
                  console.log(`PlanReviewTable: Found ${allActivities.length} activities for initiative ${initiative.id}`);
                  
                  // Filter activities by organization
                  const filteredActivities = allActivities.filter(activity => {
                    if (!activity) return false;
                    // In production, be more permissive
                    return !activity.organization || !currentUserOrgId || activity.organization === currentUserOrgId;
                  });

                  console.log(`PlanReviewTable: Initiative ${initiative.id} final data: ${filteredMeasures.length} measures, ${filteredActivities.length} activities`);

                  return {
                    ...initiative,
                    performance_measures: filteredMeasures,
                    main_activities: filteredActivities
                  };
                } catch (error) {
                  console.warn(`PlanReviewTable: Error processing initiative ${initiative.id}:`, error);
                  // In production, always return the initiative with empty data rather than failing
                  return {
                    ...initiative,
                    performance_measures: [],
                    main_activities: []
                  };
                }
              })
            );

            // Set effective weight correctly
            const effectiveWeight = objective.planner_weight !== undefined && objective.planner_weight !== null
              ? objective.planner_weight
              : objective.weight;

            console.log(`PlanReviewTable: Objective ${objective.id} (${objective.title}) FINAL RESULT: ${enrichedInitiatives.length} initiatives with complete data`);
            
            // Log each initiative for debugging
            enrichedInitiatives.forEach((init, index) => {
              console.log(`PlanReviewTable:   Initiative ${index + 1}: ${init.name} (ID: ${init.id}) - Measures: ${init.performance_measures?.length || 0}, Activities: ${init.main_activities?.length || 0}`);
            });

            return {
              ...objective,
              effective_weight: effectiveWeight,
              initiatives: enrichedInitiatives
            };
          } catch (error) {
            console.warn(`Error processing objective ${objective.id}:`, error);
            return {
              ...objective,
              effective_weight: objective.weight,
              initiatives: []
            };
          }
        })
      );

      console.log('PlanReviewTable: === FINAL SUMMARY ===');
      console.log('PlanReviewTable: Successfully enriched objectives with complete data:', 
        enrichedObjectives.map(obj => ({
          id: obj.id,
          title: obj.title,
          initiativesCount: obj.initiatives?.length || 0,
          totalMeasures: obj.initiatives?.reduce((sum, init) => sum + (init.performance_measures?.length || 0), 0) || 0,
          totalActivities: obj.initiatives?.reduce((sum, init) => sum + (init.main_activities?.length || 0), 0) || 0
        }))
      );
      
      const totalInitiatives = enrichedObjectives.reduce((sum, obj) => sum + (obj.initiatives?.length || 0), 0);
      console.log(`PlanReviewTable: GRAND TOTAL: ${totalInitiatives} initiatives across ${enrichedObjectives.length} objectives`);
      
      return enrichedObjectives;
    } catch (error) {
      console.error('PlanReviewTable: Error in fetchCompleteObjectiveData:', error);
      throw error;
    }
  };

  // Process objectives data when component mounts or data changes
  useEffect(() => {
    const loadData = async () => {
      if (!objectives || !Array.isArray(objectives)) {
        console.warn('PlanReviewTable: Invalid objectives data');
        setProcessedObjectives([]);
        setIsLoading(false);
        return;
      }
      
      if (objectives.length === 0) {
        console.log('PlanReviewTable: No objectives provided');
        setProcessedObjectives([]);
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      setError(null);
      
      try {
        const processed = await processObjectivesData(objectives);
        setProcessedObjectives(processed);
      } catch (error) {
        console.error('❌ Error processing objectives data:', error);
        setError(`Failed to load plan data: ${error.message}`);
        setProcessedObjectives([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [objectives, currentUserOrgId, retryCount]);
  
  // Retry function
  const handleRetry = () => {
    if (retryCount < maxRetries) {
      console.log(`🔄 Retrying data fetch (attempt ${retryCount + 1}/${maxRetries})`);
      setRetryCount(prev => prev + 1);
      setError(null);
    }
  };

  // Helper function to format dates
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch (e) {
      return dateString;
    }
  };

  // Helper function to calculate 6-month and 9-month targets
  const calculateTargets = (item: any) => {
    if (!item) return { sixMonth: 0, nineMonth: 0 };
    
    const targetType = item.target_type || 'cumulative';
    const q1 = Number(item.q1_target) || 0;
    const q2 = Number(item.q2_target) || 0;
    const q3 = Number(item.q3_target) || 0;
    
    if (targetType === 'cumulative') {
      return {
        sixMonth: q1 + q2,
        nineMonth: q1 + q2 + q3
      };
    } else {
      return {
        sixMonth: q2,
        nineMonth: q3
      };
    }
  };

  // Helper function to get budget information
  const getBudgetInfo = (activity: any) => {
    if (!activity?.budget) {
      return {
        required: 0,
        government: 0,
        partners: 0,
        sdg: 0,
        other: 0,
        total: 0,
        gap: 0
      };
    }

    const budget = activity.budget;
    const required = budget.budget_calculation_type === 'WITH_TOOL' 
      ? Number(budget.estimated_cost_with_tool || 0)
      : Number(budget.estimated_cost_without_tool || 0);
    
    const government = Number(budget.government_treasury || 0);
    const partners = Number(budget.partners_funding || 0);
    const sdg = Number(budget.sdg_funding || 0);
    const other = Number(budget.other_funding || 0);
    const total = government + partners + sdg + other;
    const gap = Math.max(0, required - total);

    return { required, government, partners, sdg, other, total, gap };
  };

  // Calculate totals for the entire plan
  const calculatePlanTotals = () => {
    let totalRequired = 0;
    let totalGovernment = 0;
    let totalPartners = 0;
    let totalSDG = 0;
    let totalOther = 0;
    let totalAvailable = 0;
    let totalGap = 0;

    processedObjectives.forEach(objective => {
      objective.initiatives?.forEach(initiative => {
        initiative.main_activities?.forEach(activity => {
          const budget = getBudgetInfo(activity);
          totalRequired += budget.required;
          totalGovernment += budget.government;
          totalPartners += budget.partners;
          totalSDG += budget.sdg;
          totalOther += budget.other;
          totalAvailable += budget.total;
          totalGap += budget.gap;
        });
      });
    });

    return {
      totalRequired,
      totalGovernment,
      totalPartners,
      totalSDG,
      totalOther,
      totalAvailable,
      totalGap
    };
  };

  const planTotals = calculatePlanTotals();

  // Export functions
  const handleExportExcel = (language: string = 'en') => {
    if (!processedObjectives || processedObjectives.length === 0) {
      console.warn('No data available for export');
      return;
    }
    
    // Format data for export using the same function as before
    const dataFormatted = processDataForExport(processedObjectives, language);
    exportToExcel(
      dataFormatted,
      `moh-plan-${new Date().toISOString().slice(0, 10)}`,
      language,
      {
        organization: organizationName,
        planner: plannerName,
        fromDate: fromDate,
        toDate: toDate,
        planType: planType
      }
    );
  };

  const handleExportPDF = (language: string = 'en') => {
    if (!processedObjectives || processedObjectives.length === 0) {
      console.warn('No data available for export');
      return;
    }
    
    // Format data for export using the same function as before
    const dataFormatted = processDataForExport(processedObjectives, language);
    exportToPDF(
      dataFormatted,
      `moh-plan-${new Date().toISOString().slice(0, 10)}`,
      language,
      {
        organization: organizationName,
        planner: plannerName,
        fromDate: fromDate,
        toDate: toDate,
        planType: planType
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <Loader className="h-10 w-10 mx-auto text-green-500 animate-spin" />
        <p className="mt-4 text-gray-600 text-lg">Loading complete plan data...</p>
        <p className="mt-2 text-sm text-gray-500">
          Fetching objectives, initiatives, performance measures, and activities...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-center">
        <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Plan Data</h3>
        <p className="text-red-600 mb-4">{error}</p>
        {retryCount < maxRetries && (
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
          >
            Retry Loading ({retryCount + 1}/{maxRetries})
          </button>
        )}
        {retryCount >= maxRetries && (
          <p className="text-sm text-red-500">
            Maximum retry attempts reached. Please refresh the page or contact support.
          </p>
        )}
      </div>
    );
  }

  if (!processedObjectives || processedObjectives.length === 0) {
    return (
      <div className="p-8 text-center bg-yellow-50 rounded-lg border border-yellow-200">
        <Info className="h-10 w-10 text-yellow-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-yellow-800 mb-2">No Complete Data Available</h3>
        <p className="text-yellow-700 mb-4">
          {objectives.length === 0 
            ? "No objectives were found for this plan. Make sure you've selected at least one objective."
            : "The objectives exist but don't have complete data (initiatives, measures, or activities). Please add content to your plan first."
          }
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Plan Header Information */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center">
            <Building2 className="h-5 w-5 text-gray-400 mr-2" />
            <div>
              <p className="text-sm text-gray-500">Organization</p>
              <p className="font-medium">{organizationName}</p>
            </div>
          </div>
          <div className="flex items-center">
            <User className="h-5 w-5 text-gray-400 mr-2" />
            <div>
              <p className="text-sm text-gray-500">Planner</p>
              <p className="font-medium">{plannerName}</p>
            </div>
          </div>
          <div className="flex items-center">
            <FileType className="h-5 w-5 text-gray-400 mr-2" />
            <div>
              <p className="text-sm text-gray-500">Plan Type</p>
              <p className="font-medium">{planType}</p>
            </div>
          </div>
          <div className="flex items-center">
            <Calendar className="h-5 w-5 text-gray-400 mr-2" />
            <div>
              <p className="text-sm text-gray-500">Period</p>
              <p className="font-medium">{formatDate(fromDate)} - {formatDate(toDate)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Plan Summary Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Objectives</p>
              <p className="text-2xl font-semibold text-blue-600">{processedObjectives.length}</p>
            </div>
            <Target className="h-8 w-8 text-blue-500" />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Initiatives</p>
              <p className="text-2xl font-semibold text-green-600">
                {processedObjectives.reduce((sum, obj) => sum + (obj.initiatives?.length || 0), 0)}
              </p>
            </div>
            <BarChart3 className="h-8 w-8 text-green-500" />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Activities</p>
              <p className="text-2xl font-semibold text-purple-600">
                {processedObjectives.reduce((sum, obj) => 
                  sum + (obj.initiatives?.reduce((initSum, init) => 
                    initSum + (init.main_activities?.length || 0), 0) || 0), 0)}
              </p>
            </div>
            <Activity className="h-8 w-8 text-purple-500" />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Budget</p>
              <p className="text-2xl font-semibold text-green-600">
                {formatCurrency(planTotals.totalRequired)}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-green-500" />
          </div>
        </div>
      </div>

      {/* Detailed Plan Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Strategic Objective</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Obj Weight</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Strategic Initiative</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Init Weight</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Performance Measure/Main Activity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Weight</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Baseline</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Q1</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Q2</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">6-Month</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Q3</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Q4</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Annual</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Implementor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Budget Required</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Government</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Partners</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SDG</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Other</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Available</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gap</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {processedObjectives.map((objective, objIndex) => {
                let rowNumber = 1;
                const rows: JSX.Element[] = [];
                
                // Track if we've shown the objective info
                let objectiveShown = false;
                
                if (!objective.initiatives || objective.initiatives.length === 0) {
                  // Show objective without initiatives
                  rows.push(
                    <tr key={`obj-${objective.id}-empty`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{objIndex + 1}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{objective.title}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{objective.effective_weight || objective.weight}%</td>
                      <td className="px-6 py-4 text-sm text-gray-500 italic">No initiatives</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                    </tr>
                  );
                  objectiveShown = true;
                }

                objective.initiatives?.forEach((initiative, initIndex) => {
                  // Track if we've shown the initiative info
                  let initiativeShown = false;
                  
                  // Process performance measures
                  initiative.performance_measures?.forEach((measure, measureIndex) => {
                    const targets = calculateTargets(measure);
                    
                    rows.push(
                      <tr key={`measure-${measure.id}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {!objectiveShown ? objIndex + 1 : ''}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {!objectiveShown ? objective.title : ''}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {!objectiveShown ? `${objective.effective_weight || objective.weight}%` : ''}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {!initiativeShown ? initiative.name : ''}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {!initiativeShown ? `${initiative.weight}%` : ''}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-2">
                            PM
                          </span>
                          {measure.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{measure.weight}%</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{measure.baseline || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{measure.q1_target}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{measure.q2_target}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{targets.sixMonth}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{measure.q3_target}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{measure.q4_target}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{measure.annual_target}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {!initiativeShown ? (initiative.organization_name || '-') : ''}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      </tr>
                    );
                    
                    objectiveShown = true;
                    initiativeShown = true;
                  });
                  
                  // Process main activities
                  initiative.main_activities?.forEach((activity, activityIndex) => {
                    const targets = calculateTargets(activity);
                    const budget = getBudgetInfo(activity);
                    
                    rows.push(
                      <tr key={`activity-${activity.id}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {!objectiveShown ? objIndex + 1 : ''}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {!objectiveShown ? objective.title : ''}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {!objectiveShown ? `${objective.effective_weight || objective.weight}%` : ''}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {!initiativeShown ? initiative.name : ''}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {!initiativeShown ? `${initiative.weight}%` : ''}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-2">
                            MA
                          </span>
                          {activity.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{activity.weight}%</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{activity.baseline || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{activity.q1_target}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{activity.q2_target}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{targets.sixMonth}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{activity.q3_target}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{activity.q4_target}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{activity.annual_target}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {!initiativeShown ? (initiative.organization_name || '-') : ''}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(budget.required)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(budget.government)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(budget.partners)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(budget.sdg)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(budget.other)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(budget.total)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className={`${budget.gap > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(budget.gap)}
                          </span>
                        </td>
                      </tr>
                    );
                    
                    objectiveShown = true;
                    initiativeShown = true;
                  });
                  
                  // If initiative has no measures or activities, show the initiative itself
                  if ((!initiative.performance_measures || initiative.performance_measures.length === 0) &&
                      (!initiative.main_activities || initiative.main_activities.length === 0)) {
                    rows.push(
                      <tr key={`init-${initiative.id}-empty`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {!objectiveShown ? objIndex + 1 : ''}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {!objectiveShown ? objective.title : ''}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {!objectiveShown ? `${objective.effective_weight || objective.weight}%` : ''}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{initiative.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{initiative.weight}%</td>
                        <td className="px-6 py-4 text-sm text-gray-500 italic">No measures or activities</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{initiative.organization_name || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      </tr>
                    );
                    objectiveShown = true;
                  }
                });
                
                return rows;
              })}
              
              {/* Totals Row */}
              <tr className="bg-blue-50 border-t-2 border-blue-200">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900" colSpan={15}>
                  TOTAL BUDGET
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                  {formatCurrency(planTotals.totalRequired)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                  {formatCurrency(planTotals.totalGovernment)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                  {formatCurrency(planTotals.totalPartners)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                  {formatCurrency(planTotals.totalSDG)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                  {formatCurrency(planTotals.totalOther)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                  {formatCurrency(planTotals.totalAvailable)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                  <span className={planTotals.totalGap > 0 ? 'text-red-600' : 'text-green-600'}>
                    {formatCurrency(planTotals.totalGap)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Budget Summary */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Budget Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-500">Total Required</p>
            <p className="text-xl font-semibold text-blue-600">{formatCurrency(planTotals.totalRequired)}</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-gray-500">Total Available</p>
            <p className="text-xl font-semibold text-green-600">{formatCurrency(planTotals.totalAvailable)}</p>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <p className="text-sm text-gray-500">Funding Rate</p>
            <p className="text-xl font-semibold text-yellow-600">
              {planTotals.totalRequired > 0 
                ? `${Math.round((planTotals.totalAvailable / planTotals.totalRequired) * 100)}%`
                : '0%'}
            </p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-sm text-gray-500">Funding Gap</p>
            <p className="text-xl font-semibold text-red-600">{formatCurrency(planTotals.totalGap)}</p>
          </div>
        </div>
      </div>

      {/* Export Buttons - Only show if not in preview mode and not view-only */}
      {!isPreviewMode && !isViewOnly && processedObjectives && processedObjectives.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Export Plan</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              onClick={() => handleExportExcel('en')}
              className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              <FileSpreadsheet className="h-5 w-5 mr-2 text-green-600" />
              Export Excel (EN)
            </button>
            
            <button
              onClick={() => handleExportExcel('am')}
              className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              <FileSpreadsheet className="h-5 w-5 mr-2 text-green-600" />
              Export Excel (አማርኛ)
            </button>
            
            <button
              onClick={() => handleExportPDF('en')}
              className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Download className="h-5 w-5 mr-2 text-blue-600" />
              Export PDF (EN)
            </button>
            
            <button
              onClick={() => handleExportPDF('am')}
              className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Download className="h-5 w-5 mr-2 text-blue-600" />
              Export PDF (አማርኛ)
            </button>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            Export your complete plan data in Excel or PDF format. Choose English or Amharic language for the export.
          </p>
        </div>
      )}

      {/* Submit Button (only show if not in preview mode and not view-only) */}
      {!isPreviewMode && !isViewOnly && (
        <div className="flex justify-end">
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader className="h-5 w-5 mr-2 animate-spin" />
                Submitting Plan...
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5 mr-2" />
                Submit Plan for Review
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default PlanReviewTable;