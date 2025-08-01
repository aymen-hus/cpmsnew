import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Calculator, DollarSign, Info, Plus, Trash2, AlertCircle } from 'lucide-react';
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

interface MeetingWorkshopLocation {
  locationId: string;
  days: number;
  participants: number;
}

interface MeetingWorkshopCostingToolProps {
  activityType: 'Meeting' | 'Workshop';
  onCalculate: (costs: MeetingWorkshopCost) => void;
  onCancel: () => void;
  initialData?: MeetingWorkshopCost | null;
}

const MeetingWorkshopCostingTool: React.FC<MeetingWorkshopCostingToolProps> = ({ 
  activityType,
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
  const [additionalLocations, setAdditionalLocations] = useState<MeetingWorkshopLocation[]>([]);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
  
  console.log('MeetingWorkshopCostingTool received initialData:', initialData);
  
  const { register, watch, control, setValue, handleSubmit, formState: { errors }, trigger, getValues } = useForm<MeetingWorkshopCost>({
    defaultValues: {
      description: initialData?.description || '',
      numberOfDays: initialData?.numberOfDays || 1,
      numberOfParticipants: initialData?.numberOfParticipants || 1,
      numberOfSessions: initialData?.numberOfSessions || 1,
      location: initialData?.location || '',
      additionalParticipantCosts: initialData?.additionalParticipantCosts || [],
      additionalSessionCosts: initialData?.additionalSessionCosts || [],
      transportRequired: initialData?.transportRequired || false,
      landTransportParticipants: initialData?.landTransportParticipants || 0,
      airTransportParticipants: initialData?.airTransportParticipants || 0,
      otherCosts: initialData?.otherCosts || 0,
      justification: initialData?.justification || '',
      totalBudget: initialData?.totalBudget || 0
    }
  });

  // Initialize state from initialData
  useEffect(() => {
    if (initialData) {
      console.log('Initializing MeetingWorkshopCostingTool with data:', initialData);
      
      // Set transport routes if they exist
      if (initialData.landTransportRoutes && Array.isArray(initialData.landTransportRoutes)) {
        setLandTransportRoutes(initialData.landTransportRoutes);
      }
      
      if (initialData.airTransportRoutes && Array.isArray(initialData.airTransportRoutes)) {
        setAirTransportRoutes(initialData.airTransportRoutes);
      }
      
      // Set additional locations if they exist
      if (initialData.meetings && Array.isArray(initialData.meetings)) {
        setAdditionalLocations(initialData.meetings);
      } else if (initialData.workshops && Array.isArray(initialData.workshops)) {
        setAdditionalLocations(initialData.workshops);
      }
      
      // Set form values
      setValue('description', initialData.description || '');
      setValue('numberOfDays', initialData.numberOfDays || 1);
      setValue('numberOfParticipants', initialData.numberOfParticipants || 1);
      setValue('numberOfSessions', initialData.numberOfSessions || 1);
      setValue('location', initialData.location || '');
      setValue('additionalParticipantCosts', initialData.additionalParticipantCosts || []);
      setValue('additionalSessionCosts', initialData.additionalSessionCosts || []);
      setValue('transportRequired', initialData.transportRequired || false);
      setValue('landTransportParticipants', initialData.landTransportParticipants || 0);
      setValue('airTransportParticipants', initialData.airTransportParticipants || 0);
      setValue('otherCosts', initialData.otherCosts || 0);
      setValue('justification', initialData.justification || '');
      setValue('totalBudget', initialData.totalBudget || 0);
    }
  }, [initialData, setValue]);

  const watchTransportRequired = watch('transportRequired');
  const watchLocation = watch('location');
  const watchDays = watch('numberOfDays');
  const watchParticipants = watch('numberOfParticipants');
  const watchSessions = watch('numberOfSessions');
  const watchParticipantCosts = watch('additionalParticipantCosts');
  const watchSessionCosts = watch('additionalSessionCosts');
  const watchLandTransport = watch('landTransportParticipants');
  const watchAirTransport = watch('airTransportParticipants');
  const watchOtherCosts = watch('otherCosts');

  // Get API base URL
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || '';
    setApiBaseUrl(apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl);
    console.log('API Base URL for meeting/workshop tool:', apiUrl);
  }, []);
  
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
        
        // Process and set the remaining data
        setPerDiemsData(perDiemsResult?.data || []);
        setAccommodationsData(accommodationsResult?.data || []);
        setParticipantCostsData(participantCostsResult?.data || []);
        setSessionCostsData(sessionCostsResult?.data || []);
        setLandTransportsData(landTransportsResult?.data || []);
        setAirTransportsData(airTransportsResult?.data || []);
        
        console.log('All costing data loaded successfully:', {
          locations: locationsData.length,
          perDiems: perDiemsResult?.data?.length || 0,
          accommodations: accommodationsResult?.data?.length || 0,
          participantCosts: participantCostsResult?.data?.length || 0,
          sessionCosts: sessionCostsResult?.data?.length || 0,
          landTransports: landTransportsResult?.data?.length || 0,
          airTransports: airTransportsResult?.data?.length || 0
        });
        
        // Set default location if available and not already set
        if (locationsData.length > 0 && !initialData?.location) {
          console.log('Setting default location:', locationsData[0].id);
          setValue('location', locationsData[0].id);
        }
        
      } catch (error) {
        console.error('Error fetching meeting/workshop costing data:', error);
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
  const addMeetingWorkshopLocation = () => {
    if (!locationsData.length) return;
    
    const newLocation: MeetingWorkshopLocation = {
      locationId: locationsData[0]?.id || '',
      days: 1,
      participants: 1
    };
    
    setAdditionalLocations([...additionalLocations, newLocation]);
  };
  
  const removeMeetingWorkshopLocation = (index: number) => {
    const newLocations = [...additionalLocations];
    newLocations.splice(index, 1);
    setAdditionalLocations(newLocations);
  };
  
  const updateMeetingWorkshopLocation = (index: number, field: keyof MeetingWorkshopLocation, value: any) => {
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
        // If changing transport selection, update price from database
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
  
  // Calculate average transport costs
  const calculateAvgLandTransportCost = () => {
    if (!landTransportsData || landTransportsData.length === 0) return 1000;
    return 1000;
  };

  const calculateAvgAirTransportCost = () => {
    if (!airTransportsData || airTransportsData.length === 0) return 5000;
    return 5000;
  };

  const avgLandTransportCost = calculateAvgLandTransportCost();
  const avgAirTransportCost = calculateAvgAirTransportCost();

  const watchTransportRequired = watch('transportRequired');
  const watchLocation = watch('location');
  const watchDays = watch('numberOfDays');
  const watchParticipants = watch('numberOfParticipants');
  const watchSessions = watch('numberOfSessions');
  const watchParticipantCosts = watch('additionalParticipantCosts');
  const watchSessionCosts = watch('additionalSessionCosts');
  const watchLandTransport = watch('landTransportParticipants');
  const watchAirTransport = watch('airTransportParticipants');
  const watchOtherCosts = watch('otherCosts');

  // Get API base URL
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || '';
    setApiBaseUrl(apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl);
    console.log('API Base URL for meeting/workshop tool:', apiUrl);
  }, []);
  
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
        
        // Process and set the remaining data
        setPerDiemsData(perDiemsResult?.data || []);
        setAccommodationsData(accommodationsResult?.data || []);
        setParticipantCostsData(participantCostsResult?.data || []);
        setSessionCostsData(sessionCostsResult?.data || []);
        setLandTransportsData(landTransportsResult?.data || []);
        setAirTransportsData(airTransportsResult?.data || []);
        
        console.log('All costing data loaded successfully:', {
          locations: locationsData.length,
          perDiems: perDiemsResult?.data?.length || 0,
          accommodations: accommodationsResult?.data?.length || 0,
          participantCosts: participantCostsResult?.data?.length || 0,
          sessionCosts: sessionCostsResult?.data?.length || 0,
          landTransports: landTransportsResult?.data?.length || 0,
          airTransports: airTransportsResult?.data?.length || 0
        });
        
        // Set default location if available and not already set
        if (locationsData.length > 0 && !initialData?.location) {
          console.log('Setting default location:', locationsData[0].id);
          setValue('location', locationsData[0].id);
        }
        
      } catch (error) {
        console.error('Error fetching meeting/workshop costing data:', error);
        let errorMessage = 'Failed to load location data from the database. ';
        
        if (error.message) {
          errorMessage += error.message;
        }
        
        if (error.response?.status) {
          errorMessage += ` (Status: ${error.response.status})`;
        }
        
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [setValue, initialData]);

  useEffect(() => {
    const calculateTotalBudget = () => {
      const locationId = watchLocation;
      const days = watchDays || 0;
      const participants = watchParticipants || 0;
      const numSessions = Number(watchSessions) || 1;
      
      // Get location data
      const location = locationsData.find(loc => String(loc.id) === String(locationId));
      if (!location) {
        setValue('totalBudget', 0);
        return 0;
      }
      
      // Hall with refreshment calculation (for meetings/workshops)
      let accommodationTotal = 0;
      const accommodation = accommodationsData.find(acc => 
        (String(acc.location_id) === String(locationId) || 
         String(acc.location) === String(locationId)) && 
        acc.service_type === 'HALL_REFRESHMENT'
      );
      
      if (accommodation) {
        accommodationTotal = Number(accommodation.price) * participants * days;
        
        // Add accommodation for additional locations
        additionalLocations.forEach(loc => {
          if (!loc.locationId) return;
          
          const additionalAccommodation = accommodationsData.find(acc => 
            (String(acc.location_id) === String(loc.locationId) || 
             String(acc.location) === String(loc.locationId)) && 
            acc.service_type === 'HALL_REFRESHMENT'
          );
          
          if (additionalAccommodation) {
            accommodationTotal += Number(additionalAccommodation.price) * loc.participants * loc.days;
          }
        });
      }
      
      // Participant costs
      let participantCostsTotal = 0;
      if (watchParticipantCosts) {
        if (watchParticipantCosts.includes('ALL')) {
          const allCosts = participantCostsData
            .filter(cost => cost.cost_type !== 'ALL')
            .reduce((sum, cost) => sum + Number(cost.price || 0), 0);
          
          participantCostsTotal = participants * allCosts;
          
          additionalLocations.forEach(loc => {
            if (!loc.locationId) return;
            participantCostsTotal += loc.participants * allCosts;
          });
        } else {
          watchParticipantCosts.forEach(cost => {
            const costItem = participantCostsData.find(c => c.cost_type === cost);
            if (costItem) {
              participantCostsTotal += participants * Number(costItem.price || 0);
              
              additionalLocations.forEach(loc => {
                if (!loc.locationId) return;
                participantCostsTotal += loc.participants * Number(costItem.price || 0);
              });
            }
          });
        }
      }
      
      // Session costs
      let sessionCostsTotal = 0;
      if (watchSessionCosts) {
        if (watchSessionCosts.includes('ALL')) {
          const allCosts = sessionCostsData
            .filter(cost => cost.cost_type !== 'ALL')
            .reduce((sum, cost) => sum + Number(cost.price || 0), 0);
          
          sessionCostsTotal = numSessions * allCosts;
        } else {
          watchSessionCosts.forEach(cost => {
            const costItem = sessionCostsData.find(c => c.cost_type === cost);
            if (costItem) {
              sessionCostsTotal += numSessions * Number(costItem.price || 0);
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
          const landParticipants = Number(watchLandTransport) || 0;
          const airParticipants = Number(watchAirTransport) || 0;
          transportTotal = (landParticipants * avgLandTransportCost) + 
                           (airParticipants * avgAirTransportCost);
        }
      }
      
      // Other costs
      const otherCostsTotal = Number(watchOtherCosts) || 0;
      
      // Calculate total
      const total = accommodationTotal + participantCostsTotal + sessionCostsTotal + 
                    transportTotal + otherCostsTotal;
      
      setValue('totalBudget', total);
      return total;
    };

    calculateTotalBudget();
  }, [
    watchLocation, watchDays, watchParticipants, watchSessions, watchTransportRequired,
    watchLandTransport, watchAirTransport, watchParticipantCosts, watchSessionCosts,
    watchOtherCosts, setValue, locationsData, perDiemsData, accommodationsData,
    participantCostsData, sessionCostsData,
    additionalLocations, landTransportRoutes, airTransportRoutes
  ]);

  const handleFormSubmit = async (data: MeetingWorkshopCost) => {
    try {
      setIsCalculating(true);
      setError(null);
      
      const calculatedBudget = watch('totalBudget') || 0;
      
      console.log(`${activityType} calculated budget:`, calculatedBudget);
      
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
        
        // Validate transport participants
        const totalTransportParticipants = landParticipantsTotal + airParticipantsTotal;
        let totalParticipants = Number(watchParticipants) || 0;
        
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
        activity_type: activityType,
        estimated_cost_with_tool: calculatedBudget || 0,
        totalBudget: calculatedBudget || 0,
        estimated_cost: calculatedBudget || 0,
        estimated_cost_without_tool: 0,
        government_treasury: 0,
        sdg_funding: 0,
        partners_funding: 0,
        other_funding: 0,
        meeting_workshop_details: {
          description: data.description,
          numberOfDays: Number(data.numberOfDays) || 0,
          numberOfParticipants: Number(data.numberOfParticipants) || 0,
          numberOfSessions: Number(data.numberOfSessions) || 0,
          location: data.location,
          meetings: activityType === 'Meeting' ? additionalLocations.map(loc => ({
            locationId: loc.locationId,
            days: Number(loc.days) || 0,
            participants: Number(loc.participants) || 0
          })) : undefined,
          workshops: activityType === 'Workshop' ? additionalLocations.map(loc => ({
            locationId: loc.locationId,
            days: Number(loc.days) || 0,
            participants: Number(loc.participants) || 0
          })) : undefined,
          additionalParticipantCosts: data.additionalParticipantCosts,
          additionalSessionCosts: data.additionalSessionCosts,
          transportRequired: data.transportRequired,
          transportCosts: transportCosts,
          landTransportRoutes: landTransportRoutes,
          airTransportRoutes: airTransportRoutes,
          otherCosts: Number(data.otherCosts) || 0,
          justification: data.justification
        }
      };
      
      onCalculate(budgetData);
    } catch (err: any) {
      console.error(`Failed to process ${activityType.toLowerCase()} costs:`, err);
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
            {activityType} Cost Calculator
          </h3>
          <p className="text-sm text-blue-600">
            Fill in the {activityType.toLowerCase()} details below to calculate the total budget.
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
          Description of {activityType} Activity
        </label>
        <textarea
          {...register('description', { required: 'Description is required' })}
          rows={3}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder={`Describe the ${activityType.toLowerCase()} activity...`}
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
            Number of times this {activityType.toLowerCase()} will occur
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
      
      <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {activityType} Location <span className="text-red-500">*</span>
          </label>
          <select
            {...register('location', { required: 'Location is required' })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {locationsData.map(location => (
              <option key={location.id} value={location.id}>
                {location.name} ({location.region}{location.is_hardship_area ? ' - Hardship' : ''})
              </option>
            ))}
          </select>
          {errors.location && (
            <p className="mt-1 text-sm text-red-600">{errors.location.message}</p>
          )}
        </div>
      </div>
        
      {/* Additional Locations */}
      <div className="mt-4">
        <div className="flex justify-between items-center mb-4">
          <label className="block text-sm font-medium text-gray-700">
            Additional {activityType} Locations (optional)
          </label>
          <button
            type="button"
            onClick={addMeetingWorkshopLocation}
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
                    onChange={(e) => updateMeetingWorkshopLocation(index, 'locationId', e.target.value)}
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
                    onChange={(e) => updateMeetingWorkshopLocation(index, 'days', Number(e.target.value))}
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
                    onChange={(e) => updateMeetingWorkshopLocation(index, 'participants', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeMeetingWorkshopLocation(index)}
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
            <span className="text-lg font-medium text-gray-900">Total {activityType} Budget</span>
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
          This total includes hall with refreshment costs
          {additionalLocations.length > 0 && ` for ${additionalLocations.length + 1} location(s)`}
          {participantCostsData.length > 0 ? ' (from database)' : ''}
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