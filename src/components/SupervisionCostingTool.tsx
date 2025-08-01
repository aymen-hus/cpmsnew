import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Calculator, DollarSign, Info, AlertCircle } from 'lucide-react';
import type { SupervisionCost, TrainingLocation } from '../types/costing';
import { locations, perDiems, accommodations, supervisorCosts, landTransports, airTransports } from '../lib/api';
import { Plus, Trash2 } from 'lucide-react';

// Fallback data if API fails
const FALLBACK_LOCATIONS = [
  { id: 'fallback-1', name: 'Addis Ababa', region: 'Addis Ababa', is_hardship_area: false },
  { id: 'fallback-2', name: 'Adama', region: 'Oromia', is_hardship_area: false }
];

interface TransportRoute {
  id: string;
  transportId?: string;
  origin: string;
  destination: string;
  price: number;
  participants: number;
  originName?: string;
  destinationName?: string;
}

interface SupervisionLocation {
  locationId: string;
  days: number;
  supervisors: number;
}

interface SupervisionCostingToolProps {
  onCalculate: (costs: SupervisionCost) => void;
  onCancel: () => void;
  initialData?: SupervisionCost;
}

const SUPERVISOR_COSTS = [
  { value: 'ALL', label: 'All Additional Costs' },
  { value: 'TRAINING_MATERIALS', label: 'Training Materials' },
  { value: 'EQUIPMENT', label: 'Equipment' },
  { value: 'COMMUNICATION', label: 'Communication' },
  { value: 'OTHER', label: 'Other' }
];

