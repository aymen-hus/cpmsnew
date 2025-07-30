import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Calendar, Building2, User, FileType, Target, Plus, Edit, AlertCircle, CheckCircle, Info, Loader, ArrowRight, Save, Eye, Users, Clock, RefreshCw } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { organizations, plans, auth, api } from '../lib/api';
import { format } from 'date-fns';
import type { Organization } from '../types/organization';
import { isTeamDeskPlanner } from '../types/user';

// Team/Desk Planning specific API functions
const teamDeskPlanAPI = {
  getApprovedLeoEoPlans: async (organizationId: number) => {
    try {
      const response = await api.get(`/plans/`, {
        params: {
          organization: organizationId,
          status: 'APPROVED',
          type: 'LEO/EO Plan',
          _sort: 'approved_at:DESC'
        }
      });
      const plans = response.data.results || response.data;
      console.log('Fetched approved plans:', plans); // Debug log
      return Array.isArray(plans) ? plans : [];
    } catch (error) {
      console.error('Error fetching approved plans:', error);
      throw error;
    }
  },
  
  getTeamDeskOrganizations: async (userOrgIds: number[]) => {
    const response = await api.get(`/organizations/?id__in=${userOrgIds.join(',')}`);
    return response.data.results || response.data;
  },
  
  createTeamDeskPlan: async (data: any) => {
    const response = await api.post('/team-desk-plans/', data);
    return response.data;
  },
  
  getDetailActivities: async (mainActivityId: string) => {
    const response = await api.get(`/detail-activities/?main_activity=${mainActivityId}`);
    return response.data.results || response.data;
  },
  
  createDetailActivity: async (data: any) => {
    const response = await api.post('/detail-activities/', data);
    return response.data;
  },
  
  updateDetailActivity: async (id: string, data: any) => {
    const response = await api.patch(`/detail-activities/${id}/`, data);
    return response.data;
  },
  
  submitTeamDeskPlan: async (planId: string) => {
    const response = await api.post(`/team-desk-plans/${planId}/submit/`);
    return response.data;
  }
};

// Safe date formatter with error handling
const formatDateSafe = (dateString: string, formatStr = 'MMM d, yyyy') => {
  try {
    return dateString ? format(new Date(dateString), formatStr) : 'N/A';
  } catch (e) {
    console.error('Date formatting error:', e);
    return 'Invalid date';
  }
};

