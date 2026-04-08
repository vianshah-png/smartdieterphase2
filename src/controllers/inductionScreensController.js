import { videoKeys, socialLinksKhyati, tables } from "../helper/constant.js";
import { insertRecord, readRecord, updateRecord } from "../config/query.js";

export const getMessageFromKhyati = async (req, res) => {
  try {
    const welcome_info = [
      "<font face='Roboto-Regular' size='5'>Be Regular with your trackers & <b>update</b> them on time.</font>",
      "<font face='Roboto-Regular' size='5'>Be <b>Vigilant</b> On Validity.</font>",
      "<font face='Roboto-Regular' size='5'>Don't forget the E kit.</font>",
      "<font face='Roboto-Regular' size='5'>Follow the sessions <b>better than</b> the last program!</font>",
    ];

    const messageFromKhyatiVideo = videoKeys.messageFromKhyati;
    const programDetailsVideo = videoKeys.programDetailsVideo;
    const responseData = {
      welcome_info_title:
        "<font face='Roboto-Regular' size='5'>Welcome to <span style='color:#03989F'>BN LIFE</span></font>",
      welcome_info:
        "<font face='Roboto-Regular' size='5'>For me health and fitness it's all about living a full and joyful LIFE and it’s with this same mindset that I have created BN and every facet of the programs be it assessment the diets or the E-kits. My aim is that every client should end up Healthier and happier.</font>",
      points_before_start: welcome_info,
      messageFromKhyatiVideo: messageFromKhyatiVideo,
      programDetailsVideo: programDetailsVideo,
      social_media_links: {
        instagram: socialLinksKhyati.instagram,
        twitter: socialLinksKhyati.twitter,
        facebook: socialLinksKhyati.facebook,
        linkedin: socialLinksKhyati.linkedin,
      },
      skipAssessment: false,
      mentorName: "Nikita", //static for now
      program_details_flag: "4",
    };

    return res.status(200).json({
      message: "Message Data Fetched Successfully.",
      screen_name: "Splash Screen",
      data: responseData,
    });
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};


export const getChangeOfMentorScreen = async (req, res) => {
  const { user_id } = req.body;
  try {

    const { results: userDetailsData } = await readRecord({
      table: tables.userDetails,
      selectFields: ["old_mentor_assigned","mentor_assigned"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }]
    });


    const { results: newMentorDetails } = await readRecord({
      table: tables.adminUsers,
      selectFields: ["*"],
      conditions: [{ field: "admin_user_id", operator: "=", value: userDetailsData[0].mentor_assigned }]
    });


    const { results: oldMentorDetails } = await readRecord({
      table: tables.adminUsers,
      selectFields: ["*"],
      conditions: [{ field: "admin_user_id", operator: "=", value: userDetailsData[0].old_mentor_assigned }]
    });

    const title = newMentorDetails[0].designation;
    const role = title.split("(")[0].trim();

    const newMentorImage = JSON.parse(newMentorDetails[0].photo);
    const oldMentorImage = JSON.parse(oldMentorDetails[0].photo);

    const responseData = {
      old_mentor: {
        name: `${oldMentorDetails[0].first_name} ${oldMentorDetails[0].last_name}`,
        image_url:oldMentorImage[0].file.path,
      },
      new_mentor: {
        name: `${newMentorDetails[0].first_name} ${newMentorDetails[0].last_name}`,
        designation: role,
        image_url:newMentorImage[0].file.path,
      },
      content_html:
        `<p>Here on, Mentor <strong>${newMentorDetails[0].first_name}</strong> [<em>${role}</em>] will be taking care of your case.</p><p>${newMentorDetails[0].first_name} is experienced, qualified &amp; will be guiding you here on.</p><p>The team of mentors operates with each other at all times under the <strong>${role}</strong>.</p><br /><p style="margin-bottom:0;">Warm regards,</p><p style="margin-top:0;"><strong>Khayati Rupani</strong></p>`,
    };

    return res.status(200).json({
      message: "COM Data Fetched Successfully.",
      screen_name: "Change Of Mentor Screen",
      data: responseData,
    });
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};
