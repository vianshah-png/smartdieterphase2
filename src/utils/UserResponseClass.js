class UserResponseClass {
  constructor({ data = {} }) {
    this.Client_Details = {
      client_id: data.client_id,
      client_name: data.client_name,
      client_email: data.client_email_id,
      client_phone: data.client_phone,
      client_program_number: data.client_program_count,
      client_sub_user_status: data.client_sub_user_status,
      ...data.additionalClientDetails,
    };

    this.Program_Details = {
      program_name: data.current_program_name,
      program_duration: data.current_program_duration,
      program_mrp: data.current_program_mrp,
      program_paid: data.current_program_paid_amount,
      Session: `(${data.current_program_sent_sessions}/${data.current_program_total_sessions})`,
      program_validity: data.current_program_validity,
      program_validity_used: Math.abs(data.current_program_validity_used),
      has_advance_purchase: Number(data.advance_purchase_count) > 0,
      ...data.additionalProgramDetails,
    };

    this.Suggested_Details = {
      suggested_program_name: data.suggested_program_name,
      program_days: data.suggested_program_days,
      mrp: data.suggested_program_mrp,
      suggested_amount: data.suggested_amount || "Amount Not Quoted",
      payment_link_shared: !!data.suggested_program_payment_link_id,
      suggested_at: data.suggested_at || false,
      advance_purchase_count: Number(data.advance_purchase_count) || 0,
      ...data.additionalSuggestedDetails,
    };

    if (data.additionalObjects) {
      Object.entries(data.additionalObjects).forEach(([key, value]) => {
        this[key] = value;
      });
    }
  }
  getResponse() {
    return {
      Client_Details: this.Client_Details,
      Program_Details: this.Program_Details,
      Suggested_Details: this.Suggested_Details,
      ...this._getAdditionalObjects(),
    };
  }
  _getAdditionalObjects() {
    return Object.keys(this)
      .filter(
        (key) =>
          !["Client_Details", "Program_Details", "Suggested_Details"].includes(
            key
          )
      )
      .reduce((acc, key) => {
        acc[key] = this[key];
        return acc;
      }, {});
  }
}

export { UserResponseClass };
