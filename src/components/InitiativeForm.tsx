import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { Loader, ArrowLeft, AlertCircle, Info } from 'lucide-react';
import { initiatives, initiativeFeeds } from '../lib/api';

interface InitiativeFormProps {
  parentId: string;
  parentType: 'objective' | 'program';
  parentWeight: number;
  currentTotal: number;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  initialData?: any;
}

const InitiativeForm: React.FC<InitiativeFormProps> = ({
  parentId,
  parentType,
  parentWeight,
  currentTotal,
  onSubmit,
  onCancel,
  initialData
}) => {
  const { t } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFeedId, setSelectedFeedId] = useState<string>('');
  const [initiativeMode, setInitiativeMode] = useState<'custom' | 'predefined'>('custom');
  const [isLoadingFeeds, setIsLoadingFeeds] = useState(false);
  const [availableFeeds, setAvailableFeeds] = useState<any[]>([]);
  const [existingInitiatives, setExistingInitiatives] = useState<any[]>([]);
  const [useInitiativeFeed, setUseInitiativeFeed] = useState<boolean>(
    initialData?.initiative_feed ? true : false
  );

  const { register, handleSubmit, watch, setValue, reset, control, formState: { errors } } = useForm<any>({
    defaultValues: {
      name: initialData?.name || '',
      weight: initialData?.weight || '',
      initiative_feed: initialData?.initiative_feed || ''
    }
  });

  // Watch form fields
  const watchedName = watch('name') || '';
  const selectedInitiativeFeed = watch('initiative_feed');
  const watchedWeight = watch('weight');

  // WORKING AUTO-FILL LOGIC FROM PREVIOUS CODE
  // When a feed is selected, update the name field
  useEffect(() => {
    if (useInitiativeFeed && selectedInitiativeFeed && availableFeeds.length > 0) {
      const selectedFeed = availableFeeds.find((feed: any) => 
        feed.id.toString() === selectedInitiativeFeed.toString());
      
      if (selectedFeed) {
        console.log('Auto-filling name with:', selectedFeed.name);
        setValue('name', selectedFeed.name);
      }
    }
  }, [selectedInitiativeFeed, availableFeeds, useInitiativeFeed, setValue]);

  // Fetch existing initiatives for weight calculation
  const { data: initiativesData } = useQuery({
    queryKey: ['initiatives', parentId, parentType],
    queryFn: async () => {
      if (!parentId) return { data: [] };
      
      if (parentType === 'objective') {
        return await initiatives.getByObjective(parentId);
      } else if (parentType === 'program') {
        return await initiatives.getByProgram(parentId);
      }
      return { data: [] };
    },
    enabled: !!parentId
  });

  // Update existing initiatives when data changes
  useEffect(() => {
    if (initiativesData?.data) {
      setExistingInitiatives(initiativesData.data);
    }
  }, [initiativesData]);

  // Calculate weight constraints
  const calculateWeights = () => {
    // Filter out the current initiative if editing
    const otherInitiatives = existingInitiatives.filter(init => 
      !initialData || init.id !== initialData.id
    );
    
    // Calculate total weight of other initiatives
    const otherInitiativesWeight = otherInitiatives.reduce((sum, init) => 
      sum + (Number(init.weight) || 0), 0
    );
    
    const remainingWeight = parentWeight - otherInitiativesWeight;
    const maxWeight = Math.max(0, remainingWeight);
    
    return {
      otherInitiativesWeight,
      remainingWeight,
      maxWeight,
      totalWithCurrent: otherInitiativesWeight + (Number(watchedWeight) || 0)
    };
  };

  const weights = calculateWeights();

  // Load initiative feeds based on parent type
  useEffect(() => {
    const loadFeeds = async () => {
      try {
        setIsLoadingFeeds(true);
        setError(null);
        
        let response;
        if (parentType === 'objective') {
          response = await initiativeFeeds.getByObjective(parentId);
        } else {
          response = await initiativeFeeds.getAll();
        }
        
        setAvailableFeeds(response?.data || []);
      } catch (error) {
        console.error('Error loading initiative feeds:', error);
        setError('Failed to load predefined initiatives');
        setAvailableFeeds([]);
      } finally {
        setIsLoadingFeeds(false);
      }
    };
    
    if (initiativeMode === 'predefined' && parentId) {
      loadFeeds();
    } else {
      setAvailableFeeds([]);
    }
  }, [initiativeMode, parentId, parentType]);

  // Auto-fill name when predefined initiative is selected
  useEffect(() => {
    if (initiativeMode === 'predefined' && selectedInitiativeFeed && availableFeeds.length > 0) {
      const selectedFeed = availableFeeds.find(feed => feed.id === selectedInitiativeFeed);
      if (selectedFeed) {
        console.log('Auto-filling name with:', selectedFeed.name);
        setValue('name', selectedFeed.name);
        setSelectedFeedId(selectedInitiativeFeed);
      }
    }
  }, [selectedInitiativeFeed, availableFeeds, initiativeMode, setValue]);

  const handleFormSubmit = async (data: any) => {
    try {
      setIsSubmitting(true);
      setError(null);
      
      // Prepare submission data
      const submissionData = {
        ...data,
        weight: Number(data.weight),
        [parentType === 'objective' ? 'strategic_objective_id' : 'program_id']: parentId
      };

      await onSubmit(submissionData);
    } catch (error: any) {
      console.error('Error submitting initiative:', error);
      setError(error.message || 'Failed to save initiative');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Initialize form with existing data
  useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name || '',
        weight: initialData.weight || '',
        initiative_feed: initialData.initiative_feed || ''
      });
      
      if (initialData.initiative_feed) {
        setInitiativeMode('predefined');
        setSelectedFeedId(initialData.initiative_feed);
      }
    }
  }, [initialData, reset]);

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Weight Summary */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-blue-600">Parent Weight</p>
            <p className="font-semibold text-blue-800">{parentWeight.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-blue-600">Other Initiatives</p>
            <p className="font-semibold text-blue-800">{weights.otherInitiativesWeight.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-blue-600">Available</p>
            <p className={`font-semibold ${weights.remainingWeight > 0 ? 'text-green-600' : weights.remainingWeight < 0 ? 'text-red-600' : 'text-blue-800'}`}>
              {weights.remainingWeight.toFixed(2)}%
            </p>
          </div>
        </div>
        
        {parentType === 'objective' && (
          <p className="mt-2 text-xs text-blue-600">
            <strong>Important:</strong> For objectives, total initiative weights must equal exactly {parentWeight}%
          </p>
        )}
        
        {weights.remainingWeight < 0 && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
            <AlertCircle className="h-4 w-4 inline mr-1" />
            Total weight exceeds parent weight by {Math.abs(weights.remainingWeight).toFixed(2)}%
          </div>
        )}
        
        {watchedWeight && (
          <div className="mt-2 text-xs text-blue-600">
            <strong>Current calculation:</strong> Other initiatives ({weights.otherInitiativesWeight.toFixed(2)}%) + This initiative ({Number(watchedWeight).toFixed(2)}%) = {weights.totalWithCurrent.toFixed(2)}%
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Initiative Mode Toggle */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div>
          <button 
            type="button" 
            onClick={() => {
              setUseInitiativeFeed(!useInitiativeFeed);
              setInitiativeMode(useInitiativeFeed ? 'custom' : 'predefined');
              if (useInitiativeFeed) {
                setValue('name', '');
                setValue('initiative_feed', null);
              }
            }}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {useInitiativeFeed 
              ? "Enter initiative name manually" 
              : "Select from predefined initiatives"}
          </button>
        </div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Initiative Type</h4>
        <div className="flex space-x-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="initiativeMode"
              value="custom"
              checked={!useInitiativeFeed}
              onChange={() => {
                setUseInitiativeFeed(false);
                setInitiativeMode('custom');
                setValue('initiative_feed', null);
              }}
              className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700">Custom Initiative</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="initiativeMode"
              value="predefined"
              checked={useInitiativeFeed}
              onChange={() => {
                setUseInitiativeFeed(true);
                setInitiativeMode('predefined');
                setValue('name', '');
              }}
              className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700">Predefined Initiative</span>
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {initiativeMode === 'custom' 
            ? 'Create your own custom initiative with a unique name'
            : 'Select from predefined initiatives for this objective'
          }
        </p>
      </div>

      {/* Predefined Initiative Selection - Only show when predefined mode */}
      {useInitiativeFeed && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select Predefined Initiative for this {parentType === 'objective' ? 'Objective' : 'Program'}
          </label>
          {isLoadingFeeds ? (
            <div className="flex items-center p-3 bg-gray-50 border border-gray-200 rounded-md">
              <Loader className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-gray-500">Loading predefined initiatives...</span>
            </div>
          ) : (
            <div>
              <select
                {...register('initiative_feed', { 
                  required: useInitiativeFeed ? 'Please select an initiative' : false 
                })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                disabled={isLoadingFeeds}
              >
                <option value="">Select a predefined initiative...</option>
                {availableFeeds.map(feed => (
                  <option key={feed.id} value={feed.id}>
                    {feed.name}
                    {feed.strategic_objective_title && ` (${feed.strategic_objective_title})`}
                  </option>
                ))}
              </select>
            </div>
          )}
          {errors.initiative_feed && (
            <p className="mt-1 text-sm text-red-600">{errors.initiative_feed.message}</p>
          )}
          {useInitiativeFeed && !selectedInitiativeFeed && (
            <p className="mt-1 text-xs text-amber-600">
              Please select a predefined initiative from the dropdown above.
            </p>
          )}
        </div>
      )}

      {/* Initiative Name - Show differently for predefined vs custom */}
      {useInitiativeFeed ? (
        /* Show selected name as read-only when initiative feed is selected */
        selectedInitiativeFeed && watchedName && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Initiative Name (from selected initiative)
            </label>
            <div className="mt-1 p-3 bg-gray-100 rounded-md border border-gray-300 text-gray-700">
              {watchedName}
            </div>
            <input type="hidden" {...register('name')} />
            <p className="mt-1 text-xs text-green-600">
              ✓ Name filled from predefined initiative
            </p>
          </div>
        )
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Initiative Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            {...register('name', { 
              required: useInitiativeFeed ? false : 'Initiative name is required',
              minLength: { value: 3, message: 'Name must be at least 3 characters' }
            })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Enter your custom initiative name"
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
          )}
        </div>
      )}

      {/* Weight Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Weight (%) <span className="text-red-500">*</span>
          <span className="text-blue-600 ml-2">(Maximum: {weights.maxWeight.toFixed(2)}%)</span>
        </label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          max={weights.maxWeight}
          {...register('weight', {
            required: 'Weight is required',
            min: { value: 0.01, message: 'Weight must be greater than 0' },
            max: { value: weights.maxWeight, message: `Weight cannot exceed ${weights.maxWeight.toFixed(2)}%` },
            valueAsNumber: true
          })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Enter weight percentage"
        />
        {errors.weight && (
          <p className="mt-1 text-sm text-red-600">{errors.weight.message}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          Weight represents the importance of this initiative within the {parentType}
        </p>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !weights.maxWeight || weights.maxWeight <= 0}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isSubmitting ? (
            <span className="flex items-center">
              <Loader className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </span>
          ) : (
            initialData ? 'Update Initiative' : 'Create Initiative'
          )}
        </button>
      </div>
    </form>
  );
};

export default InitiativeForm;
