import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Calculator, DollarSign, Info, AlertCircle, Plus, Trash2 } from 'lucide-react';
import type { MeetingWorkshopCost, TrainingLocation } from '../types/costing';
import { locations, perDiems, accommodations, participantCosts, sessionCosts, landTransports, airTransports } from '../lib/api';

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

interface MeetingLocation {
  locationId: string;
  days: number;
  participants: number;
}

interface MeetingWorkshopCostingToolProps {
  onCalculate: (costs: MeetingWorkshopCost) => void;
  onCancel: () => void;
  initialData?: MeetingWorkshopCost;
}

const MeetingWorkshopCostingTool: React.FC<MeetingWorkshopCostingToolProps> = ({ 
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
  const [isLoading, setIsLoading] = useState(true);
  const [landTransportRoutes, setLandTransportRoutes] = useState<TransportRoute[]>([]);
  const [airTransportRoutes, setAirTransportRoutes] = useState<TransportRoute[]>([]);
  const [additionalLocations, setAdditionalLocations] = useState<MeetingLocation[]>([]);
  const [partners, setPartners] = useState<{name: string, amount: number}[]>([]);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
  
  const { register, watch, control, setValue, handleSubmit, formState: { errors }, trigger, getValues } = useForm<MeetingWorkshopCost>({
    defaultValues: initialData || {
      description: '',
      numberOfDays: 1,
      numberOfParticipants: 1,
      numberOfSessions: 1,
      meetingLocation: '',
      costMode: 'perdiem',
      additionalParticipantCosts: [],
      additionalSessionCosts: [],
      transportRequired: false,
      landTransportParticipants: 0,
      airTransportParticipants: 0,
      otherCosts: 0
    }
  });

  const watchTransportRequired = watch('transportRequired');
  const watchLocation = watch('meetingLocation');
  const watchDays = watch('numberOfDays');
  const watchParticipants = watch('numberOfParticipants');
  const watchSessions = watch('numberOfSessions');
  const watchCostMode = watch('costMode');
  const watchParticipantCosts = watch('additionalParticipantCosts');
  const watchSessionCosts = watch('additionalSessionCosts');
  const watchLandTransport = watch('landTransportParticipants');
  const watchAirTransport = watch('airTransportParticipants');
  const watchOtherCosts = watch('otherCosts');

  // Watch all form values for calculation triggers
  const watchedValues = watch();

  // Get API base URL
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || '';
    setApiBaseUrl(apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl);
    console.log('API Base URL for meeting/workshop tool:', apiUrl);
  }, []);

  // Initialize partners
  useEffect(() => {
    // Load partners from initial data if available
    if (initialData?.partners_list && Array.isArray(initialData.partners_list)) {
      const validPartners = initialData.partners_list.filter(partner => 
        partner.name && partner.name.trim() !== ''
      );
      if (validPartners.length > 0) {
        setPartners(validPartners);
        return;
      }
    }

    // Default partners
    setPartners([
      { name: 'WHO', amount: 0 },
      { name: 'UNICEF', amount: 0 },
      { name: 'USAID', amount: 0 },
      { name: 'World Bank', amount: 0 },
      { name: 'Other Partners', amount: 0 }
    ]);
  }, [initialData]);

  // Initialize additional locations from saved data
  useEffect(() => {
    if (initialData?.additionalLocations && Array.isArray(initialData.additionalLocations)) {
      setAdditionalLocations(initialData.additionalLocations);
    }
  }, [initialData]);

  // Initialize transport routes from saved data
  useEffect(() => {
    if (initialData?.landTransportRoutes && Array.isArray(initialData.landTransportRoutes)) {
      setLandTransportRoutes(initialData.landTransportRoutes);
    }
    if (initialData?.airTransportRoutes && Array.isArray(initialData.airTransportRoutes)) {
      setAirTransportRoutes(initialData.airTransportRoutes);
    }
  }, [initialData]);
  
  // Fetch all required data from the database
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      console.log('Fetching meeting/workshop costing data...');
      
      try {
        // Fetch all data using the API service functions
        const [
          locationsResult
        ] = await Promise.all([
          locations.getAll()
        ]);

        // Check if locations data is valid
        if (!locationsResult?.data || !Array.isArray(locationsResult.data)) {
          console.error('Invalid locations data received in MeetingWorkshopCostingTool:', 
            locationsResult?.data ? typeof locationsResult.data : 'no data');
          console.log('Using fallback location data');
          setLocationsData(FALLBACK_LOCATIONS);
        } else {
          const locationsData = locationsResult?.data || [];
          console.log(`Successfully loaded ${locationsData.length} locations`);
          setLocationsData(locationsData);
        }
        
        console.log('Fetching other costing data...');
        
        // Fetch other data after locations are loaded successfully
        const [
          perDiemsResult,
          accommodationsResult,
          participantCostsResult,
          sessionCostsResult,
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
        setPerDiemsData(perDiemsResult?.data || []);
        setAccommodationsData(accommodationsResult?.data || []);
        setParticipantCostsData(participantCostsResult?.data || []);
        setSessionCostsData(sessionCostsResult?.data || []);
        setLandTransportsData(landTransportsResult?.data || []);
        setAirTransportsData(airTransportsResult?.data || []);
        
        // Set default cost mode if not set
        if (!initialData?.costMode) {
          setValue('costMode', 'perdiem');
        }
        
        console.log('All costing data loaded successfully:', {
          locations: locationsData.length,
          perDiems: perDiemsResult?.data?.length || 0,
          accommodations: accommodationsResult?.data?.length || 0,
          participantCosts: participantCostsResult?.data?.length || 0,
          sessionCosts: sessionCostsResult?.data?.length || 0,
          landTransports: landTransportsResult?.data?.length || 0,
          airTransports: airTransportsResult?.data?.length || 0
        });
        
        // Set default location if available
        if (locationsData.length > 0 && !initialData?.meetingLocation) {
          console.log('Setting default location:', locationsData[0].id);
          setValue('meetingLocation', locationsData[0].id);
        }
        
      } catch (error) {
        console.error('Error fetching meeting/workshop costing data:', error);
        setError('Failed to load costing data from the database. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [setValue, initialData]);

  // Add/remove/update functions for additional locations
  const addMeetingLocation = () => {
    if (!locationsData.length) return;
    
    const newLocation: MeetingLocation = {
      locationId: locationsData[0]?.id || '',
      days: 1,
      participants: 1
    };
    
    setAdditionalLocations([...additionalLocations, newLocation]);
  };
  
  const removeMeetingLocation = (index: number) => {
    const newLocations = [...additionalLocations];
    newLocations.splice(index, 1);
    setAdditionalLocations(newLocations);
  };
  
  const updateMeetingLocation = (index: number, field: keyof MeetingLocation, value: any) => {
    const newLocations = [...additionalLocations];
    newLocations[index] = {
      ...newLocations[index],
      [field]: value
    };
    setAdditionalLocations(newLocations);
  };

  // Transport route management functions
  const addLandTransportRoute = () => {
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
        if (field === 'transportId') {
          const selectedTransport = landTransportsData.find(t => t.id === value);
          if (selectedTransport) {
            const dbPrice = Number(selectedTransport.price) || 0;
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
            const dbPrice = Number(selectedTransport.price) || 0;
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
        return { ...route, [field]: value };
      }
      return route;
    }));
  };

  // Re-validate transport participants when total participants changes
  useEffect(() => {
    if (watchTransportRequired) {
      trigger(['landTransportParticipants', 'airTransportParticipants']);
    }
  }, [watchParticipants, trigger, watchTransportRequired]);

  // Main calculation effect - triggers on any form field change
  useEffect(() => {
    const calculateTotalBudget = () => {
      console.log('=== Calculating Meeting/Workshop Budget ===');
      const locationId = watchLocation;
      const days = watchDays || 0;
      const participants = watchParticipants || 0;
      const sessions = watchSessions || 0;
      const costMode = watchCostMode || 'perdiem';
      
      console.log('Form values:', {
        locationId, days, participants, sessions, costMode,
        participantCosts: watchParticipantCosts,
        sessionCosts: watchSessionCosts,
        transportRequired: watchTransportRequired,
        otherCosts: watchOtherCosts
      });
      
      // Get location data
      const location = locationsData.find(loc => String(loc.id) === String(locationId));
      if (!location) {
        console.log('No location found, setting budget to 0');
        setValue('totalBudget', 0);
        return 0;
      }
      
      console.log('Using location:', location.name);
      
      // Calculate base cost (per diem or accommodation)
      let baseCost = 0;
      
      if (costMode === 'perdiem') {
        // Per diem calculation
        const perDiem = perDiemsData.find(pd => 
          String(pd.location_id) === String(locationId) || 
          String(pd.location) === String(locationId)
        );
        
        if (perDiem) {
          const perDiemAmount = Number(perDiem.amount) || 0;
          const hardshipAmount = Number(perDiem.hardship_allowance_amount) || 0;
          baseCost = (perDiemAmount + hardshipAmount) * participants * days;
          console.log('Per diem calculation:', {
            perDiemAmount, hardshipAmount, participants, days, baseCost
          });
        }
      } else if (costMode === 'accommodation') {
        // Accommodation calculation - need to get selected accommodation type
        const selectedAccommodationType = watch('accommodationType') || 'FULL_BOARD';
        const accommodation = accommodationsData.find(acc => 
          (String(acc.location_id) === String(locationId) || 
           String(acc.location) === String(locationId)) && 
          acc.service_type === selectedAccommodationType
        );
        
        if (accommodation) {
          baseCost = Number(accommodation.price) * participants * days;
          console.log('Accommodation calculation:', {
            accommodationType: selectedAccommodationType,
            price: accommodation.price,
            participants, days, baseCost
          });
        }
      }
      
      console.log('Base cost (per diem/accommodation):', baseCost);
      
      // Additional locations cost
      let additionalLocationsCost = 0;
      additionalLocations.forEach(loc => {
        if (!loc.locationId) return;
        
        const additionalPerDiem = perDiemsData.find(pd => 
          String(pd.location_id) === String(loc.locationId) || 
          String(pd.location) === String(loc.locationId)
        );
        
        if (additionalPerDiem) {
          const addPerDiemAmount = Number(additionalPerDiem.amount || 0);
          const addHardshipAmount = Number(additionalPerDiem.hardship_allowance_amount || 0);
          additionalLocationsCost += (addPerDiemAmount + addHardshipAmount) * loc.participants * loc.days;
          console.log(`Additional location ${loc.locationId}: ${additionalLocationsCost}`);
        }
      });
      
      console.log('Additional locations cost:', additionalLocationsCost);
      
      // Participant costs calculation
      let participantCostsTotal = 0;
      if (watchParticipantCosts && watchParticipantCosts.length > 0) {
        let totalParticipants = participants;
        // Add participants from additional locations
        additionalLocations.forEach(loc => {
          totalParticipants += Number(loc.participants) || 0;
        });
        
        let participantCostPerPerson = 0;
        watchParticipantCosts.forEach(cost => {
          const costItem = participantCostsData.find(c => c.cost_type === cost);
          if (costItem) {
            participantCostPerPerson += Number(costItem.price || 0);
          }
        });
        
        participantCostsTotal = totalParticipants * participantCostPerPerson;
        console.log('Participant costs calculation:', {
          totalParticipants, participantCostPerPerson, participantCostsTotal
        });
      }
      
      console.log('Participant costs total:', participantCostsTotal);
      
      // Session costs calculation
      let sessionCostsTotal = 0;
      if (watchSessionCosts && watchSessionCosts.length > 0) {
        let sessionCostPerSession = 0;
        watchSessionCosts.forEach(cost => {
          const costItem = sessionCostsData.find(c => c.cost_type === cost);
          if (costItem) {
            sessionCostPerSession += Number(costItem.price || 0);
          }
        });
        
        sessionCostsTotal = sessions * sessionCostPerSession;
        console.log('Session costs calculation:', {
          sessions, sessionCostPerSession, sessionCostsTotal
        });
      }
      
      console.log('Session costs total:', sessionCostsTotal);
      
      // Transport costs
      let transportTotal = 0;
      if (watchTransportRequired) {
        // Calculate from routes
        landTransportRoutes.forEach(route => {
          const routeCost = Number(route.price || 0) * Number(route.participants || 1);
          transportTotal += routeCost;
          console.log(`Land transport route: ${route.participants} × ${route.price} = ${routeCost}`);
        });
        
        airTransportRoutes.forEach(route => {
          const routeCost = Number(route.price || 0) * Number(route.participants || 1);
          transportTotal += routeCost;
          console.log(`Air transport route: ${route.participants} × ${route.price} = ${routeCost}`);
        });
        
        // Include legacy fields for backward compatibility
        console.log('Transport costs calculation:', {
          landRoutes: landTransportRoutes.length,
          airRoutes: airTransportRoutes.length,
          transportTotal
        });
      }
      
      console.log('Transport total:', transportTotal);
      
      // Partners costs
      let partnersCostsTotal = 0;
      partners.forEach(partner => {
        partnersCostsTotal += Number(partner.amount) || 0;
      });
      
      console.log('Partners costs total:', partnersCostsTotal);
      
      // Other costs
      const otherCostsTotal = Number(watchOtherCosts) || 0;
      console.log('Other costs total:', otherCostsTotal);
      
      // Calculate subtotal first
      const subtotal = baseCost + additionalLocationsCost + participantCostsTotal + 
                      sessionCostsTotal + transportTotal + partnersCostsTotal + otherCostsTotal;
      
      console.log('Subtotal before sessions multiplier:', subtotal);
      
      // Apply session multiplier to entire subtotal
      // Sessions represent how many times the entire meeting/workshop occurs
      const total = subtotal * (sessions || 1);
      
      console.log('Final total (subtotal × sessions):', total);
      
      setValue('totalBudget', total);
      return total;
    };

    calculateTotalBudget();
  }, [
    // Watch all form values that affect calculation
    watchedValues,
    additionalLocations,
    landTransportRoutes, 
    airTransportRoutes,
    partners,
    // Also watch the loaded data
    locationsData,
    perDiemsData,
    accommodationsData,
    participantCostsData,
    sessionCostsData,
    setValue
  ]);

  const handleFormSubmit = async (data: MeetingWorkshopCost) => {
    try {
      setIsCalculating(true);
      setError(null);
      
      // Make sure we have a valid budget amount
      const calculatedBudget = watch('totalBudget') || 0;
      
      console.log('Meeting/Workshop calculated budget:', calculatedBudget);
      
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
        // Count participants and costs from routes
        let landParticipantsTotal = 0;
        let landCostTotal = 0;
        
        landTransportRoutes.forEach(route => {
          landParticipantsTotal += Number(route.participants || 1);
          landCostTotal += Number(route.price || 0) * Number(route.participants || 1);
        });
        
        let airParticipantsTotal = 0;
        let airCostTotal = 0;
        
        airTransportRoutes.forEach(route => {
          airParticipantsTotal += Number(route.participants || 1);
          airCostTotal += Number(route.price || 0) * Number(route.participants || 1);
        });
        
        // Add legacy transport if routes are empty
        if (landTransportRoutes.length === 0 && Number(data.landTransportParticipants) > 0) {
          landParticipantsTotal = Number(data.landTransportParticipants);
          landCostTotal = landParticipantsTotal * 1000; // Default cost
        }
        
        if (airTransportRoutes.length === 0 && Number(data.airTransportParticipants) > 0) {
          airParticipantsTotal = Number(data.airTransportParticipants);
          airCostTotal = airParticipantsTotal * 5000; // Default cost
        }
        
        transportCosts = {
          landParticipants: landParticipantsTotal,
          airParticipants: airParticipantsTotal,
          totalCost: landCostTotal + airCostTotal
        };
        
        // Validate that total transport participants doesn't exceed total participants
        const totalTransportParticipants = landParticipantsTotal + airParticipantsTotal;
        let totalParticipants = Number(watchParticipants) || 0;
        
        // Add participants from additional locations
        additionalLocations.forEach(loc => {
          totalParticipants += Number(loc.participants) || 0;
        });
        
        if (totalTransportParticipants > totalParticipants) {
          setError(`Total transport participants (${totalTransportParticipants}) cannot exceed total participants (${totalParticipants})`);
          return;
        }
      }
      
      // Prepare streamlined data for the budget form
      const budgetData = {
        activity: data.activity,
        budget_calculation_type: 'WITH_TOOL',
        activity_type: 'Meeting', // Set to Meeting for workshops, can be 'Workshop' too
        estimated_cost_with_tool: calculatedBudget || 0,
        totalBudget: calculatedBudget || 0,
        estimated_cost: calculatedBudget || 0,
        estimated_cost_without_tool: 0,
        government_treasury: 0,
        sdg_funding: 0,
        partners_funding: partners.reduce((sum, partner) => sum + (Number(partner.amount) || 0), 0),
        partners_list: partners, // Store the partners list
        other_funding: 0,
        meeting_workshop_details: {
          description: data.description,
          meetingLocation: data.meetingLocation,
          costMode: data.costMode,
          numberOfDays: Number(data.numberOfDays) || 0,
          numberOfParticipants: Number(data.numberOfParticipants) || 0,
          numberOfSessions: Number(data.numberOfSessions) || 0,
          additionalLocations: additionalLocations.map(loc => ({
            locationId: loc.locationId,
            days: Number(loc.days) || 0,
            participants: Number(loc.participants) || 0
          })),
          additionalParticipantCosts: data.additionalParticipantCosts,
          additionalSessionCosts: data.additionalSessionCosts,
          transportRequired: data.transportRequired,
          transportCosts: transportCosts,
          landTransportRoutes: landTransportRoutes,
          airTransportRoutes: airTransportRoutes,
          otherCosts: Number(data.otherCosts) || 0,
          justification: data.justification,
          partners_list: partners // Also store in details
        }
      };
      
      console.log('Meeting/Workshop budget data to submit:', budgetData);
      
      // Pass the prepared budget data to the parent component
      onCalculate(budgetData);
    } catch (err: any) {
      console.error('Failed to process meeting/workshop costs:', err);
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
            Meeting/Workshop Cost Calculator
          </h3>
          <p className="text-sm text-blue-600">
            Fill in the meeting/workshop details below to calculate the total budget.
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
          Description of Meeting/Workshop Activity
        </label>
        <textarea
          {...register('description', { required: 'Description is required' })}
          rows={3}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Describe the meeting/workshop activity..."
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Cost Method
        </label>
        <div className="mt-2 space-x-4">
          <label className="inline-flex items-center">
            <input
              type="radio"
              value="perdiem"
              {...register('costMode')}
              className="form-radio h-4 w-4 text-blue-600"
            />
            <span className="ml-2 text-sm text-gray-700">Per Diem</span>
          </label>
          <label className="inline-flex items-center">
            <input
              type="radio"
              value="accommodation"
              {...register('costMode')}
              className="form-radio h-4 w-4 text-blue-600"
            />
            <span className="ml-2 text-sm text-gray-700">Accommodation</span>
          </label>
        </div>
      </div>

      {/* Accommodation Type Selection - Only show when accommodation mode is selected */}
      {watchCostMode === 'accommodation' && (
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Accommodation Type
          </label>
          <select
            {...register('accommodationType')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {/* Get accommodation types for the selected location */}
            {watchLocation && accommodationsData
              .filter(acc => 
                String(acc.location_id) === String(watchLocation) || 
                String(acc.location) === String(watchLocation)
              )
              .map(acc => (
                <option key={acc.service_type} value={acc.service_type}>
                  {acc.service_type_display || acc.service_type} - ETB {Number(acc.price).toLocaleString()}
                </option>
              ))
            }
          </select>
          {errors.accommodationType && (
            <p className="mt-1 text-sm text-red-600">{errors.accommodationType.message}</p>
          )}
        </div>
      )}

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
            Number of times this meeting/workshop will occur
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
          />
          {errors.numberOfParticipants && (
            <p className="mt-1 text-sm text-red-600">{errors.numberOfParticipants.message}</p>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Meeting Location <span className="text-red-500">*</span>
          </label>
          <select
            {...register('meetingLocation', { required: 'Location is required' })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Select location...</option>
            {locationsData.map(location => (
              <option key={location.id} value={location.id}>
                {location.name} ({location.region}{location.is_hardship_area ? ' - Hardship' : ''})
              </option>
            ))}
          </select>
          {errors.meetingLocation && (
            <p className="mt-1 text-sm text-red-600">{errors.meetingLocation.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cost Method <span className="text-red-500">*</span>
          </label>
          <select
            {...register('costMode', { required: 'Cost method is required' })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="perdiem">Per Diem</option>
            <option value="accommodation">Accommodation</option>
          </select>
          {errors.costMode && (
            <p className="mt-1 text-sm text-red-600">{errors.costMode.message}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Choose whether to calculate costs based on per diem or accommodation
          </p>
        </div>
      </div>
        
      {/* Additional Locations */}
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
                    Location {index + 2}
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
          Additional Participant Costs
        </label>
        <div className="mt-2 space-y-2">
          {participantCostsData.map(cost => (
            <label key={cost.cost_type} className="inline-flex items-center mr-4">
              <input
                type="checkbox"
                value={cost.cost_type}
                checked={watchParticipantCosts?.includes(cost.cost_type)}
                onChange={(e) => {
                  const value = e.target.value;
                  const currentValues = watchParticipantCosts || [];
                  const newValues = e.target.checked
                    ? [...currentValues, value]
                    : currentValues.filter(v => v !== value);
                  setValue('additionalParticipantCosts', newValues);
                }}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                {cost.cost_type_display || cost.cost_type} (ETB {Number(cost.price).toLocaleString()})
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Additional Session Costs
        </label>
        <div className="mt-2 space-y-2">
          {sessionCostsData.map(cost => (
            <label key={cost.cost_type} className="inline-flex items-center mr-4">
              <input
                type="checkbox"
                value={cost.cost_type}
                checked={watchSessionCosts?.includes(cost.cost_type)}
                onChange={(e) => {
                  const value = e.target.value;
                  const currentValues = watchSessionCosts || [];
                  const newValues = e.target.checked
                    ? [...currentValues, value]
                    : currentValues.filter(v => v !== value);
                  setValue('additionalSessionCosts', newValues);
                }}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                {cost.cost_type_display || cost.cost_type} (ETB {Number(cost.price).toLocaleString()})
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

      {/* Partners funding section */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700 flex items-center">
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
                  <span className="text-gray-500 sm:text-sm">ETB</span>
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
                  className="block w-full pl-12 pr-12 sm:text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
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
            ETB {partners.reduce((sum, partner) => sum + (Number(partner.amount) || 0), 0).toLocaleString()}
          </span>
        </div>
      </div>

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
            <span className="text-lg font-medium text-gray-900">Meeting/Workshop Budget</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-green-600">
              ETB {watch('totalBudget')?.toLocaleString() || '0'}
            </span>
          </div>
        </div>
        
        {/* Debug information for troubleshooting */}
        <div className="mt-3 text-xs text-gray-500 bg-gray-100 p-2 rounded">
          <div>Debug Info:</div>
          <div>Location: {watchLocation}</div>
          <div>Days: {watchDays}</div>
          <div>Participants: {watchParticipants}</div>
          <div>Sessions: {watchSessions}</div>
          <div>Cost Mode: {watchCostMode}</div>
          <div>Accommodation Type: {watch('accommodationType')}</div>
          <div>Transport Required: {watchTransportRequired ? 'Yes' : 'No'}</div>
          <div>Partners Count: {partners.length}</div>
          <div>Other Costs: {watchOtherCosts}</div>
        </div>
        
        <p className="mt-2 text-sm text-gray-500 flex items-center">
          <Info className="h-4 w-4 mr-1" />
          This total includes all meeting/workshop costs
          {additionalLocations.length > 0 && ` for ${additionalLocations.length + 1} location(s)`}
          {watchCostMode === 'accommodation' && ' using accommodation rates'}
          {watchCostMode === 'perdiem' && ' using per diem rates'}
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