const SupervisionCostingTool: React.FC<SupervisionCostingToolProps> = ({ 
  onCalculate,
  onCancel, 
  initialData 
}) => {
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationsData, setLocationsData] = useState<any[]>([]);
  const [perDiemsData, setPerDiemsData] = useState<any[]>([]);
  const [accommodationsData, setAccommodationsData] = useState<any[]>([]);
  const [supervisorCostsData, setSupervisorCostsData] = useState<any[]>([]);
  const [landTransportsData, setLandTransportsData] = useState<any[]>([]);
  const [airTransportsData, setAirTransportsData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [landTransportRoutes, setLandTransportRoutes] = useState<TransportRoute[]>([]);
  const [airTransportRoutes, setAirTransportRoutes] = useState<TransportRoute[]>([]);
  const [additionalLocations, setAdditionalLocations] = useState<SupervisionLocation[]>([]);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
  
  const { register, watch, control, setValue, handleSubmit, formState: { errors }, trigger, getValues } = useForm<SupervisionCost>({
    defaultValues: initialData || {
      description: '',
      numberOfDays: 1,
      numberOfSupervisors: 1,
      numberOfSessions: 1,
      numberOfSupervisorsWithAdditionalCost: 0,
      additionalSupervisorCosts: [],
      transportRequired: false,
      landTransportSupervisors: 0,
      airTransportSupervisors: 0,
      otherCosts: 0
    }
  });

  const watchTransportRequired = watch('transportRequired');
  const watchLocation = watch('trainingLocation');
  const watchDays = watch('numberOfDays');
  const watchSupervisors = watch('numberOfSupervisors');
  const watchSessions = watch('numberOfSessions');
  const watchSupervisorCosts = watch('additionalSupervisorCosts');
  const watchLandTransport = watch('landTransportSupervisors');
  const watchAirTransport = watch('airTransportSupervisors');
  const watchOtherCosts = watch('otherCosts');

  // Get API base URL
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || '';
    setApiBaseUrl(apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl);
    console.log('API Base URL for supervision tool:', apiUrl);
  }, []);
  
  // Fetch all required data from the database
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      console.log('Fetching supervision costing data...');
      
      try {
        // Fetch all data using the API service functions
        const [
          locationsResult
        ] = await Promise.all([ 
          locations.getAll()
        ]);

        // Check if locations data is valid
        if (!locationsResult?.data || !Array.isArray(locationsResult.data)) {
          console.error('Invalid locations data received in SupervisionCostingTool:', 
            locationsResult?.data ? typeof locationsResult.data : 'no data');
          console.log('Using fallback location data');
          setLocationsData(FALLBACK_LOCATIONS);
          // Continue with fallback data instead of throwing error
        } else {
          // Process and set the data
          const locationsData = locationsResult?.data || [];
          console.log(`Successfully loaded ${locationsData.length} locations`);
          setLocationsData(locationsData);
        }
        
        console.log('Fetching other costing data...');
        
        // Fetch other data after locations are loaded successfully
        const [
          perDiemsResult,
          accommodationsResult,
          supervisorCostsResult,
          landTransportsResult,
          airTransportsResult
        ] = await Promise.all([
          perDiems.getAll().catch(e => {
            console.error('Error fetching perDiems:', e);
            return { data: [] };
          }),
          accommodations.getAll().catch(e => {
            console.error('Error fetching accommodations:', e);
            return { data: [] };
          }),
          supervisorCosts.getAll().catch(e => {
            console.error('Error fetching supervisorCosts:', e);
            return { data: [] };
          }),
          landTransports.getAll().catch(e => {
            console.error('Error fetching landTransports:', e);
            return { data: [] };
          }),
          airTransports.getAll().catch(e => {
            console.error('Error fetching airTransports:', e);
            return { data: [] };
          })
        ]);
        
        // Process and set the remaining data
        setPerDiemsData(perDiemsResult?.data || []);
        setAccommodationsData(accommodationsResult?.data || []);
        setSupervisorCostsData(supervisorCostsResult?.data || []);
        setLandTransportsData(landTransportsResult?.data || []);
        setAirTransportsData(airTransportsResult?.data || []);
        
        console.log('All costing data loaded successfully:', {
          locations: locationsData.length,
          perDiems: perDiemsResult?.data?.length || 0,
          accommodations: accommodationsResult?.data?.length || 0,
          supervisorCosts: supervisorCostsResult?.data?.length || 0,
          landTransports: landTransportsResult?.data?.length || 0,
          airTransports: airTransportsResult?.data?.length || 0
        });
        
        // Set default location if available
        if (locationsData.length > 0 && !initialData?.trainingLocation) {
          console.log('Setting default location:', locationsData[0].id);
          setValue('trainingLocation', locationsData[0].id);
        }
        
      } catch (error) {
        console.error('Error fetching supervision costing data:', error);
        // Create a more detailed error message
        let errorMessage = 'Failed to load location data from the database. ';
        
        if (error.message) {
          errorMessage += error.message;
        }
        
        if (error.response?.status) {
          errorMessage += ` (Status: ${error.response.status})`;
        }
        
        if (error.config?.url) {
          console.error(`Failed request URL: ${error.config.url}`);
        }
        
        if (error.response?.data) {
          console.error('Error response data:', error.response.data);
          errorMessage += ' Server responded with an error.';
        } else {
          if (error.request) {
            errorMessage += ' No response received from server.';
          }
        }
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [setValue, initialData]);

  // Add/remove/update functions for multiple locations
  const addSupervisionLocation = () => {
    if (!locationsData.length) return;
    
    const newLocation: SupervisionLocation = {
      locationId: locationsData[0]?.id || '',
      days: 1,
      supervisors: 1
    };
    
    setAdditionalLocations([...additionalLocations, newLocation]);
  };
  
  const removeSupervisionLocation = (index: number) => {
    const newLocations = [...additionalLocations];
    newLocations.splice(index, 1);
    setAdditionalLocations(newLocations);
  };
  
  const updateSupervisionLocation = (index: number, field: keyof SupervisionLocation, value: any) => {
    const newLocations = [...additionalLocations];
    newLocations[index] = {
      ...newLocations[index],
      [field]: value
    };
    setAdditionalLocations(newLocations);
  };

  // Transport route management functions
  const addLandTransportRoute = () => {
    // Use first available transport route from database with actual price
    const defaultTransport = landTransportsData.length > 0 ? landTransportsData[0] : null;
    
    setLandTransportRoutes([...landTransportRoutes, {
      id: Date.now().toString(),
      transportId: defaultTransport?.id || '',
      origin: defaultTransport?.origin_name || 'Addis Ababa',
      destination: defaultTransport?.destination_name || 'Destination',
      price: Number(defaultTransport?.price || 0),
      participants: 1
    }]);
  };

  const addAirTransportRoute = () => {
    // Use first available air transport route from database with actual price
    const defaultTransport = airTransportsData.length > 0 ? airTransportsData[0] : null;
    
    setAirTransportRoutes([...airTransportRoutes, {
      id: Date.now().toString(),
      transportId: defaultTransport?.id || '',
      origin: defaultTransport?.origin_name || 'Addis Ababa',
      destination: defaultTransport?.destination_name || 'Destination',
      price: Number(defaultTransport?.price || 0),
      participants: 1
    }]);
  };

  const removeLandTransportRoute = (id: string) => {
    setLandTransportRoutes(landTransportRoutes.filter(route => route.id !== id));
  };

  const removeAirTransportRoute = (id: string) => {
    setAirTransportRoutes(airTransportRoutes.filter(route => route.id !== id));
  };

  const updateLandTransportRoute = (id: string, field: string, value: any) => {
    setLandTransportRoutes(landTransportRoutes.map(route => {
      if (route.id === id) {
        // If changing transport selection, update price from database
        if (field === 'transportId') {
          const selectedTransport = landTransportsData.find(t => t.id === value);
          console.log('Selected land transport:', selectedTransport);
          console.log('All available land transports:', landTransportsData);
          if (selectedTransport) {
            // Extract price - try different possible field names
            const dbPrice = Number(selectedTransport.price) || 
                           Number(selectedTransport.single_trip_price) || 
                           Number(selectedTransport.round_trip_price) || 0;
            console.log('Database price for land transport:', dbPrice);
            console.log('Price field contents:', {
              price: selectedTransport.price,
              single_trip_price: selectedTransport.single_trip_price,
              round_trip_price: selectedTransport.round_trip_price
            });
            return {
              ...route,
              transportId: value,
              origin: selectedTransport.origin_name || selectedTransport.origin,
              destination: selectedTransport.destination_name || selectedTransport.destination,
              price: dbPrice
            };
          }
        }
        // For other field updates, don't override price if it came from database
        if (field === 'price') {
          return { ...route, [field]: Number(value) || 0 };
        }
        return { ...route, [field]: value };
      }
      return route;
    }));
  };

  const updateAirTransportRoute = (id: string, field: string, value: any) => {
    setAirTransportRoutes(airTransportRoutes.map(route => {
      if (route.id === id) {
        // If changing transport selection, update price from database
        if (field === 'transportId') {
          const selectedTransport = airTransportsData.find(t => t.id === value);
          console.log('Selected air transport:', selectedTransport);
          console.log('All available air transports:', airTransportsData);
          if (selectedTransport) {
            // Extract price - try different possible field names
            const dbPrice = Number(selectedTransport.price) || 
                           Number(selectedTransport.single_trip_price) || 
                           Number(selectedTransport.round_trip_price) || 0;
            console.log('Database price for air transport:', dbPrice);
            console.log('Price field contents:', {
              price: selectedTransport.price,
              single_trip_price: selectedTransport.single_trip_price,
              round_trip_price: selectedTransport.round_trip_price
            });
            return {
              ...route,
              transportId: value,
              origin: selectedTransport.origin_name || selectedTransport.origin,
              destination: selectedTransport.destination_name || selectedTransport.destination,
              price: dbPrice
            };
          }
        }
        // For other field updates, don't override price if it came from database
        if (field === 'price') {
          return { ...route, [field]: Number(value) || 0 };
        }
        return { ...route, [field]: value };
      }
      return route;
    }));
  };

  // Re-validate transport supervisors when total supervisors changes
  useEffect(() => {
    if (watchTransportRequired) {
      trigger(['landTransportSupervisors', 'airTransportSupervisors']);
    }
  }, [watchSupervisors, trigger, watchTransportRequired]);
  
  // Calculate average transport costs
  const calculateAvgLandTransportCost = () => {
    if (!landTransportsData || landTransportsData.length === 0) return 1000;
    // Return a reasonable default for land transport
    return 1000;
  };

  const calculateAvgAirTransportCost = () => {
    if (!airTransportsData || airTransportsData.length === 0) return 5000;
    // Return a reasonable default for air transport
    return 5000;
  };

  // Memoize these values to avoid recalculating on every render
  const avgLandTransportCost = calculateAvgLandTransportCost();
  const avgAirTransportCost = calculateAvgAirTransportCost();

  useEffect(() => {
    const calculateTotalBudget = () => {
      const locationId = watchLocation;
      const days = watchDays || 0;
      const supervisors = watchSupervisors || 0;
      const numSessions = Number(watchSessions) || 1; // Number of supervision sessions
      
      // Get location data
      const location = locationsData.find(loc => String(loc.id) === String(locationId));
      if (!location) {
        setValue('totalBudget', 0);
        return 0;
      }
      
      // Per diem calculation
      let perDiemTotal = 0;
      const perDiem = perDiemsData.find(pd => 
        String(pd.location_id) === String(locationId) || 
        String(pd.location) === String(locationId)
      );
      
      if (perDiem) {
        const perDiemAmount = Number(perDiem.amount) || 0;
        const hardshipAmount = Number(perDiem.hardship_allowance_amount) || 0;
        perDiemTotal = (perDiemAmount + hardshipAmount) * supervisors * days;
          
          // Add per diems for additional locations
          additionalLocations.forEach(loc => {
            if (!loc.locationId) return;
            
            const additionalPerDiem = perDiemsData.find(pd => 
              String(pd.location_id) === String(loc.locationId) || 
              String(pd.location) === String(loc.locationId)
            );
            
            if (additionalPerDiem) {
              const addPerDiemAmount = Number(additionalPerDiem.amount || 0);
              const addHardshipAmount = Number(additionalPerDiem.hardship_allowance_amount || 0);
              perDiemTotal += (addPerDiemAmount + addHardshipAmount) * loc.supervisors * loc.days;
            }
          });
      }
      
      // Accommodation calculation (for days - 1)
      let accommodationTotal = 0;
      if (days > 1) {
        const accommodation = accommodationsData.find(acc => 
          (String(acc.location_id) === String(locationId) || 
           String(acc.location) === String(locationId)) && 
          acc.service_type === 'BED'
        );
        
        if (accommodation) {
            accommodationTotal = Number(accommodation.price) * supervisors * (days - 1);
            
            // Add accommodation for additional locations
            additionalLocations.forEach(loc => {
              if (!loc.locationId || loc.days <= 1) return;
              
              const additionalAccommodation = accommodationsData.find(acc => 
                (String(acc.location_id) === String(loc.locationId) || 
                 String(acc.location) === String(loc.locationId)) && 
                acc.service_type === 'BED'
              );
              
              if (additionalAccommodation) {
                accommodationTotal += Number(additionalAccommodation.price) * loc.supervisors * (loc.days - 1);
              }
            });
        }
      }
      
      // Transport costs
      let transportTotal = 0;
      if (watchTransportRequired) {
        // Calculate from routes
        landTransportRoutes.forEach(route => {
          transportTotal += Number(route.price || 0) * Number(route.participants || 1);
        });
        
        airTransportRoutes.forEach(route => {
          transportTotal += Number(route.price || 0) * Number(route.participants || 1);
        });
        
        // Include legacy fields for backward compatibility
        if (landTransportRoutes.length === 0 && airTransportRoutes.length === 0) {
          const landSupervisors = Number(watchLandTransport) || 0;
          const airSupervisors = Number(watchAirTransport) || 0;
          transportTotal = (landSupervisors * avgLandTransportCost) + 
                           (airSupervisors * avgAirTransportCost);
        }
      }
      
      // Additional supervisor costs
      let supervisorCostsTotal = 0;
      if (watchSupervisorCosts) {
        if (watchSupervisorCosts.includes('ALL')) {
          // Get sum of all supervisor costs except ALL
          const allCosts = supervisorCostsData
            .filter(cost => cost.cost_type !== 'ALL')
            .reduce((sum, cost) => sum + Number(cost.amount || 0), 0);
          
          supervisorCostsTotal = supervisors * allCosts;
          
          // Apply costs to supervisors in additional locations
          additionalLocations.forEach(loc => {
            if (!loc.locationId) return;
            supervisorCostsTotal += loc.supervisors * allCosts;
          });
        } else {
          watchSupervisorCosts.forEach(cost => {
            const costItem = supervisorCostsData.find(c => c.cost_type === cost);
            if (costItem) {
              supervisorCostsTotal += supervisors * Number(costItem.amount || 0);
              
              // Apply costs to supervisors in additional locations
              additionalLocations.forEach(loc => {
                if (!loc.locationId) return;
                supervisorCostsTotal += loc.supervisors * Number(costItem.amount || 0);
              });
            }
          });
        }
      }
      
      // Other costs
      const otherCostsTotal = Number(watchOtherCosts) || 0;
      
      // Calculate subtotal first
      const subtotal = perDiemTotal + accommodationTotal + transportTotal + 
                      supervisorCostsTotal + otherCostsTotal;
      
      // Apply session multiplier to entire subtotal
      // Sessions represent how many times the entire supervision occurs
      const total = subtotal * numSessions;
      
      setValue('totalBudget', total);
      return total;
    };

    calculateTotalBudget();
  }, [
    watchLocation, watchDays, watchSupervisors, watchSessions, watchTransportRequired,
    watchLandTransport, watchAirTransport, watchSupervisorCosts,
    watchOtherCosts, setValue, locationsData, perDiemsData, accommodationsData,
    supervisorCostsData,
    additionalLocations, landTransportRoutes, airTransportRoutes
  ]);

  const handleFormSubmit = async (data: SupervisionCost) => {
    try {
      setIsCalculating(true);
      setError(null);
      
      // Make sure we have a valid budget amount
      const calculatedBudget = watch('totalBudget') || 0;
      const formValues = getValues();
      
      console.log('Supervision calculated budget:', calculatedBudget);
      
      if (!calculatedBudget || calculatedBudget <= 0) {
        setError('Total budget must be greater than 0');
        return;
      }

      // Calculate transport costs
      let transportCosts = {
        landParticipants: 0,
        airParticipants: 0,
        totalCost: 0
      };
      
      if (watchTransportRequired) {
        // Count supervisors and costs from land routes
        let landSupervisorsTotal = 0;
        let landCostTotal = 0;
        
        landTransportRoutes.forEach(route => {
          landSupervisorsTotal += Number(route.participants || 1);
          landCostTotal += Number(route.price || 0) * Number(route.participants || 1);
        });
        
        // Count supervisors from air routes
        let airSupervisorsTotal = 0;
        let airCostTotal = 0;
        
        airTransportRoutes.forEach(route => {
          airSupervisorsTotal += Number(route.participants || 1);
          airCostTotal += Number(route.price || 0) * Number(route.participants || 1);
        });
        
        // Add legacy transport if routes are empty
        if (landTransportRoutes.length === 0 && Number(data.landTransportSupervisors) > 0) {
          landSupervisorsTotal = Number(data.landTransportSupervisors);
          landCostTotal = landSupervisorsTotal * avgLandTransportCost;
        }
        
        if (airTransportRoutes.length === 0 && Number(data.airTransportSupervisors) > 0) {
          airSupervisorsTotal = Number(data.airTransportSupervisors);
          airCostTotal = airSupervisorsTotal * avgAirTransportCost;
        }
        
        transportCosts = {
          landParticipants: landSupervisorsTotal,
          airParticipants: airSupervisorsTotal,
          totalCost: landCostTotal + airCostTotal
        };
        
        // Validate that total transport supervisors doesn't exceed total supervisors
        const totalTransportSupervisors = landSupervisorsTotal + airSupervisorsTotal;
        let totalSupervisors = Number(watchSupervisors) || 0;
        
        // Add supervisors from additional locations
        additionalLocations.forEach(loc => {
          totalSupervisors += Number(loc.supervisors) || 0;
        });
        
        if (totalTransportSupervisors > totalSupervisors) {
          setError(`Total transport supervisors (${totalTransportSupervisors}) cannot exceed total supervisors (${totalSupervisors})`);
          return;
        }
      }
      
      // Prepare streamlined data for the budget form
      const budgetData = {
        activity: data.activity,
        budget_calculation_type: 'WITH_TOOL',
        activity_type: 'Supervision', // Explicitly set type
        estimated_cost_with_tool: calculatedBudget || 0,
        totalBudget: calculatedBudget || 0, // Add totalBudget for consistency
        estimated_cost: calculatedBudget || 0, // Add estimated_cost for consistency
        estimated_cost_without_tool: 0, // Not used since we're using the tool
        government_treasury: 0,
        sdg_funding: 0,
        partners_funding: 0,
        other_funding: 0,
        supervision_details: {
          description: data.description,
          trainingLocation: data.trainingLocation,
          numberOfSessions: Number(data.numberOfSessions) || 0,
          numberOfDays: Number(data.numberOfDays) || 0,
          numberOfSupervisors: Number(data.numberOfSupervisors) || 0,
          additionalLocations: additionalLocations.map(loc => ({
            locationId: loc.locationId,
            days: Number(loc.days) || 0,
            supervisors: Number(loc.supervisors) || 0
          })),
          additionalSupervisorCosts: data.additionalSupervisorCosts,
          transportRequired: data.transportRequired,
          transportCosts: transportCosts,
          landTransportRoutes: landTransportRoutes,
          airTransportRoutes: airTransportRoutes,
          otherCosts: Number(data.otherCosts) || 0,
          justification: data.justification
        }
      };
      
      // Pass the prepared budget data to the parent component
      onCalculate(budgetData);
    } catch (err: any) {
      console.error('Failed to process supervision costs:', err);
      setError(err.message || 'Failed to process costs. Please try again.');
    } finally {
      setIsCalculating(false);
    }
  };

  // Show loading state while fetching data
  if (isLoading) {
    return <div className="flex flex-col items-center justify-center p-8">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mb-4"></div>
      <p className="text-gray-700">Loading costing data from database...</p>
    </div>;
  }

  // If no locations data is available, show an error
  if (!locationsData || locationsData.length === 0) {
    return <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-center text-red-500 mb-2">
        <AlertCircle className="h-6 w-6 mr-2 flex-shrink-0" />
        <h3 className="text-lg font-medium text-red-800">Location data not available</h3>
      </div>
      <p className="text-red-600 mb-4">Could not load location data from the database. Please check your connection and try again.</p>
      <p className="text-sm text-red-700 mb-4">The system will use default location data if none is available. Retry in a moment.</p>
      <button
        onClick={onCancel}
        className="mt-4 px-4 py-2 bg-white border border-red-300 rounded-md text-red-700 hover:bg-red-50"
      >
        Go Back
      </button>
    </div>;
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 max-h-[75vh] overflow-y-auto p-2 pb-20">
      <div className="flex items-center justify-between">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 flex-1">
          <h3 className="text-lg font-medium text-blue-800 mb-2 flex items-center">
            <Calculator className="h-5 w-5 mr-2" />
            Supervision Cost Calculator
          </h3>
          <p className="text-sm text-blue-600">
            Fill in the supervision details below to calculate the total budget.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="ml-4 p-2 text-gray-400 hover:text-gray-500"
        >
          <span className="sr-only">Cancel</span>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Description of Supervision Activity
        </label>
        <textarea
          {...register('description', { required: 'Description is required' })}
          rows={3}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Describe the supervision activity..."
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of Sessions <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="1"
            {...register('numberOfSessions', {
              required: 'Number of sessions is required',
              min: { value: 1, message: 'Minimum 1 session required' },
              valueAsNumber: true
            })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
          {errors.numberOfSessions && (
            <p className="mt-1 text-sm text-red-600">{errors.numberOfSessions.message}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Number of times this supervision activity will occur
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of Days <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="1"
            {...register('numberOfDays', {
              required: 'Number of days is required',
              min: { value: 1, message: 'Minimum 1 day required' },
              valueAsNumber: true
            })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
          {errors.numberOfDays && (
            <p className="mt-1 text-sm text-red-600">{errors.numberOfDays.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of Supervisors <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="1"
            {...register('numberOfSupervisors', {
              required: 'Number of supervisors is required',
              min: { value: 1, message: 'Minimum 1 supervisor required' },
              valueAsNumber: true
            })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
          {errors.numberOfSupervisors && (
            <p className="mt-1 text-sm text-red-600">{errors.numberOfSupervisors.message}</p>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Supervision Location <span className="text-red-500">*</span>
          </label>
          <select
            {...register('trainingLocation', { required: 'Location is required' })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {locationsData.map(location => (
              <option key={location.id} value={location.id}>
                {location.name} ({location.region}{location.is_hardship_area ? ' - Hardship' : ''})
              </option>
            ))}
          </select>
          {errors.trainingLocation && (
            <p className="mt-1 text-sm text-red-600">{errors.trainingLocation.message}</p>
          )}
        </div>
      </div>
        
      {/* Additional Locations */}
      <div className="mt-4">
        <div className="flex justify-between items-center mb-4">
          <label className="block text-sm font-medium text-gray-700">
            Additional Supervision Locations (optional)
          </label>
          <button
            type="button"
            onClick={addSupervisionLocation}
            className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Location
          </button>
        </div>

        <div className="space-y-4">
          {additionalLocations.map((location, index) => (
            <div key={index} className="flex items-start gap-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Location {index + 2}
                  </label>
                  <select
                    value={location.locationId}
                    onChange={(e) => updateSupervisionLocation(index, 'locationId', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    {locationsData.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.region}{loc.is_hardship_area ? ' - Hardship' : ''})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Days
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={location.days}
                    onChange={(e) => updateSupervisionLocation(index, 'days', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Supervisors
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={location.supervisors}
                    onChange={(e) => updateSupervisionLocation(index, 'supervisors', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeSupervisionLocation(index)}
                className="mt-4 text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          ))}
        </div>
        
        {additionalLocations.length === 0 && (
          <p className="text-sm text-gray-500 italic">No additional locations added</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Additional Supervisor Costs
        </label>
        <div className="mt-2 space-y-2">
          {supervisorCostsData.map(cost => (
            <label key={cost.cost_type} className="inline-flex items-center mr-4">
              <input
                type="checkbox"
                value={cost.cost_type}
                checked={watchSupervisorCosts?.includes(cost.cost_type)}
                onChange={(e) => {
                  const value = e.target.value;
                  const currentValues = watchSupervisorCosts || [];
                  const newValues = e.target.checked
                    ? [...currentValues, value]
                    : currentValues.filter(v => v !== value);
                  setValue('additionalSupervisorCosts', newValues);
                }}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                {cost.cost_type_display || cost.cost_type} (ETB {Number(cost.amount).toLocaleString()})
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Transport Required?
        </label>
        <div className="mt-2">
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              {...register('transportRequired')}
              className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700">Yes</span>
          </label>
        </div>
      </div>

      {watchTransportRequired && (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-700">Land Transport Routes</h4>
              <button
                type="button"
                onClick={addLandTransportRoute}
                className="inline-flex items-center px-2 py-1 text-xs font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200"
              >
                <Plus className="h-3 w-3 mr-1" /> Add Land Route
              </button>
            </div>
            
            {landTransportRoutes.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No land transport routes added</p>
            ) : (
              <div className="space-y-3">
                {landTransportRoutes.map((route, index) => (
                  <div key={route.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="flex-1 mr-4 grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Transport Route</label>
                        <select
                          value={route.transportId || ''}
                          onChange={(e) => updateLandTransportRoute(route.id, 'transportId', e.target.value)}
                          className="mt-1 block w-full text-xs rounded-md border-gray-300"
                        >
                          <option value="">Select Route</option>
                          {landTransportsData.map(transport => (
                            <option key={transport.id} value={transport.id}>
                              {transport.origin_name} → {transport.destination_name} (ETB {Number(transport.price).toLocaleString()})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Price (ETB)</label>
                        <input
                          type="number"
                          min="1"
                          value={route.price}
                          onChange={(e) => updateLandTransportRoute(route.id, 'price', Number(e.target.value))}
                          className="mt-1 block w-full text-xs rounded-md border-gray-300"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700">Supervisors</label>
                        <input
                          type="number"
                          min="1"
                          value={route.participants}
                          onChange={(e) => updateLandTransportRoute(route.id, 'participants', Number(e.target.value))}
                          className="mt-1 block w-full text-xs rounded-md border-gray-300"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLandTransportRoute(route.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-700">Air Transport Routes</h4>
              <button
                type="button"
                onClick={addAirTransportRoute}
                className="inline-flex items-center px-2 py-1 text-xs font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200"
              >
                <Plus className="h-3 w-3 mr-1" /> Add Air Route
              </button>
            </div>
            
            {airTransportRoutes.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No air transport routes added</p>
            ) : (
              <div className="space-y-3">
                {airTransportRoutes.map((route, index) => (
                  <div key={route.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="flex-1 mr-4 grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Transport Route</label>
                        <select
                          value={route.transportId || ''}
                          onChange={(e) => updateAirTransportRoute(route.id, 'transportId', e.target.value)}
                          className="mt-1 block w-full text-xs rounded-md border-gray-300"
                        >
                          <option value="">Select Route</option>
                          {airTransportsData.map(transport => (
                            <option key={transport.id} value={transport.id}>
                              {transport.origin_name} → {transport.destination_name} (ETB {Number(transport.price).toLocaleString()})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Price (ETB)</label>
                        <input
                          type="number"
                          min="1"
                          value={route.price}
                          onChange={(e) => updateAirTransportRoute(route.id, 'price', Number(e.target.value))}
                          className="mt-1 block w-full text-xs rounded-md border-gray-300"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700">Supervisors</label>
                        <input
                          type="number"
                          min="1"
                          value={route.participants}
                          onChange={(e) => updateAirTransportRoute(route.id, 'participants', Number(e.target.value))}
                          className="mt-1 block w-full text-xs rounded-md border-gray-300"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAirTransportRoute(route.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Other Costs (ETB)
        </label>
        <input
          type="number"
          min="0"
          {...register('otherCosts', {
            min: { value: 0, message: 'Cannot be negative' },
            valueAsNumber: true
          })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="0"
        />
        {errors.otherCosts && (
          <p className="mt-1 text-sm text-red-600">{errors.otherCosts.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Justification for Additional Costs
        </label>
        <textarea
          {...register('justification')}
          rows={3}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Explain any additional costs..."
        />
      </div>

      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <DollarSign className="h-5 w-5 text-green-600 mr-1 flex-shrink-0" />
            <span className="text-lg font-medium text-gray-900">Total Supervision Budget</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <span className="text-2xl font-bold text-green-600">
                ETB {watch('totalBudget')?.toLocaleString() || '0'}
              </span>
              <p className="text-xs text-gray-500">
                {additionalLocations.length > 0 && `Including ${additionalLocations.length} additional location(s)`}
              </p>
            </div>
          </div>
        </div>
        <p className="mt-2 text-sm text-gray-500 flex items-center">
          <Info className="h-4 w-4 mr-1" />
          This total includes supervision costs
          {additionalLocations.length > 0 && ` for ${additionalLocations.length + 1} location(s)`}
          {supervisorCostsData.length > 0 ? ' (from database)' : ''}
        </p>
      </div>

      <div className="flex justify-end space-x-2 sticky bottom-0 left-0 right-0 bg-white py-4 px-2 border-t border-gray-200 shadow-md z-10">
        <button
          type="button"
          onClick={onCancel}
          disabled={isCalculating}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isCalculating || !getValues('description')}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center"
        >
          {isCalculating ? (
            <>
              <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Processing...
            </>
          ) : (
            'Apply and Continue to Funding Sources'
          )}
        </button>
      </div>
    </form>
  );
};

export default SupervisionCostingTool;
