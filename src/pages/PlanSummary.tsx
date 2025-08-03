import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Building2, 
  User, 
  Calendar, 
  FileSpreadsheet, 
  Target, 
  Activity, 
  DollarSign,
  AlertCircle,
  CheckCircle,
  Loader
} from 'lucide-react';
import { api, auth } from '../lib/api';
import { format } from 'date-fns';
import { isAdmin } from '../types/user';

const PlanSummary: React.FC = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  
  const [error, setError] = useState<string | null>(null);
  const [planData, setPlanData] = useState<any>(null);
  const [isUserAdmin, setIsUserAdmin] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Check admin permissions first
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        const userIsAdmin = isAdmin(authData.userOrganizations);
        setIsUserAdmin(userIsAdmin);
        console.log('User is admin:', userIsAdmin);
      } catch (error) {
        console.error('Failed to check auth:', error);
        setError('Failed to verify authentication');
      } finally {
        setIsLoadingAuth(false);
      }
    };
    
    checkAuth();
  }, [navigate]);

  // Fetch plan data without any restrictions for admins
  const { data: planResponse, isLoading } = useQuery({
    queryKey: ['plan-summary', planId],
    queryFn: async () => {
      if (!planId) throw new Error('Plan ID is required');
      
      console.log('Fetching plan data for admin:', planId);
      
      try {
        // Fetch basic plan data
        const planResponse = await api.get(`/plans/${planId}/`);
        const plan = planResponse.data;
        
        if (!plan) throw new Error('Plan not found');
        
        console.log('Plan fetched:', plan);
        
        // For admins, fetch ALL data without organization restrictions
        const processedPlan = {
          ...plan,
          objectives: [],
          totalBudget: 0,
          totalFunding: 0,
          fundingGap: 0
        };

        // Fetch objectives data
        if (plan.strategic_objective) {
          try {
            const objectiveResponse = await api.get(`/strategic-objectives/${plan.strategic_objective}/`);
            const objective = objectiveResponse.data;
            
            if (objective) {
              // Fetch initiatives for this objective
              const initiativesResponse = await api.get(`/strategic-initiatives/?objective=${plan.strategic_objective}`);
              const initiatives = initiativesResponse.data?.results || initiativesResponse.data || [];
              
              // Process each initiative
              for (const initiative of initiatives) {
                // Fetch performance measures
                try {
                  const measuresResponse = await api.get(`/performance-measures/?initiative=${initiative.id}`);
                  initiative.performance_measures = measuresResponse.data?.results || measuresResponse.data || [];
                } catch (e) {
                  console.warn('Failed to fetch measures for initiative:', initiative.id);
                  initiative.performance_measures = [];
                }
                
                // Fetch main activities
                try {
                  const activitiesResponse = await api.get(`/main-activities/?initiative=${initiative.id}`);
                  initiative.main_activities = activitiesResponse.data?.results || activitiesResponse.data || [];
                  
                  // Fetch budget for each activity
                  for (const activity of initiative.main_activities) {
                    try {
                      const budgetResponse = await api.get(`/activity-budgets/?activity=${activity.id}`);
                      const budgetData = budgetResponse.data?.results?.[0] || budgetResponse.data?.[0];
                      
                      if (budgetData) {
                        activity.budget = budgetData;
                        
                        // Calculate budget totals
                        const estimatedCost = budgetData.budget_calculation_type === 'WITH_TOOL' ? 
                          Number(budgetData.estimated_cost_with_tool || 0) : 
                          Number(budgetData.estimated_cost_without_tool || 0);
                        
                        const totalFunding = Number(budgetData.government_treasury || 0) +
                                           Number(budgetData.sdg_funding || 0) +
                                           Number(budgetData.partners_funding || 0) +
                                           Number(budgetData.other_funding || 0);
                        
                        processedPlan.totalBudget += estimatedCost;
                        processedPlan.totalFunding += totalFunding;
                        processedPlan.fundingGap += Math.max(0, estimatedCost - totalFunding);
                      }
                    } catch (e) {
                      console.warn('Failed to fetch budget for activity:', activity.id);
                    }
                  }
                } catch (e) {
                  console.warn('Failed to fetch activities for initiative:', initiative.id);
                  initiative.main_activities = [];
                }
              }
              
              objective.initiatives = initiatives;
              processedPlan.objectives = [objective];
            }
          } catch (e) {
            console.warn('Failed to fetch objective data:', e);
          }
        }
        
        return processedPlan;
      } catch (error) {
        console.error('Error fetching plan data:', error);
        throw error;
      }
    },
    enabled: !isLoadingAuth && !!planId,
    retry: 2
  });

  // Update plan data when query succeeds
  useEffect(() => {
    if (planResponse) {
      setPlanData(planResponse);
    }
  }, [planResponse]);

  const formatDateSafe = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return 'Invalid date';
    }
  };

  const formatCurrency = (value: any): string => {
    if (!value || value === 'N/A') return '-';
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return '-';
    return `$${numValue.toLocaleString()}`;
  };

  if (isLoadingAuth || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader className="h-10 w-10 text-blue-600 animate-spin mb-4 mx-auto" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Plan Data</h3>
          <p className="text-gray-600">Fetching plan details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-red-50 rounded-lg border border-red-200 max-w-md">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Plan</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/admin')}
            className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
          >
            <ArrowLeft className="h-4 w-4 inline mr-2" />
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!planData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-yellow-50 rounded-lg border border-yellow-200 max-w-md">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Plan Not Found</h3>
          <p className="text-yellow-600 mb-4">The requested plan could not be found.</p>
          <button
            onClick={() => navigate('/admin')}
            className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200"
          >
            <ArrowLeft className="h-4 w-4 inline mr-2" />
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/admin')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-5 w-5 mr-1" />
          Back to Admin Dashboard
        </button>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Plan Summary</h1>
          
          {/* Plan Header Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center">
              <Building2 className="h-4 w-4 text-gray-500 mr-2" />
              <div>
                <p className="text-gray-500">Organization</p>
                <p className="font-medium">{planData.organization_name || 'Unknown Organization'}</p>
              </div>
            </div>
            <div className="flex items-center">
              <User className="h-4 w-4 text-gray-500 mr-2" />
              <div>
                <p className="text-gray-500">Planner</p>
                <p className="font-medium">{planData.planner_name || 'Unknown'}</p>
              </div>
            </div>
            <div className="flex items-center">
              <Calendar className="h-4 w-4 text-gray-500 mr-2" />
              <div>
                <p className="text-gray-500">Period</p>
                <p className="font-medium">
                  {formatDateSafe(planData.from_date)} - {formatDateSafe(planData.to_date)}
                </p>
              </div>
            </div>
            <div className="flex items-center">
              <FileSpreadsheet className="h-4 w-4 text-gray-500 mr-2" />
              <div>
                <p className="text-gray-500">Plan Type</p>
                <p className="font-medium">{planData.type || 'Strategic Plan'}</p>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="mt-4 flex items-center">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              planData.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
              planData.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
              planData.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {planData.status}
            </span>
            {planData.submitted_at && (
              <span className="ml-4 text-sm text-gray-500">
                Submitted: {formatDateSafe(planData.submitted_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Budget Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Budget</p>
              <p className="text-2xl font-semibold text-blue-600">{formatCurrency(planData.totalBudget)}</p>
            </div>
            <DollarSign className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Available Funding</p>
              <p className="text-2xl font-semibold text-green-600">{formatCurrency(planData.totalFunding)}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Funding Gap</p>
              <p className="text-2xl font-semibold text-red-600">{formatCurrency(planData.fundingGap)}</p>
            </div>
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
        </div>
      </div>

      {/* Plan Details Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Plan Details</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-green-600">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Strategic Objective
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Weight
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Strategic Initiative
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Performance Measure/Main Activity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Baseline
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Annual Target
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Budget Required
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Available Funding
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Gap
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {planData.objectives && planData.objectives.length > 0 ? (
                planData.objectives.map((objective: any, objIndex: number) => {
                  const rows: JSX.Element[] = [];
                  const effectiveWeight = objective.planner_weight || objective.weight;
                  
                  if (!objective.initiatives || objective.initiatives.length === 0) {
                    rows.push(
                      <tr key={`obj-${objective.id}-empty`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{objective.title}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{effectiveWeight}%</td>
                        <td className="px-6 py-4 text-sm text-gray-500 italic">No initiatives</td>
                        <td className="px-6 py-4 text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 text-sm text-gray-500">-</td>
                        <td className="px-6 py-4 text-sm text-gray-500">-</td>
                      </tr>
                    );
                  } else {
                    objective.initiatives.forEach((initiative: any, initIndex: number) => {
                      const performanceMeasures = initiative.performance_measures || [];
                      const mainActivities = initiative.main_activities || [];
                      const allItems = [...performanceMeasures, ...mainActivities];
                      
                      if (allItems.length === 0) {
                        rows.push(
                          <tr key={`init-${initiative.id}-empty`} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                              {objIndex === 0 && initIndex === 0 ? objective.title : ''}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {objIndex === 0 && initIndex === 0 ? `${effectiveWeight}%` : ''}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">{initiative.name}</td>
                            <td className="px-6 py-4 text-sm text-gray-500 italic">No measures or activities</td>
                            <td className="px-6 py-4 text-sm text-gray-500">-</td>
                            <td className="px-6 py-4 text-sm text-gray-500">-</td>
                            <td className="px-6 py-4 text-sm text-gray-500">-</td>
                            <td className="px-6 py-4 text-sm text-gray-500">-</td>
                            <td className="px-6 py-4 text-sm text-gray-500">-</td>
                          </tr>
                        );
                      } else {
                        allItems.forEach((item: any, itemIndex: number) => {
                          const isFirstRow = objIndex === 0 && initIndex === 0 && itemIndex === 0;
                          const isFirstInitiativeRow = itemIndex === 0;
                          const isPerformanceMeasure = performanceMeasures.includes(item);
                          
                          // Calculate budget values
                          let budgetRequired = 0;
                          let totalFunding = 0;
                          let gap = 0;
                          
                          if (!isPerformanceMeasure && item.budget) {
                            budgetRequired = item.budget.budget_calculation_type === 'WITH_TOOL' ? 
                              Number(item.budget.estimated_cost_with_tool || 0) : 
                              Number(item.budget.estimated_cost_without_tool || 0);
                            
                            totalFunding = Number(item.budget.government_treasury || 0) +
                                          Number(item.budget.sdg_funding || 0) +
                                          Number(item.budget.partners_funding || 0) +
                                          Number(item.budget.other_funding || 0);
                            
                            gap = Math.max(0, budgetRequired - totalFunding);
                          }

                          rows.push(
                            <tr key={`${item.id}-${itemIndex}`} className="hover:bg-gray-50">
                              <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                {isFirstRow ? objective.title : ''}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-900">
                                {isFirstRow ? `${effectiveWeight}%` : ''}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-900">
                                {isFirstInitiativeRow ? initiative.name : ''}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-900">
                                <div className="flex items-center">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mr-2 ${
                                    isPerformanceMeasure ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                                  }`}>
                                    {isPerformanceMeasure ? 'PM' : 'MA'}
                                  </span>
                                  {item.name}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-900">{item.baseline || '-'}</td>
                              <td className="px-6 py-4 text-sm text-gray-900">{item.annual_target || 0}</td>
                              <td className="px-6 py-4 text-sm text-gray-900">{formatCurrency(budgetRequired)}</td>
                              <td className="px-6 py-4 text-sm text-gray-900">{formatCurrency(totalFunding)}</td>
                              <td className="px-6 py-4 text-sm text-gray-900">{formatCurrency(gap)}</td>
                            </tr>
                          );
                        });
                      }
                    });
                  }
                  
                  return rows;
                })
              ) : (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                    No plan data available
                  </td>
                </tr>
              )}
              
              {/* Summary Row */}
              {planData.totalBudget > 0 && (
                <tr className="bg-blue-50 border-t-2 border-blue-200">
                  <td colSpan={6} className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
                    TOTAL BUDGET
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900">
                    {formatCurrency(planData.totalBudget)}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900">
                    {formatCurrency(planData.totalFunding)}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900">
                    {formatCurrency(planData.fundingGap)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PlanSummary;