@@ .. @@
   // Calculate comprehensive statistics
   const calculateStats = () => {
     if (!allPlansData || !Array.isArray(allPlansData)) {
       return {
         totalPlans: 0,
         draftPlans: 0,
         submittedPlans: 0,
         approvedPlans: 0,
         rejectedPlans: 0,
         eligiblePlansForBudget: 0,
         totalBudget: 0,
         fundedBudget: 0,
         fundingGap: 0,
         orgStats: {},
         monthlyTrends: {}
       };
     }

     const stats = {
       totalPlans: allPlansData.length,
       draftPlans: 0,
       submittedPlans: 0,
       approvedPlans: 0,
       rejectedPlans: 0,
       eligiblePlansForBudget: 0,
       totalBudget: 0,
       fundedBudget: 0,
       fundingGap: 0,
       orgStats: {} as Record<string, any>,
       monthlyTrends: {} as Record<string, number>
     };

     // Organization-wise statistics
     const orgBudgetMap: Record<string, { total: number, funded: number, gap: number, planCount: number }> = {};

     allPlansData.forEach(plan => {
       // Count by status
       switch (plan.status) {
         case 'DRAFT': stats.draftPlans++; break;
         case 'SUBMITTED': stats.submittedPlans++; break;
         case 'APPROVED': stats.approvedPlans++; break;
         case 'REJECTED': stats.rejectedPlans++; break;
       }

       // Monthly submission trends
       if (plan.submitted_at) {
         const month = format(new Date(plan.submitted_at), 'MMM yyyy');
         stats.monthlyTrends[month] = (stats.monthlyTrends[month] || 0) + 1;
       }

       // Organization statistics
       const orgName = plan.organizationName || 
         organizationsMap[plan.organization] || 
         `Organization ${plan.organization}`;

       if (!orgBudgetMap[orgName]) {
         orgBudgetMap[orgName] = { total: 0, funded: 0, gap: 0, planCount: 0 };
       }
       
       orgBudgetMap[orgName].planCount++;

       // Only include budget data for SUBMITTED or APPROVED plans
       if (plan.status === 'SUBMITTED' || plan.status === 'APPROVED') {
         stats.eligiblePlansForBudget++;
         
         // Use the calculated budget data from fetchCompleteBudgetData
         const planTotalBudget = Number(plan.budget_total || 0);
         const planFundedBudget = Number(plan.funded_total || 0);
         const planFundingGap = Number(plan.funding_gap || 0);

         stats.totalBudget += planTotalBudget;
         stats.fundedBudget += planFundedBudget;
         stats.fundingGap += planFundingGap;

         orgBudgetMap[orgName].total += planTotalBudget;
         orgBudgetMap[orgName].funded += planFundedBudget;
         orgBudgetMap[orgName].gap += planFundingGap;
       }
     });

     stats.orgStats = orgBudgetMap;

     return stats;
   };