const html = `Breakfast<br>
1 bowl chunky overnight oats [View recipe]
<br>OR<br>
2 zucchini and carrot pancake [View recipe]
<br>   OR <br>
1 portion BN-High Protein Quicky Upma <a href="https://shop.balancenutrition.in/product/xxx">(Order Now)</a>
OR
1 portion BN-Nutty Choco Cereal with milk <a href="https://shop.balancenutrition.in/product/yyy">(Order Now)</a>
OR
1 portion BN-Mango Cereal with milk <a href="https://shop.balancenutrition.in/product/zzz">(Order Now)</a>
<br>OR<br>
1 sachet BN-Gut Rebalance in 1 glass of water.<a href="https://shop.balancenutrition.in/product/abc">(Order Now)</a><br/>(Gut Rebalance Helps maintain Gut Microbiome Balance)
OR
1 sachet BN-Metabolic Boost in 1 glass of water.<a href="https://shop.balancenutrition.in/product/def">(Order Now)</a><br/>(Metabolic boost helps maintain gut microbiome balance...)`;

// Split by variations of OR (case sensitive OR, with or without <br>)
let chunks = html.split(/(?:<br\s*\/?>\s*)*\bOR\b(?:\s*<br\s*\/?>\s*)*/g);
let safeChunks = chunks.filter(c => !c.includes('shop.balancenutrition.in'));

console.log(safeChunks.join('<br>OR<br>'));
