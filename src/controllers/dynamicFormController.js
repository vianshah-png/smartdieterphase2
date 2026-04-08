import { readPool } from "../config/dbConnection.js";

//API For Ingredient Category Listing
export const getDynamicForm = async (req, res) => {
  const newData = req.body;
  const formId = 1; // You can make this dynamic if needed

  try {
    // SQL query to get form elements and options
    const [rows] = await readPool.query(`
        SELECT
          fe.id, 
          fe.type, 
          fe.key, 
          fe.question, 
          fe.placeholder, 
          fe.is_compulsory, 
          fe.dependency_condition,
          foi.label AS option_label, 
          foi.value AS option_value,
          fed.dependent_key,
          fed.dependent_value,
          fed.condition,
          foi.field_name, 
          foi.key_prefix,
          foi.placeholder
        FROM
          form_elements fe
        LEFT JOIN 
          form_element_options foi ON fe.id = foi.form_field_id
        LEFT JOIN 
          form_element_dependencies fed ON fe.id = fed.form_element_id
        WHERE 
          fe.form_id = ${formId}
        ORDER BY 
          fe.sequence
      `);

    // Initialize an array to hold the final form structure
    const formElements = [];
    let currentContainer = null;
    let currentElement = {};

    // Loop through the query results to process the form elements
    rows.forEach((row) => {
      // Handle container grouping (if the element is part of a container)
      if (row.type === "Container") {
        if (currentContainer) formElements.push(currentContainer); // Push previous container if exists
        currentContainer = {
          type: "Container",
          data: [],
        };
      }

      // Initialize or update current element
      if (!currentElement.id || currentElement.id !== row.id) {
        // Push the previous element if it exists
        if (currentElement.id) {
          // Ensure dependencies are added before pushing
          if (
            currentElement.dependency &&
            currentElement.dependency.show_when.length > 0
          ) {
            // Remove duplicate dependencies in show_when
            currentElement.dependency.show_when =
              currentElement.dependency.show_when.filter(
                (value, index, self) =>
                  index ===
                  self.findIndex(
                    (t) =>
                      JSON.stringify(t) === JSON.stringify(value) // Ensure unique dependencies
                  )
              );
          }

          if (currentContainer) {
            currentContainer.data.push(currentElement);
          } else {
            formElements.push(currentElement);
          }
        }

        // Prepare a new element
        currentElement = {
          id: row.id,
          type: row.type,
          key: row.key,
          question: row.question,
          placeholder: row.placeholder || null,
          is_compulsory: row.is_compulsory,
          options: [], // Initialize options array
          dependency: {
            show_when: [], // Initialize dependency array
          },
        };
      }

      // Add options if available
      if (row.option_label) {
        // Avoid duplicate options for the same element (e.g., "Yes" / "No" for is_pms)
        const optionExists = currentElement.options.some(
          (option) => option.value === row.option_value
        );
        if (!optionExists) {
          currentElement.options.push({
            label: row.option_label,
            value: row.option_value,
            fieldName: row.field_name || "", // fieldName for checklist
            sub_label: "", // You can add a sub_label if it's provided in the DB
          });
        }
      }

      // Add dependency if available
      if (row.dependent_key && row.dependent_value && row.condition) {
        currentElement.dependency.show_when.push({
          key: row.dependent_key,
          value: row.dependent_value,
          condition: row.condition,
        });
      }
    });

    // Push the last element (if exists)
    if (currentElement.id) {
      if (
        currentElement.dependency &&
        currentElement.dependency.show_when.length > 0
      ) {
        // Remove duplicate dependencies
        currentElement.dependency.show_when =
          currentElement.dependency.show_when.filter(
            (value, index, self) =>
              index ===
              self.findIndex(
                (t) =>
                  JSON.stringify(t) === JSON.stringify(value) // Ensure unique dependencies
              )
          );
      }

      if (currentContainer) {
        currentContainer.data.push(currentElement);
      } else {
        formElements.push(currentElement);
      }
    }

    // Push the last container (if exists)
    if (currentContainer) formElements.push(currentContainer);

    // Now handle the case for "CheckboxList"
    formElements.forEach((element) => {
      if (element.type === "CheckboxList") {
        element.options = element.options.map((option) => {
          return {
            label: option.label,
            value: option.value,
            fieldName: option.fieldName || "",
            sub_label: option.sub_label || "",
            keyPrefix: option.keyPrefix || "", // keyPrefix for checklist
            placeholder: option.placeholder || [], // Placeholders array for checklist
            anyOtherValue: option.anyOtherValue || {}, // Any other values, if provided
          };
        });
      }
    });

    // Send the response
    return res.status(201).json({
      status: true,
      data: formElements,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};
