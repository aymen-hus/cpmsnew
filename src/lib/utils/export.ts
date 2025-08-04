import { utils, writeFile } from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parse } from 'date-fns';

// Table headers in English and Amharic
const TABLE_HEADERS_EN = [
  'No.',
  'Strategic Objective',
  'Strategic Objective Weight',
  'Strategic Initiative',
  'Initiative Weight',
  'Performance Measure/Main Activity',
  'Weight',
  'Baseline',
  'Q1 Target',
  'Q2 Target',
  '6-Month Target',
  'Q3 Target',
  'Q4 Target',
  'Annual Target',
  'Implementor',
  'Budget Required',
  'Government',
  'Partners',
  'SDG',
  'Other',
  'Total Available',
  'Gap'
];

const TABLE_HEADERS_AM = [
  'ተ.ቁ',
  'ስትራቴጂክ ዓላማ',
  'የስትራቴጂክ ዓላማ ክብደት',
  'ስትራቴጂክ ተነሳሽነት',
  'የተነሳሽነት ክብደት',
  'የአፈጻጸም መለኪያ/ዋና እንቅስቃሴ',
  'ክብደት',
  'መነሻ',
  'የ1ኛ ሩብ ዓመት ዒላማ',
  'የ2ኛ ሩብ ዓመት ዒላማ',
  '6 ወር ዒላማ',
  'የ3ኛ ሩብ ዓመት ዒላማ',
  'የ4ኛ ሩብ ዓመት ዒላማ',
  'የዓመት ዒላማ',
  'ተግባሪ',
  'የሚያስፈልግ በጀት',
  'መንግስት',
  'አጋሮች',
  'SDG',
  'ሌላ',
  'ጠቅላላ ያለ',
  'ክፍተት'
];

// Function to check if a string contains Amharic characters
const containsAmharic = (text: string): boolean => {
  if (!text || typeof text !== 'string') return false;
  // Amharic Unicode range: \u1200-\u137F
  const amharicRegex = /[\u1200-\u137F]/;
  return amharicRegex.test(text);
};

// Helper function to format dates consistently
const formatDateString = (dateString: string): string => {
  try {
    // Check if it's already a date object
    if (dateString instanceof Date) {
      return format(dateString, 'MMM d, yyyy');
    }
    
    // Try to parse the date string
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return format(date, 'MMM d, yyyy');
    }
    
    return dateString;
  } catch (e) {
    console.error('Error formatting date:', e);
    return dateString;
  }
};

