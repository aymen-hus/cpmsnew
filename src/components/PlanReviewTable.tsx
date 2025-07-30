import React, { useState, useEffect } from 'react';
import { Download, FileSpreadsheet, File as FilePdf, Send, Loader, Building2, Calendar, User, DollarSign, Users, Target, Activity, AlertCircle, FileType, Info, RefreshCw, Globe } from 'lucide-react';
import { exportToExcel, exportToPDF } from '../lib/utils/export';
import { processDataForExport, formatCurrency } from '../lib/utils/export';
import type { StrategicObjective, StrategicInitiative } from '../types/organization';
import { MONTHS } from '../types/plan';
import { auth } from '../lib/api';
import { useLanguage } from '../lib/i18n/LanguageContext';

interface PlanReviewTableProps {
  objectives: StrategicObjective[];
  onSubmit: () => Promise<void>;
  isSubmitting: boolean;
  organizationName: string;
  plannerName: string;
  fromDate: string;
  toDate: string;
  planType?: string;
  isPreviewMode?: boolean;
  userOrgId?: number | null; // Added prop to pass user organization ID
  isViewOnly?: boolean;
}

const PlanReviewTable: React.FC<PlanReviewTableProps> = ({ 
  objectives, 
  onSubmit,
  isSubmitting,
  organizationName,
  plannerName,
  fromDate,
  toDate,
  planType = 'TEAM_DESK',
  isPreviewMode = false,
  userOrgId: propUserOrgId = null, // Use prop if provided
  isViewOnly = false,
}) => {
  const { language, t } = useLanguage();
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budgetTotals, setBudgetTotals] = useState({
    total: 0,
    government: 0,
    sdg: 0,
    partners: 0,
    other: 0,
    available: 0,
    gap: 0
  });
  const [userOrgId, setUserOrgId] = useState<number | null>(propUserOrgId);
  const [processedObjectives, setProcessedObjectives] = useState<StrategicObjective[]>([]);

  useEffect(() => {
    setIsDataLoaded(false);
    setError(null);
  }, []);

  // Fetch current user's organization ID if not provided via props
  useEffect(() => {
    const fetchUserData = async () => {
      if (propUserOrgId !== null) {
        console.log('Using provided user organization ID:', propUserOrgId);
        setUserOrgId(propUserOrgId);
        return;
      }
      
      try {
        console.log('Fetching user organization ID...');
        const authData = await auth.getCurrentUser();
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          const orgId = authData.userOrganizations[0].organization;
          console.log('Fetched user organization ID:', orgId);
          setUserOrgId(orgId);
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
      }
    };
    
    fetchUserData();
  }, [propUserOrgId]);

  // Process objectives when they change to ensure we're filtering based on user's organization
  useEffect(() => {
    if (!objectives || !userOrgId) {
      setProcessedObjectives([]);
      setIsDataLoaded(true);
      return;
    }
    
    console.log('Processing objectives for review table:', objectives.length);
    console.log('Using organization ID for filtering:', userOrgId);
    
    try {
      // Deep clone to avoid modifying original data
      const cloned = JSON.parse(JSON.stringify(objectives));
      
      // Process each objective to filter initiatives, measures, and activities
      const processed = cloned.map((objective: any) => {
        if (!objective) return objective;

        const isCustomObjective = objective.is_default === false;
        console.log(`Processing objective ${objective.title} (Custom: ${isCustomObjective})`);
        
        // Ensure effective weight is set correctly
        if (objective.planner_weight !== undefined && objective.planner_weight !== null) {
          objective.effective_weight = objective.planner_weight;
        } else {
          objective.effective_weight = objective.weight;
        }
        
        console.log(`Objective ${objective.title} - Weight: ${objective.weight}, Planner Weight: ${objective.planner_weight}, Effective Weight: ${objective.effective_weight}`);
        
        // Get all initiatives for this objective
        const initiatives = Array.isArray(objective.initiatives) 
          ? [...objective.initiatives] 
          : [];
          
        console.log(`Objective has ${initiatives.length} initiatives before filtering`);
        
        // Filter initiatives based on ownership
        // For custom objectives, include all initiatives
        // For default objectives, only include default initiatives or those belonging to the user's organization
        const filteredInitiatives = initiatives.filter(initiative => {
          if (isCustomObjective) {
            // For custom objectives, include all initiatives
            return true;
          }
          
          // For default objectives, only include default ones or those from user's organization
          return initiative.is_default || 
                 !initiative.organization || 
                 initiative.organization === userOrgId;
        }).map(initiative => {
          if (!initiative) return initiative;
          
          console.log(`Processing initiative ${initiative.name}`);
          
          // Get all measures and activities for this initiative
          const measures = Array.isArray(initiative.performance_measures)
            ? [...initiative.performance_measures]
            : [];
            
          const activities = Array.isArray(initiative.main_activities)
            ? [...initiative.main_activities]
            : [];
            
          console.log(`Initiative has ${measures.length} measures and ${activities.length} activities before filtering`);
          
          // Filter measures and activities based on ownership
          const filteredMeasures = measures.filter(measure => 
            !measure.organization || measure.organization === userOrgId
          );
          
          const filteredActivities = activities.filter(activity =>
            !activity.organization || activity.organization === userOrgId
          );
          
          console.log(`After filtering: ${filteredMeasures.length} measures and ${filteredActivities.length} activities`);
          
          return {
            ...initiative,
            performance_measures: filteredMeasures,
            main_activities: filteredActivities
          };
        });
        
        console.log(`Objective has ${filteredInitiatives.length} initiatives after filtering`);
        
        return {
          ...objective,
          initiatives: filteredInitiatives
        };
      });
      
      console.log('Processed objectives for review table:', processed.length);
      setProcessedObjectives(processed);
    } catch (error) {
      console.error('Error processing objectives:', error);
      setError('Error processing plan data');
      setProcessedObjectives([]);
    }
  }, [objectives, userOrgId]);

  // Convert plan type to display text
  const getPlanTypeDisplay = (type: string) => {
    // No need to convert - using display name directly
    return type;
  };

  const getEffectiveWeight = (objective: any): number => {
    // Use planner_weight if available, otherwise use weight
    return objective.planner_weight !== undefined && objective.planner_weight !== null
      ? Number(objective.planner_weight)
      : Number(objective.weight || 0);
  };

  // Check if data is properly loaded with initiatives, measures and activities
  useEffect(() => {
    const checkDataCompleteness = () => {
      if (!processedObjectives || !Array.isArray(processedObjectives)) {
        console.log('No processed objectives available');
        setIsDataLoaded(false);
        return;
      }

      if (processedObjectives.length === 0) {
        console.log('Processed objectives array is empty');
        setIsDataLoaded(true); // Set as loaded even if empty
        return;
      }
      
      // Check if objectives have complete data
      const hasCompleteData = processedObjectives.every(objective => {
        // Check if objective has initiatives property and it's an array
        if (!objective || !objective.initiatives || !Array.isArray(objective.initiatives)) {
          console.log('Objective missing initiatives or not an array:', objective?.id);
          return false;
        }
        
        // It's okay if an objective has no initiatives
        if (objective.initiatives.length === 0) {
          return true;
        }
        
        // Check each initiative
        return objective.initiatives.every(initiative => {
          // Skip validation if initiative is invalid
          if (!initiative) return true;
          
          // Check if initiative has performance_measures and main_activities as arrays
          const hasMeasures = Array.isArray(initiative.performance_measures);
          const hasActivities = Array.isArray(initiative.main_activities);
          
          if (!hasMeasures || !hasActivities) {
            console.log('Initiative missing measures or activities arrays:', initiative.id);
          }
          
          return hasMeasures && hasActivities;
        });
      });
      
      console.log('Data completeness check result:', hasCompleteData);
      setIsDataLoaded(true);
    };
    
    checkDataCompleteness();
  }, [processedObjectives]);

  // Calculate budget totals when objectives change
  useEffect(() => {
    if (processedObjectives && processedObjectives.length > 0) {
      const totals = calculateTotalBudget();
      setBudgetTotals(totals);
    }
  }, [processedObjectives, userOrgId]);

  const handleExportExcel = async () => {
    const data = processDataForExport(processedObjectives, language);
    await exportToExcel(
      data, 
      `plan-${new Date().toISOString()}`, 
      language,
      {
        organization: organizationName,
        planner: plannerName,
        fromDate: fromDate,
        toDate: toDate,
        planType: getPlanTypeDisplay(planType)
      }
    );
  };
  
  const handleExportExcelAmharic = async () => {
    const data = processDataForExport(processedObjectives, 'am');
    await exportToExcel(
      data, 
      `plan-amharic-${new Date().toISOString()}`, 
      'am',
      {
        organization: organizationName,
        planner: plannerName,
        fromDate: fromDate,
        toDate: toDate,
        planType: getPlanTypeDisplay(planType)
      }
    );
  };

  const handleExportPDF = async () => {
    const data = processDataForExport(processedObjectives, language);
    await exportToPDF(
      data, 
      `plan-${new Date().toISOString()}`, 
      language,
      {
        organization: organizationName,
        planner: plannerName,
        fromDate: fromDate,
        toDate: toDate,
        planType: getPlanTypeDisplay(planType)
      }
    );
  };

  // Calculate total budget across all objectives
  const calculateTotalBudget = () => {
    let total = 0;
    let government = 0;
    let sdg = 0;
    let partners = 0;
    let other = 0;
    let available = 0;
    let gap = 0;

    if (!processedObjectives || !Array.isArray(processedObjectives)) {
      return { total, government, sdg, partners, other, available, gap };
    }

    processedObjectives.forEach(objective => {
      if (!objective || !objective.initiatives || !Array.isArray(objective.initiatives)) {
        return;
      }

      objective.initiatives.forEach(initiative => {
        if (!initiative || !initiative.main_activities || !Array.isArray(initiative.main_activities)) {
          return;
        }

        initiative.main_activities.forEach(activity => {
          if (!activity || !activity.budget) {
            return;
          }
          
          try {
            const cost = activity.budget.budget_calculation_type === 'WITH_TOOL' 
              ? Number(activity.budget.estimated_cost_with_tool || 0) 
              : Number(activity.budget.estimated_cost_without_tool || 0);
            
            total += cost;
            government += Number(activity.budget.government_treasury || 0);
            sdg += Number(activity.budget.sdg_funding || 0);
            partners += Number(activity.budget.partners_funding || 0);
            other += Number(activity.budget.other_funding || 0);
            
            // Calculate total available funding and gap
            const activityAvailable = Number(activity.budget.government_treasury || 0) + 
                                     Number(activity.budget.sdg_funding || 0) + 
                                     Number(activity.budget.partners_funding || 0) + 
                                     Number(activity.budget.other_funding || 0);
            available += activityAvailable;
            gap += Math.max(0, cost - activityAvailable);
          } catch (e) {
            console.error('Error processing activity budget:', e, activity);
          }
        });
      });
    });

    return { total, government, sdg, partners, other, available, gap };
  };

  // Count total activities and measures across all objectives
  const countItems = () => {
    let activities = 0;
    let measures = 0;
    
    if (!processedObjectives || !Array.isArray(processedObjectives)) {
      return { activities: 0, measures: 0 };
    }
    
    processedObjectives.forEach(objective => {
      if (!objective || !objective.initiatives || !Array.isArray(objective.initiatives)) {
        return;
      }

      objective.initiatives.forEach(initiative => {
        if (!initiative) return;
        
        if (initiative.performance_measures && Array.isArray(initiative.performance_measures)) {
          measures += initiative.performance_measures.length;
        }
        
        if (initiative.main_activities && Array.isArray(initiative.main_activities)) {
          activities += initiative.main_activities.length;
        }
      });
    });
    
    return { activities, measures };
  };
  
  const totals = countItems();

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Plan Summary</h2>
          <p className="text-sm text-gray-500 mt-1">
            Review your plan details before submission
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={handleExportExcel}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export Excel
          </button>
          <button
            onClick={handleExportExcelAmharic}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <Globe className="h-4 w-4 mr-2" />
            Export Excel (አማርኛ)
          </button>
          {/* <button
            onClick={handleExportPDF}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <FilePdf className="h-4 w-4 mr-2" />
            Export PDF
          </button> */}
          {!isPreviewMode && (
            <button
              onClick={onSubmit}
              disabled={isSubmitting || !isDataLoaded || processedObjectives.length === 0}
              className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit for Review
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Error message when objectives are missing */}
      {(!processedObjectives || !Array.isArray(processedObjectives) || processedObjectives.length === 0) && isDataLoaded && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-700 text-center">
          <p className="font-medium mb-2">No objectives selected</p>
          <p className="text-sm">Please select at least one strategic objective before submitting your plan.</p>
        </div>
      )}

      {/* Error message when data is incomplete */}
      {processedObjectives && processedObjectives.length > 0 && !isDataLoaded && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-700">
          <p className="font-medium mb-2">Incomplete plan data</p>
          <p className="text-sm">Some objectives may be missing initiatives, performance measures, or activities. Please ensure all required data is complete.</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Total Objectives</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {processedObjectives?.length || 0}
          </p>
        </div>
        
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Total Initiatives</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {processedObjectives?.length || 0}
          </p>
        </div>
        
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Total Activities</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {totals.activities}
          </p>
        </div>
        
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Total Measures</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {totals.measures}
          </p>
        </div>

        {!isPreviewMode && !isViewOnly && (
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-gray-500">Total Budget</h3>
              <DollarSign className="h-4 w-4 text-green-500" />
            </div>
            <p className="mt-2 text-3xl font-semibold text-green-600">${budgetTotals.total.toLocaleString()}</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div className="flex justify-between">
                <span>Government:</span>
                <span className="font-medium text-gray-900">${budgetTotals.government.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Partners:</span>
                <span className="font-medium text-gray-900">${budgetTotals.partners.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>SDG:</span>
                <span className="font-medium text-gray-900">${budgetTotals.sdg.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Other:</span>
                <span className="font-medium text-gray-900">${budgetTotals.other.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Available:</span>
                <span className="font-medium text-blue-600">${budgetTotals.available.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Gap:</span>
                <span className="font-medium text-red-600">${budgetTotals.gap.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mb-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-gray-600">Performance Measure</span>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-green-600" />
          <span className="text-sm text-gray-600">Main Activity</span>
        </div>
      </div>

      {/* Organization Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className="text-sm text-gray-500 flex items-center gap-1">
              <Building2 className="h-4 w-4" /> Organization
            </span>
            <span className="font-medium">{organizationName}</span>
          </div>
          <div>
            <span className="text-sm text-gray-500 flex items-center gap-1">
              <User className="h-4 w-4" /> Planner
            </span>
            <span className="font-medium">{plannerName}</span>
          </div>
          <div>
            <span className="text-sm text-gray-500 flex items-center gap-1">
              <Calendar className="h-4 w-4" /> Period
            </span>
            <span className="font-medium">{fromDate} to {toDate}</span>
          </div>
          <div>
            <span className="text-sm text-gray-500 flex items-center gap-1">
              <FileType className="h-4 w-4" /> Type
            </span>
            <span className="font-medium">{getPlanTypeDisplay(planType)}</span>
          </div>
        </div>
      </div>

      {/* Error message when objectives are missing */}
      {(!processedObjectives || !Array.isArray(processedObjectives) || processedObjectives.length === 0) && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-700 text-center">
          <p className="font-medium mb-2">No objectives found</p>
          <p className="text-sm">Please ensure objectives are properly selected and configured.</p>
        </div>
      )}
      
      {/* Detailed Table - Only show if we have objectives */}
      {processedObjectives && Array.isArray(processedObjectives) && processedObjectives.length > 0 && (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 border-collapse [&_th]:border [&_td]:border table-fixed">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-8 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  №
                </th>
                <th className="w-40 px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Strategic Objective
                </th>
                <th className="w-16 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Weight
                </th>
                <th className="w-40 px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Strategic Initiative
                </th>
                <th className="w-16 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Initiative Weight
                </th>
                <th className="w-40 px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Performance Measure/Main Activity
                </th>
                <th className="w-12 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Weight
                </th>
                <th className="w-16 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Baseline
                </th>
                <th className="w-14 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Q1
                </th>
                <th className="w-14 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Q2
                </th>
                <th className="w-16 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  6M
                </th>
                <th className="w-14 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Q3
                </th>
                <th className="w-14 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Q4
                </th>
                <th className="w-16 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Annual
                </th>
                <th className="w-24 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Implementor
                </th>
                <th className="w-20 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Budget Required
                </th>
                <th className="w-20 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Government
                </th>
                <th className="w-20 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Partners
                </th>
                <th className="w-20 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  SDG
                </th>
                <th className="w-20 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Other
                </th>
                <th className="w-20 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Total Available
                </th>
                <th className="w-20 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                  Gap
                </th>
              </tr>
            </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {processedObjectives.map((objective, objIndex) => {
                  if (!objective) {
                    return (
                      <tr key={`empty-obj-${objIndex}`} className="bg-red-50">
                        <td colSpan={23} className="px-6 py-4 text-center text-red-500">
                          Invalid objective data - please check configuration
                        </td>
                      </tr>
                    );
                  }
                  
                  // Get effective weight - use planner_weight if available, otherwise use weight
                  const effectiveWeight = objective.planner_weight !== undefined && objective.planner_weight !== null 
                    ? objective.planner_weight 
                    : objective.weight;

                  // Use already filtered initiatives from processed objectives
                  const filteredInitiatives = Array.isArray(objective.initiatives) ? objective.initiatives : [];

                  if (filteredInitiatives.length === 0) {
                    return (
                      <tr key={`obj-${objective.id || objIndex}`}>
                        <td className="px-2 py-2 text-sm text-center text-gray-900 border">{objIndex + 1}</td>
                        <td className="px-2 py-2 text-sm text-gray-900 border">{objective.title || 'Untitled Objective'}</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-900 border">{effectiveWeight}%</td>
                        <td className="px-2 py-2 text-sm text-gray-500 border font-medium">No initiatives</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        <td className="px-2 py-2 text-sm text-gray-500 border font-medium">No initiatives</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                      </tr>
                    );
                  }
                  
                  // Create an array to hold all rows for this objective
                  let tableRows: React.ReactNode[] = [];
                  
                  // Process each initiative
                  filteredInitiatives.forEach((initiative, initIndex) => {
                    if (!initiative) return;
                    
                    const filteredMeasures = Array.isArray(initiative.performance_measures)
                      ? initiative.performance_measures : [];
                    
                    const filteredActivities = Array.isArray(initiative.main_activities) 
                      ? initiative.main_activities : [];
                    
                    // If no measures or activities, add an empty row for this initiative
                    if (filteredMeasures.length === 0 && filteredActivities.length === 0) {
                      tableRows.push(
                        <tr key={`empty-init-${initIndex}-${initiative.id || 'unknown'}`}>
                          <td className="px-2 py-2 text-sm text-gray-900 border">
                            {tableRows.length === 0 ? (objIndex + 1) : ''}
                          </td>
                          <td className="px-2 py-2 text-sm text-gray-900 border">
                            {tableRows.length === 0 ? objective.title || 'Untitled Objective' : ''}
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {tableRows.length === 0 ? effectiveWeight + '%' : ''}
                          </td>
                          <td className="px-2 py-2 text-sm text-gray-900 border">
                            {tableRows.length === 0 ? initiative.name || 'Untitled Initiative' : ''}
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {tableRows.length === 0 ? initiative.weight + '%' : ''}
                          </td>
                          <td className="px-2 py-2 text-sm font-medium text-gray-900 border">
                            {initiative.name || 'Untitled Initiative'}
                          </td>
                          <td className="px-2 py-2 text-sm text-gray-500 italic border">
                            No measures or activities
                          </td>
                          <td colSpan={15} className="px-2 py-2 text-sm text-center text-gray-500 border">
                            No data available for this initiative
                          </td>
                        </tr>
                      );
                      return;
                    }

                    // Process measures - Simplified version
                    filteredMeasures.forEach((measure, measureIndex) => {
                      if (!measure) return;
                      
                      // Calculate targets based on target type
                      const q1 = Number(measure.q1_target) || 0;
                      const q2 = Number(measure.q2_target) || 0;
                      const q3 = Number(measure.q3_target) || 0;
                      const q4 = Number(measure.q4_target) || 0;
                      const annual = Number(measure.annual_target) || 0;
                      
                      // Calculate 6-month target
                      const sixMonthTarget = measure.target_type === 'cumulative' 
                        ? q1 + q2 : q2;
                      
                      tableRows.push(
                        <tr key={`measure-${initiative.id}-${measure.id || measureIndex}`} className="bg-blue-50">
                          <td className="px-2 py-2 text-sm text-gray-900 border">
                            {tableRows.length === 0 ? (objIndex + 1) : ''}
                          </td>
                          <td className="px-2 py-2 text-sm text-gray-900 border">
                            {tableRows.length === 0 ? objective.title || 'Untitled Objective' : ''}
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {tableRows.length === 0 ? effectiveWeight + '%' : ''}
                          </td>
                          <td className="px-2 py-2 text-sm text-gray-900 border">
                            {tableRows.length === 0 ? initiative.name || 'Untitled Initiative' : ''}
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {tableRows.length === 0 ? initiative.weight + '%' : ''}
                          </td>
                          <td className="px-2 py-2 text-sm text-gray-900 border">
                            <div className="flex items-center gap-2">
                              <Target className="h-4 w-4 text-blue-600 flex-shrink-0" />
                              <span>{measure.name || 'Untitled Measure'}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {measure.weight}%
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {measure.baseline || '-'}
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {q1}
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {q2}
                          </td>
                          <td className="px-2 py-2 text-sm text-center font-medium text-blue-600 border">
                            {sixMonthTarget}
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {q3}
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {q4}
                          </td>
                          <td className="px-2 py-2 text-sm text-center font-medium text-gray-900 border">
                            {annual}
                          </td>
                          <td className="px-2 py-2 text-sm text-gray-900 border">
                            <div className="text-xs">
                              {initiative.organization_name || 'ICT EO'}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                          <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                          <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                          <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                          <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                          <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                          <td className="px-2 py-2 text-sm text-center text-gray-500 border">-</td>
                        </tr>
                      );
                    });
                    
                    // Add main activities rows
                    filteredActivities.forEach((activity, activityIndex) => {
                      if (!activity) return;
                      
                      // Calculate budget values
                      let budgetRequired = 0;
                      let government = 0;
                      let sdg = 0;
                      let partners = 0;
                      let other = 0;
                      let totalAvailable = 0;
                      let gap = 0;
                      
                      if (activity.budget) {
                        budgetRequired = activity.budget.budget_calculation_type === 'WITH_TOOL' 
                          ? Number(activity.budget.estimated_cost_with_tool || 0)
                          : Number(activity.budget.estimated_cost_without_tool || 0);
                          
                        government = Number(activity.budget.government_treasury || 0);
                        sdg = Number(activity.budget.sdg_funding || 0);
                        partners = Number(activity.budget.partners_funding || 0);
                        other = Number(activity.budget.other_funding || 0);
                        
                        totalAvailable = government + sdg + partners + other;
                        gap = Math.max(0, budgetRequired - totalAvailable);
                      }
                      
                      // Calculate 6-month target based on target type
                      const sixMonthTarget = activity.target_type === 'cumulative'
                        ? Number(activity.q1_target) + Number(activity.q2_target)
                        : Number(activity.q2_target);
                      
                      tableRows.push(
                        <tr key={`activity-${initiative.id}-${activity.id || activityIndex}`} className="bg-green-50">
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {tableRows.length === 0 ? (objIndex + 1) : ''}
                          </td>
                          <td className="px-2 py-2 text-sm text-gray-900 border">
                            {tableRows.length === 0 ? objective.title || 'Untitled Objective' : ''}
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {tableRows.length === 0 ? effectiveWeight + '%' : ''}
                          </td>
                          <td className="px-2 py-2 text-sm text-gray-900 border">
                            {tableRows.length === 0 ? initiative.name || 'Untitled Initiative' : ''}
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {tableRows.length === 0 ? initiative.weight + '%' : ''}
                          </td>
                          <td className="px-2 py-2 text-sm text-gray-900 border">
                            <div className="flex items-center gap-2">
                              <Activity className="h-4 w-4 text-green-600 flex-shrink-0" />
                              <span>{activity.name || 'Untitled Activity'}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {`${activity.weight}%`}
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {activity.baseline || '-'}
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {activity.q1_target || 0}
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {activity.q2_target || 0}
                          </td>
                          <td className="px-2 py-2 text-sm text-center font-medium text-green-600 border">
                            {sixMonthTarget}
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {activity.q3_target || 0}
                          </td>
                          <td className="px-2 py-2 text-sm text-center text-gray-900 border">
                            {activity.q4_target || 0}
                          </td>
                          <td className="px-2 py-2 text-sm text-center font-medium text-gray-900 border">
                            {activity.annual_target || 0}
                          </td>
                          <td className="px-2 py-2 text-sm text-gray-900 border">
                            <div className="text-xs">
                              {initiative.organization_name || 'ICT EO'}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-sm text-right font-medium text-gray-900 border">
                            {budgetRequired ? formatCurrency(budgetRequired) : '-'}
                          </td>
                          <td className="px-2 py-2 text-sm text-right text-gray-900 border">
                            {government ? formatCurrency(government) : '-'}
                          </td>
                          <td className="px-2 py-2 text-sm text-right text-gray-900 border">
                            {partners ? formatCurrency(partners) : '-'}
                          </td>
                          <td className="px-2 py-2 text-sm text-right text-gray-900 border">
                            {sdg ? formatCurrency(sdg) : '-'}
                          </td>
                          <td className="px-2 py-2 text-sm text-right text-gray-900 border">
                            {other ? formatCurrency(other) : '-'}
                          </td>
                          <td className="px-2 py-2 text-sm text-right font-medium text-blue-600 border">
                            {totalAvailable ? formatCurrency(totalAvailable) : '-'}
                          </td>
                          <td className="px-2 py-2 text-sm text-right font-medium text-red-600 border">
                            {gap ? formatCurrency(gap) : '-'}
                          </td>
                        </tr>
                      );
                    });
                  });
                  
                  // If no rows were added for this objective, add an empty row
                  if (tableRows.length === 0) {
                     tableRows.push(
                       <tr key={`empty-obj-${objective.id || objIndex}`} className="bg-gray-50">
                         <td className="px-2 py-2 text-sm text-center text-gray-900 border">{objIndex + 1}</td>
                         <td className="px-2 py-2 text-sm text-gray-900 border">{objective.title || 'Untitled Objective'}</td>
                         <td className="px-2 py-2 text-sm text-center text-gray-900 border">{effectiveWeight}%</td>
                         <td className="px-2 py-2 text-sm text-gray-500 border" colSpan={19}>No initiatives, measures, or activities</td>
                       </tr>
                     );
                   }
                   
                   return tableRows;
                 }).flat()}
                 
              {/* Budget Summary Row */}
              {budgetTotals.total > 0 && (
                <tr className="bg-blue-100">
                  <td className="px-2 py-2 text-sm border" colSpan={15}></td>
                  <td className="px-2 py-2 text-sm font-bold text-right border">
                    {formatCurrency(budgetTotals.total)}
                  </td>
                  <td className="px-2 py-2 text-sm font-bold text-right border">
                    {formatCurrency(budgetTotals.government)}
                  </td>
                  <td className="px-2 py-2 text-sm font-bold text-right border">
                    {formatCurrency(budgetTotals.partners)}
                  </td>
                  <td className="px-2 py-2 text-sm font-bold text-right border">
                    {formatCurrency(budgetTotals.sdg)}
                  </td>
                  <td className="px-2 py-2 text-sm font-bold text-right border">
                    {formatCurrency(budgetTotals.other)}
                  </td>
                  <td className="px-2 py-2 text-sm font-bold text-right border">
                    {formatCurrency(budgetTotals.available)}
                  </td>
                  <td className="px-2 py-2 text-sm font-bold text-right border">
                    {formatCurrency(budgetTotals.gap)}
                  </td>
                </tr>
              )}
              
              {/* Funding Distribution Row */}
              {budgetTotals.available > 0 && (
                <tr className="bg-gray-100">
                  <td className="px-2 py-2 text-xs border font-bold text-right" colSpan={15}>FUNDING DISTRIBUTION (%)</td>
                  <td className="px-2 py-2 text-xs font-bold text-right border">
                    100%
                  </td>
                  <td className="px-2 py-2 text-xs font-bold text-right border">
                    {budgetTotals.available > 0 ? `${((budgetTotals.government / budgetTotals.available) * 100).toFixed(1)}%` : '0%'}
                  </td>
                  <td className="px-2 py-2 text-xs font-bold text-right border">
                    {budgetTotals.available > 0 ? `${((budgetTotals.partners / budgetTotals.available) * 100).toFixed(1)}%` : '0%'}
                  </td>
                  <td className="px-2 py-2 text-xs font-bold text-right border">
                    {budgetTotals.available > 0 ? `${((budgetTotals.sdg / budgetTotals.available) * 100).toFixed(1)}%` : '0%'}
                  </td>
                  <td className="px-2 py-2 text-xs font-bold text-right border">
                    {budgetTotals.available > 0 ? `${((budgetTotals.other / budgetTotals.available) * 100).toFixed(1)}%` : '0%'}
                  </td>
                  <td className="px-2 py-2 text-xs font-bold text-right border">
                    {budgetTotals.total > 0 ? `${((budgetTotals.available / budgetTotals.total) * 100).toFixed(1)}%` : '0%'}
                  </td>
                  <td className="px-2 py-2 text-xs font-bold text-right border">
                    {budgetTotals.total > 0 ? `${((budgetTotals.gap / budgetTotals.total) * 100).toFixed(1)}%` : '0%'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Additional information when no measures or activities are found */}
      {isDataLoaded && totals.measures === 0 && totals.activities === 0 && processedObjectives.length > 0 && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-yellow-600" />
            <p className="text-sm font-medium text-yellow-800">No Performance Measures or Activities</p>
          </div>
          <p className="mt-1 text-sm text-yellow-700 ml-7">
            You've selected objectives and initiatives, but there are no performance measures or main activities. 
            Please add at least one performance measure or activity before submitting.
          </p>
        </div>
      )}
      
      {/* Footer with pagination if needed */}
      {processedObjectives && processedObjectives.length > 5 && (
        <div className="mt-4 p-3 bg-gray-50 rounded-md flex justify-center">
          <p className="text-sm text-gray-600">Showing all {processedObjectives.length} objectives</p>
        </div>
      )}

      {/* Submit Section - only show Submit button for non-preview mode */}
      {!isPreviewMode && (
        <div className="mt-6">
          <button
            onClick={onSubmit}
            disabled={isSubmitting || !isDataLoaded || processedObjectives.length === 0}
            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit for Review
              </>
            )}
          </button>
        </div>
       )}

      {isPreviewMode && (
        <div className="mt-6 flex justify-center">
          <div className="flex space-x-4">
            {/* <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 flex items-center"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Preview
            </button> */}
            
            {/* <button
              onClick={handleExportPDF}
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 flex items-center"
            >
              <FilePdf className="h-4 w-4 mr-2" />
              Export PDF
            </button> */}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanReviewTable;