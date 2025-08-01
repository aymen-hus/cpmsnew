import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { Loader, ArrowLeft, DollarSign, AlertCircle, Info, Plus, Trash2, Users } from 'lucide-react';
import type { MainActivity, ActivityType, BudgetCalculationType } from '../types/plan';

interface ActivityBudgetFormProps {
  activity: MainActivity;
  budgetCalculationType?: BudgetCalculationType;
  activityType?: ActivityType | null;
  onSubmit: (data: any) => Promise<void>;
  initialData?: any;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const ActivityBudgetForm: React.FC<ActivityBudgetFormProps> = ({
  activity,
  budgetCalculationType = 'WITHOUT_TOOL',
  activityType,
  onSubmit,
  initialData,
  onCancel,
  isSubmitting = false
}) => {
  const { t } = useLanguage();
  const [partners, setPartners] = useState<{name: string, amount: number}[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isBudgetSubmitting, setIsBudgetSubmitting] = useState(false);
  const [initialRender, setInitialRender] = useState(true);
  
  console.log("ActivityBudgetForm initialData:", initialData, 
    initialData?.estimated_cost_with_tool || 0,
    initialData?.estimated_cost_without_tool || 0);
  console.log("Budget calculation type:", budgetCalculationType, "Activity type:", activityType);
  
  // Calculate the effective estimated cost (for debugging)
  const effectiveEstimatedCost = budgetCalculationType === 'WITH_TOOL' 
    ? (initialData?.estimated_cost_with_tool || 0) 
    : (initialData?.estimated_cost_without_tool || 0);
  
  console.log("Effective estimated cost at component start:", effectiveEstimatedCost);
  
  // Extract all potential budget values for debugging
  useEffect(() => {
    if (initialData) {
      console.log("Budget data analysis:", {
        estimated_cost_with_tool: initialData.estimated_cost_with_tool,
        estimated_cost_without_tool: initialData.estimated_cost_without_tool,
        estimated_cost: initialData.estimated_cost,
        totalBudget: initialData.totalBudget,
        training_details_totalBudget: initialData.training_details?.totalBudget,
      });
    }
  }, [initialData]);
  
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<any>({
    defaultValues: {
      activity: activity.id,
      budget_calculation_type: budgetCalculationType,
      activity_type: activityType,
      estimated_cost_with_tool: initialData?.estimated_cost_with_tool || initialData?.totalBudget || 0,
      estimated_cost_without_tool: initialData?.estimated_cost_without_tool || 0,
      government_treasury: initialData?.government_treasury || 0,
      sdg_funding: initialData?.sdg_funding || 0,
      partners_funding: initialData?.partners_funding || 0,
      other_funding: initialData?.other_funding || 0,
      training_details: initialData?.training_details,
      meeting_workshop_details: initialData?.meeting_workshop_details,
      procurement_details: initialData?.procurement_details,
      printing_details: initialData?.printing_details,
      supervision_details: initialData?.supervision_details
    }
  });

  // Watch values for calculations
  const governmentTreasury = Number(watch('government_treasury')) || 0;
  const sdgFunding = Number(watch('sdg_funding')) || 0;
  const partnersFunding = Number(watch('partners_funding')) || 0;
  const otherFunding = Number(watch('other_funding')) || 0;
  const withToolCost = Number(watch('estimated_cost_with_tool')) || 0;
  const withoutToolCost = Number(watch('estimated_cost_without_tool')) || 0;

  // Make sure the correct estimated cost is set on initial render
  useEffect(() => {
    if (initialRender) {
      if (budgetCalculationType === 'WITH_TOOL' && withToolCost === 0 && initialData?.estimated_cost_with_tool) {
        console.log('Setting initial WITH_TOOL cost (initialData.estimated_cost_with_tool):', initialData.estimated_cost_with_tool);
        setValue('estimated_cost_with_tool', Number(initialData.estimated_cost_with_tool));
      } else if (budgetCalculationType === 'WITH_TOOL' && withToolCost === 0 && initialData?.totalBudget) {
        console.log('Setting initial WITH_TOOL cost from totalBudget:', initialData.totalBudget);
        setValue('estimated_cost_with_tool', Number(initialData.totalBudget));
      } else if (budgetCalculationType === 'WITH_TOOL' && withToolCost === 0) {
        // Last resort: check if there's any budget value we can use
        const possibleBudgetValue = initialData?.estimated_cost || 
                                    initialData?.training_details?.totalBudget || 
                                    initialData?.meeting_workshop_details?.totalBudget ||
                                    initialData?.printing_details?.totalBudget ||
                                    initialData?.procurement_details?.totalBudget ||
                                    initialData?.supervision_details?.totalBudget;
        
        if (possibleBudgetValue && possibleBudgetValue > 0) {
          console.log('Setting initial WITH_TOOL cost from alternative source:', possibleBudgetValue);
          setValue('estimated_cost_with_tool', Number(possibleBudgetValue));
        }
      }
      
      if (budgetCalculationType === 'WITHOUT_TOOL' && withoutToolCost === 0 && initialData?.estimated_cost_without_tool) {
        console.log('Setting initial WITHOUT_TOOL cost (initialData.estimated_cost_without_tool):', initialData.estimated_cost_without_tool);
        setValue('estimated_cost_without_tool', Number(initialData.estimated_cost_without_tool));
      }
      
      setInitialRender(false);
       
       // Force re-calculation after initial render
       setTimeout(() => {
         const updatedWithToolCost = budgetCalculationType === 'WITH_TOOL' ? 
           Number(initialData?.estimated_cost_with_tool || 0) : 0;
         const updatedWithoutToolCost = budgetCalculationType === 'WITHOUT_TOOL' ? 
           Number(initialData?.estimated_cost_without_tool || 0) : 0;
         const updatedEstimatedCost = budgetCalculationType === 'WITH_TOOL' ? 
           updatedWithToolCost : updatedWithoutToolCost;
         console.log('Updated estimated cost after initial render:', updatedEstimatedCost);
       }, 100);
    }
  }, [initialRender, budgetCalculationType, withToolCost, withoutToolCost, initialData, setValue]);

  // Initialize partners if they exist in the initial data
  useEffect(() => {
    if (initialData?.partners_list && Array.isArray(initialData.partners_list) && initialData.partners_list.length > 0) {
      setPartners(initialData.partners_list);
    } else if (initialData?.partners_funding && Number(initialData.partners_funding) > 0) {
      // If we have partners_funding but no partners_list, create a default entry
      setPartners([
        { name: 'Partners Funding', amount: Number(initialData.partners_funding) }
      ]);
    } else {
      // Set default partners if none exist
      setPartners([
        { name: 'WHO', amount: 0 },
        { name: 'UNICEF', amount: 0 },
        { name: 'USAID', amount: 0 }
      ]);
    }
  }, [initialData]);

  // Calculate totals
  // Make sure we have valid numeric values
  const totalFunding = Number(governmentTreasury || 0) + Number(sdgFunding || 0) + 
                        Number(partnersFunding || 0) + Number(otherFunding || 0);
  
  // Calculate estimated cost based on budget type, ensuring we get a positive number
  const estimatedCost = budgetCalculationType === 'WITH_TOOL' 
    ? Math.max(Number(withToolCost || 0), 
              Number(initialData?.estimated_cost_with_tool || 0), 
              Number(initialData?.totalBudget || 0),
              Number(initialData?.estimated_cost || 0))
    : Math.max(Number(withoutToolCost || 0), Number(initialData?.estimated_cost_without_tool || 0));
              
  const fundingGap = Math.max(0, estimatedCost - totalFunding);

  // Debug logging
  useEffect(() => {
    console.log("Budget Form Values:", {
      partners,
      initialData,
      budgetCalculationType,
      withToolCost,
      withoutToolCost,
      estimatedCost,
      totalFunding,
      fundingGap,
      activityType
    });
  }, [
    partners,
    initialData,
    budgetCalculationType, 
    withToolCost, 
    withoutToolCost,
    totalFunding,
    estimatedCost,
    fundingGap,
    activityType
  ]);

  const handleFormSubmit = async (data: any) => {
    try {
      setError(null);
      setIsBudgetSubmitting(true);

      // Make sure we have the correct estimated cost
      // For WITH_TOOL, ensure estimated_cost_with_tool is positive
      if (budgetCalculationType === 'WITH_TOOL') {
        // Use the estimatedCost we calculated above, which checks multiple sources
        if (estimatedCost <= 0) {
          setError('Estimated cost must be greater than 0. Please recalculate using the costing tool.');
          setIsBudgetSubmitting(false);
          return;
        }
        // Set the value in the data object
        data.estimated_cost_with_tool = estimatedCost;
      }

      // For WITHOUT_TOOL, ensure estimated_cost_without_tool is positive
      if (budgetCalculationType === 'WITHOUT_TOOL') {
        if (estimatedCost <= 0) {
          setError('Estimated cost must be greater than 0');
          setIsBudgetSubmitting(false);
          return;
        }
        // Set the value in the data object
        data.estimated_cost_without_tool = estimatedCost;
      }

      // Calculate total partners funding
      let totalPartnersFunding = 0;
      partners.forEach(partner => {
        totalPartnersFunding += Number(partner.amount) || 0;
      });

      // Update the partners funding field
      data.partners_funding = totalPartnersFunding;
      
      // Store the partners list in the budget data
      data.partners_list = partners;
      
      // Validate total funding against estimated cost
      const updatedTotalFunding = Number(data.government_treasury || 0) +
                                Number(data.sdg_funding || 0) +
                                totalPartnersFunding +
                                Number(data.other_funding || 0);
                                
      if (updatedTotalFunding > estimatedCost) {
        setError('Total funding cannot exceed estimated cost');
        setIsBudgetSubmitting(false);
        return;
      }

      // Ensure we include all necessary fields
      const budgetData = {
        activity_id: activity.id,
        activity: activity.id,  // Include both for compatibility
        budget_calculation_type: budgetCalculationType,
        activity_type: activityType || data.activity_type || 'Other',
        estimated_cost_with_tool: budgetCalculationType === 'WITH_TOOL' ? estimatedCost : 0,
        estimated_cost_without_tool: budgetCalculationType === 'WITHOUT_TOOL' ? estimatedCost : 0,
        estimated_cost: estimatedCost,  // Add this to ensure the value is available
        totalBudget: estimatedCost,     // Add this for redundancy
        government_treasury: Number(data.government_treasury),
        sdg_funding: Number(data.sdg_funding),
        partners_funding: Number(data.partners_funding),
        partners_list: partners.filter(p => p.name && p.amount > 0),  // Store only valid partners
        other_funding: Number(data.other_funding),
        
        // Make sure we preserve any existing tool-specific details
        training_details: data.training_details || initialData?.training_details,
        meeting_workshop_details: data.meeting_workshop_details || initialData?.meeting_workshop_details,
        procurement_details: data.procurement_details || initialData?.procurement_details,
        printing_details: data.printing_details || initialData?.printing_details,
        supervision_details: data.supervision_details || initialData?.supervision_details
      };

      console.log("Submitting budget data:", budgetData);
      console.log(`Final budget amount: ${estimatedCost} (${budgetCalculationType})`);

      // Submit budget data to parent component for saving
      await onSubmit(budgetData);
    } catch (error: any) {
      console.error('Error submitting budget form:', error);
      setError(error.message || 'Failed to save budget');
      setIsBudgetSubmitting(false);
    }
  };

  console.log('ActivityBudgetForm render with:', {
    budgetCalculationType,
    withToolCost,
    withoutToolCost,
    estimatedCost,
    initialData: initialData ? 
      `ID: ${initialData.id}, WITH_TOOL: ${initialData.estimated_cost_with_tool}, WITHOUT_TOOL: ${initialData.estimated_cost_without_tool}` : 
      'None'
  });
  
  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 max-h-[75vh] overflow-y-auto p-2 pb-20">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center text-gray-600 hover:text-gray-900"
          disabled={isSubmitting || isBudgetSubmitting}
        >
          <ArrowLeft className="h-5 w-5 mr-1" />
          Back
        </button>
        <div className="text-sm text-gray-500">
          Activity: {activity.name}
        </div>
      </div>

      {/* Store budget calculation type */}
      <input
        type="hidden"
        {...register('budget_calculation_type')}
        value={budgetCalculationType}
      />

      {/* Activity Type Display */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h3 className="text-sm font-medium text-blue-700 mb-4">Activity Information</h3>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-blue-600">
            Activity Type
          </span>
          <span className="text-lg font-semibold text-blue-800">
            {activityType || 'Not specified'}
          </span>
        </div>
        {/* Store activity type as hidden input */}
        <input
          type="hidden"
          {...register('activity_type')}
          value={activityType || ''}
        />
      </div>

      {/* Estimated Cost Section */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Estimated Cost</h3>
        
        {budgetCalculationType === 'WITH_TOOL' ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">
                {activityType ? `Calculated using ${activityType} costing tool` : 'Calculated using costing tool'}
              </span>
              <span className="text-2xl font-bold text-green-600" data-testid="budget-amount">
                ${Number(withToolCost).toLocaleString()}
              </span>
            </div>
            <input
              type="hidden"
              {...register('estimated_cost_with_tool')}
              value={withToolCost}
              defaultValue={initialData?.estimated_cost_with_tool || 0}
            />
            {/* Add debug info for troubleshooting */}
            <div className="text-xs text-gray-400">
              Initial value: {initialData?.estimated_cost_with_tool || 0}
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Manual Cost Estimation
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                type="number"
                step="0.01"
                {...register('estimated_cost_without_tool', {
                  required: 'This field is required',
                  min: { value: 0, message: 'Value must be positive' },
                  valueAsNumber: true
                })}
                className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md"
                placeholder="0.00"
              />
            </div>
            {errors.estimated_cost_without_tool && (
              <p className="mt-1 text-sm text-red-600">{errors.estimated_cost_without_tool.message}</p>
            )}
          </div>
        )}
      </div>

      {/* Funding Sources Section */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Funding Sources</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Government Treasury
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                type="number"
                step="0.01"
                {...register('government_treasury', {
                  required: 'This field is required',
                  min: { value: 0, message: 'Value must be positive' },
                  valueAsNumber: true
                })}
                className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              SDG Funding
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                type="number"
                step="0.01"
                {...register('sdg_funding', {
                  required: 'This field is required',
                  min: { value: 0, message: 'Value must be positive' },
                  valueAsNumber: true
                })}
                className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md"
                placeholder="0.00"
              />
            </div>
          </div>

              <p className="mt-2 text-sm text-gray-500">
                <Info className="h-4 w-4 mr-1 inline align-text-bottom" />
                Indicate the amount of funding from each source
              </p>

              {/* Partners funding section */}
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700 flex items-center">
                    <Users className="h-4 w-4 mr-1 text-blue-500" />
                    Partners Funding (Channels 2 & 3)
                  </label>
                  <button
                    type="button"
                    onClick={() => setPartners([...partners, { name: '', amount: 0 }])}
                    className="px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50 flex items-center"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Partner
                  </button>
                </div>
                
                {/* Default Partners or Added Partners */}
                <div className="mt-2 space-y-3">
                  {partners.map((partner, index) => (
                    <div key={index} className="flex space-x-2 items-center">
                      <input
                        type="text"
                        value={partner.name}
                        onChange={(e) => {
                          const updatedPartners = [...partners];
                          updatedPartners[index].name = e.target.value;
                          setPartners(updatedPartners);
                        }}
                        placeholder="Partner name"
                        className="block w-1/2 px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                      <div className="relative rounded-md shadow-sm w-1/3">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="text-gray-500 sm:text-sm">$</span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          value={partner.amount}
                          onChange={(e) => {
                            const updatedPartners = [...partners];
                            updatedPartners[index].amount = Number(e.target.value);
                            setPartners(updatedPartners);
                          }}
                          className="block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const updatedPartners = [...partners];
                          updatedPartners.splice(index, 1);
                          setPartners(updatedPartners);
                        }}
                        className="p-2 text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                
                {/* Partners Total */}
                <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between text-sm">
                  <span className="font-medium text-gray-700">Total Partners Funding:</span>
                  <span className="font-medium text-blue-600">
                    ${partners.reduce((sum, partner) => sum + (Number(partner.amount) || 0), 0).toLocaleString()}
                  </span>
                </div>
                
                {/* Hidden field to store total partners funding */}
                <input
                  type="hidden"
                  {...register('partners_funding')}
                  value={partners.reduce((sum, partner) => sum + (Number(partner.amount) || 0), 0)}
                />
              </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Other Funding
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                type="number"
                step="0.01"
                {...register('other_funding', {
                  required: 'This field is required',
                  min: { value: 0, message: 'Value must be positive' },
                  valueAsNumber: true
                })}
                className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Budget Summary */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Budget Summary</h3>
        <p className="text-xs text-gray-500 mb-2">
          Required: ${estimatedCost.toLocaleString()} | 
          Available: ${totalFunding.toLocaleString()} | 
          Gap: ${fundingGap > 0 ? fundingGap.toLocaleString() : 0} 
          {fundingGap <= 0 && '(Fully Funded)'}
        </p>

        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-gray-700">Calculation Method:</h4>
          <span className="text-sm font-medium bg-blue-100 text-blue-800 px-2 py-1 rounded">
            {budgetCalculationType === 'WITH_TOOL' ? 'Using Costing Tool' : 'Manual Entry'}
          </span>
          {budgetCalculationType === 'WITH_TOOL' && (
            <span className="text-sm font-medium bg-green-100 text-green-800 px-2 py-1 rounded ml-2">
              Activity Type: {activityType || 'Not specified'}
            </span>
          )}
        </div>

        {/* Debug Information - for troubleshooting only */}
        <div className="mb-4 text-xs text-gray-400 bg-gray-100 p-2 rounded">
          <div>Internal Values (Debug):</div>
          <div>with_tool: {withToolCost}</div>
          <div>without_tool: {withoutToolCost}</div>
          <div>initial_with_tool: {initialData?.estimated_cost_with_tool || 'N/A'}</div> 
          <div>initial_totalBudget: {initialData?.totalBudget || initialData?.training_details?.totalBudget || 'N/A'}</div>
          <div>training_details_totalBudget: {initialData?.training_details?.totalBudget || 'N/A'}</div>
          <div>calculation_type: {budgetCalculationType}</div>
          <div>effective: {estimatedCost}</div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Estimated Cost:</span>
            <span className="font-medium">${estimatedCost.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Total Funding:</span>
            <span className="font-medium">${totalFunding.toLocaleString()}</span>
          </div>
          <div className="border-t border-gray-200 pt-2 mt-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Funding Gap:</span>
              <span className={`font-medium ${fundingGap > 0 ? 'text-red-600' : 'text-green-600'}`}>
                ${Math.abs(fundingGap).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {fundingGap > 0 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-sm text-red-700">
              Additional funding of ${fundingGap.toLocaleString()} is needed
            </p>
          </div>
        )}

        {fundingGap < 0 && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md flex items-center gap-2">
            <Info className="h-5 w-5 text-amber-500" />
            <p className="text-sm text-amber-700">
              Total funding exceeds estimated cost by ${Math.abs(fundingGap).toLocaleString()}
            </p>
          </div>
        )}

        {fundingGap === 0 && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
            <Info className="h-5 w-5 text-green-500" />
            <p className="text-sm text-green-700">
              Budget is fully funded
            </p>
          </div>
        )}

        {/* Detailed funding breakdown */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Funding Breakdown</h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Government Treasury:</span>
              <span className="font-medium">${Number(governmentTreasury).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">SDG Funding:</span>
              <span className="font-medium">${Number(sdgFunding).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Partners Funding ({partners.length}):</span>
              <span className="font-medium">${partners.reduce((sum, partner) => sum + (Number(partner.amount) || 0), 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Other Funding:</span>
              <span className="font-medium">${Number(otherFunding).toLocaleString()}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Total Available Funding:</span>
                <span className="font-medium text-blue-600">
                  ${(Number(governmentTreasury) + 
                    Number(sdgFunding) + 
                    partners.reduce((sum, partner) => sum + (Number(partner.amount) || 0), 0) + 
                    Number(otherFunding)).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting || isBudgetSubmitting}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || isBudgetSubmitting || totalFunding > estimatedCost}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isSubmitting || isBudgetSubmitting ? (
            <span className="flex items-center">
              <Loader className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </span>
          ) : (
            'Save Budget'
          )}
        </button>
      </div>
    </form>
  );
};

export default ActivityBudgetForm;
