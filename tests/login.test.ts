import { test, expect, Page } from '@playwright/test'
import fs from 'fs'
import Papa from 'papaparse'

interface Row {
    brand: string
    revenue: string
    note: string
}

// Function to load csv file
export function loadCsv(filePath: string) {
    let rows: Row[] = []
    try {
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`)
            return rows
        }
        const csvRaw = fs.readFileSync(filePath, 'utf8')
        const parsed = Papa.parse(csvRaw, { header: true })
        rows = parsed.data.map((row: any) => {
            return {
                brand: row['Brand'] || '',
                revenue: row['Revenue'] || '',
                note: row['Note'] || ''
            }
        })
        console.log(`Loaded ${rows.length} brands from ${filePath}`);
    } catch (error) {
        console.error('Error reading CSV file:', error)
    }
    return rows
  }
  
// Function to save csv file
export function saveCsv(filePath: string, rows: Row[]) {
    // Ensure all rows have all headers (fill missing with empty string)
    const fullRows: Record<string, string>[] = rows.map(row => {
      const complete: Record<string, string>  = {
        'Brand': row.brand || '',
        'Revenue': row.revenue || '',
        'Note': row.note || ''
      }
        return complete;
    });
  
    const csv = Papa.unparse(fullRows);
    fs.writeFileSync(filePath, csv, 'utf8');
  }

const searchSingleBrand = async (page: Page, brand: string) => {
    // Navigate to the Helium 10 Black Box Products page
    await page.goto('https://members.helium10.com/black-box/products?accountId=1544840464')
    await page.waitForTimeout(3000); // Wait for 3 seconds to ensure the page is loaded
    
    // Fill exact name brand search input
    await page.fill('input[data-testid="exactbrandsearch"]', brand);
    await page.click('button[data-testid="search"]');
    
    // Wait until the search results are loaded (ASIN Revenue should be visible)
    // Wait for 10 seconds only, if not visible, return 0
    try {
        await page.waitForSelector('div[data-field-name="childMonthlyRevenue"] div:has-text("ASIN Revenue")', {
            timeout: 10000 // 10 seconds
        });
    } catch (error) {
        console.error(`Error waiting for ASIN Revenue: ${error}`);
        return 'error';
    }

    // If there is no table cell with data-testid="table-cell-childMonthlyRevenue", return
    const revenueCell = await page.locator('div[data-testid="table-cell-childMonthlyRevenue"]')
    if (!(await revenueCell.count())) {
        return '';
    }
    
    // Click on "ASIN Revenue" to sort by revenue
    await page.click('div[data-field-name="childMonthlyRevenue"] div:has-text("ASIN Revenue")');


    // Get the monthly revenue value from the first row
    const revenue = await page.locator('div[data-testid="table-cell-childMonthlyRevenue"]').first().textContent();
    return revenue || ''
}

// Need to run 'npm run login' to generate auth.json file
// Close browser after login to save session
test.use({ storageState: 'auth.json' }) // load saved session

test('Use Exact Name Brand Search', async ({ page }) => {
    test.setTimeout(0)
    // Load csv file from '../brand.csv'
    const filePath = './brands.csv'
    const rows = loadCsv(filePath)

    // For each row in the csv file, search for the brand and get the revenue
    // If any error occurs, save all processed rows to 'brands_saved.csv'
    try {
        for (const index in rows) { // Limit to first 100 rows for testing
            const row = rows[index];
            const brand = row.brand.trim();
            
            if (brand && row.revenue === '' && row.note === '') { // Only search if revenue is not already set
                // Remove any comment in ( ) and trim the brand name
                let formattedBrand = brand.replace(/\s*\(.*?\)\s*/g, '').trim();
                // If brand name is all cap, convert to title case
                const isAllCaps = formattedBrand === formattedBrand.toUpperCase();
                if (isAllCaps) {
                    const words = formattedBrand.split(' ');
                    const titleCasedBrand = words.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
                    formattedBrand = titleCasedBrand;
                }
                console.log("Searching brand:", formattedBrand, `(${index}/${rows.length})`);
                const revenue = await searchSingleBrand(page, formattedBrand);
                if (revenue && revenue !== '-') {
                    if (revenue === 'error') {
                        console.error(`Error retrieving revenue for brand: ${formattedBrand}`);
                        row.note = 'Error retrieving revenue';
                        continue; // Skip to the next brand
                    }
                    row.revenue = revenue;
                    console.log(`Found revenue for brand ${formattedBrand}:`, revenue);
                } else {
                    console.log(`No revenue found for brand ${formattedBrand}`);
                    row.note = 'No revenue found';
                }
                saveCsv(filePath, rows); // Save after each search to avoid losing progress
            } else {
                console.warn('Skipping brand:', brand, `it was sarched before (${index}/${rows.length})`);
            }
        }
    } catch (error) {
        console.error('Error during brand search:', error, 'saving processed rows to CSV');
        // Save the processed rows to a CSV file
        saveCsv(filePath, rows);
    }
    console.log("Finished searching brands, saving results...");
    // Save the updated rows to the original CSV file
    saveCsv(filePath, rows);
})