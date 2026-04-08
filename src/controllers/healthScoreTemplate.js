// ```javascript
function generateEmailContent({
  weight_color,
  weight_difference,
  health_category,
  current_weight,
  ideal_weight,
  bmi,
  health_score,
  health_score_category,
  calculated_top,
  hs_color,
  counsellor_phone,
  user_name,
}) {
  // Input validation
  const requiredFields = [
    "weight_color",
    "weight_difference",
    "health_category",
    "current_weight",
    "ideal_weight",
    "bmi",
    "health_score",
    "health_score_category",
    "calculated_top",
  ];
  for (const field of requiredFields) {
    if (arguments[0][field] === undefined || arguments[0][field] === null) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  if (typeof calculated_top !== "number" || calculated_top < 0) {
    throw new Error("calculated_top must be a non-negative number");
  }

  // Compute scaled top position for media query
  const scaled_top = (calculated_top * 0.625).toFixed(2);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BN Health Score Report</title>
    <style type="text/css">
          @media screen and (max-width: 600px) {
            .main-container { max-width: 100% !important; margin: 0 !important; }
            h2 { font-size: 1rem !important; }
            p, div { font-size: 0.875rem !important; }
            a.button { padding: 0.75rem 1rem !important; font-size: 0.875rem !important;cursor:pointer; }
            img { max-width: 100% !important; height: auto !important; }
      a>img { max-width: 50% !important; height: auto !important; }
            .health-score-container { width: 100% !important; height: 150px !important; }
            .health-score-container div { font-size: 0.625rem !important; }
            .testimonial-img { width: 15rem !important; height: 15rem !important; }
          }
          @media screen and (max-width: 400px) {
            .health-score-container { height: 120px !important; }
            .gradient-bar { height: 100px !important; }
            .marker-bar { top: ${scaled_top}px !important; }
            .health-bar {width: 150px;}
          }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f4f4f4">
    <div
      class="main-container"
      style="
        max-width: 48rem;
        width: 100%;
        margin: 0 auto;
        background-color: #ffffff;
        padding: 1rem;
        box-sizing: border-box;
      "
    >
      <!-- Banner -->
      <div style="position: relative">
        <img
          src="https://www.bncleanse.com/images/cleanse/hs_report_banner.png"
          alt="Balance Nutrition Health Score Banner"
          style="width: 100%; height: auto; display: block"
          loading="lazy"
        />
      </div>

      <!-- BN Health Score Logo -->
      <div style="text-align: center; margin: 1.5rem 0">
        <div style="position: relative; display: inline-block">
          <img
            src="https://www.bncleanse.com/images/cleanse/hs_logo.png"
            alt="Balance Nutrition Logo"
            style="width: 200px; height: 50px; display: block"
            loading="lazy"
          />
        </div>
      </div>

      <!-- Introduction -->
      <div
        style="
          background-color: #f3f4f6;
          padding: 1.5rem;
          margin: 0 1rem 1.5rem;
          border-radius: 0.5rem;
          border: 1px solid #e5e7eb;
        "
      >
        <p style="margin: 0 0 0.75rem; font-size: 1rem; line-height: 1.5">
          Here is an analysis of your weight, health & risk factors.
        </p>
        <p style="margin: 0; font-size: 1rem; line-height: 1.5">
          The nutritionists at
          <span style="font-weight: 700">Balance Nutrition</span>
          have compiled a report for you with a
          <span style="font-weight: 700">'Unique Health Score'</span>. Take a
          look ☺
        </p>
      </div>

      <!-- Weight Report Section -->
      <div style="margin: 0 1rem 2rem">
        <h2
          style="
            font-size: 1.25rem;
            line-height: 1.75;
            font-weight: 700;
            margin: 0 0 1.25rem;
            text-align: center;
          "
        >
          <span style="color: #16a34a; margin-right: 0.5rem">🌱</span> Your
          Weight Report
        </h2>

        <div style="margin-bottom: 1rem">
          <span
            style="
              width: 0.5rem;
              height: 0.5rem;
              background-color: #000000;
              border-radius: 50%;
              margin: 0.5rem 0.75rem 0 0;
              display: inline-block;
              vertical-align: top;
            "
          ></span>
          <div
            style="
              display: inline;
              vertical-align: top;
              width: calc(100% - 1.25rem);
            "
          >
            As per your inputs, you are
            <span style="font-weight: 700; color: ${weight_color};"
              >${weight_difference}</span
            >
            kg
            <span
              style="font-weight: 700;"
              >away from ideal body weight.</span
            >.
          </div>
        </div>

        <div style="margin-bottom: 1rem">
          <span
            style="
              width: 0.5rem;
              height: 0.5rem;
              background-color: #000000;
              border-radius: 50%;
              margin: 0.5rem 0.75rem 0 0;
              display: inline-block;
              vertical-align: top;
            "
          ></span>
          <div
            style="
              display: inline;
              vertical-align: top;
              width: calc(100% - 1.25rem);
            "
          >
            Your current weight is:
            <span style="font-weight: 700">${parseFloat(
              current_weight
            )} kg</span>
          </div>
        </div>

        <div style="margin-bottom: 1rem">
          <span
            style="
              width: 0.5rem;
              height: 0.5rem;
              background-color: #000000;
              border-radius: 50%;
              margin: 0.5rem 0.75rem 0 0;
              display: inline-block;
              vertical-align: top;
            "
          ></span>
          <div
            style="
              display: inline;
              vertical-align: top;
              width: calc(100% - 1.25rem);
            "
          >
            Your ideal Body Weight should be:
            <span style="color: #16a34a; font-weight: 700"
              >${ideal_weight} kg</span
            >
          </div>
        </div>

        ${
          counsellor_phone
            ? `<div style="text-align: center; margin-top: 1.5rem">
          <a
            href="https://api.whatsapp.com/send/?phone=91${counsellor_phone}&text=Hi%2C+I+just+took+the+BN+Health+Score.+My+Name+is+${user_name}&type=phone_number&app_absent=0"
            target="_blank"
            class="button"
            style="
              background-color: #00a0b0;
              color: #ffffff;
              padding: 0.75rem 1.5rem;
              border-radius: 0.5rem;
              text-decoration: none;
              display: inline-block;
              font-size: 1rem;
              font-weight: 600;
              border: 1px solid #00848d;
            "
            onmouseover="this.style.backgroundColor='#00848d'; this.style.borderColor='#006d73';"
            onmouseout="this.style.backgroundColor='#00a0b0'; this.style.borderColor='#00848d';"
          >
            WhatsApp Our Expert
          </a>
        </div>`
            : ""
        }
      </div>

      <!-- BMI Report Section -->
      <div
        style="
          margin: 0 1rem 2rem;
          background-color: #e6f9fb;
          padding: 1.5rem;
          border-radius: 0.5rem;
          border: 1px solid #d1e7ee;
        "
      >
        <h2
          style="
            font-size: 1.25rem;
            line-height: 1.75;
            font-weight: 700;
            margin: 0 0 1.25rem;
            text-align: center;
          "
        >
          <span style="color: #16a34a; margin-right: 0.5rem">🌱</span> Your
          B.M.I Report
        </h2>

        <div style="margin-bottom: 1rem">
          <span
            style="
              color: #16a34a;
              font-weight: 700;
              margin-right: 0.75rem;
              display: inline;
              vertical-align: top;
            "
            >✓</span
          >
          <div
            style="
              display: inline;
              vertical-align: top;
              width: calc(100% - 1.25rem);
            "
          >
            Your B.M.I is
            <span style="color: #ef4444; font-weight: 700">${bmi}</span>
            kg/m².
          </div>
        </div>

        <div style="margin-bottom: 1rem">
          <span
            style="
              color: #16a34a;
              font-weight: 700;
              margin-right: 0.75rem;
              display: inline;
              vertical-align: top;
            "
            >✓</span
          >
          <div
            style="
              display: inline;
              vertical-align: top;
              width: calc(100% - 1.25rem);
            "
          >
            As per your B.M.I, you fall in
            <span
              style="font-weight: 700; text-transform: uppercase; color: ${weight_color};"
              >${health_category}</span
            >
            Category.
          </div>
        </div>

        <div style="text-align: center; margin: 1.5rem 0 0.75rem">
          <a
            href="https://www.balancenutrition.in/"
            class="button"
            style="
              background-color: #facc15;
              color: #000000;
              font-weight: 700;
              padding: 0.75rem 1.5rem;
              border-radius: 0.5rem;
              text-decoration: none;
              display: inline-block;
              font-size: 1rem;
              border: 1px solid #eab308;
            "
            onmouseover="this.style.backgroundColor='#eab308'; this.style.borderColor='#ca8a04';"
            onmouseout="this.style.backgroundColor='#facc15'; this.style.borderColor='#eab308';"
          >
            Book a Consultation
          </a>
        </div>
      </div>

      <!-- Health Score Section -->
      <div style="margin: 0 1rem 2rem">
        <h2
          style="
            font-size: 1.25rem;
            line-height: 1.75;
            font-weight: 700;
            margin: 0 0 1.25rem;
            text-align: center;
          "
        >
          <span style="color: #16a34a; margin-right: 0.5rem">🌱</span> Your BN
          Health Score
        </h2>

        <div style="margin-bottom: 1rem">
          <span
            style="
              width: 0.5rem;
              height: 0.5rem;
              background-color: #000000;
              border-radius: 50%;
              margin: 0.5rem 0.75rem 0 0;
              display: inline-block;
              vertical-align: top;
            "
          ></span>
          <div
            style="
              display: inline;
              vertical-align: top;
              width: calc(100% - 1.25rem);
            "
          >
            Based on the above results, your
            <span style="font-weight: 700">'BN - Health Score'</span> is:
          </div>
        </div>

        <div style="text-align: center; padding: 1rem 0">
          <div
            style="
              text-align: center;
              display: inline-block;
              margin-right: 2rem;
              vertical-align: top;
            "
          >
            <div
              style="
                color: ${hs_color};
                font-size: 4.5rem;
                line-height: 1.5;
                font-weight: 700;
              "
            >
              ${health_score}
            </div>
            <div
              style="
                font-size: 0.875rem;
                line-height: 1.5;
                font-weight: 700;
                text-transform: uppercase;
              "
            >
              ${health_score_category}
            </div>
          </div>

          <img
            class="health-bar"
            style="width: 200px"
            src="https://www.bncleanse.com/images/balance/hs_score_report.png"
          />
        </div>

        <div style="text-align: center">
          <a
            href="https://www.balancenutrition.in/how-we-work"
            class="button"
            style="
              background-color: #00a0b0;
              color: #ffffff;
              font-weight: 700;
              padding: 0.75rem 1.5rem;
              border-radius: 0.5rem;
              text-decoration: none;
              display: inline-block;
              font-size: 1rem;
              border: 1px solid #00848d;
            "
            onmouseover="this.style.backgroundColor='#00848d'; this.style.borderColor='#006d73';"
            onmouseout="this.style.backgroundColor='#00a0b0'; this.style.borderColor='#00848d';"
          >
            How We Work
          </a>
        </div>
      </div>

      <!-- What Should You Do Now -->
      <div
        style="
          margin: 0 1rem 2rem;
          background-color: #fffde7;
          padding: 1.5rem;
          border-radius: 0.5rem;
          border: 1px solid #fef9c3;
        "
      >
        <h2
          style="
            font-size: 1.25rem;
            line-height: 1.75;
            font-weight: 700;
            margin: 0 0 1.25rem;
          "
        >
          <span style="color: #16a34a; margin-right: 0.5rem">🌱</span> What
          Should You Do Now?
        </h2>

        <div style="margin-bottom: 1rem">
          <span
            style="
              color: #16a34a;
              font-weight: 700;
              margin-right: 0.75rem;
              display: inline;
              vertical-align: top;
            "
            >✓</span
          >
          <div
            style="
              display: inline;
              vertical-align: top;
              width: calc(100% - 1.25rem);
            "
          >
            Start with a diet & lifestyle plan. Take a look at
            <a
              href="http://www.balancenutrition.in"
              style="color: #3b82f6; text-decoration: none"
              onmouseover="this.style.textDecoration='underline';"
              onmouseout="this.style.textDecoration='none';"
              >www.balancenutrition.in</a
            >
            & check our Programs.
          </div>
        </div>

        <div style="margin-bottom: 1rem">
          <span
            style="
              color: #16a34a;
              font-weight: 700;
              margin-right: 0.75rem;
              display: inline;
              vertical-align: top;
            "
            >✓</span
          >
          <div
            style="
              display: inline;
              vertical-align: top;
              width: calc(100% - 1.25rem);
            "
          >
            Drink <span style="font-weight: 700">12 glasses</span> of water,
            limit to 1 tsp.
            <span style="font-weight: 700">visible sugar</span> a day, 1 fruit &
            1 raw vegetable.
          </div>
        </div>

        <div style="margin-bottom: 1rem">
          <span
            style="
              color: #16a34a;
              font-weight: 700;
              margin-right: 0.75rem;
              display: inline;
              vertical-align: top;
            "
            >✓</span
          >
          <div
            style="
              display: inline;
              vertical-align: top;
              width: calc(100% - 1.25rem);
            "
          >
            Speak to our <span style="font-weight: 700">Sr. Counsellor</span> @
            <a
              href="tel:9820455544"
              style="color: #3b82f6; text-decoration: none"
              onmouseover="this.style.textDecoration='underline';"
              onmouseout="this.style.textDecoration='none';"
              >9820455544</a
            >
            /
            <a
              href="tel:9152419847"
              style="color: #3b82f6; text-decoration: none"
              onmouseover="this.style.textDecoration='underline';"
              onmouseout="this.style.textDecoration='none';"
              >9152419847</a
            >.
          </div>
        </div>
      </div>

      <!-- Testimonial Section -->
      <div style="width: 100%; box-sizing: border-box">
        <h1
          style="
            font-size: 1.75rem;
            line-height: 2.25;
            text-align: center;
            text-decoration: underline;
            /* margin: 0 0 1.5rem; */
          "
        >
          🌱 They Started & Succeeded
        </h1>
        <div
          class="testimonial-img"
          style="
            width: 20rem;
            height: 20rem;
            margin: 1rem auto;
            padding: 1.25rem;
          "
        >
          <img
            src="https://bncleanse.com/images/aboutUs/khyati_hs2.png"
            alt="Khyati Rupani Testimonial"
            style="
              width: 100%;
              height: 100%;
              object-fit: cover;
              border-radius: 0.5rem;
              display: block;
            "
            loading="lazy"
          />
        </div>
        <div style="text-align: center; margin-bottom: 1rem">
          <span
            style="
              font-size: 2rem;
              line-height: 1;
              display: block;
              /* margin-bottom: 0.5rem; */
            "
            >Khyati Rupani</span
          >
          <span
            style="
              font-size: 1.5rem;
              line-height: 2;
              font-weight: 700;
              display: block;
              /* margin-bottom: 0.5rem; */
            "
            >Lost <b style="color: #16a34a">35</b> Kg</span
          >
          <span
            style="
              font-weight: 700;
              font-size: 1.5rem;
              line-height: 1;
              display: block;
              margin-bottom: 0.75rem;
            "
            >India</span
          >
          <a href="https://www.balancenutrition.in/testimonials"> <button
            class="button"
            type="button"
            style="
              padding: 0.75rem 1.5rem;
              font-size: 1rem;
              line-height: 1.5;
              font-weight: 700;
              background-color: #000000;
              color: #ffffff;
              border-radius: 0.5rem;
              border: none;
              cursor: pointer;
              display: inline-block;
            "
            onmouseover="this.style.backgroundColor='#333333';"
            onmouseout="this.style.backgroundColor='#000000';"
          >
           Know more
           </button>
           </a>
        </div>
      </div>

      <!-- Footer -->
      <div
        style="
          background-color: #00a0b0;
          color: #ffffff;
          padding: 1.5rem;
          text-align: center;
          border-top: 1px solid #00848d;
        "
      >
        <h2 style="font-size: 1.25rem; font-weight: 700; margin: 0 0 0.75rem">
          Need Assistance?
        </h2>

        <p style="margin: 0 0 1rem; font-size: 1rem; line-height: 1.5">
          📞
          <a
            href="tel:+919820455544"
            style="color: #ffffff; text-decoration: none"
            onmouseover="this.style.textDecoration='underline';"
            onmouseout="this.style.textDecoration='none';"
            >+91 9820455544</a
          >
          /
          <a
            href="tel:+919152419847"
            style="color: #ffffff; text-decoration: none"
            onmouseover="this.style.textDecoration='underline';"
            onmouseout="this.style.textDecoration='none';"
            >+91 9152419847</a
          >
        </p>

        <div style="text-align: center; margin-bottom: 1rem">
          <a
            href="https://in.linkedin.com/company/balance-nutrition-weight-loss-&-more"
            target="_blank"
            style="
              width: 2.5rem;
              height: 2.5rem;
              background-color: #ffffff;
              border-radius: 50%;
              display: inline-block;
              margin: 0 0.75rem;
              vertical-align: middle;
              border: 1px solid #e5e7eb;
            "
            onmouseover="this.style.backgroundColor='#e5e7eb'; this.style.borderColor='#d1d5db';"
            onmouseout="this.style.backgroundColor='#ffffff'; this.style.borderColor='#e5e7eb';"
          >
            <img
              src="https://bncleanse.com/images/aboutUs/li_brands.png"
              alt="Balance Nutrition LinkedIn"
              style="display: block; height: 20px; margin: 7px auto"
              loading="lazy"
            />
          </a>
          <a
            href="https://www.instagram.com/balancenutrition.in/"
            target="_blank"
            style="
              width: 2.5rem;
              height: 2.5rem;
              background-color: #ffffff;
              border-radius: 50%;
              display: inline-block;
              margin: 0 0.75rem;
              vertical-align: middle;
              border: 1px solid #e5e7eb;
            "
            onmouseover="this.style.backgroundColor='#e5e7eb'; this.style.borderColor='#d1d5db';"
            onmouseout="this.style.backgroundColor='#ffffff'; this.style.borderColor='#e5e7eb';"
          >
            <img
              src="https://bncleanse.com/images/aboutUs/instag_brands.png"
              alt="Balance Nutrition Instagram"
              style="display: block; height: 20px; margin: 7px auto"
              loading="lazy"
            />
          </a>
          <a
            href="https://www.youtube.com/channel/UCRBg_eWt2yJreg8AZXPGvKA"
            target="_blank"
            style="
              width: 2.5rem;
              height: 2.5rem;
              background-color: #ffffff;
              border-radius: 50%;
              display: inline-block;
              margin: 0 0.75rem;
              vertical-align: middle;
              border: 1px solid #e5e7eb;
            "
            onmouseover="this.style.backgroundColor='#e5e7eb'; this.style.borderColor='#d1d5db';"
            onmouseout="this.style.backgroundColor='#ffffff'; this.style.borderColor='#e5e7eb';"
          >
            <img
              src="https://bncleanse.com/images/aboutUs/youtube_brands.png"
              alt="Balance Nutrition YouTube"
              style="display: block; height: 20px; margin: 7px auto"
              loading="lazy"
            />
          </a>
        </div>

        <p style="margin: 0; font-size: 1rem; line-height: 1.5">
          <a
            href="https://www.balancenutrition.in"
            target="_blank"
            style="color: #ffffff; text-decoration: none"
            onmouseover="this.style.textDecoration='underline';"
            onmouseout="this.style.textDecoration='none';"
            >www.balancenutrition.in</a
          >
        </p>
      </div>
    </div>
  </body>
</html>
`;
}

export default generateEmailContent;
