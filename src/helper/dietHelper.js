import moment from "moment";
import { image_guide_base_url } from "./constant.js";
import { safeJSONParse } from "./commonHelper.js";

class DietUpperSection {
  constructor({ title, marquee_text, extra_params = {}, redirect_page = "" }) {
    this.title = title;
    this.marquee_text = marquee_text;
    this.params = {
      ...extra_params,
    };
    this.redirect_page = redirect_page;
  }
}
const buildDietUpperSection = ({ dietData }) => {
  console.log(dietData, 16);
  let upperSection = null;
  let show_button_1 = "5";

  const isCleanseProgram = dietData.program_sessions === 1;
  const cleanseDuration = Number(dietData.validity);
  const cleanseEndDay = isCleanseProgram
    ? cleanseDuration === 1
      ? 2
      : cleanseDuration === 3
        ? 4
        : 10
    : 10;
  // Welcome Call (same for all programs)
  if (Number(dietData.sent_sessions) === 1 && dietData.welcome_call == null) {
    show_button_1 = "1";
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%; font-size:16px"><b>Important Points Before You Start</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; font-size:16px"><p>**Use the BN <a style="color: blue; text-decoration: underline;">Eat-in-Portion</a> Guide to know the exact amounts & measurements. | ** The symbol “/“ in your diet chart stands for “or” and it means you can have either of the items in the menu mentioned. | ** You can view recipes directly by clicking on (view recipes) written after the menu.</p></div>`,
      extra_params: {
        link: `https://${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-eat-in-portions`,
        screen_title: "Ekit Eat In Portions",
      },
      redirect_page: "webview",
    });
    upperSection = upperSectionObj;
  }
  // Program Start Date (same for all programs)
  else if (
    Number(dietData.sent_sessions) === 1 &&
    Number(dietData.call_type) === 0 &&
    dietData.diet_sent_date &&
    !dietData.diet_start_date
  ) {
    show_button_1 = "2";
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%; font-size:16px"><b>Important Points Before You Start</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; font-size:16px"><p>**Use the BN <a style="color: blue; text-decoration: underline;">Eat-in-Portion</a> Guide to know the exact amounts & measurements. | ** The symbol “/“ in your diet chart stands for “or” and it means you can have either of the items in the menu mentioned. | ** You can view recipes directly by clicking on (view recipes) written after the menu.</p></div>`,
      extra_params: {
        link: `https://${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-eat-in-portions`,
        screen_title: "Ekit Eat In Portions",
      },
      redirect_page: "webview",
    });
    upperSection = upperSectionObj;
  }

  // Diet Start Date (same for all programs)
  else if (
    dietData.diet_start_date_set_by === "Default" &&
    moment().diff(moment(dietData.diet_sent_date), "days") <= 5
  ) {
    show_button_1 = "2";
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%; font-size:16px"><b>New Diet Session ${dietData.sent_sessions} Received!</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; font-size:16px"><p>Please fill out the session start date!</p></div>`,
      extra_params: {},
      redirect_page: "",
    });
    upperSection = upperSectionObj;
  }
  // Start Weight (same for all programs)
  else if (
    dietData.diet_start_date &&
    Number(dietData.sent_sessions) === 1 &&
    Number(dietData.start_session_weight) === 0
  ) {
    show_button_1 = "3";
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%;font-size:16px"><b>New Diet Session ${dietData.sent_sessions} Received!</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; font-size:16px"><p>Please fill out the session start weight!</p></div>`,
      extra_params: {},
      redirect_page: "",
    });
    upperSection = upperSectionObj;
  }
  // Start Inch (same for all programs)
  else if (
    dietData.diet_start_date &&
    Number(dietData.sent_sessions) === 1 &&
    Number(dietData.start_session_weight) !== 0 &&
    !dietData.inch_id
  ) {
    show_button_1 = "4";
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%;font-size:16px"><b>New Diet Session ${dietData.sent_sessions} Received!</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; font-size:16px"><p>Please fill out the session start inch!</p></div>`,
      extra_params: {},
      redirect_page: "",
    });
    upperSection = upperSectionObj;
  }
  // Mid Session Due (only for non-cleanse programs)
  else if (
    !isCleanseProgram &&
    dietData.diet_start_date &&
    Number(dietData.mid_session_weight) === 0 &&
    moment().isBetween(
      moment(dietData.diet_start_date).add(5, "days"),
      moment(dietData.diet_start_date).add(7, "days"),
      "days",
      "[]",
    ) &&
    dietData.inch_id
  ) {
    show_button_1 = "6";
    const midSessionDueDate = moment(dietData.diet_start_date).add(5, "days");
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%; padding: 0 10px; font-size:16px"><b>Mid Session Weight Update Due:</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; padding: 0 10px; font-size:16px"><p>Your Mid Session Weight update is due on ${midSessionDueDate.format(
        "Do MMMM YYYY",
      )}</p></div>`,
      extra_params: {},
      redirect_page: "",
    });
    upperSection = upperSectionObj;
  }
  // End-Session Weight Update Due
  else if (
    dietData.diet_start_date &&
    moment().diff(moment(dietData.diet_start_date), "days") === cleanseEndDay &&
    Number(dietData.end_session_weight) === 0
  ) {
    show_button_1 = "7";
    const endSessionDueDate = moment(dietData.diet_start_date).add(
      cleanseEndDay,
      "days",
    );
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%; font-size:16px"><b>End Session Weight Update Due:</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; font-size:16px"><p>Your End Session Weight update is due on ${endSessionDueDate.format(
        "Do MMMM YYYY",
      )}</p></div>`,
      extra_params: {},
      redirect_page: "",
    });
    upperSection = upperSectionObj;
  }
  // Weight Overdue
  else if (
    dietData.diet_start_date &&
    moment().diff(moment(dietData.diet_start_date), "days") > cleanseEndDay &&
    Number(dietData.end_session_weight) === 0
  ) {
    show_button_1 = "7";
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%;font-size:16px"><b>Weight Update <span style="color:red">OverDue</span>:</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; font-size:16px"><p>Your end-session weight update is Overdue! You had to update your weight ${moment(
        dietData.diet_start_date,
      )
        .add(cleanseEndDay, "days")
        .fromNow()}. You will lose out on program validity if you don’t add your weight ASAP.</p></div>`,
      extra_params: {},
      redirect_page: "add_weight",
    });
    upperSection = upperSectionObj;
  }
  // End Inch Due
  else if (
    dietData.diet_start_date &&
    Number(dietData.end_session_weight) !== 0 &&
    !dietData.ten_inch_id &&
    moment().diff(moment(dietData.diet_start_date), "days") === cleanseEndDay
  ) {
    show_button_1 = "10";
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%; font-size:16px"><b>Inch Update <span style="color:red">Due</span>:</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; font-size:16px"><p>Your end-session Inch update is Due!</p></div>`,
      extra_params: {},
      redirect_page: "end_inch_screen",
    });
    upperSection = upperSectionObj;
  } else if (
    dietData.diet_start_date &&
    Number(dietData.end_session_weight) !== 0 &&
    !dietData.ten_inch_id &&
    Number(dietData.end_session_photo) === 0 &&
    moment().diff(moment(dietData.diet_start_date), "days") === cleanseEndDay
  ) {
    show_button_1 = "10";
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%; font-size:16px"><b>Inch Update <span style="color:red">Due</span>:</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; font-size:16px"><p>Your end-session Inch update is Due!</p></div>`,
      extra_params: {},
      redirect_page: "end_inch_screen",
    });
    upperSection = upperSectionObj;
  }
  // End Inch Overdue
  else if (
    dietData.diet_start_date &&
    Number(dietData.end_session_weight) !== 0 &&
    !dietData.ten_inch_id &&
    moment().diff(moment(dietData.diet_start_date), "days") > cleanseEndDay
  ) {
    show_button_1 = "10";
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%; font-size:16px"><b>Inch Update <span style="color:red">OverDue</span>:</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; font-size:16px"><p>Your end-session Inch update is Overdue!</p></div>`,
      extra_params: {},
      redirect_page: "end_inch_screen",
    });
    upperSection = upperSectionObj;
  }
  // Diet Ongoing Days
  else if (
    moment(dietData.diet_start_date).format("YYYY-MM-DD") <=
      moment().format("YYYY-MM-DD") &&
    moment(dietData.diet_start_date)
      .add(Number(dietData.per_session_days), "days")
      .format("YYYY-MM-DD") >= moment().format("YYYY-MM-DD")
  ) {
    console.log(dietData, 3131313131);
    const dayNum = moment().diff(dietData.diet_start_date, "days") + 1;
    const suffix = ["st", "nd", "rd"][(dayNum % 10) - 1] || "th";
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%; font-size:16px"><b>Today is the <span style="color:red">${dayNum}${suffix} Day</span> of Diet Session ${dietData.sent_sessions}:</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; display: flex; justify-content: space-between; font-size:16px">
        <div><b>Start Date:</b> <span>${moment(dietData.diet_start_date).format(
          "Do MMM YY",
        )}</span></div>
        <div><b>End Date:</b> <span>${moment(dietData.diet_start_date)
          .add(Number(dietData.per_session_days), "days")
          .format("Do MMM YY")}</span></div>
      </div>`,
      extra_params: {},
      redirect_page: "",
    });
    upperSection = upperSectionObj;
  } else if (dietData.diet_id != dietData.latest_diet_id) {
    show_button_1 = "5";
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%; font-size:16px"><b>Important Points Before You Start</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; font-size:16px"><p>**Use the BN <a style="color: blue; text-decoration: underline;">Eat-in-Portion</a> Guide to know the exact amounts & measurements. | ** The symbol “/“ in your diet chart stands for “or” and it means you can have either of the items in the menu mentioned. | ** You can view recipes directly by clicking on (view recipes) written after the menu.</p></div>`,
      extra_params: {
        link: `https://${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-eat-in-portions`,
        screen_title: "Ekit Eat In Portions",
      },
      redirect_page: "webview",
    });
    upperSection = upperSectionObj;
  } else {
    const dayNum = moment().diff(dietData.diet_start_date, "days") + 1;
    const suffix = ["st", "nd", "rd"][(dayNum % 10) - 1] || "th";
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%; font-size:16px"><b><span style="color:black"> Diet Session ${dietData?.sent_sessions}:</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; display: flex; justify-content: space-between; font-size:16px">
        <div><b>Start Date:</b> <span>${moment(
          dietData?.diet_start_date,
        ).format("Do MMM YY")}</span></div>
        <div><b>End Date:</b> <span>${moment(dietData?.diet_start_date)
          .add(Number(dietData?.per_session_days), "days")
          .format("Do MMM YY")}</span></div>
      </div>`,
      extra_params: {},
      redirect_page: "",
    });
    upperSection = upperSectionObj;
  }

  if (dietData.user_id == 96143 || dietData.user_id == 68538) {
    const dayNum = moment().diff(dietData.diet_start_date, "days") + 1;
    const suffix = ["st", "nd", "rd"][(dayNum % 10) - 1] || "th";
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%; font-size:16px"><b>Today is the <span style="color:red">${dayNum}${suffix} Day</span> of Diet Session ${dietData.sent_sessions}:</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; display: flex; justify-content: space-between; font-size:16px">
        <div><b>Start Date:</b> <span>${moment(dietData.diet_start_date).format(
          "Do MMM YY",
        )}</span></div>
        <div><b>End Date:</b> <span>${moment(dietData.diet_start_date)
          .add(Number(dietData.per_session_days), "days")
          .format("Do MMM YY")}</span></div>
      </div>`,
      extra_params: {},
      redirect_page: "",
    });
    upperSection = upperSectionObj;
  }

  if (
    dietData.user_status == "Completed" ||
    dietData.user_status == "Dropout"
  ) {
    show_button_1 = "5";
    const lastProgramData = safeJSONParse(dietData.last_program_data, {});
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%; font-size:16px"><b>You have No Active Programs:</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; font-size:16px"><p>Your last program ${
        lastProgramData.program_name
      } expired ${Math.max(lastProgramData.end_days_ago, 0)} ${
        lastProgramData.end_days_ago <= 1 ? "day" : "days"
      } ago! Click here to contact your mentor & start again!</p></div>`,
      extra_params: {},
      redirect_page: "",
    });
    upperSection = upperSectionObj;
  }

  if (
    dietData.sub_user_status.toLowerCase() === "onhold" &&
    moment(dietData.break_end_date)
      .startOf("day")
      .isSameOrAfter(moment().startOf("day"))
  ) {
    const breakEndDate = moment(dietData.break_end_date).format("Do MMM YY");
    const breakEndsInDays = moment(dietData.break_end_date)
      .startOf("day")
      .diff(moment().startOf("day"), "days");
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%; font-size:16px"><b>Your Program is On Hold:</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; font-size:16px"><p>Your current program ${
        dietData.program_name
      } is on-hold until ${breakEndDate}. Your break ends in ${
        breakEndsInDays + 1
      } ${
        breakEndsInDays + 1 <= 1 ? "day" : "days"
      }. Avoid extensions as they have an impact on your program validity.</p></div>`,
      extra_params: {},
      redirect_page: "",
    });
    upperSection = upperSectionObj;
  } else if (
    dietData.sub_user_status.toLowerCase() === "onhold" &&
    moment(dietData.break_end_date)
      .startOf("day")
      .isBefore(moment().startOf("day"))
  ) {
    const breakEndDate = moment(dietData.break_end_date).format("Do MMM YY");
    const breakEndedDaysAgo = moment()
      .startOf("day")
      .diff(moment(dietData.break_end_date).startOf("day"), "days");
    const upperSectionObj = new DietUpperSection({
      title: `<div style="text-align: center; width: 100%; font-size:16px"><b>Your Break was Over ${breakEndedDaysAgo} ${
        breakEndedDaysAgo === 1 ? "Day" : "Days"
      } Ago!</b></div>`,
      marquee_text: `<div style="text-align: center; width: 100%; font-size:16px"><p>Your break ended on ${breakEndDate}. To ensure your program does not end due to validity, get in touch with your mentor ASAP!</p></div>`,
      extra_params: {},
      redirect_page: "",
    });
    upperSection = upperSectionObj;
  }
  return { upperSection, show_button_1 };
};
export { buildDietUpperSection };
