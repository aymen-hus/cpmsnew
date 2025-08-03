import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart3, 
  PieChart, 
  Building2, 
  Users, 
  FileSpreadsheet, 
  DollarSign, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  RefreshCw,
  Eye,
  Download,
  Calendar
} from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { plans, organizations, auth, api } from '../lib/api';
import { format } from 'date-fns';
import { isAdmin } from '../types/user';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

const AdminDashboard: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  
  // State management
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [selectedTimeframe, setSelectedTimeframe] = useState<'all' | '30d' | '90d'>('all');
  const [stats, setStats] = useState({
    totalPlans: 0,
    draftPlans: 0,
    submittedPlans: 0,
    approvedPlans: 0,
    rejectedPlans: 0,
    totalBudget: 0,
    fundedBudget: 0,
    fundingGap: 0,
    organizationStats: {} as Record<string, any>,
    monthlySubmissions: {} as Record<string, number>
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
        console.log('Organizations map created:', orgMap);
      } catch (error) {
        console.error('Failed to fetch organizations:', error);
      }
    };
    
    fetchOrganizations();
  }, []);

  // Fetch all plans data with simplified logic
  const { data: allPlansData, isLoading, refetch } = useQuery({
    queryKey: ['admin-plans', selectedTimeframe],
    queryFn: async () => {
      console.log('=== ADMIN DASHBOARD: Fetching all plans ===');
      try {
        // Get all plans first
        const response = await api.get('/plans/', {
          params: {
            ordering: '-created_at',
            limit: 1000 // Get up to 1000 plans
          }
        });
        
        const plans = response.data?.results || response.data || [];
        console.log(`📊 Fetched ${plans.length} total plans`);
        
        if (!Array.isArray(plans)) {
          console.error('Expected array but got:', typeof plans);
          return [];
        }

        // Add organization names to plans
        const enrichedPlans = plans.map((plan: any) => ({
          ...plan,
          organizationName: organizationsMap[plan.organization] || `Organization ${plan.organization}`
        }));

        console.log(`✅ Admin dashboard: Processed ${enrichedPlans.length} plans`);
        return enrichedPlans;
      } catch (error) {
        console.error('Error fetching admin plans:', error);
        throw error;
      }
    },
    enabled: Object.keys(organizationsMap).length > 0,
    retry: 2,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000 // Consider data stale after 30 seconds
  });

  // Calculate comprehensive statistics
  const calculateStats = (plansData: any[]) => {
    if (!plansData || !Array.isArray(plansData)) {
      return stats; // Return current stats if no data
    }

    console.log('=== CALCULATING ADMIN STATS ===');
    
    const newStats = {
      totalPlans: plansData.length,
      draftPlans: 0,
      submittedPlans: 0,
      approvedPlans: 0,
      rejectedPlans: 0,
      totalBudget: 0,
      fundedBudget: 0,
      fundingGap: 0,
      organizationStats: {} as Record<string, any>,
      monthlySubmissions: {} as Record<string, number>
    };

    // Organization statistics
    const orgStats: Record<string, { planCount: number, approved: number, rejected: number, pending: number }> = {};

    plansData.forEach((plan: any) => {
      // Count by status
      switch (plan.status) {
        case 'DRAFT': 
          newStats.draftPlans++; 
          break;
        case 'SUBMITTED': 
          newStats.submittedPlans++; 
          break;
        case 'APPROVED': 
          newStats.approvedPlans++; 
          break;
        case 'REJECTED': 
          newStats.rejectedPlans++; 
          break;
      }

      // Monthly submission trends
      if (plan.submitted_at) {
        try {
          const month = format(new Date(plan.submitted_at), 'MMM yyyy');
          newStats.monthlySubmissions[month] = (newStats.monthlySubmissions[month] || 0) + 1;
        } catch (e) {
          console.warn('Error formatting date:', plan.submitted_at);
        }
      }

      // Organization statistics
      const orgName = plan.organizationName || 'Unknown Organization';
      
      if (!orgStats[orgName]) {
        orgStats[orgName] = { planCount: 0, approved: 0, rejected: 0, pending: 0 };
      }
      
      orgStats[orgName].planCount++;
      
      switch (plan.status) {
        case 'APPROVED':
          orgStats[orgName].approved++;
          break;
        case 'REJECTED':
          orgStats[orgName].rejected++;
          break;
        case 'SUBMITTED':
          orgStats[orgName].pending++;
          break;
      }
    });

    newStats.organizationStats = orgStats;
    
    console.log('📊 Calculated stats:', {
      total: newStats.totalPlans,
      draft: newStats.draftPlans,
      submitted: newStats.submittedPlans,
      approved: newStats.approvedPlans,
      rejected: newStats.rejectedPlans,
      orgs: Object.keys(orgStats).length
    });

    return newStats;
  };

  // Update stats when data changes
  useEffect(() => {
    if (allPlansData && Array.isArray(allPlansData)) {
      const calculatedStats = calculateStats(allPlansData);
      setStats(calculatedStats);
    }
  }, [allPlansData]);

  // Manual refresh function
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      await refetch();
      console.log('✅ Admin dashboard refreshed successfully');
    } catch (err: any) {
      console.error('❌ Admin refresh failed:', err);
      setError('Failed to refresh dashboard data');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Chart data for plan status distribution
  const planStatusChartData = {
    labels: ['Draft', 'Submitted', 'Approved', 'Rejected'],
    datasets: [
      {
        data: [stats.draftPlans, stats.submittedPlans, stats.approvedPlans, stats.rejectedPlans],
        backgroundColor: ['#9CA3AF', '#F59E0B', '#10B981', '#EF4444'],
        borderWidth: 2,
        borderColor: '#ffffff'
      }
    ]
  };

  // Chart data for organization submissions
  const organizationChartData = {
    labels: Object.keys(stats.organizationStats).slice(0, 10), // Top 10 orgs
    datasets: [
      {
        label: 'Total Plans',
        data: Object.values(stats.organizationStats).slice(0, 10).map((org: any) => org.planCount),
        backgroundColor: '#3B82F6',
        borderColor: '#1E40AF',
        borderWidth: 1
      },
      {
        label: 'Approved',
        data: Object.values(stats.organizationStats).slice(0, 10).map((org: any) => org.approved),
        backgroundColor: '#10B981',
        borderColor: '#059669',
        borderWidth: 1
      }
    ]
  };

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const label = context.label || '';
            const value = context.parsed || context.raw || 0;
            return `${label}: ${value}`;
          }
        }
      }
    }
  };

  // Helper function to format dates safely
  const formatDateSafe = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return 'Invalid date';
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-lg text-gray-600">Loading admin dashboard...</p>
          <p className="text-sm text-gray-500">Fetching all plans and statistics</p>
        </div>
      </div>
    );
  }

  // Error state
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
          <div className="flex items-center space-x-3">
            <select
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value as 'all' | '30d' | '90d')}
              className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="all">All Time</option>
              <option value="90d">Last 90 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
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
                <Clock className="h-6 w-6 text-amber-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Pending Review</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.submittedPlans}</dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-amber-50 px-5 py-3">
            <div className="text-sm">
              <span className="text-amber-600">Awaiting evaluation</span>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Approved Plans</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.approvedPlans}</dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-green-50 px-5 py-3">
            <div className="text-sm">
              <span className="text-green-600">
                {stats.totalPlans > 0 ? Math.round((stats.approvedPlans / stats.totalPlans) * 100) : 0}% approval rate
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Building2 className="h-6 w-6 text-blue-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Organizations</dt>
                  <dd className="text-lg font-medium text-gray-900">{Object.keys(stats.organizationStats).length}</dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-blue-50 px-5 py-3">
            <div className="text-sm">
              <span className="text-blue-600">Active planning units</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Plan Status Distribution */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <PieChart className="h-5 w-5 mr-2 text-blue-600" />
            Plan Status Distribution
          </h3>
          <div className="h-64">
            <Doughnut data={planStatusChartData} options={chartOptions} />
          </div>
        </div>

        {/* Organization Performance */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <BarChart3 className="h-5 w-5 mr-2 text-green-600" />
            Top Organizations by Plans
          </h3>
          <div className="h-64">
            <Bar data={organizationChartData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Organization Statistics Table */}
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
                  Success Rate
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(stats.organizationStats)
                .sort(([,a], [,b]) => (b as any).planCount - (a as any).planCount)
                .slice(0, 20) // Show top 20 organizations
                .map(([orgName, orgStats]) => {
                  const orgData = orgStats as any;
                  const successRate = orgData.planCount > 0 ? 
                    Math.round((orgData.approved / orgData.planCount) * 100) : 0;
                  
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
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                            <div 
                              className="bg-green-600 h-2 rounded-full" 
                              style={{ width: `${successRate}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-600">{successRate}%</span>
                        </div>
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
            <button
              onClick={() => navigate('/planning')}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              View All Plans →
            </button>
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Building2 className="h-4 w-4 text-gray-400 mr-2" />
                        <div className="text-sm font-medium text-gray-900">
                          {plan.organizationName || 'Unknown Organization'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {plan.planner_name || 'Unknown Planner'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {plan.type || 'Unknown Type'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        plan.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                        plan.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
                        plan.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {plan.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDateSafe(plan.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => navigate(`/plans/${plan.id}`)}
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
          <div className="text-center py-12">
            <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Plans Found</h3>
            <p className="text-gray-500">No plans have been created yet in the system.</p>
          </div>
        )}
      </div>

      {/* Summary Statistics */}
      <div className="mt-8 bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <TrendingUp className="h-5 w-5 mr-2 text-gray-600" />
            System Summary
          </h3>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.totalPlans}</div>
              <div className="text-sm text-gray-500">Total Plans Created</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{Object.keys(stats.organizationStats).length}</div>
              <div className="text-sm text-gray-500">Active Organizations</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {stats.totalPlans > 0 ? Math.round((stats.approvedPlans / stats.totalPlans) * 100) : 0}%
              </div>
              <div className="text-sm text-gray-500">Overall Success Rate</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;