export const exportToExcel = async (
  data: any[], 
  fileName: string, 
  language: string = 'en',
  headerInfo?: {
    organization: string;
    planner: string;
    fromDate: string;
    toDate: string;
    planType: string;
  }
) => {
  // Select headers based on language
  const HEADERS = language === 'am' ? TABLE_HEADERS_AM : TABLE_HEADERS_EN;
  
  // Create a new workbook and worksheet
  const wb = utils.book_new();
  const ws = utils.aoa_to_sheet([]);
  
  // Add header information at the top
  const headerRows = [];
  
  // Title row
  headerRows.push([language === 'am' ? 'የጤና ሚኒስቴር - የዕቅድ ማጠቃለያ' : 'Ministry of Health - Plan Summary']);
  headerRows.push([]);  // Empty row for spacing
  
  // Header information rows
  if (headerInfo) {
    headerRows.push([language === 'am' ? 'ድርጅት:' : 'Organization:', headerInfo.organization]);
    headerRows.push([language === 'am' ? 'አቅጣጫ አውጭ:' : 'Planner:', headerInfo.planner]);
    headerRows.push([language === 'am' ? 'የዕቅድ ጊዜ:' : 'Period:', 
      `${formatDateString(headerInfo.fromDate)} to ${formatDateString(headerInfo.toDate)}`]);
    headerRows.push([language === 'am' ? 'የዕቅድ አይነት:' : 'Plan Type:', headerInfo.planType]);
    headerRows.push([]);  // Empty row before table headers
  }
  
  // Add table headers
  headerRows.push(HEADERS);
  
  // Add the header rows to the worksheet
  utils.sheet_add_aoa(ws, headerRows, { origin: 'A1' });
  
  // Calculate the starting row for data (after headers)
  const dataStartRow = headerRows.length;
  
  // Transform data to match table structure and add to worksheet
  const tableData = data.map(row => [
    row.No || '',
    row['Strategic Objective'] || '',
    row['Strategic Objective Weight'] || '',
    row['Strategic Initiative'] || '',
    row['Initiative Weight'] || '',
    row['Performance Measure/Main Activity'] || '',
    row.Weight || '',
    row.Baseline || '',
    row.Q1Target || '',
    row.Q2Target || '',
    row.SixMonthTarget || '',
    row.Q3Target || '',
    row.Q4Target || '',
    row.AnnualTarget || '',
    row.Implementor || '',
    formatCurrency(row.BudgetRequired),
    formatCurrency(row.Government),
    formatCurrency(row.Partners),
    formatCurrency(row.SDG),
    formatCurrency(row.Other),
    formatCurrency(row.TotalAvailable),
    formatCurrency(row.Gap)
  ]);
  
  // Add the data rows to the worksheet
  if (tableData.length > 0) {
    utils.sheet_add_aoa(ws, tableData, { origin: `A${dataStartRow + 1}` });
  }
  
  // Set up merges for header cells
  if (!ws['!merges']) ws['!merges'] = [];
  
  // Merge title cell across all columns
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 21 } });
  
  // Merge header label and value cells
  if (headerInfo) {
    // Organization row
    ws['!merges'].push({ s: { r: 2, c: 0 }, e: { r: 2, c: 0 } });  // Label
    ws['!merges'].push({ s: { r: 2, c: 1 }, e: { r: 2, c: 21 } }); // Value
    
    // Planner row
    ws['!merges'].push({ s: { r: 3, c: 0 }, e: { r: 3, c: 0 } });  // Label
    ws['!merges'].push({ s: { r: 3, c: 1 }, e: { r: 3, c: 21 } }); // Value
    
    // Period row
    ws['!merges'].push({ s: { r: 4, c: 0 }, e: { r: 4, c: 0 } });  // Label
    ws['!merges'].push({ s: { r: 4, c: 1 }, e: { r: 4, c: 21 } }); // Value
    
    // Plan type row
    ws['!merges'].push({ s: { r: 5, c: 0 }, e: { r: 5, c: 0 } });  // Label
    ws['!merges'].push({ s: { r: 5, c: 1 }, e: { r: 5, c: 21 } }); // Value
  }
  
  // Set column widths
  ws['!cols'] = [
    { wch: 5 },   // No
    { wch: 30 },  // Strategic Objective
    { wch: 10 },  // Strategic Objective Weight
    { wch: 25 },  // Strategic Initiative
    { wch: 10 },  // Initiative Weight
    { wch: 30 },  // Performance Measure/Main Activity
    { wch: 10 },  // Weight
    { wch: 15 },  // Baseline
    { wch: 10 },  // Q1 Target
    { wch: 10 },  // Q2 Target
    { wch: 10 },  // 6-Month Target
    { wch: 10 },  // Q3 Target
    { wch: 10 },  // Q4 Target
    { wch: 10 },  // Annual Target
    { wch: 20 },  // Implementor
    { wch: 15 },  // Budget Required
    { wch: 15 },  // Government
    { wch: 15 },  // Partners
    { wch: 15 },  // SDG
    { wch: 15 },  // Other
    { wch: 15 },  // Total Available
    { wch: 15 },  // Gap
  ];

  utils.book_append_sheet(wb, ws, 'Plan');

  // Apply styles to all cells
  const range = utils.decode_range(ws['!ref'] || 'A1');
  const headerOffset = headerRows.length; // Offset for the header rows
  
  // Style all cells with borders and proper formatting
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell_ref = utils.encode_cell({ r: R, c: C });
      if (!ws[cell_ref]) {
        // Create empty cell if it doesn't exist
        ws[cell_ref] = { t: 's', v: '' };
      }
      
      // Initialize style object if it doesn't exist
      if (!ws[cell_ref].s) ws[cell_ref].s = {}; 
      
      // Add borders to all cells
      ws[cell_ref].s.border = {
        top: { style: 'thin', color: { rgb: "000000" } },
        bottom: { style: 'thin', color: { rgb: "000000" } },
        left: { style: 'thin', color: { rgb: "000000" } },
        right: { style: 'thin', color: { rgb: "000000" } }
      };

      // Style the title and header info rows
      if (R < headerOffset - 1) { // Title and header info
        if (R === 0) { // Title row
          if (!ws[cell_ref].s.font) ws[cell_ref].s.font = {};
          ws[cell_ref].s.font = { bold: true, sz: 14 };
          ws[cell_ref].s.fill = { fgColor: { rgb: "D0CECE" } }; // Light gray
          ws[cell_ref].s.font.color = { rgb: "000000" }; // Black text
          ws[cell_ref].s.alignment = { horizontal: 'center', vertical: 'center' };
        } else if (R > 1) { // Header info rows (skip the blank row)
          if (!ws[cell_ref].s.font) ws[cell_ref].s.font = {};
          ws[cell_ref].s.font = { bold: C % 2 === 0 }; // Bold the labels (every even column)
          if (C % 2 === 0) { // Header labels (left column)
            ws[cell_ref].s.fill = { fgColor: { rgb: "E2EFDA" } }; // Light green
            ws[cell_ref].s.alignment = { horizontal: 'left', vertical: 'center' };
          } else {
            ws[cell_ref].s.alignment = { horizontal: 'left', vertical: 'center' };
          }
        }
      }

      // Add background color to data header row
      if (R === headerOffset - 1) { // Header row
        if (!ws[cell_ref].s.fill) ws[cell_ref].s.fill = {};
        if (!ws[cell_ref].s.font) ws[cell_ref].s.font = {};
        if (!ws[cell_ref].s.alignment) ws[cell_ref].s.alignment = {};
        
        // Green header
        ws[cell_ref].s.fill.fgColor = { rgb: "C6E0B4" }; 
        ws[cell_ref].s.fill.patternType = 'solid';
        ws[cell_ref].s.font.bold = true;
        ws[cell_ref].s.font.color = { rgb: "000000" };
        ws[cell_ref].s.alignment.horizontal = 'center';
        ws[cell_ref].s.alignment.vertical = 'center';
        ws[cell_ref].s.alignment.wrapText = true;
      }
      
      // Style summary row if present
      if (R === range.e.r) { // Budget columns in the last row
        if (C >= 15) { // Only apply to budget columns (adjusted for new columns)
          if (!ws[cell_ref].s.fill) ws[cell_ref].s.fill = {};
          if (!ws[cell_ref].s.font) ws[cell_ref].s.font = {};
          
          ws[cell_ref].s.fill.fgColor = { rgb: "BDD7EE" }; // Darker blue for total
          ws[cell_ref].s.fill.patternType = 'solid';
          ws[cell_ref].s.font.bold = true;
        }
      } else if (R === range.e.r - 1) { // Funding distribution row
        if (C >= 15) { // Only apply to budget columns (adjusted for new columns)
          if (!ws[cell_ref].s.fill) ws[cell_ref].s.fill = {};
          if (!ws[cell_ref].s.font) ws[cell_ref].s.font = {};
          
          ws[cell_ref].s.fill.fgColor = { rgb: "D9E1F2" }; // Light blue
          ws[cell_ref].s.fill.patternType = 'solid';
          ws[cell_ref].s.font.bold = true;
        }
      }
      
      // Center align weight and number columns
      if (C === 2 || C === 4 || C === 6 || (C >= 8 && C <= 13)) {
        if (!ws[cell_ref].s.alignment) ws[cell_ref].s.alignment = {};
        ws[cell_ref].s.alignment.horizontal = 'center';
        if (C >= 8 && C <= 13) { // Number columns (targets)
          ws[cell_ref].s.alignment.vertical = 'center';
        }
      }
      
      // Right align budget columns
      if (C >= 15 && C <= 21) {
        if (!ws[cell_ref].s.alignment) ws[cell_ref].s.alignment = {};
        ws[cell_ref].s.alignment.horizontal = 'right';
        ws[cell_ref].s.alignment.vertical = 'center';
      }
    }
  }

  writeFile(wb, `${fileName}.xlsx`);
};

