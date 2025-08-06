import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Calendar, Building2, User, FileType, Target, Plus, Edit, AlertCircle, CheckCircle, Info, Loader, ArrowRight, Save, Eye } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { organizations, objectives, plans, initiatives, performanceMeasures, mainActivities, auth } from '../lib/api';
import { format } from 'date-fns';
import type { Organization, StrategicObjective, StrategicInitiative, PerformanceMeasure } from '../types/organization';
import type { MainActivity, PlanType } from '../types/plan';
import { isPlanner } from '../types/user';

// Import components
import PlanTypeSelector from '../components/PlanTypeSelector';
import ObjectiveSelectionMode from '../components/ObjectiveSelectionMode';
import HorizontalObjectiveSelector from '../components/HorizontalObjectiveSelector';
import StrategicObjectivesList from '../components/StrategicObjectivesList';
import InitiativeList from '../components/InitiativeList';
import InitiativeForm from '../components/InitiativeForm';
import PerformanceMeasureList from '../components/PerformanceMeasureList';
import PerformanceMeasureForm from '../components/PerformanceMeasureForm';
import MainActivityList from '../components/MainActivityList';
import MainActivityForm from '../components/MainActivityForm';
import ActivityBudgetForm from '../components/ActivityBudgetForm';
import PlanPreviewModal from '../components/PlanPreviewModal';
import PlanSubmitForm from '../components/PlanSubmitForm';

