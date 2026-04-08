class ApiResponse {
  constructor({
    statusCode,
    message = "",
    data,
    meta_data,
    totalCount,
    hide_columns = [],
  }) {
    this.status = "success";
    this.message = message;
    this.data = data;
    this.table_meta_data = meta_data;
    this.totalCount = totalCount;
    this.hide_columns = hide_columns;
  }
}

export { ApiResponse };
