import dotenv from "dotenv";
import { db, readPool, writePool } from "./dbConnection.js";
dotenv.config();
const database = process.env.MYSQL_DATABASE_NAME;
export const insertRecord = async (table, columns, values, isLive = false) => {
  const insertQuery = `INSERT INTO ${table} (${columns.join(
    ", ",
  )}) VALUES (${columns.map(() => "?").join(", ")})`;

  try {
    const pool = writePool;
    const [results] = await pool.query(insertQuery, values);
    return results;
  } catch (error) {
    console.error("Error inserting data:", error.message);
    throw error;
  }
};

export const readRecord = async ({
  table,
  selectFields,
  joins = [],
  conditions = [],
  groupBy = [],
  having = [],
  orderBy = [],
  pagination = {},
  search = {},
  countTotal = false,
  isLive = false,
}) => {
  const { limit, page } = pagination;
  let { searchQuery, searchFields = [] } = search;
  // if (searchFields.length === 1 && searchFields[0] === "*") {
  //   const [columns] = await readPool.query(
  //     `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME= 'diet_special_plan' AND TABLE_SCHEMA = '${database}'; `
  //   );
  //   searchFields = columns.map((column) => column.COLUMN_NAME);
  // }
  // Construct the select part of the query
  const selectQuery = `SELECT ${
    selectFields && selectFields.length > 0 ? selectFields.join(", ") : "*"
  } FROM ${table}`;

  // Construct the join part of the query
  const joinQuery =
    joins &&
    joins
      .map((join) => `${join.type || "INNER"} JOIN ${join.table} ON ${join.on}`)
      .join(" ");

  // Prepare the values array and condition queries
  let values = [];
  const conditionQueryParts = [];
  const jsonContainsConditions = {}; // To handle multiple JSON_CONTAINS conditions

  // Handle conditions and logic operators, now supporting subqueries
  const handleCondition = (condition, index) => {
    const logic = index === 0 ? "" : condition.logic || "AND";

    if (condition.subquery) {
      // Subquery handling
      const { query, operator, logic: subqueryLogic } = condition.subquery;
      return `${logic} ${operator} (${query})`;
    }

    if (condition.orConditions && condition.orConditions.length > 0) {
      // Handle OR conditions
      const orConditionParts = condition.orConditions.map((orCondition) => {
        if (orCondition.raw) {
          // Handle raw conditions
          return `${orCondition.field} ${orCondition.operator} ${orCondition.value}`;
        }

        const { field, operator, value } = orCondition;
        if (operator?.toUpperCase() === "BETWEEN" && Array.isArray(value)) {
          values.push(value[0], value[1]);
          return `${field} BETWEEN ? AND ?`;
        } else if (["IN", "NOT IN"].includes(operator?.toUpperCase())) {
          if (Array.isArray(value)) {
            const placeholders = value.map(() => "?").join(", ");
            values = values.concat(value);
            return `${field} ${operator.toUpperCase()} (${placeholders})`;
          }
        } else {
          values.push(value);
          return `${field} ${operator?.toUpperCase()} ?`;
        }
      });
      return `${logic} (${orConditionParts.join(" OR ")})`;
    }

    const field = condition.field;
    const operator = condition.operator?.toUpperCase();
    const value = condition.value;

    if (condition.raw) {
      // Handle raw value for normal conditions
      if (operator === "BETWEEN") {
        return `${logic} ${field} BETWEEN ${value[0]} AND ${value[1]}`;
      }
      return `${logic} ${field} ${operator} ${value}`;
    } else if (operator === "IN" || operator === "NOT IN") {
      if (Array.isArray(value)) {
        const placeholders = value.map(() => "?").join(", ");
        values = values.concat(value);
        return `${logic} ${field} ${operator} (${placeholders})`;
      }
    } else if (operator === "BETWEEN") {
      if (Array.isArray(value) && value.length === 2) {
        values.push(value[0], value[1]);
        return `${logic} ${field} BETWEEN ? AND ?`;
      }
    } else if (operator === "LIKE") {
      if (Array.isArray(value)) {
        const likeParts = value.map((val) => {
          values.push(`%${val}%`);
          return `${field} LIKE ?`;
        });
        return `${logic} (${likeParts.join(" OR ")})`;
      } else {
        values.push(`%${value}%`);
        return `${logic} ${field} LIKE ?`;
      }
    } else if (operator === "JSON_CONTAINS") {
      const searchInPath = condition.searchIn ? `$.${condition.searchIn}` : "$";
      if (Array.isArray(value)) {
        if (!jsonContainsConditions[field]) {
          jsonContainsConditions[field] = [];
        }
        jsonContainsConditions[field].push(
          ...value.map((val) => ({ value: val, path: searchInPath })),
        );
      } else if (typeof value === "string") {
        if (!jsonContainsConditions[field]) {
          jsonContainsConditions[field] = [];
        }
        jsonContainsConditions[field].push({ value, path: searchInPath });
      }
    } else {
      values.push(value);
      return `${logic} ${field} ${operator} ?`;
    }
  };

  // Apply condition handling, now with subquery support
  conditions.forEach((condition, index) => {
    const conditionQueryPart = handleCondition(condition, index);
    if (conditionQueryPart) {
      conditionQueryParts.push(conditionQueryPart);
    }
  });

  // Combine JSON_CONTAINS conditions with optional searchIn
  Object.keys(jsonContainsConditions).forEach((field, index) => {
    const logic = conditionQueryParts.length === 0 && index === 0 ? "" : "AND"; // Always ensure proper "AND"
    const jsonContainsParts = jsonContainsConditions[field].map(
      ({ value, path }) => `JSON_CONTAINS(${field}, ?, '${path}')`,
    );
    conditionQueryParts.push(`${logic} (${jsonContainsParts.join(" OR ")})`);
    values = values.concat(
      jsonContainsConditions[field].map((item) => item.value),
    );
  });

  // Add search conditions if search query is provided
  if (searchQuery) {
    // Use provided searchFields or default to stripped selectFields
    const fieldsToSearch =
      searchFields?.length > 0
        ? searchFields
        : selectFields.map((field) => field.split(/\s+AS\s+|\s+as\s+/)[0]);

    // Remove leading/trailing spaces from the search query
    const trimmedSearchQuery = searchQuery.trim();

    // Prepare LIKE conditions for each field
    const searchConditionParts = fieldsToSearch.map((field) => {
      // Apply TRIM and LOWER to the database field
      const condition = `LOWER(TRIM(${field})) LIKE ?`;
      values.push(`%${trimmedSearchQuery.toLowerCase()}%`); // Add wildcard (%) for partial matching
      return condition;
    });

    values.push(`%${trimmedSearchQuery.toLowerCase()}%`);

    // Join all search conditions with OR logic
    const searchConditionQuery = searchConditionParts.join(" OR ");

    // Add to the condition query, using AND if there are other conditions
    conditionQueryParts.push(
      conditionQueryParts.length > 0
        ? `AND (${searchConditionQuery})`
        : `(${searchConditionQuery})`,
    );
  }

  // Construct the condition query
  const conditionQuery =
    conditionQueryParts.length > 0
      ? `WHERE ${conditionQueryParts.join(" ")}`
      : "";

  // Construct the group by part of the query
  const groupByQuery =
    groupBy.length > 0 ? `GROUP BY ${groupBy.join(", ")}` : "";

  // Prepare the having query
  const havingQueryParts = having.map((condition, index) => {
    const logic = index === 0 ? "" : condition.logic || "AND";
    if (condition.raw) {
      return `${logic} ${condition.field} ${condition.operator} ${condition.value}`;
    }
    values.push(condition.value);
    return `${logic} ${condition.field} ${condition.operator} ?`;
  });

  const havingQuery =
    havingQueryParts.length > 0 ? `HAVING ${havingQueryParts.join(" ")}` : "";

  // Construct the order by part of the query
  const orderByQuery =
    orderBy.length > 0 ? `ORDER BY ${orderBy.join(", ")}` : "";

  // Calculate the offset for pagination if limit and page are provided
  const limitQuery = limit ? `LIMIT ${parseInt(limit)}` : "";
  const offsetQuery =
    limit && page ? `OFFSET ${(parseInt(page) - 1) * parseInt(limit)}` : "";

  // Combine all parts to form the final query
  const query = `${selectQuery} ${joinQuery} ${conditionQuery} ${groupByQuery} ${havingQuery} ${orderByQuery} ${limitQuery} ${offsetQuery}`;

  try {
    console.log(query, values, 162);
    const pool = readPool;
    const [results] = await pool.query(query, values);
    let connection = await pool.getConnection();
    connection.release();
    let totalCount = 0;
    if (countTotal) {
      const countQuery = groupBy.length
        ? `SELECT COUNT(*) as count FROM (SELECT ${groupBy.join(
            ", ",
          )} FROM ${table} ${joinQuery} ${conditionQuery} ${groupByQuery}) AS grouped;`
        : `SELECT COUNT(*) as count FROM ${table} ${joinQuery} ${conditionQuery}`;
      const [[countResult]] = await readPool.query(countQuery, values);
      totalCount = countResult.count;
    }
    return { results, totalCount };
  } catch (error) {
    console.error("Error reading data:", error);
    throw error;
  }
};

