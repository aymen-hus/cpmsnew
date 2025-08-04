import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { plans, auth } from '../lib/api';
import { ArrowLeft, Loader, AlertCircle, Eye, FileSpreadsheet, Calendar, User, Building2, Target } from 'lucide-react';
import PlanReviewTable from '../components/PlanReviewTable';
import { format } from 'date-fns';

const PlanSummary: React.FC = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const [userOrgId, setUserOrgId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get current user data
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          setUserOrgId(authData.userOrganizations[0].organization);
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        setError('Failed to load user information');
      }
    };
    
    fetchUserData();
  }, [navigate]);

  // Normalize and process plan data to ensure proper structure
  const normalizeAndProcessPlanData = (plan: any) => {
    if (!plan) return plan;
    
    const processedPlan = JSON.parse(JSON.stringify(plan));
    
    try {
      console.log('=== NORMALIZING PLAN DATA ===');
      console.log('Plan ID:', plan.id);
      console.log('Plan organization:', plan.organization);
      console.log('Raw plan objectives:', plan.objectives?.length || 0);
      
      // Ensure all expected arrays exist and are properly formatted
      if (!Array.isArray(processedPlan.objectives)) {
        processedPlan.objectives = processedPlan.objectives 
          ? (Array.isArray(processedPlan.objectives) ? processedPlan.objectives : [processedPlan.objectives])
          : [];
      }

      // Process objectives and ensure planner-specific weights are preserved
      processedPlan.objectives = processedPlan.objectives.map((objective: any) => {
        if (!objective) return objective;
        
        console.log(`Processing objective ${objective.id} (${objective.title}):`, {
          weight: objective.weight,
          planner_weight: objective.planner_weight,
          effective_weight: objective.effective_weight
        });
        
        // Ensure the objective has the correct weight for this plan
        // The weight in the plan data should be the planner's selected weight
        if (objective.planner_weight !== undefined && objective.planner_weight !== null) {
          objective.effective_weight = objective.planner_weight;
          console.log(`Using planner_weight ${objective.planner_weight} for objective ${objective.id}`);
        } else if (objective.effective_weight !== undefined) {
          console.log(`Using effective_weight ${objective.effective_weight} for objective ${objective.id}`);
        } else {
          objective.effective_weight = objective.weight;
          console.log(`Using original weight ${objective.weight} for objective ${objective.id}`);
        }
        
        objective.initiatives = Array.isArray(objective.initiatives) 
          ? objective.initiatives 
          : (objective.initiatives ? [objective.initiatives] : []);

        objective.initiatives = objective.initiatives.map((initiative: any) => {
          if (!initiative) return initiative;
          
          initiative.performance_measures = Array.isArray(initiative.performance_measures) 
            ? initiative.performance_measures 
            : (initiative.performance_measures ? [initiative.performance_measures] : []);
            
          initiative.main_activities = Array.isArray(initiative.main_activities) 
            ? initiative.main_activities 
            : (initiative.main_activities ? [initiative.main_activities] : []);

          return initiative;
        });

        return objective;
      });

      console.log('Processed plan objectives:', processedPlan.objectives.length);
      return processedPlan;
    } catch (error) {
      console.error('Error normalizing plan data:', error);
      return plan;
    }
  };

  // Fetch plan data
  const { data: planData, isLoading, error: planError } = useQuery({
    queryKey: ['plan', planId],
    queryFn: async () => {
      if (!planId) throw new Error('Plan ID is required');
      
      console.log('Fetching plan data for ID:', planId);
      const plan = await plans.getById(planId);
      console.log('Raw plan data received:', plan);
      
      // Normalize and process the plan data
      const processedPlan = normalizeAndProcessPlanData(plan);
      console.log('Processed plan data:', processedPlan);
      
      return processedPlan;
    },
    enabled: !!planId,
    retry: 2
  });

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return dateString;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="h-6 w-6 animate-spin mr-2 text-blue-600" />
        <span className="text-lg">Loading plan details...</span>
      </div>
    );
  }

  if (planError || error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-red-50 rounded-lg border border-red-200">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Plan</h3>
          <p className="text-red-600">{error || (planError instanceof Error ? planError.message : 'Failed to load plan')}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!planData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-yellow-50 rounded-lg border border-yellow-200">
          <Eye className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Plan Not Found</h3>
          <p className="text-yellow-600">The requested plan could not be found.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-4 px-4 py-2 bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200"
          >
            Return to Dashboard
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
          onClick={() => navigate('/dashboard')}
          className="flex items-center text-gray-600 hover:text-blue-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Dashboard
        </button>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Plan Summary</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center">
              <Building2 className="h-5 w-5 text-gray-500 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Organization</p>
                <p className="font-medium">{planData.organization_name || `Organization ${planData.organization}`}</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <User className="h-5 w-5 text-gray-500 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Planner</p>
                <p className="font-medium">{planData.planner_name}</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <Calendar className="h-5 w-5 text-gray-500 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Period</p>
                <p className="font-medium">
                  {formatDate(planData.from_date)} - {formatDate(planData.to_date)}
                </p>
              </div>
            </div>
            
            <div className="flex items-center">
              <Target className="h-5 w-5 text-gray-500 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  planData.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                  planData.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
                  planData.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {planData.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Plan Table */}
      {planData.objectives && planData.objectives.length > 0 ? (
        <PlanReviewTable
          objectives={planData.objectives}
          onSubmit={async () => {}}
          isSubmitting={false}
          organizationName={planData.organization_name || `Organization ${planData.organization}`}
          plannerName={planData.planner_name}
          fromDate={planData.from_date}
          toDate={planData.to_date}
          planType={planData.type}
          isViewOnly={true}
          userOrgId={userOrgId}
        />
      ) : (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 text-center">
          <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Plan Data</h3>
          <p className="text-gray-500">This plan doesn't have any objectives or data to display.</p>
        </div>
      )}
    </div>
  );
};

export default PlanSummary;