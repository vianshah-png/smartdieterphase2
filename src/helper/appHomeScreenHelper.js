class appUpperSectionResponse {
  constructor({
    upper_section_image_url = "",
    title = "",
    description = "",
    button_text = "",
    redirect_screen = "",
    screen_params = {},
  }) {
    this.upper_section_image_url = upper_section_image_url;
    this.title = title;
    this.description = description;
    this.button_text = button_text;
    this.redirect_screen = redirect_screen;
    this.screen_params = { ...screen_params };
  }
}

class appLowerSectionResponse {
  constructor({
    lower_section_image_url = "",
    title = "",
    description = "",
    button_text = "",
    button2_text = "",
    redirect_screen = "",
    is_todo = true,
  }) {
    this.lower_section_image_url = lower_section_image_url;
    this.title = title;
    this.description = description;
    this.button_text = button_text;
    this.redirect_screen = redirect_screen;
    this.button2_text = button2_text;
    this.is_todo = is_todo;
  }
}

export { appUpperSectionResponse, appLowerSectionResponse };