export const readRecordUnion = async (tableList) => {
  let finalQueryParts = [];
  let values = [];

  for (let i = 0; i < tableList.length; i++) {
    const {
      selectField,
      table,
      condition = [],
      join = [],
      groupBy = [],
      having = [],
      orderBy = [],
      searchQuery,
      searchFields = [],
    } = tableList[i];

    let query = `SELECT ${selectField} FROM ${table}`;
    let conditionParts = [];
    let joinParts = [];
    const jsonContainsConditions = {};

    // Process JOIN clauses
    join.forEach(({ type, table: joinTable, on }) => {
      joinParts.push(`${type.toUpperCase()} JOIN ${joinTable} ON ${on}`);
    });
    if (joinParts.length > 0) query += ` ${joinParts.join(" ")}`;

    // Process WHERE conditions
    const handleCondition = (cond, index) => {
      const logic = index === 0 ? "" : cond.logic || "AND";
      const {
        field,
        operator = "=",
        value,
        raw,
        orConditions,
        subquery,
        searchIn,
      } = cond;

      if (subquery) {
        return `${logic} ${field} ${operator.toUpperCase()} (${
          subquery.query
        })`;
      }

      if (orConditions && orConditions.length > 0) {
        // Handle OR conditions
        const orConditionParts = orConditions.map((orCondition) => {
          if (orCondition.raw) {
            // Handle raw conditions
            return `${orCondition.field} ${orCondition.operator} ${orCondition.value}`;
          }
          const { field, operator, value } = orCondition;
          if (operator?.toUpperCase() === "BETWEEN" && Array.isArray(value)) {
            values.push(value[0], value[1]);
            return `${field} BETWEEN ? AND ?`;
          } else if (["IN", "NOT IN"].includes(operator?.toUpperCase())) {
            if (Array.isArray(value)) {
              const placeholders = value.map(() => "?").join(", ");
              values = values.concat(value);
              return `${field} ${operator.toUpperCase()} (${placeholders})`;
            }
          } else {
            values.push(value);
            return `${field} ${operator?.toUpperCase()} ?`;
          }
        });
        return `${logic} (${orConditionParts.join(" OR ")})`;
      }

      if (operator.toUpperCase() === "JSON_CONTAINS") {
        const path = searchIn ? `$.${searchIn}` : "$";
        if (!jsonContainsConditions[field]) jsonContainsConditions[field] = [];
        jsonContainsConditions[field].push({ value, path });
        return ""; // JSON_CONTAINS is processed later
      }

      if (raw) {
        if (operator.toUpperCase() === "BETWEEN") {
          return `${logic} ${field} BETWEEN ${value[0]} AND ${value[1]}`;
        }
        return `${logic} ${field} ${operator} ${value}`;
      }

      if (
        ["IN", "NOT IN"].includes(operator.toUpperCase()) &&
        Array.isArray(value)
      ) {
        const placeholders = value.map(() => "?").join(", ");
        values.push(...value);
        return `${logic} ${field} ${operator.toUpperCase()} (${placeholders})`;
      }

      if (operator.toUpperCase() === "BETWEEN" && Array.isArray(value)) {
        values.push(value[0], value[1]);
        return `${logic} ${field} BETWEEN ? AND ?`;
      }

      if (operator.toUpperCase() === "LIKE" && Array.isArray(value)) {
        const likeParts = value.map((val) => {
          values.push(`%${val}%`);
          return `${field} LIKE ?`;
        });
        return `${logic} (${likeParts.join(" OR ")})`;
      } else if (operator.toUpperCase() === "LIKE") {
        values.push(`%${value}%`);
        return `${logic} ${field} LIKE ?`;
      }

      values.push(value);
      return `${logic} ${field} ${operator.toUpperCase()} ?`;
    };

    condition.forEach((cond, index) => {
      const conditionPart = handleCondition(cond, index);
      if (conditionPart) conditionParts.push(conditionPart);
    });

    Object.keys(jsonContainsConditions).forEach((field, index) => {
      const logic = conditionParts.length === 0 && index === 0 ? "" : "AND";
      const parts = jsonContainsConditions[field].map(({ value, path }) => {
        values.push(value);
        return `JSON_CONTAINS(${field}, ?, '${path}')`;
      });
      conditionParts.push(`${logic} (${parts.join(" OR ")})`);
    });

    if (searchQuery) {
      const fieldsToSearch =
        searchFields.length > 0 ? searchFields : [selectField];
      const searchParts = fieldsToSearch.map((field) => {
        values.push(`%${searchQuery}%`);
        return `${field} LIKE ?`;
      });
      conditionParts.push(`(${searchParts.join(" OR ")})`);
    }

    if (conditionParts.length > 0) {
      query += ` WHERE ${conditionParts.join(" ")}`;
    }

    // Add GROUP BY clause
    if (groupBy.length > 0) query += ` GROUP BY ${groupBy.join(", ")}`;

    // Add HAVING clause
    if (having.length > 0) {
      const havingParts = having.map(
        ({ field, operator, value, logic = "AND", raw }) => {
          if (raw) return `${logic} ${field} ${operator} ${value}`;
          values.push(value);
          return `${logic} ${field} ${operator.toUpperCase()} ?`;
        },
      );
      query += ` HAVING ${havingParts.join(" ")}`;
    }

    // Add ORDER BY clause
    if (orderBy.length > 0) query += ` ORDER BY ${orderBy.join(", ")}`;

    finalQueryParts.push(query);
  }

  const finalQuery = finalQueryParts.join(" UNION ALL ");

  try {
    console.log(
      finalQuery,
      values,
      "union query with joins, group by, having, and order by",
    );
    const [results] = await readPool.query(finalQuery, values);
    return results;
  } catch (error) {
    console.error("Error executing union query:", error);
    throw error;
  }
};

