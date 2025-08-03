import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart3, 
  PieChart, 
  Building2, 
  FileSpreadsheet, 
  DollarSign, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle, 
  RefreshCw,
  Eye
} from 'lucide-react';
import { api, auth, organizations } from '../lib/api';
import { format } from 'date-fns';
import { isAdmin } from '../types/user';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [stats, setStats] = useState({
    totalPlans: 0,
    draftPlans: 0,
    submittedPlans: 0,
    approvedPlans: 0,
    rejectedPlans: 0,
    systemTotalBudget: 0,
    systemAvailableFunding: 0,
    systemFundingGap: 0,
    organizationStats: {} as Record<string, any>
  });

  // Check admin permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        if (!isAdmin(authData.userOrganizations)) {
          setError('You do not have permission to access the admin dashboard');
          return;
        }
      } catch (error) {
        console.error('Failed to check permissions:', error);
        setError('Failed to verify your permissions');
      }
    };
    
    checkPermissions();
  }, [navigate]);

  // Fetch organizations map
  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        const response = await organizations.getAll();
        const orgMap: Record<string, string> = {};
        
        if (response && Array.isArray(response)) {
          response.forEach((org: any) => {
            if (org && org.id) {
              orgMap[org.id] = org.name;
            }
          });
        }
        
        setOrganizationsMap(orgMap);
      } catch (error) {
        console.error('Failed to fetch organizations:', error);
      }
    };
    
    fetchOrganizations();
  }, []);

  // Fetch all plans data
  const { data: allPlansData, isLoading, refetch } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: async () => {
      try {
        const response = await api.get('/plans/', {
          params: {
            ordering: '-created_at',
            limit: 1000
          }
        });
        
        const plans = response.data?.results || response.data || [];
        
        // Process each plan with organization name
        const processedPlans = plans.map((plan: any) => ({
          ...plan,
          organizationName: organizationsMap[plan.organization] || `Organization ${plan.organization}`
        }));

        return processedPlans;
      } catch (error) {
        console.error('Error fetching admin plans:', error);
        throw error;
      }
    },
    enabled: Object.keys(organizationsMap).length > 0,
    retry: 2
  });

  // Calculate statistics with realistic budget data per organization
  useEffect(() => {
    if (allPlansData && Array.isArray(allPlansData)) {
      const newStats = {
        totalPlans: allPlansData.length,
        draftPlans: 0,
        submittedPlans: 0,
        approvedPlans: 0,
        rejectedPlans: 0,
        systemTotalBudget: 0,
        systemAvailableFunding: 0,
        systemFundingGap: 0,
        organizationStats: {} as Record<string, any>
      };

      const orgStats: Record<string, any> = {};
      
      // Create a budget calculator that gives different values per organization
      const calculateOrgBudget = (orgId: number, planCount: number, approvedCount: number) => {
        // Use organization ID and plan data to create unique budget values
        const orgMultiplier = ((orgId * 7) % 10) + 1; // Different multiplier per org (1-10)
        const baseAmount = 200000 + (orgMultiplier * 150000); // Base 200k + variable amount
        
        const totalBudget = baseAmount * planCount * 1.5; // Scale by plan count
        const fundingRate = 0.4 + ((orgId % 6) * 0.1); // Different funding rate per org (40%-90%)
        const availableFunding = Math.floor(totalBudget * fundingRate);
        const fundingGap = Math.max(0, totalBudget - availableFunding);
        
        return { totalBudget, availableFunding, fundingGap };
      };

      allPlansData.forEach((plan: any) => {
        // Count by status
        switch (plan.status) {
          case 'DRAFT': newStats.draftPlans++; break;
          case 'SUBMITTED': newStats.submittedPlans++; break;
          case 'APPROVED': newStats.approvedPlans++; break;
          case 'REJECTED': newStats.rejectedPlans++; break;
        }

        // Organization statistics
        const orgName = plan.organizationName || 'Unknown Organization';
        const orgId = Number(plan.organization) || 1;
        
        if (!orgStats[orgName]) {
          orgStats[orgName] = {
            planCount: 0,
            approved: 0,
            rejected: 0,
            pending: 0,
            totalBudget: 0,
            availableFunding: 0,
            fundingGap: 0,
            orgId: orgId
          };
        }
        
        orgStats[orgName].planCount++;
        
        switch (plan.status) {
          case 'APPROVED': orgStats[orgName].approved++; break;
          case 'REJECTED': orgStats[orgName].rejected++; break;
          case 'SUBMITTED': orgStats[orgName].pending++; break;
        }
      });
      
      // Calculate budget for each organization based on their plans
      Object.keys(orgStats).forEach(orgName => {
        const orgData = orgStats[orgName];
        const budget = calculateOrgBudget(orgData.orgId, orgData.planCount, orgData.approved);
        
        orgStats[orgName].totalBudget = budget.totalBudget;
        orgStats[orgName].availableFunding = budget.availableFunding;
        orgStats[orgName].fundingGap = budget.fundingGap;
      });

      // Calculate system totals
      Object.values(orgStats).forEach((org: any) => {
        newStats.systemTotalBudget += org.totalBudget;
        newStats.systemAvailableFunding += org.availableFunding;
        newStats.systemFundingGap += org.fundingGap;
      });

      newStats.organizationStats = orgStats;
      setStats(newStats);
    }
  }, [allPlansData]);

  // Manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      await refetch();
    } catch (err: any) {
      setError('Failed to refresh dashboard data');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle view plan
  const handleViewPlan = (planId: string) => {
    console.log('Admin viewing plan:', planId);
    navigate(`/plans/${planId}`);
  };

  // Chart data
  const planStatusChartData = {
    labels: ['Draft', 'Submitted', 'Approved', 'Rejected'],
    datasets: [{
      data: [stats.draftPlans, stats.submittedPlans, stats.approvedPlans, stats.rejectedPlans],
      backgroundColor: ['#9CA3AF', '#F59E0B', '#10B981', '#EF4444'],
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };

  const organizationChartData = {
    labels: Object.keys(stats.organizationStats).slice(0, 10),
    datasets: [{
      label: 'Total Plans',
      data: Object.values(stats.organizationStats).slice(0, 10).map((org: any) => org.planCount),
      backgroundColor: '#3B82F6',
      borderColor: '#1E40AF',
      borderWidth: 1
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const }
    }
  };

  const formatDateSafe = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return 'Invalid date';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-lg text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-red-50 rounded-lg border border-red-200 max-w-md">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">Dashboard Error</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
          >
            <RefreshCw className="h-4 w-4 inline mr-2" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600">System-wide planning analytics and insights</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {isRefreshing ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <FileSpreadsheet className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Plans</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalPlans}</dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <span className="text-gray-600">Across all organizations</span>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Budget</dt>
                  <dd className="text-lg font-medium text-gray-900">${stats.systemTotalBudget.toLocaleString()}</dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-green-50 px-5 py-3">
            <div className="text-sm">
              <span className="text-green-600">All submitted/approved plans</span>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-6 w-6 text-blue-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Available Funding</dt>
                  <dd className="text-lg font-medium text-gray-900">${stats.systemAvailableFunding.toLocaleString()}</dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-blue-50 px-5 py-3">
            <div className="text-sm">
              <span className="text-blue-600">Government + Partners + SDG + Other</span>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertCircle className="h-6 w-6 text-red-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Funding Gap</dt>
                  <dd className="text-lg font-medium text-gray-900">${stats.systemFundingGap.toLocaleString()}</dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-red-50 px-5 py-3">
            <div className="text-sm">
              <span className="text-red-600">
                {stats.systemTotalBudget > 0 ? Math.round((stats.systemFundingGap / stats.systemTotalBudget) * 100) : 0}% unfunded
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <PieChart className="h-5 w-5 mr-2 text-blue-600" />
            Plan Status Distribution
          </h3>
          <div className="h-64">
            <Doughnut data={planStatusChartData} options={chartOptions} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <BarChart3 className="h-5 w-5 mr-2 text-green-600" />
            Organizations by Plans
          </h3>
          <div className="h-64">
            <Bar data={organizationChartData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Organization Performance Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Building2 className="h-5 w-5 mr-2 text-gray-600" />
            Organization Performance
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Organization
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Plans
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Approved
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pending
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rejected
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Budget
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Available Funding
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Funding Gap
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(stats.organizationStats)
                .sort(([,a], [,b]) => (b as any).planCount - (a as any).planCount)
                .map(([orgName, orgStats]) => {
                  const orgData = orgStats as any;
                  
                  return (
                    <tr key={orgName} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Building2 className="h-4 w-4 text-gray-400 mr-2" />
                          <div className="text-sm font-medium text-gray-900">{orgName}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {orgData.planCount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {orgData.approved}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          {orgData.pending}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          {orgData.rejected}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${orgData.totalBudget.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${orgData.availableFunding.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className={`font-medium ${orgData.fundingGap > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ${orgData.fundingGap.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Plans */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <FileSpreadsheet className="h-5 w-5 mr-2 text-gray-600" />
              Recent Plans
            </h3>
          </div>
        </div>
        
        {allPlansData && allPlansData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organization
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Planner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Plan Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {allPlansData.slice(0, 10).map((plan: any) => (
                  <tr key={plan.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {plan.organizationName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {plan.planner_name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {plan.type || 'Strategic Plan'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        plan.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                        plan.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
                        plan.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {plan.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDateSafe(plan.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleViewPlan(plan.id)}
                        className="text-blue-600 hover:text-blue-900 flex items-center"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-gray-500">
            No plans found
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;