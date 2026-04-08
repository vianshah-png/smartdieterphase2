class CurrentScreenResponse {
  constructor({ screen_name = "", redirect_id = "", ...otherKeys }) {
    this.screen_name = screen_name;
    this.screen_params = {
      redirect_id,
      ...otherKeys,
    };
  }
}

export { CurrentScreenResponse };
