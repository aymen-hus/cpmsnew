import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, FileSpreadsheet, File as FilePdf, ArrowLeft, AlertCircle, Loader, Building2, Calendar, User, CheckCircle, XCircle, ClipboardCheck, FileType, RefreshCw } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { plans, organizations, auth, api, initiatives, performanceMeasures, mainActivities } from '../lib/api';
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
  const [userOrgId, setUserOrgId] = useState<number | null>(null);
  const [authState, setAuthState] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [organizationName, setOrganizationName] = useState<string>('');
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [processedPlanData, setProcessedPlanData] = useState<any>(null);
  const [showTableView, setShowTableView] = useState(false);
  const [enrichedObjectives, setEnrichedObjectives] = useState<any[]>([]);
  const [isEnrichingData, setIsEnrichingData] = useState(false);
  const [enrichmentError, setEnrichmentError] = useState<string | null>(null);
  const [enrichmentProgress, setEnrichmentProgress] = useState<string>('');

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
          setUserOrgId(authData.userOrganizations[0].organization);
        }
        
        const response = await axios.get('/api/auth/csrf/', { withCredentials: true });
        const token = response.headers['x-csrftoken'] || Cookies.get('csrftoken');
        if (token) Cookies.set('csrftoken', token, { path: '/' });
      } catch (error) {
        console.error("Authentication check failed:", error);
      }
    };
    
    ensureAuth();
  }, [navigate]);

  useEffect(() => {
    if (planData) {
      setProcessedPlanData(planData);
      
      if (organizationsData) {
        try {
          if (planData.organizationName) {
            setOrganizationName(planData.organizationName);
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

  // Production-safe data enrichment function
  const enrichObjectivesWithCompleteData = async (objectivesList: any[]): Promise<any[]> => {
    if (!objectivesList || objectivesList.length === 0) {
      console.log('No objectives to enrich');
      return [];
    }

    console.log(`Starting to enrich ${objectivesList.length} objectives for table view`);
    const enrichedObjectives = [];

    for (let i = 0; i < objectivesList.length; i++) {
      const objective = objectivesList[i];
      if (!objective) continue;

      try {
        setEnrichmentProgress(`Processing objective ${i + 1}/${objectivesList.length}: ${objective.title}`);
        console.log(`Enriching objective ${objective.id} (${objective.title})`);

        // Fetch ALL initiatives for this objective using comprehensive approach
        setEnrichmentProgress(`Fetching ALL initiatives for ${objective.title}...`);
        console.log(`Fetching ALL initiatives for objective ${objective.id} (${objective.title})`);
        
        let allObjectiveInitiatives = [];
        
        // Method 1: Direct objective initiatives with multiple strategies
        try {
          console.log(`Method 1: Direct initiatives for objective ${objective.id}`);
          
          // Try multiple API call formats for better production compatibility
          let directInitiatives = [];
          
          // Strategy 1a: Standard API call
          try {
            const response1 = await initiatives.getByObjective(objective.id.toString());
            directInitiatives = response1?.data || [];
            console.log(`Strategy 1a: Found ${directInitiatives.length} direct initiatives`);
          } catch (error1a) {
            console.warn('Strategy 1a failed:', error1a);
            
            // Strategy 1b: Alternative parameter format
            try {
              const response1b = await axios.get('/api/strategic-initiatives/', {
                params: { 
                  strategic_objective: objective.id,
                  _t: Date.now()
                },
                timeout: 12000,
                withCredentials: true
              });
              directInitiatives = response1b.data?.results || response1b.data || [];
              console.log(`Strategy 1b: Found ${directInitiatives.length} direct initiatives`);
            } catch (error1b) {
              console.warn('Strategy 1b failed:', error1b);
              
              // Strategy 1c: Simple parameter format
              try {
                const response1c = await axios.get('/api/strategic-initiatives/', {
                  params: { objective: objective.id },
                  timeout: 8000,
                  withCredentials: true
                });
                directInitiatives = response1c.data?.results || response1c.data || [];
                console.log(`Strategy 1c: Found ${directInitiatives.length} direct initiatives`);
              } catch (error1c) {
                console.warn('All direct initiative strategies failed:', error1c);
                directInitiatives = [];
              }
            }
          }
          
          allObjectiveInitiatives = [...directInitiatives];
          console.log(`Total after Method 1: ${allObjectiveInitiatives.length} initiatives`);
          
        } catch (method1Error) {
          console.error('Method 1 completely failed:', method1Error);
        }
        
        // Method 2: Get ALL initiatives and filter by objective
        try {
          console.log(`Method 2: Filter all initiatives for objective ${objective.id}`);
          
          const allInitiativesResponse = await initiatives.getAll();
          const allInitiatives = allInitiativesResponse?.data || [];
          console.log(`Method 2: Got ${allInitiatives.length} total initiatives to filter`);
          
          // Filter initiatives that belong to this objective
          const objectiveRelatedInitiatives = allInitiatives.filter(initiative => {
            // Direct objective relationship
            const matchesObjective = initiative.strategic_objective && 
                    initiative.strategic_objective.toString() === objective.id.toString();
            
            // Program relationship - check if initiative's program belongs to this objective
            const matchesProgram = initiative.program && objective.programs && Array.isArray(objective.programs) &&
                    objective.programs.some(program => 
                      program.id.toString() === initiative.program.toString()
                    );
            
            return matchesObjective || matchesProgram;
          });
          
          console.log(`Method 2: Found ${objectiveRelatedInitiatives.length} related initiatives from all initiatives`);
          
          // Merge with direct initiatives, avoiding duplicates
          objectiveRelatedInitiatives.forEach(relatedInitiative => {
            if (!allObjectiveInitiatives.find(existing => existing.id === relatedInitiative.id)) {
              allObjectiveInitiatives.push(relatedInitiative);
            }
          });
          
          console.log(`Total after Method 2: ${allObjectiveInitiatives.length} initiatives`);
          
        } catch (method2Error) {
          console.error('Method 2 failed:', method2Error);
        }
        
        // Method 3: Fetch initiatives for each program under this objective
        if (objective.programs && Array.isArray(objective.programs)) {
          for (const program of objective.programs) {
            try {
              console.log(`Method 3: Fetching initiatives for program ${program.id} under objective ${objective.id}`);
              
              let programInitiatives = [];
              
              // Try multiple strategies for program initiatives
              try {
                const programResponse = await initiatives.getByProgram(program.id.toString());
                programInitiatives = programResponse?.data || [];
                console.log(`Method 3a: Found ${programInitiatives.length} initiatives for program ${program.id}`);
              } catch (program3aError) {
                console.warn(`Program strategy 3a failed for program ${program.id}:`, program3aError);
                
                try {
                  const programResponse = await axios.get('/api/strategic-initiatives/', {
                    params: { program: program.id },
                    timeout: 8000,
                    withCredentials: true
                  });
                  programInitiatives = programResponse.data?.results || programResponse.data || [];
                  console.log(`Method 3b: Found ${programInitiatives.length} initiatives for program ${program.id}`);
                } catch (program3bError) {
                  console.warn(`Program strategy 3b failed for program ${program.id}:`, program3bError);
                }
              }
              
              // Add program initiatives to the list, avoiding duplicates
              programInitiatives.forEach(programInitiative => {
                if (!allObjectiveInitiatives.find(existing => existing.id === programInitiative.id)) {
                  allObjectiveInitiatives.push(programInitiative);
                }
              });
              
            } catch (programError) {
              console.error(`Error fetching initiatives for program ${program.id}:`, programError);
            }
          }
        }
        
        console.log(`FINAL TOTAL initiatives found for objective ${objective.id}: ${allObjectiveInitiatives.length}`);

        // Filter initiatives based on user organization
        const filteredInitiatives = allObjectiveInitiatives.filter(initiative => 
          initiative.is_default || 
          !initiative.organization || 
          initiative.organization === userOrgId
        );

        console.log(`Filtered to ${filteredInitiatives.length} initiatives for user org ${userOrgId}`);

        // Enrich each initiative with performance measures and main activities
        const enrichedInitiatives = [];
        
        for (let j = 0; j < filteredInitiatives.length; j++) {
          const initiative = filteredInitiatives[j];
          if (!initiative) continue;

          try {
            setEnrichmentProgress(`Processing initiative ${j + 1}/${filteredInitiatives.length}: ${initiative.name}`);
            console.log(`Enriching initiative ${initiative.id} (${initiative.name})`);

            // Fetch performance measures with multiple strategies
            let allMeasures = [];
            try {
              console.log(`Fetching performance measures for initiative ${initiative.id}`);
              
              // Strategy 1: Use API function
              try {
                const measuresResponse = await performanceMeasures.getByInitiative(initiative.id);
                allMeasures = measuresResponse?.data || [];
                console.log(`Strategy 1: Found ${allMeasures.length} performance measures for initiative ${initiative.id}`);
              } catch (measures1Error) {
                console.warn(`Performance measures strategy 1 failed for initiative ${initiative.id}:`, measures1Error);
                
                // Strategy 2: Direct API call with alternative parameters
                try {
                  const measuresResponse = await axios.get('/api/performance-measures/', {
                    params: { 
                      initiative: initiative.id,
                      initiative_id: initiative.id,
                      _t: Date.now()
                    },
                    timeout: 10000,
                    withCredentials: true
                  });
                  allMeasures = measuresResponse.data?.results || measuresResponse.data || [];
                  console.log(`Strategy 2: Found ${allMeasures.length} performance measures for initiative ${initiative.id}`);
                } catch (measures2Error) {
                  console.warn(`Performance measures strategy 2 failed for initiative ${initiative.id}:`, measures2Error);
                  
                  // Strategy 3: Simple parameter format
                  try {
                    const measuresResponse = await axios.get('/api/performance-measures/', {
                      params: { initiative: initiative.id },
                      timeout: 6000,
                      withCredentials: true
                    });
                    allMeasures = measuresResponse.data?.results || measuresResponse.data || [];
                    console.log(`Strategy 3: Found ${allMeasures.length} performance measures for initiative ${initiative.id}`);
                  } catch (measures3Error) {
                    console.warn(`All performance measures strategies failed for initiative ${initiative.id}:`, measures3Error);
                    allMeasures = [];
                  }
                }
              }
            } catch (measuresError) {
              console.warn(`Failed to get performance measures for initiative ${initiative.id}:`, measuresError);
              allMeasures = [];
            }
            
            // Fetch main activities with multiple strategies
            let allActivities = [];
            try {
              console.log(`Fetching main activities for initiative ${initiative.id}`);
              
              // Strategy 1: Use API function
              try {
                const activitiesResponse = await mainActivities.getByInitiative(initiative.id);
                allActivities = activitiesResponse?.data || [];
                console.log(`Strategy 1: Found ${allActivities.length} main activities for initiative ${initiative.id}`);
              } catch (activities1Error) {
                console.warn(`Main activities strategy 1 failed for initiative ${initiative.id}:`, activities1Error);
                
                // Strategy 2: Direct API call with alternative parameters
                try {
                  const activitiesResponse = await axios.get('/api/main-activities/', {
                    params: { 
                      initiative: initiative.id,
                      initiative_id: initiative.id,
                      _t: Date.now()
                    },
                    timeout: 10000,
                    withCredentials: true
                  });
                  allActivities = activitiesResponse.data?.results || activitiesResponse.data || [];
                  console.log(`Strategy 2: Found ${allActivities.length} main activities for initiative ${initiative.id}`);
                } catch (activities2Error) {
                  console.warn(`Main activities strategy 2 failed for initiative ${initiative.id}:`, activities2Error);
                  
                  // Strategy 3: Simple parameter format
                  try {
                    const activitiesResponse = await axios.get('/api/main-activities/', {
                      params: { initiative: initiative.id },
                      timeout: 6000,
                      withCredentials: true
                    });
                    allActivities = activitiesResponse.data?.results || activitiesResponse.data || [];
                    console.log(`Strategy 3: Found ${allActivities.length} main activities for initiative ${initiative.id}`);
                  } catch (activities3Error) {
                    console.warn(`All main activities strategies failed for initiative ${initiative.id}:`, activities3Error);
                    allActivities = [];
                  }
                }
              }
            } catch (activitiesError) {
              console.warn(`Failed to get main activities for initiative ${initiative.id}:`, activitiesError);
              allActivities = [];
            }

            // Filter by organization
            const filteredMeasures = allMeasures.filter(measure =>
              !measure.organization || measure.organization === userOrgId
            );

            const filteredActivities = allActivities.filter(activity =>
              !activity.organization || activity.organization === userOrgId
            );

            console.log(`Initiative ${initiative.id}: ${filteredMeasures.length} measures, ${filteredActivities.length} activities`);

            enrichedInitiatives.push({
              ...initiative,
              performance_measures: filteredMeasures,
              main_activities: filteredActivities
            });

            // Small delay to prevent server overload
            if (j < filteredInitiatives.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }

          } catch (initiativeError) {
            console.warn(`Error processing initiative ${initiative.id}:`, initiativeError);
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

        console.log(`Completed objective ${objective.id}: ${enrichedInitiatives.length} enriched initiatives`);

        // Small delay between objectives
        if (i < objectivesList.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }

      } catch (objectiveError) {
        console.warn(`Error processing objective ${objective.id}:`, objectiveError);
        // Add objective with empty initiatives instead of skipping
        enrichedObjectives.push({
          ...objective,
          effective_weight: objective.weight,
          initiatives: []
        });
      }
    }

    console.log(`=== ENRICHMENT COMPLETE ===`);
    console.log(`Successfully enriched ${enrichedObjectives.length} objectives`);
    
    const totalInitiatives = enrichedObjectives.reduce((sum, obj) => sum + (obj.initiatives?.length || 0), 0);
    const totalMeasures = enrichedObjectives.reduce((sum, obj) => 
      sum + (obj.initiatives?.reduce((iSum, init) => iSum + (init.performance_measures?.length || 0), 0) || 0), 0);
    const totalActivities = enrichedObjectives.reduce((sum, obj) => 
      sum + (obj.initiatives?.reduce((iSum, init) => iSum + (init.main_activities?.length || 0), 0) || 0), 0);
    
    console.log(`FINAL TOTALS: ${totalInitiatives} initiatives, ${totalMeasures} measures, ${totalActivities} activities`);

    return enrichedObjectives;
  };

  // Trigger data enrichment when table view is requested
  useEffect(() => {
    const enrichDataForTableView = async () => {
      if (!showTableView || !processedPlanData?.objectives || !userOrgId) {
        return;
      }

      if (enrichedObjectives.length > 0) {
        // Data already enriched
        return;
      }

      try {
        setIsEnrichingData(true);
        setEnrichmentError(null);
        setEnrichmentProgress('Starting data enrichment...');

        console.log('=== STARTING TABLE VIEW DATA ENRICHMENT ===');
        console.log('Processing plan objectives:', processedPlanData.objectives.length);
        console.log('User org ID:', userOrgId);

        const enrichedData = await enrichObjectivesWithCompleteData(processedPlanData.objectives);
        
        setEnrichedObjectives(enrichedData);
        setEnrichmentProgress(`Completed loading ${enrichedData.length} objectives`);
        
        console.log('=== ENRICHMENT SUCCESS ===');
        console.log('Enriched objectives set:', enrichedData.length);
      } catch (error) {
        console.error('Error enriching data for table view:', error);
        setEnrichmentError(error instanceof Error ? error.message : 'Failed to load complete data');
      } finally {
        setIsEnrichingData(false);
      }
    };

    enrichDataForTableView();
  }, [showTableView, processedPlanData?.objectives, userOrgId]);

  // Reset enriched data when table view is hidden
  useEffect(() => {
    if (!showTableView) {
      setEnrichedObjectives([]);
      setEnrichmentError(null);
      setEnrichmentProgress('');
    }
  }, [showTableView]);

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
              onClick={() => {
                if (!showTableView) {
                  // Reset enriched data when opening table view to force fresh fetch
                  setEnrichedObjectives([]);
                  setEnrichmentError(null);
                }
                setShowTableView(!showTableView);
              }}
              className={`flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium ${
                showTableView 
                  ? 'bg-blue-50 text-blue-700 border-blue-300' 
                  : 'text-gray-700 bg-white hover:bg-gray-50'
              }`}
              disabled={isEnrichingData}
            >
              {isEnrichingData ? (
                <>
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                  Enriching Data...
                </>
              ) : (
                <>
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  {showTableView ? 'Hide Table View' : 'Show Table View'}
                </>
              )}
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

        {/* Show enrichment progress */}
        {isEnrichingData && (
          <div className="mb-6 bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center">
              <Loader className="h-5 w-5 animate-spin text-blue-600 mr-3" />
              <div>
                <p className="text-blue-800 font-medium">Loading Complete Plan Data</p>
                <p className="text-blue-600 text-sm">{enrichmentProgress}</p>
              </div>
            </div>
          </div>
        )}

        {/* Show enrichment error */}
        {enrichmentError && (
          <div className="mb-6 bg-red-50 p-4 rounded-lg border border-red-200">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
              <div>
                <p className="text-red-800 font-medium">Failed to Load Complete Data</p>
                <p className="text-red-600 text-sm">{enrichmentError}</p>
              </div>
            </div>
            <button
              onClick={() => {
                setEnrichedObjectives([]);
                setEnrichmentError(null);
                setShowTableView(false);
                setTimeout(() => setShowTableView(true), 100);
              }}
              className="mt-2 px-3 py-1 bg-white border border-red-300 rounded text-red-700 hover:bg-red-50 text-sm"
            >
              Retry Loading
            </button>
          </div>
        )}

        {/* Table View */}
        {showTableView && !isEnrichingData && (
          <div className="mb-8">
            {enrichedObjectives.length > 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-lg font-medium text-gray-900">Complete Plan Table View</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Detailed view showing all objectives, initiatives, measures, and activities
                  </p>
                </div>
                <div className="p-6">
                  <PlanReviewTable
                    objectives={enrichedObjectives}
                    onSubmit={async () => {}}
                    isSubmitting={false}
                    organizationName={organizationName}
                    plannerName={processedPlanData.planner_name || 'N/A'}
                    fromDate={processedPlanData.from_date || ''}
                    toDate={processedPlanData.to_date || ''}
                    planType={processedPlanData.type || 'N/A'}
                    isPreviewMode={true}
                    userOrgId={userOrgId}
                    isViewOnly={true}
                  />
                </div>
              </div>
            ) : (
              <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
                <div className="flex items-center">
                  <AlertCircle className="h-5 w-5 text-yellow-500 mr-3" />
                  <div>
                    <p className="text-yellow-800 font-medium">No Complete Data Available</p>
                    <p className="text-yellow-600 text-sm">
                      {processedPlanData.objectives?.length === 0 
                        ? "No objectives found in this plan."
                        : "The objectives don't have complete data (initiatives, measures, or activities)."}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setEnrichedObjectives([]);
                    setEnrichmentError(null);
                    setShowTableView(false);
                    setTimeout(() => setShowTableView(true), 100);
                  }}
                  className="mt-3 px-3 py-1 bg-white border border-yellow-300 rounded text-yellow-700 hover:bg-yellow-50 text-sm"
                >
                  Retry Loading Data
                </button>
              </div>
            )}
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