const TeamDeskPlanning: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Main state
  const [currentStep, setCurrentStep] = useState<'select-team' | 'planning'>('select-team');
  const [selectedTeamDesk, setSelectedTeamDesk] = useState<Organization | null>(null);
  const [selectedLeoEoPlan, setSelectedLeoEoPlan] = useState<any>(null);
  const [selectedMainActivity, setSelectedMainActivity] = useState<any>(null);
  const [showDetailActivityForm, setShowDetailActivityForm] = useState(false);
  const [editingDetailActivity, setEditingDetailActivity] = useState<any>(null);
  
  // User and organization data
  const [userOrgIds, setUserOrgIds] = useState<number[]>([]);
  const [isUserTeamDeskPlanner, setIsUserTeamDeskPlanner] = useState(false);
  const [plannerName, setPlannerName] = useState('');
  const [parentOrgId, setParentOrgId] = useState<number | null>(null);
  
  // Error and loading states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Fetch current user and organization data
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        setIsUserTeamDeskPlanner(isTeamDeskPlanner(authData.userOrganizations));
        
        if (authData.userOrganizations?.length > 0) {
          const orgIds = authData.userOrganizations.map(org => org.organization);
          setUserOrgIds(orgIds);
          
          // Get the first organization with a parent or use the first org
          const orgWithParent = authData.userOrganizations.find(org => org.parent_organization);
          const parentId = orgWithParent?.parent_organization || authData.userOrganizations[0]?.organization;
          setParentOrgId(parentId);
          console.log('Setting parentOrgId:', parentId); // Debug log
          
          setPlannerName(`${authData.user.first_name || ''} ${authData.user.last_name || ''}`.trim() || authData.user.username);
        }
        setIsInitialLoading(false);
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        setError('Failed to load user information. Please refresh the page.');
        setIsInitialLoading(false);
      }
    };
    
    fetchUserData();
  }, [navigate]);

  // Fetch approved LEO/EO plans for the parent organization
  const { 
    data: approvedPlans, 
    isLoading: isLoadingPlans, 
    refetch: refetchPlans,
    error: plansError 
  } = useQuery({
    queryKey: ['approved-leo-eo-plans', parentOrgId],
    queryFn: async () => {
      if (!parentOrgId) {
        console.log('No parentOrgId, skipping fetch');
        return [];
      }
      return await teamDeskPlanAPI.getApprovedLeoEoPlans(parentOrgId);
    },
    enabled: !!parentOrgId,
    select: (data) => {
      if (!Array.isArray(data)) {
        console.error('Expected array but got:', data);
        return [];
      }
      return data.filter(plan => 
        plan.status === 'APPROVED' && 
        plan.type === 'LEO/EO Plan'
      );
    }
  });

  // Debug approved plans
  useEffect(() => {
    console.log('Approved plans:', approvedPlans);
  }, [approvedPlans]);

  // Fetch team/desk organizations that the user belongs to
  const { data: teamDeskOrganizations, isLoading: isLoadingTeams } = useQuery({
    queryKey: ['team-desk-organizations', userOrgIds],
    queryFn: async () => {
      if (!userOrgIds.length) return [];
      return await teamDeskPlanAPI.getTeamDeskOrganizations(userOrgIds);
    },
    enabled: userOrgIds.length > 0
  });

  // Fetch detail activities for selected main activity
  const { data: detailActivities, refetch: refetchDetailActivities } = useQuery({
    queryKey: ['detail-activities', selectedMainActivity?.id],
    queryFn: () => teamDeskPlanAPI.getDetailActivities(selectedMainActivity?.id),
    enabled: !!selectedMainActivity?.id
  });

  // Handle team/desk selection
  const handleSelectTeamDesk = (teamDesk: Organization) => {
    setSelectedTeamDesk(teamDesk);
    
    // Check if there's an approved LEO/EO plan
    if (approvedPlans && approvedPlans.length > 0) {
      // Use the first plan (already sorted by approved_at DESC)
      setSelectedLeoEoPlan(approvedPlans[0]);
      setCurrentStep('planning');
      setError(null);
    } else {
      setError(`No approved LEO/EO plan found for ${teamDesk.parent_name || 'your organization'}. Please contact your administrator.`);
    }
  };

  // Handle main activity selection
  const handleSelectMainActivity = (activity: any) => {
    setSelectedMainActivity(activity);
    setShowDetailActivityForm(false);
    setEditingDetailActivity(null);
  };

  // Handle detail activity creation/editing
  const handleCreateDetailActivity = () => {
    setEditingDetailActivity(null);
    setShowDetailActivityForm(true);
  };

  const handleEditDetailActivity = (activity: any) => {
    setEditingDetailActivity(activity);
    setShowDetailActivityForm(true);
  };

  // Handle detail activity save
  const handleDetailActivitySave = async (data: any) => {
    try {
      const activityData = {
        ...data,
        main_activity: selectedMainActivity.id,
        organization: selectedTeamDesk?.id
      };

      if (editingDetailActivity?.id) {
        await teamDeskPlanAPI.updateDetailActivity(editingDetailActivity.id, activityData);
      } else {
        await teamDeskPlanAPI.createDetailActivity(activityData);
      }

      await refetchDetailActivities();
      setShowDetailActivityForm(false);
      setEditingDetailActivity(null);
      setSuccess('Detail activity saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error: any) {
      console.error('Error saving detail activity:', error);
      setError(error.message || 'Failed to save detail activity');
      setTimeout(() => setError(null), 5000);
    }
  };

  // Check if user has permission to plan
  if (!isUserTeamDeskPlanner) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-yellow-50 rounded-lg border border-yellow-200">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Access Restricted</h3>
          <p className="text-yellow-600">You need Team/Desk planner permissions to access this module.</p>
        </div>
      </div>
    );
  }

  if (isInitialLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-gray-600">Loading user data...</p>
      </div>
    );
  }

  if (!parentOrgId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-yellow-50 rounded-lg border border-yellow-200">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Organization Data Missing</h3>
          <p className="text-yellow-600">Unable to determine your organization. Please contact support.</p>
        </div>
      </div>
    );
  }

  if (isLoadingPlans || isLoadingTeams) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-gray-600">Loading planning data...</p>
        <p className="text-sm text-gray-500">This may take a moment</p>
      </div>
    );
  }

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

      {/* Step 1: Team/Desk Selection */}
      {currentStep === 'select-team' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Select Your Team/Desk</h2>
            
            {/* Check if we have team/desk organizations */}
            {teamDeskOrganizations && teamDeskOrganizations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {teamDeskOrganizations
                  .filter((org: Organization) => org.type === 'TEAM_LEAD' || org.type === 'DESK')
                  .map((teamDesk: Organization) => (
                    <div
                      key={teamDesk.id}
                      onClick={() => handleSelectTeamDesk(teamDesk)}
                      className="bg-white p-4 rounded-lg border-2 border-gray-200 hover:border-blue-500 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center mb-2">
                        <Users className="h-5 w-5 text-blue-600 mr-2" />
                        <h4 className="font-medium text-gray-900">{teamDesk.name}</h4>
                      </div>
                      <p className="text-sm text-gray-500">{teamDesk.type.replace('_', ' ')}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Parent: {teamDesk.parent_name}
                      </p>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center p-8 bg-amber-50 rounded-lg border border-amber-200">
                <Info className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-amber-800 mb-2">No Teams/Desks Assigned</h3>
                <p className="text-amber-600">
                  You don't have any teams or desks assigned to you. Please contact your administrator.
                </p>
              </div>
            )}
          </div>

          {/* Approved Plans Section */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Approved LEO/EO Plans</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => refetchPlans()}
                  className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </button>
                {plansError && (
                  <span className="text-xs text-red-600 flex items-center">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Error loading plans
                  </span>
                )}
              </div>
            </div>

            {approvedPlans && approvedPlans.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plan Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Organization
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Period
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Approved Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {approvedPlans.map((plan: any) => (
                      <tr key={plan.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {plan.name || 'Unnamed Plan'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {plan.organization_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDateSafe(plan.from_date)} - {formatDateSafe(plan.to_date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDateSafe(plan.approved_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            Approved
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center p-8 bg-blue-50 rounded-lg border border-blue-200">
                <Clock className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-blue-800 mb-2">No Approved LEO/EO Plans</h3>
                <p className="text-blue-600">
                  There are currently no approved LEO/EO plans for {selectedTeamDesk?.parent_name || 'your organization'}.
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    onClick={() => refetchPlans()}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Check Again
                  </button>
                  <button
                    onClick={() => setCurrentStep('select-team')}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Select Different Team
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Planning Interface */}
      {currentStep === 'planning' && selectedLeoEoPlan && (
        <div className="space-y-6">
          {/* Planning Header */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-gray-500" />
                    Team/Desk
                  </div>
                </label>
                <div className="mt-1 block w-full px-3 py-2 text-base border border-gray-300 rounded-md bg-gray-50">
                  {selectedTeamDesk?.name}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500" />
                    Planner Name
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
                    Based on LEO/EO Plan
                  </div>
                </label>
                <div className="mt-1 block w-full px-3 py-2 text-base border border-gray-300 rounded-md bg-gray-50">
                  {selectedLeoEoPlan.organization_name} ({formatDateSafe(selectedLeoEoPlan.from_date, 'MMM yyyy')})
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    Planning Period
                  </div>
                </label>
                <div className="mt-1 block w-full px-3 py-2 text-base border border-gray-300 rounded-md bg-gray-50">
                  {formatDateSafe(selectedLeoEoPlan.from_date, 'MMM yyyy')} - {formatDateSafe(selectedLeoEoPlan.to_date, 'MMM yyyy')}
                </div>
              </div>
            </div>
          </div>

          {/* LEO/EO Plan Display (Read-only) */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Approved LEO/EO Plan (Read-only)</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => refetchPlans()}
                  className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh Plans
                </button>
                <button
                  onClick={() => setCurrentStep('select-team')}
                  className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-gray-600 hover:bg-gray-700"
                >
                  <ArrowRight className="h-3 w-3 mr-1" />
                  Select Different Team
                </button>
              </div>
            </div>
            
            {selectedLeoEoPlan.objectives?.map((objective: any) => (
              <div key={objective.id} className="border border-gray-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-gray-900 mb-3">{objective.title}</h4>
                
                {objective.initiatives?.map((initiative: any) => (
                  <div key={initiative.id} className="ml-4 mb-4 border-l-2 border-gray-200 pl-4">
                    <h5 className="font-medium text-gray-800 mb-2">{initiative.name}</h5>
                    
                    {/* Performance Measures */}
                    {initiative.performance_measures?.length > 0 && (
                      <div className="mb-3">
                        <h6 className="text-sm font-medium text-gray-700 mb-2">Performance Measures</h6>
                        {initiative.performance_measures.map((measure: any) => (
                          <div key={measure.id} className="text-sm bg-blue-50 p-2 rounded mb-1">
                            {measure.name} - Weight: {measure.weight}%
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Main Activities */}
                    {initiative.main_activities?.length > 0 && (
                      <div>
                        <h6 className="text-sm font-medium text-gray-700 mb-2">Main Activities</h6>
                        {initiative.main_activities.map((activity: any) => (
                          <div key={activity.id} className="mb-2">
                            <button
                              onClick={() => handleSelectMainActivity(activity)}
                              className={`w-full text-left p-3 rounded border transition-colors ${
                                selectedMainActivity?.id === activity.id
                                  ? 'border-green-500 bg-green-50'
                                  : 'border-gray-200 hover:border-green-300'
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-medium">{activity.name}</span>
                                <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                                  Weight: {activity.weight}%
                                </span>
                              </div>
                              <div className="text-sm text-gray-500 mt-1">
                                Click to add detail activities
                              </div>
                            </button>
                            
                            {/* Detail Activities for this Main Activity */}
                            {selectedMainActivity?.id === activity.id && (
                              <div className="mt-3 ml-4 border-l-2 border-green-200 pl-4">
                                <div className="flex justify-between items-center mb-3">
                                  <h6 className="text-sm font-medium text-gray-700">Detail Activities</h6>
                                  <button
                                    onClick={handleCreateDetailActivity}
                                    className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add Detail Activity
                                  </button>
                                </div>
                                
                                {/* Detail Activities List */}
                                {detailActivities?.map((detailActivity: any) => (
                                  <div key={detailActivity.id} className="bg-gray-50 p-3 rounded border mb-2">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <h6 className="font-medium text-gray-900">{detailActivity.name}</h6>
                                        <div className="text-sm text-gray-500 mt-1">
                                          Weight: {detailActivity.weight}% | 
                                          Target Type: {detailActivity.target_type} |
                                          Annual Target: {detailActivity.annual_target}
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => handleEditDetailActivity(detailActivity)}
                                        className="text-xs text-blue-600 hover:text-blue-800"
                                      >
                                        <Edit className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                
                                {(!detailActivities || detailActivities.length === 0) && (
                                  <div className="text-center p-4 text-gray-500 text-sm">
                                    No detail activities yet. Click "Add Detail Activity" to create one.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail Activity Form Modal */}
      {showDetailActivityForm && selectedMainActivity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingDetailActivity ? 'Edit Detail Activity' : 'Create Detail Activity'}
            </h3>
            <DetailActivityForm
              mainActivity={selectedMainActivity}
              onSubmit={handleDetailActivitySave}
              initialData={editingDetailActivity}
              onCancel={() => {
                setShowDetailActivityForm(false);
                setEditingDetailActivity(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Detail Activity Form Component
interface DetailActivityFormProps {
  mainActivity: any;
  onSubmit: (data: any) => Promise<void>;
  initialData?: any;
  onCancel: () => void;
}

const DetailActivityForm: React.FC<DetailActivityFormProps> = ({
  mainActivity,
  onSubmit,
  initialData,
  onCancel
}) => {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    weight: initialData?.weight || 0,
    baseline: initialData?.baseline || '',
    target_type: initialData?.target_type || 'cumulative',
    q1_target: initialData?.q1_target || 0,
    q2_target: initialData?.q2_target || 0,
    q3_target: initialData?.q3_target || 0,
    q4_target: initialData?.q4_target || 0,
    annual_target: initialData?.annual_target || 0,
    selected_months: initialData?.selected_months || [],
    selected_quarters: initialData?.selected_quarters || []
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(formData);
    } catch (error: any) {
      setError(error.message || 'Failed to save detail activity');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h4 className="text-sm font-medium text-blue-700 mb-2">Main Activity Information</h4>
        <p className="text-blue-600 text-sm">Creating detail activity for: <strong>{mainActivity.name}</strong></p>
        <p className="text-blue-600 text-sm">Main Activity Weight: <strong>{mainActivity.weight}%</strong></p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Detail Activity Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Weight (%) - Max: {mainActivity.weight}%
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max={mainActivity.weight}
            value={formData.weight}
            onChange={(e) => handleInputChange('weight', Number(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Baseline</label>
          <input
            type="text"
            value={formData.baseline}
            onChange={(e) => handleInputChange('baseline', e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Target Type</label>
          <select
            value={formData.target_type}
            onChange={(e) => handleInputChange('target_type', e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="cumulative">Cumulative</option>
            <option value="increasing">Increasing</option>
            <option value="decreasing">Decreasing</option>
            <option value="constant">Constant</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Annual Target</label>
          <input
            type="number"
            step="0.01"
            value={formData.annual_target}
            onChange={(e) => handleInputChange('annual_target', Number(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Q1 Target (Jul-Sep)</label>
          <input
            type="number"
            step="0.01"
            value={formData.q1_target}
            onChange={(e) => handleInputChange('q1_target', Number(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Q2 Target (Oct-Dec)</label>
          <input
            type="number"
            step="0.01"
            value={formData.q2_target}
            onChange={(e) => handleInputChange('q2_target', Number(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Q3 Target (Jan-Mar)</label>
          <input
            type="number"
            step="0.01"
            value={formData.q3_target}
            onChange={(e) => handleInputChange('q3_target', Number(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Q4 Target (Apr-Jun)</label>
          <input
            type="number"
            step="0.01"
            value={formData.q4_target}
            onChange={(e) => handleInputChange('q4_target', Number(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? (
            <span className="flex items-center">
              <Loader className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </span>
          ) : (
            initialData ? 'Update Detail Activity' : 'Create Detail Activity'
          )}
        </button>
      </div>
    </form>
  );
};

export default TeamDeskPlanning;