export const updateRecord = async (
  table,
  updateData,
  whereCondition,
  isLive = false,
) => {
  try {
    // Construct SET clause dynamically
    const setClause = Object.entries(updateData)
      .map(([key, value]) => {
        // Check if the value is marked as raw SQL
        if (typeof value === "object" && value?.raw) {
          return `${key} = ${value.query}`; // Use raw SQL
        } else {
          return `${key} = ?`; // Use parameterized value
        }
      })
      .join(", ");

    // Construct WHERE clause dynamically
    const whereClauses = Object.entries(whereCondition)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          // If value is an array, use IN clause
          return `${key} IN (${value.map(() => "?").join(", ")})`;
        } else {
          // Otherwise, use an equality condition
          return `${key} = ?`;
        }
      })
      .join(" AND ");

    // Combine all values for the query parameters (ignoring raw SQL values)
    const values = [
      ...Object.values(updateData).filter(
        (value) => !(typeof value === "object" && value?.raw),
      ),
      ...Object.values(whereCondition).flatMap((value) =>
        Array.isArray(value) ? value : [value],
      ),
    ];

    // SQL query
    const updateQuery = `UPDATE ${table} SET ${setClause} WHERE ${whereClauses}`;

    // Execute the update query
    console.log(updateQuery, values, 275);
    const pool = writePool;
    const [results] = await pool.query(updateQuery, values);

    return results; // Return results of the query execution
  } catch (error) {
    console.error("Error updating data:", error);
    throw error;
  }
};

