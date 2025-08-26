const utils = require("./utils");
const mysqlConnection = require("mysql2");
const config = require("./config");

var mysql = {
  dbConfig: {
    connectionLimit: 100000,
    host: config.MYSQL_HOST,
    user: config.MYSQL_USER,
    password: config.MYSQL_PASS,
    database: config.MYSQL_DB,
  },
  poolPromise() {
    return mysqlConnection.createPool(this.dbConfig).promise();
  },
  createConnectionPromise() {
    return mysqlConnection.createConnection(this.dbConfig).promise();
  },
  pool() {
    return mysqlConnection.createPool(this.dbConfig);
  },
  createConnection() {
    return mysqlConnection.createConnection(this.dbConfig);
  },
  createUserToken() {
    let keepCheck = true;
    try {
      do {
        let token = utils.generateRandomString(256);
        if (this.checkToken(token)) {
          keepCheck = false;
          return token;
        }
      } while (keepCheck);
    } catch (e) {}
  },
  db: {
    insert(table, items) {
      let columns = "";
      let values = "";
      let index = 0;
      for (item in items) {
        columns += (index == 0 ? "" : ",") + item;
        index++;
      }
      index = 0;
      for (item in items) {
        values += (index == 0 ? "" : ",") + "'" + items[item] + "'";
        index++;
      }
      return (
        "INSERT INTO " + table + " (" + columns + ") VALUES (" + values + ")"
      );
    },

    row(table, filter, where) {
      let columnsFilter = "*";
      let conditionals = "";
      let index = 0;
      if (filter.length > 0) {
        columnsFilter = "";
        for (item in filter) {
          columnsFilter += (index == 0 ? "" : ",") + filter[item];
          index++;
        }
      }
      index = 0;
      for (item in where) {
        conditionals +=
          (index == 0 ? "" : " AND ") + item + " = '" + where[item] + "'";
        index++;
      }
      return (
        "SELECT " +
        columnsFilter +
        " FROM " +
        table +
        " WHERE " +
        conditionals +
        "ORDER BY id DESC LIMIT 1"
      );
    },

    select(table, filter, where, additional = "", isBinary = false) {
      binary = "";
      if (isBinary) {
        binary = " BINARY ";
      }
      let columnsFilter = "*";
      let conditionals = "";
      let index = 0;
      if (filter.length > 0 && filter != columnsFilter) {
        columnsFilter = "";
        for (item in filter) {
          columnsFilter += (index == 0 ? "" : ",") + filter[item];
          index++;
        }
      }
      index = 0;
      for (item in where) {
        conditionals +=
          (index == 0 ? "" : " AND ") +
          item +
          " = " +
          binary +
          "'" +
          where[item] +
          "'";
        index++;
      }
      if (where) {
        return (
          "SELECT " +
          columnsFilter +
          " FROM " +
          table +
          " WHERE " +
          conditionals +
          " " +
          additional
        );
      } else {
        return "SELECT " + columnsFilter + " FROM " + table + " " + additional;
      }
    },

    search(table, filter, where, like, additional = "", isBinary = false) {
      binary = "";
      if (isBinary) {
        binary = " BINARY ";
      }
      let columnsFilter = "*";
      let conditionals = "";
      let index = 0;
      if (filter.length > 0 && filter != columnsFilter) {
        columnsFilter = "";
        for (item in filter) {
          columnsFilter += (index == 0 ? "" : ",") + filter[item];
          index++;
        }
      }
      index = 0;
      for (item in where) {
        conditionals +=
          (index == 0 ? "" : " AND ") +
          item +
          " = " +
          binary +
          "'" +
          where[item] +
          "'";
        index++;
      }
      index = 0;
      for (item in like) {
        if (where && index == 0) {
          conditionals += " AND ";
        }
        conditionals +=
          (index == 0 ? "" : " OR ") +
          item +
          " LIKE " +
          binary +
          "'%" +
          like[item] +
          "%'";
        index++;
      }
      if (where) {
        return (
          "SELECT " +
          columnsFilter +
          " FROM " +
          table +
          " WHERE " +
          conditionals +
          " " +
          additional
        );
      } else {
        return "SELECT " + columnsFilter + " FROM " + table + " " + additional;
      }
    },

    count(table, where) {
      let conditionals = "";
      let index = 0;
      for (item in where) {
        conditionals +=
          (index == 0 ? "" : " AND ") + item + " = '" + where[item] + "'";
        index++;
      }
      if (where) {
        return `SELECT COUNT(*) FROM ${table} WHERE ${conditionals}`;
      } else {
        return `SELECT COUNT(*) FROM ${table}`;
      }
    },

    update(table, filter, where) {
      let columnsFilter = "*";
      let conditionals = "";
      let index = 0;

      columnsFilter = "";
      for (item in filter) {
        columnsFilter +=
          (index == 0 ? "" : ",") + item + " = '" + filter[item] + "'";
        index++;
      }

      index = 0;
      for (item in where) {
        conditionals +=
          (index == 0 ? "" : " AND ") + item + " = '" + where[item] + "'";
        index++;
      }
      if (where) {
        return (
          "UPDATE " + table + " SET " + columnsFilter + " WHERE " + conditionals
        );
      } else {
        return "UPDATE " + table + " SET " + columnsFilter;
      }
    },

    addCreatedUpdateDate: (items) => {
      items.created_at = utils.getDateNow();
      items.updated_at = utils.getDateNow();
      return items;
    },
  },
};

module.exports = mysql;
