import { insertRecord, readRecord, updateRecord } from "../config/query.js";
import { cloudinaryFolders, tables } from "../helper/constant.js";
import { uploadArrayOfFilesToCloudinary } from "../helper/uploadToCloudinary.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";

const addOrganization = async (req, res, next) => {
  const {
    name,
    email_id,
    country_id,
    state_id,
    city_id,
    primary_phone,
    secondary_phone,
    organization_website,
  } = req.body;
  const files = req.files;
  try {
    const columns = [
      "name",
      "email_id",
      "country_id",
      "state_id",
      "city_id",
      "primary_phone",
      "secondary_phone",
      "organization_website",
    ];
    const values = [
      name,
      email_id,
      country_id,
      state_id,
      city_id,
      primary_phone,
      secondary_phone,
      organization_website,
    ];
    if (files && files.length > 0) {
      const logo = await uploadArrayOfFilesToCloudinary(
        files,
        cloudinaryFolders.organizations
      );
      columns.push("organization_logo");
      values.push(JSON.stringify(logo));
    }
    const result = await insertRecord(tables.organizations, columns, values);
    if (result.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Organisation added successfully",
        data: { organization_id: result.insertId },
      });
      return res.status(200).json(apiResponse);
    }
    return next(new ErrorHandler("Error while adding organisation", 400));
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateOrganization = async (req, res, next) => {
  const { id: organization_id } = req.params;
  const updatedData = req.body;
  const files = req.files;
  if (files && files.length > 0) {
    const logo = await uploadArrayOfFilesToCloudinary(
      files,
      cloudinaryFolders.organizations
    );
    updatedData.organization_logo = JSON.stringify(logo);
  }
  try {
    const updateResult = await updateRecord(tables.organizations, updatedData, {
      organization_id,
    });
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(
        new ErrorHandler("No organisztion found with the given id", 400)
      );
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made ",
      });
      return res.status(200).json(apiResponse);
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `organization updated successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating orgnization`, 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getOrganizations = async (req, res, next) => {
  try {
    const { results } = await readRecord({
      table: `${tables.organizations} o`,
      selectFields: [
        "o.organization_id",
        "o.name",
        "o.email_id",
        "c.country_name as country",
        "s.state_name as state",
        "ci.city_name as city",
        "o.primary_phone",
        "o.secondary_phone",
        "o.organization_website",
        "o.organization_logo",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.countries} c`,
          on: "o.country_id = c.country_id",
        },
        {
          type: "LEFT",
          table: `${tables.states} s`,
          on: "o.state_id = s.state_id",
        },
        {
          type: "LEFT",
          table: `${tables.cities} ci`,
          on: "o.city_id = ci.city_id",
        },
      ],
      conditions: [{ field: "o.is_active", operator: "=", value: "1" }],
    });
    if (results.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No organisation found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const finalData = results.map((result) => {
      return {
        organization_id: result.organization_id,
        name: result.name,
        email: result.email,
        country: result.country,
        state: result.state,
        city: result.city,
        primary_phone: result.primary_phone,
        secondary_phone: result.secondary_phone,
        organization_website: result.organization_website,
        organization_logo: JSON.parse(result.organization_logo || "[]"),
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Organisation fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addDepartment = async (req, res, next) => {
  const { name, organization_id } = req.body;
  if (!name || !organization_id) {
    return next(new ErrorHandler("All fields are required", 500));
  }
  try {
    const result = await insertRecord(
      tables.department,
      ["name", "organization_id"],
      [name, organization_id]
    );
    if (result.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Department added successfully",
        data: { department_id: result.insertId },
      });
      return res.status(200).json(apiResponse);
    }
    return next(new ErrorHandler("Error while adding department", 400));
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getDepartments = async (req, res, next) => {
  const { id: organization_id } = req.params;
  try {
    const { results } = await readRecord({
      table: `${tables.department} d`,
      selectFields: ["d.department_id", "d.name"],
      joins: [],
      conditions: [
        {
          field: "d.organization_id",
          operator: "=",
          value: parseInt(organization_id),
        },
      ],
    });
    if (results.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No department found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Department fetched successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addRole = async (req, res, next) => {
  const { name, department_id, organization_id, reporting_to } = req.body;
  if (!name || !department_id || !organization_id || !reporting_to) {
    return next(new ErrorHandler("All fields are required", 500));
  }
  try {
    const result = await insertRecord(
      tables.roles,
      ["name", "department_id", "organization_id", "reporting_to"],
      [name, department_id, organization_id, reporting_to]
    );
    if (result.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Role added successfully",
        data: { role_id: result.insertId },
      });
      return res.status(200).json(apiResponse);
    }
    return next(new ErrorHandler("Error while adding role", 400));
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getRoles = async (req, res, next) => {
  const { id: department_id } = req.params;
  try {
    const { results } = await readRecord({
      table: `${tables.roles} r`,
      selectFields: [
        "r.role_id",
        "r.name",
        "r.reporting_to",
        "r.organization_id",
      ],
      joins: [],
      conditions: [
        {
          field: "r.department_id",
          operator: "=",
          value: parseInt(department_id),
        },
      ],
    });
    if (results.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No role found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Role fetched successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllEmployeesOfOrganization = async (req, res, next) => {
  const { id: organization_id} = req.params;
   const { search} = req.query;
  try {
    const { results } = await readRecord({
      table: `${tables.adminUsers} u`,
      selectFields: [
        "u.*"
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.roles} r`,
          on: "u.role_id = r.role_id",
        },
        {
          type: "LEFT",
          table: `${tables.department} d`,
          on: "r.department_id = d.department_id",
        },
      ],
      conditions: [
        {
          field: "u.organization_id",
          operator: "=",
          value: parseInt(organization_id),
        },
        {
          field: "u.is_active",
          operator: "=",
          value: 1,
        },
      ],
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "u.first_name",
            "u.email_id",
            "u.official_phone",
            "u.last_name",
            "concat(u.first_name,' ',u.last_name)",
          ],
        },
      }),
    });
    if (results.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No employee found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Employee fetched successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  addOrganization,
  getOrganizations,
  addDepartment,
  getDepartments,
  addRole,
  getRoles,
  getAllEmployeesOfOrganization,
  updateOrganization,
};
