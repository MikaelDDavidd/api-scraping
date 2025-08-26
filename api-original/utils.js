const fs = require("fs");
const fetch = require("node-fetch");
const { readdir } = require("fs/promises");
const fsPromise = require("fs").promises;

var utils = {
  getDateNow: () => {
    return new Date().toISOString().slice(0, 19).replace("T", " ");
  },
  generateRandomString: (length) => {
    var result = "";
    var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  },
  deleteDates(json) {
    delete json.created_at;
    delete json.updated_at;
    return json;
  },
  uniq(a) {
    var seen = {};
    return a.filter(function (item) {
      return seen.hasOwnProperty(item) ? false : (seen[item] = true);
    });
  },
  async createFolder(path) {
    return await this.createFolderPromise(path);
  },
  createFolderPromise(path) {
    return new Promise(function (resolve, reject) {
      try {
        fs.mkdir(path, { recursive: true }, function (err) {
          if (err) {
            reject(false);
          } else {
            resolve(true);
          }
        });
      } catch (error) {
        reject(false);
      }
    });
  },
  async download(url, path) {
    const response = await fetch(url);
    const buffer = await response.buffer();
    return await this.writeFile(path, buffer);
  },
  async copyFile(from, to) {
    return new Promise(function (resolve, reject) {
      try {
        fs.copyFile(from, to, (err) => {
          if (err) {
            console.log(err);
            reject(false);
          } else {
            resolve(true);
          }
        });
      } catch (error) {
        reject(false);
      }
    });
  },
  async readFile(file) {
    return await fsPromise.readFile(file);
  },
  async fileExist(file) {
    return new Promise(function (resolve, reject) {
      try {
        if (fs.existsSync(file)) {
          resolve(true);
        } else {
          resolve(false);
        }
      } catch (error) {
        resolve(false);
      }
    });
  },
  async getFilesNameInDir(dir) {
    return await readdir(dir);
  },
  async deleteFile(file) {
    return new Promise(function (resolve, reject) {
      fs.unlink(file, (err) => {
        if (err) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  },
  async writeFile(path, buffer) {
    return new Promise(function (resolve, reject) {
      try {
        fs.writeFile(path, buffer, { flag: "wx" }, function (err) {
          if (err) {
            console.log("dwonload erro");
            console.log(err);
            reject(false);
          } else {
            console.log("dwonload concluido");
            resolve(true);
          }
        });
      } catch (error) {
        reject(false);
      }
    });
  },
};

module.exports = utils;
