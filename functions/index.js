const functions = require("firebase-functions");

// Unit conversion handler with field name flexibility
function parseNutritionValue(rawValue, nutrientType) {
  if (!rawValue) return 0;
  
  const strValue = rawValue.toString().trim();
  const matches = strValue.match(/([0-9.]+)([a-zA-Z%]*)/);
  if (!matches) return 0;

  const value = parseFloat(matches[1]);
  const unit = matches[2].toLowerCase();

  switch (nutrientType) {
    case 'energy':
      return unit === 'kj' ? value / 4.184 : value; // kJ to kcal

    case 'sodium':
      return unit === 'g' ? value * 1000 : value; // g to mg

    case 'mass':
      if (unit === 'mg') return value / 1000; // mg to g
      if (unit === 'mcg') return value / 1_000_000; // mcg to g
      return value;

    case 'percentage':
      return unit === '%' ? value : 0;

    default:
      return value;
  }
}

// Negative Points Calculation
function calculateNegativePoints(nutrition, isBeverage = 0) {
  // Handle field name variations
  const energy = parseNutritionValue(nutrition.energy || '0', 'energy');
  const sugarsValue = nutrition.TotalSugars || nutrition.sugars || '0';
  const sugars = parseNutritionValue(sugarsValue, 'mass');
  const saturatedFat = parseNutritionValue(nutrition.saturatedFat || '0', 'mass');
  const sodium = parseNutritionValue(nutrition.sodium || '0', 'sodium');

  let energyThresholds, sugarsThresholds, satFatThresholds, sodiumThresholds;

  if (isBeverage) {
    // Beverage thresholds (per 100ml)
    energyThresholds = [7.2, 14.3, 21.5, 28.5, 35.9, 43.0, 50.2, 57.4, 64.5];
    sugarsThresholds = [0, 1.5, 3.0, 4.5, 6.0, 7.5, 9.0, 10.5, 12.0, 13.5];
    satFatThresholds = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    sodiumThresholds = [0, 45, 90, 135, 180, 225, 270, 315, 360, 405];
  } else {
    // Food thresholds (per 100g)
    energyThresholds = [80, 160, 240, 320, 400, 480, 560, 640, 720, 800];
    sugarsThresholds = [4.5, 9.0, 13.5, 18.0, 22.5, 27.0, 31.0, 36.0, 40.0, 45.0];
    satFatThresholds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    sodiumThresholds = [90, 180, 270, 360, 450, 540, 630, 720, 810, 900];
  }

  const energyPoints = energyThresholds.filter(t => energy > t).length;
  const sugarsPoints = sugarsThresholds.filter(t => sugars > t).length;
  const satFatPoints = satFatThresholds.filter(t => saturatedFat > t).length;
  const sodiumPoints = sodiumThresholds.filter(t => sodium > t).length;

  return energyPoints + sugarsPoints + satFatPoints + sodiumPoints;
}

// Positive Points Calculation
function calculatePositivePoints(nutrition, isBeverage = 0) {
  // Handle field name variations
  const fiberValue = nutrition.dietaryfiber || nutrition.fiber || '0';
  const fvln = parseNutritionValue(nutrition.fruitsVegetablesNuts || '0', 'percentage');
  const fiber = parseNutritionValue(fiberValue, 'mass');
  const protein = parseNutritionValue(nutrition.protein || '0', 'mass');

  // FVNL points (fruits, vegetables, nuts, legumes)
  let fvlnPoints = 0;
  if (fvln >= 80) fvlnPoints = 5;
  else if (fvln >= 60) fvlnPoints = 2;
  else if (fvln >= 40) fvlnPoints = 1;

  // Fiber thresholds (g/100g for both foods and beverages)
  const fiberThresholds = [0.7, 1.4, 2.1, 2.8, 3.5];
  const fiberPoints = fiberThresholds.filter(t => fiber > t).length;

  // Protein thresholds (g/100g for both foods and beverages)
  const proteinThresholds = [1.6, 3.2, 4.8, 6.4, 8.0];
  const proteinPoints = proteinThresholds.filter(t => protein > t).length;

  return {
    fvln: fvlnPoints,
    fiber: fiberPoints,
    protein: proteinPoints,
    total: fvlnPoints + fiberPoints + proteinPoints
  };
}

// Main calculation function
function calculateHealthScore(nutrition, isBeverage = 0) {
  const N = calculateNegativePoints(nutrition, isBeverage);
  const P = calculatePositivePoints(nutrition, isBeverage);

  // Calculate FSA-score
  let fsaScore;
  if (N < 11) {
    fsaScore = N - P.total;
  } else {
    fsaScore = P.fvln === 5 
      ? N - P.total 
      : N - (P.fvln + P.fiber);
  }

  // Normalize to 0-100 scale (higher = healthier)
  const minScore = -15;
  const maxScore = 40;
  const normalized = ((fsaScore - minScore) / (maxScore - minScore)) * 100;
  const healthScore = Math.round(100 - Math.min(100, Math.max(0, normalized)));

  return {
    healthScore,
    calculationDetails: {
      negativePoints: N,
      positivePoints: P.total,
      fsaScore
    }
  };
}

// Firebase HTTP Function with CORS
exports.calculateHealthScore = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).send('');
  }

  try {
    if (req.method !== 'POST') return res.status(400).send('POST required');
    
    const { nutrition, isBeverage } = req.body;
    if (!nutrition) return res.status(400).json({ error: 'Nutrition data required' });

    const isBeverageFlag = isBeverage ? 1 : 0; // Default to 0 if not provided
    const result = calculateHealthScore(nutrition, isBeverageFlag);
    res.json(result);
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});