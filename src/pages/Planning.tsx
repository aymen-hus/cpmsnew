import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { initiatives, performanceMeasures, mainActivities, plans, auth, organizations, objectives } from '../lib/api';
import { AlertCircle, Info, PlusCircle, ChevronRight, FilePlus, FileSpreadsheet, Send, ArrowLeft, Building2, Eye, File as FilePdf } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import Cookies from 'js-cookie';
import StrategicObjectivesList from '../components/StrategicObjectivesList';
import InitiativeForm from '../components/InitiativeForm';
import InitiativeList from '../components/InitiativeList';
import PlanningHeader from '../components/PlanningHeader';
import PerformanceMeasureForm from '../components/PerformanceMeasureForm';
import PerformanceMeasureList from '../components/PerformanceMeasureList';
import MainActivityForm from '../components/MainActivityForm';
import MainActivityList from '../components/MainActivityList';
import PlanSubmitForm from '../components/PlanSubmitForm';
import PlanTypeSelector from '../components/PlanTypeSelector';
import PlanPreviewModal from '../components/PlanPreviewModal';
import HorizontalObjectiveSelector from '../components/HorizontalObjectiveSelector';
import type { StrategicObjective, StrategicInitiative, Program, PerformanceMeasure } from '../types/organization';
import type { MainActivity, PlanType } from '../types/plan';
import { isPlanner } from '../types/user';
import { processDataForExport } from '../lib/utils/export';
import { exportToExcel, exportToPDF } from '../lib/utils/export';