export const exportToPDF = async (
  data: any[], 
  fileName: string, 
  language: string = 'en',
  headerInfo?: { 
    organization: string;
    planner: string;
    fromDate: string;
    toDate: string;
    planType: string;
  }
) => {
  // Select headers based on language
  const HEADERS = language === 'am' ? TABLE_HEADERS_AM : TABLE_HEADERS_EN;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a3',
    putOnlyUsedFonts: true
  });
  
  // Add fonts that support Amharic
  doc.setFont("helvetica", "normal");
  
  // Set initial position and title text
  let yPos = 20;
  const titleText = language === 'am' ? 'የጤና ሚኒስቴር - የዕቅድ ማጠቃለያ' : 'Ministry of Health - Plan Summary';
  const dateText = language === 'am' ? `የተዘጋጀበት ቀን: ${format(new Date(), 'PPP')}` : `Generated on: ${format(new Date(), 'PPP')}`;
  
  // Add title with larger font
  doc.setFontSize(18);
  doc.text(titleText, doc.internal.pageSize.width / 2, yPos, { align: 'center' });
  
  // Add date with smaller font
  yPos += 10;
  doc.setFontSize(10);
  doc.text(dateText, doc.internal.pageSize.width / 2, yPos, { align: 'center' });
  
  // Add plan information
  yPos += 10;
  if (headerInfo) {
    const orgLabel = language === 'am' ? 'ድርጅት:' : 'Organization:';
    const plannerLabel = language === 'am' ? 'አቅጣጫ አውጪ:' : 'Planner:';
    const periodLabel = language === 'am' ? 'የዕቅድ ጊዜ:' : 'Period:';
    const typeLabel = language === 'am' ? 'የዕቅድ አይነት:' : 'Plan Type:';
    
    doc.setFontSize(11);
    
    // Organization
    doc.text(`${orgLabel} ${headerInfo.organization}`, 20, yPos);
    yPos += 7;
    
    // Planner
    doc.text(`${plannerLabel} ${headerInfo.planner}`, 20, yPos);
    yPos += 7;
    
    // Period
    const periodText = `${periodLabel} ${formatDateString(headerInfo.fromDate)} to ${formatDateString(headerInfo.toDate)}`;
    doc.text(periodText, 20, yPos);
    yPos += 7;
    
    // Plan Type
    doc.text(`${typeLabel} ${headerInfo.planType}`, 20, yPos);
    yPos += 10;
  }

  // Transform data to match table structure
  const tableData = data.map(row => [
    row.No || '',
    row['Strategic Objective'] || '',
    row['Strategic Objective Weight'] || '',
    row['Strategic Initiative'] || '',
    row['Initiative Weight'] || '',
    row['Performance Measure/Main Activity'] || '',
    row.Weight || '',
    row.Baseline || '',
    row.Q1Target || '',
    row.Q2Target || '',
    row.SixMonthTarget || '',
    row.Q3Target || '',
    row.Q4Target || '',
    row.AnnualTarget || '',
    row.Implementor || '',
    formatCurrency(row.BudgetRequired),
    formatCurrency(row.Government),
    formatCurrency(row.Partners),
    formatCurrency(row.SDG),
    formatCurrency(row.Other),
    formatCurrency(row.TotalAvailable),
    formatCurrency(row.Gap)
  ]);

  // Add table
  autoTable(doc, {
    head: [HEADERS.map(header => ({
      content: header,
      styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' }
    }))],
    body: tableData,
    startY: yPos,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: {
      fillColor: [0, 100, 0],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      cellPadding: 3
    },
    columnStyles: {
      0: { cellWidth: 30 },     // No
      1: { cellWidth: 100 },    // Strategic Objective
      2: { cellWidth: 40 },     // Strategic Objective Weight
      3: { cellWidth: 80 },     // Strategic Initiative
      4: { cellWidth: 30 },     // Initiative Weight
      5: { cellWidth: 100 },    // Performance Measure/Main Activity
      6: { cellWidth: 30 },     // Weight
      7: { cellWidth: 40 },     // Baseline
      8: { cellWidth: 30 },     // Q1 Target
      9: { cellWidth: 30 },     // Q2 Target
      10: { cellWidth: 35 },    // 6-Month Target
      11: { cellWidth: 30 },    // Q3 Target
      12: { cellWidth: 30 },    // Q4 Target
      13: { cellWidth: 35 },    // Annual Target
      14: { cellWidth: 60 },    // Implementor
      15: { cellWidth: 40 },    // Budget Required
      16: { cellWidth: 40 },    // Government
      17: { cellWidth: 40 },    // Partners
      18: { cellWidth: 40 },    // SDG
      19: { cellWidth: 40 },    // Other
      20: { cellWidth: 45 },    // Total Available
      21: { cellWidth: 40 }     // Gap
    },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { top: 10, right: 10, bottom: 10, left: 10 },
    
    didParseCell: function(data) {
      // Style the header rows
      if (data.section === 'head') {
        data.cell.styles.fillColor = [0, 100, 0];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.halign = 'center';
        data.cell.styles.valign = 'middle';
      }
      
      // Style budget columns
      if (data.section === 'body' && data.column.index >= 15) {
        data.cell.styles.halign = 'right';
      }

      // Center align targets and weight columns
      if (data.section === 'body' && 
         (data.column.index === 2 || data.column.index === 4 || data.column.index === 6 || 
         (data.column.index >= 8 && data.column.index <= 13))) {
        data.cell.styles.halign = 'center';
      }
      
      // Style summary row
      if (data.section === 'body' && data.row.index === data.table.body.length - 1) {
        data.cell.styles.fillColor = [189, 215, 238]; // Darker blue for totals
        data.cell.styles.fontStyle = 'bold';
      }
      // Style distribution percentages row
      else if (data.section === 'body' && data.row.index === data.table.body.length - 2) {
        data.cell.styles.fillColor = [217, 225, 242]; // Light blue for percentages
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });
  
  // Add page numbers
  const pageCount = doc.internal.getNumberOfPages();
  for(let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 20, doc.internal.pageSize.height - 10);
  }
  
  // Create blob for download
  const pdfOutput = doc.output('blob');
  const url = URL.createObjectURL(pdfOutput);
  
  // Create link and trigger download
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();  
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Helper function to format currency values
export const formatCurrency = (value: any): string => {
  if (!value || value === 'N/A') return '-';
  
  // Convert to number if it's a string
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  // Check if it's a valid number
  if (isNaN(numValue)) return '-';
  
  // Format with $ and thousand separators
  return `$${numValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Process plan data for export format
export const processDataForExport = (objectives: any[], language: string = 'en'): any[] => {
  const exportData: any[] = [];
  
  if (!objectives || !Array.isArray(objectives)) {
    return exportData;
  }

  // Grand totals for the summary row
  let grandTotalRequired = 0;
  let grandTotalGovernment = 0;
  let grandTotalPartners = 0;
  let grandTotalSDG = 0;
  let grandTotalOther = 0;
  
  // Process each objective
  objectives.forEach((objective, objIndex) => {
    if (!objective) return;
    
    // Calculate objective weight by summing all initiative weights
    const calculatedObjectiveWeight = objective.initiatives?.reduce((sum, initiative) => {
      return sum + (Number(initiative.weight) || 0);
    }, 0) || 0;
    
    // Track if we've added the objective information
    let objectiveAdded = false;
    
    // Handle initiatives
    if (objective.initiatives && Array.isArray(objective.initiatives)) {
      objective.initiatives.forEach(initiative => {
        if (!initiative) return;
        
        // Track if we've added the initiative information for this objective
        let initiativeAddedForObjective = false;
        
        // Handle performance measures
        if (initiative.performance_measures && Array.isArray(initiative.performance_measures)) {
          initiative.performance_measures.forEach((measure, measureIndex) => {
            if (!measure) return;
            
            // Calculate 6-month target based on target type
            const sixMonthTarget = measure.target_type === 'cumulative' 
              ? Number(measure.q1_target || 0) + Number(measure.q2_target || 0) 
              : Number(measure.q2_target || 0);
            
            exportData.push({
              No: objectiveAdded ? '' : (objIndex + 1).toString(),
              'Strategic Objective': objectiveAdded ? '' : (objective.title || 'Untitled Objective'),
              'Strategic Objective Weight': objectiveAdded ? '' : `${effectiveWeight}%`,
              'Strategic Initiative': initiativeAddedForObjective ? '' : (initiative.name || 'Untitled Initiative'),
              'Initiative Weight': initiativeAddedForObjective ? '' : `${initiative.weight || 0}%`,
              'Performance Measure/Main Activity': measure.name,
              'Weight': `${measure.weight}%`,
              'Baseline': measure.baseline || '-',
              'Q1Target': measure.q1_target || 0,
              'Q2Target': measure.q2_target || 0,
              'SixMonthTarget': sixMonthTarget,
              'Q3Target': measure.q3_target || 0,
              'Q4Target': measure.q4_target || 0,
              'AnnualTarget': measure.annual_target || 0,
              'Implementor': initiative.organization_name || '-',
              'BudgetRequired': '-',
              'Government': '-',
              'Partners': '-',
              'SDG': '-',
              'Other': '-',
              'TotalAvailable': '-',
              'Gap': '-'
            });
            
            objectiveAdded = true;
            initiativeAddedForObjective = true;
          });
        }
        
        // Handle main activities
        if (initiative.main_activities && Array.isArray(initiative.main_activities)) {
          initiative.main_activities.forEach(activity => {
            if (!activity) return;
            
            // Calculate budget values
            let budgetRequired = 0;
            let government = 0;
            let partners = 0;
            let sdg = 0;
            let other = 0;
            let totalAvailable = 0;
            let gap = 0;
            
            if (activity.budget) {
              // Determine which estimated cost to use
              budgetRequired = activity.budget.budget_calculation_type === 'WITH_TOOL' ? 
                Number(activity.budget.estimated_cost_with_tool || 0) : 
                Number(activity.budget.estimated_cost_without_tool || 0);
              
              // Get funding values
              government = Number(activity.budget.government_treasury || 0);
              partners = Number(activity.budget.partners_funding || 0);
              sdg = Number(activity.budget.sdg_funding || 0);
              other = Number(activity.budget.other_funding || 0);
              
              // Calculate totals
              totalAvailable = government + partners + sdg + other;
              gap = Math.max(0, budgetRequired - totalAvailable);
              
              // Add to grand totals
              grandTotalRequired += budgetRequired;
              grandTotalGovernment += government;
              grandTotalPartners += partners;
              grandTotalSDG += sdg;
              grandTotalOther += other;
            }
            
            // Calculate 6-month target based on target type
            const sixMonthTarget = activity.target_type === 'cumulative' 
              ? Number(activity.q1_target || 0) + Number(activity.q2_target || 0) 
              : Number(activity.q2_target || 0);
            
            exportData.push({
              No: objectiveAdded ? '' : (objIndex + 1).toString(),
              'Strategic Objective': objectiveAdded ? '' : (objective.title || 'Untitled Objective'),
              'Strategic Objective Weight': objectiveAdded ? '' : `${effectiveWeight}%`,
              'Strategic Initiative': initiativeAddedForObjective ? '' : (initiative.name || 'Untitled Initiative'),
              'Initiative Weight': initiativeAddedForObjective ? '' : `${initiative.weight || 0}%`,
              'Performance Measure/Main Activity': activity.name,
              'Weight': `${activity.weight}%`,
              'Baseline': activity.baseline || '-',
              'Q1Target': activity.q1_target || 0,
              'Q2Target': activity.q2_target || 0,
              'SixMonthTarget': sixMonthTarget,
              'Q3Target': activity.q3_target || 0,
              'Q4Target': activity.q4_target || 0,
              'AnnualTarget': activity.annual_target || 0,
              'Implementor': initiative.organization_name || '-',
              'BudgetRequired': budgetRequired,
              'Government': government,
              'Partners': partners,
              'SDG': sdg,
              'Other': other,
              'TotalAvailable': totalAvailable,
              'Gap': gap
            });
            
            objectiveAdded = true;
            initiativeAddedForObjective = true;
          });
        }
        
        // If no measures or activities were added, add at least the initiative
        if (!initiativeAddedForObjective) {
          exportData.push({
            No: objectiveAdded ? '' : (objIndex + 1).toString(),
            'Strategic Objective': objectiveAdded ? '' : (objective.title || 'Untitled Objective'),
            'Strategic Objective Weight': objectiveAdded ? '' : `${effectiveWeight}%`,
            'Strategic Initiative': initiative.name || 'Untitled Initiative',
            'Initiative Weight': `${initiative.weight || 0}%`,
            'Performance Measure/Main Activity': initiative.name || 'Untitled Initiative',
            'Weight': `${initiative.weight}%`,
            'Baseline': '-',
            'Q1Target': '-',
            'Q2Target': '-',
            'SixMonthTarget': '-',
            'Q3Target': '-',
            'Q4Target': '-',
            'AnnualTarget': '-',
            'Implementor': initiative.organization_name || '-',
            'BudgetRequired': '-',
            'Government': '-',
            'Partners': '-',
            'SDG': '-',
            'Other': '-',
            'TotalAvailable': '-',
            'Gap': '-'
          });
          
          objectiveAdded = true;
        }
      });
    }
    
    // If objective has no initiatives, add a row for the objective
    if (!objectiveAdded) {
      exportData.push({
        No: (objIndex + 1),
        'Strategic Objective': objective.title || 'Untitled Objective',
        'Strategic Objective Weight': `${effectiveWeight}%`,
        'Strategic Initiative': '-',
        'Initiative Weight': '-',
        'Performance Measure/Main Activity': '-',
        'Weight': '-',
        'Baseline': '-',
        'Q1Target': '-',
        'Q2Target': '-',
        'SixMonthTarget': '-',
        'Q3Target': '-',
        'Q4Target': '-',
        'AnnualTarget': '-',
        'Implementor': '-',
        'BudgetRequired': '-',
        'Government': '-',
        'Partners': '-',
        'SDG': '-',
        'Other': '-',
        'TotalAvailable': '-',
        'Gap': '-'
      });
    }
  });
  
  // Add summary row for budget totals
  const grandTotalAvailable = grandTotalGovernment + grandTotalPartners + grandTotalSDG + grandTotalOther;
  const grandTotalGap = Math.max(0, grandTotalRequired - grandTotalAvailable);
  
  // Add a summary row at the bottom
  exportData.push({
    No: '',
    'Strategic Objective': language === 'am' ? 'ጠቅላላ ድምር' : 'TOTAL BUDGET',
    'Strategic Objective Weight': '',
    'Strategic Initiative': '',
    'Initiative Weight': '',
    'Performance Measure/Main Activity': '',
    'Weight': '',
    'Baseline': '',
    'Q1Target': '',
    'Q2Target': '',
    'SixMonthTarget': '',
    'Q3Target': '',
    'Q4Target': '',
    'AnnualTarget': '',
    'Implementor': '',
    'BudgetRequired': grandTotalRequired,
    'Government': grandTotalGovernment,
    'Partners': grandTotalPartners,
    'SDG': grandTotalSDG,
    'Other': grandTotalOther,
    'TotalAvailable': grandTotalAvailable,
    'Gap': grandTotalGap
  });
  
  // Add funding distribution percentages if there's any funding
  if (grandTotalAvailable > 0) {
    exportData.push({
      No: '',
      'Strategic Objective': language === 'am' ? 'የገንዘብ ድልድል (%)' : 'FUNDING DISTRIBUTION (%)',
      'Strategic Objective Weight': '',
      'Strategic Initiative': '',
      'Initiative Weight': '',
      'Performance Measure/Main Activity': '',
      'Weight': '',
      'Baseline': '',
      'Q1Target': '',
      'Q2Target': '',
      'SixMonthTarget': '',
      'Q3Target': '',
      'Q4Target': '',
      'AnnualTarget': '',
      'Implementor': '',
      'BudgetRequired': '100%',
      'Government': grandTotalAvailable > 0 ? `${((grandTotalGovernment / grandTotalAvailable) * 100).toFixed(1)}%` : '0%',
      'Partners': grandTotalAvailable > 0 ? `${((grandTotalPartners / grandTotalAvailable) * 100).toFixed(1)}%` : '0%',
      'SDG': grandTotalAvailable > 0 ? `${((grandTotalSDG / grandTotalAvailable) * 100).toFixed(1)}%` : '0%',
      'Other': grandTotalAvailable > 0 ? `${((grandTotalOther / grandTotalAvailable) * 100).toFixed(1)}%` : '0%',
      'TotalAvailable': grandTotalRequired > 0 ? `${((grandTotalAvailable / grandTotalRequired) * 100).toFixed(1)}%` : '0%',
      'Gap': grandTotalRequired > 0 ? `${((grandTotalGap / grandTotalRequired) * 100).toFixed(1)}%` : '0%'
    });
  }

  return exportData;
};