// Quick API test to verify Phase 3 response shape
const response = await fetch('http://localhost:3000/api/v1/diet-audit/run-safety-check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: '00431', diet_id: 770 })
});
const json = await response.json();
const ar = json.data.audit_results;
console.log('TOTAL CONFLICTS:', ar.length);
ar.forEach((c, i) => {
  console.log(`--- CONFLICT ${i + 1} ---`);
  console.log('  dish:', c.dish_name);
  console.log('  ingredient:', c.conflicting_ingredient);
  console.log('  type:', c.conflict_type);
  console.log('  has_suggestion:', !!c.suggestion);
  if (c.suggestion) {
    console.log('  sug_type:', c.suggestion.type);
    console.log('  swap_instruction:', c.suggestion.swap_instruction);
    if (c.suggestion.alternative_dishes) {
      console.log('  alternatives:', c.suggestion.alternative_dishes.length);
      c.suggestion.alternative_dishes.forEach(alt => {
        console.log(`    - [${alt.recipe_id}] ${alt.title} (${alt.slug})`);
      });
    }
  }
});