function Planning() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [selectedObjectives, setSelectedObjectives] = useState<StrategicObjective[]>([]);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [selectedInitiative, setSelectedInitiative] = useState<StrategicInitiative | null>(null);
  const [editingInitiative, setEditingInitiative] = useState<StrategicInitiative | null>(null);
  const [editingMeasure, setEditingMeasure] = useState<PerformanceMeasure | null>(null);
  const [editingActivity, setEditingActivity] = useState<MainActivity | null>(null);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState<string>(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    return date.toISOString().split('T')[0];
  });
  const [userPlans, setUserPlans] = useState<any[]>([]);
  const [planType, setPlanType] = useState<PlanType>('LEO/EO Plan'); // Default to LEO/EO Plan
  const [isUserPlanner, setIsUserPlanner] = useState(false);
  const [userOrgId, setUserOrgId] = useState<number | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [orgName, setOrgName] = useState<string>('');
  const [planKey, setPlanKey] = useState<number>(0);
  // State to track plan type selection step
  const [hasPlanTypeSelected, setHasPlanTypeSelected] = useState(false);
  // State to track plans view
  const [showPlansList, setShowPlansList] = useState(true);
  // State to track objective selection step
  const [hasObjectivesSelected, setHasObjectivesSelected] = useState(false);
  // State to track submission status
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  // New state for plan preview modal
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  
  // Debug state to track planner weights
  const [plannerWeightsDebug, setPlannerWeightsDebug] = useState<Record<string, number>>({});

  // Force re-render when initiative is added or removed
  const refreshData = () => {
    setPlanKey(prevKey => prevKey + 1);
  };
  
  // Save selected objectives to localStorage whenever they change
  useEffect(() => {
    if (selectedObjectives.length > 0) {
      try {
       // Ensure effective_weight is set correctly for all objectives
       const objectivesWithEffectiveWeight = selectedObjectives.map(obj => {
         const effectiveWeight = obj.planner_weight !== undefined && obj.planner_weight !== null
           ? obj.planner_weight 
           : obj.weight;
         
         return {
           ...obj,
           effective_weight: effectiveWeight
         };
       });

        // Store the selected objectives data for this user
        const userId = userOrgId ? `user-${userOrgId}` : 'anonymous';
       localStorage.setItem(`moh-selected-objectives-${userId}`, JSON.stringify(objectivesWithEffectiveWeight));
        console.log('Saved selected objectives to localStorage:', selectedObjectives.length);
      } catch (err) {
        console.error('Failed to save objectives to localStorage:', err);
      }
    }
  }, [selectedObjectives, userOrgId]);
  
  // Fetch user plans
  const fetchUserPlans = async () => {
    try {
      const response = await plans.getAll();
      if (response && response.data) {
        setUserPlans(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    }
  };
  
  // Fetch user auth info and check permissions
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        console.log("Fetching user auth data");
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        setIsUserPlanner(isPlanner(authData.userOrganizations));
        
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          const orgId = authData.userOrganizations[0].organization;
          const orgName = authData.userOrganizations[0].organization_name;
          setUserOrgId(orgId);
          setOrgName(orgName);
          
          // Try to load previously saved objectives for this user
          try {
            const savedObjectivesJson = localStorage.getItem(`moh-selected-objectives-${orgId}`);
            if (savedObjectivesJson) {
              const savedObjectives = JSON.parse(savedObjectivesJson);
              console.log('Found saved objectives in localStorage:', savedObjectives.length);
              
              if (Array.isArray(savedObjectives) && savedObjectives.length > 0) {
               // Force the saved objectives to be re-fetched from DB to get latest weights
               const refreshObjectives = async () => {
                 try {
                   // Fetch fresh objectives data
                   const response = await objectives.getAll();
                   if (response?.data) {
                     // Create a map of objectives by ID for easy lookup
                     const objectivesMap = {};
                     response.data.forEach(obj => {
                       objectivesMap[obj.id] = obj;
                     });
                     
                     // Replace saved objectives with fresh data, but keep the effective_weight
                     const refreshedObjectives = savedObjectives.map(savedObj => {
                       const freshObj = objectivesMap[savedObj.id];
                       if (freshObj) {
                         // Keep the planner's saved effective_weight, not the database's planner_weight
                         // This ensures we use the planner's last saved weight
                         freshObj.effective_weight = savedObj.effective_weight || 
                                                  (savedObj.planner_weight !== undefined ? savedObj.planner_weight : savedObj.weight);
                         return freshObj;
                       }
                       return savedObj;
                     });
                     
                     console.log('Refreshed objectives with latest database data:');
                     refreshedObjectives.forEach(obj => {
                       console.log(`Objective ${obj.id} (${obj.title}): weight=${obj.weight}, planner_weight=${obj.planner_weight}, effective_weight=${obj.effective_weight}`);
                     });
                     
                     setSelectedObjectives(refreshedObjectives);
                     return;
                   }
                 } catch (err) {
                   console.error('Failed to refresh objectives from database:', err);
                 }
                 
                 // Fallback to just using saved objectives if refresh fails
               // Ensure effective_weight is set based on planner_weight or weight
               savedObjectives.forEach(obj => {
                 if (obj.planner_weight !== undefined && obj.planner_weight !== null) {
                   obj.effective_weight = obj.planner_weight;
                 } else {
                   obj.effective_weight = obj.weight;
                 }
               });
                setSelectedObjectives(savedObjectives);
               };
               
               await refreshObjectives();
             } else {
               console.log('No saved objectives found or invalid data');
              }
            }
          } catch (err) {
            console.error('Failed to load saved objectives from localStorage:', err);
          }
        }
        
        // Set user name from auth data
        setUserName(authData.user?.first_name || authData.user?.username || '');
      } catch (error) {
        console.error('Failed to fetch user data:', error);
      }
    };
    
    fetchUserData();
    fetchUserPlans();
  }, [navigate]);

  // Handle selecting a plan type
  const handlePlanTypeSelect = (type: PlanType) => {
    setPlanType(type);
    setHasPlanTypeSelected(true);
  };

  // Handle going back to plan type selection
  const handleBackToPlanTypeSelection = () => {
    // Only reset the planning flow state, but keep selected objectives
    setHasObjectivesSelected(false);
    setShowSubmitForm(false);
    // Clear currently selected/editing items
    setSelectedObjectiveId(null);
    setSelectedProgram(null);
    setSelectedInitiative(null);
    setEditingInitiative(null);
    setEditingMeasure(null);
    setEditingActivity(null);
  };

  // Start a new plan after viewing existing plans
  const handleStartNewPlan = () => {
    setShowPlansList(false);
  };

  // Navigate to plan details
  const handleViewPlan = (planId: string) => {
    navigate(`/plans/${planId}`);
  };

  // Handle when objectives are selected in the horizontal selector
  const handleObjectivesSelected = (objectives: StrategicObjective[]) => {
    console.log("Objectives selected by planner:", objectives.map(obj => ({
      id: obj.id,
      title: obj.title,
      weight: obj.weight,
      planner_weight: obj.planner_weight,
      effective_weight: obj.effective_weight || (obj.planner_weight ?? obj.weight)
    })));
    
    // Store debug info about weights
    const debugWeights: Record<string, number> = {};
    objectives.forEach(obj => {
      const effectiveWeight = obj.effective_weight || (obj.planner_weight ?? obj.weight);
      debugWeights[obj.id.toString()] = effectiveWeight;
    });
    setPlannerWeightsDebug(debugWeights);
    
    console.log("Selected objectives with weights:", objectives);
    
   // Ensure each objective has an effective_weight property set
   objectives.forEach(obj => {
     if (obj.planner_weight !== undefined && obj.planner_weight !== null) {
       obj.effective_weight = obj.planner_weight;
     } else {
       obj.effective_weight = obj.weight;
     }
     console.log(`Setting objective ${obj.id} (${obj.title}) with effective_weight=${obj.effective_weight}, planner_weight=${obj.planner_weight}, weight=${obj.weight}`);
   });
   
    setSelectedObjectives(objectives);
    
    // Log selected objectives details
    objectives.forEach(obj => {
      console.log(`Selected objective: ${obj.id} (${obj.title})`);
      console.log(`  Original weight: ${obj.weight}`);
      console.log(`  Planner weight: ${obj.planner_weight}`);
      console.log(`  Effective weight: ${obj.planner_weight !== undefined && obj.planner_weight !== null ? obj.planner_weight : obj.weight}`);
    });
  };

  // Handle proceeding to the planning stage after objectives are selected
  const handleProceedToPlan = () => {
    if (selectedObjectives.length === 0) {
      setError("Please select at least one strategic objective and ensure total weight equals 100%");
      return;
    }
    
    // Set the first objective as the active one
    if (selectedObjectives.length > 0) {
      setSelectedObjectiveId(selectedObjectives[0].id.toString());
    }
    
    // Hide plans list when proceeding to planning
    setShowPlansList(false);
    setHasObjectivesSelected(true);
    
    // Log the selected objectives
    console.log("Proceeding to plan with objectives:", selectedObjectives);
    selectedObjectives.forEach(obj => {
      console.log(`Objective ${obj.id} (${obj.title}): weight=${obj.weight}, planner_weight=${obj.planner_weight}`);
    });
  };

  // Handle selecting an objective in the planning view
  const handleObjectiveSelect = (objective: StrategicObjective) => {
    console.log("Selected objective in planning view:", objective?.id, objective?.title);
    console.log(`  Original weight: ${objective?.weight}`);
    console.log(`  Planner weight: ${objective?.planner_weight}`);
    console.log(`  Effective weight: ${objective?.effective_weight || 'not set'} (fallback: ${objective?.planner_weight !== undefined && objective?.planner_weight !== null ? objective?.planner_weight : objective?.weight})`);
    
    setSelectedObjectiveId(objective.id.toString());
    setSelectedProgram(null);
    setSelectedInitiative(null);
    setEditingInitiative(null);
    setEditingMeasure(null);
    setEditingActivity(null);
  };

  // Handle selecting a program
  const handleProgramSelect = (program: Program) => {
    setSelectedProgram(program);
    setSelectedObjectiveId(null);
    setSelectedInitiative(null);
    setEditingInitiative(null);
    setEditingMeasure(null);
    setEditingActivity(null);
  };

  // Handle initiative selection
  const handleInitiativeSelect = (initiative: StrategicInitiative) => {
    setSelectedInitiative(initiative);
    setEditingInitiative(null);
    setEditingMeasure(null);
    setEditingActivity(null);
  };

  // Handle initiative edit
  const handleEditInitiative = (initiative: StrategicInitiative) => {
    setEditingInitiative(initiative);
    setSelectedInitiative(null);
    setEditingMeasure(null);
    setEditingActivity(null);
  };

  // Get parent name for display
  const getParentName = () => {
    if (selectedObjectiveId && selectedObjectives.length > 0) {
      const objective = selectedObjectives.find(obj => obj.id.toString() === selectedObjectiveId);
      return objective?.title || 'Selected Objective';
    } else if (selectedProgram) {
      return selectedProgram.name;
    }
    return null;
  };

  // Get parent weight for initiatives
  const getParentWeight = (): number => {
    if (selectedObjectiveId && selectedObjectives.length > 0) {
      const objective = selectedObjectives.find(obj => obj.id.toString() === selectedObjectiveId.toString());
     // Use effective_weight if available, otherwise fall back to planner_weight or weight
     if (objective?.effective_weight !== undefined) {
       console.log(`Using effective_weight (${objective.effective_weight}) for objective ${objective.id}`);
       return objective.effective_weight;
     } else if (objective?.planner_weight !== undefined && objective?.planner_weight !== null) {
       console.log(`Using planner_weight (${objective.planner_weight}) for objective ${objective.id}`);
       return objective.planner_weight;
     } else {
       console.log(`Using weight (${objective?.weight}) for objective ${objective?.id}`);
       return objective?.weight || 100;
     }
    } else if (selectedProgram) {
      // For programs, return the parent objective's weight
      if (selectedProgram.strategic_objective && selectedProgram.strategic_objective_id) {
        const parentObjective = selectedObjectives.find(
          obj => obj.id === selectedProgram.strategic_objective_id
        );
        if (parentObjective) {
         // Use effective_weight if available
         if (parentObjective.effective_weight !== undefined) {
           return parentObjective.effective_weight;
         } else if (parentObjective.planner_weight !== undefined && parentObjective.planner_weight !== null) {
            return parentObjective.planner_weight;
          }
          return parentObjective.weight || 100;
        }
      }
      return 100; // Default to 100% if no parent found
    }
    return 100; // Default to 100% if no parent is selected
  };

  // Handle initiative save
  const handleInitiativeSave = async (data: Partial<StrategicInitiative>) => {
    try {
      const parentType = selectedObjectiveId ? 'objective' : selectedProgram ? 'program' : '';
      let parentId;

      // Ensure we're sending the parent ID as a string, not an object
      if (selectedObjectiveId) {
        parentId = typeof selectedObjectiveId === 'object' ? selectedObjectiveId.id : selectedObjectiveId;
      } else if (selectedProgram) {
        parentId = selectedProgram.id;
      } else {
        parentId = '';
      }
      
      // Set the proper foreign key based on parent type
      if (parentType === 'objective') {
        data.strategic_objective = parentId;
        data.program = null;
      } else if (parentType === 'program') {
        data.strategic_objective = null;
        data.program = parentId;
      }
      
      // Set is_default=false and organization_id when created by a planner
      data.is_default = false;
      
      if (!data.organization_id && userOrgId) {
        data.organization_id = typeof userOrgId === 'object' ? userOrgId.id : userOrgId;
      }
      
      if (editingInitiative?.id) {
        // Update existing initiative
        await initiatives.update(editingInitiative.id, data);
      } else {
        // Create new initiative
        await initiatives.create(data);
      }
      
      // Force re-render of initiative list
      refreshData();
      
      // Reset form state
      setEditingInitiative(null);
    } catch (error: any) {
      console.error('Failed to save initiative:', error);
      throw error;
    }
  };

  // Handle initiative delete
  const handleInitiativeDelete = async (id: string) => {
    try {
      await initiatives.delete(id);
      
      if (selectedInitiative?.id === id) {
        setSelectedInitiative(null);
      }
      
      // Force re-render of initiative list
      refreshData();
    } catch (error) {
      console.error('Failed to delete initiative:', error);
    }
  };
  
  // Handle performance measure edit
  const handleEditMeasure = (measure: PerformanceMeasure) => {
    setEditingMeasure(measure);
    setEditingActivity(null);
  };
  
  // Handle performance measure save
  const handleMeasureSave = async (data: Partial<PerformanceMeasure>) => {
    if (!selectedInitiative) {
      setError('No initiative selected');
      return;
    }
    
    try {
      // Ensure initiative ID is set as a string
      data.initiative = selectedInitiative.id.toString();
      
      // Set organization_id if not already set
      if (!data.organization_id && userOrgId) {
        data.organization_id = userOrgId;
      }
      
      if (editingMeasure?.id) {
        // Update existing measure
        await performanceMeasures.update(editingMeasure.id.toString(), data);
      } else {
        // Create new measure
        await performanceMeasures.create(data);
      }
      
      // Reset form state
      setEditingMeasure(null);
      
      // Force refresh of initiative list to update measures
      refreshData();
    } catch (error) {
      console.error('Failed to save measure:', error);
      throw error;
    }
  };
  
  // Handle performance measure delete
  const handleMeasureDelete = async (id: string) => {
    try {
      await performanceMeasures.delete(id);
      
      // Force refresh of initiative list to update measures
      refreshData();
    } catch (error) {
      console.error('Failed to delete measure:', error);
    }
  };
  
  // Handle main activity edit
  const handleEditActivity = (activity: MainActivity) => {
    setEditingActivity(activity);
    setEditingMeasure(null);
  };
  
  // Handle main activity save
  const handleActivitySave = async (data: Partial<MainActivity>) => {
    if (!selectedInitiative) {
      setError('No initiative selected');
      return;
    }
    
    try {
      // Ensure initiative ID is set
      data.initiative = selectedInitiative.id;
      
      // Set organization_id if not already set
      if (!data.organization_id && userOrgId) {
        data.organization_id = userOrgId;
      }
      
      if (editingActivity?.id) {
        // Update existing activity
        await mainActivities.update(editingActivity.id, data);
      } else {
        // Create new activity
        await mainActivities.create(data);
      }
      
      // Reset form state
      setEditingActivity(null);
      
      // Force refresh of initiative list to update activities
      refreshData();
    } catch (error) {
      console.error('Failed to save activity:', error);
      throw error;
    }
  };
  
  // Handle main activity delete
  const handleActivityDelete = async (id: string) => {
    try {
      await mainActivities.delete(id);
      
      // Force refresh of initiative list to update activities
      refreshData();
    } catch (error) {
      console.error('Failed to delete activity:', error);
    }
  };

  // Open preview modal
  const handlePreviewPlan = () => {
    // Force data refresh before showing preview
    refreshData();
    // Force refresh of preview data
    setPreviewRefreshKey(prev => prev + 1);
    setShowPreviewModal(true);
  };

  // Export functions
  const handleExportToExcel = async () => {
    if (!selectedObjectives || selectedObjectives.length === 0) {
      setError('Please select at least one objective before exporting');
      return;
    }
    const data = processDataForExport(selectedObjectives, 'en');
    await exportToExcel(
      data, 
      `moh-plan-${new Date().toISOString().slice(0, 10)}`, 
      'en', 
      {
        organization: orgName,
        planner: userName,
        fromDate: fromDate,
        toDate: toDate,
        planType: getPlanTypeDisplay(planType)
      }
    );
  };

  const handleExportToPDF = async () => {
    if (!selectedObjectives || selectedObjectives.length === 0) {
      setError('Please select at least one objective before exporting');
      return;
    }
    const data = processDataForExport(selectedObjectives, 'en');
    await exportToPDF(
      data, 
      `moh-plan-${new Date().toISOString().slice(0, 10)}`, 
      'en',
      {
        organization: orgName,
        planner: userName,
        fromDate: fromDate,
        toDate: toDate,
        planType: getPlanTypeDisplay(planType)
      }
    );
  };
  
  // Helper function to get display text for plan type
  const getPlanTypeDisplay = (type: PlanType): string => {
    switch (type) {
      case 'LEO/EO Plan':
        return t('planning.types.leadExecutive');
      case 'DESSK/TEAM plan':
        return t('planning.types.teamDesk');
      case 'Individual plan':
        return t('planning.types.individual');
      default:
        return type;
    }
  };
  
  const handleExportToExcelAmharic = async () => {
    if (!selectedObjectives || selectedObjectives.length === 0) {
      setError('Please select at least one objective before exporting');
      return;
    }
    const data = processDataForExport(selectedObjectives, 'am');
    await exportToExcel(
      data, 
      `moh-plan-amharic-${new Date().toISOString().slice(0, 10)}`, 
      'am',
      {
        organization: orgName,
        planner: userName,
        fromDate: fromDate,
        toDate: toDate,
        planType: getPlanTypeDisplay(planType)
      }
    );
  };

  // Handle plan submission
  const handleSubmitPlan = async () => {
    try {
      setSubmitting(true);
      setError(null);
      
      if (!userOrgId) {
        throw new Error('User organization not found');
      }
      
      if (selectedObjectives.length === 0) {
        throw new Error('Please select at least one strategic objective');
      }
      
      // Create plan data
      const planData = {
        organization: Number(userOrgId),
        planner_name: userName,
        type: planType,
        strategic_objective: selectedObjectives[0]?.id,
        from_date: fromDate,
        to_date: toDate,
        fiscal_year: new Date().getFullYear().toString(),
        status: 'DRAFT' // Ensure it's created as a draft
      };
      
      console.log("Creating new plan with data:", planData);
      
      // First refresh CSRF token
      await auth.getCurrentUser();
      
      // Create the plan
      let planIdToSubmit;
      
      if (planId) {
        // If we already have a plan ID, use that
        console.log('Using existing plan ID:', planId);
        planIdToSubmit = planId;
      } else {
        // Otherwise create a new plan
        try {
          const result = await plans.create(planData);
          console.log("Plan creation result:", result);
      
          if (!result || !result.id) {
            throw new Error('Failed to create plan - no ID returned');
          }
          
          planIdToSubmit = result.id.toString();
          console.log('Plan created successfully with ID:', planIdToSubmit);
          setPlanId(planIdToSubmit);
        } catch (createError) {
          console.error('Plan creation error:', createError);
          // Extract detailed error message
          if (createError.response?.data) {
            const errorDetail = typeof createError.response.data === 'string' 
              ? createError.response.data 
              : createError.response.data.detail || JSON.stringify(createError.response.data);
            throw new Error(`Failed to create plan: ${errorDetail}`);
          }
          throw new Error('Failed to create plan: ' + (createError.message || 'Unknown error'));
        }
      }
      
      // Step 2: Submit the plan
      console.log(`Submitting plan ${planIdToSubmit} for review...`);
      try {
        // Refresh CSRF token again for submission
        await auth.getCurrentUser();
        
        const submitResponse = await plans.submitToEvaluator(planIdToSubmit.toString());
        console.log("Plan submission response:", submitResponse);
        
        // Update UI and redirect
        setSubmissionStatus('success');
        setError(null);
        alert('Plan submitted successfully!');
        navigate('/dashboard');
      } catch (submitError) {
        console.error('Plan submission error:', submitError);
        // Extract detailed error message
        if (submitError.response?.data) {
          const errorDetail = typeof submitError.response.data === 'string' 
            ? submitError.response.data 
            : submitError.response.data.detail || JSON.stringify(submitError.response.data);
          throw new Error(`Failed to submit plan: ${errorDetail}`);
        }
        throw new Error('Failed to submit plan: ' + (submitError.message || 'Unknown error'));
      }
      
    } catch (error) {
      console.error('Error in plan submission process:', error);

      // Reset submitting state
      setSubmitting(false);
      // Keep the form open for retrying
      setShowSubmitForm(true);
      // Reset the submission status
      setSubmissionStatus('error');
      
      // Extract error message
      let errorMessage = 'Failed to process plan';
      if (error.response) {
        if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (error.response.data && error.response.data.detail) {
          errorMessage = error.response.data.detail;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
      setSubmissionStatus('error');
    } finally { 
      if (submissionStatus === 'success') {
        setShowSubmitForm(false);
      }
    }
  };
  
  const handleShowSubmitForm = () => {
    try {
      setError(null);
      setSubmissionStatus('idle');
      
      if (!userOrgId || selectedObjectives.length === 0) {
        setError('Please select at least one strategic objective');
        return;
      }
      
      // Reset any existing plan ID to force creation of a new plan
      setPlanId(null);
      
      setShowSubmitForm(true);
    } catch (error) {
      console.error('Failed to prepare plan for submission:', error);
      setError(error.message || 'Failed to prepare plan for submission');
    }
  };

  // Determine if initiatives need to be displayed
  const showInitiatives = selectedObjectiveId || selectedProgram;
  
  // Determine if measures and activities need to be displayed
  const showMeasuresAndActivities = selectedInitiative && !editingInitiative;
  
  // If user isn't a planner, show info message
  if (!isUserPlanner) {
    return (
      <div className="p-8 bg-yellow-50 rounded-lg border border-yellow-200">
        <div className="flex items-center mb-4">
          <Info className="h-6 w-6 text-yellow-500 mr-2" />
          <h2 className="text-lg font-medium text-yellow-800">View Only Mode</h2>
        </div>
        <p className="text-yellow-700 mb-4">
          You are viewing this page in read-only mode. Only users with the Planner role can create and modify plans.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-yellow-700 bg-yellow-100 hover:bg-yellow-200"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  // If plan type has not been selected, show the plan type selector
  if (!hasPlanTypeSelected) {
    return <PlanTypeSelector onSelectPlanType={handlePlanTypeSelect} />;
  }

  // Show plans list or objective selector based on state
  if (!hasObjectivesSelected && showPlansList) {
    return (
      <div className="space-y-6">
        {/* Back button to plan type selection */}
        <div className="flex items-center justify-between">
          <button 
            onClick={handleBackToPlanTypeSelection}
            className="flex items-center text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Plan Type Selection
          </button>
          
          <div className="bg-green-100 px-4 py-2 rounded-lg flex items-center">
            <Building2 className="h-5 w-5 text-green-600 mr-2" />
            <span className="text-green-800 font-medium">
              {planType === 'LEO/EO Plan' ? 'LEO/EO Plan' : 
               planType === 'Desk/Team Plan' ? 'Desk/Team Plan' : 'Individual Plan'}
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Your Plans</h2>
            <button
              onClick={handleStartNewPlan}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Create New Plan
            </button>
          </div>

          {userPlans.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <p className="text-gray-500 mb-4">You don't have any plans yet</p>
              <button
                onClick={handleStartNewPlan}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Create Your First Plan
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Organization
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Plan Type
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Period
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {userPlans.map((plan) => (
                    <tr key={plan.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {plan.organization_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {plan.type_display || plan.type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(plan.from_date).toLocaleDateString()} - {new Date(plan.to_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          plan.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
                          plan.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
                          plan.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {plan.status_display || plan.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button
                          onClick={() => handleViewPlan(plan.id)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6">
            <button
              onClick={handleStartNewPlan}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Start Creating a New Plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If objectives have not been selected and not viewing plans list, show the objective selector
  if (!hasObjectivesSelected && !showPlansList) {
    return (
      <div className="space-y-6">
        {/* Back button to plan type selection */}
        <div className="flex items-center justify-between">
          <button 
            onClick={handleBackToPlanTypeSelection}
            className="flex items-center text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Plan Type Selection
          </button>
          
          <button
            onClick={() => setShowPlansList(true)}
            className="ml-4 flex items-center text-blue-600 hover:text-blue-800"
          >
            View Your Plans
          </button>
          
          <div className="bg-green-100 px-4 py-2 rounded-lg flex items-center">
            <Building2 className="h-5 w-5 text-green-600 mr-2" />
            <span className="text-green-800 font-medium">
              {planType === 'LEO/EO Plan' ? 'LEO/EO Plan' : 
               planType === 'Desk/Team Plan' ? 'Desk/Team Plan' : 'Individual Plan'}
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Select and Configure Strategic Objectives
          </h2>
          
          <HorizontalObjectiveSelector
            initialObjectives={selectedObjectives}
            onObjectivesSelected={handleObjectivesSelected}
            onProceed={handleProceedToPlan}
            debugWeights={plannerWeightsDebug}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button to objective selection */}
      <div className="flex items-center justify-between">
        <button 
          onClick={() => {
            setHasObjectivesSelected(false);
            setShowSubmitForm(false);
          }}
          className="flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Objective Selection
        </button>
        
        <div className="bg-green-100 px-4 py-2 rounded-lg flex items-center">
          <Building2 className="h-5 w-5 text-green-600 mr-2" />
          <span className="text-green-800 font-medium">
            {planType === 'LEO/EO Plan' ? 'LEO/EO Plan' : 
             planType === 'Desk/Team Plan' ? 'Desk/Team Plan' : 'Individual Plan'}
          </span>
        </div>
      </div>

      {/* Debug info - can be removed in production */}
      {Object.keys(plannerWeightsDebug).length > 0 && (
        <div className="mb-4 p-3 bg-gray-100 rounded text-xs">
          <strong>Debug - Planner Weights:</strong>
          <ul>
            {Object.entries(plannerWeightsDebug).map(([id, weight]) => (
              <li key={id}>
                Objective {id}: {weight}%
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Planning Header */}
      <PlanningHeader
        organizationName={orgName}
        fromDate={fromDate}
        toDate={toDate}
        plannerName={userName}
        planType={planType}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onPlanTypeChange={setPlanType}
      />

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
          <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Debug info - can be removed in production */}
      <div className="mb-4 p-3 bg-gray-100 rounded text-xs">
        <strong>Debug - Selected Objectives:</strong>
        <ul>
          {selectedObjectives.map((obj) => (
            <li key={obj.id}>
              {obj.title}: weight={obj.weight}, 
              planner_weight={obj.planner_weight !== undefined ? obj.planner_weight : 'undefined'}, 
              effective_weight={obj.effective_weight !== undefined ? 
                obj.effective_weight : 
                (obj.planner_weight !== undefined ? obj.planner_weight : obj.weight)}
            </li>
          ))}
        </ul>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Strategic Objectives Column */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              {t('planning.selectObjective')}
            </h2>
            
            <StrategicObjectivesList
              onSelectObjective={handleObjectiveSelect}
              selectedObjectiveId={selectedObjectiveId}
              onSelectProgram={handleProgramSelect}
              selectedObjectives={selectedObjectives}
            />
          </div>
        </div>

        {/* Initiatives Column */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center justify-between">
              <span>{t('planning.initiatives')}</span>
              {getParentName() && (
                <span className="text-sm font-normal text-gray-500">
                  {getParentName()}
                </span>
              )}
            </h2>

            {!showInitiatives && !editingInitiative && (
              <div className="text-center p-8 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <p className="mb-4">{t('planning.selectObjective')}</p>
              </div>
            )}

            {showInitiatives && !editingInitiative && (
              <div>
                <InitiativeList
                  parentId={selectedObjectiveId || selectedProgram?.id.toString() || ''}
                  parentType={selectedObjectiveId ? 'objective' : 'program'}
                  parentWeight={getParentWeight()}
                  onEditInitiative={handleEditInitiative}
                  onSelectInitiative={handleInitiativeSelect}
                  isNewPlan
                  planKey={planKey}
                  plannerWeightsDebug={plannerWeightsDebug}
                  isUserPlanner={isUserPlanner}
                  userOrgId={userOrgId}
                />
              </div>
            )}

            {editingInitiative && (
              <div>
                <h3 className="text-md font-medium text-gray-800 mb-4">
                  {editingInitiative.id ? t('planning.editInitiative') : t('planning.createInitiative')}
                </h3>
                <InitiativeForm
                  parentId={selectedObjectiveId || selectedProgram?.id.toString() || ''}
                  parentType={selectedObjectiveId ? 'objective' : 'program'}
                  parentWeight={getParentWeight()}
                  currentTotal={0} // Handled internally by the component
                  onSubmit={handleInitiativeSave}
                  initialData={editingInitiative.id ? editingInitiative : undefined}
                />
              </div>
            )}
          </div>
        </div>

        {/* Performance Measures & Activities Column */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center justify-between">
              <span>{selectedInitiative ? selectedInitiative.name : t('planning.performanceMeasures')}</span>
              {selectedInitiative && (
                <span className="text-sm font-normal text-gray-500">
                  Weight: {selectedInitiative.weight}%
                </span>
              )}
            </h2>

            {!showMeasuresAndActivities && !editingMeasure && !editingActivity && (
              <div className="text-center p-8 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <p className="mb-4">Select an initiative to manage performance measures and activities</p>
              </div>
            )}

            {showMeasuresAndActivities && !editingMeasure && !editingActivity && (
              <div className="space-y-8">
                {/* Performance Measures */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-md font-medium text-gray-800">
                      {t('planning.performanceMeasures')}
                    </h3>
                    <button
                      onClick={() => setEditingMeasure({})}
                      className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <PlusCircle className="h-4 w-4 mr-1" />
                      Add
                    </button>
                  </div>
                  
                  <PerformanceMeasureList
                    initiativeId={selectedInitiative.id}
                    initiativeWeight={selectedInitiative.weight}
                    onEditMeasure={handleEditMeasure}
                    onDeleteMeasure={handleMeasureDelete}
                  />
                </div>
                
                {/* Main Activities */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-md font-medium text-gray-800">
                      {t('planning.mainActivities')}
                    </h3>
                    <button
                      onClick={() => setEditingActivity({})}
                      className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-green-700 bg-green-100 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    >
                      <PlusCircle className="h-4 w-4 mr-1" />
                      Add
                    </button>
                  </div>
                  
                  <MainActivityList
                    initiativeId={selectedInitiative.id}
                    onEditActivity={handleEditActivity}
                    onDeleteActivity={handleActivityDelete}
                  />
                </div>
              </div>
            )}

            {editingMeasure && (
              <div>
                <h3 className="text-md font-medium text-gray-800 mb-4">
                  {editingMeasure.id ? t('planning.editPerformanceMeasure') : t('planning.createPerformanceMeasure')}
                </h3>
                <PerformanceMeasureForm
                  initiativeId={selectedInitiative?.id || ''}
                  currentTotal={0} // Handled internally by the component
                  onSubmit={handleMeasureSave}
                  initialData={editingMeasure.id ? editingMeasure : null}
                  onCancel={() => setEditingMeasure(null)}
                />
              </div>
            )}

            {editingActivity && (
              <div>
                <h3 className="text-md font-medium text-gray-800 mb-4">
                  {editingActivity.id ? t('planning.editMainActivity') : t('planning.createMainActivity')}
                </h3>
                <MainActivityForm
                  initiativeId={selectedInitiative?.id || ''}
                  currentTotal={0} // Handled internally by the component
                  onSubmit={handleActivitySave}
                  initialData={editingActivity.id ? editingActivity : null}
                  onCancel={() => setEditingActivity(null)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview and Submit Section */}
      {selectedObjectives.length > 0 && !editingInitiative && !editingMeasure && !editingActivity && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mt-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-gray-900">{showSubmitForm ? 'Plan Submission' : 'Plan Summary & Submission'}</h2>
            <div className="flex space-x-3">
              {!showSubmitForm && (
                <>
                  
                  
                 
                  <button
                    onClick={handlePreviewPlan}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Preview Plan
                  </button>
                  <button
                    onClick={handleShowSubmitForm}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
                    disabled={submitting || submissionStatus === 'submitting'}
                  > 
                    <Send className="h-4 w-4 mr-2" />
                    Submit for Review
                  </button>
                </>
              )}
            </div>
          </div>
          
          {!showSubmitForm ? (
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <div className="flex items-center mb-2">
                <Info className="h-5 w-5 text-yellow-600 mr-2" />
                <h3 className="text-md font-medium text-yellow-800">Ready to Submit</h3>
              </div>
              <p className="text-sm text-yellow-700">
                Your plan is ready to be submitted for review. You can preview your plan using the "Preview Plan" button, 
                or export it to Excel or PDF format. When you're ready, click the "Submit for Review" button to 
                proceed with submission. Once submitted, your plan will be locked for editing until the review
                process is complete.
              </p>
            </div>
          ) : (
            <PlanSubmitForm
              plan={{
                id: planId || '',
                organization: userOrgId ? userOrgId.toString() : '',
                organizationName: orgName,
                planner_name: userName,
                type: planType,
                strategic_objective: selectedObjectives[0]?.id.toString() || '',
                fiscal_year: new Date().getFullYear().toString(),
                from_date: fromDate,
                to_date: toDate,
                status: 'DRAFT',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }}
              onSubmit={handleSubmitPlan}
              onCancel={() => setShowSubmitForm(false)}
              isSubmitting={submitting}
            />
          )}
        </div>
      )}

      {/* Plan Preview Modal */}
      <PlanPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        objectives={selectedObjectives.map(obj => ({...obj}))} // Pass deep copy to avoid reference issues
        organizationName={orgName}
        plannerName={userName}
        fromDate={fromDate}
        toDate={toDate}
        planType={planType}
        refreshKey={previewRefreshKey} // Pass refresh key to force re-render
      />
    </div>
  );
}

export default Planning;