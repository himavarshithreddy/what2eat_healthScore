const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

// Helper function to parse nutrition values
function parseNutritionValue(value) {
  // Extract numeric value from strings like "5g", "100mg", etc.
  const numericPart = value.toString().replace(/[^0-9.]/g, '');
  return parseFloat(numericPart) || 0;
}

// Nutri-Score Calculation Function
async function calculateHealthScore(productId) {
  // Get product document
  const productRef = db.collection('products').doc(productId);
  const productDoc = await productRef.get();
  
  if (!productDoc.exists) {
    throw new Error('Product not found');
  }

  const productData = productDoc.data();
  const nutritionInfo = productData.nutritionInfo || {};

  // Parse nutritional values
  const energy = parseNutritionValue(nutritionInfo.energy || '0');
  const sugars = parseNutritionValue(nutritionInfo.sugars || '0');
  const sodium = parseNutritionValue(nutritionInfo.sodium || '0');
  const fiber = parseNutritionValue(nutritionInfo.fiber || '0');
  const protein = parseNutritionValue(nutritionInfo.protein || '0');
  
  // Fruits/Vegetables/Nuts percentage
  const fruitsVegetablesNuts = parseNutritionValue(
    nutritionInfo.fruitsVegetablesNuts || '0'
  );

  // Get saturated fat from custom fields (adjust based on your data structure)
  const saturatedFat = parseNutritionValue(
    nutritionInfo.customNutritionFields?.saturatedFat || '0'
  );

  // Calculate Negative Points
  let negativePoints = 0;
  
  // Energy (convert kcal to numerical value)
  const energyKcal = parseNutritionValue(energy.toString());
  if (energyKcal > 335) negativePoints += 1;
  if (energyKcal > 670) negativePoints += 1;
  if (energyKcal > 1005) negativePoints += 1;
  if (energyKcal > 1340) negativePoints += 1;
  if (energyKcal > 1675) negativePoints += 1;

  // Sugars
  if (sugars > 4.5) negativePoints += 1;
  if (sugars > 9) negativePoints += 1;
  if (sugars > 13.5) negativePoints += 1;
  if (sugars > 18) negativePoints += 1;
  if (sugars > 22.5) negativePoints += 1;

  // Saturated Fat
  if (saturatedFat > 1) negativePoints += 1;
  if (saturatedFat > 2) negativePoints += 1;
  if (saturatedFat > 3) negativePoints += 1;
  if (saturatedFat > 4) negativePoints += 1;
  if (saturatedFat > 5) negativePoints += 1;

  // Sodium
  if (sodium > 90) negativePoints += 1;
  if (sodium > 180) negativePoints += 1;
  if (sodium > 270) negativePoints += 1;
  if (sodium > 360) negativePoints += 1;
  if (sodium > 450) negativePoints += 1;

  // Calculate Positive Points
  let positivePoints = 0;
  
  // Fruits/Vegetables/Nuts
  if (fruitsVegetablesNuts > 40) positivePoints += 1;
  if (fruitsVegetablesNuts > 60) positivePoints += 1;
  if (fruitsVegetablesNuts > 80) positivePoints += 1;

  // Fiber
  if (fiber > 0.9) positivePoints += 1;
  if (fiber > 1.9) positivePoints += 1;
  if (fiber > 2.8) positivePoints += 1;
  if (fiber > 3.7) positivePoints += 1;
  if (fiber > 4.7) positivePoints += 1;

  // Protein
  if (protein > 1.6) positivePoints += 1;
  if (protein > 3.2) positivePoints += 1;
  if (protein > 4.8) positivePoints += 1;
  if (protein > 6.4) positivePoints += 1;
  if (protein > 8.0) positivePoints += 1;

  // Calculate Final Score
  const nutriScore = negativePoints - positivePoints;

  // Normalize to 0-100 scale (higher = healthier)
  const minScore = -15;
  const maxScore = 40;
  const healthScore = Math.round(
    ((nutriScore - minScore) / (maxScore - minScore)) * 100
  );

  // Update the product document
  await productRef.update({
    healthScore: 100 - healthScore, // Invert the score
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return 100 - healthScore;
}

// Firebase Cloud Function
exports.calculateProductHealthScore = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(400).send('Only POST requests are accepted');
    }

    const { productId } = req.body;
    if (!productId) {
      return res.status(400).send('Product ID is required');
    }

    const healthScore = await calculateHealthScore(productId);
    res.status(200).json({ productId, healthScore });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send(`Error processing request: ${error.message}`);
  }
});