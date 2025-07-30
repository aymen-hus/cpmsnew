import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Calculator, DollarSign, Info, Plus, Trash2, AlertCircle } from 'lucide-react';
import type { MeetingWorkshopCost } from '../types/costing';
import { locations, perDiems, accommodations, participantCosts, sessionCosts, landTransports, airTransports } from '../lib/api';

// Fallback data if API fails
const FALLBACK_LOCATIONS = [
  { id: 'fallback-1', name: 'Addis Ababa', region: 'Addis Ababa', is_hardship_area: false },
  { id: 'fallback-2', name: 'Adama', region: 'Oromia', is_hardship_area: false }
];

interface LocationItem {
  locationId: string;
  days: number;
  participants: number;
}

interface TransportRoute {
  id: string;
  transportId: string;
  origin: string;
  destination: string;
  price: number;
  participants: number;
}

interface MeetingWorkshopCostingToolProps {
  activityType?: 'Meeting' | 'Workshop'; // Make optional
  onCalculate: (costs: MeetingWorkshopCost) => void;
  onCancel: () => void;
  initialData?: MeetingWorkshopCost;
}

const MeetingWorkshopCostingTool: React.FC<MeetingWorkshopCostingToolProps> = ({ 
  activityType = 'Meeting', // Add default value here
  onCalculate, 
  onCancel,
  initialData 
}) => {
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationsData, setLocationsData] = useState<any[]>([]);
  const [perDiemsData, setPerDiemsData] = useState<any[]>([]);
  const [accommodationsData, setAccommodationsData] = useState<any[]>([]);
  const [participantCostsData, setParticipantCostsData] = useState<any[]>([]);
  const [sessionCostsData, setSessionCostsData] = useState<any[]>([]);
  const [landTransportsData, setLandTransportsData] = useState<any[]>([]);
  const [airTransportsData, setAirTransportsData] = useState<any[]>([]);
  const [landTransportRoutes, setLandTransportRoutes] = useState<TransportRoute[]>([]);
  const [airTransportRoutes, setAirTransportRoutes] = useState<TransportRoute[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [costMode, setCostMode] = useState<'perdiem' | 'accommodation'>('perdiem');
  const [selectedAccommodationTypes, setSelectedAccommodationTypes] = useState<string[]>([]);
  const [additionalLocations, setAdditionalLocations] = useState<LocationItem[]>([]);
  
  const { register, watch, control, setValue, handleSubmit, formState: { errors }, getValues } = useForm<MeetingWorkshopCost>({
    defaultValues: initialData || {
      description: '',
      numberOfDays: 1,
      numberOfParticipants: 1,
      numberOfSessions: 1,
      trainingLocation: '',
      costMode: 'perdiem',
      additionalParticipantCosts: [],
      additionalSessionCosts: [],
      transportRequired: false,
      otherCosts: 0
    }
  });

  const watchTransportRequired = watch('transportRequired');
  
  // Fetch all required data from the database
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const [
          locationsResult,
          perDiemsResult,
          accommodationsResult,
          participantCostsResult,
          sessionCostsResult,
          landTransportsResult,
          airTransportsResult
        ] = await Promise.all([
          locations.getAll().catch(e => {
            console.error('Error fetching locations:', e);
            return { data: FALLBACK_LOCATIONS };
          }),
          perDiems.getAll().catch(e => {
            console.error('Error fetching perDiems:', e);
            return { data: [] };
          }),
          accommodations.getAll().catch(e => {
            console.error('Error fetching accommodations:', e);
            return { data: [] };
          }),
          participantCosts.getAll().catch(e => {
            console.error('Error fetching participantCosts:', e);
            return { data: [] };
          }),
          sessionCosts.getAll().catch(e => {
            console.error('Error fetching sessionCosts:', e);
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
        
        // Process and set the data
        setLocationsData(locationsResult?.data || FALLBACK_LOCATIONS);
        setPerDiemsData(perDiemsResult?.data || []);
        setAccommodationsData(accommodationsResult?.data || []);
        setParticipantCostsData(participantCostsResult?.data || []);
        setSessionCostsData(sessionCostsResult?.data || []);
        setLandTransportsData(landTransportsResult?.data || []);
        setAirTransportsData(airTransportsResult?.data || []);
        
        // Set default location if available
        if (locationsResult?.data?.length > 0 && !initialData?.trainingLocation) {
          setValue('trainingLocation', locationsResult.data[0].id);
        }
        
      } catch (error) {
        console.error('Error fetching meeting/workshop costing data:', error);
        setError('Failed to load costing data from database. Using default values.');
        setLocationsData(FALLBACK_LOCATIONS);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [setValue, initialData]);

  // Add a new location
  const addMeetingLocation = () => {
    if (locationsData.length === 0) return;
    
    const newLocation: LocationItem = {
      locationId: locationsData[0]?.id || '',
      days: 1,
      participants: 1
    };
    
    setAdditionalLocations([...additionalLocations, newLocation]);
  };
  
  // Remove a location
  const removeMeetingLocation = (index: number) => {
    const newLocations = [...additionalLocations];
    newLocations.splice(index, 1);
    setAdditionalLocations(newLocations);
  };
  
  // Update a location
  const updateMeetingLocation = (index: number, field: keyof LocationItem, value: any) => {
    const newLocations = [...additionalLocations];
    newLocations[index] = {
      ...newLocations[index],
      [field]: value
    };
    setAdditionalLocations(newLocations);
  };

  // Add a new land transport route
  const addLandTransportRoute = () => {
    const defaultTransport = landTransportsData.length > 0 ? landTransportsData[0] : null;
    
    setLandTransportRoutes([...landTransportRoutes, {
      id: Date.now().toString(),
      transportId: defaultTransport?.id || '',
      origin: defaultTransport?.origin_name || defaultTransport?.origin || 'Addis Ababa',
      destination: defaultTransport?.destination_name || defaultTransport?.destination || 'Destination',
      price: Number(defaultTransport?.price || defaultTransport?.single_trip_price || 0),
      participants: 1
    }]);
  };

  // Add a new air transport route
  const addAirTransportRoute = () => {
    const defaultTransport = airTransportsData.length > 0 ? airTransportsData[0] : null;
    
    setAirTransportRoutes([...airTransportRoutes, {
      id: Date.now().toString(),
      transportId: defaultTransport?.id || '',
      origin: defaultTransport?.origin_name || defaultTransport?.origin || 'Addis Ababa',
      destination: defaultTransport?.destination_name || defaultTransport?.destination || 'Destination', 
      price: Number(defaultTransport?.price || defaultTransport?.single_trip_price || 0),
      participants: 1
    }]);
  };

  // Remove transport routes
  const removeLandTransportRoute = (id: string) => {
    setLandTransportRoutes(landTransportRoutes.filter(route => route.id !== id));
  };

  const removeAirTransportRoute = (id: string) => {
    setAirTransportRoutes(airTransportRoutes.filter(route => route.id !== id));
  };

  // Update transport route
  const updateLandTransportRoute = (id: string, field: string, value: any) => {
    setLandTransportRoutes(landTransportRoutes.map(route => {
      if (route.id === id) {
        if (field === 'transportId') {
          const selectedTransport = landTransportsData.find(t => t.id === value);
          if (selectedTransport) {
            const dbPrice = Number(selectedTransport.price) || 
                           Number(selectedTransport.single_trip_price) || 
                           Number(selectedTransport.round_trip_price) || 0;
            return {
              ...route,
              transportId: value,
              origin: selectedTransport.origin_name || selectedTransport.origin,
              destination: selectedTransport.destination_name || selectedTransport.destination,
              price: dbPrice
            };
          }
        }
        if (field === 'price') {
          return { ...route, [field]: Number(value) || 0 };
        }
        if (field === 'participants') {
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
        if (field === 'transportId') {
          const selectedTransport = airTransportsData.find(t => t.id === value);
          if (selectedTransport) {
            const dbPrice = Number(selectedTransport.price) || 
                           Number(selectedTransport.single_trip_price) || 
                           Number(selectedTransport.round_trip_price) || 0;
            return {
              ...route,
              transportId: value,
              origin: selectedTransport.origin_name || selectedTransport.origin,
              destination: selectedTransport.destination_name || selectedTransport.destination,
              price: dbPrice
            };
          }
        }
        if (field === 'price') {
          return { ...route, [field]: Number(value) || 0 };
        }
        if (field === 'participants') {
          return { ...route, [field]: Number(value) || 0 };
        }
        return { ...route, [field]: value };
      }
      return route;
    }));
  };

  // Calculate average transport costs
  const calculateAvgLandTransportCost = () => {
    if (!landTransportsData || landTransportsData.length === 0) return 1000;
    
    let total = 0;
    let count = 0;
    
    landTransportsData.forEach(transport => {
      const price = Number(transport.price || transport.single_trip_price);
      if (!isNaN(price) && price > 0) {
        total += price;
        count++;
      }
    });
    
    return count > 0 ? total / count : 1000;
  };

  const calculateAvgAirTransportCost = () => {
    if (!airTransportsData || airTransportsData.length === 0) return 5000;
    
    let total = 0;
    let count = 0;
    
    airTransportsData.forEach(transport => {
      const price = Number(transport.price || transport.single_trip_price);
      if (!isNaN(price) && price > 0) {
        total += price;
        count++;
      }
    });
    
    return count > 0 ? total / count : 5000;
  };

  const avgLandTransportCost = calculateAvgLandTransportCost();
  const avgAirTransportCost = calculateAvgAirTransportCost();

  // Initialize cost mode and other form values from initialData
  useEffect(() => {
    if (initialData) {
      if (initialData.costMode) {
        setCostMode(initialData.costMode);
        setValue('costMode', initialData.costMode);
      }
      
      if (initialData.additionalLocations) {
        setAdditionalLocations(initialData.additionalLocations);
      }
      
      if (initialData.transportRequired && initialData.transportCosts) {
        if (initialData.transportCosts.landParticipants > 0) {
          const landRoute: TransportRoute = {
            id: Date.now().toString(),
            transportId: '',
            origin: 'Origin',
            destination: 'Destination',
            price: avgLandTransportCost,
            participants: initialData.transportCosts.landParticipants
          };
          setLandTransportRoutes([landRoute]);
        }
        
        if (initialData.transportCosts.airParticipants > 0) {
          const airRoute: TransportRoute = {
            id: (Date.now() + 100).toString(),
            transportId: '',
            origin: 'Origin',
            destination: 'Destination',
            price: avgAirTransportCost,
            participants: initialData.transportCosts.airParticipants
          };
          setAirTransportRoutes([airRoute]);
        }
      }
    }
  }, [initialData, setValue, avgLandTransportCost, avgAirTransportCost]);

  // Budget calculation
  useEffect(() => {
    const calculateTotalBudget = () => {
      const locationId = watch('trainingLocation');
      const days = watch('numberOfDays') || 0;
      const participants = watch('numberOfParticipants') || 0;
      const numSessions = Number(watch('numberOfSessions')) || 1;
      const participantCosts = watch('additionalParticipantCosts') || [];
      const sessionCosts = watch('additionalSessionCosts') || [];
      const transportRequired = watch('transportRequired');
      const landTransportParticipants = watch('landTransportParticipants') || 0;
      const airTransportParticipants = watch('airTransportParticipants') || 0;
      const otherCosts = watch('otherCosts') || 0;
      
      // Create all locations array (main + additional)
      const allLocations = [
        { locationId, days, participants },
        ...additionalLocations
      ];
      
      // Per diem or accommodation calculation
      let perDiemTotal = 0;
      allLocations.forEach(loc => {
        if (!loc.locationId) return;
        
        if (costMode === 'perdiem') {
          const perDiem = perDiemsData.find(pd => 
            String(pd.location_id) === String(loc.locationId) || 
            String(pd.location) === String(loc.locationId)
          );
          
          if (perDiem) {
            const perDiemAmount = Number(perDiem.amount) || 0;
            const hardshipAmount = Number(perDiem.hardship_allowance_amount) || 0;
            perDiemTotal += (perDiemAmount + hardshipAmount) * loc.participants * loc.days;
          }
        } else {
          // Accommodation mode
          selectedAccommodationTypes.forEach(serviceType => {
            const accommodation = accommodationsData.find(acc => 
              (String(acc.location_id) === String(loc.locationId) || 
              String(acc.location) === String(loc.locationId)) && 
              acc.service_type === serviceType
            );
            
            if (accommodation) {
              perDiemTotal += Number(accommodation.price) * loc.participants * loc.days;
            }
          });
        }
      });
      
      // Participant costs
      let participantCostsTotal = 0;
      if (participantCosts.length > 0) {
        if (participantCosts.includes('ALL')) {
          const allCosts = participantCostsData
            .filter(cost => cost.cost_type !== 'ALL')
            .reduce((sum, cost) => sum + Number(cost.price || 0), 0);
          
          // Apply to all locations
          allLocations.forEach(loc => {
            participantCostsTotal += loc.participants * allCosts;
          });
        } else {
          participantCosts.forEach(cost => {
            const costItem = participantCostsData.find(c => c.cost_type === cost);
            if (costItem) {
              // Apply to all locations
              allLocations.forEach(loc => {
                participantCostsTotal += loc.participants * Number(costItem.price || 0);
              });
            }
          });
        }
      }
      
      // Session costs
      let sessionCostsTotal = 0;
      if (sessionCosts.length > 0) {
        if (sessionCosts.includes('ALL')) {
          const allCosts = sessionCostsData
            .filter(cost => cost.cost_type !== 'ALL')
            .reduce((sum, cost) => sum + Number(cost.price || 0), 0);
          
          sessionCostsTotal = numSessions * allCosts;
        } else {
          sessionCosts.forEach(cost => {
            const costItem = sessionCostsData.find(c => c.cost_type === cost);
            if (costItem) {
              sessionCostsTotal += numSessions * Number(costItem.price || 0);
            }
          });
        }
      }
      
      // Transport costs
      let transportTotal = 0;
      if (transportRequired) {
        // Calculate from routes
        landTransportRoutes.forEach(route => {
          transportTotal += Number(route.price || 0) * Number(route.participants || 1);
        });
        
        airTransportRoutes.forEach(route => {
          transportTotal += Number(route.price || 0) * Number(route.participants || 1);
        });
        
        // Include legacy fields for backward compatibility
        if (landTransportRoutes.length === 0 && airTransportRoutes.length === 0) {
          transportTotal = (landTransportParticipants * avgLandTransportCost) + 
                           (airTransportParticipants * avgAirTransportCost);
        }
      }
      
      // Other costs
      const otherCostsTotal = Number(otherCosts) || 0;
      
      // Calculate total
      const total = perDiemTotal + participantCostsTotal + sessionCostsTotal + transportTotal + otherCostsTotal;
      
      setValue('totalBudget', total);
      return total;
    };

    calculateTotalBudget();
  }, [
    watch('trainingLocation'), 
    watch('numberOfDays'), 
    watch('numberOfParticipants'), 
    watch('numberOfSessions'),
    watch('additionalParticipantCosts'),
    watch('additionalSessionCosts'),
    watch('transportRequired'),
    watch('landTransportParticipants'),
    watch('airTransportParticipants'),
    watch('otherCosts'),
    locationsData, 
    perDiemsData, 
    accommodationsData, 
    participantCostsData, 
    sessionCostsData,
    costMode, 
    selectedAccommodationTypes, 
    additionalLocations, 
    landTransportRoutes, 
    airTransportRoutes,
    setValue
  ]);

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
      <p className="text-red-600 mb-4">Could not load location data from the database.</p>
      <button onClick={onCancel} className="px-4 py-2 bg-white border border-red-300 rounded-md text-red-700 hover:bg-red-50">
        Go Back
      </button>
    </div>;
  }

  const handleFormSubmit = async (data: MeetingWorkshopCost) => {
    try {
      setIsCalculating(true);
      setError(null);
      
      // Make sure we have a valid budget amount
      const calculatedBudget = watch('totalBudget') || 0;
      
      if (!calculatedBudget || calculatedBudget <= 0) {
        setError('Total budget must be greater than 0');
        return;
      }

      // Calculate transport costs for detail
      let transportCosts = {
        landParticipants: 0,
        airParticipants: 0,
        totalCost: 0
      };
      
      if (watchTransportRequired) {
        // Count participants from land routes
        let landParticipantsTotal = 0;
        let landCostTotal = 0;
        
        landTransportRoutes.forEach(route => {
          landParticipantsTotal += Number(route.participants || 1);
          landCostTotal += Number(route.price || 0) * Number(route.participants || 1);
        });
        
        // Count participants from air routes
        let airParticipantsTotal = 0;
        let airCostTotal = 0;
        
        airTransportRoutes.forEach(route => {
          airParticipantsTotal += Number(route.participants || 1);
          airCostTotal += Number(route.price || 0) * Number(route.participants || 1);
        });
        
        // Add legacy transport if routes are empty
        if (landTransportRoutes.length === 0 && Number(data.landTransportParticipants) > 0) {
          landParticipantsTotal = Number(data.landTransportParticipants);
          landCostTotal = landParticipantsTotal * avgLandTransportCost;
        }
        
        if (airTransportRoutes.length === 0 && Number(data.airTransportParticipants) > 0) {
          airParticipantsTotal = Number(data.airTransportParticipants);
          airCostTotal = airParticipantsTotal * avgAirTransportCost;
        }
        
        transportCosts = {
          landParticipants: landParticipantsTotal,
          airParticipants: airParticipantsTotal,
          totalCost: landCostTotal + airCostTotal
        };
      }
      
      // Prepare streamlined data for the budget form
      const budgetData = {
        activity: data.activity,
        budget_calculation_type: 'WITH_TOOL',
        activity_type: activityType,
        estimated_cost_with_tool: Number(calculatedBudget) || 0,
        totalBudget: Number(calculatedBudget) || 0,
        estimated_cost: Number(calculatedBudget) || 0,
        estimated_cost_without_tool: 0,
        government_treasury: 0,
        sdg_funding: 0,
        partners_funding: 0,
        other_funding: 0,
        meeting_workshop_details: {
          description: data.description,
          trainingLocation: data.trainingLocation,
          numberOfDays: Number(data.numberOfDays) || 0,
          numberOfParticipants: Number(data.numberOfParticipants) || 0,
          numberOfSessions: Number(data.numberOfSessions) || 0,
          costMode: costMode,
          selectedAccommodationTypes: selectedAccommodationTypes,
          additionalLocations: additionalLocations,
          additionalParticipantCosts: data.additionalParticipantCosts,
          additionalSessionCosts: data.additionalSessionCosts,
          transportRequired: data.transportRequired,
          landTransportRoutes: landTransportRoutes,
          airTransportRoutes: airTransportRoutes,
          otherCosts: Number(data.otherCosts) || 0,
          justification: data.justification
        }
      };
      
      // Pass the prepared budget data to the parent component
      onCalculate(budgetData);
    } catch (err: any) {
      console.error('Failed to process costs:', err);
      setError(err.message || 'Failed to process costs. Please try again.');
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 max-h-[75vh] overflow-y-auto p-2 pb-20">
      <div className="flex items-center justify-between">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 flex-1">
          <h3 className="text-lg font-medium text-blue-800 mb-2 flex items-center gap-2">
            <Calculator className="h-5 w-5 mr-2" />
            {activityType} Cost Calculator 
            <span className="bg-blue-200 text-xs px-2 py-1 rounded-full">{costMode === 'perdiem' ? 'Per Diem Mode' : 'Accommodation Mode'}</span>
          </h3>
          <p className="text-sm text-blue-600">
            Fill in the {activityType?.toLowerCase() ?? 'activity'} details below to calculate the total budget.
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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description of {activityType} Activity <span className="text-red-500">*</span>
        </label>
        <textarea
          {...register('description', { required: 'Description is required' })}
          rows={3}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder={`Describe what will be covered in this ${activityType?.toLowerCase() ?? 'activity'}...`}
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            placeholder="Enter number of days"
          />
          {errors.numberOfDays && (
            <p className="mt-1 text-sm text-red-600">{errors.numberOfDays.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of Participants <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="1"
            {...register('numberOfParticipants', {
              required: 'Number of participants is required',
              min: { value: 1, message: 'Minimum 1 participant required' },
              valueAsNumber: true
            })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Enter number of participants"
          />
          {errors.numberOfParticipants && (
            <p className="mt-1 text-sm text-red-600">{errors.numberOfParticipants.message}</p>
          )}
        </div>
        
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
            placeholder="Enter number of sessions"
          />
          {errors.numberOfSessions && (
            <p className="mt-1 text-sm text-red-600">{errors.numberOfSessions.message}</p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Meeting Location
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

      {/* Cost Mode Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Cost Calculation Method
        </label>
        <div className="flex space-x-4">
          <label className="inline-flex items-center">
            <input
              type="radio"
              value="perdiem"
              checked={costMode === 'perdiem'}
              onChange={() => setCostMode('perdiem')}
              className="form-radio h-4 w-4 text-blue-600"
            />
            <span className="ml-2 text-sm text-gray-700">Per Diem</span>
          </label>
          <label className="inline-flex items-center">
            <input
              type="radio"
              value="accommodation"
              checked={costMode === 'accommodation'}
              onChange={() => setCostMode('accommodation')}
              className="form-radio h-4 w-4 text-blue-600"
            />
            <span className="ml-2 text-sm text-gray-700">Accommodation</span>
          </label>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {costMode === 'perdiem' 
            ? 'Uses standard per diem rates for the location' 
            : 'Uses specific accommodation service rates'}
        </p>
      </div>

      {/* Accommodation Type Selection (only when accommodation mode is selected) */}
      {costMode === 'accommodation' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Accommodation Types
          </label>
          <div className="space-y-2">
            {['BED', 'LUNCH', 'DINNER', 'HALL_REFRESHMENT', 'FULL_BOARD'].map(type => (
              <label key={type} className="inline-flex items-center mr-4">
                <input
                  type="checkbox"
                  checked={selectedAccommodationTypes.includes(type)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedAccommodationTypes([...selectedAccommodationTypes, type]);
                    } else {
                      setSelectedAccommodationTypes(selectedAccommodationTypes.filter(t => t !== type));
                    }
                  }}
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  {type === 'BED' ? 'Bed Only' :
                   type === 'LUNCH' ? 'Lunch' :
                   type === 'DINNER' ? 'Dinner' :
                   type === 'HALL_REFRESHMENT' ? 'Hall with Refreshment' :
                   'Full Board'}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Select the accommodation services required for the meeting/workshop
          </p>
        </div>
      )}

      {/* Additional Meeting Locations */}
      <div className="mt-4">
        <div className="flex justify-between items-center mb-4">
          <label className="block text-sm font-medium text-gray-700">
            Additional Meeting Locations (optional)
          </label>
          <button
            type="button"
            onClick={addMeetingLocation}
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
                    Location {index + 1}
                  </label>
                  <select
                    value={location.locationId}
                    onChange={(e) => updateMeetingLocation(index, 'locationId', e.target.value)}
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
                    onChange={(e) => updateMeetingLocation(index, 'days', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Participants
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={location.participants}
                    onChange={(e) => updateMeetingLocation(index, 'participants', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeMeetingLocation(index)}
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
          Additional Cost per Participant
        </label>
        <Controller
          name="additionalParticipantCosts"
          control={control}
          render={({ field }) => (
            <div className="mt-2 space-y-2">
              {participantCostsData.map(cost => (
                <label key={cost.cost_type} className="inline-flex items-center mr-4">
                  <input
                    type="checkbox"
                    value={cost.cost_type}
                    checked={field.value?.includes(cost.cost_type)}
                    onChange={(e) => {
                      const value = e.target.value;
                      const currentValues = field.value || [];
                      const newSelection = e.target.checked
                        ? [...currentValues, value]
                        : currentValues.filter(v => v !== value);
                      field.onChange(newSelection);
                    }}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    {cost.cost_type_display || cost.cost_type} (ETB {Number(cost.price).toLocaleString()})
                  </span>
                </label>
              ))}
            </div>
          )}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Additional Cost per Session
        </label>
        <Controller
          name="additionalSessionCosts"
          control={control}
          render={({ field }) => (
            <div className="mt-2 space-y-2">
              {sessionCostsData.map(cost => (
                <label key={cost.cost_type} className="inline-flex items-center mr-4">
                  <input
                    type="checkbox"
                    value={cost.cost_type}
                    checked={field.value?.includes(cost.cost_type)}
                    onChange={(e) => {
                      const value = e.target.value;
                      const currentValues = field.value || [];
                      const newSelection = e.target.checked
                        ? [...currentValues, value]
                        : currentValues.filter(v => v !== value);
                      field.onChange(newSelection);
                    }}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    {cost.cost_type_display || cost.cost_type} (ETB {Number(cost.price).toLocaleString()})
                  </span>
                </label>
              ))}
            </div>
          )}
        />
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
                {landTransportRoutes.map((route) => (
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
                              {transport.origin_name || transport.origin} → {transport.destination_name || transport.destination} (ETB {Number(transport.price).toLocaleString()})
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
                        <label className="block text-xs font-medium text-gray-700">Participants</label>
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
                {airTransportRoutes.map((route) => (
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
                              {transport.origin_name || transport.origin} → {transport.destination_name || transport.destination} (ETB {Number(transport.price).toLocaleString()})
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
                        <label className="block text-xs font-medium text-gray-700">Participants</label>
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
            <span className="text-lg font-medium text-gray-900">Total Budget</span>
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
          This total includes {costMode === 'perdiem' ? 'per diem' : 'accommodation'} costs
          {additionalLocations.length > 0 && ` for ${additionalLocations.length + 1} location(s)`}
          {accommodationsData.length > 0 && costMode === 'accommodation' ? ' (from database)' : ''}
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

export default MeetingWorkshopCostingTool;