export const deleteRecordNormal = async (
  tableName,
  conditionColumn,
  conditionValue,
) => {
  const sql = `DELETE FROM ${tableName} WHERE ${conditionColumn} = ?`;
  const [result] = await writePool.query(sql, [conditionValue]);
  return result;
};

export const updateRecordAdvanced = async ({
  table,
  updateData,
  joins = [],
  conditions = [],
  isLive = false,
}) => {
  try {
    // Construct SET clause dynamically
    const setClause = Object.entries(updateData)
      .map(([key, value]) => {
        // Check if value is marked as raw SQL
        if (typeof value === "object" && value?.raw) {
          return `${key} = ${value.query}`; // Use raw SQL
        } else {
          return `${key} = ?`; // Use parameterized value
        }
      })
      .join(", ");

    // Prepare values array and condition queries
    let values = [];
    const conditionQueryParts = [];
    const jsonContainsConditions = {}; // To handle multiple JSON_CONTAINS conditions

    // Handle conditions and logic operators (similar to readRecord)
    const handleCondition = (condition, index) => {
      const logic = index === 0 ? "" : condition.logic || "AND";

      if (condition.subquery) {
        // Subquery handling
        const { query, operator, logic: subqueryLogic } = condition.subquery;
        return `${logic} ${operator} (${query})`;
      }

      if (condition.orConditions && condition.orConditions.length > 0) {
        // Handle OR conditions
        const orConditionParts = condition.orConditions.map((orCondition) => {
          if (orCondition.raw) {
            // Handle raw conditions
            return `${orCondition.field} ${orCondition.operator} ${orCondition.value}`;
          }

          const { field, operator, value } = orCondition;
          if (operator?.toUpperCase() === "BETWEEN" && Array.isArray(value)) {
            values.push(value[0], value[1]);
            return `${field} BETWEEN ? AND ?`;
          } else if (["IN", "NOT IN"].includes(operator?.toUpperCase())) {
            if (Array.isArray(value)) {
              const placeholders = value.map(() => "?").join(", ");
              values = values.concat(value);
              return `${field} ${operator.toUpperCase()} (${placeholders})`;
            }
          } else {
            values.push(value);
            return `${field} ${operator?.toUpperCase()} ?`;
          }
        });
        return `${logic} (${orConditionParts.join(" OR ")})`;
      }

      const field = condition.field;
      const operator = condition.operator?.toUpperCase();
      const value = condition.value;

      if (condition.raw) {
        // Handle raw value for normal conditions
        if (operator === "BETWEEN") {
          return `${logic} ${field} BETWEEN ${value[0]} AND ${value[1]}`;
        }
        return `${logic} ${field} ${operator} ${value}`;
      } else if (operator === "IN" || operator === "NOT IN") {
        if (Array.isArray(value)) {
          const placeholders = value.map(() => "?").join(", ");
          values = values.concat(value);
          return `${logic} ${field} ${operator} (${placeholders})`;
        }
      } else if (operator === "BETWEEN") {
        if (Array.isArray(value) && value.length === 2) {
          values.push(value[0], value[1]);
          return `${logic} ${field} BETWEEN ? AND ?`;
        }
      } else if (operator === "LIKE") {
        if (Array.isArray(value)) {
          const likeParts = value.map((val) => {
            values.push(`%${val}%`);
            return `${field} LIKE ?`;
          });
          return `${logic} (${likeParts.join(" OR ")})`;
        } else {
          values.push(`%${value}%`);
          return `${logic} ${field} LIKE ?`;
        }
      } else if (operator === "JSON_CONTAINS") {
        const searchInPath = condition.searchIn ? `$.${condition.searchIn}` : "$";
        if (Array.isArray(value)) {
          if (!jsonContainsConditions[field]) {
            jsonContainsConditions[field] = [];
          }
          jsonContainsConditions[field].push(
            ...value.map((val) => ({ value: val, path: searchInPath })),
          );
        } else if (typeof value === "string") {
          if (!jsonContainsConditions[field]) {
            jsonContainsConditions[field] = [];
          }
          jsonContainsConditions[field].push({ value, path: searchInPath });
        }
      } else {
        values.push(value);
        return `${logic} ${field} ${operator} ?`;
      }
    };

    // Apply condition handling
    conditions.forEach((condition, index) => {
      const conditionQueryPart = handleCondition(condition, index);
      if (conditionQueryPart) {
        conditionQueryParts.push(conditionQueryPart);
      }
    });

    // Combine JSON_CONTAINS conditions with optional searchIn
    Object.keys(jsonContainsConditions).forEach((field, index) => {
      const logic = conditionQueryParts.length === 0 && index === 0 ? "" : "AND";
      const jsonContainsParts = jsonContainsConditions[field].map(
        ({ value, path }) => `JSON_CONTAINS(${field}, ?, '${path}')`,
      );
      conditionQueryParts.push(`${logic} (${jsonContainsParts.join(" OR ")})`);
      values = values.concat(
        jsonContainsConditions[field].map((item) => item.value),
      );
    });

    // Construct condition query
    const conditionQuery =
      conditionQueryParts.length > 0
        ? `WHERE ${conditionQueryParts.join(" ")}`
        : "";

    // Construct join part of query
    const joinQuery =
      joins &&
      joins
        .map((join) => `${join.type || "INNER"} JOIN ${join.table} ON ${join.on}`)
        .join(" ");

    // Combine all values for query parameters (ignoring raw SQL values)
    const allValues = [
      ...Object.values(updateData).filter(
        (value) => !(typeof value === "object" && value?.raw),
      ),
      ...values,
    ];

    // SQL query
    const updateQuery = `UPDATE ${table} ${joinQuery} SET ${setClause} ${conditionQuery}`;

    // Execute update query
    console.log(updateQuery, allValues, 275);
    const pool = writePool;
    const [results] = await pool.query(updateQuery, allValues);

    return results; // Return results of query execution
  } catch (error) {
    console.error("Error updating data:", error);
    throw error;
  }
};

