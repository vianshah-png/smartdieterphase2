import parsePhoneNumberFromString from "libphonenumber-js";
export function isValidPhoneNumber(phoneCode, phoneNumber) {
  const formattedPhoneCode = phoneCode.startsWith("+")
    ? phoneCode
    : `+${phoneCode}`;
  const fullPhoneNumber = `${formattedPhoneCode}${phoneNumber}`;

  try {
    const phoneNumberObj = parsePhoneNumberFromString(fullPhoneNumber);
    console.log(phoneNumberObj.isValid(), 10);
    return phoneNumberObj ? phoneNumberObj.isValid() : false;
  } catch (error) {
    console.error("Error parsing phone number:", error);
    return false;
  }
}
