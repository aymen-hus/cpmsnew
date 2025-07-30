import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mainActivities } from '../lib/api';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { BarChart3, AlertCircle, CheckCircle, Edit, Trash2, Lock, DollarSign, Calculator, FileText, Eye, Info, ArrowLeft, Send, X } from 'lucide-react';
import type { MainActivity, ActivityType, BudgetCalculationType } from '../types/plan';
import { auth } from '../lib/api';
import { isPlanner } from '../types/user';
import ActivityBudgetForm from './ActivityBudgetForm';
import TrainingCostingTool from './TrainingCostingTool';
import MeetingWorkshopCostingTool from './MeetingWorkshopCostingTool';
import PrintingCostingTool from './PrintingCostingTool';
import ProcurementCostingTool from './ProcurementCostingTool';
import SupervisionCostingTool from './SupervisionCostingTool';

interface MainActivityListProps {
  initiativeId: string;
  initiative_weight: number;
  onEditActivity: (activity: MainActivity) => void;
  onDeleteActivity: (activityId: string) => void;
}

const MainActivityList: React.FC<MainActivityListProps> = ({ 
  initiativeId, 
  initiative_weight,
  onEditActivity,
  onDeleteActivity
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [isUserPlanner, setIsUserPlanner] = React.useState(false);
  const [userOrgId, setUserOrgId] = React.useState<number | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<MainActivity | null>(null);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [showBudgetTypeModal, setShowBudgetTypeModal] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType | null>(null);
  const [budgetCalculationType, setBudgetCalculationType] = useState<BudgetCalculationType>('WITHOUT_TOOL');
  const [showTrainingTool, setShowTrainingTool] = useState(false);
  const [showMeetingWorkshopTool, setShowMeetingWorkshopTool] = useState(false);
  const [showPrintingTool, setShowPrintingTool] = useState(false);
  const [showProcurementTool, setShowProcurementTool] = useState(false);
  const [showSupervisionTool, setShowSupervisionTool] = useState(false);
  const [toolCalculatedCosts, setToolCalculatedCosts] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showBudgetPreview, setShowBudgetPreview] = useState(false);
  // Fetch current user role and organization
  React.useEffect(() => {
    const fetchUserData = async () => {
      try {
        const authData = await auth.getCurrentUser();
        setIsUserPlanner(isPlanner(authData.userOrganizations));
        
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          setUserOrgId(authData.userOrganizations[0].organization);
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
      }
    };
    
    fetchUserData();
  }, []);

  // Fetch weight summary based on parent type
  const { data: weightSummary, refetch: refetchSummary } = useQuery({
    queryKey: ['main-activities', 'weight-summary', initiativeId],
    queryFn: () => mainActivities.getWeightSummary(initiativeId),
  });

  // Fetch activities based on parent type
  const { data: activitiesList, isLoading } = useQuery({
    queryKey: ['main-activities', initiativeId],
    queryFn: () => mainActivities.getByInitiative(initiativeId),
    staleTime: 0, // Don't cache data
    cacheTime: 0, // Don't store data in cache at all
  });
  console.log('Initiative Weight:', initiative_weight);
  console.log('Weight Summary:', weightSummary?.data);

const validateActivitiesMutation = useMutation({
    mutationFn: () => mainActivities.validateActivitiesWeight(initiativeId),
    
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['main-activities', 'weight-summary', initiativeId] });
      refetchSummary();
    }
  });

  const updateBudgetMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!selectedActivity) throw new Error('No activity selected');
      
      console.log("Calling updateBudget API with data:", data);
      
      try {
        // First, ensure the CSRF token is fresh
        await auth.getCurrentUser();
        
        // Make the API call
        const response = await mainActivities.updateBudget(selectedActivity.id, data);
        return response;
      } catch (error) {
        console.error("Budget update API call failed:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Budget updated successfully:", data);
      queryClient.invalidateQueries({ queryKey: ['main-activities', initiativeId] });
      handleCancelCosting();
      setError(null);
    },
    onError: (error: any) => {
      console.error('Budget update error:', error);
      setError(error.message || 'Failed to update budget');
      setIsProcessing(false);
    }
  });

  const handleActivitySelect = (activity: MainActivity) => {
    // If the activity already has a budget, use its calculation type
    const hasExistingBudget = !!activity.budget;
    const existingBudgetType = activity.budget?.budget_calculation_type;
    const existingActivityType = activity.budget?.activity_type;
    
    setSelectedActivity(activity);
    setActivityType(existingActivityType);
    setBudgetCalculationType(existingBudgetType || 'WITHOUT_TOOL');
    setShowTrainingTool(false);
    setShowMeetingWorkshopTool(false);
    setShowPrintingTool(false);
    setShowProcurementTool(false);
    setShowSupervisionTool(false);
    setToolCalculatedCosts(null);
    setError(null);
    setShowBudgetPreview(false);
    setIsProcessing(false); // Reset processing state
    
    // If activity already has a budget, go straight to the budget form
    if (hasExistingBudget) {
      setShowBudgetForm(true);
      setShowBudgetTypeModal(false);
    } else {
      // For new budgets, show the budget type modal first
      setShowBudgetForm(false);
      setShowBudgetTypeModal(true);
    }
  };

  const handleBudgetTypeSelect = (type: BudgetCalculationType) => {
    setBudgetCalculationType(type);
    setShowBudgetTypeModal(false);
    setError(null);
    
    if (type === 'WITH_TOOL') {
      // Show activity type selection
      setActivityType(null);
    } else {
      // Skip to budget form with manual cost entry
      if (selectedActivity) {
        setShowBudgetForm(true);
      }
    }
  };

  const handleActivityTypeSelect = (type: ActivityType) => {
    setActivityType(type);
    setShowBudgetForm(false);
    setToolCalculatedCosts(null);
    setError(null);
    setIsProcessing(false);

    // Reset all tool visibility
    setShowTrainingTool(false);
    setShowMeetingWorkshopTool(false);
    setShowPrintingTool(false);
    setShowProcurementTool(false);
    setShowSupervisionTool(false);

    // If we already have a budget with this activity type and WITH_TOOL calculation type,
    // go directly to budget form
    if (selectedActivity?.budget?.activity_type === type && 
        selectedActivity.budget.budget_calculation_type === 'WITH_TOOL') {
      setShowBudgetForm(true);
      return;
    }

    // Show selected tool
    switch (type) {
      case 'Training':
        setShowTrainingTool(true);
        break;
      case 'Meeting':
      case 'Workshop':
        setShowMeetingWorkshopTool(true);
        break;
      case 'Printing':
        setShowPrintingTool(true);
        break;
      case 'Procurement':
        setShowProcurementTool(true);
        break;
      case 'Supervision':
        setShowSupervisionTool(true);
        break;
      case 'Other':
        // For 'Other', go directly to budget form with manual entry
        setBudgetCalculationType('WITHOUT_TOOL');
        setShowBudgetForm(true);
        break;
    }
  };

  const handleToolCalculation = async (costs: any) => {
    if (!selectedActivity || !activityType) {
      setError("Activity information is missing");
      setIsProcessing(false);
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      console.log('Original costs from tool:', costs);
      
      // Extract the budget amount from all possible locations
      const budgetSources = [
        costs.estimated_cost_with_tool,
        Number(costs.estimated_cost_with_tool),
        costs.totalBudget,
        Number(costs.totalBudget),
        costs.estimated_cost,
        Number(costs.estimated_cost),
        costs.training_details?.totalBudget,
        Number(costs.training_details?.totalBudget),
        costs.meeting_workshop_details?.totalBudget,
        costs.printing_details?.totalBudget,
        costs.procurement_details?.totalBudget,
        costs.supervision_details?.totalBudget
      ];

      // Find the first valid budget amount
      const validBudgetValues = budgetSources.filter(value => 
        typeof value === 'number' && !isNaN(value) && value > 0
      );
      
      const calculatedBudget = validBudgetValues[0] || 0;
      
      console.log('All budget sources:', budgetSources);
      console.log('Valid budget values:', validBudgetValues);
      console.log('Selected calculated budget:', calculatedBudget);

      if (!calculatedBudget || calculatedBudget <= 0) {
        setError("The calculated budget amount must be greater than 0. Please check your inputs.");
        setIsProcessing(false);
        return;
      }

      // Store the calculated costs with validated budget
      // Create a new object to ensure we don't modify the original costs
      const enrichedCosts: any = {
        ...costs,
        totalBudget: calculatedBudget,
        estimated_cost_with_tool: calculatedBudget,
        estimated_cost: calculatedBudget
      };
      setToolCalculatedCosts(enrichedCosts);
      console.log('Enriched costs:', enrichedCosts);

      // Create initial budget data object but don't save it yet
      // We'll use this data when the user finalizes in the budget form
      const budgetData = {
        activity_id: selectedActivity.id,
        activity: selectedActivity.id,
        budget_calculation_type: 'WITH_TOOL' as BudgetCalculationType,
        activity_type: activityType,
        estimated_cost_with_tool: calculatedBudget,
        partners_list: costs.partners_list || [],
        totalBudget: calculatedBudget,     // Add for redundancy
        estimated_cost: calculatedBudget,   // Add for redundancy
        estimated_cost_without_tool: 0,
        government_treasury: 0,
        sdg_funding: 0,
        partners_funding: 0,
        other_funding: 0,
        organization: userOrgId
      };

      // Add type-specific details based on activity type
      switch (activityType) {
        case 'Training':
          budgetData.training_details = costs;
          break;
        case 'Meeting':
        case 'Workshop':
          budgetData.meeting_workshop_details = costs;
          break;
        case 'Procurement':
          budgetData.procurement_details = costs;
          break;
        case 'Printing':
          budgetData.printing_details = costs;
          break;
        case 'Supervision':
          budgetData.supervision_details = costs;
          break;
      }
      
      console.log("Budget data prepared:", budgetData);
      
      // Update selected activity with temporary budget for the form
      const tempActivity = {
        ...selectedActivity,
        budget: {
          ...budgetData,
          // These fields are needed for the display in the form
          estimated_cost: calculatedBudget,        // Important field
          estimated_cost_with_tool: calculatedBudget, // Important field
          totalBudget: calculatedBudget,           // Another way to access the value
          total_funding: 0,                        // Set to 0 initially
          funding_gap: calculatedBudget,           // Initially equals the budget
          id: selectedActivity.budget?.id,         // Preserve existing budget ID if it exists
          budget_calculation_type: 'WITH_TOOL'     // Ensure this is set
        }
      };
      setSelectedActivity(tempActivity);

      // Hide all costing tools
      setShowTrainingTool(false);
      setShowMeetingWorkshopTool(false);
      setShowProcurementTool(false);
      setShowPrintingTool(false);
      setShowSupervisionTool(false);
      
      // Show budget form with WITH_TOOL calculation type
      setBudgetCalculationType('WITH_TOOL');
      setShowBudgetForm(true);
      console.log("Showing budget form with calculation type WITH_TOOL and estimated cost:", calculatedBudget);
      setIsProcessing(false);
    } catch (error: any) {
      console.error('Failed to save initial budget:', error);
      setError(error.message || 'Failed to save budget data. Please try again.');
      setIsProcessing(false);

      // Reset tools visibility on error
      setShowTrainingTool(false);
      setShowMeetingWorkshopTool(false);
      setShowProcurementTool(false);
      setShowPrintingTool(false);
      setShowSupervisionTool(false);
    }
  };

  const handleCancelCosting = () => {
    setSelectedActivity(null);
    setShowBudgetTypeModal(false);
    setShowBudgetForm(false);
    setActivityType(null);
    setBudgetCalculationType('WITHOUT_TOOL');
    setShowTrainingTool(false);
    setShowMeetingWorkshopTool(false);
    setShowPrintingTool(false);
    setShowProcurementTool(false);
    setShowSupervisionTool(false);
    setToolCalculatedCosts(null);
    setError(null);
    setIsProcessing(false);
    setShowBudgetPreview(false);
  };

  const handlePreviewBudget = (activity: MainActivity) => {
    setSelectedActivity(activity);
    setShowBudgetPreview(true);
  };

  // Helper function to display target values based on target type
  const formatTargetDisplay = (activity: MainActivity) => {
    if (!activity) return null;
    
    const targetType = activity.target_type || 'cumulative';
    const sixMonthTarget = targetType === 'cumulative' 
      ? Number(activity.q1_target) + Number(activity.q2_target) 
      : Number(activity.q2_target);
      
    const nineMonthTarget = targetType === 'cumulative'
      ? Number(activity.q1_target) + Number(activity.q2_target) + Number(activity.q3_target)
      : Number(activity.q3_target);
      
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 mt-2 text-xs">
        <div>
          <span className="text-gray-500">Baseline:</span> 
          <span className="ml-1">{activity.baseline || 'N/A'}</span>
        </div>
        <div>
          <span className="text-gray-500">Annual Target:</span> 
          <span className="ml-1 font-medium">{activity.annual_target}</span>
        </div>
        <div>
          <span className="text-gray-500">Target Type:</span> 
          <span className="ml-1 capitalize">{activity.target_type}</span>
        </div>
        <div>
          <span className="text-gray-500">6-Month:</span> 
          <span className="ml-1">{sixMonthTarget}</span>
        </div>
        <div>
          <span className="text-gray-500">9-Month:</span> 
          <span className="ml-1">{nineMonthTarget}</span>
        </div>
        <div>
          <span className="text-gray-500">Q4 (Final):</span> 
          <span className="ml-1">{activity.q4_target}</span>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return <div className="text-center p-4">{t('common.loading')}</div>;
  }

  if (!activitiesList?.data) {
    return null;
  }

  // Filter activities to only show those belonging to the user's organization or default ones
  const filteredActivities = activitiesList.data.filter(activity =>
    !activity.organization || // Include activities with no organization
    activity.organization === userOrgId // Include activities for user's organization
  );

   // Ensure initiative weight is a number and not undefined
   const initiativeWeightValue = typeof initiative_weight === 'number' ? initiative_weight : 0;
    // Extract data from weight summary
    const apiInitiativeWeight = weightSummary?.data?.initiative_weight;
      const apiExpectedWeight = weightSummary?.data?.expected_activities_weight;
      const apiTotalWeight = weightSummary?.data?.total_activities_weight;
      const apiRemainingWeight = weightSummary?.data?.remaining_weight;
     const apiIsValid = weightSummary?.data?.is_valid;
  
   // Use values from API if available, otherwise calculate locally
  const displayInitiativeWeight = apiInitiativeWeight !== undefined ? Number(apiInitiativeWeight) : initiativeWeightValue;
  const expectedActivitiesWeight = apiExpectedWeight !== undefined ? Number(apiExpectedWeight) : (displayInitiativeWeight * 0.65);
  const totalActivitiesWeight = apiTotalWeight !== undefined ? Number(apiTotalWeight) : 0;
  const remainingWeight = apiRemainingWeight !== undefined ? Number(apiRemainingWeight) : (expectedActivitiesWeight - totalActivitiesWeight);
  const isValid = apiIsValid !== undefined ? apiIsValid : Math.abs(totalActivitiesWeight - expectedActivitiesWeight) < 0.01;
  console.log('Weight Data:', {
        initiativeWeight: initiative_weight,
        apiInitiativeWeight,
        displayInitiativeWeight,
        expectedActivitiesWeight,
        totalActivitiesWeight,
        remainingWeight,
        isValid
      });
  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {t('planning.weightDistribution')}
          </h3>
          <BarChart3 className="h-5 w-5 text-gray-400" />
        </div>
        
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-sm text-gray-500">Initiative Weight</p>
            <p className="text-2xl font-semibold text-gray-900">{displayInitiativeWeight.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('planning.allocatedWeight')}</p>
            <p className="text-2xl font-semibold text-blue-600">{totalActivitiesWeight.toFixed(2)}</p>
          </div>
          
        <div>
        <p className="text-sm text-gray-500">Remaining Weight</p>
            <p className={`text-2xl font-semibold ${isValid ? 'text-green-600' : 'text-amber-600'}`}>
              {remainingWeight.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-700">
            <strong>Note:</strong> The total weight of main activities must equal 65% of the initiative weight.
            Expected weight: {displayInitiativeWeight.toFixed(2)} × 65% = {expectedActivitiesWeight.toFixed(2)}
          </p>
        </div>

        {remainingWeight < 0 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            Expected weight: {displayInitiativeWeight.toFixed(2)} × 65% = {expectedActivitiesWeight.toFixed(2)}
          </div>
        )}

         {remainingWeight > 0 && !isValid && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md flex items-center gap-2 text-amber-700">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">
            Total weight should be exactly {expectedActivitiesWeight.toFixed(2)} (65% of initiative weight).
            Current total: {totalActivitiesWeight.toFixed(2)}, Remaining: {remainingWeight.toFixed(2)}
          </p>
        </div>
        )}

        {isValid && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-green-700">
            <CheckCircle className="h-5 w-5" />
            <p className="text-sm">
              Weight distribution is balanced at {expectedActivitiesWeight.toFixed(2)}
            </p>
          </div>
        )}

        {isUserPlanner && (
           <div className="mt-4">
           <button
             onClick={() => validateActivitiesMutation.mutate()}
             disabled={validateActivitiesMutation.isPending}
             className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
           >
             {validateActivitiesMutation.isPending ? 'Validating...' : 'Validate Activities Weight'}
           </button>
            
           {validateActivitiesMutation.isError && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                {(validateActivitiesMutation.error as any)?.response?.data?.message || 
                  'Failed to validate activities weight'}
              </div>
            )}
            
            {validateActivitiesMutation.isSuccess && (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
                {validateActivitiesMutation.data?.data?.message || 'Activities weight validated successfully'}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {filteredActivities.map((activity) => (
          <div
            key={activity.id}
            className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-gray-900">{activity.name}</h4>
              <span className="text-sm font-medium text-blue-600">
                {activity.weight}%
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-sm">
              <div>
                <span className="text-gray-500">Period:</span> 
                <span className="ml-2">
                  {activity.selected_quarters?.length > 0
                    ? activity.selected_quarters.join(', ')
                    : activity.selected_months?.length > 0
                      ? activity.selected_months.join(', ')
                      : 'None selected'}
                </span>
              </div>
              
              {activity.budget && (
                <div>
                  <span className="text-gray-500">Budget:</span>
                  <span className="ml-2 font-medium">
                    ${activity.budget.budget_calculation_type === 'WITH_TOOL' 
                        ? activity.budget.estimated_cost_with_tool 
                        : activity.budget.estimated_cost_without_tool}
                  </span>
                </div>
              )}
              
              {activity.budget?.activity_type && (
                <div>
                  <span className="text-gray-500">Activity Type:</span>
                  <span className="ml-2 font-medium">{activity.budget.activity_type}</span>
                </div>
              )}
            </div>

            {/* Show targets based on target type */}
            {formatTargetDisplay(activity)}
            
            {isUserPlanner && (
              <div className="flex justify-end space-x-2 mt-3">
                <button
                  onClick={() => onEditActivity(activity)}
                  className="p-1 text-blue-600 hover:text-blue-800"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                      className="p-1 text-red-600 hover:text-red-800"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent bubbling up to parent elements
                        if (window.confirm('Are you sure you want to delete this activity? This action cannot be undone.')) {
                          onDeleteActivity(activity.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                {!activity.budget && (
                  <button
                    onClick={() => handleActivitySelect(activity)}
                    className="flex items-center px-3 py-1 text-sm text-green-600 hover:text-green-800"
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    Add Budget
                  </button>
                )}
                {activity.budget && (
                  <>
                    <button
                      onClick={() => handleActivitySelect(activity)}
                      className="flex items-center px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit Budget
                    </button>
                    <button
                      onClick={() => handlePreviewBudget(activity)}
                      className="flex items-center px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Preview Budget
                    </button>
                  </>
                )}
              </div>
            )}
            
            {!isUserPlanner && (
              <div className="flex justify-end mt-3">
                <div className="text-xs text-gray-500 flex items-center">
                  <Lock className="h-3 w-3 mr-1" />
                  {t('planning.permissions.readOnly')}
                </div>
              </div>
            )}
          </div>
        ))}

        {filteredActivities.length === 0 && (
          <div className="text-center p-4 text-gray-500">
            No main activities yet
          </div>
        )}
      </div>

      {/* Budget Calculation Type Selection Modal */}
      {selectedActivity && showBudgetTypeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4 text-center">
              Choose Budget Calculation Method
            </h3>
            
            <div className="grid grid-cols-1 gap-4 mb-6">
              <button
                onClick={() => handleBudgetTypeSelect('WITH_TOOL')}
                className="p-6 border-2 rounded-lg hover:border-blue-500 hover:bg-blue-50 flex flex-col items-center gap-3 transition-colors"
              >
                <Calculator className="h-12 w-12 text-blue-600" />
                <div className="text-center">
                  <h4 className="font-medium text-lg">Use Costing Tool</h4>
                  <p className="text-sm text-gray-600">Calculate budget using specialized costing tools based on activity type</p>
                </div>
              </button>
              
              <button
                onClick={() => handleBudgetTypeSelect('WITHOUT_TOOL')}
                className="p-6 border-2 rounded-lg hover:border-blue-500 hover:bg-blue-50 flex flex-col items-center gap-3 transition-colors"
              >
                <FileText className="h-12 w-12 text-green-600" />
                <div className="text-center">
                  <h4 className="font-medium text-lg">Manual Budget Entry</h4>
                  <p className="text-sm text-gray-600">Enter budget details manually without using costing tools</p>
                </div>
              </button>
            </div>
            
            <button
              onClick={handleCancelCosting}
              className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Activity Type Selection Modal */}
      {selectedActivity && budgetCalculationType === 'WITH_TOOL' && !activityType && !showBudgetForm && !showBudgetTypeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Select Activity Type
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleActivityTypeSelect('Training')}
                className="p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-50"
              >
                Training
              </button>
              <button
                onClick={() => handleActivityTypeSelect('Meeting')}
                className="p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-50"
              >
                Meeting
              </button>
              <button
                onClick={() => handleActivityTypeSelect('Workshop')}
                className="p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-50"
              >
                Workshop
              </button>
              <button
                onClick={() => handleActivityTypeSelect('Printing')}
                className="p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-50"
              >
                Printing
              </button>
              <button
                onClick={() => handleActivityTypeSelect('Supervision')}
                className="p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-50"
              >
                Supervision
              </button>
              <button
                onClick={() => handleActivityTypeSelect('Procurement')}
                className="p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-50"
              >
                Procurement
              </button>
              <button
                onClick={() => handleActivityTypeSelect('Other')}
                className="p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-50 col-span-2"
              >
                Other
              </button>
            </div>
            <button
              onClick={handleCancelCosting}
              className="mt-4 w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Costing Tools */}
      {selectedActivity && activityType && !showBudgetForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 overflow-y-auto z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full my-8">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            
            {showTrainingTool && (
              <TrainingCostingTool
                onCalculate={handleToolCalculation}
                onCancel={handleCancelCosting}
                initialData={selectedActivity.budget?.training_details}
              />
            )}
            
            {showMeetingWorkshopTool && (
              <MeetingWorkshopCostingTool
                activityType={activityType as 'Meeting' | 'Workshop'}
                onCalculate={handleToolCalculation}
                onCancel={handleCancelCosting}
                initialData={selectedActivity.budget?.meeting_workshop_details}
              />
            )}
            
            {showPrintingTool && (
              <PrintingCostingTool
                onCalculate={handleToolCalculation}
                onCancel={handleCancelCosting}
                initialData={selectedActivity.budget?.printing_details}
              />
            )}
            
            {showProcurementTool && (
              <ProcurementCostingTool
                onCalculate={handleToolCalculation}
                onCancel={handleCancelCosting}
                initialData={selectedActivity.budget?.procurement_details}
              />
            )}
            
            {showSupervisionTool && (
              <SupervisionCostingTool
                onCalculate={handleToolCalculation}
                onCancel={handleCancelCosting}
                initialData={selectedActivity.budget?.supervision_details}
              />
            )}
          </div>
        </div>
      )}

      {/* Budget Form */}
      {selectedActivity && showBudgetForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 overflow-y-auto z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full my-8">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            
            <ActivityBudgetForm
              activity={selectedActivity}
              budgetCalculationType={budgetCalculationType}
              activityType={activityType}
              onSubmit={async (data) => {
                try {
                  // Format data correctly for API
                  const budgetData = {
                    activity: selectedActivity.id,  // Use 'activity' instead of 'activity_id'
                    budget_calculation_type: data.budget_calculation_type,
                    activity_type: data.activity_type,
                    estimated_cost_with_tool: Number(data.estimated_cost_with_tool || 0),
                    estimated_cost_without_tool: Number(data.estimated_cost_without_tool || 0),
                    government_treasury: Number(data.government_treasury || 0),
                    sdg_funding: Number(data.sdg_funding || 0),
                    partners_funding: Number(data.partners_funding || 0),
                    other_funding: Number(data.other_funding || 0),
                    organization: userOrgId, // Use 'organization' instead of 'organization_id'
                    // Preserve specific details
                    training_details: data.training_details,
                    meeting_workshop_details: data.meeting_workshop_details,
                    procurement_details: data.procurement_details,
                    printing_details: data.printing_details,
                    supervision_details: data.supervision_details
                  };
                  
                  console.log("Submitting budget data:", budgetData);
                  
                  await updateBudgetMutation.mutateAsync(budgetData);
                  return Promise.resolve();
                } catch (error) {
                  console.error('Failed to update budget:', error);
                  throw error;
                }
              }}
              initialData={selectedActivity.budget}
              onCancel={handleCancelCosting}
              isSubmitting={updateBudgetMutation.isPending}
            />
          </div>
        </div>
      )}

      {/* Budget Preview Modal */}
      {selectedActivity && showBudgetPreview && selectedActivity.budget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Budget Details</h2>
              <button
                onClick={() => setShowBudgetPreview(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <span className="sr-only">Close</span>
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
              <div className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-4">Activity Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Activity Name</p>
                      <p className="font-medium">{selectedActivity.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Activity Type</p>
                      <p className="font-medium">{selectedActivity.budget.activity_type || 'Not specified'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Baseline</p>
                      <p className="font-medium">{selectedActivity.baseline || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Target Type</p>
                      <p className="font-medium capitalize">{selectedActivity.target_type || 'cumulative'}</p>
                    </div>
                  </div>
                  
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <p className="text-xs text-gray-500">Q1 Target</p>
                      <p className="font-medium">{selectedActivity.q1_target}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Q2 Target</p>
                      <p className="font-medium">{selectedActivity.q2_target}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Q3 Target</p>
                      <p className="font-medium">{selectedActivity.q3_target}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Q4 Target</p>
                      <p className="font-medium">{selectedActivity.q4_target}</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <p className="text-sm text-gray-500">Annual Target</p>
                    <p className="font-medium">{selectedActivity.annual_target}</p>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-4">Budget Summary</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Calculation Method</p>
                      <p className="font-medium">
                        {selectedActivity.budget.budget_calculation_type === 'WITH_TOOL' ? 'Using Costing Tool' : 'Manual Entry'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Total Budget Required</p>
                      <p className="font-medium text-green-600">
                        ${(selectedActivity.budget.budget_calculation_type === 'WITH_TOOL' 
                            ? Number(selectedActivity.budget.estimated_cost_with_tool)
                            : Number(selectedActivity.budget.estimated_cost_without_tool)).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-4">Funding Sources</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Government Treasury</span>
                      <span className="font-medium">${selectedActivity.budget.government_treasury.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">SDG Funding</span>
                      <span className="font-medium">${selectedActivity.budget.sdg_funding.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Partners Funding</span>
                      <span className="font-medium">${selectedActivity.budget.partners_funding.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Other Funding</span>
                      <span className="font-medium">${selectedActivity.budget.other_funding.toLocaleString()}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Total Available Funding</span>
                        <span className="font-medium text-blue-600">
                          ${(
                            Number(selectedActivity.budget.government_treasury) +
                            Number(selectedActivity.budget.sdg_funding) +
                            Number(selectedActivity.budget.partners_funding) +
                            Number(selectedActivity.budget.other_funding)
                          ).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-4">Funding Gap Analysis</h4>
                  <div className="space-y-3">
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Total Required</span>
                      <span className="font-medium">
                        ${(selectedActivity.budget.budget_calculation_type === 'WITH_TOOL' 
                          ? Number(selectedActivity.budget.estimated_cost_with_tool || 0) 
                          : Number(selectedActivity.budget.estimated_cost_without_tool || 0)).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Total Available</span>
                      <span className="font-medium">
                        ${(
                          Number(selectedActivity.budget.government_treasury || 0) +
                          Number(selectedActivity.budget.sdg_funding || 0) +
                          Number(selectedActivity.budget.partners_funding || 0) +
                          Number(selectedActivity.budget.other_funding || 0)
                        ).toLocaleString()}
                      </span>
                    </div>
                    <div className="border-t border-gray-200 pt-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Funding Gap</span>
                        <span className={`font-medium ${Number(selectedActivity.budget.funding_gap) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ${Math.abs(Number(selectedActivity.budget.funding_gap)).toLocaleString()}
                          {Number(selectedActivity.budget.funding_gap) > 0 ? ' (Deficit)' : ' (Fully Funded)'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Activity-specific details based on type */}
                {selectedActivity.budget.activity_type && selectedActivity.budget.budget_calculation_type === 'WITH_TOOL' && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-4">Activity Details</h4>
                    {selectedActivity.budget.training_details && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-gray-500">Number of Days</p>
                            <p className="font-medium">{selectedActivity.budget.training_details.numberOfDays}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Number of Participants</p>
                            <p className="font-medium">{selectedActivity.budget.training_details.numberOfParticipants}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Location</p>
                            <p className="font-medium">{selectedActivity.budget.training_details.trainingLocation}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Add similar sections for other activity types */}
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowBudgetPreview(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainActivityList;