export const updateRecordNormal = async (
  tableName,
  columns,
  values,
  conditionColumn,
  conditionValue,
) => {
  if (!columns.length || columns.length !== values.length) {
    throw new Error("Invalid update parameters");
  }

  const setClause = columns.map((col) => `${col} = ?`).join(", ");
  const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${conditionColumn} = ?`;

  const [result] = await writePool.query(sql, [...values, conditionValue]);
  return result;
};

export const insertRecordNormal = async (tableName, columns, values) => {
  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`;
  const [result] = await writePool.query(sql, values);
  return result;
};

export const deleteRecords = async (table, id, whereCondition = {}) => {
  // Build WHERE clause and values
  let whereClause;
  let values;

  // If whereCondition is provided and has entries, use it fully
  if (Object.keys(whereCondition).length > 0) {
    whereClause = Object.entries(whereCondition)
      .map(([key, value]) => `${key} = ?`)
      .join(" AND ");
    values = Object.values(whereCondition);
  } else {
    // Fallback to original behavior: use only id if whereCondition is empty
    whereClause = "id = ?";
    values = [id];
  }

  const deleteQuery = `DELETE FROM ${table} WHERE ${whereClause}`;

  try {
    const [results] = await writePool.query(deleteQuery, values);

    if (results.affectedRows > 0) {
      return {
        success: true,
        message: "Records deleted successfully",
        data: results,
      };
    } else {
      return { success: false, message: "No records deleted" };
    }
  } catch (error) {
    console.error("Error deleting records:", error);
    throw error; // Rethrow to be handled by the caller
  }
};

export async function bulkInsertRecords(table, columns, rows, chunkSize = 500) {
  if (!rows || !rows.length) return;

  const formattedRows = rows.map((row) =>
    columns.reduce((acc, col, idx) => {
      acc[col] = row[idx];
      return acc;
    }, {}),
  );

  try {
    return await db.batchInsert(table, formattedRows, chunkSize);
  } catch (err) {
    console.error("bulkInsertRecords error:", err);
    throw err;
  }
}
