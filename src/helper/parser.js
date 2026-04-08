import * as cheerio from 'cheerio';

/**
 * Enhanced Parser for Vikram
 * Splits everything—including brackets—into separate dishes.
 */
export const extractDishesFromHtml = (htmlString) => {
  if (!htmlString) return [];
  
  const $ = cheerio.load(htmlString); 
  const dishes = [];

  $('li, b, strong, a, p, span, div').each((_, el) => {
    const rawText = $(el).text();
    
    /**
     * SPLITTING LOGIC:
     * Splits by: OR, /, +, comma, AND the brackets [ or ] themselves.
     */
    const segments = rawText.split(/\sOR\s|\sor\s|\s\/\s|\/|\s\+\s|\+|,|\[|\]|\n/);

    segments.forEach(segment => {
      let cleaned = segment 
        .replace(/Day \d+-\d+/gi, '')           
        .replace(/View recipe/gi, '')         // Remove button text
        .replace(/\(Order Now\)/gi, '')        
        .replace(/\(Buy Here\)/gi, '')         
        .replace(/recipe-details\/\d+/g, '')   
        .replace(/\s+/g, ' ')                  
        .trim();

      // FILTRATION
      if (
        cleaned && 
        cleaned.length > 2 &&                  // Allowing shorter strings like "50g"
        !cleaned.includes('TIP:') && 
        !cleaned.toLowerCase().includes('click here') &&
        !cleaned.toLowerCase().includes('view recipe')
      ) {
        // Add brackets back around the ingredient notes for the AI
        const finalDish = segment.match(/\d/g) && !segment.includes('bowl') 
          ? `[${cleaned}]` 
          : cleaned;
          
        dishes.push(finalDish);
      }
    });
  });

  return [...new Set(dishes)]; 
};