const Planning: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Main planning state
  const [currentStep, setCurrentStep] = useState<'select-type' | 'select-mode' | 'select-objectives' | 'planning'>('select-type');
  const [planType, setPlanType] = useState<PlanType>('LEO/EO Plan');
  const [objectiveSelectionMode, setObjectiveSelectionMode] = useState<'default' | 'custom'>('default');
  const [selectedObjectives, setSelectedObjectives] = useState<StrategicObjective[]>([]);
  const [selectedObjective, setSelectedObjective] = useState<StrategicObjective | null>(null);
  
  // User and organization data
  const [userOrganizations, setUserOrganizations] = useState<any[]>([]);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [plannerName, setPlannerName] = useState('');
  const [executiveName, setExecutiveName] = useState('');
  const [isUserPlanner, setIsUserPlanner] = useState(false);
  const [userOrgId, setUserOrgId] = useState<number | null>(null);
  
  // Planning dates
  const [fromDate, setFromDate] = useState(() => {
    const now = new Date();
    const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}-07-01`;
  });
  const [toDate, setToDate] = useState(() => {
    const now = new Date();
    const year = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
    return `${year}-06-30`;
  });

  // Modal and form states
  const [showInitiativeForm, setShowInitiativeForm] = useState(false);
  const [showMeasureForm, setShowMeasureForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  
  // Current editing states
  const [editingInitiative, setEditingInitiative] = useState<StrategicInitiative | null>(null);
  const [editingMeasure, setEditingMeasure] = useState<PerformanceMeasure | null>(null);
  const [editingActivity, setEditingActivity] = useState<MainActivity | null>(null);
  const [selectedInitiative, setSelectedInitiative] = useState<StrategicInitiative | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<MainActivity | null>(null);
  
  // Error and success states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);

  // Data and refresh state
  const [planData, setPlanData] = useState<{ objectives: StrategicObjective[] }>({ objectives: [] });
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch current user and organization data
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        setIsUserPlanner(isPlanner(authData.userOrganizations));
        setUserOrganizations(authData.userOrganizations || []);
        
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          const primaryOrg = authData.userOrganizations[0];
          setOrganizationId(primaryOrg.organization);
          setUserOrgId(primaryOrg.organization);
          setPlannerName(`${authData.user.first_name || ''} ${authData.user.last_name || ''}`.trim() || authData.user.username);
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        setError('Failed to load user information. Please refresh the page.');
      }
    };
    
    fetchUserData();
  }, [navigate]);

  // Fetch organization data
  const { data: organizationsData } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => organizations.getAll(),
    enabled: !!organizationId
  });

  // Set organization name when data is available
  useEffect(() => {
    if (organizationsData && organizationId) {
      const org = Array.isArray(organizationsData) 
        ? organizationsData.find(o => o.id === organizationId)
        : organizationsData.data?.find(o => o.id === organizationId);
      
      if (org) {
        setOrganizationName(org.name);
      }
    }
  }, [organizationsData, organizationId]);

  // Check user permissions
  if (!isUserPlanner) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-yellow-50 rounded-lg border border-yellow-200">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Access Restricted</h3>
          <p className="text-yellow-600">{t('planning.permissions.plannerRequired')}</p>
        </div>
      </div>
    );
  }

  // Step handlers
  const handleSelectPlanType = (type: PlanType) => {
    setPlanType(type);
    if (type === 'LEO/EO Plan') {
      setCurrentStep('select-mode');
    } else {
      setError('This plan type is not yet implemented');
    }
  };

  const handleSelectMode = (mode: 'default' | 'custom') => {
    setObjectiveSelectionMode(mode);
    setCurrentStep('select-objectives');
  };

  const handleObjectivesSelected = (objectivesWithWeights: StrategicObjective[]) => {
    console.log('Objectives selected with weights:', objectivesWithWeights.map(obj => ({
      id: obj.id,
      title: obj.title,
      weight: obj.weight,
      planner_weight: obj.planner_weight,
      effective_weight: obj.effective_weight
    })));
    
    setSelectedObjectives(objectivesWithWeights);
    
    // Store the objectives with their selected weights in plan data
    setPlanData({ objectives: objectivesWithWeights });
  };

  const handleProceedToPlanning = () => {
    if (selectedObjectives.length === 0) {
      setError('Please select at least one objective');
      return;
    }
    
    // Set the first objective as selected for editing
    setSelectedObjective(selectedObjectives[0]);
    setCurrentStep('planning');
    setError(null);
  };

  // Initiative handlers
  const handleEditInitiative = (initiative: StrategicInitiative) => {
    setEditingInitiative(initiative);
    setShowInitiativeForm(true);
  };

  const handleInitiativeSubmit = async (data: any) => {
    try {
      setError(null);
      
      if (editingInitiative?.id) {
        await initiatives.update(editingInitiative.id, data);
        setSuccess('Initiative updated successfully');
      } else {
        await initiatives.create(data);
        setSuccess('Initiative created successfully');
      }
      
      setShowInitiativeForm(false);
      setEditingInitiative(null);
      setRefreshKey(prev => prev + 1);
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (error: any) {
      setError(error.message || 'Failed to save initiative');
    }
  };

  // Performance measure handlers
  const handleEditMeasure = (measure: PerformanceMeasure) => {
    setEditingMeasure(measure);
    setShowMeasureForm(true);
  };

  const handleMeasureSubmit = async (data: any) => {
    try {
      setError(null);
      
      if (editingMeasure?.id) {
        await performanceMeasures.update(editingMeasure.id, data);
        setSuccess('Performance measure updated successfully');
      } else {
        await performanceMeasures.create(data);
        setSuccess('Performance measure created successfully');
      }
      
      setShowMeasureForm(false);
      setEditingMeasure(null);
      setRefreshKey(prev => prev + 1);
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (error: any) {
      setError(error.message || 'Failed to save performance measure');
    }
  };

  // Main activity handlers
  const handleEditActivity = (activity: MainActivity) => {
    setEditingActivity(activity);
    setShowActivityForm(true);
  };

  const handleActivitySubmit = async (data: any) => {
    try {
      setError(null);
      
      if (editingActivity?.id) {
        await mainActivities.update(editingActivity.id, data);
        setSuccess('Main activity updated successfully');
      } else {
        await mainActivities.create(data);
        setSuccess('Main activity created successfully');
      }
      
      setShowActivityForm(false);
      setEditingActivity(null);
      setRefreshKey(prev => prev + 1);
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (error: any) {
      setError(error.message || 'Failed to save main activity');
    }
  };

  // Budget handlers
  const handleEditBudget = (activity: MainActivity) => {
    setSelectedActivity(activity);
    setShowBudgetForm(true);
  };

  const handleBudgetSubmit = async (budgetData: any) => {
    try {
      setError(null);
      
      if (selectedActivity?.id) {
        await mainActivities.updateBudget(selectedActivity.id, budgetData);
        setSuccess('Budget updated successfully');
        setShowBudgetForm(false);
        setSelectedActivity(null);
        setRefreshKey(prev => prev + 1);
        
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (error: any) {
      setError(error.message || 'Failed to save budget');
    }
  };

  // Plan submission
  const handleSubmitPlan = async () => {
    try {
      setIsSubmittingPlan(true);
      setSubmitError(null);

      // Validate plan has data
      if (!planData.objectives || planData.objectives.length === 0) {
        setSubmitError('Plan must have at least one objective');
        return;
      }

      // Prepare selected objectives weights for storage
      const selectedObjectivesWeights: Record<string, number> = {};
      planData.objectives.forEach(obj => {
        if (obj && obj.id) {
          // Use effective_weight if available, otherwise calculate from initiatives
          const effectiveWeight = obj.effective_weight !== undefined 
            ? obj.effective_weight 
            : obj.initiatives?.reduce((sum, init) => sum + (Number(init.weight) || 0), 0) || 0;
          selectedObjectivesWeights[obj.id.toString()] = effectiveWeight;
        }
      });

      // Create the plan with complete objectives data
      const planPayload = {
        organization: organizationId,
        planner_name: plannerName,
        type: planType,
        executive_name: executiveName,
        strategic_objective: planData.objectives[0]?.id, // Primary objective for backward compatibility
        fiscal_year: new Date().getFullYear().toString(),
        from_date: fromDate,
        to_date: toDate,
        selected_objectives_weights: selectedObjectivesWeights,
        // Add selected objectives IDs to the many-to-many field
        selected_objectives: planData.objectives.map(obj => obj.id)
      };

      console.log('Submitting plan with payload:', planPayload);
      console.log('Plan objectives count:', planData.objectives.length);
      console.log('Selected objectives weights:', selectedObjectivesWeights);

      const createdPlan = await plans.create(planPayload);
      console.log('Plan created successfully:', createdPlan);

      // Submit the plan for evaluation
      await plans.submitToEvaluator(createdPlan.id);
      console.log('Plan submitted for evaluation');

      setSubmitSuccess('Plan submitted successfully for evaluation!');
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (error: any) {
      console.error('Failed to submit plan:', error);
      setSubmitError(error.message || 'Failed to submit plan');
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  // Clear messages after timeout
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  return (
    <div className="px-4 py-6 sm:px-0">
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

      {submitError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
          <AlertCircle className="h-5 w-5 mr-2" />
          {submitError}
        </div>
      )}

      {submitSuccess && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center text-green-700">
          <CheckCircle className="h-5 w-5 mr-2" />
          {submitSuccess}
        </div>
      )}

      {/* Step 1: Plan Type Selection */}
      {currentStep === 'select-type' && (
        <PlanTypeSelector onSelectPlanType={handleSelectPlanType} />
      )}

      {/* Step 2: Objective Selection Mode */}
      {currentStep === 'select-mode' && (
        <ObjectiveSelectionMode onSelectMode={handleSelectMode} />
      )}

      {/* Step 3: Objective Selection */}
      {currentStep === 'select-objectives' && objectiveSelectionMode === 'custom' && (
        <div className="space-y-6">
          <HorizontalObjectiveSelector 
            onObjectivesSelected={handleObjectivesSelected}
            onProceed={handleProceedToPlanning}
            initialObjectives={selectedObjectives}
          />
        </div>
      )}

      {currentStep === 'select-objectives' && objectiveSelectionMode === 'default' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Select Strategic Objective</h2>
            <StrategicObjectivesList 
              onSelectObjective={(objective) => {
                setSelectedObjectives([objective]);
                handleObjectivesSelected([objective]);
              }}
              selectedObjectiveId={selectedObjectives[0]?.id}
            />
            {selectedObjectives.length > 0 && (
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleProceedToPlanning}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
                >
                  Proceed to Planning
                  <ArrowRight className="ml-2 h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Planning Interface */}
      {currentStep === 'planning' && (
        <div className="space-y-6">
          {/* Planning Header */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-gray-500" />
                    {t('planning.organization')}
                  </div>
                </label>
                <div className="mt-1 block w-full px-3 py-2 text-base border border-gray-300 rounded-md bg-gray-50">
                  {organizationName}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500" />
                    {t('planning.plannerName')}
                  </div>
                </label>
                <div className="mt-1 block w-full px-3 py-2 text-base border border-gray-300 rounded-md bg-gray-50">
                  {plannerName}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <div className="flex items-center gap-2">
                    <FileType className="h-4 w-4 text-gray-500" />
                    {t('planning.type')}
                  </div>
                </label>
                <select
                  value={planType}
                  onChange={(e) => setPlanType(e.target.value as PlanType)}
                  className="mt-1 block w-full px-3 py-2 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="LEO/EO Plan">LEO/EO Plan</option>
                  <option value="Desk/Team Plan">Desk/Team Plan</option>
                  <option value="Individual Plan">Individual Plan</option>
                </select>
              </div>

              <div>
                <label htmlFor="from-date" className="block text-sm font-medium text-gray-700 mb-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    {t('planning.fromDate')}
                  </div>
                </label>
                <input
                  type="date"
                  id="from-date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="to-date" className="block text-sm font-medium text-gray-700 mb-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    {t('planning.toDate')}
                  </div>
                </label>
                <input
                  type="date"
                  id="to-date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  min={fromDate}
                  className="mt-1 block w-full px-3 py-2 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Objective Tabs */}
          {selectedObjectives.length > 1 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="border-b border-gray-200">
                <nav className="flex -mb-px">
                  {selectedObjectives.map((objective, index) => (
                    <button
                      key={objective.id}
                      onClick={() => setSelectedObjective(objective)}
                      className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
                        selectedObjective?.id === objective.id
                          ? 'border-green-600 text-green-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center">
                        <Target className="h-5 w-5 mr-2" />
                        {objective.title}
                        <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                          {objective.effective_weight || objective.weight}%
                        </span>
                      </div>
                    </button>
                  ))}
                </nav>
              </div>
            </div>
          )}

          {/* Main Planning Content */}
          {selectedObjective && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                      <Target className="h-6 w-6 mr-2 text-blue-600" />
                      {selectedObjective.title}
                    </h2>
                    <p className="text-gray-600 mt-1">{selectedObjective.description}</p>
                    <div className="flex items-center mt-2">
                      <span className="text-sm text-gray-500">Weight:</span>
                      <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                        {selectedObjective.effective_weight || selectedObjective.weight}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Initiatives Section */}
                <div className="space-y-6">
                  <InitiativeList
                    parentId={selectedObjective.id.toString()}
                    parentType="objective"
                    parentWeight={selectedObjective.effective_weight || selectedObjective.weight}
                    onEditInitiative={handleEditInitiative}
                    onSelectInitiative={setSelectedInitiative}
                    isNewPlan={true}
                    planKey={`${selectedObjective.id}-${refreshKey}`}
                    isUserPlanner={isUserPlanner}
                    userOrgId={userOrgId}
                  />
                </div>
              </div>

              {/* Performance Measures and Activities */}
              {selectedInitiative && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Performance Measures */}
                  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Measures</h3>
                    <PerformanceMeasureList
                      initiativeId={selectedInitiative.id}
                      initiativeWeight={Number(selectedInitiative.weight)}
                      onEditMeasure={handleEditMeasure}
                      onSelectMeasure={() => {}}
                      isNewPlan={true}
                      planKey={`${selectedInitiative.id}-${refreshKey}`}
                    />
                  </div>

                  {/* Main Activities */}
                  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Main Activities</h3>
                    <MainActivityList
                      initiativeId={selectedInitiative.id}
                      initiativeWeight={Number(selectedInitiative.weight)}
                      onEditActivity={handleEditActivity}
                      onEditBudget={handleEditBudget}
                      onSelectActivity={setSelectedActivity}
                      isNewPlan={true}
                      planKey={`${selectedInitiative.id}-${refreshKey}`}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between items-center">
            <button
              onClick={() => setCurrentStep('select-objectives')}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Back to Objectives
            </button>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowPreviewModal(true)}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 flex items-center"
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview Plan
              </button>

              <button
                onClick={() => setShowSubmitModal(true)}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
              >
                <Save className="h-4 w-4 mr-2" />
                Submit Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Initiative Form Modal */}
      {showInitiativeForm && selectedObjective && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingInitiative?.id ? 'Edit Initiative' : 'Create Initiative'}
            </h3>
            <InitiativeForm
              parentId={selectedObjective.id.toString()}
              parentType="objective"
              parentWeight={selectedObjective.effective_weight || selectedObjective.weight}
              currentTotal={0}
              onSubmit={handleInitiativeSubmit}
              onCancel={() => {
                setShowInitiativeForm(false);
                setEditingInitiative(null);
              }}
              initialData={editingInitiative}
            />
          </div>
        </div>
      )}

      {/* Performance Measure Form Modal */}
      {showMeasureForm && selectedInitiative && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingMeasure?.id ? 'Edit Performance Measure' : 'Create Performance Measure'}
            </h3>
            <PerformanceMeasureForm
              initiativeId={selectedInitiative.id}
              currentTotal={0}
              onSubmit={handleMeasureSubmit}
              onCancel={() => {
                setShowMeasureForm(false);
                setEditingMeasure(null);
              }}
              initialData={editingMeasure}
            />
          </div>
        </div>
      )}

      {/* Main Activity Form Modal */}
      {showActivityForm && selectedInitiative && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingActivity?.id ? 'Edit Main Activity' : 'Create Main Activity'}
            </h3>
            <MainActivityForm
              initiativeId={selectedInitiative.id}
              currentTotal={0}
              onSubmit={handleActivitySubmit}
              onCancel={() => {
                setShowActivityForm(false);
                setEditingActivity(null);
              }}
              initialData={editingActivity}
            />
          </div>
        </div>
      )}

      {/* Budget Form Modal */}
      {showBudgetForm && selectedActivity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Activity Budget</h3>
            <ActivityBudgetForm
              activity={selectedActivity}
              budgetCalculationType="WITHOUT_TOOL"
              activityType="Other"
              onSubmit={handleBudgetSubmit}
              onCancel={() => {
                setShowBudgetForm(false);
                setSelectedActivity(null);
              }}
              initialData={selectedActivity.budget}
              isSubmitting={false}
            />
          </div>
        </div>
      )}

      {/* Plan Preview Modal */}
      {showPreviewModal && (
        <PlanPreviewModal
          isOpen={showPreviewModal}
          onClose={() => setShowPreviewModal(false)}
          objectives={planData.objectives}
          organizationName={organizationName}
          plannerName={plannerName}
          fromDate={fromDate}
          toDate={toDate}
          planType={planType}
          refreshKey={refreshKey}
        />
      )}

      {/* Plan Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Submit Plan</h3>
            <PlanSubmitForm
              plan={{
                id: '',
                organization: organizationId?.toString() || '',
                planner_name: plannerName,
                type: planType,
                executive_name: executiveName,
                strategic_objective: selectedObjectives[0]?.id?.toString() || '',
                fiscal_year: new Date().getFullYear().toString(),
                from_date: fromDate,
                to_date: toDate,
                status: 'DRAFT',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }}
              onSubmit={handleSubmitPlan}
              onCancel={() => setShowSubmitModal(false)}
              isSubmitting={isSubmittingPlan}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Planning;